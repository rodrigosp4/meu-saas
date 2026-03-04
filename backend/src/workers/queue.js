import { Queue } from 'bullmq';
import { config } from '../config/env.js';

const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  tls: {} // <- OBRIGATÓRIO PARA O UPSTASH FUNCIONAR
};

const defaultOpts = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,  // Mantém só os últimos 50 jobs completos
    removeOnFail: 20       // Mantém só os últimos 20 jobs falhados
  }
};

export const syncQueue = new Queue('sync-tiny', defaultOpts);
export const mlSyncQueue = new Queue('sync-ml', defaultOpts);
export const publishQueue = new Queue('publish-ml', defaultOpts);