import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma.js';

const router = Router();

const INVITE_CODE = '4x4@Gama';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';
const JWT_EXPIRES = '7d';

function gerarToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      parentUserId: user.parentUserId || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function createMailTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// 1. REGISTRAR
router.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ erro: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' });
  }

  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    // Aplica flags padrão definidas pelo Super Admin para novos cadastros
    const configGlobal = await prisma.configGlobal.findUnique({ where: { id: 'global' } });
    const defaultFeatureFlags =
      configGlobal?.defaultFeatureFlags && Object.keys(configGlobal.defaultFeatureFlags).length
        ? configGlobal.defaultFeatureFlags
        : null;
    const defaultResourceFlags =
      configGlobal?.defaultResourceFlags && Object.keys(configGlobal.defaultResourceFlags).length
        ? configGlobal.defaultResourceFlags
        : null;

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        senha: hash,
        featureFlags: defaultFeatureFlags,
        resourceFlags: defaultResourceFlags,
      },
    });

    res.status(201).json({ id: user.id, email: user.email });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 2. LOGIN
router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    if (!user.ativo) return res.status(403).json({ erro: 'Usuário desativado. Contate o administrador.' });

    let valid = await bcrypt.compare(password, user.senha);

    // Migração: usuários com senha em texto puro (legado)
    if (!valid && user.senha === password) {
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: user.id }, data: { senha: hash } });
      valid = true;
    }

    if (!valid) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const token = gerarToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        parentUserId: user.parentUserId,
        tinyConectado: !!user.tinyAccessToken,
        featureFlags: user.featureFlags || null,
        resourceFlags: user.resourceFlags || null,
        permissoesCustom: user.permissoesCustom || null,
      },
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 3. ESQUECI MINHA SENHA
router.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.json({ mensagem: 'Se o e-mail estiver cadastrado, você receberá as instruções.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}?resetToken=${token}`;

    const transporter = createMailTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Redefinição de senha',
      html: `
        <p>Você solicitou a redefinição de senha.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>Se não foi você, ignore este e-mail.</p>
      `,
    });

    res.json({ mensagem: 'Se o e-mail estiver cadastrado, você receberá as instruções.' });
  } catch (error) {
    console.error('Erro ao enviar e-mail de reset:', error.message);
    res.status(500).json({ erro: 'Erro ao enviar e-mail. Verifique as configurações de SMTP.' });
  }
});

// 4. RESETAR SENHA
router.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ erro: 'Token e senha (mínimo 6 caracteres) são obrigatórios.' });
  }
  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) return res.status(400).json({ erro: 'Token inválido ou expirado.' });

    const hash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { senha: hash, passwordResetToken: null, passwordResetExpires: null },
    });

    res.json({ mensagem: 'Senha redefinida com sucesso.' });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});


// 5. BUSCAR CONFIGURAÇÕES DO USUÁRIO
router.get('/api/usuario/:id/config', async (req, res) => {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { contasMl: true, regras: true, configAtacado: true }
    });

    if (!user) {
      return res.status(404).json({ erro: 'Usuário não encontrado. Faça logout.' });
    }

    const contasFormatadas = user.contasMl.map(c => ({
      ...c,
      expiresAt: Number(c.expiresAt),
      envioSuportado: c.logistica || 'ME2'
    }));

    res.json({
      tinyConectado: !!user.tinyAccessToken,
      tinyPlano: user.tinyPlano || 'descontinuado',
      tinyClientId: user.tinyClientId || null,
      tinyClientSecret: user.tinyClientSecret || null,
      cepOrigem: user.cepOrigem || '01001000',
      contasML: contasFormatadas,
      regrasPreco: user.regras,
      configAtacado: user.configAtacado || null,
      imgurClientId: user.imgurClientId || null,
      imgurClientSecret: user.imgurClientSecret || null,
      removeBgApiKey: user.removeBgApiKey || null,
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});


// 5b. SALVAR REGRA POR CONTA ML
router.post('/api/usuario/:id/contas-ml/regras', async (req, res) => {
  try {
    const userId = req.userId;
    const { mapa } = req.body; // { [contaId]: regraId | null }
    if (!mapa || typeof mapa !== 'object') {
      return res.status(400).json({ erro: 'Parâmetro "mapa" inválido.' });
    }
    const updates = Object.entries(mapa).map(([contaId, regraId]) =>
      prisma.contaML.updateMany({
        where: { id: contaId, userId },
        data: { regraPrecoId: regraId || null },
      })
    );
    await Promise.all(updates);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 6. SALVAR CREDENCIAIS DO TINY (client_id e client_secret por usuário)
router.post('/api/usuario/:id/tiny-credentials', async (req, res) => {
  try {
    const userId = req.userId;
    const { tinyClientId, tinyClientSecret } = req.body;
    if (!tinyClientId || !tinyClientSecret) {
      return res.status(400).json({ erro: 'tinyClientId e tinyClientSecret são obrigatórios.' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { tinyClientId, tinyClientSecret },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 6b. SALVAR PLANO DO TINY (rate limit)
router.post('/api/usuario/:id/tiny-plano', async (req, res) => {
  try {
    const userId = req.userId;
    await prisma.user.update({
      where: { id: userId },
      data: { tinyPlano: req.body.tinyPlano || 'descontinuado' }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 7. SALVAR/ATUALIZAR CONTA ML
router.post('/api/usuario/:id/contas-ml', async (req, res) => {
  try {
    const userId = req.userId;
    const { id, nickname, accessToken, refreshToken, expiresAt, envioSuportado } = req.body;
    const logisticaReal = envioSuportado || 'ME2';

    const conta = await prisma.contaML.upsert({
      where: { id: String(id) },
      update: { userId, accessToken, refreshToken, expiresAt: BigInt(expiresAt), nickname, logistica: logisticaReal },
      create: { id: String(id), userId, nickname, accessToken, refreshToken, expiresAt: BigInt(expiresAt), logistica: logisticaReal }
    });

    res.json({ ...conta, expiresAt: Number(conta.expiresAt), envioSuportado: conta.logistica });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 8. EXCLUIR CONTA ML
router.delete('/api/usuario/:id/contas-ml/:contaId', async (req, res) => {
  try {
    await prisma.contaML.delete({ where: { id: req.params.contaId } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 9. SALVAR/ATUALIZAR REGRA
router.post('/api/usuario/:id/regras', async (req, res) => {
  try {
    const userId = req.userId;
    const { id, nome, precoBase, variaveis, variacoesPorConta } = req.body;
    const regraId = id || undefined;

    const existe = regraId ? await prisma.regraPreco.findUnique({ where: { id: regraId } }) : null;

    if (existe) {
      const regra = await prisma.regraPreco.update({
        where: { id: regraId },
        data: { nome, precoBase, variaveis, variacoesPorConta: variacoesPorConta ?? null }
      });
      return res.json(regra);
    } else {
      const regra = await prisma.regraPreco.create({
        data: { userId, nome, precoBase, variaveis, variacoesPorConta: variacoesPorConta ?? null }
      });
      return res.json(regra);
    }
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 10. EXCLUIR REGRA
router.delete('/api/usuario/:id/regras/:regraId', async (req, res) => {
  try {
    await prisma.regraPreco.delete({ where: { id: req.params.regraId } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 11. BUSCAR CONFIG DE ATACADO
router.get('/api/usuario/:id/config-atacado', async (req, res) => {
  try {
    const config = await prisma.configAtacado.findUnique({ where: { userId: req.userId } });
    res.json(config || { ativo: false, faixas: [] });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 12. SALVAR CONFIG DE ATACADO
router.post('/api/usuario/:id/config-atacado', async (req, res) => {
  try {
    const userId = req.userId;
    const { ativo, faixas } = req.body;
    const config = await prisma.configAtacado.upsert({
      where: { userId },
      update: { ativo: !!ativo, faixas: faixas || [] },
      create: { userId, ativo: !!ativo, faixas: faixas || [] }
    });
    res.json(config);
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// CARREGAR VERIFICAÇÃO DE PREÇO SALVA
router.get('/api/usuario/:id/verificacao-preco', async (req, res) => {
  try {
    const registro = await prisma.verificacaoPreco.findUnique({
      where: { userId: req.userId }
    });
    res.json({ resultados: registro?.resultados || {} });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 13. SALVAR CEP DE ORIGEM
router.post('/api/usuario/:id/cep-origem', async (req, res) => {
  try {
    const { cepOrigem } = req.body;
    if (!cepOrigem || !/^\d{8}$/.test(cepOrigem.replace(/\D/g, ''))) {
      return res.status(400).json({ erro: 'CEP inválido. Informe 8 dígitos.' });
    }
    await prisma.user.update({
      where: { id: req.userId },
      data: { cepOrigem: cepOrigem.replace(/\D/g, '') }
    });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 14. SALVAR VERIFICAÇÃO DE PREÇO
router.post('/api/usuario/:id/verificacao-preco', async (req, res) => {
  try {
    const userId = req.userId;
    const { resultados } = req.body;
    await prisma.verificacaoPreco.upsert({
      where: { userId },
      update: { resultados },
      create: { userId, resultados }
    });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 15. SALVAR CREDENCIAIS DO IMGUR
router.post('/api/usuario/:id/integracoes/imgur', async (req, res) => {
  try {
    const { imgurClientId, imgurClientSecret } = req.body;
    if (!imgurClientId || !imgurClientId.trim()) {
      return res.status(400).json({ erro: 'Client ID do Imgur é obrigatório.' });
    }
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        imgurClientId: imgurClientId.trim(),
        imgurClientSecret: imgurClientSecret ? imgurClientSecret.trim() : null,
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 16. SALVAR API KEY DO REMOVE.BG
router.post('/api/usuario/:id/integracoes/removebg', async (req, res) => {
  try {
    const { removeBgApiKey } = req.body;
    if (!removeBgApiKey || !removeBgApiKey.trim()) {
      return res.status(400).json({ erro: 'API Key do Remove.bg é obrigatória.' });
    }
    await prisma.user.update({
      where: { id: req.userId },
      data: { removeBgApiKey: removeBgApiKey.trim() }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 17. UPLOAD DE IMAGEM NO IMGUR
router.post('/api/usuario/:id/imgur/upload', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { imgurClientId: true } });
    if (!user?.imgurClientId) {
      return res.status(400).json({ erro: 'Client ID do Imgur não configurado. Acesse Configurações > Imgur.' });
    }

    const { image } = req.body;
    if (!image) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

    const response = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        Authorization: `Client-ID ${user.imgurClientId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image, type: 'base64' }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return res.status(502).json({ erro: data?.data?.error || 'Falha ao fazer upload no Imgur.' });
    }

    res.json({ url: data.data.link });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 18. REMOVER FUNDO COM REMOVE.BG
router.post('/api/usuario/:id/imagem/remover-fundo', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { removeBgApiKey: true },
    });

    if (!user?.removeBgApiKey) {
      return res.status(400).json({ erro: 'API Key do Remove.bg não configurada. Acesse Configurações > Integrações.' });
    }

    const { imageBase64, imageUrl } = req.body;
    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ erro: 'Forneça imageBase64 ou imageUrl.' });
    }

    const form = new FormData();
    if (imageBase64) {
      form.append('image_file_b64', imageBase64);
    } else {
      form.append('image_url', imageUrl);
    }
    form.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': user.removeBgApiKey },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `Remove.bg retornou status ${response.status}`;
      try { errMsg = JSON.parse(errText)?.errors?.[0]?.title || errMsg; } catch (_) {}
      return res.status(502).json({ erro: errMsg });
    }

    const buffer = await response.arrayBuffer();
    const pngBase64 = Buffer.from(buffer).toString('base64');
    res.json({ pngBase64 });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ================================================================
// SUB-USUÁRIOS (apenas OWNER pode gerenciar)
// ================================================================

// Listar sub-usuários
router.get('/api/sub-usuarios', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Apenas o dono da conta pode gerenciar sub-usuários.' });
    }
    const subs = await prisma.user.findMany({
      where: { parentUserId: req.userId },
      select: { id: true, email: true, role: true, ativo: true, permissoesCustom: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(subs);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Criar sub-usuário
router.post('/api/sub-usuarios', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Apenas o dono da conta pode criar sub-usuários.' });
    }
    const { email, password, role, permissoesCustom } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ erro: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' });
    }
    if (!['OPERATOR', 'VIEWER'].includes(role)) {
      return res.status(400).json({ erro: 'Perfil inválido. Use OPERATOR ou VIEWER.' });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(password, 10);
    const sub = await prisma.user.create({
      data: {
        email,
        senha: hash,
        role,
        parentUserId: req.userId,
        permissoesCustom: permissoesCustom || null,
      },
      select: { id: true, email: true, role: true, ativo: true, permissoesCustom: true, createdAt: true },
    });

    res.status(201).json(sub);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Atualizar sub-usuário (role, permissões, ativo)
router.put('/api/sub-usuarios/:subId', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Apenas o dono da conta pode editar sub-usuários.' });
    }

    const sub = await prisma.user.findFirst({
      where: { id: req.params.subId, parentUserId: req.userId },
    });
    if (!sub) return res.status(404).json({ erro: 'Sub-usuário não encontrado.' });

    const { role, ativo, permissoesCustom, password } = req.body;
    const data = {};
    if (role !== undefined) {
      if (!['OPERATOR', 'VIEWER'].includes(role)) {
        return res.status(400).json({ erro: 'Perfil inválido.' });
      }
      data.role = role;
    }
    if (ativo !== undefined) data.ativo = ativo;
    if (permissoesCustom !== undefined) data.permissoesCustom = permissoesCustom;
    if (password) {
      if (password.length < 6) return res.status(400).json({ erro: 'Senha mínima de 6 caracteres.' });
      data.senha = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: req.params.subId },
      data,
      select: { id: true, email: true, role: true, ativo: true, permissoesCustom: true, createdAt: true },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Excluir sub-usuário
router.delete('/api/sub-usuarios/:subId', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Apenas o dono da conta pode remover sub-usuários.' });
    }

    const sub = await prisma.user.findFirst({
      where: { id: req.params.subId, parentUserId: req.userId },
    });
    if (!sub) return res.status(404).json({ erro: 'Sub-usuário não encontrado.' });

    await prisma.user.delete({ where: { id: req.params.subId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ================================================================
// TOGGLE ACESSO DE SUPORTE
// ================================================================
router.put('/api/usuario/suporte-toggle', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Apenas o dono da conta pode gerenciar o acesso de suporte.' });
    }
    const { ativo } = req.body;
    const expira = ativo ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { suporteAtivo: !!ativo, suporteExpira: expira },
      select: { suporteAtivo: true, suporteExpira: true },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Buscar status do suporte
router.get('/api/usuario/suporte-status', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { suporteAtivo: true, suporteExpira: true },
    });
    // Auto-expirar se passou da data
    if (user?.suporteAtivo && user.suporteExpira && user.suporteExpira < new Date()) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { suporteAtivo: false, suporteExpira: null },
      });
      return res.json({ suporteAtivo: false, suporteExpira: null });
    }
    res.json(user || { suporteAtivo: false, suporteExpira: null });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;
