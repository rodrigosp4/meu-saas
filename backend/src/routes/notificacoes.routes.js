import { Router } from 'express';
import { notificacoesController } from '../controllers/notificacoes.controller.js';

const router = Router();

router.get('/api/notificacoes/contagem', notificacoesController.getContagem);

export default router;
