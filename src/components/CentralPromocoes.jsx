import React, { useState, useEffect, useCallback } from 'react';

// ─── constants ────────────────────────────────────────────────────────────────
const TIPO_LABELS = {
  DEAL: { label: 'Campanha Tradicional', color: 'bg-blue-100 text-blue-800' },
  MARKETPLACE_CAMPAIGN: { label: 'Co-participação', color: 'bg-purple-100 text-purple-800' },
  SMART: { label: 'Co-part. Automatizada', color: 'bg-indigo-100 text-indigo-800' },
  PRICE_MATCHING: { label: 'Preços Competitivos', color: 'bg-cyan-100 text-cyan-800' },
  PRICE_MATCHING_MELI_ALL: { label: 'Preços Comp. 100% ML', color: 'bg-teal-100 text-teal-800' },
  SELLER_CAMPAIGN: { label: 'Campanha do Vendedor', color: 'bg-green-100 text-green-800' },
  VOLUME: { label: 'Desconto por Volume', color: 'bg-orange-100 text-orange-800' },
  PRICE_DISCOUNT: { label: 'Desconto Individual', color: 'bg-yellow-100 text-yellow-800' },
  LIGHTNING: { label: 'Oferta Relâmpago', color: 'bg-red-100 text-red-800' },
  DOD: { label: 'Oferta do Dia', color: 'bg-rose-100 text-rose-800' },
  PRE_NEGOTIATED: { label: 'Desc. Pré-acordado', color: 'bg-amber-100 text-amber-800' },
  UNHEALTHY_STOCK: { label: 'Liquidação Full', color: 'bg-gray-100 text-gray-800' },
  SELLER_COUPON_CAMPAIGN: { label: 'Cupom do Vendedor', color: 'bg-pink-100 text-pink-800' },
  BANK: { label: 'PIX Cofinanciado', color: 'bg-emerald-100 text-emerald-800' },
};

const STATUS_COLORS = {
  started: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  finished: 'bg-gray-100 text-gray-500',
};

const TIPOS_ORQUESTRADOR = [
  'MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING', 'DEAL', 'PRE_NEGOTIATED', 'SELLER_CAMPAIGN'
];

// Tipos que precisam de deal_price para ativar
const TIPOS_COM_PRECO = new Set(['DEAL', 'SELLER_CAMPAIGN', 'DOD', 'LIGHTNING']);
// Tipos onde started não pode ser removido (só pendentes)
const TIPOS_SEM_REMOVER_STARTED = new Set(['DOD', 'LIGHTNING']);

function TipoBadge({ tipo }) {
  const info = TIPO_LABELS[tipo] || { label: tipo, color: 'bg-gray-100 text-gray-700' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>;
}

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-gray-100 text-gray-500';
  const labels = { started: 'Ativa', pending: 'Pendente', finished: 'Finalizada' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{labels[status] || status}</span>;
}

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Expandable items row ─────────────────────────────────────────────────────
function PromoRow({ promo, usuarioId, onRefresh, itemSearch }) {
  const searchTerm = itemSearch?.trim().toLowerCase() || '';
  const [expanded, setExpanded] = useState(false);
  const [itemActions, setItemActions] = useState({}); // { [itemId]: { loading, done, removed, error, dealPrice, topDealPrice, stock } }
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Auto-expand when filtering by item
  useEffect(() => {
    if (searchTerm) setExpanded(true);
  }, [searchTerm]);

  const setItemAction = (id, updates) =>
    setItemActions(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...updates } }));

  const needsPrice = TIPOS_COM_PRECO.has(promo.tipo);
  const needsStock = promo.tipo === 'LIGHTNING';

  const visibleItens = searchTerm
    ? promo.itens.filter(i => i.id?.toLowerCase().includes(searchTerm))
    : promo.itens;

  const candidateItems = visibleItens.filter(i => i.status === 'candidate');
  const activeItems = visibleItens.filter(i => i.status === 'started');
  const pendingItems = visibleItens.filter(i => i.status === 'pending');

  // Deadline urgency
  const deadlineDate = promo.dadosML?.deadline_date;
  const deadlineHours = deadlineDate ? Math.round((new Date(deadlineDate) - Date.now()) / 3600000) : null;
  const deadlineUrgent = deadlineHours !== null && deadlineHours >= 0 && deadlineHours < 48;

  async function handleActivate(item) {
    const st = itemActions[item.id] || {};
    setItemAction(item.id, { loading: true, error: null });
    try {
      const body = {
        userId: usuarioId,
        contaId: promo.contaId,
        itemId: item.id,
        promoId: promo.id,
        promoTipo: promo.tipo,
      };
      if (item.offer_id) body.offerId = item.offer_id;
      const dealPrice = st.dealPrice ?? item.suggested_discounted_price ?? (item.price > 0 ? item.price : null);
      if (dealPrice != null) body.dealPrice = dealPrice;
      if (st.topDealPrice) body.topDealPrice = st.topDealPrice;
      if (st.stock) body.stock = st.stock;

      const res = await fetch('/api/promocoes/ativar-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        const newStatus = promo.status === 'started' ? 'started' : 'pending';
        setItemAction(item.id, { loading: false, done: true, error: null, localStatus: newStatus });
        onRefresh?.();
      } else {
        setItemAction(item.id, { loading: false, error: data.erro || 'Erro' });
      }
    } catch (e) {
      setItemAction(item.id, { loading: false, error: e.message });
    }
  }

  async function handleRemove(item) {
    setItemAction(item.id, { loading: true, error: null });
    try {
      const res = await fetch('/api/promocoes/remover-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuarioId,
          contaId: promo.contaId,
          itemId: item.id,
          promoId: promo.id,
          promoTipo: promo.tipo,
          ...(item.offer_id ? { offerId: item.offer_id } : {}),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setItemAction(item.id, { loading: false, done: true, removed: true, error: null });
        onRefresh?.();
      } else {
        setItemAction(item.id, { loading: false, error: data.erro || 'Erro' });
      }
    } catch (e) {
      setItemAction(item.id, { loading: false, error: e.message });
    }
  }

  async function handleBulkActivate() {
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const itensParaFila = candidateItems.filter(item => {
        if (itemActions[item.id]?.done) return false;
        if (TIPOS_COM_PRECO.has(promo.tipo)) {
          const st = itemActions[item.id] || {};
          const suggestedPrice = item.suggested_discounted_price ?? item.max_discounted_price ?? null;
          const dealPrice = st.dealPrice ?? suggestedPrice;
          if (!dealPrice || isNaN(Number(dealPrice)) || Number(dealPrice) <= 0) return false;
        }
        return true;
      }).map(item => {
        const st = itemActions[item.id] || {};
        const suggestedPrice = item.suggested_discounted_price ?? item.max_discounted_price ?? null;
        const dealPrice = st.dealPrice ?? suggestedPrice;
        return {
          contaId: promo.contaId,
          itemId: item.id,
          promoId: promo.id,
          promoTipo: promo.tipo,
          offerId: item.offer_id,
          dealPrice: dealPrice ? Number(dealPrice) : undefined,
          topDealPrice: st.topDealPrice,
          stock: st.stock,
        };
      });

      if (itensParaFila.length === 0) { setBulkLoading(false); return; }

      const res = await fetch('/api/promocoes/massa-fila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, acao: 'ATIVAR', itens: itensParaFila }),
      });
      const data = await res.json();

      if (data.ok) {
        setBulkResult({ success: itensParaFila.length, errs: 0, msg: `Enviado para fila (Tarefa: ${data.tarefaId})` });
        itensParaFila.forEach(i => setItemAction(i.itemId, { done: true }));
      } else {
        setBulkResult({ success: 0, errs: itensParaFila.length, msg: data.erro });
      }
    } catch (e) {
      setBulkResult({ success: 0, errs: candidateItems.length, msg: e.message });
    }
    setBulkLoading(false);
  }

  return (
    <>
      <tr className="hover:bg-gray-50 border-b border-gray-100">
        <td className="px-3 py-2">
          <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </td>
        <td className="px-3 py-2 text-xs font-mono text-gray-600">
          <div className="flex items-center gap-1.5">
            {promo.id}
            {deadlineUrgent && (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full animate-pulse" title={`Prazo: ${new Date(deadlineDate).toLocaleString('pt-BR')}`}>
                ⏰ {deadlineHours}h
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2"><TipoBadge tipo={promo.tipo} /></td>
        <td className="px-3 py-2 text-xs text-gray-700 max-w-[160px] truncate" title={promo.nome}>{promo.nome || '—'}</td>
        <td className="px-3 py-2"><StatusBadge status={promo.status} /></td>
        <td className="px-3 py-2 text-xs text-gray-500">{fmt(promo.startDate)}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{fmt(promo.finishDate)}</td>
        <td className="px-3 py-2 text-xs text-right">
          {promo.minSellerPct !== null ? (
            <span className={`font-semibold ${promo.minSellerPct > 25 ? 'text-red-600' : promo.minSellerPct > 15 ? 'text-orange-600' : 'text-green-700'}`}>
              {promo.minSellerPct?.toFixed(1)}%{promo.maxSellerPct !== promo.minSellerPct ? ` – ${promo.maxSellerPct?.toFixed(1)}%` : ''}
            </span>
          ) : '—'}
        </td>
        <td className="px-3 py-2 text-xs text-right">
          <div className="flex items-center justify-end gap-1 flex-wrap">
            {candidateItems.length > 0 && (
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{candidateItems.length} cand.</span>
            )}
            <span className="font-semibold text-gray-700">{promo.totalItens}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-gray-400">{promo.contaNickname}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={10} className="bg-gray-50 px-6 py-3 border-b border-gray-100">
            {/* Expanded header */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {candidateItems.length > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">{candidateItems.length} candidato(s)</span>}
              {activeItems.length > 0 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">{activeItems.length} ativo(s)</span>}
              {pendingItems.length > 0 && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">{pendingItems.length} pendente(s)</span>}

              {!needsPrice && candidateItems.length > 0 && (
                <button
                  onClick={handleBulkActivate}
                  disabled={bulkLoading}
                  className="ml-auto flex items-center gap-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {bulkLoading
                    ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  }
                  {bulkLoading ? 'Ativando...' : `Ativar todos candidatos (${candidateItems.length})`}
                </button>
              )}
              {bulkResult && (
                <span className={`text-xs font-semibold ${bulkResult.errs > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {bulkResult.msg || `${bulkResult.success} enviado(s) para fila${bulkResult.errs > 0 ? `, ${bulkResult.errs} erro(s)` : ''}`}
                </span>
              )}
            </div>

            {visibleItens.length === 0 ? (
              <p className="text-xs text-gray-400 italic">{searchTerm ? `Nenhum item com "${itemSearch?.trim()}" nesta promoção.` : 'Nenhum item nesta promoção.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <p className="text-[10px] text-gray-400 italic mb-2 bg-gray-100 p-1.5 rounded inline-block">
                  * Mesmo que uma Campanha ou Cupom já esteja <b>Ativa</b>, os itens que aparecem como <b className="text-blue-600">Candidate</b> precisam ser ativados individualmente abaixo para que o desconto passe a valer para eles.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 uppercase tracking-wide text-[10px]">
                      <th className="pb-1 pr-3">Item ID</th>
                      <th className="pb-1 pr-3">Status</th>
                      <th className="pb-1 pr-3">Preço Orig.</th>
                      <th className="pb-1 pr-3">Preço Promo</th>
                      <th className="pb-1 pr-3">% Vendedor</th>
                      <th className="pb-1 pr-3">% MELI</th>
                      {needsPrice && <th className="pb-1 pr-3">Deal Price</th>}
                      {needsPrice && <th className="pb-1 pr-3">Top Deal</th>}
                      {needsStock && <th className="pb-1 pr-3">Estoque</th>}
                      <th className="pb-1">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItens.map((item, i) => {
                      const st = itemActions[item.id] || {};
                      const isCandidate = item.status === 'candidate';
                      const isRemovable = (item.status === 'started' || item.status === 'pending')
                        && !(TIPOS_SEM_REMOVER_STARTED.has(promo.tipo) && item.status === 'started');
                      // Pre-fill suggested price as default
                      const suggestedPrice = item.suggested_discounted_price ?? (item.price > 0 ? item.price : null);

                      return (
                        <tr key={i} className={`border-t border-gray-100 ${st.done ? 'opacity-50' : ''}`}>
                          <td className="py-1.5 pr-3 font-mono text-blue-700">{item.id}</td>
                          <td className="py-1.5 pr-3">
                            {(() => {
                              const s = st.localStatus || item.status;
                              const cls = s === 'candidate' ? 'bg-blue-100 text-blue-700' : s === 'started' ? 'bg-green-100 text-green-700' : s === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500';
                              return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{s}</span>;
                            })()}
                          </td>
                          <td className="py-1.5 pr-3">{item.original_price != null ? `R$ ${Number(item.original_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                          <td className="py-1.5 pr-3">{item.price > 0 ? `R$ ${Number(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                          <td className="py-1.5 pr-3">
                            {item.seller_percentage != null ? (
                              <span className={`font-semibold ${item.seller_percentage > 25 ? 'text-red-600' : item.seller_percentage > 15 ? 'text-orange-500' : 'text-green-700'}`}>
                                {item.seller_percentage}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-purple-700 font-semibold">{item.meli_percentage != null ? `${item.meli_percentage}%` : '—'}</td>

                          {needsPrice && (
                            <td className="py-1.5 pr-3">
                              {isCandidate && !st.done && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number" step="0.01" min="0"
                                      placeholder={suggestedPrice ? Number(suggestedPrice).toFixed(2) : '0,00'}
                                      value={st.dealPrice ?? ''}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const pct = item.original_price && val ? ((1 - parseFloat(val) / item.original_price) * 100).toFixed(1) : '';
                                        setItemAction(item.id, { dealPrice: val, dealPct: pct });
                                      }}
                                      className="w-24 text-right border border-orange-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-300 text-xs"
                                    />
                                    <span className="text-[10px] text-gray-400">R$</span>
                                  </div>
                                  {item.original_price > 0 && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number" step="0.1" min="5" max="80"
                                        placeholder={suggestedPrice ? ((1 - suggestedPrice / item.original_price) * 100).toFixed(1) : '%'}
                                        value={st.dealPct ?? ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const price = item.original_price && val ? (item.original_price * (1 - parseFloat(val) / 100)).toFixed(2) : '';
                                          setItemAction(item.id, { dealPct: val, dealPrice: price });
                                        }}
                                        className="w-16 text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-300 text-xs"
                                      />
                                      <span className="text-[10px] text-gray-400">% OFF</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          {needsPrice && (
                            <td className="py-1.5 pr-3">
                              {isCandidate && !st.done && (
                                <input
                                  type="number" step="0.01" min="0"
                                  placeholder="Opcional"
                                  value={st.topDealPrice ?? ''}
                                  onChange={e => setItemAction(item.id, { topDealPrice: e.target.value })}
                                  className="w-24 text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-300 text-xs"
                                />
                              )}
                            </td>
                          )}
                          {needsStock && (
                            <td className="py-1.5 pr-3">
                              {isCandidate && !st.done && (
                                <input
                                  type="number" min="1"
                                  placeholder="Qtd"
                                  value={st.stock ?? ''}
                                  onChange={e => setItemAction(item.id, { stock: e.target.value })}
                                  className="w-16 text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-300 text-xs"
                                />
                              )}
                            </td>
                          )}

                          <td className="py-1.5">
                            <div className="flex items-center gap-1.5">
                              {st.done && !st.removed && <span className="text-green-600 text-[10px] font-bold">✓ Ativado</span>}
                              {st.done && st.removed && <span className="text-gray-500 text-[10px] font-bold">✓ Removido</span>}
                              {st.error && (
                                <span className="text-red-600 text-[10px] max-w-[140px] truncate" title={st.error}>❌ {st.error}</span>
                              )}
                              {!st.done && isCandidate && (
                                <button
                                  onClick={() => handleActivate(item)}
                                  disabled={st.loading || (needsPrice && !st.dealPrice && !suggestedPrice)}
                                  className="flex items-center gap-0.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors"
                                >
                                  {st.loading
                                    ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                    : '✓'
                                  }
                                  {st.loading ? '' : 'Ativar'}
                                </button>
                              )}
                              {!st.done && isRemovable && (
                                <button
                                  onClick={() => handleRemove(item)}
                                  disabled={st.loading}
                                  className="flex items-center gap-0.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded border border-red-200 transition-colors"
                                >
                                  {st.loading
                                    ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                    : '✕'
                                  }
                                  {st.loading ? '' : 'Remover'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Tab: Promoções ───────────────────────────────────────────────────────────
function TabPromocoes({ usuarioId, contas }) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null); // null | { pct, msg }
  const syncPollRef = React.useRef(null);
  const [filters, setFilters] = useState({ contaId: '', tipo: '', status: '', maxSellerPct: '', soComMargem: false });
  const [itemSearch, setItemSearch] = useState('');
  const [resettingMargem, setResettingMargem] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ userId: usuarioId });
      if (filters.contaId) params.set('contaId', filters.contaId);
      if (filters.tipo) params.set('tipo', filters.tipo);
      if (filters.status) params.set('status', filters.status);
      if (filters.maxSellerPct) params.set('maxSellerPct', filters.maxSellerPct);
      if (filters.soComMargem) params.set('soComMargem', 'true');

      const res = await fetch(`/api/promocoes?${params}`);
      const data = await res.json();
      const results = data.results || [];
      setPromos(results);
      const maxFetchedAt = results.reduce((max, p) => {
        const t = p.fetchedAt ? new Date(p.fetchedAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      if (maxFetchedAt > 0) setLastSyncAt(new Date(maxFetchedAt));
    } catch {
      setPromos([]);
    } finally {
      setLoading(false);
    }
  }, [usuarioId, filters]);

  useEffect(() => { load(); }, [load]);

  async function handleSync(forceSync = false) {
    setSyncing(true);
    setSyncMsg('');
    setSyncProgress({ pct: 0, msg: 'Iniciando...' });
    try {
      const body = { userId: usuarioId, forceSync };
      if (filters.contaId) body.contaId = filters.contaId;
      const res = await fetch('/api/promocoes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.tarefaId) throw new Error(data.erro || 'Erro ao iniciar sincronização');

      // Polling de progresso via tarefaFila
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      syncPollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/fila/${data.tarefaId}/detalhes?userId=${encodeURIComponent(usuarioId)}`);
          if (!r.ok) return;
          const d = await r.json();

          // Extrai percentual do formato "[45%] mensagem"
          const match = (d.detalhes || '').match(/^\[(\d+)%\]\s*(.*)/);
          if (match) setSyncProgress({ pct: parseInt(match[1]), msg: match[2] });

          if (d.status === 'CONCLUIDO' || d.status === 'FALHA') {
            clearInterval(syncPollRef.current);
            syncPollRef.current = null;
            setSyncing(false);
            setSyncProgress(null);
            const icon = d.status === 'CONCLUIDO' ? '✅' : '❌';
            setSyncMsg(`${icon} ${match ? match[2] : d.detalhes}`);
            await load();
          }
        } catch (_) {}
      }, 2000);

    } catch (e) {
      setSyncing(false);
      setSyncProgress(null);
      setSyncMsg('❌ Erro ao sincronizar: ' + e.message);
    }
  }

  const setFilter = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  async function handleResetMargem() {
    if (!window.confirm('Isso vai remover a flag "margem promocional" de TODOS os seus anúncios. Confirma?')) return;
    setResettingMargem(true);
    try {
      const res = await fetch('/api/ml/reset-margem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSyncMsg(`✅ Margem resetada em ${data.count} anúncios`);
        await load();
      } else {
        setSyncMsg('❌ Erro: ' + (data.erro || 'desconhecido'));
      }
    } catch (e) {
      setSyncMsg('❌ Erro: ' + e.message);
    } finally {
      setResettingMargem(false);
    }
  }

  const displayPromos = itemSearch.trim()
    ? promos.filter(p => p.itens.some(i => i.id?.toLowerCase().includes(itemSearch.toLowerCase().trim())))
    : promos;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Account filter */}
        <select
          value={filters.contaId}
          onChange={e => setFilter('contaId', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">Todas as contas</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
        </select>

        {/* Type filter */}
        <select
          value={filters.tipo}
          onChange={e => setFilter('tipo', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {/* Status filter */}
        <select
          value={filters.status}
          onChange={e => setFilter('status', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">Todos os status</option>
          <option value="started">Ativas</option>
          <option value="pending">Pendentes</option>
          <option value="finished">Finalizadas</option>
        </select>

        {/* Seller % filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 whitespace-nowrap">% vendedor ≤</span>
          <input
            type="number"
            min="0"
            max="100"
            placeholder="Ex: 20"
            value={filters.maxSellerPct}
            onChange={e => setFilter('maxSellerPct', e.target.value)}
            className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <span className="text-xs text-gray-400">%</span>
        </div>

        {/* Item search */}
        <input
          type="text"
          placeholder="Buscar MLB ID..."
          value={itemSearch}
          onChange={e => setItemSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-40 text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
        />

        {/* Margem promocional filter */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-gray-700 whitespace-nowrap">
          <input
            type="checkbox"
            checked={filters.soComMargem}
            onChange={e => setFilter('soComMargem', e.target.checked)}
            className="w-4 h-4 rounded accent-orange-500"
          />
          <span>Só com margem promo</span>
        </label>

        <button
          onClick={handleResetMargem}
          disabled={resettingMargem}
          title="Remove a flag de margem promocional de todos os anúncios"
          className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50 border border-gray-200 hover:border-red-300 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {resettingMargem ? 'Resetando...' : 'Resetar Margem'}
        </button>

        <div className="flex-1" />

        {syncMsg && <span className="text-xs text-gray-500">{syncMsg}</span>}

        <div className="flex flex-col items-end gap-1">
          {lastSyncAt && !syncing && (
            <span className="text-[10px] text-gray-400">
              Última sincronia: {lastSyncAt.toLocaleDateString('pt-BR')} às {lastSyncAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {syncing && syncProgress && (
            <div className="w-56 flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-orange-600">
                <span className="truncate max-w-[180px]">{syncProgress.msg}</span>
                <span className="font-bold ml-1">{syncProgress.pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-orange-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${syncProgress.pct}%` }}
                />
              </div>
            </div>
          )}
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
          >
            {syncing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            {syncing ? 'Sincronizando...' : 'Sincronizar via API'}
          </button>
          {!syncing && (
            <button
              onClick={() => { if (window.confirm('Isso vai re-buscar os itens de TODAS as promoções ativas na API do ML, ignorando o cache. Pode demorar vários minutos. Confirma?')) handleSync(true); }}
              className="text-[10px] text-orange-400 hover:text-orange-600 underline transition-colors"
            >
              Forçar sincronização completa
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            Carregando promoções...
          </div>
        ) : displayPromos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            <p className="text-sm">Nenhuma promoção encontrada. Clique em <strong>Sincronizar via API</strong> para buscar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">ID da Promoção</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Fim</th>
                  <th className="px-3 py-2 text-right">% Vendedor</th>
                  <th className="px-3 py-2 text-right">Itens</th>
                  <th className="px-3 py-2">Conta</th>
                </tr>
              </thead>
              <tbody>
                {displayPromos.map(p => <PromoRow key={`${p.id}-${p.contaId}`} promo={p} usuarioId={usuarioId} onRefresh={load} itemSearch={itemSearch} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {displayPromos.length} promoção(ões) exibidas{itemSearch.trim() ? ` (filtro: "${itemSearch.trim()}")` : ''}. Os dados são salvos no banco — use "Sincronizar via API" para atualizar.
      </p>
    </div>
  );
}

// ===== Substitua esta função inteira em src/components/CentralPromocoes.jsx =====

function TabCriarCampanha({ usuarioId, contas }) {
  const [form, setForm] = useState({ contaId: '', nome: '', startDate: '', finishDate: '' });
  const [anuncios, setAnuncios] = useState([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [search, setSearch] = useState('');
  
  // Novos estados para os descontos globais
  const [descontoGeral, setDescontoGeral] = useState('');
  const [descontoTop, setDescontoTop] = useState('');

  // Estado modificado para guardar mais dados do item selecionado
  const [selected, setSelected] = useState({}); // { itemId: { ad, dealPrice, topDealPrice } }

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!form.contaId) { setAnuncios([]); setSelected({}); return; }
    setLoadingAds(true);
    setSelected({}); // Limpa seleção ao trocar de conta
    fetch(`/api/ml/anuncios?contasIds=${form.contaId}&status=active&limit=500`)
      .then(r => r.json())
      .then(data => setAnuncios(data.anuncios || []))
      .catch(() => setAnuncios([]))
      .finally(() => setLoadingAds(false));
  }, [form.contaId]);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const filteredAds = anuncios.filter(a =>
    !search || a.titulo?.toLowerCase().includes(search.toLowerCase()) || a.id?.toLowerCase().includes(search.toLowerCase()) || a.sku?.toLowerCase().includes(search.toLowerCase())
  );

  // Função que calcula os preços baseados nos percentuais
  const calculatePrices = (precoAtual, geralPct, topPct) => {
    const pAtual = Number(precoAtual);
    const dGeral = Number(geralPct);
    const dTop = Number(topPct);
    
    const dealPrice = (dGeral > 0 && dGeral < 100) ? pAtual * (1 - dGeral / 100) : null;
    const topDealPrice = (dTop > 0 && dTop < 100 && dTop > dGeral) ? pAtual * (1 - dTop / 100) : null;

    return {
      dealPrice: dealPrice ? dealPrice.toFixed(2) : '',
      topDealPrice: topDealPrice ? topDealPrice.toFixed(2) : '',
    };
  };

  // Atualiza os preços dos itens já selecionados quando o desconto global muda
  useEffect(() => {
    setSelected(prev => {
      const next = {};
      Object.keys(prev).forEach(id => {
        const { ad } = prev[id];
        const { dealPrice, topDealPrice } = calculatePrices(ad.preco, descontoGeral, descontoTop);
        next[id] = { ...prev[id], dealPrice, topDealPrice };
      });
      return next;
    });
  }, [descontoGeral, descontoTop]);

  // Adiciona ou remove um item da seleção, já calculando o preço inicial
  const toggleSelect = (ad) => {
    setSelected(prev => {
      if (prev[ad.id]) {
        const n = { ...prev };
        delete n[ad.id];
        return n;
      }
      const { dealPrice, topDealPrice } = calculatePrices(ad.preco, descontoGeral, descontoTop);
      return { ...prev, [ad.id]: { dealPrice, topDealPrice, ad } };
    });
  };

  const setPriceField = (id, field, val) => {
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    // Filtro estrito: preço válido, menor que o preço original, e item ainda na lista atual
    const itens = Object.entries(selected)
      .filter(([itemId, v]) => v.dealPrice && parseFloat(v.dealPrice) > 0 && parseFloat(v.dealPrice) < v.ad.preco && anuncios.some(a => a.id === itemId))
      .map(([itemId, v]) => ({
        itemId,
        dealPrice: parseFloat(v.dealPrice),
        ...(v.topDealPrice && parseFloat(v.topDealPrice) > 0 ? { topDealPrice: parseFloat(v.topDealPrice) } : {}),
      }));

    if (itens.length === 0) return alert('Selecione ao menos um item e defina um preço de promoção válido (menor que o preço original).');
    if (new Date(form.finishDate) < new Date(form.startDate)) return alert('A data de fim não pode ser anterior à data de início.');

    setSaving(true);
    setResult(null);
    try {
      const startDate = form.startDate ? `${form.startDate}T00:00:00` : '';
      const finishDate = form.finishDate ? `${form.finishDate}T23:59:59` : '';

      const res = await fetch('/api/promocoes/campanha-vendedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, startDate, finishDate, userId: usuarioId, itens }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        alert(`Campanha criada! Aviso: A API do ML associa todos os seus anúncios automaticamente como "Candidatos" à campanha, porém apenas os ${itens.length} iten(s) selecionados foram ativados com o desconto definido.`);
        setSelected({});
        setForm(prev => ({ ...prev, nome: '', startDate: '', finishDate: '' }));
      } else {
        throw new Error(data.erro || JSON.stringify(data.detalhes));
      }
    } catch (e) {
      setResult({ ok: false, erro: e.message });
      alert(`Erro ao criar campanha: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = Object.keys(selected).length;
  const readyCount = Object.values(selected).filter(v => v.dealPrice && parseFloat(v.dealPrice) > 0).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Dados da Campanha */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Dados da Campanha</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Conta ML</label>
            <select required value={form.contaId} onChange={e => setF('contaId', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">Selecione a conta...</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Nome da Campanha</label>
            <input required type="text" value={form.nome} onChange={e => setF('nome', e.target.value)}
              placeholder="Ex: Promoção de Março"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data de Início</label>
            <input required type="date" value={form.startDate} onChange={e => setF('startDate', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data de Fim <span className="text-gray-400 font-normal">(máx. 1 mês)</span></label>
            <input required type="date" value={form.finishDate} onChange={e => setF('finishDate', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
        </div>
      </div>

      {/* Item selection */}
      {form.contaId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Nova Seção de Descontos */}
          <div className="p-4 bg-orange-50 border-b border-orange-100 flex flex-wrap items-end gap-4">
            <h3 className="w-full text-sm font-bold text-gray-700 uppercase tracking-wide mb-1">Estratégia de Desconto (Preenchimento Rápido)</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Desconto Geral (%)</label>
              <input type="number" min="1" max="80" step="1" value={descontoGeral} onChange={e => setDescontoGeral(e.target.value)}
                placeholder="Ex: 10" className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Desconto Top Deal (%) <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input type="number" min="1" max="80" step="1" value={descontoTop} onChange={e => setDescontoTop(e.target.value)}
                placeholder="Ex: 15" className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"/>
            </div>
             <p className="text-[11px] text-gray-500 max-w-sm">Preencha para calcular automaticamente os preços dos itens selecionados. Você ainda pode editar o valor final de cada um na tabela.</p>
          </div>

          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex-1">Selecionar Itens</h3>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 hover:text-gray-700 select-none">
              <input
                type="checkbox"
                className="accent-orange-500 w-4 h-4 cursor-pointer"
                checked={filteredAds.length > 0 && filteredAds.every(ad => !!selected[ad.id])}
                onChange={e => {
                  if (e.target.checked) {
                    filteredAds.forEach(ad => { if (!selected[ad.id]) toggleSelect(ad); });
                  } else {
                    filteredAds.forEach(ad => { if (selected[ad.id]) toggleSelect(ad); });
                  }
                }}
              />
              Selecionar todos
            </label>
            <span className="text-xs text-gray-400">{selectedCount} selecionado(s)</span>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, ID ou SKU..."
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {loadingAds ? (
            <div className="py-8 text-center text-gray-400 text-sm">Carregando anúncios ativos...</div>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100">
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2 text-right">Preço Atual</th>
                    <th className="px-3 py-2 text-right w-36">Preço Promo (R$)</th>
                    <th className="px-3 py-2 text-right w-36">Top Deal (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAds.map(ad => {
                    const isSel = !!selected[ad.id];
                    return (
                      <tr key={ad.id} className={`border-b border-gray-50 hover:bg-orange-50/40 transition-colors ${isSel ? 'bg-orange-50' : ''}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSel} onChange={() => toggleSelect(ad)}
                            className="accent-orange-500 w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-8 h-8 object-contain rounded border border-gray-100" />}
                            <div>
                              <p className="font-medium text-gray-800 line-clamp-1 text-xs">{ad.titulo}</p>
                              <p className="text-gray-400 text-[10px] font-mono">{ad.id}{ad.sku ? ` · ${ad.sku}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 font-semibold text-xs">
                          R$ {Number(ad.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2">
                          {isSel && (
                            <input type="number" step="0.01" min="0"
                              placeholder="0,00"
                              value={selected[ad.id]?.dealPrice || ''}
                              onChange={e => setPriceField(ad.id, 'dealPrice', e.target.value)}
                              className="w-full text-right text-sm border border-orange-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isSel && (
                            <input type="number" step="0.01" min="0"
                              placeholder="Opcional"
                              value={selected[ad.id]?.topDealPrice || ''}
                              onChange={e => setPriceField(ad.id, 'topDealPrice', e.target.value)}
                              className="w-full text-right text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className={`rounded-xl px-5 py-4 text-sm border ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {result.ok ? (
            <>
              <p className="font-bold mb-1">✅ Campanha criada com sucesso!</p>
              <p>ID: <span className="font-mono">{result.campanha?.id}</span> · {result.resultItens?.filter(i => i.ok).length}/{result.resultItens?.length} itens adicionados</p>
            </>
          ) : (
            <p className="font-bold">❌ Erro: <span className="font-normal">{result.erro || JSON.stringify(result.detalhes)}</span></p>
          )}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button
          type="submit"
          disabled={saving || !form.contaId || readyCount === 0}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
        >
          {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
          {saving ? 'Criando...' : `Criar Campanha (${readyCount} ${readyCount === 1 ? 'item' : 'itens'})`}
        </button>
      </div>
    </form>
  );
}

// ─── Tab: Monitor de Promoções ────────────────────────────────────────────────
function TabMonitor({ usuarioId }) {
  const [config, setConfig] = useState({ ativo: true, maxSellerPct: 20, autoAtivar: false, tiposIgnorar: [], usarDescontoDinamico: false });
  const [alertas, setAlertas] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingAlertas, setLoadingAlertas] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [acaoLoading, setAcaoLoading] = useState({});
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`/api/monitor-promo/config?userId=${usuarioId}`)
      .then(r => r.json())
      .then(d => setConfig({ ativo: d.ativo ?? true, maxSellerPct: d.maxSellerPct ?? 20, autoAtivar: d.autoAtivar ?? false, tiposIgnorar: d.tiposIgnorar ?? [], usarDescontoDinamico: d.usarDescontoDinamico ?? false }))
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [usuarioId]);

  const loadAlertas = useCallback(async () => {
    setLoadingAlertas(true);
    try {
      const params = new URLSearchParams({ userId: usuarioId });
      if (!showAll) params.set('pendentesOnly', 'true');
      const res = await fetch(`/api/monitor-promo/alertas?${params}`);
      const data = await res.json();
      setAlertas(data.alertas || []);
    } catch {
      setAlertas([]);
    } finally {
      setLoadingAlertas(false);
    }
  }, [usuarioId, showAll]);

  useEffect(() => { loadAlertas(); }, [loadAlertas]);

  async function handleSaveConfig() {
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await fetch('/api/monitor-promo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, ...config }),
      });
      const data = await res.json();
      setSavedMsg(data.ok ? '✅ Configuração salva!' : '❌ Erro ao salvar');
    } catch (e) {
      setSavedMsg('❌ ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(''), 3000);
    }
  }

  async function handleAcao(alerta, acao) {
    setAcaoLoading(prev => ({ ...prev, [alerta.id]: true }));
    try {
      const res = await fetch(`/api/monitor-promo/alertas/${alerta.id}/acao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, acao }),
      });
      const data = await res.json();
      if (data.ok) await loadAlertas();
    } catch (e) {
      console.error(e);
    } finally {
      setAcaoLoading(prev => ({ ...prev, [alerta.id]: false }));
    }
  }

  function toggleTipoIgnorar(tipo) {
    setConfig(prev => {
      const cur = prev.tiposIgnorar || [];
      return { ...prev, tiposIgnorar: cur.includes(tipo) ? cur.filter(t => t !== tipo) : [...cur, tipo] };
    });
  }

  const pendentes = alertas.filter(a => a.aceita === null);
  const aceitas = alertas.filter(a => a.aceita === true);

  return (
    <div className="space-y-6">
      {/* Config Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Regra do Monitor</h3>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-600">Monitor ativo</span>
            <div
              onClick={() => setConfig(prev => ({ ...prev, ativo: !prev.ativo }))}
              className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${config.ativo ? 'bg-orange-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${config.ativo ? 'left-5' : 'left-0.5'}`} />
            </div>
          </label>
        </div>

        {/* Toggle Desconto Dinâmico */}
        <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
          <div
            onClick={() => setConfig(prev => ({ ...prev, usarDescontoDinamico: !prev.usarDescontoDinamico }))}
            className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ${config.usarDescontoDinamico ? 'bg-orange-500' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${config.usarDescontoDinamico ? 'left-5' : 'left-0.5'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Desconto Dinâmico</p>
            <p className="text-[11px] text-gray-500">
              {config.usarDescontoDinamico
                ? 'Cada anúncio usa o % que foi inflado ao ser publicado/corrigido. O limite fixo abaixo é ignorado.'
                : 'Usa o % fixo abaixo como limite para todos os anúncios.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={config.usarDescontoDinamico ? 'opacity-40 pointer-events-none' : ''}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              % Máximo do Vendedor
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="100" step="0.5"
                value={config.maxSellerPct}
                onChange={e => setConfig(prev => ({ ...prev, maxSellerPct: parseFloat(e.target.value) || 0 }))}
                className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-2 text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {config.usarDescontoDinamico ? 'Ignorado no modo dinâmico' : 'Alertar apenas promoções com sua contribuição ≤ este valor'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Aceitar Automaticamente
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
              <div
                onClick={() => setConfig(prev => ({ ...prev, autoAtivar: !prev.autoAtivar }))}
                className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${config.autoAtivar ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${config.autoAtivar ? 'left-5' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-gray-600">{config.autoAtivar ? 'Sim — ativa automaticamente' : 'Não — mostrar no painel para decidir'}</span>
            </label>
            <p className="text-[11px] text-gray-400 mt-1">Se ativo, o agendador noturno ativa os itens candidatos sem confirmação</p>
          </div>
        </div>

        {/* Tipos ignorar */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Tipos a Ignorar
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TIPO_LABELS).map(([tipo, info]) => {
              const ativo = (config.tiposIgnorar || []).includes(tipo);
              return (
                <button key={tipo} type="button"
                  onClick={() => toggleTipoIgnorar(tipo)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${ativo ? 'bg-gray-200 text-gray-500 border-gray-300 line-through' : `${info.color} border-transparent`}`}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Clique em um tipo para ignorá-lo no monitoramento</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={handleSaveConfig} disabled={saving || loadingConfig}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors">
            {saving
              ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            }
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
          {savedMsg && <span className="text-xs text-gray-500">{savedMsg}</span>}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Como funciona:</strong> O agendador noturno (2h da manhã) verifica todas as promoções disponíveis para suas contas.
        Quando encontra promoções com % do vendedor dentro do limite configurado, gera um alerta aqui.
        {config.usarDescontoDinamico && <span> No <strong>modo dinâmico</strong>, cada anúncio é comparado ao % que foi inflado quando o preço foi enviado — itens sem inflação registrada são ignorados.</span>}
        {config.autoAtivar
          ? ' Com auto-aceitar ativo, os itens candidatos serão ativados automaticamente.'
          : ' Você pode aceitar ou ignorar cada promoção manualmente abaixo.'}
      </div>

      {/* Alertas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-gray-800 text-sm">Promoções Detectadas</span>
            {pendentes.length > 0 && (
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}
              </span>
            )}
            {aceitas.length > 0 && (
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {aceitas.length} aceita{aceitas.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="w-3.5 h-3.5 rounded accent-orange-500" />
              Mostrar todas
            </label>
            <button onClick={loadAlertas} className="text-xs text-orange-500 hover:text-orange-600 font-semibold">
              Atualizar
            </button>
          </div>
        </div>

        {loadingAlertas ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            Carregando alertas...
          </div>
        ) : alertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-400">
            <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">Nenhum alerta encontrado.</p>
            <p className="text-xs text-gray-300">O monitor roda automaticamente toda noite. Salve a configuração e aguarde o próximo ciclo.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {alertas.map(alerta => {
              const promo = alerta.promo;
              const loading = acaoLoading[alerta.id];
              const isPendente = alerta.aceita === null;
              const isAceita = alerta.aceita === true;
              const tipoInfo = TIPO_LABELS[alerta.tipo] || { label: alerta.tipo, color: 'bg-gray-100 text-gray-700' };
              return (
                <div key={alerta.id} className={`px-4 py-3 flex items-center gap-3 ${!isPendente ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tipoInfo.color}`}>{tipoInfo.label}</span>
                      {isAceita && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Aceita</span>}
                      {alerta.aceita === false && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Ignorada</span>}
                      <span className="text-xs font-semibold text-gray-700 truncate">{alerta.nome || alerta.promoId}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-400">
                      <span>% Vendedor: <strong className={`${alerta.sellerPct <= config.maxSellerPct ? 'text-green-600' : 'text-red-500'}`}>{alerta.sellerPct?.toFixed(1)}%</strong></span>
                      {promo?.itens && <span>{Array.isArray(promo.itens) ? promo.itens.filter(i => i.status === 'candidate').length : 0} item(s) candidato(s)</span>}
                      <span>Detectada: {new Date(alerta.detectadaEm).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  {isPendente && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAcao(alerta, 'aceitar')}
                        disabled={loading}
                        className="flex items-center gap-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {loading ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : '✓'}
                        Aceitar
                      </button>
                      <button
                        onClick={() => handleAcao(alerta, 'ignorar')}
                        disabled={loading}
                        className="flex items-center gap-1 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
                      >
                        ✕ Ignorar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Orquestrador ────────────────────────────────────────────────────────
function TabOrquestrador({ usuarioId, contas }) {
  const [contaFiltro, setContaFiltro] = useState('');
  const [regras, setRegras] = useState([{
    nome: 'Regra Principal',
    tiposPermitidos: ['MARKETPLACE_CAMPAIGN', 'SMART'],
    maxSellerPct: 20,
    tolerancia: 5,
    ativo: true,
  }]);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    fetch(`/api/orquestrador/regras?userId=${usuarioId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setRegras(data); })
      .catch(() => {});
  }, [usuarioId]);

  function setRegraField(idx, field, val) {
    setRegras(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function toggleTipo(idx, tipo) {
    setRegras(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const cur = r.tiposPermitidos || [];
      return { ...r, tiposPermitidos: cur.includes(tipo) ? cur.filter(t => t !== tipo) : [...cur, tipo] };
    }));
  }

  async function handleSave() {
    setSalvando(true);
    setSavedMsg('');
    try {
      const res = await fetch('/api/orquestrador/regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, regras }),
      });
      const data = await res.json();
      setSavedMsg(data.ok ? '✅ Regras salvas com sucesso!' : '❌ Erro ao salvar');
    } catch (e) {
      setSavedMsg('❌ ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleExecutar() {
    setExecutando(true);
    setExecResult(null);
    try {
      const body = { userId: usuarioId, regras };
      if (contaFiltro) body.contaId = contaFiltro;
      const res = await fetch('/api/orquestrador/executar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setExecResult(data);
    } catch (e) {
      setExecResult({ ok: false, erro: e.message });
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 text-sm text-indigo-700 flex items-start gap-3">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" strokeWidth="2"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2"/>
        </svg>
        <span>O orquestrador percorre as promoções salvas no banco e tenta aderir automaticamente a itens <strong>candidatos</strong> que estejam dentro das regras definidas. Execute <strong>Sincronizar via API</strong> na aba de Promoções antes de rodar.</span>
      </div>

      {/* Account filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Escopo de Execução</h3>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-500">Conta:</label>
          <select value={contaFiltro} onChange={e => setContaFiltro(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300">
            <option value="">Todas as contas</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        </div>
      </div>

      {/* Rules */}
      {regras.map((regra, idx) => (
        <div key={idx} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={regra.nome}
              onChange={e => setRegraField(idx, 'nome', e.target.value)}
              className="text-sm font-bold text-gray-700 border-0 border-b border-dashed border-gray-300 focus:outline-none focus:border-orange-400 bg-transparent"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Ativa</span>
              <button type="button"
                onClick={() => setRegraField(idx, 'ativo', !regra.ativo)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${regra.ativo ? 'bg-orange-500' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${regra.ativo ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
              {regras.length > 1 && (
                <button type="button" onClick={() => setRegras(prev => prev.filter((_, i) => i !== idx))}
                  className="text-gray-300 hover:text-red-400 transition-colors ml-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* Tipo checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipos de Promoção</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS_ORQUESTRADOR.map(tipo => {
                const info = TIPO_LABELS[tipo] || { label: tipo, color: 'bg-gray-100 text-gray-700' };
                const checked = (regra.tiposPermitidos || []).includes(tipo);
                return (
                  <button key={tipo} type="button"
                    onClick={() => toggleTipo(idx, tipo)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all ${checked ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                  >
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* % fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                % Máximo do Vendedor
              </label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100" step="0.5"
                  value={regra.maxSellerPct}
                  onChange={e => setRegraField(idx, 'maxSellerPct', parseFloat(e.target.value) || 0)}
                  className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-2 text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Aceitar promoções onde sua contribuição seja ≤ este valor</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Tolerância
              </label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="50" step="0.5"
                  value={regra.tolerancia}
                  onChange={e => setRegraField(idx, 'tolerancia', parseFloat(e.target.value) || 0)}
                  className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-2 text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Aceitar também até +{regra.tolerancia}% acima do máximo (limite: {(parseFloat(regra.maxSellerPct || 0) + parseFloat(regra.tolerancia || 0)).toFixed(1)}%)</p>
            </div>
          </div>
        </div>
      ))}

      <button type="button"
        onClick={() => setRegras(prev => [...prev, { nome: `Regra ${prev.length + 1}`, tiposPermitidos: ['MARKETPLACE_CAMPAIGN'], maxSellerPct: 20, tolerancia: 5, ativo: true }])}
        className="text-sm text-orange-500 hover:text-orange-600 font-semibold flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        Adicionar Regra
      </button>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={salvando}
          className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 bg-white text-gray-700 text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-60">
          {salvando ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>}
          {salvando ? 'Salvando...' : 'Salvar Regras'}
        </button>

        {savedMsg && <span className="text-xs text-gray-500">{savedMsg}</span>}

        <div className="flex-1" />

        <button type="button" onClick={handleExecutar} disabled={executando}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm transition-all">
          {executando ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          )}
          {executando ? 'Executando...' : 'Executar Orquestrador'}
        </button>
      </div>

      {/* Execution result */}
      {execResult && (
        <div className={`rounded-xl border p-5 space-y-3 ${execResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {execResult.ok ? (
            <>
              <div className="flex items-center gap-4 text-sm font-semibold">
                <span className="text-green-700">✅ Concluído</span>
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs">
                  {execResult.joined} item(s) aderido(s)
                </span>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">
                  {execResult.skipped} pulado(s)
                </span>
                {execResult.errors > 0 && (
                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs">
                    {execResult.errors} erro(s)
                  </span>
                )}
              </div>
              {execResult.detalhes?.joined?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-green-700 mb-1">Itens aderidos:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {execResult.detalhes.joined.map((j, i) => (
                      <div key={i} className="text-xs text-green-800 font-mono bg-green-100 px-2 py-1 rounded">
                        {j.itemId} → {j.promoId} ({j.tipo}) {j.sellerPct != null ? `· ${j.sellerPct}%` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {execResult.detalhes?.errors?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-red-700 mb-1">Erros:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {execResult.detalhes.errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-700 font-mono bg-red-100 px-2 py-1 rounded">
                        {e.itemId} → {e.erro}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-red-700">❌ {execResult.erro || JSON.stringify(execResult)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CentralPromocoes({ usuarioId }) {
  const [activeTab, setActiveTab] = useState('promocoes');
  const [contas, setContas] = useState([]);

  useEffect(() => {
    if (!usuarioId) return;
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(r => r.json())
      .then(data => { if (data.contasML) setContas(data.contasML); })
      .catch(() => {});
  }, [usuarioId]);

  const tabs = [
    { id: 'promocoes', label: 'Promoções Disponíveis', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" strokeWidth={2}/></svg>
    )},
    { id: 'criar', label: 'Criar Campanha', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
    )},
    { id: 'orquestrador', label: 'Orquestrador', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    )},
    { id: 'monitor', label: 'Monitor', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
    )},
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 rounded-2xl p-6 flex items-center gap-4 shadow-md">
        <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth={3}/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Central de Promoções</h1>
          <p className="text-white/80 text-sm mt-0.5">Consulte promoções do ML, crie campanhas do vendedor e automatize adesões com regras.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'promocoes' && <TabPromocoes usuarioId={usuarioId} contas={contas} />}
      {activeTab === 'criar' && <TabCriarCampanha usuarioId={usuarioId} contas={contas} />}
      {activeTab === 'orquestrador' && <TabOrquestrador usuarioId={usuarioId} contas={contas} />}
      {activeTab === 'monitor' && <TabMonitor usuarioId={usuarioId} />}
    </div>
  );
}
