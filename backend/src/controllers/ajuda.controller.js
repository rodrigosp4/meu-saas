import prisma from '../config/prisma.js';

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Categorias ────────────────────────────────────────────────────────────────

const listarCategorias = async (req, res) => {
  try {
    const categorias = await prisma.categoriaAjuda.findMany({
      orderBy: { ordem: 'asc' },
      include: { _count: { select: { artigos: true } } },
    });
    return res.json(categorias);
  } catch (err) {
    console.error('Erro ao listar categorias de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao carregar categorias' });
  }
};

const criarCategoria = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { titulo, icone, descricao, ordem } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  try {
    let slug = toSlug(titulo);
    const existe = await prisma.categoriaAjuda.findUnique({ where: { slug } });
    if (existe) slug = `${slug}-${Date.now()}`;
    const categoria = await prisma.categoriaAjuda.create({
      data: { titulo, slug, icone, descricao, ordem: ordem ?? 0 },
      include: { _count: { select: { artigos: true } } },
    });
    return res.json(categoria);
  } catch (err) {
    console.error('Erro ao criar categoria de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao criar categoria' });
  }
};

const atualizarCategoria = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { id } = req.params;
  const { titulo, icone, descricao, ordem } = req.body;
  try {
    const data = {};
    if (titulo !== undefined) { data.titulo = titulo; data.slug = toSlug(titulo); }
    if (icone !== undefined) data.icone = icone;
    if (descricao !== undefined) data.descricao = descricao;
    if (ordem !== undefined) data.ordem = ordem;
    const categoria = await prisma.categoriaAjuda.update({
      where: { id },
      data,
      include: { _count: { select: { artigos: true } } },
    });
    return res.json(categoria);
  } catch (err) {
    console.error('Erro ao atualizar categoria de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao atualizar categoria' });
  }
};

const excluirCategoria = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { id } = req.params;
  try {
    await prisma.categoriaAjuda.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir categoria de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao excluir categoria' });
  }
};

// ── Artigos ───────────────────────────────────────────────────────────────────

const listarArtigos = async (req, res) => {
  const { categoriaId, todos } = req.query;
  const isSuperAdmin = req.userRole === 'SUPER_ADMIN';
  try {
    const where = {};
    if (categoriaId) where.categoriaId = categoriaId;
    if (!isSuperAdmin || todos !== 'true') where.publicado = true;
    const artigos = await prisma.artigoAjuda.findMany({
      where,
      orderBy: { ordem: 'asc' },
      select: {
        id: true, titulo: true, slug: true, descricao: true,
        publicado: true, ordem: true, categoriaId: true, parentId: true,
        criadoEm: true, atualizadoEm: true,
      },
    });
    return res.json(artigos);
  } catch (err) {
    console.error('Erro ao listar artigos de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao carregar artigos' });
  }
};

const buscarArtigo = async (req, res) => {
  const { id } = req.params;
  const isSuperAdmin = req.userRole === 'SUPER_ADMIN';
  try {
    const artigo = await prisma.artigoAjuda.findUnique({ where: { id } });
    if (!artigo) return res.status(404).json({ erro: 'Artigo não encontrado' });
    if (!artigo.publicado && !isSuperAdmin) return res.status(403).json({ erro: 'Artigo não publicado' });
    return res.json(artigo);
  } catch (err) {
    console.error('Erro ao buscar artigo de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao buscar artigo' });
  }
};

const criarArtigo = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { categoriaId, parentId, titulo, descricao, conteudo, publicado, ordem } = req.body;
  if (!titulo || !categoriaId) return res.status(400).json({ erro: 'Título e categoria são obrigatórios' });
  try {
    let slug = toSlug(titulo);
    const existe = await prisma.artigoAjuda.findUnique({ where: { slug } });
    if (existe) slug = `${slug}-${Date.now()}`;
    const artigo = await prisma.artigoAjuda.create({
      data: {
        categoriaId, titulo, slug,
        parentId: parentId || null,
        descricao: descricao ?? null,
        conteudo: conteudo ?? '',
        publicado: publicado ?? false,
        ordem: ordem ?? 0,
      },
    });
    return res.json(artigo);
  } catch (err) {
    console.error('Erro ao criar artigo de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao criar artigo' });
  }
};

const atualizarArtigo = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { id } = req.params;
  const { categoriaId, parentId, titulo, descricao, conteudo, publicado, ordem } = req.body;
  try {
    const data = {};
    if (titulo !== undefined) {
      let slug = toSlug(titulo);
      const existe = await prisma.artigoAjuda.findFirst({ where: { slug, NOT: { id } } });
      if (existe) slug = `${slug}-${Date.now()}`;
      data.titulo = titulo;
      data.slug = slug;
    }
    if (categoriaId !== undefined) data.categoriaId = categoriaId;
    if ('parentId' in req.body) data.parentId = parentId || null;
    if (descricao !== undefined) data.descricao = descricao;
    if (conteudo !== undefined) data.conteudo = conteudo;
    if (publicado !== undefined) data.publicado = publicado;
    if (ordem !== undefined) data.ordem = ordem;
    const artigo = await prisma.artigoAjuda.update({ where: { id }, data });
    return res.json(artigo);
  } catch (err) {
    console.error('Erro ao atualizar artigo de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao atualizar artigo' });
  }
};

const excluirArtigo = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { id } = req.params;
  try {
    await prisma.artigoAjuda.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir artigo de ajuda:', err.message);
    return res.status(500).json({ erro: 'Erro ao excluir artigo' });
  }
};

export default {
  listarCategorias, criarCategoria, atualizarCategoria, excluirCategoria,
  listarArtigos, buscarArtigo, criarArtigo, atualizarArtigo, excluirArtigo,
};
