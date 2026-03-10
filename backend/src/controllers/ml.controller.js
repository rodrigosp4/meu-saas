import { mlService } from '../services/ml.service.js';
import { config } from '../config/env.js';
import prisma from '../config/prisma.js';
import { mlSyncQueue, publishQueue, priceQueue } from '../workers/queue.js';
import axios from 'axios';


// ✅ NOVA CONSTANTE: Lista de tags relevantes com prioridade (mesma do worker)
const RELEVANT_AD_TAGS_PRIORITY = [
  "incomplete_compatibilities",
  "incomplete_position_compatibilities",
  "poor_quality_picture",
  "poor_quality_thumbnail",
  "picture_downloading_pending",
  "moderation_penalty",
  "out_of_stock",
  "incomplete_technical_specs",
  "waiting_for_patch"
];

// ✅ NOVA FUNÇÃO AUXILIAR: Calcula a tag principal de um anúncio
function getPrimaryTag(adData) {
  const tags = adData.tags || [];
  const subStatus = adData.sub_status || [];
  const combined = new Set([...tags, ...subStatus]);

  for (const priorityTag of RELEVANT_AD_TAGS_PRIORITY) {
    if (combined.has(priorityTag)) {
      return priorityTag;
    }
  }
  if (subStatus.length > 0) return subStatus[0];
  return null;
}

function extractSellerSku(itemData) {
  if (itemData.attributes && Array.isArray(itemData.attributes)) {
    const skuAttr = itemData.attributes.find(a => a.id === 'SELLER_SKU');
    if (skuAttr && skuAttr.value_name && skuAttr.value_name !== '-1') {
      return skuAttr.value_name;
    }
  }
  return itemData.seller_custom_field || null;
}

export const mlController = {
  async handleCallback(req, res) {
    const { code } = req.query;
    if (code) {
      return res.redirect(`${config.frontendUrl}/?code=${code}`);
    }
    res.send('Servidor backend do MeuSaaS Hub está online.');
  },

  async auth(req, res) {
    try {
      const data = await mlService.authenticate(req.body.code);
      res.json(data);
    } catch (error) {
      res.status(500).json({ erro: 'Falha', detalhes: error.response?.data });
    }
  },

  async refreshToken(req, res) {
    if (!req.body.refresh_token) return res.status(400).json({ erro: 'Refresh token não fornecido' });
    try {
      const data = await mlService.refreshToken(req.body.refresh_token);
      res.json(data);
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao renovar token', detalhes: error.response?.data });
    }
  },

  async getCategories(req, res) {
    try { res.json(await mlService.getCategories(req.query.token)); } 
    catch (error) { res.status(500).json({ erro: 'Falha ao buscar categorias' }); }
  },

  async getAllCategories(req, res) {
    try { res.json(await mlService.getAllCategoriesDump()); } 
    catch (error) { res.status(500).json({ erro: 'Erro no dump de categorias' }); }
  },

  async getAttributes(req, res) {
    try { res.json(await mlService.getCategoryAttributes(req.params.categoryId)); } 
    catch (error) { res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar atributos' }); }
  },

  async predictCategory(req, res) {
    try { res.json(await mlService.predictCategory(req.query.title)); } 
    catch (error) { res.status(500).json({ erro: 'Falha ao prever' }); }
  },

  async simulateShipping(req, res) {
    try {
      const cost = await mlService.simulateShipping(req.body);
      res.json({ success: true, cost });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Falha ao simular frete' });
    }
  },

  async getShippingCostItems(req, res) {
    try {
      const { userId, items } = req.body;
      if (!userId || !Array.isArray(items)) return res.status(400).json({ erro: 'Parâmetros inválidos.' });

      const results = {};
      await Promise.all(items.map(async ({ itemId, contaId }) => {
        try {
          const [conta, anuncio] = await Promise.all([
            prisma.contaML.findFirst({ where: { id: contaId, userId } }),
            prisma.anuncioML.findFirst({ where: { id: itemId } })
          ]);
          if (!conta || !anuncio) return;

          const tokenRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
          const token = tokenRes ? tokenRes.access_token : conta.accessToken;
          if (tokenRes) {
            await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token, refreshToken: tokenRes.refresh_token } });
          }

          // Extrai dados do anúncio salvo para usar na simulação correta
          const dadosML = anuncio.dadosML || {};
          const categoryId = dadosML.category_id;
          const listingTypeId = dadosML.listing_type_id || 'gold_pro';
          const itemPrice = anuncio.preco || 0;

          // A API ML de frete grátis exige category_id + item_price (não aceita item_id diretamente)
          if (categoryId && itemPrice >= 79) {
            results[itemId] = await mlService.simulateShipping({
              accessToken: token,
              sellerId: conta.id,
              itemPrice,
              categoryId,
              listingTypeId,
              dimensions: '20x15x10,500' // dimensões padrão como fallback
            });
          } else {
            results[itemId] = 0;
          }
        } catch (e) {
          results[itemId] = 0;
        }
      }));

      res.json({ custos: results });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao buscar custos de frete.' });
    }
  },

  async publish(req, res) {
    try {
      const { userId, contaNome, sku, accessToken, payload, description } = req.body;

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId: userId,
          tipo: 'Publicar Anúncio',
          alvo: sku || payload.title.substring(0, 30),
          conta: contaNome || 'Conta ML',
          status: 'PENDENTE'
        }
      });

      const job = await publishQueue.add('publish-ml', {
        tarefaId: tarefa.id,
        accessToken,
        payload,
        description
      });

      await prisma.tarefaFila.update({
        where: { id: tarefa.id },
        data: { jobId: job.id }
      });

      res.json({ ok: true, message: 'Enviado para a fila de processamento', jobId: job.id });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao enfileirar', detalhes: error.message });
    }
  },

// =============================================================================
// CORREÇÕES PARA SYNC DE MÚLTIPLAS CONTAS
// =============================================================================
// 
// PROBLEMA: Ao selecionar "Todas as Contas", só uma delas sincroniza.
//
// CAUSA RAIZ (3 pontos):
//   1. syncAds usa .catch(() => null) no refresh — token expirado vai pro worker
//   2. O token é capturado no momento do ENQUEUE, não no momento do PROCESSAMENTO
//   3. O for-loop do frontend faz throw no primeiro erro, abortando as contas restantes
//
// CORREÇÕES ABAIXO:
// =============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 1: syncAds no Controller (mlController)
// Substitua a função syncAds no seu controller
// ─────────────────────────────────────────────────────────────────────────────

async syncAds(req, res) {
  try {
    // ✅ RECEBE O PARÂMETRO AQUI
    const { contaId, importarApenasNovos } = req.body; 
    const conta = await prisma.contaML.findUnique({ where: { id: contaId } });
    if (!conta) return res.status(404).json({ erro: "Conta não encontrada" });

    // ★ CORREÇÃO: Validar o token ANTES de enfileirar
    let activeToken = conta.accessToken;
    let refreshFailed = false;

    try {
      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken);
      if (tokenRefreshRes?.access_token) {
        activeToken = tokenRefreshRes.access_token;
        await prisma.contaML.update({
          where: { id: contaId },
          data: {
            accessToken: activeToken,
            refreshToken: tokenRefreshRes.refresh_token || conta.refreshToken,
            expiresAt: BigInt(Date.now() + (tokenRefreshRes.expires_in || 21600) * 1000)
          }
        });
      }
    } catch (refreshErr) {
      console.warn(`⚠️ Refresh falhou para conta ${conta.nickname}: ${refreshErr.message}`);
      refreshFailed = true;
    }

    // ★ CORREÇÃO: Validar se o token atual é funcional (chamada rápida)
    try {
      const testRes = await axios.get(
        `https://api.mercadolibre.com/users/${contaId}`,
        { headers: { Authorization: `Bearer ${activeToken}` }, timeout: 5000 }
      );
      if (testRes.status !== 200) throw new Error('Token inválido');
    } catch (testErr) {
      // Token morto — não adianta enfileirar
      return res.status(401).json({
        erro: `Token inválido para a conta "${conta.nickname}". Reconecte-a no painel.`,
        contaId,
        nickname: conta.nickname,
        refreshFailed
      });
    }

    // ★ CORREÇÃO: Passa o refreshToken para o worker poder renovar sob demanda
    const job = await mlSyncQueue.add('sync-ml', {
      contaId,
      accessToken: activeToken,
      refreshToken: conta.refreshToken,
      importarApenasNovos // ✅ PASSA PARA A FILA AQUI
    });

    res.json({ jobId: job.id, message: `Varredura iniciada para ${conta.nickname}` });
  } catch (e) {
    res.status(500).json({ erro: 'Falha ao enfileirar', detalhes: e.message });
  }
},

  // Varre TODAS as contas em um único job: coleta todos os IDs primeiro, depois baixa detalhes
  async syncAllAds(req, res) {
    try {
      // ✅ RECEBE O PARÂMETRO AQUI
      const { contaIds, importarApenasNovos } = req.body; 
      if (!contaIds || !Array.isArray(contaIds) || contaIds.length === 0) {
        return res.status(400).json({ erro: 'contaIds deve ser um array não vazio' });
      }

      const contas = [];
      const erros = [];

      for (const contaId of contaIds) {
        try {
          const conta = await prisma.contaML.findUnique({ where: { id: contaId } });
          if (!conta) { erros.push(`${contaId}: Conta não encontrada`); continue; }

          let activeToken = conta.accessToken;
          try {
            const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken);
            if (tokenRefreshRes?.access_token) {
              activeToken = tokenRefreshRes.access_token;
              await prisma.contaML.update({
                where: { id: contaId },
                data: {
                  accessToken: activeToken,
                  refreshToken: tokenRefreshRes.refresh_token || conta.refreshToken,
                  expiresAt: BigInt(Date.now() + (tokenRefreshRes.expires_in || 21600) * 1000)
                }
              });
            }
          } catch (_) { /* usa token atual */ }

          try {
            const testRes = await axios.get(
              `https://api.mercadolibre.com/users/${contaId}`,
              { headers: { Authorization: `Bearer ${activeToken}` }, timeout: 5000 }
            );
            if (testRes.status !== 200) throw new Error('Token inválido');
          } catch {
            erros.push(`${conta.nickname}: Token inválido. Reconecte a conta.`);
            continue;
          }

          contas.push({ contaId, accessToken: activeToken, refreshToken: conta.refreshToken });
        } catch (e) {
          erros.push(`${contaId}: ${e.message}`);
        }
      }

      if (contas.length === 0) {
        return res.status(400).json({ erro: 'Nenhuma conta válida para sincronizar', erros });
      }

      const job = await mlSyncQueue.add('sync-ml', { 
         contas, 
         importarApenasNovos // ✅ PASSA PARA A FILA AQUI 
      });
      res.json({ jobId: job.id, message: `Varredura iniciada para ${contas.length} conta(s)`, erros });
    } catch (e) {
      res.status(500).json({ erro: 'Falha ao enfileirar', detalhes: e.message });
    }
  },

  async getSyncStatus(req, res) {
    try {
      const job = await mlSyncQueue.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Job não encontrado' });
      const state = await job.getState();
      res.json({ state, progress: job.progress || 0 });
    } catch (e) { res.status(500).json({ erro: e.message }); }
  },

  // ============================================================================
  // ✅ ATUALIZADO: getAds agora suporta filtros de Promoção, Preço e Prazo
  // ============================================================================
  async getAds(req, res) {
    try {
      const { 
        contasIds, search = '', status = 'Todos', tag = 'Todas', 
        promo = 'Todos', precoMin = '', precoMax = '', prazo = 'Todos',
        descontoMin = '', descontoMax = '',
        sortBy = 'padrao',          // ← ADICIONAR AQUI
        page = 1, limit = 50 
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      
      // Mapeamento de ordenação
      const SORT_MAP = {
        'vendas_desc':   { vendas: 'desc' },
        'vendas_asc':    { vendas: 'asc' },
        'visitas_desc':  { visitas: 'desc' },
        'visitas_asc':   { visitas: 'asc' },
        'preco_desc':    { preco: 'desc' },
        'preco_asc':     { preco: 'asc' },
        'estoque_desc':  { estoque: 'desc' },
        'estoque_asc':   { estoque: 'asc' },
      };
      const orderBy = SORT_MAP[sortBy] || { vendas: 'desc' };
      const where = {};   // ← ESSA LINHA ESTÁ FALTANDO
      if (contasIds) {
        where.contaId = { in: contasIds.split(',') };
      }
      
      if (status !== 'Todos') where.status = status;
      
      // Filtro por tag principal
      if (tag && tag !== 'Todas') {
        if (tag === '_sem_tag') {
          where.OR = [
            { tagPrincipal: null },
            { tagPrincipal: '' }
          ];
        } else {
          where.tagPrincipal = tag;
        }
      }

      // ✅ NOVO: Filtro de Promoção (com/sem desconto)
      if (promo === 'com_desconto') {
        // Anúncios que têm precoOriginal definido e maior que o preco atual
        where.precoOriginal = { not: null };
        where.AND = [
          ...(where.AND || []),
          {
            precoOriginal: { gt: 0 }
          }
        ];
        // Usa raw filter via Prisma: precoOriginal > preco
        // Como Prisma não suporta comparação entre dois campos diretamente,
        // fazemos um filtro extra via raw condition
      } else if (promo === 'sem_desconto') {
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { precoOriginal: null },
              { precoOriginal: 0 },
              { precoOriginal: { equals: 0 } }
            ]
          }
        ];
      }

      // ✅ NOVO: Filtro de Faixa de Preço
      if (precoMin !== '' && !isNaN(Number(precoMin))) {
        where.preco = { ...(where.preco || {}), gte: Number(precoMin) };
      }
      if (precoMax !== '' && !isNaN(Number(precoMax))) {
        where.preco = { ...(where.preco || {}), lte: Number(precoMax) };
      }

      // Filtro de busca textual
      if (search) {
        const searchCondition = [
          { titulo: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } }
        ];
        
        if (where.OR) {
          where.AND = [
            ...(where.AND || []),
            { OR: where.OR },
            { OR: searchCondition }
          ];
          delete where.OR;
        } else {
          where.OR = searchCondition;
        }
      }
      
      let [anuncios, total] = await Promise.all([
        prisma.anuncioML.findMany({ 
          where, skip, take: Number(limit), 
          orderBy: orderBy,
          include: { conta: { select: { nickname: true } } }
        }),
        prisma.anuncioML.count({ where })
      ]);

      // ✅ NOVO: Filtros pós-query (para campos JSON que Prisma não filtra nativamente)
      
      // Filtro de Promoção (validação extra: precoOriginal > preco de fato)
      if (promo === 'com_desconto') {
        anuncios = anuncios.filter(ad => ad.precoOriginal && ad.precoOriginal > ad.preco);
        total = anuncios.length; // Ajusta total (aproximado para esta página)
      }

      // Filtro de Prazo de Fabricação (baseado no JSON dadosML.sale_terms)
      if (prazo !== 'Todos') {
        anuncios = anuncios.filter(ad => {
          const dadosML = ad.dadosML || {};
          const saleTerms = dadosML.sale_terms || [];
          const mfgTerm = saleTerms.find(t => t.id === 'MANUFACTURING_TIME');
          
          if (prazo === 'imediato') {
            // Sem prazo de fabricação = envio imediato
            return !mfgTerm;
          } else if (prazo === 'com_prazo') {
            // Tem prazo de fabricação definido
            return !!mfgTerm;
          }
          return true;
        });
        total = anuncios.length; // Ajusta total (aproximado para esta página)
      }
      // ✅ NOVO: Filtro de % de Desconto (pós-query, pois é campo calculado)
      if (descontoMin !== '' || descontoMax !== '') {
        const minDesc = descontoMin !== '' ? Number(descontoMin) : null;
        const maxDesc = descontoMax !== '' ? Number(descontoMax) : null;

        anuncios = anuncios.filter(ad => {
          // Calcula o % de desconto do anúncio
          if (!ad.precoOriginal || ad.precoOriginal <= ad.preco) {
            // Sem desconto = 0%
            const desconto = 0;
            if (minDesc !== null && desconto < minDesc) return false;
            if (maxDesc !== null && desconto > maxDesc) return false;
            return true;
          }
          const desconto = Math.round(((ad.precoOriginal - ad.preco) / ad.precoOriginal) * 100);
          if (minDesc !== null && desconto < minDesc) return false;
          if (maxDesc !== null && desconto > maxDesc) return false;
          return true;
        });
        total = anuncios.length; // Ajusta total (aproximado para esta página)
      }
      // Ordenação por desconto (campo calculado, precisa ser pós-query)
      if (sortBy === 'desconto_desc' || sortBy === 'desconto_asc') {
        anuncios.sort((a, b) => {
          const descA = (a.precoOriginal && a.precoOriginal > a.preco)
            ? ((a.precoOriginal - a.preco) / a.precoOriginal) : 0;
          const descB = (b.precoOriginal && b.precoOriginal > b.preco)
            ? ((b.precoOriginal - b.preco) / b.precoOriginal) : 0;
          return sortBy === 'desconto_desc' ? descB - descA : descA - descB;
        });
      }
      res.json({ anuncios, total });
    } catch (error) { res.status(500).json({ erro: error.message }); }
  },


  // ============================================================================
  // ✅ NOVO ENDPOINT: Retorna todas as tags únicas existentes no banco
  // ============================================================================
  async getAdTags(req, res) {
    try {
      const { contasIds } = req.query;
      
      // Monta a condição de conta como AND adicional (ou string vazia)
      let contaCondition = '';
      if (contasIds) {
        const ids = contasIds.split(',').map(id => `'${id}'`).join(',');
        contaCondition = `AND "contaId" IN (${ids})`;
      }

      // Consulta direta no PostgreSQL para extrair as tags únicas do campo tagPrincipal
      const tagsResult = await prisma.$queryRawUnsafe(`
        SELECT "tagPrincipal" as tag, COUNT(*)::int as total
        FROM "AnuncioML"
        WHERE "tagPrincipal" IS NOT NULL 
          AND "tagPrincipal" != ''
          ${contaCondition}
        GROUP BY "tagPrincipal"
        ORDER BY total DESC
      `);

      // Conta os anúncios SEM tag de problema
      const semTagResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as total
        FROM "AnuncioML"
        WHERE ("tagPrincipal" IS NULL OR "tagPrincipal" = '')
          ${contaCondition}
      `);

      const tags = tagsResult.map(row => ({
        value: row.tag,
        label: row.tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count: row.total
      }));

      const semTagCount = semTagResult[0]?.total || 0;

      res.json({ tags, semTagCount });
    } catch (error) {
      console.error("Erro ao buscar tags:", error);
      res.status(500).json({ erro: error.message });
    }
  },

  // ============================================================================
  // Retorna apenas os IDs dos anúncios para "Selecionar Todos os Filtrados"
  // ============================================================================
  async getAdIds(req, res) {
    try {
      const {
        contasIds, search = '', status = 'Todos', tag = 'Todas',
        promo = 'Todos', precoMin = '', precoMax = '',
      } = req.query;

      const where = {};
      if (contasIds) where.contaId = { in: contasIds.split(',') };
      if (status !== 'Todos') where.status = status;

      if (tag && tag !== 'Todas') {
        if (tag === '_sem_tag') {
          where.OR = [{ tagPrincipal: null }, { tagPrincipal: '' }];
        } else {
          where.tagPrincipal = tag;
        }
      }

      if (promo === 'com_desconto') {
        where.precoOriginal = { not: null };
        where.AND = [...(where.AND || []), { precoOriginal: { gt: 0 } }];
      } else if (promo === 'sem_desconto') {
        where.AND = [...(where.AND || []), { OR: [{ precoOriginal: null }, { precoOriginal: 0 }] }];
      }

      if (precoMin !== '' && !isNaN(Number(precoMin))) {
        where.preco = { ...(where.preco || {}), gte: Number(precoMin) };
      }
      if (precoMax !== '' && !isNaN(Number(precoMax))) {
        where.preco = { ...(where.preco || {}), lte: Number(precoMax) };
      }

      if (search) {
        const searchCondition = [
          { titulo: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } },
        ];
        if (where.OR) {
          where.AND = [...(where.AND || []), { OR: where.OR }, { OR: searchCondition }];
          delete where.OR;
        } else {
          where.OR = searchCondition;
        }
      }

      const anuncios = await prisma.anuncioML.findMany({ where, select: { id: true } });
      res.json({ ids: anuncios.map(a => a.id) });
    } catch (e) {
      res.status(500).json({ erro: e.message });
    }
  },

  async getAdById(req, res) {
    try {
      const { itemId } = req.params;
      const { contaId, userId } = req.query;

      if (!itemId || !contaId || !userId) {
        return res.status(400).json({ erro: "Parâmetros incompletos." });
      }

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: "Conta não encontrada ou não pertence a você." });
      
      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
      let activeToken = tokenRefreshRes ? tokenRefreshRes.access_token : conta.accessToken;

      if (tokenRefreshRes) {
        await prisma.contaML.update({
             where: { id: conta.id },
             data: { accessToken: activeToken, refreshToken: tokenRefreshRes.refresh_token }
         });
      }

      const adData = await mlService.getSingleAdDetails(itemId, activeToken);
      
      // ✅ NOVO: Calcula a tag principal antes de salvar
      const primaryTag = getPrimaryTag(adData);

      const adSalvo = await prisma.anuncioML.upsert({
        where: { id: adData.id },
        update: {
          titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price, status: adData.status,
          estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
          thumbnail: adData.thumbnail, permalink: adData.permalink, sku: extractSellerSku(adData), 
          tagPrincipal: primaryTag,  // ✅ NOVO
          dadosML: adData,
          conta: { connect: { id: conta.id } }
        },
        create: {
          id: adData.id, contaId: conta.id, titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price,
          status: adData.status, estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
          thumbnail: adData.thumbnail, permalink: adData.permalink, sku: extractSellerSku(adData), 
          tagPrincipal: primaryTag,  // ✅ NOVO
          dadosML: adData
        },
        include: { conta: { select: { nickname: true } } }
      });

      res.json(adSalvo);

    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: error.message, detalhes: error.response?.data });
    }
  },

// ============================================================================
// ✅ getAdsBySku CORRIGIDO — Busca anúncios por SKU com suporte a variações
// ============================================================================
// CORREÇÕES APLICADAS:
//   1. Trata "variacoes" como Object OU Array (Tiny retorna ambos)
//   2. Se v.variacao.codigo estiver vazio, busca detalhes do filho para pegar o código real
//   3. Não depende apenas de tipoVariacao === 'P' — verifica se há variações no detalhe
//   4. Adiciona delay entre chamadas à Tiny para evitar 429 (rate limit)
// ============================================================================

async getAdsBySku(req, res) {
    try {
        const { sku, userId } = req.body;
        if (!sku || !userId) return res.status(400).json({ erro: "SKU e userId são obrigatórios." });

        // Helper de delay para respeitar o rate limit da Tiny
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Determina quais SKUs buscar no ML (pode ser o original ou os filhos de variação da Tiny)
        let skusParaBuscar = [sku];

        // =====================================================================
        // FASE 1: Consulta a Tiny para verificar se o produto tem variações
        // =====================================================================
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { tinyToken: true } });
        if (user?.tinyToken) {
            try {
                // Pesquisa o produto pelo SKU na Tiny
                const tinySearchRes = await axios.post(
                    'https://api.tiny.com.br/api2/produtos.pesquisa.php',
                    new URLSearchParams({ token: user.tinyToken, formato: 'JSON', pesquisa: sku })
                );
                const tinyRetorno = tinySearchRes.data?.retorno;

                if (tinyRetorno?.status === 'OK' && tinyRetorno.produtos?.length > 0) {
                    // Encontra o produto cujo código bate exatamente com o SKU buscado
                    const produtoEncontrado = tinyRetorno.produtos
                        .map(p => p.produto)
                        .find(p => String(p.codigo).trim() === String(sku).trim());

                    // ✅ CORREÇÃO: Verifica tipoVariacao OU busca detalhes para confirmar
                    const ehPai = produtoEncontrado?.tipoVariacao === 'P';
                    const temVariacoesNaPesquisa = produtoEncontrado?.tipoVariacao === 'P' 
                        || produtoEncontrado?.classe_produto === 'V';

                    if (produtoEncontrado && (ehPai || temVariacoesNaPesquisa)) {
                        // Produto pai: busca os detalhes completos para obter as variações
                        await delay(350); // Respeita rate limit da Tiny
                        const tinyDetalheRes = await axios.post(
                            'https://api.tiny.com.br/api2/produto.obter.php',
                            new URLSearchParams({ token: user.tinyToken, formato: 'JSON', id: produtoEncontrado.id })
                        );
                        const produtoDetalhado = tinyDetalheRes.data?.retorno?.produto;

                        if (produtoDetalhado) {
                            // ✅ CORREÇÃO 1: Trata variacoes como Object OU Array
                            let variacoesTiny = produtoDetalhado.variacoes || [];
                            if (variacoesTiny && !Array.isArray(variacoesTiny)) {
                                variacoesTiny = Object.values(variacoesTiny);
                            }

                            if (variacoesTiny.length > 0) {
                                // Tenta primeiro pegar os códigos direto das variações do pai
                                let codigosFilhos = variacoesTiny
                                    .map(v => v.variacao?.codigo || v.codigo)
                                    .filter(Boolean);

                                // ✅ CORREÇÃO 2: Se os códigos vieram vazios, busca cada filho individualmente
                                if (codigosFilhos.length === 0) {
                                    console.log(`[getAdsBySku] Códigos dos filhos não encontrados no pai. Buscando detalhes individuais...`);
                                    
                                    for (const v of variacoesTiny) {
                                        const idFilho = v.variacao?.idProdutoFilho 
                                            || v.idProdutoFilho 
                                            || v.variacao?.id 
                                            || v.id;
                                        
                                        if (!idFilho) continue;

                                        try {
                                            await delay(350); // Rate limit da Tiny
                                            const detFilho = await axios.post(
                                                'https://api.tiny.com.br/api2/produto.obter.php',
                                                new URLSearchParams({ token: user.tinyToken, formato: 'JSON', id: idFilho })
                                            );
                                            const codigoFilho = detFilho.data?.retorno?.produto?.codigo;
                                            if (codigoFilho) {
                                                codigosFilhos.push(codigoFilho);
                                            }
                                        } catch (errFilho) {
                                            console.error(`[getAdsBySku] Erro ao buscar filho ${idFilho}:`, errFilho.message);
                                        }
                                    }
                                }

                                if (codigosFilhos.length > 0) {
                                    // No ML, o pai não tem SKU — apenas os filhos têm. Busca pelos códigos dos filhos.
                                    console.log(`[getAdsBySku] Produto pai "${sku}" -> Filhos encontrados: [${codigosFilhos.join(', ')}]`);
                                    skusParaBuscar = codigosFilhos;
                                }
                            }
                        }
                    } 
                    // ✅ CORREÇÃO 3: Se não achou na pesquisa, tenta buscar detalhes direto 
                    // (caso a pesquisa não retorne tipoVariacao mas o produto tenha variações)
                    else if (produtoEncontrado && !produtoEncontrado.tipoVariacao) {
                        await delay(350);
                        const tinyDetalheRes = await axios.post(
                            'https://api.tiny.com.br/api2/produto.obter.php',
                            new URLSearchParams({ token: user.tinyToken, formato: 'JSON', id: produtoEncontrado.id })
                        );
                        const produtoDetalhado = tinyDetalheRes.data?.retorno?.produto;
                        
                        if (produtoDetalhado) {
                            let variacoesTiny = produtoDetalhado.variacoes || [];
                            if (variacoesTiny && !Array.isArray(variacoesTiny)) {
                                variacoesTiny = Object.values(variacoesTiny);
                            }

                            if (variacoesTiny.length > 0) {
                                let codigosFilhos = variacoesTiny
                                    .map(v => v.variacao?.codigo || v.codigo)
                                    .filter(Boolean);

                                // Se códigos vazios, busca individualmente
                                if (codigosFilhos.length === 0) {
                                    for (const v of variacoesTiny) {
                                        const idFilho = v.variacao?.idProdutoFilho 
                                            || v.idProdutoFilho 
                                            || v.variacao?.id 
                                            || v.id;
                                        if (!idFilho) continue;

                                        try {
                                            await delay(350);
                                            const detFilho = await axios.post(
                                                'https://api.tiny.com.br/api2/produto.obter.php',
                                                new URLSearchParams({ token: user.tinyToken, formato: 'JSON', id: idFilho })
                                            );
                                            const codigoFilho = detFilho.data?.retorno?.produto?.codigo;
                                            if (codigoFilho) codigosFilhos.push(codigoFilho);
                                        } catch (errFilho) {
                                            console.error(`[getAdsBySku] Erro ao buscar filho ${idFilho}:`, errFilho.message);
                                        }
                                    }
                                }

                                if (codigosFilhos.length > 0) {
                                    console.log(`[getAdsBySku] Produto "${sku}" tem variações ocultas -> Filhos: [${codigosFilhos.join(', ')}]`);
                                    skusParaBuscar = codigosFilhos;
                                }
                            }
                        }
                    }
                }
            } catch (tinyErr) {
                console.error('[getAdsBySku] Erro ao consultar Tiny, continuando com SKU original:', tinyErr.message);
            }
        }

        console.log(`[getAdsBySku] SKUs que serão buscados no ML: [${skusParaBuscar.join(', ')}]`);

        // =====================================================================
        // FASE 2: Busca nas contas do ML usando os SKUs (original ou filhos)
        // =====================================================================
        const contas = await prisma.contaML.findMany({ where: { userId } });
        if (contas.length === 0) return res.json([]);

        let anunciosEncontrados = [];
        const idsJaAdicionados = new Set();

        for (const conta of contas) {
            try {
                let activeToken = conta.accessToken;
                
                // ✅ CORREÇÃO: Só renova se o token vencer em menos de 5 minutos
                const margemSeguranca = 5 * 60 * 1000; // 5 minutos em milissegundos
                const agora = Date.now();
                const expiresAtNum = Number(conta.expiresAt); // O Prisma traz como BigInt

                if (agora + margemSeguranca >= expiresAtNum) {
                    console.log(`[Token] Renovando token expirado para a conta ${conta.id}...`);
                    const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch((err) => {
                        console.error(`[Token] Erro ao renovar:`, err?.response?.data || err.message);
                        return null;
                    });

                    if (tokenRefreshRes && tokenRefreshRes.access_token) {
                        activeToken = tokenRefreshRes.access_token;
                        
                        await prisma.contaML.update({
                            where: { id: conta.id },
                            data: { 
                                accessToken: activeToken, 
                                refreshToken: tokenRefreshRes.refresh_token,
                                expiresAt: BigInt(Date.now() + (tokenRefreshRes.expires_in * 1000))
                            }
                        });
                    }
                }

                // Pesquisa no ML para cada SKU (original ou filhos de variação)
                for (const skuBusca of skusParaBuscar) {
                    const idsEncontrados = await mlService.searchBySellerSku(conta.id, skuBusca, activeToken);
                    // ... (resto do seu código continua igual a partir daqui)
                    for (const itemId of idsEncontrados) {
                        if (idsJaAdicionados.has(itemId)) continue;
                        idsJaAdicionados.add(itemId);

                        const adData = await mlService.getSingleAdDetails(itemId, activeToken);
                        const primaryTag = getPrimaryTag(adData);

                        // Extrai o SKU, verificando se ele pertence a uma variação
                        let savedSku = extractSellerSku(adData);
                        
                        // Se o SKU extraído não é o original, tenta achar nas variações
                        if (savedSku !== sku && adData.variations && adData.variations.length > 0) {
                            // Verifica se alguma variação tem o SKU original OU o SKU filho que buscamos
                            const varMatch = adData.variations.find(v =>
                                v.attributes?.some(a => a.id === 'SELLER_SKU' && 
                                    (a.value_name === sku || skusParaBuscar.includes(a.value_name))
                                )
                            );
                            if (varMatch) {
                                // Salva com o SKU pai para manter a consistência na busca
                                savedSku = sku;
                            }
                        }

                        // Salva no banco de dados local
                        const adSalvo = await prisma.anuncioML.upsert({
                            where: { id: adData.id },
                            update: {
                                titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price, status: adData.status,
                                estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
                                thumbnail: adData.thumbnail, permalink: adData.permalink,
                                sku: savedSku,
                                tagPrincipal: primaryTag,
                                dadosML: adData,
                            },
                            create: {
                                id: adData.id, contaId: conta.id, titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price,
                                status: adData.status, estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
                                thumbnail: adData.thumbnail, permalink: adData.permalink,
                                sku: savedSku,
                                tagPrincipal: primaryTag,
                                dadosML: adData
                            },
                            include: { conta: { select: { nickname: true } } }
                        });
                        anunciosEncontrados.push(adSalvo);
                    }
                }
            } catch (contaErro) {
                console.error(`[getAdsBySku] Erro ao buscar SKU na conta ${conta.id}:`, contaErro.message);
            }
        }

        console.log(`[getAdsBySku] Total de anúncios encontrados: ${anunciosEncontrados.length}`);
        res.json(anunciosEncontrados);

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
},

async getPerguntas(req, res) {
  try {
    const { userId, status = 'UNANSWERED', limit = 50 } = req.query;

    const contas = await prisma.contaML.findMany({
      where: { userId },
      select: {
        id: true,
        nickname: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true
      }
    });

    if (contas.length === 0) {
      return res.json({ perguntas: [], total: 0 });
    }

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let todasAsPerguntas = [];

    for (const conta of contas) {
      try {
        let activeToken = conta.accessToken;

        // Renova token só se estiver perto de vencer
        if (Date.now() + 300000 >= Number(conta.expiresAt)) {
          const refreshed = await mlService.refreshToken(conta.refreshToken).catch(() => null);

          if (refreshed?.access_token) {
            activeToken = refreshed.access_token;

            await prisma.contaML.update({
              where: { id: conta.id },
              data: {
                accessToken: activeToken,
                refreshToken: refreshed.refresh_token,
                expiresAt: BigInt(Date.now() + (refreshed.expires_in * 1000))
              }
            });
          }
        }

        console.log('[getPerguntas] Buscando perguntas da conta:', {
          contaId: conta.id,
          nickname: conta.nickname,
          status,
          limit
        });

        const mlRes = await axios.get(
          `https://api.mercadolibre.com/questions/search?seller_id=${conta.id}&api_version=4&status=${status}&limit=${limit}`,
          {
            headers: { Authorization: `Bearer ${activeToken}` },
            timeout: 15000
          }
        );

        const questions = mlRes.data.questions || [];

        for (const q of questions) {
          const salva = await prisma.perguntaML.upsert({
            where: { id: String(q.id) },
            update: {
              status: q.status,
              textoResposta: q.answer?.text || null,
              dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
              dadosML: q
            },
            create: {
              id: String(q.id),
              contaId: conta.id,
              itemId: q.item_id,
              compradorId: String(q.from?.id || ''),
              textoPergunta: q.text,
              textoResposta: q.answer?.text || null,
              status: q.status,
              dataCriacao: new Date(q.date_created),
              dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
              dadosML: q
            }
          });

          todasAsPerguntas.push({
            ...salva,
            contaId: conta.id,
            contaNickname: conta.nickname,
            item_id: salva.itemId,
            text: salva.textoPergunta,
            date_created: salva.dataCriacao,
            dadosML: q
          });
        }

        // pequeno respiro entre contas para reduzir 429
        await delay(900);

      } catch (e) {
        console.error(
          `[getPerguntas] Erro ao buscar da conta ${conta.nickname}:`,
          e.response?.data || e.message
        );

        // espera extra quando vier rate limit
        if (e.response?.status === 429) {
          await delay(5000);
        }
      }
    }

    todasAsPerguntas.sort(
      (a, b) => new Date(b.date_created) - new Date(a.date_created)
    );

    res.json({
      perguntas: todasAsPerguntas,
      total: todasAsPerguntas.length
    });

  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
},

async getItemPerguntas(req, res) {
  try {
    const { itemId, contaId, userId } = req.query;

    const conta = await prisma.contaML.findFirst({
      where: { id: contaId, userId }
    });

    if (!conta) {
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }

    let activeToken = conta.accessToken;

    if (Date.now() + 300000 >= Number(conta.expiresAt)) {
      const refreshed = await mlService.refreshToken(conta.refreshToken).catch(() => null);

      if (refreshed?.access_token) {
        activeToken = refreshed.access_token;

        await prisma.contaML.update({
          where: { id: conta.id },
          data: {
            accessToken: activeToken,
            refreshToken: refreshed.refresh_token,
            expiresAt: BigInt(Date.now() + (refreshed.expires_in * 1000))
          }
        });
      }
    }

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let mlRes = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        mlRes = await axios.get(
          `https://api.mercadolibre.com/questions/search?item=${itemId}&api_version=4&limit=50&sort_fields=date_created&sort_types=ASC`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
        break;
      } catch (error) {
        if (error.response?.status === 429 && attempt < 3) {
          await delay(attempt * 5000);
          continue;
        }
        throw error;
      }
    }

    const formatadas = mlRes?.data?.questions || [];
    res.json({ questions: formatadas });

  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
},

async responderPergunta(req, res) {
  try {
    const { questionId, text, contaId, userId } = req.body;

    if (!questionId || !text || !contaId || !userId) {
      return res.status(400).json({ erro: 'Parâmetros incompletos.' });
    }

    const conta = await prisma.contaML.findFirst({
      where: { id: contaId, userId }
    });

    if (!conta) {
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }

    let activeToken = conta.accessToken;
    const margemSeguranca = 5 * 60 * 1000;

    if (Date.now() + margemSeguranca >= Number(conta.expiresAt)) {
      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);

      if (tokenRefreshRes?.access_token) {
        activeToken = tokenRefreshRes.access_token;

        await prisma.contaML.update({
          where: { id: conta.id },
          data: {
            accessToken: activeToken,
            refreshToken: tokenRefreshRes.refresh_token,
            expiresAt: BigInt(Date.now() + (tokenRefreshRes.expires_in * 1000))
          }
        });
      }
    }

    let result = null;
    const maxRetries = 4;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await mlService.answerQuestion(questionId, text, activeToken);
        break;
      } catch (apiErr) {
        const is429 = apiErr.response?.status === 429;

        if (is429 && attempt < maxRetries) {
          const waits = [5000, 10000, 20000];
          const waitTime = waits[attempt - 1] || 20000;

          console.warn(
            `⏳ [responderPergunta] Rate Limit (429). Tentativa ${attempt}/${maxRetries}. Aguardando ${waitTime}ms...`
          );

          await delay(waitTime);
          continue;
        }

        throw apiErr;
      }
    }

    try {
      await prisma.perguntaML.update({
        where: { id: String(questionId) },
        data: {
          status: 'ANSWERED',
          textoResposta: text,
          dataResposta: new Date()
        }
      });
    } catch (e) {
      console.error('Aviso: falha ao atualizar banco local', e.message);
    }

    res.json(result);

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data?.message || error.message
    });
  }
},

  async excluirPergunta(req, res) {
    try {
      const { questionId } = req.params;
      const { contaId, userId } = req.query;
      if (!questionId || !contaId || !userId) return res.status(400).json({ erro: 'Parâmetros incompletos.' });

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });

      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
      const activeToken = tokenRefreshRes ? tokenRefreshRes.access_token : conta.accessToken;
      if (tokenRefreshRes) {
        await prisma.contaML.update({
          where: { id: conta.id },
          data: { accessToken: activeToken, refreshToken: tokenRefreshRes.refresh_token }
        });
      }

      // ✅ CORREÇÃO: Retry (Backoff) para exclusão de perguntas
      let result = null;
      let maxRetries = 3;
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          result = await mlService.deleteQuestion(questionId, activeToken);
          break; // Sucesso
        } catch (apiErr) {
          if (apiErr.response?.status === 429 && attempt < maxRetries) {
             await delay(attempt * 2000);
          } else {
             throw apiErr;
          }
        }
      }

      res.json(result);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: error.response?.data?.message || error.message });
    }
  },

async corrigirPreco(req, res) {
    try {
      const { userId, items, preco, modoPrecoIndividual, removerPromocoes } = req.body;
      if (!userId || !items || !Array.isArray(items)) {
        return res.status(400).json({ erro: 'Parâmetros incompletos.' });
      }

      // Cria a tarefa na interface para o usuário acompanhar
      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId: userId,
          tipo: 'Corrigir Preço em Massa',
          alvo: `${items.length} anúncio(s)`,
          conta: 'Várias Contas',
          status: 'PENDENTE'
        }
      });

      // Adiciona o job na nova fila
      const job = await priceQueue.add('update-price', {
        tarefaId: tarefa.id,
        userId,
        items,
        modoPrecoIndividual,
        precoGeral: preco,
        removerPromocoes
      });

      // Atualiza o ID do Job na tarefa
      await prisma.tarefaFila.update({
        where: { id: tarefa.id },
        data: { jobId: job.id }
      });

      res.json({ 
        ok: true, 
        message: 'Lote enviado para a fila de processamento.', 
        jobId: job.id 
      });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao enfileirar correção de preço', detalhes: error.message });
    }
  },

// Recebe notificações do Mercado Livre em tempo real
  async handleWebhook(req, res) {
    // O ML exige que você responda 200 imediatamente
    res.status(200).send('OK');

    const { topic, resource, user_id } = req.body;

    // Só nos importamos com perguntas
    if (topic === 'questions' || topic === 'questions_answers') {
      try {
        const contaId = String(user_id);
        const conta = await prisma.contaML.findUnique({ where: { id: contaId } });
        if (!conta) return;

        // Garante token atualizado
        let activeToken = conta.accessToken;
        if (Date.now() + 300000 >= Number(conta.expiresAt)) {
          const refreshed = await mlService.refreshToken(conta.refreshToken).catch(() => null);
          if (refreshed?.access_token) {
            activeToken = refreshed.access_token;
            await prisma.contaML.update({
              where: { id: conta.id },
              data: { accessToken: activeToken, refreshToken: refreshed.refresh_token, expiresAt: BigInt(Date.now() + (refreshed.expires_in * 1000)) }
            });
          }
        }

        // Busca o detalhe da pergunta no ML
        const questionId = resource.split('/').pop();
        const mlRes = await axios.get(`https://api.mercadolibre.com/questions/${questionId}?api_version=4`, {
          headers: { Authorization: `Bearer ${activeToken}` }
        });
        const q = mlRes.data;

        // Salva/Atualiza no nosso banco de dados
        await prisma.perguntaML.upsert({
          where: { id: String(q.id) },
          update: {
            textoResposta: q.answer?.text || null,
            status: q.status,
            dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
            dadosML: q
          },
          create: {
            id: String(q.id),
            contaId: contaId,
            itemId: q.item_id,
            compradorId: String(q.from?.id || ''),
            textoPergunta: q.text,
            textoResposta: q.answer?.text || null,
            status: q.status,
            dataCriacao: new Date(q.date_created),
            dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
            dadosML: q
          }
        });

        console.log(`✅ [Webhook] Pergunta ${q.id} salva/atualizada com sucesso!`);
      } catch (error) {
        console.error('❌ [Webhook] Erro ao processar pergunta:', error.message);
      }
    }
  },

  // Rota auxiliar para puxar as antigas (carga inicial)
async syncPerguntasIniciais(req, res) {
  res.json({ message: 'Iniciando sincronização de perguntas em background.' });

  try {
    const contas = await prisma.contaML.findMany();
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const conta of contas) {
      try {
        let activeToken = conta.accessToken;

        if (Date.now() + 300000 >= Number(conta.expiresAt)) {
          const refreshed = await mlService.refreshToken(conta.refreshToken).catch(() => null);

          if (refreshed?.access_token) {
            activeToken = refreshed.access_token;

            await prisma.contaML.update({
              where: { id: conta.id },
              data: {
                accessToken: activeToken,
                refreshToken: refreshed.refresh_token,
                expiresAt: BigInt(Date.now() + (refreshed.expires_in * 1000))
              }
            });
          }
        }

        const unansRes = await axios.get(
          `https://api.mercadolibre.com/questions/search?seller_id=${conta.nickname}&api_version=4&status=UNANSWERED&limit=50`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        ).catch(() => ({ data: { questions: [] } }));

        await delay(800);

        const ansRes = await axios.get(
          `https://api.mercadolibre.com/questions/search?seller_id=${conta.nickname}&api_version=4&status=ANSWERED&limit=50`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        ).catch(() => ({ data: { questions: [] } }));

        const allQ = [
          ...(unansRes.data.questions || []),
          ...(ansRes.data.questions || [])
        ];

        for (const q of allQ) {
          await prisma.perguntaML.upsert({
            where: { id: String(q.id) },
            update: {
              status: q.status,
              textoResposta: q.answer?.text || null,
              dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
              dadosML: q
            },
            create: {
              id: String(q.id),
              contaId: conta.id,
              itemId: q.item_id,
              compradorId: String(q.from?.id || ''),
              textoPergunta: q.text,
              textoResposta: q.answer?.text || null,
              status: q.status,
              dataCriacao: new Date(q.date_created),
              dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
              dadosML: q
            }
          });
        }

        await delay(1200);

      } catch (error) {
        console.error(`[syncPerguntasIniciais] Erro na conta ${conta.nickname}:`, error.message);

        if (error.response?.status === 429) {
          await delay(5000);
        }
      }
    }

    console.log('✅ Sincronização inicial de perguntas concluída.');
  } catch (error) {
    console.error('❌ Erro na sincronização inicial de perguntas:', error.message);
  }
},

};
