import { Router } from 'express';
import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { syncQueue } from '../workers/queue.js';
import axios from 'axios';
import { config } from '../config/env.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';

const router = Router();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Substitua o início da sua rota GET /api/produtos por este trecho
router.get('/api/produtos', async (req, res) => {
  try {
    const { userId, search = '', status = 'Todos', page = 1, limit = 50, skus: skusParam } = req.query;
    if (!userId) return res.status(400).json({ erro: "userId obrigatório" });

    const skip = (Number(page) - 1) * Number(limit);
    const where = { userId: userId };

    // ✅ CORREÇÃO: Prioriza a busca por uma lista de SKUs, se fornecida
    if (skusParam) {
      where.sku = { in: skusParam.split(',') };
    } else {
      if (search) {
        where.OR = [
          { nome: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Lógica de filtro por status de anúncio (continua a mesma)
      if (status === 'Com Anúncios' || status === 'Sem Anúncios') {
        const skusComAnuncio = await prisma.anuncioML.findMany({
          where: { conta: { userId: userId } },
          distinct: ['sku'],
          select: { sku: true }
        });
        const skuSet = new Set(skusComAnuncio.map(a => a.sku).filter(Boolean));

        if (status === 'Com Anúncios') {
          where.sku = { in: [...skuSet] };
        } else { // Sem Anúncios
          where.sku = { notIn: [...skuSet] };
        }
      }
    }


    const [produtos, total] = await Promise.all([
      prisma.produto.findMany({ where, skip, take: Number(limit), orderBy: { updatedAt: 'desc' } }),
      prisma.produto.count({ where })
    ]);

    // Anexar anúncios relacionados aos produtos
    if (produtos.length > 0) {
      const skus = produtos.map(p => p.sku).filter(Boolean);

      const anunciosRelacionados = await prisma.anuncioML.findMany({
        where: {
          sku: { in: skus },
          conta: { userId: userId }
        },
        select: {
          id: true,
          sku: true,
          contaId: true,
          dadosML: true // Contém listing_type_id
        }
      });

      const anunciosPorSku = anunciosRelacionados.reduce((acc, ad) => {
        if (!acc[ad.sku]) acc[ad.sku] = [];
        acc[ad.sku].push(ad);
        return acc;
      }, {});

      const produtosComAnuncios = produtos.map(p => ({
        ...p,
        anunciosML: anunciosPorSku[p.sku] || []
      }));

      res.json({ produtos: produtosComAnuncios, total });
    } else {
      res.json({ produtos, total });
    }
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar produtos no banco de dados." });
  }
});



// ✅ NOVA ROTA (CORRIGIDA): Retorna todos os SKUs de produtos respeitando os filtros
router.get('/api/produtos/skus-filtrados', async (req, res) => {
  try {
    const { userId, search = '', status = 'Sem Anúncios' } = req.query;
    if (!userId) return res.status(400).json({ erro: "userId obrigatório" });

    const where = { userId: userId };

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Lógica de filtro por status de anúncio
    if (status === 'Com Anúncios' || status === 'Sem Anúncios') {
      const skusComAnuncio = await prisma.anuncioML.findMany({
        where: { conta: { userId: userId } },
        distinct: ['sku'],
        select: { sku: true }
      });
      const skuSet = new Set(skusComAnuncio.map(a => a.sku).filter(Boolean));

      if (status === 'Com Anúncios') {
        where.sku = { in: [...skuSet] };
      } else { // Sem Anúncios
        where.sku = { notIn: [...skuSet] };
      }
    }

    const produtos = await prisma.produto.findMany({
      where,
      select: { sku: true }
    });

    const skus = produtos.map(p => p.sku).filter(Boolean);
    res.json({ skus: [...new Set(skus)] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar SKUs de produtos." });
  }
});



// ✅ NOVA ROTA: Retorna apenas os IDs Tiny dos produtos que correspondem aos filtros
router.get('/api/produtos/ids', async (req, res) => {
  try {
    const { userId, search = '', status = 'Todos' } = req.query;
    if (!userId) return res.status(400).json({ erro: "userId obrigatório" });

    const where = { userId: userId };

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status === 'Com Anúncios' || status === 'Sem Anúncios') {
      const skusComAnuncio = await prisma.anuncioML.findMany({
        where: { conta: { userId: userId } },
        distinct: ['sku'],
        select: { sku: true }
      });
      const skuSet = new Set(skusComAnuncio.map(a => a.sku).filter(Boolean));

      if (status === 'Com Anúncios') {
        where.sku = { in: [...skuSet] };
      } else { // Sem Anúncios
        where.sku = { notIn: [...skuSet] };
      }
    }

    const produtos = await prisma.produto.findMany({
      where,
      select: {
        dadosTiny: true, // A forma mais simples de pegar o id aninhado
      }
    });

    // Extrai o ID de 'dadosTiny' e filtra os que não o possuem
    const ids = produtos
      .map(p => p.dadosTiny?.id)
      .filter(id => id !== null && id !== undefined);

    res.json({ ids: [...new Set(ids)] }); // Retorna apenas IDs únicos
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar IDs de produtos." });
  }
});


// ===== HELPER: Busca preço de um SKU diretamente na Tiny API =====
async function fetchPrecoTiny(sku, tinyToken, tinyLimits) {
  try {
    const skuStr = String(sku).trim().toLowerCase();

    // 1ª tentativa: codigoExato (mais precisa)
    const searchExataRes = await axios.post(
      'https://api.tiny.com.br/api2/produtos.pesquisa.php',
      new URLSearchParams({ token: tinyToken, formato: 'JSON', codigoExato: String(sku).trim() })
    );
    const retornoExato = searchExataRes.data?.retorno;
    if (retornoExato?.codigo_erro == 8) throw new Error('RATE_LIMIT');
    if (retornoExato?.codigo_erro == 2) return null;

    let found = null;
    if (retornoExato?.status === 'OK' && retornoExato?.produtos?.length > 0) {
      found = retornoExato.produtos.map(p => p.produto).find(p => String(p.codigo || '').trim().toLowerCase() === skuStr) || null;
    }

    // Fallback: busca textual
    if (!found) {
      await delay(tinyLimits?.delayMs || 1000);
      const searchRes = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: sku })
      );
      const retorno = searchRes.data?.retorno;
      const produtos = retorno?.status === 'OK' ? (retorno.produtos || []) : [];
      found = produtos.map(p => p.produto).find(p => String(p.codigo || '').trim().toLowerCase() === skuStr) || null;
    }

    // Match direto encontrado — busca detalhes
    if (found) {
      const precoBasico = {
        preco: Number(found.preco || 0),
        preco_promocional: Number(found.preco_promocional || 0),
        preco_custo: 0,
      };
      try {
        await delay(tinyLimits?.delayMs || 1000);
        const detRes = await axios.post(
          'https://api.tiny.com.br/api2/produto.obter.php',
          new URLSearchParams({ token: tinyToken, formato: 'JSON', id: found.id })
        );
        const prod = detRes.data?.retorno?.produto;
        if (prod) {
          precoBasico.preco = Number(prod.preco || precoBasico.preco);
          precoBasico.preco_promocional = Number(prod.preco_promocional || precoBasico.preco_promocional);
          precoBasico.preco_custo = Number(prod.preco_custo || 0);
          if (prod.tipoVariacao === 'P' && prod.variacoes) {
            let vars = prod.variacoes;
            if (!Array.isArray(vars)) vars = Object.values(vars);
            const varMatch = vars.map(v => v.variacao || v)
              .find(v => String(v.codigo || '').trim().toLowerCase() === skuStr);
            if (varMatch) {
              precoBasico.preco = Number(varMatch.preco || prod.preco || 0);
              precoBasico.preco_promocional = Number(varMatch.preco_promocional || prod.preco_promocional || 0);
            }
          }
        }
      } catch (_) { /* usa preços básicos da pesquisa */ }
      return precoBasico;
    }

    // ✅ Fallback: a Tiny às vezes omite o 'codigo' na pesquisa para produtos simples.
    // Inspeciona cada candidato via produto.obter.php procurando pelo codigo exato.
    const candidatos = [...new Set(produtos.map(p => p.produto?.id).filter(Boolean))].slice(0, 10);
    for (const candidatoId of candidatos) {
      try {
        await delay(tinyLimits?.delayMs || 1000);
        const detRes = await axios.post(
          'https://api.tiny.com.br/api2/produto.obter.php',
          new URLSearchParams({ token: tinyToken, formato: 'JSON', id: candidatoId })
        );
        const prod = detRes.data?.retorno?.produto;
        if (!prod) continue;

        if (String(prod.codigo || '').trim().toLowerCase() === skuStr) {
          return {
            preco: Number(prod.preco || 0),
            preco_promocional: Number(prod.preco_promocional || 0),
            preco_custo: Number(prod.preco_custo || 0),
          };
        }

        if (prod.variacoes) {
          let vars = Array.isArray(prod.variacoes) ? prod.variacoes : Object.values(prod.variacoes);
          const varMatch = vars.map(v => v.variacao || v)
            .find(v => String(v.codigo || '').trim().toLowerCase() === skuStr);
          if (varMatch) {
            return {
              preco: Number(varMatch.preco || prod.preco || 0),
              preco_promocional: Number(varMatch.preco_promocional || prod.preco_promocional || 0),
              preco_custo: Number(prod.preco_custo || 0),
            };
          }
        }
      } catch (_) { /* ignora e tenta o próximo */ }
    }

    return null;
  } catch (_) {
    return null;
  }
}

// ===== BUSCA PREÇOS BASE DOS PRODUTOS POR SKU (para o modal Corrigir Preço) =====
router.post('/api/produtos/precos-base', async (req, res) => {
  try {
    const { userId, skus } = req.body;
    if (!userId || !skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ erro: 'userId e skus[] são obrigatórios.' });
    }

    const skusLimpos = [...new Set(skus.filter(s => s))];
    const mapaPrecos = {};

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tinyToken: true, tinyPlano: true } });
    const tinyLimits = getTinyRateLimit(user?.tinyPlano);

    // 1) Tenta buscar na Tiny
    if (user?.tinyToken && !tinyLimits.blocked) {
      for (const sku of skusLimpos) {
        try {
          const precoTiny = await fetchPrecoTiny(sku, user.tinyToken, tinyLimits);
          if (precoTiny) mapaPrecos[sku] = precoTiny;
        } catch (_) { /* ignora erros individuais */ }
      }
    }

    // 2) Fallback: para SKUs não encontrados na Tiny, busca no banco local
    const skusSemPreco = skusLimpos.filter(s => !mapaPrecos[s]);
    if (skusSemPreco.length > 0) {
      const produtosLocais = await prisma.produto.findMany({
        where: { userId, sku: { in: skusSemPreco } },
        select: { sku: true, preco: true, dadosTiny: true }
      });
      for (const p of produtosLocais) {
        const dt = p.dadosTiny || {};
        mapaPrecos[p.sku] = {
          preco: Number(dt.preco || p.preco || 0),
          preco_promocional: Number(dt.preco_promocional || 0),
          preco_custo: Number(dt.preco_custo || 0),
          fonte: 'local'
        };
      }
    }

    res.json({ precos: mapaPrecos });
  } catch (error) {
    console.error('Erro ao buscar preços base:', error.message);
    res.status(500).json({ erro: error.message });
  }
});


router.post('/api/produtos/sync', async (req, res) => {
  try {
    const { mode, sku, userId, tinyToken, ids } = req.body; 
    const job = await syncQueue.add('sync-tiny', { mode, sku, userId, tinyToken, ids }); 
    res.json({ jobId: job.id, message: 'Sincronização iniciada' });
  } catch (error) {
    res.status(500).json({ erro: "Falha ao colocar sincronização na fila." });
  }
});

router.get('/api/produtos/sync-status/:id', async (req, res) => {
  try {
    const job = await syncQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    const state = await job.getState();
    res.json({ state, progress: job.progress || 0 });
  } catch (error) {
    res.status(500).json({ erro: "Falha ao ler status do Job." });
  }
});

router.post('/api/tiny-produto-detalhes', async (req, res) => {
  const { id, tinyToken } = req.body;
  if (!id) return res.status(400).json({ erro: 'ID obrigatório.' });
  const token = tinyToken || config.tinyApiToken;
  if (!token) return res.status(500).json({ erro: 'Token Tiny não configurado.' });

  try {
    const [detalhesResponse, estoqueResponse] = await Promise.all([
      axios.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token, formato: 'JSON', id })),
      axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php', new URLSearchParams({ token, formato: 'JSON', id }))
    ]);

    const detRetorno = detalhesResponse.data?.retorno;
    const estRetorno = estoqueResponse.data?.retorno;

    if (!detRetorno || detRetorno.status !== 'OK') return res.status(400).json({ erro: detRetorno?.erros?.[0]?.erro || 'Erro ao obter produto' });

    let produto = { ...detRetorno.produto, estoque_atual: estRetorno?.produto?.saldo || 0 };

    let variacoesTiny = produto.variacoes;
    if (variacoesTiny && !Array.isArray(variacoesTiny)) {
      variacoesTiny = Object.values(variacoesTiny); 
    }

    if (variacoesTiny && variacoesTiny.length > 0) {
      const filhosResolvidos = [];
      
      for (const v of variacoesTiny) {
        const idFilho = v.variacao?.idProdutoFilho || v.idProdutoFilho || v.variacao?.id || v.id; 
        if (!idFilho) continue;

        try {
          await delay(350);
          const [detF, estF] = await Promise.all([
            axios.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token, formato: 'JSON', id: idFilho })),
            axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php', new URLSearchParams({ token, formato: 'JSON', id: idFilho }))
          ]);
          
          const pFilho = detF.data?.retorno?.produto || {};
          const saldoFilho = estF.data?.retorno?.produto?.saldo || 0;

          let anexosFilho = pFilho.anexos || [];
          if (!Array.isArray(anexosFilho)) anexosFilho = Object.values(anexosFilho);

          filhosResolvidos.push({
            ...pFilho,
            anexos: anexosFilho,
            estoque_atual: Number(saldoFilho),
            grade: v.variacao?.grade || v.grade || {} 
          });
        } catch (err) {
          console.error(`Aviso: Falha ao carregar variação ${idFilho}`, err.message);
        }
      }
      produto.filhos = filhosResolvidos.filter(f => f && f.id); 
    }

    return res.json(produto);
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
});

// Retorna URLs das imagens do produto Tiny armazenadas no DB (sem chamar a API Tiny)
router.get('/api/produto-imagens', async (req, res) => {
  const { userId, sku } = req.query;
  if (!userId || !sku) return res.status(400).json({ erro: 'userId e sku obrigatórios.' });

  try {
    const produto = await prisma.produto.findUnique({
      where: { userId_sku: { userId, sku } },
      select: { dadosTiny: true }
    });

    if (!produto?.dadosTiny) return res.json({ imagens: [] });

    const dados = produto.dadosTiny;
    let anexos = dados.anexos || [];
    if (!Array.isArray(anexos)) anexos = Object.values(anexos);

    const imagens = anexos
      .map(a => (typeof a === 'string' ? a : a?.anexo || a?.url || ''))
      .filter(Boolean);

    return res.json({ imagens });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
});

// Retorna imagens customizadas (tratadas) salvas para um produto
router.get('/api/produto-imagens-custom', async (req, res) => {
  const { userId, sku } = req.query;
  if (!userId || !sku) return res.status(400).json({ erro: 'userId e sku obrigatórios.' });
  try {
    const produto = await prisma.produto.findUnique({
      where: { userId_sku: { userId, sku } },
      select: { imagensCustom: true }
    });
    return res.json({ imagens: produto?.imagensCustom || null });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
});

// Salva a lista de imagens customizadas (tratadas) para um produto
router.put('/api/produto-imagens-custom', async (req, res) => {
  const { userId, sku, imagens } = req.body;
  if (!userId || !sku || !Array.isArray(imagens)) return res.status(400).json({ erro: 'userId, sku e imagens obrigatórios.' });
  try {
    await prisma.produto.update({
      where: { userId_sku: { userId, sku } },
      data: { imagensCustom: imagens }
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
});

export default router;