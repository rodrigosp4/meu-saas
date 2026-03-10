import { Worker } from 'bullmq';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  // Tira o "tls: {}" se for ambiente local
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
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

// ... dentro de export const publishWorker = new Worker(...)

  } catch (error) {
    let erroStr = JSON.stringify(error).toLowerCase();
    let erroObjAtual = error;

    let payloadCorrigido = JSON.parse(JSON.stringify(payload)); // Clone profundo
    let precisaTentarNovamente = false;

    // =========================================================================
    // AUTO-HEALER (SISTEMA DE RECUPERAÇÃO DE ERROS)
    // =========================================================================

    // 1. Erro de Modo de Envio (A conta não aceita ME1 ou ME2 especificamente)
    if (erroStr.includes('user has not mode')) {
        console.log(`[Worker] Auto-Healer: Limpando modo de envio incompatível...`);
        if (payloadCorrigido.shipping) {
            delete payloadCorrigido.shipping.mode;
        }
        precisaTentarNovamente = true;
    }

    // 2. Erro de Dimensões (Fora do padrão exigido pela categoria)
    if (erroStr.includes('shipping.dimensions') || erroStr.includes('dimension')) {
        console.log(`[Worker] Auto-Healer: Removendo envio de dimensões do shipping...`);
        if (payloadCorrigido.shipping) {
            delete payloadCorrigido.shipping.dimensions;
        }
        precisaTentarNovamente = true;
    }

    // 3. Erro de Atributos do Pacote (CORRIGIDO: Força a conversão para inteiro)
    if (erroStr.includes('seller_package_')) {
        console.log(`[Worker] Auto-Healer: Corrigindo formato dos atributos de pacote para inteiro...`);
        if (payloadCorrigido.attributes) {
            // Mapeia os atributos, corrigindo os que deram problema
            payloadCorrigido.attributes = payloadCorrigido.attributes.map(attr => {
                if (attr.id.startsWith('SELLER_PACKAGE_')) {
                    // Extrai apenas o número do valor (ex: "150.0 g" -> 150)
                    const valorNumerico = Math.round(parseFloat(attr.value_name));
                    
                    // Reconstrói o valor no formato "NUMERO UNIDADE"
                    const unidade = attr.id.includes('WEIGHT') ? 'g' : 'cm';
                    const valorCorrigido = `${valorNumerico} ${unidade}`;

                    console.log(`[Worker] Corrigindo atributo ${attr.id}: de "${attr.value_name}" para "${valorCorrigido}"`);
                    
                    // Retorna o atributo corrigido
                    return { ...attr, value_name: valorCorrigido };
                }
                // Mantém os outros atributos intactos
                return attr;
            });
        }
        precisaTentarNovamente = true;
    }
    
    // 4. Erro "Mandatory Free Shipping" (Briga entre boolean vs obrigatório)
    if (erroStr.includes('mandatory free shipping')) {
        console.log(`[Worker] Auto-Healer: Forçando frete grátis true...`);
        if (payloadCorrigido.shipping) {
            payloadCorrigido.shipping.free_shipping = true;
        }
        precisaTentarNovamente = true;
    }
    
    // 5. Título Inválido (Excesso de caracteres ou formato barrado)
    if (erroStr.includes('invalid_fields') && erroStr.includes('title')) {
         console.log(`[Worker] Auto-Healer: Removendo Title para forçar bypass usando family_name...`);
         delete payloadCorrigido.title;
         precisaTentarNovamente = true;
    }

    // --- REENVIO AUTOMÁTICO SE HOUVE HIGIENIZAÇÃO (E não é um problema de variação) ---
    if (precisaTentarNovamente && !erroStr.includes('variations_not_allowed')) {
        try {
            console.log(`[Worker] Re-tentando publicar com Payload higienizado...`);
            const retryRes = await mlService.publishSmart({ accessToken, payload: payloadCorrigido, description });
            
            await prisma.tarefaFila.update({
                where: { id: tarefaId },
                data: { status: 'CONCLUIDO', detalhes: `Sucesso (Auto-Corrigido)! ID: ${retryRes.id}` }
            });
            return { success: true, mlId: retryRes.id };
        } catch (e) {
            erroObjAtual = e; 
            erroStr = JSON.stringify(e).toLowerCase(); // Atualiza a string do erro caso falhe novamente
        }
    }
    
    // =========================================================================
    // CASO EXTREMO: DESMEMBRAMENTO DE VARIAÇÕES
    // =========================================================================
    const erroVariacaoNaoPermitida = erroStr.includes('variations_not_allowed');
    if (erroVariacaoNaoPermitida && payloadCorrigido.variations && payloadCorrigido.variations.length > 0) {
        try {
            console.log(`[Worker] Desmembrando variações em anúncios separados...`);
            let idsCriados =[];
            for (const variacao of payloadCorrigido.variations) {
                const payloadSeparado = { ...payloadCorrigido };
                delete payloadSeparado.variations; 
                
                payloadSeparado.price = variacao.price;
                payloadSeparado.available_quantity = variacao.available_quantity;
                
                if (variacao.picture_ids && variacao.picture_ids.length > 0) {
                     payloadSeparado.pictures = variacao.picture_ids.map(img => typeof img === 'string' ? { source: img } : img);
                }
                
                const mapAtributos = new Map();[...(payloadCorrigido.attributes || []), ...(variacao.attributes || []), ...(variacao.attribute_combinations || [])]
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
            
        } catch (e) {
            erroObjAtual = e; 
        }
    }

    // =========================================================================
    // EXTRATOR DETALHADO DE ERROS (Mantido da versão anterior)
    // =========================================================================
    let erroTxt = "Erro desconhecido ao tentar publicar.";
    const dataML = erroObjAtual.details;

    if (dataML) {
        if (dataML.cause && Array.isArray(dataML.cause) && dataML.cause.length > 0) {
            const mensagens = dataML.cause.map(c => {
                let msg = c.message || c.code;
                if (c.references && c.references.length > 0) {
                    msg += ` (Campo: ${c.references.join(', ')})`;
                }
                return msg;
            });
            erroTxt = mensagens.join(' | ');
        } 
        else if (dataML.message) {
            erroTxt = dataML.message;
        } 
        else {
            erroTxt = JSON.stringify(dataML).substring(0, 200);
        }
    } else if (erroObjAtual.message) {
        erroTxt = erroObjAtual.message;
    }

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