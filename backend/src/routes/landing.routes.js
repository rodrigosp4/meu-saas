import { Router } from 'express';
import landingController from '../controllers/landing.controller.js';

const router = Router();

router.get('/api/landing/secoes', landingController.listarSecoes);
router.put('/api/landing/secoes/:chave', landingController.atualizarSecao);
router.post('/api/landing/secoes/:chave/resetar', landingController.resetarSecao);

export default router;
