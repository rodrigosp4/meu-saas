import { mlService } from '../services/ml.service.js';
import { config } from '../config/env.js';
import prisma from '../config/prisma.js';
import { mlSyncQueue, publishQueue, priceQueue, priceCheckQueue, acoesMassaQueue } from '../workers/queue.js';
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
    // ✅ ADICIONADO: Fallback para PART_NUMBER conforme lógica do python
    const partAttr = itemData.attributes.find(a => a.id === 'PART_NUMBER');
    if (partAttr && partAttr.value_name && partAttr.value_name !== '-1') {
      return partAttr.value_name;
    }
  }
  return itemData.seller_custom_field || null;
}

function extractVariationSkus(itemData) {
  if (!itemData.variations || !Array.isArray(itemData.variations)) return [];
  return itemData.variations.flatMap(v => {
    const attr = v.attributes?.find(a => a.id === 'SELLER_SKU');
    return (attr && attr.value_name && attr.value_name !== '-1') ? [attr.value_name] : [];
  });
}

export const mlController = {
  async handleCallback(req, res) {
    const { code } = req.query;
    if (code) {
      return res.redirect(`${config.frontendUrl}/?code=${code}`);
    }
    res.send('Servidor backend do MELIUNLOCKER está online.');
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

  async getItemCategory(req, res) {
    try {
      const { itemId } = req.params;
      // Primeiro tenta no banco
      const ad = await prisma.anuncioML.findUnique({
        where: { id: itemId },
        select: { dadosML: true, contaId: true }
      });
      const catFromDb = ad?.dadosML?.category_id;
      if (catFromDb) return res.json({ category_id: catFromDb });
      // Fallback: busca da API do ML usando o token da conta do anúncio
      if (!ad?.contaId) return res.json({ category_id: null });
      const conta = await prisma.contaML.findUnique({ where: { id: ad.contaId } });
      if (!conta) return res.json({ category_id: null });
      let token = conta.accessToken;
      try {
        const refreshed = await mlService.refreshToken(conta.refreshToken);
        if (refreshed?.access_token) token = refreshed.access_token;
      } catch {}
      const mlRes = await axios.get(
        `https://api.mercadolibre.com/items/${itemId}?attributes=category_id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.json({ category_id: mlRes.data?.category_id || null });
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar categoria do item' });
    }
  },

  async getItemDescription(req, res) {
    try {
      const { itemId } = req.params;
      const ad = await prisma.anuncioML.findUnique({
        where: { id: itemId },
        select: { contaId: true }
      });
      if (!ad?.contaId) return res.json({ descricao: '' });
      const conta = await prisma.contaML.findUnique({ where: { id: ad.contaId } });
      if (!conta) return res.json({ descricao: '' });
      let token = conta.accessToken;
      try {
        const refreshed = await mlService.refreshToken(conta.refreshToken);
        if (refreshed?.access_token) token = refreshed.access_token;
      } catch {}
      const mlRes = await axios.get(
        `https://api.mercadolibre.com/items/${itemId}/description`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => null);
      res.json({ descricao: mlRes?.data?.plain_text || '' });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao buscar descrição' });
    }
  },

  async _getTokenHeaders(userId) {
    if (!userId) return {};
    const conta = await prisma.contaML.findFirst({ where: { userId } });
    if (!conta) return {};
    try {
      const refreshed = await mlService.refreshToken(conta.refreshToken);
      const token = refreshed?.access_token || conta.accessToken;
      if (refreshed?.access_token) {
        await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
      }
      return { Authorization: `Bearer ${token}` };
    } catch {
      return { Authorization: `Bearer ${conta.accessToken}` };
    }
  },

  async getItemCloneData(req, res) {
    try {
      const { itemId } = req.params;
      const { userId, contaId } = req.query;

      // Tenta usar o token da conta dona do item (evita 403)
      let headers = {};
      const contaAlvo = contaId
        ? await prisma.contaML.findUnique({ where: { id: contaId } })
        : await prisma.anuncioML.findUnique({ where: { id: itemId }, select: { contaId: true } })
            .then(ad => ad?.contaId ? prisma.contaML.findUnique({ where: { id: ad.contaId } }) : null);

      if (contaAlvo) {
        try {
          const refreshed = await mlService.refreshToken(contaAlvo.refreshToken);
          const token = refreshed?.access_token || contaAlvo.accessToken;
          headers = { Authorization: `Bearer ${token}` };
        } catch { headers = { Authorization: `Bearer ${contaAlvo.accessToken}` }; }
      } else {
        headers = await mlController._getTokenHeaders(userId);
      }

      const [itemRes, descRes] = await Promise.allSettled([
        axios.get(`https://api.mercadolibre.com/items/${itemId}?include_attributes=all`, { headers }),
        axios.get(`https://api.mercadolibre.com/items/${itemId}/description`, { headers }),
      ]);

      if (itemRes.status === 'rejected') {
        const status = itemRes.reason?.response?.status || 404;
        const msg = itemRes.reason?.response?.data?.message || 'Item não encontrado no Mercado Livre';
        return res.status(status).json({ erro: msg });
      }

      const item = itemRes.value.data;
      const desc = descRes.status === 'fulfilled' ? descRes.value.data : null;

      res.json({
        id: item.id,
        title: item.title,
        category_id: item.category_id,
        price: item.price,
        available_quantity: item.available_quantity,
        condition: item.condition,
        listing_type_id: item.listing_type_id,
        seller_custom_field: item.seller_custom_field,
        attributes: item.attributes || [],
        pictures: item.pictures || [],
        shipping: item.shipping || {},
        description: desc?.plain_text || desc?.text || '',
        variations: (item.variations || []).map(v => ({
          id: v.id,
          price: v.price,
          available_quantity: v.available_quantity,
          picture_ids: v.picture_ids || [],
          attribute_combinations: v.attribute_combinations || [],
          attributes: v.attributes || [],
        })),
      });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao buscar dados do item para clonagem' });
    }
  },

// Produto de catálogo (MLBU... ou MLB numérico de catálogo)
  async getProdutoCloneData(req, res) {
    try {
      const { produtoId } = req.params;
      const { userId, itemId } = req.query;
      const headers = await mlController._getTokenHeaders(userId);

      // Define se vai usar a rota de catálogo geral (/products) ou do vendedor (/user-products)
      const urlAlvo = (produtoId.startsWith('MLB') && !produtoId.startsWith('MLBU'))
        ? `https://api.mercadolibre.com/products/${produtoId}`
        : `https://api.mercadolibre.com/user-products/${produtoId}`;

      const requests = [
        axios.get(urlAlvo, { headers }),
      ];
      if (itemId) {
        requests.push(axios.get(`https://api.mercadolibre.com/items/${itemId}/description`, { headers }));
      }

      const [prodResult, descResult] = await Promise.allSettled(requests);

      if (prodResult.status === 'rejected') {
        const status = prodResult.reason?.response?.status || 404;
        const msg = prodResult.reason?.response?.data?.message || 'Produto de catálogo não encontrado';
        return res.status(status).json({ erro: msg });
      }

      const prod = prodResult.value.data;
      const desc = descResult?.status === 'fulfilled' ? descResult.value.data : null;

      const pictures = (prod.pictures ||[]).map(p => ({
        id: p.id,
        secure_url: p.secure_url || p.url,
        url: p.secure_url || p.url,
      }));

      const attributes = (prod.attributes ||[]).map(a => ({
        id: a.id,
        name: a.name,
        values: a.values ||[{ name: a.value_name || '' }],
        value_name: a.value_name || ''
      }));

      // Verifica se category_id é válido (formato MLB + dígitos)
      const rawCategoryId = prod.category_id || '';
      const categoryValida = /^MLB\d+$/.test(rawCategoryId);

      let categoryId = categoryValida ? rawCategoryId : '';
      let categoryOpcoes =[];
      let categorySugerida = false;

      // Se não tem categoria válida (em /products só vem o domain_id), busca pelo domínio ou prediz pelo título
      if (!categoryValida) {
        let categoriaResolvida = false;

        // 1. TENTA CONVERTER O DOMAIN_ID NA CATEGORIA EXATA (Recomendação oficial do ML)
        if (prod.domain_id) {
          try {
            const domainRes = await axios.get(`https://api.mercadolibre.com/catalog_domains/${prod.domain_id}/categories`);
            if (domainRes.data && domainRes.data.length > 0) {
              categoryId = domainRes.data[0].id;
              
              // Opcional: buscar o caminho completo da categoria para ficar bonito no front
              let categoryName = domainRes.data[0].name;
              try {
                const catDetails = await axios.get(`https://api.mercadolibre.com/categories/${categoryId}`);
                if (catDetails.data && catDetails.data.path_from_root) {
                  categoryName = catDetails.data.path_from_root.map(p => p.name).join(' > ');
                }
              } catch (e) {}

              categoryOpcoes = [{ category_id: categoryId, category_name: categoryName }];
              categorySugerida = false; // False pois é a categoria exata do catálogo, não uma "sugestão"
              categoriaResolvida = true;
            }
          } catch (domainErr) {
            console.warn(`Aviso: Não foi possível converter o domínio ${prod.domain_id} em categoria.`);
          }
        }

        // 2. FALLBACK: Se falhar pelo domínio, tenta adivinhar pelo título (Como era antes)
        if (!categoriaResolvida) {
          const titulo = prod.name || prod.title || prod.family_name || '';
          if (titulo) {
            try {
              const predRes = await axios.get(
                `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(titulo)}`
              );
              const opcoes = predRes.data ||[];
              categoryOpcoes = await Promise.all(opcoes.map(async o => {
                try {
                  const catRes = await axios.get(`https://api.mercadolibre.com/categories/${o.category_id}`);
                  if (catRes.data && catRes.data.path_from_root) {
                    return { category_id: o.category_id, category_name: catRes.data.path_from_root.map(p => p.name).join(' > ') };
                  }
                } catch (e) {}
                return { category_id: o.category_id, category_name: o.category_name };
              }));
              if (categoryOpcoes.length > 0) {
                categoryId = categoryOpcoes[0].category_id;
                categorySugerida = true; // Avisa o usuário que foi adivinhado
              }
            } catch {}
          }
        }
      }

      // O texto da descrição vem de item associado, ou do text_plain, ou do fallback do catálogo
      const descricaoFinal = desc?.plain_text || desc?.text || prod.short_description?.content || '';

      res.json({
        id: prod.id || produtoId,
        title: prod.name || prod.title || prod.family_name || '',
        category_id: categoryId,
        category_sugerida: categorySugerida,
        category_opcoes: categoryOpcoes,
        price: prod.price || null,
        available_quantity: prod.available_quantity || 1,
        condition: prod.condition || 'new',
        listing_type_id: prod.listing_type_id || 'gold_special',
        seller_custom_field: prod.seller_custom_field || '',
        attributes,
        pictures,
        shipping: prod.shipping || {},
        description: descricaoFinal,
        _tipo: 'produto_catalogo',
      });
    } catch (error) {
      const status = error.response?.status || 500;
      const msg = error.response?.data?.message || 'Produto de catálogo não encontrado';
      res.status(status).json({ erro: msg });
    }
  },

  async getItemPictures(req, res) {
    try {
      const { itemId } = req.params;
      const ad = await prisma.anuncioML.findUnique({
        where: { id: itemId },
        select: { contaId: true, dadosML: true }
      });
      if (!ad?.contaId) return res.json({ pictures: [] });
      // Se já tem pictures no dadosML, retorna direto
      if (ad.dadosML?.pictures?.length) return res.json({ pictures: ad.dadosML.pictures });
      const conta = await prisma.contaML.findUnique({ where: { id: ad.contaId } });
      if (!conta) return res.json({ pictures: [] });
      let token = conta.accessToken;
      try {
        const refreshed = await mlService.refreshToken(conta.refreshToken);
        if (refreshed?.access_token) token = refreshed.access_token;
      } catch {}
      const mlRes = await axios.get(
        `https://api.mercadolibre.com/items/${itemId}?attributes=pictures`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => null);
      res.json({ pictures: mlRes?.data?.pictures || [] });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao buscar imagens' });
    }
  },

  async gerarDescricaoIA(req, res) {
    try {
      const { titulo, categoria, atributos, instrucao } = req.body;
      const GEMINI_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_KEY) return res.status(400).json({ erro: 'GEMINI_API_KEY não configurada no .env' });
      const prompt = `Você é um especialista em e-commerce no Mercado Livre Brasil.
Gere uma descrição de produto atraente, clara e persuasiva em português.
Produto: ${titulo}
Categoria: ${categoria || 'não informada'}
Atributos: ${atributos || 'não informados'}
${instrucao ? `Instrução adicional: ${instrucao}` : ''}
Escreva uma descrição de 3 a 5 parágrafos, sem usar markdown, apenas texto simples.`;
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        { contents: [{ parts: [{ text: prompt }] }] }
      );
      const texto = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      res.json({ descricao: texto });
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: error.response?.data?.error?.message || error.message });
    }
  },

  async predictCategory(req, res) {
    try {
      const data = await mlService.predictCategory(req.query.title);
      const enhanced = await Promise.all(data.map(async (cat) => {
        try {
          const catRes = await axios.get(`https://api.mercadolibre.com/categories/${cat.category_id}`);
          if (catRes.data && catRes.data.path_from_root) {
            cat.category_name = catRes.data.path_from_root.map(p => p.name).join(' > ');
          }
        } catch (e) {}
        return cat;
      }));
      res.json(enhanced);
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao prever' });
    }
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

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { cepOrigem: true } });
      const cepOrigem = user?.cepOrigem || '01001000';

      const results = {};
      const contasCache = {};

      // Quebra a simulação em pacotes de 10 em 10 para não tomar bloqueio (Rate Limit 429) do ML
      const chunkSize = 10;

      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);

        await Promise.all(chunk.map(async ({ itemId, contaId }) => {
          try {
            if (!contasCache[contaId]) {
               const c = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
               if (c) {
                  const tokenRes = await mlService.refreshToken(c.refreshToken).catch(() => null);
                  if (tokenRes) {
                     c.accessToken = tokenRes.access_token;
                     await prisma.contaML.update({ where: { id: c.id }, data: { accessToken: tokenRes.access_token, refreshToken: tokenRes.refresh_token }});
                  }
               }
               contasCache[contaId] = c;
            }
            const conta = contasCache[contaId];
            if (!conta) return;

            const anuncio = await prisma.anuncioML.findUnique({ where: { id: itemId } });
            if (!anuncio) return;

            const dadosML = anuncio.dadosML || {};
            const categoryId = dadosML.category_id;
            const listingTypeId = dadosML.listing_type_id || 'gold_pro';
            const itemPrice = anuncio.preco || 0;

            // Para itens existentes: usa item_id (frete real do produto)
            // Para itens novos (sem id no ML): usa dimensions como fallback
            if (categoryId && itemPrice >= 79 && conta.logistica !== 'ME1') {
              results[itemId] = await mlService.simulateShipping({
                accessToken: conta.accessToken,
                sellerId: conta.id,
                itemPrice,
                categoryId,
                listingTypeId,
                zipCode: cepOrigem,
                itemId,
                dimensions: '20x15x10,500'
              });
            } else {
              results[itemId] = 0;
            }
          } catch (e) {
            results[itemId] = 0;
          }
        }));
        
        // Pequena pausa entre lotes se ainda houver mais itens
        if (i + chunkSize < items.length) {
           await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      res.json({ custos: results });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao buscar custos de frete.' });
    }
  },

async publish(req, res) {
    try {
      // ✅ CORREÇÃO: Adicionado enviarAtacado, inflar e ativarPromocoes
      const { userId, contaNome, sku, accessToken, payload, description, enviarAtacado, inflar, ativarPromocoes, compatibilidades, posicoes } = req.body;

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
        userId,
        contaNome,
        accessToken,
        payload,
        description,
        enviarAtacado,
        inflar,
        ativarPromocoes,
        compatibilidades: compatibilidades || [],
        posicoes: posicoes || [],
      });

      await prisma.tarefaFila.updateMany({
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
        contasIds, search = '', searchType = 'todos', status = 'Todos', tag = 'Todas',
        promo = 'Todos', precoMin = '', precoMax = '', prazo = 'Todos',
        descontoMin = '', descontoMax = '',
        semSku = 'false',
        sortBy = 'padrao',
        priceCheckStatus = 'Todos', userId = '',
        page = 1, limit = 50
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      
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
      const where = {};
      
      if (contasIds) {
        where.contaId = { in: contasIds.split(',') };
      }
      if (status !== 'Todos') where.status = status;
      
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

      if (promo === 'com_desconto') {
        where.precoOriginal = { not: null };
        where.AND = [
          ...(where.AND || []),
          { precoOriginal: { gt: 0 } }
        ];
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

      if (precoMin !== '' && !isNaN(Number(precoMin))) {
        where.preco = { ...(where.preco || {}), gte: Number(precoMin) };
      }
      if (precoMax !== '' && !isNaN(Number(precoMax))) {
        where.preco = { ...(where.preco || {}), lte: Number(precoMax) };
      }

      if (semSku === 'true') {
        where.AND = [
          ...(where.AND || []),
          { OR: [{ sku: null }, { sku: '' }, { sku: '-1' }, { sku: 'S/ SKU' }] },
          { skusVariacoes: { isEmpty: true } }
        ];
      }

      if (search) {
        const searchCondition = searchType === 'titulo' ? [{ titulo: { contains: search, mode: 'insensitive' } }]
          : searchType === 'mlb'    ? [{ id: { contains: search, mode: 'insensitive' } }]
          : searchType === 'sku'    ? [{ sku: { contains: search, mode: 'insensitive' } }, { skusVariacoes: { has: search } }]
          : [
              { titulo: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
              { skusVariacoes: { has: search } },
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

      if (priceCheckStatus !== 'Todos' && userId) {
        const verificacao = await prisma.verificacaoPreco.findUnique({ where: { userId } });
        const resultados = verificacao?.resultados || {};
        const idsMatch = Object.entries(resultados)
          .filter(([, v]) => v?.status === priceCheckStatus)
          .map(([id]) => id);
        where.id = { in: idsMatch };
      }

      let [anuncios, total] = await Promise.all([
        prisma.anuncioML.findMany({
          where, skip, take: Number(limit),
          orderBy: [orderBy, { id: 'asc' }],
          include: { conta: { select: { nickname: true } } }
        }),
        prisma.anuncioML.count({ where })
      ]);
      
      if (promo === 'com_desconto') {
        anuncios = anuncios.filter(ad => ad.precoOriginal && ad.precoOriginal > ad.preco);
        total = anuncios.length;
      }

      if (prazo !== 'Todos') {
        anuncios = anuncios.filter(ad => {
          const dadosML = ad.dadosML || {};
          const saleTerms = dadosML.sale_terms || [];
          const mfgTerm = saleTerms.find(t => t.id === 'MANUFACTURING_TIME');
          
          if (prazo === 'imediato') return !mfgTerm;
          else if (prazo === 'com_prazo') return !!mfgTerm;
          return true;
        });
        total = anuncios.length;
      }
      
      if (descontoMin !== '' || descontoMax !== '') {
        const minDesc = descontoMin !== '' ? Number(descontoMin) : null;
        const maxDesc = descontoMax !== '' ? Number(descontoMax) : null;

        anuncios = anuncios.filter(ad => {
          if (!ad.precoOriginal || ad.precoOriginal <= ad.preco) {
            if (minDesc !== null && 0 < minDesc) return false;
            if (maxDesc !== null && 0 > maxDesc) return false;
            return true;
          }
          const desconto = Math.round(((ad.precoOriginal - ad.preco) / ad.precoOriginal) * 100);
          if (minDesc !== null && desconto < minDesc) return false;
          if (maxDesc !== null && desconto > maxDesc) return false;
          return true;
        });
        total = anuncios.length;
      }
      
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

  // ============================================================
  // Recomendações de Replicação — compara todas as contas do usuário
  // usando os dados do banco (igual ao Gerenciar ML)
  // ============================================================
  async getRecomendacoesReplicacao(req, res) {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const contas = await prisma.contaML.findMany({
        where: { userId },
        select: { id: true, nickname: true },
      });
      if (contas.length < 2) return res.json([]);

      const todosAnuncios = await prisma.anuncioML.findMany({
        where: { contaId: { in: contas.map(c => c.id) }, status: 'active' },
        select: {
          id: true, titulo: true, preco: true, thumbnail: true,
          sku: true, skusVariacoes: true, contaId: true, dadosML: true, estoque: true,
        },
      });

      const normTitle = (t) => (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const temSku = (s) => s && s !== '-1' && s !== 'S/ SKU' && s.trim() !== '';

      // Mapa contaId → nickname
      const contaMap = Object.fromEntries(contas.map(c => [c.id, c.nickname]));

      // Fingerprint de cada anúncio: se tem skusVariacoes usa todas, senão usa sku, senão titulo
      const getFingerprint = (ad) => {
        const vars = Array.isArray(ad.skusVariacoes) ? ad.skusVariacoes.filter(temSku) : [];
        if (vars.length > 0) return `sku:${[...vars].sort().join(',')}`;
        if (temSku(ad.sku)) return `sku:${ad.sku}`;
        return `titulo:${normTitle(ad.titulo)}`;
      };

      // Agrupa por fingerprint → { rep (anúncio representante), contas: Set de contaIds }
      const grupos = new Map();
      for (const ad of todosAnuncios) {
        const fp = getFingerprint(ad);
        if (!grupos.has(fp)) {
          grupos.set(fp, { rep: ad, fp, contasPresentes: new Set() });
        }
        grupos.get(fp).contasPresentes.add(ad.contaId);
        // Prefere o representante da conta com mais info (skusVariacoes populado)
        const g = grupos.get(fp);
        const varsCurrent = Array.isArray(g.rep.skusVariacoes) ? g.rep.skusVariacoes.filter(temSku) : [];
        const varsNew = Array.isArray(ad.skusVariacoes) ? ad.skusVariacoes.filter(temSku) : [];
        if (varsNew.length > varsCurrent.length) g.rep = ad;
      }

      // Filtra grupos que não estão em TODAS as contas
      const resultado = [];
      for (const { rep, contasPresentes } of grupos.values()) {
        const contasAusentes = contas
          .filter(c => !contasPresentes.has(c.id))
          .map(c => ({ contaId: c.id, nickname: c.nickname }));
        if (contasAusentes.length === 0) continue;

        const allSkus = Array.isArray(rep.skusVariacoes) ? rep.skusVariacoes.filter(temSku) : [];
        if (temSku(rep.sku) && !allSkus.includes(rep.sku)) allSkus.unshift(rep.sku);

        // Extract variation details from dadosML
        const dadosML = rep.dadosML || {};
        const varsDetalhes = Array.isArray(dadosML.variations) ? dadosML.variations.map(v => ({
          combinacao: (v.attribute_combinations || []).map(ac => `${ac.name || ac.id}: ${ac.value_name}`).join(' / '),
          sku: (v.attributes || []).find(a => a.id === 'SELLER_SKU')?.value_name || '',
        })).filter(v => v.combinacao) : [];

        resultado.push({
          id: rep.id,
          titulo: rep.titulo,
          preco: rep.preco,
          thumbnail: rep.thumbnail,
          estoque: rep.estoque ?? 0,
          allSkus,
          temVariacoes: varsDetalhes.length > 0,
          variacoes: varsDetalhes,
          listingType: dadosML.listing_type_id === 'gold_pro' ? 'Premium' : 'Clássico',
          contaOrigemNick: contaMap[rep.contaId] || rep.contaId,
          contasAusentes,
        });
      }

      res.json(resultado);
    } catch (e) {
      res.status(500).json({ erro: e.message });
    }
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
// ============================================================================
  // Retorna IDs e dados mínimos para "Selecionar Todos os Filtrados"
  // ============================================================================
  async getAdIds(req, res) {
    try {
      const {
        contasIds, search = '', searchType = 'todos', status = 'Todos', tag = 'Todas',
        promo = 'Todos', precoMin = '', precoMax = '',
        semSku = 'false',
        priceCheckStatus = 'Todos', userId = '',
      } = req.query;

      const where = {};
      if (contasIds) where.contaId = { in: contasIds.split(',') };
      if (status !== 'Todos') where.status = status;

      if (tag && tag !== 'Todas') {
        if (tag === '_sem_tag') {
          where.OR =[{ tagPrincipal: null }, { tagPrincipal: '' }];
        } else {
          where.tagPrincipal = tag;
        }
      }

      if (promo === 'com_desconto') {
        where.precoOriginal = { not: null };
        where.AND = [...(where.AND || []), { precoOriginal: { gt: 0 } }];
      } else if (promo === 'sem_desconto') {
        where.AND =[...(where.AND || []), { OR: [{ precoOriginal: null }, { precoOriginal: 0 }] }];
      }

      if (precoMin !== '' && !isNaN(Number(precoMin))) {
        where.preco = { ...(where.preco || {}), gte: Number(precoMin) };
      }
      if (precoMax !== '' && !isNaN(Number(precoMax))) {
        where.preco = { ...(where.preco || {}), lte: Number(precoMax) };
      }

      if (semSku === 'true') {
        where.AND = [
          ...(where.AND || []),
          { OR: [{ sku: null }, { sku: '' }, { sku: '-1' }, { sku: 'S/ SKU' }] },
          { skusVariacoes: { isEmpty: true } }
        ];
      }

      if (search) {
        const searchCondition = searchType === 'titulo' ? [{ titulo: { contains: search, mode: 'insensitive' } }]
          : searchType === 'mlb'    ? [{ id: { contains: search, mode: 'insensitive' } }]
          : searchType === 'sku'    ? [{ sku: { contains: search, mode: 'insensitive' } }, { skusVariacoes: { has: search } }]
          : [
              { titulo: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
              { skusVariacoes: { has: search } },
            ];
        if (where.OR) {
          where.AND = [...(where.AND || []), { OR: where.OR }, { OR: searchCondition }];
          delete where.OR;
        } else {
          where.OR = searchCondition;
        }
      }

      if (priceCheckStatus !== 'Todos' && userId) {
        const verificacao = await prisma.verificacaoPreco.findUnique({ where: { userId } });
        const resultados = verificacao?.resultados || {};
        const idsMatch = Object.entries(resultados)
          .filter(([, v]) => v?.status === priceCheckStatus)
          .map(([id]) => id);
        where.id = { in: idsMatch };
      }

      const anuncios = await prisma.anuncioML.findMany({
        where,
        select: { id: true, contaId: true, sku: true, titulo: true, preco: true, thumbnail: true, dadosML: true }
      });

      // Extrai apenas os dados necessários para o modal do frontend não pesar a memória
      const formatados = anuncios.map(a => ({
        id: a.id,
        contaId: a.contaId,
        sku: a.sku,
        titulo: a.titulo,
        preco: a.preco,
        thumbnail: a.thumbnail,
        dadosML: {
            listing_type_id: a.dadosML?.listing_type_id,
            variations: a.dadosML?.variations
        }
      }));

      res.json({ ids: formatados.map(a => a.id), anuncios: formatados });
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
// Busca dados de performance/qualidade de um item via API ML /performance
// ============================================================================
  async getItemPerformance(req, res) {
    try {
      const { itemId } = req.params;
      const { contaId, userId } = req.query;

      if (!itemId || !contaId || !userId) {
        return res.status(400).json({ erro: "Parâmetros incompletos." });
      }

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: "Conta não encontrada ou não pertence a você." });

      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
      const activeToken = tokenRefreshRes ? tokenRefreshRes.access_token : conta.accessToken;

      if (tokenRefreshRes) {
        await prisma.contaML.update({
          where: { id: conta.id },
          data: { accessToken: activeToken, refreshToken: tokenRefreshRes.refresh_token }
        });
      }

      // Busca dados atualizados do item no ML
      const response = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      const adData = response.data;
      const health = adData.health ?? 1; // float 0-1
      const score = Math.round(health * 100);
      const level = score >= 80 ? 'good' : score >= 60 ? 'normal' : 'bad';

      // Salva dados frescos no banco
      const primaryTag = getPrimaryTag(adData);
      await prisma.anuncioML.updateMany({
        where: { id: itemId, contaId },
        data: {
          titulo: adData.title,
          preco: adData.price,
          estoque: adData.available_quantity,
          vendas: adData.sold_quantity,
          thumbnail: adData.thumbnail,
          permalink: adData.permalink,
          tagPrincipal: primaryTag,
          dadosML: adData,
        }
      });

      res.json({ score, level, health, itemId });
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: error.message, detalhes: error.response?.data });
    }
  },

// ============================================================================
// Sincroniza anúncios selecionados (re-busca cada item na API do ML)
// ============================================================================
  async syncSelectedAds(req, res) {
    try {
      const { itemIds, userId } = req.body;
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0 || !userId) {
        return res.status(400).json({ erro: "itemIds (array) e userId são obrigatórios." });
      }

      const job = await mlSyncQueue.add('sync-selected-ads', {
        mode: 'selected-ads',
        itemIds: itemIds.map(String),
        userId,
      });

      return res.json({ ok: true, jobId: job.id });
    } catch (error) {
      res.status(500).json({ erro: error.message });
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
                    new URLSearchParams({ token: user.tinyToken, formato: 'JSON', pesquisa: String(sku).trim() })
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
                        const varSkus = extractVariationSkus(adData);
                        const adSalvo = await prisma.anuncioML.upsert({
                            where: { id: adData.id },
                            update: {
                                titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price, status: adData.status,
                                estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
                                thumbnail: adData.thumbnail, permalink: adData.permalink,
                                sku: savedSku,
                                tagPrincipal: primaryTag,
                                dadosML: adData,
                                skusVariacoes: varSkus,
                            },
                            create: {
                                id: adData.id, contaId: conta.id, titulo: adData.title, preco: adData.price, precoOriginal: adData.original_price,
                                status: adData.status, estoque: adData.available_quantity, vendas: adData.sold_quantity, visitas: adData.visitas || 0,
                                thumbnail: adData.thumbnail, permalink: adData.permalink,
                                sku: savedSku,
                                tagPrincipal: primaryTag,
                                dadosML: adData,
                                skusVariacoes: varSkus,
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

      // ✅ CORREÇÃO: Adiciona lógica de nova tentativa (retry com backoff) para a exclusão
      let result = null;
      const maxRetries = 3; // Tenta até 3 vezes
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          result = await mlService.deleteQuestion(questionId, activeToken);
          break; // Se tiver sucesso, sai do loop
        } catch (apiErr) {
          // Se o erro for 429 (Too Many Requests) e ainda não esgotou as tentativas, espera e tenta de novo
          if (apiErr.response?.status === 429 && attempt < maxRetries) {
             console.warn(`[excluirPergunta] Rate limit (429) na tentativa ${attempt}. Aguardando para tentar novamente...`);
             await delay(attempt * 2000); // Espera 2s, depois 4s
          } else {
             // Se for outro erro ou a última tentativa, lança o erro para ser pego pelo catch principal
             throw apiErr;
          }
        }
      }
      
      // ✅ FIM DA CORREÇÃO

      res.json(result);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: error.response?.data?.message || error.message });
    }
  },

async corrigirPreco(req, res) {
    try {
      const { 
        userId, items, modo, regraId, precoManual, 
        precoBaseManual, inflar, reduzir, removerPromocoes,
        enviarAtacado, ativarPromocoes // ✅ CORREÇÃO: Resgatando os parâmetros
      } = req.body;
      
      if (!userId || !items || !Array.isArray(items)) {
        return res.status(400).json({ erro: 'Parâmetros incompletos.' });
      }

      const jobPayload = { modo, regraId, precoManual, precoBaseManual, inflar, reduzir, removerPromocoes, enviarAtacado, ativarPromocoes };

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId: userId,
          tipo: 'Corrigir Preço em Massa',
          alvo: `${items.length} anúncio(s)`,
          conta: 'Várias Contas',
          status: 'PENDENTE',
          payload: jobPayload
        }
      });

      let job;
      try {
        job = await priceQueue.add('update-price', {
          tarefaId: tarefa.id,
          userId,
          items,
          ...jobPayload
        });
      } catch (queueErr) {
        // Se o job não foi para a fila, marca a tarefa como FALHA para não ficar presa em PENDENTE
        await prisma.tarefaFila.updateMany({
          where: { id: tarefa.id },
          data: { status: 'FALHA', detalhes: `Falha ao enfileirar: ${queueErr.message}` }
        });
        return res.status(500).json({ erro: 'Falha ao enfileirar correção de preço', detalhes: queueErr.message });
      }

      await prisma.tarefaFila.updateMany({
        where: { id: tarefa.id },
        data: { jobId: job.id }
      });

      res.json({ ok: true, message: 'Lote enviado para a fila de processamento.', jobId: job.id });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao enfileirar correção de preço', detalhes: error.message });
    }
  },

// ============================================================================
  // ✅ NOVO ENDPOINT: Ações em Massa (Ativar, Pausar, Estoque, Flex, Turbo)
  // ============================================================================
  // Busca shipping.dimensions ao vivo do ML e salva no dadosML de cada item
  async buscarDimensoesML(req, res) {
    try {
      const { userId, items } = req.body; // items: [{id, contaId}]
      if (!userId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ erro: 'Parâmetros incompletos.' });
      }

      // Agrupa por conta
      const porConta = {};
      for (const item of items) {
        if (!porConta[item.contaId]) porConta[item.contaId] = [];
        porConta[item.contaId].push(item.id);
      }

      const resultado = {}; // itemId -> dimensoes string ou null

      for (const [contaId, ids] of Object.entries(porConta)) {
        const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
        if (!conta) continue;

        let token = conta.accessToken;
        const margemSeguranca = 5 * 60 * 1000;
        if (Date.now() + margemSeguranca >= Number(conta.expiresAt)) {
          try {
            const tRes = await mlService.refreshToken(conta.refreshToken);
            token = tRes.access_token;
            await prisma.contaML.update({
              where: { id: conta.id },
              data: { accessToken: token, refreshToken: tRes.refresh_token, expiresAt: BigInt(Date.now() + tRes.expires_in * 1000) }
            });
          } catch (_) {}
        }

        const headers = { Authorization: `Bearer ${token}` };
        // Processa em chunks de 20
        const CHUNK = 20;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          try {
            const resp = await axios.get(
              `https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=id,shipping`,
              { headers, timeout: 20000 }
            );
            const resultados = resp.data || [];
            for (const entry of resultados) {
              if (entry.code !== 200 || !entry.body) continue;
              const body = entry.body;
              const dim = body.shipping?.dimensions ?? null;
              resultado[body.id] = dim;

              // Atualiza dadosML no banco
              const anuncio = await prisma.anuncioML.findUnique({ where: { id: body.id } });
              if (anuncio) {
                const dadosAtual = anuncio.dadosML || {};
                await prisma.anuncioML.update({
                  where: { id: body.id },
                  data: {
                    dadosML: {
                      ...dadosAtual,
                      shipping: { ...(dadosAtual.shipping || {}), dimensions: dim }
                    }
                  }
                }).catch(() => {});
              }
            }
          } catch (e) {
            console.error(`Erro ao buscar dimensões chunk: ${e.message}`);
          }
        }
      }

      res.json({ ok: true, resultado }); // { itemId: "10x5x30,500" | null }
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  async atualizarDimensoes(req, res) {
    try {
      const { userId, items, modo, dimensoes } = req.body;
      if (!userId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ erro: 'Parâmetros incompletos.' });
      }
      if (modo === 'novas' && !dimensoes) {
        return res.status(400).json({ erro: 'Dimensões não informadas para o modo novas.' });
      }

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId,
          tipo: `Dimensões de Embalagem (${modo === 'novas' ? 'Novas' : 'Reenvio'})`,
          alvo: `${items.length} anúncio(s)`,
          conta: 'Várias Contas',
          status: 'PENDENTE'
        }
      });

      const job = await acoesMassaQueue.add('acoes-massa-job', {
        tarefaId: tarefa.id,
        userId,
        items,
        acao: 'dimensoes',
        valor: { modo, dimensoes }
      });

      await prisma.tarefaFila.updateMany({
        where: { id: tarefa.id },
        data: { jobId: job.id }
      });

      res.json({ ok: true, message: 'Atualização de dimensões enviada para a fila.', jobId: job.id });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao enfileirar atualização de dimensões', detalhes: error.message });
    }
  },

  async acoesMassa(req, res) {
    try {
      const { userId, items, acao, valor, modoReplace } = req.body;
      if (!userId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ erro: "Parâmetros incompletos." });
      }

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId,
          tipo: `Ação em Massa: ${acao.toUpperCase()}`,
          alvo: `${items.length} anúncio(s)`,
          conta: 'Várias Contas',
          status: 'PENDENTE'
        }
      });

      const job = await acoesMassaQueue.add('acoes-massa-job', {
        tarefaId: tarefa.id,
        userId,
        items,
        acao,
        valor,
        modoReplace
      });

      await prisma.tarefaFila.updateMany({
        where: { id: tarefa.id },
        data: { jobId: job.id }
      });

      res.json({ ok: true, message: 'Ação enviada para a fila com sucesso.', jobId: job.id });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao enfileirar ação em massa', detalhes: error.message });
    }
  },

  async verificarPreco(req, res) {
    try {
      const { userId, anuncios, modo, regraId, precoManual, precoBaseManual, inflar, reduzir } = req.body;
      if (!userId || !anuncios || !Array.isArray(anuncios)) {
        return res.status(400).json({ erro: 'Parâmetros incompletos.' });
      }

      const tarefa = await prisma.tarefaFila.create({
        data: {
          userId,
          tipo: 'Verificar Preço em Massa',
          alvo: `${anuncios.length} anúncio(s)`,
          conta: 'Várias Contas',
          status: 'PENDENTE'
        }
      });

      const job = await priceCheckQueue.add('price-check-v2', {
        tarefaId: tarefa.id,
        userId,
        anuncios, // Passa a lista de anúncios completa para o worker
        modo,
        regraId,
        precoManual,
        precoBaseManual,
        inflar,
        reduzir
      });

      await prisma.tarefaFila.updateMany({
        where: { id: tarefa.id },
        data: { jobId: job.id }
      });

      res.json({ ok: true, message: 'Verificação enviada para a fila.', jobId: job.id });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao enfileirar verificação de preço', detalhes: error.message });
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

  // ─── POST /api/ml/reset-margem ───────────────────────────────────────────────
  async resetMargem(req, res) {
    try {
      const { userId, ids } = req.body;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const contas = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
      const allowedContaIds = contas.map(c => c.id);

      const where = { contaId: { in: allowedContaIds }, margemPromocional: true };
      if (Array.isArray(ids) && ids.length > 0) {
        where.id = { in: ids };
      }

      const { count } = await prisma.anuncioML.updateMany({ where, data: { margemPromocional: false } });
      res.json({ ok: true, count });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao resetar margem', detalhes: err.message });
    }
  },

  // ─── POST /api/ml/atacado-preco ──────────────────────────────────────────────
  // Envia preços por quantidade (atacado) para um item no ML
  async enviarPrecoAtacado(req, res) {
    try {
      const { itemId, contaId, userId, precoAlvo, faixas } = req.body;
      if (!itemId || !contaId || !precoAlvo || !faixas || faixas.length === 0) {
        return res.status(400).json({ erro: 'itemId, contaId, precoAlvo e faixas são obrigatórios' });
      }

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });

      // Renova token se necessário
      let accessToken = conta.accessToken;
      try {
        const tRes = await mlService.refreshToken(conta.refreshToken);
        if (tRes?.access_token) {
          accessToken = tRes.access_token;
          await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: tRes.access_token, refreshToken: tRes.refresh_token } });
        }
      } catch {}

      // Busca o ID do preço padrão atual
      const precosRes = await axios.get(`https://api.mercadolibre.com/items/${itemId}/prices`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'show-all-prices': 'true' }
      });
      const precosPadrao = (precosRes.data.prices || []).filter(p => !p.conditions?.min_purchase_unit);
      // ✅ CORREÇÃO: Preserva TODOS os IDs de preço base (necessário para itens com variação)
      const keepNodes = precosPadrao.map(p => ({ id: p.id }));

      // Monta o payload de PxQ (máximo 5 faixas)
      const faixasLimitadas = faixas.slice(0, 5);
      const prices = [...keepNodes];

      // Adiciona as faixas de atacado
      for (const faixa of faixasLimitadas) {
        const tierPrice = Math.round(precoAlvo * (1 - faixa.desconto / 100) * 100) / 100;
        if (tierPrice > 0 && faixa.minQtd > 1) {
          prices.push({
            amount: tierPrice,
            currency_id: 'BRL',
            conditions: {
              context_restrictions: ['channel_marketplace', 'user_type_business'],
              min_purchase_unit: Number(faixa.minQtd)
            }
          });
        }
      }

      const response = await axios.post(
        `https://api.mercadolibre.com/items/${itemId}/prices/standard/quantity`,
        { prices },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );

      res.json({ ok: true, resultado: response.data });
    } catch (err) {
      console.error('[atacado-preco] Erro:', err.response?.data || err.message);
      res.status(500).json({ erro: 'Erro ao enviar preço de atacado', detalhes: err.response?.data || err.message });
    }
  },

};
