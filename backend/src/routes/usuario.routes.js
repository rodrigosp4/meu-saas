import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma.js';

const router = Router();

const INVITE_CODE = '4x4@Gama';

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

// 1. REGISTRAR (com convite)
router.post('/api/register', async (req, res) => {
  const { email, password, inviteCode } = req.body;

  if (inviteCode !== INVITE_CODE) {
    return res.status(403).json({ erro: 'Código de convite inválido.' });
  }
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ erro: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' });
  }

  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, senha: hash } });

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

    let valid = await bcrypt.compare(password, user.senha);

    // Migração: usuários com senha em texto puro (legado)
    if (!valid && user.senha === password) {
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: user.id }, data: { senha: hash } });
      valid = true;
    }

    if (!valid) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    res.json({ id: user.id, email: user.email, tinyToken: user.tinyToken });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 3. ESQUECI MINHA SENHA
router.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Resposta genérica para não revelar se e-mail existe
    if (!user) return res.json({ mensagem: 'Se o e-mail estiver cadastrado, você receberá as instruções.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

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
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { contasMl: true, regras: true }
    });

    // 👇 ADICIONE ESTAS 3 LINHAS PARA EVITAR O ERRO 500
    if (!user) {
      return res.status(404).json({ erro: 'Usuário não encontrado. Faça logout.' });
    }

    const contasFormatadas = user.contasMl.map(c => ({
      ...c,
      expiresAt: Number(c.expiresAt),
      envioSuportado: c.logistica || 'ME2'
    }));

    res.json({ tinyToken: user.tinyToken, contasML: contasFormatadas, regrasPreco: user.regras });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});


// 6. SALVAR TOKEN DO TINY
router.post('/api/usuario/:id/tiny', async (req, res) => {
  try {
    // Verifica se o usuário realmente existe antes de atualizar
    const userExists = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!userExists) {
      return res.status(404).json({ erro: 'Usuário não encontrado. Faça logout e entre novamente.' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { tinyToken: req.body.tinyToken }
    });
    res.json({ success: true });
  } catch (error) { 
    res.status(500).json({ erro: error.message }); 
  }
});

// 7. SALVAR/ATUALIZAR CONTA ML
router.post('/api/usuario/:id/contas-ml', async (req, res) => {
  try {
    const { id, nickname, accessToken, refreshToken, expiresAt, envioSuportado } = req.body;
    const logisticaReal = envioSuportado || 'ME2';

    const userExists = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!userExists) {
      return res.status(404).json({ erro: 'Usuário não encontrado. Faça logout e entre novamente.' });
    }

    const conta = await prisma.contaML.upsert({
      where: { id: String(id) },
      // 👇 AQUI: Adicionado userId: req.params.id no update
      update: { userId: req.params.id, accessToken, refreshToken, expiresAt: BigInt(expiresAt), nickname, logistica: logisticaReal },
      create: { id: String(id), userId: req.params.id, nickname, accessToken, refreshToken, expiresAt: BigInt(expiresAt), logistica: logisticaReal }
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
    // Verifica se o usuário realmente existe antes de criar relações
    const userExists = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!userExists) {
      return res.status(404).json({ erro: 'Usuário não encontrado. Faça logout e entre novamente.' });
    }

    const { id, nome, precoBase, variaveis } = req.body;
    const regraId = id || undefined;

    const existe = regraId ? await prisma.regraPreco.findUnique({ where: { id: regraId }}) : null;

    if (existe) {
      const regra = await prisma.regraPreco.update({
        where: { id: regraId },
        data: { nome, precoBase, variaveis }
      });
      return res.json(regra);
    } else {
      const regra = await prisma.regraPreco.create({
        data: { userId: req.params.id, nome, precoBase, variaveis }
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

// 11. CARREGAR VERIFICAÇÃO DE PREÇO SALVA
router.get('/api/usuario/:id/verificacao-preco', async (req, res) => {
  try {
    const registro = await prisma.verificacaoPreco.findUnique({
      where: { userId: req.params.id }
    });
    res.json({ resultados: registro?.resultados || {} });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 12. SALVAR VERIFICAÇÃO DE PREÇO
router.post('/api/usuario/:id/verificacao-preco', async (req, res) => {
  try {
    const { resultados } = req.body;
    await prisma.verificacaoPreco.upsert({
      where: { userId: req.params.id },
      update: { resultados },
      create: { userId: req.params.id, resultados }
    });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

export default router;
