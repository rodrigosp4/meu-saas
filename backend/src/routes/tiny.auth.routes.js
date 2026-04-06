import { Router } from 'express';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';

const router = Router();

const AUTH_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth';
const TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

// Inicia o fluxo OAuth — redireciona o usuário para o Tiny
// GET /api/tiny/connect?userId=xxx
router.get('/api/tiny/connect', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ erro: 'userId obrigatório.' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tinyClientId: true },
  });

  if (!user?.tinyClientId) {
    return res.redirect(`${config.frontendUrl}/configuracoes?tiny=error&msg=client_id_nao_configurado`);
  }

  const params = new URLSearchParams({
    client_id: user.tinyClientId.trim(),
    redirect_uri: config.tinyRedirectUri.trim(),
    scope: 'openid',
    response_type: 'code',
    state: userId,
  });

  res.redirect(`${AUTH_URL}?${params}`);
});

// Callback do Tiny após autorização
// GET /api/tiny/callback?code=xxx&state=userId
router.get('/api/tiny/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) {
    return res.redirect(`${config.frontendUrl}/configuracoes?tiny=error&msg=${encodeURIComponent(error)}`);
  }

  if (!code || !userId) {
    return res.redirect(`${config.frontendUrl}/configuracoes?tiny=error&msg=parametros_invalidos`);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tinyClientId: true, tinyClientSecret: true },
    });

    if (!user?.tinyClientId || !user?.tinyClientSecret) {
      return res.redirect(`${config.frontendUrl}/configuracoes?tiny=error&msg=credenciais_nao_configuradas`);
    }

    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: user.tinyClientId.trim(),
        client_secret: user.tinyClientSecret.trim(),
        redirect_uri: config.tinyRedirectUri.trim(),
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    await prisma.user.update({
      where: { id: userId },
      data: {
        tinyAccessToken: access_token,
        tinyRefreshToken: refresh_token,
        tinyTokenExpiresAt: BigInt(Date.now() + expires_in * 1000),
        erpAtivo: 'tiny',
        // Desativa Bling ao conectar Tiny
        blingAccessToken: null,
        blingRefreshToken: null,
        blingTokenExpiresAt: null,
      },
    });

    res.redirect(`${config.frontendUrl}/configuracoes?tiny=connected`);
  } catch (err) {
    console.error('[Tiny OAuth] Erro ao trocar code por token:', err.response?.data || err.message);
    res.redirect(`${config.frontendUrl}/configuracoes?tiny=error&msg=falha_ao_obter_token`);
  }
});

// Desconecta a conta Tiny do usuário
// DELETE /api/tiny/disconnect
router.delete('/api/tiny/disconnect', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ erro: 'userId obrigatório.' });

  await prisma.user.update({
    where: { id: userId },
    data: { tinyAccessToken: null, tinyRefreshToken: null, tinyTokenExpiresAt: null, erpAtivo: null },
  });

  res.json({ ok: true });
});

// Status da conexão Tiny
// GET /api/tiny/status?userId=xxx
router.get('/api/tiny/status', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ erro: 'userId obrigatório.' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tinyAccessToken: true, tinyTokenExpiresAt: true, tinyPlano: true },
  });

  const conectado = !!user?.tinyAccessToken;
  const expiresAt = user?.tinyTokenExpiresAt ? Number(user.tinyTokenExpiresAt) : null;

  res.json({
    conectado,
    expiresAt,
    tinyPlano: user?.tinyPlano || null,
  });
});

export default router;
