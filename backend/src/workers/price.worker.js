import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  tls: {}
};

console.log('⚙️ Worker de Correção de Preço Iniciado...');

export const priceWorker = new Worker('update-price', async (job) => {
  const { tarefaId, userId, items, precoGeral, modoPrecoIndividual, removerPromocoes } = job.data;

  await prisma.tarefaFila.update({
    where: { id: tarefaId },
    data: { status: 'PROCESSANDO' }
  });

  let sucessos = 0;
  let falhas = 0;
  let detalhesErro = [];

  for (const item of items) {
    try {
      const precoNum = modoPrecoIndividual ? Number(item.preco) : Number(precoGeral);
      
      if (!precoNum || isNaN(precoNum) || precoNum <= 0) {
        falhas++;
        detalhesErro.push(`[${item.itemId}] Preço inválido`);
        continue;
      }

      const conta = await prisma.contaML.findFirst({ where: { id: item.contaId, userId } });
      if (!conta) {
        falhas++;
        detalhesErro.push(`[${item.itemId}] Conta não encontrada`);
        continue;
      }

      // Renovação de Token (Padrão)
      const tokenRefreshRes = await mlService.refreshToken(conta.refreshToken).catch(() => null);
      const activeToken = tokenRefreshRes ? tokenRefreshRes.access_token : conta.accessToken;
      
      if (tokenRefreshRes) {
        await prisma.contaML.update({
          where: { id: conta.id },
          data: { 
            accessToken: activeToken, 
            refreshToken: tokenRefreshRes.refresh_token,
            expiresAt: BigInt(Date.now() + (tokenRefreshRes.expires_in * 1000))
          }
        });
      }

      // Remover promoções se solicitado
      if (removerPromocoes) {
        try {
          await axios.delete(
            `https://api.mercadolibre.com/seller-promotions/items/${item.itemId}?app_version=v2`,
            { headers: { Authorization: `Bearer ${activeToken}` } }
          );
        } catch (promoError) {
          console.warn(`[priceWorker] Falha ao remover promo de ${item.itemId}:`, promoError.message);
        }
      }

      // Buscar variações do item
      const adData = await mlService.getSingleAdDetails(item.itemId, activeToken);
      const variations = adData.variations || [];

      let updateBody;
      if (variations.length > 0) {
        updateBody = {
          variations: variations.map(v => ({ id: v.id, price: precoNum })),
          available_quantity: adData.available_quantity
        };
      } else {
        updateBody = { 
          price: precoNum, 
          available_quantity: adData.available_quantity 
        };
      }

      // Atualiza o preço no Mercado Livre
      const mlRes = await axios.put(
        `https://api.mercadolibre.com/items/${item.itemId}`,
        updateBody,
        { headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' } }
      );

      // Atualiza no banco de dados local
      await prisma.anuncioML.update({
        where: { id: item.itemId },
        data: { preco: precoNum, dadosML: mlRes.data }
      });

      sucessos++;
      await new Promise(r => setTimeout(r, 200)); // Delay para não tomar rate limit do ML

    } catch (itemError) {
      falhas++;
      const msg = itemError.response?.data?.message || itemError.message;
      detalhesErro.push(`[${item.itemId}] ${msg}`);
    }
  }

  // Gera o status final da tarefa
  const statusFinal = falhas === 0 ? 'CONCLUIDO' : (sucessos === 0 ? 'FALHA' : 'CONCLUIDO'); // "Concluído" com ressalvas se teve sucessos parciais
  
  let relatorio = `✅ Sucessos: ${sucessos} | ❌ Erros: ${falhas}`;
  if (falhas > 0) {
    relatorio += `\nDetalhes dos erros:\n` + detalhesErro.slice(0, 5).join('\n') + (falhas > 5 ? '\n...' : '');
  }

  await prisma.tarefaFila.update({
    where: { id: tarefaId },
    data: { 
      status: statusFinal,
      detalhes: relatorio
    }
  });

  return { sucessos, falhas, relatorio };

}, {
  connection,
  concurrency: 1, // Mantém em 1 para respeitar os limites de alteração de preço do ML
});

priceWorker.on('error', (err) => {
  console.error('❌ Erro no Worker de Preço (Redis):', err.message);
});