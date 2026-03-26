// backend/src/workers/sync.worker.js
import './ml.worker.js';
import './publish.worker.js';
import './price.worker.js';
import './priceCheck.worker.js';
import './acoes.worker.js';
import './cron.worker.js';
import './promo.worker.js';

import { Worker } from 'bullmq';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { getTinyRateLimit } from './../utils/tinyRateLimit.js';
import { createTinyClient, getTinyAccessToken, listarProdutos, obterProduto, obterEstoque, normalizarProdutoV3 } from '../utils/tinyClient.js';

// Configuração de conexão com o Redis (Upstash) idêntica à da fila
const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('⚙️  Worker de Sincronização do Tiny Iniciado e aguardando Jobs...');

export const syncWorker = new Worker('sync-tiny', async (job) => {
  const { userId, mode, sku, ids } = job.data;

  if (!userId) {
    throw new Error("Falta userId para executar a sincronização.");
  }

  const tinyToken = await getTinyAccessToken(userId);
  if (!tinyToken) {
    throw new Error("Conta Tiny não conectada ou token expirado. Reconecte em Configurações.");
  }

  await job.updateProgress(5);

  const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { tinyPlano: true } });
  const tinyLimits = getTinyRateLimit(userRecord?.tinyPlano);

  if (tinyLimits.blocked) {
    throw new Error('O plano "Começar" do Tiny ERP não permite integração via API. Atualize seu plano.');
  }

  const tinyClient = createTinyClient(tinyToken);
  const LIMIT = 100;
  let idsToFetch = [];

  // =========================================================================
  // FASE 1: BUSCAR QUAIS IDs DEVEM SER ATUALIZADOS BASEADO NO MODO
  // =========================================================================
  try {
    if (mode === 'ids' && Array.isArray(ids)) {
      idsToFetch = ids;

    } else if (mode === 'sku' && sku) {
      const data = await listarProdutos(tinyClient, { codigo: sku });
      idsToFetch = (data.itens || []).map(p => p.id);

    } else if (mode === 'recentes') {
      const data = await listarProdutos(tinyClient, { limit: LIMIT, offset: 0 });
      idsToFetch = (data.itens || []).map(p => p.id);

    } else if (mode === 'all') {
      const firstData = await listarProdutos(tinyClient, { limit: LIMIT, offset: 0 });
      const total = firstData.paginacao?.total || 0;
      idsToFetch.push(...(firstData.itens || []).map(p => p.id));

      for (let offset = LIMIT; offset < total; offset += LIMIT) {
        await delay(tinyLimits.delayMs);
        try {
          const data = await listarProdutos(tinyClient, { limit: LIMIT, offset });
          idsToFetch.push(...(data.itens || []).map(p => p.id));
        } catch (pageErr) {
          console.warn(`⚠️ Falha ao buscar offset ${offset}/${total}: ${pageErr.message}`);
        }
      }

    } else if (mode === 'novos') {
      const produtosExistentes = await prisma.produto.findMany({
        where: { userId },
        select: { sku: true }
      });
      const skusExistentes = new Set(produtosExistentes.map(p => p.sku));

      const firstData = await listarProdutos(tinyClient, { limit: LIMIT, offset: 0 });
      const total = firstData.paginacao?.total || 0;

      for (const p of (firstData.itens || [])) {
        if (p.sku && !skusExistentes.has(p.sku)) idsToFetch.push(p.id);
      }

      for (let offset = LIMIT; offset < total; offset += LIMIT) {
        await delay(tinyLimits.delayMs);
        try {
          const data = await listarProdutos(tinyClient, { limit: LIMIT, offset });
          for (const p of (data.itens || [])) {
            if (p.sku && !skusExistentes.has(p.sku)) idsToFetch.push(p.id);
          }
        } catch (pageErr) {
          console.warn(`⚠️ Falha ao buscar offset ${offset}/${total}: ${pageErr.message}`);
        }
      }
    }
  } catch (error) {
    throw new Error(`Falha ao buscar lista de produtos no Tiny: ${error.message}`);
  }

  if (idsToFetch.length === 0) {
    await job.updateProgress(100);
    return { success: true, message: 'Nenhum produto encontrado no Tiny ERP.' };
  }

  await job.updateProgress(15); 

  // =========================================================================
  // FASE 2: BUSCAR DETALHES DE CADA PRODUTO E SALVAR NO BANCO DE DADOS
  // =========================================================================
  const total = idsToFetch.length;
  let processed = 0;

  for (const idProduto of idsToFetch) {
    let sucesso = false;
    let tentativas = 0;
    const maxTentativas = 3;

    while (tentativas < maxTentativas && !sucesso) {
      try {
        await delay(tinyLimits.delayMs);

        const det = await obterProduto(tinyClient, idProduto);
        const est = await obterEstoque(tinyClient, idProduto).catch(() => null);

        if (det && det.sku) {
          const estoqueAtual = est?.saldo != null ? Number(est.saldo) : (det.estoque?.quantidade || 0);
          const preco = det.precos?.preco || 0;
          const dadosCompletos = normalizarProdutoV3(det, estoqueAtual);

          await prisma.produto.upsert({
            where: { userId_sku: { userId: userId, sku: det.sku } },
            update: {
              nome: det.descricao,
              preco,
              estoque: estoqueAtual,
              dadosTiny: dadosCompletos,
            },
            create: {
              userId: userId,
              sku: det.sku,
              nome: det.descricao,
              preco,
              estoque: estoqueAtual,
              statusML: 'Não Publicado',
              dadosTiny: dadosCompletos,
            },
          });
        }
        
        sucesso = true; // Registrou e saiu do loop retry
      } catch (err) {
        tentativas++;
        if (tentativas >= maxTentativas) {
          console.error(`⚠️ Erro final ao processar o Produto ID ${idProduto}:`, err.message);
        } else {
          // Backoff exponencial para deixar a API respirar se houver timeout
          await delay(2500 * tentativas);
        }
      }
    }

    processed++;
    const progress = 15 + Math.floor((processed / total) * 84);
    await job.updateProgress(progress);
  }

  // FASE 3: CONCLUSÃO
  await job.updateProgress(100); 
  return { success: true, processed };

}, { 
  connection, 
  concurrency: 5,
  stalledInterval: 120000,
  lockDuration: 300000,
  drainDelay: 10
});

syncWorker.on('completed', (job) => {
  console.log(`✅ Sincronização Tiny concluída (Job ${job.id})! Produtos processados: ${job.returnvalue.processed || 0}`);
});

syncWorker.on('failed', (job, err) => {
  console.log(`❌ Falha na Sincronização Tiny (Job ${job.id}): ${err.message}`);
});

syncWorker.on('error', (err) => {
  console.error('❌ Erro no Worker de Sincronização (Redis):', err.message);
});