import prisma from '../config/prisma.js';
import { mlService } from '../services/ml.service.js';
import axios from 'axios';

const ML_API = 'https://api.mercadolibre.com';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeText(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityScore(a = '', b = '') {
  const aa = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bb = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let inter = 0;
  for (const t of aa) { if (bb.has(t)) inter++; }
  return Math.round((inter / Math.max(aa.size, bb.size)) * 100);
}

function getMainValueFromAttributes(attrs = [], keys = []) {
  if (!Array.isArray(attrs)) return null;
  for (const key of keys) {
    const found = attrs.find(a => a.id === key || a.name === key);
    if (!found) continue;
    if (found.value_name) return found.value_name;
    if (found.value_id) return found.value_id;
    if (Array.isArray(found.values) && found.values[0]) {
      return found.values[0].name || found.values[0].id || null;
    }
  }
  return null;
}

// Pega o token válido de uma conta, renovando se necessário
async function getValidToken(contaId, userId) {
  const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
  if (!conta) throw new Error('Conta não encontrada');
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    if (refreshed?.access_token) {
      await prisma.contaML.update({
        where: { id: conta.id },
        data: { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token }
      });
      return { token: refreshed.access_token, sellerId: conta.id };
    }
  } catch (e) { /* usa token atual */ }
  return { token: conta.accessToken, sellerId: conta.id };
}

export const catalogoController = {

  // ──────────────────────────────────────────────────────────────────
  // BUSCAR CATÁLOGO: por texto/EAN/Part Number
  // ──────────────────────────────────────────────────────────────────
  async searchCatalog(req, res) {
    try {
      const { userId, contaId, q, product_identifier, domain_id, status = 'active', offset = 0, limit = 10 } = req.query;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });
      if (!q && !product_identifier) return res.status(400).json({ erro: 'Informe q ou product_identifier' });

      const { token } = await getValidToken(contaId, userId);

      // Descobre o site_id a partir da conta
      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      const siteId = conta?.siteId || 'MLB';

      let url = `${ML_API}/products/search?status=${status}&site_id=${siteId}&offset=${offset}&limit=${limit}`;
      if (product_identifier) url += `&product_identifier=${encodeURIComponent(product_identifier)}`;
      if (q) url += `&q=${encodeURIComponent(q)}`;
      if (domain_id) url += `&domain_id=${encodeURIComponent(domain_id)}`;

      const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      res.json(resp.data);
    } catch (error) {
      console.error('[Catalogo] searchCatalog:', error.message);
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar catálogo', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // DETALHE DE PRODUTO DO CATÁLOGO
  // ──────────────────────────────────────────────────────────────────
  async getProductDetail(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { productId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar produto', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // ELEGIBILIDADE DE UM ITEM
  // ──────────────────────────────────────────────────────────────────
  async checkEligibility(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { itemId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/items/${itemId}/catalog_listing_eligibility`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao verificar elegibilidade', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // ELEGIBILIDADE DE MÚLTIPLOS ITENS (multiget)
  // ──────────────────────────────────────────────────────────────────
  async checkMultipleEligibility(req, res) {
    try {
      const { userId, contaId, ids } = req.query;
      if (!userId || !contaId || !ids) return res.status(400).json({ erro: 'userId, contaId e ids são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/multiget/catalog_listing_eligibility?ids=${ids}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 20000
      });
      const normalizeElig = (e) => {
        const nested = e.catalog_listing_eligibility || {};
        return {
          ...e, ...nested,
          status: e.status || e.elegibility_type || e.eligibility_type || nested.eligibility_type || nested.elegibility_type || 'UNKNOWN',
          domain_id: e.domain_id || nested.domain_id,
        };
      };
      const data = Array.isArray(resp.data) ? resp.data.map(normalizeElig) : resp.data;
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao verificar elegibilidade múltipla', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // DOMÍNIOS OBRIGATÓRIOS / EXCLUSIVOS DO CATÁLOGO
  // ──────────────────────────────────────────────────────────────────
  async getDominios(req, res) {
    try {
      const { userId, contaId, tipo = 'catalog_required' } = req.query;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      const siteId = conta?.siteId || 'MLB';

      // Endpoint público, sem token
      const resp = await axios.get(`${ML_API}/catalog/dumps/domains/${siteId}/${tipo}`, { timeout: 15000 });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar domínios', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // COMPETIÇÃO / PRICE TO WIN
  // ──────────────────────────────────────────────────────────────────
  async getCompetition(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { itemId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/items/${itemId}/price_to_win?version=v2`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar competição', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // ITENS CONCORRENDO EM UMA PÁGINA DE PRODUTO
  // ──────────────────────────────────────────────────────────────────
  async getProductItems(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { productId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/products/${productId}/items`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar itens do produto', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // ITENS ELEGÍVEIS NA BASE LOCAL (com filtro de tag)
  // ──────────────────────────────────────────────────────────────────
  async getEligibleItemsLocal(req, res) {
    try {
      const { userId, contaId, tipo = 'eligible' } = req.query;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token, sellerId } = await getValidToken(contaId, userId);

      // tipo: 'eligible' = catalog_listing_eligible, 'forewarning' = catalog_forewarning, 'catalog' = já em catálogo
      let tagParam;
      if (tipo === 'eligible') tagParam = 'catalog_listing_eligible';
      else if (tipo === 'forewarning') tagParam = 'catalog_forewarning';
      else if (tipo === 'catalog') {
        // Retorna itens já em catálogo (catalog_listing=true)
        const resp = await axios.get(
          `${ML_API}/users/${sellerId}/items/search?catalog_listing=true&limit=100`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
        return res.json(resp.data);
      }

      const resp = await axios.get(
        `${ML_API}/users/${sellerId}/items/search?tags=${tagParam}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar itens elegíveis', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // PUBLICAR DIRETAMENTE NO CATÁLOGO (criar novo item de catálogo)
  // ──────────────────────────────────────────────────────────────────
  async publishDirect(req, res) {
    try {
      const {
        userId, contaId, catalogProductId, categoryId,
        price, listingTypeId, quantity, attributes, siteId, sku
      } = req.body;
      if (!userId || !contaId || !catalogProductId || !price) {
        return res.status(400).json({ erro: 'userId, contaId, catalogProductId e price são obrigatórios' });
      }

      const { token } = await getValidToken(contaId, userId);

      // category_id deve ser um ID numérico (ex: MLB1053), não um domain_id (MLB-AUDIO...).
      let finalCategoryId = categoryId && !categoryId.includes('-') ? categoryId : undefined;

      // 1) Se recebemos um domain_id do frontend, converte via catalog_domains (com token)
      if (!finalCategoryId && categoryId?.includes('-')) {
        try {
          const domainResp = await axios.get(`${ML_API}/catalog_domains/${categoryId}/categories`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          });
          const cats = domainResp.data;
          if (Array.isArray(cats) && cats.length > 0) {
            finalCategoryId = cats[0].id;
            console.log('[publishDirect] category via catalog_domains:', finalCategoryId, '(domain:', categoryId, ')');
          }
        } catch (e) {
          console.log('[publishDirect] aviso: erro ao converter domain_id para category_id:', e.message);
        }
      }

      // 1b) domain_id do frontend direto no domain_discovery (fallback sem catalog_domains)
      if (!finalCategoryId && categoryId?.includes('-')) {
        try {
          const parsedDomain = categoryId.replace(/^MLB-/, '').replace(/_/g, ' ');
          const domResp = await axios.get(`${ML_API}/sites/${siteId || 'MLB'}/domain_discovery/search`, {
            params: { limit: 1, q: parsedDomain },
            timeout: 10000
          });
          if (domResp.data?.length > 0) {
            finalCategoryId = domResp.data[0].category_id;
            console.log('[publishDirect] category via domain_discovery (domain):', finalCategoryId);
          }
        } catch (e) {
          console.log('[publishDirect] aviso: erro no domain_discovery via domain_id:', e.message);
        }
      }

      if (!finalCategoryId && catalogProductId) {
        // 2) Tenta via buy_box_winner do produto
        try {
          const prodResp = await axios.get(`${ML_API}/products/${catalogProductId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          });
          finalCategoryId = prodResp.data?.buy_box_winner?.category_id;

          // 3) Fallback: domain_id do produto via catalog_domains
          if (!finalCategoryId && prodResp.data?.domain_id) {
            try {
              const domainResp = await axios.get(`${ML_API}/catalog_domains/${prodResp.data.domain_id}/categories`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 10000
              });
              const cats = domainResp.data;
              if (Array.isArray(cats) && cats.length > 0) {
                finalCategoryId = cats[0].id;
                console.log('[publishDirect] category via catalog_domains (produto):', finalCategoryId);
              }
            } catch (e) {
              console.log('[publishDirect] aviso: erro no catalog_domains via domain_id do produto:', e.message);
            }
          }

          // 4) Fallback: nome do produto via domain_discovery
          if (!finalCategoryId && prodResp.data?.name) {
            try {
              const domResp = await axios.get(`${ML_API}/sites/${siteId || 'MLB'}/domain_discovery/search`, {
                params: { limit: 1, q: prodResp.data.name },
                timeout: 10000
              });
              if (domResp.data?.length > 0) {
                finalCategoryId = domResp.data[0].category_id;
                console.log('[publishDirect] category via domain_discovery (nome):', finalCategoryId);
              }
            } catch (e) {
              console.log('[publishDirect] aviso: erro no domain_discovery via nome do produto:', e.message);
            }
          }

          // 5) Fallback: primeiro item competindo
          if (!finalCategoryId) {
            try {
              const itemsResp = await axios.get(`${ML_API}/products/${catalogProductId}/items`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: 1 },
                timeout: 10000
              });
              finalCategoryId = itemsResp.data?.results?.[0]?.category_id;
              if (finalCategoryId) console.log('[publishDirect] category via items:', finalCategoryId);
            } catch {}
          }
        } catch (e) {
          console.log('[publishDirect] aviso: não conseguiu buscar product details:', e.message);
        }
      }

      if (!finalCategoryId) {
        return res.status(400).json({ erro: 'Não foi possível determinar category_id para o produto de catálogo.' });
      }

      // Busca dimensões do produto no catálogo ML — garante que a embalagem seja >= produto
      let pkgDimensions = [];
      try {
        const resCatalog = await axios.get(`${ML_API}/catalog/products/${catalogProductId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        });
        const catalogAttrs = resCatalog.data?.attributes || [];
        const getAttr = (...ids) => {
          for (const id of ids) {
            const attr = catalogAttrs.find(a => a.id === id);
            const val = attr?.value_struct?.number || parseFloat(attr?.values?.[0]?.struct?.number || attr?.values?.[0]?.name || '0') || 0;
            if (val > 0) return val;
          }
          return 0;
        };
        const catL = Math.ceil(getAttr('PACKAGE_LENGTH', 'LENGTH'));
        const catW = Math.ceil(getAttr('PACKAGE_WIDTH',  'WIDTH'));
        const catH = Math.ceil(getAttr('PACKAGE_HEIGHT', 'HEIGHT'));
        const catP = Math.ceil(getAttr('PACKAGE_WEIGHT', 'WEIGHT') * 1000); // converte kg→g se necessário
        console.log('[publishDirect] dimensões do catálogo ML:', { catL, catW, catH, catP });

        if (catL > 0 && catW > 0 && catH > 0) {
          pkgDimensions = [
            { id: 'SELLER_PACKAGE_LENGTH', value_name: `${catL} cm` },
            { id: 'SELLER_PACKAGE_WIDTH',  value_name: `${catW} cm` },
            { id: 'SELLER_PACKAGE_HEIGHT', value_name: `${catH} cm` },
            { id: 'SELLER_PACKAGE_WEIGHT', value_name: `${catP > 0 ? catP : 3000} g` }
          ];
        }
      } catch (err) {
        console.warn('[publishDirect] não foi possível buscar dimensões do catálogo ML:', err.message);
      }

      if (pkgDimensions.length === 0) {
        // Fallback: dimensões e peso grandes o suficiente para cobrir a maioria dos produtos
        pkgDimensions = [
          { id: 'SELLER_PACKAGE_LENGTH', value_name: '40 cm' },
          { id: 'SELLER_PACKAGE_WIDTH',  value_name: '30 cm' },
          { id: 'SELLER_PACKAGE_HEIGHT', value_name: '25 cm' },
          { id: 'SELLER_PACKAGE_WEIGHT', value_name: '5000 g' }
        ];
      }

      const payload = {
        site_id: siteId || 'MLB',
        category_id: finalCategoryId,
        price: Number(price),
        currency_id: 'BRL',
        available_quantity: Number(quantity) || 1,
        buying_mode: 'buy_it_now',
        listing_type_id: listingTypeId || 'gold_special',
        pictures: [],
        attributes: attributes || [
          { id: 'ITEM_CONDITION', value_id: '2230284', value_name: 'Novo' },
          ...pkgDimensions
        ],
        catalog_product_id: catalogProductId,
        catalog_listing: true
      };

      console.log('[publishDirect] payload enviado ao ML:', JSON.stringify(payload, null, 2));
      const resp = await axios.post(`${ML_API}/items`, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      });
      
      const criado = resp.data;
      if (criado && criado.id && sku) {
        try {
          await prisma.anuncioML.create({
            data: {
              id: criado.id,
              contaId,
              sku: String(sku).trim(),
              titulo: criado.title,
              preco: Number(criado.price),
              status: criado.status,
              estoque: Number(criado.available_quantity) || 0,
              thumbnail: criado.thumbnail || criado.pictures?.[0]?.url || null,
              permalink: criado.permalink,
              dadosML: criado
            }
          });
        } catch (e) {
          console.error('[publishDirect] erro ao vincular anuncioML:', e.message);
        }
      }
      
      res.json({ ok: true, item: criado });
    } catch (error) {
      console.error('[publishDirect] erro ML:', JSON.stringify(error.response?.data, null, 2));
      res.status(error.response?.status || 500).json({
        erro: 'Falha ao publicar no catálogo',
        detalhes: error.response?.data
      });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // OPTIN: associar item de marketplace existente ao catálogo
  // ──────────────────────────────────────────────────────────────────
  async optinItem(req, res) {
    try {
      const { userId, contaId, itemId, variationId, catalogProductId } = req.body;
      if (!userId || !contaId || !itemId || !catalogProductId) {
        return res.status(400).json({ erro: 'userId, contaId, itemId e catalogProductId são obrigatórios' });
      }

      const { token } = await getValidToken(contaId, userId);

      const body = { item_id: itemId, catalog_product_id: catalogProductId };
      if (variationId) body.variation_id = variationId;

      const resp = await axios.post(`${ML_API}/items/catalog_listings`, body, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      });
      res.json({ ok: true, item: resp.data });
    } catch (error) {
      res.status(error.response?.status || 500).json({
        erro: 'Falha ao fazer optin',
        detalhes: error.response?.data
      });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // CALCULAR PREÇO BASEADO EM REGRA DE PREÇO (igual ao CriarAnuncio)
  // ──────────────────────────────────────────────────────────────────
  async calcularPreco(req, res) {
    try {
      const { userId, skus, regraId, inflar = 0, reduzir = 0 } = req.body;
      if (!userId || !skus || !regraId) return res.status(400).json({ erro: 'userId, skus e regraId são obrigatórios' });

      // Busca preços base dos SKUs
      const precosResp = await axios.post(
        `http://localhost:${process.env.PORT || 3001}/api/produtos/precos-base`,
        { userId, skus, regraId },
        { timeout: 30000 }
      );
      const precos = precosResp.data;

      const resultado = {};
      for (const sku of skus) {
        const base = precos[sku];
        if (!base) continue;
        let preco = base;
        if (inflar > 0) preco = preco * (1 + inflar / 100);
        if (reduzir > 0) preco = preco * (1 - reduzir / 100);
        resultado[sku] = { base, precoFinal: Math.round(preco * 100) / 100 };
      }
      res.json(resultado);
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao calcular preço', detalhes: error.message });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // VERIFICAR STATUS DE FOREWARNING (data limite)
  // ──────────────────────────────────────────────────────────────────
  async getForewarningDate(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { itemId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/items/${itemId}/catalog_forewarning/date`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 10000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar data forewarning' });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // MODERAÇÕES DO VENDEDOR
  // ──────────────────────────────────────────────────────────────────
  async getModeracoes(req, res) {
    try {
      const { userId, contaId } = req.query;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token, sellerId } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/moderations/infractions/${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar moderações', detalhes: error.response?.data });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // IGUALAR PREÇO AO VENCEDOR DA BUY BOX
  // ──────────────────────────────────────────────────────────────────
  async matchPrice(req, res) {
    try {
      const { userId, contaId, itemId, price } = req.body;
      if (!userId || !contaId || !itemId || !price) {
        return res.status(400).json({ erro: 'userId, contaId, itemId e price são obrigatórios' });
      }
      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.put(
        `${ML_API}/items/${itemId}`,
        { price: Number(price) },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      // Atualiza preço no banco local
      await prisma.anuncioML.updateMany({
        where: { id: itemId, contaId },
        data: { preco: Number(price) }
      });
      res.json({ ok: true, item: resp.data });
    } catch (error) {
      res.status(error.response?.status || 500).json({
        erro: 'Falha ao igualar preço',
        detalhes: error.response?.data
      });
    }
  },

// ──────────────────────────────────────────────────────────────────
  // BUSCA ELEGIBILIDADE EM LOTE DOS ANÚNCIOS DA CONTA
  // ──────────────────────────────────────────────────────────────────
  async getEligibilityBatch(req, res) {
    try {
      const { userId, contaId } = req.query;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);

      const anuncios = await prisma.anuncioML.findMany({
        where: { contaId, status: 'active' },
        select: { id: true, titulo: true, thumbnail: true, preco: true, sku: true, dadosML: true }
      });

      if (anuncios.length === 0) return res.json({ resultados: [], total: 0 });

      const chunkSize = 20;
      const resultados = [];

      for (let i = 0; i < anuncios.length; i += chunkSize) {
        const chunk = anuncios.slice(i, i + chunkSize);
        const ids = chunk.map(a => a.id).join(',');
        try {
          const resp = await axios.get(`${ML_API}/multiget/catalog_listing_eligibility?ids=${ids}`, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 20000
          });

          const eligData = Array.isArray(resp.data) ? resp.data : [];

          for (const itemResp of eligData) {
            const elig = itemResp.body ? itemResp.body : itemResp;
            const anuncio = chunk.find(a => a.id === elig.id);
            if (!anuncio) continue;

            const nested = elig.catalog_listing_eligibility || {};
            let status = elig.status || nested.status || elig.eligibility_type || elig.elegibility_type || nested.eligibility_type || nested.elegibility_type;

            if (!status && Array.isArray(elig.variations) && elig.variations.length > 0) {
              if (elig.variations.some(v => v.status === 'READY_FOR_OPTIN')) status = 'READY_FOR_OPTIN';
              else if (elig.variations.some(v => v.status === 'ALREADY_OPTED_IN')) status = 'ALREADY_OPTED_IN';
              else if (elig.variations.some(v => v.status === 'CATALOG_PRODUCT_ID_NULL')) status = 'CATALOG_PRODUCT_ID_NULL';
              else status = elig.variations[0]?.status || 'UNKNOWN';
            }

            let sugeridoML = anuncio.dadosML?.catalog_product_id || elig.catalog_product_id || nested.catalog_product_id || null;
            if (!sugeridoML && Array.isArray(elig.variations)) {
              const varSug = elig.variations.find(v => v.catalog_product_id);
              if (varSug) sugeridoML = varSug.catalog_product_id;
            }

            const listingStrategy = elig.listing_strategy || nested.listing_strategy || anuncio.dadosML?.listing_strategy || null;

            const eligNorm = {
              ...elig,
              ...nested,
              status: status || 'UNKNOWN',
              domain_id: elig.domain_id || nested.domain_id || anuncio.dadosML?.domain_id || null,
              eligible_for_listing: elig.eligible_for_listing ?? nested.eligible_for_listing ?? null,
              buy_box_eligible: elig.buy_box_eligible ?? nested.buy_box_eligible ?? null,
              suggested_catalog_id: sugeridoML,
              listing_strategy: listingStrategy,
              reasons: elig.reasons || nested.reasons || [],
              warnings: elig.warnings || nested.warnings || [],
              catalog_product_status: elig.catalog_product_status || nested.catalog_product_status || null,
              has_variations: Array.isArray(elig.variations) && elig.variations.length > 0,
              variations: Array.isArray(elig.variations) ? elig.variations : []
            };

            const { dadosML, ...anuncioLimpo } = anuncio;
            resultados.push({ ...anuncioLimpo, elegibilidade: eligNorm });
          }
        } catch (e) {
          for (const a of chunk) {
            const { dadosML, ...anuncioLimpo } = a;
            resultados.push({
              ...anuncioLimpo,
              elegibilidade: {
                status: 'UNKNOWN',
                error: true,
                error_message: e.response?.data?.message || e.message || 'Erro ao consultar elegibilidade',
                suggested_catalog_id: a.dadosML?.catalog_product_id || null,
                domain_id: a.dadosML?.domain_id || null,
                listing_strategy: a.dadosML?.listing_strategy || null,
                reasons: [],
                warnings: [],
                variations: []
              }
            });
          }
        }
        if (i + chunkSize < anuncios.length) await delay(400);
      }

      res.json({ resultados, total: anuncios.length });
    } catch (error) {
      res.status(500).json({ erro: 'Falha ao verificar elegibilidade em lote', detalhes: error.message });
    }
  },

  async getItemDetail(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { itemId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });
      const { token } = await getValidToken(contaId, userId);
      const resp = await axios.get(`${ML_API}/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      res.json(resp.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao buscar item', detalhes: error.response?.data });
    }
  },

  async compareItemWithProduct(req, res) {
    try {
      const { userId, contaId } = req.query;
      const { itemId, productId } = req.params;
      if (!userId || !contaId) return res.status(400).json({ erro: 'userId e contaId são obrigatórios' });

      const { token } = await getValidToken(contaId, userId);

      const [itemResp, productResp] = await Promise.all([
        axios.get(`${ML_API}/items/${itemId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }),
        axios.get(`${ML_API}/products/${productId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
      ]);

      const item = itemResp.data;
      const product = productResp.data;

      const itemAttrs = item.attributes || [];
      const productAttrs = product.attributes || [];

      const itemBrand = getMainValueFromAttributes(itemAttrs, ['BRAND', 'Marca']);
      const productBrand = getMainValueFromAttributes(productAttrs, ['BRAND', 'Marca']);
      const itemModel = getMainValueFromAttributes(itemAttrs, ['MODEL', 'Modelo']);
      const productModel = getMainValueFromAttributes(productAttrs, ['MODEL', 'Modelo']);
      const itemGtin = getMainValueFromAttributes(itemAttrs, ['GTIN', 'EAN']);
      const productGtin = getMainValueFromAttributes(productAttrs, ['GTIN', 'EAN']);

      const score = similarityScore(item.title || '', product.name || '');
      const sameDomain = (item.domain_id && product.domain_id) ? item.domain_id === product.domain_id : null;

      const checks = {
        title: score >= 50,
        brand: (itemBrand && productBrand) ? normalizeText(itemBrand) === normalizeText(productBrand) : null,
        model: (itemModel && productModel) ? normalizeText(itemModel) === normalizeText(productModel) : null,
        gtin: (itemGtin && productGtin) ? String(itemGtin).trim() === String(productGtin).trim() : null,
        domain: sameDomain
      };

      const divergencias = [];
      if (checks.domain === false) divergencias.push({ campo: 'DOMAIN_ID', item: item.domain_id || null, catalogo: product.domain_id || null });
      if (checks.brand === false) divergencias.push({ campo: 'BRAND', item: itemBrand, catalogo: productBrand });
      if (checks.model === false) divergencias.push({ campo: 'MODEL', item: itemModel, catalogo: productModel });
      if (checks.gtin === false) divergencias.push({ campo: 'GTIN', item: itemGtin, catalogo: productGtin });

      res.json({
        ok: true,
        item: { id: item.id, title: item.title, domain_id: item.domain_id },
        product: { id: product.id, name: product.name, domain_id: product.domain_id },
        score, sameDomain, checks, divergencias
      });
    } catch (error) {
      res.status(error.response?.status || 500).json({ erro: 'Falha ao comparar item com produto', detalhes: error.response?.data || error.message });
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // ATIVAR CAMPANHAS AUTO: ativa promoções candidatas para um item recém-publicado
  // ──────────────────────────────────────────────────────────────────
  async ativarCampanhasAuto(req, res) {
    try {
      const { userId, contaId, itemId, inflar = 0, price = 0 } = req.body;
      if (!userId || !contaId || !itemId) {
        return res.status(400).json({ erro: 'userId, contaId e itemId são obrigatórios' });
      }

      const { token } = await getValidToken(contaId, userId);

      // Responde imediatamente — ativação acontece em background com retry
      res.json({ ok: true, status: 'activating', itemId });

      // Função auxiliar que tenta ativar com retry (até 5 tentativas, delays crescentes)
      const tentarAtivar = async () => {
        const delays = [5000, 15000, 30000, 45000, 60000];
        for (let i = 0; i < delays.length; i++) {
          await delay(delays[i]);
          try {
            const promoRes = await axios.get(
              `${ML_API}/seller-promotions/items/${itemId}?app_version=v2`,
              { headers: { Authorization: `Bearer ${token}` }, timeout: 12000 }
            );
            const lista = Array.isArray(promoRes.data) ? promoRes.data : (promoRes.data ? [promoRes.data] : []);
            const candidatos = lista.filter(p => p && p.status === 'candidate');
            if (candidatos.length === 0) continue;

            const inflarNum = Number(inflar) || 0;
            const precoFinal = Number(price) || 0;
            const precoAlvo = inflarNum > 0 ? precoFinal * (1 - inflarNum / 100) : precoFinal;

            const TIPOS_SEM_ID = new Set(['DOD', 'LIGHTNING']);
            const TIPOS_COM_OFFER = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
            const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING', 'PRICE_DISCOUNT']);

            let ativadas = 0;
            let temNoCandidates = false;

            for (const promo of candidatos) {
              const sellerPct = typeof promo.seller_percentage === 'number' ? promo.seller_percentage : null;
              const maxPrice = promo.max_discounted_price || 0;
              const origPrice = promo.original_price || 0;

              let deveAtivar = false;
              if (inflarNum === 0) deveAtivar = true;
              else if (sellerPct !== null) deveAtivar = sellerPct <= inflarNum;
              else if (maxPrice > 0 && origPrice > 0) {
                const minPct = ((origPrice - maxPrice) / origPrice) * 100;
                deveAtivar = minPct <= inflarNum;
              } else deveAtivar = true;

              if (!deveAtivar) continue;

              const body = { promotion_type: promo.type };
              if (!TIPOS_SEM_ID.has(promo.type) && promo.id) body.promotion_id = promo.id;
              const offerId = promo.offer_id || promo.offerId || promo.ref_id || null;
              if (offerId && TIPOS_COM_OFFER.has(promo.type)) body.offer_id = offerId;
              if (TIPOS_COM_PRECO.has(promo.type) && precoFinal > 0) {
                let dealPrice = sellerPct !== null ? precoFinal * (1 - sellerPct / 100) : precoAlvo;
                if (maxPrice > 0 && dealPrice > maxPrice) dealPrice = maxPrice;
                const minPrice = promo.min_discounted_price || 0;
                if (minPrice > 0 && dealPrice < minPrice) dealPrice = minPrice;
                body.deal_price = Math.round(dealPrice * 100) / 100;
              }
              if (promo.type === 'PRICE_DISCOUNT') {
                const toLocalFormat = (dateStr) => {
                  const d = new Date(dateStr);
                  if (isNaN(d.getTime())) return null;
                  const pad = (n) => String(n).padStart(2, '0');
                  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
                  return `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth()+1)}-${pad(brt.getUTCDate())}T00:00:00`;
                };
                const rawStart = promo.start_date;
                const rawFinish = promo.finish_date || promo.end_date;
                if (rawStart && rawFinish) {
                  body.start_date = toLocalFormat(rawStart) || rawStart;
                  body.finish_date = toLocalFormat(rawFinish) || rawFinish;
                } else {
                  const now = new Date();
                  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
                  const pad = (n) => String(n).padStart(2, '0');
                  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T00:00:00`;
                  body.start_date = fmt(brtNow);
                  body.finish_date = fmt(new Date(brtNow.getTime() + 14 * 24 * 60 * 60 * 1000));
                }
              }

              try {
                await axios.post(
                  `${ML_API}/seller-promotions/items/${itemId}?app_version=v2`,
                  body,
                  { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
                );
                console.log(`[CampanhasAuto BG] ✅ itemId=${itemId} type=${promo.type} ativado (tentativa ${i+1})`);
                ativadas++;
              } catch (e) {
                const msg = e.response?.data?.message || e.message;
                if (msg === 'No candidates found for item') {
                  temNoCandidates = true;
                } else {
                  console.error(`[CampanhasAuto BG] ❌ itemId=${itemId} type=${promo.type}: ${msg}`);
                }
              }
            }

            if (ativadas > 0) {
              console.log(`[CampanhasAuto BG] ✅ ${ativadas} campanha(s) ativadas para ${itemId}`);
              return;
            }
            if (!temNoCandidates) return; // outros erros, não adianta retry
          } catch (e) {
            console.error(`[CampanhasAuto BG] erro ao buscar promos para ${itemId}:`, e.message);
          }
        }
        console.warn(`[CampanhasAuto BG] ⚠️ ${itemId}: não foi possível ativar após todas as tentativas`);
      };

      // Executa em background sem bloquear a resposta HTTP
      tentarAtivar().catch(() => {});
    } catch (error) {
      res.status(500).json({ erro: 'Erro ao ativar campanhas', detalhes: error.message });
    }
  },
};
