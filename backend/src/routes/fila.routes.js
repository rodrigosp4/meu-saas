import { Router } from 'express';
import prisma from '../config/prisma.js';
import { syncQueue, mlSyncQueue, publishQueue, priceQueue, priceCheckQueue, acoesMassaQueue } from '../workers/queue.js';

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

// 2. Excluir tarefa individual (cancela o job no BullMQ se ainda estiver pendente)
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

// 3. Limpar Fila (Excluir todos os status)
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

export default router;