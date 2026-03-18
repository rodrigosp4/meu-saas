// backend/src/workers/acoes.worker.js
import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { compatService } from '../services/compat.service.js';

// Instância segura do Axios com timeout para impedir o congelamento da Fila
const safeAxios = axios.create({ timeout: 25000 });

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('⚙️ Worker de Ações em Massa ML Iniciado (Protegido contra travamentos)...');

export const acoesWorker = new Worker('acoes-massa', async (job) => {
  const { tarefaId, userId, items, acao, valor, modoReplace } = job.data;

  await prisma.tarefaFila.updateMany({
    where: { id: tarefaId },
    data: {
      status: 'PROCESSANDO',
      detalhes: 'Iniciando processamento...'
    }
  });

  try {
    const total = items.length;
    let processados = 0;
    let sucessos = 0;
    let falhas = 0;
    const logsDetalhes = [];

    const salvarProgresso = async () => {
      const pct = total > 0 ? Math.round((processados / total) * 100) : 0;
      await prisma.tarefaFila.updateMany({
        where: { id: tarefaId },
        data: { detalhes: `Processando... ${processados}/${total} (${pct}%) — ${sucessos} sucessos | ${falhas} falhas` }
      }).catch(() => {});
    };

    const porConta = {};
    for (const item of items) {
      if (!porConta[item.contaId]) porConta[item.contaId] = [];
      porConta[item.contaId].push(item);
    }

    for (const [contaId, itensDaConta] of Object.entries(porConta)) {
      const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
      if (!conta) {
        logsDetalhes.push(`❌ Conta ${contaId} não encontrada no banco.`);
        falhas += itensDaConta.length;
        processados += itensDaConta.length;
        await salvarProgresso();
        continue;
      }

      let activeToken = conta.accessToken;
      const margemSeguranca = 5 * 60 * 1000;
      if (Date.now() + margemSeguranca >= Number(conta.expiresAt)) {
        try {
          const tRes = await mlService.refreshToken(conta.refreshToken);
          activeToken = tRes.access_token;
          await prisma.contaML.update({
            where: { id: conta.id },
            data: {
              accessToken: activeToken,
              refreshToken: tRes.refresh_token,
              expiresAt: BigInt(Date.now() + (tRes.expires_in * 1000))
            }
          });
        } catch (e) {
          logsDetalhes.push(`❌ Falha ao renovar token da conta ${conta.nickname}.`);
          falhas += itensDaConta.length;
          processados += itensDaConta.length;
          await salvarProgresso();
          continue;
        }
      }

      const headers = { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' };

      for (const item of itensDaConta) {
        let logAcao = `[${item.id}] `;
        try {
          if (acao === 'ativar' || acao === 'pausar') {
            const status = acao === 'ativar' ? 'active' : 'paused';
            await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { status }, { headers });
            await prisma.anuncioML.update({ where: { id: item.id }, data: { status } });
            logAcao += `Status alterado para ${status.toUpperCase()}.`;

          } else if (acao === 'estoque') {
            const qtd = Number(valor);
            if (item.hasVariations && item.variationsIds?.length > 0) {
              const variations = item.variationsIds.map(vid => ({ id: vid, available_quantity: qtd }));
              await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { variations }, { headers });
            } else {
              await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { available_quantity: qtd }, { headers });
            }
            const novoEstoque = item.hasVariations ? (qtd * item.variationsIds.length) : qtd;
            await prisma.anuncioML.update({ where: { id: item.id }, data: { estoque: novoEstoque } });
            logAcao += `Estoque alterado para ${qtd} un.`;

          } else if (acao === 'flex' || acao === 'turbo') {
            const siteId = item.id.substring(0, 3);
            await safeAxios.post(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${item.id}/v2`, {}, { headers });
            logAcao += `Logística FLEX/TURBO ATIVADA.`;

          } else if (acao === 'remover_flex') {
            const siteId = item.id.substring(0, 3);
            await safeAxios.delete(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${item.id}/v2`, { headers });
            logAcao += `Logística FLEX DESATIVADA com sucesso.`;

          } else if (acao === 'prazo_fabricacao') {
            const dias = Number(valor);
            const saleTermValue = dias > 0 ? `${dias} dias` : null;
            await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, {
              sale_terms: [{ id: 'MANUFACTURING_TIME', value_id: null, value_name: saleTermValue }]
            }, { headers });
            logAcao += `Prazo de fabricação ${dias > 0 ? `definido para ${dias} dias` : 'removido'}.`;

          } else if (acao === 'editar_titulo') {
            const novoTitulo = String(valor || '').trim();
            if (!novoTitulo || novoTitulo.length < 5 || novoTitulo.length > 60) {
              throw new Error('Título inválido ou fora do limite de 5-60 caracteres.');
            }

            let metodoUsado = '';
            let msgErro = '';

            // 1. TENTA O MÉTODO AVANÇADO (Family Name) - funciona mesmo com vendas
            try {
              await safeAxios.put(
                `https://api.mercadolibre.com/items/${item.id}/family_name`,
                { family_name: novoTitulo },
                { headers }
              );
              metodoUsado = 'FamilyName';
            } catch (e) {
              msgErro = e.response?.data?.message || e.message;
              console.warn(`[Ações Massa] Falha no family_name para ${item.id}:`, msgErro);

              // 2. FALLBACK: método tradicional (só para itens sem vendas)
              try {
                await safeAxios.put(
                  `https://api.mercadolibre.com/items/${item.id}`,
                  { title: novoTitulo },
                  { headers }
                );
                metodoUsado = 'TitlePadrão';
              } catch (e2) {
                msgErro = e2.response?.data?.message || e2.message;
                throw new Error(`O Mercado Livre rejeitou a alteração: ${msgErro}`);
              }
            }

            // Atualiza no banco local
            await prisma.anuncioML
              .update({ where: { id: item.id }, data: { titulo: novoTitulo } })
              .catch(() => {});

            logAcao += `Título alterado para: "${novoTitulo}" (Via ${metodoUsado}).`;

          } else if (acao === 'editar_descricao') {
              try {
                await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}/description?api_version=2`, { plain_text: valor }, { headers });
              } catch (e) {
                if (e.response?.status === 404 || e.response?.data?.error === 'not_found') {
                  await safeAxios.post(`https://api.mercadolibre.com/items/${item.id}/description`, { plain_text: valor }, { headers });
                } else throw e;
              }
              logAcao += `Descrição atualizada.`;

          } else if (acao === 'alterar_sku') {
            const novoSku = String(valor || '').trim();
            if (!novoSku) throw new Error('SKU não pode ser vazio.');
            
            let payload;

            // Diferencia o payload para anúncios com e sem variações
            if (item.hasVariations && item.variationsIds?.length > 0) {
              // CASO 2: ANÚNCIO COM VARIAÇÕES
              // O SKU deve ser aplicado a cada variação individualmente.
              // É boa prática limpar o SKU do anúncio "pai".
              payload = {
                attributes: [
                  { id: "SELLER_SKU", value_name: null }
                ],
                variations: item.variationsIds.map(variationId => ({
                  id: variationId,
                  attributes: [
                    { id: "SELLER_SKU", value_name: novoSku }
                  ]
                }))
              };
              logAcao += `SKU alterado para "${novoSku}" em ${item.variationsIds.length} variação(ões).`;

            } else {
              // CASO 1: ANÚNCIO SIMPLES (SEM VARIAÇÕES)
              // Envia apenas o atributo SELLER_SKU. A API do ML faz o merge.
              payload = {
                attributes: [
                  { id: "SELLER_SKU", value_name: novoSku }
                ]
              };
              logAcao += `SKU alterado para "${novoSku}".`;
            }

            // Envia o payload correto para a API do ML
            await safeAxios.put(
              `https://api.mercadolibre.com/items/${item.id}`,
              payload,
              { headers }
            );

            // Atualiza o banco de dados local (apenas o SKU do anúncio pai para referência)
            await prisma.anuncioML.update({ where: { id: item.id }, data: { sku: novoSku } }).catch(() => {});

          } else if (acao === 'posicao') {
            const posArrayBruto = Array.isArray(valor) ? valor : [valor];
            const posArrayDeStrings = posArrayBruto.map(v => String(v || '').trim()).filter(Boolean);

            if (posArrayDeStrings.length === 0) {
              throw new Error('Nenhuma posição válida informada.');
            }

            const logPosicoesStr = posArrayDeStrings.join(' | ');
            logAcao += `Posição [${logPosicoesStr}]`;

            const POSICAO_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutos
            const resultPos = await Promise.race([
              compatService.updateAllCompatibilitiesPosition(activeToken, item.id, posArrayDeStrings),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tempo limite de 4 minutos excedido ao aplicar posição.')), POSICAO_TIMEOUT_MS)
              ),
            ]);

            if (!resultPos?.success) {
              throw new Error(resultPos?.message || 'Falha desconhecida ao aplicar posição.');
            }

            logAcao += ` ${resultPos.message}`;

          } else if (acao === 'compatibilidade') {
            const compatArray = Array.isArray(valor) ? valor : [];
            if (compatArray.length === 0) {
              throw new Error('Nenhuma compatibilidade informada.');
            }
            const COMPAT_TIMEOUT_MS = 4 * 60 * 1000;
            const resultCompat = await Promise.race([
              compatService.applyItemCompatibilities(activeToken, item.id, compatArray),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tempo limite de 4 minutos excedido ao aplicar compatibilidade.')), COMPAT_TIMEOUT_MS)
              ),
            ]);
            if (!resultCompat?.success && resultCompat?.success !== undefined) {
              throw new Error(resultCompat?.message || 'Falha desconhecida ao aplicar compatibilidade.');
            }
            logAcao += `Compatibilidade aplicada (${compatArray.length} veículos).`;
            await prisma.anuncioML.update({ where: { id: item.id }, data: { tagPrincipal: null } }).catch(() => {});

          } else if (acao === 'atualizar_atributos') {
            const attributes = Array.isArray(valor) ? valor : [];
            if (attributes.length === 0) throw new Error('Nenhum atributo informado.');
            let attrFail = 0, attrFailIds = [];
            let pendentes = [...attributes];
            let ultimoErro = null;
            while (pendentes.length > 0) {
              try {
                await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { attributes: pendentes }, { headers });
                break;
              } catch (err) {
                const msg = err.response?.data?.message || err.message || '';
                const rejeitados = [];
                const regex = /Attribute \[([^\]]+)\] is not valid/gi;
                let m;
                while ((m = regex.exec(msg)) !== null) rejeitados.push(m[1]);
                if (rejeitados.length === 0) {
                  ultimoErro = err;
                  break;
                }
                const antes = pendentes.length;
                pendentes = pendentes.filter(a => !rejeitados.includes(a.id));
                const removidos = antes - pendentes.length;
                attrFail += removidos;
                attrFailIds.push(...rejeitados.filter(id => !attrFailIds.includes(id)));
                ultimoErro = err;
                if (pendentes.length === 0) break;
              }
            }
            const attrOk = attributes.length - attrFail;
            if (attrOk === 0 && ultimoErro) throw new Error(ultimoErro.response?.data?.message || ultimoErro.message);
            const anuncio = await prisma.anuncioML.findUnique({ where: { id: item.id }, select: { tagPrincipal: true } });
            if (anuncio?.tagPrincipal === 'incomplete_technical_specs') {
              await prisma.anuncioML.update({ where: { id: item.id }, data: { tagPrincipal: null } }).catch(() => {});
            }
            logAcao += `${attrOk} atributo(s) atualizado(s)${attrFail > 0 ? ` | ⚠️ ${attrFail} rejeitado(s) pelo ML: ${attrFailIds.join(', ')}` : ''}.`;

          } else if (acao === 'atualizar_imagens') {
            const pictures = Array.isArray(valor) ? valor : [];
            if (pictures.length === 0) throw new Error('Nenhuma imagem informada.');
            let finalPictures = pictures;
            if (modoReplace === 'FIRST') {
              try {
                const itemRes = await safeAxios.get(`https://api.mercadolibre.com/items/${item.id}?attributes=pictures`, { headers });
                const existingIds = (itemRes.data?.pictures || []).map(p => ({ id: p.id }));
                finalPictures = [...pictures, ...existingIds];
              } catch (_) {}
            }
            await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { pictures: finalPictures }, { headers });
            const anuncio = await prisma.anuncioML.findUnique({ where: { id: item.id }, select: { tagPrincipal: true } });
            if (anuncio?.tagPrincipal === 'poor_quality_thumbnail' || anuncio?.tagPrincipal === 'poor_quality_picture') {
              await prisma.anuncioML.update({ where: { id: item.id }, data: { tagPrincipal: null } }).catch(() => {});
            }
            logAcao += `${finalPictures.length} imagem(ns) atualizada(s)${modoReplace === 'FIRST' ? ' (manteve existentes)' : ''}.`;

          } else if (acao === 'excluir') {
            await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { status: 'closed' }, { headers });
            await delay(3000);
            await safeAxios.put(`https://api.mercadolibre.com/items/${item.id}`, { deleted: 'true' }, { headers });
            await prisma.anuncioML.update({ where: { id: item.id }, data: { status: 'deleted' } }).catch(() => {});
            logAcao += `Anúncio EXCLUÍDO permanentemente.`;
          }

          sucessos++;
          logsDetalhes.push(`✅ ${logAcao}`);
          await delay(250);

        } catch (err) {
          falhas++;

          let msgErro = err.message;

          if (err.isAxiosError || err.response) {
            const data = err.response?.data || {};

            if (Array.isArray(data.cause) && data.cause.length > 0) {
              const causas = data.cause
                .map(c => `${c.code || 'sem_code'} | ${c.message || c.description || c.error_message || 'sem_message'} | refs: ${Array.isArray(c.references) ? c.references.join(', ') : ''}`)
                .join(' || ');

              msgErro = `${data.message || data.error || `HTTP ${err.response?.status}`} - ${causas}`;
            } else if (data.cause && typeof data.cause === 'string') {
              msgErro = `${data.message || data.error || `HTTP ${err.response?.status}`} - ${data.cause}`;
            } else {
              msgErro = data.message || data.error || `HTTP ${err.response?.status}`;
            }
          }

          logsDetalhes.push(`❌ ${logAcao} ERRO: ${msgErro}`);
        }

        processados++;
        if (processados % 10 === 0) await salvarProgresso();
      }
    }

    const statusFinal = falhas === 0 ? 'CONCLUIDO' : (sucessos === 0 ? 'FALHA' : 'CONCLUIDO');
    const relatorio = `Resumo: ${sucessos} Sucessos | ${falhas} Falhas\n\nLogs Detalhados:\n${logsDetalhes.join('\n')}`;

    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: statusFinal, detalhes: relatorio }
    });

    return { sucessos, falhas };
  } catch (fatalError) {
    await prisma.tarefaFila.updateMany({
      where: { id: tarefaId },
      data: { status: 'FALHA', detalhes: `Erro fatal no processamento: ${fatalError.message}` }
    }).catch(() => {});
    throw fatalError;
  }
}, { connection, concurrency: 1 });

acoesWorker.on('failed', async (job, err) => {
  if (job?.data?.tarefaId) {
    await prisma.tarefaFila.updateMany({
      where: { id: job.data.tarefaId, status: 'PROCESSANDO' },
      data: { status: 'FALHA', detalhes: `Job falhou criticamente: ${err.message}` }
    }).catch(() => {});
  }
});

acoesWorker.on('error', (err) => console.error('❌ Erro no Worker de Ações em Massa:', err.message));