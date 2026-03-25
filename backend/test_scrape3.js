import axios from 'axios';
const url = "https://www.mercadolivre.com.br/cilindro-miolo-ignicao-com-comutador-jeep-rural-f75-willys/up/MLBU729375488#polycard_client=search-desktop&search_layout=grid&position=1&type=product";

// Scraping de página do ML — extrai preço, título, thumbnail via JSON-LD / meta tags
async function scrapeMLPage(itemId, originalUrl) {
  const urls = [];
  if (itemId && /^MLB\d+$/i.test(itemId)) {
    const num = itemId.replace(/^MLB/i, '');
    urls.push(`https://produto.mercadolivre.com.br/MLB-${num}`);
  }
  if (originalUrl) urls.push(originalUrl);

  const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: SCRAPE_HEADERS, timeout: 20000, maxRedirects: 5 });
      const html = typeof res.data === 'string' ? res.data : '';
      if (!html) continue;

      // 1. JSON-LD
      const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = ldRe.exec(html)) !== null) {
        try {
          const objs = [].concat(JSON.parse(m[1]));
          for (const p of objs) {
            if (p['@type'] !== 'Product' || !p.offers) continue;
            const offer = [].concat(p.offers)[0];
            const price = parseFloat(offer?.price ?? offer?.lowPrice) || 0;
            if (price <= 0) continue;
            const img = Array.isArray(p.image) ? p.image[0] : (typeof p.image === 'string' ? p.image : null);
            return { price, title: p.name || '', thumbnail: img, permalink: url, sellerNickname: offer?.seller?.name || null };
          }
        } catch { /* JSON inválido, tenta próximo */ }
      }

      // 2. Open Graph / meta tags
      const priceMeta = html.match(/content="BRL;\s*([\d.]+)"/i)
        || html.match(/"price"\s*:\s*"([\d.]+)"/);
      const titleMeta = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      const imgMeta   = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (priceMeta) {
        const price = parseFloat(priceMeta[1]) || 0;
        if (price > 0) {
          return {
            price, title: titleMeta?.[1] || '',
            thumbnail: imgMeta?.[1] || null,
            permalink: url, sellerNickname: null,
          };
        }
      }
    } catch (e) {
      console.error('[scrapeMLPage] erro para', url, '-', e.message);
    }
  }
  return null;
}

scrapeMLPage(null, url).then(console.log);
