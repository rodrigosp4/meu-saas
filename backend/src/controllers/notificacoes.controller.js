import prisma from '../config/prisma.js';

export const notificacoesController = {

  // GET /api/notificacoes/contagem
  async getContagem(req, res) {
    try {
      const userId = req.userId;
      const cache = await prisma.notificacaoCache.findUnique({ where: { userId } });
      res.json({
        msgNaoLidas: cache?.msgNaoLidas ?? 0,
        perguntasPendentes: cache?.perguntasPendentes ?? 0,
        reclamacoesPendentes: cache?.reclamacoesPendentes ?? 0,
        updatedAt: cache?.updatedAt ?? null,
      });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },
};
