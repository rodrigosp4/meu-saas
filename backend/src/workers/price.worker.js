import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

const connection = {
  host: config.redisHost, port: config.redisPort, password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TIPOS_SEM_PROMOTION_ID = new Set(['DOD', 'LIGHTNING']);
const TIPOS_COM_OFFER_ID = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);

async function ativarPromocoesAuto(itemId, accessToken, inflar, precoFinal) {
  try {
    const res = await axios.get(
      `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
    );
    const lista = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    if (lista.length === 0) return "Sem campanhas disponiveis no ML.";

    const candidatos = lista.filter(p => p && p.status === 'candidate' && p.type !== 'PRICE_DISCOUNT');
    if (candidatos.length === 0) return `O ML retornou ${lista.length} promos, mas nenhuma candidata.`;

    const inflarNum = Number(inflar) || 0;
    const precoAlvo = inflarNum > 0 ? precoFinal / (1 + inflarNum / 100) : precoFinal;
    let ativadas = 0, erros = [];

    for (const promo of candidatos) {
      const sellerPct = typeof promo.seller_percentage === 'number' ? promo.seller_percentage : null;

      // ✅ CORREÇÃO 1: Lógica de 'deveAtivar' mais segura.
      // Não ativa mais promoções por padrão se a margem não puder ser validada.
      let deveAtivar = false;
      if (inflarNum === 0) {
        deveAtivar = true; // Se o usuário não quer margem, ativa tudo.
      } else if (sellerPct !== null) {
        // Para campanhas com co-participação, valida apenas a parte do vendedor.
        deveAtivar = sellerPct <= inflarNum;
      }
      // Se não tem seller_percentage, é uma campanha 100% custeada pelo vendedor (DEAL, etc).
      // A validação será feita na etapa de cálculo do 'deal_price' abaixo.
      else if (TIPOS_COM_PRECO.has(promo.type)) {
         deveAtivar = true; 
      } else {
         deveAtivar = false;
         erros.push(`[${promo.type}] Ignorada: Impossível validar margem para este tipo de campanha.`);
      }
      
      if (!deveAtivar) {
        if (!erros.some(e => e.includes(`[${promo.type}]`))) {
            erros.push(`[${promo.type}] Ignorada: fora da margem (${inflarNum}%)`);
        }
        continue;
      }

      try {
        const body = { promotion_type: promo.type };
        if (!TIPOS_SEM_PROMOTION_ID.has(promo.type) && promo.id) body.promotion_id = promo.id;
        const offerId = promo.offer_id || promo.offerId || promo.ref_id || null;
        if (offerId && TIPOS_COM_OFFER_ID.has(promo.type)) body.offer_id = offerId;

        if (TIPOS_COM_PRECO.has(promo.type) && precoFinal > 0) {
          let dealPrice = sellerPct !== null ? precoFinal * (1 - sellerPct / 100) : precoAlvo;

          // Força o preço para dentro da faixa permitida pelo Mercado Livre
          const maxPrice = promo.max_discounted_price || 0;
          const minPrice = promo.min_discounted_price || 0;
          if (maxPrice > 0 && dealPrice > maxPrice) dealPrice = maxPrice;
          if (minPrice > 0 && dealPrice < minPrice) dealPrice = minPrice;
          
          // ✅ CORREÇÃO 2: Validação final contra o preço alvo do usuário.
          // Se o preço final for menor que o alvo (após os ajustes do ML), não ativa.
          if (inflarNum > 0 && dealPrice < (precoAlvo - 0.01)) { // 0.01 de tolerância
            erros.push(`[${promo.type}] Ignorada: Preço mínimo da campanha (R$ ${dealPrice.toFixed(2)}) viola o alvo de R$ ${precoAlvo.toFixed(2)}`);
            continue; // Pula para a próxima promoção candidata
          }
          
          body.deal_price = Math.round(dealPrice * 100) / 100;
        }

        if (promo.type === 'LIGHTNING' && promo.stock?.min) body.stock = Number(promo.stock.min);

        await axios.post(
          `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`,
          body,
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        ativadas++;
        await delay(500);
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
    for (let i = 0; i < 5; i++) {
      const precosRes = await axios.get(`https://api.mercadolibre.com/items/${itemId}/prices`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'show-all-prices': 'true' }
      }).catch(() => ({ data: { prices: [] } }));
      const allPrices = Array.isArray(precosRes.data?.prices) ? precosRes.data.prices : [];
      keepNodes = allPrices.filter(p => !p.conditions?.min_purchase_unit).map(p => ({ id: p.id }));
      if (keepNodes.length > 0) break;
      await delay(2500); // Tempo para o ML indexar
    }

    if (keepNodes.length === 0) return "Falha: O ML não retornou o preço base a tempo.";

    const b2bNodes = [];
    for (const faixa of faixas.slice(0, 5)) {
      const minQtd = Number(faixa.minQtd ?? faixa.quantity ?? faixa.min_purchase_unit);
      const desconto = Number(faixa.desconto ?? faixa.percent ?? faixa.discount);
      if (!Number.isFinite(minQtd) || minQtd <= 1 || !Number.isFinite(desconto)) continue;
      const tierPrice = Math.round(precoAlvo * (1 - desconto / 100) * 100) / 100;
      if (tierPrice <= 0) continue;
      b2bNodes.push({
        amount: tierPrice,
        currency_id: 'BRL',
        conditions: { context_restrictions: ['channel_marketplace', 'user_type_business'], min_purchase_unit: minQtd }
      });
    }

    if (b2bNodes.length > 0) {
      await axios.post(
        `https://api.mercadolibre.com/items/${itemId}/prices/standard/quantity`,
        { prices: [...keepNodes, ...b2bNodes] },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      return `B2B ativado (${b2bNodes.length} faixas).`;
    }
    return "Nenhuma faixa calculável.";
  } catch (e) {
    return `Erro ML B2B: ${JSON.stringify(e.response?.data || e.message)}`;
  }
}

// ... Utilitários de Cálculo ...
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

export const priceWorker = new Worker('update-price', async (job) => {
  const { tarefaId, userId, items, modo, regraId, precoManual, precoBaseManual, inflar, reduzir, removerPromocoes, enviarAtacado, ativarPromocoes } = job.data;

  await prisma.tarefaFila.updateMany({ where: { id: tarefaId }, data: { status: 'PROCESSANDO' } });

  let sucessos = 0; let falhas = 0; let detalhesLogs = [];
  let processedCount = 0;

  const contasCache = {};
  const[regras, skusDb, configAtacadoDb] = await Promise.all([
    prisma.regraPreco.findMany({ where: { userId } }),
    prisma.produto.findMany({ where: { userId }, select: { sku: true, preco: true, dadosTiny: true } }),
    prisma.configAtacado.findUnique({ where: { userId } })
  ]);

  const regra = regras.find(r => r.id === regraId);
  const precosTinyMap = skusDb.reduce((acc, p) => { acc[p.sku] = p.dadosTiny || { preco: p.preco }; return acc; }, {});
  
  const faixasAtacado = (enviarAtacado && configAtacadoDb?.ativo && Array.isArray(configAtacadoDb.faixas)) ? configAtacadoDb.faixas : [];

  // ✅ LOG GERAL NO INÍCIO DA EXECUÇÃO
  detalhesLogs.push(`>> Setup: Atacado Checkbox=${enviarAtacado} (Banco=${configAtacadoDb?.ativo ? 'Sim':'Não'}, Faixas=${faixasAtacado.length}) | Promo Checkbox=${ativarPromocoes} (Inflar=${inflar}%)`);

  for (const item of items) {
    let logDesteItem = `[ID: ${item.id}]`;
    try {
      if (!contasCache[item.contaId]) {
        const c = await prisma.contaML.findFirst({ where: { id: item.contaId, userId } });
        if (c) {
          const tRes = await mlService.refreshToken(c.refreshToken).catch(() => null);
          if (tRes) {
            c.accessToken = tRes.access_token;
            await prisma.contaML.update({ where: { id: c.id }, data: { accessToken: tRes.access_token, refreshToken: tRes.refresh_token }});
          }
        }
        contasCache[item.contaId] = c;
      }
      
      const conta = contasCache[item.contaId];
      if (!conta) throw new Error("Conta não encontrada");

      const adData = await mlService.getSingleAdDetails(item.id, conta.accessToken);
      const tipoML = adData.listing_type_id?.includes('pro') ? 'premium' : 'classico';
      
      let skuDoAnuncio = adData.seller_custom_field;
      if (!skuDoAnuncio && adData.attributes) skuDoAnuncio = adData.attributes.find(a => a.id === 'SELLER_SKU')?.value_name;
      if (!skuDoAnuncio && adData.variations && adData.variations.length > 0) skuDoAnuncio = adData.variations[0].seller_custom_field || adData.variations[0].attributes?.find(a => a.id === 'SELLER_SKU')?.value_name;

      let precoNum = 0;
      if (modo === 'manual') {
        precoNum = calcularPrecoCorrigir(Number(precoManual), inflar || 0, reduzir || 0);
      } else if (regra) {
        let precoBaseItem = Number(precoBaseManual);
        if (skuDoAnuncio && precosTinyMap[skuDoAnuncio]) {
          precoBaseItem = resolverPrecoBase(precosTinyMap[skuDoAnuncio], regra.precoBase || 'promocional');
        }
        if (precoBaseItem > 0) {
          let custoFrete = 0;
          if (conta.logistica !== 'ME1') {
            await delay(250); 
            custoFrete = await mlService.simulateShipping({
              accessToken: conta.accessToken, 
              sellerId: conta.id, 
              itemPrice: precoBaseItem * 2,
              categoryId: adData.category_id, 
              listingTypeId: adData.listing_type_id || 'gold_pro', 
              itemId: item.id,            // ✅ ADICIONE ESTA LINHA
              dimensions: '20x15x10,500'  // fallback
            }).catch(() => 0);
          }
          precoNum = calcularPrecoRegra(precoBaseItem, regra, tipoML, inflar || 0, reduzir || 0, custoFrete);
        }
      }

      if (!precoNum || isNaN(precoNum) || precoNum <= 0) {
        throw new Error(`Cálculo de preço falhou. Verifique o Preço Base do SKU.`);
      }

      // Trecho corrigido com tratamento de erro
      if (removerPromocoes) {
        try {
          await axios.delete(
            `https://api.mercadolibre.com/seller-promotions/items/${item.id}?app_version=v2`,
            { headers: { Authorization: `Bearer ${conta.accessToken}` } }
          );
          logDesteItem += ` | Lmp Promo: OK`; // Adiciona um log de sucesso claro
          await delay(200);
        } catch (deleteError) {
          // Captura a mensagem de erro específica do ML, se houver
          const errorMsg = deleteError.response?.data?.message || deleteError.message;
          // Adiciona um log de AVISO em vez de indicar sucesso
          logDesteItem += ` | Lmp Promo: Falha (${errorMsg})`;
        }
      }

      const variations = adData.variations || [];
      const updateBody = variations.length > 0 ? { variations: variations.map(v => ({ id: v.id, price: precoNum })) } : { price: precoNum };
      
      // ALtera o preço no ML
      await axios.put(`https://api.mercadolibre.com/items/${item.id}`, updateBody, { headers: { Authorization: `Bearer ${conta.accessToken}` } });

      const dbData = { preco: precoNum };
      if ((inflar || 0) > 0) dbData.margemPromocional = true;
      await prisma.anuncioML.update({ where: { id: item.id }, data: dbData });

      logDesteItem += ` | R$${precoNum.toFixed(2)}`;

      // Se vai mexer com atacado ou promoção, o ML exige um respiro
      if (enviarAtacado || ativarPromocoes) {
         await delay(4500); 
      }

      if (enviarAtacado) {
        if (faixasAtacado.length > 0) {
          const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);
          const precoAlvoAtacado = inflarSafe > 0 ? Math.round(precoNum * (1 - inflarSafe / 100) * 100) / 100 : precoNum;
          const logAtacado = await enviarPrecosAtacado(item.id, conta.accessToken, precoAlvoAtacado, faixasAtacado);
          logDesteItem += ` | B2B: ${logAtacado}`;
        } else {
          logDesteItem += ` | B2B: Ignorado (Sem faixas config.)`;
        }
      }

      if (ativarPromocoes) {
        if (enviarAtacado) await delay(2000); // Mais um respiro se enviou atacado
        const logPromo = await ativarPromocoesAuto(item.id, conta.accessToken, inflar || 0, precoNum);
        logDesteItem += ` | Promo: ${logPromo}`;
      }

      sucessos++;
      detalhesLogs.push(logDesteItem);
      
    } catch (itemError) {
      falhas++;
      detalhesLogs.push(`${logDesteItem} Erro: ${itemError.response?.data?.message || itemError.message}`);
    }

    processedCount++;
    await job.updateProgress(Math.floor((processedCount / items.length) * 100));
    await delay(500); // Proteção Rate Limit
  }

  const statusFinal = falhas === 0 ? 'CONCLUIDO' : (sucessos === 0 ? 'FALHA' : 'CONCLUIDO');
  let relatorio = `Resumo do Lote:\n✅ Sucessos: ${sucessos}\n❌ Erros: ${falhas}\n\nDetalhes por Anúncio:\n` + detalhesLogs.join('\n');

  await prisma.tarefaFila.updateMany({ where: { id: tarefaId }, data: { status: statusFinal, detalhes: relatorio } });
  return { sucessos, falhas, relatorio };
}, { connection, concurrency: 1 });

priceWorker.on('error', (err) => console.error('❌ Erro no Worker de Preço:', err.message));