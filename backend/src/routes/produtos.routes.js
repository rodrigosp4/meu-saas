import { Router } from 'express';
import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { syncQueue } from '../workers/queue.js';
import axios from 'axios';
import { config } from '../config/env.js';

const router = Router();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.get('/api/produtos', async (req, res) => {
  try {
    const { userId, search = '', status = 'Todos', page = 1, limit = 50 } = req.query;
    if (!userId) return res.status(400).json({ erro: "userId obrigatório" });

    const skip = (Number(page) - 1) * Number(limit);
    const where = { userId: userId }; 
    
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (status !== 'Todos') where.statusML = status;

    const [produtos, total] = await Promise.all([
      prisma.produto.findMany({ where, skip, take: Number(limit), orderBy: { updatedAt: 'desc' } }),
      prisma.produto.count({ where })
    ]);

    res.json({ produtos, total });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar produtos no banco de dados." });
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
    const { mode, sku, userId, tinyToken } = req.body; 
    const job = await syncQueue.add('sync-tiny', { mode, sku, userId, tinyToken }); 
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
  const { id } = req.body;
  if (!id) return res.status(400).json({ erro: 'ID obrigatório.' });
  if (!config.tinyApiToken) return res.status(500).json({ erro: 'Token Tiny não configurado no .env.' });

  try {
    const [detalhesResponse, estoqueResponse] = await Promise.all([
      axios.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token: config.tinyApiToken, formato: 'JSON', id })),
      axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php', new URLSearchParams({ token: config.tinyApiToken, formato: 'JSON', id }))
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
            axios.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token: config.tinyApiToken, formato: 'JSON', id: idFilho })),
            axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php', new URLSearchParams({ token: config.tinyApiToken, formato: 'JSON', id: idFilho }))
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

export default router;