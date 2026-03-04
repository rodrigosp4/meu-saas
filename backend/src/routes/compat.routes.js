// =====================================================================
// backend/src/routes/compat.routes.js
// =====================================================================
// Rotas dedicadas para a funcionalidade de Compatibilidade de Autopeças.
//
// IMPORTANTE: Registre este router no app.js:
//   import compatRoutes from './routes/compat.routes.js';
//   app.use(compatRoutes);
// =====================================================================

import { Router } from 'express';
import { compatController } from '../controllers/compat.controller.js';

const router = Router();

// --- Configuração e Atributos ---
router.get('/api/compat/config',              compatController.getConfig);
router.post('/api/compat/attribute-values',   compatController.getAttributeValues);

// --- Busca de Veículos ---
router.post('/api/compat/search-vehicles',    compatController.searchVehicles);

// --- Compatibilidades de Item ---
router.post('/api/compat/load-item',          compatController.loadItemCompatibilities);
router.post('/api/compat/apply-item',         compatController.applyItemCompatibilities);

// --- Perfis de Compatibilidade (CRUD) ---
router.get('/api/compat/perfis',              compatController.listarPerfis);
router.get('/api/compat/perfis/:id',          compatController.carregarPerfil);
router.post('/api/compat/perfis',             compatController.salvarPerfil);
router.delete('/api/compat/perfis/:id',       compatController.deletarPerfil);

export default router;
