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

function calcularValor(precoMensal, planoKey, precoOperador = 0, numOperadores = 0) {
  const plano = PLANOS[planoKey];
  if (!plano) throw new Error('Plano inválido');
  const precoBase = precoMensal + precoOperador * numOperadores;
  return parseFloat((precoBase * plano.meses * (1 - plano.desconto)).toFixed(2));
}

async function contarOperadores(userId) {
  return prisma.user.count({
    where: { parentUserId: userId, role: 'OPERATOR', ativo: true },
  });
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

// Valida um cupom e retorna os dados ou lança erro
async function validarCupom(codigo, userId) {
  const cupom = await prisma.cupom.findUnique({ where: { codigo: codigo.toUpperCase() } });
  if (!cupom) throw new Error('Cupom não encontrado.');
  if (!cupom.ativo) throw new Error('Este cupom não está mais ativo.');
  if (cupom.expiraEm && new Date(cupom.expiraEm) < new Date()) throw new Error('Este cupom está expirado.');
  if (cupom.usoMaximo !== null && cupom.usoAtual >= cupom.usoMaximo) throw new Error('Este cupom atingiu o limite de usos.');

  const jaUsou = await prisma.cupomResgate.findUnique({ where: { cupomId_userId: { cupomId: cupom.id, userId } } });
  if (jaUsou) throw new Error('Você já utilizou este cupom.');

  return cupom;
}

// Aplica desconto do cupom sobre o valor base
function aplicarDesconto(valorBase, cupom) {
  if (cupom.tipo === 'percentual') {
    return parseFloat((valorBase * (1 - cupom.valor / 100)).toFixed(2));
  }
  if (cupom.tipo === 'fixo') {
    return Math.max(0, parseFloat((valorBase - cupom.valor).toFixed(2)));
  }
  // dias_gratis: sem cobrança
  return 0;
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
      const configAtiva = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
      return res.json({
        ativo: true,
        motivo: 'assinatura',
        assinatura,
        precoOperador: configAtiva?.precoOperador ?? 50,
      });
    }

    // Última assinatura (pendente ou expirada)
    const ultimaAssinatura = await prisma.assinatura.findFirst({
      where: { userId: userPai.id },
      orderBy: { createdAt: 'desc' },
    });

    // Busca config para mostrar preços
    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    const precoMensal = config?.precoMensal ?? 299;
    const precoOperador = config?.precoOperador ?? 50;
    const numOperadores = await contarOperadores(userPai.id);
    const planos = Object.entries(PLANOS).map(([key, p]) => ({
      key,
      label: p.label,
      dias: p.dias,
      desconto: p.desconto,
      valor: calcularValor(precoMensal, key, precoOperador, numOperadores),
    }));

    return res.json({
      ativo: false,
      motivo: 'sem_assinatura',
      assinatura: ultimaAssinatura,
      planos,
      mpPublicKey: config?.mpPublicKey || null,
      numOperadores,
      precoOperador,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/assinatura/validar-cupom
router.post('/api/assinatura/validar-cupom', async (req, res) => {
  try {
    const { codigo, planoKey } = req.body;
    if (!codigo) return res.status(400).json({ erro: 'Código do cupom é obrigatório.' });
    if (!PLANOS[planoKey]) return res.status(400).json({ erro: 'Plano inválido.' });

    const userId = req.userId;
    const userPai = await resolverUserPai(userId);
    if (!userPai) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const cupom = await validarCupom(codigo, userPai.id);

    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    const precoMensal = config?.precoMensal ?? 299;
    const precoOperador = config?.precoOperador ?? 50;
    const numOperadores = await contarOperadores(userPai.id);
    const valorBase = calcularValor(precoMensal, planoKey, precoOperador, numOperadores);
    const valorFinal = aplicarDesconto(valorBase, cupom);

    return res.json({
      valido: true,
      cupom: {
        id: cupom.id,
        codigo: cupom.codigo,
        tipo: cupom.tipo,
        valor: cupom.valor,
        descricao: cupom.descricao,
      },
      valorBase,
      valorFinal,
      diasGratis: cupom.tipo === 'dias_gratis' ? cupom.valor : null,
    });
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }
});

// POST /api/assinatura/criar-preferencia
router.post('/api/assinatura/criar-preferencia', async (req, res) => {
  try {
    const { planoKey, cupomCodigo } = req.body;
    if (!PLANOS[planoKey]) return res.status(400).json({ erro: 'Plano inválido.' });

    const userId = req.userId;
    const userPai = await resolverUserPai(userId);
    if (!userPai) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    const precoMensal = config?.precoMensal ?? 299;
    const precoOperador = config?.precoOperador ?? 50;
    const numOperadores = await contarOperadores(userPai.id);
    let valor = calcularValor(precoMensal, planoKey, precoOperador, numOperadores);
    const plano = PLANOS[planoKey];

    let cupom = null;
    if (cupomCodigo) {
      cupom = await validarCupom(cupomCodigo, userPai.id);
      valor = aplicarDesconto(valor, cupom);
    }

    // Cupom de dias grátis: libera acesso sem pagamento
    if (cupom && cupom.tipo === 'dias_gratis') {
      const agora = new Date();
      const expiraEm = new Date(agora.getTime() + cupom.valor * 24 * 60 * 60 * 1000);

      const assinatura = await prisma.assinatura.create({
        data: {
          userId: userPai.id,
          plano: planoKey,
          valor: 0,
          status: 'approved',
          iniciaEm: agora,
          expiraEm,
          cupomId: cupom.id,
        },
      });

      await prisma.$transaction([
        prisma.cupomResgate.create({
          data: { cupomId: cupom.id, userId: userPai.id, assinaturaId: assinatura.id },
        }),
        prisma.cupom.update({
          where: { id: cupom.id },
          data: { usoAtual: { increment: 1 } },
        }),
      ]);

      return res.json({ gratis: true, assinaturaId: assinatura.id });
    }

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
        external_reference: `${userPai.id}:${planoKey}${cupom ? `:${cupom.id}` : ''}`,
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
        cupomId: cupom?.id || null,
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

    // Pagamento de operador: "op:parentId:subId"
    if (payment.external_reference.startsWith('op:')) {
      if (payment.status === 'approved') {
        const parts = payment.external_reference.split(':');
        const subId = parts[2];
        if (subId) {
          await prisma.user.updateMany({
            where: { id: subId, ativo: false },
            data: { ativo: true },
          });
        }
      }
      return res.sendStatus(200);
    }

    // external_reference pode ser "userId:planoKey" ou "userId:planoKey:cupomId"
    const parts = payment.external_reference.split(':');
    const userId = parts[0];
    const planoKey = parts[1];
    const cupomId = parts[2] || null;
    if (!userId || !planoKey) return res.sendStatus(200);

    const status = payment.status; // 'approved', 'pending', 'rejected', etc.

    if (status === 'approved') {
      const plano = PLANOS[planoKey];
      const agora = new Date();
      const expiraEm = new Date(agora.getTime() + plano.dias * 24 * 60 * 60 * 1000);

      // Atualiza ou cria a assinatura como aprovada
      const updated = await prisma.assinatura.updateMany({
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
        const numOps2 = await contarOperadores(userId);
        await prisma.assinatura.create({
          data: {
            userId,
            plano: planoKey,
            valor: calcularValor(config2?.precoMensal ?? 299, planoKey, config2?.precoOperador ?? 50, numOps2),
            status: 'approved',
            mpPaymentId: String(payment.id),
            mpPreferenceId: payment.preference_id,
            iniciaEm: agora,
            expiraEm,
            cupomId: cupomId || null,
          },
        });
      }

      // Registra resgate do cupom (se houver) — ignora duplicata silenciosamente
      if (cupomId) {
        try {
          const assinaturaAprovada = await prisma.assinatura.findFirst({
            where: { userId, mpPaymentId: String(payment.id) },
          });
          await prisma.$transaction([
            prisma.cupomResgate.upsert({
              where: { cupomId_userId: { cupomId, userId } },
              create: { cupomId, userId, assinaturaId: assinaturaAprovada?.id },
              update: {},
            }),
            prisma.cupom.update({
              where: { id: cupomId },
              data: { usoAtual: { increment: updated.count > 0 ? 1 : 0 } },
            }),
          ]);
        } catch {
          // não bloqueia o webhook por isso
        }
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
      const parts = payment.external_reference.split(':');
      const pUserId = parts[0];
      const planoKey = parts[1];
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
