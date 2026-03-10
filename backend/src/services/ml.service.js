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
    const res = await axios.post('https://api.mercadolibre.com/oauth/token', body);
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
    return res.data.filter(attr => !attr.tags?.read_only);
  },

  async predictCategory(title) {
    const res = await axios.get(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(title)}`);
    return res.data;
  },

  async simulateShipping({ accessToken, sellerId, itemPrice, categoryId, listingTypeId, dimensions, zipCode }) {
    const url = `https://api.mercadolibre.com/users/${sellerId}/shipping_options/free`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { item_price: itemPrice, category_id: categoryId, listing_type_id: listingTypeId, dimensions, zip_code: zipCode || '01001000', condition: 'new', mode: 'me2', logistic_type: 'drop_off' }
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
    const attrs = 'id,title,status,sub_status,price,original_price,available_quantity,sold_quantity,permalink,thumbnail,tags,seller_custom_field,attributes,variations,listing_type_id,sale_terms,catalog_listing,health';
    
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
  }
};
