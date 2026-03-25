import { Worker } from 'bullmq';
import axios from 'axios';
import https from 'https';
import http from 'http';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';

const connection = {
  host: config.redisHost, port: config.redisPort, password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Erros transitórios que valem a pena retentar: rate limit, rede, 429/503
function isRetryable(err) {
  const status = err.response?.status;
  const msg = (err.response?.data?.message || err.message || '').toLowerCase();
  return status === 429 || status === 503 ||
    err.code === 'RATE_LIMIT_TINY' ||
    msg.includes('limite') || msg.includes('rate limit') ||
    ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(err.code);
}

// Delays exponenciais por round de retentativa (até 4 rounds: 15s, 45s, 90s, 180s)
const RETRY_DELAYS_MS = [15000, 45000, 90000, 180000];

const tinyHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const tinyHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const axiosTiny = axios.create({ httpAgent: tinyHttpAgent, httpsAgent: tinyHttpsAgent, timeout: 20000 });

function parseTinyPrice(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  return Number(String(val).replace(',', '.'));
}

async function fetchPrecoTiny(sku, tinyToken, tinyLimits, tentativas = 6) {
  const skuStr = String(sku).trim().toLowerCase();
  const delayMs = tinyLimits?.delayMs ?? 1500;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      let foundCandidateId = null;
      let isParentCandidate = false;
      let pagina = 1;
      let totalPaginas = 1;
      let candidateIdsToInspect = [];

      // Loop de busca com paginação automática (Idêntico à lógica do Cliente API)
      do {
        console.log(`[Tiny] SKU "${sku}" | pesquisa pág ${pagina}...`);
        await delay(delayMs);
        const searchRes = await axiosTiny.post(
          'https://api.tiny.com.br/api2/produtos.pesquisa.php',
          new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: String(sku).trim(), pagina: String(pagina) })
        );

        const retorno = searchRes.data?.retorno;
        const isRateLimit = retorno?.codigo_erro == 8 || retorno?.codigo_erro == 6 || String(retorno?.erros?.[0]?.erro || '').toLowerCase().includes('limite');
        
        if (isRateLimit) throw new Error('RATE_LIMIT_JSON');
        if (retorno?.codigo_erro == 2) return { error: 'Token da Tiny inválido.' };
        if (retorno?.status !== 'OK') break;

        totalPaginas = Number(retorno.numero_paginas || 1);
        const produtos = retorno.produtos || [];

        // Filtra o match exato dentro desta página
        const exactMatch = produtos.map(p => p.produto).find(p => String(p.codigo || '').trim().toLowerCase() === skuStr);

        if (exactMatch) {
          console.log(`[Tiny] SKU "${sku}" | ACHOU id=${exactMatch.id} na página ${pagina}`);
          if (exactMatch.tipoVariacao !== 'P' && exactMatch.classe_produto !== 'V') {
            return { preco: parseTinyPrice(exactMatch.preco), preco_promocional: parseTinyPrice(exactMatch.preco_promocional), preco_custo: parseTinyPrice(exactMatch.preco_custo) };
          }
          foundCandidateId = exactMatch.id;
          isParentCandidate = true;
          break;
        } else {
          candidateIdsToInspect.push(...produtos.map(p => p.produto.id));
        }
        
        pagina++;
        // Limite de segurança de 10 páginas para não travar a fila com produtos muito genéricos
        if (pagina > 10) break; 
      } while (!foundCandidateId && pagina <= totalPaginas);

      // 3. INSPEÇÃO PROFUNDA (VARIAÇÕES)
      let variationMatchData = null;
      if (!foundCandidateId && candidateIdsToInspect.length > 0) {
        const paisParaInspecionar = [...new Set(candidateIdsToInspect)].slice(0, 5); // Limita a 5 pais
        for (const paiId of paisParaInspecionar) {
           await delay(delayMs);
           const detRes = await axiosTiny.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token: tinyToken, formato: 'JSON', id: paiId }));
           const pRetorno = detRes.data?.retorno;
           if (pRetorno?.codigo_erro == 8 || pRetorno?.codigo_erro == 6) throw new Error('RATE_LIMIT_JSON');

           const prod = pRetorno?.produto;
           if (!prod) continue;

           if (String(prod.codigo || '').trim().toLowerCase() === skuStr) {
              variationMatchData = { preco: parseTinyPrice(prod.preco), preco_promocional: parseTinyPrice(prod.preco_promocional), preco_custo: parseTinyPrice(prod.preco_custo) };
              break;
           }

           if (prod.variacoes) {
              let vars = Array.isArray(prod.variacoes) ? prod.variacoes : Object.values(prod.variacoes);
              let varMatch = vars.map(v => v.variacao || v).find(v => String(v.codigo || '').trim().toLowerCase() === skuStr);
              if (varMatch) {
                 variationMatchData = { preco: parseTinyPrice(varMatch.preco || prod.preco), preco_promocional: parseTinyPrice(varMatch.preco_promocional || prod.preco_promocional), preco_custo: parseTinyPrice(prod.preco_custo) };
                 break;
              }
           }
        }
      }

      if (variationMatchData) return variationMatchData;
      if (!foundCandidateId) return null; 

      // 4. COLETA PREÇO DO PRODUTO ACHADO
      await delay(delayMs);
      const detRes = await axiosTiny.post('https://api.tiny.com.br/api2/produto.obter.php', new URLSearchParams({ token: tinyToken, formato: 'JSON', id: foundCandidateId }));
      const retornoDet = detRes.data?.retorno;
      if (retornoDet?.codigo_erro == 8 || retornoDet?.codigo_erro == 6) throw new Error('RATE_LIMIT_JSON');

      const prod = retornoDet?.produto;
      if (!prod) throw new Error('FALHA_OBTER_DETALHE');

      const precoBasico = { preco: parseTinyPrice(prod.preco), preco_promocional: parseTinyPrice(prod.preco_promocional), preco_custo: parseTinyPrice(prod.preco_custo) };

      if (isParentCandidate && prod.variacoes) {
          let vars = Array.isArray(prod.variacoes) ? prod.variacoes : Object.values(prod.variacoes);
          const varMatch = vars.map(v => v.variacao || v).find(v => String(v.codigo || '').trim().toLowerCase() === skuStr);
          if (varMatch) {
              precoBasico.preco = parseTinyPrice(varMatch.preco || prod.preco);
              precoBasico.preco_promocional = parseTinyPrice(varMatch.preco_promocional || prod.preco_promocional);
          }
      }

      return precoBasico;

    } catch (err) {
      const isRateLimit = err.message === 'RATE_LIMIT_JSON' || err.response?.status === 429;
      const isNetwork =['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
      if (tentativa < tentativas) {
        // Para rate limit: espera progressiva — 25s, 35s, 45s, 55s, 65s
        const rlDelay = isRateLimit ? (20000 + tentativa * 10000) : (isNetwork ? 4000 * tentativa : 3000);
        await delay(rlDelay);
        continue;
      }
      if (isRateLimit) return { error: `Limite de requisições excedido na API da Tiny.` };
      if (isNetwork) return { error: `Falha de rede com a API da Tiny.` };
      return { error: `Erro Tiny: ${err.message}` };
    }
  }
  return null;
}

const TIPOS_SEM_PROMOTION_ID = new Set(['DOD', 'LIGHTNING']);
const TIPOS_COM_OFFER_ID = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);

async function ativarPromocoesAuto(itemId, accessToken, inflar, precoFinal) {
  try {
    const res = await axios.get(`https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 });
    const lista = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    if (lista.length === 0) return "Sem campanhas disponiveis no ML.";

    // ✅ CORREÇÃO: Aceitar 'candidate' (nova), 'started' (ativa) e 'pending' (futura)
    const statusPermitidos = ['candidate', 'started', 'pending'];
    const candidatos = lista.filter(p => 
      p && 
      statusPermitidos.includes(p.status) && 
      p.type !== 'PRICE_DISCOUNT'
    );

    if (candidatos.length === 0) return `O ML retornou ${lista.length} promos, mas nenhuma elegível.`;

    const inflarNum = Number(inflar) || 0;
    const precoAlvo = inflarNum > 0 ? precoFinal * (1 - inflarNum / 100) : precoFinal;
    let ativadas = 0, erros = [];

    for (const promo of candidatos) {
      const sellerPct = typeof promo.seller_percentage === 'number' ? promo.seller_percentage : null;

      let deveAtivar = false;
      if (inflarNum === 0) { deveAtivar = true; } 
      else if (sellerPct !== null) { deveAtivar = sellerPct <= inflarNum; } 
      else if (TIPOS_COM_PRECO.has(promo.type)) { deveAtivar = true; } 
      else { deveAtivar = false; erros.push(`[${promo.type}] Impossível validar margem.`); }
      
      if (!deveAtivar) {
        if (!erros.some(e => e.includes(`[${promo.type}]`))) erros.push(`[${promo.type}] Ignorada (fora da margem).`);
        continue;
      }

      try {
        const body = { promotion_type: promo.type };
        if (!TIPOS_SEM_PROMOTION_ID.has(promo.type) && promo.id) body.promotion_id = promo.id;
        const offerId = promo.offer_id || promo.offerId || promo.ref_id || null;
        if (offerId && TIPOS_COM_OFFER_ID.has(promo.type)) body.offer_id = offerId;

        if (TIPOS_COM_PRECO.has(promo.type) && precoFinal > 0) {
          let dealPrice = sellerPct !== null ? precoFinal * (1 - sellerPct / 100) : precoAlvo;
          const maxPrice = promo.max_discounted_price || 0;
          const minPrice = promo.min_discounted_price || 0;
          if (maxPrice > 0 && dealPrice > maxPrice) dealPrice = maxPrice;
          if (minPrice > 0 && dealPrice < minPrice) dealPrice = minPrice;
          if (inflarNum > 0 && dealPrice < (precoAlvo - 0.01)) { 
            erros.push(`[${promo.type}] Preço mín. viola o alvo.`);
            continue; 
          }
          body.deal_price = Math.round(dealPrice * 100) / 100;
        }

        if (promo.type === 'LIGHTNING' && promo.stock?.min) body.stock = Number(promo.stock.min);

        await axios.post(`https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`, body, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 8000 });
        ativadas++;
        await delay(150); 
      } catch (e) {
        erros.push(`[${promo.type}]: ${e.response?.data?.message || e.message}`);
      }
    }
    if (erros.length > 0) return `Ativadas: ${ativadas}. Avisos: ${erros.join(' | ')}`;
    return `Ativadas com sucesso: ${ativadas}.`;
  } catch (e) {
    return `Erro ML: ${e.response?.data?.message || e.message}`;
  }
}

async function enviarPrecosAtacado(itemId, accessToken, precoAlvo, faixas) {
  try {
    let keepNodes = [];
    const delays = [0, 500]; 
    for (let i = 0; i < 2; i++) {
      if (delays[i] > 0) await delay(delays[i]);
      const precosRes = await axios.get(`https://api.mercadolibre.com/items/${itemId}/prices`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'show-all-prices': 'true' }
      }).catch(() => null);

      const allPrices = Array.isArray(precosRes?.data?.prices) ? precosRes.data.prices : [];
      keepNodes = allPrices.filter(p => !p.conditions?.min_purchase_unit).map(p => ({ id: p.id }));
      if (keepNodes.length > 0) break;
    }

    if (keepNodes.length === 0) return "Sem ID de preço (O ML ainda não indexou).";

    const b2bNodes = [];
    for (const faixa of faixas.slice(0, 5)) {
      const minQtd = Number(faixa.minQtd ?? faixa.quantity ?? faixa.min_purchase_unit);
      const desconto = Number(faixa.desconto ?? faixa.percent ?? faixa.discount);
      if (!Number.isFinite(minQtd) || minQtd <= 1 || !Number.isFinite(desconto)) continue;
      const tierPrice = Math.round(precoAlvo * (1 - desconto / 100) * 100) / 100;
      if (tierPrice <= 0) continue;
      b2bNodes.push({ amount: tierPrice, currency_id: 'BRL', conditions: { context_restrictions: ['channel_marketplace', 'user_type_business'], min_purchase_unit: minQtd } });
    }

    if (b2bNodes.length > 0) {
      await axios.post(`https://api.mercadolibre.com/items/${itemId}/prices/standard/quantity`, { prices: [...keepNodes, ...b2bNodes] }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
      return `Ativado (${b2bNodes.length} faixas).`;
    }
    return "Nenhuma faixa B2B válida configurada.";
  } catch (e) {
    return `Erro B2B: ${e.response?.data?.message || e.message}`;
  }
}

function resolverPrecoBase(precosTiny, tipoBase) {
  if (!precosTiny) return 0;
  const pVenda = Number(precosTiny.preco || 0);
  const pPromo = Number(precosTiny.preco_promocional || 0);
  const pCusto = Number(precosTiny.preco_custo || 0);
  if (tipoBase === 'venda') return pVenda;
  if (tipoBase === 'custo') return pCusto > 0 ? pCusto : pVenda;
  return pPromo > 0 ? pPromo : pVenda;
}

function calcularPrecoRegra(precoBase, regra, tipoML, inflar, reduzir, custoFreteGratis = 0) {
  if (!precoBase || !regra || isNaN(precoBase) || precoBase <= 0) return null;
  let custoBaseOriginal = precoBase;
  let totalTaxasVendaPerc = 0;
  (regra.variaveis || []).forEach(v => {
    if (v.tipo === 'fixo_custo') custoBaseOriginal += v.valor;
    else if (v.tipo === 'perc_custo') custoBaseOriginal += custoBaseOriginal * (v.valor / 100);
    else if (v.tipo === 'perc_venda') totalTaxasVendaPerc += v.valor;
  });
  const tarifaML = tipoML === 'premium' ? 16 : 11;
  const netFactor = 1 - ((tarifaML + totalTaxasVendaPerc) / 100);
  if (netFactor <= 0) return Math.round(custoBaseOriginal * 100) / 100;

  const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);
  let precoAlvo = (custoBaseOriginal + 6) / netFactor;
  let precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;

  if (precoFinal >= 79) {
    precoAlvo = (custoBaseOriginal + custoFreteGratis) / netFactor;
    precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
    if (reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) precoFinal = 78.99;
  }
  return Math.round(precoFinal * 100) / 100;
}

function calcularPrecoCorrigir(precoBase, inflar, reduzir) {
  if (!precoBase || isNaN(precoBase) || precoBase <= 0) return null;
  const inflarSafe = Math.min(Math.max(0, inflar), 99);
  let precoFinal = inflarSafe > 0 ? precoBase / (1 - inflarSafe / 100) : precoBase;
  if (precoFinal >= 79 && reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) precoFinal = 78.99;
  return Math.round(precoFinal * 100) / 100;
}

// 🚀 START MAIN WORKER
export const priceWorker = new Worker('update-price', async (job) => {
  const { tarefaId, userId, items, modo, regraId, precoManual, precoBaseManual, inflar, reduzir, removerPromocoes, enviarAtacado, ativarPromocoes } = job.data;

  const tarefaExiste = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
  if (!tarefaExiste) return { success: false, message: 'Tarefa excluída' };

  await prisma.tarefaFila.updateMany({ where: { id: tarefaId }, data: { status: 'PROCESSANDO', detalhes: `Iniciando... carregando configurações para ${items.length} anúncio(s).` } });

  let sucessos = 0; let falhas = 0; let detalhesLogs = [];

  const contasCache = {};
  const precosTinyMap = {};
  const [regras, configAtacadoDb, userConfig] = await Promise.all([
    prisma.regraPreco.findMany({ where: { userId } }),
    prisma.configAtacado.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { cepOrigem: true, tinyToken: true, tinyPlano: true } })
  ]);

  const tinyToken = userConfig?.tinyToken || null;
  const tinyLimits = getTinyRateLimit(userConfig?.tinyPlano);
  const regra = regras.find(r => r.id === regraId);
  const faixasAtacado = (enviarAtacado && configAtacadoDb?.ativo && Array.isArray(configAtacadoDb.faixas)) ? configAtacadoDb.faixas : [];

  detalhesLogs.push(`>> Setup: Atacado=${enviarAtacado ? 'Sim' : 'Não'} | Promo=${ativarPromocoes ? 'Sim' : 'Não'} | Tiny=${tinyToken ? 'Conectado' : 'Não'}`);

  // ✅ PRÉ-CARREGAMENTO ROBUSTO DO TINY ERP COM LÓGICA DE CHUNKS E ATUALIZAÇÃO DA TELA
  if (tinyToken && modo !== 'manual') {
    const skusConhecidos = [...new Set(items.map(a => a.sku).filter(Boolean))];
    if (skusConhecidos.length > 0) {
      
      const chunkPreFetch = tinyLimits.blocked ? 1 : (tinyLimits.concurrency || 2);
      
      for (let i = 0; i < skusConhecidos.length; i += chunkPreFetch) {
        const lote = skusConhecidos.slice(i, i + chunkPreFetch);
        
        await Promise.all(lote.map(async (sku) => {
          try {
            const precos = await fetchPrecoTiny(sku, tinyToken, tinyLimits);
            precosTinyMap[sku] = (precos && !precos.error) ? precos : (precos?.error ? precos : 'NOT_FOUND');
          } catch (e) {
            precosTinyMap[sku] = 'NOT_FOUND';
          }
        }));

        // Atualiza a tela a cada lote para mostrar que não está travado
        const atual = Math.min(i + chunkPreFetch, skusConhecidos.length);
        if (i % (chunkPreFetch * 2) === 0 || atual === skusConhecidos.length) {
            await prisma.tarefaFila.updateMany({ 
              where: { id: tarefaId }, 
              data: { detalhes: detalhesLogs.join('\n') + `\n>> Pré-carregando Tiny ERP: Lendo SKU ${atual} de ${skusConhecidos.length}...` } 
            }).catch(()=>{});
        }
      }
      // ✅ SEGUNDA PASSAGEM: re-tenta SKUs que falharam por rate limit
      const skusRateLimit = Object.entries(precosTinyMap)
        .filter(([, v]) => v?.error?.includes('Limite') || v?.error?.includes('limit'))
        .map(([sku]) => sku);

      if (skusRateLimit.length > 0) {
        const msgEspera = `>> ${skusRateLimit.length} SKU(s) com limite excedido. Aguardando 65s para re-tentar...`;
        detalhesLogs.push(msgEspera);
        await prisma.tarefaFila.updateMany({
          where: { id: tarefaId },
          data: { detalhes: detalhesLogs.join('\n') }
        }).catch(() => {});

        await delay(65000); // Espera a janela de rate limit resetar

        for (let i = 0; i < skusRateLimit.length; i += chunkPreFetch) {
          const lote = skusRateLimit.slice(i, i + chunkPreFetch);
          await Promise.all(lote.map(async (sku) => {
            try {
              const precos = await fetchPrecoTiny(sku, tinyToken, tinyLimits, 4);
              if (precos && !precos.error) {
                precosTinyMap[sku] = precos;
              } else if (precos?.error) {
                precosTinyMap[sku] = precos; // mantém o erro atualizado
              }
            } catch (e) {
              // mantém o erro anterior
            }
          }));

          const recuperados = skusRateLimit.slice(0, i + chunkPreFetch).filter(s => precosTinyMap[s] && !precosTinyMap[s]?.error).length;
          await prisma.tarefaFila.updateMany({
            where: { id: tarefaId },
            data: { detalhes: detalhesLogs.join('\n') + `\n>> Re-tentando SKUs: ${Math.min(i + chunkPreFetch, skusRateLimit.length)}/${skusRateLimit.length} (${recuperados} recuperados)` }
          }).catch(() => {});
        }

        const totalRecuperados = skusRateLimit.filter(s => precosTinyMap[s] && !precosTinyMap[s]?.error).length;
        detalhesLogs.push(`>> Re-tentativa concluída: ${totalRecuperados}/${skusRateLimit.length} SKUs recuperados.`);
      }

      detalhesLogs.push(`>> Pré-carga do Tiny concluída com sucesso.`);
    }
  }

  // ✅ PROCESSAMENTO SEGURO DOS ANÚNCIOS NO ML (LOTE POR LOTE)
  const CONCURRENCY = 4; 
  
  async function processaItem(item) {
    let logDesteItem = `[ID: ${item.id}]`;
    let skuDoAnuncio = item.sku;
    
    try {
      if (!contasCache[item.contaId]) {
        const c = await prisma.contaML.findFirst({ where: { id: item.contaId, userId } });
        if (c) {
          try {
            const tRes = await mlService.refreshToken(c.refreshToken);
            if (tRes?.access_token) { c.accessToken = tRes.access_token; c.refreshToken = tRes.refresh_token; }
          } catch (refreshErr) {
            try { await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${c.accessToken}` }, timeout: 5000 }); }
            catch { contasCache[item.contaId] = null; throw new Error(`Token ML inválido.`); }
          }
        }
        contasCache[item.contaId] = c;
      }
      const conta = contasCache[item.contaId];
      if (!conta) throw new Error("Conta não encontrada");

      const adData = await mlService.getSingleAdDetails(item.id, conta.accessToken);
      const tipoML = adData.listing_type_id?.includes('pro') ? 'premium' : 'classico';

      if (!skuDoAnuncio) {
        skuDoAnuncio = adData.seller_custom_field || adData.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || adData.attributes?.find(a => a.id === 'PART_NUMBER')?.value_name;
        if (!skuDoAnuncio && adData.variations?.length > 0) {
          skuDoAnuncio = adData.variations[0].seller_custom_field || adData.variations[0].attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || adData.variations[0].attributes?.find(a => a.id === 'PART_NUMBER')?.value_name;
        }
      }
      if (skuDoAnuncio) skuDoAnuncio = String(skuDoAnuncio).trim();

      if (skuDoAnuncio && tinyToken && precosTinyMap[skuDoAnuncio] === undefined) {
        const precosTiny = await fetchPrecoTiny(skuDoAnuncio, tinyToken, tinyLimits);
        precosTinyMap[skuDoAnuncio] = (precosTiny && !precosTiny.error) ? precosTiny : (precosTiny?.error ? precosTiny : 'NOT_FOUND');
      }

      // Se o SKU tem erro retryable do pré-carregamento → relança para o sistema de retry exponencial
      const erroTinyPreload = precosTinyMap[skuDoAnuncio]?.error;
      if (skuDoAnuncio && tinyToken && erroTinyPreload) {
        const isTokenInvalido = erroTinyPreload.includes('Token') || erroTinyPreload.includes('inválido');
        if (!isTokenInvalido) {
          // Rate limit, rede, timeout → retryable; token inválido → falha permanente
          const errRetry = new Error(erroTinyPreload);
          errRetry.code = erroTinyPreload.includes('Limite') ? 'RATE_LIMIT_TINY' : 'ECONNRESET';
          throw errRetry;
        }
      }

      let precoNum = 0;
      if (modo === 'manual') {
        precoNum = calcularPrecoCorrigir(Number(precoManual), inflar || 0, reduzir || 0);
      } else if (regra) {
        let precoBaseItem = 0;
        if (tinyToken && skuDoAnuncio) {
          const dadosTiny = precosTinyMap[skuDoAnuncio];
          if (dadosTiny && dadosTiny !== 'NOT_FOUND' && !dadosTiny.error) precoBaseItem = resolverPrecoBase(dadosTiny, regra.precoBase || 'promocional');
        } else {
          precoBaseItem = Number(precoBaseManual) || 0;
        }

        if (precoBaseItem > 0) {
          let custoFrete = 0;
          if (conta.logistica !== 'ME1') {
            custoFrete = await mlService.simulateShipping({
              accessToken: conta.accessToken, sellerId: conta.id, itemPrice: precoBaseItem * 2,
              categoryId: adData.category_id, listingTypeId: adData.listing_type_id || 'gold_pro', itemId: item.id
            }).catch(() => 0);
          }
          precoNum = calcularPrecoRegra(precoBaseItem, regra, tipoML, inflar || 0, reduzir || 0, custoFrete);
        }
      }

      if (!precoNum || isNaN(precoNum) || precoNum <= 0) {
        if (!skuDoAnuncio) throw new Error(`Sem SKU.`);
        if (tinyToken) {
          const dadosTiny = precosTinyMap[skuDoAnuncio];
          if (dadosTiny && dadosTiny.error) throw new Error(`Tiny ERP: ${dadosTiny.error}`);
          const estadoMapa = dadosTiny === 'NOT_FOUND' ? 'NOT_FOUND' : (dadosTiny === undefined ? 'não buscado' : `preco=${dadosTiny?.preco}`);
          throw new Error(`Tiny não retornou preço. [SKU: "${skuDoAnuncio}", mapa: ${estadoMapa}]`);
        } else {
          throw new Error(`Faltando preço base.`);
        }
      }

      if (removerPromocoes) {
        try {
          await axios.delete(`https://api.mercadolibre.com/seller-promotions/items/${item.id}?app_version=v2`, { headers: { Authorization: `Bearer ${conta.accessToken}` } });
          logDesteItem += ` | LimpPromo: OK`;
        } catch (e) { logDesteItem += ` | LimpPromo: Falha`; }
      }

      const variations = adData.variations || [];
      const precoJaIdeal = variations.length > 0 ? variations.every(v => Math.abs((v.price || 0) - precoNum) < 0.01) : Math.abs((adData.price || 0) - precoNum) < 0.01;

      if (precoJaIdeal) {
        logDesteItem += ` | R$${precoNum.toFixed(2)}`;
      } else {
        const updateBody = variations.length > 0 ? { variations: variations.map(v => ({ id: v.id, price: precoNum })) } : { price: precoNum };
        await axios.put(`https://api.mercadolibre.com/items/${item.id}`, updateBody, { headers: { Authorization: `Bearer ${conta.accessToken}` } });
        logDesteItem += ` | R$${precoNum.toFixed(2)}`;
        
        const dbData = { preco: precoNum };
        if ((inflar || 0) > 0) dbData.margemPromocional = true;
        prisma.anuncioML.update({ where: { id: item.id }, data: dbData }).catch(() => {});
      }

      if (enviarAtacado && faixasAtacado.length > 0) {
        const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);
        const precoAlvoAtacado = inflarSafe > 0 ? Math.round(precoNum * (1 - inflarSafe / 100) * 100) / 100 : precoNum;
        const logAtacado = await enviarPrecosAtacado(item.id, conta.accessToken, precoAlvoAtacado, faixasAtacado);
        logDesteItem += ` | B2B: ${logAtacado}`;
      }

      if (ativarPromocoes) {
        const logPromo = await ativarPromocoesAuto(item.id, conta.accessToken, inflar || 0, precoNum);
        logDesteItem += ` | Promo: ${logPromo}`;
      }

      sucessos++;
      detalhesLogs.push(logDesteItem);

    } catch (itemError) {
      const msgErr = itemError.response?.data?.message || itemError.message;
      if (isRetryable(itemError)) {
        // Não loga nem incrementa falhas — será movido para o final da fila de retentativas
        return { success: false, retryable: true, msgErr, item, logPrefix: logDesteItem };
      }
      falhas++;
      detalhesLogs.push(`${logDesteItem} Erro: ${msgErr}`);
      return { success: false, retryable: false };
    }
    return { success: true };
  }

  // Fila de itens com erros retentáveis (rate limit, rede, etc.)
  let pendentesRetry = []; // [{item, logPrefix, round}]

  // Executa o processamento do ML em lotes seguros e lineares
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const loteML = items.slice(i, i + CONCURRENCY);

    const resultados = await Promise.all(loteML.map(item => processaItem(item)));

    for (const r of resultados) {
      if (r?.retryable) pendentesRetry.push({ item: r.item, logPrefix: r.logPrefix, lastError: r.msgErr, round: 0 });
    }

    const resolvidosAte = sucessos + falhas + pendentesRetry.length;
    const pct = Math.floor((resolvidosAte / items.length) * 100);

    job.updateProgress(pct).catch(()=>{});
    await prisma.tarefaFila.updateMany({
        where: { id: tarefaId },
        data: { detalhes: `Processando... ${resolvidosAte}/${items.length} (${pct}%)\n===\n${detalhesLogs.join('\n')}` }
    }).catch(()=>{});
  }

  // ♻️ RETENTATIVAS EXPONENCIAIS — itens movidos para o final da fila
  const MAX_ROUNDS = RETRY_DELAYS_MS.length;
  for (let round = 0; round < MAX_ROUNDS && pendentesRetry.length > 0; round++) {
    const loteRetry = pendentesRetry.filter(r => r.round === round);
    if (loteRetry.length === 0) break;

    const waitMs = RETRY_DELAYS_MS[round];
    const msgRetry = `>> ${loteRetry.length} item(s) com erro transitório → movidos para o final. Tentativa ${round + 1}/${MAX_ROUNDS}. Aguardando ${waitMs / 1000}s...`;
    detalhesLogs.push(msgRetry);
    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { detalhes: `Processando... ${sucessos + falhas}/${items.length}\n===\n${detalhesLogs.join('\n')}` }
    }).catch(() => {});

    await delay(waitMs);

    for (const entry of loteRetry) {
      // Limpa qualquer erro Tiny do cache para que processaItem busque de novo na próxima tentativa
      const sku = entry.item.sku;
      if (sku && precosTinyMap[sku]?.error) {
        delete precosTinyMap[sku];
      }
      const r = await processaItem(entry.item);
      if (r?.retryable) {
        if (round < MAX_ROUNDS - 1) {
          entry.round = round + 1;
          entry.lastError = r.msgErr;
          // permanece em pendentesRetry para o próximo round
        } else {
          // Esgotou as retentativas — marca como falha permanente
          falhas++;
          detalhesLogs.push(`${entry.logPrefix} Erro (${MAX_ROUNDS} tentativas): ${r.msgErr}`);
          pendentesRetry = pendentesRetry.filter(x => x !== entry);
        }
      } else {
        // Sucesso ou erro não-retentável — já foi contabilizado em processaItem
        pendentesRetry = pendentesRetry.filter(x => x !== entry);
      }
    }
  }

  // Relatório Final
  await prisma.tarefaFila.updateMany({
    where: { id: tarefaId },
    data: {
      status: falhas === 0 ? 'CONCLUIDO' : (sucessos === 0 ? 'FALHA' : 'CONCLUIDO'),
      detalhes: `Resumo do Lote:\n✅ Sucessos: ${sucessos}\n❌ Erros: ${falhas}\n\nDetalhes por Anúncio:\n${detalhesLogs.join('\n')}`
    }
  });
  
  return { sucessos, falhas };
}, {
  connection,
  concurrency: 1, 
  lockDuration: 1800000,
  stalledInterval: 300000,
});

priceWorker.on('error', (err) => console.error('❌ Erro no Worker de Preço:', err.message));