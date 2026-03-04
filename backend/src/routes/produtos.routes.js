import { Router } from 'express';
import prisma from '../config/prisma.js';
import { syncQueue } from '../workers/queue.js';
import axios from 'axios';
import { config } from '../config/env.js';

const router = Router();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.get('/api/produtos', async (req, res) => {
  try {
    // 1. Receba o userId da query
    const { userId, search = '', status = 'Todos', page = 1, limit = 50 } = req.query;
    
    if (!userId) return res.status(400).json({ erro: "userId obrigatório" });

    const skip = (Number(page) - 1) * Number(limit);

    // 2. Adicione o userId como filtro obrigatório (WHERE)
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

    // BUSCA DE VARIAÇÕES (FILHOS)
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

          // Padroniza os anexos do filho para sempre ser um Array
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