import React, { useState, useCallback } from 'react';
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
  with_benchmark_highest: { label: 'Muito Acima', color: '#e74c3c', bg: '#fdecea', desc: 'Preço acima do máximo dos concorrentes' },
  with_benchmark_high:    { label: 'Alto',        color: '#e67e22', bg: '#fef9f0', desc: 'Preço alto em relação ao sugerido' },
  no_benchmark_ok:        { label: 'Competitivo', color: '#27ae60', bg: '#edfaf1', desc: 'Preço alinhado ao mercado' },
  no_benchmark_lowest:    { label: 'Abaixo',      color: '#2980b9', bg: '#eaf4fb', desc: 'Preço abaixo do sugerido' },
  not_optin_applied:      { label: 'Promoção',    color: '#8e44ad', bg: '#f5eef8', desc: 'Promoção disponível, aguardando opt-in' },
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

function AutomacaoBadge({ automation }) {
  if (!automation) return <span style={{ color: '#95a5a6', fontSize: 11 }}>Sem automação</span>;
  const isActive = automation.status === 'ACTIVE';
  return (
    <span style={{ background: isActive ? '#edfaf1' : '#fef9f0', color: isActive ? '#27ae60' : '#e67e22', border: `1px solid ${isActive ? '#27ae6040' : '#e67e2240'}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {isActive ? 'ATIVA' : 'PAUSADA'}
    </span>
  );
}

// ── Formulário de automação ────────────────────────────────────────────────────
function FormAutomacao({ item, onSave, onCancel, loading }) {
  const existingAuto = item.automation;
  const [ruleId, setRuleId] = useState(existingAuto?.item_rule?.rule_id || 'INT_EXT');
  const [minMode, setMinMode] = useState('reais'); // 'reais' | 'pct'
  const [minReais, setMinReais] = useState(existingAuto?.min_price ? String(existingAuto.min_price) : '');
  const [minPct, setMinPct] = useState('');
  const [maxReais, setMaxReais] = useState(existingAuto?.max_price ? String(existingAuto.max_price) : '');

  // Preço final atual (considera promoção se ativa)
  const basePrice = (() => {
    const promo = item.promotionDetail;
    if (promo?.discount_percent && promo.discount_percent > 0) {
      return item.currentPrice * (1 - promo.discount_percent / 100);
    }
    return item.currentPrice;
  })();

  const minPriceCalculado = minMode === 'pct' && minPct
    ? Math.round(basePrice * (1 - Number(minPct) / 100) * 100) / 100
    : null;

  const minPriceFinal = minMode === 'reais' ? Number(minReais) : minPriceCalculado;

  const handleSubmit = () => {
    if (!minPriceFinal || minPriceFinal <= 0) return;
    onSave({
      rule_id: ruleId,
      min_price: minPriceFinal,
      max_price: maxReais ? Number(maxReais) : undefined,
      action: existingAuto ? 'update' : 'create',
    });
  };

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* Regra */}
        <div style={{ minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>REGRA</label>
          <select
            value={ruleId}
            onChange={e => setRuleId(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
          >
            <option value="INT_EXT">INT_EXT — Melhor preço (interno + externo)</option>
            <option value="INT">INT — Melhor preço (interno)</option>
          </select>
        </div>

        {/* Preço mínimo */}
        <div style={{ minWidth: 220 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
            PREÇO MÍNIMO
            {item.promotionDetail?.discount_percent > 0 && (
              <span style={{ color: '#8e44ad', marginLeft: 6 }}>
                (base: {fmtBRL(basePrice)} c/ promoção)
              </span>
            )}
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Toggle modo */}
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              {['reais', 'pct'].map(m => (
                <button
                  key={m}
                  onClick={() => setMinMode(m)}
                  style={{
                    padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: minMode === m ? '#e67e22' : '#fff',
                    color: minMode === m ? '#fff' : '#64748b',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'reais' ? 'R$' : '% abaixo'}
                </button>
              ))}
            </div>
            {minMode === 'reais' ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={minReais}
                onChange={e => setMinReais(e.target.value)}
                placeholder="0,00"
                style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="0.5"
                  value={minPct}
                  onChange={e => setMinPct(e.target.value)}
                  placeholder="ex: 10"
                  style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
                <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                {minPriceCalculado != null && (
                  <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 600 }}>
                    = {fmtBRL(minPriceCalculado)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Preço máximo (opcional) */}
        <div style={{ minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
            PREÇO MÁXIMO <span style={{ color: '#94a3b8', fontWeight: 400 }}>(opcional)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>R$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={maxReais}
              onChange={e => setMaxReais(e.target.value)}
              placeholder="Sem limite"
              style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          <button
            onClick={handleSubmit}
            disabled={loading || !minPriceFinal || minPriceFinal <= 0}
            style={{
              padding: '7px 16px', borderRadius: 7, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: '#e67e22', color: '#fff', fontWeight: 600, fontSize: 13,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Salvando...' : existingAuto ? 'Atualizar' : 'Ativar Automação'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #cbd5e1', cursor: 'pointer', background: '#fff', color: '#64748b', fontSize: 13 }}
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Resumo */}
      {minPriceFinal > 0 && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
          <strong style={{ color: '#2c3e50' }}>Resumo: </strong>
          Regra <strong>{ruleId}</strong> | Mín: <strong style={{ color: '#e67e22' }}>{fmtBRL(minPriceFinal)}</strong>
          {maxReais ? <> | Máx: <strong>{fmtBRL(Number(maxReais))}</strong></> : ''}
          {' '} — O ML ajustará o preço automaticamente dentro desses limites.
        </div>
      )}
    </div>
  );
}

// ── Linha da tabela ────────────────────────────────────────────────────────────
function ItemRow({ item, usuarioId, contaId, onItemUpdate }) {
  const { auth, impersonating } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const token = impersonating?.token || auth?.token;

  const handleSaveAutomacao = useCallback(async ({ rule_id, min_price, max_price, action }) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ml/automacao-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.id, contaId, userId: usuarioId, rule_id, min_price, max_price, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalhes?.message || data.erro || 'Erro ao salvar');
      setExpanded(false);
      onItemUpdate(item.id, {
        hasAutomation: true,
        automation: data,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }, [item.id, contaId, usuarioId, token, onItemUpdate]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Remover automação de preço do item ${item.id}?`)) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ml/automacao-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.id, contaId, userId: usuarioId, action: 'delete' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalhes?.message || data.erro || 'Erro ao remover');
      setExpanded(false);
      onItemUpdate(item.id, { hasAutomation: false, automation: null });
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }, [item.id, contaId, usuarioId, token, onItemUpdate]);

  const pctDiff = item.percentDifference;
  const hasSuggestion = item.suggestedPrice != null;

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 120px', gap: 8, padding: '12px 16px', alignItems: 'center', background: expanded ? '#fffbf5' : 'transparent' }}>
        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {item.thumbnail && (
            <img src={item.thumbnail} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
              {item.title}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.id}</div>
          </div>
        </div>

        {/* Preço atual */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{fmtBRL(item.currentPrice)}</div>
          {item.promotionDetail?.discount_percent > 0 && (
            <div style={{ fontSize: 11, color: '#8e44ad' }}>Promo {item.promotionDetail.discount_percent}% off</div>
          )}
        </div>

        {/* Preço sugerido */}
        <div style={{ textAlign: 'right' }}>
          {hasSuggestion ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#27ae60' }}>{fmtBRL(item.suggestedPrice)}</div>
              {item.lowestPrice != null && item.lowestPrice !== item.suggestedPrice && (
                <div style={{ fontSize: 11, color: '#64748b' }}>Mín: {fmtBRL(item.lowestPrice)}</div>
              )}
            </>
          ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
        </div>

        {/* % diferença */}
        <div style={{ textAlign: 'center' }}>
          {pctDiff != null ? (
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: pctDiff > 20 ? '#e74c3c' : pctDiff > 5 ? '#e67e22' : '#27ae60',
            }}>
              {pctDiff > 0 ? '+' : ''}{fmtPct(pctDiff)}
            </span>
          ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
        </div>

        {/* Status / Automação */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {item.status && <StatusBadge status={item.status} />}
          <AutomacaoBadge automation={item.automation} />
          {item.automation && (
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              Mín: {fmtBRL(item.automation.min_price)}
              {item.automation.max_price ? ` | Máx: ${fmtBRL(item.automation.max_price)}` : ''}
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              padding: '5px 10px', borderRadius: 6, border: `1px solid ${expanded ? '#e67e22' : '#cbd5e1'}`,
              background: expanded ? '#fef3e2' : '#fff', color: expanded ? '#e67e22' : '#64748b',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            {expanded ? 'Fechar' : item.hasAutomation ? 'Editar' : 'Configurar'}
          </button>
          {item.hasAutomation && !expanded && (
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              title="Remover automação"
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#e74c3c', cursor: 'pointer', fontSize: 12 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Formulário expandido */}
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#b91c1c', fontSize: 12, marginBottom: 8 }}>
              {error}
            </div>
          )}
          <FormAutomacao
            item={item}
            onSave={handleSaveAutomacao}
            onCancel={() => { setExpanded(false); setError(null); }}
            loading={actionLoading}
          />
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function ConcorrenciaPreco({ usuarioId }) {
  const { contas } = useContasML();
  const { auth, impersonating } = useAuth();

  const [contaId, setContaId] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);

  const LIMIT = 20;
  const token = impersonating?.token || auth?.token;

  const fetchData = useCallback(async (newOffset = 0) => {
    if (!contaId) return;
    setLoading(true);
    setError(null);
    if (newOffset === 0) { setItems([]); setHasFetched(false); }
    try {
      const res = await fetch(`/api/ml/concorrencia-preco?userId=${usuarioId}&contaId=${contaId}&offset=${newOffset}&limit=${LIMIT}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalhes?.message || data.erro || 'Erro ao buscar dados');
      setItems(newOffset === 0 ? data.items : prev => [...prev, ...data.items]);
      setTotal(data.total);
      setOffset(newOffset);
      setHasFetched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [contaId, usuarioId, token]);

  const handleItemUpdate = useCallback((itemId, updates) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
  }, []);

  const contaSelecionada = contas.find(c => c.id === contaId);
  const activeCount = items.filter(i => i.hasAutomation).length;
  const highPriorityCount = items.filter(i => i.status === 'with_benchmark_highest').length;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>
          Concorrência de Preço
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          Itens com oportunidade de ajuste de preço baseada em concorrentes. Ative a automação do ML para manter seus preços competitivos automaticamente.
        </p>
      </div>

      {/* Painel de controle */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>CONTA ML</label>
          <select
            value={contaId}
            onChange={e => { setContaId(e.target.value); setItems([]); setHasFetched(false); }}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, background: '#fff' }}
          >
            <option value="">Selecionar conta...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        </div>

        <button
          onClick={() => fetchData(0)}
          disabled={!contaId || loading}
          style={{
            padding: '9px 20px', borderRadius: 8, border: 'none', cursor: !contaId || loading ? 'not-allowed' : 'pointer',
            background: !contaId || loading ? '#94a3b8' : '#e67e22', color: '#fff', fontWeight: 600, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading ? (
            <>
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              Buscando...
            </>
          ) : 'Buscar Oportunidades'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Erro */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Stats cards */}
      {hasFetched && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total com oportunidade', value: total, color: '#2980b9', bg: '#eaf4fb' },
            { label: 'Muito acima do mercado', value: highPriorityCount, color: '#e74c3c', bg: '#fdecea' },
            { label: 'Com automação ativa', value: activeCount, color: '#27ae60', bg: '#edfaf1' },
            { label: 'Sem automação', value: items.length - activeCount, color: '#e67e22', bg: '#fef9f0' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabela */}
      {hasFetched && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          {/* Cabeçalho */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 120px', gap: 8, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {['Produto', 'Preço Atual', 'Preço Sugerido', 'Diferença', 'Status / Automação', 'Ações'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: h === 'Ações' ? 'right' : h === 'Diferença' ? 'center' : h !== 'Produto' ? 'right' : 'left' }}>
                {h}
              </div>
            ))}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              Nenhum item com oportunidade de preço encontrado para esta conta.
            </div>
          ) : (
            items.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                usuarioId={usuarioId}
                contaId={contaId}
                onItemUpdate={handleItemUpdate}
              />
            ))
          )}

          {/* Paginação */}
          {items.length < total && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => fetchData(offset + LIMIT)}
                disabled={loading}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e67e22', background: '#fff', color: '#e67e22', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Carregando...' : `Carregar mais (${items.length}/${total})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Estado vazio inicial */}
      {!hasFetched && !loading && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>Busque Oportunidades de Preço</div>
          <div style={{ fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 auto' }}>
            Selecione uma conta e clique em "Buscar Oportunidades" para ver seus itens com potencial de melhora de preço baseado nos concorrentes.
          </div>
          <div style={{ marginTop: 20, padding: '12px 16px', background: '#fffbf5', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, color: '#92400e', maxWidth: 500, margin: '20px auto 0' }}>
            <strong>Importante:</strong> A partir de 18/03/2026, itens com Automação de Preços ativa não aceitam atualização manual de preço via API.
          </div>
        </div>
      )}
    </div>
  );
}
