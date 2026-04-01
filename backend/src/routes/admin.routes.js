import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cronQueue } from '../workers/queue.js';

const prisma = new PrismaClient();
const router = Router();

function requireSuperAdmin(req, res, next) {
  if (req.userRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ erro: 'Acesso restrito ao Super Admin.' });
  }
  next();
}

// GET /api/admin/stats
router.get('/api/admin/stats', requireSuperAdmin, async (req, res) => {
  try {
    const [totalClientes, clientesAtivos, totalContas, totalSubUsuarios] = await Promise.all([
      prisma.user.count({ where: { parentUserId: null, role: { not: 'SUPER_ADMIN' } } }),
      prisma.user.count({ where: { parentUserId: null, role: { not: 'SUPER_ADMIN' }, ativo: true } }),
      prisma.contaML.count(),
      prisma.user.count({ where: { parentUserId: { not: null } } }),
    ]);
    res.json({ totalClientes, clientesAtivos, totalContas, totalSubUsuarios });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/admin/usuarios
router.get('/api/admin/usuarios', requireSuperAdmin, async (req, res) => {
  try {
    const usuarios = await prisma.user.findMany({
      where: { parentUserId: null, role: { not: 'SUPER_ADMIN' } },
      select: {
        id: true,
        email: true,
        role: true,
        ativo: true,
        acessoLivre: true,
        featureFlags: true,
        resourceFlags: true,
        createdAt: true,
        suporteAtivo: true,
        _count: { select: { subUsuarios: true, contasMl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/admin/usuarios/:id
router.put('/api/admin/usuarios/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.actualUserId) {
      return res.status(400).json({ erro: 'Você não pode alterar seu próprio usuário pelo painel admin.' });
    }
    const { role, ativo, featureFlags, resourceFlags } = req.body;
    const data = {};
    if (role !== undefined) {
      if (!['OWNER', 'SUPPORT'].includes(role)) return res.status(400).json({ erro: 'Role inválido.' });
      data.role = role;
    }
    if (ativo !== undefined) data.ativo = ativo;
    if (featureFlags !== undefined) data.featureFlags = featureFlags;
    if (resourceFlags !== undefined) data.resourceFlags = resourceFlags;
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, role: true, ativo: true, featureFlags: true, resourceFlags: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/admin/usuarios/:id/senha
router.put('/api/admin/usuarios/:id/senha', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.actualUserId) {
      return res.status(400).json({ erro: 'Use as configurações de perfil para alterar sua própria senha.' });
    }
    const { novaSenha } = req.body;
    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    const hash = await bcrypt.hash(novaSenha, 10);
    await prisma.user.update({ where: { id }, data: { senha: hash } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/admin/config-padrao — lê os defaults aplicados a novos cadastros
router.get('/api/admin/config-padrao', requireSuperAdmin, async (req, res) => {
  try {
    const config = await prisma.configGlobal.findUnique({ where: { id: 'global' } });
    res.json({
      defaultFeatureFlags: config?.defaultFeatureFlags || {},
      defaultResourceFlags: config?.defaultResourceFlags || {},
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/admin/config-padrao — salva os defaults para novos cadastros
router.put('/api/admin/config-padrao', requireSuperAdmin, async (req, res) => {
  try {
    const { defaultFeatureFlags, defaultResourceFlags } = req.body;
    if (typeof defaultFeatureFlags !== 'object' || Array.isArray(defaultFeatureFlags)) {
      return res.status(400).json({ erro: 'defaultFeatureFlags deve ser um objeto.' });
    }
    if (typeof defaultResourceFlags !== 'object' || Array.isArray(defaultResourceFlags)) {
      return res.status(400).json({ erro: 'defaultResourceFlags deve ser um objeto.' });
    }
    const config = await prisma.configGlobal.upsert({
      where: { id: 'global' },
      update: {
        defaultFeatureFlags: Object.keys(defaultFeatureFlags).length ? defaultFeatureFlags : null,
        defaultResourceFlags: Object.keys(defaultResourceFlags).length ? defaultResourceFlags : null,
      },
      create: {
        id: 'global',
        defaultFeatureFlags: Object.keys(defaultFeatureFlags).length ? defaultFeatureFlags : null,
        defaultResourceFlags: Object.keys(defaultResourceFlags).length ? defaultResourceFlags : null,
      },
    });
    res.json({
      defaultFeatureFlags: config.defaultFeatureFlags || {},
      defaultResourceFlags: config.defaultResourceFlags || {},
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/admin/impersonar/:userId
router.post('/api/admin/impersonar/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, ativo: true, featureFlags: true, resourceFlags: true, parentUserId: true },
    });
    if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!user.ativo) return res.status(400).json({ erro: 'Conta bloqueada.' });
    if (user.parentUserId) return res.status(400).json({ erro: 'Só é possível impersonar contas principais.' });

    const expiraEm = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const sessao = await prisma.sessaoSuporte.create({
      data: { suporteUserId: req.actualUserId, targetUserId: userId, expiraEm, ativa: true },
    });

    const token = jwt.sign(
      {
        userId: req.actualUserId,
        role: 'SUPER_ADMIN',
        isImpersonating: true,
        isSuperAdminImpersonating: true,
        targetUserId: userId,
        sessaoId: sessao.id,
      },
      process.env.JWT_SECRET || 'changeme_secret',
      { expiresIn: '8h' }
    );

    res.json({ token, sessaoId: sessao.id, targetUser: user, expiraEm });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── Agendador de Tarefas ──────────────────────────────────────────────────────

// Mapa de labels amigáveis para os jobs
const JOB_LABELS = {
  'varredura-diaria': {
    label: 'Varredura Diária',
    descricao: 'Sincroniza todos os anúncios ML e produtos Tiny de todos os clientes',
  },
  'atualizar-concorrentes': {
    label: 'Atualizar Preços de Concorrentes',
    descricao: 'Consulta o ML e atualiza os preços de todos os concorrentes monitorados (padrão: a cada 6h)',
  },
};

// GET /api/admin/agendamentos
router.get('/api/admin/agendamentos', requireSuperAdmin, async (req, res) => {
  try {
    const repeatable = await cronQueue.getRepeatableJobs();

    // Últimas 10 execuções (completed + failed)
    const [completados, falhados] = await Promise.all([
      cronQueue.getJobs(['completed'], 0, 5),
      cronQueue.getJobs(['failed'], 0, 5),
    ]);

    const historico = [...completados, ...falhados]
      .sort((a, b) => (b.finishedOn || 0) - (a.finishedOn || 0))
      .slice(0, 10)
      .map(j => ({
        id: j.id,
        name: j.name,
        status: j.failedReason ? 'failed' : 'completed',
        finishedOn: j.finishedOn,
        failedReason: j.failedReason || null,
        returnvalue: j.returnvalue || null,
      }));

    const agendamentos = repeatable.map(j => ({
      key: j.key,
      name: j.name,
      label: JOB_LABELS[j.name]?.label || j.name,
      descricao: JOB_LABELS[j.name]?.descricao || '',
      cron: j.cron,
      tz: j.tz || 'America/Sao_Paulo',
      next: j.next,
    }));

    res.json({ agendamentos, historico });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/admin/agendamentos/cron — altera o horário de um job
router.put('/api/admin/agendamentos/cron', requireSuperAdmin, async (req, res) => {
  try {
    const { jobKey, jobName, newCron, tz = 'America/Sao_Paulo' } = req.body;
    if (!jobKey || !newCron) return res.status(400).json({ erro: 'jobKey e newCron são obrigatórios.' });

    // Remove o job repetível antigo
    await cronQueue.removeRepeatableByKey(jobKey);

    // Re-adiciona com o novo horário
    await cronQueue.add(
      jobName || 'varredura-diaria',
      {},
      {
        jobId: `${jobName || 'varredura-diaria'}-cron`,
        repeat: { cron: newCron, tz },
      }
    );

    const repeatable = await cronQueue.getRepeatableJobs();
    const agendamentos = repeatable.map(j => ({
      key: j.key,
      name: j.name,
      label: JOB_LABELS[j.name]?.label || j.name,
      descricao: JOB_LABELS[j.name]?.descricao || '',
      cron: j.cron,
      tz: j.tz || 'America/Sao_Paulo',
      next: j.next,
    }));

    res.json({ ok: true, agendamentos });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/admin/agendamentos/executar — dispara o job imediatamente
router.post('/api/admin/agendamentos/executar', requireSuperAdmin, async (req, res) => {
  try {
    const { jobName = 'varredura-diaria' } = req.body;
    const job = await cronQueue.add(jobName, {}, { attempts: 1 });
    res.json({ ok: true, jobId: job.id, message: `Job "${jobName}" enfileirado com sucesso.` });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── Configuração de Assinatura ────────────────────────────────────────────────

// POST /api/admin/criar-usuario
router.post('/api/admin/criar-usuario', requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, acessoLivre = false } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ erro: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' });
    }
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const configGlobal = await prisma.configGlobal.findUnique({ where: { id: 'global' } });
    const defaultFeatureFlags = configGlobal?.defaultFeatureFlags && Object.keys(configGlobal.defaultFeatureFlags).length ? configGlobal.defaultFeatureFlags : null;
    const defaultResourceFlags = configGlobal?.defaultResourceFlags && Object.keys(configGlobal.defaultResourceFlags).length ? configGlobal.defaultResourceFlags : null;

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, senha: hash, acessoLivre, featureFlags: defaultFeatureFlags, resourceFlags: defaultResourceFlags },
      select: { id: true, email: true, role: true, ativo: true, acessoLivre: true, featureFlags: true, resourceFlags: true, createdAt: true, _count: { select: { subUsuarios: true, contasMl: true } } },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/admin/config-assinatura
router.get('/api/admin/config-assinatura', requireSuperAdmin, async (req, res) => {
  try {
    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    res.json({
      precoMensal: config?.precoMensal ?? 299,
      mpAccessToken: config?.mpAccessToken ?? '',
      mpPublicKey: config?.mpPublicKey ?? '',
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/admin/config-assinatura
router.put('/api/admin/config-assinatura', requireSuperAdmin, async (req, res) => {
  try {
    const { precoMensal, mpAccessToken, mpPublicKey } = req.body;
    const data = {};
    if (precoMensal !== undefined) {
      const preco = parseFloat(precoMensal);
      if (isNaN(preco) || preco <= 0) return res.status(400).json({ erro: 'Preço inválido.' });
      data.precoMensal = preco;
    }
    if (mpAccessToken !== undefined) data.mpAccessToken = mpAccessToken;
    if (mpPublicKey !== undefined) data.mpPublicKey = mpPublicKey;

    const config = await prisma.configAssinatura.upsert({
      where: { id: 'global' },
      update: data,
      create: { id: 'global', precoMensal: data.precoMensal ?? 299, ...data },
    });
    res.json({ precoMensal: config.precoMensal, mpAccessToken: config.mpAccessToken, mpPublicKey: config.mpPublicKey });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/admin/usuarios/:id/acesso-livre
router.put('/api/admin/usuarios/:id/acesso-livre', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { acessoLivre } = req.body;
    if (typeof acessoLivre !== 'boolean') return res.status(400).json({ erro: 'acessoLivre deve ser boolean.' });
    const user = await prisma.user.update({
      where: { id },
      data: { acessoLivre },
      select: { id: true, email: true, acessoLivre: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/admin/assinaturas  — lista todas assinaturas
router.get('/api/admin/assinaturas', requireSuperAdmin, async (req, res) => {
  try {
    const assinaturas = await prisma.assinatura.findMany({
      include: { user: { select: { id: true, email: true, acessoLivre: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(assinaturas);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
