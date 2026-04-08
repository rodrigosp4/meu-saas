import prisma from '../config/prisma.js';

// ── Conteúdo HTML padrão de cada seção ────────────────────────────────────────

const DEFAULTS = {
  hero: {
    titulo: 'Hero - Seção Principal',
    tipo: 'html',
    conteudo: `<h1>Desbloqueie todo o <strong>potencial</strong> do seu negócio no ML</h1>
<p>Gerencie anúncios, monitore concorrentes, automatize respostas e escale suas vendas no Mercado Livre com uma plataforma feita para profissionais.</p>`,
  },

  features: {
    titulo: 'Funcionalidades',
    tipo: 'html',
    conteudo: `<h2>✨ Criação de Anúncios Inteligente <span style="background:rgba(245,197,24,0.15);border:1px solid rgba(245,197,24,0.4);border-radius:4px;padding:1px 8px;font-size:0.65em;color:#F5C518;vertical-align:middle">DESTAQUE</span></h2>
<p>Crie anúncios completos com: remoção de fundo via Remove.bg com 1 clique, sugestão automática de categoria, preenchimento de ficha técnica por IA, envio de compatibilidade e posição de autopeças já na criação.</p>

<h2>💰 Regra de Preço Avançada</h2>
<p>Crie sua estratégia de preço do jeito que quiser: infle o preço para margem de publicidade, reduza automaticamente para fugir do frete grátis (R$ 78,99), envie preço de atacado B2B automaticamente na criação ou edição.</p>

<h2>🏪 Publicação Multi-conta Simultânea <span style="background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.4);border-radius:4px;padding:1px 8px;font-size:0.65em;color:#27ae60;vertical-align:middle">EXCLUSIVO</span></h2>
<p>Crie o anúncio simultaneamente em todas as suas contas ML — Clássico + Premium, com preço correto para cada conta. O sistema ativa as promoções automaticamente dentro da margem adicional que você definiu.</p>

<h2>🚀 Cadastramento em Massa</h2>
<p>Crie milhares de anúncios em um dia via planilha. Importe seus produtos do ERP e publique em lote no Mercado Livre com todas as configurações aplicadas automaticamente.</p>

<h2>📋 Edição em Massa de Anúncios</h2>
<p>Corrija preço, estoque, descrição, SKU de centenas de anúncios de uma vez. Ative ou exclua campanhas em lote, altere tipo de anúncio e muito mais — tudo em poucos cliques.</p>

<h2>🚗 Compatibilidade Autopeças Avançada <span style="background:rgba(142,68,173,0.15);border:1px solid rgba(142,68,173,0.4);border-radius:4px;padding:1px 8px;font-size:0.65em;color:#8e44ad;vertical-align:middle">MAIS AVANÇADO</span></h2>
<p>A tela de compatibilidade mais avançada do mercado. Cadastre seus perfis de compatibilidade previamente e depois apenas selecione os anúncios e envie com 1 clique. Suporte completo a posição de montagem.</p>

<h2>🏷️ Central de Promoções</h2>
<p>Ative ou remova campanhas de promoção de forma automática ou manual. O sistema monitora seus anúncios e ativa as promoções dentro da margem que você configurou, sem nenhum esforço.</p>

<h2>🕵️ Monitor de Concorrentes</h2>
<p>Monitore os preços dos seus concorrentes em tempo real. Crie grupos de monitoramento, adicione lojas concorrentes e receba alertas quando os preços mudarem para tomar decisões estratégicas.</p>

<h2>💬 Perguntas Pré-Venda</h2>
<p>Responda perguntas de compradores automaticamente com inteligência artificial. Configure respostas personalizadas e nunca perca uma venda por demora no atendimento.</p>

<h2>📬 Mensagens Pós-Venda</h2>
<p>Automatize o envio de mensagens após a venda: agradecimento, instruções de uso, pedido de avaliação. Mantenha sua reputação alta e fidelize clientes com comunicação profissional.</p>

<h2>📦 Gerenciador de Catálogo ML</h2>
<p>Entre em todos os anúncios possíveis de catálogo disponíveis no Mercado Livre. Gerencie sua participação no catálogo, faça opt-in em produtos estratégicos e otimize suas posições.</p>

<h2>🔁 Replicador de Anúncios</h2>
<p>Replique anúncios entre contas com um clique. Salve rascunhos, gerencie variações e mantenha consistência total entre suas lojas sem trabalho manual.</p>

<h2>✅ Qualidade da Publicação</h2>
<p>Melhore seus anúncios com a ajuda de IA. O sistema identifica problemas, sugere melhorias de título, descrição e imagens, e usa prompts inteligentes para elevar o score de qualidade.</p>

<h2>📏 Tabela de Medidas</h2>
<p>Para vendedores de vestuário: cadastre tabelas de medidas completas (P, M, G, GG, etc.) e associe a seus anúncios. Reduza trocas e reclamações com informações precisas para o comprador.</p>

<h2>📐 Dimensões do Pacote</h2>
<p>Envie as dimensões e peso corretos do pacote para seus anúncios em massa. Garanta que o cálculo de frete seja preciso e evite cobranças extras por divergência de medidas.</p>

<h2>📊 Corretor de Preço com Excel</h2>
<p>Importe uma planilha Excel com seus SKUs e novos preços e aplique atualizações em massa com um clique. Ideal para reajustes periódicos de toda a carteira de produtos.</p>

<h2>⚖️ Concorrência de Preço</h2>
<p>Configure regras automáticas de precificação baseadas nos concorrentes. Mantenha seus preços competitivos de forma inteligente, com margens mínimas protegidas.</p>

<h2>🖼️ Otimizador de Imagens</h2>
<p>Otimize as imagens de todos os seus anúncios: aplique imagens melhores em lote, ignore itens específicos, e use o Remove.bg integrado para remover fundos com qualidade profissional.</p>`,
  },

  integracoes: {
    titulo: 'Integrações',
    tipo: 'html',
    conteudo: `<h2>🔗 Conectado aos principais ERPs e Marketplaces</h2>
<p>Sincronize produtos, estoque e preços automaticamente com os sistemas que você já usa.</p>

<h3>Olist Tiny — ERP</h3>
<p>Sincronização completa de produtos, estoque e preços com o ERP Tiny da Olist. Mantenha seus dados sempre atualizados entre os sistemas.</p>

<h3>Bling — ERP</h3>
<p>Integração completa com o ERP Bling. Gerencie seus produtos, pedidos e estoque em um único lugar.</p>

<h3>Mercado Livre — Marketplace</h3>
<p>Gestão completa de anúncios e vendas no Mercado Livre via API oficial. Publique, edite e monitore todos os seus anúncios sem sair da plataforma.</p>`,
  },

  steps: {
    titulo: 'Como Funciona',
    tipo: 'html',
    conteudo: `<h2>Comece em 3 passos simples</h2>

<h3>🔗 01 — Conecte sua conta</h3>
<p>Vincule sua conta do Mercado Livre com segurança via OAuth. Sem precisar compartilhar senhas.</p>

<h3>⚡ 02 — Sincronize seus dados</h3>
<p>Todos os seus anúncios, pedidos e métricas são importados automaticamente em segundos.</p>

<h3>📈 03 — Turbine suas vendas</h3>
<p>Use as ferramentas para otimizar, monitorar e escalar suas operações no Mercado Livre.</p>`,
  },

  plano_vantagens: {
    titulo: 'Planos — Vantagens',
    tipo: 'html',
    conteudo: `<h2>💎 O que está incluso em todos os planos</h2>
<ul>
  <li>✅ Acesso completo a todas as ferramentas</li>
  <li>✅ Gerenciador de anúncios ilimitado</li>
  <li>✅ Monitor de concorrentes</li>
  <li>✅ Respostas automáticas com IA</li>
  <li>✅ Sincronização automática 24/7</li>
  <li>✅ Suporte por e-mail</li>
</ul>

<h3>Plano 60 dias — 5% de desconto</h3>
<ul>
  <li>✅ Tudo do plano mensal</li>
  <li>✅ 5% de desconto no valor total</li>
  <li>✅ Relatórios avançados</li>
  <li>✅ Replicador de anúncios multi-conta</li>
  <li>✅ Central de promoções completa</li>
  <li>✅ Suporte prioritário</li>
</ul>

<h3>Plano 90 dias — 10% de desconto ⭐ MAIS POPULAR</h3>
<ul>
  <li>✅ Tudo do plano bimestral</li>
  <li>✅ 10% de desconto no valor total</li>
  <li>✅ Cadastramento em massa via planilha</li>
  <li>✅ Corretor de preços por planilha</li>
  <li>✅ Otimizador de imagens</li>
  <li>✅ Acesso antecipado a novas funcionalidades</li>
</ul>

<h3>Plano 6 meses — 15% de desconto</h3>
<ul>
  <li>✅ Tudo do plano trimestral</li>
  <li>✅ 15% de desconto — maior economia</li>
  <li>✅ Planejador de Product Ads</li>
  <li>✅ API de integração para desenvolvedores</li>
  <li>✅ Compatibilidade autopeças avançada</li>
  <li>✅ Suporte VIP</li>
</ul>`,
  },

  cta: {
    titulo: 'Chamada para Ação (CTA)',
    tipo: 'html',
    conteudo: `<h2>Pronto para <strong>desbloquear</strong> seu potencial?</h2>
<p>Junte-se a vendedores que já estão usando o MELI UNLOCKER para automatizar e escalar suas operações no Mercado Livre.</p>`,
  },

  footer: {
    titulo: 'Rodapé',
    tipo: 'html',
    conteudo: `<p>© 2025 MELI UNLOCKER · Plataforma de gestão para Mercado Livre · Todos os direitos reservados</p>`,
  },
};

// ── Listar seções (merge DB + defaults) ───────────────────────────────────────

const listarSecoes = async (req, res) => {
  try {
    const secoesDb = await prisma.landingPageSecao.findMany();
    const mapaDb = Object.fromEntries(secoesDb.map(s => [s.chave, s]));

    const secoes = Object.entries(DEFAULTS).map(([chave, def]) => {
      const db = mapaDb[chave];
      return {
        chave,
        titulo: def.titulo,
        tipo: def.tipo,
        conteudo: db ? db.conteudo : '',
        updatedAt: db ? db.updatedAt : null,
        customizada: !!db,
      };
    });

    return res.json(secoes);
  } catch (err) {
    console.error('Erro ao listar seções da landing:', err.message);
    return res.status(500).json({ erro: 'Erro ao carregar seções' });
  }
};

// ── Atualizar (upsert) seção ───────────────────────────────────────────────────

const atualizarSecao = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { chave } = req.params;
  const { conteudo } = req.body;

  if (!DEFAULTS[chave]) return res.status(404).json({ erro: 'Seção não encontrada' });
  if (conteudo === undefined) return res.status(400).json({ erro: 'conteudo é obrigatório' });

  try {
    const secao = await prisma.landingPageSecao.upsert({
      where: { chave },
      update: { conteudo },
      create: {
        chave,
        titulo: DEFAULTS[chave].titulo,
        tipo: DEFAULTS[chave].tipo,
        conteudo,
      },
    });
    return res.json({ ok: true, secao });
  } catch (err) {
    console.error('Erro ao atualizar seção da landing:', err.message);
    return res.status(500).json({ erro: 'Erro ao salvar seção' });
  }
};

// ── Resetar seção para o padrão ───────────────────────────────────────────────

const resetarSecao = async (req, res) => {
  if (req.userRole !== 'SUPER_ADMIN') return res.status(403).json({ erro: 'Sem permissão' });
  const { chave } = req.params;

  if (!DEFAULTS[chave]) return res.status(404).json({ erro: 'Seção não encontrada' });

  try {
    await prisma.landingPageSecao.deleteMany({ where: { chave } });
    return res.json({ ok: true, conteudo: '' });
  } catch (err) {
    console.error('Erro ao resetar seção da landing:', err.message);
    return res.status(500).json({ erro: 'Erro ao resetar seção' });
  }
};

export default { listarSecoes, atualizarSecao, resetarSecao };
