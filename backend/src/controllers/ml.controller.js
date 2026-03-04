import { mlService } from '../services/ml.service.js';
import { config } from '../config/env.js';
import prisma from '../config/prisma.js';
import { mlSyncQueue, publishQueue } from '../workers/queue.js';

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

  async syncAds(req, res) {
    try {
      const { contaId } = req.body;
      const conta = await prisma.contaML.findUnique({ where: { id: contaId } });
      if (!conta) return res.status(404).json({ erro: "Conta não encontrada" });

      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
      let activeToken = conta.accessToken;
      
      if (tokenRefreshRes) {
         activeToken = tokenRefreshRes.access_token;
         await prisma.contaML.update({
             where: { id: contaId },
             data: { 
                 accessToken: activeToken, 
                 refreshToken: tokenRefreshRes.refresh_token, 
                 expiresAt: BigInt(Date.now() + (tokenRefreshRes.expires_in * 1000)) 
             }
         });
      }

      const job = await mlSyncQueue.add('sync-ml', { contaId, accessToken: activeToken });
      res.json({ jobId: job.id, message: 'Varredura ML iniciada' });
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

  async getAdsBySku(req, res) {
    try {
        const { sku, userId } = req.body;
        if (!sku || !userId) return res.status(400).json({ erro: "SKU e userId são obrigatórios." });

        const contas = await prisma.contaML.findMany({ where: { userId } });
        if (contas.length === 0) return res.json([]);

        let anunciosEncontrados = [];

        for (const conta of contas) {
            const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
            let activeToken = tokenRefreshRes ? tokenRefreshRes.access_token : conta.accessToken;
            if(tokenRefreshRes) await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: activeToken }});
            
            const idsEncontrados = await mlService.searchBySellerSku(conta.id, sku, activeToken);

            for (const itemId of idsEncontrados) {
                const adData = await mlService.getSingleAdDetails(itemId, activeToken);
                
                // ✅ NOVO: Calcula a tag principal
                const primaryTag = getPrimaryTag(adData);
                
                const adSalvo = await prisma.anuncioML.upsert({
                  where: { id: adData.id },
                  update: {
                     titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price, status: adData.status,
                     estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
                     thumbnail: adData.thumbnail, permalink: adData.permalink, sku: extractSellerSku(adData), 
                     tagPrincipal: primaryTag,  // ✅ NOVO
                     dadosML: adData,
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
                anunciosEncontrados.push(adSalvo);
            }
        }
        res.json(anunciosEncontrados);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
  }
};
