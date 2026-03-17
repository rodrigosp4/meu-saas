import { Router } from 'express';
import { catalogoController } from '../controllers/catalogo.controller.js';

const router = Router();

// --- Rotas mais específicas primeiro ---
// Comparação item x produto (CORRIGIDO: movido para cima)
router.get('/api/catalogo/comparar/:itemId/:productId', catalogoController.compareItemWithProduct);

// Detalhe de produto e seus itens
router.get('/api/catalogo/produto/:productId/itens', catalogoController.getProductItems);

// Rotas de um único parâmetro
router.get('/api/catalogo/produto/:productId', catalogoController.getProductDetail);
router.get('/api/catalogo/item/:itemId', catalogoController.getItemDetail); // <- Agora está depois da rota /comparar
router.get('/api/catalogo/elegibilidade/:itemId', catalogoController.checkEligibility);
router.get('/api/catalogo/competicao/:itemId', catalogoController.getCompetition);
router.get('/api/catalogo/forewarning/:itemId', catalogoController.getForewarningDate);

// --- Rotas sem parâmetros ou com query strings ---
router.get('/api/catalogo/search', catalogoController.searchCatalog);
router.get('/api/catalogo/elegibilidade-multiplos', catalogoController.checkMultipleEligibility);
router.get('/api/catalogo/elegibilidade-lote', catalogoController.getEligibilityBatch);
router.get('/api/catalogo/itens-locais', catalogoController.getEligibleItemsLocal);
router.get('/api/catalogo/dominios', catalogoController.getDominios);
router.get('/api/catalogo/moderacoes', catalogoController.getModeracoes);

// Publicação no catálogo
router.post('/api/catalogo/publicar-direto', catalogoController.publishDirect);
router.post('/api/catalogo/optin', catalogoController.optinItem);
router.post('/api/catalogo/match-price', catalogoController.matchPrice);

// Utilitários
router.post('/api/catalogo/calcular-preco', catalogoController.calcularPreco);

export default router;