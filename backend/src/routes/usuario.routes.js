import { Router } from 'express';
import prisma from '../config/prisma.js';

const router = Router();

// 1. LOGIN 
router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email, senha: password } });
    } else if (user.senha !== password) {
      return res.status(401).json({ erro: 'Senha incorreta' });
    }
    res.json({ id: user.id, email: user.email, tinyToken: user.tinyToken });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 2. BUSCAR CONFIGURAÇÕES DO USUÁRIO
router.get('/api/usuario/:id/config', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { contasMl: true, regras: true }
    });
    
    // Converte BigInt para Number e lê a coluna 'logistica' do banco
    const contasFormatadas = user.contasMl.map(c => ({
      ...c, 
      expiresAt: Number(c.expiresAt), 
      envioSuportado: c.logistica || 'ME2'
    }));

    res.json({ tinyToken: user.tinyToken, contasML: contasFormatadas, regrasPreco: user.regras });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 3. SALVAR TOKEN DO TINY
router.post('/api/usuario/:id/tiny', async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { tinyToken: req.body.tinyToken }
    });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 4. SALVAR/ATUALIZAR CONTA ML
router.post('/api/usuario/:id/contas-ml', async (req, res) => {
  try {
    const { id, nickname, accessToken, refreshToken, expiresAt, envioSuportado } = req.body;
    const logisticaReal = envioSuportado || 'ME2';

    const conta = await prisma.contaML.upsert({
      where: { id: String(id) },
      update: { accessToken, refreshToken, expiresAt: BigInt(expiresAt), nickname, logistica: logisticaReal },
      create: { id: String(id), userId: req.params.id, nickname, accessToken, refreshToken, expiresAt: BigInt(expiresAt), logistica: logisticaReal }
    });
    
    res.json({ ...conta, expiresAt: Number(conta.expiresAt), envioSuportado: conta.logistica });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 5. EXCLUIR CONTA ML
router.delete('/api/usuario/:id/contas-ml/:contaId', async (req, res) => {
  try {
    await prisma.contaML.delete({ where: { id: req.params.contaId } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 6. SALVAR/ATUALIZAR REGRA
router.post('/api/usuario/:id/regras', async (req, res) => {
  try {
    const { id, nome, precoBase, variaveis } = req.body;
    const regraId = id || undefined; 
    
    const existe = regraId ? await prisma.regraPreco.findUnique({ where: { id: regraId }}) : null;

    if (existe) {
      const regra = await prisma.regraPreco.update({
        where: { id: regraId },
        data: { nome, precoBase, variaveis }
      });
      return res.json(regra);
    } else {
      const regra = await prisma.regraPreco.create({
        data: { userId: req.params.id, nome, precoBase, variaveis }
      });
      return res.json(regra);
    }
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

// 7. EXCLUIR REGRA
router.delete('/api/usuario/:id/regras/:regraId', async (req, res) => {
  try {
    await prisma.regraPreco.delete({ where: { id: req.params.regraId } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ erro: error.message }); }
});

export default router;