import { Router } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import prisma from '../config/prisma.js';

const router = Router();

const PLANOS = {
  '30d':  { dias: 30,  meses: 1, desconto: 0,    label: '30 dias' },
  '60d':  { dias: 60,  meses: 2, desconto: 0.05, label: '60 dias (5% off)' },
  '90d':  { dias: 90,  meses: 3, desconto: 0.10, label: '90 dias (10% off)' },
  '180d': { dias: 180, meses: 6, desconto: 0.15, label: '6 meses (15% off)' },
};

async function getMPClient() {
  const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
  if (!config?.mpAccessToken) throw new Error('MercadoPago não configurado. Configure o Access Token no painel admin.');
  return new MercadoPagoConfig({ accessToken: config.mpAccessToken });
}

function calcularValor(precoMensal, planoKey) {
  const plano = PLANOS[planoKey];
  if (!plano) throw new Error('Plano inválido');
  return parseFloat((precoMensal * plano.meses * (1 - plano.desconto)).toFixed(2));
}

// Resolve o userId "pai" (OWNER) para verificação de assinatura
async function resolverUserPai(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { parentUserId: true, acessoLivre: true, role: true } });
  if (!user) return null;
  if (user.parentUserId) {
    // sub-usuário: herda do pai
    return prisma.user.findUnique({
      where: { id: user.parentUserId },
      select: { id: true, acessoLivre: true, role: true },
    });
  }
  return { id: userId, acessoLivre: user.acessoLivre, role: user.role };
}

// GET /api/assinatura/planos  (público — sem auth, usado na landing page)
router.get('/api/assinatura/planos', async (req, res) => {
  try {
    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    const precoMensal = config?.precoMensal ?? 299;
    const planos = Object.entries(PLANOS).map(([key, p]) => ({
      key,
      label: p.label,
      dias: p.dias,
      desconto: p.desconto,
      valor: calcularValor(precoMensal, key),
      precoMensal,
    }));
    res.json({ planos, mpPublicKey: config?.mpPublicKey || null });
  } catch {
    // Fallback com valores padrão se não houver config
    const precoMensal = 299;
    res.json({
      planos: Object.entries(PLANOS).map(([key, p]) => ({
        key, label: p.label, dias: p.dias, desconto: p.desconto,
        valor: calcularValor(precoMensal, key), precoMensal,
      })),
      mpPublicKey: null,
    });
  }
});

// GET /api/assinatura/status
router.get('/api/assinatura/status', async (req, res) => {
  try {
    const userId = req.userId;
    const userPai = await resolverUserPai(userId);

    if (!userPai) return res.status(404).json({ erro: 'Usuário não encontrado' });

    // SUPER_ADMIN sempre tem acesso
    if (userPai.role === 'SUPER_ADMIN') {
      return res.json({ ativo: true, motivo: 'super_admin', assinatura: null });
    }

    // Acesso livre configurado pelo admin
    if (userPai.acessoLivre) {
      return res.json({ ativo: true, motivo: 'acesso_livre', assinatura: null });
    }

    // Busca assinatura ativa
    const agora = new Date();
    const assinatura = await prisma.assinatura.findFirst({
      where: {
        userId: userPai.id,
        status: 'approved',
        expiraEm: { gt: agora },
      },
      orderBy: { expiraEm: 'desc' },
    });

    if (assinatura) {
      return res.json({ ativo: true, motivo: 'assinatura', assinatura });
    }

    // Última assinatura (pendente ou expirada)
    const ultimaAssinatura = await prisma.assinatura.findFirst({
      where: { userId: userPai.id },
      orderBy: { createdAt: 'desc' },
    });

    // Busca config para mostrar preços
    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    const precoMensal = config?.precoMensal ?? 299;
    const planos = Object.entries(PLANOS).map(([key, p]) => ({
      key,
      label: p.label,
      dias: p.dias,
      desconto: p.desconto,
      valor: calcularValor(precoMensal, key),
    }));

    return res.json({ ativo: false, motivo: 'sem_assinatura', assinatura: ultimaAssinatura, planos, mpPublicKey: config?.mpPublicKey || null });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/assinatura/criar-preferencia
router.post('/api/assinatura/criar-preferencia', async (req, res) => {
  try {
    const { planoKey } = req.body;
    if (!PLANOS[planoKey]) return res.status(400).json({ erro: 'Plano inválido.' });

    const userId = req.userId;
    const userPai = await resolverUserPai(userId);
    if (!userPai) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    const precoMensal = config?.precoMensal ?? 299;
    const valor = calcularValor(precoMensal, planoKey);
    const plano = PLANOS[planoKey];

    const mpClient = await getMPClient();
    const preference = new Preference(mpClient);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const result = await preference.create({
      body: {
        items: [{
          title: `Assinatura ${plano.label} - SaaS ML`,
          quantity: 1,
          unit_price: valor,
          currency_id: 'BRL',
        }],
        back_urls: {
          success: `${frontendUrl}/?assinatura=success`,
          failure: `${frontendUrl}/?assinatura=failure`,
          pending: `${frontendUrl}/?assinatura=pending`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL || frontendUrl}/api/assinatura/webhook`,
        external_reference: `${userPai.id}:${planoKey}`,
        expires: false,
      },
    });

    // Registra assinatura com status pending
    const assinatura = await prisma.assinatura.create({
      data: {
        userId: userPai.id,
        plano: planoKey,
        valor,
        status: 'pending',
        mpPreferenceId: result.id,
      },
    });

    res.json({ preferenceId: result.id, initPoint: result.init_point, assinaturaId: assinatura.id });
  } catch (err) {
    console.error('[assinatura] erro criar-preferencia:', err);
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/assinatura/webhook  (rota pública — sem auth)
router.post('/api/assinatura/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type !== 'payment' || !data?.id) {
      return res.sendStatus(200);
    }

    // Busca os dados do pagamento no MP
    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    if (!config?.mpAccessToken) return res.sendStatus(200);

    const mpClient = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const paymentAPI = new Payment(mpClient);
    const payment = await paymentAPI.get({ id: String(data.id) });

    if (!payment?.external_reference) return res.sendStatus(200);

    const [userId, planoKey] = payment.external_reference.split(':');
    if (!userId || !planoKey) return res.sendStatus(200);

    const status = payment.status; // 'approved', 'pending', 'rejected', etc.

    if (status === 'approved') {
      const plano = PLANOS[planoKey];
      const agora = new Date();
      const expiraEm = new Date(agora.getTime() + plano.dias * 24 * 60 * 60 * 1000);

      // Atualiza ou cria a assinatura como aprovada
      await prisma.assinatura.updateMany({
        where: { userId, mpPreferenceId: payment.preference_id },
        data: {
          status: 'approved',
          mpPaymentId: String(payment.id),
          iniciaEm: agora,
          expiraEm,
        },
      });

      // Se não achou pelo preferenceId, cria nova
      const existente = await prisma.assinatura.findFirst({
        where: { userId, mpPaymentId: String(payment.id) },
      });
      if (!existente) {
        const config2 = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
        await prisma.assinatura.create({
          data: {
            userId,
            plano: planoKey,
            valor: calcularValor(config2?.precoMensal ?? 299, planoKey),
            status: 'approved',
            mpPaymentId: String(payment.id),
            mpPreferenceId: payment.preference_id,
            iniciaEm: agora,
            expiraEm,
          },
        });
      }
    } else if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(status)) {
      await prisma.assinatura.updateMany({
        where: { userId, mpPreferenceId: payment.preference_id },
        data: { status: 'cancelled', mpPaymentId: String(payment.id) },
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[assinatura] webhook erro:', err);
    res.sendStatus(200); // sempre 200 pro MP não ficar retentando
  }
});

// POST /api/assinatura/verificar-pagamento  — frontend chama após retorno do MP
router.post('/api/assinatura/verificar-pagamento', async (req, res) => {
  try {
    const { paymentId } = req.body;
    const userId = req.userId;
    const userPai = await resolverUserPai(userId);
    if (!userPai) return res.status(404).json({ erro: 'Usuário não encontrado' });

    if (!paymentId) {
      // Apenas retorna status atual sem verificar
      const agora = new Date();
      const assinatura = await prisma.assinatura.findFirst({
        where: { userId: userPai.id, status: 'approved', expiraEm: { gt: agora } },
        orderBy: { expiraEm: 'desc' },
      });
      return res.json({ ativo: !!assinatura, assinatura });
    }

    // Verifica diretamente no MP
    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    if (!config?.mpAccessToken) return res.status(400).json({ erro: 'MercadoPago não configurado.' });

    const mpClient = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const paymentAPI = new Payment(mpClient);
    const payment = await paymentAPI.get({ id: String(paymentId) });

    if (payment?.status === 'approved' && payment.external_reference) {
      const [pUserId, planoKey] = payment.external_reference.split(':');
      if (pUserId === userPai.id) {
        const plano = PLANOS[planoKey];
        const agora = new Date();
        const expiraEm = new Date(agora.getTime() + plano.dias * 24 * 60 * 60 * 1000);

        await prisma.assinatura.updateMany({
          where: { userId: pUserId, status: { not: 'approved' } },
          data: { status: 'approved', mpPaymentId: String(payment.id), iniciaEm: agora, expiraEm },
        });

        const assinatura = await prisma.assinatura.findFirst({
          where: { userId: pUserId, status: 'approved', expiraEm: { gt: agora } },
          orderBy: { expiraEm: 'desc' },
        });
        return res.json({ ativo: true, assinatura });
      }
    }

    res.json({ ativo: false });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
