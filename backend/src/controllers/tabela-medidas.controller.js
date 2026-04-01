// =====================================================================
// backend/src/controllers/tabela-medidas.controller.js
// =====================================================================
// Controller para Tabela de Medidas (Fashion Size Charts) — Mercado Livre
// API: https://api.mercadolibre.com/catalog/charts
// =====================================================================

import axios from 'axios';
import prisma from '../config/prisma.js';
import { mlService } from '../services/ml.service.js';

const ML_BASE = 'https://api.mercadolibre.com';

// ── Helper: obtém token ativo e faz refresh se necessário ──────────
async function getActiveToken(contaId, userId) {
  const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
  if (!conta) throw new Error('Conta ML não encontrada ou não pertence ao usuário.');

  let activeToken = conta.accessToken;
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    if (refreshed?.access_token) {
      activeToken = refreshed.access_token;
      await prisma.contaML.update({
        where: { id: contaId },
        data: {
          accessToken: activeToken,
          refreshToken: refreshed.refresh_token || conta.refreshToken,
          expiresAt: BigInt(Date.now() + (refreshed.expires_in || 21600) * 1000),
        },
      });
    }
  } catch (_) { /* usa token existente */ }
  return activeToken;
}

// ── Helper: retorna seller_id da conta ────────────────────────────
async function getSellerId(contaId, userId) {
  const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId }, select: { id: true } });
  if (!conta?.id) throw new Error('seller_id não encontrado para esta conta.');
  return conta.id;
}

export const tabelaMedidasController = {

  // ==================================================================
  // GET /api/tabela-medidas/dominios-ativos
  //   ?contaId=...&userId=...&siteId=MLB
  //   → GET /catalog/charts/:siteId/configurations/active_domains
  // ==================================================================
  async getDominiosAtivos(req, res) {
    try {
      const { contaId, userId, siteId = 'MLB' } = req.query;
      if (!contaId || !userId) return res.status(400).json({ erro: 'contaId e userId obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.get(
        `${ML_BASE}/catalog/charts/${siteId}/configurations/active_domains`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] getDominiosAtivos:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // POST /api/tabela-medidas/buscar
  //   Body: { contaId, userId, siteId, domainId, attributes, type, mainAttributeId, limit, offset }
  //   → POST /catalog/charts/search
  // ==================================================================
  async buscarTabelas(req, res) {
    try {
      const { contaId, userId, siteId = 'MLB', domainId, attributes = [], type, mainAttributeId, limit = 50, offset = 0 } = req.body;
      if (!contaId || !userId || !domainId) return res.status(400).json({ erro: 'contaId, userId e domainId obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const sellerId = await getSellerId(contaId, userId);

      const payload = { domain_id: domainId, site_id: siteId, seller_id: Number(sellerId) };
      // A ML API retorna "Filters validation errors found" se attributes vier como array vazio.
      // Só inclui o campo quando houver pelo menos um atributo de filtro.
      if (attributes && attributes.length > 0) payload.attributes = attributes;
      if (type) payload.type = type;
      if (mainAttributeId) payload.main_attribute_id = mainAttributeId;

      const { data } = await axios.post(
        `${ML_BASE}/catalog/charts/search?offset=${offset}&limit=${limit}`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-caller-id': String(sellerId) }, timeout: 20000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] buscarTabelas:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // GET /api/tabela-medidas/:chartId
  //   ?contaId=...&userId=...
  //   → GET /catalog/charts/:chartId
  // ==================================================================
  async getTabela(req, res) {
    try {
      const { chartId } = req.params;
      const { contaId, userId } = req.query;
      if (!contaId || !userId) return res.status(400).json({ erro: 'contaId e userId obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.get(
        `${ML_BASE}/catalog/charts/${chartId}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] getTabela:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // POST /api/tabela-medidas
  //   Body: { contaId, userId, chart: { names, domain_id, site_id, main_attribute, attributes, rows, measure_type? } }
  //   → POST /catalog/charts
  // ==================================================================
  async criarTabela(req, res) {
    try {
      const { contaId, userId, chart } = req.body;
      if (!contaId || !userId || !chart) return res.status(400).json({ erro: 'contaId, userId e chart obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.post(
        `${ML_BASE}/catalog/charts`,
        chart,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 30000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] criarTabela:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // PUT /api/tabela-medidas/:chartId
  //   Body: { contaId, userId, names }
  //   → PUT /catalog/charts/:chartId  (só permite mudar o nome)
  // ==================================================================
  async renomearTabela(req, res) {
    try {
      const { chartId } = req.params;
      const { contaId, userId, names } = req.body;
      if (!contaId || !userId || !names) return res.status(400).json({ erro: 'contaId, userId e names obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.put(
        `${ML_BASE}/catalog/charts/${chartId}`,
        { names },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] renomearTabela:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // POST /api/tabela-medidas/:chartId/linhas
  //   Body: { contaId, userId, row: { attributes: [...] } }
  //   → POST /catalog/charts/:chartId/rows
  // ==================================================================
  async adicionarLinha(req, res) {
    try {
      const { chartId } = req.params;
      const { contaId, userId, row } = req.body;
      if (!contaId || !userId || !row) return res.status(400).json({ erro: 'contaId, userId e row obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.post(
        `${ML_BASE}/catalog/charts/${chartId}/rows`,
        row,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] adicionarLinha:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // PUT /api/tabela-medidas/:chartId/linhas/:rowId
  //   Body: { contaId, userId, row: { attributes: [...] } }
  //   → PUT /catalog/charts/:chartId/rows/:rowId
  // ==================================================================
  async modificarLinha(req, res) {
    try {
      const { chartId, rowId } = req.params;
      const { contaId, userId, row } = req.body;
      if (!contaId || !userId || !row) return res.status(400).json({ erro: 'contaId, userId e row obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.put(
        `${ML_BASE}/catalog/charts/${chartId}/rows/${rowId}`,
        row,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] modificarLinha:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // DELETE /api/tabela-medidas/:chartId
  //   ?contaId=...&userId=...
  //   → DELETE /catalog/charts/:chartId
  // ==================================================================
  async deletarTabela(req, res) {
    try {
      const { chartId } = req.params;
      const { contaId, userId } = req.query;
      if (!contaId || !userId) return res.status(400).json({ erro: 'contaId e userId obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.delete(
        `${ML_BASE}/catalog/charts/${chartId}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] deletarTabela:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

  // ==================================================================
  // POST /api/tabela-medidas/ficha-tecnica
  //   Body: { contaId, userId, domainId, attributes }
  //   → POST /domains/:domainId/technical_specs?section=grids
  // ==================================================================
  async getFichaTecnica(req, res) {
    try {
      const { contaId, userId, domainId, attributes = [] } = req.body;
      if (!contaId || !userId || !domainId) return res.status(400).json({ erro: 'contaId, userId e domainId obrigatórios.' });

      const token = await getActiveToken(contaId, userId);
      const { data } = await axios.post(
        `${ML_BASE}/domains/${domainId}/technical_specs?section=grids`,
        { attributes },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[tabela-medidas] getFichaTecnica:', err.message);
      res.status(err.response?.status || 500).json({ erro: err.message, detalhes: err.response?.data });
    }
  },

};
