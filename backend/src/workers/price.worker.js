import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';
import { createTinyClient, getTinyAccessToken, listarProdutos, obterProduto } from '../utils/tinyClient.js';

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

async function fetchPrecoTiny(sku, tinyToken, tinyLimits, tentativas = 6) {
  const skuStr = String(sku).trim().toLowerCase();
  const delayMs = tinyLimits?.delayMs ?? 1500;
  const client = createTinyClient(tinyToken);

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      await delay(delayMs);
      const data = await listarProdutos(client, { codigo: String(sku).trim() });
      const itens = data.itens || [];

      const exactMatch = itens.find(p => String(p.sku || '').trim().toLowerCase() === skuStr);

      if (!exactMatch) return null;

      // Variação ou produto simples: precos já vêm na listagem
      if (exactMatch.tipoVariacao !== 'P') {
        return {
          preco: exactMatch.precos?.preco || 0,
          preco_promocional: exactMatch.precos?.precoPromocional || 0,
          preco_custo: exactMatch.precos?.precoCusto || 0,
        };
      }

      // Produto pai: busca detalhes para obter preços das variações
      await delay(delayMs);
      const det = await obterProduto(client, exactMatch.id);
      const varMatch = (det.variacoes || []).find(v => String(v.sku || '').trim().toLowerCase() === skuStr);
      return {
        preco: varMatch?.precos?.preco ?? det.precos?.preco ?? 0,
        preco_promocional: varMatch?.precos?.precoPromocional ?? det.precos?.precoPromocional ?? 0,
        preco_custo: det.precos?.precoCusto ?? 0,
      };

    } catch (err) {
      const isRateLimit = err.response?.status === 429 || err.response?.status === 503;
      const isUnauth = err.response?.status === 401 || err.response?.status === 403;
      const isNetwork = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
      if (isUnauth) return { error: 'Token da Tiny inválido.' };
      if (tentativa < tentativas) {
        await delay(isRateLimit ? (20000 + tentativa * 10000) : (isNetwork ? 4000 * tentativa : 3000));
        continue;
      }
      if (isRateLimit) return { error: 'Limite de requisições excedido na API da Tiny.' };
      if (isNetwork) return { error: 'Falha de rede com a API da Tiny.' };
      return { error: `Erro Tiny: ${err.message}` };
    }
  }
  return null;
}

const TIPOS_SEM_PROMOTION_ID = new Set(['DOD', 'LIGHTNING']);
const TIPOS_COM_OFFER_ID = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);

async function ativarPromocoesAuto(itemId, accessToken, inflar, precoFinal, toleranciaPromo = 0) {
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

      const limiteMax = inflarNum + (Number(toleranciaPromo) || 0);
      let deveAtivar = false;
      if (inflarNum === 0) { deveAtivar = true; }
      else if (sellerPct !== null) { deveAtivar = sellerPct <= limiteMax; }
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

function calcularPrecoRegra(precoBase, regra, tipoML, inflar, reduzir, custoFreteGratis = 0, tarifaMLOverride = null, fixedFeeOverride = null) {
  if (!precoBase || !regra || isNaN(precoBase) || precoBase <= 0) return null;
  let custoBaseOriginal = precoBase;
  let totalTaxasVendaPerc = 0;
  (regra.variaveis || []).forEach(v => {
    if (v.tipo === 'fixo_custo') custoBaseOriginal += v.valor;
    else if (v.tipo === 'perc_custo') custoBaseOriginal += custoBaseOriginal * (v.valor / 100);
    else if (v.tipo === 'perc_venda') totalTaxasVendaPerc += v.valor;
  });
  const tarifaML = tarifaMLOverride ?? (tipoML === 'premium' ? 16 : 11);
  const fixedFee = fixedFeeOverride ?? 6;
  const netFactor = 1 - ((tarifaML + totalTaxasVendaPerc) / 100);
  if (netFactor <= 0) return Math.round(custoBaseOriginal * 100) / 100;

  const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);
  let precoAlvo = (custoBaseOriginal + fixedFee) / netFactor;
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
  const { tarefaId, userId, items, modo, regraId, regraIdPorConta, precoManual, precoBaseManual, inflar, reduzir, removerPromocoes, enviarAtacado, ativarPromocoes, toleranciaPromo, precosCSV, precosCSVTipoBase } = job.data;

  const tarefaExiste = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
  if (!tarefaExiste) return { success: false, message: 'Tarefa excluída' };

  await prisma.tarefaFila.updateMany({ where: { id: tarefaId }, data: { status: 'PROCESSANDO', detalhes: `Iniciando... carregando configurações para ${items.length} anúncio(s).` } });

  let sucessos = 0; let falhas = 0; let detalhesLogs = [];

  const contasCache = {};
  const precosTinyMap = {};
  const tarifasCache = {};
  const [regras, configAtacadoDb, userConfig] = await Promise.all([
    prisma.regraPreco.findMany({ where: { userId } }),
    prisma.configAtacado.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { cepOrigem: true, tinyPlano: true } })
  ]);

  const tinyToken = await getTinyAccessToken(userId);
  const tinyLimits = getTinyRateLimit(userConfig?.tinyPlano);
  const regraGlobal = regraIdPorConta ? null : regras.find(r => r.id === regraId);
  const faixasAtacado = (enviarAtacado && configAtacadoDb?.ativo && Array.isArray(configAtacadoDb.faixas)) ? configAtacadoDb.faixas : [];
  const modoCSV = modo === 'csv';

  detalhesLogs.push(`>> Setup: Atacado=${enviarAtacado ? 'Sim' : 'Não'} | Promo=${ativarPromocoes ? 'Sim' : 'Não'} | Tiny=${tinyToken ? 'Conectado' : 'Não'}`);

  // Modo CSV: pré-popula precosTinyMap com dados da planilha (sem chamar Tiny ERP)
  if (modoCSV && precosCSV && typeof precosCSV === 'object') {
    Object.assign(precosTinyMap, precosCSV);
    detalhesLogs.push(`>> Modo CSV: ${Object.keys(precosCSV).length} SKU(s) importados da planilha.`);
  }

  // ✅ PRÉ-CARREGAMENTO ROBUSTO DO TINY ERP COM LÓGICA DE CHUNKS E ATUALIZAÇÃO DA TELA
  if (tinyToken && modo !== 'manual' && !modoCSV) {
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

      if (skuDoAnuncio && tinyToken && precosTinyMap[skuDoAnuncio] === undefined && !modoCSV) {
        const precosTiny = await fetchPrecoTiny(skuDoAnuncio, tinyToken, tinyLimits);
        precosTinyMap[skuDoAnuncio] = (precosTiny && !precosTiny.error) ? precosTiny : (precosTiny?.error ? precosTiny : 'NOT_FOUND');
      }

      // Se o SKU tem erro retryable do pré-carregamento → relança para o sistema de retry exponencial
      const erroTinyPreload = precosTinyMap[skuDoAnuncio]?.error;
      if (skuDoAnuncio && tinyToken && erroTinyPreload && !modoCSV) {
        const isTokenInvalido = erroTinyPreload.includes('Token') || erroTinyPreload.includes('inválido');
        if (!isTokenInvalido) {
          // Rate limit, rede, timeout → retryable; token inválido → falha permanente
          const errRetry = new Error(erroTinyPreload);
          errRetry.code = erroTinyPreload.includes('Limite') ? 'RATE_LIMIT_TINY' : 'ECONNRESET';
          throw errRetry;
        }
      }

      const regra = regraIdPorConta
        ? regras.find(r => r.id === regraIdPorConta[item.contaId])
        : regraGlobal;

      let regraEfetiva = regra;
      if (regra && regra.variacoesPorConta && typeof regra.variacoesPorConta === 'object' && regra.variacoesPorConta[item.contaId]) {
         const variacao = regra.variacoesPorConta[item.contaId];
         if (variacao.variaveis && variacao.variaveis.length > 0) {
           regraEfetiva = {
             ...regra,
             precoBase: variacao.precoBase || regra.precoBase,
             variaveis: variacao.variaveis
           };
         }
      }

      let precoNum = 0;
      if (modo === 'manual') {
        precoNum = calcularPrecoCorrigir(Number(precoManual), inflar || 0, reduzir || 0);
      } else if (modoCSV && !regraEfetiva) {
        // CSV sem regra: usa preço direto da planilha com inflar/reduzir
        const dadosCSV = skuDoAnuncio ? precosTinyMap[skuDoAnuncio] : null;
        if (dadosCSV && dadosCSV !== 'NOT_FOUND' && !dadosCSV.error) {
          const tipoBase = precosCSVTipoBase || 'venda';
          const precoBase = tipoBase === 'custo' ? (Number(dadosCSV.preco_custo) || Number(dadosCSV.preco) || 0)
                          : tipoBase === 'promocional' ? (Number(dadosCSV.preco_promocional) || Number(dadosCSV.preco) || 0)
                          : Number(dadosCSV.preco) || 0;
          precoNum = calcularPrecoCorrigir(precoBase, inflar || 0, reduzir || 0);
        }
      } else if (regraEfetiva) {
        let precoBaseItem = 0;
        if ((tinyToken || modoCSV) && skuDoAnuncio) {
          const dadosTiny = precosTinyMap[skuDoAnuncio];
          if (dadosTiny && dadosTiny !== 'NOT_FOUND' && !dadosTiny.error) precoBaseItem = resolverPrecoBase(dadosTiny, regraEfetiva.precoBase || 'promocional');
        } else {
          precoBaseItem = Number(precoBaseManual) || 0;
        }

        if (precoBaseItem > 0) {
          const logisticType = adData.shipping?.logistic_type || (conta.logistica === 'ME1' ? 'default' : 'drop_off');
          const tarifaCacheKey = `${adData.listing_type_id}|${adData.category_id}|${logisticType}`;
          if (!tarifasCache[tarifaCacheKey]) {
            tarifasCache[tarifaCacheKey] = await mlService.getListingFees({
              accessToken: conta.accessToken,
              price: adData.price || precoBaseItem,
              listingTypeId: adData.listing_type_id || 'gold_pro',
              categoryId: adData.category_id,
              logisticType,
            }).catch(() => ({ percentageFee: tipoML === 'premium' ? 16 : 11, fixedFee: 6 }));
          }
          const { percentageFee: tarifaMLReal, fixedFee: fixedFeeReal } = tarifasCache[tarifaCacheKey];

          let custoFrete = 0;
          if (conta.logistica !== 'ME1') {
            custoFrete = await mlService.simulateShipping({
              accessToken: conta.accessToken, sellerId: conta.id, itemPrice: precoBaseItem * 2,
              categoryId: adData.category_id, listingTypeId: adData.listing_type_id || 'gold_pro',
              itemId: item.id, zipCode: userConfig?.cepOrigem
            }).catch(() => 0);
          }
          precoNum = calcularPrecoRegra(precoBaseItem, regraEfetiva, tipoML, inflar || 0, reduzir || 0, custoFrete, tarifaMLReal, fixedFeeReal);
        }
      }

      if (!precoNum || isNaN(precoNum) || precoNum <= 0) {
        if (!skuDoAnuncio) throw new Error(`Sem SKU.`);
        if (tinyToken || modoCSV) {
          const dadosTiny = precosTinyMap[skuDoAnuncio];
          if (dadosTiny && dadosTiny.error) throw new Error(`${modoCSV ? 'CSV' : 'Tiny ERP'}: ${dadosTiny.error}`);
          const fonte = modoCSV ? 'planilha CSV' : 'Tiny ERP';
          const estadoMapa = dadosTiny === 'NOT_FOUND' ? 'NOT_FOUND' : (dadosTiny === undefined ? 'não encontrado' : `preco=${dadosTiny?.preco}`);
          throw new Error(`${fonte} não retornou preço. [SKU: "${skuDoAnuncio}", mapa: ${estadoMapa}]`);
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
        const logPromo = await ativarPromocoesAuto(item.id, conta.accessToken, inflar || 0, precoNum, toleranciaPromo || 0);
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