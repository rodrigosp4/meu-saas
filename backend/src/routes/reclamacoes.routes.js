import { Router } from 'express';
import { reclamacoesController } from '../controllers/reclamacoes.controller.js';

const router = Router();

// Rotas específicas (sem parâmetro) antes das genéricas com :claimId
router.post('/api/reclamacoes/sincronizar', reclamacoesController.sincronizar);
router.post('/api/reclamacoes/marcar-todas-lidas', reclamacoesController.marcarTodasLidas);

router.get('/api/reclamacoes', reclamacoesController.listar);
router.get('/api/reclamacoes/:claimId/detail', reclamacoesController.detalhe);
router.post('/api/reclamacoes/:claimId/mensagem', reclamacoesController.enviarMensagem);
router.post('/api/reclamacoes/:claimId/marcar-lida', reclamacoesController.marcarLida);

export default router;
