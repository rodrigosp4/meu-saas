import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import prisma from '../config/prisma.js';
import { enviarEmail } from '../services/email.service.js';

const router = Router();

const INVITE_CODE = '4x4@Gama';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

function gerarToken(user, sessionId) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      parentUserId: user.parentUserId || null,
      sessionId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
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

    // Envia e-mail de boas-vindas (não bloqueia o cadastro em caso de falha)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    enviarEmail('welcome', email, { nome: email, email, link: frontendUrl }).catch(err =>
      console.error('[email] Erro ao enviar boas-vindas:', err.message)
    );

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

    // Gera novo sessionId — invalida qualquer sessão ativa em outro dispositivo
    const sessionId = crypto.randomUUID();
    await prisma.user.update({ where: { id: user.id }, data: { activeSessionId: sessionId } });

    const token = gerarToken(user, sessionId);

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

    await enviarEmail('reset-password', email, { nome: email, email, link: resetLink });

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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    enviarEmail('password-changed', user.email, {
      nome: user.email, email: user.email, link: frontendUrl,
    }).catch(err => console.error('[email] Erro ao enviar notificação de senha alterada:', err.message));

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
      include: { contasMl: true, regras: true, configAtacado: true },
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
      blingConectado: !!user.blingAccessToken,
      blingClientId: user.blingClientId || null,
      blingClientSecret: user.blingClientSecret || null,
      erpAtivo: user.erpAtivo || null,
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

// 6b. SALVAR CREDENCIAIS DO BLING (client_id e client_secret por usuário)
router.post('/api/usuario/:id/bling-credentials', async (req, res) => {
  try {
    const userId = req.userId;
    const { blingClientId, blingClientSecret } = req.body;
    if (!blingClientId || !blingClientSecret) {
      return res.status(400).json({ erro: 'blingClientId e blingClientSecret são obrigatórios.' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { blingClientId, blingClientSecret },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 6c. SALVAR PLANO DO TINY (rate limit)
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
    const deleted = await prisma.contaML.deleteMany({
      where: { id: req.params.contaId, userId: req.userId }
    });
    if (deleted.count === 0) return res.status(404).json({ erro: 'Conta não encontrada.' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: 'Erro ao excluir conta.' }); }
});

// 9. SALVAR/ATUALIZAR REGRA
router.post('/api/usuario/:id/regras', async (req, res) => {
  try {
    const userId = req.userId;
    const { id, nome, precoBase, variaveis, variacoesPorConta } = req.body;
    const regraId = id || undefined;

    const existe = regraId ? await prisma.regraPreco.findFirst({ where: { id: regraId, userId: req.userId } }) : null;

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
    const deleted = await prisma.regraPreco.deleteMany({
      where: { id: req.params.regraId, userId: req.userId }
    });
    if (deleted.count === 0) return res.status(404).json({ erro: 'Regra não encontrada.' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: 'Erro ao excluir regra.' }); }
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

// Iniciar pagamento imediato para criar sub-usuário Operador
router.post('/api/sub-usuarios/iniciar-pagamento-operador', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Apenas o dono da conta pode criar sub-usuários.' });
    }
    const { email, password, permissoesCustom } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ erro: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    if (!config?.mpAccessToken) return res.status(400).json({ erro: 'MercadoPago não configurado. Configure o Access Token no painel admin.' });

    const precoOperador = config.precoOperador ?? 50;

    // Cria o sub-usuário com ativo: false (pendente de pagamento)
    const hash = await bcrypt.hash(password, 10);
    const sub = await prisma.user.create({
      data: {
        email,
        senha: hash,
        role: 'OPERATOR',
        parentUserId: req.userId,
        ativo: false,
        permissoesCustom: permissoesCustom || null,
      },
      select: { id: true, email: true, role: true, ativo: true },
    });

    const mpClient = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const preference = new Preference(mpClient);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const result = await preference.create({
      body: {
        items: [{
          title: `Usuário Operador — ${email}`,
          quantity: 1,
          unit_price: precoOperador,
          currency_id: 'BRL',
        }],
        back_urls: {
          success: `${frontendUrl}/?operador=success`,
          failure: `${frontendUrl}/?operador=failure`,
          pending: `${frontendUrl}/?operador=pending`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL || frontendUrl}/api/assinatura/webhook`,
        external_reference: `op:${req.userId}:${sub.id}`,
        expires: false,
      },
    });

    res.json({ initPoint: result.init_point, subId: sub.id });
  } catch (err) {
    console.error('[sub-usuarios] erro iniciar-pagamento-operador:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Verificar pagamento do operador após retorno do MercadoPago
router.post('/api/sub-usuarios/verificar-pagamento-operador', async (req, res) => {
  try {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ erro: 'paymentId obrigatório.' });

    const config = await prisma.configAssinatura.findUnique({ where: { id: 'global' } });
    if (!config?.mpAccessToken) return res.status(400).json({ erro: 'MercadoPago não configurado.' });

    const mpClient = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const paymentAPI = new Payment(mpClient);
    const payment = await paymentAPI.get({ id: String(paymentId) });

    if (payment?.status === 'approved' && payment.external_reference?.startsWith('op:')) {
      const parts = payment.external_reference.split(':');
      const subId = parts[2];

      const sub = await prisma.user.update({
        where: { id: subId, parentUserId: req.userId },
        data: { ativo: true },
        select: { id: true, email: true, role: true, ativo: true, permissoesCustom: true, createdAt: true },
      });
      return res.json({ ativo: true, sub });
    }

    res.json({ ativo: false });
  } catch (err) {
    res.status(500).json({ erro: err.message });
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
