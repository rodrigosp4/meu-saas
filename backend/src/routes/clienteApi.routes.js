import { Router } from 'express';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';

const router = Router();

const ML_BASE = 'https://api.mercadolibre.com';
const TINY_BASE = 'https://api.tiny.com.br/api2';

async function refreshMlToken(conta) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.mlAppId,
    client_secret: config.mlClientSecret,
    refresh_token: conta.refreshToken,
  });
  const res = await axios.post(`${ML_BASE}/oauth/token`, body, { timeout: 15000 });
  const { access_token, refresh_token } = res.data;
  await prisma.contaML.update({
    where: { id: conta.id },
    data: { accessToken: access_token, refreshToken: refresh_token },
  });
  return access_token;
}

// ── Proxy para Mercado Livre ─────────────────────────────────────────────────
router.post('/api/cliente-api/ml', async (req, res) => {
  const { userId, contaId, method, path: apiPath, queryParams = {}, body: reqBody } = req.body;

  if (!userId || !contaId || !apiPath) {
    return res.status(400).json({ erro: 'userId, contaId e path são obrigatórios.' });
  }

  try {
    const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
    if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada.' });

    const url = `${ML_BASE}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
    const params = { ...queryParams };

    const makeRequest = (token) => axios({
      method: (method || 'GET').toUpperCase(),
      url,
      params,
      data: reqBody && Object.keys(reqBody).length > 0 ? reqBody : undefined,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    const start = Date.now();
    let mlRes = await makeRequest(conta.accessToken);

    // Se 401, tenta renovar o token e reenviar
    let tokenRefreshed = false;
    let refreshError = null;
    if (mlRes.status === 401) {
      try {
        const newToken = await refreshMlToken(conta);
        mlRes = await makeRequest(newToken);
        tokenRefreshed = true;
      } catch (refreshErr) {
        refreshError = refreshErr.response?.data?.message || refreshErr.message;
      }
    }

    const elapsed = Date.now() - start;

    res.json({
      status: mlRes.status,
      statusText: mlRes.statusText,
      headers: mlRes.headers,
      data: mlRes.data,
      elapsed,
      conta: conta.nickname,
      tokenRefreshed,
      refreshError,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── Proxy para Tiny ERP ──────────────────────────────────────────────────────
router.post('/api/cliente-api/tiny', async (req, res) => {
  const { userId, endpoint, params = {} } = req.body;

  if (!userId || !endpoint) {
    return res.status(400).json({ erro: 'userId e endpoint são obrigatórios.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tinyToken: true } });
    if (!user?.tinyToken) return res.status(404).json({ erro: 'Token Tiny não configurado. Configure em Configurações API.' });

    const url = `${TINY_BASE}/${endpoint}`;
    const formParams = new URLSearchParams({
      token: user.tinyToken,
      formato: 'JSON',
      ...params,
    });

    const start = Date.now();
    const tinyRes = await axios.post(url, formParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
      validateStatus: () => true,
    });
    const elapsed = Date.now() - start;

    res.json({
      status: tinyRes.status,
      statusText: tinyRes.statusText,
      data: tinyRes.data,
      elapsed,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
