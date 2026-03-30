// backend/src/routes/promocoes.routes.js
import { Router } from 'express';
import { promocoesController } from '../controllers/promocoes.controller.js';

const router = Router();

// Promoções
router.get('/api/promocoes', promocoesController.getPromocoes);
router.post('/api/promocoes/sync', promocoesController.syncPromocoes);
router.post('/api/promocoes/campanha-vendedor', promocoesController.criarCampanhaVendedor);

// Ativar item em uma promoção específica
router.post('/api/promocoes/ativar-item', promocoesController.ativarItem);

// Remover item de uma promoção específica
router.post('/api/promocoes/remover-item', promocoesController.removerItemPromo);

// ✅ NOVO: Endpoint para remover um item de todas as promoções
router.post('/api/promocoes/delete-massivo', promocoesController.deleteOfertasMassivo);

// ✅ NOVO: Endpoint para adicionar/remover um item da "blacklist" de promos automáticas
router.post('/api/promocoes/exclusao', promocoesController.gerenciarExclusaoItem);

// ✅ NOVO: Ativação/Remoção em massa via fila BullMQ
router.post('/api/promocoes/massa-fila', promocoesController.ativarRemoverMassaFila);


// Orquestrador
router.get('/api/orquestrador/regras', promocoesController.getRegras);
router.post('/api/orquestrador/regras', promocoesController.salvarRegras);
router.post('/api/orquestrador/executar', promocoesController.executarOrquestrador);

// Monitor de Promoções
router.get('/api/monitor-promo/config', promocoesController.getMonitorConfig);
router.post('/api/monitor-promo/config', promocoesController.saveMonitorConfig);
router.get('/api/monitor-promo/alertas', promocoesController.getMonitorAlertas);
router.post('/api/monitor-promo/alertas/:id/acao', promocoesController.acaoMonitorAlerta);

export default router;