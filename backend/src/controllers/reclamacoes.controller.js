import prisma from '../config/prisma.js';
import { mlService } from '../services/ml.service.js';
import { sincronizarReclamacoes } from '../services/reclamacoes.service.js';
import axios from 'axios';

const ML_BASE = 'https://api.mercadolibre.com';

async function getTokenParaConta(conta) {
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    const token = refreshed?.access_token || conta.accessToken;
    if (refreshed?.access_token) {
      await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
    }
    return token;
  } catch {
    return conta.accessToken;
  }
}

export const reclamacoesController = {

  // GET /api/reclamacoes
  // Lista reclamações abertas do cache, agrupadas
  async listar(req, res) {
    const userId = req.userId;
    const { status = 'opened', lida } = req.query;

    try {
      const where = { userId, status };
      if (lida === 'false') where.lida = false;
      if (lida === 'true') where.lida = true;

      const reclamacoes = await prisma.reclamacaoCache.findMany({
        where,
        orderBy: { lastUpdated: 'desc' },
      });

      const totalNaoLidas = await prisma.reclamacaoCache.count({
        where: { userId, status: 'opened', lida: false },
      });

      return res.json({ reclamacoes, totalNaoLidas });
    } catch (err) {
      console.error('Erro ao listar reclamações:', err.message);
      return res.status(500).json({ erro: 'Erro ao buscar reclamações' });
    }
  },

  // GET /api/reclamacoes/:claimId/detail
  // Busca detalhes completos direto da API do ML (inclui available_actions atualizados)
  async detalhe(req, res) {
    const userId = req.userId;
    const { claimId } = req.params;

    try {
      const cached = await prisma.reclamacaoCache.findFirst({ where: { id: claimId, userId } });
      if (!cached) return res.status(404).json({ erro: 'Reclamação não encontrada' });

      const conta = await prisma.contaML.findFirst({ where: { id: cached.contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenParaConta(conta);

      // Busca claim + mensagens + order em paralelo
      const requests = [
        axios.get(`${ML_BASE}/post-purchase/v1/claims/${claimId}`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
        }),
        axios.get(`${ML_BASE}/post-purchase/v1/claims/${claimId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
        }),
      ];

      const [claimResp, messagesResp] = await Promise.allSettled(requests);

      const claim = claimResp.status === 'fulfilled' ? claimResp.value.data : cached.dadosML;
      const mensagens = messagesResp.status === 'fulfilled' ? messagesResp.value.data : [];

      // Resolve o order correto: resource pode ser 'order', 'shipment' ou 'pack'
      let order = null;
      const resourceId = cached.resourceId;
      if (resourceId) {
        try {
          // Tenta direto como order
          const orderResp = await axios.get(`${ML_BASE}/orders/${resourceId}`, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
          });
          order = orderResp.data;
        } catch {
          // Tenta via shipment → pega order_id dentro do shipment
          try {
            const shipResp = await axios.get(`${ML_BASE}/shipments/${resourceId}`, {
              headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
            });
            const realOrderId = shipResp.data?.order_id;
            if (realOrderId) {
              const orderResp2 = await axios.get(`${ML_BASE}/orders/${realOrderId}`, {
                headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
              });
              order = orderResp2.data;
            }
          } catch {
            // Tenta via pack → pega primeiro order
            try {
              const packResp = await axios.get(`${ML_BASE}/packs/${resourceId}`, {
                headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
              });
              const firstOrderId = packResp.data?.orders?.[0];
              if (firstOrderId) {
                const orderResp3 = await axios.get(`${ML_BASE}/orders/${firstOrderId}`, {
                  headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
                });
                order = orderResp3.data;
              }
            } catch {
              // sem order, não é crítico
            }
          }
        }
      }

      // Busca thumbnail do item via /items, pois o endpoint de orders não retorna
      if (order?.order_items?.[0]?.item?.id) {
        const itemId = order.order_items[0].item.id;
        try {
          const itemResp = await axios.get(
            `${ML_BASE}/items/${itemId}?attributes=id,thumbnail,pictures`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
          );
          const thumbnail = itemResp.data?.thumbnail || itemResp.data?.pictures?.[0]?.url || null;
          if (thumbnail) order.order_items[0].item.thumbnail = thumbnail;
        } catch {
          // sem thumbnail, não é crítico
        }
      }

      // Atualiza cache com dados frescos
      if (claimResp.status === 'fulfilled') {
        await prisma.reclamacaoCache.update({
          where: { id: claimId },
          data: {
            status: claim.status,
            stage: claim.stage || 'none',
            lastUpdated: new Date(claim.last_updated),
            dadosML: claim,
            lida: true,
          },
        }).catch(() => {});
      }

      return res.json({ claim, mensagens, order, contaNickname: conta.nickname });
    } catch (err) {
      console.error('Erro ao buscar detalhe da reclamação:', err.message);
      return res.status(500).json({ erro: 'Erro ao buscar detalhes' });
    }
  },

  // POST /api/reclamacoes/:claimId/mensagem
  // Envia mensagem para o comprador ou mediador
  async enviarMensagem(req, res) {
    const userId = req.userId;
    const { claimId } = req.params;
    const { receiver_role, message } = req.body;

    if (!receiver_role || !message?.trim()) {
      return res.status(400).json({ erro: 'receiver_role e message são obrigatórios' });
    }

    try {
      const cached = await prisma.reclamacaoCache.findFirst({ where: { id: claimId, userId } });
      if (!cached) return res.status(404).json({ erro: 'Reclamação não encontrada' });

      const conta = await prisma.contaML.findFirst({ where: { id: cached.contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenParaConta(conta);

      await axios.post(
        `${ML_BASE}/post-purchase/v1/claims/${claimId}/actions/send-message`,
        { receiver_role, message, attachments: [] },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      return res.json({ ok: true });
    } catch (err) {
      const mlErr = err.response?.data?.message || err.message;
      console.error('Erro ao enviar mensagem da reclamação:', mlErr);
      return res.status(err.response?.status || 500).json({ erro: mlErr });
    }
  },

  // POST /api/reclamacoes/sincronizar
  // Força sincronização imediata com a API do ML
  async sincronizar(req, res) {
    const userId = req.userId;
    try {
      const pendentes = await sincronizarReclamacoes(userId);
      return res.json({ ok: true, reclamacoesPendentes: pendentes });
    } catch (err) {
      console.error('Erro ao sincronizar reclamações:', err.message);
      return res.status(500).json({ erro: 'Erro ao sincronizar' });
    }
  },

  // POST /api/reclamacoes/:claimId/marcar-lida
  async marcarLida(req, res) {
    const userId = req.userId;
    const { claimId } = req.params;

    try {
      await prisma.reclamacaoCache.updateMany({
        where: { id: claimId, userId },
        data: { lida: true },
      });

      // Recalcula o cache de notificações
      const pendentes = await prisma.reclamacaoCache.count({
        where: { userId, status: 'opened', lida: false },
      });
      await prisma.notificacaoCache.updateMany({
        where: { userId },
        data: { reclamacoesPendentes: pendentes },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Erro ao marcar reclamação como lida:', err.message);
      return res.status(500).json({ erro: 'Erro interno' });
    }
  },

  // POST /api/reclamacoes/:claimId/marcar-todas-lidas
  async marcarTodasLidas(req, res) {
    const userId = req.userId;

    try {
      await prisma.reclamacaoCache.updateMany({
        where: { userId, lida: false },
        data: { lida: true },
      });
      await prisma.notificacaoCache.updateMany({
        where: { userId },
        data: { reclamacoesPendentes: 0 },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err.message);
      return res.status(500).json({ erro: 'Erro interno' });
    }
  },
};
