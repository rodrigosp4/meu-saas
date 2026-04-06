// src/components/Catalogo.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const delay = (ms) => new Promise(r => setTimeout(r, ms));

const normalizeText = (str = '') =>
  String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const calcTextSimilarity = (a = '', b = '') => {
  const aa = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bb = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let inter = 0;
  for (const t of aa) { if (bb.has(t)) inter++; }
  return Math.round((inter / Math.max(aa.size, bb.size)) * 100);
};

const buildSmartCatalogQuery = (item) => {
  const titulo = (item?.titulo || '').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sku = (item?.sku || '').trim();
  return [titulo, sku].filter(Boolean).join(' ').trim();
};


// ─── Priority helpers ────────────────────────────────────────────────────────
const getItemPriorityData = (item, comparacoesCatalogo = {}) => {
  const status = item?.elegibilidade?.status || 'UNKNOWN';
  const suggested = !!item?.elegibilidade?.suggested_catalog_id;
  const hasVariations = !!item?.elegibilidade?.variations?.length;
  const isCatalogRequired = item?.elegibilidade?.listing_strategy === 'catalog_required';

  const compareEntries = Object.values(comparacoesCatalogo?.[item.id] || {});
  const bestComparison = compareEntries.filter(c => c?.data).sort((a, b) => (b?.data?.score || 0) - (a?.data?.score || 0))[0];
  const scoreComparacao = bestComparison?.data?.score || 0;
  const divergencias = bestComparison?.data?.divergencias?.length || 0;
  const checks = bestComparison?.data?.checks || {};

  let prioridadeScore = 0;
  let riscoScore = 0;
  const motivos = [];

  if (status === 'READY_FOR_OPTIN') { prioridadeScore += 50; motivos.push('Pronto para opt-in'); }
  if (suggested) { prioridadeScore += 25; motivos.push('Tem sugestão do ML'); }
  if (scoreComparacao >= 80) { prioridadeScore += 20; motivos.push('Comparação forte'); }
  else if (scoreComparacao >= 60) { prioridadeScore += 10; motivos.push('Comparação razoável'); }
  if (isCatalogRequired) { prioridadeScore += 10; motivos.push('Catálogo obrigatório'); }
  if (status === 'CATALOG_PRODUCT_ID_NULL') { prioridadeScore += 15; motivos.push('Falta apenas catalog_product_id'); }
  if (hasVariations) { riscoScore += 15; motivos.push('Possui variações'); }
  if (divergencias >= 1) { riscoScore += divergencias * 20; motivos.push(`${divergencias} divergência(s)`); }
  if (checks.domain === false) { riscoScore += 30; motivos.push('Domínio divergente'); }
  if (checks.brand === false) { riscoScore += 20; motivos.push('Marca divergente'); }
  if (checks.model === false) { riscoScore += 20; motivos.push('Modelo divergente'); }
  if (checks.gtin === false) { riscoScore += 15; motivos.push('GTIN divergente'); }
  if (status === 'NOT_ELIGIBLE') { riscoScore += 40; motivos.push('Não elegível'); }
  if (status === 'UNKNOWN') { riscoScore += 25; motivos.push('Status desconhecido'); }

  const prioridade = prioridadeScore >= 70 ? 'ALTA' : prioridadeScore >= 35 ? 'MEDIA' : 'BAIXA';
  const risco = riscoScore >= 50 ? 'ALTO' : riscoScore >= 20 ? 'MEDIO' : 'BAIXO';

  return { prioridade, risco, prioridadeScore, riscoScore, scoreComparacao, divergencias, motivos };
};

const getPriorityBadgeClass = (p) => p === 'ALTA' ? 'bg-green-100 text-green-800' : p === 'MEDIA' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700';
const getRiskBadgeClass = (r) => r === 'BAIXO' ? 'bg-green-100 text-green-800' : r === 'MEDIO' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';


// ─── Suggestion helpers ──────────────────────────────────────────────────────
const getSuggestionConfidenceClass = (n) => n === 'FORTE' ? 'bg-green-100 text-green-800' : n === 'MEDIA' ? 'bg-yellow-100 text-yellow-800' : n === 'FRACA' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700';

const buildSuggestionFromItem = (item, inlineSearches = {}, comparacoesCatalogo = {}) => {
  const itemId = item?.id;
  const mlSuggestedId = item?.elegibilidade?.suggested_catalog_id || null;
  const results = Array.isArray(inlineSearches?.[itemId]?.results) ? inlineSearches[itemId].results : [];
  const compareEntries = Object.entries(comparacoesCatalogo?.[itemId] || {}).map(([productId, cs]) => ({ productId, cs })).filter(e => e.cs?.data);
  const bestCompared = compareEntries.sort((a, b) => (b.cs?.data?.score || 0) - (a.cs?.data?.score || 0))[0];
  const topSearch = results[0] || null;

  let suggestedProductId = null, source = null, confidence = 'NENHUMA', score = 0, divergencias = 0;
  const motivos = [];

  if (bestCompared?.cs?.data) {
    const d = bestCompared.cs.data;
    suggestedProductId = bestCompared.productId;
    source = 'comparacao'; score = d.score || 0; divergencias = d.divergencias?.length || 0;
    if (score >= 80 && divergencias === 0) { confidence = 'FORTE'; motivos.push('Comparação com score alto'); }
    else if (score >= 60 && divergencias <= 1) { confidence = 'MEDIA'; motivos.push('Comparação boa'); }
    else { confidence = 'FRACA'; motivos.push('Comparação exige revisão'); }
  } else if (mlSuggestedId) {
    suggestedProductId = mlSuggestedId; source = 'mercadolivre'; confidence = 'MEDIA';
    motivos.push('Sugestão do Mercado Livre');
  } else if (topSearch?.id) {
    const sim = calcTextSimilarity(item?.titulo || '', topSearch?.name || '');
    suggestedProductId = topSearch.id; source = 'busca'; score = sim;
    if (sim >= 75) { confidence = 'MEDIA'; motivos.push('Alta similaridade na busca'); }
    else if (sim >= 50) { confidence = 'FRACA'; motivos.push('Similaridade razoável'); }
    else { confidence = 'NENHUMA'; motivos.push('Similaridade insuficiente'); }
  }

  if (item?.elegibilidade?.listing_strategy === 'catalog_required') motivos.push('Catálogo obrigatório');

  return { itemId, suggestedProductId, source, confidence, score, divergencias, motivos };
};

const getSuggestionDecision = (s) => {
  if (!s?.suggestedProductId) return { action: 'NAO_SUGERIR', label: 'Sem sugestão', class: 'bg-gray-100 text-gray-500' };
  if (s.confidence === 'FORTE') return { action: 'ASSOCIAR_DIRETO', label: 'Associar Confiança Alta', class: 'bg-green-600 text-white hover:bg-green-700' };
  if (s.confidence === 'MEDIA') return { action: 'REVISAR_E_ASSOCIAR', label: 'Associar (Confiança Média)', class: 'bg-emerald-500 text-white hover:bg-emerald-600' };
  if (s.confidence === 'FRACA') return { action: 'ABRIR_BUSCA', label: 'Abrir Buscador (Risco)', class: 'bg-orange-500 text-white hover:bg-orange-600' };
  return { action: 'NAO_SUGERIR', label: 'Sem sugestão', class: 'bg-gray-100' };
};

const sortBySuggestionPriority = (items = [], catalogSuggestionsMap = {}, comparacoesCatalogo = {}) =>
  [...items].sort((a, b) => {
    const rank = { FORTE: 3, MEDIA: 2, FRACA: 1, NENHUMA: 0 };
    const ra = rank[catalogSuggestionsMap[a.id]?.confidence || 'NENHUMA'] || 0;
    const rb = rank[catalogSuggestionsMap[b.id]?.confidence || 'NENHUMA'] || 0;
    if (rb !== ra) return rb - ra;
    const pa = getItemPriorityData(a, comparacoesCatalogo);
    const pb = getItemPriorityData(b, comparacoesCatalogo);
    if (pb.prioridadeScore !== pa.prioridadeScore) return pb.prioridadeScore - pa.prioridadeScore;
    return pa.riscoScore - pb.riscoScore;
  });

// ─── Competition helpers ─────────────────────────────────────────────────────
const toNumber = (v) => { if (v === null || v === undefined || v === '') return 0; const n = Number(v); return Number.isFinite(n) ? n : 0; };

const getCompetitionInfo = (comp) => {
  if (!comp) return { currentPrice: 0, priceToWin: 0, diffValue: 0, diffPercent: 0, hasPriceToWin: false };
  const currentPrice = toNumber(comp?.item_price) || toNumber(comp?.current_price) || toNumber(comp?.price) || 0;
  const priceToWin = toNumber(comp?.price_to_win?.amount) || toNumber(comp?.price_to_win) || toNumber(comp?.winning_price) || 0;
  const diffValue = priceToWin > 0 ? currentPrice - priceToWin : 0;
  const diffPercent = priceToWin > 0 ? ((currentPrice - priceToWin) / priceToWin) * 100 : 0;
  return { currentPrice, priceToWin, diffValue, diffPercent, hasPriceToWin: priceToWin > 0 };
};

const getCompetitionBadgeClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('winning') || s.includes('winner')) return 'bg-green-100 text-green-800';
  if (s.includes('sharing') || s.includes('tie')) return 'bg-yellow-100 text-yellow-800';
  if (s.includes('losing') || s.includes('lose') || s.includes('not_winning') || s.includes('competing')) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
};

const getCompetitionRecommendation = (comp) => {
  const status = String(comp?.status || comp?.competition_status || '').toLowerCase();
  const info = getCompetitionInfo(comp);
  const isWinning = status.includes('winning') || status.includes('winner');
  const isSharing = status.includes('sharing') || status.includes('tie');
  if (isWinning) return { tipo: 'ok', titulo: 'Você está ganhando', texto: 'Mantenha o preço e monitore a competição.' };
  if (isSharing) return { tipo: 'warn', titulo: 'Compartilhando a liderança', texto: 'Pequenos ajustes podem te colocar sozinho na frente.' };
  if (info.hasPriceToWin && info.currentPrice > info.priceToWin) return { tipo: 'danger', titulo: 'Preço acima do necessário', texto: `Reduzir cerca de ${fmt(info.diffValue)} pode melhorar sua posição.` };
  return { tipo: 'neutral', titulo: 'Sem recomendação clara', texto: 'Analise preço e benefícios para decidir.' };
};

const getRecommendationClass = (tipo) => {
  if (tipo === 'ok') return 'bg-green-50 border-green-200 text-green-800';
  if (tipo === 'warn') return 'bg-yellow-50 border-yellow-200 text-yellow-800';
  if (tipo === 'danger') return 'bg-red-50 border-red-200 text-red-800';
  return 'bg-gray-50 border-gray-200 text-gray-700';
};

// ─── Compare helpers ─────────────────────────────────────────────────────────
const getCompareState = (itemId, productId, comparacoesCatalogo) =>
  comparacoesCatalogo?.[itemId]?.[productId] || { loading: false, loaded: false, error: null, data: null };

const getCheckBadgeClass = (v) => v === true ? 'bg-green-100 text-green-800' : v === false ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700';

// ─── Batch helpers ────────────────────────────────────────────────────────────
const isItemSelecionado = (itemId, eligSelecionados) => !!eligSelecionados?.[itemId];
const getSelectedEligibilityItems = (items = [], eligSelecionados = {}) => items.filter(item => eligSelecionados[item.id]);
const toggleEligSelecionado = (itemId, setEligSelecionados) => setEligSelecionados(prev => ({ ...prev, [itemId]: !prev[itemId] }));
const marcarItensEmLote = (items = [], checked, setEligSelecionados) => setEligSelecionados(prev => { const next = { ...prev }; for (const item of items) next[item.id] = checked; return next; });
const limparSelecaoEligibility = (setEligSelecionados) => setEligSelecionados({});
const exportarCsvSelecionados = (items = []) => {
  const linhas = [['item_id', 'sku', 'titulo', 'status', 'suggested_catalog_id']];
  for (const item of items) linhas.push([item.id || '', item.sku || '', (item.titulo || '').replace(/"/g, '""'), item.elegibilidade?.status || '', item.elegibilidade?.suggested_catalog_id || '']);
  return linhas.map(row => row.map(col => `"${String(col)}"`).join(';')).join('\n');
};

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  READY_FOR_OPTIN: { label: 'Pronto para Catálogo', color: 'bg-green-100 text-green-800' },
  ALREADY_OPTED_IN: { label: 'Já no Catálogo', color: 'bg-blue-100 text-blue-800' },
  COMPETING: { label: 'Competindo', color: 'bg-purple-100 text-purple-800' },
  CATALOG_PRODUCT_ID_NULL: { label: 'Sem ID Identificado', color: 'bg-orange-100 text-orange-800' },
  NOT_ELIGIBLE: { label: 'Não Elegível', color: 'bg-red-100 text-red-800' },
  PRODUCT_INACTIVE: { label: 'Produto Inativo', color: 'bg-yellow-100 text-yellow-800' },
  CLOSED: { label: 'Encerrado', color: 'bg-gray-100 text-gray-600' },
};

const COMPETITION_LABELS = {
  winning: { label: 'Ganhando', color: 'bg-green-100 text-green-800', icon: '🏆' },
  sharing_first_place: { label: 'Compartilhando 1º', color: 'bg-blue-100 text-blue-800', icon: '🤝' },
  competing: { label: 'Perdendo', color: 'bg-red-100 text-red-800', icon: '📉' },
  listed: { label: 'Listado (sem competir)', color: 'bg-yellow-100 text-yellow-800', icon: '📋' },
};

// ─── Badge de elegibilidade ──────────────────────────────────────────────────
function EligBadge({ status }) {
  const cfg = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
}

// ─── Card de produto do catálogo (Aba Buscar) ────────────────────────────────
function ProductCard({ produto, contasML, configAtacado = null, publishedMap = {}, onPublished }) {
  const [expanded, setExpanded] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishLog, setPublishLog] = useState([]);
  const { usuarioAtual: user } = useAuth();

  // Estratégia global
  const [strategy, setStrategy] = useState({ inflar: 0, ativarCampanhas: false, atacado: false });

  // Preço base compartilhado
  const [precoBase, setPrecoBase] = useState('');
  const [skuBase, setSkuBase] = useState('');

  // Config por conta: { [contaId]: { ativo, tipo } }
  const [accountConfigs, setAccountConfigs] = useState(() => {
    const cfg = {};
    for (const conta of contasML) {
      cfg[conta.id] = { ativo: true, tipo: 'ambos' };
    }
    return cfg;
  });



  const isAtivo = produto.status === 'active';
  const temFilhos = produto.children_ids?.length > 0;
  const isPublicavel = isAtivo && !temFilhos;
  const publishedAccounts = publishedMap[produto.id] || {};

  const setAccountField = (contaId, campo, val) =>
    setAccountConfigs(p => ({ ...p, [contaId]: { ...p[contaId], [campo]: val } }));

  const calcPrecoFinal = (base) => {
    const n = parseFloat(base) || 0;
    return strategy.inflar > 0 ? Math.round(n * (1 + strategy.inflar / 100) * 100) / 100 : n;
  };

  const handlePublish = async () => {
    if (!user) { setPublishLog([{ tipo: 'erro', conta: '', texto: 'Usuário não logado.' }]); return; }
    const precoFinal = calcPrecoFinal(precoBase);
    if (!precoFinal) { setPublishLog([{ tipo: 'erro', conta: '', texto: 'Informe um preço base válido.' }]); return; }
    if (!skuBase.trim()) { setPublishLog([{ tipo: 'erro', conta: '', texto: 'Informe o SKU do ERP.' }]); return; }

    const contasAtivas = contasML.filter(c => accountConfigs[c.id]?.ativo);
    if (!contasAtivas.length) { setPublishLog([{ tipo: 'erro', conta: '', texto: 'Selecione ao menos uma conta.' }]); return; }

    setPublishing(true);
    setPublishLog([]);
    const log = [];

    for (const conta of contasAtivas) {
      const cfg = accountConfigs[conta.id];
      const tipos = cfg.tipo === 'ambos'
        ? [{ id: 'gold_special', label: 'Clássico' }, { id: 'gold_pro', label: 'Premium' }]
        : cfg.tipo === 'premium'
          ? [{ id: 'gold_pro', label: 'Premium' }]
          : [{ id: 'gold_special', label: 'Clássico' }];

      for (const { id: listingTypeId, label: tipoLabel } of tipos) {
        try {
          const resp = await fetch('/api/catalogo/publicar-direto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id, contaId: conta.id,
              catalogProductId: produto.id, categoryId: produto.domain_id,
              price: precoFinal, listingTypeId, quantity: 1,
              sku: skuBase.trim()
            })
          });
          const data = await resp.json();

          if (data.ok) {
            const newItemId = data.item?.id;
            log.push({ conta: conta.nickname, tipo: 'ok', texto: `✅ ${tipoLabel}: ${newItemId}` });

            // Ativar campanhas automáticas
            if (strategy.ativarCampanhas && newItemId) {
              try {
                const promoRes = await fetch('/api/catalogo/ativar-campanhas-auto', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id, contaId: conta.id, itemId: newItemId, inflar: strategy.inflar, price: precoFinal })
                });
                const promoData = await promoRes.json();
                if (promoData.ok && promoData.status === 'activating') {
                  log.push({ conta: conta.nickname, tipo: 'ok', texto: `  🎯 Campanhas sendo ativadas em background para ${newItemId}` });
                } else if (promoData.ok && promoData.ativadas > 0) {
                  log.push({ conta: conta.nickname, tipo: 'ok', texto: `  🎯 ${promoData.ativadas} campanha(s) ativadas para ${newItemId}` });
                } else if (promoData.ok && promoData.candidatos === 0) {
                  log.push({ conta: conta.nickname, tipo: 'warn', texto: `  ℹ️ Nenhuma campanha candidata encontrada para ${newItemId}` });
                } else if (promoData.erros?.length) {
                  log.push({ conta: conta.nickname, tipo: 'warn', texto: `  ⚠️ Campanhas: ${promoData.erros.map(e => `${e.tipo}: ${e.erro}`).join(' | ')}` });
                } else {
                  log.push({ conta: conta.nickname, tipo: 'warn', texto: `  ⚠️ Campanhas: candidatos=${promoData.candidatos}, ativadas=${promoData.ativadas}` });
                }
              } catch { log.push({ conta: conta.nickname, tipo: 'warn', texto: `  ⚠️ Erro ao ativar campanhas para ${newItemId}` }); }
            }

            // Preço de atacado
            if (strategy.atacado && configAtacado?.faixas?.length && newItemId) {
              try {
                await fetch('/api/ml/atacado-preco', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id, contaId: conta.id, itemId: newItemId, precoAlvo: precoFinal, faixas: configAtacado.faixas })
                });
                log.push({ conta: conta.nickname, tipo: 'ok', texto: `  📦 Atacado B2B enviado para ${newItemId}` });
              } catch { log.push({ conta: conta.nickname, tipo: 'warn', texto: `  ⚠️ Erro ao enviar atacado para ${newItemId}` }); }
            }

            // Registrar publicação
            onPublished(produto.id, conta.id);
          } else {
            const causas = data.detalhes?.cause?.map(c => `${c.code}${c.references ? ' [' + c.references.join(', ') + ']' : ''}`).join(' | ');
            const erroDetalhado = causas || data.detalhes?.message || data.detalhes?.error || JSON.stringify(data.detalhes || data.erro);
            log.push({ conta: conta.nickname, tipo: 'erro', texto: `❌ ${tipoLabel}: ${erroDetalhado}` });
          }
        } catch (err) {
          log.push({ conta: conta.nickname, tipo: 'erro', texto: `❌ ${tipoLabel}: Erro de rede – ${err.message}` });
        }
      }
    }

    setPublishLog(log);
    setPublishing(false);
  };

  const precoFinalPreview = calcPrecoFinal(precoBase);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-3">
      {/* ── Header ── */}
      <div className="flex gap-4 p-4">
        {produto.pictures?.[0] && (
          <img src={produto.pictures[0].url} alt={produto.name}
            className="w-20 h-20 object-contain rounded border bg-gray-50 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isAtivo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
              {isAtivo ? 'ATIVO' : 'INATIVO'}
            </span>
            {temFilhos && <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-bold">Produto Pai (Não publicável)</span>}
            {Object.keys(publishedAccounts).length > 0 && (
              <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-bold">
                Publicado em: {Object.keys(publishedAccounts).map(cid => contasML.find(c => c.id === cid)?.nickname || cid).join(', ')}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-800 mt-1 text-sm leading-tight">{produto.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">ID: {produto.id} · Domínio: {produto.domain_id}</p>
          {produto.buy_box_winner_price_range && (
            <p className="text-xs text-blue-600 mt-1">
              Faixa buy box: {fmt(produto.buy_box_winner_price_range.min?.price)} — {fmt(produto.buy_box_winner_price_range.max?.price)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {isPublicavel && (
            <button onClick={() => setShowPublish(v => !v)}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-700">
              {showPublish ? 'Fechar' : 'Anunciar'}
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)}
            className="px-3 py-1.5 bg-gray-50 text-gray-600 text-xs rounded border hover:bg-gray-100">
            {expanded ? 'Fechar' : 'Detalhes'}
          </button>
        </div>
      </div>

      {/* ── Painel de publicação ── */}
      {showPublish && isPublicavel && (
        <div className="mx-4 mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-4">
          <h4 className="font-bold text-emerald-900 text-sm">Publicar no Catálogo</h4>

          {/* ── Preço base + Estratégia ── */}
          <div className="bg-white rounded-lg border border-emerald-100 p-4">
            <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Preço e Estratégia</h5>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">SKU no ERP</label>
                <input type="text" placeholder="Ex: ABC-123"
                  value={skuBase} onChange={e => setSkuBase(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Preço Base (R$)</label>
                <input type="number" min="0" step="0.01" placeholder="Ex: 1599,90"
                  value={precoBase} onChange={e => setPrecoBase(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-purple-700 block mb-1">Inflar Preço (%)</label>
                <input type="number" min="0" placeholder="0"
                  value={strategy.inflar} onChange={e => setStrategy(p => ({ ...p, inflar: Number(e.target.value) }))}
                  className="w-full px-2 py-1.5 border border-purple-200 rounded text-sm focus:outline-none" />
                <p className="text-[10px] text-gray-400 mt-0.5">Para margem de desconto</p>
              </div>
              <div className="flex flex-col gap-1 justify-center">
                {precoBase && (
                  <div className="text-center bg-emerald-100 text-emerald-800 rounded p-2">
                    <div className="text-[10px] font-bold uppercase">Preço Final</div>
                    <div className="text-lg font-black">{fmt(precoFinalPreview)}</div>
                    {strategy.inflar > 0 && <div className="text-[10px] text-emerald-600">Base: {fmt(parseFloat(precoBase))} + {strategy.inflar}%</div>}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 justify-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-purple-600"
                    checked={strategy.ativarCampanhas}
                    onChange={e => setStrategy(p => ({ ...p, ativarCampanhas: e.target.checked }))} />
                  <div>
                    <span className="text-xs font-bold text-purple-700">Ativar campanhas</span>
                    <p className="text-[10px] text-gray-500">Auto após publicar</p>
                  </div>
                </label>
                {configAtacado?.ativo && configAtacado?.faixas?.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-green-600"
                      checked={strategy.atacado}
                      onChange={e => setStrategy(p => ({ ...p, atacado: e.target.checked }))} />
                    <div>
                      <span className="text-xs font-bold text-green-700">Atacado B2B</span>
                      <p className="text-[10px] text-gray-500">{configAtacado.faixas.length} faixa(s)</p>
                    </div>
                  </label>
                )}
              </div>
            </div>
            {strategy.ativarCampanhas && strategy.inflar === 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                💡 Dica: configure um % de inflação para ativar apenas campanhas dentro da sua margem.
              </p>
            )}
          </div>

          {/* ── Tabela de contas ── */}
          <div className="bg-white rounded-lg border border-emerald-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs border-b">
                  <th className="p-3 w-10">Pub?</th>
                  <th className="p-3">Conta</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3 text-right">Preço Final</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {contasML.map(conta => {
                  const cfg = accountConfigs[conta.id] || { ativo: true, tipo: 'ambos' };
                  const jaPublicado = !!publishedAccounts[conta.id];
                  return (
                    <tr key={conta.id} className={`border-b last:border-0 ${cfg.ativo ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                      <td className="p-3">
                        <input type="checkbox" className="w-4 h-4 cursor-pointer accent-emerald-600"
                          checked={cfg.ativo}
                          onChange={e => setAccountField(conta.id, 'ativo', e.target.checked)} />
                      </td>
                      <td className="p-3 font-bold text-sm text-gray-800">{conta.nickname}</td>
                      <td className="p-3">
                        <select disabled={!cfg.ativo}
                          value={cfg.tipo}
                          onChange={e => setAccountField(conta.id, 'tipo', e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-full max-w-[140px] focus:outline-none disabled:opacity-50">
                          <option value="classico">Clássico</option>
                          <option value="premium">Premium</option>
                          <option value="ambos">Clássico + Premium</option>
                        </select>
                      </td>
                      <td className="p-3 text-right font-black text-emerald-700 text-sm">
                        {precoFinalPreview ? fmt(precoFinalPreview) : '—'}
                        {cfg.tipo === 'ambos' && <span className="block text-[10px] font-normal text-gray-400">2 anúncios</span>}
                      </td>
                      <td className="p-3 text-center">
                        {jaPublicado
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">Já publicado</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">Pendente</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Log de resultados ── */}
          {publishLog.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
              {publishLog.map((entry, i) => (
                <div key={i} className={`text-xs flex gap-2 ${entry.tipo === 'ok' ? 'text-green-700' : entry.tipo === 'warn' ? 'text-amber-700' : 'text-red-700'}`}>
                  {entry.conta && <span className="font-bold">[{entry.conta}]</span>}
                  <span>{entry.texto}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Ações ── */}
          <div className="flex gap-2">
            <button onClick={handlePublish} disabled={publishing || !precoBase || !skuBase.trim()}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
              {publishing && <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />}
              {publishing ? 'Publicando...' : '✅ Publicar nas Contas Selecionadas'}
            </button>
            <button onClick={() => { setShowPublish(false); setPublishLog([]); }}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Ficha técnica ── */}
      {expanded && produto.attributes?.length > 0 && (
        <div className="border-t bg-gray-50 p-4">
          <p className="text-xs font-bold text-gray-600 mb-2">Ficha Técnica do Catálogo</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
            {produto.attributes.slice(0, 12).map(a => (
              <div key={a.id} className="text-xs truncate">
                <span className="text-gray-500">{a.name}: </span>
                <span className="font-medium text-gray-800">{a.value_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Buy Box Row ─────────────────────────────────────────────────────────────
function BuyBoxRow({ itemId, itemInfo, contaId, userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchComp = async () => {
    setLoading(true); setMsg(null);
    try { const resp = await fetch(`/api/catalogo/competicao/${itemId}?userId=${userId}&contaId=${contaId}`); setData(await resp.json()); }
    catch { setData({ erro: 'Erro de rede' }); }
    setLoading(false);
  };

  const handleMatch = async () => {
    if (!data?.price_to_win) return;
    setMatchLoading(true); setMsg(null);
    try {
      const resp = await fetch('/api/catalogo/match-price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, contaId, itemId, price: data.price_to_win }) });
      const d = await resp.json();
      if (d.ok) { setMsg({ tipo: 'ok', texto: `✅ Preço igualado para ${fmt(data.price_to_win)}` }); setData(prev => ({ ...prev, current_price: data.price_to_win, status: 'winning' })); }
      else setMsg({ tipo: 'erro', texto: `❌ ${d.erro}` });
    } catch { setMsg({ tipo: 'erro', texto: '❌ Erro de rede' }); }
    setMatchLoading(false);
  };

  const compLabel = data && !data.erro ? (COMPETITION_LABELS[data.status] || { label: data.status, color: 'bg-gray-100 text-gray-600', icon: '❓' }) : null;

  return (
    <div className="bg-white border border-purple-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-gray-700">{itemId}</p>
          {itemInfo?.titulo && <p className="text-xs text-gray-500 truncate">{itemInfo.titulo}</p>}
          {data?.current_price && <p className="text-xs text-blue-600">Preço atual: {fmt(data.current_price)}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!data && !loading && <button onClick={fetchComp} className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700">Verificar Buy Box</button>}
          {loading && <span className="text-xs text-gray-400 animate-pulse">Verificando...</span>}
          {compLabel && (
            <>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${compLabel.color}`}>{compLabel.icon} {compLabel.label}</span>
              {data.price_to_win && data.status !== 'winning' && <span className="text-xs text-gray-500">→ {fmt(data.price_to_win)} p/ ganhar</span>}
              {data.status === 'competing' && data.price_to_win && <button onClick={handleMatch} disabled={matchLoading} className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded hover:bg-orange-600 disabled:opacity-60">{matchLoading ? 'Igualando...' : `Igualar a ${fmt(data.price_to_win)}`}</button>}
            </>
          )}
        </div>
      </div>
      {msg && <div className={`mt-2 p-2 rounded text-xs ${msg.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.texto}</div>}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function Catalogo({ usuarioId }) {
  const { canUseResource } = useAuth();
  const [aba, setAba] = useState('elegibilidade');
  const [contasML, setContasML] = useState([]);
  const [regrasPreco, setRegrasPreco] = useState([]); // eslint-disable-line
  const [contaSelecionada, setContaSelecionada] = useState('');

  // Buscar catálogo global
  const [query, setQuery] = useState('');
  const [queryType, setQueryType] = useState('q');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErro, setSearchErro] = useState(null); // eslint-disable-line

  // Elegibilidade
  const [eligResults, setEligResults] = useState([]);
  const [loadingElig, setLoadingElig] = useState(false);
  const [eligErro, setEligErro] = useState(null);

  // Filtros eligibilidade
  const [eligFiltro, setEligFiltro] = useState('todos');
  const [eligBusca, setEligBusca] = useState('');
  const [eligPrioridadeFiltro, setEligPrioridadeFiltro] = useState('todas');
  const [eligRiscoFiltro, setEligRiscoFiltro] = useState('todos');

  // Inline
  const [inlineOptins, setInlineOptins] = useState({});
  const [inlineSearches, setInlineSearches] = useState({});

  // Comparação
  const [comparacoesCatalogo, setComparacoesCatalogo] = useState({});

  // Competição inline
  const [competicoesMap, setCompeticoesMap] = useState({});
  const [competicaoPainel, setCompeticaoPainel] = useState(null);

  // Lote
  const [eligSelecionados, setEligSelecionados] = useState({});
  const [loteLoading, setLoteLoading] = useState(false);
  const [loteMsg, setLoteMsg] = useState(null);

  // Sugestões automáticas
  const [catalogSuggestionsMap, setCatalogSuggestionsMap] = useState({});
  const [catalogSuggestionFilter, setCatalogSuggestionFilter] = useState('todas');
  const [catalogSuggestionOnly, setCatalogSuggestionOnly] = useState(false);

  // Itens em catálogo / buybox
  const [catalogItems, setCatalogItems] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [buyBoxItems, setBuyBoxItems] = useState([]);
  const [loadingBuyBox, setLoadingBuyBox] = useState(false);

  // Config atacado
  const [configAtacado, setConfigAtacado] = useState(null);

  // Rastro de publicações no catálogo: { [catalogProductId]: { [contaId]: true } }
  const [publishedCatalogItems, setPublishedCatalogItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`catalogo_published_${usuarioId}`) || '{}'); } catch { return {}; }
  });
  const [hidePublished, setHidePublished] = useState(false);

  // ── Carga inicial ──
  useEffect(() => {
    if (!usuarioId) return;
    fetch(`/api/usuario/${usuarioId}/config`).then(r => r.json()).then(d => {
      if (d.contasML) { setContasML(d.contasML); setContaSelecionada(d.contasML[0]?.id || ''); }
      if (d.regras) setRegrasPreco(d.regras);
    });
    fetch(`/api/usuario/${usuarioId}/config-atacado`).then(r => r.json()).then(d => {
      if (d && (d.ativo || d.faixas)) setConfigAtacado(d);
    }).catch(() => {});
  }, [usuarioId]);

  // Salvar rastro de publicações no localStorage quando mudar
  useEffect(() => {
    if (!usuarioId) return;
    localStorage.setItem(`catalogo_published_${usuarioId}`, JSON.stringify(publishedCatalogItems));
  }, [publishedCatalogItems, usuarioId]);

  const handleCatalogoPublished = (catalogProductId, contaId) => {
    setPublishedCatalogItems(prev => ({
      ...prev,
      [catalogProductId]: { ...(prev[catalogProductId] || {}), [contaId]: true }
    }));
  };

  // ── Filtro com sugestões ──
  const filteredEligResults = eligResults.filter(item => {
    const status = item.elegibilidade?.status || 'UNKNOWN';
    const txt = `${item.titulo || ''} ${item.sku || ''} ${item.id || ''}`.toLowerCase();
    const matchBusca = !eligBusca.trim() || txt.includes(eligBusca.toLowerCase());
    const matchStatus = eligFiltro === 'todos' ? true : status === eligFiltro;
    const priorityData = getItemPriorityData(item, comparacoesCatalogo);
    const matchPrioridade = eligPrioridadeFiltro === 'todas' ? true : priorityData.prioridade === eligPrioridadeFiltro;
    const matchRisco = eligRiscoFiltro === 'todos' ? true : priorityData.risco === eligRiscoFiltro;
    return matchBusca && matchStatus && matchPrioridade && matchRisco;
  });

  const filteredEligResultsWithSuggestions = filteredEligResults.filter(item => {
    const s = catalogSuggestionsMap[item.id];
    if (catalogSuggestionOnly && !s?.suggestedProductId) return false;
    if (catalogSuggestionFilter !== 'todas' && s?.confidence !== catalogSuggestionFilter) return false;
    return true;
  });

  const eligGrouped = filteredEligResultsWithSuggestions.reduce((acc, item) => {
    const status = item.elegibilidade?.status || 'UNKNOWN';
    if (!acc[status]) acc[status] = [];
    acc[status].push(item);
    return acc;
  }, {});

  // Gerar sugestões automaticamente quando filtro/pesquisa mudar
  useEffect(() => {
    const next = {};
    for (const item of filteredEligResults) {
      next[item.id] = buildSuggestionFromItem(item, inlineSearches, comparacoesCatalogo);
    }
    setCatalogSuggestionsMap(next);
  }, [filteredEligResults.length, JSON.stringify(Object.keys(inlineSearches)), JSON.stringify(Object.keys(comparacoesCatalogo))]);

  // ── Handlers ──
  const handleSearch = async () => {
    if (!contaSelecionada || !query.trim()) return;
    setSearching(true); setSearchErro(null); setSearchResults([]);
    try {
      const params = new URLSearchParams({ userId: usuarioId, contaId: contaSelecionada, status: 'active', limit: 10 });
      if (queryType === 'ean') params.set('product_identifier', query.trim());
      else params.set('q', query.trim());
      const resp = await fetch(`/api/catalogo/search?${params}`);
      const data = await resp.json();
      if (data.erro) { setSearchErro(data.erro); return; }
      setSearchResults(data.results || []);
    } catch { setSearchErro('Erro de rede ao buscar catálogo.'); }
    finally { setSearching(false); }
  };

  const handleExecuteInlineSearchFor = async (itemId, queryStr, domainId) => {
    if (!queryStr) return;
    setInlineSearches(p => ({ ...p, [itemId]: { ...p[itemId], loading: true, results: [] } }));
    try {
      const params = new URLSearchParams({ userId: usuarioId, contaId: contaSelecionada, status: 'active', limit: 5, q: queryStr });
      if (domainId) params.set('domain_id', domainId);
      const resp = await fetch(`/api/catalogo/search?${params}`);
      const data = await resp.json();
      setInlineSearches(p => ({ ...p, [itemId]: { ...p[itemId], loading: false, results: data.results || [] } }));
    } catch {
      setInlineSearches(p => ({ ...p, [itemId]: { ...p[itemId], loading: false, results: [] } }));
    }
  };

  const handleLoadEligibility = async () => {
    if (!contaSelecionada) return;
    setLoadingElig(true); setEligErro(null);
    try {
      const resp = await fetch(`/api/catalogo/elegibilidade-lote?userId=${usuarioId}&contaId=${contaSelecionada}`);
      const data = await resp.json();
      if (data.erro) { setEligErro(data.erro); return; }
      const resultados = data.resultados || [];
      setEligResults(resultados);
      // Auto-selecionar melhores casos
      const autoSel = {};
      for (const item of resultados) {
        if (item.elegibilidade?.status === 'READY_FOR_OPTIN' && item.elegibilidade?.suggested_catalog_id) {
          autoSel[item.id] = true;
        }
      }
      setEligSelecionados(autoSel);
    } catch { setEligErro('Erro ao carregar elegibilidade.'); }
    finally { setLoadingElig(false); }
  };

  const handleInlineOptin = async (item, forceCatalogId) => {
    const itemId = item.id;
    const targetCatalogId = forceCatalogId || inlineOptins[itemId]?.catalogProductId;
    if (!targetCatalogId?.trim()) return;
    setInlineOptins(p => ({ ...p, [itemId]: { ...p[itemId], loading: true, msg: null } }));
    
    let varId = inlineOptins[itemId]?.variationId?.trim();
    if (!varId && item.elegibilidade?.variations?.length > 0) {
      const readyVar = item.elegibilidade.variations.find(v => v.status === 'READY_FOR_OPTIN' || v.status === 'CATALOG_PRODUCT_ID_NULL') || item.elegibilidade.variations[0];
      varId = readyVar.id;
    }
    
    try {
      const resp = await fetch('/api/catalogo/optin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: usuarioId, contaId: contaSelecionada, itemId, catalogProductId: targetCatalogId.trim(), variationId: varId || undefined }) });
      const data = await resp.json();
      
      if (data.ok) {
        setInlineOptins(p => ({ ...p, [itemId]: { ...p[itemId], loading: false, msg: { tipo: 'ok', texto: `✅ Sucesso! Anúncio associado ao catálogo: ${data.item?.id}` } } }));
      } else {
        let msgErro = data.erro || 'Falha ao associar';
        
        // --- INÍCIO DA MELHORIA DOS ERROS ---
        if (data.detalhes?.cause?.length > 0) {
          const causaStr = data.detalhes.cause.map(c => c.message).join(' | ');
          if (causaStr.includes('is not related with')) {
            msgErro = 'ID Incompatível: O catálogo informado não pertence à mesma família deste anúncio. Verifique se escolheu o produto correto.';
          } else if (causaStr.includes('not a child of')) {
            msgErro = 'Você tentou associar a um Produto Pai (família). É obrigatório informar o ID da variação exata (Produto Filho).';
          } else {
            msgErro = causaStr;
          }
        } else if (data.detalhes?.message) {
          msgErro = data.detalhes.message;
        }
        // --- FIM DA MELHORIA ---

        setInlineOptins(p => ({ ...p, [itemId]: { ...p[itemId], loading: false, msg: { tipo: 'erro', texto: `❌ ${msgErro}` } } }));
      }
    } catch {
      setInlineOptins(p => ({ ...p, [itemId]: { ...p[itemId], loading: false, msg: { tipo: 'erro', texto: '❌ Erro de conexão com o servidor.' } } }));
    }
  };

const handleCompareCatalogProduct = async (item, productId) => {
    // ADICIONADO: Validação para garantir que os IDs existem antes de prosseguir.
    if (!item?.id || !productId || !contaSelecionada) {
      console.error("Tentativa de comparar com IDs faltantes:", { itemId: item?.id, productId, contaId: contaSelecionada });
      // Define um estado de erro diretamente se os dados estiverem faltando
      setComparacoesCatalogo(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), [productId]: { loading: false, loaded: false, error: 'IDs de item ou produto inválidos.', data: null } } }));
      return;
    }

    setComparacoesCatalogo(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), [productId]: { loading: true, loaded: false, error: null, data: null } } }));
    
    try {
      const resp = await fetch(`/api/catalogo/comparar/${item.id}/${productId}?userId=${usuarioId}&contaId=${contaSelecionada}`);

      // ADICIONADO: Verificação para garantir que a resposta é do tipo JSON antes de tentar processá-la.
      const contentType = resp.headers.get("content-type");
      if (!resp.ok || !contentType || !contentType.includes("application/json")) {
        const textResponse = await resp.text(); // Lê a resposta como texto para depuração
        throw new Error(`Resposta inesperada do servidor. Status: ${resp.status}. Resposta: ${textResponse.substring(0, 100)}...`);
      }

      const data = await resp.json();
      setComparacoesCatalogo(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), [productId]: { loading: false, loaded: true, error: null, data } } }));
    } catch (err) {
      setComparacoesCatalogo(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), [productId]: { loading: false, loaded: false, error: err?.message || 'Erro ao comparar', data: null } } }));
    }
  };

  const handleCloseComparison = (itemId, productId) => {
    setComparacoesCatalogo(prev => {
      const copy = { ...prev };
      if (!copy[itemId]) return prev;
      copy[itemId] = { ...copy[itemId] };
      delete copy[itemId][productId];
      return copy;
    });
  };

  const handleLoadCompetition = async (itemId) => {
    if (!itemId || !contaSelecionada) return;
    setCompeticoesMap(prev => ({ ...prev, [itemId]: { loading: true, loaded: false, error: null, data: null } }));
    try {
      const resp = await fetch(`/api/catalogo/competicao/${itemId}?userId=${usuarioId}&contaId=${contaSelecionada}`);
      const data = await resp.json();
      setCompeticoesMap(prev => ({ ...prev, [itemId]: { loading: false, loaded: true, error: null, data } }));
      setCompeticaoPainel(itemId);
    } catch (err) {
      setCompeticoesMap(prev => ({ ...prev, [itemId]: { loading: false, loaded: false, error: err?.message || 'Erro', data: null } }));
      setCompeticaoPainel(itemId);
    }
  };

  const handleBuildCatalogSuggestions = () => {
    const next = {};
    for (const item of filteredEligResults) next[item.id] = buildSuggestionFromItem(item, inlineSearches, comparacoesCatalogo);
    setCatalogSuggestionsMap(next);
  };

  const handleLoadCatalogItems = async () => {
    if (!contaSelecionada) return;
    setLoadingCatalog(true);
    try { const resp = await fetch(`/api/catalogo/itens-locais?userId=${usuarioId}&contaId=${contaSelecionada}&tipo=catalog`); const data = await resp.json(); setCatalogItems(data.results || []); }
    catch { } finally { setLoadingCatalog(false); }
  };

  const handleLoadBuyBox = async () => {
    if (!contaSelecionada) return;
    setLoadingBuyBox(true);
    try { const resp = await fetch(`/api/catalogo/itens-locais?userId=${usuarioId}&contaId=${contaSelecionada}&tipo=catalog`); const data = await resp.json(); setBuyBoxItems(data.results || []); }
    catch { } finally { setLoadingBuyBox(false); }
  };

  // ── ComparePanel ─────────────────────────────────────────────────────────
  const ComparePanel = ({ compare, onClose }) => {
    if (!compare) return null;
    const data = compare.data;
    const checks = data?.checks || {};
    const divergencias = data?.divergencias || [];
    return (
      <div className="mt-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h5 className="text-sm font-bold text-indigo-900">Conferência anúncio x produto</h5>
          <button onClick={onClose} className="text-xs font-bold text-indigo-700 hover:text-indigo-900">Fechar</button>
        </div>
        {compare.loading && <div className="text-sm text-indigo-700 font-semibold">Comparando...</div>}
        {compare.error && <div className="text-sm text-red-600 font-semibold">{compare.error}</div>}
        {data && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${data.score >= 75 ? 'bg-green-100 text-green-800' : data.score >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>Score: {data.score}%</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getCheckBadgeClass(checks.domain)}`}>Domínio: {checks.domain === true ? 'OK' : checks.domain === false ? 'Divergente' : 'N/A'}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getCheckBadgeClass(checks.brand)}`}>Marca: {checks.brand === true ? 'OK' : checks.brand === false ? 'Divergente' : 'N/A'}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getCheckBadgeClass(checks.model)}`}>Modelo: {checks.model === true ? 'OK' : checks.model === false ? 'Divergente' : 'N/A'}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getCheckBadgeClass(checks.gtin)}`}>GTIN: {checks.gtin === true ? 'OK' : checks.gtin === false ? 'Divergente' : 'N/A'}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded border p-3">
                <div className="font-bold text-gray-800 mb-1">Anúncio</div>
                <div className="text-gray-700 space-y-0.5">
                  <div><span className="font-semibold">ID:</span> {data.item?.id || '-'}</div>
                  <div><span className="font-semibold">Título:</span> {data.item?.title || '-'}</div>
                  <div><span className="font-semibold">Domínio:</span> {data.item?.domain_id || '-'}</div>
                </div>
              </div>
              <div className="bg-white rounded border p-3">
                <div className="font-bold text-gray-800 mb-1">Produto catálogo</div>
                <div className="text-gray-700 space-y-0.5">
                  <div><span className="font-semibold">ID:</span> {data.product?.id || '-'}</div>
                  <div><span className="font-semibold">Nome:</span> {data.product?.name || '-'}</div>
                  <div><span className="font-semibold">Domínio:</span> {data.product?.domain_id || '-'}</div>
                </div>
              </div>
            </div>
            {divergencias.length > 0 ? (
              <div className="mt-3 bg-white rounded border p-3">
                <div className="font-bold text-red-700 mb-2">Divergências encontradas</div>
                <div className="space-y-2">
                  {divergencias.map((div, idx) => (
                    <div key={`${div.campo}-${idx}`} className="text-xs text-gray-700 border-b last:border-b-0 pb-2 last:pb-0">
                      <div className="font-semibold text-gray-900">{div.campo}</div>
                      <div><span className="font-medium">Anúncio:</span> {String(div.item ?? '-')}</div>
                      <div><span className="font-medium">Catálogo:</span> {String(div.catalogo ?? '-')}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="mt-3 text-sm font-semibold text-green-700">Nenhuma divergência encontrada.</div>}
          </>
        )}
      </div>
    );
  };

  // ── CompetitionPanelInline ─────────────────────────────────────────────────
  const CompetitionPanelInline = ({ item, state, onClose }) => {
    if (!state) return null;
    const comp = state.data?.competition || state.data?.result || state.data?.body || state.data || {};
    const status = comp?.status || comp?.competition_status || 'UNKNOWN';
    const info = getCompetitionInfo(comp);
    const rec = getCompetitionRecommendation(comp);
    const logistics = comp?.logistic_boosts || comp?.shipping_benefits || comp?.benefits || {};
    const flags = [
      { label: 'Full', active: !!(logistics?.full || logistics?.fulfillment || logistics?.is_full) },
      { label: 'Frete grátis', active: !!(logistics?.free_shipping || logistics?.shipping_free) },
      { label: 'Envio rápido', active: !!(logistics?.same_day || logistics?.next_day || logistics?.fast_shipping) },
      { label: 'Parcelamento', active: !!(logistics?.installments || logistics?.no_interest_installments) },
    ];
    return (
      <div className="mt-4 p-4 rounded-xl border border-slate-300 bg-slate-50">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Painel de competição</h4>
            <p className="text-xs text-slate-500 mt-1">{item?.titulo || item?.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleLoadCompetition(item.id)} className="px-3 py-1.5 rounded border bg-white text-slate-700 text-xs font-bold hover:bg-slate-100">Atualizar</button>
            <button onClick={onClose} className="text-sm font-bold text-slate-600 hover:text-slate-900">Fechar</button>
          </div>
        </div>
        {state.loading && <div className="text-sm font-semibold text-slate-700">Carregando...</div>}
        {state.error && <div className="text-sm font-semibold text-red-600">{state.error}</div>}
        {!state.loading && !state.error && (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getCompetitionBadgeClass(status)}`}>Status: {status}</span>
              <span className="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">Seu preço: {fmt(info.currentPrice)}</span>
              {info.hasPriceToWin && <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Price to win: {fmt(info.priceToWin)}</span>}
              {info.hasPriceToWin && <span className={`px-2 py-1 rounded-full text-xs font-bold ${info.diffValue <= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>Diferença: {info.diffValue > 0 ? '+' : ''}{fmt(info.diffValue)}</span>}
            </div>
            <div className={`rounded-lg border p-3 mb-4 ${getRecommendationClass(rec.tipo)}`}>
              <div className="font-bold text-sm mb-1">{rec.titulo}</div>
              <div className="text-sm">{rec.texto}</div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border p-3 text-sm text-gray-700 space-y-1">
                <div className="font-bold text-gray-800 mb-2">Resumo da disputa</div>
                <div><span className="font-semibold">Seu preço:</span> {fmt(info.currentPrice)}</div>
                <div><span className="font-semibold">Price to win:</span> {info.hasPriceToWin ? fmt(info.priceToWin) : '-'}</div>
                <div><span className="font-semibold">Diferença:</span> {info.hasPriceToWin ? `${fmt(info.diffValue)} (${info.diffPercent.toFixed(2)}%)` : '-'}</div>
              </div>
              <div className="bg-white rounded-lg border p-3">
                <div className="text-sm font-bold text-gray-800 mb-2">Benefícios competitivos</div>
                <div className="flex flex-wrap gap-2">
                  {flags.map(flag => (
                    <span key={flag.label} className={`px-2 py-1 rounded-full text-xs font-bold ${flag.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{flag.label}: {flag.active ? 'Sim' : 'Não'}</span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── renderEligibleRow ─────────────────────────────────────────────────────
  const renderEligibleRow = (item, badgeStatus) => {
    const ninja = inlineOptins[item.id] || {};
    const isOpen = !!inlineSearches[item.id]?.open;
    const searchState = inlineSearches[item.id] || { open: false, query: '', loading: false, results: [] };
    const recomendacaoML = item.elegibilidade?.suggested_catalog_id;
    const hasVariations = item.elegibilidade?.variations?.length > 0;
    const isCatalogRequired = item.elegibilidade?.listing_strategy === 'catalog_required';
    const domainId = item.elegibilidade?.domain_id || item.domain_id || '';
    const priorityData = getItemPriorityData(item, comparacoesCatalogo);
    const suggestion = catalogSuggestionsMap[item.id];
    const suggestionDecision = getSuggestionDecision(suggestion);
    const inputValue = ninja.catalogProductId !== undefined ? ninja.catalogProductId : (recomendacaoML || '');

    // Função auxiliar para abrir a busca
    const abrirBusca = () => {
      const newQuery = buildSmartCatalogQuery(item);
      setInlineSearches(p => ({ ...p, [item.id]: { open: true, query: newQuery, results: [] } }));
      setTimeout(() => handleExecuteInlineSearchFor(item.id, newQuery, item.elegibilidade?.domain_id), 50);
    };

    return (
      <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-3 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex flex-col md:flex-row gap-4 items-start">
          
          {/* Checkbox e Imagem */}
          <div className="flex gap-3 items-center md:items-start w-full md:w-auto">
            <input type="checkbox" checked={isItemSelecionado(item.id, eligSelecionados)} onChange={() => toggleEligSelecionado(item.id, setEligSelecionados)} className="w-4 h-4 mt-1 cursor-pointer" />
            {item.thumbnail && <img src={item.thumbnail} alt={item.titulo} className="w-16 h-16 object-contain rounded border border-gray-200 bg-white flex-shrink-0" />}
          </div>

          {/* Dados Principais */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="font-bold text-gray-900 text-sm leading-tight">{item.titulo}</p>
              <EligBadge status={badgeStatus} />
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{item.id}</span>
              {item.sku && <span>SKU: <strong>{item.sku}</strong></span>}
              {item.preco && <span className="font-semibold text-gray-700">{fmt(item.preco)}</span>}
              {domainId && <span className="text-blue-600 font-medium">Domínio: {domainId}</span>}
            </div>

            {/* Badges de Status (Limpos) */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${getPriorityBadgeClass(priorityData.prioridade)}`}>Prio: {priorityData.prioridade}</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${getRiskBadgeClass(priorityData.risco)}`}>Risco: {priorityData.risco}</span>
              {hasVariations && <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-100 text-orange-800">Possui variações</span>}
              {isCatalogRequired && <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800">Catálogo obrigatório</span>}
            </div>

            {/* Box de Sugestão Mais Intuitivo */}
            {(recomendacaoML || suggestion?.suggestedProductId) && (
              <div className="mt-2 p-3 rounded-lg border border-indigo-100 bg-indigo-50/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                      💡 Sugestão do Sistema: <span className="font-mono bg-white border px-1.5 py-0.5 rounded">{recomendacaoML || suggestion.suggestedProductId}</span>
                    </span>
                    {suggestion?.confidence && (
                      <span className="text-[11px] text-gray-600">
                        Nível de confiança: <span className={`font-bold ${getSuggestionConfidenceClass(suggestion.confidence)} px-1.5 rounded`}>{suggestion.confidence}</span>
                        {suggestion.score > 0 && ` (${suggestion.score}% similar)`}
                      </span>
                    )}
                  </div>
                  
                  {/* Botões da Sugestão */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleCompareCatalogProduct(item, recomendacaoML || suggestion.suggestedProductId)} className="px-3 py-1.5 bg-white text-indigo-700 text-xs font-bold rounded border border-indigo-200 hover:bg-indigo-50 transition-colors">Comparar</button>
                    
                    {/* Se for confiança FRACA, abre a busca em vez de forçar o envio */}
                    {canUseResource('catalogo.optin') && (suggestion?.confidence === 'FRACA' ? (
                      <button onClick={abrirBusca} className={`px-3 py-1.5 text-xs font-bold rounded shadow-sm ${suggestionDecision.class}`}>{suggestionDecision.label}</button>
                    ) : (
                      <button onClick={() => handleInlineOptin(item, recomendacaoML || suggestion.suggestedProductId)} disabled={ninja.loading} className={`px-3 py-1.5 text-xs font-bold rounded shadow-sm ${suggestionDecision.class || 'bg-green-600 text-white hover:bg-green-700'} disabled:opacity-60`}>
                        {ninja.loading ? 'Associando...' : (suggestionDecision.label || 'Associar')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mensagem de Erro/Sucesso */}
            {ninja.msg && (
              <div className={`mt-3 p-2.5 rounded text-xs font-medium border ${ninja.msg.tipo === 'ok' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                {ninja.msg.texto}
              </div>
            )}
          </div>

          {/* Coluna da Direita (Ações Manuais) */}
          <div className="flex flex-col gap-2 w-full md:w-48 flex-shrink-0 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 text-center">Ações Manuais</p>
            
            <button onClick={abrirBusca} className="w-full px-3 py-2 bg-white text-blue-700 text-xs font-bold rounded border border-blue-200 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              Buscar Catálogo
            </button>

            <div className="relative mt-2">
              <input type="text" value={inputValue} onChange={e => setInlineOptins(p => ({ ...p, [item.id]: { ...p[item.id], catalogProductId: e.target.value } }))} placeholder="Ex: MLB123456" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
            </div>

            <div className="flex gap-1">
              <button onClick={() => handleCompareCatalogProduct(item, inputValue)} disabled={!inputValue.trim()} className="flex-1 px-2 py-1.5 bg-gray-200 text-gray-700 text-[11px] font-bold rounded hover:bg-gray-300 disabled:opacity-50 transition-colors">Comparar</button>
              {canUseResource('catalogo.optin') && (
              <button onClick={() => { setInlineOptins(p => ({ ...p, [item.id]: { ...p[item.id], catalogProductId: inputValue } })); setTimeout(() => handleInlineOptin(item), 50); }} disabled={ninja.loading || !inputValue.trim()} className="flex-1 px-2 py-1.5 bg-green-600 text-white text-[11px] font-bold rounded hover:bg-green-700 disabled:opacity-50 transition-colors">
                {ninja.loading ? '...' : 'Associar ID'}
              </button>
              )}
            </div>
            
            <button onClick={() => handleLoadCompetition(item.id)} className="w-full mt-1 px-3 py-1.5 bg-white text-purple-700 text-[11px] font-bold rounded border border-purple-200 hover:bg-purple-50 transition-colors">
              Ver Competição
            </button>
          </div>
        </div>


        {/* Painel de comparação para ID manual */}
        {(() => {
          const manualCompare = getCompareState(item.id, inputValue, comparacoesCatalogo);
          if ((manualCompare.loading || manualCompare.error || manualCompare.data) && inputValue && !inlineSearches[item.id]?.results?.some(r => r.id === inputValue)) {
            return <ComparePanel compare={manualCompare} onClose={() => handleCloseComparison(item.id, inputValue)} />;
          }
          return null;
        })()}

        {/* Painel de competição */}
        {competicaoPainel === item.id && (
          <CompetitionPanelInline item={item} state={competicoesMap[item.id]} onClose={() => setCompeticaoPainel(null)} />
        )}

        {/* Busca inline */}
        {isOpen && (
          <div className="mt-4 p-4 rounded-xl border border-blue-200 bg-slate-100">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="font-bold text-blue-800 text-sm">Pesquisar no Catálogo do ML</h4>
              <button onClick={() => setInlineSearches(p => ({ ...p, [item.id]: { ...p[item.id], open: false } }))} className="text-blue-600 font-bold text-sm hover:text-blue-800">✕ Fechar</button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={searchState.query || ''}
                onChange={e => setInlineSearches(p => ({ ...p, [item.id]: { ...p[item.id], query: e.target.value } }))}
                onKeyDown={e => e.key === 'Enter' && handleExecuteInlineSearchFor(item.id, searchState.query, item.elegibilidade?.domain_id)}
                className="flex-1 px-3 py-2 border rounded text-sm bg-white"
                placeholder="Digite o termo para buscar"
              />
              <button onClick={() => handleExecuteInlineSearchFor(item.id, searchState.query, item.elegibilidade?.domain_id)} disabled={searchState.loading} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:opacity-60">{searchState.loading ? 'Buscando...' : 'Buscar'}</button>
            </div>
            {!searchState.loading && searchState.results?.length === 0 && searchState.query && <p className="text-xs text-red-600 font-semibold">Nenhuma sugestão encontrada.</p>}
            <div className="space-y-2">
              {!searchState.loading && searchState.results?.map(prod => {
                const similarity = calcTextSimilarity(item.titulo, prod.name);
                const sameDomain = !domainId || !prod.domain_id || domainId === prod.domain_id;
                const compareState = getCompareState(item.id, prod.id, comparacoesCatalogo);
                return (
                  <div key={prod.id} className="p-3 bg-white hover:bg-blue-50 border border-blue-100 rounded-lg">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {prod.pictures?.[0] && <img src={prod.pictures[0].url} alt="" className="w-12 h-12 object-contain rounded border bg-gray-50" />}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 leading-tight">{prod.name}</p>
                          <p className="text-[11px] text-gray-500 mt-1">ID: <span className="font-mono text-gray-700">{prod.id}</span>{prod.domain_id ? ` · Domínio: ${prod.domain_id}` : ''}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${similarity >= 70 ? 'bg-green-100 text-green-800' : similarity >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>Similaridade: {similarity}%</span>
                            {!sameDomain && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">Domínio diferente</span>}
                            {compareState?.data?.score >= 75 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Comparação forte</span>}
                            {compareState?.data?.divergencias?.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">{compareState.data.divergencias.length} divergência(s)</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-3 flex-wrap justify-end">
                        <button onClick={() => handleCompareCatalogProduct(item, prod.id)} disabled={compareState.loading} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 disabled:opacity-60">{compareState.loading ? 'Comparando...' : 'Comparar'}</button>
                        <button onClick={() => setInlineOptins(p => ({ ...p, [item.id]: { ...p[item.id], catalogProductId: prod.id } }))} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded border hover:bg-gray-200">Usar ID</button>
                        <button
                          onClick={() => {
                            const cs = getCompareState(item.id, prod.id, comparacoesCatalogo);
                            const divs = cs?.data?.divergencias || [];
                            if (divs.length > 0 && !window.confirm(`Foram encontradas ${divs.length} divergência(s). Deseja associar mesmo assim?`)) return;
                            setInlineOptins(p => ({ ...p, [item.id]: { ...p[item.id], catalogProductId: prod.id } }));
                            handleInlineOptin(item, prod.id);
                          }}
                          disabled={ninja.loading}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 disabled:opacity-60"
                        >
                          {ninja.loading ? '...' : 'Associar'}
                        </button>
                      </div>
                    </div>
                    {(compareState.loading || compareState.error || compareState.data) && (
                      <ComparePanel compare={compareState} onClose={() => handleCloseComparison(item.id, prod.id)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Tabs ──
  const tabs = [
    { id: 'elegibilidade', label: '✅ Elegibilidade dos Anúncios' },
    { id: 'buscar', label: '🔍 Buscar Catálogo Manual' },
    { id: 'buybox', label: '🏆 Monitor Buy Box' },
    { id: 'meus-catalogo', label: '📦 Meus Itens no Catálogo' },
  ];

  return (
    <div>
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4 flex items-center gap-4">
        <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Conta ML:</label>
        <select value={contaSelecionada} onChange={e => setContaSelecionada(e.target.value)} className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs font-semibold">
          {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setAba(t.id)} className={`px-3 py-2 rounded text-xs font-bold transition-colors ${aba === t.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>{t.label}</button>
        ))}
      </div>

      {/* ── ABA: ELEGIBILIDADE ── */}
      {aba === 'elegibilidade' && (
        <div className="space-y-4">
          {/* Topo com filtros */}
          <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <h3 className="font-bold text-gray-800">Associação Direta de Catálogo</h3>
              <p className="text-xs text-gray-500 mt-1">Busque sugestões clicando em "Pesquisar" na linha de cada anúncio.</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="text" value={eligBusca} onChange={e => setEligBusca(e.target.value)} placeholder="Filtrar por título, SKU ou ID" className="px-3 py-2 border rounded text-sm min-w-[200px]" />
              <select value={eligFiltro} onChange={e => setEligFiltro(e.target.value)} className="px-3 py-2 border rounded text-sm">
                <option value="todos">Todos status</option>
                <option value="READY_FOR_OPTIN">Prontos</option>
                <option value="CATALOG_PRODUCT_ID_NULL">Sem ID</option>
                <option value="ALREADY_OPTED_IN">Já no catálogo</option>
                <option value="NOT_ELIGIBLE">Não elegíveis</option>
                <option value="UNKNOWN">Erros / Unknown</option>
              </select>
              <select value={eligPrioridadeFiltro} onChange={e => setEligPrioridadeFiltro(e.target.value)} className="px-3 py-2 border rounded text-sm">
                <option value="todas">Todas prioridades</option>
                <option value="ALTA">Prioridade alta</option>
                <option value="MEDIA">Prioridade média</option>
                <option value="BAIXA">Prioridade baixa</option>
              </select>
              <select value={eligRiscoFiltro} onChange={e => setEligRiscoFiltro(e.target.value)} className="px-3 py-2 border rounded text-sm">
                <option value="todos">Todos riscos</option>
                <option value="BAIXO">Risco baixo</option>
                <option value="MEDIO">Risco médio</option>
                <option value="ALTO">Risco alto</option>
              </select>
              <select value={catalogSuggestionFilter} onChange={e => setCatalogSuggestionFilter(e.target.value)} className="px-3 py-2 border rounded text-sm">
                <option value="todas">Todas sugestões</option>
                <option value="FORTE">Sugestão forte</option>
                <option value="MEDIA">Sugestão média</option>
                <option value="FRACA">Sugestão fraca</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-700 px-1">
                <input type="checkbox" checked={catalogSuggestionOnly} onChange={e => setCatalogSuggestionOnly(e.target.checked)} />
                Só com sugestão
              </label>
              <button onClick={handleLoadEligibility} disabled={loadingElig || !contaSelecionada} className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:opacity-60">
                {loadingElig ? 'Analisando...' : '🔄 Carregar Elegibilidade'}
              </button>
            </div>
          </div>

          {eligErro && <div className="p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{eligErro}</div>}

          {eligResults.length > 0 && (
            <div className="space-y-4">
              {/* Cards de status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(eligResults.reduce((acc, item) => { const s = item.elegibilidade?.status || 'UNKNOWN'; acc[s] = (acc[s] || 0) + 1; return acc; }, {})).map(([status, count]) => {
                  const cfg = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <div key={status} className={`p-3 rounded-lg border text-center ${cfg.color} cursor-pointer`} onClick={() => setEligFiltro(eligFiltro === status ? 'todos' : status)}>
                      <p className="text-2xl font-black">{count}</p>
                      <p className="text-xs font-semibold mt-1">{cfg.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Resumo inteligente */}
              {(() => {
                const resumo = filteredEligResultsWithSuggestions.reduce((acc, item) => {
                  const p = getItemPriorityData(item, comparacoesCatalogo);
                  acc.total++;
                  acc[`prio_${p.prioridade}`] = (acc[`prio_${p.prioridade}`] || 0) + 1;
                  acc[`risco_${p.risco}`] = (acc[`risco_${p.risco}`] || 0) + 1;
                  return acc;
                }, { total: 0 });
                const resumoSug = filteredEligResultsWithSuggestions.reduce((acc, item) => {
                  const s = catalogSuggestionsMap[item.id];
                  if (!s?.suggestedProductId) { acc.semSugestao++; return acc; }
                  acc.totalComSugestao++;
                  if (s.confidence === 'FORTE') acc.forte++;
                  else if (s.confidence === 'MEDIA') acc.media++;
                  else if (s.confidence === 'FRACA') acc.fraca++;
                  return acc;
                }, { totalComSugestao: 0, forte: 0, media: 0, fraca: 0, semSugestao: 0 });
                return (
                  <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="text-sm font-bold text-gray-800 mb-3">Resumo da fila · {resumo.total} item(ns) exibidos</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">Prioridade alta: {resumo.prio_ALTA || 0}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">Prioridade média: {resumo.prio_MEDIA || 0}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">Prioridade baixa: {resumo.prio_BAIXA || 0}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">Risco alto: {resumo.risco_ALTO || 0}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">Sugestão forte: {resumoSug.forte}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">Sugestão média: {resumoSug.media}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">Sem sugestão: {resumoSug.semSugestao}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Painel de ações em lote */}
              {filteredEligResultsWithSuggestions.length > 0 && (
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-gray-800 text-sm">Ações em lote</h4>
                      <p className="text-xs text-gray-500 mt-1">Selecionados: <span className="font-bold text-gray-700">{getSelectedEligibilityItems(filteredEligResultsWithSuggestions, eligSelecionados).length}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { const melhores = filteredEligResultsWithSuggestions.filter(item => { const p = getItemPriorityData(item, comparacoesCatalogo); return p.prioridade === 'ALTA' && p.risco !== 'ALTO'; }); marcarItensEmLote(melhores, true, setEligSelecionados); setLoteMsg({ tipo: 'ok', texto: `${melhores.length} melhores casos selecionados.` }); }} className="px-3 py-2 bg-emerald-100 text-emerald-800 text-xs font-bold rounded border border-emerald-300 hover:bg-emerald-200">Selecionar melhores</button>
                      <button onClick={() => marcarItensEmLote(filteredEligResultsWithSuggestions, true, setEligSelecionados)} className="px-3 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded border hover:bg-gray-200">Selecionar visíveis</button>
                      <button onClick={() => limparSelecaoEligibility(setEligSelecionados)} className="px-3 py-2 bg-white text-gray-700 text-xs font-bold rounded border hover:bg-gray-50">Limpar seleção</button>
                      <button onClick={handleBuildCatalogSuggestions} className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700">Gerar sugestões</button>
                      <button onClick={() => {
                        const selecionados = getSelectedEligibilityItems(filteredEligResultsWithSuggestions, eligSelecionados);
                        let count = 0;
                        for (const item of selecionados) {
                          const rec = item.elegibilidade?.suggested_catalog_id;
                          if (!rec) continue;
                          setInlineOptins(p => ({ ...p, [item.id]: { ...p[item.id], catalogProductId: rec } }));
                          count++;
                        }
                        setLoteMsg({ tipo: 'ok', texto: `${count} item(ns) com sugestão ML aplicada.` });
                      }} className="px-3 py-2 bg-yellow-100 text-yellow-800 text-xs font-bold rounded border border-yellow-300 hover:bg-yellow-200">Usar sugestões ML</button>
                      <button onClick={() => {
                        const melhores = filteredEligResultsWithSuggestions.filter(item => { const s = catalogSuggestionsMap[item.id]; return s?.suggestedProductId && (s.confidence === 'FORTE' || s.confidence === 'MEDIA'); });
                        for (const item of melhores) { const s = catalogSuggestionsMap[item.id]; if (s?.suggestedProductId) setInlineOptins(p => ({ ...p, [item.id]: { ...p[item.id], catalogProductId: s.suggestedProductId } })); }
                        setLoteMsg({ tipo: 'ok', texto: `${melhores.length} melhores sugestões automáticas aplicadas.` });
                      }} className="px-3 py-2 bg-indigo-100 text-indigo-800 text-xs font-bold rounded border border-indigo-300 hover:bg-indigo-200">Aplicar melhores sugestões</button>
                      {canUseResource('catalogo.optin') && (
                      <button onClick={async () => {
                        const selecionados = getSelectedEligibilityItems(filteredEligResultsWithSuggestions, eligSelecionados).filter(item => (inlineOptins[item.id]?.catalogProductId || '').trim());
                        if (!selecionados.length) return;
                        if (!window.confirm(`Associar ${selecionados.length} item(ns) em lote?`)) return;
                        setLoteLoading(true); setLoteMsg(null);
                        let ok = 0, erro = 0;
                        for (const item of selecionados) {
                          try { await handleInlineOptin(item, inlineOptins[item.id]?.catalogProductId); ok++; } catch { erro++; }
                        }
                        setLoteMsg({ tipo: erro ? 'erro' : 'ok', texto: `Lote concluído. Sucesso: ${ok} | Erros: ${erro}` });
                        setLoteLoading(false);
                      }} disabled={loteLoading} className="px-3 py-2 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 disabled:opacity-60">Associar em lote</button>
                      )}
                      <button onClick={async () => {
                        const selecionados = getSelectedEligibilityItems(filteredEligResultsWithSuggestions, eligSelecionados);
                        if (!selecionados.length) return;
                        const csv = exportarCsvSelecionados(selecionados);
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'catalogo_elegibilidade.csv'; a.click(); URL.revokeObjectURL(url);
                      }} className="px-3 py-2 bg-white text-gray-700 text-xs font-bold rounded border hover:bg-gray-50">Exportar CSV</button>
                    </div>
                  </div>
                  {loteMsg && <div className={`mt-3 text-xs font-semibold ${loteMsg.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{loteMsg.texto}</div>}
                </div>
              )}

              {/* LISTA: PRONTOS PARA OPTIN */}
              {(eligGrouped.READY_FOR_OPTIN?.length > 0) && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-green-800 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">{eligGrouped.READY_FOR_OPTIN.length}</span>
                      Prontos para entrar no Catálogo
                    </h4>
                    <div className="flex gap-2">
                      <button onClick={() => marcarItensEmLote(eligGrouped.READY_FOR_OPTIN, true, setEligSelecionados)} className="px-2 py-1 text-xs font-bold rounded border bg-gray-100 hover:bg-gray-200">Selecionar grupo</button>
                      <button onClick={() => marcarItensEmLote(eligGrouped.READY_FOR_OPTIN, false, setEligSelecionados)} className="px-2 py-1 text-xs font-bold rounded border bg-white hover:bg-gray-50">Limpar grupo</button>
                    </div>
                  </div>
                  {sortBySuggestionPriority(eligGrouped.READY_FOR_OPTIN, catalogSuggestionsMap, comparacoesCatalogo).map(item => renderEligibleRow(item, 'READY_FOR_OPTIN'))}
                </div>
              )}

              {/* LISTA: SEM ID */}
              {eligGrouped.CATALOG_PRODUCT_ID_NULL?.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-orange-800 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs">{eligGrouped.CATALOG_PRODUCT_ID_NULL.length}</span>
                      Falta o ID do Produto
                    </h4>
                    <div className="flex gap-2">
                      <button onClick={() => marcarItensEmLote(eligGrouped.CATALOG_PRODUCT_ID_NULL, true, setEligSelecionados)} className="px-2 py-1 text-xs font-bold rounded border bg-gray-100 hover:bg-gray-200">Selecionar grupo</button>
                      <button onClick={() => marcarItensEmLote(eligGrouped.CATALOG_PRODUCT_ID_NULL, false, setEligSelecionados)} className="px-2 py-1 text-xs font-bold rounded border bg-white hover:bg-gray-50">Limpar grupo</button>
                    </div>
                  </div>
                  {sortBySuggestionPriority(eligGrouped.CATALOG_PRODUCT_ID_NULL, catalogSuggestionsMap, comparacoesCatalogo).map(item => renderEligibleRow(item, 'CATALOG_PRODUCT_ID_NULL'))}
                </div>
              )}

              {/* LISTA: JÁ NO CATÁLOGO */}
              {eligGrouped.ALREADY_OPTED_IN?.length > 0 && (
                <details className="bg-white border border-blue-200 rounded-lg mt-4">
                  <summary className="p-3 font-bold text-blue-800 cursor-pointer text-sm">✅ Já no Catálogo ({eligGrouped.ALREADY_OPTED_IN.length}) — clique para ver</summary>
                  <div className="p-3 space-y-2 border-t">
                    {eligGrouped.ALREADY_OPTED_IN.map(item => (
                      <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                        {item.thumbnail && <img src={item.thumbnail} alt="" className="w-8 h-8 object-contain rounded" />}
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-800 truncate">{item.titulo}</p><p className="text-[10px] text-gray-500">{item.id}</p></div>
                        <button onClick={() => handleLoadCompetition(item.id)} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200 hover:bg-blue-100">Ver Competição</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* LISTA: UNKNOWN */}
              {eligGrouped.UNKNOWN?.length > 0 && (
                <details className="bg-white border border-gray-200 rounded-lg mt-4">
                  <summary className="p-3 font-bold text-gray-700 cursor-pointer text-sm">⚠️ Status desconhecido / Erros ({eligGrouped.UNKNOWN.length})</summary>
                  <div className="p-3 border-t">
                    {sortBySuggestionPriority(eligGrouped.UNKNOWN, catalogSuggestionsMap, comparacoesCatalogo).map(item => renderEligibleRow(item, 'UNKNOWN'))}
                  </div>
                </details>
              )}

              {/* LISTA: NÃO ELEGÍVEIS */}
              {eligGrouped.NOT_ELIGIBLE?.length > 0 && (
                <details className="bg-white border border-gray-200 rounded-lg mt-4">
                  <summary className="p-3 font-bold text-gray-700 cursor-pointer text-sm">🚫 Não Elegíveis ({eligGrouped.NOT_ELIGIBLE.length})</summary>
                  <div className="p-3 border-t">
                    {eligGrouped.NOT_ELIGIBLE.map(item => (
                      <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-700 truncate">{item.titulo}</p><p className="text-[10px] text-red-500">Motivo: {item.elegibilidade?.reason || 'Regra de negócio'}</p></div>
                        <EligBadge status="NOT_ELIGIBLE" />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA: BUSCAR */}
      {aba === 'buscar' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <h3 className="font-bold text-gray-800 mb-2">Pesquisar Manualmente no Catálogo ML</h3>
            <div className="flex gap-2 flex-wrap mb-3">
              <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Ex: Samsung Galaxy S8 ou ID MLB123456" className="flex-1 min-w-48 px-3 py-2 border rounded text-sm" />
              <button onClick={handleSearch} disabled={searching} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:opacity-60">
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={hidePublished}
                  onChange={e => setHidePublished(e.target.checked)} />
                <span>Ocultar já publicados na conta selecionada</span>
              </label>
              {searchResults.length > 0 && (
                <span className="text-xs text-gray-400">
                  {(() => {
                    const visible = hidePublished
                      ? searchResults.filter(p => !publishedCatalogItems[p.id]?.[contaSelecionada])
                      : searchResults;
                    return `${visible.length} de ${searchResults.length} resultado(s)`;
                  })()}
                </span>
              )}
            </div>
          </div>
          {searching && <div className="text-center py-8 text-gray-400 animate-pulse">Buscando...</div>}
          {!searching && searchResults
            .filter(p => !hidePublished || !publishedCatalogItems[p.id]?.[contaSelecionada])
            .map(p => (
              <ProductCard
                key={p.id}
                produto={p}
                contasML={contasML}
                configAtacado={configAtacado}
                publishedMap={publishedCatalogItems}
                onPublished={handleCatalogoPublished}
              />
            ))
          }
        </div>
      )}

      {/* ABA: MEUS ITENS NO CATÁLOGO */}
      {aba === 'meus-catalogo' && (
        <div className="space-y-4">
          <button onClick={handleLoadCatalogItems} disabled={loadingCatalog} className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-60">{loadingCatalog ? 'Carregando...' : 'Carregar Itens'}</button>
          {catalogItems.map(id => (
            <div key={id} className="bg-white border rounded p-3 flex items-center justify-between">
              <span className="font-mono text-sm">{id}</span>
              <button onClick={() => handleLoadCompetition(id)} className="bg-blue-100 text-blue-700 px-3 py-1 rounded">Ver Competição</button>
            </div>
          ))}
        </div>
      )}

      {/* ABA: MONITOR BUY BOX */}
      {aba === 'buybox' && (
        <div className="space-y-4">
          <button onClick={handleLoadBuyBox} disabled={loadingBuyBox} className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-60">{loadingBuyBox ? 'Carregando...' : 'Carregar Monitor'}</button>
          {buyBoxItems.map(id => <BuyBoxRow key={id} itemId={id} itemInfo={eligResults.find(r => r.id === id)} contaId={contaSelecionada} userId={usuarioId} />)}
        </div>
      )}
    </div>
  );
}
