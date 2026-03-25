// backend/src/workers/sync.worker.js
import './ml.worker.js';
import './publish.worker.js';
import './price.worker.js';
import './priceCheck.worker.js';
import './acoes.worker.js';
import './cron.worker.js';
import './promo.worker.js';

import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { getTinyRateLimit } from './../utils/tinyRateLimit.js';

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
  const { userId, tinyToken, mode, sku, ids } = job.data;
  
  if (!userId || !tinyToken) {
    throw new Error("Faltam credenciais (userId ou tinyToken) para executar a sincronização.");
  }

  await job.updateProgress(5);

  const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { tinyPlano: true } });
  const tinyLimits = getTinyRateLimit(userRecord?.tinyPlano);

  if (tinyLimits.blocked) {
    throw new Error('O plano "Começar" do Tiny ERP não permite integração via API. Atualize seu plano.');
  }

  let idsToFetch = [];

  // =========================================================================
  // FASE 1: BUSCAR QUAIS IDs DEVEM SER ATUALIZADOS BASEADO NO MODO
  // =========================================================================
  try {
    if (mode === 'ids' && Array.isArray(ids)) {
      idsToFetch = ids;
    } else if (mode === 'sku' && sku) {
      const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php', 
        new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: sku })
      );
      const items = res.data?.retorno?.produtos || [];
      idsToFetch = items.map(p => p.produto.id);

    } else if (mode === 'recentes') {
      const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php', 
        new URLSearchParams({ token: tinyToken, formato: 'JSON' })
      );
      const items = res.data?.retorno?.produtos || [];
      idsToFetch = items.map(p => p.produto.id);

    } else if (mode === 'all') {
      const firstRes = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php',
        new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: '', pagina: 1 })
      );
      const firstItems = firstRes.data?.retorno?.produtos || [];
      const totalPages = parseInt(firstRes.data?.retorno?.numero_paginas || '1', 10);
      idsToFetch.push(...firstItems.map(p => p.produto.id));

      for (let page = 2; page <= totalPages && page <= 500; page++) {
        await delay(tinyLimits.delayMs);
        try {
          const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php',
            new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: '', pagina: page })
          );
          const items = res.data?.retorno?.produtos || [];
          idsToFetch.push(...items.map(p => p.produto.id));
        } catch (pageErr) {
          console.warn(`⚠️ Falha ao buscar página ${page}/${totalPages}: ${pageErr.message}`);
        }
      }

    } else if (mode === 'novos') {
      // Busca apenas produtos cujo SKU ainda NÃO existe no banco local
      const produtosExistentes = await prisma.produto.findMany({
        where: { userId },
        select: { sku: true }
      });
      const skusExistentes = new Set(produtosExistentes.map(p => p.sku));

      const firstRes = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php',
        new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: '', pagina: 1 })
      );
      const totalPages = parseInt(firstRes.data?.retorno?.numero_paginas || '1', 10);
      const firstItems = firstRes.data?.retorno?.produtos || [];

      for (const p of firstItems) {
        const codigo = String(p.produto?.codigo || '').trim();
        if (codigo && !skusExistentes.has(codigo)) idsToFetch.push(p.produto.id);
      }

      for (let page = 2; page <= totalPages && page <= 500; page++) {
        await delay(tinyLimits.delayMs);
        try {
          const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php',
            new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: '', pagina: page })
          );
          const items = res.data?.retorno?.produtos || [];
          for (const p of items) {
            const codigo = String(p.produto?.codigo || '').trim();
            if (codigo && !skusExistentes.has(codigo)) idsToFetch.push(p.produto.id);
          }
        } catch (pageErr) {
          console.warn(`⚠️ Falha ao buscar página ${page}/${totalPages}: ${pageErr.message}`);
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

        // ✅ Timeout adicionado para forçar o failover caso a requisição enrosque
        const [detRes, estRes] = await Promise.all([
          axios.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token: tinyToken, formato: 'JSON', id: idProduto }), { timeout: 20000 }),
          axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php', new URLSearchParams({ token: tinyToken, formato: 'JSON', id: idProduto }), { timeout: 20000 })
        ]);

        const det = detRes.data?.retorno?.produto;
        const est = estRes.data?.retorno?.produto;

        if (det && det.codigo) {
          const estoqueAtual = est ? Number(est.saldo) : 0;
          const preco = Number(det.preco) || 0;

          if (det.variacoes && typeof det.variacoes === 'object' && !Array.isArray(det.variacoes)) {
            det.variacoes = Object.values(det.variacoes);
          }

          const dadosCompletos = { ...det, estoque_atual: estoqueAtual };

          await prisma.produto.upsert({
            where: { userId_sku: { userId: userId, sku: det.codigo } },
            update: {
              nome: det.nome,
              preco: preco,
              estoque: estoqueAtual,
              dadosTiny: dadosCompletos
            },
            create: {
              userId: userId,
              sku: det.codigo,
              nome: det.nome,
              preco: preco,
              estoque: estoqueAtual,
              statusML: 'Não Publicado',
              dadosTiny: dadosCompletos
            }
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