import axios from 'axios';

const ML_API = 'https://api.mercadolibre.com';
const ML_SITE_ID = 'MLB';
const VEHICLE_DOMAINS = { MLB: 'MLB-CARS_AND_VANS', MLA: 'MLA-CARS_AND_VANS' };
const VEHICLE_ATTRS_ORDER = {
  'MLB-CARS_AND_VANS':['BRAND', 'MODEL', 'VEHICLE_YEAR', 'ENGINE', 'TRIM', 'FUEL_TYPE'],
  'MLA-CARS_AND_VANS':['BRAND', 'MODEL', 'VEHICLE_YEAR', 'ENGINE', 'SHORT_VERSION'],
};

function mlHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Função para montar o nome do veículo com base nos atributos retornados pela API
function buildVehicleNameFromAttributes(attributes) {
  if (!Array.isArray(attributes)) return '';
  
  const getAttr = (id) => {
    const a = attributes.find(attr => attr.id === id);
    return a ? (a.value_name || '') : '';
  };

  const brand = getAttr('BRAND');
  const model = getAttr('MODEL') || getAttr('CAR_AND_VAN_MODEL');
  const year = getAttr('VEHICLE_YEAR') || getAttr('YEAR');
  const version = getAttr('TRIM') || getAttr('SHORT_VERSION') || getAttr('CAR_AND_VAN_SUBMODEL');
  const engine = getAttr('ENGINE') || getAttr('CAR_AND_VAN_ENGINE');

  // Junta tudo num texto só: Ex: "Volkswagen Gol 2023 1.6"
  return [brand, model, year, version, engine].filter(Boolean).join(' ').trim();
}

export const compatService = {

  // ------------------------------------------------------------------
  // 1. Retorna configuração do domínio de veículos (atributos ordenados)
  // ------------------------------------------------------------------
  getVehicleDomainConfig() {
    const domainId = VEHICLE_DOMAINS[ML_SITE_ID] || 'MLB-CARS_AND_VANS';
    const attributes = VEHICLE_ATTRS_ORDER[domainId] ||[];
    return { domainId, attributes, siteId: ML_SITE_ID };
  },

  // ------------------------------------------------------------------
  // 2. Busca top_values para um atributo de veículo (com cascata)
  //    POST /catalog_domains/{domain}/attributes/{attr}/top_values
  // ------------------------------------------------------------------
  async getAttributeTopValues(token, domainId, attributeId, knownAttributes =[]) {
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
    return[];
  },

  // ------------------------------------------------------------------
  // 3. Busca veículos no catálogo (com paginação automática)
  //    POST /catalog_compatibilities/products_search/chunks
  // ------------------------------------------------------------------
  async searchVehicles(token, domainId, knownAttributes =[], maxResults = 5000) {
    const url = `${ML_API}/catalog_compatibilities/products_search/chunks`;
    const headers = mlHeaders(token);

    const basePayload = { domain_id: domainId, site_id: ML_SITE_ID };
    if (knownAttributes && knownAttributes.length > 0) {
      basePayload.known_attributes = knownAttributes;
    }

    const PAGE_SIZE = 50;
    const allResults =[];
    const seenIds = new Set();
    let offset = 0;
    let totalFound = null;

    let nextToken = null;
    let tokenField = null;

    function extractNextToken(data) {
      const fields =['next_cursor', 'cursor', 'scroll_id', 'next_scroll_id', 'chunk_id', 'next_chunk_id', 'next'];
      for (const f of fields) {
        const v = data[f];
        if (v && typeof v === 'string') return [f, v];
      }
      const paging = data.paging || {};
      for (const f of fields) {
        const v = paging[f];
        if (v && typeof v === 'string') return [f, v];
      }
      return [null, null];
    }

    let lastFirstId = null;
    let repeatedPages = 0;

    while (allResults.length < maxResults) {
      const params = { limit: PAGE_SIZE };
      if (nextToken && tokenField) {
        params[tokenField] = nextToken;
      } else {
        params.offset = offset;
      }

      const res = await axios.post(url, basePayload, { headers, params, timeout: 25000 });
      const data = res.data || {};
      const pageResults = data.results ||[];

      if (totalFound === null) totalFound = data.total ?? null;
      if (pageResults.length === 0) break;

      const firstId = pageResults[0]?.id;
      if (firstId && firstId === lastFirstId) {
        repeatedPages++;
        if (repeatedPages >= 2) break;
      } else {
        repeatedPages = 0;
      }
      lastFirstId = firstId;

      for (const v of pageResults) {
        const vid = v?.id;
        if (vid && !seenIds.has(vid)) {
          seenIds.add(vid);
          let vName = v.name || v.title;
          if (!vName && v.attributes) {
            vName = buildVehicleNameFromAttributes(v.attributes);
          }
          allResults.push({ id: vid, name: vName || vid, attributes: v.attributes ||[] });
        }
        if (allResults.length >= maxResults) break;
      }
      if (allResults.length >= maxResults) break;

      const[tf, tv] = extractNextToken(data);
      if (tv) {
        tokenField = tf;
        nextToken = tv;
      } else {
        nextToken = null;
        tokenField = null;
        if (totalFound !== null && offset + PAGE_SIZE >= totalFound) break;
        offset += PAGE_SIZE;
      }

      if (pageResults.length < PAGE_SIZE) break;
      await new Promise(r => setTimeout(r, 250));
    }

    return { results: allResults, total: totalFound ?? allResults.length };
  },

  // ------------------------------------------------------------------
  // 4. Resolve contexto de um item (domain_id, category_id, user_product_id)
  // ------------------------------------------------------------------
  async resolveItemContext(token, itemId) {
    const headers = mlHeaders(token);
    // domainId = domínio da PEÇA (ex: MLB-VEHICLE_BUMPERS) — NÃO sobrescrever com domínio de veículo
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

    if (ctx.userProductId) {
      try {
        const res = await axios.get(`${ML_API}/user-products/${ctx.userProductId}`, { headers, timeout: 20000 });
        // ✅ Não sobrescreve ctx.domainId — o domínio do user-product é o de VEÍCULO (MLB-CARS_AND_VANS),
        // enquanto ctx.domainId deve ser o da PEÇA (ex: MLB-VEHICLE_BUMPERS) para getPositionValues funcionar.
        // Se o item não tinha domain_id próprio, usamos o do user-product como fallback.
        if (res.data?.domain_id && !ctx.domainId) ctx.domainId = res.data.domain_id;
      } catch (_) {}
    }

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

    // main_domain_id é obrigatório para ambos os endpoints (items e user-products)
    let mainDomainId = null;
    if (ctx.domainId && ctx.categoryId) {
      mainDomainId = await this._resolveVehicleDomain(token, ctx.domainId, ctx.categoryId);
    }
    if (!mainDomainId) mainDomainId = VEHICLE_DOMAINS[ML_SITE_ID] || 'MLB-CARS_AND_VANS';

    const allCompats =[];
    const seenIds = new Set();
    let offset = 0;
    const PAGE_SIZE = 50;
    let totalFound = null;
    let pageCount = 0;
    const MAX_PAGES = 60; // 60 × 50 = 3.000 veículos máx — evita loop infinito

    while (pageCount < MAX_PAGES) {
      pageCount++;
      // main_domain_id é necessário apenas para user-products; para items regulares, omitir para evitar erro 400
      const params = ctx.userProductId
        ? { extended: 'true', limit: PAGE_SIZE, offset, main_domain_id: mainDomainId }
        : { extended: 'true', limit: PAGE_SIZE, offset };

      const res = await axios.get(baseUrl, { headers, params, timeout: 30000 });
      const data = res.data || {};
      const pageProducts = data.products || data.results ||[];
      const paging = data.paging || {};

      if (totalFound === null) totalFound = paging.total || data.total || null;
      if (pageProducts.length === 0) break;

      for (const p of pageProducts) {
        const vid = p?.catalog_product_id || p?.id;
        if (vid && !seenIds.has(vid)) {
          seenIds.add(vid);
          let vName = p.catalog_product_name || p.name || p.title;
          if (!vName && p.attributes) {
            vName = buildVehicleNameFromAttributes(p.attributes);
          }

          allCompats.push({
            catalog_product_id: vid,
            name: vName || vid,
            note: p.note || '',
            restrictions: Array.isArray(p.restrictions) ? p.restrictions : [],
            attributes: p.attributes ||[],
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
  // 6. Aplica (PUT) lista de compatibilidades (Corrigido para evitar Bug das Notas Vazias e Limite de 200)
  // ------------------------------------------------------------------
  async applyItemCompatibilities(token, itemId, compatibilitiesList) {
    const headers = mlHeaders(token);
    const ctx = await this.resolveItemContext(token, itemId);

    let vehicleDomain = null;
    if (ctx.domainId && ctx.categoryId) {
      vehicleDomain = await this._resolveVehicleDomain(token, ctx.domainId, ctx.categoryId);
    }
    if (!vehicleDomain) vehicleDomain = VEHICLE_DOMAINS[ML_SITE_ID] || 'MLB-CARS_AND_VANS';

    const baseUrl = ctx.userProductId
      ? `${ML_API}/user-products/${ctx.userProductId}/compatibilities`
      : `${ML_API}/items/${itemId}/compatibilities`;

    let existingProducts =[];
    try {
      const getRes = await this.getItemCompatibilities(token, itemId);
      existingProducts = getRes.compatibilities || [];
    } catch (e) {
      console.error('[compat] Aviso ao buscar compats atuais:', e.message);
    }

    const existingMap = new Map(existingProducts.map(p => [String(p.catalog_product_id || p.id), p]));

    const createProducts = [];
    const updateProducts =[];
    const keepIds = new Set();

    const sanitizeRestrictions = (rests) => {
      if (!Array.isArray(rests)) return[];
      return rests.map(r => ({
        attribute_id: r.attribute_id,
        attribute_values: (r.attribute_values ||[]).map(av => ({
          values: (av.values ||[]).map(v => {
            const cleanV = { value_name: v.value_name };
            if (v.value_id && String(v.value_id).trim() !== '') cleanV.value_id = String(v.value_id);
            return cleanV;
          }).filter(v => v.value_name)
        })).filter(av => Array.isArray(av.values) && av.values.length > 0)
      })).filter(r => r.attribute_id && Array.isArray(r.attribute_values) && r.attribute_values.length > 0);
    };

    for (const entry of compatibilitiesList) {
      const vid = String(entry.catalog_product_id || entry.id);
      if(!vid || entry.type === 'family') continue; 

      const sanitizedRestrictions = sanitizeRestrictions(entry.restrictions ||[]);

      // ✅ CORREÇÃO 1: Evita o erro de API "Invalid format" causado por notas vazias
      const payloadItem = {
        id: vid,
        creation_source: entry.creation_source || 'DEFAULT',
        restrictions: sanitizedRestrictions
      };

      if (entry.note && entry.note.trim() !== '') {
        payloadItem.note = entry.note.trim();
      }

      if (existingMap.has(vid)) {
        updateProducts.push(payloadItem);
        keepIds.add(vid);
      } else {
        createProducts.push(payloadItem);
      }
    }

    const deleteProducts =[];
    for (const existingId of existingMap.keys()) {
      if (!keepIds.has(existingId)) deleteProducts.push({ id: existingId });
    }

    // ✅ CORREÇÃO 2: Pica (Chunk) as operações para não estourar o limite de 200 items da API do ML.
    const allOperations = [
      ...createProducts.map(p => ({ type: 'create', data: p })),
      ...updateProducts.map(p => ({ type: 'update', data: p })),
      ...deleteProducts.map(p => ({ type: 'delete', data: p }))
    ];

    if (allOperations.length === 0) {
      return { success: true, message: 'Nenhuma alteração de compatibilidade necessária.' };
    }

    const CHUNK_SIZE = 190; // Usando 190 para ter uma margem segura
    let veiculosProcessadosCount = 0;

    for (let i = 0; i < allOperations.length; i += CHUNK_SIZE) {
      const chunk = allOperations.slice(i, i + CHUNK_SIZE);
      const finalPayload = {};

      const creates = chunk.filter(op => op.type === 'create').map(op => op.data);
      const updates = chunk.filter(op => op.type === 'update').map(op => op.data);
      const deletes = chunk.filter(op => op.type === 'delete').map(op => op.data);

      if (creates.length > 0) finalPayload.create = { products: creates };
      if (updates.length > 0) finalPayload.update = { products: updates };
      if (deletes.length > 0) finalPayload.delete = { products: deletes };

      if (ctx.userProductId) {
        finalPayload.domain_id = vehicleDomain || 'MLB-CARS_AND_VANS';
        if (ctx.categoryId) finalPayload.category_id = ctx.categoryId;
      }

      try {
        await axios.put(baseUrl, finalPayload, { headers, timeout: 90000 });
        veiculosProcessadosCount += chunk.length;

        if (i + CHUNK_SIZE < allOperations.length) {
          await new Promise(r => setTimeout(r, 600)); // Rate limit pause
        }
      } catch (error) {
        if (error.response?.data) {
          const mlMsg = error.response.data.message || error.message;
          const mlCause = error.response.data.cause ? error.response.data.cause.map(c => c.message).join(', ') : '';
          throw new Error(mlCause ? `${mlMsg} - ${mlCause}` : mlMsg);
        }
        throw error;
      }
    }

    return {
      success: true,
      message: `Enviados! ${createProducts.length} criados, ${updateProducts.length} atualizados, ${deleteProducts.length} excluídos.`
    };
  },

  // ------------------------------------------------------------------
  // 6b. Aplica POSITION em compatibilidades já existentes (update separado)
  // ------------------------------------------------------------------
  async applyItemCompatibilityPositions(token, itemId, pendingPositionRestrictions) {
    const headers = mlHeaders(token);
    const ctx = await this.resolveItemContext(token, itemId);

    const putUrl = ctx.userProductId
      ? `${ML_API}/user-products/${ctx.userProductId}/compatibilities`
      : `${ML_API}/items/${itemId}/compatibilities`;

    const { compatibilities: existingProducts } = await this.getItemCompatibilities(token, itemId);

    if (!Array.isArray(existingProducts) || existingProducts.length === 0) {
      return { success: false, message: 'Nenhuma compatibilidade existente encontrada no anúncio.' };
    }

    const existingMap = new Map(existingProducts.map(p =>[String(p.catalog_product_id || p.id), p]));
    const updates =[];

    for (const pending of pendingPositionRestrictions) {
      const existingVehicle = existingMap.get(String(pending.id));
      if (existingVehicle) {
        updates.push({
          id: String(pending.id),
          note: existingVehicle.note || '',
          creation_source: existingVehicle.creation_source || 'DEFAULT',
          restrictions: [pending.restriction],
        });
      }
    }

    if (updates.length === 0) {
      return { success: true, message: 'Nenhuma compatibilidade correspondente encontrada para atualizar.' };
    }

    const updatePayload = { update: { products: updates } };

    if (ctx.userProductId) {
      let vehicleDomain = VEHICLE_DOMAINS[ML_SITE_ID] || 'MLB-CARS_AND_VANS';
      if (ctx.domainId && ctx.categoryId) {
        vehicleDomain = await this._resolveVehicleDomain(token, ctx.domainId, ctx.categoryId) || vehicleDomain;
      }
      updatePayload.domain_id = vehicleDomain;
      if (ctx.categoryId) updatePayload.category_id = ctx.categoryId;
    }

    try {
      const putRes = await axios.put(putUrl, updatePayload, { headers, timeout: 90000 });
      return {
        success: true,
        message: `Posição aplicada em ${updates.length} compatibilidade(s).`,
        data: putRes.data,
      };
    } catch (error) {
      if (error.response?.data) {
        const mlMsg = error.response.data.message || 'Erro desconhecido da API ML.';
        const mlCause = error.response.data.cause ? error.response.data.cause.map(c => c.message).join(', ') : '';
        throw new Error(mlCause ? `${mlMsg} - ${mlCause}` : mlMsg);
      }
      throw error;
    }
  },

  // ------------------------------------------------------------------
  // Helper: Resolve o domínio de veículo compatível para uma peça
  // ------------------------------------------------------------------
  async _resolveVehicleDomain(token, partDomainId, categoryId) {
    try {
      const dumpUrl = `${ML_API}/catalog/dumps/domains/${ML_SITE_ID}/compatibilities`;
      const res = await axios.get(dumpUrl, { headers: mlHeaders(token), timeout: 15000 });
      for (const d of (res.data || [])) {
        if (d.domain_id === partDomainId) {
          const compat = (d.compatibilities || []).find(c => c.type === 'EXTENSION');
          if (compat?.compatible_domain_id) return compat.compatible_domain_id;
        }
      }
    } catch (_) {}
    return VEHICLE_DOMAINS[ML_SITE_ID] || null;
  },

  // ------------------------------------------------------------------
  // 7. Busca valores de posição (restrições POSITION) para um domínio
  // ------------------------------------------------------------------
  async getPositionValues(token, mainDomainId, secondaryDomainId) {
    if (!mainDomainId || !secondaryDomainId) return { values: [], combined_values:[] };
    try {
      const url = `${ML_API}/catalog_compatibilities/restrictions/values`;
      const params = { main_domain_id: mainDomainId, secondary_domain_id: secondaryDomainId };
      const res = await axios.get(url, { headers: mlHeaders(token), params, timeout: 15000 });
      const data = res.data || {};
      const attrValues = data.attributes_values ||[];
      const posAttr = attrValues.find(a => a.attribute_id === 'POSITION');
      return {
        values: posAttr?.values ||[],
        combined_values: posAttr?.combined_values || [],
      };
    } catch (e) {
      console.error('[compat] getPositionValues error:', e.message);
      return { values: [], combined_values:[] };
    }
  },

  // ------------------------------------------------------------------
  // 8. Aplica compatibilidades de um perfil a múltiplos itens
  // ------------------------------------------------------------------
  async applyCompatToItems(token, itemIds, compatibilities) {
    const results =[];
    for (const itemId of itemIds) {
      try {
        const result = await this.applyItemCompatibilities(token, itemId, compatibilities);
        results.push({ itemId, success: true, message: result.message });
      } catch (err) {
        results.push({ itemId, success: false, erro: err.response?.data?.message || err.message });
      }
    }
    return results;
  },

  // ------------------------------------------------------------------
  // 8. Busca display name de um atributo via API
  // ------------------------------------------------------------------
  async getAttributeDisplayNames(token, domainId) {
    try {
      const res = await axios.get(`${ML_API}/catalog_domains/${domainId}/attributes`, { headers: mlHeaders(token), timeout: 15000 });
      const nameMap = {};
      for (const attr of (res.data || [])) if (attr.id && attr.name) nameMap[attr.id] = attr.name;
      return nameMap;
    } catch (e) { return {}; }
  },

  // ------------------------------------------------------------------
  // APLICAÇÃO DE POSIÇÃO EM MASSA (Diretamente nas compatibilidades)
  // ------------------------------------------------------------------
  async updateAllCompatibilitiesPosition(token, itemId, positionStrings) {
    const headers = mlHeaders(token);
    
    const ctx = await this.resolveItemContext(token, itemId);
    const { compatibilities: existingProducts } = await this.getItemCompatibilities(token, itemId);

    if (!Array.isArray(existingProducts) || existingProducts.length === 0) {
      return { success: false, message: 'Nenhum veículo compatível encontrado no anúncio para receber a posição.' };
    }

    let vehicleDomain = VEHICLE_DOMAINS[ML_SITE_ID] || 'MLB-CARS_AND_VANS';
    if (ctx.domainId && ctx.categoryId) {
      vehicleDomain = await this._resolveVehicleDomain(token, ctx.domainId, ctx.categoryId) || vehicleDomain;
    }

    let validPosMap = {};
    if (ctx.domainId) {
      const posData = await this.getPositionValues(token, vehicleDomain, ctx.domainId);
      if (posData) {
        for (const pv of (posData.values ||[])) {
          if (pv.value_id && pv.value_name) validPosMap[pv.value_name.toLowerCase()] = String(pv.value_id);
        }
        for (const combo of (posData.combined_values ||[])) {
          for (const v of (combo.values ||[])) {
            if (v.value_id && v.value_name && !validPosMap[v.value_name.toLowerCase()]) validPosMap[v.value_name.toLowerCase()] = String(v.value_id);
          }
        }
      }
    }

    const missingIds = positionStrings.filter(pos => !validPosMap[pos.toLowerCase()]);
    if (missingIds.length > 0 && Object.keys(validPosMap).length > 0) {
      const mapKeys = Object.keys(validPosMap);
      throw new Error(
        `Não foi possível encontrar os IDs das posições: "${missingIds.join('", "')}". Posições disponíveis: ${mapKeys.join(', ')}.`
      );
    }

    const attributeValuesFormatados = [];
    for (const posStr of positionStrings) {
      const vName = posStr.trim();
      const vId = validPosMap[vName.toLowerCase()];
      const obj = { value_name: vName.charAt(0).toUpperCase() + vName.slice(1).toLowerCase() };
      if (vId) obj.value_id = String(vId); 
      attributeValuesFormatados.push({ values: [obj] });
    }

    const novaRestricao = {
      attribute_id: 'POSITION',
      attribute_values: attributeValuesFormatados
    };

    const putUrl = ctx.userProductId
      ? `${ML_API}/user-products/${ctx.userProductId}/compatibilities`
      : `${ML_API}/items/${itemId}/compatibilities`;

    const CHUNK_SIZE = 190;
    let veiculosProcessadosCount = 0;

    for (let i = 0; i < existingProducts.length; i += CHUNK_SIZE) {
      const chunk = existingProducts.slice(i, i + CHUNK_SIZE);
      
      const updates = chunk.map(v => {
        const currentRestrictions = Array.isArray(v.restrictions) ? v.restrictions : [];
        const outrasRestricoes = currentRestrictions.filter(r => r?.attribute_id !== 'POSITION');

        const updateObject = {
          id: String(v.catalog_product_id || v.id),
          creation_source: v.creation_source || 'DEFAULT',
          restrictions: [...outrasRestricoes, novaRestricao]
        };

        if (v.note && v.note.trim() !== '') {
          updateObject.note = v.note.trim();
        }
        
        return updateObject;
      });
      const updatePayload = { update: { products: updates } };

      if (ctx.userProductId) {
          if (vehicleDomain) updatePayload.domain_id = vehicleDomain;
          if (ctx.categoryId) updatePayload.category_id = ctx.categoryId;
      }

      try {
        await axios.put(putUrl, updatePayload, { headers, timeout: 60000 });
        veiculosProcessadosCount += updates.length;
        if (i + CHUNK_SIZE < existingProducts.length) {
          await new Promise(r => setTimeout(r, 600));
        }
      } catch (error) {
        throw error;
      }
    }

    return { 
      success: true, 
      message: `aplicada com sucesso a ${veiculosProcessadosCount} veículo(s).` 
    };
  }


};