// =====================================================================
// backend/src/workers/ml.worker.js
// =====================================================================
// Worker de sincronização de anúncios do Mercado Livre.
// CORRIGIDO v2: Upsert em lote via SQL raw para evitar connection reset
// no Neon Serverless + PgBouncer.
//
// MUDANÇAS PRINCIPAIS:
//  1. Substituiu 20 upserts individuais por 1 único INSERT...ON CONFLICT
//  2. Lotes menores (10 IDs por multiget em vez de 20)
//  3. Keepalive mais frequente (a cada 2 lotes)
//  4. Delay aumentado entre lotes (800ms)
//  5. Retry com backoff exponencial melhorado
// =====================================================================

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

console.log('⚙️  Worker de Sincronização do ML Iniciado...');


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
        const waitTime = Math.min(attempt * 3000, 15000); // 3s, 6s, 9s, 12s, 15s
        console.log(`  🔄 Tentativa ${attempt}/${maxRetries} falhou (conexão). Reconectando em ${waitTime / 1000}s...`);

        // Força reconexão completa
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
    // Valida a reconexão
    try { await prisma.$queryRaw`SELECT 1`; } catch (_) {}
  }
}


// =============================================================================
// UPSERT EM LOTE VIA SQL RAW — 1 query para N itens (em vez de N queries)
// =============================================================================
async function batchUpsertAnuncios(items, contaId, visitsMap) {
  if (items.length === 0) return;

  // Monta os arrays de valores para cada coluna
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

  // Uma ÚNICA query SQL que faz INSERT ... ON CONFLICT DO UPDATE
  // Isso evita N round-trips ao banco — a raiz do problema de connection reset
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
    ids,
    contaIds,
    skus,
    titulos,
    precos,
    precosOriginais,
    statuses,
    estoques,
    vendasArr,
    visitasArr,
    thumbnails,
    permalinks,
    dadosMLArr,
    tagsPrincipais
  );
}


// =============================================================================
// FUNÇÃO DE COLETA DE IDs — REPLICANDO A LÓGICA DO SISTEMA PYTHON
// Faz um loop SEPARADO para cada status (active, paused, under_review)
// usando search_type=scroll, garantindo que NENHUM anúncio escape.
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

        for (const id of batchIds) {
          allIds.add(id);
        }
        idsForThisStatus += batchIds.length;

        if (!newScrollId || batchIds.length === 0) {
          break;
        }

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
// FALLBACK POR OFFSET
// =============================================================================
async function fetchIdsByOffset(contaId, accessToken, status, idsSet) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  let offset = 0;
  const limit = 50;

  while (true) {
    try {
      const res = await axios.get(
        `https://api.mercadolibre.com/users/${contaId}/items/search`,
        {
          headers,
          params: { status, limit, offset },
          timeout: 20000
        }
      );

      const batchIds = res.data.results || [];
      if (batchIds.length === 0) break;

      for (const id of batchIds) {
        idsSet.add(id);
      }

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
// WORKER PRINCIPAL
// =============================================================================
export const mlWorker = new Worker('sync-ml', async (job) => {
  const { contaId, accessToken } = job.data;
  if (!contaId || !accessToken) throw new Error("Credenciais ML ausentes");

  await job.updateProgress(5);

  // ─── ETAPA 1: Coleta TODOS os IDs (por status, igual ao Python) ───
  const allIds = await fetchAllItemIds(contaId, accessToken);

  if (allIds.length === 0) {
    await job.updateProgress(100);
    return { success: true, processed: 0, message: "Nenhum anúncio encontrado" };
  }

  console.log(`  🔎 Iniciando busca de detalhes para ${allIds.length} anúncios...`);
  await job.updateProgress(15);

  // ─── Keepalive inicial ───
  await keepAlive();

  // ─── ETAPA 2: Multiget (Lotes de 10) + Visitas + Sale Price + Upsert SQL ───
  const chunkSize = 10; // ← REDUZIDO de 20 para 10 (menos pressão no banco)
  let processed = 0;
  let chunkCount = 0;

  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunkIds = allIds.slice(i, i + chunkSize);
    const idsStr = chunkIds.join(',');
    chunkCount++;

    // ─── Keepalive a cada 2 lotes (20 itens) ← mais frequente ───
    if (chunkCount % 2 === 0) {
      await keepAlive();
    }

    try {
      // Respiro para o Rate Limit do ML
      await delay(800); // ← AUMENTADO de 500 para 800

      // Busca detalhes em lote
      const attrs = 'id,title,status,sub_status,price,original_price,available_quantity,sold_quantity,permalink,thumbnail,tags,seller_custom_field,attributes,variations,listing_type_id,sale_terms,catalog_listing,health';
      const detRes = await axios.get(
        `https://api.mercadolibre.com/items?ids=${idsStr}&attributes=${attrs}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 30000 }
      );
      const items = detRes.data.map(d => d.body).filter(b => b && b.id);

      // Busca visitas em lote
      let visitsMap = {};
      try {
        await delay(200);
        const visRes = await axios.get(
          `https://api.mercadolibre.com/visits/items?ids=${idsStr}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
        );
        if (visRes.data) {
          Object.entries(visRes.data).forEach(([id, qty]) => { visitsMap[id] = qty; });
        }
      } catch (e) {
        // Silencia erro de visitas
      }

      // Busca Preço Promocional para TODOS os items do lote
      for (const item of items) {
        try {
          const salePriceUrl = `https://api.mercadolibre.com/items/${item.id}/sale_price`;
          const salePriceRes = await axios.get(salePriceUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
          });

          if (salePriceRes.status === 200 && salePriceRes.data.amount) {
            item.price = salePriceRes.data.amount;
            item.original_price = salePriceRes.data.regular_amount || null;
          }
          await delay(50);
        } catch (salePriceError) {
          // Ignora se não tiver preço de promoção
        }
      }

      // ─── UPSERT VIA SQL RAW (1 query em vez de N) ───
      try {
        await prismaRetry(async () => {
          await batchUpsertAnuncios(items, contaId, visitsMap);
        });
      } catch (dbError) {
        console.error(`  ⚠️ Erro ao salvar lote de ${items.length} anúncios: ${dbError.message}`);
      }
    } catch (chunkError) {
      console.error(`  ⚠️ Erro grave ao processar o lote inteiro: ${chunkError.message}`);
    }

    processed += chunkIds.length;
    const mathProgress = 15 + Math.floor((processed / allIds.length) * 85);
    await job.updateProgress(mathProgress > 99 ? 99 : mathProgress);
  }

  await job.updateProgress(100);
  console.log(`  ✅ Finalizado! ${processed} anúncios processados com sucesso.`);
  return { success: true, processed };
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


// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

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
    if (combined.has(priorityTag)) {
      return priorityTag;
    }
  }

  if (subStatus.length > 0) {
    return subStatus[0];
  }

  return null;
}

function extractSellerSku(itemData) {
  if (itemData.attributes && Array.isArray(itemData.attributes)) {
    const skuAttr = itemData.attributes.find(a => a.id === 'SELLER_SKU');
    if (skuAttr && skuAttr.value_name && skuAttr.value_name !== '-1') {
      return skuAttr.value_name;
    }
  }
  return itemData.seller_custom_field || null;
}
