import React, { useState, useCallback, useMemo } from 'react';
import { useContasML } from '../contexts/ContasMLContext';
import { useAuth } from '../contexts/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtPct(v) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
}

const STATUS_INFO = {
  with_benchmark_highest: { label: 'Muito Acima', color: '#e74c3c', bg: '#fdecea', desc: 'Acima do máximo dos concorrentes' },
  with_benchmark_high:    { label: 'Alto',        color: '#e67e22', bg: '#fef9f0', desc: 'Alto em relação ao sugerido' },
  no_benchmark_ok:        { label: 'Competitivo', color: '#27ae60', bg: '#edfaf1', desc: 'Alinhado ao mercado' },
  no_benchmark_lowest:    { label: 'Abaixo',      color: '#2980b9', bg: '#eaf4fb', desc: 'Abaixo do sugerido' },
  not_optin_applied:      { label: 'Promoção',    color: '#8e44ad', bg: '#f5eef8', desc: 'Promoção disponível' },
  promotion_scheduled:    { label: 'Prom. Agend.', color: '#8e44ad', bg: '#f5eef8', desc: 'Promoção agendada' },
  promotion_active:       { label: 'Prom. Ativa', color: '#27ae60', bg: '#edfaf1', desc: 'Promoção ativa' },
};

function StatusBadge({ status }) {
  const info = STATUS_INFO[status] || { label: status || '—', color: '#7f8c8d', bg: '#f4f4f4' };
  return (
    <span title={info.desc} style={{ background: info.bg, color: info.color, border: `1px solid ${info.color}40`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {info.label}
    </span>
  );
}

function AutoBadge({ automation }) {
  if (!automation) return <span style={{ color: '#94a3b8', fontSize: 11 }}>Sem automação</span>;
  const ok = automation.status === 'ACTIVE';
  return (
    <span style={{ background: ok ? '#edfaf1' : '#fef9f0', color: ok ? '#27ae60' : '#e67e22', border: `1px solid ${ok ? '#27ae6040' : '#e67e2240'}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {ok ? 'ATIVA' : 'PAUSADA'}
    </span>
  );
}

// ── Formulário de automação ───────────────────────────────────────────────────
function FormAutomacao({ item, onSave, onCancel, loading }) {
  const existing = item.automation;
  const [ruleId, setRuleId] = useState(existing?.item_rule?.rule_id || 'INT_EXT');
  const [minMode, setMinMode] = useState('reais');
  const [minReais, setMinReais] = useState(existing?.min_price ? String(existing.min_price) : '');
  const [minPct, setMinPct] = useState('');
  const [maxReais, setMaxReais] = useState(existing?.max_price ? String(existing.max_price) : '');

  const basePrice = (() => {
    const promo = item.promotionDetail;
    if (promo?.discount_percent > 0) return item.currentPrice * (1 - promo.discount_percent / 100);
    return item.currentPrice;
  })();

  const minPriceCalc = minMode === 'pct' && minPct
    ? Math.round(basePrice * (1 - Number(minPct) / 100) * 100) / 100
    : null;
  const minFinal = minMode === 'reais' ? Number(minReais) : minPriceCalc;

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* Regra */}
        <div style={{ minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>REGRA</label>
          <select value={ruleId} onChange={e => setRuleId(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}>
            <option value="INT_EXT">INT_EXT — Melhor preço (ML + fora)</option>
            <option value="INT">INT — Melhor preço (somente ML)</option>
          </select>
        </div>

        {/* Preço mínimo */}
        <div style={{ minWidth: 250 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
            PREÇO MÍNIMO
            {item.promotionDetail?.discount_percent > 0 && (
              <span style={{ color: '#8e44ad', marginLeft: 6 }}>base promo: {fmtBRL(basePrice)}</span>
            )}
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              {[['reais', 'R$'], ['pct', '% abaixo']].map(([m, lbl]) => (
                <button key={m} onClick={() => setMinMode(m)} style={{ padding: '5px 9px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: minMode === m ? '#e67e22' : '#fff', color: minMode === m ? '#fff' : '#64748b' }}>
                  {lbl}
                </button>
              ))}
            </div>
            {minMode === 'reais' ? (
              <input type="number" min="0" step="0.01" value={minReais} onChange={e => setMinReais(e.target.value)} placeholder="0,00"
                style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
            ) : (
              <>
                <input type="number" min="0" max="99" step="0.5" value={minPct} onChange={e => setMinPct(e.target.value)} placeholder="ex: 10"
                  style={{ width: 65, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                {minPriceCalc != null && <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 700 }}>= {fmtBRL(minPriceCalc)}</span>}
              </>
            )}
          </div>
        </div>

        {/* Máximo */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
            MÁX <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>R$</span>
            <input type="number" min="0" step="0.01" value={maxReais} onChange={e => setMaxReais(e.target.value)} placeholder="Sem limite"
              style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          <button onClick={() => onSave({ rule_id: ruleId, min_price: minFinal, max_price: maxReais ? Number(maxReais) : undefined, action: existing ? 'update' : 'create' })}
            disabled={loading || !minFinal || minFinal <= 0}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', cursor: loading || !minFinal ? 'not-allowed' : 'pointer', background: '#e67e22', color: '#fff', fontWeight: 600, fontSize: 13, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Salvando...' : existing ? 'Atualizar' : 'Ativar Automação'}
          </button>
          <button onClick={onCancel} disabled={loading}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', cursor: 'pointer', background: '#fff', color: '#64748b', fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      </div>
      {minFinal > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
          Regra <strong>{ruleId}</strong> | Mín: <strong style={{ color: '#e67e22' }}>{fmtBRL(minFinal)}</strong>
          {maxReais ? <> | Máx: <strong>{fmtBRL(Number(maxReais))}</strong></> : ''}
        </div>
      )}
    </div>
  );
}

// ── Linha de item ─────────────────────────────────────────────────────────────
function ItemRow({ item, usuarioId, showConta, onItemUpdate, isCheapestInGroup = false }) {
  const { auth, impersonating } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const token = impersonating?.token || auth?.token;

  const handleSave = useCallback(async (payload) => {
    setActionLoading(true); setError(null);
    try {
      const res = await fetch('/api/ml/automacao-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.id, contaId: item.contaId, userId: usuarioId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalhes?.message || data.erro || 'Erro');
      setExpanded(false);
      onItemUpdate(item.id, item.contaId, { hasAutomation: true, automation: data });
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
  }, [item, usuarioId, token, onItemUpdate]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Remover automação de ${item.id}?`)) return;
    setActionLoading(true); setError(null);
    try {
      const res = await fetch('/api/ml/automacao-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.id, contaId: item.contaId, userId: usuarioId, action: 'delete' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalhes?.message || data.erro || 'Erro');
      setExpanded(false);
      onItemUpdate(item.id, item.contaId, { hasAutomation: false, automation: null });
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
  }, [item, usuarioId, token, onItemUpdate]);

  const inStock = item.availableQuantity == null || item.availableQuantity > 0;

  const cols = showConta
    ? '2fr 70px 110px 1fr 1fr 70px 1fr 120px'
    : '2fr 70px 1fr 1fr 70px 1fr 120px';

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', background: expanded ? '#fffbf5' : 'transparent' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '10px 14px', alignItems: 'center' }}>

        {/* Produto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 5, border: '1px solid #e2e8f0', flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>{item.title}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.id}</div>
            {item.sku && <div style={{ fontSize: 10, color: '#64748b' }}>SKU: {item.sku}</div>}
          </div>
        </div>

        {/* Estoque */}
        <div style={{ textAlign: 'center' }}>
          {item.availableQuantity != null ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: item.availableQuantity === 0 ? '#e74c3c' : item.availableQuantity < 5 ? '#e67e22' : '#27ae60' }}>
              {item.availableQuantity}
            </span>
          ) : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
        </div>

        {/* Conta */}
        {showConta && (
          <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.contaNickname}
          </div>
        )}

        {/* Preço atual */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{fmtBRL(item.currentPrice)}</div>
          {item.promotionDetail?.discount_percent > 0 && (
            <div style={{ fontSize: 10, color: '#8e44ad' }}>Promo {item.promotionDetail.discount_percent}% off</div>
          )}
        </div>

        {/* Preço sugerido */}
        <div style={{ textAlign: 'right' }}>
          {item.suggestedPrice != null ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#27ae60' }}>{fmtBRL(item.suggestedPrice)}</div>
              {item.lowestPrice != null && item.lowestPrice !== item.suggestedPrice && (
                <div style={{ fontSize: 10, color: '#64748b' }}>Mín: {fmtBRL(item.lowestPrice)}</div>
              )}
            </>
          ) : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
        </div>

        {/* % diff */}
        <div style={{ textAlign: 'center' }}>
          {item.percentDifference != null ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: item.percentDifference > 20 ? '#e74c3c' : item.percentDifference > 5 ? '#e67e22' : '#27ae60' }}>
              {item.percentDifference > 0 ? '+' : ''}{fmtPct(item.percentDifference)}
            </span>
          ) : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
        </div>

        {/* Status / Automação / Própria conta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {item.status && <StatusBadge status={item.status} />}
          <AutoBadge automation={item.automation} />
          {item.automation && (
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              Mín: {fmtBRL(item.automation.min_price)}{item.automation.max_price ? ` | Máx: ${fmtBRL(item.automation.max_price)}` : ''}
            </div>
          )}
          {isCheapestInGroup && (() => {
            const aindaAcima = item.status === 'with_benchmark_highest' || item.status === 'with_benchmark_high';
            return (
              <span title={aindaAcima ? 'É o mais barato entre suas contas, mas ainda acima dos concorrentes externos' : 'É o mais barato entre suas contas'}
                style={{ background: aindaAcima ? '#fef9c3' : '#dcfce7', color: aindaAcima ? '#854d0e' : '#166534', border: `1px solid ${aindaAcima ? '#fde047' : '#bbf7d0'}`, borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600, cursor: 'help' }}>
                {aindaAcima ? '🏷️ Referência do grupo (ainda acima do mercado)' : '🏷️ Referência do grupo'}
              </span>
            );
          })()}
          {!isCheapestInGroup && item.ownAccountCompetition && (
            <span title={`${item.ownAccountCompetition.nickname} vende por ${fmtBRL(item.ownAccountCompetition.price)}`}
              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600, cursor: 'help' }}>
              ⚠️ Compete com: {item.ownAccountCompetition.nickname} ({fmtBRL(item.ownAccountCompetition.price)})
            </span>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button onClick={() => setExpanded(e => !e)}
            style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${expanded ? '#e67e22' : '#cbd5e1'}`, background: expanded ? '#fef3e2' : '#fff', color: expanded ? '#e67e22' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            {expanded ? 'Fechar' : item.hasAutomation ? 'Editar' : 'Configurar'}
          </button>
          {item.hasAutomation && !expanded && (
            <button onClick={handleDelete} disabled={actionLoading} title="Remover automação"
              style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#e74c3c', cursor: 'pointer', fontSize: 11 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Competidores ML */}
      {item.competitorGraph?.length > 0 && !expanded && (
        <div style={{ padding: '0 14px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.competitorGraph.slice(0, 5).map((g, i) => (
            <span key={i} title={g.info?.title} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 5, padding: '2px 7px', fontSize: 10 }}>
              {fmtBRL(g.price?.amount)} {g.info?.sold_quantity > 0 && <span style={{ color: '#27ae60' }}>({g.info.sold_quantity} vendidos)</span>}
            </span>
          ))}
          <span style={{ fontSize: 10, color: '#94a3b8', alignSelf: 'center' }}>concorrentes</span>
        </div>
      )}

      {/* Form expandido */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '7px 12px', color: '#b91c1c', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <FormAutomacao item={item} onSave={handleSave} onCancel={() => { setExpanded(false); setError(null); }} loading={actionLoading} />
        </div>
      )}
    </div>
  );
}

// ── Grupo de SKU ──────────────────────────────────────────────────────────────
function SkuGroup({ sku, items, usuarioId, showConta, onItemUpdate }) {
  const [open, setOpen] = useState(true);

  // O item mais barato do grupo é a "referência" — provavelmente é o que o ML
  // está usando como concorrente para os outros itens do mesmo SKU
  const sorted = [...items].sort((a, b) => (a.currentPrice || 0) - (b.currentPrice || 0));
  const cheapest = sorted[0];
  const cheapestId = cheapest?.id;
  const cheapestContaId = cheapest?.contaId;

  // Há concorrência interna se mais de 1 item no grupo (os "caros" competem com o barato)
  const hasInternalConflict = items.length > 1 && items.some(i => i.ownAccountCompetition);
  const conflictCount = items.filter(i => i.ownAccountCompetition).length;

  return (
    <div style={{ border: `1px solid ${hasInternalConflict ? '#fde68a' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '9px 14px', background: hasInternalConflict ? '#fffbeb' : '#f8fafc', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>SKU: {sku}</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{items.length} {items.length === 1 ? 'anúncio' : 'anúncios'}</span>
        {hasInternalConflict && (
          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
            ⚠️ {conflictCount} {conflictCount === 1 ? 'anúncio compete' : 'anúncios competem'} com sua conta mais barata
          </span>
        )}
        {items.some(i => i.hasAutomation) && (
          <span style={{ background: '#edfaf1', color: '#27ae60', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>Automação ativa</span>
        )}
      </button>

      {open && (
        <>
          {/* Legenda da referência */}
          {hasInternalConflict && (
            <div style={{ padding: '6px 14px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏷️</span>
              <span>
                O anúncio mais barato do grupo é <strong>{cheapest.contaNickname}</strong> ({cheapest.id}) por <strong>{fmtBRL(cheapest.currentPrice)}</strong>.
                Os outros {conflictCount} {conflictCount === 1 ? 'anúncio' : 'anúncios'} provavelmente estão sendo comparados com ele.
              </span>
            </div>
          )}

          {sorted.map((item, idx) => {
            const isCheapest = item.id === cheapestId && item.contaId === cheapestContaId;
            return (
              <div key={`${item.id}-${item.contaId}`} style={{ position: 'relative' }}>
                {isCheapest && hasInternalConflict && (
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#27ae60', borderRadius: '0 0 0 0' }} />
                )}
                {!isCheapest && item.ownAccountCompetition && (
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#f59e0b' }} />
                )}
                <ItemRow item={item} usuarioId={usuarioId} showConta={showConta} onItemUpdate={onItemUpdate} isCheapestInGroup={isCheapest && hasInternalConflict} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ConcorrenciaPreco({ usuarioId }) {
  const { contas } = useContasML();
  const { auth, impersonating } = useAuth();

  const [contaId, setContaId] = useState('all');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const abortRef = React.useRef(null);

  // Filtros
  const [filtroEstoque, setFiltroEstoque] = useState(false);
  const [filtroOcultarCompetitivos, setFiltroOcultarCompetitivos] = useState(false);
  const [agruparSku, setAgruparSku] = useState(false);

  const STATUS_COMPETITIVO = new Set(['no_benchmark_ok', 'no_benchmark_lowest', 'promotion_active']);

  const LIMIT = 50;
  const token = impersonating?.token || auth?.token;
  const multiConta = contas.length > 1;

  const fetchData = useCallback(async () => {
    // Cancela busca anterior se ainda estiver rodando
    if (abortRef.current) abortRef.current.aborted = true;
    const ctrl = { aborted: false };
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setItems([]);
    setTotal(0);
    setLoadedCount(0);
    setHasFetched(false);

    const allItems = [];
    let currentOffset = 0;

    try {
      while (true) {
        if (ctrl.aborted) break;
        const params = new URLSearchParams({ userId: usuarioId, contaId, offset: currentOffset, limit: LIMIT });
        const res = await fetch(`/api/ml/concorrencia-preco?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detalhes?.message || data.erro || 'Erro ao buscar dados');
        if (ctrl.aborted) break;

        allItems.push(...data.items);
        const newTotal = data.total;

        // Atualiza estado progressivamente para o usuário ver chegando
        setTotal(newTotal);
        setItems([...allItems]);
        setLoadedCount(allItems.length);
        setHasFetched(true);

        currentOffset += LIMIT;
        if (allItems.length >= newTotal || data.items.length === 0) break;
      }
    } catch (e) {
      if (!ctrl.aborted) setError(e.message);
    } finally {
      if (!ctrl.aborted) setLoading(false);
    }
  }, [contaId, usuarioId, token]);

  const handleItemUpdate = useCallback((itemId, itemContaId, updates) => {
    setItems(prev => prev.map(i => (i.id === itemId && i.contaId === itemContaId) ? { ...i, ...updates } : i));
  }, []);

  // Aplica filtros client-side
  const filtered = useMemo(() => {
    let list = items;

    if (filtroEstoque) {
      list = list.filter(i => i.availableQuantity == null || i.availableQuantity > 0);
    }

    if (filtroOcultarCompetitivos) {
      // Encontra todos os SKUs que já possuem pelo menos 1 anúncio competitivo/ganhando
      const skusComCompetitivo = new Set();
      for (const item of list) {
        if (item.sku && STATUS_COMPETITIVO.has(item.status)) {
          skusComCompetitivo.add(item.sku);
        }
      }
      // Remove: itens cujo SKU já tem um competitivo, e itens sem SKU que eles mesmos são competitivos
      list = list.filter(i => {
        if (i.sku) return !skusComCompetitivo.has(i.sku);
        return !STATUS_COMPETITIVO.has(i.status);
      });
    }

    return list;
  }, [items, filtroEstoque, filtroOcultarCompetitivos]);

  // Agrupamento por SKU
  const grouped = useMemo(() => {
    if (!agruparSku) return null;
    const groups = {};
    const noSku = [];
    for (const item of filtered) {
      if (item.sku) {
        if (!groups[item.sku]) groups[item.sku] = [];
        groups[item.sku].push(item);
      } else {
        noSku.push(item);
      }
    }
    return { groups, noSku };
  }, [filtered, agruparSku]);

  const showConta = contaId === 'all' && multiConta;

  // Stats
  const activeAuto = filtered.filter(i => i.hasAutomation).length;
  const withConflict = filtered.filter(i => i.ownAccountCompetition).length;
  const highPrio = filtered.filter(i => i.status === 'with_benchmark_highest').length;
  const semEstoque = filtered.filter(i => i.availableQuantity === 0).length;

  const headCols = showConta
    ? '2fr 70px 110px 1fr 1fr 70px 1fr 120px'
    : '2fr 70px 1fr 1fr 70px 1fr 120px';
  const headers = ['Produto', 'Estoque', ...(showConta ? ['Conta'] : []), 'Preço Atual', 'Sugerido', '% Dif.', 'Status / Automação', 'Ações'];

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', paddingBottom: 40 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 21, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Concorrência de Preço</h2>
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Anúncios com oportunidade de ajuste baseada em concorrentes. Ative a automação do ML para manter preços competitivos.
        </p>
      </div>

      {/* Controles */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>

        {/* Conta */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>CONTA ML</label>
          <select value={contaId} onChange={e => { setContaId(e.target.value); setItems([]); setHasFetched(false); }}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', minWidth: 180 }}>
            {multiConta && <option value="all">Todas as contas</option>}
            {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
            <input type="checkbox" checked={filtroEstoque} onChange={e => setFiltroEstoque(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#e67e22' }} />
            Apenas com estoque
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
            <input type="checkbox" checked={filtroOcultarCompetitivos} onChange={e => setFiltroOcultarCompetitivos(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#e67e22' }} />
            Ocultar SKUs com 1 ganhando
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
            <input type="checkbox" checked={agruparSku} onChange={e => setAgruparSku(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#e67e22' }} />
            Agrupar por SKU
          </label>
        </div>

        <button onClick={fetchData} disabled={loading}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: loading ? '#94a3b8' : '#e67e22', color: '#fff', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
          {loading
            ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTop: '2px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
                {total > 0 ? `${loadedCount}/${total}...` : 'Buscando...'}</>
            : 'Buscar Oportunidades'}
        </button>
      </div>

      {/* Barra de progresso */}
      {loading && total > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            <span>Carregando anúncios...</span>
            <span style={{ fontWeight: 600 }}>{loadedCount} / {total}</span>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#e67e22', borderRadius: 99, width: `${Math.round(loadedCount / total * 100)}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
            Os filtros e agrupamentos já funcionam nos itens carregados. Complete para filtrar tudo.
          </div>
        </div>
      )}

      {/* Erro */}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {/* Stats */}
      {hasFetched && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Com oportunidade', value: total, color: '#2980b9', bg: '#eaf4fb' },
            { label: 'Muito acima', value: highPrio, color: '#e74c3c', bg: '#fdecea' },
            { label: 'Com automação', value: activeAuto, color: '#27ae60', bg: '#edfaf1' },
            { label: 'Concorrência interna', value: withConflict, color: '#92400e', bg: '#fef3c7', hide: withConflict === 0 },
            { label: 'Sem estoque', value: semEstoque, color: '#64748b', bg: '#f8fafc', hide: semEstoque === 0 },
          ].filter(s => !s.hide).map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}25`, borderRadius: 9, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Aviso concorrência interna */}
      {hasFetched && withConflict > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
          <strong>⚠️ Concorrência interna detectada:</strong> {withConflict} {withConflict === 1 ? 'anúncio está' : 'anúncios estão'} sendo comparado pelo ML com outro anúncio mais barato do mesmo SKU que pertence a você. Ative "Agrupar por SKU" para ver o diagnóstico completo.
        </div>
      )}

      {/* Tabela / Grupos */}
      {hasFetched && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          {!agruparSku && (
            <div style={{ display: 'grid', gridTemplateColumns: headCols, gap: 6, padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {headers.map((h, i) => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: i === 0 ? 'left' : i === headers.length - 1 ? 'right' : 'center' }}>{h}</div>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              {hasFetched ? 'Nenhum item encontrado com os filtros aplicados.' : ''}
            </div>
          ) : agruparSku && grouped ? (
            <div style={{ padding: 12 }}>
              {Object.entries(grouped.groups).map(([sku, skuItems]) => (
                <SkuGroup key={sku} sku={sku} items={skuItems} usuarioId={usuarioId} showConta={showConta} onItemUpdate={handleItemUpdate} />
              ))}
              {grouped.noSku.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', padding: '8px 4px 4px', textTransform: 'uppercase' }}>Sem SKU</div>
                  {grouped.noSku.map(item => (
                    <div key={`${item.id}-${item.contaId}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                      <ItemRow item={item} usuarioId={usuarioId} showConta={showConta} onItemUpdate={handleItemUpdate} />
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            filtered.map(item => (
              <ItemRow key={`${item.id}-${item.contaId}`} item={item} usuarioId={usuarioId} showConta={showConta} onItemUpdate={handleItemUpdate} />
            ))
          )}

          {loading && loadedCount < total && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              <span style={{ width: 12, height: 12, border: '2px solid #e2e8f0', borderTop: '2px solid #e67e22', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite', marginRight: 6 }} />
              Carregando mais {loadedCount}/{total}...
            </div>
          )}
        </div>
      )}

      {/* Estado vazio */}
      {!hasFetched && !loading && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>📈</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Busque oportunidades de preço</div>
          <div style={{ fontSize: 13, color: '#64748b', maxWidth: 420, margin: '0 auto 20px' }}>
            Selecione uma conta (ou busque em todas) e clique em "Buscar Oportunidades" para ver anúncios com potencial de ajuste de preço baseado em concorrentes.
          </div>
          <div style={{ padding: '10px 16px', background: '#fffbf5', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#92400e', maxWidth: 480, margin: '0 auto' }}>
            <strong>Importante:</strong> A partir de 18/03/2026, itens com Automação de Preços ativa não aceitam atualização manual de preço via API.
          </div>
        </div>
      )}
    </div>
  );
}
