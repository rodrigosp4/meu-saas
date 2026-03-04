import React, { useState, useEffect } from 'react';

// ✅ Mapa de tradução das tags do ML para labels amigáveis e cores
const TAG_DISPLAY_MAP = {
  incomplete_compatibilities:           { label: 'Compat. Incompleta',    color: 'bg-orange-100 text-orange-800 border-orange-200' },
  incomplete_position_compatibilities:  { label: 'Posição Compat. Inc.',  color: 'bg-orange-100 text-orange-800 border-orange-200' },
  poor_quality_picture:                 { label: 'Foto Ruim',            color: 'bg-red-100 text-red-800 border-red-200' },
  poor_quality_thumbnail:               { label: 'Thumb Ruim',           color: 'bg-red-100 text-red-800 border-red-200' },
  picture_downloading_pending:          { label: 'Download Foto Pend.',  color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  moderation_penalty:                   { label: 'Penalidade Moderação', color: 'bg-red-200 text-red-900 border-red-300' },
  out_of_stock:                         { label: 'Sem Estoque (Tag)',    color: 'bg-gray-200 text-gray-800 border-gray-300' },
  incomplete_technical_specs:           { label: 'Ficha Técnica Inc.',   color: 'bg-amber-100 text-amber-800 border-amber-200' },
  waiting_for_patch:                    { label: 'Aguardando Patch',     color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

function getTagBadge(tagValue) {
  const mapped = TAG_DISPLAY_MAP[tagValue];
  if (mapped) {
    return <span className={`${mapped.color} border text-[9px] px-1.5 py-0.5 rounded font-bold`}>{mapped.label}</span>;
  }
  const label = tagValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[9px] px-1.5 py-0.5 rounded font-bold">{label}</span>;
}

// ===== MODAL PREENCHER FICHA TÉCNICA =====
const CAMPOS_FICHA = [
  { id: 'BRAND',       label: 'Marca',                   placeholder: 'Ex: Bosch, 3M, Würth...' },
  { id: 'MODEL',       label: 'Modelo',                   placeholder: 'Ex: GBH 2-26 D' },
  { id: 'PART_NUMBER', label: 'Código do Fabricante (Part Number)', placeholder: 'Ex: 0611253768' },
  { id: 'GTIN',        label: 'GTIN / EAN / Código de Barras', placeholder: 'Ex: 7891234567890' },
  { id: 'TYPE',        label: 'Tipo',                     placeholder: 'Ex: Furadeira de Impacto' },
  { id: 'MATERIAL',    label: 'Material',                 placeholder: 'Ex: Aço Inoxidável' },
  { id: 'COLOR',       label: 'Cor / Acabamento',         placeholder: 'Ex: Preto' },
  { id: 'VOLTAGE',     label: 'Voltagem',                 placeholder: 'Ex: 220V / Bivolt' },
  { id: 'WARRANTY',    label: 'Garantia',                 placeholder: 'Ex: 12 meses' },
];

function ModalFichaTecnica({ anuncio, onClose }) {
  const [valores, setValores] = useState({});

  if (!anuncio) return null;

  const handleChange = (id, val) => setValores(prev => ({ ...prev, [id]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-black text-base">Preencher Ficha Técnica</h2>
            <p className="text-amber-100 text-xs mt-0.5 truncate max-w-sm" title={anuncio.titulo}>{anuncio.titulo}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tag de aviso */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-amber-700 text-xs font-semibold">
            Anúncio <span className="font-black font-mono">{anuncio.id}</span> — Ficha Técnica Incompleta (incomplete_technical_specs)
          </span>
        </div>

        {/* Campos */}
        <div className="px-6 py-4 max-h-[55vh] overflow-y-auto space-y-3">
          {CAMPOS_FICHA.map(campo => (
            <div key={campo.id}>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                {campo.label}
              </label>
              <input
                type="text"
                value={valores[campo.id] || ''}
                onChange={e => handleChange(campo.id, e.target.value)}
                placeholder={campo.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400 italic">* Integração com API em breve</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              disabled
              title="Integração com ML em desenvolvimento"
              className="px-5 py-2 text-sm font-black text-white bg-amber-500 rounded-lg opacity-60 cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Salvar na ML (em breve)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
// =========================================

export default function GerenciadorAnuncios({ usuarioId }) {
  const [anuncios, setAnuncios] = useState([]);
  const [total, setTotal] = useState(0);
  const [contasML, setContasML] = useState([]);
  const [fichaTecnicaModal, setFichaTecnicaModal] = useState(null);
  
  const [syncProgress, setSyncProgress] = useState(null);
  const [contaParaSincronizar, setContaParaSincronizar] = useState('');

  // Estados para busca individual
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [singleMlbId, setSingleMlbId] = useState('');
  const [singleSku, setSingleSku] = useState('');
  const [selectedAccountForFetch, setSelectedAccountForFetch] = useState('');

  // Filtros principais
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [contaFilter, setContaFilter] = useState('Todas');
  const [tagFilter, setTagFilter] = useState('Todas');
  const [availableTags, setAvailableTags] = useState([]);
  const [semTagCount, setSemTagCount] = useState(0);

  // ✅ NOVO: Filtros adicionais (expansíveis)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [promoFilter, setPromoFilter] = useState('Todos');       // 'Todos' | 'com_desconto' | 'sem_desconto'
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');
  const [prazoFilter, setPrazoFilter] = useState('Todos');       // 'Todos' | 'imediato' | 'com_prazo'
  const [descontoMin, setDescontoMin] = useState('');            // ✅ NOVO
  const [descontoMax, setDescontoMax] = useState('');            // ✅ NOVO

  // Ordenação
  const [sortBy, setSortBy] = useState('padrao');

  // Checkboxes / seleção em massa
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAcoesMassa, setShowAcoesMassa] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const itemsPerPage = 50;

  // ✅ NOVO: Conta quantos filtros adicionais estão ativos (para badge no botão)
  const activeAdvancedFiltersCount = [
    promoFilter !== 'Todos',
    precoMin !== '',
    precoMax !== '',
    prazoFilter !== 'Todos',
    descontoMin !== '',       // ✅ NOVO
    descontoMax !== '',       // ✅ NOVO
  ].filter(Boolean).length;
  
  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.contasML) setContasML(data.contasML);
      });
  }, [usuarioId]);

  const fetchAvailableTags = async () => {
    try {
      const idsPermitidos = contasML.map(c => c.id).join(',');
      if (!idsPermitidos) return;
      
      let queryContas = contaFilter === 'Todas' ? idsPermitidos : contaFilter;
      const res = await fetch(`/api/ml/anuncios/tags?contasIds=${queryContas}`);
      const data = await res.json();
      setAvailableTags(data.tags || []);
      setSemTagCount(data.semTagCount || 0);
    } catch (error) {
      console.error("Erro ao buscar tags:", error);
    }
  };

  const fetchAnuncios = async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
    try {
      const idsPermitidos = contasML.map(c => c.id).join(',');
      if (!idsPermitidos) return setIsLoading(false);

      let queryConta = contaFilter === 'Todas' ? idsPermitidos : contaFilter;

      const params = new URLSearchParams({
        contasIds: queryConta,
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm,
        status: statusFilter,
        tag: tagFilter,
        promo: promoFilter,
        precoMin: precoMin,
        precoMax: precoMax,
        prazo: prazoFilter,
        descontoMin: descontoMin,
        descontoMax: descontoMax,
        sortBy: sortBy,
      });

      const res = await fetch(`/api/ml/anuncios?${params.toString()}`);
      const data = await res.json();
      setAnuncios(data.anuncios);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contasML.length === 0) return; 
    fetchAnuncios();
  }, [currentPage, searchTerm, statusFilter, contaFilter, tagFilter, promoFilter, precoMin, precoMax, prazoFilter, descontoMin, descontoMax, sortBy, contasML]);

  useEffect(() => {
    if (contasML.length === 0) return;
    fetchAvailableTags();
  }, [contaFilter, contasML]);

  // ✅ NOVO: Limpar todos os filtros adicionais de uma vez
  const limparFiltrosAdicionais = () => {
    setPromoFilter('Todos');
    setPrecoMin('');
    setPrecoMax('');
    setPrazoFilter('Todos');
    setDescontoMin('');         // ✅ NOVO
    setDescontoMax('');         // ✅ NOVO
    setCurrentPage(1);
  };

  const iniciarSincronizacaoML = async () => {
    if (!contaParaSincronizar) return alert("Selecione uma conta para puxar os anúncios.");

    setSyncProgress(0);

    // Monta a lista de contas a sincronizar
    const contasParaSync = contaParaSincronizar === '_TODAS_'
      ? contasML.map(c => c.id)
      : [contaParaSincronizar];

    try {
      const jobIds = [];

      // Dispara um job de sync-ads para cada conta selecionada
      for (const contaId of contasParaSync) {
        const res = await fetch('/api/ml/sync-ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contaId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Falha ao iniciar varredura');
        jobIds.push(data.jobId);
      }

      // Polling: acompanha o progresso de TODOS os jobs
      const interval = setInterval(async () => {
        try {
          let totalProgress = 0;
          let allDone = true;
          let anyFailed = false;

          for (const jobId of jobIds) {
            const statusRes = await fetch(`/api/ml/sync-ads-status/${jobId}`);
            const statusData = await statusRes.json();

            if (statusData.state === 'failed') {
              anyFailed = true;
            } else if (statusData.state !== 'completed') {
              allDone = false;
            }
            totalProgress += (statusData.progress || 0);
          }

          const avgProgress = Math.floor(totalProgress / jobIds.length);
          setSyncProgress(avgProgress);

          if (anyFailed) {
            clearInterval(interval);
            setSyncProgress(null);
            alert("❌ Falha na importação de uma ou mais contas. Verifique o console.");
          } else if (allDone) {
            clearInterval(interval);
            setSyncProgress(100);
            setTimeout(() => {
              setSyncProgress(null);
              fetchAnuncios();
              fetchAvailableTags();
              alert("✅ Anúncios importados do Mercado Livre!");
            }, 800);
          }
        } catch (e) { /* silencia erros de polling */ }
      }, 2000);

    } catch (e) {
      alert("Erro ao disparar varredura: " + e.message);
      setSyncProgress(null);
    }
  };

  const mergeAdsIntoState = (newAds) => {
    const adMap = new Map(anuncios.map(ad => [ad.id, ad]));
    newAds.forEach(newAd => adMap.set(newAd.id, newAd));
    setAnuncios(Array.from(adMap.values()));
    setTotal(adMap.size);
    fetchAvailableTags();
  };

  const handleFetchSingleMlb = async () => {
    if (!singleMlbId || !selectedAccountForFetch) return alert("Selecione a conta e digite um MLB válido.");
    
    setIsFetchingSingle(true);
    try {
      const res = await fetch(`/api/ml/anuncio/${singleMlbId.trim()}?contaId=${selectedAccountForFetch}&userId=${usuarioId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao buscar anúncio.');

      mergeAdsIntoState([data]);
      alert(`Anúncio ${data.id} importado/atualizado com sucesso!`);
      setSingleMlbId('');
    } catch(e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsFetchingSingle(false);
    }
  };

  const handleFetchBySku = async () => {
    if (!singleSku) return alert("Digite um SKU para buscar.");

    setIsFetchingSingle(true);
    try {
        const res = await fetch('/api/ml/anuncios-por-sku', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku: singleSku.trim(), userId: usuarioId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Falha ao buscar por SKU.');

        if (data.length === 0) {
          alert(`Nenhum anúncio encontrado para o SKU "${singleSku}" em suas contas.`);
        } else {
          mergeAdsIntoState(data);
          alert(`${data.length} anúncio(s) encontrados e atualizados para o SKU "${singleSku}".`);
          setSingleSku('');
        }
    } catch(e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsFetchingSingle(false);
    }
  };

  // Funções Auxiliares de Formatação
  const getMfgTime = (dadosML) => {
    if (!dadosML || !dadosML.sale_terms) return '-';
    const mfgTerm = dadosML.sale_terms.find(t => t.id === 'MANUFACTURING_TIME');
    if (!mfgTerm) return 'Imediato';
    return mfgTerm.value_name.replace('dias', 'd').replace('days', 'd');
  };

  const getDiscountPerc = (preco, precoOriginal) => {
    if (!precoOriginal || precoOriginal <= preco) return null;
    return Math.round(((precoOriginal - preco) / precoOriginal) * 100);
  };

  return (
    <>
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Edição em Massa e Gerenciador ML</h3>
          <p className="text-sm text-gray-500 mb-2">{total} anúncios sincronizados no banco local.</p>
          
          {syncProgress !== null && (
            <div className="w-64 mt-2">
               <div className="flex justify-between mb-1"><span className="text-xs font-bold text-green-700">Lendo API do ML...</span><span className="text-xs font-bold text-green-700">{syncProgress}%</span></div>
               <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${syncProgress}%` }}></div></div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
           <select 
             value={contaParaSincronizar} 
             onChange={e => setContaParaSincronizar(e.target.value)}
             className="px-3 py-2 border border-gray-300 rounded text-sm bg-white font-medium focus:ring-blue-500"
           >
             <option value="">Selecione a Conta...</option>
            <option value="_TODAS_">📦 Todas as Contas</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
           </select>
           <button 
             onClick={iniciarSincronizacaoML} 
             disabled={syncProgress !== null || !contaParaSincronizar} 
             className="px-5 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 transition disabled:opacity-50"
           >
            {syncProgress !== null ? 'Sincronizando...' : '⬇ Importar Tudo'}
           </button>
        </div>
      </div>

      {/* Seção: Adicionar / Atualizar Individualmente */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h4 className="font-bold text-gray-700 mb-3 text-sm">Adicionar / Atualizar Individualmente</h4>
        <div className="flex items-center gap-4">
          {/* Busca por MLB */}
          <div className="flex items-center gap-2 border-r pr-4">
            <label className="text-sm font-semibold">Conta:</label>
            <select value={selectedAccountForFetch} onChange={e => setSelectedAccountForFetch(e.target.value)} className="w-48 px-2 py-1.5 border rounded-md text-sm">
              {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
            </select>
            <label className="text-sm font-semibold">MLB:</label>
            <input type="text" value={singleMlbId} onChange={e => setSingleMlbId(e.target.value)} placeholder="MLB123456789" className="w-40 px-2 py-1.5 border rounded-md text-sm"/>
            <button onClick={handleFetchSingleMlb} disabled={isFetchingSingle} className="px-4 py-1.5 bg-blue-600 text-white font-bold text-sm rounded disabled:opacity-50">
              {isFetchingSingle ? 'Buscando...' : 'Puxar MLB'}
            </button>
          </div>
          {/* Busca por SKU */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold">OU SKU:</label>
            <input type="text" value={singleSku} onChange={e => setSingleSku(e.target.value)} placeholder="SKU-PRODUTO-01" className="w-48 px-2 py-1.5 border rounded-md text-sm"/>
            <button onClick={handleFetchBySku} disabled={isFetchingSingle} className="px-4 py-1.5 bg-gray-700 text-white font-bold text-sm rounded disabled:opacity-50">
              {isFetchingSingle ? 'Buscando...' : 'Buscar SKU e Adicionar'}
            </button>
          </div>
        </div>
      </div>

      {/* ✅ Barra de Filtros Principais */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-4 p-4">
          <input type="text" placeholder="Buscar por Título, MLB ou SKU..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          
          <select value={contaFilter} onChange={(e) => { setContaFilter(e.target.value); setCurrentPage(1); }} className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="Todas">Todas as Contas</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="Todos">Status (Todos)</option>
            <option value="active">Ativo (Active)</option>
            <option value="paused">Pausado (Paused)</option>
            <option value="under_review">Em Revisão</option>
            <option value="closed">Finalizado (Closed)</option>
          </select>

          {/* Dropdown de Tag Principal */}
          <select
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setCurrentPage(1); }}
            className="w-56 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="Todas">Tag Principal (Todas)</option>
            <option value="_sem_tag">✅ Sem Problema ({semTagCount})</option>
            {availableTags.map(t => (
              <option key={t.value} value={t.value}>
                ⚠️ {t.label} ({t.count})
              </option>
            ))}
          </select>

          {/* Ordenação */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
            className="w-52 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="padrao">Ordenar: Padrão</option>
            <option value="visitas_desc">↓ Mais Visitados</option>
            <option value="visitas_asc">↑ Menos Visitados</option>
            <option value="vendas_desc">↓ Mais Vendidos</option>
            <option value="vendas_asc">↑ Menos Vendidos</option>
            <option value="desconto_desc">↓ Maior Desconto</option>
            <option value="desconto_asc">↑ Menor Desconto</option>
            <option value="preco_desc">↓ Maior Preço</option>
            <option value="preco_asc">↑ Menor Preço</option>
            <option value="estoque_desc">↓ Mais Estoque</option>
            <option value="estoque_asc">↑ Menos Estoque</option>
          </select>
        </div>

        {/* ✅ NOVO: Botão "Filtros Adicionais" com seta e painel expansível */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            {/* Ícone de seta SVG */}
            <svg 
              className={`w-4 h-4 transition-transform duration-200 ${showAdvancedFilters ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Filtros Adicionais
            {/* Badge com quantidade de filtros ativos */}
            {activeAdvancedFiltersCount > 0 && (
              <span className="ml-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {activeAdvancedFiltersCount}
              </span>
            )}
          </button>

          {/* Painel de Filtros Adicionais (Expansível) */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showAdvancedFilters ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50">
              <div className="flex flex-wrap items-end gap-5">

                {/* Filtro de Promoção */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Promoção</label>
                  <select
                    value={promoFilter}
                    onChange={(e) => { setPromoFilter(e.target.value); setCurrentPage(1); }}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Todos">Todos</option>
                    <option value="com_desconto">🏷️ Com Desconto</option>
                    <option value="sem_desconto">Sem Desconto</option>
                  </select>
                </div>

                {/* Filtro de Preço */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Faixa de Preço (R$)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Mín"
                      value={precoMin}
                      onChange={(e) => { setPrecoMin(e.target.value); setCurrentPage(1); }}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                    />
                    <span className="text-gray-400 font-bold text-sm">até</span>
                    <input
                      type="number"
                      placeholder="Máx"
                      value={precoMax}
                      onChange={(e) => { setPrecoMax(e.target.value); setCurrentPage(1); }}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>


                {/* ✅ NOVO: Filtro de % de Desconto */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">% de Desconto</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Mín %"
                      value={descontoMin}
                      onChange={(e) => { setDescontoMin(e.target.value); setCurrentPage(1); }}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="1"
                    />
                    <span className="text-gray-400 font-bold text-sm">até</span>
                    <input
                      type="number"
                      placeholder="Máx %"
                      value={descontoMax}
                      onChange={(e) => { setDescontoMax(e.target.value); setCurrentPage(1); }}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="1"
                    />
                  </div>
                </div>

                {/* Filtro de Prazo de Fabricação */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Prazo de Fabricação</label>
                  <select
                    value={prazoFilter}
                    onChange={(e) => { setPrazoFilter(e.target.value); setCurrentPage(1); }}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Todos">Todos</option>
                    <option value="imediato">📦 Envio Imediato</option>
                    <option value="com_prazo">🕐 Com Prazo de Fabricação</option>
                  </select>
                </div>

                {/* Botão Limpar Filtros Adicionais */}
                {activeAdvancedFiltersCount > 0 && (
                  <button
                    onClick={limparFiltrosAdicionais}
                    className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                  >
                    ✕ Limpar Filtros
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== AÇÕES EM MASSA ===== */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowAcoesMassa(!showAcoesMassa)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showAcoesMassa ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Ações em Massa
            {selectedIds.size > 0 && (
              <span className="ml-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </span>
            )}
            <span className="ml-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              Em breve
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showAcoesMassa ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50">
              {selectedIds.size === 0 && (
                <p className="text-xs text-gray-400 italic mb-3">
                  Selecione anúncios na tabela abaixo para habilitar as ações.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '▶ Ativar Selecionados',   color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' },
                  { label: '⏸ Pausar Selecionados',    color: 'text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100' },
                  { label: '🏷️ Aplicar Desconto (%)',  color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' },
                  { label: '✕ Remover Desconto',       color: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100' },
                  { label: '💲 Alterar Preço em %',    color: 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100' },
                  { label: '📋 Exportar CSV',           color: 'text-gray-700 bg-white border-gray-300 hover:bg-gray-100' },
                ].map(({ label, color }) => (
                  <button
                    key={label}
                    disabled
                    title="Funcionalidade em desenvolvimento"
                    className={`px-4 py-2 text-sm font-semibold border rounded-md cursor-not-allowed opacity-50 transition-colors ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="bg-white shadow-md border border-gray-200 rounded-lg overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 whitespace-nowrap">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-400 text-indigo-600 cursor-pointer"
                  checked={anuncios.length > 0 && anuncios.every(ad => selectedIds.has(ad.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(anuncios.map(ad => ad.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Img</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Conta / ID</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Título / SKU</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-600 uppercase">Preço (de/por)</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">% Desc</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Estoque</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Visitas</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Vendas</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">T. Fabr.</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Tipo An.</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Catálogo / Tags</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan="13" className="px-6 py-10 text-center text-sm font-semibold text-gray-500">Buscando anúncios no banco local...</td></tr>
            ) : anuncios.length > 0 ? (
              anuncios.map((ad) => {
                const dadosML = ad.dadosML || {};
                const tags = dadosML.tags || [];
                const isCatalog = dadosML.catalog_listing;
                const mfgTime = getMfgTime(dadosML);
                const discount = getDiscountPerc(ad.preco, ad.precoOriginal);
                
                return (
                  <tr key={ad.id} className={`hover:bg-blue-50/30 transition-colors ${selectedIds.has(ad.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-400 text-indigo-600 cursor-pointer"
                        checked={selectedIds.has(ad.id)}
                        onChange={(e) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(ad.id);
                            else next.delete(ad.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <img src={ad.thumbnail} alt="thumb" className="w-10 h-10 object-cover rounded shadow-sm border border-gray-200" />
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-bold text-gray-800">{ad.conta?.nickname}</div>
                      <a href={ad.permalink} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-blue-600 hover:underline">{ad.id}</a>
                    </td>
                    <td className="px-3 py-2 text-sm max-w-xs">
                      <div className="font-semibold text-gray-900 truncate" title={ad.titulo}>{ad.titulo}</div>
                      <div className="text-[11px] font-mono text-gray-500 mt-0.5">SKU: {ad.sku || 'S/ SKU'}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-full border
                        ${ad.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' : 
                          ad.status === 'paused' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 
                          'bg-red-100 text-red-800 border-red-200'}`}>
                        {ad.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      {ad.precoOriginal && ad.precoOriginal > ad.preco && (
                        <div className="text-[10px] text-gray-400 line-through leading-none mb-1">de R$ {ad.precoOriginal.toFixed(2)}</div>
                      )}
                      <div className="font-bold text-gray-900">R$ {ad.preco.toFixed(2)}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {discount ? (
                        <span className="text-[11px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded">-{discount}%</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-black text-gray-700">
                      {ad.estoque}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-semibold text-blue-600">
                      {ad.visitas}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-semibold text-green-600">
                      {ad.vendas}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                      {mfgTime}
                    </td>
                    <td className="px-3 py-2 text-center text-[10px] font-bold uppercase text-gray-500">
                      {dadosML.listing_type_id?.replace('gold_special', 'Clássico').replace('gold_pro', 'Premium') || '-'}
                    </td>
                    {/* Coluna de Tags: tag principal + catálogo + botão ficha técnica */}
                    <td className="px-3 py-2 text-left">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {isCatalog && <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[9px] px-1.5 py-0.5 rounded font-bold">Catálogo</span>}

                        {ad.tagPrincipal && getTagBadge(ad.tagPrincipal)}

                        {!ad.tagPrincipal && tags.includes('good_quality_picture') && (
                          <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[9px] px-1.5 py-0.5 rounded font-bold">Img OK</span>
                        )}

                        {(ad.tagPrincipal === 'incomplete_technical_specs' || tags.includes('incomplete_technical_specs')) && (
                          <button
                            onClick={() => setFichaTecnicaModal(ad)}
                            className="mt-1 flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors"
                            title="Preencher Ficha Técnica"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            Preencher Ficha
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr><td colSpan="13" className="px-6 py-10 text-center text-sm text-gray-500">Nenhum anúncio encontrado. Verifique os filtros ou importe dados.</td></tr>
            )}
          </tbody>
        </table>
        
        {/* Paginação */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <span className="text-sm font-semibold text-gray-600">
            Página {currentPage} — {total} anúncio(s)
            {tagFilter !== 'Todas' && <span className="text-blue-600 ml-2">(filtrado por tag)</span>}
            {activeAdvancedFiltersCount > 0 && <span className="text-purple-600 ml-2">(+{activeAdvancedFiltersCount} filtro(s) adicional(is))</span>}
          </span>
          <div className="flex gap-2">
            <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</button>
            <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700" disabled={anuncios.length < itemsPerPage} onClick={() => setCurrentPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      </div>
    </div>

    <ModalFichaTecnica anuncio={fichaTecnicaModal} onClose={() => setFichaTecnicaModal(null)} />
    </>
  );
}
