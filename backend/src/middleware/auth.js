import jwt from 'jsonwebtoken';

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
];

export function authMiddleware(req, res, next) {
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
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme_secret');

    // Se for impersonação (suporte ou super_admin acessando conta de cliente)
    if (payload.isImpersonating && payload.targetUserId) {
      req.userId = payload.targetUserId;
      req.actualUserId = payload.userId;
      // SUPER_ADMIN impersonando: age como OWNER no contexto do cliente
      req.userRole = payload.isSuperAdminImpersonating ? 'OWNER' : 'SUPPORT';
      req.isImpersonating = true;
      req.isSuperAdminImpersonating = payload.isSuperAdminImpersonating || false;
    } else {
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
