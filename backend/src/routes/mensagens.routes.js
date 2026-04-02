import { Router } from 'express';
import { mensagensController } from '../controllers/mensagens.controller.js';

const router = Router();

router.get('/api/pos-venda/contas',                              mensagensController.getContas);
router.get('/api/pos-venda/nao-lidas',                           mensagensController.getNaoLidas);
router.get('/api/pos-venda/pedidos-recentes',                    mensagensController.getPedidosRecentes);
router.get('/api/pos-venda/mensagens/:packId',                   mensagensController.getMensagens);
router.post('/api/pos-venda/mensagens/:packId/enviar',           mensagensController.enviarMensagem);
router.get('/api/pos-venda/action-guide/:packId',                mensagensController.getActionGuide);
router.post('/api/pos-venda/action-guide/:packId/option',        mensagensController.enviarActionGuide);
router.post('/api/pos-venda/marcar-lida/:packId',                mensagensController.marcarComoLida);
router.get('/api/pos-venda/pedido/:packId',                      mensagensController.getPedido);
router.get('/api/pos-venda/anexo/:attachmentId',                 mensagensController.getAnexo);
export default router;
