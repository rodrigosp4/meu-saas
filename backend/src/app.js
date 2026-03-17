import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mlRoutes from './routes/ml.routes.js';
import produtosRoutes from './routes/produtos.routes.js';
import usuarioRoutes from './routes/usuario.routes.js';
import filaRoutes from './routes/fila.routes.js';
import compatRoutes from './routes/compat.routes.js';
import promocoesRoutes from './routes/promocoes.routes.js';
import catalogoRoutes from './routes/catalogo.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
// AUMENTE O LIMITE DO JSON PARSER AQUI
app.use(express.json({ limit: '50mb' }));

// Health check para o Railway
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(mlRoutes);
app.use(produtosRoutes);
app.use(usuarioRoutes);
app.use(filaRoutes);
app.use(compatRoutes);
app.use(promocoesRoutes);
app.use(catalogoRoutes);

// Serve o frontend buildado em produção
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../dist');
  app.use(express.static(distPath));
  // Fallback para o React Router (SPA)
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export default app;