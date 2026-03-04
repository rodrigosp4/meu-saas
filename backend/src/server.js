import app from './app.js';
import { config } from './config/env.js';

// Inicia os workers BullMQ junto com o servidor
import './workers/sync.worker.js';

app.listen(config.port, () => {
  console.log(`🚀 Servidor rodando na porta ${config.port}`);
  console.log(`⚙️  Workers BullMQ iniciados e aguardando jobs...`);
});

