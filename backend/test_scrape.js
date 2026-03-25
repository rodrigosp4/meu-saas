import axios from 'axios';

const url = "https://www.mercadolivre.com.br/cilindro-miolo-ignicao-com-comutador-jeep-rural-f75-willys/up/MLBU729375488";
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function test() {
  const { data: html } = await axios.get(url, { headers });
  console.log("Got HTML length:", html.length);
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let matches = 0;
  while ((m = ldRe.exec(html)) !== null) {
      matches++;
      console.log("LD-JSON match", matches);
      try {
        const objs = [].concat(JSON.parse(m[1]));
        for (const p of objs) {
            console.log("Type:", p['@type']);
            if (p['@type'] !== 'Product' || !p.offers) continue;
            const offer = [].concat(p.offers)[0];
            const price = parseFloat(offer?.price ?? offer?.lowPrice) || 0;
            console.log("Price:", price, "Name:", p.name);
        }
      } catch (e) { console.error(e) }
  }
}

test();
