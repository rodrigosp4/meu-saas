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
    else if (v.tipo === 'perc_venda') totalTaxasVendaPerc += v.valor; // Somando porcentagens
  });

  const tarifaML = tipoML === 'premium' ? 16 : 11;
  const netFactor = 1 - ((tarifaML + totalTaxasVendaPerc) / 100);

  if (netFactor <= 0) return Math.round(custoBaseOriginal * 100) / 100;

  const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);

  let precoAlvo = (custoBaseOriginal + 6) / netFactor;
  let precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;

  if (precoFinal >= 79) {
    let custoComFrete = custoBaseOriginal + custoFreteGratis;
    precoAlvo = custoComFrete / netFactor;
    precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;

    if (reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) {
      precoFinal = 78.99;
    }
  }

  return Math.round(precoFinal * 100) / 100; // Retorna o valor cheio (inflado) para o ML
}

function calcularPrecoCorrigir(precoBase, inflar, reduzir) {
  if (!precoBase || isNaN(precoBase) || precoBase <= 0) return null;
  const inflarSafe = Math.min(Math.max(0, inflar), 99);
  let precoFinal = inflarSafe > 0 ? precoBase / (1 - inflarSafe / 100) : precoBase;
  if (precoFinal >= 79 && reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) {
    precoFinal = 78.99;
  }
  return Math.round(precoFinal * 100) / 100;
}

console.log('⚙️ Worker de Correção de Preço Iniciado...');

export const priceWorker = new Worker('update-price', async (job) => {
  const { tarefaId, userId, items, modo, regraId, precoManual, precoBaseManual, inflar, reduzir, removerPromocoes } = job.data;

  await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { status: 'PROCESSANDO' } });

  let sucessos = 0; let falhas = 0; let detalhesErro = [];
  let processedCount = 0;

  const contasCache = {};
  const[regras, skusDb] = await Promise.all([
    prisma.regraPreco.findMany({ where: { userId } }),
    prisma.produto.findMany({ where: { userId }, select: { sku: true, preco: true, dadosTiny: true } })
  ]);
  
  const regra = regras.find(r => r.id === regraId);
  const precosTinyMap = skusDb.reduce((acc, p) => { acc[p.sku] = p.dadosTiny || { preco: p.preco }; return acc; }, {});

  for (const item of items) {
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

      // 1. Busca os detalhes mais recentes do anúncio no ML
      const adData = await mlService.getSingleAdDetails(item.id, conta.accessToken);
      const tipoML = adData.listing_type_id?.includes('pro') ? 'premium' : 'classico';
      const categoryId = adData.category_id;
      
      // Encontra o SKU efetivo (pai ou variação)
      let skuDoAnuncio = adData.seller_custom_field;
      if (!skuDoAnuncio && adData.attributes) {
         skuDoAnuncio = adData.attributes.find(a => a.id === 'SELLER_SKU')?.value_name;
      }
      if (!skuDoAnuncio && adData.variations && adData.variations.length > 0) {
         skuDoAnuncio = adData.variations[0].seller_custom_field || adData.variations[0].attributes?.find(a => a.id === 'SELLER_SKU')?.value_name;
      }

      // 2. Calcula o preço (buscando frete se necessário)
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
          // Simula frete para descobrir quanto o ML vai cobrar
          if (conta.logistica !== 'ME1') {
            await delay(250); // Proteção contra Rate Limit
            custoFrete = await mlService.simulateShipping({
              accessToken: conta.accessToken, sellerId: conta.id, itemPrice: precoBaseItem * 2, // estimativa alta para ativar frete grátis e ver o custo
              categoryId, listingTypeId: adData.listing_type_id || 'gold_pro', dimensions: '20x15x10,500'
            }).catch(() => 0);
          }
          precoNum = calcularPrecoRegra(precoBaseItem, regra, tipoML, inflar || 0, reduzir || 0, custoFrete);
        }
      }

      if (!precoNum || isNaN(precoNum) || precoNum <= 0) {
        throw new Error(`Não foi possível calcular o preço (SKU: ${skuDoAnuncio || 'Sem SKU'})`);
      }

      // 3. Remove promoções (opcional)
      if (removerPromocoes) {
        await axios.delete(`https://api.mercadolibre.com/seller-promotions/items/${item.id}?app_version=v2`, { headers: { Authorization: `Bearer ${conta.accessToken}` } }).catch(() => {});
        await delay(100);
      }

      // 4. Atualiza preço no ML
      const variations = adData.variations ||[];
      const updateBody = variations.length > 0 
        ? { variations: variations.map(v => ({ id: v.id, price: precoNum })) }
        : { price: precoNum };

      await axios.put(`https://api.mercadolibre.com/items/${item.id}`, updateBody, { headers: { Authorization: `Bearer ${conta.accessToken}` } });

      // Atualiza banco local
      const dbData = { preco: precoNum };
      if ((inflar || 0) > 0) dbData.margemPromocional = true;
      await prisma.anuncioML.update({ where: { id: item.id }, data: dbData });
      sucessos++;
      
    } catch (itemError) {
      falhas++;
      detalhesErro.push(`[${item.id}] ${itemError.response?.data?.message || itemError.message}`);
    }

    processedCount++;
    await job.updateProgress(Math.floor((processedCount / items.length) * 100));
    await delay(350); // PAUSA DE 350ms ENTRE CADA ANÚNCIO (Proteção anti-bloqueio ML)
  }

  const statusFinal = falhas === 0 ? 'CONCLUIDO' : (sucessos === 0 ? 'FALHA' : 'CONCLUIDO');
  let relatorio = `✅ Sucessos: ${sucessos} | ❌ Erros: ${falhas}`;
  if (falhas > 0) relatorio += `\nDetalhes dos erros:\n` + detalhesErro.slice(0, 10).join('\n') + (falhas > 10 ? '\n...' : '');

  await prisma.tarefaFila.update({ where: { id: tarefaId }, data: { status: statusFinal, detalhes: relatorio } });
  return { sucessos, falhas, relatorio };
}, { connection, concurrency: 1 });

priceWorker.on('error', (err) => console.error('❌ Erro no Worker de Preço (Redis):', err.message));