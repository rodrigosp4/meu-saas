import prisma from '../config/prisma.js';

const MAX_ANEXO_BYTES = 5 * 1024 * 1024; // 5 MB por arquivo (base64 ~33% overhead)
const MAX_ANEXOS_POR_MSG = 3;

// GET /api/chamados — lista chamados (usuário vê só os seus; SUPER_ADMIN vê todos)
const listar = async (req, res) => {
  const userId = req.userId;
  const role = req.userRole;

  try {
    const where = role === 'SUPER_ADMIN' ? {} : { userId };
    const chamados = await prisma.chamado.findMany({
      where,
      include: {
        usuario: { select: { id: true, email: true } },
        _count: { select: { mensagens: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
    });
    return res.json(chamados);
  } catch (err) {
    console.error('Erro ao listar chamados:', err.message);
    return res.status(500).json({ erro: 'Erro ao listar chamados' });
  }
};

// GET /api/chamados/:id — detalhes com mensagens e anexos
const buscar = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const role = req.userRole;

  try {
    const chamado = await prisma.chamado.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, email: true } },
        mensagens: {
          orderBy: { criadoEm: 'asc' },
          include: {
            autor: { select: { id: true, email: true } },
            anexos: { select: { id: true, nome: true, tipo: true, tamanho: true } },
          },
        },
      },
    });

    if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });
    if (role !== 'SUPER_ADMIN' && chamado.userId !== userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    return res.json(chamado);
  } catch (err) {
    console.error('Erro ao buscar chamado:', err.message);
    return res.status(500).json({ erro: 'Erro ao buscar chamado' });
  }
};

// GET /api/chamados/anexos/:id — retorna os dados (base64) de um anexo
const baixarAnexo = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const role = req.userRole;

  try {
    const anexo = await prisma.anexoChamado.findUnique({
      where: { id },
      include: {
        mensagem: {
          include: { chamado: { select: { userId: true } } },
        },
      },
    });

    if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado' });
    if (role !== 'SUPER_ADMIN' && anexo.mensagem.chamado.userId !== userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    return res.json({ id: anexo.id, nome: anexo.nome, tipo: anexo.tipo, dados: anexo.dados });
  } catch (err) {
    console.error('Erro ao baixar anexo:', err.message);
    return res.status(500).json({ erro: 'Erro ao baixar anexo' });
  }
};

// POST /api/chamados — abre novo chamado
const criar = async (req, res) => {
  const { titulo, mensagem, anexos } = req.body;
  const userId = req.userId;

  if (!titulo?.trim()) return res.status(400).json({ erro: 'Título obrigatório' });
  if (!mensagem?.trim()) return res.status(400).json({ erro: 'Mensagem obrigatória' });

  const erroAnexo = validarAnexos(anexos);
  if (erroAnexo) return res.status(400).json({ erro: erroAnexo });

  try {
    const chamado = await prisma.chamado.create({
      data: {
        titulo: titulo.trim(),
        userId,
        mensagens: {
          create: {
            autorId: userId,
            conteudo: mensagem.trim(),
            isAdmin: false,
            ...(anexos?.length ? {
              anexos: { create: anexos.map(normalizarAnexo) },
            } : {}),
          },
        },
      },
      include: {
        usuario: { select: { id: true, email: true } },
        mensagens: {
          include: {
            autor: { select: { id: true, email: true } },
            anexos: { select: { id: true, nome: true, tipo: true, tamanho: true } },
          },
        },
      },
    });
    return res.status(201).json(chamado);
  } catch (err) {
    console.error('Erro ao criar chamado:', err.message);
    return res.status(500).json({ erro: 'Erro ao criar chamado' });
  }
};

// POST /api/chamados/:id/mensagens — adiciona mensagem ao chamado
const responder = async (req, res) => {
  const { id } = req.params;
  const { conteudo, anexos } = req.body;
  const userId = req.userId;
  const role = req.userRole;

  if (!conteudo?.trim()) return res.status(400).json({ erro: 'Conteúdo obrigatório' });

  const erroAnexo = validarAnexos(anexos);
  if (erroAnexo) return res.status(400).json({ erro: erroAnexo });

  try {
    const chamado = await prisma.chamado.findUnique({ where: { id } });
    if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });

    const isAdmin = role === 'SUPER_ADMIN';
    if (!isAdmin && chamado.userId !== userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }
    if (chamado.status === 'FECHADO') {
      return res.status(400).json({ erro: 'Este chamado está fechado' });
    }

    // Status automático: admin responde → EM_ANDAMENTO; usuário responde → AGUARDANDO_USUARIO volta p/ ABERTO
    const novoStatus = isAdmin ? 'EM_ANDAMENTO' : 'ABERTO';

    const [mensagemCriada] = await prisma.$transaction([
      prisma.mensagemChamado.create({
        data: {
          chamadoId: id,
          autorId: userId,
          conteudo: conteudo.trim(),
          isAdmin,
          ...(anexos?.length ? {
            anexos: { create: anexos.map(normalizarAnexo) },
          } : {}),
        },
        include: {
          autor: { select: { id: true, email: true } },
          anexos: { select: { id: true, nome: true, tipo: true, tamanho: true } },
        },
      }),
      prisma.chamado.update({
        where: { id },
        data: { status: novoStatus },
      }),
    ]);

    return res.json(mensagemCriada);
  } catch (err) {
    console.error('Erro ao responder chamado:', err.message);
    return res.status(500).json({ erro: 'Erro ao responder chamado' });
  }
};

// PUT /api/chamados/:id/status — atualiza status (SUPER_ADMIN)
const atualizarStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const role = req.userRole;

  const statusValidos = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_USUARIO', 'RESOLVIDO', 'FECHADO'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido' });
  }

  try {
    const chamado = await prisma.chamado.findUnique({ where: { id } });
    if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });

    // Usuário pode fechar o próprio chamado como RESOLVIDO
    if (role !== 'SUPER_ADMIN') {
      if (chamado.userId !== req.userId) return res.status(403).json({ erro: 'Acesso negado' });
      if (status !== 'FECHADO') return res.status(403).json({ erro: 'Usuário só pode fechar o chamado' });
    }

    const atualizado = await prisma.chamado.update({
      where: { id },
      data: { status },
    });
    return res.json(atualizado);
  } catch (err) {
    console.error('Erro ao atualizar status:', err.message);
    return res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
};

// ── helpers ────────────────────────────────────────────────────────────────────

function validarAnexos(anexos) {
  if (!anexos?.length) return null;
  if (anexos.length > MAX_ANEXOS_POR_MSG) {
    return `Máximo de ${MAX_ANEXOS_POR_MSG} anexos por mensagem`;
  }
  for (const a of anexos) {
    if (!a.nome || !a.tipo || !a.dados) return 'Anexo inválido';
    const bytes = Buffer.byteLength(a.dados, 'base64');
    if (bytes > MAX_ANEXO_BYTES) {
      return `Arquivo "${a.nome}" excede o limite de 5 MB`;
    }
  }
  return null;
}

function normalizarAnexo(a) {
  return {
    nome: a.nome,
    tipo: a.tipo,
    tamanho: Buffer.byteLength(a.dados, 'base64'),
    dados: a.dados,
  };
}

export default { listar, buscar, baixarAnexo, criar, responder, atualizarStatus };
