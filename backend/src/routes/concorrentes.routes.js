import { Router } from 'express';
import { concorrentesController } from '../controllers/concorrentes.controller.js';

const router = Router();

// Grupos
router.get('/api/concorrentes/grupos', concorrentesController.listarGrupos);
router.post('/api/concorrentes/grupos', concorrentesController.criarGrupo);
router.put('/api/concorrentes/grupos/:id', concorrentesController.atualizarGrupo);
router.delete('/api/concorrentes/grupos/:id', concorrentesController.excluirGrupo);

// Meus anúncios do grupo
router.get('/api/concorrentes/meus-anuncios', concorrentesController.meusAnunciosGrupo);

// Concorrentes (itens individuais)
router.get('/api/concorrentes/itens', concorrentesController.listarConcorrentes);
router.post('/api/concorrentes/itens', concorrentesController.adicionarConcorrente);
router.delete('/api/concorrentes/itens', concorrentesController.removerConcorrente);
router.post('/api/concorrentes/limpar-proprios', concorrentesController.limparPropriosAnuncios);
router.post('/api/concorrentes/atualizar', concorrentesController.atualizarConcorrentes);
router.post('/api/concorrentes/igualar-preco', concorrentesController.igualarPreco);
router.post('/api/concorrentes/preco-minimo', concorrentesController.salvarPrecoMinimo);

// Busca de itens ML
router.get('/api/concorrentes/buscar-itens', concorrentesController.buscarItens);

// Oportunidades e analítica
router.get('/api/concorrentes/oportunidades', concorrentesController.oportunidades);
router.get('/api/concorrentes/analitica', concorrentesController.analitica);

// Lojas monitoradas
router.get('/api/concorrentes/lojas', concorrentesController.listarLojas);
router.post('/api/concorrentes/lojas', concorrentesController.adicionarLoja);
router.put('/api/concorrentes/lojas/:id/atualizar', concorrentesController.atualizarLoja);
router.delete('/api/concorrentes/lojas/:id', concorrentesController.removerLoja);
router.get('/api/concorrentes/lojas/catalogo', concorrentesController.catalogoLoja);

export default router;
