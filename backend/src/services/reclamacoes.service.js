import prisma from '../config/prisma.js';
import { mlService } from './ml.service.js';
import axios from 'axios';

const ML_BASE = 'https://api.mercadolibre.com';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function getTokenParaConta(conta) {
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    const token = refreshed?.access_token || conta.accessToken;
    if (refreshed?.access_token) {
      await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
    }
    return token;
  } catch {
    return conta.accessToken;
  }
}

export async function sincronizarReclamacoes(userId) {
  const contas = await prisma.contaML.findMany({
    where: { userId },
    select: { id: true, accessToken: true, refreshToken: true },
  });

  const idsRetornados = new Set();

  for (const conta of contas) {
    try {
      const token = await getTokenParaConta(conta);
      let offset = 0;
      const limit = 50;

      while (true) {
        const resp = await axios.get(
          `${ML_BASE}/post-purchase/v1/claims/search?status=opened&limit=${limit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
        const data = resp.data;
        const claims = data?.data || [];
        const total = data?.paging?.total || 0;

        for (const claim of claims) {
          const claimId = String(claim.id);
          idsRetornados.add(claimId);

          const buyer = claim.players?.find(p => p.role === 'complainant');
          const buyerId = buyer ? String(buyer.user_id) : null;

          const existing = await prisma.reclamacaoCache.findUnique({ where: { id: claimId } });

          await prisma.reclamacaoCache.upsert({
            where: { id: claimId },
            create: {
              id: claimId,
              userId,
              contaId: conta.id,
              status: claim.status || 'opened',
              type: claim.type || 'mediations',
              stage: claim.stage || 'none',
              resourceId: String(claim.resource_id || ''),
              resource: claim.resource || 'order',
              reasonId: claim.reason_id || null,
              buyerId,
              lida: false,
              dadosML: claim,
              dateCreated: new Date(claim.date_created),
              lastUpdated: new Date(claim.last_updated),
            },
            update: {
              status: claim.status || 'opened',
              stage: claim.stage || 'none',
              lastUpdated: new Date(claim.last_updated),
              dadosML: claim,
              ...(existing && new Date(claim.last_updated) > existing.lastUpdated ? { lida: false } : {}),
            },
          });
        }

        if (offset + limit >= total || claims.length === 0) break;
        offset += limit;
        await delay(300);
      }
      await delay(500);
    } catch (e) {
      if (e.response?.status === 429) await delay(3000);
      else if (e.response?.status !== 403) {
        console.error(`[Reclamacoes] Erro para conta ${conta.id}:`, e.message);
      }
    }
  }

  // Fecha no cache as que não vieram mais como abertas
  if (idsRetornados.size > 0) {
    const abertasNoBanco = await prisma.reclamacaoCache.findMany({
      where: { userId, status: 'opened' },
      select: { id: true },
    });
    const idsFechar = abertasNoBanco.map(r => r.id).filter(id => !idsRetornados.has(id));
    if (idsFechar.length > 0) {
      await prisma.reclamacaoCache.updateMany({
        where: { id: { in: idsFechar } },
        data: { status: 'closed' },
      });
    }
  }

  const pendentes = await prisma.reclamacaoCache.count({
    where: { userId, status: 'opened', lida: false },
  });

  await prisma.notificacaoCache.upsert({
    where: { userId },
    create: { userId, msgNaoLidas: 0, perguntasPendentes: 0, reclamacoesPendentes: pendentes },
    update: { reclamacoesPendentes: pendentes },
  });

  return pendentes;
}
