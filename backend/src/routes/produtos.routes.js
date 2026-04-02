import { Router } from 'express';
import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { syncQueue } from '../workers/queue.js';
import { config } from '../config/env.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';
import { createTinyClient, getTinyAccessToken, listarProdutos, obterProduto, obterEstoque } from '../utils/tinyClient.js';

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


// ===== HELPER: Busca preço de um SKU diretamente na Tiny API v3 =====
async function fetchPrecoTiny(sku, tinyToken, tinyLimits) {
  try {
    const skuStr = String(sku).trim().toLowerCase();
    const client = createTinyClient(tinyToken);

    await delay(tinyLimits?.delayMs || 1000);
    const data = await listarProdutos(client, { codigo: String(sku).trim() });
    const itens = data.itens || [];
    const exactMatch = itens.find(p => String(p.sku || '').trim().toLowerCase() === skuStr);

    if (!exactMatch) return null;

    if (exactMatch.tipoVariacao !== 'P') {
      return {
        preco: exactMatch.precos?.preco || 0,
        preco_promocional: exactMatch.precos?.precoPromocional || 0,
        preco_custo: exactMatch.precos?.precoCusto || 0,
      };
    }

    await delay(tinyLimits?.delayMs || 1000);
    const det = await obterProduto(client, exactMatch.id);
    const varMatch = (det.variacoes || []).find(v => String(v.sku || '').trim().toLowerCase() === skuStr);
    return {
      preco: varMatch?.precos?.preco ?? det.precos?.preco ?? 0,
      preco_promocional: varMatch?.precos?.precoPromocional ?? det.precos?.precoPromocional ?? 0,
      preco_custo: det.precos?.precoCusto ?? 0,
    };
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

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tinyPlano: true } });
    const tinyLimits = getTinyRateLimit(user?.tinyPlano);
    const tinyToken = await getTinyAccessToken(userId);

    // 1) Tenta buscar na Tiny
    if (tinyToken && !tinyLimits.blocked) {
      for (const sku of skusLimpos) {
        try {
          const precoTiny = await fetchPrecoTiny(sku, tinyToken, tinyLimits);
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
          preco: Number(dt.preco ?? dt.precos?.preco ?? p.preco ?? 0),
          preco_promocional: Number(dt.preco_promocional ?? dt.precos?.precoPromocional ?? 0),
          preco_custo: Number(dt.preco_custo ?? dt.precos?.precoCusto ?? 0),
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


// ─── Importação via planilha (CSV/XLS/XLSX) ────────────────────────────────
router.post('/api/produtos/importar-planilha', async (req, res) => {
  try {
    const { userId, produtos: produtosDaPlanilha } = req.body;
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });
    if (!Array.isArray(produtosDaPlanilha) || produtosDaPlanilha.length === 0) {
      return res.status(400).json({ erro: 'Nenhum produto enviado.' });
    }

    let criados = 0;
    let atualizados = 0;
    const erros = [];

    for (const p of produtosDaPlanilha) {
      if (!p.sku) continue;
      try {
        const dadosTiny = {
          id: p.idTiny || null,
          codigo: p.sku,
          nome: p.nome,
          preco: p.preco || 0,
          preco_promocional: p.precoPromocional || 0,
          preco_custo: p.precoCusto || 0,
          tipoVariacao: p.tipoProduto === 'V' ? 'PAI' : null,
          variacoes: [],
          anexos: (p.imagens || []).map(url => ({ url })),
          estoque_atual: p.estoque || 0,
          fonte: 'planilha',
        };

        const existente = await prisma.produto.findUnique({
          where: { userId_sku: { userId, sku: p.sku } },
          select: { id: true },
        });

        if (existente) {
          await prisma.produto.update({
            where: { userId_sku: { userId, sku: p.sku } },
            data: {
              nome: p.nome,
              preco: p.preco || 0,
              estoque: p.estoque || 0,
              dadosTiny,
            },
          });
          atualizados++;
        } else {
          await prisma.produto.create({
            data: {
              userId,
              sku: p.sku,
              nome: p.nome,
              preco: p.preco || 0,
              estoque: p.estoque || 0,
              statusML: 'Não Publicado',
              dadosTiny,
            },
          });
          criados++;
        }
      } catch (err) {
        erros.push({ sku: p.sku, erro: err.message });
      }
    }

    res.json({ ok: true, criados, atualizados, erros });
  } catch (error) {
    console.error('Erro ao importar planilha:', error);
    res.status(500).json({ erro: 'Erro interno ao importar planilha.' });
  }
});

router.post('/api/produtos/sync', async (req, res) => {
  try {
    const { mode, sku, userId, ids } = req.body;
    const job = await syncQueue.add('sync-tiny', { mode, sku, userId, ids });
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

router.delete('/api/produtos/sync-status/:id', async (req, res) => {
  try {
    const job = await syncQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    await job.remove();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ erro: "Falha ao cancelar Job." });
  }
});

router.post('/api/tiny-produto-detalhes', async (req, res) => {
  const { id, userId } = req.body;
  if (!id) return res.status(400).json({ erro: 'ID obrigatório.' });

  try {
    const uid = userId || req.userId;
    const token = await getTinyAccessToken(uid);
    if (!token) return res.status(503).json({ erro: 'Token Tiny expirado ou inválido. Reconecte em Configurações.', tinyTokenInvalid: true });

    const client = createTinyClient(token);
    const det = await obterProduto(client, id);
    const est = await obterEstoque(client, id).catch(() => null);

    const estoqueAtual = est?.saldo != null ? Number(est.saldo) : (det.estoque?.quantidade || 0);
    const variacoes = det.variacoes || [];

    // Em v3, as variações já vêm embutidas no produto pai com precos e estoque
    const filhos = variacoes.map(v => ({
      id: v.id,
      codigo: v.sku,
      nome: v.descricao,
      preco: v.precos?.preco || 0,
      preco_promocional: v.precos?.precoPromocional || 0,
      anexos: [],
      estoque_atual: v.estoque?.quantidade || 0,
      grade: v.grade || [],
    }));

    return res.json({
      id: det.id,
      codigo: det.sku,
      nome: det.descricao,
      descricao: det.descricao,
      descricao_complementar: det.descricaoComplementar || null,
      preco: det.precos?.preco || 0,
      preco_promocional: det.precos?.precoPromocional || 0,
      preco_custo: det.precos?.precoCusto || 0,
      tipoVariacao: det.tipoVariacao,
      tipo_produto: det.tipo || null,
      origem: det.origem ?? null,
      marca: det.marca?.nome || null,
      gtin: det.gtin || null,
      peso_bruto: det.dimensoes?.pesoBruto || null,
      alturaEmbalagem: det.dimensoes?.altura || null,
      larguraEmbalagem: det.dimensoes?.largura || null,
      comprimentoEmbalagem: det.dimensoes?.comprimento || null,
      anexos: (det.anexos || []).map(a => ({ url: a.url })),
      estoque_atual: estoqueAtual,
      filhos,
    });
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
      .map(a => (typeof a === 'string' ? a : a?.url || ''))
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