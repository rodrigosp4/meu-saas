import { Router } from 'express';
import ajudaController from '../controllers/ajuda.controller.js';

const router = Router();

router.get('/api/ajuda/categorias', ajudaController.listarCategorias);
router.post('/api/ajuda/categorias', ajudaController.criarCategoria);
router.put('/api/ajuda/categorias/:id', ajudaController.atualizarCategoria);
router.delete('/api/ajuda/categorias/:id', ajudaController.excluirCategoria);

router.get('/api/ajuda/artigos', ajudaController.listarArtigos);
router.get('/api/ajuda/artigos/:id', ajudaController.buscarArtigo);
router.post('/api/ajuda/artigos', ajudaController.criarArtigo);
router.put('/api/ajuda/artigos/:id', ajudaController.atualizarArtigo);
router.delete('/api/ajuda/artigos/:id', ajudaController.excluirArtigo);

export default router;
