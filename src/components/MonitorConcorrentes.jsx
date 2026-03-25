import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API = '/api/concorrentes';

const subAbas = [
  '1. Anúncios Individuais',
  '2. Monitor de Lojas',
  '3. Oportunidades',
  '4. Analista',
];

// ── Estilos base ──────────────────────────────────────────────────────────────
const thS = {
  padding: '6px 10px', textAlign: 'left', fontWeight: 600, fontSize: '0.8em',
  color: '#555', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap',
};
const tdS = { padding: '6px 10px', fontSize: '0.8em', borderBottom: '1px solid #eee', color: '#333' };
const btn = (extra = {}) => ({
  padding: '5px 10px', fontSize: '0.8em', border: '1px solid #bbb', borderRadius: '3px',
  backgroundColor: '#f5f5f5', cursor: 'pointer', fontFamily: 'inherit', color: '#333', ...extra
});
const btnP = btn({ backgroundColor: '#2980b9', border: '1px solid #2171a0', color: '#fff', fontWeight: 600 });
const btnD = btn({ backgroundColor: '#e74c3c', border: '1px solid #c0392b', color: '#fff' });
const btnG = btn({ backgroundColor: '#27ae60', border: '1px solid #1e8449', color: '#fff', fontWeight: 600 });
const card = { border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' };
const cardH = { padding: '6px 10px', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc', fontSize: '0.85em', fontWeight: 600, color: '#333' };

function Msg({ msg, isError }) {
  if (!msg) return null;
  // Se isError foi passado explicitamente, usa ele; senão heurística: sucesso contém verbos de ação positiva
  const err = isError !== undefined ? isError : !(/criado|excluído|adicionad|removid|atualizad/i.test(msg) || /^atualizando/i.test(msg));
  return (
    <div style={{ padding: '6px 12px', background: err ? '#fdecea' : '#e8f5e9', border: `1px solid ${err ? '#f5c6cb' : '#c3e6cb'}`, borderRadius: '3px', fontSize: '0.82em', color: err ? '#c0392b' : '#1e8449', flexShrink: 0 }}>
      {msg}
    </div>
  );
}

// ── Modal de Busca de Concorrente ──────────────────────────────────────────────
function ModalBuscaConcorrente({ usuarioId, grupoId, onClose, onAdicionado }) {
  const [q, setQ] = useState('');
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(null);
  const [ldBusca, setLdBusca] = useState(false);
  const [ldAdd, setLdAdd] = useState(null);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  const buscar = async () => {
    if (!q.trim()) return;
    setLdBusca(true); setItens([]); setErro(''); setMsg('');
    try {
      // ✅ Voltamos a apontar para o SEU backend
      const r = await fetch(`/api/concorrentes/buscar-itens?q=${encodeURIComponent(q.trim())}&userId=${usuarioId}`);
      const d = await r.json();
      if (!r.ok) { setErro(d.erro || 'Erro ao buscar.'); return; }
      setItens(d.itens || []);
      setTotal(d.total);
    } catch { setErro('Erro de conexão.'); }
    finally { setLdBusca(false); }
  };

  const adicionar = async (item) => {
    setLdAdd(item.id); setErro(''); setMsg('');
    const r = await fetch('/api/concorrentes/itens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupoId, userId: usuarioId, url: item.permalink }),
    });
    const d = await r.json();
    setLdAdd(null);
    if (!r.ok) { setErro(d.erro || 'Erro ao adicionar.'); return; }
    setMsg(`"${item.titulo.slice(0, 50)}..." adicionado!`);
    onAdicionado(d);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '6px', width: '680px', maxWidth: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50', flex: 1 }}>Buscar Concorrente no Mercado Livre</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2em', cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>

        {/* Busca */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: '8px' }}>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Ex: chave de ignição universal 12v..."
            style={{ flex: 1, padding: '7px 10px', border: '1px solid #bbb', borderRadius: '3px', fontSize: '0.85em' }}
          />
          <button onClick={buscar} disabled={ldBusca || !q.trim()} style={{ ...btnP, opacity: ldBusca || !q.trim() ? 0.6 : 1 }}>
            {ldBusca ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {/* Feedback */}
        {(msg || erro) && (
          <div style={{ padding: '6px 16px', background: erro ? '#fdecea' : '#e8f5e9', borderBottom: '1px solid #eee', fontSize: '0.82em', color: erro ? '#c0392b' : '#1e8449' }}>
            {msg || erro}
          </div>
        )}

        {/* Resultados */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {itens.length === 0 && !ldBusca && (
            <div style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '0.85em' }}>
              {total === 0 ? 'Nenhum resultado encontrado.' : 'Digite algo para buscar anúncios.'}
            </div>
          )}
          {itens.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: '1px solid #f0f0f0', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              {item.thumbnail
                ? <img src={item.thumbnail} alt="" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '3px', flexShrink: 0, border: '1px solid #eee' }} />
                : <div style={{ width: '44px', height: '44px', background: '#f0f0f0', borderRadius: '3px', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={item.permalink} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.82em', color: '#2980b9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={e => e.stopPropagation()}>
                  {item.titulo}
                </a>
                <div style={{ fontSize: '0.76em', color: '#888', marginTop: '2px' }}>
                  {item.vendedor} · {item.vendas ?? 0} vendas · <strong style={{ color: '#1a7a1a' }}>R$ {item.preco?.toFixed(2)}</strong> · <span style={{ color: '#aaa', fontSize: '0.9em' }}>{item.id}</span>
                </div>
              </div>
              <button
                onClick={() => adicionar(item)}
                disabled={ldAdd === item.id}
                style={{ ...btnP, fontSize: '0.76em', padding: '4px 10px', whiteSpace: 'nowrap', opacity: ldAdd === item.id ? 0.6 : 1 }}>
                {ldAdd === item.id ? '...' : '+ Adicionar'}
              </button>
            </div>
          ))}
        </div>

        {total != null && itens.length > 0 && (
          <div style={{ padding: '6px 16px', borderTop: '1px solid #eee', fontSize: '0.75em', color: '#aaa', textAlign: 'right' }}>
            Mostrando {itens.length} de {total.toLocaleString('pt-BR')} resultados
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal de Grupo ─────────────────────────────────────────────────────────────
function ModalGrupo({ grupo, onClose, onSave }) {
  const [nome, setNome] = useState(grupo?.nome || '');
  const [skusText, setSkusText] = useState(grupo?.skus?.join(', ') || '');
  const [precoMinimo, setPrecoMinimo] = useState(grupo?.precoMinimo != null ? String(grupo.precoMinimo) : '');
  const [autoIgualar, setAutoIgualar] = useState(grupo?.autoIgualar ?? false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const handleSave = async () => {
    if (!nome.trim()) { setErro('Informe um nome para o grupo.'); return; }
    const pm = precoMinimo.trim() ? parseFloat(precoMinimo.replace(',', '.')) : null;
    if (precoMinimo.trim() && (isNaN(pm) || pm < 0)) { setErro('Preço mínimo inválido.'); return; }
    if (autoIgualar && pm == null) { setErro('Defina um preço mínimo antes de ativar o auto-igualar.'); return; }
    setLoading(true); setErro('');
    await onSave({ nome: nome.trim(), skus: skusText.split(',').map(s => s.trim()).filter(Boolean), precoMinimo: pm, autoIgualar });
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '6px', padding: '20px', width: '420px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: '1em', marginBottom: '14px', color: '#2c3e50' }}>
          {grupo ? 'Editar Grupo' : 'Novo Grupo de Monitoramento'}
        </div>
        <label style={{ fontSize: '0.82em', color: '#555', display: 'block', marginBottom: '4px' }}>Nome do Grupo *</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: GUINCHO AÇO"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '0.85em', boxSizing: 'border-box', marginBottom: '12px' }} />
        <label style={{ fontSize: '0.82em', color: '#555', display: 'block', marginBottom: '4px' }}>SKUs Vinculados (separados por vírgula)</label>
        <textarea value={skusText} onChange={e => setSkusText(e.target.value)} placeholder="Ex: 15692, 18769, 21500" rows={3}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '0.85em', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '12px' }} />
        <label style={{ fontSize: '0.82em', color: '#555', display: 'block', marginBottom: '4px' }}>
          Preço Mínimo (R$) <span style={{ color: '#999', fontWeight: 400 }}>— opcional, usado no auto-igualamento</span>
        </label>
        <input
          type="number" min="0" step="0.01"
          value={precoMinimo}
          onChange={e => setPrecoMinimo(e.target.value)}
          placeholder="Ex: 45.00"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '0.85em', boxSizing: 'border-box', marginBottom: '14px' }}
        />

        {/* Toggle Auto-Igualar */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: autoIgualar ? '#e8f5e9' : '#f8f9fa', border: `1px solid ${autoIgualar ? '#c3e6cb' : '#dee2e6'}`, borderRadius: '4px' }}>
          <div style={{ position: 'relative', width: '40px', height: '22px', flexShrink: 0, marginTop: '1px' }}>
            <input
              type="checkbox"
              checked={autoIgualar}
              onChange={e => setAutoIgualar(e.target.checked)}
              style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 1, margin: 0 }}
            />
            <div style={{ width: '40px', height: '22px', borderRadius: '11px', background: autoIgualar ? '#27ae60' : '#ccc', transition: 'background 0.2s', display: 'flex', alignItems: 'center', padding: '2px' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'transform 0.2s', transform: autoIgualar ? 'translateX(18px)' : 'translateX(0)' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85em', fontWeight: 600, color: autoIgualar ? '#1e8449' : '#555' }}>
              Auto-Igualar ao Mais Barato {autoIgualar ? '— ATIVO' : '— inativo'}
            </div>
            <div style={{ fontSize: '0.75em', color: '#777', marginTop: '2px' }}>
              Ao atualizar concorrentes, iguala automaticamente seus preços (por tipo) ao mais barato - R$1,00, respeitando o preço mínimo.
            </div>
          </div>
        </div>

        {erro && <div style={{ color: '#c0392b', fontSize: '0.8em', marginTop: '8px' }}>{erro}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onClose} style={btn()}>Cancelar</button>
          <button onClick={handleSave} disabled={loading} style={btnP}>{loading ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Nível de reputação ─────────────────────────────────────────────────────────
function NivelBadge({ nivel }) {
  const map = {
    platinum: { label: 'Platinum', bg: '#e8f0fe', color: '#1a73e8' },
    gold: { label: 'Gold', bg: '#fff8e1', color: '#f9a825' },
    silver: { label: 'Silver', bg: '#f5f5f5', color: '#757575' },
    bronze: { label: 'Bronze', bg: '#fbe9e7', color: '#bf360c' },
    green: { label: 'Green', bg: '#e8f5e9', color: '#2e7d32' },
  };
  const s = map[nivel?.toLowerCase()] || { label: nivel || 'N/D', bg: '#f5f5f5', color: '#999' };
  return <span style={{ background: s.bg, color: s.color, padding: '2px 7px', borderRadius: '3px', fontSize: '0.78em', fontWeight: 700 }}>{s.label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 1 — Anúncios Individuais
// ─────────────────────────────────────────────────────────────────────────────
function AbaAnunciosIndividuais({ usuarioId }) {
  const { canUseResource } = useAuth();
  const [grupos, setGrupos] = useState([]);
  const [grupoSel, setGrupoSel] = useState(null);
  const [meusAnuncios, setMeusAnuncios] = useState([]);
  const [concorrentes, setConcorrentes] = useState([]);
  const [concSel, setConcSel] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [modalGrupo, setModalGrupo] = useState(null);
  const [modalBusca, setModalBusca] = useState(false);
  const [ld, setLd] = useState({});
  const [msg, setMsg] = useState('');

  const setL = (k, v) => setLd(p => ({ ...p, [k]: v }));
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const carregarGrupos = useCallback(async () => {
    if (!usuarioId) return;
    setL('grupos', true);
    try {
      const r = await fetch(`${API}/grupos?userId=${usuarioId}`);
      const data = await r.json();
      setGrupos(Array.isArray(data) ? data : []);
    } catch { } finally { setL('grupos', false); }
  }, [usuarioId]);

  useEffect(() => { carregarGrupos(); }, [carregarGrupos]);

  useEffect(() => {
    if (!grupoSel) { setMeusAnuncios([]); setConcorrentes([]); return; }
    const load = async () => {
      setL('painel', true);
      const [r1, r2] = await Promise.allSettled([
        fetch(`${API}/meus-anuncios?grupoId=${grupoSel.id}&userId=${usuarioId}`).then(r => r.json()),
        fetch(`${API}/itens?grupoId=${grupoSel.id}&userId=${usuarioId}`).then(r => r.json()),
      ]);
      setMeusAnuncios(r1.status === 'fulfilled' && Array.isArray(r1.value) ? r1.value : []);
      setConcorrentes(r2.status === 'fulfilled' && Array.isArray(r2.value) ? r2.value : []);
      setL('painel', false);
    };
    load();
  }, [grupoSel, usuarioId]);

  const salvarGrupo = async ({ nome, skus, precoMinimo, autoIgualar }) => {
    const isEdit = modalGrupo !== 'novo';
    const r = await fetch(isEdit ? `${API}/grupos/${modalGrupo.id}` : `${API}/grupos`, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: usuarioId, nome, skus, precoMinimo, autoIgualar })
    });
    const d = await r.json();
    if (!r.ok) { flash(d.erro || 'Erro ao salvar.'); return; }
    setModalGrupo(null);
    if (isEdit && grupoSel?.id === modalGrupo.id) setGrupoSel(d);
    await carregarGrupos();
    flash(isEdit ? 'Grupo atualizado.' : 'Grupo criado!');
  };

  const excluirGrupo = async () => {
    if (!grupoSel) return flash('Selecione um grupo.');
    if (!confirm(`Excluir o grupo "${grupoSel.nome}" e todos os concorrentes?`)) return;
    const r = await fetch(`${API}/grupos/${grupoSel.id}?userId=${usuarioId}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); return flash(d.erro || 'Erro ao excluir.'); }
    setGrupoSel(null); await carregarGrupos(); flash('Grupo excluído.');
  };

  const adicionarConcorrente = async () => {
    if (!grupoSel) return flash('Selecione um grupo primeiro.');
    if (!urlInput.trim()) return flash('Informe a URL do anúncio.');
    setL('add', true); setMsg('');
    const r = await fetch(`${API}/itens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupoId: grupoSel.id, userId: usuarioId, url: urlInput.trim() })
    });
    const d = await r.json();
    setL('add', false);
    if (!r.ok) return flash(d.erro || 'Erro ao adicionar.');
    setUrlInput('');
    setConcorrentes(p => [...p, d].sort((a, b) => a.preco - b.preco));
    flash('Concorrente adicionado!');
  };

  const removerConcorrente = async () => {
    if (!concSel || !grupoSel) return flash('Selecione um concorrente para remover.');
    if (!confirm('Remover este concorrente do monitoramento?')) return;
    const r = await fetch(`${API}/itens?itemId=${concSel.id}&grupoId=${grupoSel.id}&userId=${usuarioId}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); return flash(d.erro || 'Erro.'); }
    setConcorrentes(p => p.filter(c => c.id !== concSel.id));
    setConcSel(null); flash('Concorrente removido.');
  };

  const atualizar = async () => {
    if (!grupoSel) return flash('Selecione um grupo.');
    setL('upd', true); setMsg('Atualizando...');
    const r = await fetch(`${API}/atualizar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupoId: grupoSel.id, userId: usuarioId })
    });
    const d = await r.json();
    setL('upd', false);
    if (!r.ok) return flash(d.erro || 'Erro ao atualizar.');
    const r2 = await fetch(`${API}/itens?grupoId=${grupoSel.id}&userId=${usuarioId}`);
    setConcorrentes(await r2.json());
    const msgs = [`${d.atualizados} concorrente(s) atualizados`];
    if (d.autoIgualados > 0) msgs.push(`${d.autoIgualados} preço(s) auto-igualados`);
    flash(msgs.join(' — ') + '.');
  };

  // ── helpers de tipo de anúncio ──────────────────────────────────────────────
  const tipoLabel = (id) => {
    if (!id) return null;
    if (id === 'gold_premium' || id === 'gold_pro') return { label: 'Premium', bg: '#fff3cd', color: '#856404' };
    if (id === 'gold_special' || id === 'gold') return { label: 'Clássico', bg: '#e2e3e5', color: '#383d41' };
    return { label: id, bg: '#e2e3e5', color: '#383d41' };
  };

  // Comparativo por tipo de anúncio
  // Tipos baseados apenas nos MEUS anúncios (os concorrentes podem não ter tipo cadastrado ainda)
  const tiposAtivos = [...new Set(
    meusAnuncios.filter(a => a.status === 'active' && a.listingTypeId).map(a => a.listingTypeId)
  )];
  const comparativosPorTipo = tiposAtivos.map(tipo => {
    const meusDoTipo = meusAnuncios.filter(a => a.status === 'active' && a.listingTypeId === tipo);
    // Inclui concorrentes do mesmo tipo OU sem tipo definido (adicionados antes da funcionalidade)
    const concDoTipo = concorrentes.filter(c => !c.listingTypeId || c.listingTypeId === tipo);
    const meuMin = meusDoTipo.reduce((m, a) => Math.min(m, a.preco), Infinity);
    const concMin = concDoTipo.reduce((m, c) => Math.min(m, c.preco), Infinity);
    const meuMinOk = isFinite(meuMin) ? meuMin : null;
    const concMinOk = isFinite(concMin) ? concMin : null;
    const diff = meuMinOk != null && concMinOk != null ? meuMinOk - concMinOk : null;
    return { tipo, meuMinOk, concMinOk, diff };
  });
  // Fallback sem tipo (para concorrentes sem listingTypeId)
  const meuMin = meusAnuncios.filter(a => a.status === 'active').reduce((m, a) => Math.min(m, a.preco), Infinity);
  const concMin = concorrentes.reduce((m, c) => Math.min(m, c.preco), Infinity);
  const meuMinOk = isFinite(meuMin) ? meuMin : null;
  const concMinOk = isFinite(concMin) ? concMin : null;
  const diff = meuMinOk != null && concMinOk != null ? (meuMinOk - concMinOk) : null;

  const igualarPreco = async (listingTypeId = null) => {
    if (!grupoSel) return flash('Selecione um grupo.');
    const semPrecoMinimo = grupoSel.precoMinimo == null;
    if (semPrecoMinimo) {
      if (!confirm('Atenção: você não definiu um preço mínimo para este grupo.\nSe o concorrente cobrar um valor muito baixo, seu preço poderá ser reduzido sem limite.\n\nDeseja continuar mesmo assim?')) return;
    }
    setL('igualar', true); setMsg('Igualando preço...');
    try {
      const r = await fetch(`${API}/igualar-preco`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupoId: grupoSel.id, userId: usuarioId, listingTypeId }),
      });
      const d = await r.json();
      if (!r.ok) return flash(d.erro || 'Erro ao igualar preço.');
      const msgs = [`${d.atualizados} anúncio(s) atualizado(s) para R$ ${d.precoAlvo?.toFixed(2)}`];
      if (d.semPrecoMinimo) msgs.push('⚠ Sem preço mínimo definido.');
      flash(msgs.join(' — '));
      // Atualiza meus anúncios localmente
      setMeusAnuncios(p => p.map(a => {
        const res = d.resultados?.find(r => r.id === a.id);
        return res?.ok ? { ...a, preco: d.precoAlvo } : a;
      }));
    } catch { flash('Erro de conexão.'); }
    finally { setL('igualar', false); }
  };

  return (
    <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: 0 }}>
      {/* Grupos */}
      <div style={{ ...card, width: '260px', minWidth: '200px', display: 'flex', flexDirection: 'column' }}>
        <div style={cardH}>Grupos de Produtos</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {ld.grupos ? <div style={{ padding: '16px', textAlign: 'center', color: '#aaa', fontSize: '0.82em' }}>Carregando...</div>
            : grupos.length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: '#aaa', fontSize: '0.82em' }}>Nenhum grupo criado.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={thS}>Nome</th><th style={{ ...thS, textAlign: 'center' }}>Conc.</th></tr></thead>
                <tbody>
                  {grupos.map(g => (
                    <tr key={g.id} onClick={() => setGrupoSel(g)} style={{ cursor: 'pointer', backgroundColor: grupoSel?.id === g.id ? '#cce5ff' : 'transparent' }}>
                      <td style={tdS}>
                        {g.nome}
                        {g.autoIgualar && <span title="Auto-igualar ativo" style={{ marginLeft: '5px', fontSize: '0.7em', background: '#d4edda', color: '#155724', padding: '1px 4px', borderRadius: '2px', fontWeight: 600 }}>AUTO</span>}
                      </td>
                      <td style={{ ...tdS, textAlign: 'center', color: '#555' }}>{g._count?.concorrentes ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid #ddd', display: 'flex', gap: '5px', flexShrink: 0 }}>
          {canUseResource('monitor.criarGrupo') && <button onClick={() => setModalGrupo('novo')} style={btn({ flex: 1, fontSize: '0.75em', padding: '5px 4px' })}>Novo</button>}
          <button onClick={() => grupoSel ? setModalGrupo(grupoSel) : flash('Selecione um grupo.')} style={btn({ flex: 1, fontSize: '0.75em', padding: '5px 4px' })}>Editar</button>
          {canUseResource('monitor.excluirGrupo') && <button onClick={excluirGrupo} style={{ ...btnD, flex: 1, fontSize: '0.75em', padding: '5px 4px' }}>Excluir</button>}
        </div>
      </div>

      {/* Painel Direito */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <Msg msg={msg} />

        {/* Meus Anúncios */}
        <div style={card}>
          <div style={cardH}>Meus Anúncios — <span style={{ color: '#2980b9' }}>{grupoSel?.nome || 'Selecione um grupo'}</span></div>
          <div style={{ maxHeight: '110px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Conta', 'SKU', 'Título', 'Tipo', 'Preço', 'Status'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
              <tbody>
                {!grupoSel ? <tr><td colSpan={6} style={{ ...tdS, color: '#aaa', textAlign: 'center', padding: '16px' }}>Selecione um grupo.</td></tr>
                  : ld.painel ? <tr><td colSpan={6} style={{ ...tdS, textAlign: 'center', padding: '14px', color: '#aaa' }}>Carregando...</td></tr>
                  : meusAnuncios.length === 0 ? <tr><td colSpan={6} style={{ ...tdS, color: '#aaa', textAlign: 'center', padding: '14px' }}>Nenhum anúncio ativo com esses SKUs.</td></tr>
                  : meusAnuncios.map(a => {
                    const t = tipoLabel(a.listingTypeId);
                    return (
                      <tr key={a.id}>
                        <td style={tdS}>{a.conta}</td>
                        <td style={tdS}>{a.sku || '—'}</td>
                        <td style={{ ...tdS, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo}</td>
                        <td style={tdS}>{t ? <span style={{ background: t.bg, color: t.color, padding: '2px 6px', borderRadius: '3px', fontSize: '0.75em', fontWeight: 600 }}>{t.label}</span> : '—'}</td>
                        <td style={{ ...tdS, color: '#1a7a1a', fontWeight: 700 }}>R$ {a.preco?.toFixed(2)}</td>
                        <td style={tdS}><span style={{ background: a.status === 'active' ? '#d4edda' : '#f8d7da', color: a.status === 'active' ? '#155724' : '#721c24', padding: '2px 6px', borderRadius: '3px', fontSize: '0.78em' }}>{a.status}</span></td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Adicionar */}
        <div style={card}>
          <div style={cardH}>Adicionar Concorrente</div>
          <div style={{ padding: '8px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82em', color: '#555', whiteSpace: 'nowrap' }}>URL do Anúncio:</span>
            <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarConcorrente()}
              placeholder="https://www.mercadolivre.com.br/... ou MLB123456789"
              disabled={!grupoSel || ld.add}
              style={{ flex: 1, padding: '4px 8px', border: '1px solid #bbb', borderRadius: '3px', fontSize: '0.82em', backgroundColor: !grupoSel ? '#f9f9f9' : '#fff' }} />
            <button onClick={adicionarConcorrente} disabled={!grupoSel || ld.add}
              style={{ ...btnP, whiteSpace: 'nowrap', opacity: (!grupoSel || ld.add) ? 0.6 : 1 }}>
              {ld.add ? 'Buscando...' : 'Adicionar'}
            </button>
            <button onClick={() => grupoSel ? setModalBusca(true) : flash('Selecione um grupo primeiro.')}
              disabled={!grupoSel}
              style={{ ...btn({ backgroundColor: '#8e44ad', border: '1px solid #7d3c98', color: '#fff', fontWeight: 600 }), whiteSpace: 'nowrap', opacity: !grupoSel ? 0.5 : 1 }}>
              🔍 Pesquisar
            </button>
          </div>
        </div>

        {modalBusca && grupoSel && (
          <ModalBuscaConcorrente
            usuarioId={usuarioId}
            grupoId={grupoSel.id}
            onClose={() => setModalBusca(false)}
            onAdicionado={(novoItem) => {
              setConcorrentes(p => [...p, novoItem].sort((a, b) => a.preco - b.preco));
              flash('Concorrente adicionado!');
            }}
          />
        )}

        {/* Lista de concorrentes */}
        <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={cardH}>
            Concorrentes Monitorados {grupoSel ? `— ${grupoSel.nome}` : ''}
            {concorrentes.length > 0 && <span style={{ fontWeight: 400, color: '#777', marginLeft: '6px' }}>({concorrentes.length})</span>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...thS, width: '28px', padding: '6px 6px' }}></th>
                {['Título', 'Tipo', 'Vendedor', 'Preço', 'Estoque', 'Vendas', 'Atualizado'].map(c => <th key={c} style={thS}>{c}</th>)}
              </tr></thead>
              <tbody>
                {!grupoSel ? <tr><td colSpan={8} style={{ ...tdS, color: '#aaa', textAlign: 'center', padding: '30px' }}>Selecione um grupo para ver os concorrentes.</td></tr>
                  : ld.painel ? <tr><td colSpan={8} style={{ ...tdS, textAlign: 'center', padding: '30px', color: '#aaa' }}>Carregando...</td></tr>
                  : concorrentes.length === 0 ? <tr><td colSpan={8} style={{ ...tdS, color: '#aaa', textAlign: 'center', padding: '30px' }}>Nenhum concorrente. Adicione pelo campo acima.</td></tr>
                  : concorrentes.map(c => {
                    const isSel = concSel?.id === c.id;
                    // Mais barato por tipo: só marca se não há anúncio meu do mesmo tipo mais barato
                    const tipoConc = c.listingTypeId;
                    // Agrupa com concorrentes do mesmo tipo OU sem tipo (quando o concorrente não tem tipo)
                    const concDoTipo = concorrentes.filter(x => !tipoConc ? !x.listingTypeId : (!x.listingTypeId || x.listingTypeId === tipoConc));
                    const minDoTipo = Math.min(...concDoTipo.map(x => x.preco));
                    const meusDoTipo = meusAnuncios.filter(a => a.status === 'active' && (!tipoConc || a.listingTypeId === tipoConc));
                    const meuMinDoTipo = meusDoTipo.reduce((m, a) => Math.min(m, a.preco), Infinity);
                    const isCheapestConc = c.preco === minDoTipo;
                    const euJaSouMaisBarato = isFinite(meuMinDoTipo) && meuMinDoTipo <= minDoTipo;
                    const alertaCaro = isCheapestConc && !euJaSouMaisBarato;
                    const t = tipoLabel(c.listingTypeId);
                    return (
                      <tr key={c.id} onClick={() => setConcSel(isSel ? null : c)} style={{ cursor: 'pointer', backgroundColor: isSel ? '#cce5ff' : 'transparent' }}>
                        <td style={{ ...tdS, padding: '4px 6px', textAlign: 'center' }}>
                          {c.thumbnail && <img src={c.thumbnail} alt="" style={{ width: '26px', height: '26px', objectFit: 'contain', borderRadius: '2px' }} />}
                        </td>
                        <td style={{ ...tdS, maxWidth: '200px' }}>
                          <a href={c.permalink} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#2980b9', textDecoration: 'none', fontSize: '0.8em' }}
                            onClick={e => e.stopPropagation()}>{c.titulo}</a>
                        </td>
                        <td style={tdS}>{t ? <span style={{ background: t.bg, color: t.color, padding: '2px 5px', borderRadius: '3px', fontSize: '0.75em', fontWeight: 600 }}>{t.label}</span> : <span style={{ color: '#bbb', fontSize: '0.75em' }}>—</span>}</td>
                        <td style={{ ...tdS, color: '#555' }}>{c.sellerNickname || c.sellerId || '—'}</td>
                        <td style={{ ...tdS, fontWeight: 700, color: alertaCaro ? '#c0392b' : isCheapestConc ? '#1e8449' : '#555' }}>
                          R$ {c.preco?.toFixed(2)}
                          {isCheapestConc && !euJaSouMaisBarato && <span title="Mais barato do tipo — você está mais caro" style={{ marginLeft: '4px', fontSize: '0.72em', background: '#fdecea', color: '#c0392b', padding: '1px 4px', borderRadius: '2px' }}>↑ você+caro</span>}
                          {isCheapestConc && euJaSouMaisBarato && <span title="Mais barato dos concorrentes — mas você já é mais barato" style={{ marginLeft: '4px', fontSize: '0.72em', background: '#d4edda', color: '#155724', padding: '1px 4px', borderRadius: '2px' }}>✓ ok</span>}
                        </td>
                        <td style={{ ...tdS, color: '#555' }}>{c.estoqueFormatado || c.estoqueRange || '?'}</td>
                        <td style={{ ...tdS, color: '#555' }}>{c.vendas ?? '—'}</td>
                        <td style={{ ...tdS, color: '#888', fontSize: '0.76em' }}>
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ações + Comparativo */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button onClick={atualizar} disabled={!grupoSel || ld.upd} style={{ ...btn(), opacity: (!grupoSel || ld.upd) ? 0.6 : 1 }}>
              ⟳ {ld.upd ? 'Atualizando...' : 'Atualizar Concorrentes'}
            </button>
            <button onClick={removerConcorrente} disabled={!concSel} style={{ ...btnD, opacity: !concSel ? 0.5 : 1 }}>Remover Selecionado</button>
            <button
              onClick={async () => {
                if (!grupoSel) return flash('Selecione um grupo.');
                if (!confirm('Varrer e remover todos os concorrentes que são seus próprios anúncios?')) return;
                setL('limpar', true);
                const r = await fetch(`${API}/limpar-proprios`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ grupoId: grupoSel.id, userId: usuarioId }),
                });
                const d = await r.json();
                setL('limpar', false);
                if (!r.ok) return flash(d.erro || 'Erro.');
                if (d.removidos > 0) {
                  const r2 = await fetch(`${API}/itens?grupoId=${grupoSel.id}&userId=${usuarioId}`);
                  setConcorrentes(await r2.json());
                  await carregarGrupos();
                }
                flash(d.removidos > 0 ? `${d.removidos} próprio(s) anúncio(s) removido(s).` : 'Nenhum próprio anúncio encontrado.');
              }}
              disabled={!grupoSel || ld.limpar}
              title="[Temporário] Remove da lista de concorrentes qualquer anúncio que pertença à sua conta"
              style={{ ...btn({ backgroundColor: '#7f8c8d', border: '1px solid #6c7a7d', color: '#fff', fontSize: '0.75em' }), opacity: (!grupoSel || ld.limpar) ? 0.6 : 1 }}>
              {ld.limpar ? 'Varrendo...' : '🧹 Limpar Próprios'}
            </button>
            <div style={{ flex: 1 }} />
            {grupoSel?.autoIgualar && (
              <span style={{ fontSize: '0.75em', color: '#155724', background: '#d4edda', padding: '3px 8px', borderRadius: '3px', border: '1px solid #c3e6cb' }}>
                ⚡ Auto-igualar ativo — executa ao atualizar concorrentes
              </span>
            )}
            {grupoSel && !grupoSel.autoIgualar && grupoSel?.precoMinimo == null && (
              <span style={{ fontSize: '0.75em', color: '#856404', background: '#fff3cd', padding: '3px 8px', borderRadius: '3px', border: '1px solid #ffc107' }}>
                ⚠ Sem preço mínimo — clique em Editar para definir
              </span>
            )}
            {/* Botões de igualar por tipo */}
            {tiposAtivos.length > 0 ? tiposAtivos.map(tipo => {
              const comp = comparativosPorTipo.find(c => c.tipo === tipo);
              const euJaSouMaisBarato = comp?.diff != null && comp.diff <= 0;
              const t = tipoLabel(tipo);
              return (
                <button
                  key={tipo}
                  onClick={() => igualarPreco(tipo)}
                  disabled={!grupoSel || ld.igualar || euJaSouMaisBarato}
                  title={euJaSouMaisBarato ? 'Você já é o mais barato neste tipo' : `Igualar anúncios ${t?.label} ao mais barato (R$-1,00)`}
                  style={{ ...btnG, opacity: (!grupoSel || ld.igualar || euJaSouMaisBarato) ? 0.5 : 1, fontSize: '0.78em' }}>
                  {ld.igualar ? '...' : `Igualar ${t?.label || tipo} (R$-1,00)`}
                </button>
              );
            }) : (
              <button onClick={() => igualarPreco(null)} disabled={!meuMinOk || !concMinOk || ld.igualar}
                style={{ ...btnG, opacity: (!meuMinOk || !concMinOk || ld.igualar) ? 0.5 : 1 }}>
                {ld.igualar ? 'Igualando...' : 'Igualar ao Mais Barato (R$-1,00)'}
              </button>
            )}
          </div>

          {/* Comparativo por tipo */}
          <div style={{ ...card, padding: '10px 14px' }}>
            <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', marginBottom: '8px' }}>Comparativo Rápido</div>
            {comparativosPorTipo.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {comparativosPorTipo.map(({ tipo, meuMinOk: meuT, concMinOk: concT, diff: diffT }) => {
                  const t = tipoLabel(tipo);
                  const euJaMaisBarato = diffT != null && diffT <= 0;
                  return (
                    <div key={tipo} style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', padding: '6px 8px', background: euJaMaisBarato ? '#f0faf0' : '#fef9f0', borderRadius: '3px', border: `1px solid ${euJaMaisBarato ? '#c3e6cb' : '#ffc107'}` }}>
                      {t && <span style={{ background: t.bg, color: t.color, padding: '2px 7px', borderRadius: '3px', fontSize: '0.75em', fontWeight: 700, flexShrink: 0 }}>{t.label}</span>}
                      <div><div style={{ fontSize: '0.7em', color: '#777' }}>Meu mais barato</div><div style={{ fontWeight: 700, fontSize: '0.88em' }}>{meuT != null ? `R$ ${meuT.toFixed(2)}` : 'N/A'}</div></div>
                      <div><div style={{ fontSize: '0.7em', color: '#777' }}>Concorrente mais barato</div><div style={{ fontWeight: 700, fontSize: '0.88em' }}>{concT != null ? `R$ ${concT.toFixed(2)}` : 'N/A'}</div></div>
                      <div>
                        <div style={{ fontSize: '0.7em', color: '#777' }}>Diferença</div>
                        <div style={{ fontWeight: 700, color: diffT != null ? (diffT > 0 ? '#c0392b' : '#1e8449') : '#aaa', fontSize: '0.88em' }}>
                          {diffT != null ? `${diffT > 0 ? '▲ você+caro' : '▼ você+barato'} (R$ ${Math.abs(diffT).toFixed(2)})` : 'N/A'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Meu Ativo Mais Barato', valor: meuMinOk != null ? `R$ ${meuMinOk.toFixed(2)}` : 'N/A' },
                  { label: 'Concorrente Mais Barato', valor: concMinOk != null ? `R$ ${concMinOk.toFixed(2)}` : 'N/A' },
                  { label: 'Diferença', valor: diff != null ? `R$ ${Math.abs(diff).toFixed(2)}` : 'N/A', cor: diff != null ? (diff > 0 ? '#c0392b' : '#1e8449') : undefined, sub: diff != null ? (diff > 0 ? '▲ Você está mais caro' : '▼ Você está mais barato') : '' },
                ].map(({ label, valor, cor, sub }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.72em', color: '#777' }}>{label}</div>
                    <div style={{ fontWeight: 700, color: cor || '#2c3e50', fontSize: '0.95em' }}>{sub ? `${sub} (${valor})` : valor}</div>
                  </div>
                ))}
              </div>
            )}
            {grupoSel?.precoMinimo != null && (
              <div style={{ marginTop: '6px', fontSize: '0.72em', color: '#555' }}>
                Preço mínimo definido: <strong>R$ {grupoSel.precoMinimo.toFixed(2)}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalGrupo && <ModalGrupo grupo={modalGrupo !== 'novo' ? modalGrupo : null} onClose={() => setModalGrupo(null)} onSave={salvarGrupo} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 2 — Monitor de Lojas
// ─────────────────────────────────────────────────────────────────────────────
function AbaMonitorLojas({ usuarioId }) {
  const { canUseResource } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [lojaSel, setLojaSel] = useState(null);
  const [catalogo, setCatalogo] = useState({ itens: [], total: 0, offset: 0 });
  const [urlInput, setUrlInput] = useState('');
  const [busca, setBusca] = useState('');
  const [ld, setLd] = useState({});
  const [msg, setMsg] = useState('');

  const setL = (k, v) => setLd(p => ({ ...p, [k]: v }));
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const carregarLojas = useCallback(async () => {
    setL('lojas', true);
    try { const r = await fetch(`${API}/lojas?userId=${usuarioId}`); setLojas(await r.json()); }
    catch { } finally { setL('lojas', false); }
  }, [usuarioId]);

  useEffect(() => { carregarLojas(); }, [carregarLojas]);

  const carregarCatalogo = useCallback(async (loja, offset = 0, q = '') => {
    if (!loja) return;
    setL('cat', true);
    try {
      const params = new URLSearchParams({ lojaId: loja.id, userId: usuarioId, offset, limit: 20, q });
      const r = await fetch(`${API}/lojas/catalogo?${params}`);
      const d = await r.json();
      setCatalogo({ itens: d.itens || [], total: d.total || 0, offset });
    } catch { flash('Erro ao carregar catálogo.'); }
    finally { setL('cat', false); }
  }, [usuarioId]);

  useEffect(() => {
    if (lojaSel) carregarCatalogo(lojaSel, 0, busca);
  }, [lojaSel]);

  const adicionarLoja = async () => {
    if (!urlInput.trim()) return flash('Informe a URL de um anúncio da loja ou o nickname exato.');
    setL('add', true); setMsg('Buscando loja...');
    const r = await fetch(`${API}/lojas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: usuarioId, url: urlInput.trim() })
    });
    const d = await r.json();
    setL('add', false);
    if (!r.ok) return flash(d.erro || 'Erro ao adicionar loja.');
    setUrlInput(''); await carregarLojas(); flash(`Loja "${d.nickname}" adicionada!`);
  };

  const removerLoja = async () => {
    if (!lojaSel) return flash('Selecione uma loja.');
    if (!confirm(`Remover "${lojaSel.nickname}" do monitoramento?`)) return;
    const r = await fetch(`${API}/lojas/${lojaSel.id}?userId=${usuarioId}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); return flash(d.erro || 'Erro.'); }
    setLojaSel(null); setCatalogo({ itens: [], total: 0, offset: 0 }); await carregarLojas(); flash('Loja removida.');
  };

  const atualizarLoja = async () => {
    if (!lojaSel) return flash('Selecione uma loja.');
    setL('upd', true);
    const r = await fetch(`${API}/lojas/${lojaSel.id}/atualizar`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: usuarioId })
    });
    const d = await r.json();
    setL('upd', false);
    if (!r.ok) return flash(d.erro || 'Erro.');
    setLojaSel(d); await carregarLojas(); flash('Dados da loja atualizados!');
  };

  const rep = lojaSel?.reputacaoData;

  return (
    <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: 0 }}>
      {/* Lista de lojas */}
      <div style={{ ...card, width: '220px', minWidth: '180px', display: 'flex', flexDirection: 'column' }}>
        <div style={cardH}>Lojas Monitoradas</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {ld.lojas ? <div style={{ padding: '14px', textAlign: 'center', color: '#aaa', fontSize: '0.82em' }}>Carregando...</div>
            : lojas.length === 0 ? <div style={{ padding: '14px', textAlign: 'center', color: '#aaa', fontSize: '0.82em' }}>Nenhuma loja monitorada.</div>
            : lojas.map(l => (
              <div key={l.id} onClick={() => setLojaSel(l)}
                style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #eee', backgroundColor: lojaSel?.id === l.id ? '#cce5ff' : 'transparent' }}>
                <div style={{ fontSize: '0.82em', fontWeight: 600, color: '#2c3e50' }}>{l.nickname}</div>
                <div style={{ marginTop: '3px' }}><NivelBadge nivel={l.nivel} /></div>
              </div>
            ))
          }
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid #ddd', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
          {canUseResource('monitor.adicionarLoja') && (
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarLoja()}
              placeholder="URL de anúncio ou nickname"
              style={{ padding: '4px 7px', border: '1px solid #bbb', borderRadius: '3px', fontSize: '0.78em', width: '100%', boxSizing: 'border-box' }} />
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            {canUseResource('monitor.adicionarLoja') && (
              <button onClick={adicionarLoja} disabled={ld.add} style={{ ...btnP, flex: 1, fontSize: '0.75em', padding: '4px' }}>
                {ld.add ? '...' : '+ Adicionar'}
              </button>
            )}
            <button onClick={removerLoja} style={{ ...btnD, fontSize: '0.75em', padding: '4px 6px' }}>✕</button>
          </div>
        </div>
      </div>

      {/* Painel direito */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <Msg msg={msg} />

        {!lojaSel ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.9em' }}>
            Selecione uma loja para ver o perfil e catálogo.
          </div>
        ) : (
          <>
            {/* Card do vendedor */}
            <div style={card}>
              <div style={{ ...cardH, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Perfil do Vendedor</span>
                <button onClick={atualizarLoja} disabled={ld.upd} style={btn({ fontSize: '0.75em', padding: '3px 8px' })}>
                  {ld.upd ? '...' : '⟳ Atualizar'}
                </button>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '1em', fontWeight: 700, color: '#2c3e50' }}>{lojaSel.nickname}</div>
                  <div style={{ marginTop: '4px' }}><NivelBadge nivel={lojaSel.nivel} /></div>
                </div>
                {rep && (
                  <>
                    <div>
                      <div style={{ fontSize: '0.72em', color: '#777' }}>Nível de Poder</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85em' }}>{rep.level_id || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72em', color: '#777' }}>Vendas concluídas</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85em' }}>{rep.transactions?.completed ?? '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72em', color: '#777' }}>Reclamações</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85em', color: rep.metrics?.claims?.rate > 0.02 ? '#c0392b' : '#1e8449' }}>
                        {rep.metrics?.claims?.rate != null ? `${(rep.metrics.claims.rate * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72em', color: '#777' }}>Cancelamentos</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85em', color: rep.metrics?.cancellations?.rate > 0.02 ? '#c0392b' : '#1e8449' }}>
                        {rep.metrics?.cancellations?.rate != null ? `${(rep.metrics.cancellations.rate * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72em', color: '#777' }}>Atraso no envio</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85em', color: rep.metrics?.delayed_handling_time?.rate > 0.05 ? '#c0392b' : '#1e8449' }}>
                        {rep.metrics?.delayed_handling_time?.rate != null ? `${(rep.metrics.delayed_handling_time.rate * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Catálogo */}
            <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ ...cardH, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Catálogo de Produtos</span>
                <span style={{ fontWeight: 400, color: '#777', fontSize: '0.85em' }}>
                  {catalogo.total > 0 ? `${catalogo.total.toLocaleString('pt-BR')} itens` : ''}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input value={busca} onChange={e => setBusca(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && carregarCatalogo(lojaSel, 0, busca)}
                    placeholder="Buscar no catálogo..."
                    style={{ padding: '3px 7px', border: '1px solid #bbb', borderRadius: '3px', fontSize: '0.78em', width: '180px' }} />
                  <button onClick={() => carregarCatalogo(lojaSel, 0, busca)} style={btn({ fontSize: '0.75em', padding: '3px 8px' })}>Buscar</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {ld.cat ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#aaa' }}>Carregando catálogo...</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...thS, width: '28px' }}></th>
                      {['Título', 'Preço', 'Vendas', 'Estoque', 'Link'].map(c => <th key={c} style={thS}>{c}</th>)}
                    </tr></thead>
                    <tbody>
                      {catalogo.itens.length === 0
                        ? <tr><td colSpan={6} style={{ ...tdS, textAlign: 'center', color: '#aaa', padding: '30px' }}>Nenhum item encontrado.</td></tr>
                        : catalogo.itens.map(item => (
                          <tr key={item.id}>
                            <td style={{ ...tdS, padding: '4px 6px' }}>
                              {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />}
                            </td>
                            <td style={{ ...tdS, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</td>
                            <td style={{ ...tdS, fontWeight: 600, color: '#1a7a1a' }}>R$ {item.preco?.toFixed(2)}</td>
                            <td style={tdS}>{item.vendas ?? '—'}</td>
                            <td style={tdS}>{item.estoque}</td>
                            <td style={tdS}>
                              <a href={item.permalink} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', fontSize: '0.78em' }}>Ver ↗</a>
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                )}
              </div>
              {/* Paginação */}
              {catalogo.total > 20 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid #eee', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.8em', color: '#555', flexShrink: 0 }}>
                  <button onClick={() => carregarCatalogo(lojaSel, Math.max(0, catalogo.offset - 20), busca)} disabled={catalogo.offset === 0 || ld.cat} style={btn({ fontSize: '0.75em', padding: '3px 8px' })}>← Anterior</button>
                  <span>Pág. {Math.floor(catalogo.offset / 20) + 1} / {Math.ceil(catalogo.total / 20)}</span>
                  <button onClick={() => carregarCatalogo(lojaSel, catalogo.offset + 20, busca)} disabled={catalogo.offset + 20 >= catalogo.total || ld.cat} style={btn({ fontSize: '0.75em', padding: '3px 8px' })}>Próxima →</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 3 — Oportunidades e Clonagem
// ─────────────────────────────────────────────────────────────────────────────
function AbaOportunidades({ usuarioId }) {
  const [itens, setItens] = useState([]);
  const [ld, setLd] = useState(false);
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      setLd(true);
      try {
        const [r1, r2] = await Promise.all([
          fetch(`${API}/oportunidades?userId=${usuarioId}`).then(r => r.json()),
          fetch(`${API}/grupos?userId=${usuarioId}`).then(r => r.json()),
        ]);
        setItens(Array.isArray(r1) ? r1 : []);
        setGrupos(Array.isArray(r2) ? r2 : []);
      } catch { } finally { setLd(false); }
    };
    load();
  }, [usuarioId]);

  const copiarUrl = (url) => {
    navigator.clipboard.writeText(url);
    setMsg('URL copiada! Cole no Replicador de Anúncio.');
    setTimeout(() => setMsg(''), 3000);
  };

  const filtrados = filtroGrupo ? itens.filter(i => i.grupoId === filtroGrupo) : itens;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
      <Msg msg={msg} />

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '0.82em', color: '#555' }}>
          Itens dos concorrentes ordenados por volume de vendas — copie a URL e cole no <strong>Replicador de Anúncio</strong> para clonar.
        </div>
        <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
          style={{ marginLeft: 'auto', padding: '4px 8px', border: '1px solid #bbb', borderRadius: '3px', fontSize: '0.8em', minWidth: '160px' }}>
          <option value="">Todos os grupos</option>
          {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </div>

      <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...cardH, display: 'flex', alignItems: 'center' }}>
          <span>Oportunidades de Clonagem</span>
          <span style={{ marginLeft: '8px', fontWeight: 400, color: '#777', fontSize: '0.85em' }}>
            {filtrados.length} item(s) encontrado(s)
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {ld ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#aaa' }}>Carregando...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...thS, width: '28px' }}></th>
                {['Título', 'Grupo', 'Vendedor', 'Preço', 'Vendas', 'Estoque', 'Ação'].map(c => <th key={c} style={thS}>{c}</th>)}
              </tr></thead>
              <tbody>
                {filtrados.length === 0
                  ? <tr><td colSpan={8} style={{ ...tdS, textAlign: 'center', color: '#aaa', padding: '40px' }}>
                      Nenhuma oportunidade encontrada. Adicione concorrentes na aba "Anúncios Individuais".
                    </td></tr>
                  : filtrados.map(item => (
                    <tr key={`${item.id}-${item.grupoId}`}>
                      <td style={{ ...tdS, padding: '4px 6px' }}>
                        {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />}
                      </td>
                      <td style={{ ...tdS, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={item.permalink} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', textDecoration: 'none', fontSize: '0.8em' }}>
                          {item.titulo}
                        </a>
                      </td>
                      <td style={{ ...tdS, color: '#555', fontSize: '0.78em' }}>{item.grupoNome}</td>
                      <td style={{ ...tdS, color: '#555', fontSize: '0.78em' }}>{item.sellerNickname || '—'}</td>
                      <td style={{ ...tdS, fontWeight: 600, color: '#1a7a1a' }}>R$ {item.preco?.toFixed(2)}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: item.vendas > 100 ? '#2980b9' : '#333' }}>
                        {item.vendas > 0 ? `${item.vendas.toLocaleString('pt-BR')} vendas` : '—'}
                      </td>
                      <td style={tdS}>{item.estoqueFormatado || '?'}</td>
                      <td style={tdS}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => copiarUrl(item.permalink)}
                            title="Copiar URL para o Replicador"
                            style={btn({ fontSize: '0.72em', padding: '3px 7px', backgroundColor: '#eaf4fb', color: '#2980b9', border: '1px solid #aed6f1' })}>
                            📋 Copiar URL
                          </button>
                          <a href={item.permalink} target="_blank" rel="noopener noreferrer"
                            style={{ ...btn({ fontSize: '0.72em', padding: '3px 7px' }), textDecoration: 'none', display: 'inline-block' }}>
                            ↗ Ver
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 4 — Analista
// ─────────────────────────────────────────────────────────────────────────────
const POSICAO_COLORS = {
  'mais barato': { bg: '#d4edda', color: '#155724' },
  'competitivo': { bg: '#d1ecf1', color: '#0c5460' },
  'ligeiramente acima': { bg: '#fff3cd', color: '#856404' },
  'acima do mercado': { bg: '#f8d7da', color: '#721c24' },
  'sem dados': { bg: '#f5f5f5', color: '#999' },
};

function AbaAnalista({ usuarioId }) {
  const [dados, setDados] = useState([]);
  const [ld, setLd] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLd(true);
      try {
        const r = await fetch(`${API}/analitica?userId=${usuarioId}`);
        setDados(await r.json());
      } catch { } finally { setLd(false); }
    };
    load();
  }, [usuarioId]);

  const semDados = dados.every(d => d.posicao === 'sem dados');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>

      {/* Resumo cards */}
      {!ld && dados.length > 0 && !semDados && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
          {[
            { label: 'Grupos Monitorados', valor: dados.length, cor: '#2c3e50' },
            { label: 'Posição: Mais Barato', valor: dados.filter(d => d.posicao === 'mais barato').length, cor: '#1e8449' },
            { label: 'Posição: Competitivo', valor: dados.filter(d => d.posicao === 'competitivo').length, cor: '#0c5460' },
            { label: 'Acima do Mercado', valor: dados.filter(d => d.posicao === 'acima do mercado' || d.posicao === 'ligeiramente acima').length, cor: '#c0392b' },
          ].map(({ label, valor, cor }) => (
            <div key={label} style={{ ...card, padding: '12px 16px', minWidth: '130px' }}>
              <div style={{ fontSize: '0.72em', color: '#777', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '1.4em', fontWeight: 700, color: cor }}>{valor}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={cardH}>Análise por Grupo de Produtos</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {ld ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>Carregando análise...</div>
          ) : dados.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
              Nenhum grupo monitorado ainda. Crie grupos na aba "Anúncios Individuais".
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Grupo', 'Concorrentes', 'Meu Menor Preço', 'Conc. Mín.', 'Conc. Média', 'Conc. Máx.', 'Posição', 'Diferença'].map(c => <th key={c} style={thS}>{c}</th>)}
              </tr></thead>
              <tbody>
                {dados.map(d => {
                  const s = POSICAO_COLORS[d.posicao] || POSICAO_COLORS['sem dados'];
                  const diff = d.meuPrecoMin != null && d.concorrenteMin != null ? d.meuPrecoMin - d.concorrenteMin : null;
                  return (
                    <tr key={d.grupoId}>
                      <td style={{ ...tdS, fontWeight: 600 }}>{d.grupoNome}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{d.qtdConcorrentes}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#1a7a1a' }}>
                        {d.meuPrecoMin != null ? `R$ ${d.meuPrecoMin.toFixed(2)}` : <span style={{ color: '#aaa' }}>Sem anúncio ativo</span>}
                      </td>
                      <td style={{ ...tdS, color: '#c0392b', fontWeight: 600 }}>
                        {d.concorrenteMin != null ? `R$ ${d.concorrenteMin.toFixed(2)}` : '—'}
                      </td>
                      <td style={tdS}>{d.concorrenteMedia != null ? `R$ ${d.concorrenteMedia.toFixed(2)}` : '—'}</td>
                      <td style={tdS}>{d.concorrenteMax != null ? `R$ ${d.concorrenteMax.toFixed(2)}` : '—'}</td>
                      <td style={tdS}>
                        <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '3px', fontSize: '0.78em', fontWeight: 700 }}>
                          {d.posicao}
                        </span>
                      </td>
                      <td style={{ ...tdS, fontWeight: 700 }}>
                        {diff != null ? (
                          <span style={{ color: diff > 0 ? '#c0392b' : '#1e8449' }}>
                            {diff > 0 ? '▲' : '▼'} R$ {Math.abs(diff).toFixed(2)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!ld && dados.length > 0 && (
        <div style={{ ...card, padding: '10px 14px', flexShrink: 0 }}>
          <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Legenda de Posição Competitiva</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(POSICAO_COLORS).filter(([k]) => k !== 'sem dados').map(([pos, s]) => (
              <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '3px', fontSize: '0.75em', fontWeight: 700 }}>{pos}</span>
                <span style={{ fontSize: '0.72em', color: '#777' }}>
                  {pos === 'mais barato' ? '(≥5% abaixo do concorrente mínimo)' : pos === 'competitivo' ? '(dentro de ±5%)' : pos === 'ligeiramente acima' ? '(5–15% acima)' : '(>15% acima)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente Principal ───────────────────────────────────────────────────────
export default function MonitorConcorrentes({ usuarioId }) {
  const [abaAtiva, setAbaAtiva] = useState(0);

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Sub-abas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #ddd', marginBottom: '12px', flexShrink: 0 }}>
        {subAbas.map((aba, i) => (
          <button key={i} onClick={() => setAbaAtiva(i)}
            style={{
              padding: '7px 14px', fontSize: '0.82em', border: '1px solid #ddd',
              borderBottom: abaAtiva === i ? '2px solid white' : '1px solid #ddd',
              marginBottom: abaAtiva === i ? '-2px' : '0',
              backgroundColor: abaAtiva === i ? '#fff' : '#f5f5f5',
              fontWeight: abaAtiva === i ? 600 : 400, cursor: 'pointer',
              color: abaAtiva === i ? '#2c3e50' : '#666',
              fontFamily: 'inherit', borderRadius: '3px 3px 0 0', outline: 'none',
            }}>
            {aba}
          </button>
        ))}
      </div>

      {abaAtiva === 0 && <AbaAnunciosIndividuais usuarioId={usuarioId} />}
      {abaAtiva === 1 && <AbaMonitorLojas usuarioId={usuarioId} />}
      {abaAtiva === 2 && <AbaOportunidades usuarioId={usuarioId} />}
      {abaAtiva === 3 && <AbaAnalista usuarioId={usuarioId} />}
    </div>
  );
}
