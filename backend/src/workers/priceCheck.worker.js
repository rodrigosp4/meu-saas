import { Worker } from 'bullmq';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

console.log('⚙️ Worker de Verificação de Preço Iniciado (v3 - Math Corrigida)...');

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

  // Taxas calculadas em cima do valor ALVO (O que o cliente paga de fato)
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

  // ✅ CORREÇÃO 1: Evita o Erro de "Record to update not found" se a fila for limpa
  const tarefaExiste = await prisma.tarefaFila.findUnique({ where: { id: tarefaId } });
  if (!tarefaExiste) {
    console.warn(`⚠️ [Worker] Tarefa ${tarefaId} foi excluída da interface. Cancelando processamento silenciosamente.`);
    return { success: false, message: 'Tarefa excluída pelo usuário' };
  }

  await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { status: 'PROCESSANDO', detalhes: `Preparando ${totalAnuncios} itens...` } });

  try {
    const [regras] = await Promise.all([
      prisma.regraPreco.findMany({ where: { userId } }),
    ]);
    const regra = regras.find(r => r.id === regraId);
    const skus =[...new Set(anuncios.map(ad => ad.sku).filter(Boolean))];
    const precosTinyRes = await prisma.produto.findMany({ where: { userId, sku: { in: skus } }, select: { sku: true, preco: true, dadosTiny: true } });
    const precosTinyMap = precosTinyRes.reduce((acc, p) => {
      acc[p.sku] = p.dadosTiny || { preco: p.preco };
      return acc;
    }, {});
    
    const contasCache = {};
    const finalResults = {};
    let processedCount = 0;

    for (const ad of anuncios) {
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

      if (modo === 'manual') {
        resultadoCalculo = calcularPrecoCorrigir(Number(precoManual), inflar, reduzir);
      } else if (regra) {
        let precoBaseItem = Number(precoBaseManual);
        if (ad.sku && precosTinyMap[ad.sku]) {
          precoBaseItem = resolverPrecoBase(precosTinyMap[ad.sku], regra.precoBase || 'promocional');
        }
        
        if (precoBaseItem > 0) {
          let custoFrete = 0;
          if (conta && conta.logistica !== 'ME1') {
             custoFrete = await mlService.simulateShipping({
                accessToken: conta.accessToken, sellerId: conta.id, itemPrice: precoBaseItem * 2, 
                categoryId: ad.dadosML?.category_id || 'MLB1144', listingTypeId: ad.dadosML?.listing_type_id || 'gold_pro', dimensions: '20x15x10,500'
             }).catch(() => 0);
             await new Promise(r => setTimeout(r, 200));
          }
          resultadoCalculo = calcularPrecoRegra(precoBaseItem, regra, tipoML, inflar, reduzir, custoFrete);
        }
      }

      if (resultadoCalculo && resultadoCalculo.precoFinal > 0) {
        const { precoFinal: precoInflado, precoAlvo, historico } = resultadoCalculo;
        
        // Verifica se tem promoção ativa lendo o banco (precoOriginal)
        const dbAd = await prisma.anuncioML.findUnique({ where: { id: ad.id }, select: { precoOriginal: true, preco: true } });
        const temPromoAtiva = dbAd?.precoOriginal && dbAd.precoOriginal > dbAd.preco;

        let precoComparacao = dbAd.preco; // Preço que o ML tá cobrando
        let precoReferencia = precoInflado; // O que a gente espera cobrar

        if (inflar > 0) {
           if (temPromoAtiva) {
              // Se a promo tá ativa, o preço principal (ad.preco) precisa bater com o Alvo (já descontado)
              precoReferencia = precoAlvo;
           } else {
              // Se não tá ativa, o preço principal do ML ainda é o Cheio (Inflado)
              precoReferencia = precoInflado;
           }
        }

        const diferenca = ((precoComparacao - precoReferencia) / precoReferencia) * 100;
        let status = 'perfeito';
        
        // Tolerância de até 0.5% (alguns centavos de arredondamento do ML)
        if (Math.abs(diferenca) > 0.5) {
           status = diferenca > 0 ? 'lucro' : 'prejuizo';
        } else if (temPromoAtiva && inflar > 0) {
           status = 'perfeito_promo';
        }

        finalResults[ad.id] = {
          precoCalculado: precoAlvo, // O valor que vc quer ganhar na mão
          precoDE: precoInflado,     // O valor cheio no ML
          diferenca,
          status,
          titulo: ad.titulo,
          inflar,
          historico
        };

        if (inflar > 0 && (status === 'perfeito' || status === 'perfeito_promo')) {
          await prisma.anuncioML.updateMany({ where: { id: ad.id }, data: { margemPromocional: true } });
        }
      }
      processedCount++;
      await job.updateProgress(Math.floor((processedCount / totalAnuncios) * 100));

      if (processedCount % 20 === 0 || processedCount === totalAnuncios) {
         // ✅ CORREÇÃO 2: Usa updateMany. Assim se o usuário deletar a tarefa, não "crasha" o servidor.
         await prisma.tarefaFila.updateMany({
            where: { id: tarefaId },
            data: { detalhes: `Processando: ${processedCount} de ${totalAnuncios} anúncios (${Math.floor((processedCount / totalAnuncios) * 100)}%)...` }
         });
      }
    }

    // ✅ CORREÇÃO 3: Lógica de Mesclar JSON mantida (resolve o problema da UI não atualizar os lotes)
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

    // ✅ CORREÇÃO 4: Usa updateMany para finalização segura
    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: 'CONCLUIDO', detalhes: `Verificação concluída para ${Object.keys(finalResults).length} anúncios.` }
    });

    return { success: true, count: Object.keys(finalResults).length };

  } catch (error) {
    // ✅ CORREÇÃO 5: Usa updateMany para erro seguro
    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: 'FALHA', detalhes: error.message }
    });
    throw error;
  }
}, {
  connection,
  concurrency: 1,
  stalledInterval: 120000,
  lockDuration: 300000,
});

priceCheckWorker.on('error', (err) => {
  console.error('❌ Erro no Worker de Verificação de Preço:', err.message);
});