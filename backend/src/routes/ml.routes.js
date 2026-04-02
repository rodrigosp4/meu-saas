import { Router } from 'express';
import { mlController } from '../controllers/ml.controller.js';

const router = Router();

router.get('/callback', mlController.handleCallback);
router.post('/api/ml/auth', mlController.auth);
router.post('/api/ml/refresh-token', mlController.refreshToken);
router.get('/api/ml/categories', mlController.getCategories);
router.get('/api/ml/categories-all', mlController.getAllCategories);
router.get('/api/ml/category-attributes/:categoryId', mlController.getAttributes);
router.get('/api/ml/item-category/:itemId', mlController.getItemCategory);
router.get('/api/ml/item-description/:itemId', mlController.getItemDescription);
router.get('/api/ml/item-clone-data/produto/:produtoId', mlController.getProdutoCloneData);
router.get('/api/ml/item-clone-data/:itemId', mlController.getItemCloneData);
router.get('/api/ml/item-pictures/:itemId', mlController.getItemPictures);
router.post('/api/ml/gerar-descricao-ia', mlController.gerarDescricaoIA);
router.get('/api/ml/predict-category', mlController.predictCategory);
router.post('/api/ml/simulate-shipping', mlController.simulateShipping);
router.post('/api/ml/shipping-cost-items', mlController.getShippingCostItems);
router.post('/api/ml/publish', mlController.publish);

router.post('/api/ml/sync-ads', mlController.syncAds);
router.post('/api/ml/sync-all-ads', mlController.syncAllAds);
router.get('/api/ml/sync-ads-status/:id', mlController.getSyncStatus);
router.delete('/api/ml/sync-ads/:id', mlController.cancelSync);
router.get('/api/ml/anuncios', mlController.getAds);

// ✅ NOVO: Endpoint para listar tags únicas dos anúncios
router.get('/api/ml/anuncios/tags', mlController.getAdTags);
router.get('/api/ml/recomendacoes-replicacao', mlController.getRecomendacoesReplicacao);
// Endpoint para retornar apenas IDs (usado no "Selecionar Todos os Filtrados")
router.get('/api/ml/anuncios/ids', mlController.getAdIds);

router.get('/api/ml/anuncio/:itemId', mlController.getAdById);
router.get('/api/ml/item-performance/:itemId', mlController.getItemPerformance);
router.post('/api/ml/sync-selected-ads', mlController.syncSelectedAds);
router.post('/api/ml/anuncios-por-sku', mlController.getAdsBySku);
router.post('/api/ml/anuncios-por-skus', mlController.getAdsBySkuList);
router.post('/api/ml/corrigir-preco', mlController.corrigirPreco);
router.post('/api/ml/verificar-preco', mlController.verificarPreco);
router.post('/api/ml/reset-margem', mlController.resetMargem);
router.post('/api/ml/atacado-preco', mlController.enviarPrecoAtacado);

router.get('/api/ml/perguntas', mlController.getPerguntas);
router.get('/api/ml/perguntas/item', mlController.getItemPerguntas);
router.post('/api/ml/responder-pergunta', mlController.responderPergunta);
router.delete('/api/ml/excluir-pergunta/:questionId', mlController.excluirPergunta);

// Webhooks do ML
router.post('/api/ml/webhook', mlController.handleWebhook);
// Rota de sync manual para puxar as que já existem
router.post('/api/ml/sync-perguntas-iniciais', mlController.syncPerguntasIniciais);

router.post('/api/ml/acoes-massa', mlController.acoesMassa);
router.post('/api/ml/dimensoes-embalagem', mlController.atualizarDimensoes);
router.post('/api/ml/buscar-dimensoes-ml', mlController.buscarDimensoesML);

// Concorrência de Preço / Automação
router.get('/api/ml/concorrencia-preco', mlController.getConcorrenciaPreco);
router.post('/api/ml/automacao-preco', mlController.gerenciarAutomacaoPreco);

export default router;
