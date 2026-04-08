import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET não está definido. O servidor não pode iniciar sem ele.');
  process.exit(1);
}

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/login' },
  { method: 'POST', path: '/api/register' },
  { method: 'POST', path: '/api/forgot-password' },
  { method: 'POST', path: '/api/reset-password' },
  { method: 'GET',  path: '/health' },
  { method: 'GET',  path: '/callback' },
  { method: 'GET',  path: '/api/tiny/callback' },
  { method: 'GET',  path: '/api/tiny/connect' },
  { method: 'GET',  path: '/api/bling/callback' },
  { method: 'GET',  path: '/api/bling/connect' },
  { method: 'POST', path: '/api/assinatura/webhook' },
  { method: 'GET',  path: '/api/assinatura/planos' },
  { method: 'GET',  path: '/api/landing/secoes' },
];

export async function authMiddleware(req, res, next) {
  const isPublic = PUBLIC_ROUTES.some(
    (r) => r.method === req.method && req.path.startsWith(r.path)
  );
  if (isPublic) return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Se for impersonação (suporte ou super_admin acessando conta de cliente)
    if (payload.isImpersonating && payload.targetUserId) {
      req.userId = payload.targetUserId;
      req.actualUserId = payload.userId;
      // SUPER_ADMIN impersonando: age como OWNER no contexto do cliente
      req.userRole = payload.isSuperAdminImpersonating ? 'OWNER' : 'SUPPORT';
      req.isImpersonating = true;
      req.isSuperAdminImpersonating = payload.isSuperAdminImpersonating || false;
    } else {
      // Sessão normal: valida se o sessionId do token ainda é o ativo no banco
      if (payload.sessionId) {
        const userRecord = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { activeSessionId: true },
        });
        if (!userRecord || userRecord.activeSessionId !== payload.sessionId) {
          return res.status(401).json({
            erro: 'Sessão encerrada. Você entrou em outro dispositivo.',
            codigo: 'SESSION_EXPIRED',
          });
        }
      }

      // Sub-usuário: usa dados do usuário pai (dono)
      req.userId = payload.parentUserId || payload.userId;
      req.actualUserId = payload.userId;
      req.userRole = payload.role || 'OWNER';
      req.isImpersonating = false;
      req.isSuperAdminImpersonating = false;
    }

    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}
