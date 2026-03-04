import { Worker } from 'bullmq';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  tls: {}
};

console.log('⚙️ Worker de Publicação ML Iniciado...');

export const publishWorker = new Worker('publish-ml', async (job) => {
  const { tarefaId, accessToken, payload, description } = job.data;

  await prisma.tarefaFila.update({
    where: { id: tarefaId },
    data: { status: 'PROCESSANDO' }
  });

  try {
    // TENTATIVA 1: Tenta publicar
    const result = await mlService.publishSmart({ accessToken, payload, description });

    await prisma.tarefaFila.update({
      where: { id: tarefaId },
      data: { status: 'CONCLUIDO', detalhes: `Sucesso! ID ML: ${result.id}` }
    });
    return { success: true, mlId: result.id };

  } catch (error) {
    let erroStr = JSON.stringify(error).toLowerCase();
    let erroObjAtual = error;

    const erroVariacaoNaoPermitida = erroStr.includes('variations_not_allowed');
    const erroTituloInvalido = erroStr.includes('invalid_fields') && erroStr.includes('title');

    // =========================================================================
    // PLANO B (FALLBACK): SEPARAÇÃO DE VARIAÇÕES OU REMOÇÃO DE TÍTULO
    // =========================================================================
    if (erroVariacaoNaoPermitida || erroTituloInvalido) {
        try {
            console.log(`[Worker] Ajustando payload para regras rígidas do ML...`);
            
            if (payload.variations && payload.variations.length > 0) {
                let idsCriados = [];
                for (const variacao of payload.variations) {
                    const payloadSeparado = { ...payload };
                    
                    delete payloadSeparado.variations; 
                    if (erroTituloInvalido) delete payloadSeparado.title;
                    
                    payloadSeparado.price = variacao.price;
                    payloadSeparado.available_quantity = variacao.available_quantity;
                    
                    if (variacao.picture_ids && variacao.picture_ids.length > 0) {
                         payloadSeparado.pictures = variacao.picture_ids.map(img => typeof img === 'string' ? { source: img } : img);
                    }
                    
                    const mapAtributos = new Map();
                    [...(payload.attributes || []), ...(variacao.attributes || []), ...(variacao.attribute_combinations || [])]
                        .forEach(attr => mapAtributos.set(attr.id, attr));
                    payloadSeparado.attributes = Array.from(mapAtributos.values());
                    
                    const r = await mlService.publishSmart({ accessToken, payload: payloadSeparado, description });
                    idsCriados.push(r.id);
                }
                
                await prisma.tarefaFila.update({
                    where: { id: tarefaId },
                    data: { status: 'CONCLUIDO', detalhes: `Sucesso (Desmembrado)! IDs: ${idsCriados.join(', ')}` }
                });
                return { success: true, mlIds: idsCriados };
                
            } else {
                const payloadCorrigido = { ...payload };
                if (erroTituloInvalido) delete payloadCorrigido.title;
                
                const retryRes = await mlService.publishSmart({ accessToken, payload: payloadCorrigido, description });
                await prisma.tarefaFila.update({
                    where: { id: tarefaId },
                    data: { status: 'CONCLUIDO', detalhes: `Sucesso (Adaptado)! ID: ${retryRes.id}` }
                });
                return { success: true, mlId: retryRes.id };
            }
        } catch (e) {
            erroObjAtual = e; 
        }
    }

    // =========================================================================
    // EXTRATOR DETALHADO DE ERROS DO MERCADO LIVRE (A MÁGICA ACONTECE AQUI)
    // =========================================================================
    let erroTxt = "Erro desconhecido ao tentar publicar.";
    const dataML = erroObjAtual.details;

    if (dataML) {
        // Se o ML mandou um array com as "causas" (os campos que deram problema)
        if (dataML.cause && Array.isArray(dataML.cause) && dataML.cause.length > 0) {
            const mensagens = dataML.cause.map(c => {
                let msg = c.message || c.code;
                // Se o ML indicar exatamente qual campo deu erro, nós adicionamos na tela
                if (c.references && c.references.length > 0) {
                    msg += ` (Campo: ${c.references.join(', ')})`;
                }
                return msg;
            });
            erroTxt = mensagens.join(' | ');
        } 
        // Se não tiver "cause", mas tiver uma mensagem direta (ex: token expirado)
        else if (dataML.message) {
            erroTxt = dataML.message;
        } 
        // Em último caso, joga o JSON cru na tela formatado para caber
        else {
            erroTxt = JSON.stringify(dataML).substring(0, 200);
        }
    } else if (erroObjAtual.message) {
        erroTxt = erroObjAtual.message;
    }

    // Tradução de termos comuns do ML para facilitar a vida:
    erroTxt = erroTxt.replace(/item.attributes.missing_required/g, "Faltou preencher um atributo obrigatório na Ficha Técnica");
    erroTxt = erroTxt.replace(/item.title.length/g, "O título é muito longo");
    erroTxt = erroTxt.replace(/item.pictures.missing/g, "O anúncio precisa de pelo menos 1 imagem válida");

    await prisma.tarefaFila.update({
        where: { id: tarefaId },
        data: {
          status: 'FALHA',
          detalhes: erroTxt,
          tentativas: { increment: 1 }
        }
    });

    throw new Error(erroTxt);
  }
}, {
  connection,
  concurrency: 1,
  stalledInterval: 120000,
  lockDuration: 300000,
  drainDelay: 10
});

publishWorker.on('error', (err) => {
  console.error('❌ Erro no Worker de Publicação (Redis):', err.message);
});