import React, { useState, useMemo } from 'react';

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtBRL = v => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

function tipoML(ad) {
  const t = ad.dadosML?.listing_type_id || '';
  if (t.includes('gold_pro')) return 'Premium';
  if (t.includes('gold_special')) return 'Clássico';
  return t || '—';
}
function emCatalogo(ad) { return !!(ad.dadosML?.catalog_product_id); }
function dominio(ad) { return ad.dadosML?.domain_id || ad.dadosML?.category_id || '—'; }
function convRate(ad) {
  if (!ad.visitas || ad.visitas === 0) return null;
  return ((ad.vendas / ad.visitas) * 100).toFixed(1);
}
function tierPerf(vendas) {
  if (vendas >= 50) return { label: 'Alto', color: 'bg-emerald-100 text-emerald-700' };
  if (vendas >= 10) return { label: 'Médio', color: 'bg-blue-100 text-blue-700' };
  if (vendas >= 1)  return { label: 'Baixo', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Nenhuma', color: 'bg-gray-100 text-gray-500' };
}

// ── Gera prompt estruturado ──────────────────────────────────────────────────
function gerarPrompt(ads) {
  if (!ads.length) return '';

  // Agrupar por domínio
  const porDominio = {};
  for (const ad of ads) {
    const d = dominio(ad);
    if (!porDominio[d]) porDominio[d] = [];
    porDominio[d].push(ad);
  }

  // Tabela de anúncios
  const linhasTabela = ads.map(ad => {
    const conv = convRate(ad);
    return `| ${ad.id} | ${ad.titulo.substring(0, 55)}${ad.titulo.length > 55 ? '…' : ''} | ${ad.sku || '—'} | ${ad.conta?.nickname || '—'} | ${tipoML(ad)} | ${emCatalogo(ad) ? 'Sim' : 'Não'} | ${dominio(ad)} | ${fmtBRL(ad.preco)} | ${ad.estoque} | ${ad.vendas} | ${ad.visitas} | ${conv != null ? conv + '%' : '—'} |`;
  }).join('\n');

  // Grupos por domínio para o prompt
  const resumoDominios = Object.entries(porDominio)
    .sort((a, b) => b[1].reduce((s, x) => s + x.vendas, 0) - a[1].reduce((s, x) => s + x.vendas, 0))
    .map(([dom, lista]) => {
      const totalVendas = lista.reduce((s, x) => s + x.vendas, 0);
      const premium = lista.filter(a => tipoML(a) === 'Premium').length;
      const catalogo = lista.filter(emCatalogo).length;
      const semEstoque = lista.filter(a => a.estoque === 0).length;
      return `  • ${dom}: ${lista.length} anúncio(s) | ${totalVendas} vendas | ${premium} Premium | ${catalogo} em catálogo | ${semEstoque} sem estoque`;
    }).join('\n');

  const contas = [...new Set(ads.map(a => a.conta?.nickname).filter(Boolean))].join(', ') || 'não informado';
  const totalVendas = ads.reduce((s, a) => s + a.vendas, 0);
  const totalVisitas = ads.reduce((s, a) => s + a.visitas, 0);
  const semVendas = ads.filter(a => a.vendas === 0).length;
  const semEstoque = ads.filter(a => a.estoque === 0).length;
  const premium = ads.filter(a => tipoML(a) === 'Premium').length;
  const classico = ads.filter(a => tipoML(a) === 'Clássico').length;
  const catalogo = ads.filter(emCatalogo).length;

  return `# PLANEJAMENTO DE CAMPANHAS — PRODUCT ADS MERCADO LIVRE

## CONTA(S): ${contas}
## DATA DE ANÁLISE: ${new Date().toLocaleDateString('pt-BR')}

---

## VISÃO GERAL DA CARTEIRA

- Total de anúncios selecionados: ${ads.length}
- Vendas totais (acumulado): ${totalVendas}
- Visitas totais (acumulado): ${totalVisitas}
- Conversão média: ${totalVisitas > 0 ? ((totalVendas / totalVisitas) * 100).toFixed(2) : '0'}%
- Anúncios sem nenhuma venda: ${semVendas}
- Anúncios sem estoque: ${semEstoque}
- Tipo Premium: ${premium} | Tipo Clássico: ${classico}
- Em catálogo: ${catalogo} | Fora do catálogo: ${ads.length - catalogo}

---

## RESUMO POR DOMÍNIO/CATEGORIA

${resumoDominios}

---

## TABELA DE ANÚNCIOS (${ads.length} itens)

| MLB ID | Título | SKU | Conta | Tipo | Catálogo | Domínio/Categoria | Preço | Estoque | Vendas | Visitas | Conv% |
|--------|--------|-----|-------|------|----------|-------------------|-------|---------|--------|---------|-------|
${linhasTabela}

---

## CONTEXTO: REGRAS DO MERCADO LIVRE PARA PRODUCT ADS

1. **Campanhas Automáticas**: O ML seleciona automaticamente todos os produtos elegíveis da conta. Estratégias: PROFITABILITY (otimizar ROAS), INCREASE (aumentar vendas), VISIBILITY (aumentar visibilidade para novos produtos).

2. **Campanhas Personalizadas**: O vendedor escolhe manualmente os anúncios, define orçamento diário e lance (CPC).

3. **Agrupamento recomendado pelo ML**: Produtos do mesmo domain_id/família de produto tendem a ter melhor relevância e desempenho juntos.

4. **Produtos em catálogo (catalog_product_id)**: Competem diretamente no Buy Box; estratégia de bid deve considerar a concorrência no catálogo.

5. **Métricas-chave**:
   - ACOS = custo_total_anúncios / receita_gerada × 100 → quanto menor, mais eficiente
   - ROAS = receita_gerada / custo_total_anúncios → quanto maior, mais retorno

6. **Restrições de ROAS obrigatórias**:
   - ROAS mínimo: **4** (abaixo disso a campanha não é viável)
   - ROAS máximo: **35** (acima disso o lance é muito conservador e perde visibilidade)
   - Para cada campanha, defina o ROAS alvo dentro desse intervalo com base no perfil dos produtos

7. **Recomendações gerais**:
   - Novos produtos (sem vendas): usar estratégia VISIBILITY, ROAS alvo entre 4 e 8
   - Produtos com vendas moderadas: estratégia INCREASE, ROAS alvo entre 8 e 20
   - Bestsellers: estratégia PROFITABILITY, ROAS alvo entre 20 e 35
   - Produtos com estoque 0: NÃO incluir em campanhas
   - Produtos com visitas altas e conversão < 0,5%: investigar preço/fotos antes de anunciar

---

## SOLICITAÇÃO DE ANÁLISE

Com base em TODOS os dados fornecidos acima, por favor:

1. **MONTE AS CAMPANHAS A CRIAR**, especificando para cada uma:
   - Nome sugerido
   - Tipo (Automática ou Personalizada)
   - Estratégia (PROFITABILITY / INCREASE / VISIBILITY)
   - **ROAS alvo** (obrigatório, entre 4 e 35 — justifique o valor escolhido)
   - **Lista dos MLB IDs que entram nessa campanha** (escolha anúncio por anúncio com base nas métricas — NÃO agrupe apenas por categoria/domínio)
   - Budget diário sugerido (em R$)
   - Justificativa baseada nas métricas individuais de cada anúncio selecionado

2. **CRITÉRIOS DE SELEÇÃO DOS ANÚNCIOS** por campanha:
   - Avalie cada anúncio individualmente pelo seu desempenho real (vendas, visitas, conversão, estoque, tipo)
   - Anúncios com perfil similar de performance devem compor a mesma campanha
   - Domínio/categoria pode ser usado como referência, mas não é o critério principal — o que define a campanha é o perfil de performance do anúncio

3. **IDENTIFIQUE PRODUTOS A EXCLUIR** de campanhas e justifique (ex: sem estoque, conversão muito baixa, preço fora de mercado, etc.)

4. **PRIORIZE** as campanhas por ordem de impacto esperado no faturamento.

Responda em português, com objetividade, seguindo exatamente o formato de campanha do ML.`;
}

// ── Exportar CSV ─────────────────────────────────────────────────────────────
function exportarCSV(ads) {
  const header = ['MLB ID', 'Título', 'SKU', 'Conta', 'Tipo', 'Catálogo', 'Domínio', 'Preço', 'Estoque', 'Vendas', 'Visitas', 'Conv%', 'Performance'];
  const rows = ads.map(ad => {
    const conv = convRate(ad);
    return [
      ad.id,
      `"${(ad.titulo || '').replace(/"/g, '""')}"`,
      `"${(ad.sku || '').replace(/"/g, '""')}"`,
      `"${(ad.conta?.nickname || '').replace(/"/g, '""')}"`,
      tipoML(ad),
      emCatalogo(ad) ? 'Sim' : 'Não',
      dominio(ad),
      (ad.preco || 0).toFixed(2).replace('.', ','),
      ad.estoque,
      ad.vendas,
      ad.visitas,
      conv != null ? conv : '',
      tierPerf(ad.vendas).label,
    ].join(';');
  });
  const csv = [header.join(';'), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `product-ads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function PlanejadorProductAds({ usuarioId }) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [anuncios, setAnuncios] = useState([]);
  const [contasML, setContasML] = useState([]);
  const [carregado, setCarregado] = useState(false);

  const [filtroConta, setFiltroConta] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCatalogo, setFiltroCatalogo] = useState('');
  const [filtroPerf, setFiltroPerf] = useState('');
  const [filtroFrete, setFiltroFrete] = useState('');
  const [busca, setBusca] = useState('');

  const [selecionados, setSelecionados] = useState(new Set());
  const [prompt, setPrompt] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('tabela'); // 'tabela' | 'prompt'

  const carregarAnuncios = async () => {
    setLoading(true);
    setLoadingMsg('Buscando anúncios...');
    try {
      const cfgRes = await fetch(`/api/usuario/${usuarioId}/config`);
      const cfg = await cfgRes.json();
      const contas = cfg.contasML || [];
      setContasML(contas);
      if (!contas.length) { alert('Nenhuma conta ML conectada.'); return; }

      const ids = contas.map(c => c.id).join(',');
      const BATCH = 500;
      let page = 1;
      let allAds = [];
      let total = null;

      do {
        setLoadingMsg(`Carregando... ${allAds.length}${total ? '/' + total : ''} anúncios`);
        const res = await fetch(`/api/ml/anuncios?contasIds=${ids}&status=active&limit=${BATCH}&page=${page}&sortBy=vendas_desc`);
        const data = await res.json();
        const batch = data.anuncios || [];
        allAds = allAds.concat(batch);
        total = data.total;
        page++;
        if (batch.length < BATCH) break;
      } while (allAds.length < total);

      setAnuncios(allAds);
      setSelecionados(new Set(allAds.map(a => a.id)));
      setCarregado(true);
      setPrompt('');
      setAbaAtiva('tabela');
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const adsFiltrados = useMemo(() => {
    return anuncios.filter(ad => {
      if (filtroConta && ad.contaId !== filtroConta) return false;
      if (filtroTipo && tipoML(ad) !== filtroTipo) return false;
      if (filtroCatalogo === 'sim' && !emCatalogo(ad)) return false;
      if (filtroCatalogo === 'nao' && emCatalogo(ad)) return false;
      if (filtroPerf) {
        const tier = tierPerf(ad.vendas).label;
        if (tier !== filtroPerf) return false;
      }
      if (filtroFrete === 'sim' && !ad.dadosML?.shipping?.free_shipping) return false;
      if (filtroFrete === 'nao' && ad.dadosML?.shipping?.free_shipping) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (!ad.titulo.toLowerCase().includes(q) && !ad.id.toLowerCase().includes(q) && !(ad.sku || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [anuncios, filtroConta, filtroTipo, filtroCatalogo, filtroPerf, filtroFrete, busca]);

  const adsSelecionadosParaPrompt = useMemo(
    () => adsFiltrados.filter(a => selecionados.has(a.id)),
    [adsFiltrados, selecionados]
  );

  const toggleItem = (id) => setSelecionados(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleTodosFiltrados = () => {
    const keys = adsFiltrados.map(a => a.id);
    const todosMarcados = keys.every(k => selecionados.has(k));
    setSelecionados(prev => {
      const next = new Set(prev);
      if (todosMarcados) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const handleGerarPrompt = () => {
    const p = gerarPrompt(adsSelecionadosParaPrompt);
    setPrompt(p);
    setAbaAtiva('prompt');
  };

  const handleCopiar = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const todosFiltradosMarcados = adsFiltrados.length > 0 && adsFiltrados.every(a => selecionados.has(a.id));

  // domínios únicos para exibição na tabela (curtos)
  const dominioCurto = (ad) => {
    const d = dominio(ad);
    if (d === '—') return '—';
    // Pega a última parte do domain_id (ex: MLB-CARS_AND_TRUCKS-OTHER → OTHER)
    const partes = d.split('-');
    return partes[partes.length - 1] || d;
  };

  return (
    <div className="p-4 space-y-4 max-w-full">
      {/* Header */}
      <div className="rounded-xl overflow-hidden shadow-sm border border-orange-200">
        <div className="bg-gradient-to-r from-orange-600 to-amber-500 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-black text-lg tracking-tight">Planejador de Product Ads</h1>
            <p className="text-orange-100 text-xs mt-0.5">Analise sua carteira de anúncios e gere um prompt estruturado para IA criar campanhas otimizadas</p>
          </div>
          <div className="bg-white/20 rounded-lg p-2">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Controles superiores */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={carregarAnuncios}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? (loadingMsg || 'Carregando...') : carregado ? 'Recarregar Anúncios' : 'Carregar Anúncios Ativos'}
          </button>

          {carregado && (
            <>
              <div className="h-6 w-px bg-gray-200" />
              {/* Filtros */}
              {contasML.length > 1 && (
                <select value={filtroConta} onChange={e => setFiltroConta(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">Todas as contas</option>
                  {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
                </select>
              )}
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Premium + Clássico</option>
                <option value="Premium">Somente Premium</option>
                <option value="Clássico">Somente Clássico</option>
              </select>
              <select value={filtroCatalogo} onChange={e => setFiltroCatalogo(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Catálogo: Todos</option>
                <option value="sim">Em Catálogo</option>
                <option value="nao">Fora do Catálogo</option>
              </select>
              <select value={filtroPerf} onChange={e => setFiltroPerf(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Performance: Todas</option>
                <option value="Alto">Alta (&ge;50 vendas)</option>
                <option value="Médio">Média (10–49)</option>
                <option value="Baixo">Baixa (1–9)</option>
                <option value="Nenhuma">Sem vendas</option>
              </select>
              <select value={filtroFrete} onChange={e => setFiltroFrete(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Frete: Todos</option>
                <option value="sim">Frete Grátis</option>
                <option value="nao">Sem Frete Grátis</option>
              </select>
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por título, MLB, SKU..."
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 w-48"
              />
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{selecionados.size} selecionados de {anuncios.length}</span>
                <button
                  onClick={() => exportarCSV(adsFiltrados)}
                  disabled={adsFiltrados.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  Exportar Planilha ({adsFiltrados.length})
                </button>
                <button
                  onClick={handleGerarPrompt}
                  disabled={selecionados.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                  Gerar Prompt para IA
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!carregado && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <svg className="w-14 h-14 text-orange-100 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-400 text-sm font-semibold">Clique em "Carregar Anúncios Ativos" para começar</p>
          <p className="text-gray-300 text-xs mt-1">Carrega todos os anúncios ativos ordenados por vendas</p>
        </div>
      )}

      {carregado && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Abas */}
          <div className="flex border-b border-gray-100">
            {[
              { id: 'tabela', label: `Tabela de Anúncios (${adsFiltrados.length})` },
              { id: 'prompt', label: 'Prompt Gerado', disabled: !prompt },
            ].map(aba => (
              <button
                key={aba.id}
                onClick={() => !aba.disabled && setAbaAtiva(aba.id)}
                disabled={aba.disabled}
                className={`px-5 py-3 text-sm font-bold transition-colors border-b-2 -mb-px ${
                  abaAtiva === aba.id
                    ? 'border-orange-500 text-orange-600'
                    : aba.disabled
                    ? 'border-transparent text-gray-300 cursor-not-allowed'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {aba.label}
              </button>
            ))}
          </div>

          {/* Aba: Tabela */}
          {abaAtiva === 'tabela' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2 text-left">
                      <input type="checkbox" checked={todosFiltradosMarcados} onChange={toggleTodosFiltrados}
                        className="rounded border-gray-300 text-orange-500" />
                    </th>
                    <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">Anúncio</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">Conta</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">Tipo</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">Catálogo</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">Domínio</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Preço</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Estoque</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Vendas</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Visitas</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Conv%</th>
                    <th className="px-3 py-2 text-center text-gray-500 font-bold uppercase tracking-wide">Perf.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {adsFiltrados.length === 0 && (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-300">Nenhum anúncio para este filtro</td></tr>
                  )}
                  {adsFiltrados.map(ad => {
                    const sel = selecionados.has(ad.id);
                    const conv = convRate(ad);
                    const tier = tierPerf(ad.vendas);
                    const catalogo = emCatalogo(ad);
                    const tipo = tipoML(ad);
                    return (
                      <tr key={ad.id} className={`hover:bg-gray-50 transition-colors ${sel ? 'bg-orange-50/30' : ''} ${ad.estoque === 0 ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={sel} onChange={() => toggleItem(ad.id)}
                            className="rounded border-gray-300 text-orange-500" />
                        </td>
                        <td className="px-3 py-2 max-w-[220px]">
                          <div className="truncate font-semibold text-gray-700" title={ad.titulo}>{ad.titulo}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <a href={`https://produto.mercadolivre.com.br/${ad.id}`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-mono text-gray-400 hover:text-orange-600 hover:underline">{ad.id}</a>
                            {ad.sku && <span className="text-[10px] text-gray-400">· {ad.sku}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">{ad.conta?.nickname || '—'}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tipo === 'Premium' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                            {tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {catalogo
                            ? <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">Sim</span>
                            : <span className="text-[10px] text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 max-w-[120px]">
                          <span className="text-[10px] text-gray-500 truncate block" title={dominio(ad)}>{dominioCurto(ad)}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-700">{fmtBRL(ad.preco)}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          <span className={ad.estoque === 0 ? 'text-red-500' : 'text-gray-700'}>{ad.estoque}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-700">{ad.vendas}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{ad.visitas}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {conv != null ? (
                            <span className={Number(conv) < 0.5 ? 'text-red-400' : Number(conv) > 5 ? 'text-emerald-600 font-bold' : 'text-gray-600'}>
                              {conv}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tier.color}`}>{tier.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Aba: Prompt */}
          {abaAtiva === 'prompt' && prompt && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-700">Prompt gerado com {adsSelecionadosParaPrompt.length} anúncio(s)</p>
                  <p className="text-xs text-gray-400 mt-0.5">Cole este prompt no ChatGPT, Claude ou Gemini para obter as recomendações de campanhas.</p>
                </div>
                <button
                  onClick={handleCopiar}
                  className={`flex items-center gap-2 px-4 py-2 font-bold text-sm rounded-lg transition-colors ${copiado ? 'bg-emerald-600 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}
                >
                  {copiado ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copiado!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copiar Prompt
                    </>
                  )}
                </button>
              </div>
              <textarea
                readOnly
                value={prompt}
                className="w-full h-[60vh] font-mono text-xs p-4 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
