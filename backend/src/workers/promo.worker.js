// backend/src/workers/promo.worker.js
import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const TIPOS_SEM_PROMOTION_ID = new Set(['DOD', 'LIGHTNING']);
const TIPOS_COM_OFFER_ID = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);

export const promoWorker = new Worker('promo-queue', async (job) => {
  const { tarefaId, userId, itens, acao } = job.data;

  const tarefaExiste = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
  if (!tarefaExiste) return { success: false, message: 'Tarefa excluída' };

  await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { status: 'PROCESSANDO' } });

  let sucessos = 0;
  let falhas = 0;
  let detalhesLogs = [];
  let processedCount = 0;
  const contasCache = {};

  for (const item of itens) {
    let logDesteItem = `[MLB: ${item.itemId} | Promo: ${item.promoTipo}]`;
    try {
      // 1. Gerencia Token
      if (!contasCache[item.contaId]) {
        const c = await prisma.contaML.findFirst({ where: { id: item.contaId, userId } });
        if (c) {
          try {
            const tRes = await mlService.refreshToken(c.refreshToken);
            if (tRes?.access_token) {
              c.accessToken = tRes.access_token;
              c.refreshToken = tRes.refresh_token;
            }
          } catch (e) {}
        }
        contasCache[item.contaId] = c;
      }
      const conta = contasCache[item.contaId];
      if (!conta) throw new Error('Conta não encontrada ou token inválido.');

      const headers = { Authorization: `Bearer ${conta.accessToken}`, 'Content-Type': 'application/json' };

      // 2. Executa a Ação
      if (acao === 'REMOVER') {
        const params = new URLSearchParams({ promotion_type: item.promoTipo, app_version: 'v2' });
        if (item.promoId) params.set('promotion_id', item.promoId);
        if (item.offerId) params.set('offer_id', item.offerId);

        await axios.delete(`https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?${params}`, { headers });
        logDesteItem += ' -> Removido com sucesso.';
      } else {
        // ATIVAR
        const body = { promotion_type: item.promoTipo };
        if (!TIPOS_SEM_PROMOTION_ID.has(item.promoTipo) && item.promoId) body.promotion_id = item.promoId;
        if (item.offerId && TIPOS_COM_OFFER_ID.has(item.promoTipo)) body.offer_id = item.offerId;

        if (TIPOS_COM_PRECO.has(item.promoTipo)) {
          if (!item.dealPrice || isNaN(item.dealPrice)) {
            throw new Error('Preço obrigatório para este tipo de campanha (deal_price ausente).');
          }
          body.deal_price = Number(item.dealPrice);
          if (item.topDealPrice) body.top_deal_price = Number(item.topDealPrice);
        }

        if (item.promoTipo === 'LIGHTNING' && item.stock) body.stock = Number(item.stock);

        await axios.post(`https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`, body, { headers });
        logDesteItem += ' -> Ativado com sucesso.';
      }

      sucessos++;
      detalhesLogs.push(logDesteItem);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.cause?.[0]?.error_message || err.message || '';
      falhas++;
      detalhesLogs.push(`${logDesteItem} Erro: ${errMsg}`);

      // Erros permanentes: remove o item dos candidatos para não tentar novamente
      const ERROS_PERMANENTES = [
        'item condition must be new',
        'PROMOTION_STATUS_OPT_IN - finished',
        'The item must be active',
        'item must be active',
        'free listing',
      ];
      const isPermanente = ERROS_PERMANENTES.some(e => errMsg.toLowerCase().includes(e.toLowerCase()));
      if (isPermanente && acao === 'ATIVAR' && item.promoId) {
        try {
          const promoRecord = await prisma.promoML.findUnique({
            where: { id_contaId: { id: item.promoId, contaId: item.contaId } },
          });
          if (promoRecord && Array.isArray(promoRecord.itens)) {
            await prisma.promoML.update({
              where: { id_contaId: { id: item.promoId, contaId: item.contaId } },
              data: { itens: promoRecord.itens.filter(i => i.id !== item.itemId) },
            });
          }
        } catch (_) {}
      }
    }

    processedCount++;
    await job.updateProgress(Math.floor((processedCount / itens.length) * 100));

    // Atualiza o banco a cada 5 itens para feedback no painel
    if (processedCount % 5 === 0 || processedCount === itens.length) {
      await prisma.tarefaFila.update({
        where: { id: tarefaId },
        data: { detalhes: `Processando: ${processedCount}/${itens.length}\n\n${detalhesLogs.slice(-10).join('\n')}` }
      });
    }

    // Delay para respeitar Rate Limit da API de promoções do ML
    await new Promise(r => setTimeout(r, 400));
  }

  await prisma.tarefaFila.update({
    where: { id: tarefaId },
    data: {
      status: falhas === 0 ? 'CONCLUIDO' : (sucessos === 0 ? 'FALHA' : 'CONCLUIDO'),
      detalhes: `Resumo:\n✅ Sucessos: ${sucessos}\n❌ Erros: ${falhas}\n\nLogs:\n${detalhesLogs.join('\n')}`
    }
  });

  return { sucessos, falhas };
}, { connection, concurrency: 1 });

promoWorker.on('error', (err) => console.error('❌ Erro no Worker promo-queue:', err.message));
