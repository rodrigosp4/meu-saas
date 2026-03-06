// =============================================================================
// ml.worker.js — VERSÃO CORRIGIDA
// 
// CORREÇÕES APLICADAS:
// 1. Retry com backoff para chunks que falham (em vez de perder silenciosamente)
// 2. Sale_price só para itens SEM variações (reduz chamadas em ~50%)
// 3. Contagem real de itens SALVOS no banco (não apenas "processados")
// 4. Log detalhado de itens perdidos para diagnóstico
// 5. Chunks aumentados para 20 (igual ao Python) com delay inteligente
// =============================================================================

import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  tls: {}
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('⚙️  Worker de Sincronização do ML Iniciado (v2 - Corrigido)...');


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

  const ids = [];
  const contaIds = [];
  const skus = [];
  const titulos = [];
  const precos = [];
  const precosOriginais = [];
  const statuses = [];
  const estoques = [];
  const vendasArr = [];
  const visitasArr = [];
  const thumbnails = [];
  const permalinks = [];
  const dadosMLArr = [];
  const tagsPrincipais = [];

  for (const item of items) {
    const primaryTag = getPrimaryTag(item);
    const sku = extractSellerSku(item);

    ids.push(item.id);
    contaIds.push(String(contaId));
    skus.push(sku);
    titulos.push(item.title || '');
    precos.push(item.price || 0);
    precosOriginais.push(item.original_price ?? null);
    statuses.push(item.status || '');
    estoques.push(item.available_quantity || 0);
    vendasArr.push(item.sold_quantity || 0);
    visitasArr.push(visitsMap[item.id] || 0);
    thumbnails.push(item.thumbnail || null);
    permalinks.push(item.permalink || null);
    dadosMLArr.push(JSON.stringify(item));
    tagsPrincipais.push(primaryTag);
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO "AnuncioML" (
      "id", "contaId", "sku", "titulo", "preco", "precoOriginal",
      "status", "estoque", "vendas", "visitas", "thumbnail",
      "permalink", "dadosML", "tagPrincipal", "updatedAt"
    )
    SELECT
      unnest($1::text[]),
      unnest($2::text[]),
      unnest($3::text[]),
      unnest($4::text[]),
      unnest($5::double precision[]),
      unnest($6::double precision[]),
      unnest($7::text[]),
      unnest($8::integer[]),
      unnest($9::integer[]),
      unnest($10::integer[]),
      unnest($11::text[]),
      unnest($12::text[]),
      unnest($13::jsonb[]),
      unnest($14::text[]),
      NOW()
    ON CONFLICT ("id") DO UPDATE SET
      "titulo"        = EXCLUDED."titulo",
      "preco"         = EXCLUDED."preco",
      "precoOriginal" = EXCLUDED."precoOriginal",
      "status"        = EXCLUDED."status",
      "estoque"       = EXCLUDED."estoque",
      "vendas"        = EXCLUDED."vendas",
      "visitas"       = EXCLUDED."visitas",
      "thumbnail"     = EXCLUDED."thumbnail",
      "permalink"     = EXCLUDED."permalink",
      "sku"           = EXCLUDED."sku",
      "dadosML"       = EXCLUDED."dadosML",
      "tagPrincipal"  = EXCLUDED."tagPrincipal",
      "updatedAt"     = NOW()
  `,
    ids, contaIds, skus, titulos, precos, precosOriginais,
    statuses, estoques, vendasArr, visitasArr, thumbnails,
    permalinks, dadosMLArr, tagsPrincipais
  );

  return items.length; // ← RETORNA a quantidade salva
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

        const res = await axios.get(
          `https://api.mercadolibre.com/users/${contaId}/items/search`,
          { headers, params, timeout: 40000 }
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
      const res = await axios.get(
        `https://api.mercadolibre.com/users/${contaId}/items/search`,
        { headers, params: { status, limit, offset }, timeout: 20000 }
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
async function processChunkWithRetry(chunkIds, accessToken, contaId, maxRetries = 3) {
  const idsStr = chunkIds.join(',');
  const headers = { Authorization: `Bearer ${accessToken}` };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ─── 2a. Multiget de detalhes ───
      // ★ CORREÇÃO 2: NÃO mistura include_attributes=all com attributes=...
      // O Python usa UM ou OUTRO. Usar ambos gera payloads enormes e timeouts.
      const attrs = 'id,title,status,sub_status,price,original_price,available_quantity,sold_quantity,permalink,thumbnail,tags,seller_custom_field,attributes,variations,listing_type_id,sale_terms,catalog_listing,health';
      const detRes = await axios.get(
        `https://api.mercadolibre.com/items?ids=${idsStr}&attributes=${attrs}`,
        { headers, timeout: 30000 }
      );
      const items = detRes.data
        .filter(d => d.code === 200 && d.body && d.body.id)
        .map(d => d.body);

      if (items.length === 0) {
        console.log(`    ⚠️ Chunk retornou 0 itens válidos (IDs: ${idsStr})`);
        return { items: [], saved: 0, lost: chunkIds };
      }

      // ─── 2b. Visitas em lote ───
      let visitsMap = {};
      try {
        await delay(150);
        const visRes = await axios.get(
          `https://api.mercadolibre.com/visits/items?ids=${idsStr}`,
          { headers, timeout: 15000 }
        );
        if (visRes.data) {
          Object.entries(visRes.data).forEach(([id, qty]) => { visitsMap[id] = qty; });
        }
      } catch (_) { /* visitas são opcionais */ }

      // ─── 2c. Sale Price — ★ CORREÇÃO 3: SÓ para itens SEM variações ───
      // Isso replica exatamente o comportamento do Python otimizado,
      // reduzindo as chamadas API em ~50% e evitando rate limit.
      for (const item of items) {
        // Se o item tem variações, o sale_price não é confiável (cada variação pode ter preço diferente)
        // O Python pula esses itens, e nós também devemos pular.
        const hasVariations = item.variations && item.variations.length > 0;
        if (hasVariations) continue;

        try {
          const spRes = await axios.get(
            `https://api.mercadolibre.com/items/${item.id}/sale_price`,
            { headers, timeout: 8000 }
          );
          if (spRes.status === 200 && spRes.data.amount) {
            item.price = spRes.data.amount;
            item.original_price = spRes.data.regular_amount || null;
          }
          await delay(50);
        } catch (_) { /* preço promo é opcional */ }
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
      const waitTime = isRateLimit
        ? 10000  // Rate limit: espera 10 segundos
        : attempt * 3000; // Outros erros: backoff crescente

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
    const test = await axios.get(
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
    // Usa o mesmo mlService.refreshToken ou faz a chamada direta:
    const res = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID || config.mlClientId,
      client_secret: process.env.ML_CLIENT_SECRET || config.mlClientSecret,
      refresh_token: refreshToken
    });

    const newToken = res.data.access_token;
    const newRefresh = res.data.refresh_token;

    // Salva no banco para que o próximo job já use o token novo
    await prisma.contaML.update({
      where: { id: contaId },
      data: {
        accessToken: newToken,
        refreshToken: newRefresh || refreshToken,
        expiresAt: BigInt(Date.now() + (res.data.expires_in || 21600) * 1000)
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
//     Neste modo, coleta TODOS os IDs de TODAS as contas antes de baixar detalhes,
//     tornando a barra de progresso precisa desde o início.
// =============================================================================
export const mlWorker = new Worker('sync-ml', async (job) => {
  const { contaId, accessToken: initialToken, refreshToken, contas } = job.data;

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
      const ids = await fetchAllItemIds(c.contaId, freshToken);
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

  // ★ CORREÇÃO: Garante token fresco NO MOMENTO do processamento
  const accessToken = await ensureFreshToken(contaId, initialToken, refreshToken);

  await job.updateProgress(5);

  // ─── ETAPA 1: Coleta TODOS os IDs ───
  const allIds = await fetchAllItemIds(contaId, accessToken);

  if (allIds.length === 0) {
    await job.updateProgress(100);
    return { success: true, processed: 0, saved: 0, lost: 0, message: "Nenhum anúncio encontrado" };
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

function extractSellerSku(item) {
  // 1. Campo direto seller_custom_field
  if (item.seller_custom_field) return item.seller_custom_field;
  
  // 2. Busca em attributes
  if (item.attributes) {
    const skuAttr = item.attributes.find(a => 
      a.id === 'SELLER_SKU' || a.id === 'GTIN' || a.id === 'MPN'
    );
    if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
  }
  
  // 3. Busca na primeira variação
  if (item.variations && item.variations.length > 0) {
    const v = item.variations[0];
    if (v.seller_custom_field) return v.seller_custom_field;
    if (v.attributes) {
      const skuAttr = v.attributes.find(a => a.id === 'SELLER_SKU');
      if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
  }
  
  return '';
}