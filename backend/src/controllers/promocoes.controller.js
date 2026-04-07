// backend/src/controllers/promocoes.controller.js
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { promoQueue } from '../workers/queue.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Verifica se dealPrice viola o limite do item: gordura (inflarPct) + excedente (toleranciaPromo).
// Só bloqueia se o item tiver gordura configurada (inflarPct > 0).
// Retorna mensagem de erro ou null se estiver dentro do limite / sem dados suficientes.
async function verificarLimiteDescontoItem(itemId, dealPrice, originalPrice) {
  if (dealPrice == null || !originalPrice || originalPrice <= 0) return null;
  const anuncio = await prisma.anuncioML.findFirst({
    where: { id: itemId },
    select: { inflarPct: true, toleranciaPromo: true },
  });
  if (!anuncio || (anuncio.inflarPct || 0) === 0) return null; // sem gordura definida, não bloqueia
  const limiteItem = (anuncio.inflarPct || 0) + (anuncio.toleranciaPromo || 0);
  const pct = (1 - parseFloat(dealPrice) / parseFloat(originalPrice)) * 100;
  if (pct > limiteItem) {
    return `Desconto de ${pct.toFixed(1)}% excede o limite do item (gordura ${anuncio.inflarPct}% + excedente ${anuncio.toleranciaPromo}% = ${limiteItem}%)`;
  }
  return null;
}

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

  // ─── POST /api/promocoes/sync ────────────────────────────────────────────────
  async syncPromocoes(req, res) {
    try {
      const { userId, contaId, forceSync } = req.body;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      // Scoped to userId — never leaks between users
      const contasWhere = { userId };
      if (contaId) contasWhere.id = contaId;
      const contas = await prisma.contaML.findMany({ where: contasWhere });

      if (contas.length === 0) return res.status(404).json({ erro: 'Nenhuma conta encontrada' });

      // Cria tarefa para acompanhamento via polling
      const tarefa = await prisma.tarefaFila.create({
        data: { userId, tipo: 'PROMO_SYNC', status: 'PROCESSANDO', detalhes: '[0%] Iniciando...' },
      });

      // Responde imediatamente com o tarefaId — processamento ocorre em background
      res.json({ ok: true, tarefaId: tarefa.id });

      // ── Processamento em background ──────────────────────────────────────────
      (async () => {
        const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas
        let totalSynced = 0;
        let totalFromCache = 0;
        const errors = [];

        const updateProgresso = (pct, msg) =>
          prisma.tarefaFila.update({ where: { id: tarefa.id }, data: { detalhes: `[${pct}%] ${msg}` } }).catch(() => {});

        try {
          // Fase 1: coleta listagem de promoções de todas as contas (rápido, sem buscar itens)
          await updateProgresso(0, 'Coletando lista de promoções...');
          const promosPorConta = []; // [{ conta, token, promos[] }]

          for (const conta of contas) {
            const token = await refreshContaToken(conta);
            const headers = { Authorization: `Bearer ${token}` };
            let allPromos = [];
            let offset = 0;
            const limit = 50;
            while (true) {
              const r = await axios.get(
                `https://api.mercadolibre.com/seller-promotions/users/${conta.id}?app_version=v2&limit=${limit}&offset=${offset}`,
                { headers, timeout: 15000 }
              );
              const batch = r.data.results || [];
              allPromos.push(...batch);
              const paging = r.data.paging || {};
              if (offset + limit >= (paging.total || 0) || batch.length === 0) break;
              offset += limit;
              await delay(300);
            }
            console.log(`[PromoML] Conta ${conta.nickname}: ${allPromos.length} promoções encontradas.`);
            promosPorConta.push({ conta, token, promos: allPromos });
          }

          const totalPromos = promosPorConta.reduce((s, c) => s + c.promos.length, 0);
          let processado = 0;

          // Fase 2: processa cada promoção com progresso real
          for (const { conta, token, promos } of promosPorConta) {
            for (const promo of promos) {
              try {
                let items = [];
                const existente = await prisma.promoML.findUnique({
                  where: { id_contaId: { id: promo.id, contaId: conta.id } },
                });

                const statusAtivo = promo.status === 'started' || promo.status === 'pending';

                if (!statusAtivo) {
                  items = existente?.itens || [];
                  console.log(`[PromoML]   ${promo.id} (${promo.type}) — finalizada, usando banco`);
                } else {
                  const statusMudou = existente?.status !== promo.status;
                  const cacheExpirado = !existente?.fetchedAt ||
                    (Date.now() - new Date(existente.fetchedAt).getTime()) > CACHE_TTL_MS;

                  if (!forceSync && !statusMudou && !cacheExpirado) {
                    items = existente.itens || [];
                    totalFromCache++;
                    console.log(`[PromoML]   ${promo.id} (${promo.type}) — cache válido (${items.length} itens)`);
                  } else {
                    const motivo = forceSync ? 'forceSync' : statusMudou ? 'status mudou' : 'cache expirado';
                    console.log(`[PromoML]   ${promo.id} (${promo.type}) — buscando itens via API [${motivo}]...`);
                    items = await fetchPromoItems(promo.id, promo.type, token);
                    console.log(`[PromoML]   ${promo.id} — ${items.length} itens carregados`);
                    await delay(200);

                    // Campanhas com preço: o endpoint bulk frequentemente não retorna suggested/max_discounted_price.
                    // Enriquecer candidatos via GET /seller-promotions/items/{itemId} para ter o dealPrice no orquestrador.
                    const TIPOS_COM_PRECO = ['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING'];
                    if (TIPOS_COM_PRECO.includes(promo.type) && items.length > 0) {
                      const needsEnrich = items.filter(i => i.status === 'candidate' && i.suggested_discounted_price == null);
                      for (const candidate of needsEnrich) {
                        try {
                          const r = await axios.get(
                            `https://api.mercadolibre.com/seller-promotions/items/${candidate.id}?app_version=v2`,
                            { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
                          );
                          const allPromos = Array.isArray(r.data) ? r.data : [r.data];
                          const match = allPromos.find(p => p.id === promo.id);
                          if (match) {
                            if (match.suggested_discounted_price != null) candidate.suggested_discounted_price = match.suggested_discounted_price;
                            if (match.max_discounted_price != null) candidate.max_discounted_price = match.max_discounted_price;
                            if (match.min_discounted_price != null) candidate.min_discounted_price = match.min_discounted_price;
                          }
                        } catch (_) { /* silently skip enrichment errors */ }
                        await delay(150);
                      }
                      if (needsEnrich.length > 0) console.log(`[PromoML]   ${promo.id} — enriquecidos ${needsEnrich.length} candidatos SELLER_CAMPAIGN com preços sugeridos`);
                    }
                  }
                }

                await prisma.promoML.upsert({
                  where: { id_contaId: { id: promo.id, contaId: conta.id } },
                  create: {
                    id: promo.id, contaId: conta.id, tipo: promo.type,
                    sub_type: promo.sub_type || null, status: promo.status,
                    nome: promo.name || null,
                    startDate: promo.start_date ? new Date(promo.start_date) : null,
                    finishDate: promo.finish_date ? new Date(promo.finish_date) : null,
                    deadline_date: promo.deadline_date ? new Date(promo.deadline_date) : null,
                    itens: items, benefits: promo.benefits || null, dadosML: promo,
                  },
                  update: {
                    tipo: promo.type, sub_type: promo.sub_type || null, status: promo.status,
                    nome: promo.name || null,
                    startDate: promo.start_date ? new Date(promo.start_date) : null,
                    finishDate: promo.finish_date ? new Date(promo.finish_date) : null,
                    deadline_date: promo.deadline_date ? new Date(promo.deadline_date) : null,
                    itens: items, benefits: promo.benefits || null, dadosML: promo,
                    fetchedAt: new Date(),
                  },
                });

                totalSynced++;
              } catch (promoErr) {
                errors.push({ promoId: promo.id, erro: promoErr.message });
              }

              processado++;
              const pct = totalPromos > 0 ? Math.round((processado / totalPromos) * 100) : 0;
              await updateProgresso(pct, `${conta.nickname}: ${processado}/${totalPromos} promoções`);
            }
          }

          const cacheInfo = totalFromCache > 0 ? ` (${totalFromCache} do cache, ${totalSynced - totalFromCache} via API)` : '';
          await prisma.tarefaFila.update({
            where: { id: tarefa.id },
            data: {
              status: 'CONCLUIDO',
              detalhes: `[100%] ${totalSynced} promoções sincronizadas${cacheInfo}${errors.length ? ` — ${errors.length} erro(s)` : ''}`,
            },
          });
        } catch (err) {
          await prisma.tarefaFila.update({
            where: { id: tarefa.id },
            data: { status: 'FALHA', detalhes: `Erro: ${err.message}` },
          });
        }
      })();

    } catch (err) {
      res.status(500).json({ erro: 'Erro ao iniciar sincronização', detalhes: err.message });
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

      // Verifica se dealPrice ultrapassa a gordura + excedente definidos por item
      if (dealPrice != null) {
        const promoRecord = await prisma.promoML.findFirst({ where: { id: promoId, contaId } });
        const itemData = Array.isArray(promoRecord?.itens) ? promoRecord.itens.find(i => i.id === itemId) : null;
        const erroLimite = await verificarLimiteDescontoItem(itemId, dealPrice, itemData?.original_price);
        if (erroLimite) return res.status(400).json({ erro: erroLimite });
      }

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

  // ─── POST /api/promocoes/massa-fila ─────────────────────────────────────────
  async ativarRemoverMassaFila(req, res) {
    try {
      const { userId, itens, acao } = req.body;
      if (!userId || !itens || !Array.isArray(itens)) {
        return res.status(400).json({ erro: 'userId e array de itens são obrigatórios' });
      }

      // Filtra itens que violam gordura + excedente definidos por item (somente ATIVAR com dealPrice)
      let itensFiltrados = itens;
      let bloqueados = 0;
      if (acao === 'ATIVAR') {
        const itemIdsComPreco = itens.filter(i => i.dealPrice != null).map(i => i.itemId);
        if (itemIdsComPreco.length > 0) {
          const anuncios = await prisma.anuncioML.findMany({
            where: { id: { in: itemIdsComPreco } },
            select: { id: true, inflarPct: true, toleranciaPromo: true },
          });
          const anuncioMap = Object.fromEntries(anuncios.map(a => [a.id, a]));

          const promoIds = [...new Set(itens.map(i => i.promoId).filter(Boolean))];
          const promos = await prisma.promoML.findMany({ where: { id: { in: promoIds } } });
          const promoItensMap = {};
          for (const p of promos) {
            if (Array.isArray(p.itens)) {
              for (const it of p.itens) promoItensMap[`${p.id}:${it.id}`] = it;
            }
          }

          itensFiltrados = itens.filter(item => {
            if (item.dealPrice == null) return true;
            const anuncio = anuncioMap[item.itemId];
            if (!anuncio || (anuncio.inflarPct || 0) === 0) return true; // sem gordura, não bloqueia
            const limiteItem = (anuncio.inflarPct || 0) + (anuncio.toleranciaPromo || 0);
            const promoData = promoItensMap[`${item.promoId}:${item.itemId}`];
            const originalPrice = promoData?.original_price;
            if (!originalPrice || originalPrice <= 0) return true; // sem preço original, não bloqueia
            const pct = (1 - item.dealPrice / originalPrice) * 100;
            if (pct > limiteItem) { bloqueados++; return false; }
            return true;
          });
        }
      }

      if (itensFiltrados.length === 0 && bloqueados > 0) {
        return res.status(400).json({ erro: `Todos os ${bloqueados} item(ns) bloqueados: desconto excede a gordura + excedente definidos.` });
      }

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId,
          tipo: acao === 'ATIVAR' ? 'PROMO_ATIVAR' : 'PROMO_REMOVER',
          status: 'PENDENTE',
          detalhes: `Aguardando processamento de ${itensFiltrados.length} itens...${bloqueados > 0 ? ` (${bloqueados} bloqueado(s) pelo limite global)` : ''}`,
        },
      });

      await promoQueue.add('processar-massa', {
        tarefaId: tarefa.id,
        userId,
        itens: itensFiltrados,
        acao
      }, { removeOnComplete: true, removeOnFail: true });

      res.json({ ok: true, tarefaId: tarefa.id, bloqueados, message: `Enviado para a fila de processamento.${bloqueados > 0 ? ` ${bloqueados} item(ns) bloqueado(s) pelo limite global de desconto.` : ''}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: 'Erro ao enviar para fila', detalhes: err.message });
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

      // Mapa contaId → token (lazy-refreshed)
      const tokenMap = {};
      async function getToken(cId) {
        if (!tokenMap[cId]) {
          const c = contas.find(x => x.id === cId);
          tokenMap[cId] = c ? await refreshContaToken(c) : null;
        }
        return tokenMap[cId];
      }

      const itensFila = [];
      const skipped = [];

      const TIPOS_COM_OFFER_ID_ORC = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
      const TIPOS_COM_PRECO_ORC = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);

      for (const regra of regras) {
        const tipos = regra.tiposPermitidos || regra.tipos_permitidos || [];
        const maxPct = parseFloat(regra.maxSellerPct || regra.max_seller_pct) || 30;
        const tolerancia = parseFloat(regra.tolerancia) || 0;
        const limiteMax = maxPct + tolerancia;

        const agora = new Date();

        const promos = await prisma.promoML.findMany({
          where: {
            contaId: { in: contas.map(c => c.id) },
            tipo: { in: tipos },
            status: { in: ['started', 'pending'] },
          },
        });

        for (const promo of promos) {
          // Ignora promos cuja data de término já passou (banco desatualizado)
          if (promo.finishDate && new Date(promo.finishDate) < agora) {
            console.log(`[Orquestrador] Promo ${promo.id} ignorada: finishDate no passado (${promo.finishDate})`);
            continue;
          }

          const items = Array.isArray(promo.itens) ? promo.itens : [];
          const candidates = items.filter(item => {
            if (item.status !== 'candidate') return false;
            const sp = item.seller_percentage ?? item.sellerPercentage ?? null;
            if (sp !== null) return sp <= limiteMax;
            // SELLER_CAMPAIGN não retorna seller_percentage — calcula pelo suggested_discounted_price
            if (item.suggested_discounted_price != null && item.original_price > 0) {
              const pctEfetivo = (1 - item.suggested_discounted_price / item.original_price) * 100;
              return pctEfetivo <= limiteMax;
            }
            return true; // sem dados suficientes para calcular, inclui
          });

          for (const item of candidates) {
            const filaItem = {
              itemId: item.id,
              contaId: promo.contaId,
              promoTipo: promo.tipo,
              promoId: promo.id,
            };

            if (item.offer_id && TIPOS_COM_OFFER_ID_ORC.has(promo.tipo)) filaItem.offerId = item.offer_id;

            if (TIPOS_COM_PRECO_ORC.has(promo.tipo)) {
              let priceToUse = item.suggested_discounted_price ?? item.max_discounted_price ?? null;

              // Campanhas com preço: endpoint bulk de itens muitas vezes não retorna preços sugeridos.
              // Se não tiver no banco (dados antigos), busca ao vivo via per-item endpoint.
              if ((!priceToUse || isNaN(priceToUse)) && TIPOS_COM_PRECO_ORC.has(promo.tipo)) {
                try {
                  const tk = await getToken(promo.contaId);
                  if (tk) {
                    const r = await axios.get(
                      `https://api.mercadolibre.com/seller-promotions/items/${item.id}?app_version=v2`,
                      { headers: { Authorization: `Bearer ${tk}` }, timeout: 10000 }
                    );
                    const allPromos = Array.isArray(r.data) ? r.data : [r.data];
                    const match = allPromos.find(p => p.id === promo.id);
                    if (match) {
                      priceToUse = match.suggested_discounted_price ?? match.max_discounted_price ?? null;
                      // Persiste no item para não buscar novamente
                      if (match.suggested_discounted_price != null) item.suggested_discounted_price = match.suggested_discounted_price;
                      if (match.max_discounted_price != null) item.max_discounted_price = match.max_discounted_price;
                      if (match.min_discounted_price != null) item.min_discounted_price = match.min_discounted_price;
                    }
                  }
                } catch (_) { /* falha silenciosa, será pulado abaixo */ }
                await delay(150);
              }

              if (!priceToUse || isNaN(priceToUse)) {
                skipped.push({ promoId: promo.id, itemId: item.id, motivo: 'sem_preco' });
                continue;
              }
              filaItem.dealPrice = Number(priceToUse);
            }

            itensFila.push(filaItem);
          }

          const nonCandidates = items.filter(i => i.status !== 'candidate');
          skipped.push(...nonCandidates.map(i => ({ promoId: promo.id, itemId: i.id })));
        }
      }

      if (itensFila.length === 0) {
        return res.json({ ok: true, joined: 0, skipped: skipped.length, errors: 0, message: 'Nenhum candidato encontrado para ativar.' });
      }

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId,
          tipo: 'PROMO_ATIVAR',
          status: 'PENDENTE',
          detalhes: `Aguardando processamento de ${itensFila.length} itens...`,
        },
      });

      await promoQueue.add('processar-massa', {
        tarefaId: tarefa.id,
        userId,
        itens: itensFila,
        acao: 'ATIVAR',
      }, { removeOnComplete: true, removeOnFail: true });

      res.json({ ok: true, tarefaId: tarefa.id, joined: itensFila.length, skipped: skipped.length, errors: 0 });
    } catch (err) {
      console.error('[PromoML] executarOrquestrador error:', err);
      res.status(500).json({ erro: 'Erro ao executar orquestrador', detalhes: err.message });
    }
  },

  // ─── POST /api/promocoes/excluir-campanhas-massa ────────────────────────────
  // Exclui campanhas ativas dos itens selecionados.
  // maxPct = null  → exclui TODAS
  // maxPct = número → exclui apenas as que ultrapassam aquele % do vendedor
  async excluirCampanhasMassa(req, res) {
    try {
      const { userId, maxPct } = req.body;
      // Converte para string e filtra apenas IDs de anúncios pai (MLB...) — IDs de variação são numéricos e não têm campanhas
      const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(String).filter(id => id.startsWith('MLB')) : [];
      if (!userId || itemIds.length === 0) {
        return res.status(400).json({ erro: 'userId e itemIds são obrigatórios' });
      }

      const contasML = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
      const contaIds = contasML.map(c => c.id);

      const anuncios = await prisma.anuncioML.findMany({
        where: { id: { in: itemIds }, contaId: { in: contaIds } },
        select: { id: true, contaId: true },
      });
      if (anuncios.length === 0) return res.status(404).json({ erro: 'Nenhum anúncio encontrado' });

      const tarefa = await prisma.tarefaFila.create({
        data: { userId, tipo: 'PROMO_REMOVER', status: 'PENDENTE', detalhes: 'Preparando exclusão de campanhas...' },
      });
      res.json({ ok: true, tarefaId: tarefa.id });

      // Processamento em background
      (async () => {
        try {
          const itemContaMap = Object.fromEntries(anuncios.map(a => [a.id, a.contaId]));
          const itensFila = [];

          const promos = await prisma.promoML.findMany({
            where: {
              contaId: { in: contaIds },
              status: { in: ['started', 'pending'] },
            },
          });

          for (const promo of promos) {
            const itens = Array.isArray(promo.itens) ? promo.itens : [];
            for (const item of itens) {
              if (!itemIds.includes(item.id)) continue;
              if (!['started', 'pending', 'candidate'].includes(item.status)) continue;

              if (maxPct != null) {
                // Só exclui campanhas que ultrapassam o % máximo
                const sp = item.seller_percentage ?? item.sellerPercentage ?? null;
                if (sp !== null && sp <= maxPct) continue; // mantém esta
                // SELLER_CAMPAIGN sem seller_percentage: calcula pelo preço
                if (sp === null && item.suggested_discounted_price != null && item.original_price > 0) {
                  const pctEfetivo = (1 - item.suggested_discounted_price / item.original_price) * 100;
                  if (pctEfetivo <= maxPct) continue;
                }
              }

              itensFila.push({
                itemId: item.id,
                contaId: promo.contaId,
                promoTipo: promo.tipo,
                promoId: promo.id,
                offerId: item.offer_id || item.ref_id || null,
              });
            }
          }

          if (itensFila.length === 0) {
            await prisma.tarefaFila.update({
              where: { id: tarefa.id },
              data: { status: 'CONCLUIDO', detalhes: 'Nenhuma campanha encontrada para excluir.' },
            });
            return;
          }

          await prisma.tarefaFila.update({
            where: { id: tarefa.id },
            data: { detalhes: `Enfileirando remoção de ${itensFila.length} campanha(s)...` },
          });

          await promoQueue.add('processar-massa', {
            tarefaId: tarefa.id,
            userId,
            itens: itensFila,
            acao: 'REMOVER',
          }, { removeOnComplete: true, removeOnFail: true });

        } catch (e) {
          console.error('[excluirCampanhasMassa]', e.message);
          await prisma.tarefaFila.update({
            where: { id: tarefa.id },
            data: { status: 'FALHA', detalhes: `Erro: ${e.message}` },
          }).catch(() => {});
        }
      })();
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ─── POST /api/promocoes/ativar-candidatos-realtime ────────────────────────
  // Busca promoções em tempo real da API do ML para os itens selecionados,
  // sem depender do cache do orquestrador. Ativa candidatos dentro do maxPct.
  async ativarCandidatosRealtime(req, res) {
    try {
      const { userId, itemIds, maxPct } = req.body;
      if (!userId || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ erro: 'userId e itemIds são obrigatórios' });
      }
      const limiteMax = parseFloat(maxPct) || 100;

      const contasML = await prisma.contaML.findMany({ where: { userId } });
      const anuncios = await prisma.anuncioML.findMany({
        where: { id: { in: itemIds }, contaId: { in: contasML.map(c => c.id) } },
        select: { id: true, contaId: true },
      });
      if (anuncios.length === 0) return res.status(404).json({ erro: 'Nenhum anúncio encontrado' });

      const tarefa = await prisma.tarefaFila.create({
        data: { userId, tipo: 'PROMO_ATIVAR', status: 'PENDENTE', detalhes: `Buscando promoções em tempo real para ${anuncios.length} anúncio(s)...` },
      });
      res.json({ ok: true, tarefaId: tarefa.id });

      (async () => {
        try {
          const tokenMap = {};
          async function getToken(cId) {
            if (!tokenMap[cId]) {
              const c = contasML.find(x => x.id === cId);
              tokenMap[cId] = c ? await refreshContaToken(c) : null;
            }
            return tokenMap[cId];
          }

          const TIPOS_COM_PRECO_RT = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING', 'PRICE_DISCOUNT']);
          const TIPOS_COM_OFFER_ID_RT = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
          const TIPOS_SEM_PROMO_ID_RT = new Set(['DOD', 'LIGHTNING', 'PRICE_DISCOUNT']);

          const itensFila = [];
          const skipped = [];

          for (const anuncio of anuncios) {
            const tk = await getToken(anuncio.contaId);
            if (!tk) { skipped.push({ itemId: anuncio.id, motivo: 'sem_token' }); continue; }

            try {
              const r = await axios.get(
                `https://api.mercadolibre.com/seller-promotions/items/${anuncio.id}?app_version=v2`,
                { headers: { Authorization: `Bearer ${tk}` }, timeout: 10000 }
              );
              const promos = Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);

              for (const promo of promos) {
                const promoId = promo.id || promo.promotion_id;
                const promoTipo = promo.type || promo.promotion_type;
                const itemStatus = promo.status || promo.item_status;

                // Pula promos deletadas ou com status de promoção inválido
                if (promo.promotion_status === 'deleted' || promo.promotion_status === 'finished') continue;

                // Só processa candidatos e ativos (para atualizar preço)
                if (!['candidate', 'started', 'pending'].includes(itemStatus)) continue;

                // Calcula % de desconto do vendedor
                const sp = promo.seller_percentage ?? null;
                let pctEfetivo = sp;
                if (pctEfetivo === null && promo.suggested_discounted_price != null && promo.original_price > 0) {
                  pctEfetivo = (1 - promo.suggested_discounted_price / promo.original_price) * 100;
                }
                console.log(`[ativarCandidatosRealtime] ${anuncio.id} | tipo=${promoTipo} | sp=${sp} | pctEfetivo=${pctEfetivo?.toFixed(2)} | limiteMax=${limiteMax} | status=${itemStatus}`);
                if (pctEfetivo !== null && pctEfetivo > limiteMax) {
                  skipped.push({ itemId: anuncio.id, promoId, motivo: 'acima_limite', pct: pctEfetivo });
                  continue;
                }

                const filaItem = {
                  itemId: anuncio.id,
                  contaId: anuncio.contaId,
                  promoTipo,
                  promoId: TIPOS_SEM_PROMO_ID_RT.has(promoTipo) ? null : promoId,
                  isUpdate: itemStatus === 'started' || itemStatus === 'pending',
                };

                if (promo.offer_id && TIPOS_COM_OFFER_ID_RT.has(promoTipo)) {
                  filaItem.offerId = promo.offer_id;
                }

                if (TIPOS_COM_PRECO_RT.has(promoTipo)) {
                  let dealPrice = null;
                  if (promo.original_price > 0) {
                    // Calcula o preço com base no % informado pelo usuário
                    const targetPrice = Math.round(promo.original_price * (1 - limiteMax / 100) * 100) / 100;
                    const minP = promo.min_discounted_price || 0;
                    const maxP = promo.max_discounted_price || Infinity;
                    dealPrice = Math.max(minP, Math.min(maxP, targetPrice));
                  } else {
                    dealPrice = promo.suggested_discounted_price ?? promo.max_discounted_price ?? null;
                  }
                  if (!dealPrice || isNaN(dealPrice)) {
                    skipped.push({ itemId: anuncio.id, promoId, motivo: 'sem_preco' });
                    continue;
                  }
                  filaItem.dealPrice = Number(dealPrice);
                }

                itensFila.push(filaItem);
              }
            } catch (e) {
              console.error(`[ativarCandidatosRealtime] item ${anuncio.id}:`, e.message);
              skipped.push({ itemId: anuncio.id, motivo: e.message });
            }
            await delay(200);
          }

          if (itensFila.length === 0) {
            const skipLog = skipped.map(s => {
              if (s.motivo === 'acima_limite') return `[${s.itemId}/${s.promoId || 'sem-id'}] acima do limite: ${s.pct?.toFixed(2)}% > ${limiteMax}%`;
              if (s.motivo === 'sem_preco') return `[${s.itemId}/${s.promoId || 'sem-id'}] sem preço válido para ativar`;
              if (s.motivo === 'sem_token') return `[${s.itemId}] sem token de acesso`;
              return `[${s.itemId}/${s.promoId || 'sem-id'}] ${s.motivo}`;
            }).join('\n');
            await prisma.tarefaFila.update({
              where: { id: tarefa.id },
              data: { status: 'CONCLUIDO', detalhes: `Nenhum candidato encontrado dentro do limite de ${limiteMax}%. Skipped: ${skipped.length}\n\n${skipLog}` },
            });
            return;
          }

          await prisma.tarefaFila.update({
            where: { id: tarefa.id },
            data: { detalhes: `Enfileirando ${itensFila.length} ativação(ões) em tempo real...` },
          });

          await promoQueue.add('processar-massa', {
            tarefaId: tarefa.id,
            userId,
            itens: itensFila,
            acao: 'ATIVAR',
          }, { removeOnComplete: true, removeOnFail: true });

        } catch (e) {
          console.error('[ativarCandidatosRealtime]', e.message);
          await prisma.tarefaFila.update({
            where: { id: tarefa.id },
            data: { status: 'FALHA', detalhes: `Erro: ${e.message}` },
          }).catch(() => {});
        }
      })();

    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ─── Monitor de Promoções ──────────────────────────────────────────────────
  async getMonitorConfig(req, res) {
    try {
      const { userId } = req.query;
      const config = await prisma.monitorPromoConfig.findUnique({ where: { userId } });
      res.json(config || { ativo: true, maxSellerPct: 20, autoAtivar: false, tiposIgnorar: [], usarDescontoDinamico: false });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async saveMonitorConfig(req, res) {
    try {
      const { userId, ativo, maxSellerPct, autoAtivar, tiposIgnorar, usarDescontoDinamico } = req.body;
      const data = {
        ativo: ativo ?? true,
        maxSellerPct: maxSellerPct ?? 20,
        autoAtivar: autoAtivar ?? false,
        tiposIgnorar: tiposIgnorar ?? [],
        usarDescontoDinamico: usarDescontoDinamico ?? false,
      };
      const config = await prisma.monitorPromoConfig.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      res.json({ ok: true, config });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async getMonitorAlertas(req, res) {
    try {
      const { userId, pendentesOnly } = req.query;
      const where = { userId };
      if (pendentesOnly === 'true') where.aceita = null;

      const alertas = await prisma.promoAlerta.findMany({
        where,
        orderBy: { detectadaEm: 'desc' },
        take: 100,
      });

      // Enriquece com dados da PromoML
      const enriched = await Promise.all(alertas.map(async (a) => {
        const promo = await prisma.promoML.findFirst({
          where: { id: a.promoId, contaId: a.contaId },
          select: { id: true, tipo: true, nome: true, status: true, startDate: true, finishDate: true, itens: true, benefits: true },
        });
        return { ...a, promo: promo || null };
      }));

      res.json({ alertas: enriched });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async acaoMonitorAlerta(req, res) {
    try {
      const { id } = req.params;
      const { userId, acao } = req.body; // acao: 'aceitar' | 'ignorar'

      const alerta = await prisma.promoAlerta.findFirst({ where: { id, userId } });
      if (!alerta) return res.status(404).json({ erro: 'Alerta não encontrado' });

      const aceita = acao === 'aceitar';
      await prisma.promoAlerta.update({ where: { id }, data: { aceita } });

      // Se aceitar, aciona o orquestrador para ativar os itens candidate desta promo
      if (aceita) {
        const conta = await prisma.contaML.findFirst({ where: { id: alerta.contaId } });
        if (conta) {
          const token = await refreshContaToken(conta);
          const promo = await prisma.promoML.findFirst({ where: { id: alerta.promoId, contaId: alerta.contaId } });
          if (promo) {
            const itens = Array.isArray(promo.itens) ? promo.itens : [];
            const candidatos = itens.filter(i => i.status === 'candidate');
            let joined = 0, errors = 0;

            for (const item of candidatos) {
              try {
                const body = { promotion_id: alerta.promoId, promotion_type: promo.tipo };
                if (item.offer_id) body.offer_id = item.offer_id;
                // SELLER_CAMPAIGN retorna price=0 para candidatos; usa suggested_discounted_price como deal_price
                const dealPrice = item.suggested_discounted_price ?? (item.price > 0 ? item.price : null);
                if (dealPrice) body.deal_price = dealPrice;
                await axios.post(
                  `https://api.mercadolibre.com/seller-promotions/items/${item.id}?app_version=v2`,
                  body,
                  { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
                );
                joined++;
                await delay(300);
              } catch (e) {
                errors++;
                console.error(`[MonitorPromo] erro ao ativar item ${item.id}:`, e.response?.data?.message || e.message);
              }
            }
            return res.json({ ok: true, aceita: true, joined, errors });
          }
        }
      }

      res.json({ ok: true, aceita });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },
};
