// backend/src/server.js
import app from './app.js';
import { config } from './config/env.js';
import axios from 'axios';
import https from 'https';
import http from 'http';

// ✅ OTIMIZAÇÃO CRÍTICA: Keep-Alive Global
// Evita a exaustão de portas (TIME_WAIT) e falhas de DNS (getaddrinfo ENOTFOUND / read ECONNRESET)
// ao disparar milhares de requisições para as APIs do Tiny e Mercado Livre nos workers.
axios.defaults.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 10 });
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 10 });

process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// Inicia os workers BullMQ junto com o servidor
import './workers/sync.worker.js';
import './workers/acoes.worker.js';

app.listen(config.port, () => {
  console.log(`🚀 Servidor rodando na porta ${config.port}`);
  console.log(`⚙️  Workers BullMQ iniciados e aguardando jobs...`);
});