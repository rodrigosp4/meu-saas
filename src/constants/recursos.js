// Lista de módulos (telas) — mesma usada no AdminPanel e AuthContext
export const MODULOS = [
  { id: 'produtosErp',          label: 'Cadastro Individual' },
  { id: 'cadastramentoMassa',   label: 'Cadastro em Massa (IA)' },
  { id: 'gerenciadorML',        label: 'Gerenciador ML' },
  { id: 'replicadorAnuncio',    label: 'Replicador de Anúncio' },
  { id: 'compatibilidade',      label: 'Compatibilidade de Autopeças' },
  { id: 'centralPromocoes',     label: 'Central de Promoções' },
  { id: 'monitorConcorrentes',  label: 'Monitor de Concorrentes' },
  { id: 'perguntasPreVenda',    label: 'Perguntas Pré-Venda' },
  { id: 'posVenda',             label: 'Pós-Venda' },
  { id: 'catalogo',             label: 'Catálogo' },
  { id: 'qualidadePublicacoes', label: 'Qualidade Publicações' },
  { id: 'dimensoesEmbalagem',   label: 'Dimensões de Embalagem' },
  { id: 'otimizadorImagens',    label: 'Otimizador de Imagens' },
  { id: 'clienteAPI',           label: 'Cliente API' },
  { id: 'fila',                 label: 'Gerenciador de Fila' },
  { id: 'configuracoes',        label: 'Configurações API' },
  { id: 'corretorPrecoPlanilha',label: 'Corretor de Preço (Planilha)' },
  { id: 'planejadorProductAds', label: 'Planejador de Product Ads' },
  { id: 'concorrenciaPreco',    label: 'Concorrência de Preço' },
];

// Recursos granulares (ações dentro dos módulos)
// deps: ao bloquear este recurso, os que listam seu id em "deps" também são bloqueados automaticamente
export const RECURSOS_SISTEMA = [
  // ── Catálogo ────────────────────────────────────────────────────────────
  { id: 'catalogo.visualizar',       label: 'Visualizar catálogo',               grupo: 'Catálogo',              modulo: 'catalogo',           deps: [] },
  { id: 'catalogo.criar',            label: 'Criar produto',                      grupo: 'Catálogo',              modulo: 'catalogo',           deps: ['catalogo.visualizar'] },
  { id: 'catalogo.editar',           label: 'Editar produto',                     grupo: 'Catálogo',              modulo: 'catalogo',           deps: ['catalogo.visualizar'] },
  { id: 'catalogo.excluir',          label: 'Excluir produto',                    grupo: 'Catálogo',              modulo: 'catalogo',           deps: ['catalogo.visualizar'] },
  { id: 'catalogo.imagensCustom',    label: 'Editar imagens personalizadas',      grupo: 'Catálogo',              modulo: 'catalogo',           deps: ['catalogo.visualizar'] },
  { id: 'catalogo.optin',            label: 'Executar Opt-in no catálogo',        grupo: 'Catálogo',              modulo: 'catalogo',           deps: ['catalogo.visualizar'] },

  // ── Produtos ERP ─────────────────────────────────────────────────────────
  { id: 'produtosErp.visualizar',    label: 'Visualizar produtos do ERP',         grupo: 'Produtos ERP',          modulo: 'produtosErp',        deps: [] },
  { id: 'produtosErp.sincronizar',   label: 'Sincronizar Tiny ERP',               grupo: 'Produtos ERP',          modulo: 'produtosErp',        deps: ['produtosErp.visualizar'] },
  { id: 'produtosErp.anunciar',      label: 'Anunciar produto no ML',             grupo: 'Produtos ERP',          modulo: 'produtosErp',        deps: ['produtosErp.visualizar'] },

  // ── Gerenciador ML ───────────────────────────────────────────────────────
  { id: 'gerenciadorML.visualizar',  label: 'Visualizar anúncios ML',             grupo: 'Gerenciador ML',        modulo: 'gerenciadorML',      deps: [] },
  { id: 'gerenciadorML.editarPreco', label: 'Editar preço de anúncio',            grupo: 'Gerenciador ML',        modulo: 'gerenciadorML',      deps: ['gerenciadorML.visualizar'] },
  { id: 'gerenciadorML.pausar',      label: 'Pausar / ativar anúncio',            grupo: 'Gerenciador ML',        modulo: 'gerenciadorML',      deps: ['gerenciadorML.visualizar'] },
  { id: 'gerenciadorML.excluir',     label: 'Excluir anúncio',                    grupo: 'Gerenciador ML',        modulo: 'gerenciadorML',      deps: ['gerenciadorML.visualizar'] },
  { id: 'gerenciadorML.sincronizar', label: 'Sincronizar anúncios',               grupo: 'Gerenciador ML',        modulo: 'gerenciadorML',      deps: ['gerenciadorML.visualizar'] },

  // ── Publicação (Criar / Replicar / Massa) ────────────────────────────────
  { id: 'criarAnuncio.publicar',     label: 'Publicar novo anúncio',              grupo: 'Publicação',            modulo: 'criarAnuncio',       deps: [] },
  { id: 'replicador.replicar',       label: 'Replicar anúncio existente',         grupo: 'Publicação',            modulo: 'replicadorAnuncio',  deps: ['criarAnuncio.publicar'] },
  { id: 'massa.gerar',               label: 'Gerar anúncios em massa (IA)',        grupo: 'Publicação',            modulo: 'cadastramentoMassa', deps: ['criarAnuncio.publicar'] },

  // ── Precificação ─────────────────────────────────────────────────────────
  { id: 'precificacao.regras',       label: 'Criar / editar regras de preço',     grupo: 'Precificação',          modulo: 'configuracoes',      deps: [] },
  { id: 'precificacao.aplicar',      label: 'Aplicar regra de preço a anúncios', grupo: 'Precificação',          modulo: 'configuracoes',      deps: ['gerenciadorML.editarPreco', 'precificacao.regras'] },
  { id: 'precificacao.atacado',      label: 'Configurar preço por atacado',       grupo: 'Precificação',          modulo: 'configuracoes',      deps: [] },
  { id: 'precificacao.automacao',    label: 'Ativar automação de preço (ML)',     grupo: 'Precificação',          modulo: 'concorrenciaPreco',  deps: [] },

  // ── Monitor de Concorrentes ──────────────────────────────────────────────
  { id: 'monitor.visualizar',        label: 'Visualizar grupos de monitoramento', grupo: 'Monitor Concorrentes',  modulo: 'monitorConcorrentes',deps: [] },
  { id: 'monitor.criarGrupo',        label: 'Criar grupo de monitoramento',       grupo: 'Monitor Concorrentes',  modulo: 'monitorConcorrentes',deps: ['monitor.visualizar'] },
  { id: 'monitor.excluirGrupo',      label: 'Excluir grupo de monitoramento',     grupo: 'Monitor Concorrentes',  modulo: 'monitorConcorrentes',deps: ['monitor.visualizar'] },
  { id: 'monitor.adicionarLoja',     label: 'Adicionar loja monitorada',          grupo: 'Monitor Concorrentes',  modulo: 'monitorConcorrentes',deps: ['monitor.visualizar'] },
  { id: 'monitor.ajusteAutomatico',  label: 'Ajuste automático de preço',         grupo: 'Monitor Concorrentes',  modulo: 'monitorConcorrentes',deps: ['monitor.visualizar', 'gerenciadorML.editarPreco'] },

  // ── Promoções ────────────────────────────────────────────────────────────
  { id: 'promocoes.visualizar',      label: 'Visualizar promoções',               grupo: 'Promoções',             modulo: 'centralPromocoes',   deps: [] },
  { id: 'promocoes.aplicar',         label: 'Ativar / desativar promoção',        grupo: 'Promoções',             modulo: 'centralPromocoes',   deps: ['promocoes.visualizar'] },

  // ── Fila ─────────────────────────────────────────────────────────────────
  { id: 'fila.visualizar',           label: 'Visualizar tarefas da fila',         grupo: 'Fila',                  modulo: 'fila',               deps: [] },
  { id: 'fila.cancelar',             label: 'Cancelar tarefa da fila',            grupo: 'Fila',                  modulo: 'fila',               deps: ['fila.visualizar'] },
  { id: 'fila.reprocessar',          label: 'Reprocessar tarefa com falha',       grupo: 'Fila',                  modulo: 'fila',               deps: ['fila.visualizar'] },
  { id: 'fila.limpar',               label: 'Limpar fila completa',               grupo: 'Fila',                  modulo: 'fila',               deps: ['fila.cancelar'] },

  // ── Imagens ──────────────────────────────────────────────────────────────
  { id: 'imagens.removerFundo',      label: 'Remover fundo de imagem (Remove.bg)',grupo: 'Imagens',               modulo: 'otimizadorImagens',  deps: [] },
  { id: 'imagens.otimizar',          label: 'Otimizar / redimensionar imagens',   grupo: 'Imagens',               modulo: 'otimizadorImagens',  deps: [] },

  // ── Compatibilidade ──────────────────────────────────────────────────────
  { id: 'compat.visualizar',         label: 'Visualizar perfis de compatibilidade',grupo: 'Compatibilidade',      modulo: 'compatibilidade',    deps: [] },
  { id: 'compat.editarPerfil',       label: 'Criar / editar perfil',              grupo: 'Compatibilidade',       modulo: 'compatibilidade',    deps: ['compat.visualizar'] },
  { id: 'compat.excluirPerfil',      label: 'Excluir perfil',                     grupo: 'Compatibilidade',       modulo: 'compatibilidade',    deps: ['compat.visualizar'] },

  // ── Configurações ────────────────────────────────────────────────────────
  { id: 'config.tinyToken',          label: 'Alterar token do Tiny ERP',          grupo: 'Configurações',         modulo: 'configuracoes',      deps: [] },
  { id: 'config.contasML',           label: 'Adicionar / remover contas ML',      grupo: 'Configurações',         modulo: 'configuracoes',      deps: [] },
  { id: 'config.integracoes',        label: 'Configurar Imgur / Remove.bg',       grupo: 'Configurações',         modulo: 'configuracoes',      deps: [] },
  { id: 'config.subUsuarios',        label: 'Gerenciar sub-usuários',             grupo: 'Configurações',         modulo: 'configuracoes',      deps: [] },
  { id: 'config.suporte',            label: 'Gerenciar acesso de suporte',        grupo: 'Configurações',         modulo: 'configuracoes',      deps: [] },
];

/**
 * Dado um conjunto de IDs bloqueados, expande com todos os dependentes.
 * Ex: bloquear "catalogo.visualizar" → também bloqueia criar/editar/excluir/etc.
 */
export function expandirDependencias(bloqueadosIniciais) {
  const bloqueados = new Set(bloqueadosIniciais);
  let houveMudanca = true;
  while (houveMudanca) {
    houveMudanca = false;
    for (const recurso of RECURSOS_SISTEMA) {
      if (!bloqueados.has(recurso.id) && recurso.deps.some(dep => bloqueados.has(dep))) {
        bloqueados.add(recurso.id);
        houveMudanca = true;
      }
    }
  }
  return bloqueados;
}
