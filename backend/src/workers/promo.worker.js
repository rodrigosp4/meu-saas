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

const TIPOS_SEM_PROMOTION_ID = new Set(['DOD', 'LIGHTNING', 'PRICE_DISCOUNT']);
const TIPOS_COM_OFFER_ID = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING', 'PRICE_DISCOUNT']);

export const promoWorker = new Worker('promo-queue', async (job) => {
  const { tarefaId, userId, itens, acao } = job.data;

  const tarefaExiste = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
  if (!tarefaExiste) return { success: false, message: 'Tarefa excluída' };

  await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { status: 'PROCESSANDO' } });

  // Carrega gordura + excedente de todos os itens do job em uma única query
  const itemIds = [...new Set(itens.map(i => i.itemId).filter(Boolean))];
  const anunciosLimite = await prisma.anuncioML.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, inflarPct: true, toleranciaPromo: true },
  }).catch(() => []);
  const limiteMap = Object.fromEntries(
    anunciosLimite.map(a => [a.id, { inflarPct: a.inflarPct || 0, toleranciaPromo: a.toleranciaPromo || 0 }])
  );

  let sucessos = 0;
  let falhas = 0;
  let removidosPosVerificacao = 0;
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

        if (item.promoTipo === 'PRICE_DISCOUNT') {
          const pad = n => String(n).padStart(2, '0');
          const now = new Date();
          const fin = new Date(now); fin.setDate(fin.getDate() + 7);
          body.start_date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T00:00:00`;
          body.finish_date = `${fin.getFullYear()}-${pad(fin.getMonth()+1)}-${pad(fin.getDate())}T23:59:59`;
        }

        if (item.isUpdate && item.promoTipo === 'PRICE_DISCOUNT') {
          // PRICE_DISCOUNT ativo não pode ser modificado diretamente: apaga e recria
          const delParams = new URLSearchParams({ promotion_type: 'PRICE_DISCOUNT', app_version: 'v2' });
          await axios.delete(`https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?${delParams}`, { headers });
          await new Promise(r => setTimeout(r, 500));
          await axios.post(`https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`, body, { headers });
          logDesteItem += ' -> Atualizado com sucesso (delete+post).';
        } else if (item.isUpdate) {
          // SELLER_CAMPAIGN, DEAL, etc: PUT para atualizar preço
          await axios.put(`https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`, body, { headers });
          logDesteItem += ' -> Atualizado com sucesso.';
        } else {
          await axios.post(`https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`, body, { headers });
          logDesteItem += ' -> Ativado com sucesso.';
        }
      }

      sucessos++;

      // ── Verificação pós-ativação ─────────────────────────────────────────────
      // Consulta a API do ML para confirmar que o desconto efetivamente aplicado não excede
      // a gordura + excedente definidos para o item. Só verifica tipos que usam deal_price.
      const limiteItem = limiteMap[item.itemId];
      if (acao === 'ATIVAR' && TIPOS_COM_PRECO.has(item.promoTipo) && limiteItem && limiteItem.inflarPct > 0) {
        const limiteMax = limiteItem.inflarPct + limiteItem.toleranciaPromo;
        try {
          await new Promise(r => setTimeout(r, 300)); // aguarda ML processar
          const checkRes = await axios.get(
            `https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`,
            { headers, timeout: 8000 }
          );
          const promos = Array.isArray(checkRes.data) ? checkRes.data : (checkRes.data ? [checkRes.data] : []);
          const promoData = item.promoId
            ? promos.find(p => (p.id || p.promotion_id) === item.promoId)
            : promos.find(p => (p.type || p.promotion_type) === item.promoTipo);

          if (promoData) {
            const appliedPrice = promoData.deal_price ?? promoData.price ?? null;
            const origPrice = promoData.original_price ?? null;
            if (appliedPrice && origPrice > 0) {
              const pctAplicado = (1 - appliedPrice / origPrice) * 100;
              if (pctAplicado > limiteMax) {
                // Desconto efetivo ultrapassou gordura + excedente — remove a promoção
                const delParams = new URLSearchParams({ promotion_type: item.promoTipo, app_version: 'v2' });
                if (item.promoId) delParams.set('promotion_id', item.promoId);
                await axios.delete(
                  `https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?${delParams}`,
                  { headers }
                );
                logDesteItem += ` ⚠️ REMOVIDO pós-verificação: ${pctAplicado.toFixed(1)}% > limite ${limiteMax}% (gordura ${limiteItem.inflarPct}% + excedente ${limiteItem.toleranciaPromo}%)`;
                sucessos--;
                removidosPosVerificacao++;
              }
            }
          }
        } catch (checkErr) {
          logDesteItem += ` [verificação pós-ativação falhou: ${checkErr.message}]`;
        }
      }
      // ────────────────────────────────────────────────────────────────────────

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

  const resumo = [
    `✅ Ativados: ${sucessos}`,
    falhas > 0 ? `❌ Erros: ${falhas}` : null,
    removidosPosVerificacao > 0 ? `⚠️ Removidos pós-verificação (acima do limite): ${removidosPosVerificacao}` : null,
  ].filter(Boolean).join('\n');

  await prisma.tarefaFila.update({
    where: { id: tarefaId },
    data: {
      status: sucessos === 0 && falhas > 0 ? 'FALHA' : 'CONCLUIDO',
      detalhes: `Resumo:\n${resumo}\n\nLogs:\n${detalhesLogs.join('\n')}`
    }
  });

  return { sucessos, falhas, removidosPosVerificacao };
}, { connection, concurrency: 1 });

promoWorker.on('error', (err) => console.error('❌ Erro no Worker promo-queue:', err.message));
