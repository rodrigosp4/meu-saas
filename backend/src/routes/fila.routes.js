import { Router } from 'express';
import prisma from '../config/prisma.js';
import { syncQueue, mlSyncQueue, publishQueue, priceQueue, priceCheckQueue, acoesMassaQueue } from '../workers/queue.js';

function parseErrorIds(detalhes) {
  if (!detalhes) return [];
  const ids = new Set();
  for (const line of detalhes.split('\n')) {
    const m = line.match(/^\[ID:\s*([A-Z0-9]+)\].*Erro:/);
    if (m) ids.add(m[1]);
  }
  return [...ids];
}

const router = Router();

const QUEUES_BY_TIPO = {
  'sync-tiny':     syncQueue,
  'sync-ml':       mlSyncQueue,
  'publish-ml':    publishQueue,
  'update-price':  priceQueue,
  'price-check-v2': priceCheckQueue,
  'acoes-massa':   acoesMassaQueue,
};

// 1. Buscar todas as tarefas do usuário
router.get('/api/fila', async (req, res) => {
  try {
    const { userId, status, tipo, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { userId };
    if (status && status !== 'Todos') where.status = status;
    if (tipo && tipo !== 'Todos') where.tipo = tipo;

    const [tarefas, total] = await Promise.all([
      prisma.tarefaFila.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.tarefaFila.count({ where })
    ]);

    res.json({ tarefas, total });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 2. Buscar detalhes de uma tarefa específica (para polling ao vivo no frontend)
router.get('/api/fila/:tarefaId/detalhes', async (req, res) => {
  try {
    const { tarefaId } = req.params;
    const { userId } = req.query;
    const tarefa = await prisma.tarefaFila.findFirst({
      where: { id: tarefaId, userId },
      select: { status: true, detalhes: true }
    });
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    res.json(tarefa);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 3. Excluir tarefa individual (cancela o job no BullMQ se ainda estiver pendente)
router.delete('/api/fila/:tarefaId', async (req, res) => {
  try {
    const { tarefaId } = req.params;
    const { userId } = req.query;

    const tarefa = await prisma.tarefaFila.findFirst({ where: { id: tarefaId, userId } });
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });

    // Tenta cancelar o job no BullMQ para não processar o que já foi removido
    if (tarefa.jobId) {
      for (const queue of Object.values(QUEUES_BY_TIPO)) {
        try {
          const job = await queue.getJob(tarefa.jobId);
          if (job) {
            await job.remove();
            break;
          }
        } catch (_) { /* ignora se a fila não tiver o job */ }
      }
    }

    await prisma.tarefaFila.delete({ where: { id: tarefaId } });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 3. Limpar Fila (Excluir concluídos/falhas do banco)
router.delete('/api/fila/limpar/:userId', async (req, res) => {
  try {
    await prisma.tarefaFila.deleteMany({
      where: {
        userId: req.params.userId,
        status: { in: ['CONCLUIDO', 'FALHA'] }
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 4. Forçar limpeza total do Redis (drain de todos os jobs pendentes/ativos)
router.post('/api/fila/forcar-limpar/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Deleta todos os registros do banco para este usuário
    await prisma.tarefaFila.deleteMany({ where: { userId } });

    // Obliterate remove TODOS os jobs do Redis, incluindo os que têm lock ativo
    await Promise.allSettled([
      priceQueue.obliterate({ force: true }),
      priceCheckQueue.obliterate({ force: true }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 5. Retomar tarefa travada (re-enfileira o job com o mesmo payload)
router.post('/api/fila/:tarefaId/retomar', async (req, res) => {
  try {
    const { tarefaId } = req.params;
    const { userId } = req.body;

    const tarefa = await prisma.tarefaFila.findFirst({ where: { id: tarefaId, userId } });
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    if (!tarefa.payload) return res.status(400).json({ erro: 'Tarefa sem payload salvo. Não é possível retomar automaticamente.' });

    let queue, jobName;
    if (tarefa.tipo === 'Corrigir Preço em Massa') {
      queue = priceQueue; jobName = 'update-price';
    } else if (tarefa.tipo === 'Verificar Preço em Massa') {
      queue = priceCheckQueue; jobName = 'price-check-v2';
    } else if (tarefa.tipo.startsWith('Ação em Massa')) {
      queue = acoesMassaQueue; jobName = 'acoes-massa-job';
    } else {
      return res.status(400).json({ erro: `Tipo "${tarefa.tipo}" não suportado para retomar.` });
    }

    // Cancela job anterior travado se ainda existir na fila
    if (tarefa.jobId) {
      for (const q of Object.values(QUEUES_BY_TIPO)) {
        try {
          const oldJob = await q.getJob(tarefa.jobId);
          if (oldJob) { await oldJob.remove(); break; }
        } catch (_) {}
      }
    }

    const appendLog = tarefa.detalhes
      ? tarefa.detalhes + '\n>> Retomado manualmente...\n'
      : '>> Retomado manualmente...\n';

    await prisma.tarefaFila.update({
      where: { id: tarefaId },
      data: { status: 'PENDENTE', detalhes: appendLog, jobId: null }
    });

    const job = await queue.add(jobName, {
      tarefaId,
      userId,
      ...tarefa.payload
    });

    await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { jobId: job.id } });

    res.json({ ok: true, jobId: job.id });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 6. Reprocessar apenas os itens com erro de uma tarefa concluída
// payloadOverride: parâmetros manuais quando a tarefa não tem payload salvo (tarefas antigas)
router.post('/api/fila/:tarefaId/reprocessar-erros', async (req, res) => {
  try {
    const { tarefaId } = req.params;
    const { userId, payloadOverride } = req.body;

    const tarefa = await prisma.tarefaFila.findFirst({ where: { id: tarefaId, userId } });
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });

    // Usa payload salvo da tarefa; se não houver, usa o override enviado pelo frontend
    const payload = tarefa.payload || payloadOverride;
    if (!payload) return res.status(400).json({ erro: 'Tarefa sem payload. Informe os parâmetros manualmente.' });

    const errorIds = parseErrorIds(tarefa.detalhes);
    if (errorIds.length === 0) return res.status(400).json({ erro: 'Nenhum item com erro encontrado no log.' });

    // Busca contaId e sku para cada item com erro
    const anuncios = await prisma.anuncioML.findMany({
      where: { id: { in: errorIds }, conta: { userId } },
      select: { id: true, contaId: true, sku: true }
    });

    if (anuncios.length === 0) return res.status(400).json({ erro: 'Itens com erro não encontrados no banco.' });

    const novaTarefa = await prisma.tarefaFila.create({
      data: {
        userId,
        tipo: 'Corrigir Preço em Massa',
        alvo: `${anuncios.length} erro(s) reprocessado(s)`,
        conta: 'Várias Contas',
        status: 'PENDENTE',
        payload
      }
    });

    const job = await priceQueue.add('update-price', {
      tarefaId: novaTarefa.id,
      userId,
      items: anuncios,
      ...payload
    });

    await prisma.tarefaFila.updateMany({ where: { id: novaTarefa.id }, data: { jobId: job.id } });

    res.json({ ok: true, tarefaId: novaTarefa.id, itens: anuncios.length });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;