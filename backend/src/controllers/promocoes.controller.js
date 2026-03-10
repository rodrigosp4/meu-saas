// backend/src/controllers/promocoes.controller.js
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function refreshContaToken(conta) {
  try {
    const res = await axios.post('https://api.mercadolibre.com/oauth/token', new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.mlAppId,
      client_secret: config.mlClientSecret,
      refresh_token: conta.refreshToken,
    }));
    const { access_token, refresh_token, expires_in } = res.data;
    const expiresAt = BigInt(Date.now() + (expires_in || 21600) * 1000);

    await prisma.contaML.update({
      where: { id: conta.id },
      data: { accessToken: access_token, refreshToken: refresh_token || conta.refreshToken, expiresAt },
    });
    return access_token;
  } catch {
    return conta.accessToken;
  }
}

// ✅ CORRIGIDO: Trata erro 500 e 404 da API do ML graciosamente
async function fetchPromoItems(promoId, tipo, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const allItems = [];
  let searchAfter = null;
  let offset = 0;

  for (let page = 0; page < 100; page++) { // max 100 pages = 5000 items
    try {
      const params = new URLSearchParams({ promotion_type: tipo, app_version: 'v2', limit: '50' });
      if (searchAfter) {
        params.set('search_after', searchAfter);
      } else if (offset > 0) {
        params.set('offset', offset.toString());
      }

      const res = await axios.get(
        `https://api.mercadolibre.com/seller-promotions/promotions/${promoId}/items?${params}`,
        { headers, timeout: 15000 }
      );

      const items = res.data.results || [];
      if (items.length > 0) allItems.push(...items);

      const paging = res.data.paging || {};
      searchAfter = paging.searchAfter || paging.search_after || null;

      if (searchAfter) {
        if (items.length === 0) break;
      } else {
        offset += 50;
        if (offset >= (paging.total || 0) || items.length === 0) break;
      }

      await delay(200);
    } catch (err) {
      if (err.response?.status === 500 || err.response?.status === 404) break; 
      console.error(`[PromoML] Erro ao buscar itens de ${promoId}:`, err.response?.data?.message || err.message);
      break;
    }
  }
  return allItems;
}async function fetchPromoItems(promoId, tipo, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const allItems = [];
  let searchAfter = null;
  let offset = 0;

  for (let page = 0; page < 100; page++) { // max 100 pages = 5000 items
    try {
      const params = new URLSearchParams({ promotion_type: tipo, app_version: 'v2', limit: '50' });
      if (searchAfter) {
        params.set('search_after', searchAfter);
      } else if (offset > 0) {
        params.set('offset', offset.toString());
      }

      const res = await axios.get(
        `https://api.mercadolibre.com/seller-promotions/promotions/${promoId}/items?${params}`,
        { headers, timeout: 15000 }
      );

      const items = res.data.results || [];
      if (items.length > 0) allItems.push(...items);

      const paging = res.data.paging || {};
      searchAfter = paging.searchAfter || paging.search_after || null;

      if (searchAfter) {
        if (items.length === 0) break;
      } else {
        offset += 50;
        if (offset >= (paging.total || 0) || items.length === 0) break;
      }

      await delay(200);
    } catch (err) {
      if (err.response?.status === 500 || err.response?.status === 404) break; 
      console.error(`[PromoML] Erro ao buscar itens de ${promoId}:`, err.response?.data?.message || err.message);
      break;
    }
  }
  return allItems;
}


export const promocoesController = {
  // ─── GET /api/promocoes ─────────────────────────────────────────────────────
  async getPromocoes(req, res) {
    try {
      const { userId, contaId, tipo, status, maxSellerPct, soComMargem } = req.query;

      const contasWhere = { userId };
      if (contaId) contasWhere.id = contaId;
      const contas = await prisma.contaML.findMany({ where: contasWhere, select: { id: true, nickname: true } });
      const allowedIds = contas.map(c => c.id);
      if (allowedIds.length === 0) return res.json({ results: [], total: 0 });

      const where = { contaId: { in: allowedIds } };
      if (tipo) where.tipo = tipo;
      if (status) where.status = status;

      const promos = await prisma.promoML.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
      });

      // Carrega IDs com margem promocional para filtro
      let idsMargem = null;
      if (soComMargem === 'true') {
        const anunciosComMargem = await prisma.anuncioML.findMany({
          where: { contaId: { in: allowedIds }, margemPromocional: true },
          select: { id: true },
        });
        idsMargem = new Set(anunciosComMargem.map(a => a.id));
      }

      const contaMap = Object.fromEntries(contas.map(c => [c.id, c.nickname]));
      const maxPct = maxSellerPct ? parseFloat(maxSellerPct) : null;

      const results = promos.map(p => {
        let itens = Array.isArray(p.itens) ? p.itens : [];

        if (maxPct !== null) {
          itens = itens.filter(item => {
            const sp = item.seller_percentage ?? item.sellerPercentage ?? null;
            return sp === null || sp <= maxPct;
          });
        }

        if (idsMargem !== null) {
          itens = itens.filter(item => idsMargem.has(item.id));
        }

        let maxSeller = null;
        let minSeller = null;
        for (const item of itens) {
          const sp = item.seller_percentage ?? item.sellerPercentage ?? null;
          if (sp !== null) {
            if (maxSeller === null || sp > maxSeller) maxSeller = sp;
            if (minSeller === null || sp < minSeller) minSeller = sp;
          }
        }

        return {
          id: p.id,
          contaId: p.contaId,
          contaNickname: contaMap[p.contaId] || p.contaId,
          tipo: p.tipo,
          status: p.status,
          nome: p.nome,
          startDate: p.startDate,
          finishDate: p.finishDate,
          fetchedAt: p.fetchedAt,
          itens,
          totalItens: itens.length,
          maxSellerPct: maxSeller,
          minSellerPct: minSeller,
          dadosML: p.dadosML,
        };
      }).filter(p => {
        if (maxPct !== null && p.itens.length === 0) return false;
        if (idsMargem !== null && p.itens.length === 0) return false;
        return true;
      });

      res.json({ results, total: results.length });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar promoções', detalhes: err.message });
    }
  },

  // ─── POST /api/promocoes/sync (✅ CORRIGIDO & OTIMIZADO) ────────────────────
  async syncPromocoes(req, res) {
    try {
      const { userId, contaId } = req.body;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const contasWhere = { userId };
      if (contaId) contasWhere.id = contaId;
      const contas = await prisma.contaML.findMany({ where: contasWhere });

      if (contas.length === 0) return res.status(404).json({ erro: 'Nenhuma conta encontrada' });

      let totalSynced = 0;
      const errors = [];

      for (const conta of contas) {
        try {
          const token = await refreshContaToken(conta);
          const headers = { Authorization: `Bearer ${token}` };

          let allPromos = [];
          let offset = 0;
          const limit = 50;

          while (true) {
            const res2 = await axios.get(
              `https://api.mercadolibre.com/seller-promotions/users/${conta.id}?app_version=v2&limit=${limit}&offset=${offset}`,
              { headers, timeout: 15000 }
            );
            const batch = res2.data.results || [];
            allPromos.push(...batch);
            const paging = res2.data.paging || {};
            if (offset + limit >= (paging.total || 0) || batch.length === 0) break;
            offset += limit;
            await delay(300);
          }

          console.log(`[PromoML] Conta ${conta.nickname}: ${allPromos.length} promoções encontradas.`);

          for (const promo of allPromos) {
            try {
              // ✅ OTIMIZAÇÃO: Não busca itens de campanhas finalizadas para poupar API
              let items = [];
              if (promo.status === 'started' || promo.status === 'pending') {
                items = await fetchPromoItems(promo.id, promo.type, token);
                await delay(200);
              } else {
                const existente = await prisma.promoML.findUnique({ where: { id_contaId: { id: promo.id, contaId: conta.id } } });
                items = existente?.itens || [];
              }

              await prisma.promoML.upsert({
                where: { id_contaId: { id: promo.id, contaId: conta.id } },
                create: {
                  id: promo.id,
                  contaId: conta.id,
                  tipo: promo.type,
                  sub_type: promo.sub_type || null, // ✅ NOVO
                  status: promo.status,
                  nome: promo.name || null,
                  startDate: promo.start_date ? new Date(promo.start_date) : null,
                  finishDate: promo.finish_date ? new Date(promo.finish_date) : null,
                  deadline_date: promo.deadline_date ? new Date(promo.deadline_date) : null, // ✅ NOVO
                  itens: items,
                  benefits: promo.benefits || null, // ✅ NOVO
                  dadosML: promo,
                },
                update: {
                  tipo: promo.type,
                  sub_type: promo.sub_type || null, // ✅ NOVO
                  status: promo.status,
                  nome: promo.name || null,
                  startDate: promo.start_date ? new Date(promo.start_date) : null,
                  finishDate: promo.finish_date ? new Date(promo.finish_date) : null,
                  deadline_date: promo.deadline_date ? new Date(promo.deadline_date) : null, // ✅ NOVO
                  itens: items,
                  benefits: promo.benefits || null, // ✅ NOVO
                  dadosML: promo,
                  fetchedAt: new Date(),
                },
              });

              totalSynced++;
            } catch (promoErr) {
              errors.push({ promoId: promo.id, erro: promoErr.message });
            }
          }
          // ── Backfill: busca candidatos via endpoint por item ──────────────
          // O endpoint /promotions/{id}/items não retorna candidatos em DEAL/SELLER_CAMPAIGN.
          // Usamos /seller-promotions/items/{itemId} para descobri-los e inserir no banco.
          try {
            const anunciosDB = await prisma.anuncioML.findMany({
              where: { contaId: conta.id },
              select: { id: true },
            });

            for (const anuncio of anunciosDB) {
              try {
                const itemRes = await axios.get(
                  `https://api.mercadolibre.com/seller-promotions/items/${anuncio.id}?app_version=v2`,
                  { headers, timeout: 10000 }
                );
                const memberships = Array.isArray(itemRes.data)
                  ? itemRes.data
                  : (itemRes.data?.results || []);

                for (const m of memberships) {
                  // ✅ CORREÇÃO: A API de itens envia 'id' em vez de 'promotion_id' para os Cupons
                  const promoId = m.promotion_id || m.id;
                  if (!promoId) continue;

                  const promoRecord = await prisma.promoML.findUnique({
                    where: { id_contaId: { id: promoId, contaId: conta.id } },
                  });

                  if (promoRecord && Array.isArray(promoRecord.itens)) {
                    const jaExiste = promoRecord.itens.some(i => i.id === anuncio.id);
                    if (!jaExiste) {
                      await prisma.promoML.update({
                        where: { id_contaId: { id: promoId, contaId: conta.id } },
                        data: {
                          itens: [...promoRecord.itens, {
                            id: anuncio.id,
                            status: m.status || 'candidate',
                            original_price: m.original_price ?? null,
                            deal_price: m.deal_price ?? null,
                            top_deal_price: m.top_deal_price ?? null,
                            seller_percentage: m.seller_percentage ?? null,
                            meli_percentage: m.meli_percentage ?? null,
                            offer_id: m.offer_id ?? null,
                          }],
                        },
                      });
                      console.log(`[PromoML] Candidato ${anuncio.id} adicionado à promo ${promoId}`);
                    }
                  }
                }
                await delay(300);
              } catch (_) { /* item sem promoções — ignorar */ }
            }
          } catch (_) { /* backfill falhou — não bloqueia resposta */ }

        } catch (contaErr) {
          errors.push({ contaId: conta.id, erro: contaErr.message });
        }
      }

      res.json({ ok: true, totalSynced, errors });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao sincronizar promoções', detalhes: err.message });
    }
  },

  // ─── POST /api/promocoes/campanha-vendedor ──────────────────────────────────
  async criarCampanhaVendedor(req, res) {
    try {
      const { contaId, userId, nome, startDate, finishDate, itens } = req.body;
      if (!contaId || !userId || !nome || !startDate || !finishDate) {
        return res.status(400).json({ erro: 'Campos obrigatórios: contaId, userId, nome, startDate, finishDate' });
      }

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });

      const token = await refreshContaToken(conta);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const campRes = await axios.post(
        'https://api.mercadolibre.com/seller-promotions/promotions?app_version=v2',
        {
          promotion_type: 'SELLER_CAMPAIGN', name: nome, sub_type: 'FLEXIBLE_PERCENTAGE',
          start_date: startDate, finish_date: finishDate,
        },
        { headers, timeout: 15000 }
      );

      const campanha = campRes.data;
      const campaignId = campanha.id;

      const resultItens = [];
      for (const item of (itens || [])) {
        try {
          const itemRes = await axios.post(
            `https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`,
            {
              promotion_id: campaignId, promotion_type: 'SELLER_CAMPAIGN',
              deal_price: item.dealPrice,
              ...(item.topDealPrice ? { top_deal_price: item.topDealPrice } : {}),
            },
            { headers, timeout: 10000 }
          );
          resultItens.push({ itemId: item.itemId, ok: true, data: itemRes.data });
          await delay(200);
        } catch (itemErr) {
          resultItens.push({ itemId: item.itemId, ok: false, erro: itemErr.response?.data || itemErr.message });
        }
      }

      res.json({ ok: true, campanha, resultItens });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar campanha', detalhes: err.response?.data || err.message });
    }
  },
  
  // ✅ NOVO: DELETE /api/promocoes/massivo (Remove todas as promoções de um item)
  async deleteOfertasMassivo(req, res) {
    try {
      const { itemId, contaId, userId } = req.body;
      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });
  
      const token = await refreshContaToken(conta);
      
      const response = await axios.delete(
        `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      res.json({ ok: true, message: 'Solicitação de remoção enviada.', data: response.data });
    } catch (err) {
      res.status(err.response?.status || 500).json({ erro: 'Erro no delete massivo', detalhes: err.response?.data || err.message });
    }
  },

  // ✅ NOVO: POST /api/promocoes/exclusao (Proteger Anúncio de Promos Automáticas)
  async gerenciarExclusaoItem(req, res) {
    try {
      const { itemId, contaId, userId, excluir } = req.body;
      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });

      const token = await refreshContaToken(conta);

      const response = await axios.post(
        `https://api.mercadolibre.com/seller-promotions/exclusion-list/item?app_version=v2`,
        {
            item_id: itemId,
            exclusion_status: excluir ? "true" : "false" // A API espera uma string "true" ou "false"
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const message = excluir ? `Item ${itemId} protegido de promoções automáticas.` : `Item ${itemId} liberado para promoções automáticas.`;
      res.json({ ok: true, message, data: response.data });
    } catch (err) {
      res.status(err.response?.status || 500).json({ erro: 'Erro ao gerenciar lista de exclusão', detalhes: err.response?.data || err.message });
    }
  },

  // ─── POST /api/promocoes/ativar-item ────────────────────────────────────────
  async ativarItem(req, res) {
    try {
      const { contaId, userId, itemId, promoId, promoTipo, offerId, dealPrice, topDealPrice, stock } = req.body;
      if (!contaId || !userId || !itemId || !promoId || !promoTipo) {
        return res.status(400).json({ erro: 'Campos obrigatórios: contaId, userId, itemId, promoId, promoTipo' });
      }

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });

      const token = await refreshContaToken(conta);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const body = { promotion_id: promoId, promotion_type: promoTipo };
      if (offerId) body.offer_id = offerId;
      if (dealPrice != null) body.deal_price = parseFloat(dealPrice);
      if (topDealPrice != null) body.top_deal_price = parseFloat(topDealPrice);
      if (stock != null) body.stock = parseInt(stock);

      const response = await axios.post(
        `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`,
        body,
        { headers, timeout: 10000 }
      );

      // Atualiza status do item no banco local para evitar exibir "Ativar" novamente
      try {
        const promoRecord = await prisma.promoML.findUnique({
          where: { id_contaId: { id: promoId, contaId } },
        });
        if (promoRecord && Array.isArray(promoRecord.itens)) {
          const newStatus = promoRecord.status === 'started' ? 'started' : 'pending';
          const updatedItens = promoRecord.itens.map(i =>
            i.id === itemId ? { ...i, status: newStatus } : i
          );
          await prisma.promoML.update({
            where: { id_contaId: { id: promoId, contaId } },
            data: { itens: updatedItens },
          });
        }
      } catch (_) { /* não bloquear a resposta se falhar */ }

      res.json({ ok: true, data: response.data });
    } catch (err) {
      res.status(err.response?.status || 500).json({
        erro: err.response?.data?.message || err.response?.data?.cause?.[0]?.error_message || 'Erro ao ativar item',
        detalhes: err.response?.data || err.message,
      });
    }
  },

  // ─── POST /api/promocoes/remover-item ───────────────────────────────────────
  async removerItemPromo(req, res) {
    try {
      const { contaId, userId, itemId, promoId, promoTipo, offerId } = req.body;
      if (!contaId || !userId || !itemId || !promoTipo) {
        return res.status(400).json({ erro: 'Campos obrigatórios: contaId, userId, itemId, promoTipo' });
      }

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });

      const token = await refreshContaToken(conta);

      const params = new URLSearchParams({ promotion_type: promoTipo, app_version: 'v2' });
      if (promoId) params.set('promotion_id', promoId);
      if (offerId) params.set('offer_id', offerId);

      await axios.delete(
        `https://api.mercadolibre.com/seller-promotions/items/${itemId}?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Remove item do banco local para não exibir mais
      if (promoId) {
        try {
          const promoRecord = await prisma.promoML.findUnique({
            where: { id_contaId: { id: promoId, contaId } },
          });
          if (promoRecord && Array.isArray(promoRecord.itens)) {
            await prisma.promoML.update({
              where: { id_contaId: { id: promoId, contaId } },
              data: { itens: promoRecord.itens.filter(i => i.id !== itemId) },
            });
          }
        } catch (_) { /* não bloquear a resposta */ }
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(err.response?.status || 500).json({
        erro: err.response?.data?.message || 'Erro ao remover item',
        detalhes: err.response?.data || err.message,
      });
    }
  },

  // ─── GET /api/orquestrador/regras ───────────────────────────────────────────
  async getRegras(req, res) {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const regras = await prisma.regraOrquestrador.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      res.json(regras);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar regras', detalhes: err.message });
    }
  },

  // ─── POST /api/orquestrador/regras ──────────────────────────────────────────
  async salvarRegras(req, res) {
    try {
      const { userId, regras } = req.body;
      if (!userId || !Array.isArray(regras)) return res.status(400).json({ erro: 'userId e regras são obrigatórios' });

      // Delete existing and recreate (simple upsert strategy)
      await prisma.regraOrquestrador.deleteMany({ where: { userId } });
      const created = await prisma.regraOrquestrador.createMany({
        data: regras.map(r => ({
          userId,
          nome: r.nome || 'Regra',
          tiposPermitidos: r.tiposPermitidos || ['MARKETPLACE_CAMPAIGN'],
          maxSellerPct: parseFloat(r.maxSellerPct) || 30,
          tolerancia: parseFloat(r.tolerancia) || 0,
          ativo: r.ativo !== false,
        })),
      });
      res.json({ ok: true, count: created.count });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao salvar regras', detalhes: err.message });
    }
  },

  // ─── POST /api/orquestrador/executar ────────────────────────────────────────
  async executarOrquestrador(req, res) {
    try {
      const { userId, contaId, regras: regrasBody } = req.body;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      // Load regras from body or DB
      let regras = regrasBody;
      if (!regras || !Array.isArray(regras) || regras.length === 0) {
        regras = await prisma.regraOrquestrador.findMany({ where: { userId, ativo: true } });
      }
      if (!regras || regras.length === 0) {
        return res.status(400).json({ erro: 'Nenhuma regra ativa encontrada. Configure as regras primeiro.' });
      }

      // Get accounts
      const contasWhere = { userId };
      if (contaId) contasWhere.id = contaId;
      const contas = await prisma.contaML.findMany({ where: contasWhere });
      if (contas.length === 0) return res.status(404).json({ erro: 'Nenhuma conta encontrada' });

      const joined = [];
      const skipped = [];
      const errors = [];

      for (const regra of regras) {
        const tipos = regra.tiposPermitidos || regra.tipos_permitidos || [];
        const maxPct = parseFloat(regra.maxSellerPct || regra.max_seller_pct) || 30;
        const tolerancia = parseFloat(regra.tolerancia) || 0;
        const limiteMax = maxPct + tolerancia;

        // Get stored promotions matching this rule's types
        const promos = await prisma.promoML.findMany({
          where: {
            contaId: { in: contas.map(c => c.id) },
            tipo: { in: tipos },
            status: { in: ['started', 'pending'] },
          },
        });

        // Build token cache
        const tokenCache = {};
        for (const conta of contas) {
          tokenCache[conta.id] = { token: conta.accessToken, conta };
        }

        for (const promo of promos) {
          const contaEntry = tokenCache[promo.contaId];
          if (!contaEntry) continue;

          // Refresh token lazily
          if (!contaEntry.refreshed) {
            contaEntry.token = await refreshContaToken(contaEntry.conta);
            contaEntry.refreshed = true;
          }

          const items = Array.isArray(promo.itens) ? promo.itens : [];
          const candidates = items.filter(item => {
            if (item.status !== 'candidate') return false;
            const sp = item.seller_percentage ?? item.sellerPercentage ?? null;
            if (sp === null) return true; // join if no % info (e.g. DEAL items)
            return sp <= limiteMax;
          });

          for (const item of candidates) {
            try {
              const headers = { Authorization: `Bearer ${contaEntry.token}`, 'Content-Type': 'application/json' };
              const body = {
                promotion_id: promo.id,
                promotion_type: promo.tipo,
              };
              if (item.offer_id) body.offer_id = item.offer_id;

              await axios.post(
                `https://api.mercadolibre.com/seller-promotions/items/${item.id}?app_version=v2`,
                body,
                { headers, timeout: 10000 }
              );

              joined.push({ promoId: promo.id, itemId: item.id, tipo: promo.tipo, sellerPct: item.seller_percentage });
              await delay(200);
            } catch (joinErr) {
              errors.push({
                promoId: promo.id,
                itemId: item.id,
                erro: joinErr.response?.data?.message || joinErr.message,
              });
            }
          }

          const nonCandidates = items.filter(i => i.status !== 'candidate');
          skipped.push(...nonCandidates.map(i => ({ promoId: promo.id, itemId: i.id, motivo: `status: ${i.status}` })));
        }
      }

      res.json({ ok: true, joined: joined.length, skipped: skipped.length, errors: errors.length, detalhes: { joined, errors } });
    } catch (err) {
      console.error('[PromoML] executarOrquestrador error:', err);
      res.status(500).json({ erro: 'Erro ao executar orquestrador', detalhes: err.message });
    }
  },
};
