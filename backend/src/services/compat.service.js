// =====================================================================
// backend/src/services/compat.service.js
// =====================================================================
// Serviço dedicado para operações de compatibilidade veicular (fitment)
// no Mercado Livre. Proxeia todas as chamadas à API do ML.
// =====================================================================

import axios from 'axios';

const ML_API = 'https://api.mercadolibre.com';
const ML_SITE_ID = 'MLB';
const VEHICLE_DOMAINS = { MLB: 'MLB-CARS_AND_VANS', MLA: 'MLA-CARS_AND_VANS' };
const VEHICLE_ATTRS_ORDER = {
  'MLB-CARS_AND_VANS': ['BRAND', 'MODEL', 'VEHICLE_YEAR', 'ENGINE', 'TRIM', 'FUEL_TYPE'],
  'MLA-CARS_AND_VANS': ['BRAND', 'MODEL', 'VEHICLE_YEAR', 'ENGINE', 'SHORT_VERSION'],
};

function mlHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export const compatService = {

  // ------------------------------------------------------------------
  // 1. Retorna configuração do domínio de veículos (atributos ordenados)
  // ------------------------------------------------------------------
  getVehicleDomainConfig() {
    const domainId = VEHICLE_DOMAINS[ML_SITE_ID] || 'MLB-CARS_AND_VANS';
    const attributes = VEHICLE_ATTRS_ORDER[domainId] || [];
    return { domainId, attributes, siteId: ML_SITE_ID };
  },

  // ------------------------------------------------------------------
  // 2. Busca top_values para um atributo de veículo (com cascata)
  //    POST /catalog_domains/{domain}/attributes/{attr}/top_values
  // ------------------------------------------------------------------
  async getAttributeTopValues(token, domainId, attributeId, knownAttributes = []) {
    const url = `${ML_API}/catalog_domains/${domainId}/attributes/${attributeId}/top_values`;
    const payload = { limit: 500 };
    if (knownAttributes && knownAttributes.length > 0) {
      payload.known_attributes = knownAttributes;
    }

    const res = await axios.post(url, payload, { headers: mlHeaders(token), timeout: 20000 });
    const data = res.data;

    // Normaliza resposta: lista de {id, name}
    if (Array.isArray(data)) {
      return data
        .filter(v => v && v.id && v.name)
        .map(v => ({ id: String(v.id), name: String(v.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return [];
  },

  // ------------------------------------------------------------------
  // 3. Busca veículos no catálogo (com paginação automática)
  //    POST /catalog_compatibilities/products_search/chunks
  // ------------------------------------------------------------------
  async searchVehicles(token, domainId, knownAttributes = [], maxResults = 5000) {
    const url = `${ML_API}/catalog_compatibilities/products_search/chunks`;
    const headers = mlHeaders(token);

    const basePayload = { domain_id: domainId, site_id: ML_SITE_ID };
    if (knownAttributes && knownAttributes.length > 0) {
      basePayload.known_attributes = knownAttributes;
    }

    const PAGE_SIZE = 50;
    const allResults = [];
    const seenIds = new Set();
    let offset = 0;
    let totalFound = null;

    while (allResults.length < maxResults) {
      const params = { limit: PAGE_SIZE, offset };

      const res = await axios.post(url, basePayload, { headers, params, timeout: 25000 });
      const data = res.data || {};
      const pageResults = data.results || [];

      if (totalFound === null) totalFound = data.total || null;
      if (pageResults.length === 0) break;

      for (const v of pageResults) {
        const vid = v?.id;
        if (vid && !seenIds.has(vid)) {
          seenIds.add(vid);
          allResults.push({
            id: vid,
            name: v.name || v.title || vid,
            attributes: v.attributes || [],
          });
        }
        if (allResults.length >= maxResults) break;
      }

      offset += PAGE_SIZE;
      if (totalFound !== null && offset >= totalFound) break;
      if (pageResults.length < PAGE_SIZE) break;

      // throttle gentil
      await new Promise(r => setTimeout(r, 200));
    }

    return { results: allResults, total: totalFound || allResults.length };
  },

  // ------------------------------------------------------------------
  // 4. Resolve contexto de um item (domain_id, category_id, user_product_id)
  // ------------------------------------------------------------------
  async resolveItemContext(token, itemId) {
    const headers = mlHeaders(token);
    const ctx = { itemId, userProductId: null, domainId: null, categoryId: null };

    try {
      const res = await axios.get(
        `${ML_API}/items/${itemId}?attributes=id,category_id,domain_id,user_product_id`,
        { headers, timeout: 20000 }
      );
      const d = res.data;
      ctx.categoryId = d.category_id || null;
      ctx.domainId = d.domain_id || null;
      ctx.userProductId = d.user_product_id || null;
    } catch (e) {
      console.error(`[compat] Erro ao buscar item ${itemId}:`, e.message);
    }

    // Se tiver user_product, tenta pegar domínio mais preciso
    if (ctx.userProductId) {
      try {
        const res = await axios.get(`${ML_API}/user-products/${ctx.userProductId}`, { headers, timeout: 20000 });
        if (res.data?.domain_id) ctx.domainId = res.data.domain_id;
      } catch (_) {}
    }

    // Fallback: buscar domínio via categoria
    if (ctx.categoryId && !ctx.domainId) {
      try {
        const res = await axios.get(`${ML_API}/categories/${ctx.categoryId}`, { headers, timeout: 20000 });
        ctx.domainId = res.data?.settings?.catalog_domain || null;
      } catch (_) {}
    }

    return ctx;
  },

  // ------------------------------------------------------------------
  // 5. Carrega compatibilidades existentes de um item (com paginação)
  //    GET /items/{item_id}/compatibilities  (ou /user-products/...)
  // ------------------------------------------------------------------
  async getItemCompatibilities(token, itemId) {
    const headers = mlHeaders(token);
    const ctx = await this.resolveItemContext(token, itemId);

    const baseUrl = ctx.userProductId
      ? `${ML_API}/user-products/${ctx.userProductId}/compatibilities`
      : `${ML_API}/items/${itemId}/compatibilities`;

    const allCompats = [];
    const seenIds = new Set();
    let offset = 0;
    const PAGE_SIZE = 50;
    let totalFound = null;

    while (true) {
      const params = { extended: 'true', limit: PAGE_SIZE, offset };

      const res = await axios.get(baseUrl, { headers, params, timeout: 30000 });
      const data = res.data || {};
      const pageProducts = data.products || data.results || [];
      const paging = data.paging || {};

      if (totalFound === null) totalFound = paging.total || data.total || null;
      if (pageProducts.length === 0) break;

      for (const p of pageProducts) {
        const vid = p?.catalog_product_id || p?.id;
        if (vid && !seenIds.has(vid)) {
          seenIds.add(vid);
          allCompats.push({
            catalog_product_id: vid,
            name: p.name || p.title || vid,
            note: p.note || '',
            restrictions: p.restrictions || p.position || '',
            attributes: p.attributes || [],
            creation_source: p.creation_source || 'DEFAULT',
          });
        }
      }

      offset += PAGE_SIZE;
      if (totalFound !== null && offset >= totalFound) break;
      if (pageProducts.length < PAGE_SIZE) break;

      await new Promise(r => setTimeout(r, 200));
    }

    return { compatibilities: allCompats, total: totalFound || allCompats.length, context: ctx };
  },

  // ------------------------------------------------------------------
  // 6. Aplica (PUT) lista de compatibilidades a um item no ML
  //    PUT /items/{item_id}/compatibilities  (ou /user-products/...)
  // ------------------------------------------------------------------
  async applyItemCompatibilities(token, itemId, compatibilitiesList) {
    const headers = mlHeaders(token);
    const ctx = await this.resolveItemContext(token, itemId);

    // Determina domínio de veículo
    let vehicleDomain = null;
    if (ctx.domainId && ctx.categoryId) {
      vehicleDomain = await this._resolveVehicleDomain(token, ctx.domainId, ctx.categoryId);
    }
    if (!vehicleDomain) vehicleDomain = VEHICLE_DOMAINS[ML_SITE_ID];

    // Monta payload
    const products = [];
    const productsFamilies = [];

    for (const entry of compatibilitiesList) {
      const vid = entry.catalog_product_id || entry.id;

      if (entry.type === 'family' || (entry.attributes && !vid)) {
        // Compatibilidade por atributos (família)
        if (entry.attributes && vehicleDomain) {
          productsFamilies.push({
            domain_id: entry.domain_id || vehicleDomain,
            attributes: entry.attributes,
            creation_source: entry.creation_source || 'DEFAULT',
          });
        }
      } else if (vid) {
        // Compatibilidade por produto (ID específico)
        products.push({
          id: String(vid),
          creation_source: entry.creation_source || 'DEFAULT',
        });
      }
    }

    const createPayload = {};
    if (products.length > 0) createPayload.products = products;
    if (productsFamilies.length > 0) createPayload.products_families = productsFamilies;

    if (Object.keys(createPayload).length === 0) {
      return { success: false, message: 'Nenhuma compatibilidade válida para enviar.' };
    }

    const finalPayload = { create: createPayload };

    // Para user-product, adiciona domain_id e category_id no topo
    const url = ctx.userProductId
      ? `${ML_API}/user-products/${ctx.userProductId}/compatibilities`
      : `${ML_API}/items/${itemId}/compatibilities`;

    if (ctx.userProductId) {
      if (vehicleDomain) finalPayload.domain_id = vehicleDomain;
      if (ctx.categoryId) finalPayload.category_id = ctx.categoryId;
    }

    console.log(`[compat] PUT ${url}`, JSON.stringify(finalPayload).substring(0, 800));

    const res = await axios.put(url, finalPayload, { headers, timeout: 90000 });
    return { success: true, message: `Enviados ${products.length + productsFamilies.length} registros.`, data: res.data };
  },

  // ------------------------------------------------------------------
  // Helper: Resolve o domínio de veículo compatível para uma peça
  // ------------------------------------------------------------------
  async _resolveVehicleDomain(token, partDomainId, categoryId) {
    try {
      const dumpUrl = `${ML_API}/catalog/dumps/domains/${ML_SITE_ID}/compatibilities`;
      const res = await axios.get(dumpUrl, { headers: mlHeaders(token), timeout: 15000 });
      const domains = res.data || [];

      for (const d of domains) {
        const partDomain = d.part_domain || d.source_domain;
        const vehicleDomain = d.vehicle_domain || d.target_domain;
        if (partDomain === partDomainId && vehicleDomain) {
          return vehicleDomain;
        }
      }
    } catch (_) {}

    // Fallback
    return VEHICLE_DOMAINS[ML_SITE_ID] || null;
  },

  // ------------------------------------------------------------------
  // 7. Busca display name de um atributo via API
  //    GET /catalog_domains/{domain}/attributes
  // ------------------------------------------------------------------
  async getAttributeDisplayNames(token, domainId) {
    try {
      const url = `${ML_API}/catalog_domains/${domainId}/attributes`;
      const res = await axios.get(url, { headers: mlHeaders(token), timeout: 15000 });
      const attrs = res.data || [];

      const nameMap = {};
      for (const attr of attrs) {
        if (attr.id && attr.name) {
          nameMap[attr.id] = attr.name;
        }
      }
      return nameMap;
    } catch (e) {
      console.error(`[compat] Erro ao buscar nomes de atributos para ${domainId}:`, e.message);
      return {};
    }
  },
};
