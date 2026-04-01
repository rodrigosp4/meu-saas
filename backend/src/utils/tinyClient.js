import axios from 'axios';
import https from 'https';
import http from 'http';
import prisma from '../config/prisma.js';

const BASE_URL = 'https://api.tiny.com.br/public-api/v3';
const TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });

export function createTinyClient(token) {
  return axios.create({
    baseURL: BASE_URL,
    httpAgent,
    httpsAgent,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// Retorna o access_token válido para o userId, renovando se necessário
export async function getTinyAccessToken(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tinyAccessToken: true, tinyRefreshToken: true, tinyTokenExpiresAt: true, tinyClientId: true, tinyClientSecret: true },
  });

  if (!user?.tinyAccessToken) return null;

  // Renova se expirar nos próximos 5 minutos
  const expiresAt = user.tinyTokenExpiresAt ? Number(user.tinyTokenExpiresAt) : 0;
  if (expiresAt && Date.now() + 300000 >= expiresAt) {
    if (!user.tinyRefreshToken || !user.tinyClientId || !user.tinyClientSecret) return null;
    return refreshTinyToken(userId, user.tinyRefreshToken, user.tinyClientId, user.tinyClientSecret);
  }

  return user.tinyAccessToken;
}

export async function refreshTinyToken(userId, refreshToken, clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tinyClientId: true, tinyClientSecret: true },
    });
    clientId = user?.tinyClientId;
    clientSecret = user?.tinyClientSecret;
  }
  if (!clientId || !clientSecret) {
    console.warn(`Credenciais Tiny não configuradas para o usuário ${userId}.`);
    return null;
  }

  try {
    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    const { access_token, refresh_token, expires_in } = res.data;

    await prisma.user.update({
      where: { id: userId },
      data: {
        tinyAccessToken: access_token,
        tinyRefreshToken: refresh_token,
        tinyTokenExpiresAt: BigInt(Date.now() + expires_in * 1000),
      },
    });

    return access_token;
  } catch (error) {
    console.error(`Falha na renovação do token Tiny para usuário ${userId}:`, error.response?.data || error.message);
    return null;
  }
}

// GET /produtos — lista com filtros opcionais (codigo, nome, situacao, dataAlteracao, limit, offset)
export async function listarProdutos(client, params = {}) {
  const res = await client.get('/produtos', { params });
  return res.data; // { itens: [], paginacao: { limit, offset, total } }
}

// GET /produtos/{idProduto} — detalhes completos (precos, variacoes[], anexos[], estoque.quantidade)
export async function obterProduto(client, idProduto) {
  const res = await client.get(`/produtos/${idProduto}`);
  return res.data;
}

// GET /estoque/{idProduto} — saldo real (saldo, reservado, disponivel, depositos[])
export async function obterEstoque(client, idProduto) {
  const res = await client.get(`/estoque/${idProduto}`);
  return res.data;
}

// Normaliza um produto v3 para o formato armazenado em dadosTiny (compatível com leitores existentes)
export function normalizarProdutoV3(det, saldo = 0) {
  return {
    id: det.id,
    codigo: det.sku,
    nome: det.descricao,
    preco: det.precos?.preco || 0,
    preco_promocional: det.precos?.precoPromocional || 0,
    preco_custo: det.precos?.precoCusto || 0,
    tipoVariacao: det.tipoVariacao || null,
    variacoes: (det.variacoes || []).map(v => ({
      id: v.id,
      codigo: v.sku,
      nome: v.descricao,
      preco: v.precos?.preco || 0,
      preco_promocional: v.precos?.precoPromocional || 0,
      grade: v.grade || [],
    })),
    anexos: (det.anexos || []).map(a => ({ url: a.url })),
    estoque_atual: saldo,
  };
}
