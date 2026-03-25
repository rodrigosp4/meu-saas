import { Worker } from 'bullmq';
import axios from 'axios';
import https from 'https';
import http from 'http';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { getTinyRateLimit } from '../utils/tinyRateLimit.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const tinyHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const tinyHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const axiosTiny = axios.create({ httpAgent: tinyHttpAgent, httpsAgent: tinyHttpsAgent, timeout: 20000 });

// ✅ CORREÇÃO: Função segura para ler preços do Tiny (Evita NaN por causa de vírgulas)
function parseTinyPrice(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  return Number(String(val).replace(',', '.'));
}

async function fetchPrecoTiny(sku, tinyToken, tinyLimits, tentativas = 4) {
  const skuStr = String(sku).trim().toLowerCase();
  const delayMs = Math.max(tinyLimits?.delayMs || 1500, 1500);

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      let foundCandidateId = null;
      let isParentCandidate = false;
      let pagina = 1;
      let totalPaginas = 1;
      let falsoErroDaTiny = false;
      let candidateIdsToInspect = [];

      do {
        await delay(delayMs);
        const searchRes = await axiosTiny.post(
          'https://api.tiny.com.br/api2/produtos.pesquisa.php',
          new URLSearchParams({ token: tinyToken, formato: 'JSON', pesquisa: String(sku).trim(), pagina: String(pagina) })
        );

        const retorno = searchRes.data?.retorno;

        if (retorno?.codigo_erro == 8 || String(retorno?.erros?.[0]?.erro || '').toLowerCase().includes('limite')) {
          throw new Error('RATE_LIMIT_JSON');
        }

        if (retorno?.codigo_erro == 2) return { error: 'Token da Tiny inválido' };

        if (retorno?.status === 'Erro' && retorno?.codigo_erro == 20) {
            falsoErroDaTiny = true;
            break;
        }

        if (retorno?.status !== 'OK') break;

        totalPaginas = Number(retorno.numero_paginas || 1);
        const produtos = retorno.produtos || [];

        const exactMatch = produtos.map(p => p.produto).find(p => String(p.codigo || '').trim().toLowerCase() === skuStr);

        if (exactMatch) {
          foundCandidateId = exactMatch.id;
          isParentCandidate = (exactMatch.tipoVariacao === 'P' || exactMatch.classe_produto === 'V');
          break;
        } else {
          candidateIdsToInspect.push(...produtos.map(p => p.produto.id));
        }

        pagina++;
        if (pagina > 10) break; // Limite de segurança de 10 páginas
      } while (!foundCandidateId && pagina <= totalPaginas);

      let variationMatchData = null;
      if (!foundCandidateId && candidateIdsToInspect.length > 0) {
        const paisParaInspecionar =[...new Set(candidateIdsToInspect)].slice(0, 10);
        for (const paiId of paisParaInspecionar) {
           await delay(delayMs);
           const detRes = await axiosTiny.post(
              'https://api.tiny.com.br/api2/produto.obter.php',
              new URLSearchParams({ token: tinyToken, formato: 'JSON', id: paiId })
           );

           const pRetorno = detRes.data?.retorno;
           if (pRetorno?.codigo_erro == 8) throw new Error('RATE_LIMIT_JSON');

           const prod = pRetorno?.produto;
           if (prod && prod.variacoes) {
              let vars = Array.isArray(prod.variacoes) ? prod.variacoes : Object.values(prod.variacoes);
              let varMatch = vars.map(v => v.variacao || v).find(v => String(v.codigo || '').trim().toLowerCase() === skuStr);

              if (!varMatch) {
                  for (const v of vars) {
                      const itemVar = v.variacao || v;
                      const idFilho = itemVar.idProdutoFilho || itemVar.id;
                      if (!idFilho) continue;
                      
                      try {
                          await delay(delayMs);
                          const detFilho = await axiosTiny.post(
                              'https://api.tiny.com.br/api2/produto.obter.php',
                              new URLSearchParams({ token: tinyToken, formato: 'JSON', id: idFilho })
                          );
                          const prodFilho = detFilho.data?.retorno?.produto;
                          if (prodFilho && String(prodFilho.codigo || '').trim().toLowerCase() === skuStr) {
                              varMatch = prodFilho;
                              break;
                          }
                      } catch (e) {}
                  }
              }

              if (varMatch) {
                 // ✅ Usando o parseTinyPrice seguro
                 variationMatchData = {
                    preco: parseTinyPrice(varMatch.preco || prod.preco),
                    preco_promocional: parseTinyPrice(varMatch.preco_promocional || prod.preco_promocional),
                    preco_custo: parseTinyPrice(prod.preco_custo)
                 };
                 break;
              }
           }
        }
      }

      if (variationMatchData) return variationMatchData;

      if (!foundCandidateId) {
          if (falsoErroDaTiny && tentativa < tentativas) {
              await delay(4000 * tentativa);
              continue;
          }
          return null; 
      }

      await delay(delayMs);
      const detRes = await axiosTiny.post(
        'https://api.tiny.com.br/api2/produto.obter.php',
        new URLSearchParams({ token: tinyToken, formato: 'JSON', id: foundCandidateId })
      );

      const retornoDet = detRes.data?.retorno;
      if (retornoDet?.codigo_erro == 8) throw new Error('RATE_LIMIT_JSON');
      const prod = retornoDet?.produto;
      if (!prod) throw new Error('FALHA_OBTER_DETALHE');
      
      // ✅ Usando o parseTinyPrice seguro
      const precoBasico = { 
        preco: parseTinyPrice(prod.preco), 
        preco_promocional: parseTinyPrice(prod.preco_promocional), 
        preco_custo: parseTinyPrice(prod.preco_custo) 
      };
      
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
      if (tentativa < tentativas) { await delay(isRateLimit ? 10000 : (isNetwork ? 6000 * tentativa : 4000 * tentativa)); continue; }
      if (isRateLimit) return { error: `Limite de requisições excedido na API da Tiny (Rate Limit).` };
      if (isNetwork) return { error: `A API da Tiny recusou a conexão (Sobrecarga / Cloudflare).` };
      return { error: `Falha na API Tiny: ${err.message}` };
    }
  }
  return null;
}

console.log('⚙️ Worker de Verificação de Preço Iniciado (v3 - Conexões Estáveis)...');

function calcularPrecoRegra(precoBase, regra, tipoML, inflar, reduzir, custoFreteGratis = 0) {
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

  const tarifaML = tipoML === 'premium' ? 16 : 11;
  const netFactor = 1 - ((tarifaML + totalTaxasVendaPerc) / 100);

  if (netFactor <= 0) return { precoFinal: Math.round(custoBaseOriginal * 100) / 100, precoAlvo: Math.round(custoBaseOriginal * 100) / 100, historico };

  const inflarSafe = Math.min(Math.max(0, inflar), 99);
  
  let precoAlvo = (custoBaseOriginal + 6) / netFactor;
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
    historico.push({ descricao: 'Custo Fixo (ML)', valor: 6.00, tipo: 'custo_ml' });
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
      prisma.user.findUnique({ where: { id: userId }, select: { cepOrigem: true, tinyToken: true, tinyPlano: true } }),
    ]);
    
    const cepOrigem = userConfig?.cepOrigem || '01001000';
    const tinyToken = userConfig?.tinyToken || null;
    const tinyLimits = getTinyRateLimit(userConfig?.tinyPlano);
    
    const regra = regras.find(r => r.id === regraId);
    const precosTinyMap = {};

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
        const concSkus = tinyLimits.blocked ? 0
          : tinyLimits.delayMs <= 500  ? 3
          : tinyLimits.delayMs <= 1000 ? 2
          : 1;

        console.log(`[PriceCheck] Pré-carregando ${skusConhecidos.length} SKUs (concorrência: ${concSkus})...`);

        let skusCarregados = 0;
        await new Promise(resolve => {
          const fila = [...skusConhecidos];
          const emAndamento = new Set();

          function despachar() {
            while (emAndamento.size < concSkus && fila.length > 0) {
              const sku = fila.shift();
              const p = fetchPrecoTiny(sku, tinyToken, tinyLimits).then(precos => {
                // ✅ CORREÇÃO: Trata o NOT_FOUND corretamente no mapa
                precosTinyMap[sku] = (precos && !precos.error) ? precos : (precos?.error ? precos : 'NOT_FOUND');
              }).catch(() => {
                precosTinyMap[sku] = 'NOT_FOUND';
              }).finally(() => {
                skusCarregados++;
                const pct = Math.floor((skusCarregados / skusConhecidos.length) * 100);
                prisma.tarefaFila.updateMany({
                  where: { id: tarefaId },
                  data: { detalhes: `Processando... ${skusCarregados}/${skusConhecidos.length} (${pct}%)\n===\n>> Carregando preços do Tiny ERP...` }
                }).catch(() => {});
                emAndamento.delete(p);
                if (fila.length > 0) despachar();
                else if (emAndamento.size === 0) resolve();
              });
              emAndamento.add(p);
            }
            if (fila.length === 0 && emAndamento.size === 0) resolve();
          }

          if (concSkus > 0) despachar(); else resolve();
        });

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

      if (modo === 'manual') {
        resultadoCalculo = calcularPrecoCorrigir(Number(precoManual), inflar, reduzir);
      } else if (regra) {
        let precoBaseItem = 0;
        
        // ✅ CORREÇÃO CRÍTICA: Bloqueia o uso do "precoBaseManual" vazado da interface caso a intenção seja usar o Tiny
        if (tinyToken && skuDoAnuncio) {
            const dadosTiny = precosTinyMap[skuDoAnuncio];
            if (dadosTiny && dadosTiny !== 'NOT_FOUND' && !dadosTiny.error) {
                precoBaseItem = resolverPrecoBase(dadosTiny, regra.precoBase || 'promocional');
            } else {
                precoBaseItem = 0; // Força falhar se o Tiny deu erro ou não encontrou
            }
        } else {
            // Só usa o preço manual base se a conta NÃO tiver Token do Tiny ou o Anúncio não tiver SKU
            precoBaseItem = Number(precoBaseManual) || 0;
        }
        
        if (precoBaseItem > 0) {
          let custoFrete = 0;
          if (conta.logistica !== 'ME1') {
            await delay(250); 
            const adDadosML = ad.dadosML || {};
            custoFrete = await mlService.simulateShipping({
              accessToken: conta.accessToken,
              sellerId: conta.id,
              itemPrice: precoBaseItem * 2,
              categoryId: adDadosML.category_id,
              listingTypeId: adDadosML.listing_type_id || 'gold_pro',
              zipCode: cepOrigem,
              itemId: ad.id,
              dimensions: '20x15x10,500'
            }).catch(() => 0);
          }
          resultadoCalculo = calcularPrecoRegra(precoBaseItem, regra, tipoML, inflar, reduzir, custoFrete);
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
          await prisma.anuncioML.updateMany({ where: { id: ad.id }, data: { margemPromocional: true } });
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

    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: 'CONCLUIDO', detalhes: `Verificação concluída para ${Object.keys(finalResults).length} anúncios.` }
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