import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mlRoutes from './routes/ml.routes.js';
import produtosRoutes from './routes/produtos.routes.js';
import usuarioRoutes from './routes/usuario.routes.js';
import filaRoutes from './routes/fila.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

// Health check para o Railway
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(mlRoutes);
app.use(produtosRoutes);
app.use(usuarioRoutes);
app.use(filaRoutes);

// Serve o frontend buildado em produção
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../dist');
  app.use(express.static(distPath));
  // Fallback para o React Router (SPA)
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export default app;