import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ── Presets ──────────────────────────────────────────────────────────────────
const ML_PRESETS = [
  { label: 'Meu perfil', method: 'GET', path: '/users/me', params: {} },
  { label: 'Meus anúncios', method: 'GET', path: '/users/{user_id}/items/search', params: { status: 'active' } },
  { label: 'Detalhes de item', method: 'GET', path: '/items/{item_id}', params: {} },
  { label: 'Categorias MLB', method: 'GET', path: '/sites/MLB/categories', params: {} },
  { label: 'Atributos de categoria', method: 'GET', path: '/categories/{category_id}/attributes', params: {} },
  { label: 'Minhas perguntas', method: 'GET', path: '/questions/search', params: { seller_id: '{user_id}', sort_fields: 'date_created', sort_types: 'DESC' } },
  { label: 'Meus pedidos', method: 'GET', path: '/orders/search', params: { seller: '{user_id}', sort: 'date_desc' } },
  { label: 'Detalhes de pedido', method: 'GET', path: '/orders/{order_id}', params: {} },
  { label: 'Detalhes de envio', method: 'GET', path: '/shipments/{shipment_id}', params: {} },
  { label: 'Promoções do vendedor', method: 'GET', path: '/seller-promotions/users/{user_id}', params: { app_version: 'v2' } },
  { label: 'Reputação do vendedor', method: 'GET', path: '/users/{user_id}/seller_reputation', params: {} },
  { label: 'Notificações', method: 'GET', path: '/applications/{app_id}/notifications', params: {} },
  { label: 'Atualizar estoque/preço', method: 'PUT', path: '/items/{item_id}', params: {} },
  { label: 'Predição de categoria', method: 'GET', path: '/sites/MLB/domain_discovery/search', params: { q: '{titulo}' } },
];

const TINY_PRESETS = [
  { label: 'Pesquisar produtos', endpoint: 'produtos.pesquisa.php', params: { pesquisa: '' } },
  { label: 'Consultar produto', endpoint: 'produto.obter.php', params: { id: '' } },
  { label: 'Pesquisar pedidos', endpoint: 'pedidos.pesquisa.php', params: { situacao: '' } },
  { label: 'Consultar pedido', endpoint: 'pedido.obter.php', params: { id: '' } },
  { label: 'Pesquisar notas fiscais', endpoint: 'notas.pesquisa.php', params: { situacao: '' } },
  { label: 'Pesquisar contas a receber', endpoint: 'contas.receber.pesquisa.php', params: { situacao: '' } },
  { label: 'Consultar estoque', endpoint: 'produto.obter.estoque.php', params: { id: '' } },
  { label: 'Listar tags', endpoint: 'tags.pesquisa.php', params: { pesquisa: '' } },
  { label: 'Info da conta', endpoint: 'info.php', params: {} },
  { label: 'Pesquisar clientes', endpoint: 'contatos.pesquisa.php', params: { pesquisa: '' } },
];

// ── Componente ────────────────────────────────────────────────────────────────
export default function ClienteAPI({ usuarioId }) {
  const [api, setApi] = useState('ml'); // 'ml' | 'tiny'
  const [contasMl, setContasMl] = useState([]);
  const [contaId, setContaId] = useState('');

  // ML state
  const [mlMethod, setMlMethod] = useState('GET');
  const [mlPath, setMlPath] = useState('/users/me');
  const [mlQueryParams, setMlQueryParams] = useState([{ key: '', value: '' }]);
  const [mlBody, setMlBody] = useState('');

  // Tiny state
  const [tinyEndpoint, setTinyEndpoint] = useState('produtos.pesquisa.php');
  const [tinyParams, setTinyParams] = useState([{ key: 'pesquisa', value: '' }]);

  // Response state
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Histórico
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const contas = JSON.parse(localStorage.getItem('saas_contas_ml') || '[]');
    setContasMl(contas);
    if (contas.length > 0) setContaId(contas[0].id);
  }, []);

  // ── Aplicar preset ML ─────────────────────────────────────────────────────
  function applyMlPreset(preset) {
    setMlMethod(preset.method);
    setMlPath(preset.path);
    const entries = Object.entries(preset.params);
    setMlQueryParams(entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }]);
    setMlBody('');
  }

  // ── Aplicar preset Tiny ───────────────────────────────────────────────────
  function applyTinyPreset(preset) {
    setTinyEndpoint(preset.endpoint);
    const entries = Object.entries(preset.params);
    setTinyParams(entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }]);
  }

  // ── Enviar requisição ─────────────────────────────────────────────────────
  async function enviar() {
    setLoading(true);
    setError('');
    setResponse(null);

    try {
      let payload, url;

      if (api === 'ml') {
        if (!contaId) { setError('Selecione uma conta ML.'); setLoading(false); return; }
        const queryParams = {};
        mlQueryParams.forEach(({ key, value }) => { if (key.trim()) queryParams[key.trim()] = value; });
        let body = {};
        if (mlBody.trim()) {
          try { body = JSON.parse(mlBody); } catch { setError('Body JSON inválido.'); setLoading(false); return; }
        }
        payload = { userId: usuarioId, contaId, method: mlMethod, path: mlPath, queryParams, body };
        url = `${API_BASE}/api/cliente-api/ml`;
      } else {
        const params = {};
        tinyParams.forEach(({ key, value }) => { if (key.trim()) params[key.trim()] = value; });
        payload = { userId: usuarioId, endpoint: tinyEndpoint, params };
        url = `${API_BASE}/api/cliente-api/tiny`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.erro || 'Erro na requisição.'); setLoading(false); return; }

      setResponse(data);

      // Adicionar ao histórico (máx 20)
      const entry = {
        id: Date.now(),
        api,
        label: api === 'ml' ? `${mlMethod} ${mlPath}` : tinyEndpoint,
        status: data.status,
        elapsed: data.elapsed,
        payload,
        response: data,
      };
      setHistory(prev => [entry, ...prev].slice(0, 20));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Helpers de params ─────────────────────────────────────────────────────
  function updateParam(list, setList, idx, field, value) {
    const updated = [...list];
    updated[idx] = { ...updated[idx], [field]: value };
    setList(updated);
  }
  function addParam(list, setList) {
    setList([...list, { key: '', value: '' }]);
  }
  function removeParam(list, setList, idx) {
    setList(list.filter((_, i) => i !== idx));
  }

  // ── Formatação JSON ───────────────────────────────────────────────────────
  function formatJson(data) {
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  }

  function statusColor(code) {
    if (!code) return '#6b7280';
    if (code >= 200 && code < 300) return '#10b981';
    if (code >= 400 && code < 500) return '#f59e0b';
    return '#ef4444';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 100px)', fontFamily: 'inherit' }}>

      {/* ── Painel esquerdo: histórico ───────────────────────────────── */}
      <div style={{
        width: '220px', minWidth: '220px', background: '#fff', borderRadius: '8px',
        border: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e0e0e0', fontWeight: 600, fontSize: '0.85em', color: '#374151' }}>
          Histórico
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {history.length === 0 && (
            <div style={{ padding: '16px', fontSize: '0.8em', color: '#9ca3af', textAlign: 'center' }}>
              Nenhuma requisição ainda
            </div>
          )}
          {history.map(entry => (
            <button
              key={entry.id}
              onClick={() => setResponse(entry.response)}
              style={{
                width: '100%', border: 'none', borderBottom: '1px solid #f3f4f6',
                padding: '10px 14px', background: 'transparent', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '0.75em', color: '#6b7280', marginBottom: '2px' }}>
                {entry.api.toUpperCase()}
              </div>
              <div style={{ fontSize: '0.8em', color: '#111827', wordBreak: 'break-all', marginBottom: '4px' }}>
                {entry.label}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{
                  fontSize: '0.72em', fontWeight: 600, color: statusColor(entry.status),
                  background: `${statusColor(entry.status)}18`, padding: '1px 5px', borderRadius: '3px',
                }}>
                  {entry.status}
                </span>
                <span style={{ fontSize: '0.72em', color: '#9ca3af' }}>{entry.elapsed}ms</span>
              </div>
            </button>
          ))}
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setHistory([])}
            style={{ padding: '8px', border: 'none', background: '#f9fafb', cursor: 'pointer', fontSize: '0.78em', color: '#9ca3af', borderTop: '1px solid #e0e0e0' }}
          >
            Limpar histórico
          </button>
        )}
      </div>

      {/* ── Painel principal ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>

        {/* ── Seletor de API ── */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {['ml', 'tiny'].map(a => (
              <button
                key={a}
                onClick={() => { setApi(a); setResponse(null); setError(''); }}
                style={{
                  padding: '6px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.9em',
                  background: api === a ? (a === 'ml' ? '#ffe066' : '#d1fae5') : '#f3f4f6',
                  color: api === a ? '#1a1a1a' : '#6b7280',
                  transition: 'all 0.15s',
                }}
              >
                {a === 'ml' ? '🛒 Mercado Livre' : '📦 Tiny ERP'}
              </button>
            ))}
          </div>

          {/* ── Seletor de conta ML ── */}
          {api === 'ml' && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85em', color: '#6b7280', minWidth: '60px' }}>Conta ML:</span>
              {contasMl.length === 0 ? (
                <span style={{ fontSize: '0.85em', color: '#ef4444' }}>Nenhuma conta conectada. Configure em Configurações API.</span>
              ) : (
                <select
                  value={contaId}
                  onChange={e => setContaId(e.target.value)}
                  style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.85em', cursor: 'pointer' }}
                >
                  {contasMl.map(c => (
                    <option key={c.id} value={c.id}>{c.nickname}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* ── Presets ── */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '12px 18px' }}>
          <div style={{ fontSize: '0.8em', color: '#6b7280', marginBottom: '8px', fontWeight: 600 }}>Endpoints rápidos:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(api === 'ml' ? ML_PRESETS : TINY_PRESETS).map((p, i) => (
              <button
                key={i}
                onClick={() => api === 'ml' ? applyMlPreset(p) : applyTinyPreset(p)}
                style={{
                  padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: '4px',
                  fontSize: '0.78em', background: '#f9fafb', cursor: 'pointer', color: '#374151',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                onMouseLeave={e => e.currentTarget.style.background = '#f9fafb'}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Configuração da requisição ── */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '14px 18px' }}>

          {api === 'ml' ? (
            <>
              {/* Método + Path */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select
                  value={mlMethod}
                  onChange={e => setMlMethod(e.target.value)}
                  style={{
                    padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
                    fontSize: '0.9em', fontWeight: 700, cursor: 'pointer',
                    color: mlMethod === 'GET' ? '#10b981' : mlMethod === 'POST' ? '#3b82f6' : mlMethod === 'PUT' ? '#f59e0b' : '#ef4444',
                    minWidth: '90px',
                  }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  type="text"
                  value={mlPath}
                  onChange={e => setMlPath(e.target.value)}
                  placeholder="/users/me"
                  style={{
                    flex: 1, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                    fontSize: '0.9em', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={enviar}
                  disabled={loading}
                  style={{
                    padding: '7px 20px', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer',
                    background: loading ? '#9ca3af' : '#e67e22', color: '#fff', fontWeight: 600, fontSize: '0.9em',
                  }}
                >
                  {loading ? 'Enviando...' : 'Enviar'}
                </button>
              </div>

              {/* Query Params */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.8em', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>Query Params:</div>
                {mlQueryParams.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <input
                      type="text" value={p.key} placeholder="chave"
                      onChange={e => updateParam(mlQueryParams, setMlQueryParams, i, 'key', e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.82em', fontFamily: 'monospace' }}
                    />
                    <input
                      type="text" value={p.value} placeholder="valor"
                      onChange={e => updateParam(mlQueryParams, setMlQueryParams, i, 'value', e.target.value)}
                      style={{ flex: 2, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.82em', fontFamily: 'monospace' }}
                    />
                    <button onClick={() => removeParam(mlQueryParams, setMlQueryParams, i)}
                      style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#fff', cursor: 'pointer', color: '#ef4444', fontSize: '0.85em' }}>
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => addParam(mlQueryParams, setMlQueryParams)}
                  style={{ fontSize: '0.78em', color: '#e67e22', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                  + Adicionar parâmetro
                </button>
              </div>

              {/* Body (para POST/PUT) */}
              {(mlMethod === 'POST' || mlMethod === 'PUT') && (
                <div>
                  <div style={{ fontSize: '0.8em', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>Body (JSON):</div>
                  <textarea
                    value={mlBody}
                    onChange={e => setMlBody(e.target.value)}
                    placeholder={'{\n  "price": 100\n}'}
                    rows={5}
                    style={{
                      width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '6px',
                      fontSize: '0.82em', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Endpoint Tiny + Enviar */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={tinyEndpoint}
                  onChange={e => setTinyEndpoint(e.target.value)}
                  placeholder="produtos.pesquisa.php"
                  style={{
                    flex: 1, padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                    fontSize: '0.9em', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={enviar}
                  disabled={loading}
                  style={{
                    padding: '7px 20px', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer',
                    background: loading ? '#9ca3af' : '#10b981', color: '#fff', fontWeight: 600, fontSize: '0.9em',
                  }}
                >
                  {loading ? 'Enviando...' : 'Enviar'}
                </button>
              </div>

              {/* Params Tiny */}
              <div>
                <div style={{ fontSize: '0.8em', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>Parâmetros (token e formato são adicionados automaticamente):</div>
                {tinyParams.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <input
                      type="text" value={p.key} placeholder="chave"
                      onChange={e => updateParam(tinyParams, setTinyParams, i, 'key', e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.82em', fontFamily: 'monospace' }}
                    />
                    <input
                      type="text" value={p.value} placeholder="valor"
                      onChange={e => updateParam(tinyParams, setTinyParams, i, 'value', e.target.value)}
                      style={{ flex: 2, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.82em', fontFamily: 'monospace' }}
                    />
                    <button onClick={() => removeParam(tinyParams, setTinyParams, i)}
                      style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#fff', cursor: 'pointer', color: '#ef4444', fontSize: '0.85em' }}>
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => addParam(tinyParams, setTinyParams)}
                  style={{ fontSize: '0.78em', color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                  + Adicionar parâmetro
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Resposta ── */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', color: '#b91c1c', fontSize: '0.9em' }}>
            {error}
          </div>
        )}

        {response && (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Header da resposta */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{
                fontWeight: 700, fontSize: '0.9em', padding: '3px 10px', borderRadius: '4px',
                background: `${statusColor(response.status)}18`, color: statusColor(response.status),
              }}>
                {response.status} {response.statusText}
              </span>
              <span style={{ fontSize: '0.82em', color: '#9ca3af' }}>{response.elapsed}ms</span>
              {response.conta && <span style={{ fontSize: '0.82em', color: '#6b7280' }}>Conta: <b>{response.conta}</b></span>}
              {response.tokenRefreshed && (
                <span style={{ fontSize: '0.78em', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Token renovado automaticamente
                </span>
              )}
              {response.refreshError && (
                <span style={{ fontSize: '0.78em', background: '#fef2f2', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Refresh falhou: {response.refreshError} — Reconecte a conta em Configurações API
                </span>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(formatJson(response.data))}
                style={{ marginLeft: 'auto', padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: '4px', background: '#f9fafb', cursor: 'pointer', fontSize: '0.78em', color: '#374151' }}
              >
                Copiar JSON
              </button>
            </div>
            {/* Body da resposta */}
            <pre style={{
              margin: 0, padding: '14px 16px', overflowY: 'auto', flex: 1,
              fontSize: '0.8em', lineHeight: '1.6', fontFamily: 'monospace',
              color: '#1f2937', background: '#fafafa',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {formatJson(response.data)}
            </pre>
          </div>
        )}

        {!response && !error && !loading && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af', fontSize: '0.9em',
          }}>
            Configure e envie uma requisição para ver a resposta aqui.
          </div>
        )}
      </div>
    </div>
  );
}
