import dotenv from 'dotenv';

// Força o carregamento do .env imediatamente
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  tinyApiToken: process.env.TINY_API_TOKEN,
  mlAppId: process.env.ML_APP_ID,
  mlClientSecret: process.env.ML_CLIENT_SECRET,
  mlRedirectUri: process.env.ML_REDIRECT_URI,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // Conexão com o Upstash (com trava de segurança para não dar NaN)
  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  redisPassword: process.env.REDIS_PASSWORD
};

// Log de aviso para facilitar debug no terminal
if (!process.env.REDIS_HOST) {
  console.log("⚠️ AVISO: O arquivo .env não foi detectado ou as variáveis do Redis estão vazias!");
}