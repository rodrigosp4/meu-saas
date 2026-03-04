import app from './app.js';
import { config } from './config/env.js';

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

app.listen(config.port, () => {
  console.log(`🚀 Servidor rodando na porta ${config.port}`);
  console.log(`⚙️  Workers BullMQ iniciados e aguardando jobs...`);
});

