import { Router } from 'express';
import { mlController } from '../controllers/ml.controller.js';

const router = Router();

router.get('/callback', mlController.handleCallback);
router.post('/api/ml/auth', mlController.auth);
router.post('/api/ml/refresh-token', mlController.refreshToken);
router.get('/api/ml/categories', mlController.getCategories);
router.get('/api/ml/categories-all', mlController.getAllCategories);
router.get('/api/ml/category-attributes/:categoryId', mlController.getAttributes);
router.get('/api/ml/predict-category', mlController.predictCategory);
router.post('/api/ml/simulate-shipping', mlController.simulateShipping);
router.post('/api/ml/shipping-cost-items', mlController.getShippingCostItems);
router.post('/api/ml/publish', mlController.publish);

router.post('/api/ml/sync-ads', mlController.syncAds);
router.post('/api/ml/sync-all-ads', mlController.syncAllAds);
router.get('/api/ml/sync-ads-status/:id', mlController.getSyncStatus);
router.get('/api/ml/anuncios', mlController.getAds);

// ✅ NOVO: Endpoint para listar tags únicas dos anúncios
router.get('/api/ml/anuncios/tags', mlController.getAdTags);

router.get('/api/ml/anuncio/:itemId', mlController.getAdById);
router.post('/api/ml/anuncios-por-sku', mlController.getAdsBySku);
router.post('/api/ml/corrigir-preco', mlController.corrigirPreco);

router.get('/api/ml/perguntas', mlController.getPerguntas);
router.get('/api/ml/perguntas/item', mlController.getItemPerguntas);
router.post('/api/ml/responder-pergunta', mlController.responderPergunta);
router.delete('/api/ml/excluir-pergunta/:questionId', mlController.excluirPergunta);

// Webhooks do ML
router.post('/api/ml/webhook', mlController.handleWebhook);
// Rota de sync manual para puxar as que já existem
router.post('/api/ml/sync-perguntas-iniciais', mlController.syncPerguntasIniciais);

export default router;
