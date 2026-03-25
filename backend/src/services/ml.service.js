import axios from 'axios';
import { config } from '../config/env.js';

export const mlService = {
  async authenticate(code) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.mlAppId,
      client_secret: config.mlClientSecret,
      code,
      redirect_uri: config.mlRedirectUri
    });
    // ✅ Timeout adicionado
    const res = await axios.post('https://api.mercadolibre.com/oauth/token', body, { timeout: 15000 });
    const authData = res.data;
    try {
      const userRes = await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${authData.access_token}` }});
      authData.nickname = userRes.data.nickname;

      const shipRes = await axios.get(`https://api.mercadolibre.com/users/${authData.user_id}/shipping_preferences`, { headers: { Authorization: `Bearer ${authData.access_token}` }});
      const pref = shipRes.data;
      
      let modo = 'ME2';
      if (pref.modes && pref.modes.includes('me1')) {
        const isMe1Default = pref.logistics?.some(l => l.mode === 'me1' && l.types?.some(t => t.default));
        if (!pref.modes.includes('me2') || isMe1Default || !pref.tags?.includes('optional_me1_allowed')) {
           modo = 'ME1';
        }
      }
      authData.envioSuportado = modo;

    } catch (e) {
      authData.envioSuportado = 'ME2';
    }

    return authData;
  },

  async refreshToken(refreshToken) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.mlAppId,
      client_secret: config.mlClientSecret,
      refresh_token: refreshToken
    });
    const res = await axios.post('https://api.mercadolibre.com/oauth/token', body);
    return res.data;
  },

  async getCategories(token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.get('https://api.mercadolibre.com/sites/MLB/categories', { headers });
    return res.data;
  },

  async getAllCategoriesDump() {
    const res = await axios.get('https://api.mercadolibre.com/sites/MLB/categories/all');
    return res.data;
  },

  async getCategoryAttributes(categoryId) {
    const res = await axios.get(`https://api.mercadolibre.com/categories/${categoryId}/attributes`);
    return res.data.filter(attr =>
      !attr.tags?.read_only &&
      !attr.tags?.not_modifiable &&
      !attr.tags?.fixed
    );
  },

  async predictCategory(title) {
    const res = await axios.get(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(title)}`);
    return res.data;
  },

  async simulateShipping({ accessToken, sellerId, itemPrice, categoryId, listingTypeId, dimensions, zipCode, itemId }) {
      const url = `https://api.mercadolibre.com/users/${sellerId}/shipping_options/free`;
      
      const params = {
        item_price: itemPrice,
        category_id: categoryId,
        listing_type_id: listingTypeId,
        zip_code: zipCode || '01001000',
        condition: 'new',
        mode: 'me2',
        logistic_type: 'drop_off'
      };

      // ✅ CORREÇÃO: Prioriza o envio do item_id se existir, 
      // para que o ML use o peso/dimensões reais do anúncio já cadastrado
      if (itemId) {
        params.item_id = itemId;
      } else {
        params.dimensions = dimensions;
      }

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params
      });
      return res.data.coverage?.all_country?.list_cost || 0;
    },

  async publishSmart({ accessToken, payload, description }) {
    try {
      const res = await axios.post('https://api.mercadolibre.com/items', payload, { 
        headers: { Authorization: `Bearer ${accessToken}` } 
      });
      
      if (description) {
        try { 
          await axios.post(`https://api.mercadolibre.com/items/${res.data.id}/description`, 
            { plain_text: description }, 
            { headers: { Authorization: `Bearer ${accessToken}` } }
          ); 
        } catch (e) { 
          console.error("Aviso: Falha ao inserir a descrição", e.message); 
        }
      }
      return res.data;
      
    } catch (err) {
      throw { 
        status: err.response?.status || 500, 
        details: err.response?.data || err.message 
      };
    }
  },

  // ✅ ALTERAÇÃO: sub_status adicionado ao attrs
  async getSingleAdDetails(itemId, accessToken) {
    const attrs = 'id,title,category_id,status,sub_status,price,original_price,available_quantity,sold_quantity,permalink,thumbnail,tags,seller_custom_field,attributes,variations,listing_type_id,sale_terms,catalog_listing,health,pictures';
    
    const [detailsRes, visitsRes, salePriceRes] = await Promise.all([
      axios.get(`https://api.mercadolibre.com/items/${itemId}?include_attributes=all&attributes=${attrs}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(err => { throw err; }),

      axios.get(`https://api.mercadolibre.com/visits/items?ids=${itemId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(() => null),

      axios.get(`https://api.mercadolibre.com/items/${itemId}/sale_price`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(() => null)
    ]);

    const adData = detailsRes.data;
    adData.visitas = visitsRes?.data?.[itemId] || 0;
    
    if (salePriceRes && salePriceRes.data) {
        const saleData = salePriceRes.data;
        if (saleData.amount) {
            adData.price = saleData.amount;
        }
        adData.original_price = saleData.regular_amount || null;
    }
    
    // ★ FALLBACK INFALÍVEL PARA VARIAÇÕES
    if (!adData.original_price && adData.variations && adData.variations.length > 0) {
       let maxOrig = null;
       for (const v of adData.variations) {
          if (v.original_price && v.original_price > (v.price || 0)) {
             if (!maxOrig || v.original_price > maxOrig) maxOrig = v.original_price;
          }
       }
       if (maxOrig) adData.original_price = maxOrig;
    }
    
    return adData;
  },
  
  async searchBySellerSku(sellerId, sku, accessToken) {
    const res = await axios.get(`https://api.mercadolibre.com/users/${sellerId}/items/search`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { seller_sku: sku }
    });
    return res.data.results || [];
  },

  async getQuestions(sellerId, accessToken, status = 'UNANSWERED', offset = 0, limit = 50) {
    const res = await axios.get('https://api.mercadolibre.com/questions/search', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { seller_id: sellerId, api_version: 4, status, offset, limit, sort_fields: 'date_created', sort_types: 'DESC' }
    });
    return res.data;
  },

  async getItemQuestions(itemId, accessToken) {
    const res = await axios.get('https://api.mercadolibre.com/questions/search', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { item: itemId, api_version: 4, limit: 50, sort_fields: 'date_created', sort_types: 'ASC' }
    });
    return res.data;
  },

  async answerQuestion(questionId, text, accessToken) {
    const res = await axios.post('https://api.mercadolibre.com/answers',
      { question_id: questionId, text },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.data;
  },

  async deleteQuestion(questionId, accessToken) {
    const res = await axios.delete(`https://api.mercadolibre.com/questions/${questionId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data;
  },

  // ── Métodos públicos para Monitor de Concorrentes ─────────────────────────

  // Busca dados de até 20 itens sem autenticação (API pública)
  async getPublicItems(itemIds) {
    const ids = itemIds.slice(0, 20).join(',');
    const attrs = 'id,title,price,available_quantity,sold_quantity,thumbnail,permalink,seller_id,seller';
    const res = await axios.get(`https://api.mercadolibre.com/items?ids=${ids}&attributes=${attrs}`, {
      timeout: 15000
    });
    return res.data; // array de { code, body } ou { code, body: { id, ... } }
  },

  // Busca perfil/reputação de um vendedor sem autenticação
  async getPublicSellerInfo(sellerId) {
    const res = await axios.get(
      `https://api.mercadolibre.com/users/${sellerId}?attributes=id,nickname,seller_reputation,transactions`,
      { timeout: 10000 }
    );
    return res.data;
  },

  // Extrai o ID de item MLB a partir de uma URL do ML
  extractItemIdFromUrl(url) {
    if (!url) return null;
    const s = url.trim();

    // 1. Tentar query params (Catálogo Seller Específico)
    const queryItem =
      s.match(/item_id[:%]3A(MLB\d+)/i) ||
      s.match(/item_id:(MLB\d+)/i) ||
      s.match(/[?&#]wid=(MLB\d+)/i) ||
      s.match(/[?&#]sid=(MLB\d+)/i);
    
    if (queryItem) {
      return queryItem[1].toUpperCase();
    }

    // Permite produto de catálogo de usuário (User Product / MLBU)
    const upMatch = s.match(/(MLBU\d+)/i);
    if (upMatch) {
      return upMatch[1].toUpperCase();
    }

    // Permite produto de catálogo geral (/p/MLB... ou /products/MLB...)
    const catMatch = s.match(/\/(?:p|products)\/(MLB\d+)/i) || s.match(/^(MLB\d+)$/i);
    if (catMatch) {
      return catMatch[1].toUpperCase();
    }

    // 2. Extração direta de item ID com traço
    const itemTracao = s.match(/MLB-(\d+)/i);
    if (itemTracao) return `MLB${itemTracao[1]}`;

    // 3. Fallback: extrai o MLB e os números ignorando sufixos
    const matchFallback = s.match(/MLB[-_]?(\d+)/i);
    if (matchFallback) {
      return `MLB${matchFallback[1]}`;
    }

    return null;
  }
};
