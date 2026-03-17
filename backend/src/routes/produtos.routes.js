import { Router } from 'express';
import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { syncQueue } from '../workers/queue.js';
import axios from 'axios';
import { config } from '../config/env.js';

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


// ===== BUSCA PREÇOS BASE DOS PRODUTOS POR SKU (para o modal Corrigir Preço) =====
// ✅ CORRIGIDO: Lógica otimizada para buscar SKUs de pais e filhos de forma mais eficiente.
router.post('/api/produtos/precos-base', async (req, res) => {
  try {
    const { userId, skus } = req.body;
    if (!userId || !skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ erro: 'userId e skus[] são obrigatórios.' });
    }

    const skusLimpos = [...new Set(skus.filter(s => s))];
    const mapaPrecos = {};

    // --- ETAPA 1: Busca produtos cujo SKU principal corresponde aos da lista
    const produtosPrincipais = await prisma.produto.findMany({
      where: { userId, sku: { in: skusLimpos } },
      select: { sku: true, preco: true, dadosTiny: true }
    });

    for (const p of produtosPrincipais) {
      const dados = p.dadosTiny || {};
      mapaPrecos[p.sku] = {
        preco: Number(dados.preco || p.preco || 0),
        preco_promocional: Number(dados.preco_promocional || 0),
        preco_custo: Number(dados.preco_custo || 0),
      };
    }

// --- ETAPA 2: Busca os SKUs que NÃO foram encontrados (podem ser variações)
    const skusRestantes = skusLimpos.filter(s => !mapaPrecos[s]);

    if (skusRestantes.length > 0) {
      // A abordagem via jsonb_to_recordset quebra caso a estrutura de variações no banco 
      // (originada do ERP) mude ou venha como Objeto no lugar de Array.
      // Em vez disso, filtramos os produtos que contém 'variacoes' e extraímos via Javascript (à prova de falhas).
      const produtosComVariacoes = await prisma.$queryRawUnsafe(`
        SELECT sku, "dadosTiny"
        FROM "Produto"
        WHERE "userId" = $1
          AND "dadosTiny"::text LIKE '%variacoes%'
      `, userId);
      
      for (const p of produtosComVariacoes) {
        const dadosPai = p.dadosTiny || {};
        let variacoes = dadosPai.variacoes;

        if (!variacoes) continue;

        // O Tiny às vezes retorna objeto em vez de array. Normalizamos aqui.
        if (typeof variacoes === 'object' && !Array.isArray(variacoes)) {
          variacoes = Object.values(variacoes);
        }

        if (Array.isArray(variacoes)) {
          for (const v of variacoes) {
            // O Tiny envelopa os dados dentro de 'variacao', mas as vezes não.
            const varObj = v.variacao || v;
            const skuFilho = String(varObj.codigo || '').trim();

            if (skuFilho && skusRestantes.includes(skuFilho)) {
              mapaPrecos[skuFilho] = {
                // A variação pode não ter preço, então fazemos fallback para o preço do pai
                preco: Number(varObj.preco || dadosPai.preco || 0),
                preco_promocional: Number(varObj.preco_promocional || dadosPai.preco_promocional || 0),
                preco_custo: Number(varObj.preco_custo || dadosPai.preco_custo || 0), // Custo geralmente é do pai
              };
            }
          }
        }
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

export default router;