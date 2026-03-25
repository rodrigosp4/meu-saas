import { Queue } from 'bullmq';
import { config } from '../config/env.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  // Tira o "tls: {}" se for ambiente local
  ...(process.env.NODE_ENV === 'production' ? { tls: {} } : {})
};

const defaultOpts = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,  
    removeOnFail: 20       
  }
};

export const syncQueue = new Queue('sync-tiny', defaultOpts);
export const mlSyncQueue = new Queue('sync-ml', defaultOpts);
export const publishQueue = new Queue('publish-ml', defaultOpts);
export const priceQueue = new Queue('update-price', defaultOpts);
export const priceCheckQueue = new Queue('price-check-v2', defaultOpts);
export const acoesMassaQueue = new Queue('acoes-massa', defaultOpts);
export const cronQueue = new Queue('cron-agenda', defaultOpts);
export const promoQueue = new Queue('promo-queue', defaultOpts);

syncQueue.on('error', (err) => console.error('❌ Erro na Queue sync-tiny:', err.message));
mlSyncQueue.on('error', (err) => console.error('❌ Erro na Queue sync-ml:', err.message));
publishQueue.on('error', (err) => console.error('❌ Erro na Queue publish-ml:', err.message));
priceQueue.on('error', (err) => console.error('❌ Erro na Queue update-price:', err.message));
priceCheckQueue.on('error', (err) => console.error('❌ Erro na Queue price-check:', err.message));
acoesMassaQueue.on('error', (err) => console.error('❌ Erro na Queue acoes-massa:', err.message));
cronQueue.on('error', (err) => console.error('❌ Erro na Queue cron-agenda:', err.message));
promoQueue.on('error', (err) => console.error('❌ Erro na Queue promo-queue:', err.message));