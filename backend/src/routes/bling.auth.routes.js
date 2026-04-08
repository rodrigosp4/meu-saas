import { Router } from 'express';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';

const router = Router();

const AUTH_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize';
const TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token';

// Inicia o fluxo OAuth — redireciona o usuário para o Bling
// GET /api/bling/connect?userId=xxx
router.get('/api/bling/connect', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ erro: 'userId obrigatório.' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blingClientId: true },
  });

  if (!user?.blingClientId) {
    return res.redirect(`${config.frontendUrl}/configuracoes?bling=error&msg=client_id_nao_configurado`);
  }

  if (!config.blingRedirectUri) {
    return res.redirect(`${config.frontendUrl}/configuracoes?bling=error&msg=BLING_REDIRECT_URI_nao_configurado`);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: user.blingClientId.trim(),
    redirect_uri: config.blingRedirectUri.trim(),
    state: userId,
  });

  res.redirect(`${AUTH_URL}?${params}`);
});

// Callback do Bling após autorização
// GET /api/bling/callback?code=xxx&state=userId
router.get('/api/bling/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) {
    return res.redirect(`${config.frontendUrl}/configuracoes?bling=error&msg=${encodeURIComponent(error)}`);
  }

  if (!code || !userId) {
    return res.redirect(`${config.frontendUrl}/configuracoes?bling=error&msg=parametros_invalidos`);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { blingClientId: true, blingClientSecret: true },
    });

    if (!user?.blingClientId || !user?.blingClientSecret) {
      return res.redirect(`${config.frontendUrl}/configuracoes?bling=error&msg=credenciais_nao_configuradas`);
    }

    // Bling usa Basic Auth com base64(clientId:clientSecret)
    const credentials = Buffer.from(`${user.blingClientId.trim()}:${user.blingClientSecret.trim()}`).toString('base64');

    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: (config.blingRedirectUri || '').trim(),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        timeout: 15000,
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    await prisma.user.update({
      where: { id: userId },
      data: {
        blingAccessToken: access_token,
        blingRefreshToken: refresh_token,
        blingTokenExpiresAt: BigInt(Date.now() + expires_in * 1000),
        erpAtivo: 'bling',
        // Desativa Tiny ao conectar Bling
        tinyAccessToken: null,
        tinyRefreshToken: null,
        tinyTokenExpiresAt: null,
      },
    });

    res.redirect(`${config.frontendUrl}/configuracoes?bling=connected`);
  } catch (err) {
    console.error('[Bling OAuth] Erro ao trocar code por token:', err.response?.data || err.message);
    res.redirect(`${config.frontendUrl}/configuracoes?bling=error&msg=falha_ao_obter_token`);
  }
});

// Desconecta a conta Bling do usuário
// DELETE /api/bling/disconnect
router.delete('/api/bling/disconnect', async (req, res) => {
  const userId = req.userId;

  await prisma.user.update({
    where: { id: userId },
    data: {
      blingAccessToken: null,
      blingRefreshToken: null,
      blingTokenExpiresAt: null,
      erpAtivo: null,
    },
  });

  res.json({ ok: true });
});

// Status da conexão Bling
// GET /api/bling/status
router.get('/api/bling/status', async (req, res) => {
  const userId = req.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blingAccessToken: true, blingTokenExpiresAt: true, erpAtivo: true },
  });

  const conectado = !!user?.blingAccessToken;
  const expiresAt = user?.blingTokenExpiresAt ? Number(user.blingTokenExpiresAt) : null;

  res.json({ conectado, expiresAt, erpAtivo: user?.erpAtivo || null });
});

export default router;
