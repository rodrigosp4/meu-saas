import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { compatService } from '../services/compat.service.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const TIPOS_SEM_PROMOTION_ID = new Set(['DOD', 'LIGHTNING']);
const TIPOS_COM_OFFER_ID = new Set(['MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'PRICE_MATCHING_MELI_ALL', 'BANK', 'PRE_NEGOTIATED']);
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);

// ✅ AGORA RETORNA STRING DE LOG PARA SALVAR NA FILA
async function ativarPromocoesAuto(itemId, accessToken, inflar, precoFinal) {
  try {
    console.log(`[Promos Auto] Buscando promoções para o item ${itemId}...`);
    const res = await axios.get(
      `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
    );
    
    const lista = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    
    if (lista.length === 0) {
      return "0 campanhas candidatas retornadas pelo ML.";
    }

    const candidatos = lista.filter(p => p && p.status === 'candidate' && p.type !== 'PRICE_DISCOUNT');
    if (candidatos.length === 0) {
      return `O item retornou ${lista.length} campanha(s), mas nenhuma estava como 'candidate'.`;
    }

    const inflarNum = Number(inflar) || 0;
    const precoAlvo = inflarNum > 0 ? precoFinal * (1 - inflarNum / 100) : precoFinal;
    let ativadas = 0;
    let erros = [];

    for (const promo of candidatos) {
      const sellerPct = typeof promo.seller_percentage === 'number' ? promo.seller_percentage : null;
      const maxPrice = promo.max_discounted_price || 0;
      const origPrice = promo.original_price || 0;

      let deveAtivar = false;
      if (inflarNum === 0) {
        deveAtivar = true;
      } else if (sellerPct !== null) {
        deveAtivar = sellerPct <= inflarNum;
      } else if (maxPrice > 0 && origPrice > 0) {
        const minDescontoPct = ((origPrice - maxPrice) / origPrice) * 100;
        deveAtivar = minDescontoPct <= inflarNum;
      } else {
        deveAtivar = true;
      }

      if (!deveAtivar) continue;

      try {
        const body = { promotion_type: promo.type };

        if (!TIPOS_SEM_PROMOTION_ID.has(promo.type) && promo.id) body.promotion_id = promo.id;
        
        const offerId = promo.offer_id || promo.offerId || promo.ref_id || null;
        if (offerId && TIPOS_COM_OFFER_ID.has(promo.type)) body.offer_id = offerId;

        if (TIPOS_COM_PRECO.has(promo.type) && precoFinal > 0) {
          let dealPrice = sellerPct !== null ? precoFinal * (1 - sellerPct / 100) : precoAlvo;
          if (maxPrice > 0 && dealPrice > maxPrice) dealPrice = maxPrice;
          const minPrice = promo.min_discounted_price || 0;
          if (minPrice > 0 && dealPrice < minPrice) dealPrice = minPrice;
          body.deal_price = Math.round(dealPrice * 100) / 100;
        }

        if (promo.type === 'LIGHTNING' && promo.stock?.min) {
          body.stock = Number(promo.stock.min);
        }

        console.log(`[Promos Auto] Enviando payload para ${promo.type}:`, JSON.stringify(body));

        await axios.post(
          `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`,
          body,
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        ativadas++;
        await delay(500);
      } catch (e) {
        const msgErro = e.response?.data?.message || e.response?.data?.cause?.[0]?.error_message || e.message;
        erros.push(`[${promo.type}]: ${msgErro}`);
      }
    }

    if (erros.length > 0) return `Ativadas: ${ativadas}. Erros: ${erros.join(' | ')}`;
    return `Sucesso! ${ativadas} promoções ativadas.`;

  } catch (e) {
    return `Falha crítica ao buscar promoções: ${e.response?.data?.message || e.message}`;
  }
}

// ✅ AGORA RETORNA STRING DE LOG PARA SALVAR NA FILA
async function enviarPrecosAtacado(itemId, accessToken, precoAlvo, faixas) {
  try {
    let keepNodes = [];
    console.log(`[Atacado] Buscando preços padrão para ${itemId}...`);

    for (let i = 0; i < 5; i++) {
      const precosRes = await axios.get(`https://api.mercadolibre.com/items/${itemId}/prices`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'show-all-prices': 'true' }
      }).catch(() => ({ data: { prices: [] } }));
      
      const allPrices = Array.isArray(precosRes.data?.prices) ? precosRes.data.prices : [];
      keepNodes = allPrices.filter(p => !p.conditions?.min_purchase_unit).map(p => ({ id: p.id }));
      
      if (keepNodes.length > 0) break;
      await delay(3000); // Tenta de novo se o ML ainda não indexou o preço
    }

    if (keepNodes.length === 0) {
      return "Ignorado: ML não retornou o preço base a tempo.";
    }

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
        conditions: {
          context_restrictions: ['channel_marketplace', 'user_type_business'],
          min_purchase_unit: minQtd
        }
      });
    }

    if (b2bNodes.length > 0) {
      console.log(`[Atacado] Enviando payload PxQ:`, JSON.stringify(b2bNodes));
      await axios.post(
        `https://api.mercadolibre.com/items/${itemId}/prices/standard/quantity`,
        { prices: [...keepNodes, ...b2bNodes] },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      return `Enviado com sucesso (${b2bNodes.length} faixas).`;
    }
    return "Nenhuma faixa válida calculada.";
  } catch (e) {
    const errObj = e.response?.data || e.message;
    return `Erro ML: ${JSON.stringify(errObj)}`;
  }
}

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

console.log('⚙️ Worker de Publicação ML Iniciado...');

export const publishWorker = new Worker('publish-ml', async (job) => {
  const { tarefaId, accessToken: initialToken, contaNome, payload, description, enviarAtacado, inflar, userId, ativarPromocoes, compatibilidades, posicoes } = job.data;

  await prisma.tarefaFila.updateMany({
    where: { id: tarefaId },
    data: { status: 'PROCESSANDO' }
  });

  // Renova token antes de usar — evita falhas por token expirado na fila
  let accessToken = initialToken;
  if (userId && contaNome) {
    try {
      // CadastramentoMassa envia "NickName (classico/premium)" — extrai só o nickname
      const nicknamePuro = contaNome.split(' (')[0].trim();
      const conta = await prisma.contaML.findFirst({ where: { userId, nickname: nicknamePuro } });
      if (conta) {
        const tRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
        if (tRes?.access_token) {
          accessToken = tRes.access_token;
          await prisma.contaML.update({
            where: { id: conta.id },
            data: { accessToken: tRes.access_token, refreshToken: tRes.refresh_token || conta.refreshToken }
          });
        }
      }
    } catch (_) { /* usa token original se refresh falhar */ }
  }

// ✅ CORREÇÃO CHAVE: Variável para armazenar os IDs criados (mesmo se passar pelo Auto-Healer)
let idsCriados = [];
let logCriacao = "";

// backend/src/workers/publish.worker.js

try {
  // TENTATIVA 1: Tenta publicar
  const result = await mlService.publishSmart({ accessToken, payload, description });
  idsCriados.push(result.id);
  logCriacao = `Sucesso! ID: ${result.id}`;
} catch (error) {
  let erroStr = JSON.stringify(error).toLowerCase();
  let erroObjAtual = error;
  let payloadCorrigido = JSON.parse(JSON.stringify(payload)); 
  let precisaTentarNovamente = false;

  // --- AUTO-HEALER BÁSICO ---
  if (erroStr.includes('user has not mode')) {
      if (payloadCorrigido.shipping) delete payloadCorrigido.shipping.mode;
      precisaTentarNovamente = true;
  }
  if (erroStr.includes('shipping.dimensions') || erroStr.includes('dimension')) {
      if (payloadCorrigido.shipping) delete payloadCorrigido.shipping.dimensions;
      precisaTentarNovamente = true;
  }
  if (erroStr.includes('seller_package_')) {
      if (payloadCorrigido.attributes) {
          payloadCorrigido.attributes = payloadCorrigido.attributes.map(attr => {
              if (attr.id.startsWith('SELLER_PACKAGE_')) {
                  const valorNumerico = Math.round(parseFloat(attr.value_name));
                  const unidade = attr.id.includes('WEIGHT') ? 'g' : 'cm';
                  return { ...attr, value_name: `${valorNumerico} ${unidade}` };
              }
              return attr;
          });
      }
      precisaTentarNovamente = true;
  }
  if (erroStr.includes('mandatory free shipping')) {
      if (payloadCorrigido.shipping) payloadCorrigido.shipping.free_shipping = true;
      precisaTentarNovamente = true;
  }

  // ✅ CORREÇÃO: Auto-healer para anúncios simples que rejeitam "family_name" em contas não-migradas
  // A condição foi ajustada para só remover o family_name se o erro for de "campo inválido", e não de "campo ausente".
  if (erroStr.includes('invalid_fields') && (erroStr.includes('family name') || erroStr.includes('family_name')) && (!payloadCorrigido.variations || payloadCorrigido.variations.length === 0) && payloadCorrigido.family_name) {
      delete payloadCorrigido.family_name;
      precisaTentarNovamente = true;
  }

  // ✅ CORREÇÃO: Auto-healer para anúncios simples em contas migradas para User Products.
  // No novo modelo, o campo "title" não deve ser enviado na publicação.
  if (erroStr.includes('invalid_fields') && erroStr.includes('title') && (!payloadCorrigido.variations || payloadCorrigido.variations.length === 0) && payloadCorrigido.title) {
      delete payloadCorrigido.title;
      precisaTentarNovamente = true;
  }

  // Se tem variações e o ML rejeitou com invalid_fields, variations_not_allowed ou family_name

  // Se tem variações e o ML rejeitou com invalid_fields, variations_not_allowed ou family_name
  // Isso indica que a conta já foi migrada para o modelo "User Products" ou a categoria não aceita variações
  const isVariationsError = payloadCorrigido.variations && payloadCorrigido.variations.length > 0 && 
    (erroStr.includes('variations_not_allowed') || 
     erroStr.includes('invalid_fields') || 
     erroStr.includes('family name') || 
     erroStr.includes('family_name') || 
     erroStr.includes('variations is invalid'));

  // Só tenta reenviar o payload corrigido se NÃO for um erro crônico de variações (que exige desmembramento total)
  if (precisaTentarNovamente && !isVariationsError) {
      try {
          const retryRes = await mlService.publishSmart({ accessToken, payload: payloadCorrigido, description });
          idsCriados.push(retryRes.id);
          logCriacao = `Sucesso (Auto-Corrigido)! ID: ${retryRes.id}`;
      } catch (e) {
          erroObjAtual = e; 
          erroStr = JSON.stringify(e).toLowerCase(); 
      }
  }

  // --- DESMEMBRAMENTO DE VARIAÇÕES (NOVO MODELO: USER PRODUCTS) ---
  if (idsCriados.length === 0 && isVariationsError) {
      try {
          // O family_name é a "cola" que unirá os anúncios criados na visão do comprador
          const familyName = payloadCorrigido.family_name || (payloadCorrigido.title ? payloadCorrigido.title.substring(0, 60) : 'Produto');
          
          for (const variacao of payloadCorrigido.variations) {
              const payloadSeparado = { ...payloadCorrigido };
              delete payloadSeparado.variations;
              
              payloadSeparado.family_name = familyName;
              payloadSeparado.price = variacao.price || payloadCorrigido.price;
              payloadSeparado.available_quantity = variacao.available_quantity || 1;

              if (variacao.picture_ids && variacao.picture_ids.length > 0) {
                  payloadSeparado.pictures = variacao.picture_ids.map(img => typeof img === 'string' ? { source: img } : img);
              }

              // Mescla os atributos do Produto Pai com as Características e Combinações (cores/tamanhos) da Variação
              const mapAtributos = new Map();
              [...(payloadCorrigido.attributes || [])].forEach(attr => { if (attr.id) mapAtributos.set(attr.id, attr); });
              [...(variacao.attributes || []), ...(variacao.attribute_combinations || [])].forEach(attr => { if (attr.id) mapAtributos.set(attr.id, attr); });
              payloadSeparado.attributes = Array.from(mapAtributos.values());

              try {
                  const r = await mlService.publishSmart({ accessToken, payload: payloadSeparado, description });
                  idsCriados.push(r.id);
              } catch (eFilho) {
                  const erroFilhoStr = JSON.stringify(eFilho).toLowerCase();
                  // No modelo User Products, o Mercado Livre frequentemente rejeita o campo "title".
                  // Se falhar de novo por invalid_fields focado no título, nós removemos e enviamos novamente.
                  if (erroFilhoStr.includes('invalid_fields') && erroFilhoStr.includes('title')) {
                      delete payloadSeparado.title;
                      const r2 = await mlService.publishSmart({ accessToken, payload: payloadSeparado, description });
                      idsCriados.push(r2.id);
                  } else {
                      throw eFilho; // Caso seja erro de imagem, marca, etc.
                  }
              }
          }
          logCriacao = `Sucesso (Variações Desmembradas / User Products)! IDs criados: ${idsCriados.join(', ')}`;
      } catch (e) {
          erroObjAtual = e;
      }
  }

  // Se falhou mesmo passando por todos os "healers", lança o erro para travar a fila
  if (idsCriados.length === 0) {
    let erroTxt = "Erro desconhecido ao tentar publicar.";
    const dataML = erroObjAtual.details;
    if (dataML?.cause && Array.isArray(dataML.cause) && dataML.cause.length > 0) {
        erroTxt = dataML.cause.map(c => c.message || c.code).join(' | ');
    } else if (dataML?.message) {
        erroTxt = dataML.message;
    } else if (erroObjAtual.message) {
        erroTxt = erroObjAtual.message;
    }
    await prisma.tarefaFila.updateMany({
        where: { id: tarefaId },
        data: { status: 'FALHA', detalhes: erroTxt, tentativas: { increment: 1 } }
    });
    throw new Error(erroTxt);
  }
}

  // ✅ CORREÇÃO CHAVE: Fase 2 - Processar Atacado e Promoções para os IDs criados
  let logAtacadoPromo = "";
  
  if (idsCriados.length > 0 && (enviarAtacado || ativarPromocoes || compatibilidades?.length > 0 || posicoes?.length > 0)) {
    // ⚠️ CRUCIAL: Esperar a indexação do ML. Aumentei para 12s para garantir.
    await delay(12000); 

    const configAtacado = enviarAtacado ? await prisma.configAtacado.findUnique({ where: { userId } }) : null;
    const faixas = configAtacado?.ativo && Array.isArray(configAtacado.faixas) ? configAtacado.faixas : [];

    for (const id of idsCriados) {
      let l = `\n-> Item ${id}:`;
      
      if (enviarAtacado && faixas.length > 0) {
         const precoFinal = payload.price || 0;
         const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);
         const precoAlvo = inflarSafe > 0 ? Math.round(precoFinal * (1 - inflarSafe / 100) * 100) / 100 : precoFinal;
         const respA = await enviarPrecosAtacado(id, accessToken, precoAlvo, faixas);
         l += `\n   📦 Atacado: ${respA}`;
         await delay(1500);
      } else if (enviarAtacado) {
         l += `\n   📦 Atacado: Nenhuma faixa configurada no painel.`;
      }

      if (ativarPromocoes) {
         const respP = await ativarPromocoesAuto(id, accessToken, inflar || 0, payload.price || 0);
         l += `\n   🏷️ Promos: ${respP}`;
      }

      if (compatibilidades?.length > 0) {
        try {
          await compatService.applyItemCompatibilities(accessToken, id, compatibilidades);
          l += `\n   🚗 Compatibilidade: ${compatibilidades.length} veículos aplicados.`;
        } catch (e) {
          l += `\n   ⚠️ Compatibilidade falhou: ${e.message || e}`;
        }
        await delay(2000);
      }

      if (posicoes?.length > 0) {
        try {
          const POSICAO_TIMEOUT_MS = 4 * 60 * 1000;
          await Promise.race([
            compatService.updateAllCompatibilitiesPosition(accessToken, id, posicoes),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout posição')), POSICAO_TIMEOUT_MS))
          ]);
          l += `\n   📍 Posição: ${posicoes.join(', ')}.`;
        } catch (e) {
          l += `\n   ⚠️ Posição falhou: ${e.message || e}`;
        }
      }

      logAtacadoPromo += l;
    }
  }

  // Atualiza a Fila com a string completa de logs
  await prisma.tarefaFila.updateMany({
    where: { id: tarefaId },
    data: { status: 'CONCLUIDO', detalhes: `${logCriacao}${logAtacadoPromo}` }
  });

  return { success: true, mlIds: idsCriados };

}, {
  connection,
  concurrency: 1,
  stalledInterval: 120000,
  lockDuration: 300000,
  drainDelay: 10
});

publishWorker.on('error', (err) => console.error('❌ Erro no Worker de Publicação:', err.message));