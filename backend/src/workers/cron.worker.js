import { Worker } from 'bullmq';
import axios from 'axios';
import prisma from '../config/prisma.js';
import { config } from '../config/env.js';
import { mlService } from '../services/ml.service.js';
import { cronQueue, mlSyncQueue, syncQueue } from './queue.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const ML_BASE = 'https://api.mercadolibre.com';

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

  for (const promo of promos) {
    const itens = Array.isArray(promo.itens) ? promo.itens : [];
    const candidatos = itens.filter(i => i.status === 'candidate');
    if (candidatos.length === 0) continue;

    // Calcula % médio do vendedor nos candidatos
    // SELLER_CAMPAIGN (FLEXIBLE_PERCENTAGE) não retorna seller_percentage — calcula a partir do suggested_discounted_price
    const percs = candidatos.map(i => {
      if (i.seller_percentage != null) return i.seller_percentage;
      if (i.sellerPct != null) return i.sellerPct;
      if (i.suggested_discounted_price != null && i.original_price > 0) {
        return (1 - i.suggested_discounted_price / i.original_price) * 100;
      }
      return null;
    }).filter(p => p != null);
    if (percs.length === 0) continue;
    const avgPct = percs.reduce((a, b) => a + b, 0) / percs.length;

    if (avgPct > cfg.maxSellerPct) continue;

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

    // Se autoAtivar, aciona via API (já existe lógica de ativar no controller)
    if (cfg.autoAtivar) {
      const conta = await prisma.contaML.findFirst({ where: { id: promo.contaId } });
      if (conta) {
        try {
          const refreshed = await mlService.refreshToken(conta.refreshToken);
          const token = refreshed?.access_token || conta.accessToken;
          if (refreshed?.access_token) {
            await prisma.contaML.update({ where: { id: conta.id }, data: { accessToken: token } }).catch(() => {});
          }
          for (const item of candidatos) {
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
}

registrarAgendamento().catch(err =>
  console.error('❌ Erro ao registrar agendamento:', err.message)
);

// ===== WORKER: processa os jobs agendados =====
export const cronWorker = new Worker('cron-agenda', async (job) => {

  // ── Atualização automática de preços de concorrentes ──────────────────────
  if (job.name === 'atualizar-concorrentes') {
    console.log('⏰ [Cron] Iniciando atualização de preços de concorrentes...');
    const usuarios = await prisma.user.findMany({ select: { id: true } });
    let totalItens = 0;
    for (const user of usuarios) {
      try {
        const atualizados = await atualizarConcorrentesDeUsuario(user.id);
        totalItens += atualizados;
      } catch (e) {
        console.error(`[Cron-Concorrentes] Erro para userId=${user.id}:`, e.message);
      }
    }
    const resumo = `[Cron-Concorrentes] ${totalItens} concorrente(s) atualizado(s) em ${usuarios.length} usuário(s).`;
    console.log('✅', resumo);
    return { totalItens, usuarios: usuarios.length };
  }

  if (job.name !== 'varredura-diaria') return;

  console.log('⏰ [Cron] Iniciando varredura diária...');

  // Busca todos os usuários com token Tiny configurado
  const usuarios = await prisma.user.findMany({
    select: { id: true, tinyAccessToken: true },
  });

  let contasSincronizadas = 0;
  let usuariosSincronizados = 0;

  for (const user of usuarios) {
    // 1) Sincroniza todas as contas ML do usuário
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

    // 2) Importa produtos novos da Tiny (SKUs ainda não cadastrados no banco)
    if (user.tinyAccessToken) {
      await syncQueue.add(
        'sync-tiny',
        {
          userId: user.id,
          mode: 'novos',
        },
        {
          delay: 35 * 60 * 1000, // 35 minutos após o ML
          attempts: 2,
          backoff: { type: 'fixed', delay: 60000 },
        }
      );
      usuariosSincronizados++;
    }
  }

  // 3) Monitora promoções para cada usuário
  let totalAlertas = 0;
  for (const user of usuarios) {
    try {
      const novas = await verificarMonitorPromocoes(user.id);
      totalAlertas += novas;
    } catch (e) {
      console.error(`[Cron-Monitor] Erro para userId=${user.id}:`, e.message);
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
