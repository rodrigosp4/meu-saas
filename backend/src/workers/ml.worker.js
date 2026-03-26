// =============================================================================
// ml.worker.js — VERSÃO OTIMIZADA (v3 - Mesclada)
//
// CORREÇÕES APLICADAS:
// 1. Connection Pooling (Keep-Alive): Evita ENOTFOUND e ECONNRESET reciclando conexões TCP.
// 2. Retries aumentados (3 → 5) com backoff elástico para erros de rede.
// 3. Retry com backoff para chunks que falham (em vez de perder silenciosamente)
// 4. Sale_price corrigido para itens com variações (fallback infalível)
// 5. Contagem real de itens SALVOS no banco (não apenas "processados")
// 6. Log detalhado de itens perdidos para diagnóstico
// 7. Chunks de 20 com delay inteligente
// =============================================================================

import { Worker } from 'bullmq';
import axios from 'axios';
import https from 'https';
import http from 'http';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

// ✅ Connection Pooling: Evita exaustão de DNS (ENOTFOUND) e portas (ECONNRESET)
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });

const mlClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 40000
});

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  // Tira o "tls: {}" se for ambiente local
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('⚙️  Worker de Sincronização do ML Iniciado (v3 - Mesclado)...');


// =============================================================================
// RETRY COM RECONNECT — Backoff exponencial para Neon Serverless
// =============================================================================
async function prismaRetry(operation, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isConnectionError =
        error.message?.includes('Server has closed the connection') ||
        error.message?.includes("Can't reach database server") ||
        error.message?.includes('Connection timed out') ||
        error.message?.includes('Connection refused') ||
        error.message?.includes('Connection reset') ||
        error.message?.includes('connection is insecure') ||
        error.message?.includes('Invalid `prisma.') ||
        error.code === 'P1001' ||
        error.code === 'P1002' ||
        error.code === 'P1008' ||
        error.code === 'P1017' ||
        error.code === 'P2024';

      if (isConnectionError && attempt < maxRetries) {
        const waitTime = Math.min(attempt * 3000, 15000);
        console.log(`  🔄 Tentativa ${attempt}/${maxRetries} falhou (conexão). Reconectando em ${waitTime / 1000}s...`);
        try { await prisma.$disconnect(); } catch (_) {}
        await delay(waitTime);
        try { await prisma.$connect(); } catch (_) {}
        continue;
      }

      throw error;
    }
  }
}


// =============================================================================
// KEEPALIVE — Mantém a conexão com o Neon viva entre lotes
// =============================================================================
async function keepAlive() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (_) {
    console.log('  🔄 Conexão perdida. Reconectando...');
    try { await prisma.$disconnect(); } catch (_) {}
    await delay(2000);
    try { await prisma.$connect(); } catch (_) {}
    try { await prisma.$queryRaw`SELECT 1`; } catch (_) {}
  }
}


// =============================================================================
// UPSERT EM LOTE VIA SQL RAW — 1 query para N itens
// =============================================================================
async function batchUpsertAnuncios(items, contaId, visitsMap) {
  if (items.length === 0) return 0;

  const values = [];
  const placeholders = [];
  let paramIndex = 1;

  for (const item of items) {
    const primaryTag = getPrimaryTag(item);
    const sku = extractSellerSku(item);
    const varSkus = extractVariationSkus(item);

    // 15 Valores do banco de dados passados por parâmetro
    values.push(
      item.id,                                   // 1
      String(contaId),                           // 2
      sku || null,                               // 3
      item.title || '',                          // 4
      item.price || 0,                           // 5
      item.original_price ?? null,               // 6
      item.status || '',                         // 7
      item.available_quantity || 0,              // 8
      item.sold_quantity || 0,                   // 9
      visitsMap[item.id] || 0,                   // 10
      item.thumbnail || null,                    // 11
      item.permalink || null,                    // 12
      JSON.stringify(item),                      // 13
      primaryTag || null,                        // 14
      varSkus                                    // 15
    );

    const rowPlaceholders = [];
    for (let i = 0; i < 15; i++) {
      if (i === 12) { // dadosML → cast jsonb
        rowPlaceholders.push(`$${paramIndex}::jsonb`);
      } else if (i === 14) { // skusVariacoes → cast text[]
        rowPlaceholders.push(`$${paramIndex}::text[]`);
      } else {
        rowPlaceholders.push(`$${paramIndex}`);
      }
      paramIndex++;
    }

    rowPlaceholders.push('NOW()');

    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const query = `
    INSERT INTO "AnuncioML" (
      "id", "contaId", "sku", "titulo", "preco", "precoOriginal",
      "status", "estoque", "vendas", "visitas", "thumbnail",
      "permalink", "dadosML", "tagPrincipal", "skusVariacoes", "updatedAt"
    )
    VALUES ${placeholders.join(',\n')}
    ON CONFLICT ("id") DO UPDATE SET
      "titulo"        = EXCLUDED."titulo",
      "preco"         = EXCLUDED."preco",
      "precoOriginal" = EXCLUDED."precoOriginal",
      "status"        = EXCLUDED."status",
      "estoque"       = EXCLUDED."estoque",
      "vendas"        = EXCLUDED."vendas",
      "visitas"       = CASE WHEN EXCLUDED."visitas" > 0 THEN EXCLUDED."visitas" ELSE "AnuncioML"."visitas" END,
      "thumbnail"     = EXCLUDED."thumbnail",
      "permalink"     = EXCLUDED."permalink",
      "sku"           = EXCLUDED."sku",
      "dadosML"       = EXCLUDED."dadosML",
      "tagPrincipal"  = EXCLUDED."tagPrincipal",
      "skusVariacoes" = EXCLUDED."skusVariacoes",
      "updatedAt"     = NOW()
  `;

  await prisma.$executeRawUnsafe(query, ...values);

  return items.length;
}


// =============================================================================
// COLETA DE IDs — Scroll por status (idêntica à versão anterior, funciona bem)
// =============================================================================
async function fetchAllItemIds(contaId, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const allIds = new Set();
  const STATUS_LIST = ['active', 'paused', 'under_review'];

  for (const status of STATUS_LIST) {
    console.log(`  📋 Buscando IDs com status '${status}' para conta ${contaId}...`);
    let scrollId = null;
    let isFirstCall = true;
    let idsForThisStatus = 0;

    while (true) {
      try {
        const params = { search_type: 'scroll', limit: 50 };
        if (isFirstCall) {
          params.status = status;
          isFirstCall = false;
        } else if (scrollId) {
          params.scroll_id = scrollId;
        } else {
          break;
        }

        const res = await mlClient.get(
          `https://api.mercadolibre.com/users/${contaId}/items/search`,
          { headers, params }
        );

        const batchIds = res.data.results || [];
        const newScrollId = res.data.scroll_id;

        for (const id of batchIds) allIds.add(id);
        idsForThisStatus += batchIds.length;

        if (!newScrollId || batchIds.length === 0) break;
        scrollId = newScrollId;
        await delay(200);

      } catch (err) {
        console.error(`  ⚠️ Erro no scroll para status '${status}': ${err.message}`);
        console.log(`  🔄 Tentando fallback por offset para status '${status}'...`);
        await fetchIdsByOffset(contaId, accessToken, status, allIds);
        break;
      }
    }
    console.log(`  ✅ Status '${status}': ${idsForThisStatus} IDs encontrados.`);
  }

  console.log(`  📊 Total de IDs únicos coletados: ${allIds.size}`);
  return [...allIds];
}


// =============================================================================
// FALLBACK POR OFFSET (idêntica, funciona bem)
// =============================================================================
async function fetchIdsByOffset(contaId, accessToken, status, idsSet) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  let offset = 0;
  const limit = 50;

  while (true) {
    try {
      const res = await mlClient.get(
        `https://api.mercadolibre.com/users/${contaId}/items/search`,
        { headers, params: { status, limit, offset } }
      );
      const batchIds = res.data.results || [];
      if (batchIds.length === 0) break;
      for (const id of batchIds) idsSet.add(id);
      const paging = res.data.paging || {};
      const total = paging.total || 0;
      if (offset + limit >= total) break;
      offset += limit;
      await delay(200);
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`  ⚠️ Offset ${offset}: Erro 400 (limite da API). Parando fallback para '${status}'.`);
      } else {
        console.error(`  ⚠️ Erro no fallback offset para '${status}': ${err.message}`);
      }
      break;
    }
  }
}


// =============================================================================
// ★ CORREÇÃO 1: Função de processar UM chunk com RETRY
// Se falhar, tenta de novo até 3 vezes com backoff exponencial.
// Isso evita perder lotes inteiros silenciosamente.
// =============================================================================
async function processChunkWithRetry(chunkIds, accessToken, contaId, maxRetries = 5) {
  const idsStr = chunkIds.join(',');
  const headers = { Authorization: `Bearer ${accessToken}` };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ─── 2a. Multiget de detalhes ───
      const attrs = 'id,title,category_id,status,sub_status,price,original_price,available_quantity,sold_quantity,permalink,thumbnail,tags,seller_custom_field,attributes,variations,listing_type_id,sale_terms,catalog_listing,health,pictures,shipping';
      const detRes = await mlClient.get(
        `https://api.mercadolibre.com/items?ids=${idsStr}&include_attributes=all&attributes=${attrs}`,
        { headers }
      );
      const items = detRes.data
        .filter(d => d.code === 200 && d.body && d.body.id)
        .map(d => d.body);

      if (items.length === 0) {
        console.log(`    ⚠️ Chunk retornou 0 itens válidos (IDs: ${idsStr})`);
        return { items: [], saved: 0, lost: chunkIds };
      }

// ─── 2b. Visitas Individuais ───
      // A API de visitas do ML rejeita múltiplos IDs por vez (retorna 400 Validation Error).
      // Precisamos buscar um por um.
      let visitsMap = {};
      for (const item of items) {
        try {
          const visRes = await mlClient.get(
            `https://api.mercadolibre.com/visits/items?ids=${item.id}`,
            { headers, timeout: 8000 }
          );
          if (visRes.data && visRes.data[item.id] !== undefined) {
             visitsMap[item.id] = visRes.data[item.id];
          }
          await delay(35); // Pequeno delay para evitar Rate Limit (429) do Mercado Livre
        } catch (visErr) { 
          // Ignora o erro individual de visita para não travar o salvamento do anúncio
        }
      }
      // ─── 2c. Sale Price — ★ CORREÇÃO 3: SÓ para itens SEM variações ───
      // Isso replica exatamente o comportamento do Python otimizado,
      // reduzindo as chamadas API em ~50% e evitando rate limit.
      // ─── 2c. Sale Price & Promoções (Corrigido para Variações) ───
      for (const item of items) {
        try {
          const spRes = await mlClient.get(
            `https://api.mercadolibre.com/items/${item.id}/sale_price`,
            { headers, timeout: 8000 }
          );
          if (spRes.status === 200 && spRes.data) {
            if (spRes.data.amount) item.price = spRes.data.amount;
            if (spRes.data.regular_amount) item.original_price = spRes.data.regular_amount;
          }
          await delay(40);
        } catch (_) { /* 400 é normal para itens com variações complexas */ }
        
        // ★ FALLBACK INFALÍVEL PARA VARIAÇÕES:
        // Se a API principal não trouxer o original_price, nós vasculhamos o array de variações
        if (!item.original_price && item.variations && item.variations.length > 0) {
           let maxOrig = null;
           for (const v of item.variations) {
              if (v.original_price && v.original_price > (v.price || 0)) {
                 if (!maxOrig || v.original_price > maxOrig) maxOrig = v.original_price;
              }
           }
           if (maxOrig) item.original_price = maxOrig;
        }
      }

      // ─── 2d. Upsert no banco ───
      let savedCount = 0;
      try {
        await prismaRetry(async () => {
          savedCount = await batchUpsertAnuncios(items, contaId, visitsMap);
        });
      } catch (dbError) {
        // ★ CORREÇÃO 4: Se o banco falhou, loga MAS retorna os itens como "não salvos"
        console.error(`    ❌ Banco falhou após ${maxRetries} retries para ${items.length} itens: ${dbError.message}`);
        return { items, saved: 0, lost: chunkIds, dbError: true };
      }

      return { items, saved: savedCount, lost: [] };

    } catch (chunkError) {
      const isRateLimit = chunkError.response?.status === 429;
      const isNetworkFail = chunkError.code === 'ENOTFOUND' || chunkError.code === 'ECONNRESET' || chunkError.code === 'ETIMEDOUT';

      let waitTime = attempt * 3000;
      if (isRateLimit) waitTime = 10000;
      if (isNetworkFail) waitTime = attempt * 6000; // Punição de rede: pausa maior para a placa limpar

      if (attempt < maxRetries) {
        console.log(`    🔄 Chunk falhou (tentativa ${attempt}/${maxRetries}). ` +
          `${isRateLimit ? 'Rate limit 429!' : chunkError.message}. ` +
          `Aguardando ${waitTime / 1000}s...`);
        await delay(waitTime);
        continue; // ← TENTA DE NOVO em vez de desistir
      }

      // Esgotou as tentativas
      console.error(`    ❌ Chunk PERDIDO após ${maxRetries} tentativas: ${chunkError.message} (IDs: ${idsStr})`);
      return { items: [], saved: 0, lost: chunkIds };
    }
  }

  return { items: [], saved: 0, lost: chunkIds }; // Safety fallback
}



// ─────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 2: Worker — renovar token na hora de PROCESSAR, não no enqueue
// Adicione esta função no ml.worker.js e use no início do worker
// ─────────────────────────────────────────────────────────────────────────────

// Coloque esta função no topo do ml.worker.js (junto com prismaRetry e keepAlive):

async function ensureFreshToken(contaId, accessToken, refreshToken) {
  /**
   * Tenta usar o token fornecido. Se estiver expirado (401),
   * faz refresh e retorna o novo token.
   * Isso garante que mesmo que o job fique na fila por horas,
   * o token será renovado antes do processamento.
   */
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    // Teste rápido: o token ainda é válido?
    const test = await mlClient.get(
      `https://api.mercadolibre.com/users/${contaId}`,
      { headers, timeout: 5000 }
    );
    if (test.status === 200) return accessToken; // ✅ Token OK
  } catch (err) {
    if (err.response?.status !== 401) {
      // Erro de rede, não de token — tenta usar mesmo assim
      console.warn(`  ⚠️ Teste de token retornou ${err.response?.status || err.message}. Tentando usar mesmo assim...`);
      return accessToken;
    }
  }

  // Token expirado (401) — tenta renovar
  if (!refreshToken) {
    throw new Error(`Token expirado para conta ${contaId} e nenhum refreshToken disponível.`);
  }

  console.log(`  🔄 Token expirado para conta ${contaId}. Renovando...`);

  try {
    const res = await mlService.refreshToken(refreshToken);

    const newToken = res.access_token;
    const newRefresh = res.refresh_token;

    // Salva no banco para que o próximo job já use o token novo
    await prisma.contaML.update({
      where: { id: contaId },
      data: {
        accessToken: newToken,
        refreshToken: newRefresh || refreshToken,
        expiresAt: BigInt(Date.now() + (res.expires_in || 21600) * 1000)
      }
    });

    console.log(`  ✅ Token renovado com sucesso para conta ${contaId}.`);
    return newToken;
  } catch (refreshErr) {
    throw new Error(`Falha ao renovar token para conta ${contaId}: ${refreshErr.message}`);
  }
}

// =============================================================================
// WORKER PRINCIPAL
// Suporta dois modos:
//   - Conta única: { contaId, accessToken, refreshToken }
//   - Todas as contas: { contas: [{contaId, accessToken, refreshToken}, ...] }
// =============================================================================
export const mlWorker = new Worker('sync-ml', async (job) => {
  // ✅ RECEBE O PARÂMETRO "importarApenasNovos" DA FILA
  const { contaId, accessToken: initialToken, refreshToken, contas, importarApenasNovos, mode, itemIds, userId } = job.data;

  // ─── MODO SELECTED-ADS (sincronizar anúncios selecionados) ──────────────────
  if (mode === 'selected-ads' && Array.isArray(itemIds) && itemIds.length > 0) {
    await job.updateProgress(2);
    console.log(`  🔄 Modo selected-ads: ${itemIds.length} anúncio(s) selecionado(s).`);

    const itemIdsStr = itemIds.map(String);
    const anunciosBD = await prisma.anuncioML.findMany({
      where: { id: { in: itemIdsStr } },
      select: { id: true, contaId: true }
    });

    const porConta = {};
    for (const a of anunciosBD) {
      if (!porConta[a.contaId]) porConta[a.contaId] = [];
      porConta[a.contaId].push(a.id);
    }

    let totalSaved = 0;
    const contaIds = Object.keys(porConta);
    for (let ci = 0; ci < contaIds.length; ci++) {
      const cId = contaIds[ci];
      const ids = porConta[cId];

      const conta = await prisma.contaML.findFirst({ where: { id: cId, ...(userId ? { userId } : {}) } });
      if (!conta) { console.warn(`  ⚠️ Conta ${cId} não encontrada.`); continue; }

      const freshToken = await ensureFreshToken(cId, conta.accessToken, conta.refreshToken);

      const CHUNK_SIZE = 20;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const result = await processChunkWithRetry(chunk, freshToken, cId);
        const saved = await batchUpsertAnuncios(result.items, cId, {});
        totalSaved += saved;

        const pct = 2 + Math.floor(((ci / contaIds.length) + ((i + chunk.length) / ids.length) / contaIds.length) * 95);
        await job.updateProgress(Math.min(pct, 97));
      }
    }

    await job.updateProgress(100);
    console.log(`  ✅ selected-ads concluído. Salvos: ${totalSaved}`);
    return { success: true, saved: totalSaved };
  }

  // ─── MODO MULTI-CONTA ───────────────────────────────────────────────────────
  if (contas && Array.isArray(contas) && contas.length > 0) {
    await job.updateProgress(2);

    // FASE 1: Renovar tokens e coletar TODOS os IDs de TODAS as contas
    console.log(`  📦 Modo multi-conta: ${contas.length} conta(s). Coletando IDs primeiro...`);

    // Estrutura: [{ contaId, accessToken, ids: [] }]
    const contasComIds = [];
    let totalIdsColetados = 0;

    for (let ci = 0; ci < contas.length; ci++) {
      const c = contas[ci];
      const freshToken = await ensureFreshToken(c.contaId, c.accessToken, c.refreshToken);
      console.log(`  [${ci + 1}/${contas.length}] Coletando IDs da conta ${c.contaId}...`);
      
      let ids = await fetchAllItemIds(c.contaId, freshToken);

      // ✅ LÓGICA "APENAS NOVOS": Filtra os IDs antes de prosseguir
      if (importarApenasNovos && ids.length > 0) {
        const existentes = await prisma.anuncioML.findMany({
          where: { contaId: String(c.contaId), id: { in: ids } },
          select: { id: true }
        });
        const setExistentes = new Set(existentes.map(e => e.id));
        const qtdOriginal = ids.length;
        
        // Mantém apenas os IDs que NÃO estão no banco de dados
        ids = ids.filter(id => !setExistentes.has(id));
        console.log(`  🔍 Filtro 'Apenas Novos': A conta tinha ${qtdOriginal} IDs. Ignorando ${setExistentes.size} já existentes. Novos a baixar: ${ids.length}`);
      }

      contasComIds.push({ contaId: c.contaId, accessToken: freshToken, ids });
      totalIdsColetados += ids.length;

      // Progresso da fase de coleta: 2% → 20%
      const colProgress = 2 + Math.floor(((ci + 1) / contas.length) * 18);
      await job.updateProgress(colProgress);
    }

    if (totalIdsColetados === 0) {
      await job.updateProgress(100);
      return { success: true, processed: 0, saved: 0, lost: 0, message: "Nenhum anúncio encontrado em nenhuma conta" };
    }

    console.log(`  🔎 Total de IDs coletados em todas as contas: ${totalIdsColetados}. Iniciando download de detalhes...`);
    await job.updateProgress(20);
    await keepAlive();

    // FASE 2: Processar detalhes de todas as contas em ordem
    const chunkSize = 20;
    let totalProcessed = 0;
    let totalSaved = 0;
    let totalLost = [];
    let chunkCount = 0;

    for (const { contaId: cId, accessToken: cToken, ids } of contasComIds) {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunkIds = ids.slice(i, i + chunkSize);
        chunkCount++;

        if (chunkCount % 3 === 0) await keepAlive();
        await delay(500);

        const result = await processChunkWithRetry(chunkIds, cToken, cId);
        totalProcessed += chunkIds.length;
        totalSaved += result.saved;
        if (result.lost.length > 0) totalLost.push(...result.lost);

        // Progresso da fase de detalhes: 20% → 99%
        const pct = 20 + Math.floor((totalProcessed / totalIdsColetados) * 79);
        await job.updateProgress(pct > 99 ? 99 : pct);
      }
    }

    await job.updateProgress(100);
    const lostCount = totalLost.length;
    if (lostCount > 0) {
      console.warn(`  ⚠️ ${lostCount} anúncios NÃO puderam ser salvos.`);
    }
    console.log(`  ✅ Multi-conta finalizado! Coletados: ${totalIdsColetados} | Salvos: ${totalSaved} | Perdidos: ${lostCount}`);
    return { success: lostCount === 0, collected: totalIdsColetados, processed: totalProcessed, saved: totalSaved, lost: lostCount };
  }

  // ─── MODO CONTA ÚNICA (comportamento original) ──────────────────────────────
  if (!contaId) throw new Error("contaId ausente no job");

  const accessToken = await ensureFreshToken(contaId, initialToken, refreshToken);
  await job.updateProgress(5);

  // ─── ETAPA 1: Coleta TODOS os IDs ───
  let allIds = await fetchAllItemIds(contaId, accessToken);

  // ✅ LOGICA "APENAS NOVOS" PARA CONTA ÚNICA
  if (importarApenasNovos && allIds.length > 0) {
    const existentes = await prisma.anuncioML.findMany({
      where: { contaId: String(contaId), id: { in: allIds } },
      select: { id: true }
    });
    const setExistentes = new Set(existentes.map(e => e.id));
    const qtdOriginal = allIds.length;
    allIds = allIds.filter(id => !setExistentes.has(id));
    console.log(`  🔍 Filtro 'Apenas Novos': Total ${qtdOriginal} IDs. Ignorando ${setExistentes.size} já existentes. Novos a baixar: ${allIds.length}`);
  }

  if (allIds.length === 0) {
    await job.updateProgress(100);
    return { success: true, processed: 0, saved: 0, lost: 0, message: "Nenhum anúncio NOVO encontrado" };
  }

  console.log(`  🔎 Iniciando busca de detalhes para ${allIds.length} anúncios...`);
  await job.updateProgress(15);
  await keepAlive();

  // ─── ETAPA 2: Processar em chunks COM RETRY ───
  const chunkSize = 20;
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalLost = [];
  let chunkCount = 0;

  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunkIds = allIds.slice(i, i + chunkSize);
    chunkCount++;

    if (chunkCount % 3 === 0) await keepAlive();
    await delay(500);

    const result = await processChunkWithRetry(chunkIds, accessToken, contaId);

    totalProcessed += chunkIds.length;
    totalSaved += result.saved;
    if (result.lost.length > 0) totalLost.push(...result.lost);

    const pct = 15 + Math.floor((totalProcessed / allIds.length) * 85);
    await job.updateProgress(pct > 99 ? 99 : pct);
  }

  // ─── ETAPA 3: Relatório final ───
  await job.updateProgress(100);

  const lostCount = totalLost.length;
  if (lostCount > 0) {
    console.warn(`  ⚠️ ${lostCount} anúncios NÃO puderam ser salvos: ${totalLost.slice(0, 20).join(', ')}${lostCount > 20 ? '...' : ''}`);
  }

  console.log(`  ✅ Finalizado! Coletados: ${allIds.length} | Salvos no banco: ${totalSaved} | Perdidos: ${lostCount}`);

  return {
    success: lostCount === 0,
    collected: allIds.length,
    processed: totalProcessed,
    saved: totalSaved,
    lost: lostCount,
    lostIds: totalLost.slice(0, 50)
  };
}, {
  connection,
  concurrency: 1,
  stalledInterval: 120000,
  lockDuration: 300000,
  drainDelay: 10
});

mlWorker.on('error', (err) => {
  console.error('❌ Erro no Worker ML (Redis):', err.message);
});


// =============================================================================
// FUNÇÕES AUXILIARES (inalteradas)
// =============================================================================

const RELEVANT_AD_TAGS_PRIORITY = [
  "incomplete_compatibilities",
  "incomplete_position_compatibilities",
  "poor_quality_picture",
  "poor_quality_thumbnail",
  "picture_downloading_pending",
  "moderation_penalty",
  "out_of_stock",
  "incomplete_technical_specs",
  "waiting_for_patch"
];

function getPrimaryTag(itemData) {
  const tags = itemData.tags || [];
  const subStatus = itemData.sub_status || [];
  const combined = new Set([...tags, ...subStatus]);

  for (const priorityTag of RELEVANT_AD_TAGS_PRIORITY) {
    if (combined.has(priorityTag)) return priorityTag;
  }
  return null;
}

// CÓDIGO CORRETO (substitua o anterior por este)
function extractSellerSku(itemData) {
  if (itemData.attributes && Array.isArray(itemData.attributes)) {
    const skuAttr = itemData.attributes.find(a => a.id === 'SELLER_SKU');
    if (skuAttr && skuAttr.value_name && skuAttr.value_name !== '-1') {
      return skuAttr.value_name;
    }
    // ✅ ADICIONADO: Fallback para PART_NUMBER conforme lógica do python
    const partAttr = itemData.attributes.find(a => a.id === 'PART_NUMBER');
    if (partAttr && partAttr.value_name && partAttr.value_name !== '-1') {
      return partAttr.value_name;
    }
  }
  return itemData.seller_custom_field || null;
}

function extractVariationSkus(itemData) {
  if (!itemData.variations || !Array.isArray(itemData.variations)) return [];
  const skus = [];
  for (const v of itemData.variations) {
    const fromField = v.seller_custom_field;
    if (fromField && fromField !== '-1') { skus.push(fromField); continue; }
    if (v.attributes && Array.isArray(v.attributes)) {
      const attr = v.attributes.find(a => a.id === 'SELLER_SKU');
      if (attr && attr.value_name && attr.value_name !== '-1') {
        skus.push(attr.value_name);
      }
    }
  }
  return skus;
}