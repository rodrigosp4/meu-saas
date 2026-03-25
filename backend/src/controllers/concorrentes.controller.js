import prisma from '../config/prisma.js';
import { mlService } from '../services/ml.service.js';
import axios from 'axios';

const ML_BASE = 'https://api.mercadolibre.com';

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Scraping de página do ML — extrai preço, título, thumbnail via JSON-LD / meta tags
async function scrapeMLPage(itemId, originalUrl) {
  const urls = [];
  if (itemId && /^MLB\d+$/i.test(itemId)) {
    const num = itemId.replace(/^MLB/i, '');
    urls.push(`https://produto.mercadolivre.com.br/MLB-${num}`);
  }
  if (originalUrl) urls.push(originalUrl);

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

// Pega headers de auth usando qualquer conta ML do userId (igual ao ml.controller)
async function getAuthHeaders(userId) {
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
}

// Normaliza range de estoque para exibição
function formatEstoqueRange(range) {
  if (!range || typeof range === 'number') return range != null ? String(range) : '?';
  const map = {
    RANGO_1_50: '1–50', RANGO_51_100: '51–100', RANGO_101_200: '101–200',
    RANGO_201_500: '201–500', RANGO_MAIS_500: '500+',
  };
  return map[range] || range;
}

export const concorrentesController = {

  // ── Grupos ───────────────────────────────────────────────────────────────

  async listarGrupos(req, res) {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const grupos = await prisma.grupoMonitoramento.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { concorrentes: true } } }
      });
      res.json(grupos);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async criarGrupo(req, res) {
    const { userId, nome, skus = [] } = req.body;
    if (!userId || !nome) return res.status(400).json({ erro: 'userId e nome são obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.create({
        data: { userId, nome: nome.trim(), skus }
      });
      res.json(grupo);
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ erro: 'Já existe um grupo com esse nome' });
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizarGrupo(req, res) {
    const { id } = req.params;
    const { userId, nome, skus, precoMinimo, autoIgualar } = req.body;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });
      const updated = await prisma.grupoMonitoramento.update({
        where: { id },
        data: {
          ...(nome !== undefined && { nome: nome.trim() }),
          ...(skus !== undefined && { skus }),
          ...(precoMinimo !== undefined && { precoMinimo: precoMinimo != null ? parseFloat(precoMinimo) : null }),
          ...(autoIgualar !== undefined && { autoIgualar: Boolean(autoIgualar) }),
        }
      });
      res.json(updated);
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ erro: 'Já existe um grupo com esse nome' });
      res.status(500).json({ erro: err.message });
    }
  },

  async excluirGrupo(req, res) {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });
      await prisma.grupoMonitoramento.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── Meus anúncios do grupo ─────────────────────────────────────────────────

  async meusAnunciosGrupo(req, res) {
    const { grupoId, userId } = req.query;
    if (!grupoId || !userId) return res.status(400).json({ erro: 'grupoId e userId obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });
      if (!grupo.skus || grupo.skus.length === 0) return res.json([]);

      const contas = await prisma.contaML.findMany({
        where: { userId },
        select: { id: true, nickname: true }
      });
      const contaIds = contas.map(c => c.id);

      const anuncios = await prisma.anuncioML.findMany({
        where: {
          contaId: { in: contaIds },
          sku: { in: grupo.skus },
          status: { not: 'closed' }
        },
        select: { id: true, titulo: true, preco: true, status: true, sku: true, contaId: true, dadosML: true }
      });

      const contaMap = Object.fromEntries(contas.map(c => [c.id, c.nickname]));
      res.json(anuncios.map(a => ({
        ...a,
        conta: contaMap[a.contaId] || a.contaId,
        listingTypeId: a.dadosML?.listing_type_id || null,
        dadosML: undefined,
      })));
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── Concorrentes ──────────────────────────────────────────────────────────

  async listarConcorrentes(req, res) {
    const { grupoId, userId } = req.query;
    if (!grupoId || !userId) return res.status(400).json({ erro: 'grupoId e userId obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });

      const concorrentes = await prisma.concorrenteAnuncio.findMany({
        where: { grupoId },
        orderBy: { preco: 'asc' },
        include: {
          historico: { orderBy: { capturedAt: 'desc' }, take: 10, select: { preco: true, capturedAt: true } }
        }
      });

      res.json(concorrentes.map(c => ({ ...c, estoqueFormatado: formatEstoqueRange(c.estoqueRange) })));
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async adicionarConcorrente(req, res) {
    const { grupoId, userId, url } = req.body;
    if (!grupoId || !userId || !url) return res.status(400).json({ erro: 'grupoId, userId e url são obrigatórios' });

    const itemId = mlService.extractItemIdFromUrl(url);
    if (!itemId) {
      if (/\/p\/MLB/i.test(url) || /\/up\/MLBU/i.test(url) || /MLBU\d+/i.test(url)) {
        return res.status(400).json({ erro: 'URL genérica de catálogo. Para monitorar o concorrente, copie a URL contendo o item específico do vendedor (ex: procure pelo parâmetro "wid=" na URL do catálogo, ou clique direto no anúncio do vendedor em "Mais opções de compra").' });
      }
      return res.status(400).json({ erro: 'URL inválida. Não foi possível extrair o ID do anúncio (MLB...).' });
    }

    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });

      const existing = await prisma.concorrenteAnuncio.findFirst({ where: { id: itemId, grupoId } });
      if (existing) return res.status(409).json({ erro: 'Este anúncio já está sendo monitorado neste grupo.' });

      // Bloqueia adição de próprios anúncios como concorrentes
      const contas = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
      const contaIds = contas.map(c => c.id);
      const proprio = await prisma.anuncioML.findFirst({ where: { id: itemId, contaId: { in: contaIds } } });
      if (proprio) return res.status(409).json({ erro: 'Este anúncio pertence à sua própria conta. Não é possível monitorar seus próprios anúncios como concorrentes.' });

      // Busca dados com auth do usuário (multiget requer autenticação)
      const headers = await getAuthHeaders(userId);
      let item = null;
      let estoqueRange = null;

      if (itemId.startsWith('MLBU')) {
        // User-product de catálogo — tenta API e fallback scraping
        try {
          const prodRes = await axios.get(`${ML_BASE}/user-products/${itemId}`, { headers, timeout: 15000 });
          const p = prodRes.data;
          const thumbnail = p.pictures?.[0]?.secure_url || p.pictures?.[0]?.url || null;
          item = {
            id: p.id,
            title: p.name || p.title || '',
            price: p.price || 0,
            sold_quantity: 0,
            thumbnail,
            permalink: p.permalink,
            seller: { id: null, nickname: null }
          };
          estoqueRange = typeof p.available_quantity === 'string' ? p.available_quantity : null;
        } catch { /* segue para scraping */ }

        // Se API não retornou preço, tenta scraping
        if (!item || !item.price) {
          const scraped = await scrapeMLPage(null, url);
          if (scraped) {
            item = {
              id: itemId,
              title: scraped.title || item?.title || '',
              price: scraped.price,
              sold_quantity: 0,
              thumbnail: scraped.thumbnail || item?.thumbnail || null,
              permalink: scraped.permalink || url,
              seller: { id: null, nickname: scraped.sellerNickname || null }
            };
          }
        }
      } else {
        const attrs = 'id,title,price,available_quantity,sold_quantity,thumbnail,permalink,seller_id,seller,listing_type_id';

        // Tentativa 1: multiget autenticado
        try {
          const mlRes = await axios.get(`${ML_BASE}/items?ids=${itemId}&attributes=${attrs}`, { headers, timeout: 15000 });
          const results = mlRes.data;
          const itemResult = Array.isArray(results) ? results.find(r => r.code === 200) : null;
          if (itemResult) {
            item = itemResult.body;
            estoqueRange = typeof item.available_quantity === 'string' ? item.available_quantity : null;
          }
        } catch { /* ignora */ }

        // Tentativa 2: endpoint single
        if (!item) {
          try {
            const singleRes = await axios.get(`${ML_BASE}/items/${itemId}?attributes=${attrs}`, { headers, timeout: 15000 });
            if (singleRes.status === 200 && singleRes.data?.id) {
              item = singleRes.data;
              estoqueRange = typeof item.available_quantity === 'string' ? item.available_quantity : null;
            }
          } catch { /* ignora */ }
        }

        // Tentativa 3: endpoint de catálogo geral
        if (!item) {
          try {
            const prodRes = await axios.get(`${ML_BASE}/products/${itemId}`, { headers, timeout: 15000 });
            if (prodRes.status === 200) {
              const p = prodRes.data;
              const winner = p.buy_box_winner || {};
              item = {
                id: `CAT-${p.id}`,
                title: p.name || p.title || '',
                price: winner.price || p.price || 0,
                sold_quantity: 0,
                thumbnail: p.pictures?.[0]?.secure_url || p.pictures?.[0]?.url || null,
                permalink: p.permalink,
                seller: { id: winner.seller_id, nickname: 'Buy Box Winner Variavel' }
              };
            }
          } catch { /* ignora */ }
        }

        // Tentativa 4: scraping direto da página
        if (!item) {
          const scraped = await scrapeMLPage(itemId, url);
          if (scraped) {
            item = {
              id: itemId,
              title: scraped.title,
              price: scraped.price,
              sold_quantity: 0,
              thumbnail: scraped.thumbnail,
              permalink: scraped.permalink,
              seller: { id: null, nickname: scraped.sellerNickname }
            };
          }
        }
      }

      if (!item || !item.price) {
        return res.status(404).json({ erro: 'Não foi possível obter os dados do anúncio. Tente copiar a URL direta do anúncio do vendedor (clique em "Mais opções de compra" no ML e copie a URL do anúncio específico).' });
      }

      const concorrente = await prisma.concorrenteAnuncio.create({
        data: {
          id: item.id,
          grupoId,
          titulo: item.title,
          preco: item.price || 0,
          estoqueRange,
          vendas: item.sold_quantity || 0,
          thumbnail: item.thumbnail,
          permalink: item.permalink,
          sellerId: item.seller?.id ? String(item.seller.id) : null,
          sellerNickname: item.seller?.nickname || null,
          listingTypeId: item.listing_type_id || null,
        }
      });

      await prisma.precoHistorico.create({ data: { itemId: item.id, preco: item.price || 0 } });

      res.json({ ...concorrente, estoqueFormatado: formatEstoqueRange(estoqueRange) });
    } catch (err) {
      const status = err.response?.status || 500;
      const msg = err.response?.data?.message || err.message;
      res.status(status >= 400 && status < 600 ? status : 500).json({ erro: msg });
    }
  },

  async limparPropriosAnuncios(req, res) {
    const { grupoId, userId } = req.body;
    if (!grupoId || !userId) return res.status(400).json({ erro: 'grupoId e userId obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });

      const contas = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
      const contaIds = contas.map(c => c.id);
      const meusIds = (await prisma.anuncioML.findMany({
        where: { contaId: { in: contaIds } },
        select: { id: true }
      })).map(a => a.id);

      const { count } = await prisma.concorrenteAnuncio.deleteMany({
        where: { grupoId, id: { in: meusIds } }
      });

      res.json({ removidos: count });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async removerConcorrente(req, res) {
    const { itemId, grupoId, userId } = req.query;
    if (!itemId || !grupoId || !userId) return res.status(400).json({ erro: 'itemId, grupoId e userId obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });
      await prisma.concorrenteAnuncio.deleteMany({ where: { id: itemId, grupoId } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizarConcorrentes(req, res) {
    const { grupoId, userId } = req.body;
    if (!grupoId || !userId) return res.status(400).json({ erro: 'grupoId e userId obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });

      const concorrentes = await prisma.concorrenteAnuncio.findMany({ where: { grupoId } });
      if (concorrentes.length === 0) return res.json({ atualizados: 0 });

      const headers = await getAuthHeaders(userId);
      const attrs = 'id,title,price,available_quantity,sold_quantity,thumbnail,permalink,seller_id,seller,listing_type_id';

      let atualizados = 0;
      
      const itensCAT = concorrentes.filter(c => c.id.startsWith('CAT-'));
      const itensMLB = concorrentes.filter(c => c.id.startsWith('MLB') && !c.id.startsWith('MLBU') && !c.id.startsWith('CAT-'));
      const itensMLBU = concorrentes.filter(c => c.id.startsWith('MLBU'));

      for (let i = 0; i < itensMLB.length; i += 20) {
        const chunk = itensMLB.slice(i, i + 20);
        const ids = chunk.map(c => c.id).join(',');
        const updatedIds = new Set();
        try {
          const mlRes = await axios.get(`${ML_BASE}/items?ids=${ids}&attributes=${attrs}`, { headers, timeout: 15000 });
          const results = Array.isArray(mlRes.data) ? mlRes.data : [];
          for (const r of results) {
            if (r.code !== 200) continue;
            const item = r.body;
            const prev = chunk.find(c => c.id === item.id);
            const estoqueRange = typeof item.available_quantity === 'string' ? item.available_quantity : null;
            await prisma.concorrenteAnuncio.update({
              where: { id: item.id },
              data: {
                titulo: item.title, preco: item.price || 0, estoqueRange,
                vendas: item.sold_quantity || 0, thumbnail: item.thumbnail,
                permalink: item.permalink,
                sellerId: item.seller?.id ? String(item.seller.id) : null,
                sellerNickname: item.seller?.nickname || null,
                listingTypeId: item.listing_type_id || null,
              }
            });
            if (prev && Math.abs((item.price || 0) - prev.preco) > 0.001) {
              await prisma.precoHistorico.create({ data: { itemId: item.id, preco: item.price || 0 } });
            }
            updatedIds.add(item.id);
            atualizados++;
          }
        } catch (e) {
          console.error('Erro ao atualizar chunk:', e.message);
        }

        // Scraping para itens que a API não retornou
        for (const prev of chunk) {
          if (updatedIds.has(prev.id)) continue;
          try {
            const scraped = await scrapeMLPage(prev.id, prev.permalink);
            if (scraped?.price) {
              await prisma.concorrenteAnuncio.update({
                where: { id: prev.id },
                data: { preco: scraped.price, titulo: scraped.title || prev.titulo, thumbnail: scraped.thumbnail || prev.thumbnail }
              });
              if (Math.abs(scraped.price - prev.preco) > 0.001) {
                await prisma.precoHistorico.create({ data: { itemId: prev.id, preco: scraped.price } });
              }
              atualizados++;
            }
          } catch (e) {
            console.error('Erro scraping MLB:', e.message);
          }
        }
      }

      for (const prev of itensMLBU) {
        try {
          const prodRes = await axios.get(`${ML_BASE}/user-products/${prev.id}`, { headers, timeout: 15000 });
          const p = prodRes.data;
          const thumbnail = p.pictures?.[0]?.secure_url || p.pictures?.[0]?.url || null;
          const estoqueRange = typeof p.available_quantity === 'string' ? p.available_quantity : null;
          let preco = p.price || 0;

          // Se API não retornou preço, usa scraping
          if (!preco && prev.permalink) {
            const scraped = await scrapeMLPage(null, prev.permalink);
            if (scraped?.price) preco = scraped.price;
          }

          await prisma.concorrenteAnuncio.update({
            where: { id: p.id },
            data: {
              titulo: p.name || p.title || prev.titulo,
              preco,
              estoqueRange,
              thumbnail: thumbnail || prev.thumbnail,
              permalink: p.permalink || prev.permalink
            }
          });

          if (Math.abs(preco - prev.preco) > 0.001) {
            await prisma.precoHistorico.create({ data: { itemId: p.id, preco } });
          }
          atualizados++;
        } catch (e) {
          console.error('Erro ao atualizar MLBU:', e.message);
        }
      }

      for (const prev of itensCAT) {
        try {
          const rawId = prev.id.replace('CAT-', '');
          const prodRes = await axios.get(`${ML_BASE}/products/${rawId}`, { headers, timeout: 15000 });
          const p = prodRes.data;
          const winner = p.buy_box_winner || {};
          const thumbnail = p.pictures && p.pictures.length > 0 ? (p.pictures[0].secure_url || p.pictures[0].url) : null;
          const currentPrice = winner.price || p.price || 0;

          await prisma.concorrenteAnuncio.update({
            where: { id: prev.id },
            data: {
              titulo: p.name || p.title || prev.titulo,
              preco: currentPrice,
              thumbnail: thumbnail || prev.thumbnail,
              permalink: p.permalink || prev.permalink,
              sellerId: winner.seller_id ? String(winner.seller_id) : prev.sellerId
            }
          });

          if (Math.abs(currentPrice - prev.preco) > 0.001) {
            await prisma.precoHistorico.create({ data: { itemId: prev.id, preco: currentPrice } });
          }
          atualizados++;
        } catch (e) {
          console.error('Erro ao atualizar CAT:', e.message);
        }
      }

      // ── Auto-igualar preço se ativado no grupo ───────────────────────────────
      let autoIgualados = 0;
      if (grupo.autoIgualar && grupo.skus?.length > 0) {
        const contas = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
        const contaIds = contas.map(c => c.id);
        const meusAnuncios = await prisma.anuncioML.findMany({
          where: { contaId: { in: contaIds }, sku: { in: grupo.skus }, status: 'active' },
          select: { id: true, preco: true, dadosML: true },
        });

        // Agrupa concorrentes por tipo
        const concAtual = await prisma.concorrenteAnuncio.findMany({ where: { grupoId } });
        const tipos = [...new Set(concAtual.map(c => c.listingTypeId).filter(Boolean))];
        const tiposParaIgualar = tipos.length > 0 ? tipos : [null];

        for (const tipo of tiposParaIgualar) {
          // Inclui concorrentes sem tipo definido em todos os grupos de tipo
          const concDoTipo = tipo ? concAtual.filter(c => !c.listingTypeId || c.listingTypeId === tipo) : concAtual;
          const precosConcDoTipo = concDoTipo.map(c => c.preco).filter(p => p > 0);
          if (precosConcDoTipo.length === 0) continue;
          const concMin = Math.min(...precosConcDoTipo);
          let precoAlvo = parseFloat((concMin - 1).toFixed(2));
          if (grupo.precoMinimo != null && precoAlvo < grupo.precoMinimo) precoAlvo = grupo.precoMinimo;

          const meusDoTipo = tipo
            ? meusAnuncios.filter(a => a.dadosML?.listing_type_id === tipo)
            : meusAnuncios;

          for (const anuncio of meusDoTipo) {
            if (Math.abs(anuncio.preco - precoAlvo) < 0.01) continue; // já está no preço
            if (anuncio.preco <= concMin) continue; // já é mais barato que todos
            try {
              await axios.put(`${ML_BASE}/items/${anuncio.id}`, { price: precoAlvo }, { headers, timeout: 15000 });
              await prisma.anuncioML.update({ where: { id: anuncio.id }, data: { preco: precoAlvo } });
              autoIgualados++;
            } catch (e) {
              console.error('[autoIgualar] erro ao atualizar', anuncio.id, e.message);
            }
          }
        }
      }

      res.json({ atualizados, autoIgualados });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── Salvar preço mínimo do grupo ───────────────────────────────────────────

  async salvarPrecoMinimo(req, res) {
    const { grupoId, userId, precoMinimo } = req.body;
    if (!grupoId || !userId) return res.status(400).json({ erro: 'grupoId e userId obrigatórios' });
    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });
      const updated = await prisma.grupoMonitoramento.update({
        where: { id: grupoId },
        data: { precoMinimo: precoMinimo != null ? parseFloat(precoMinimo) : null },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── Igualar ao menor preço por tipo de anúncio ────────────────────────────

  async igualarPreco(req, res) {
    const { grupoId, userId, listingTypeId } = req.body;
    if (!grupoId || !userId) return res.status(400).json({ erro: 'grupoId e userId obrigatórios' });

    try {
      const grupo = await prisma.grupoMonitoramento.findFirst({ where: { id: grupoId, userId } });
      if (!grupo) return res.status(404).json({ erro: 'Grupo não encontrado' });

      // Busca concorrentes: do tipo informado + sem tipo definido (adicionados antes da funcionalidade)
      const concorrentes = await prisma.concorrenteAnuncio.findMany({
        where: {
          grupoId,
          ...(listingTypeId ? { OR: [{ listingTypeId }, { listingTypeId: null }] } : {}),
        }
      });

      if (concorrentes.length === 0) return res.status(400).json({ erro: 'Nenhum concorrente encontrado para este tipo.' });

      const concMin = Math.min(...concorrentes.map(c => c.preco).filter(p => p > 0));
      if (!isFinite(concMin)) return res.status(400).json({ erro: 'Não foi possível determinar o menor preço dos concorrentes.' });

      // Preço alvo: concorrente mais barato - R$ 1,00
      let precoAlvo = parseFloat((concMin - 1).toFixed(2));

      // Respeita o preço mínimo
      const semPrecoMinimo = grupo.precoMinimo == null;
      if (grupo.precoMinimo != null && precoAlvo < grupo.precoMinimo) {
        precoAlvo = grupo.precoMinimo;
      }

      // Busca meus anúncios ativos do grupo com tipo correspondente
      const contas = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
      const contaIds = contas.map(c => c.id);

      const meusAnuncios = await prisma.anuncioML.findMany({
        where: {
          contaId: { in: contaIds },
          sku: { in: grupo.skus },
          status: 'active',
        },
        select: { id: true, preco: true, contaId: true, dadosML: true }
      });

      // Filtra pelo tipo de anúncio (se informado)
      const anunciosFiltrados = listingTypeId
        ? meusAnuncios.filter(a => a.dadosML?.listing_type_id === listingTypeId)
        : meusAnuncios;

      if (anunciosFiltrados.length === 0) return res.status(400).json({ erro: 'Nenhum anúncio ativo encontrado do tipo selecionado.' });

      // Atualiza via ML API
      const headers = await getAuthHeaders(userId);
      const resultados = [];

      for (const anuncio of anunciosFiltrados) {
        try {
          await axios.put(`${ML_BASE}/items/${anuncio.id}`, { price: precoAlvo }, { headers, timeout: 15000 });
          await prisma.anuncioML.update({ where: { id: anuncio.id }, data: { preco: precoAlvo } });
          resultados.push({ id: anuncio.id, ok: true, novoPreco: precoAlvo });
        } catch (e) {
          resultados.push({ id: anuncio.id, ok: false, erro: e.response?.data?.message || e.message });
        }
      }

      const atualizados = resultados.filter(r => r.ok).length;
      res.json({ atualizados, precoAlvo, concMin, semPrecoMinimo, resultados });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── Oportunidades (todos os concorrentes do usuário ordenados por vendas) ──

  async oportunidades(req, res) {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const grupos = await prisma.grupoMonitoramento.findMany({
        where: { userId },
        select: { id: true, nome: true }
      });
      const grupoIds = grupos.map(g => g.id);
      const grupoMap = Object.fromEntries(grupos.map(g => [g.id, g.nome]));

      const concorrentes = await prisma.concorrenteAnuncio.findMany({
        where: { grupoId: { in: grupoIds } },
        orderBy: { vendas: 'desc' },
        take: 100,
      });

      res.json(concorrentes.map(c => ({
        ...c,
        grupoNome: grupoMap[c.grupoId] || '—',
        estoqueFormatado: formatEstoqueRange(c.estoqueRange),
      })));
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  // ── Analítica (por grupo: meu preço vs concorrente) ────────────────────────

  async analitica(req, res) {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const contas = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
      const contaIds = contas.map(c => c.id);

      const grupos = await prisma.grupoMonitoramento.findMany({
        where: { userId },
        include: { concorrentes: { select: { preco: true, vendas: true, titulo: true } } }
      });

      const result = await Promise.all(grupos.map(async g => {
        let meuPrecoMin = null;
        if (g.skus.length > 0) {
          const anuncios = await prisma.anuncioML.findMany({
            where: { contaId: { in: contaIds }, sku: { in: g.skus }, status: 'active' },
            select: { preco: true }
          });
          if (anuncios.length > 0) meuPrecoMin = Math.min(...anuncios.map(a => a.preco));
        }

        const precosConcorrentes = g.concorrentes.map(c => c.preco).filter(p => p > 0);
        const concorrenteMin = precosConcorrentes.length > 0 ? Math.min(...precosConcorrentes) : null;
        const concorrenteMedia = precosConcorrentes.length > 0
          ? precosConcorrentes.reduce((s, p) => s + p, 0) / precosConcorrentes.length : null;
        const concorrenteMax = precosConcorrentes.length > 0 ? Math.max(...precosConcorrentes) : null;

        let posicao = 'sem dados';
        if (meuPrecoMin != null && concorrenteMin != null) {
          const diff = ((meuPrecoMin - concorrenteMin) / concorrenteMin) * 100;
          if (diff < -5) posicao = 'mais barato';
          else if (diff <= 5) posicao = 'competitivo';
          else if (diff <= 15) posicao = 'ligeiramente acima';
          else posicao = 'acima do mercado';
        }

        return {
          grupoId: g.id,
          grupoNome: g.nome,
          qtdConcorrentes: g.concorrentes.length,
          meuPrecoMin,
          concorrenteMin,
          concorrenteMedia: concorrenteMedia ? Math.round(concorrenteMedia * 100) / 100 : null,
          concorrenteMax,
          posicao,
        };
      }));

      res.json(result);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

// ── Busca de itens no ML ──────────────────────────────────────────────────

  async buscarItens(req, res) {
    const { q, userId } = req.query;
    if (!q) return res.status(400).json({ erro: 'O termo de busca (q) é obrigatório.' });

    const termo = q.trim();

    if (!userId) {
      return res.status(401).json({ erro: 'Autenticação necessária.' });
    }

    try {
      const authHeaders = await getAuthHeaders(userId);
      if (!authHeaders.Authorization) {
        return res.status(401).json({ erro: 'Conta Mercado Livre não conectada.' });
      }

      // API de Busca de Produtos (Catálogo) em vez de Items comuns
      const apiRes = await axios.get(`${ML_BASE}/products/search`, {
        params: { 
          status: 'active', 
          site_id: 'MLB', 
          q: termo, 
          limit: 20 
        },
        headers: { ...authHeaders, 'Accept': 'application/json' },
        timeout: 15000,
      });

      const produtos = apiRes.data?.results || [];

      // Busca detalhes de cada produto para pegar o Buy Box Winner e o preço
      const itens = await Promise.all(produtos.map(async (p) => {
        let preco = 0;
        let sellerId = null;
        
        try {
          const prodDetail = await axios.get(`${ML_BASE}/products/${p.id}`, {
            headers: authHeaders,
            timeout: 5000
          });
          
          const winner = prodDetail.data?.buy_box_winner;
          if (winner) {
            preco = winner.price || 0;
            sellerId = winner.seller_id;
          }
        } catch (err) {
          console.error(`[buscarItens] Erro ao buscar detalhes do produto ${p.id}:`, err.message);
        }

        return {
          id: p.id,
          titulo: p.name || 'Produto de Catálogo',
          preco,
          thumbnail: p.pictures?.[0]?.url || null,
          permalink: `https://www.mercadolivre.com.br/p/${p.id}`, // Fake permalink estruturado para a função extractItemIdFromUrl funcionar corretamente
          sellerId,
          vendedor: 'Catálogo (Sem Buy Box)',
          vendas: 0, // Produtos de catálogo não retornam sold_quantity direto na busca
        };
      }));

      // Busca nicknames dos vendedores para melhorar a exibição
      const sellerIds = [...new Set(itens.map(i => i.sellerId).filter(Boolean))];
      if (sellerIds.length > 0) {
        try {
          const sellerPromises = sellerIds.map(id => 
            axios.get(`${ML_BASE}/users/${id}?attributes=id,nickname`, { headers: authHeaders, timeout: 5000 }).catch(() => null)
          );
          const sellerResults = await Promise.all(sellerPromises);
          const sellerMap = {};
          sellerResults.forEach(r => {
            if (r && r.data) {
              sellerMap[r.data.id] = r.data.nickname;
            }
          });
          itens.forEach(i => {
            if (i.sellerId) {
              i.vendedor = sellerMap[i.sellerId] || `Seller ID: ${i.sellerId}`;
            }
          });
        } catch (e) {
          // Ignora se falhar
        }
      }

      // Limpa os dados internos antes de enviar a resposta ao front-end
      itens.forEach(i => delete i.sellerId);

      return res.json({ 
        total: apiRes.data.paging?.total || 0, 
        itens 
      });

    } catch (err) {
      console.error('[buscarItens] Erro na API de Produtos:', err.response?.status, err.message);
      return res.status(500).json({ 
        erro: `Erro ao buscar produtos de catálogo: ${err.response?.data?.message || err.message}` 
      });
    }
  },

  // ── Lojas Monitoradas ─────────────────────────────────────────────────────

  async listarLojas(req, res) {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const lojas = await prisma.lojaMonitorada.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });
      res.json(lojas);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async adicionarLoja(req, res) {
    const { userId, url } = req.body;
    if (!userId || !url) return res.status(400).json({ erro: 'userId e url são obrigatórios' });

    try {
      // Tenta extrair seller ID de uma URL de anúncio ou buscar pelo nickname
      let sellerId = null;
      let nickname = null;

      // Testa se é um item URL ou ID direto de seller
      const itemMatch = mlService.extractItemIdFromUrl(url);
      const headers = await getAuthHeaders(userId);

      if (itemMatch && itemMatch.startsWith('MLBU')) {
        return res.status(400).json({ erro: 'URLs de catálogo não podem ser usadas para identificar uma loja diretamente. Forneça o Nickname (Nome da Loja no ML) exato ou cole a URL de um anúncio comum do vendedor.' });
      }

      if (itemMatch) {
        // Busca seller do item
        const itemRes = await axios.get(`${ML_BASE}/items/${itemMatch}?attributes=seller_id,seller`, { headers, timeout: 10000 });
        const seller = itemRes.data.seller;
        sellerId = String(seller?.id || itemRes.data.seller_id);
        nickname = seller?.nickname;
      } else {
        // Tenta como nickname direto (melhorando o parser da URL)
        let nicknameClean = url.trim();
        if (nicknameClean.includes('mercadolivre.com.br')) {
           try {
               const urlObj = new URL(nicknameClean.startsWith('http') ? nicknameClean : `https://${nicknameClean}`);
               const pathParts = urlObj.pathname.split('/').filter(Boolean);
               if (pathParts.length > 0) {
                   nicknameClean = pathParts[pathParts.length - 1]; // Ex: perfil.mercadolivre.com.br/NOME_DA_LOJA
               }
           } catch(e) {
               nicknameClean = nicknameClean.replace(/^https?:\/\/.*/i, '').replace(/[^\w-]/g, '');
           }
        }
        
        const searchRes = await axios.get(`${ML_BASE}/sites/MLB/search?nickname=${encodeURIComponent(nicknameClean)}&limit=1`, { headers, timeout: 10000 });
        const sellerFromSearch = searchRes.data?.seller;
        if (sellerFromSearch) {
          sellerId = String(sellerFromSearch.id);
          nickname = sellerFromSearch.nickname;
        } else {
          // Tenta como numeric seller ID
          const numericMatch = url.trim().match(/\d+/);
          if (numericMatch) {
            sellerId = numericMatch[0];
          }
        }
      }

      if (!sellerId) return res.status(400).json({ erro: 'Não foi possível identificar o vendedor. Tente com uma URL de anúncio ou nickname exato.' });

      // Busca dados do seller
      const sellerRes = await axios.get(
        `${ML_BASE}/users/${sellerId}?attributes=id,nickname,seller_reputation,transactions`,
        { headers, timeout: 10000 }
      );
      const seller = sellerRes.data;
      nickname = seller.nickname || nickname || sellerId;

      const nivel = seller.seller_reputation?.power_seller_status || null;

      const existing = await prisma.lojaMonitorada.findFirst({ where: { userId, sellerId } });
      if (existing) return res.status(409).json({ erro: `A loja "${nickname}" já está sendo monitorada.` });

      const loja = await prisma.lojaMonitorada.create({
        data: {
          userId, sellerId, nickname, nivel,
          reputacaoData: seller.seller_reputation || null,
        }
      });

      res.json(loja);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      res.status(status >= 400 && status < 600 ? status : 500).json({ erro: msg });
    }
  },

  async removerLoja(req, res) {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const loja = await prisma.lojaMonitorada.findFirst({ where: { id, userId } });
      if (!loja) return res.status(404).json({ erro: 'Loja não encontrada' });
      await prisma.lojaMonitorada.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async atualizarLoja(req, res) {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    try {
      const loja = await prisma.lojaMonitorada.findFirst({ where: { id, userId } });
      if (!loja) return res.status(404).json({ erro: 'Loja não encontrada' });

      const headers = await getAuthHeaders(userId);

      const sellerRes = await axios.get(
        `${ML_BASE}/users/${loja.sellerId}?attributes=id,nickname,seller_reputation,transactions`,
        { headers, timeout: 10000 }
      );
      const seller = sellerRes.data;
      const nivel = seller.seller_reputation?.power_seller_status || null;

      const updated = await prisma.lojaMonitorada.update({
        where: { id },
        data: { nickname: seller.nickname || loja.nickname, nivel, reputacaoData: seller.seller_reputation || null }
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

// Busca o catálogo de uma loja monitorada
  async catalogoLoja(req, res) {
    const { lojaId, userId, offset = 0, limit = 20, q = '' } = req.query;
    if (!lojaId || !userId) return res.status(400).json({ erro: 'lojaId e userId obrigatórios' });
    try {
      const loja = await prisma.lojaMonitorada.findFirst({ where: { id: lojaId, userId } });
      if (!loja) return res.status(404).json({ erro: 'Loja não encontrada' });

      const params = {
        seller_id: loja.sellerId,
        limit: Math.min(Number(limit), 50),
        offset: Number(offset),
      };
      if (q) params.q = q;

      const headers = await getAuthHeaders(userId);

      // Usar token de auth, as buscas públicas agora costumam retornar 403 Forbidden sem autenticação
      const searchRes = await axios.get(`${ML_BASE}/sites/MLB/search`, { 
        headers, 
        params, 
        timeout: 15000 
      });
      
      const data = searchRes.data;

      res.json({
        total: data.paging?.total || 0,
        offset: data.paging?.offset || 0,
        limit: data.paging?.limit || 20,
        itens: (data.results || []).map(item => ({
          id: item.id,
          titulo: item.title,
          preco: item.price,
          thumbnail: item.thumbnail,
          permalink: item.permalink,
          vendas: item.sold_quantity,
          estoque: item.available_quantity,
        }))
      });
    } catch (err) {
      const msgErro = err.response?.data?.message || err.message;
      res.status(err.response?.status || 500).json({ erro: msgErro });
    }
  },

// Busca o catálogo de uma loja monitorada
  async catalogoLoja(req, res) {
    const { lojaId, userId, offset = 0, limit = 20, q = '' } = req.query;
    if (!lojaId || !userId) return res.status(400).json({ erro: 'lojaId e userId obrigatórios' });
    try {
      const loja = await prisma.lojaMonitorada.findFirst({ where: { id: lojaId, userId } });
      if (!loja) return res.status(404).json({ erro: 'Loja não encontrada' });

      const params = {
        seller_id: loja.sellerId,
        limit: Math.min(Number(limit), 50),
        offset: Number(offset),
      };
      if (q) params.q = q;

      // ✅ CORREÇÃO: Usar SCRAPE_HEADERS no lugar do Token para ler itens de terceiros
      const searchRes = await axios.get(`${ML_BASE}/sites/MLB/search`, { 
        headers: SCRAPE_HEADERS, 
        params, 
        timeout: 15000 
      });
      
      const data = searchRes.data;

      res.json({
        total: data.paging?.total || 0,
        offset: data.paging?.offset || 0,
        limit: data.paging?.limit || 20,
        itens: (data.results || []).map(item => ({
          id: item.id,
          titulo: item.title,
          preco: item.price,
          thumbnail: item.thumbnail,
          permalink: item.permalink,
          vendas: item.sold_quantity,
          estoque: item.available_quantity,
        }))
      });
    } catch (err) {
      const msgErro = err.response?.data?.message || err.message;
      res.status(err.response?.status || 500).json({ erro: msgErro });
    }
  },
};
