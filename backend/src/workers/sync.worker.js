import './ml.worker.js'; // <- LIGA O WORKER DO ML JUNTO

import './publish.worker.js'; // 👇 ADICIONE ESTA LINHA PARA LIGAR O DE PUBLICAÇÃO

import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';

// Configuração de conexão com o Redis (Upstash) idêntica à da fila
const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  tls: {} // Obrigatório para o Upstash
};

// Função auxiliar para evitar bloqueio por limite de requisições do Tiny (Rate Limit)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('⚙️  Worker de Sincronização do Tiny Iniciado e aguardando Jobs...');

export const syncWorker = new Worker('sync-tiny', async (job) => {
  const { userId, tinyToken, mode, sku } = job.data;
  
  if (!userId || !tinyToken) {
    throw new Error("Faltam credenciais (userId ou tinyToken) para executar a sincronização.");
  }

  await job.updateProgress(5); // Inicia a barra de progresso no frontend

  let idsToFetch = [];

  // =========================================================================
  // FASE 1: BUSCAR QUAIS IDs DEVEM SER ATUALIZADOS BASEADO NO MODO
  // =========================================================================
  try {
    if (mode === 'sku' && sku) {
      // Busca apenas um SKU específico
      const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php', 
        new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: sku })
      );
      const items = res.data?.retorno?.produtos || [];
      idsToFetch = items.map(p => p.produto.id);

    } else if (mode === 'recentes') {
      // Busca a primeira página de produtos mais recentes
      const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php', 
        new URLSearchParams({ token: tinyToken, formato: 'JSON' })
      );
      const items = res.data?.retorno?.produtos || [];
      idsToFetch = items.map(p => p.produto.id);

    } else if (mode === 'all') {
      // Atualização completa (Varre as páginas do Tiny)
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await axios.post('https://api.tiny.com.br/api2/produtos.pesquisa.php', 
          new URLSearchParams({ token: tinyToken, formato: 'JSON', pagina: page })
        );
        const items = res.data?.retorno?.produtos || [];
        
        if (items.length === 0) {
          hasMore = false;
        } else {
          idsToFetch.push(...items.map(p => p.produto.id));
          page++;
          
          // ✅ NOVO: Delay de 300ms entre as páginas para não tomar bloqueio da API da Tiny (Erro 429)
          await delay(300);
        }
        
        // Aumentamos a trava para 500 páginas (suporta até 50.000 produtos). 
        // Impede apenas loops infinitos caso a API da Tiny bugue.
        if (page > 500) break; 
      }
    }
  } catch (error) {
    throw new Error(`Falha ao buscar lista de produtos no Tiny: ${error.message}`);
  }

  if (idsToFetch.length === 0) {
    await job.updateProgress(100);
    return { success: true, message: 'Nenhum produto encontrado no Tiny ERP.' };
  }

  await job.updateProgress(15); // Lista montada

  // =========================================================================
  // FASE 2: BUSCAR DETALHES DE CADA PRODUTO E SALVAR NO BANCO DE DADOS (PRISMA)
  // =========================================================================
  const total = idsToFetch.length;
  let processed = 0;

  for (const idProduto of idsToFetch) {
    try {
      // Delay de 300ms entre as requisições para evitar erro "429 Too Many Requests" do Tiny
      await delay(300);

      // Busca os detalhes e o estoque paralelamente
      const [detRes, estRes] = await Promise.all([
        axios.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token: tinyToken, formato: 'JSON', id: idProduto })),
        axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php', new URLSearchParams({ token: tinyToken, formato: 'JSON', id: idProduto }))
      ]);

      const det = detRes.data?.retorno?.produto;
      const est = estRes.data?.retorno?.produto;

      if (det && det.codigo) {
        const estoqueAtual = est ? Number(est.saldo) : 0;
        const preco = Number(det.preco) || 0;

        // =======================================================================
        //  ✅ INÍCIO DA CORREÇÃO: Adicione este bloco de código
        //  Normaliza o campo 'variacoes' para ser sempre um array
        // =======================================================================
        if (det.variacoes && typeof det.variacoes === 'object' && !Array.isArray(det.variacoes)) {
          console.log(`[sync.worker] Normalizando variações do SKU ${det.codigo} de Objeto para Array.`);
          det.variacoes = Object.values(det.variacoes);
        }
        // =======================================================================
        //  ✅ FIM DA CORREÇÃO
        // =======================================================================

        const dadosCompletos = { ...det, estoque_atual: estoqueAtual };

        // Usa o upsert do Prisma (Se o SKU já existe para esse usuário, ele atualiza. Se não, ele cria)
        await prisma.produto.upsert({
          where: {
            // Chave composta única definida no schema.prisma (@@unique([userId, sku]))
            userId_sku: { userId: userId, sku: det.codigo }
          },
          update: {
            nome: det.nome,
            preco: preco,
            estoque: estoqueAtual,
            dadosTiny: dadosCompletos // <-- 'dadosCompletos' agora terá as variações normalizadas
          },
          create: {
            userId: userId,
            sku: det.codigo,
            nome: det.nome,
            preco: preco,
            estoque: estoqueAtual,
            statusML: 'Não Publicado',
            dadosTiny: dadosCompletos // <-- 'dadosCompletos' agora terá as variações normalizadas
          }
        });
      }
    } catch (err) {
      console.error(`⚠️ Erro ao processar o Produto ID ${idProduto}:`, err.message);
      // Ignora o erro deste produto específico e continua para o próximo
    }

    processed++;
    // Matemática da barra de progresso: Vai de 15% até 99% baseada no andamento do loop
    const progress = 15 + Math.floor((processed / total) * 84);
    await job.updateProgress(progress);
  }

  // FASE 3: CONCLUSÃO
  await job.updateProgress(100); // 100% libera a tela do frontend
  return { success: true, processed };

}, { 
  connection, 
  concurrency: 1,
  stalledInterval: 120000,
  lockDuration: 300000,
  drainDelay: 10
});

// Logs para monitoramento no terminal
syncWorker.on('completed', (job) => {
  console.log(`✅ Sincronização concluída (Job ${job.id})! Produtos processados: ${job.returnvalue.processed || 0}`);
});

syncWorker.on('failed', (job, err) => {
  console.log(`❌ Falha na Sincronização (Job ${job.id}): ${err.message}`);
});

syncWorker.on('error', (err) => {
  console.error('❌ Erro no Worker de Sincronização (Redis):', err.message);
});