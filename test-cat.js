import axios from 'axios';

async function test() {
  const titulo = 'Par Terminal De Direção - Jeep Willys Rural F75';
  const predRes = await axios.get(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(titulo)}`);
  const opcoes = predRes.data || [];
  
  const enhanced = await Promise.all(opcoes.map(async o => {
    try {
      const catRes = await axios.get(`https://api.mercadolibre.com/categories/${o.category_id}`);
      if (catRes.data && catRes.data.path_from_root) {
        return { category_id: o.category_id, category_name: catRes.data.path_from_root.map(p => p.name).join(' > ') };
      }
    } catch (e) {}
    return { category_id: o.category_id, category_name: o.category_name };
  }));
  console.log(JSON.stringify(enhanced, null, 2));
}

test();
