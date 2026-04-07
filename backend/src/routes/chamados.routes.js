import { Router } from 'express';
import ctrl from '../controllers/chamados.controller.js';

const router = Router();

router.get('/api/chamados/anexos/:id', ctrl.baixarAnexo);
router.get('/api/chamados/:id', ctrl.buscar);
router.get('/api/chamados', ctrl.listar);
router.post('/api/chamados', ctrl.criar);
router.post('/api/chamados/:id/mensagens', ctrl.responder);
router.put('/api/chamados/:id/status', ctrl.atualizarStatus);

export default router;
