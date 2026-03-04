const API_URL = '/api/ml';

export const mlApi = {
  async getCategories(token) {
    const tokenParam = token ? `?token=${token}` : '';
    const res = await fetch(`${API_URL}/categories${tokenParam}`);
    if (!res.ok) throw new Error('Falha ao buscar categorias raiz');
    return res.json();
  },

  async getAllCategoriesDump() {
    const res = await fetch(`${API_URL}/categories-all`);
    return res.json();
  },

  async getAttributes(categoryId) {
    const res = await fetch(`${API_URL}/categories/${categoryId}/attributes`);
    return res.json();
  }
};