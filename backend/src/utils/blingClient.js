import axios from 'axios';
import https from 'https';
import http from 'http';
import prisma from '../config/prisma.js';

const BASE_URL = 'https://api.bling.com.br/Api/v3';
const TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });

export function createBlingClient(token) {
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
export async function getBlingAccessToken(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      blingAccessToken: true,
      blingRefreshToken: true,
      blingTokenExpiresAt: true,
      blingClientId: true,
      blingClientSecret: true,
    },
  });

  if (!user?.blingAccessToken) return null;

  // Renova se expirar nos próximos 5 minutos
  const expiresAt = user.blingTokenExpiresAt ? Number(user.blingTokenExpiresAt) : 0;
  if (expiresAt && Date.now() + 300000 >= expiresAt) {
    if (!user.blingRefreshToken || !user.blingClientId || !user.blingClientSecret) return null;
    return refreshBlingToken(userId, user.blingRefreshToken, user.blingClientId, user.blingClientSecret);
  }

  return user.blingAccessToken;
}

export async function refreshBlingToken(userId, refreshToken, clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { blingClientId: true, blingClientSecret: true },
    });
    clientId = user?.blingClientId;
    clientSecret = user?.blingClientSecret;
  }
  if (!clientId || !clientSecret) {
    console.warn(`Credenciais Bling não configuradas para o usuário ${userId}.`);
    return null;
  }

  try {
    // Bling usa Basic Auth (base64 de clientId:clientSecret) para obter token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        timeout: 15000,
      }
    );

    const { access_token, refresh_token, expires_in } = res.data;

    await prisma.user.update({
      where: { id: userId },
      data: {
        blingAccessToken: access_token,
        blingRefreshToken: refresh_token,
        blingTokenExpiresAt: BigInt(Date.now() + expires_in * 1000),
      },
    });

    return access_token;
  } catch (error) {
    const errData = error.response?.data;
    console.error(`Falha na renovação do token Bling para usuário ${userId}:`, errData || error.message);
    if (errData?.error === 'invalid_grant') {
      await prisma.user.update({
        where: { id: userId },
        data: { blingAccessToken: null, blingRefreshToken: null, blingTokenExpiresAt: null },
      }).catch(() => {});
    }
    return null;
  }
}

// GET /produtos — lista com filtros opcionais (codigo, nome, situacao, pagina, limite)
export async function listarProdutosBling(client, params = {}) {
  const res = await client.get('/produtos', { params });
  return res.data; // { data: [], ... }
}

// GET /produtos/{idProduto}
export async function obterProdutoBling(client, idProduto) {
  const res = await client.get(`/produtos/${idProduto}`);
  return res.data?.data || res.data;
}

// GET /estoques/saldos?idsProdutos[]=xxx
export async function obterEstoqueBling(client, idProduto) {
  try {
    const res = await client.get('/estoques/saldos', {
      params: { 'idsProdutos[]': idProduto },
    });
    const saldos = res.data?.data || [];
    const item = saldos.find(s => String(s.produto?.id) === String(idProduto));
    return item?.saldoVirtualDisponivel ?? item?.saldoFisico ?? 0;
  } catch {
    return 0;
  }
}

// PATCH /produtos/{idProduto} — atualiza campos parciais
export async function atualizarPrecoBling(client, idProduto, preco, precoAtacado = null) {
  const payload = { preco };
  if (precoAtacado !== null) payload.precoAtacado = precoAtacado;
  const res = await client.patch(`/produtos/${idProduto}`, payload);
  return res.data;
}

// Extrai URLs de imagens do objeto midia.imagens do Bling
// midia.imagens = { externas: [{link}], internas: [{link, linkMiniatura}] }
function extractBlingImages(midia) {
  const imagens = midia?.imagens;
  if (!imagens || typeof imagens !== 'object') return [];
  const externas = Array.isArray(imagens.externas) ? imagens.externas : [];
  const internas = Array.isArray(imagens.internas) ? imagens.internas : [];
  return [...externas, ...internas]
    .map(img => ({ url: img.link || img.url }))
    .filter(img => img.url);
}

// Normaliza produto Bling para o formato compatível com dadosTiny (mesmo formato do Tiny)
export function normalizarProdutoBling(det, saldo = 0) {
  // det vem do GET /produtos/{id} → campo data
  const variacoes = (Array.isArray(det.variacoes) ? det.variacoes : []).map(v => ({
    id: v.id,
    codigo: v.codigo,
    nome: v.nome,
    preco: v.preco || 0,
    preco_promocional: v.precoPromocional || 0,
    // grade fica em v.variacao.nome = "Tamanho:G;Cor:Verde"
    grade: v.variacao?.nome || v.nome || '',
  }));

  const anexos = extractBlingImages(det.midia);

  return {
    id: det.id,
    codigo: det.codigo,
    nome: det.nome,
    preco: det.preco || 0,
    preco_promocional: det.precoPromocional || 0,
    preco_custo: det.precoCusto || 0,
    tipoVariacao: Array.isArray(det.variacoes) && det.variacoes.length > 0 ? 'V' : null,
    variacoes,
    anexos,
    estoque_atual: saldo,
    _fonte: 'bling',
  };
}
