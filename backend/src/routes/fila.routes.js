import { Router } from 'express';
import prisma from '../config/prisma.js';
// import { publishQueue } from '../workers/queue.js'; // Descomente quando criar a fila

const router = Router();

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

// 2. Limpar Fila (MODIFICADO: Excluir todos os status)
router.delete('/api/fila/limpar/:userId', async (req, res) => {
  try {
    await prisma.tarefaFila.deleteMany({
      where: {
        userId: req.params.userId,
        // ✅ CORREÇÃO: Inclui todos os status para uma limpeza completa
        status: { in: ['CONCLUIDO', 'FALHA', 'PROCESSANDO', 'PENDENTE'] }
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;