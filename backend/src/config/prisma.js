// backend/src/config/prisma.js
// CORRIGIDO: Pool otimizado para Neon Serverless + PgBouncer
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Garante que a conexão seja fechada corretamente ao encerrar o processo
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Captura sinais de encerramento para fechar conexão limpa
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

export default prisma;
