import prisma from '../config/prisma.js';

/**
 * Resolve o userId efetivo (owner) de um usuário, incluindo sub-usuários.
 * Retorna { id, acessoLivre, role } do usuário pai (ou do próprio se não for sub-usuário).
 */
async function resolverUserPai(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { parentUserId: true, acessoLivre: true, role: true },
  });
  if (!user) return null;
  if (user.parentUserId) {
    return prisma.user.findUnique({
      where: { id: user.parentUserId },
      select: { id: true, acessoLivre: true, role: true },
    });
  }
  return { id: userId, acessoLivre: user.acessoLivre, role: user.role };
}

/**
 * Verifica se a assinatura do usuário (ou de seu pai) está ativa.
 * Retorna true para SUPER_ADMIN e usuários com acessoLivre.
 * Retorna true se houver assinatura com status 'approved' e data de expiração futura.
 */
export async function isAssinaturaAtiva(userId) {
  try {
    const userPai = await resolverUserPai(userId);
    if (!userPai) return false;

    if (userPai.role === 'SUPER_ADMIN') return true;
    if (userPai.acessoLivre) return true;

    const assinatura = await prisma.assinatura.findFirst({
      where: {
        userId: userPai.id,
        status: 'approved',
        expiraEm: { gt: new Date() },
      },
    });

    return !!assinatura;
  } catch {
    return false;
  }
}
