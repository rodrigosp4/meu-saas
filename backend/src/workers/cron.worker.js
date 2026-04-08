import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { sincronizarReclamacoes } from '../services/reclamacoes.service.js';
import { cronQueue, mlSyncQueue, syncQueue, syncBlingQueue } from './queue.js';
import { isAssinaturaAtiva } from '../utils/assinatura.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const ML_BASE = 'https://api.mercadolibre.com';

// ===== HELPER: token por conta (para notificações) =====
async function getTokenParaConta(conta) {
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    const token = refreshed?.access_token || conta.accessToken;
    if (refreshed?.access_token) {
      await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
    }
    return token;
  } catch {
    return conta.accessToken;
  }
}


// ===== VERIFICAR MENSAGENS NÃO LIDAS + PERGUNTAS PENDENTES =====
async function atualizarCacheNotificacoes(userId) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const contas = await prisma.contaML.findMany({
    where: { userId },
    select: { id: true, nickname: true, accessToken: true, refreshToken: true },
  });

  // Busca conversas silenciadas para excluí-las da contagem
  const silenciadas = await prisma.conversaLida.findMany({
    where: { userId },
    select: { contaId: true, packId: true, countAtTime: true },
  });
  const silenciadasMap = new Map(silenciadas.map(s => [`${s.contaId}:${s.packId}`, s.countAtTime]));

  let totalMsgNaoLidas = 0;
  for (const conta of contas) {
    try {
      const token = await getTokenParaConta(conta);
      const resp = await axios.get(
        `${ML_BASE}/messages/unread?role=seller&tag=post_sale`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );
      const results = resp.data?.results || [];
      for (const r of results) {
        const packId = r.resource?.match(/packs\/(\d+)/)?.[1] || '';
        const key = `${conta.id}:${packId}`;
        const countAtTime = silenciadasMap.get(key);
        // Inclui só se não está silenciada ou se chegou nova mensagem
        // Conta conversas (não soma de mensagens) para bater com o que o Pós-Venda exibe
        if (countAtTime === undefined || r.count > countAtTime) {
          totalMsgNaoLidas += 1;
        }
      }
      await delay(300);
    } catch (e) {
      if (e.response?.status === 429) await delay(2000);
    }
  }

  // Busca e salva perguntas UNANSWERED do ML para pré-popular o cache
  const idsRetornadosPeloML = new Set();
  for (const conta of contas) {
    try {
      const token = await getTokenParaConta(conta);
      const resp = await axios.get(
        `${ML_BASE}/questions/search?seller_id=${conta.id}&api_version=4&status=UNANSWERED&limit=50`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );
      const questions = resp.data?.questions || [];
      for (const q of questions) {
        idsRetornadosPeloML.add(String(q.id));
        await prisma.perguntaML.upsert({
          where: { id: String(q.id) },
          update: { status: q.status, textoResposta: q.answer?.text || null, dadosML: q },
          create: {
            id: String(q.id),
            contaId: conta.id,
            itemId: q.item_id,
            compradorId: String(q.from?.id || ''),
            textoPergunta: q.text,
            textoResposta: q.answer?.text || null,
            status: q.status,
            dataCriacao: new Date(q.date_created),
            dataResposta: q.answer?.date_created ? new Date(q.answer.date_created) : null,
            dadosML: q,
          },
        }).catch(() => {});
      }
      await delay(500);
    } catch (e) {
      if (e.response?.status === 429) await delay(3000);
    }
  }

  // Marca como ANSWERED no banco as que o ML não retornou mais como pendentes
  if (idsRetornadosPeloML.size > 0) {
    const pendentesNoBanco = await prisma.perguntaML.findMany({
      where: { conta: { userId }, status: 'UNANSWERED' },
      select: { id: true },
    });
    const idsDesatualizados = pendentesNoBanco
      .map(p => p.id)
      .filter(id => !idsRetornadosPeloML.has(id));
    if (idsDesatualizados.length > 0) {
      await prisma.perguntaML.updateMany({
        where: { id: { in: idsDesatualizados } },
        data: { status: 'ANSWERED' },
      });
    }
  }

  const perguntasPendentes = await prisma.perguntaML.count({
    where: { conta: { userId }, status: 'UNANSWERED' },
  });

  // Reclamações abertas não lidas
  const reclamacoesPendentes = await sincronizarReclamacoes(userId);

  await prisma.notificacaoCache.upsert({
    where: { userId },
    create: { userId, msgNaoLidas: totalMsgNaoLidas, perguntasPendentes, reclamacoesPendentes },
    update: { msgNaoLidas: totalMsgNaoLidas, perguntasPendentes, reclamacoesPendentes },
  });
}

// ===== SYNC DE PROMOÇÕES PARA O CRON =====
// Busca promoções frescas da API do ML e atualiza a tabela promoML antes de verificar alertas.
// Só rebusca itens se o cache tiver mais de 6h (evita sobrecarregar a API do ML).
async function sincronizarPromocoesParaCron(userId) {
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
  const contas = await prisma.contaML.findMany({ where: { userId } });
  if (contas.length === 0) return;

  for (const conta of contas) {
    try {
      const token = await getTokenParaConta(conta);
      const headers = { Authorization: `Bearer ${token}` };

      // Busca lista de promoções da conta
      let allPromos = [];
      let offset = 0;
      const limit = 50;
      while (true) {
        const r = await axios.get(
          `https://api.mercadolibre.com/seller-promotions/users/${conta.id}?app_version=v2&limit=${limit}&offset=${offset}`,
          { headers, timeout: 15000 }
        );
        const batch = r.data.results || [];
        allPromos.push(...batch);
        const paging = r.data.paging || {};
        if (offset + limit >= (paging.total || 0) || batch.length === 0) break;
        offset += limit;
        await new Promise(r => setTimeout(r, 300));
      }
      console.log(`[Cron-PromoSync] Conta ${conta.nickname || conta.id}: ${allPromos.length} promoções encontradas.`);

      // Atualiza cada promoção no banco, buscando itens apenas se necessário
      for (const promo of allPromos) {
        try {
          const existente = await prisma.promoML.findUnique({
            where: { id_contaId: { id: promo.id, contaId: conta.id } },
          });

          const statusAtivo = promo.status === 'started' || promo.status === 'pending';
          let items = existente?.itens || [];

          if (statusAtivo) {
            const statusMudou = existente?.status !== promo.status;
            const cacheExpirado = !existente?.fetchedAt ||
              (Date.now() - new Date(existente.fetchedAt).getTime()) > CACHE_TTL_MS;

            if (statusMudou || cacheExpirado) {
              // Busca itens atualizados via API
              let allItems = [];
              let searchAfter = null;
              let itemOffset = 0;
              for (let page = 0; page < 50; page++) {
                try {
                  const params = new URLSearchParams({ promotion_type: promo.type, app_version: 'v2', limit: '50' });
                  if (searchAfter) params.set('search_after', searchAfter);
                  else if (itemOffset > 0) params.set('offset', itemOffset.toString());
                  const res = await axios.get(
                    `https://api.mercadolibre.com/seller-promotions/promotions/${promo.id}/items?${params}`,
                    { headers, timeout: 15000 }
                  );
                  const itens = res.data.results || [];
                  if (itens.length > 0) allItems.push(...itens);
                  const paging = res.data.paging || {};
                  searchAfter = paging.searchAfter || paging.search_after || null;
                  if (searchAfter) { if (itens.length === 0) break; }
                  else { itemOffset += 50; if (itemOffset >= (paging.total || 0) || itens.length === 0) break; }
                  await new Promise(r => setTimeout(r, 200));
                } catch (e) {
                  if (e.response?.status === 500 || e.response?.status === 404) break;
                  break;
                }
              }
              items = allItems;
            }
          }

          await prisma.promoML.upsert({
            where: { id_contaId: { id: promo.id, contaId: conta.id } },
            create: {
              id: promo.id, contaId: conta.id, tipo: promo.type,
              sub_type: promo.sub_type || null, status: promo.status,
              nome: promo.name || null,
              startDate: promo.start_date ? new Date(promo.start_date) : null,
              finishDate: promo.finish_date ? new Date(promo.finish_date) : null,
              itens: items, dadosML: promo,
            },
            update: {
              tipo: promo.type, sub_type: promo.sub_type || null, status: promo.status,
              nome: promo.name || null,
              startDate: promo.start_date ? new Date(promo.start_date) : null,
              finishDate: promo.finish_date ? new Date(promo.finish_date) : null,
              itens: items, dadosML: promo,
              ...(statusAtivo ? { fetchedAt: new Date() } : {}),
            },
          });
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.error(`[Cron-PromoSync] Erro ao salvar promo ${promo.id}:`, e.message);
        }
      }
    } catch (e) {
      console.error(`[Cron-PromoSync] Erro na conta ${conta.id}:`, e.message);
    }
  }
}

// ===== MONITOR DE PROMOÇÕES =====
async function verificarMonitorPromocoes(userId) {
  const cfg = await prisma.monitorPromoConfig.findUnique({ where: { userId } });
  if (!cfg || !cfg.ativo) return 0;

  const tiposIgnorar = Array.isArray(cfg.tiposIgnorar) ? cfg.tiposIgnorar : [];
  const contasML = await prisma.contaML.findMany({ where: { userId }, select: { id: true } });
  const contaIds = contasML.map(c => c.id);
  if (contaIds.length === 0) return 0;

  // Busca promos pending/started que tenham itens candidatos e estejam dentro do limite
  const promos = await prisma.promoML.findMany({
    where: {
      contaId: { in: contaIds },
      status: { in: ['pending', 'started'] },
      ...(tiposIgnorar.length > 0 ? { tipo: { notIn: tiposIgnorar } } : {}),
    },
  });

  let novasAlertas = 0;

  const getItemPct = (i) => {
    if (i.seller_percentage != null) return i.seller_percentage;
    if (i.sellerPct != null) return i.sellerPct;
    if (i.suggested_discounted_price != null && i.original_price > 0) {
      return (1 - i.suggested_discounted_price / i.original_price) * 100;
    }
    return null;
  };

  for (const promo of promos) {
    const itens = Array.isArray(promo.itens) ? promo.itens : [];
    const candidatos = itens.filter(i => i.status === 'candidate');
    if (candidatos.length === 0) continue;

    let candidatosElegiveis = candidatos;
    let avgPct;

    if (cfg.usarDescontoDinamico) {
      // Modo dinâmico: cada item tem seu próprio limite baseado no inflarPct salvo no anuncio
      const itemIds = candidatos.map(i => i.id).filter(Boolean);
      const anuncios = await prisma.anuncioML.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, inflarPct: true },
      });
      const inflarMap = Object.fromEntries(anuncios.map(a => [a.id, a.inflarPct || 0]));

      candidatosElegiveis = candidatos.filter(i => {
        const pct = getItemPct(i);
        if (pct == null) return false;
        const limite = inflarMap[i.id] || 0;
        return limite > 0 && pct <= limite;
      });

      if (candidatosElegiveis.length === 0) continue;

      const percs = candidatosElegiveis.map(i => getItemPct(i)).filter(p => p != null);
      avgPct = percs.reduce((a, b) => a + b, 0) / percs.length;
    } else {
      // Modo fixo: usa maxSellerPct global
      // SELLER_CAMPAIGN (FLEXIBLE_PERCENTAGE) não retorna seller_percentage — calcula a partir do suggested_discounted_price
      const percs = candidatos.map(i => getItemPct(i)).filter(p => p != null);
      if (percs.length === 0) continue;
      avgPct = percs.reduce((a, b) => a + b, 0) / percs.length;
      if (avgPct > cfg.maxSellerPct) continue;
    }

    // Cria alerta se ainda não existir
    try {
      await prisma.promoAlerta.upsert({
        where: { userId_promoId: { userId, promoId: promo.id } },
        create: {
          userId,
          contaId: promo.contaId,
          promoId: promo.id,
          tipo: promo.tipo,
          nome: promo.nome,
          sellerPct: avgPct,
        },
        update: { sellerPct: avgPct, nome: promo.nome },
      });
      novasAlertas++;
    } catch {
      // já existe, ignora
    }

    // Se autoAtivar, aciona via API — no modo dinâmico ativa apenas os itens elegíveis
    if (cfg.autoAtivar) {
      const conta = await prisma.contaML.findFirst({ where: { id: promo.contaId } });
      if (conta) {
        try {
          const refreshed = await mlService.refreshToken(conta.refreshToken);
          const token = refreshed?.access_token || conta.accessToken;
          if (refreshed?.access_token) {
            await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
          }
          for (const item of candidatosElegiveis) {
            try {
              const body = { promotion_id: promo.id, promotion_type: promo.tipo };
              if (item.offer_id) body.offer_id = item.offer_id;
              // SELLER_CAMPAIGN retorna price=0 para candidatos; usa suggested_discounted_price como deal_price
              const dealPrice = item.suggested_discounted_price ?? (item.price > 0 ? item.price : null);
              if (dealPrice) body.deal_price = dealPrice;
              await axios.post(
                `${ML_BASE}/seller-promotions/items/${item.id}?app_version=v2`,
                body,
                { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
              );
              await new Promise(r => setTimeout(r, 300));
            } catch (e) {
              console.error(`[Monitor] erro ao auto-ativar item ${item.id}:`, e.response?.data?.message || e.message);
            }
          }
          // Marca como aceita automaticamente
          await prisma.promoAlerta.update({
            where: { userId_promoId: { userId, promoId: promo.id } },
            data: { aceita: true },
          }).catch(() => {});
        } catch (e) {
          console.error(`[Monitor] erro ao auto-ativar promo ${promo.id}:`, e.message);
        }
      }
    }
  }

  return novasAlertas;
}

async function getAuthHeaders(userId) {
  const conta = await prisma.contaML.findFirst({ where: { userId } });
  if (!conta) return {};
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    const token = refreshed?.access_token || conta.accessToken;
    if (refreshed?.access_token) {
      await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
    }
    return { Authorization: `Bearer ${token}` };
  } catch {
    return { Authorization: `Bearer ${conta.accessToken}` };
  }
}

async function atualizarConcorrentesDeUsuario(userId) {
  const headers = await getAuthHeaders(userId);
  const attrs = 'id,title,price,available_quantity,sold_quantity,thumbnail,permalink,seller_id,seller';
  const grupos = await prisma.grupoMonitoramento.findMany({ where: { userId } });
  let total = 0;

  for (const grupo of grupos) {
    const concorrentes = await prisma.concorrenteAnuncio.findMany({ where: { grupoId: grupo.id } });
    if (concorrentes.length === 0) continue;

    const itensMLB = concorrentes.filter(c => c.id.startsWith('MLB') && !c.id.startsWith('MLBU'));

    for (let i = 0; i < itensMLB.length; i += 20) {
      const chunk = itensMLB.slice(i, i + 20);
      const ids = chunk.map(c => c.id).join(',');
      try {
        const mlRes = await axios.get(`${ML_BASE}/items?ids=${ids}&attributes=${attrs}`, { headers, timeout: 15000 });
        const results = Array.isArray(mlRes.data) ? mlRes.data : [];
        for (const r of results) {
          if (r.code !== 200) continue;
          const item = r.body;
          const prev = chunk.find(c => c.id === item.id);
          const estoqueRange = typeof item.available_quantity === 'string' ? item.available_quantity : null;
          await prisma.concorrenteAnuncio.update({
            where: { id: item.id },
            data: { preco: item.price || 0, estoqueRange, vendas: item.sold_quantity || 0 }
          });
          if (prev && Math.abs((item.price || 0) - prev.preco) > 0.001) {
            await prisma.precoHistorico.create({ data: { itemId: item.id, preco: item.price || 0 } });
          }
          total++;
        }
      } catch (e) {
        console.error('[Cron-Concorrentes] erro no chunk MLB:', e.message);
      }
    }

    const outros = concorrentes.filter(c => c.id.startsWith('MLBU') || c.id.startsWith('CAT-'));
    for (const prev of outros) {
      try {
        let currentPrice = 0;
        if (prev.id.startsWith('MLBU')) {
          const res = await axios.get(`${ML_BASE}/user-products/${prev.id}`, { headers, timeout: 10000 });
          currentPrice = res.data.price || 0;
        } else {
          const rawId = prev.id.replace('CAT-', '');
          const res = await axios.get(`${ML_BASE}/products/${rawId}`, { headers, timeout: 10000 });
          currentPrice = res.data.buy_box_winner?.price || res.data.price || 0;
        }
        if (currentPrice > 0) {
          await prisma.concorrenteAnuncio.update({ where: { id: prev.id }, data: { preco: currentPrice } });
          if (Math.abs(currentPrice - prev.preco) > 0.001) {
            await prisma.precoHistorico.create({ data: { itemId: prev.id, preco: currentPrice } });
          }
          total++;
        }
      } catch (e) {
        console.error('[Cron-Concorrentes] erro no item especial:', e.message);
      }
    }
  }
  return total;
}

// ===== REGISTRA O JOB REPETÍVEL (2h da manhã, horário de Brasília) =====
// BullMQ garante idempotência: chamadas repetidas com o mesmo jobId não duplicam.
async function registrarAgendamento() {
  await cronQueue.add(
    'varredura-diaria',
    {},
    {
      jobId: 'varredura-diaria-cron',
      repeat: { cron: '0 2 * * *', tz: 'America/Sao_Paulo' },
    }
  );
  console.log('📅 Agendamento diário registrado: varredura às 02:00 (Brasília)');

  await cronQueue.add(
    'atualizar-concorrentes',
    {},
    {
      jobId: 'atualizar-concorrentes-cron',
      repeat: { cron: '0 */6 * * *', tz: 'America/Sao_Paulo' },
    }
  );
  console.log('📅 Agendamento registrado: atualizar concorrentes a cada 6h');

  await cronQueue.add(
    'verificar-notificacoes',
    {},
    {
      jobId: 'verificar-notificacoes-cron',
      repeat: { cron: '0 * * * *', tz: 'America/Sao_Paulo' }, // a cada 1 hora
    }
  );
  console.log('📅 Agendamento registrado: verificar notificações a cada 1h');
}

registrarAgendamento().catch(err =>
  console.error('❌ Erro ao registrar agendamento:', err.message)
);

// ===== WORKER: processa os jobs agendados =====
export const cronWorker = new Worker('cron-agenda', async (job) => {

  // ── Verificar mensagens não lidas e perguntas pendentes ───────────────────
  if (job.name === 'verificar-notificacoes') {
    console.log('⏰ [Cron] Verificando notificações (mensagens + perguntas)...');
    const usuarios = await prisma.user.findMany({ select: { id: true } });
    let processados = 0;
    for (const user of usuarios) {
      if (!(await isAssinaturaAtiva(user.id))) continue;
      try {
        await atualizarCacheNotificacoes(user.id);
        processados++;
      } catch (e) {
        console.error(`[Cron-Notif] Erro para userId=${user.id}:`, e.message);
      }
    }
    console.log(`✅ [Cron-Notif] Cache atualizado para ${processados}/${usuarios.length} usuário(s) com assinatura ativa.`);
    return { usuarios: processados };
  }

  // ── Atualização automática de preços de concorrentes ──────────────────────
  if (job.name === 'atualizar-concorrentes') {
    console.log('⏰ [Cron] Iniciando atualização de preços de concorrentes...');
    const usuarios = await prisma.user.findMany({ select: { id: true } });
    let totalItens = 0;
    let processados = 0;
    for (const user of usuarios) {
      if (!(await isAssinaturaAtiva(user.id))) continue;
      try {
        const atualizados = await atualizarConcorrentesDeUsuario(user.id);
        totalItens += atualizados;
        processados++;
      } catch (e) {
        console.error(`[Cron-Concorrentes] Erro para userId=${user.id}:`, e.message);
      }
    }
    const resumo = `[Cron-Concorrentes] ${totalItens} concorrente(s) atualizado(s) em ${processados}/${usuarios.length} usuário(s) com assinatura ativa.`;
    console.log('✅', resumo);
    return { totalItens, usuarios: processados };
  }

  if (job.name !== 'varredura-diaria') return;

  console.log('⏰ [Cron] Iniciando varredura diária...');

  // Busca todos os usuários com token Tiny ou Bling configurado
  const usuarios = await prisma.user.findMany({
    select: { id: true, tinyAccessToken: true, blingAccessToken: true, erpAtivo: true },
  });

  // 1) Sincroniza promoções da API do ML (atualiza cache promoML) e depois ativa
  let totalAlertas = 0;
  for (const user of usuarios) {
    if (!(await isAssinaturaAtiva(user.id))) continue;
    try {
      await sincronizarPromocoesParaCron(user.id);
    } catch (e) {
      console.error(`[Cron-PromoSync] Erro para userId=${user.id}:`, e.message);
    }
    try {
      const novas = await verificarMonitorPromocoes(user.id);
      totalAlertas += novas;
    } catch (e) {
      console.error(`[Cron-Monitor] Erro para userId=${user.id}:`, e.message);
    }
  }

  let contasSincronizadas = 0;
  let usuariosSincronizados = 0;

  // 2) Sincroniza todas as contas ML e Tiny (após ativação de promoções)
  for (const user of usuarios) {
    if (!(await isAssinaturaAtiva(user.id))) continue;
    const contasML = await prisma.contaML.findMany({
      where: { userId: user.id },
      select: { id: true, refreshToken: true },
    });

    for (const conta of contasML) {
      await mlSyncQueue.add(
        'sync-ml',
        {
          contaId: conta.id,
          accessToken: null,          // o worker de sync-ml renova o token automaticamente
          refreshToken: conta.refreshToken,
          importarApenasNovos: false,
        },
        { attempts: 2, backoff: { type: 'fixed', delay: 30000 } }
      );
      contasSincronizadas++;
    }

    // Importa produtos novos do ERP ativo (SKUs ainda não cadastrados no banco)
    if (user.erpAtivo === 'bling' && user.blingAccessToken) {
      await syncBlingQueue.add(
        'sync-bling',
        { userId: user.id, mode: 'novos' },
        {
          delay: 35 * 60 * 1000,
          attempts: 2,
          backoff: { type: 'fixed', delay: 60000 },
        }
      );
      usuariosSincronizados++;
    } else if (user.tinyAccessToken) {
      await syncQueue.add(
        'sync-tiny',
        { userId: user.id, mode: 'novos' },
        {
          delay: 35 * 60 * 1000,
          attempts: 2,
          backoff: { type: 'fixed', delay: 60000 },
        }
      );
      usuariosSincronizados++;
    }
  }

  const resumo = `[Cron] Varredura concluída: ${contasSincronizadas} conta(s) ML, ${usuariosSincronizados} sync(s) Tiny, ${totalAlertas} alerta(s) de promoção gerado(s).`;
  console.log('✅', resumo);
  return { contasSincronizadas, usuariosSincronizados, totalAlertas };
}, {
  connection,
  concurrency: 1,
});

cronWorker.on('completed', (job, result) => {
  if (result) console.log(`✅ [Cron] Job "${job.name}" finalizado:`, result);
});

cronWorker.on('failed', (job, err) => {
  console.error(`❌ [Cron] Job "${job?.name}" falhou:`, err.message);
});

console.log('⚙️  Worker de Agenda (Cron) iniciado.');
