import { Router } from 'express';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';
import { createTinyClient, getTinyAccessToken } from '../utils/tinyClient.js';

const router = Router();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ML_BASE = 'https://api.mercadolibre.com';

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
  const { userId, contaId, method, path: apiPath, queryParams = {}, body: reqBody, public: isPublic } = req.body;

  if (!userId || (!contaId && !isPublic) || !apiPath) {
    return res.status(400).json({ erro: 'userId, contaId (ou chamada pública) e path são obrigatórios.' });
  }

  try {
    const url = `${ML_BASE}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
    const params = { ...queryParams };

    // ── Chamada pública (sem token) ──────────────────────────────────────────
    if (isPublic) {
      const start = Date.now();
      const mlRes = await axios({
        method: (method || 'GET').toUpperCase(),
        url,
        params,
        data: reqBody && Object.keys(reqBody).length > 0 ? reqBody : undefined,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, */*',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        timeout: 20000,
        validateStatus: () => true,
      });
      const elapsed = Date.now() - start;
      return res.json({
        status: mlRes.status,
        statusText: mlRes.statusText,
        headers: mlRes.headers,
        data: mlRes.data,
        elapsed,
        conta: 'Pública (sem token)',
        tokenRefreshed: false,
        refreshError: null,
      });
    }

    // ── Chamada autenticada ──────────────────────────────────────────────────
    const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
    if (!conta) return res.status(404).json({ erro: 'Conta ML não encontrada.' });

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

// ── Proxy para Tiny ERP v3 ───────────────────────────────────────────────────
// Body: { userId, path, method?, queryParams?, body? }
// Exemplo: { userId, path: '/produtos', queryParams: { codigo: 'SKU123' } }
router.post('/api/cliente-api/tiny', async (req, res) => {
  const { userId, path: apiPath, method = 'GET', queryParams = {}, body: reqBody } = req.body;

  if (!userId || !apiPath) {
    return res.status(400).json({ erro: 'userId e path são obrigatórios.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tinyPlano: true } });
    const tinyToken = await getTinyAccessToken(userId);
    if (!tinyToken) return res.status(404).json({ erro: 'Conta Tiny não conectada. Conecte em Configurações.' });

    const tinyLimits = getTinyRateLimit(user?.tinyPlano);
    if (tinyLimits.blocked) return res.status(403).json({ erro: 'O plano "Começar" não permite integrações de API.' });

    const client = createTinyClient(tinyToken);
    const start = Date.now();

    const tinyRes = await client.request({
      method: method.toUpperCase(),
      url: apiPath.startsWith('/') ? apiPath : `/${apiPath}`,
      params: queryParams,
      data: reqBody && Object.keys(reqBody).length > 0 ? reqBody : undefined,
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
