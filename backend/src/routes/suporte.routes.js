import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

// Listar clientes que autorizaram acesso de suporte
router.get('/api/suporte/clientes', async (req, res) => {
  try {
    if (req.userRole !== 'SUPPORT') {
      return res.status(403).json({ erro: 'Acesso restrito ao usuário de suporte.' });
    }
    const agora = new Date();
    const clientes = await prisma.user.findMany({
      where: {
        suporteAtivo: true,
        suporteExpira: { gt: agora },
        role: 'OWNER',
      },
      select: { id: true, email: true, suporteExpira: true, createdAt: true },
      orderBy: { email: 'asc' },
    });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Iniciar sessão de suporte (impersonar cliente)
router.post('/api/suporte/acessar/:targetUserId', async (req, res) => {
  try {
    if (req.userRole !== 'SUPPORT') {
      return res.status(403).json({ erro: 'Acesso restrito ao usuário de suporte.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.targetUserId },
      select: { id: true, email: true, suporteAtivo: true, suporteExpira: true, role: true },
    });

    if (!targetUser || targetUser.role !== 'OWNER') {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    if (!targetUser.suporteAtivo || !targetUser.suporteExpira || targetUser.suporteExpira < new Date()) {
      return res.status(403).json({ erro: 'Este cliente não autorizou o acesso de suporte ou o acesso expirou.' });
    }

    const expiraEm = new Date(Math.min(
      Date.now() + 24 * 60 * 60 * 1000,
      targetUser.suporteExpira.getTime()
    ));

    const sessao = await prisma.sessaoSuporte.create({
      data: {
        suporteUserId: req.actualUserId,
        targetUserId: targetUser.id,
        expiraEm,
      },
    });

    const token = jwt.sign(
      {
        userId: req.actualUserId,
        role: 'SUPPORT',
        targetUserId: targetUser.id,
        sessaoId: sessao.id,
        isImpersonating: true,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      sessaoId: sessao.id,
      targetUser: { id: targetUser.id, email: targetUser.email },
      expiraEm,
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Encerrar sessão de suporte
router.post('/api/suporte/sair', async (req, res) => {
  try {
    // Não precisa verificar role - qualquer sessão de impersonação pode ser encerrada
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;
