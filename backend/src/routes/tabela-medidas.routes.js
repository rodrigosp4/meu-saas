// =====================================================================
// backend/src/routes/tabela-medidas.routes.js
// =====================================================================

import { Router } from 'express';
import { tabelaMedidasController } from '../controllers/tabela-medidas.controller.js';

const router = Router();

// Domínios que suportam tabela de medidas
router.get('/api/tabela-medidas/dominios-ativos', tabelaMedidasController.getDominiosAtivos);

// Ficha técnica para criação de tabela
router.post('/api/tabela-medidas/ficha-tecnica', tabelaMedidasController.getFichaTecnica);

// Busca de tabelas existentes
router.post('/api/tabela-medidas/buscar', tabelaMedidasController.buscarTabelas);

// CRUD de tabelas
router.get('/api/tabela-medidas/:chartId', tabelaMedidasController.getTabela);
router.post('/api/tabela-medidas', tabelaMedidasController.criarTabela);
router.put('/api/tabela-medidas/:chartId', tabelaMedidasController.renomearTabela);
router.delete('/api/tabela-medidas/:chartId', tabelaMedidasController.deletarTabela);

// Linhas da tabela
router.post('/api/tabela-medidas/:chartId/linhas', tabelaMedidasController.adicionarLinha);
router.put('/api/tabela-medidas/:chartId/linhas/:rowId', tabelaMedidasController.modificarLinha);

export default router;
