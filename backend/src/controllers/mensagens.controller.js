import prisma from '../config/prisma.js';
import { mlService } from '../services/ml.service.js';
import axios from 'axios';

const ML_API = 'https://api.mercadolibre.com';

// ID do Agente MLB (Brasil) — nova arquitetura de mensageria (a partir de 02/02/2026)
const MLB_AGENT_ID = '3037675074';

async function getTokenForConta(conta) {
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    const token = refreshed?.access_token || conta.accessToken;
    if (refreshed?.access_token) {
      await prisma.contaML.update({
        where: { id: conta.id },
        data: { accessToken: token }
      }).catch(() => {});
    }
    return token;
  } catch {
    return conta.accessToken;
  }
}

async function getContasDoUsuario(userId) {
  return prisma.contaML.findMany({
    where: { userId },
    select: { id: true, nickname: true, accessToken: true, refreshToken: true, expiresAt: true }
  });
}

export const mensagensController = {

  // GET /api/pos-venda/contas
  async getContas(req, res) {
    try {
      const userId = req.userId;
      const contas = await getContasDoUsuario(userId);
      res.json({ contas: contas.map(c => ({ id: c.id, nickname: c.nickname })) });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // GET /api/pos-venda/nao-lidas?contaId=xxx
  // Retorna conversas com mensagens não lidas de todas (ou uma) contas ML do usuário
  async getNaoLidas(req, res) {
    try {
      const userId = req.userId;
      const { contaId } = req.query;

      let contas = await getContasDoUsuario(userId);
      if (contaId) contas = contas.filter(c => c.id === contaId);
      if (contas.length === 0) return res.json({ conversas: [] });

      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      const todasConversas = [];

      for (const conta of contas) {
        try {
          const token = await getTokenForConta(conta);

          const resp = await axios.get(
            `${ML_API}/messages/unread?role=seller&tag=post_sale`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
          );

          const results = resp.data?.results || [];
          for (const item of results) {
            todasConversas.push({
              resource: item.resource,
              count: item.count,
              contaId: conta.id,
              nickname: conta.nickname,
            });
          }

          await delay(300);
        } catch (e) {
          console.error(`[pos-venda] Erro nao-lidas conta ${conta.nickname}:`, e.response?.data || e.message);
          if (e.response?.status === 429) await delay(2000);
        }
      }

      res.json({ conversas: todasConversas });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // GET /api/pos-venda/mensagens/:packId?contaId=xxx&markAsRead=true
  async getMensagens(req, res) {
    try {
      const userId = req.userId;
      const { packId } = req.params;
      const { contaId, markAsRead = 'true', limit = 50, offset = 0 } = req.query;

      const contas = await getContasDoUsuario(userId);
      const conta = contaId
        ? contas.find(c => c.id === contaId)
        : contas[0];

      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenForConta(conta);
      const sellerId = conta.id;

      const markParam = markAsRead === 'false' ? '&mark_as_read=false' : '';
      const url = `${ML_API}/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale&limit=${limit}&offset=${offset}${markParam}`;

      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });

      res.json({
        ...resp.data,
        sellerId,
        contaId: conta.id,
        nickname: conta.nickname,
      });
    } catch (error) {
      const mlStatus = error.response?.status;
      const status = (mlStatus === 401 || mlStatus === 403) ? 502 : (mlStatus || 500);
      res.status(status).json({ erro: error.response?.data?.message || error.message });
    }
  },

  // POST /api/pos-venda/mensagens/:packId/enviar
  // Body: { contaId, texto, attachments? }
  async enviarMensagem(req, res) {
    try {
      const userId = req.userId;
      const { packId } = req.params;
      const { contaId, texto, attachments } = req.body;

      if (!texto?.trim()) return res.status(400).json({ erro: 'Texto da mensagem é obrigatório' });
      if (texto.trim().length > 350) return res.status(400).json({ erro: 'Mensagem excede 350 caracteres' });

      const contas = await getContasDoUsuario(userId);
      const conta = contaId
        ? contas.find(c => c.id === contaId)
        : contas[0];

      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenForConta(conta);
      const sellerId = conta.id;

      const body = {
        from: { user_id: sellerId },
        to: { user_id: MLB_AGENT_ID },   // Nova arquitetura: enviar para o Agente MLB
        text: texto.trim(),
      };

      if (attachments && attachments.length > 0) {
        body.attachments = attachments;
      }

      const resp = await axios.post(
        `${ML_API}/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`,
        body,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      res.json(resp.data);
    } catch (error) {
      const mlStatus = error.response?.status;
      const status = (mlStatus === 401 || mlStatus === 403) ? 502 : (mlStatus || 500);
      const mlMsg = error.response?.data?.message || error.response?.data?.code || error.message;
      res.status(status).json({ erro: mlMsg, detalhes: error.response?.data });
    }
  },

  // GET /api/pos-venda/pedidos-recentes?contaId=xxx&limite=50&apenasComMensagens=true
  // Lista pedidos recentes; quando apenasComMensagens=true verifica em lote quais têm mensagens
  async getPedidosRecentes(req, res) {
    try {
      const userId = req.userId;
      const { contaId, limite = 50, apenasComMensagens = 'false' } = req.query;
      const filtrarMensagens = apenasComMensagens === 'true';

      const contas = await getContasDoUsuario(userId);
      const conta = contaId ? contas.find(c => c.id === contaId) : contas[0];
      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenForConta(conta);
      const sellerId = conta.id;
      const headers = { Authorization: `Bearer ${token}` };

      const resp = await axios.get(
        `${ML_API}/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc&limit=${limite}`,
        { headers, timeout: 15000 }
      );

      const results = resp.data?.results || [];
      let pedidos = results.map(o => ({
        orderId: o.id,
        packId: o.pack_id || o.id,
        status: o.status,
        dataCriacao: o.date_created,
        titulo: o.order_items?.[0]?.item?.title || '—',
        comprador: o.buyer?.nickname || o.buyer?.id || '—',
        total: o.total_amount,
        moeda: o.currency_id,
        contaId: conta.id,
        nickname: conta.nickname,
        temMensagem: null, // será preenchido abaixo se solicitado
      }));

      // ── Verificação em lote (máx 5 paralelos) quando filtro ativo ──
      if (filtrarMensagens) {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        const BATCH = 5;

        for (let i = 0; i < pedidos.length; i += BATCH) {
          const lote = pedidos.slice(i, i + BATCH);
          await Promise.all(lote.map(async (p) => {
            try {
              const r = await axios.get(
                `${ML_API}/messages/packs/${p.packId}/sellers/${sellerId}?tag=post_sale&mark_as_read=false&limit=1`,
                { headers, timeout: 8000 }
              );
              const total = r.data?.paging?.total ?? r.data?.messages?.length ?? 0;
              p.temMensagem = total > 0;
            } catch (e) {
              const status = e.response?.status;
              console.error(`[filtro-msg] pack=${p.packId} status=${status}`, e.response?.data?.message || e.message);
              // 404 = pack sem mensagens; outros erros = ignorar pedido (não mostrar)
              p.temMensagem = false;
            }
          }));
          if (i + BATCH < pedidos.length) await delay(350);
        }

        pedidos = pedidos.filter(p => p.temMensagem === true);
      }

      res.json({ pedidos });
    } catch (error) {
      const mlStatus = error.response?.status;
      // Não repassar 401/403 do ML como nosso 401 — evita logout automático no frontend
      const status = (mlStatus === 401 || mlStatus === 403) ? 502 : (mlStatus || 500);
      const msg = mlStatus === 401
        ? 'Token ML expirado. Reconecte sua conta Mercado Livre nas Configurações.'
        : (error.response?.data?.message || error.message);
      res.status(status).json({ erro: msg });
    }
  },

  // GET /api/pos-venda/action-guide/:packId?contaId=xxx
  // Retorna os motivos disponíveis para iniciar conversa (Fulfillment/ME2)
  async getActionGuide(req, res) {
    try {
      const userId = req.userId;
      const { packId } = req.params;
      const { contaId } = req.query;

      const contas = await getContasDoUsuario(userId);
      const conta = contaId ? contas.find(c => c.id === contaId) : contas[0];
      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenForConta(conta);

      const resp = await axios.get(
        `${ML_API}/messages/action_guide/packs/${packId}?tag=post_sale`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );

      res.json(resp.data);
    } catch (error) {
      const mlStatus = error.response?.status;
      const status = (mlStatus === 401 || mlStatus === 403) ? 502 : (mlStatus || 500);
      res.status(status).json({ erro: error.response?.data?.message || error.message, detalhes: error.response?.data });
    }
  },

  // POST /api/pos-venda/action-guide/:packId/option
  // Body: { contaId, option_id, text?, template_id? }
  async enviarActionGuide(req, res) {
    try {
      const userId = req.userId;
      const { packId } = req.params;
      const { contaId, option_id, text, template_id } = req.body;

      if (!option_id) return res.status(400).json({ erro: 'option_id é obrigatório' });

      const contas = await getContasDoUsuario(userId);
      const conta = contaId ? contas.find(c => c.id === contaId) : contas[0];
      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenForConta(conta);

      const body = { option_id };
      if (text) body.text = text;
      if (template_id) body.template_id = template_id;

      const resp = await axios.post(
        `${ML_API}/messages/action_guide/packs/${packId}/option?tag=post_sale`,
        body,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      res.json(resp.data);
    } catch (error) {
      const mlStatus = error.response?.status;
      const status = (mlStatus === 401 || mlStatus === 403) ? 502 : (mlStatus || 500);
      res.status(status).json({ erro: error.response?.data?.message || error.message, detalhes: error.response?.data });
    }
  },

  // GET /api/pos-venda/pedido/:packId?contaId=xxx
  // Busca dados do pedido a partir do packId: GET /packs/{id} → GET /orders/{orderId} → GET /items/{itemId}
  async getPedido(req, res) {
    try {
      const userId = req.userId;
      const { packId } = req.params;
      const { contaId } = req.query;

      const contas = await getContasDoUsuario(userId);
      const conta = contaId ? contas.find(c => c.id === contaId) : contas[0];
      if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada' });

      const token = await getTokenForConta(conta);
      const headers = { Authorization: `Bearer ${token}` };

      // 1) Busca o pack para obter os IDs das orders
      let orderId = null;
      try {
        const packResp = await axios.get(`${ML_API}/packs/${packId}`, { headers, timeout: 10000 });
        // Resposta: { orders: [{id: ...}, ...], ... }
        orderId = packResp.data?.orders?.[0]?.id ?? null;
      } catch {
        // packId pode já ser um order_id diretamente
        orderId = packId;
      }

      if (!orderId) return res.json({ pedido: null });

      // 2) Busca os detalhes completos da order
      let orderData = null;
      try {
        const orderResp = await axios.get(`${ML_API}/orders/${orderId}`, { headers, timeout: 10000 });
        orderData = orderResp.data;
      } catch {
        return res.json({ pedido: null });
      }

      const orderItem = orderData.order_items?.[0];
      const itemId = orderItem?.item?.id;

      // 3) Busca thumbnail e permalink do item (a order não os retorna)
      let thumbnail = null;
      let permalink = null;
      if (itemId) {
        try {
          const itemResp = await axios.get(
            `${ML_API}/items/${itemId}?attributes=thumbnail,permalink`,
            { headers, timeout: 8000 }
          );
          thumbnail = itemResp.data?.thumbnail || null;
          permalink = itemResp.data?.permalink || null;
        } catch {}
      }

      const buyer = orderData.buyer;

      res.json({
        pedido: {
          orderId,
          packId,
          status: orderData.status,
          dataCriacao: orderData.date_created,
          comprador: buyer ? { id: buyer.id, nome: buyer.nickname || String(buyer.id) } : null,
          produto: orderItem ? {
            id: itemId,
            titulo: orderItem.item?.title,
            quantidade: orderItem.quantity,
            preco: orderItem.unit_price,
            thumbnail,
            permalink,
          } : null,
          total: orderData.total_amount,
          moeda: orderData.currency_id,
        }
      });
    } catch (error) {
      const status = error.response?.status || 500;
      res.status(status).json({ erro: error.response?.data?.message || error.message });
    }
  },
};
