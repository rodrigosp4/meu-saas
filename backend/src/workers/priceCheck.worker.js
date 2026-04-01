import { Worker } from 'bullmq';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';
import { createTinyClient, getTinyAccessToken, listarProdutos, obterProduto } from '../utils/tinyClient.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

      if (exactMatch.tipoVariacao !== 'P') {
        return {
          preco: exactMatch.precos?.preco || 0,
          preco_promocional: exactMatch.precos?.precoPromocional || 0,
          preco_custo: exactMatch.precos?.precoCusto || 0,
        };
      }

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
      if (isUnauth) return { error: 'Token da Tiny inválido' };
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

console.log('⚙️ Worker de Verificação de Preço Iniciado (v3 - Conexões Estáveis)...');

function calcularPrecoRegra(precoBase, regra, tipoML, inflar, reduzir, custoFreteGratis = 0, tarifaMLOverride = null, fixedFeeOverride = null) {
  if (!precoBase || !regra || isNaN(precoBase) || precoBase <= 0) return null;

  let historico = [{ descricao: 'Preço Base (Tiny)', valor: precoBase, tipo: 'valor' }];
  let custoBaseOriginal = precoBase;
  let totalTaxasVendaPerc = 0;

  (regra.variaveis || []).forEach(v => {
    if (v.tipo === 'fixo_custo') {
      custoBaseOriginal += v.valor;
      historico.push({ descricao: v.nome, valor: v.valor, tipo: 'custo' });
    } else if (v.tipo === 'perc_custo') {
      const calcVal = custoBaseOriginal * (v.valor / 100);
      custoBaseOriginal += calcVal;
      historico.push({ descricao: v.nome, valor: calcVal, isPerc: true, originalPerc: v.valor, tipo: 'custo' });
    } else if (v.tipo === 'perc_venda') {
      totalTaxasVendaPerc += v.valor;
    }
  });

  const tarifaML = tarifaMLOverride ?? (tipoML === 'premium' ? 16 : 11);
  const fixedFee = fixedFeeOverride ?? 6;
  const netFactor = 1 - ((tarifaML + totalTaxasVendaPerc) / 100);

  if (netFactor <= 0) return { precoFinal: Math.round(custoBaseOriginal * 100) / 100, precoAlvo: Math.round(custoBaseOriginal * 100) / 100, historico };

  const inflarSafe = Math.min(Math.max(0, inflar), 99);

  let precoAlvo = (custoBaseOriginal + fixedFee) / netFactor;
  let precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;

  let freteAplicado = false;
  let foiReduzido = false;

  if (precoFinal >= 79) {
    let custoComFrete = custoBaseOriginal + custoFreteGratis;
    precoAlvo = custoComFrete / netFactor;
    precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
    freteAplicado = true;

    if (reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) {
      precoFinal = 78.99;
      precoAlvo = inflarSafe > 0 ? precoFinal * (1 - inflarSafe / 100) : precoFinal;
      foiReduzido = true;
      freteAplicado = false;
    }
  }

  precoAlvo = Math.round(precoAlvo * 100) / 100;
  precoFinal = Math.round(precoFinal * 100) / 100;

  if (freteAplicado && custoFreteGratis > 0) {
    historico.push({ descricao: 'Frete Grátis (API ML)', valor: custoFreteGratis, tipo: 'custo_ml' });
  }
  if (!freteAplicado) {
    historico.push({ descricao: 'Custo Fixo (ML)', valor: fixedFee, tipo: 'custo_ml' });
  }
  if (inflarSafe > 0 && !foiReduzido) {
    historico.push({ descricao: `Inflado em ${inflarSafe}% (Margem)`, valor: precoFinal - precoAlvo, isPerc: true, originalPerc: inflarSafe, tipo: 'custo' });
  }
  if (foiReduzido) {
    historico.push({ descricao: `Reduzido para fugir do FG`, valor: -(precoAlvo - 78.99), tipo: 'custo' });
  }

  const tarifaMLValor = precoAlvo * (tarifaML / 100);
  historico.push({ descricao: `Tarifa ML (${tipoML})`, valor: tarifaMLValor, isPerc: true, originalPerc: tarifaML, tipo: 'custo_ml' });

  (regra.variaveis || []).filter(v => v.tipo === 'perc_venda').forEach(taxa => {
    historico.push({ descricao: taxa.nome, valor: precoAlvo * (taxa.valor / 100), isPerc: true, originalPerc: taxa.valor, tipo: 'taxa_venda' });
  });

  return { precoFinal, precoAlvo, historico };
}

function calcularPrecoCorrigir(precoBase, inflar, reduzir) {
    if (!precoBase || isNaN(precoBase) || precoBase <= 0) return null;
    const inflarSafe = Math.min(Math.max(0, inflar), 99);
    let precoAlvo = precoBase;
    let precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
    let foiReduzido = false;

    if (precoFinal >= 79 && reduzir > 0) {
        if (precoFinal * (1 - reduzir / 100) <= 78.99) {
            precoFinal = 78.99;
            precoAlvo = inflarSafe > 0 ? precoFinal * (1 - inflarSafe / 100) : precoFinal;
            foiReduzido = true;
        }
    }
    
    precoAlvo = Math.round(precoAlvo * 100) / 100;
    precoFinal = Math.round(precoFinal * 100) / 100;

    const historico =[
        { descricao: 'Preço Manual', valor: precoAlvo, tipo: 'valor' },
        inflarSafe > 0 ? { descricao: `Inflado em ${inflarSafe}%`, valor: precoFinal - precoAlvo, tipo: 'custo' } : null,
        foiReduzido ? { descricao: `Redutor Frete Grátis`, valor: -Math.abs(precoAlvo - 78.99), tipo: 'custo' } : null
    ].filter(Boolean);

    return { precoFinal, precoAlvo, historico };
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

export const priceCheckWorker = new Worker('price-check-v2', async (job) => {
  console.log(`🚀 [Worker] Nova tarefa de verificação recebida! ID: ${job.data.tarefaId}`);
  const { tarefaId, userId, anuncios, modo, regraId, precoManual, precoBaseManual, inflar, reduzir } = job.data;
  const totalAnuncios = anuncios.length;

  const tarefaExiste = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
  if (!tarefaExiste) {
    console.warn(`⚠️ [Worker] Tarefa ${tarefaId} foi excluída da interface. Cancelando processamento silenciosamente.`);
    return { success: false, message: 'Tarefa excluída pelo usuário' };
  }

  await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { status: 'PROCESSANDO', detalhes: `Preparando ${totalAnuncios} itens...` } });

  try {
    const [regras, userConfig] = await Promise.all([
      prisma.regraPreco.findMany({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { cepOrigem: true, tinyPlano: true } }),
    ]);

    const cepOrigem = userConfig?.cepOrigem || '01001000';
    const tinyToken = await getTinyAccessToken(userId);
    const tinyLimits = getTinyRateLimit(userConfig?.tinyPlano);
    
    const regra = regras.find(r => r.id === regraId);
    const precosTinyMap = {};
    const tarifasCache = {};

    // 1. Otimização: buscar todos os anúncios do banco de uma vez para garantir payload leve do frontend
    // e capturar variações corretamente.
    const inIds = [...new Set(anuncios.map(a => a.id))];
    const dbAnunciosData = [];
    const CHUNK_SIZE = 5000;
    for (let i = 0; i < inIds.length; i += CHUNK_SIZE) {
       const chunk = inIds.slice(i, i + CHUNK_SIZE);
       const dbItems = await prisma.anuncioML.findMany({ where: { id: { in: chunk } } });
       dbAnunciosData.push(...dbItems);
    }
    
    const dbMap = {};
    dbAnunciosData.forEach(item => { dbMap[item.id] = item; });
    
    const anunciosCompletos = anuncios.map(a => {
        const dbAd = dbMap[a.id] || {};
        const adDadosML = dbAd.dadosML || {};
        
        let sku = dbAd.sku || adDadosML.seller_custom_field;
        if (!sku && adDadosML.attributes) {
           sku = adDadosML.attributes.find(x => x.id === 'SELLER_SKU')?.value_name || 
                 adDadosML.attributes.find(x => x.id === 'PART_NUMBER')?.value_name;
        }
        if (!sku && adDadosML.variations && adDadosML.variations.length > 0) {
           sku = adDadosML.variations[0].seller_custom_field ||
                 adDadosML.variations[0].attributes?.find(x => x.id === 'SELLER_SKU')?.value_name ||
                 adDadosML.variations[0].attributes?.find(x => x.id === 'PART_NUMBER')?.value_name;
        }
        // Fallback: usa skusVariacoes salvo no banco (extraído pelo sync com ML)
        if (!sku && dbAd.skusVariacoes && dbAd.skusVariacoes.length > 0) {
           sku = dbAd.skusVariacoes[0];
        }
        if (sku) sku = String(sku).trim();

        return {
            id: a.id,
            contaId: a.contaId,
            sku: sku,
            titulo: dbAd.titulo || a.titulo,
            preco: dbAd.preco || a.preco,
            dadosML: adDadosML,
            precoOriginal: dbAd.precoOriginal || null
        };
    });

    if (tinyToken && modo !== 'manual') {
      const skusConhecidos = [...new Set(anunciosCompletos.map(a => a.sku).filter(Boolean))];
      if (skusConhecidos.length > 0) {
        const chunkPreFetch = tinyLimits.blocked ? 1 : (tinyLimits.concurrency || 2);

        console.log(`[PriceCheck] Pré-carregando ${skusConhecidos.length} SKUs (chunk: ${chunkPreFetch})...`);

        let skusCarregados = 0;
        for (let i = 0; i < skusConhecidos.length; i += chunkPreFetch) {
          const lote = skusConhecidos.slice(i, i + chunkPreFetch);
          await Promise.all(lote.map(async (sku) => {
            try {
              const precos = await fetchPrecoTiny(sku, tinyToken, tinyLimits);
              precosTinyMap[sku] = (precos && !precos.error) ? precos : (precos?.error ? precos : 'NOT_FOUND');
            } catch {
              precosTinyMap[sku] = 'NOT_FOUND';
            }
            skusCarregados++;
          }));
          const pct = Math.floor((skusCarregados / skusConhecidos.length) * 100);
          await prisma.tarefaFila.updateMany({
            where: { id: tarefaId },
            data: { detalhes: `Processando... ${skusCarregados}/${skusConhecidos.length} (${pct}%)\n===\n>> Carregando preços do Tiny ERP...` }
          }).catch(() => {});
        }

        // Segunda passagem: re-tenta SKUs com rate limit após janela resetar
        const skusRateLimit = Object.entries(precosTinyMap)
          .filter(([, v]) => v?.error?.includes('Limite') || v?.error?.includes('limit'))
          .map(([sku]) => sku);

        if (skusRateLimit.length > 0) {
          console.log(`[PriceCheck] ${skusRateLimit.length} SKU(s) com rate limit. Aguardando 65s para re-tentar...`);
          await prisma.tarefaFila.updateMany({
            where: { id: tarefaId },
            data: { detalhes: `Processando... ${skusCarregados}/${skusConhecidos.length} (100%)\n===\n>> ${skusRateLimit.length} SKU(s) com limite excedido. Aguardando 65s para re-tentar...` }
          }).catch(() => {});
          await delay(65000);

          for (let i = 0; i < skusRateLimit.length; i += chunkPreFetch) {
            const lote = skusRateLimit.slice(i, i + chunkPreFetch);
            await Promise.all(lote.map(async (sku) => {
              try {
                const precos = await fetchPrecoTiny(sku, tinyToken, tinyLimits, 4);
                if (precos && !precos.error) precosTinyMap[sku] = precos;
                else if (precos?.error) precosTinyMap[sku] = precos;
              } catch { /* mantém erro anterior */ }
            }));
            const recuperados = skusRateLimit.slice(0, i + chunkPreFetch).filter(s => precosTinyMap[s] && !precosTinyMap[s]?.error).length;
            await prisma.tarefaFila.updateMany({
              where: { id: tarefaId },
              data: { detalhes: `Processando... ${skusCarregados}/${skusConhecidos.length} (100%)\n===\n>> Re-tentando SKUs: ${Math.min(i + chunkPreFetch, skusRateLimit.length)}/${skusRateLimit.length} (${recuperados} recuperados)` }
            }).catch(() => {});
          }

          const totalRecuperados = skusRateLimit.filter(s => precosTinyMap[s] && !precosTinyMap[s]?.error).length;
          console.log(`[PriceCheck] Re-tentativa concluída: ${totalRecuperados}/${skusRateLimit.length} recuperados.`);
        }

        console.log(`[PriceCheck] Pré-carga concluída. ${Object.keys(precosTinyMap).length} SKUs em cache.`);
      }
    }

    const contasCache = {};
    const finalResults = {};
    let processedCount = 0;

    for (const ad of anunciosCompletos) {
      if (!contasCache[ad.contaId]) {
         const c = await prisma.contaML.findUnique({ where: { id: ad.contaId } });
         contasCache[ad.contaId] = c;
      }
      const conta = contasCache[ad.contaId];

      if (conta && Date.now() + 300000 >= Number(conta.expiresAt)) {
         try {
           const refreshed = await mlService.refreshToken(conta.refreshToken).catch(() => null);
           if (refreshed?.access_token) {
             conta.accessToken = refreshed.access_token;
             conta.expiresAt = BigInt(Date.now() + (refreshed.expires_in * 1000));
             await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: conta.accessToken, refreshToken: refreshed.refresh_token, expiresAt: conta.expiresAt }});
           }
         } catch(e) {}
      }
      
      const tipoML = ad.dadosML?.listing_type_id?.includes('pro') ? 'premium' : 'classico';
      let resultadoCalculo = null;

      let skuDoAnuncio = ad.sku; // Já extraído e tratado acima

      // ✅ CORREÇÃO: Busca individual garantindo cache de 'NOT_FOUND' 
      if (skuDoAnuncio && tinyToken && precosTinyMap[skuDoAnuncio] === undefined) {
        const precosTiny = await fetchPrecoTiny(skuDoAnuncio, tinyToken, tinyLimits);
        precosTinyMap[skuDoAnuncio] = (precosTiny && !precosTiny.error) ? precosTiny : (precosTiny?.error ? precosTiny : 'NOT_FOUND');
      }

      let regraEfetiva = regra;
      if (regra && regra.variacoesPorConta && typeof regra.variacoesPorConta === 'object' && regra.variacoesPorConta[ad.contaId]) {
         const variacao = regra.variacoesPorConta[ad.contaId];
         if (variacao.variaveis && variacao.variaveis.length > 0) {
           regraEfetiva = {
             ...regra,
             precoBase: variacao.precoBase || regra.precoBase,
             variaveis: variacao.variaveis
           };
         }
      }

      if (modo === 'manual') {
        resultadoCalculo = calcularPrecoCorrigir(Number(precoManual), inflar, reduzir);
      } else if (regraEfetiva) {
        let precoBaseItem = 0;
        
        // ✅ CORREÇÃO CRÍTICA: Bloqueia o uso do "precoBaseManual" vazado da interface caso a intenção seja usar o Tiny
        if (tinyToken && skuDoAnuncio) {
            const dadosTiny = precosTinyMap[skuDoAnuncio];
            if (dadosTiny && dadosTiny !== 'NOT_FOUND' && !dadosTiny.error) {
                precoBaseItem = resolverPrecoBase(dadosTiny, regraEfetiva.precoBase || 'promocional');
            } else {
                precoBaseItem = 0; // Força falhar se o Tiny deu erro ou não encontrou
            }
        } else {
            // Só usa o preço manual base se a conta NÃO tiver Token do Tiny ou o Anúncio não tiver SKU
            precoBaseItem = Number(precoBaseManual) || 0;
        }
        
        if (precoBaseItem > 0) {
          const adDadosML = ad.dadosML || {};
          const logisticType = adDadosML.shipping?.logistic_type || (conta.logistica === 'ME1' ? 'default' : 'drop_off');
          const tarifaCacheKey = `${adDadosML.listing_type_id}|${adDadosML.category_id}|${logisticType}`;
          if (!tarifasCache[tarifaCacheKey]) {
            tarifasCache[tarifaCacheKey] = await mlService.getListingFees({
              accessToken: conta.accessToken,
              price: ad.preco || precoBaseItem,
              listingTypeId: adDadosML.listing_type_id || 'gold_pro',
              categoryId: adDadosML.category_id,
              logisticType,
            }).catch(() => ({ percentageFee: tipoML === 'premium' ? 16 : 11, fixedFee: 6 }));
          }
          const { percentageFee: tarifaMLReal, fixedFee: fixedFeeReal } = tarifasCache[tarifaCacheKey];

          let custoFrete = 0;
          if (conta.logistica !== 'ME1') {
            await delay(250);
            custoFrete = await mlService.simulateShipping({
              accessToken: conta.accessToken,
              sellerId: conta.id,
              itemPrice: precoBaseItem * 2,
              categoryId: adDadosML.category_id,
              listingTypeId: adDadosML.listing_type_id || 'gold_pro',
              zipCode: cepOrigem,
              itemId: ad.id,
            }).catch(() => 0);
          }
          resultadoCalculo = calcularPrecoRegra(precoBaseItem, regraEfetiva, tipoML, inflar, reduzir, custoFrete, tarifaMLReal, fixedFeeReal);
        }
      }

      if (resultadoCalculo && resultadoCalculo.precoFinal > 0) {
        const { precoFinal: precoInflado, precoAlvo, historico } = resultadoCalculo;
        
        const temPromoAtiva = ad.precoOriginal && ad.precoOriginal > ad.preco;

        let precoComparacao = ad.preco;
        let precoReferencia = precoInflado;

        if (inflar > 0) {
           if (temPromoAtiva) {
              precoReferencia = precoAlvo;
           } else {
              precoReferencia = precoInflado;
           }
        }

        const diferenca = ((precoComparacao - precoReferencia) / precoReferencia) * 100;
        let status = 'perfeito';
        
        if (Math.abs(diferenca) > 0.5) {
           status = diferenca > 0 ? 'lucro' : 'prejuizo';
        } else if (temPromoAtiva && inflar > 0) {
           status = 'perfeito_promo';
        }

        finalResults[ad.id] = {
          precoCalculado: precoAlvo,
          precoDE: precoInflado,
          diferenca,
          status,
          titulo: ad.titulo,
          inflar,
          historico
        };

        if (inflar > 0 && (status === 'perfeito' || status === 'perfeito_promo')) {
          await prisma.anuncioML.updateMany({ where: { id: ad.id }, data: { margemPromocional: true, inflarPct: inflar } });
        }
        
      } else {
         let msgErro = "Cálculo falhou";
         if (!skuDoAnuncio) {
            msgErro = "Anúncio sem SKU configurado ou PART_NUMBER.";
         } else if (tinyToken) {
            const dadosTiny = precosTinyMap[skuDoAnuncio];
            if (dadosTiny && dadosTiny.error) {
               msgErro = `Tiny ERP: ${dadosTiny.error}`;
            } else if (!dadosTiny || dadosTiny === 'NOT_FOUND') {
               msgErro = `Não localizado na Tiny (SKU: ${skuDoAnuncio})`;
            } else {
               msgErro = `Preço base zerado na Tiny (SKU: ${skuDoAnuncio})`;
            }
         } else {
            msgErro = "Faltando preço base manual e API Tiny não conectada.";
         }

         finalResults[ad.id] = {
             precoCalculado: 0,
             precoDE: 0,
             diferenca: 0,
             status: 'erro',
             titulo: ad.titulo,
             inflar: inflar || 0,
             historico:[{ descricao: 'Erro', valor: 0, tipo: 'valor', msg: msgErro }]
         };
      }

      processedCount++;
      await job.updateProgress(Math.floor((processedCount / totalAnuncios) * 100));

      await prisma.tarefaFila.updateMany({
        where: { id: tarefaId },
        data: { detalhes: `Processando... ${processedCount}/${totalAnuncios} (${Math.floor((processedCount / totalAnuncios) * 100)}%)` }
      });

      if (processedCount % 5 === 0) {
        const ainda = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
        if (!ainda) {
          console.warn(`⚠️ [Worker] Tarefa ${tarefaId} deletada durante execução. Abortando.`);
          return { success: false, message: 'Tarefa cancelada pelo usuário' };
        }
      }
    }

    const registroExistente = await prisma.verificacaoPreco.findUnique({
      where: { userId }
    });
    
    const resultadosAtuais = registroExistente?.resultados || {};
    const resultadosMesclados = { ...resultadosAtuais, ...finalResults };

    await prisma.verificacaoPreco.upsert({
      where: { userId },
      update: { resultados: resultadosMesclados },
      create: { userId, resultados: resultadosMesclados }
    });

    const countByStatus = Object.values(finalResults).reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    const errosDetalhados = Object.entries(finalResults)
      .filter(([, r]) => r.status === 'erro')
      .map(([id, r]) => `  ❌ ${id} — ${r.historico?.[0]?.msg || 'erro desconhecido'}`)
      .join('\n');
    const logFinal = [
      `✅ Verificação concluída: ${Object.keys(finalResults).length} anúncios processados.`,
      ``,
      `Resumo do Lote:`,
      `  ✓ Perfeito:   ${(countByStatus.perfeito || 0) + (countByStatus.perfeito_promo || 0)}`,
      `  📈 Com Lucro:  ${countByStatus.lucro || 0}`,
      `  📉 Prejuízo:   ${countByStatus.prejuizo || 0}`,
      `  ⚠️ Com Erro:   ${countByStatus.erro || 0}`,
      ...(errosDetalhados ? [``, `Detalhes por Anúncio:`, errosDetalhados] : []),
    ].join('\n');
    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: 'CONCLUIDO', detalhes: logFinal }
    });

    return { success: true, count: Object.keys(finalResults).length };

  } catch (error) {
    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: 'FALHA', detalhes: error.message }
    });
    throw error;
  }
}, {
  connection,
  concurrency: 1,
  stalledInterval: 300000,
  lockDuration: 300000,
});

priceCheckWorker.on('error', (err) => {
  console.error('❌ Erro no Worker de Verificação de Preço:', err.message);
});