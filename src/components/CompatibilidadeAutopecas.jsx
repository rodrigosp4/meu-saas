// =====================================================================
// src/components/CompatibilidadeAutopecas.jsx
// =====================================================================
// Gerenciador de Compatibilidades de Autopeças (Fitment) — Mercado Livre
//
// Funcionalidades:
//   1. Busca em cascata: Marca → Modelo → Ano → Motor...
//   2. Resultados do catálogo ML com seleção múltipla
//   3. Lista de compatibilidades com edição de Nota + Posição por veículo
//   4. Posições carregadas da API ML (POSITION restrictions)
//   5. Perfis reutilizáveis (salvar/carregar/deletar)
//   6. Carregar compatibilidades existentes de um item ML
//   7. Aplicar lista a um item ML (PUT)
//   8. Definição manual de veículo
//   9. [NOVO] Assistente IA — gera prompt para ChatGPT/Claude e importa IDs da resposta
// =====================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ModalCompatibilidade, ModalPosicao, getTagBadge } from './GerenciadorAnuncios.jsx';
import { useContasML } from '../contexts/ContasMLContext';

const API_BASE = '/api/compat';

// ─── Estilos reutilizáveis ────────────────────────────────────────
const S = {
  container:    { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: '#2c3e50' },
  titulo:       { fontSize: '1.1em', fontWeight: 600, color: '#2c3e50', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #e67e22', display: 'flex', alignItems: 'center', gap: 8 },
  barraSuperior:{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap', padding: '10px 0' },
  label:        { fontSize: '0.83em', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' },
  input:        { padding: '6px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.85em', outline: 'none', backgroundColor: '#f5f6f7' },
  btn:          { padding: '6px 14px', fontSize: '0.8em', fontWeight: 500, border: '1px solid #bdc3c7', borderRadius: 4, backgroundColor: '#f8f9fa', color: '#2c3e50', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnPrimary:   { padding: '7px 16px', fontSize: '0.83em', fontWeight: 600, border: 'none', borderRadius: 4, backgroundColor: '#e67e22', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger:    { padding: '6px 14px', fontSize: '0.8em', fontWeight: 500, border: '1px solid #e74c3c', borderRadius: 4, backgroundColor: '#fff', color: '#e74c3c', cursor: 'pointer' },
  btnSuccess:   { display: 'block', width: '100%', marginTop: 14, padding: '12px 24px', fontSize: '0.95em', fontWeight: 700, border: 'none', borderRadius: 6, backgroundColor: '#27ae60', color: '#fff', cursor: 'pointer', textAlign: 'center' },
  btnIconSmall: { padding: '2px 7px', fontSize: '0.75em', border: '1px solid #bdc3c7', borderRadius: 3, backgroundColor: '#fff', cursor: 'pointer', color: '#555' },
  btnIA:        { padding: '7px 14px', fontSize: '0.8em', fontWeight: 600, border: '1px solid #8e44ad', borderRadius: 4, backgroundColor: '#f5eef8', color: '#8e44ad', cursor: 'pointer', whiteSpace: 'nowrap' },
  select:       { padding: '6px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.85em', backgroundColor: '#fff', minWidth: 160, cursor: 'pointer' },
  divider:      { width: 1, height: 28, backgroundColor: '#ddd', margin: '0 6px' },
  painelContainer: { display: 'flex', gap: 16, marginTop: 8 },
  painelEsquerdo:  { flex: '0 0 440px', display: 'flex', flexDirection: 'column', gap: 12 },
  painelDireito:   { flex: 1, display: 'flex', flexDirection: 'column' },
  fieldset:     { border: '1px solid #ddd', borderRadius: 6, padding: 14, margin: 0 },
  legend:       { fontSize: '0.85em', fontWeight: 600, color: '#2c3e50', padding: '0 8px' },
  campoLinha:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 },
  campoLabel:   { width: 90, fontSize: '0.82em', fontWeight: 500, color: '#555', textAlign: 'right', flexShrink: 0 },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' },
  th:           { padding: '8px 10px', backgroundColor: '#f1f3f5', borderBottom: '2px solid #dee2e6', textAlign: 'left', fontWeight: 600, color: '#495057', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 },
  td:           { padding: '6px 10px', borderBottom: '1px solid #eee', color: '#555' },
  tdCheckbox:   { padding: '6px 10px', borderBottom: '1px solid #eee', width: 30, textAlign: 'center' },
  emptyRow:     { textAlign: 'center', padding: '35px 10px', color: '#adb5bd', fontStyle: 'italic', fontSize: '0.9em' },
  statusBar:    (type) => ({
    padding: '8px 12px', borderRadius: 4, fontSize: '0.85em', marginBottom: 8,
    backgroundColor: type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : type === 'warning' ? '#fff3cd' : '#e7f3fe',
    color: type === 'error' ? '#721c24' : type === 'success' ? '#155724' : type === 'warning' ? '#856404' : '#0c549c',
    border: `1px solid ${type === 'error' ? '#f5c6cb' : type === 'success' ? '#c3e6cb' : type === 'warning' ? '#ffeeba' : '#d0eaff'}`,
  }),
  overlay:      { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal:        { background: '#fff', borderRadius: 8, padding: 24, minWidth: 400, maxWidth: 540, boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxHeight: '90vh', overflowY: 'auto' },
  modalIA:      { background: '#fff', borderRadius: 8, padding: 24, width: '90vw', maxWidth: 820, boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  badge:        { display: 'inline-block', backgroundColor: '#e67e22', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: '0.75em', fontWeight: 600, marginLeft: 6 },
  badgeBlue:    { display: 'inline-block', backgroundColor: '#3498db', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.72em', fontWeight: 600 },
  badgeGreen:   { display: 'inline-block', backgroundColor: '#27ae60', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.72em', fontWeight: 600 },
  badgeIA:      { display: 'inline-block', backgroundColor: '#8e44ad', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.72em', fontWeight: 600 },
  textarea:     { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.83em', fontFamily: "'Segoe UI', monospace", resize: 'vertical', backgroundColor: '#f9f9f9' },
};

// ─── Posições hardcoded para fallback ────────────────────────────
const POSICOES_FALLBACK = [
  { value_id: null, value_name: 'Dianteira' },
  { value_id: null, value_name: 'Traseira' },
  { value_id: null, value_name: 'Esquerda' },
  { value_id: null, value_name: 'Direita' },
  { value_id: null, value_name: 'Superior' },
  { value_id: null, value_name: 'Inferior' },
  { value_id: null, value_name: 'Interno' },
  { value_id: null, value_name: 'Externo' },
  { value_id: null, value_name: 'Central' },
];

// ─── Helper: formata restrictions para exibição ───────────────────
function formatRestrictions(restrictions) {
  if (!Array.isArray(restrictions) || restrictions.length === 0) return '—';
  const posAttr = restrictions.find(r => r.attribute_id === 'POSITION');
  if (!posAttr || !posAttr.attribute_values) return '—';
  return posAttr.attribute_values.map(av =>
    (av.values || []).map(v => v.value_name).join('+')
  ).join(' | ');
}

// ─── Helper: extrai IDs do catálogo ML de um texto ───────────────
function extractVehicleIds(text) {
  if (!text) return [];
  const found = [...text.toUpperCase().matchAll(/\bML[A-Z]\d+\b/g)].map(m => m[0]);
  const seen = new Set();
  return found.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
}

// ─── Helper: gera prompt para IA ─────────────────────────────────
function buildIAPrompt(catalogLines, wantedText) {
  const wanted = wantedText.trim() || '(NÃO INFORMADO AINDA — cole aqui sua lista/critério e gere de novo)';
  const catalogBlock = catalogLines.slice(0, 1200).join('\n');

  return `Você é um assistente de compatibilidade de veículos (catálogo Mercado Livre).

Eu vou te passar:
1) CATÁLOGO (cada linha = ID | Nome do veículo)
2) MINHA LISTA/CRITÉRIO (texto livre)

Sua tarefa:
- Identificar quais linhas do CATÁLOGO correspondem à MINHA LISTA/CRITÉRIO (por marca/modelo/ano/versão/motor, etc).
- Responder APENAS com os IDs do catálogo (primeira coluna), UM POR LINHA.
- Não escreva explicações, não repita nomes, não use bullets. Somente IDs.
- Se houver dúvida, coloque os IDs duvidosos no FINAL, em uma seção separada começando com: DUVIDOSOS:

CATÁLOGO:
${catalogBlock}

MINHA LISTA/CRITÉRIO:
${wanted}`;
}

// =====================================================================
// MODAL: PREENCHIMENTO RÁPIDO DE COMPATIBILIDADE (sem cadastro)
// =====================================================================
const ATTR_LABELS = {
  VEHICLE_BRAND: 'Marca', BRAND: 'Marca',
  VEHICLE_MODEL: 'Modelo', MODEL: 'Modelo',
  VEHICLE_YEAR: 'Ano', YEAR: 'Ano',
  VEHICLE_ENGINE: 'Motor', ENGINE: 'Motor',
  VEHICLE_VERSION: 'Versão', VERSION: 'Versão',
  VEHICLE_FUEL: 'Combustível', FUEL: 'Combustível',
  VEHICLE_TRANSMISSION: 'Transmissão', TRANSMISSION: 'Transmissão',
};

export function ModalPreenchimentoRapido({ ads, contaId: contaIdProp, usuarioId, onClose, onSuccess, onAplicarLocal }) {
  const contaId = contaIdProp || ads?.[0]?.contaId;
  const [domainConfig, setDomainConfig] = useState(null);
  const [attrValues, setAttrValues] = useState({});
  const [attrSelected, setAttrSelected] = useState({});
  const [resultados, setResultados] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: 'info' });
  const setStatus = (text, type = 'info') => setStatusMsg({ text, type });

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      setStatus('Carregando campos de veículo...', 'info');
      try {
        const configRes = await fetch(`${API_BASE}/config?contaId=${contaId}&userId=${usuarioId}`);
        if (!configRes.ok) throw new Error('Falha ao buscar configuração');
        const config = await configRes.json();
        setDomainConfig(config);
        if (config.attributes && config.attributes.length > 0) {
          const firstAttr = config.attributes[0];
          const valRes = await fetch(`${API_BASE}/attribute-values`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contaId, userId: usuarioId, domainId: config.domainId, attributeId: firstAttr, knownAttributes: [] }),
          });
          if (!valRes.ok) throw new Error('Falha ao buscar atributos');
          const valData = await valRes.json();
          setAttrValues({ [firstAttr]: valData.values || [] });
          setStatus('Selecione o veículo e clique em Buscar.', 'info');
        }
      } catch (e) {
        setStatus(`Erro: ${e.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []); // eslint-disable-line

  const handleAttrChange = async (attrId, selectedName) => {
    if (!domainConfig) return;
    const attrs = domainConfig.attributes;
    const currentIndex = attrs.indexOf(attrId);
    const currentValues = attrValues[attrId] || [];
    const selectedItem = currentValues.find(v => v.name === selectedName);

    const newSelected = { ...attrSelected };
    if (selectedName && selectedItem) newSelected[attrId] = selectedItem;
    else delete newSelected[attrId];

    const newValues = { ...attrValues };
    for (let i = currentIndex + 1; i < attrs.length; i++) {
      delete newSelected[attrs[i]];
      delete newValues[attrs[i]];
    }
    setAttrSelected(newSelected);
    setAttrValues(newValues);
    setResultados([]);
    setSelecionados(new Set());

    if (selectedName && selectedItem && currentIndex + 1 < attrs.length) {
      const nextAttr = attrs[currentIndex + 1];
      const knownAttrs = [];
      for (let i = 0; i <= currentIndex; i++) {
        const a = attrs[i];
        const sel = (a === attrId) ? selectedItem : newSelected[a];
        if (sel) {
          const entry = { id: a };
          if (sel.id) entry.value_id = String(sel.id);
          else if (['VEHICLE_YEAR', 'YEAR'].includes(a) && sel.name) entry.value_name = sel.name;
          knownAttrs.push(entry);
        }
      }
      try {
        const valRes = await fetch(`${API_BASE}/attribute-values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contaId, userId: usuarioId, domainId: domainConfig.domainId, attributeId: nextAttr, knownAttributes: knownAttrs }),
        });
        if (valRes.ok) {
          const valData = await valRes.json();
          setAttrValues(prev => ({ ...prev, [nextAttr]: valData.values || [] }));
        }
      } catch (e) { console.error('Cascata:', e); }
    }
  };

  const handleBuscar = async () => {
    if (!domainConfig) return;
    const knownAttrs = [];
    for (const attrId of domainConfig.attributes) {
      const sel = attrSelected[attrId];
      if (!sel) continue;
      if (sel.id) knownAttrs.push({ id: attrId, value_ids: [String(sel.id)] });
      else if (['VEHICLE_YEAR', 'YEAR'].includes(attrId) && sel.name) knownAttrs.push({ id: attrId, value_name: sel.name });
    }
    if (knownAttrs.length === 0) { setStatus('Selecione pelo menos um campo antes de buscar.', 'warning'); return; }
    setLoading(true);
    setStatus('Buscando veículos...', 'info');
    setResultados([]);
    setSelecionados(new Set());
    try {
      const res = await fetch(`${API_BASE}/search-vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId, userId: usuarioId, domainId: domainConfig.domainId, knownAttributes: knownAttrs, maxResults: 500 }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.erro || 'Falha na busca'); }
      const data = await res.json();
      const results = data.results || [];
      setResultados(results);
      setSelecionados(new Set(results.map((_, i) => i)));
      setStatus(`${results.length} veículo(s) encontrado(s). Revise a seleção e clique em Aplicar.`, results.length > 0 ? 'success' : 'warning');
    } catch (e) {
      setStatus(`Erro: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAplicar = async () => {
    if (selecionados.size === 0) { setStatus('Nenhum veículo selecionado.', 'warning'); return; }
    const compatibilities = [...selecionados].map(i => {
      const v = resultados[i];
      return { catalog_product_id: v.id, name: v.name, note: '', restrictions: [], creation_source: 'DEFAULT' };
    });
    // Modo local (Cadastramento de Anúncio): apenas retorna os veículos sem enfileirar
    if (onAplicarLocal) {
      onAplicarLocal(compatibilities);
      onClose();
      return;
    }
    const items = ads.map(ad => ({ id: ad.id, contaId: ad.contaId || contaId }));
    setLoading(true);
    setStatus('Enviando para a fila...', 'info');
    try {
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'compatibilidade', valor: compatibilities }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.erro || 'Falha ao enfileirar');
      setStatus(`✅ ${ads.length} anúncio(s) enviados para a fila!`, 'success');
      setTimeout(() => { onSuccess && onSuccess(ads.map(a => a.id)); onClose(); }, 1000);
    } catch (e) {
      setStatus(`Erro: ${e.message}`, 'error');
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, minWidth: 480, maxWidth: 600 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50' }}>⚡ Preenchimento Rápido</div>
            <div style={{ fontSize: '0.76em', color: '#888', marginTop: 3, maxWidth: 380 }}>
              {ads && ads.length > 0
                ? (ads.length === 1
                    ? <>{ads[0].id} — <span style={{ color: '#555' }}>{ads[0].titulo}</span></>
                    : <span style={{ color: '#555', fontWeight: 600 }}>{ads.length} anúncios selecionados</span>)
                : <span style={{ color: '#555' }}>Selecione os veículos compatíveis</span>
              }
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3em', cursor: 'pointer', color: '#aaa', lineHeight: 1, marginLeft: 8 }}>✕</button>
        </div>

        {/* Status */}
        {statusMsg.text && (
          <div style={{ ...S.statusBar(statusMsg.type), marginBottom: 12, fontSize: '0.82em' }}>{statusMsg.text}</div>
        )}

        {/* Cascade dropdowns */}
        {!domainConfig && loading && (
          <div style={{ textAlign: 'center', color: '#888', padding: '24px 0', fontSize: '0.85em' }}>⏳ Carregando campos...</div>
        )}
        {domainConfig && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {domainConfig.attributes.map((attrId, idx) => {
              const values = attrValues[attrId] || [];
              const selected = attrSelected[attrId];
              const label = ATTR_LABELS[attrId] || attrId;
              const prevAttrId = domainConfig.attributes[idx - 1];
              const isEnabled = idx === 0 || !!attrSelected[prevAttrId];
              return (
                <div key={attrId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 95, fontSize: '0.82em', fontWeight: 500, color: '#555', textAlign: 'right', flexShrink: 0 }}>{label}:</div>
                  <select
                    value={selected?.name || ''}
                    onChange={e => handleAttrChange(attrId, e.target.value)}
                    disabled={!isEnabled || loading}
                    style={{ ...S.select, flex: 1, opacity: isEnabled ? 1 : 0.5 }}
                  >
                    <option value="">-- Selecione --</option>
                    {values.map(v => <option key={v.id || v.name} value={v.name}>{v.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {/* Buscar button */}
        {domainConfig && resultados.length === 0 && (
          <button
            onClick={handleBuscar}
            disabled={loading}
            style={{ ...S.btnPrimary, width: '100%', padding: '9px 16px', fontSize: '0.88em' }}
          >
            {loading ? '⏳ Buscando...' : '🔍 Buscar Veículos'}
          </button>
        )}

        {/* Results */}
        {resultados.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.83em', fontWeight: 600, color: '#2c3e50' }}>
                {resultados.length} veículo(s) — {selecionados.size} selecionado(s)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleBuscar} disabled={loading} style={S.btnIconSmall}>🔄 Rebuscar</button>
                <button onClick={() => setSelecionados(new Set(resultados.map((_, i) => i)))} style={S.btnIconSmall}>Sel. todos</button>
                <button onClick={() => setSelecionados(new Set())} style={S.btnIconSmall}>Limpar</button>
              </div>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 4, marginBottom: 14 }}>
              {resultados.map((v, i) => (
                <div
                  key={v.id}
                  onClick={() => setSelecionados(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: 'pointer', backgroundColor: selecionados.has(i) ? '#fff8f0' : '#fff', borderBottom: '1px solid #f5f5f5' }}
                >
                  <input type="checkbox" checked={selecionados.has(i)} readOnly style={{ cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.79em', color: '#555' }}>{v.name}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ ...S.btn, flex: 1 }}>Cancelar</button>
              <button
                onClick={handleAplicar}
                disabled={loading || selecionados.size === 0}
                style={{ ...S.btnSuccess, flex: 2, marginTop: 0, display: 'block', opacity: selecionados.size === 0 ? 0.5 : 1 }}
              >
                {loading ? '⏳ Enviando...' : onAplicarLocal ? `✅ Usar ${selecionados.size} veículo(s)` : `🚀 Enviar para Fila — ${selecionados.size} veículo(s) × ${ads.length} anúncio(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// SUB-ABA: PRODUTOS COM COMPATIBILIDADE PENDENTE
// =====================================================================
const COMPAT_PENDING_TAGS = ['incomplete_compatibilities', 'incomplete_position_compatibilities'];

function PendentesCompatibilidade({ usuarioId, onAbrirNoEditor }) {
  const { contas: contasMLCtx } = useContasML();
  const [anuncios, setAnuncios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contasML, setContasML] = useState([]);
  const [contaFilter, setContaFilter] = useState('Todas');
  const [tagFilter, setTagFilter] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [palavrasExcluir, setPalavrasExcluir] = useState([]);
  const [palavrasExcluirInput, setPalavrasExcluirInput] = useState('');
  const [ocultarEnviados, setOcultarEnviados] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [allKnownAds, setAllKnownAds] = useState({});
  const [modalCompatibilidade, setModalCompatibilidade] = useState(false);
  const [modalPosicao, setModalPosicao] = useState(false);
  const [modalRapido, setModalRapido] = useState(null);
  const [concluidosCompat, setConcluidosCompatRaw] = useState(() => {
    try {
      const saved = localStorage.getItem('compat_pendentes_concluidos');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const setConcluidosCompat = (updater) => {
    setConcluidosCompatRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('compat_pendentes_concluidos', JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const [concluidosPosicao, setConcluidosPosicaoRaw] = useState(() => {
    try {
      const saved = localStorage.getItem('compat_pendentes_concluidos_posicao');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const setConcluidosPosicao = (updater) => {
    setConcluidosPosicaoRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('compat_pendentes_concluidos_posicao', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const fetchPendentes = async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
    try {
      const contas = contasMLCtx;
      setContasML(contas);
      const idsPermitidos = contas.map(c => c.id).join(',');
      if (!idsPermitidos) return;

      const queryConta = contaFilter === 'Todas' ? idsPermitidos : contaFilter;

      const [res1, res2] = await Promise.all([
        fetch(`/api/ml/anuncios?contasIds=${queryConta}&page=1&limit=9999&search=&status=Todos&tag=incomplete_compatibilities`),
        fetch(`/api/ml/anuncios?contasIds=${queryConta}&page=1&limit=9999&search=&status=Todos&tag=incomplete_position_compatibilities`),
      ]);
      const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

      const seen = new Set();
      const merged = [...(data1.anuncios || []), ...(data2.anuncios || [])].filter(ad => {
        if (seen.has(ad.id)) return false;
        seen.add(ad.id);
        return true;
      });

      setAnuncios(merged);
      const known = {};
      merged.forEach(ad => { known[ad.id] = ad; });
      setAllKnownAds(known);
    } catch (e) {
      console.error('Erro ao buscar pendentes:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPendentes(); }, [contaFilter]); // eslint-disable-line

  const filtered = anuncios.filter(ad => {
    if (ocultarEnviados) {
      const isCompatEnviado = concluidosCompat.has(ad.id);
      const isPosicaoEnviado = concluidosPosicao.has(ad.id);
      if (tagFilter === 'incomplete_compatibilities' && isCompatEnviado) return false;
      if (tagFilter === 'incomplete_position_compatibilities' && isPosicaoEnviado) return false;
      if (tagFilter === 'Todas' && isCompatEnviado && isPosicaoEnviado) return false;
    }
    if (tagFilter !== 'Todas' && ad.tagPrincipal !== tagFilter) return false;
    if (palavrasExcluir.length > 0) {
      const titulo = (ad.titulo || '').toLowerCase();
      if (palavrasExcluir.some(p => titulo.includes(p))) return false;
    }
    if (!searchTerm) return true;
    const titulo = (ad.titulo || '').toLowerCase();
    const id = (ad.id || '').toLowerCase();
    const terms = searchTerm.toLowerCase().split('%').map(t => t.trim()).filter(Boolean);
    return terms.every(t => titulo.includes(t) || id.includes(t));
  });

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(ad => ad.id)));
    }
  };

  const getSelectedAds = () => Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean);

  const countByTag = (tag) => anuncios.filter(ad => tag === 'Todas' ? true : ad.tagPrincipal === tag).length;

  return (
    <div className="space-y-4 mt-2">
      {/* Filtro por tipo de pendência */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'Todas', label: '🔍 Todas' },
          { key: 'incomplete_compatibilities', label: '🚗 Compatibilidade Pendente' },
          { key: 'incomplete_position_compatibilities', label: '📍 Posição Pendente' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setTagFilter(opt.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              tagFilter === opt.key
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400 hover:text-orange-600'
            }`}
          >
            {opt.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${tagFilter === opt.key ? 'bg-orange-400' : 'bg-gray-100'}`}>{countByTag(opt.key)}</span>
          </button>
        ))}
        <button
          onClick={() => setOcultarEnviados(prev => !prev)}
          className={`ml-auto px-3 py-1.5 rounded-full text-xs font-bold border transition ${
            ocultarEnviados
              ? 'bg-green-500 text-white border-green-500'
              : 'bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-600'
          }`}
        >
          {ocultarEnviados ? '✅ Ocultar enviados' : '👁 Mostrar enviados'}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por título ou ID..."
            className="px-3 py-2 border border-gray-300 rounded-md text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <select
            value={contaFilter}
            onChange={e => setContaFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="Todas">Todas as contas</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname || c.id}</option>)}
          </select>
          <button
            onClick={fetchPendentes}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition disabled:opacity-50"
          >
            {isLoading ? '⏳ Carregando...' : '🔄 Atualizar'}
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Excluir resultados com palavra-chave (Enter ou vírgula)..."
              value={palavrasExcluirInput}
              onChange={e => setPalavrasExcluirInput(e.target.value)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ',') && palavrasExcluirInput.trim()) {
                  e.preventDefault();
                  const nova = palavrasExcluirInput.trim().replace(/,$/, '').toLowerCase();
                  if (nova && !palavrasExcluir.includes(nova)) {
                    setPalavrasExcluir(prev => [...prev, nova]);
                  }
                  setPalavrasExcluirInput('');
                } else if (e.key === 'Backspace' && !palavrasExcluirInput && palavrasExcluir.length > 0) {
                  setPalavrasExcluir(prev => prev.slice(0, -1));
                }
              }}
              className="flex-1 min-w-[200px] px-3 py-2 border border-red-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 placeholder-red-300"
            />
          </div>
          {palavrasExcluir.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {palavrasExcluir.map(palavra => (
                <span key={palavra} className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {palavra}
                  <button onClick={() => setPalavrasExcluir(prev => prev.filter(p => p !== palavra))} className="hover:text-red-900 ml-0.5 leading-none">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações em massa */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
          <span className="text-sm font-bold text-orange-700">{selectedIds.size} selecionado(s)</span>
          <button
            onClick={() => setModalCompatibilidade(true)}
            className="px-4 py-2 text-sm font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition"
          >
            🚗 Aplicar Perfil de Compatibilidade
          </button>
          <button
            onClick={() => setModalPosicao(true)}
            className="px-4 py-2 text-sm font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition"
          >
            📍 Definir Posição da Peça
          </button>
          <button
            onClick={() => setModalRapido({ ids: Array.from(selectedIds), ads: getSelectedAds() })}
            className="px-4 py-2 text-sm font-bold text-white bg-violet-500 rounded-lg hover:bg-violet-600 transition"
          >
            ⚡ Preenchimento Rápido
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Resumo */}
      <div className="text-xs text-gray-500">
        {isLoading
          ? 'Carregando anúncios...'
          : `${filtered.length} anúncio(s)${tagFilter !== 'Todas' ? ` com ${tagFilter === 'incomplete_compatibilities' ? 'compatibilidade' : 'posição'} pendente` : ' no total'}${searchTerm ? ' (filtrado)' : ''}`}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleAll}
                    className="w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">ID</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Título</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Tags</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Conta</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Ação</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 italic text-sm">
                    {anuncios.length === 0
                      ? 'Nenhum anúncio com compatibilidade pendente encontrado.'
                      : 'Nenhum resultado para a busca.'}
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    ⏳ Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && filtered.map(ad => {
                const tags = Array.isArray(ad.tags) ? ad.tags : [];
                const compatTags = tags.filter(t => COMPAT_PENDING_TAGS.includes(t));
                const isSelected = selectedIds.has(ad.id);
                const isCompatEnviado = concluidosCompat.has(ad.id);
                const isPosicaoEnviado = concluidosPosicao.has(ad.id);
                const isConcluido = isCompatEnviado && isPosicaoEnviado;
                return (
                  <tr
                    key={ad.id}
                    className={`border-b border-gray-100 transition-colors ${
                      isConcluido ? 'bg-green-50 opacity-70' : isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(ad.id)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-blue-700 whitespace-nowrap">{ad.id}</td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-xs">
                      <span className="line-clamp-2 text-xs" title={ad.titulo}>{ad.titulo}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {compatTags.map(tag => (
                          tag === 'incomplete_compatibilities' && isCompatEnviado
                            ? <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">✅ Compat. enviada</span>
                            : tag === 'incomplete_position_compatibilities' && isPosicaoEnviado
                              ? <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-700">✅ Posição enviada</span>
                              : <span key={tag}>{getTagBadge(tag)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        ad.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {ad.status === 'active' ? 'Ativo' : ad.status === 'paused' ? 'Pausado' : ad.status || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {ad.conta?.nickname || ad.contaId || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => onAbrirNoEditor(ad.id, ad.contaId)}
                        className="px-3 py-1 text-xs font-bold text-white bg-orange-500 rounded hover:bg-orange-600 transition whitespace-nowrap"
                        title="Carregar este item no Editor de Compatibilidade"
                      >
                        ✏️ Abrir no Editor
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais reaproveitados do Gerenciador de Anúncios */}
      {modalCompatibilidade && (
        <ModalCompatibilidade
          anunciosSelecionados={getSelectedAds()}
          usuarioId={usuarioId}
          onSuccess={(ids) => setConcluidosCompat(prev => new Set([...prev, ...ids]))}
          onClose={() => setModalCompatibilidade(false)}
        />
      )}
      {modalPosicao && (
        <ModalPosicao
          anunciosSelecionados={getSelectedAds()}
          usuarioId={usuarioId}
          onClose={() => setModalPosicao(false)}
          onSuccess={(ids) => { setConcluidosPosicao(prev => new Set([...prev, ...(ids || [])])); setModalPosicao(false); fetchPendentes(); }}
        />
      )}
      {modalRapido && (
        <ModalPreenchimentoRapido
          ads={modalRapido.ads}
          usuarioId={usuarioId}
          onClose={() => setModalRapido(null)}
          onSuccess={(ids) => { setConcluidosCompat(prev => new Set([...prev, ...ids])); setSelectedIds(new Set()); setModalRapido(null); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export default function CompatibilidadeAutopecas({ usuarioId }) {
  const { contas: contasMLCtx } = useContasML();

  // --- Sub-abas ---
  const [activeSubTab, setActiveSubTab] = useState('editor');

  // --- Conta ML ---
  const [contasML, setContasML] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');

  // --- Item ---
  const [itemId, setItemId] = useState('');
  const [itemDomainId, setItemDomainId] = useState('');

  // --- Configuração de domínio ---
  const [domainConfig, setDomainConfig] = useState(null);

  // --- Dropdowns cascata ---
  const [attrValues, setAttrValues] = useState({});
  const [attrSelected, setAttrSelected] = useState({});

  // --- Resultados da busca ---
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [totalBusca, setTotalBusca] = useState(0);
  const [selecionadosBusca, setSelecionadosBusca] = useState(new Set());

  // --- Lista de compatibilidades ---
  const [listaCompatibilidades, setListaCompatibilidades] = useState([]);
  const [selecionadosLista, setSelecionadosLista] = useState(new Set());

  // --- Perfis ---
  const [perfis, setPerfis] = useState([]);
  const [nomePerfil, setNomePerfil] = useState('');
  const [perfilSelecionado, setPerfilSelecionado] = useState('');
  const [renomeandoId, setRenomeandoId] = useState(null);
  const [novoNomePerfil, setNovoNomePerfil] = useState('');

  // --- Modal: edição de veículo (nota + posição) ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [editPositions, setEditPositions] = useState([]);
  const [posicoesList, setPosicoesList] = useState([]);
  const [loadingPosicoes, setLoadingPosicoes] = useState(false);

  // --- Modal: definição manual ---
  const [showModalManual, setShowModalManual] = useState(false);
  const [manualVehicleId, setManualVehicleId] = useState('');
  const [manualVehicleName, setManualVehicleName] = useState('');
  const [manualVehicleNote, setManualVehicleNote] = useState('');

  // --- Modal: Assistente IA ---
  const [showAssistenteIA, setShowAssistenteIA] = useState(false);
  const [iaCriterioText, setIaCriterioText] = useState('');
  const [iaPromptGerado, setIaPromptGerado] = useState('');
  const [iaRespostaText, setIaRespostaText] = useState('');
  const [iaIdsEncontrados, setIaIdsEncontrados] = useState([]);
  const [iaStatusMsg, setIaStatusMsg] = useState('');
  const iaPromptRef = useRef(null);

  // --- UI ---
  const [carregando, setCarregando] = useState(false);
  const [camposCarregados, setCamposCarregados] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: 'Selecione uma conta ML e carregue os campos de veículo para começar.', type: 'info' });

  const setStatus = useCallback((text, type = 'info') => setStatusMsg({ text, type }), []);
  const getContaAtiva = useCallback(() => contasML.find(c => c.id === contaSelecionada), [contasML, contaSelecionada]);

  // =================================================================
  // EFEITOS
  // =================================================================
  useEffect(() => {
    setContasML(contasMLCtx);
    if (contasMLCtx.length > 0) setContaSelecionada(contasMLCtx[0].id);
  }, [contasMLCtx]);

  useEffect(() => {
    if (usuarioId) loadPerfis();
  }, [usuarioId]);

  // =================================================================
  // 1. CARREGAR CONFIG DO DOMÍNIO + PRIMEIRO ATRIBUTO
  // =================================================================
  const handleCarregarCamposVeiculo = async () => {
    if (!contaSelecionada || !usuarioId) {
      setStatus('Selecione uma conta ML primeiro.', 'warning');
      return;
    }
    setCarregando(true);
    setStatus('Carregando campos de veículo via API...', 'info');
    setCamposCarregados(false);
    setAttrValues({});
    setAttrSelected({});
    setResultadosBusca([]);

    try {
      const configRes = await fetch(`${API_BASE}/config?contaId=${contaSelecionada}&userId=${usuarioId}`);
      if (!configRes.ok) throw new Error('Falha ao buscar config do domínio');
      const config = await configRes.json();
      setDomainConfig(config);

      if (config.attributes && config.attributes.length > 0) {
        const firstAttr = config.attributes[0];
        const valRes = await fetch(`${API_BASE}/attribute-values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, domainId: config.domainId, attributeId: firstAttr, knownAttributes: [] }),
        });
        if (!valRes.ok) throw new Error('Falha ao buscar valores do atributo');
        const valData = await valRes.json();
        setAttrValues({ [firstAttr]: valData.values || [] });
        setCamposCarregados(true);
        setStatus(`Campos carregados para ${config.domainId.replace('MLB-', '').replace('MLA-', '').replace(/_/g, ' ')}. Selecione os filtros e busque veículos.`, 'success');
      }
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 2. CASCATA: Ao selecionar um atributo, carrega o próximo
  // =================================================================
  const handleAttrChange = async (attrId, selectedName) => {
    if (!domainConfig) return;
    const attrs = domainConfig.attributes;
    const currentIndex = attrs.indexOf(attrId);
    if (currentIndex === -1) return;

    const currentValues = attrValues[attrId] || [];
    const selectedItem = currentValues.find(v => v.name === selectedName);

    const newSelected = { ...attrSelected };
    if (selectedName && selectedItem) newSelected[attrId] = selectedItem;
    else delete newSelected[attrId];

    const newValues = { ...attrValues };
    for (let i = currentIndex + 1; i < attrs.length; i++) {
      delete newSelected[attrs[i]];
      delete newValues[attrs[i]];
    }
    setAttrSelected(newSelected);
    setAttrValues(newValues);

    if (selectedName && selectedItem && currentIndex + 1 < attrs.length) {
      const nextAttr = attrs[currentIndex + 1];
      const knownAttrs = [];
      for (let i = 0; i <= currentIndex; i++) {
        const a = attrs[i];
        const sel = (a === attrId) ? selectedItem : newSelected[a];
        if (sel) {
          const entry = { id: a };
          if (sel.id) entry.value_id = String(sel.id);
          else if (['VEHICLE_YEAR', 'YEAR'].includes(a) && sel.name) entry.value_name = sel.name;
          knownAttrs.push(entry);
        }
      }
      try {
        const valRes = await fetch(`${API_BASE}/attribute-values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, domainId: domainConfig.domainId, attributeId: nextAttr, knownAttributes: knownAttrs }),
        });
        if (valRes.ok) {
          const valData = await valRes.json();
          setAttrValues(prev => ({ ...prev, [nextAttr]: valData.values || [] }));
        }
      } catch (e) { console.error('Erro cascata:', e); }
    }
  };

  // =================================================================
  // 3. BUSCAR VEÍCULOS NO CATÁLOGO ML
  // =================================================================
  const handleBuscarVeiculosML = async () => {
    if (!domainConfig || !contaSelecionada || !usuarioId) {
      setStatus('Carregue os campos de veículo primeiro.', 'warning');
      return;
    }

    // ── CORREÇÃO CRÍTICA ───────────────────────────────────────────
    // O endpoint /catalog_compatibilities/products_search/chunks
    // exige "value_ids" como ARRAY (não "value_id" como string).
    // Formato errado → a API ignora o filtro e retorna tudo ou nada.
    // ──────────────────────────────────────────────────────────────
    const knownAttrs = [];
    for (const attrId of domainConfig.attributes) {
      const sel = attrSelected[attrId];
      if (!sel) continue;

      if (sel.id) {
        // ✅ Correto: value_ids como array
        knownAttrs.push({ id: attrId, value_ids: [String(sel.id)] });
      } else if (['VEHICLE_YEAR', 'YEAR'].includes(attrId) && sel.name) {
        // Ano pode usar value_name (a API aceita)
        knownAttrs.push({ id: attrId, value_name: sel.name });
      } else {
        // Sem value_id e não é ano → omite para não causar erro 400
        // "value_ids must not be empty" na API
        console.warn(`[compat] Atributo '${attrId}' sem value_id. Filtro omitido da busca.`);
      }
    }

    if (knownAttrs.length === 0) {
      // Igual ao Python: permite busca ampla com confirmação
      const confirmar = window.confirm(
        'Nenhum filtro selecionado.\n\nDeseja buscar TODOS os veículos do domínio?\n(Pode ser demorado e retornar muitos resultados)'
      );
      if (!confirmar) return;
    }
    setCarregando(true);
    setStatus('Buscando veículos no catálogo ML...', 'info');
    setResultadosBusca([]);
    setSelecionadosBusca(new Set());
    try {
      const res = await fetch(`${API_BASE}/search-vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, domainId: domainConfig.domainId, knownAttributes: knownAttrs, maxResults: 5000 }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.erro || 'Falha na busca'); }
      const data = await res.json();
      setResultadosBusca(data.results || []);
      setTotalBusca(data.total || 0);
      setStatus(`${(data.results || []).length} veículos encontrados (total: ${data.total || 0}).`, 'success');
    } catch (error) {
      setStatus(`Erro na busca: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 4. CARREGAR COMPATIBILIDADES DE UM ITEM ML
  // =================================================================
  const handleCarregarItemML = async () => {
    const id = itemId.trim();
    if (!id) { setStatus('Insira um Item ID válido.', 'warning'); return; }
    if (!contaSelecionada || !usuarioId) { setStatus('Selecione uma conta ML primeiro.', 'warning'); return; }
    setCarregando(true);
    setStatus(`Buscando compatibilidades do item ${id}...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/load-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, itemId: id }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.erro || 'Falha'); }
      const data = await res.json();
      const compats = data.compatibilities || [];
      setListaCompatibilidades(compats);
      setSelecionadosLista(new Set());
      if (data.context?.domainId) setItemDomainId(data.context.domainId);
      setStatus(`${compats.length} compatibilidades carregadas do item ${id}.`, 'success');
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 5. ADICIONAR SELECIONADOS DA BUSCA À LISTA
  // =================================================================
  const handleAdicionarSelecionadosDaBusca = () => {
    if (selecionadosBusca.size === 0) { setStatus('Selecione pelo menos um veículo.', 'warning'); return; }
    const existingIds = new Set(listaCompatibilidades.map(c => c.catalog_product_id || c.id));
    let addedCount = 0;
    const novosItens = [...listaCompatibilidades];
    for (const idx of selecionadosBusca) {
      const veiculo = resultadosBusca[idx];
      if (!veiculo) continue;
      if (existingIds.has(veiculo.id)) continue;
      novosItens.push({ catalog_product_id: veiculo.id, name: veiculo.name, note: '', restrictions: [], attributes: veiculo.attributes || [], creation_source: 'DEFAULT' });
      existingIds.add(veiculo.id);
      addedCount++;
    }
    setListaCompatibilidades(novosItens);
    setSelecionadosBusca(new Set());
    setStatus(`${addedCount} veículo(s) adicionados à lista.`, 'success');
  };

  // =================================================================
  // 6. DEFINIÇÃO MANUAL
  // =================================================================
  const handleAddManualConfirm = () => {
    if (!manualVehicleId.trim() && !manualVehicleName.trim()) {
      setStatus('Preencha o ID ou Nome do veículo.', 'warning'); return;
    }
    const vid = manualVehicleId.trim() || `manual_${Date.now()}`;
    if (listaCompatibilidades.some(c => (c.catalog_product_id || c.id) === vid)) {
      setStatus('Este veículo já está na lista.', 'warning'); return;
    }
    setListaCompatibilidades(prev => [...prev, {
      catalog_product_id: vid,
      name: manualVehicleName.trim() || vid,
      note: manualVehicleNote.trim(),
      restrictions: [],
      creation_source: 'DEFAULT',
    }]);
    setManualVehicleId(''); setManualVehicleName(''); setManualVehicleNote('');
    setShowModalManual(false);
    setStatus('Veículo adicionado manualmente.', 'success');
  };

  // =================================================================
  // 7. REMOVER / LIMPAR LISTA
  // =================================================================
  const handleRemoverSelecionadas = () => {
    if (selecionadosLista.size === 0) { setStatus('Selecione itens para remover.', 'warning'); return; }
    const count = selecionadosLista.size;
    setListaCompatibilidades(prev => prev.filter((_, idx) => !selecionadosLista.has(idx)));
    setSelecionadosLista(new Set());
    setStatus(`${count} item(ns) removido(s).`, 'info');
  };

  const handleLimparLista = () => {
    if (listaCompatibilidades.length === 0) return;
    if (!window.confirm('Limpar toda a lista local?')) return;
    setListaCompatibilidades([]);
    setSelecionadosLista(new Set());
    setStatus('Lista limpa.', 'info');
  };

  // =================================================================
  // 8. ABRIR MODAL DE EDIÇÃO (nota + posição)
  // =================================================================
  const handleAbrirEditModal = async (idx) => {
    const veiculo = listaCompatibilidades[idx];
    if (!veiculo) return;
    setEditIdx(idx);
    setEditNote(veiculo.note || '');

    const posAttr = Array.isArray(veiculo.restrictions)
      ? veiculo.restrictions.find(r => r.attribute_id === 'POSITION')
      : null;
    const currentPositions = posAttr
      ? (posAttr.attribute_values || []).flatMap(av => av.values || [])
      : [];
    setEditPositions(currentPositions);

    if (itemDomainId && domainConfig?.domainId && contaSelecionada && usuarioId && posicoesList.length === 0) {
      setLoadingPosicoes(true);
      try {
        const res = await fetch(`${API_BASE}/posicoes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, mainDomainId: domainConfig.domainId, secondaryDomainId: itemDomainId }),
        });
        if (res.ok) {
          const data = await res.json();
          setPosicoesList(data.values && data.values.length > 0 ? data.values : POSICOES_FALLBACK);
        } else {
          setPosicoesList(POSICOES_FALLBACK);
        }
      } catch (_) {
        setPosicoesList(POSICOES_FALLBACK);
      } finally {
        setLoadingPosicoes(false);
      }
    } else if (posicoesList.length === 0) {
      setPosicoesList(POSICOES_FALLBACK);
    }

    setShowEditModal(true);
  };

  // =================================================================
  // 9. TOGGLE POSIÇÃO no modal de edição
  // =================================================================
  const toggleEditPosition = (pos) => {
    setEditPositions(prev => {
      const exists = prev.some(p => p.value_name === pos.value_name);
      if (exists) return prev.filter(p => p.value_name !== pos.value_name);
      return [...prev, pos];
    });
  };

  // =================================================================
  // 10. SALVAR EDIÇÃO DE VEÍCULO (nota + posições)
  // =================================================================
  const handleSalvarEdicaoVeiculo = () => {
    if (editIdx === null) return;

    let restrictions = [];
    if (editPositions.length > 0) {
      restrictions = [{
        attribute_id: 'POSITION',
        attribute_values: editPositions.map(p => {
          const valData = { value_name: p.value_name };
          if (p.value_id && String(p.value_id).trim() !== '') {
             valData.value_id = String(p.value_id);
          }
          return { values: [valData] };
        }),
      }];
    }

    setListaCompatibilidades(prev => {
      const next = [...prev];
      next[editIdx] = { ...next[editIdx], note: editNote, restrictions };
      return next;
    });
    setShowEditModal(false);
    setEditIdx(null);
  };

  // =================================================================
  // 11. APLICAR LISTA AO ITEM NO ML
  // =================================================================
  const handleAplicarListaML = async () => {
    const id = itemId.trim();
    if (!id) { setStatus('Insira o Item ID antes de aplicar.', 'warning'); return; }
    if (!contaSelecionada || !usuarioId) { setStatus('Selecione uma conta ML.', 'warning'); return; }
    if (listaCompatibilidades.length === 0) {
      if (!window.confirm(`Lista vazia. Deseja REMOVER todas as compatibilidades do item ${id}?`)) return;
    } else {
      if (!window.confirm(`Aplicar ${listaCompatibilidades.length} compatibilidades ao item ${id}?`)) return;
    }
    setCarregando(true);
    setStatus(`Criando compatibilidades e aplicando posições no ML...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/apply-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, itemId: id, compatibilities: listaCompatibilidades }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.erro || data.message || 'Falha ao aplicar');
      setStatus(`Sucesso! ${data.message}`, 'success');
    } catch (error) {
      setStatus(`Erro ao aplicar: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 12. PERFIS — Salvar / Carregar / Deletar
  // =================================================================
  const loadPerfis = async () => {
    try {
      const res = await fetch(`${API_BASE}/perfis?userId=${usuarioId}`);
      if (res.ok) setPerfis(await res.json());
    } catch (_) {}
  };

  const handleSalvarPerfil = async () => {
    if (!nomePerfil.trim()) { setStatus('Digite um nome para o perfil.', 'warning'); return; }
    if (listaCompatibilidades.length === 0) { setStatus('A lista está vazia.', 'warning'); return; }
    setCarregando(true);
    try {
      const res = await fetch(`${API_BASE}/perfis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, nome: nomePerfil.trim(), descricao: '', compatibilities: listaCompatibilidades }),
      });
      if (!res.ok) throw new Error('Falha ao salvar perfil');
      const data = await res.json();
      setStatus(`Perfil "${data.nome}" salvo com ${listaCompatibilidades.length} veículos.`, 'success');
      setNomePerfil('');
      setListaCompatibilidades([]);
      setSelecionadosLista(new Set());
      await loadPerfis();
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  const handleCarregarPerfil = async (perfilId) => {
    const id = perfilId || perfilSelecionado;
    if (!id) { setStatus('Selecione um perfil.', 'warning'); return; }
    setCarregando(true);
    try {
      const res = await fetch(`${API_BASE}/perfis/${id}?userId=${usuarioId}`);
      if (!res.ok) throw new Error('Falha ao carregar perfil');
      const data = await res.json();
      setListaCompatibilidades(data.compatibilities || []);
      setSelecionadosLista(new Set());
      setNomePerfil(data.nome || '');
      setStatus(`Perfil "${data.nome}" carregado — ${(data.compatibilities || []).length} veículos.`, 'success');
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  const handleDeletarPerfil = async () => {
    if (!perfilSelecionado) return;
    const perfilInfo = perfis.find(p => p.id === perfilSelecionado);
    if (!window.confirm(`Deletar o perfil "${perfilInfo?.nome || perfilSelecionado}"?`)) return;
    try {
      await fetch(`${API_BASE}/perfis/${perfilSelecionado}?userId=${usuarioId}`, { method: 'DELETE' });
      setPerfilSelecionado('');
      setStatus('Perfil deletado.', 'info');
      await loadPerfis();
    } catch (_) { setStatus('Erro ao deletar perfil.', 'error'); }
  };

  const handleIniciarRenomear = () => {
    if (!perfilSelecionado) return;
    const perfilInfo = perfis.find(p => p.id === perfilSelecionado);
    setRenomeandoId(perfilSelecionado);
    setNovoNomePerfil(perfilInfo?.nome || '');
  };

  const handleConfirmarRenomear = async () => {
    if (!novoNomePerfil.trim()) { setStatus('Digite um nome válido.', 'warning'); return; }
    try {
      const res = await fetch(`${API_BASE}/perfis/${renomeandoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, nome: novoNomePerfil.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || `Erro ${res.status}`);
      }
      setStatus(`Perfil renomeado para "${novoNomePerfil.trim()}".`, 'success');
      setRenomeandoId(null);
      setNovoNomePerfil('');
      await loadPerfis();
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    }
  };

  // =================================================================
  // 13. ASSISTENTE IA — gerar prompt + importar IDs
  // =================================================================
  const handleAbrirAssistenteIA = () => {
    if (resultadosBusca.length === 0) {
      setStatus('Busque veículos primeiro (Passo 1) para usar o Assistente IA.', 'warning');
      return;
    }
    setIaCriterioText('');
    setIaPromptGerado('');
    setIaRespostaText('');
    setIaIdsEncontrados([]);
    setIaStatusMsg('');
    setShowAssistenteIA(true);
  };

  const handleGerarPromptIA = () => {
    if (resultadosBusca.length === 0) {
      setIaStatusMsg('⚠️ Sem veículos na busca. Feche e busque veículos primeiro.');
      return;
    }

    const catalogLines = resultadosBusca.map(v => `${v.id} | ${v.name}`);
    if (catalogLines.length > 1200) {
      setIaStatusMsg(`⚠️ Lista limitada a 1.200 veículos (${catalogLines.length} encontrados). Refine os filtros para reduzir.`);
    }

    const prompt = buildIAPrompt(catalogLines, iaCriterioText);
    setIaPromptGerado(prompt);
    setIaIdsEncontrados([]);
    setIaStatusMsg(`✅ Prompt gerado com ${Math.min(catalogLines.length, 1200)} veículos do catálogo. Copie e cole no ChatGPT/Claude.`);

    setTimeout(() => {
      if (iaPromptRef.current) {
        iaPromptRef.current.select();
      }
    }, 100);
  };

  const handleCopiarPrompt = () => {
    if (!iaPromptGerado) return;
    navigator.clipboard.writeText(iaPromptGerado)
      .then(() => setIaStatusMsg('✅ Prompt copiado para a área de transferência!'))
      .catch(() => {
        if (iaPromptRef.current) { iaPromptRef.current.select(); document.execCommand('copy'); }
        setIaStatusMsg('✅ Prompt selecionado — use Ctrl+C para copiar.');
      });
  };

  const handleAnalisarRespostaIA = () => {
    if (!iaRespostaText.trim()) {
      setIaStatusMsg('⚠️ Cole a resposta da IA no campo abaixo primeiro.');
      return;
    }
    const ids = extractVehicleIds(iaRespostaText);
    setIaIdsEncontrados(ids);
    if (ids.length === 0) {
      setIaStatusMsg('⚠️ Nenhum ID de veículo (MLBxxxxxx) encontrado na resposta. Verifique o texto.');
    } else {
      setIaStatusMsg(`✅ ${ids.length} ID(s) encontrado(s). Clique em "Importar para a Lista" para adicioná-los.`);
    }
  };

  const handleImportarIdsIA = () => {
    if (iaIdsEncontrados.length === 0) {
      setIaStatusMsg('⚠️ Analise a resposta primeiro.');
      return;
    }

    // Lookup de nome no catálogo atual
    const nameLookup = {};
    for (const v of resultadosBusca) nameLookup[v.id] = v.name;

    const existingIds = new Set(listaCompatibilidades.map(c => c.catalog_product_id || c.id));
    let addedCount = 0;
    const novosItens = [...listaCompatibilidades];

    for (const vid of iaIdsEncontrados) {
      if (existingIds.has(vid)) continue;
      novosItens.push({
        catalog_product_id: vid,
        name: nameLookup[vid] || `Veículo ${vid}`,
        note: '',
        restrictions: [],
        creation_source: 'DEFAULT',
      });
      existingIds.add(vid);
      addedCount++;
    }

    setListaCompatibilidades(novosItens);
    setShowAssistenteIA(false);
    setStatus(`${addedCount} veículo(s) importado(s) via Assistente IA (${iaIdsEncontrados.length - addedCount} já estavam na lista).`, 'success');
  };

  // =================================================================
  // TOGGLE SELEÇÃO
  // =================================================================
  const toggleBuscaSelection = (idx) => setSelecionadosBusca(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const toggleAllBusca = () => selecionadosBusca.size === resultadosBusca.length ? setSelecionadosBusca(new Set()) : setSelecionadosBusca(new Set(resultadosBusca.map((_, i) => i)));
  const toggleListaSelection = (idx) => setSelecionadosLista(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const toggleAllLista = () => selecionadosLista.size === listaCompatibilidades.length ? setSelecionadosLista(new Set()) : setSelecionadosLista(new Set(listaCompatibilidades.map((_, i) => i)));

  const getAttrDisplayName = (attrId) => {
    if (domainConfig?.attributeNames?.[attrId]) return domainConfig.attributeNames[attrId];
    return { BRAND: 'Marca', MODEL: 'Modelo', VEHICLE_YEAR: 'Ano', ENGINE: 'Motor', TRIM: 'Versão', FUEL_TYPE: 'Combustível', SHORT_VERSION: 'Versão Curta', YEAR: 'Ano' }[attrId] || attrId;
  };

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <div style={S.container}>

      {/* ── SUB-ABAS ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: 18, gap: 0 }}>
        {[
          { key: 'editor',    label: '✏️ Editor de Compatibilidade' },
          { key: 'pendentes', label: '⚠️ Compatibilidade Pendente' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            style={{
              padding: '8px 22px', fontSize: '0.88em', fontWeight: 600, border: 'none',
              borderBottom: activeSubTab === tab.key ? '3px solid #e67e22' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeSubTab === tab.key ? '#e67e22' : '#666',
              cursor: 'pointer', marginBottom: -2, whiteSpace: 'nowrap',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {activeSubTab === 'pendentes' && (
        <PendentesCompatibilidade
          usuarioId={usuarioId}
          onAbrirNoEditor={(id, contaId) => {
            setItemId(id);
            setContaSelecionada(contaId);
            setActiveSubTab('editor');
          }}
        />
      )}

      {activeSubTab === 'editor' && <>

      {/* ── TÍTULO ── */}
      <h3 style={S.titulo}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e67e22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
        Compatibilidades de Autopeças — Fitment ML
      </h3>

      {/* ── BARRA SUPERIOR ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, padding: '10px 0' }}>

        {/* Linha 1: Conta ML + Item ID */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={S.label}>Conta ML:</span>
          <select value={contaSelecionada} onChange={e => setContaSelecionada(e.target.value)} style={{ ...S.select, minWidth: 180 }}>
            <option value="">-- Selecione --</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname || c.id}</option>)}
          </select>

          <div style={S.divider} />

          <span style={S.label}>Item ID (Peça):</span>
          <input
            type="text" value={itemId} onChange={e => setItemId(e.target.value)}
            placeholder="MLB..." style={{ ...S.input, width: 155 }}
            onKeyDown={e => e.key === 'Enter' && handleCarregarItemML()}
          />
          <button onClick={handleCarregarItemML} style={S.btn} disabled={carregando}>
            Carregar Compats do Item
          </button>
        </div>

        {/* Linha 2: Perfis */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={S.label}>Salvar Perfil:</span>
          <input type="text" value={nomePerfil} onChange={e => setNomePerfil(e.target.value)} style={{ ...S.input, width: 200 }} placeholder="nome-do-perfil" />
          <button onClick={handleSalvarPerfil} style={S.btn} disabled={carregando}>💾 Salvar</button>

          <div style={S.divider} />

          <span style={S.label}>Carregar:</span>
          {renomeandoId ? (
            <>
              <input
                type="text" value={novoNomePerfil} onChange={e => setNovoNomePerfil(e.target.value)}
                style={{ ...S.input, width: 180 }} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleConfirmarRenomear(); if (e.key === 'Escape') { setRenomeandoId(null); setNovoNomePerfil(''); } }}
              />
              <button onClick={handleConfirmarRenomear} style={S.btnPrimary} disabled={carregando}>✔</button>
              <button onClick={() => { setRenomeandoId(null); setNovoNomePerfil(''); }} style={S.btn}>✕</button>
            </>
          ) : (
            <>
              <select value={perfilSelecionado} onChange={e => setPerfilSelecionado(e.target.value)} style={{ ...S.select, minWidth: 200 }}>
                <option value="">-- Carregar Perfil --</option>
                {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <button onClick={() => handleCarregarPerfil()} style={S.btn} disabled={carregando || !perfilSelecionado}>Carregar</button>
              <button onClick={handleIniciarRenomear} style={S.btn} disabled={!perfilSelecionado} title="Renomear perfil">✏️</button>
              <button onClick={handleDeletarPerfil} style={S.btnDanger} disabled={!perfilSelecionado} title="Deletar perfil">✕</button>
            </>
          )}
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div style={S.statusBar(statusMsg.type)}>
        {carregando && <span style={{ marginRight: 8 }}>⏳</span>}
        {statusMsg.text}
        {listaCompatibilidades.length > 0 && <span style={S.badge}>{listaCompatibilidades.length} veículos na lista</span>}
        {itemDomainId && <span style={{ ...S.badgeBlue, marginLeft: 8 }}>{itemDomainId}</span>}
      </div>

      {/* ── PAINÉIS ── */}
      <div style={S.painelContainer}>

        {/* ════════════════════ PAINEL ESQUERDO ════════════════════ */}
        <div style={S.painelEsquerdo}>

          {/* Passo 1: Buscar veículo */}
          <fieldset style={S.fieldset}>
            <legend style={S.legend}>Passo 1 — Buscar Veículo no Catálogo ML</legend>

            <div style={{ marginBottom: 12 }}>
              <button onClick={handleCarregarCamposVeiculo} style={{ ...S.btnPrimary, width: '100%', padding: '8px 16px' }} disabled={carregando || !contaSelecionada}>
                {camposCarregados ? '↻ Recarregar Campos de Veículo' : '▶ Carregar Campos de Veículo'}
              </button>
            </div>

            {/* Dropdowns cascata */}
            {domainConfig && domainConfig.attributes.map(attrId => {
              const values = attrValues[attrId] || [];
              const selectedVal = attrSelected[attrId]?.name || '';
              return (
                <div key={attrId} style={S.campoLinha}>
                  <span style={S.campoLabel}>{getAttrDisplayName(attrId)}:</span>
                  <select value={selectedVal} onChange={e => handleAttrChange(attrId, e.target.value)} style={{ ...S.select, flex: 1, opacity: values.length === 0 ? 0.5 : 1 }} disabled={values.length === 0 || carregando}>
                    <option value="">-- Selecione --</option>
                    {values.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                  </select>
                </div>
              );
            })}

            {!camposCarregados && (
              <p style={{ fontSize: '0.8em', color: '#adb5bd', textAlign: 'center', margin: '10px 0 4px' }}>
                Clique no botão acima para carregar os filtros.
              </p>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button onClick={handleBuscarVeiculosML} style={{ ...S.btnPrimary, flex: 1 }} disabled={carregando || !camposCarregados}>
                🔍 Buscar Veículos ML
              </button>
              <button onClick={() => setShowModalManual(true)} style={{ ...S.btn, flex: 1 }}>
                ✏️ Manual
              </button>
              {/* ── NOVO: Assistente IA ── */}
              <button
                onClick={handleAbrirAssistenteIA}
                style={{ ...S.btnIA, flex: 1 }}
                title="Gera um prompt para ChatGPT/Claude selecionar veículos automaticamente do catálogo"
              >
                🤖 Assistente IA
              </button>
            </div>

            {/* Aviso quando há resultados e assistente disponível */}
            {resultadosBusca.length > 0 && (
              <p style={{ fontSize: '0.76em', color: '#8e44ad', marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                {resultadosBusca.length} veículos no catálogo — use o Assistente IA para selecionar por critério
              </p>
            )}
          </fieldset>

          {/* Resultados da busca */}
          <fieldset style={S.fieldset}>
            <legend style={S.legend}>
              Resultados
              {resultadosBusca.length > 0 && <span style={S.badge}>{resultadosBusca.length}</span>}
            </legend>

            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>
                      <input type="checkbox" checked={resultadosBusca.length > 0 && selecionadosBusca.size === resultadosBusca.length} onChange={toggleAllBusca} disabled={resultadosBusca.length === 0} />
                    </th>
                    <th style={S.th}>ID Catálogo</th>
                    <th style={S.th}>Veículo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosBusca.length === 0 ? (
                    <tr><td colSpan="3" style={S.emptyRow}>Use os filtros e clique "Buscar Veículos ML"</td></tr>
                  ) : resultadosBusca.map((v, idx) => (
                    <tr key={v.id} style={{ backgroundColor: selecionadosBusca.has(idx) ? '#fef9f0' : 'transparent', cursor: 'pointer' }} onClick={() => toggleBuscaSelection(idx)}>
                      <td style={S.tdCheckbox}><input type="checkbox" checked={selecionadosBusca.has(idx)} onChange={() => toggleBuscaSelection(idx)} onClick={e => e.stopPropagation()} /></td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.82em' }}>{v.id}</td>
                      <td style={S.td}>{v.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 8 }}>
              <button onClick={handleAdicionarSelecionadosDaBusca} style={{ ...S.btnPrimary, width: '100%' }} disabled={selecionadosBusca.size === 0}>
                ➕ Adicionar {selecionadosBusca.size > 0 ? `${selecionadosBusca.size} selecionado(s)` : 'selecionados'} à Lista
              </button>
            </div>
          </fieldset>
        </div>

        {/* ════════════════════ PAINEL DIREITO ════════════════════ */}
        <div style={S.painelDireito}>
          <fieldset style={{ ...S.fieldset, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <legend style={S.legend}>
              Passo 2 — Lista de Compatibilidades
              {listaCompatibilidades.length > 0 && <span style={S.badge}>{listaCompatibilidades.length}</span>}
              <span style={{ fontSize: '0.78em', color: '#7f8c8d', fontWeight: 400, marginLeft: 8 }}>
                Clique em ✏️ para editar nota e posição de instalação
              </span>
            </legend>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4, minHeight: 350, maxHeight: 480 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>
                      <input type="checkbox" checked={listaCompatibilidades.length > 0 && selecionadosLista.size === listaCompatibilidades.length} onChange={toggleAllLista} disabled={listaCompatibilidades.length === 0} />
                    </th>
                    <th style={S.th}>ID / Catálogo</th>
                    <th style={S.th}>Veículo</th>
                    <th style={S.th}>Nota</th>
                    <th style={S.th}>Posição</th>
                    <th style={{ ...S.th, width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {listaCompatibilidades.length === 0 ? (
                    <tr><td colSpan="6" style={S.emptyRow}>Lista vazia — adicione veículos pela busca, manualmente ou carregue um perfil</td></tr>
                  ) : listaCompatibilidades.map((compat, idx) => {
                    const posStr = formatRestrictions(compat.restrictions);
                    return (
                      <tr key={`${compat.catalog_product_id || compat.id}-${idx}`} style={{ backgroundColor: selecionadosLista.has(idx) ? '#fef9f0' : 'transparent' }}>
                        <td style={S.tdCheckbox} onClick={() => toggleListaSelection(idx)}>
                          <input type="checkbox" checked={selecionadosLista.has(idx)} onChange={() => toggleListaSelection(idx)} />
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.8em' }}>{compat.catalog_product_id || compat.id || '—'}</td>
                        <td style={S.td}>{compat.name || '—'}</td>
                        <td style={{ ...S.td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {compat.note || <span style={{ color: '#adb5bd' }}>—</span>}
                        </td>
                        <td style={S.td}>
                          {posStr !== '—' ? (
                            <span style={S.badgeGreen}>{posStr}</span>
                          ) : (
                            <span style={{ color: '#adb5bd' }}>—</span>
                          )}
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <button onClick={() => handleAbrirEditModal(idx)} style={S.btnIconSmall} title="Editar nota e posição">✏️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Ações da lista */}
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={handleRemoverSelecionadas} style={{ ...S.btnDanger, flex: 1 }} disabled={selecionadosLista.size === 0}>
                Remover {selecionadosLista.size > 0 ? `${selecionadosLista.size} selecionado(s)` : 'selecionados'}
              </button>
              <button onClick={handleLimparLista} style={{ ...S.btn, flex: 1 }} disabled={listaCompatibilidades.length === 0}>
                🗑️ Limpar Lista
              </button>
            </div>
          </fieldset>
        </div>
      </div>

      {/* ── BOTÃO APLICAR NO ML ── */}
      <button
        onClick={handleAplicarListaML}
        style={{ ...S.btnSuccess, opacity: (carregando || !itemId.trim()) ? 0.6 : 1, cursor: (carregando || !itemId.trim()) ? 'not-allowed' : 'pointer' }}
        disabled={carregando || !itemId.trim()}
        onMouseEnter={e => { if (!carregando && itemId.trim()) e.currentTarget.style.backgroundColor = '#219a52'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#27ae60'; }}
      >
        {carregando ? '⏳ Enviando...' : `🚀 Aplicar Lista (${listaCompatibilidades.length} veículos) ao Item no ML`}
      </button>

      {/* ════════════════════════════════════════════════════════
          MODAL: EDIÇÃO DE VEÍCULO (nota + posição)
      ════════════════════════════════════════════════════════ */}
      {showEditModal && editIdx !== null && (
        <div style={S.overlay} onClick={() => setShowEditModal(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 4px', color: '#2c3e50', fontSize: '1em', fontWeight: 700 }}>
              ✏️ Editar Compatibilidade
            </h4>
            <p style={{ margin: '0 0 16px', fontSize: '0.82em', color: '#7f8c8d' }}>
              {listaCompatibilidades[editIdx]?.name}
            </p>

            {/* Nota */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>
                Nota de Compatibilidade
                <span style={{ color: '#999', fontWeight: 400 }}> (máx. 500 caracteres)</span>
              </label>
              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex: Apenas modelos com freios a disco traseiros"
                style={{ ...S.input, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 70, fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: '0.77em', color: '#adb5bd', textAlign: 'right' }}>{editNote.length}/500</div>
            </div>

            {/* Posição de instalação */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                Posição de Instalação
                {loadingPosicoes && <span style={{ fontSize: '0.75em', color: '#999' }}>⏳ Carregando...</span>}
                {!loadingPosicoes && itemDomainId && <span style={{ ...S.badgeBlue }}>API ML</span>}
                {!loadingPosicoes && !itemDomainId && <span style={{ fontSize: '0.75em', color: '#999' }}>(carregue um item para posições validadas)</span>}
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {posicoesList.map(pos => {
                  const selected = editPositions.some(p => p.value_name === pos.value_name);
                  return (
                    <button
                      key={pos.value_name}
                      onClick={() => toggleEditPosition(pos)}
                      style={{
                        padding: '4px 12px', fontSize: '0.82em', borderRadius: 20, cursor: 'pointer', fontWeight: selected ? 700 : 400,
                        border: `1.5px solid ${selected ? '#27ae60' : '#ccc'}`,
                        backgroundColor: selected ? '#d4edda' : '#f8f9fa',
                        color: selected ? '#155724' : '#555',
                        transition: 'all 0.12s',
                      }}
                    >
                      {selected ? '✓ ' : ''}{pos.value_name}
                    </button>
                  );
                })}
              </div>

              {editPositions.length > 0 && (
                <div style={{ marginTop: 8, padding: '6px 10px', backgroundColor: '#d4edda', borderRadius: 4, fontSize: '0.82em', color: '#155724' }}>
                  <strong>Posições selecionadas:</strong> {editPositions.map(p => p.value_name).join(', ')}
                  <button onClick={() => setEditPositions([])} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#721c24', fontWeight: 700 }}>✕ Limpar</button>
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: 14 }}>
              <button onClick={() => setShowEditModal(false)} style={S.btn}>Cancelar</button>
              <button onClick={handleSalvarEdicaoVeiculo} style={S.btnPrimary}>✔ Salvar Edição</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL: Definição Manual
      ════════════════════════════════════════════════════════ */}
      {showModalManual && (
        <div style={S.overlay} onClick={() => setShowModalManual(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 16px', color: '#2c3e50', fontSize: '1em' }}>✏️ Adicionar Veículo Manualmente</h4>

            <div style={{ marginBottom: 12 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>ID do Catálogo (opcional):</label>
              <input type="text" value={manualVehicleId} onChange={e => setManualVehicleId(e.target.value)} placeholder="Ex: MLB12345" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>Nome / Descrição do Veículo:</label>
              <input type="text" value={manualVehicleName} onChange={e => setManualVehicleName(e.target.value)} placeholder="Ex: Toyota Corolla 2020 1.8" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>Nota (opcional):</label>
              <input type="text" value={manualVehicleNote} onChange={e => setManualVehicleNote(e.target.value)} placeholder="Ex: Verificar compatibilidade" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModalManual(false)} style={S.btn}>Cancelar</button>
              <button onClick={handleAddManualConfirm} style={S.btnPrimary}>Adicionar à Lista</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL: Assistente IA (ChatGPT/Claude)
          Fluxo: Gerar Prompt → Copiar → Colar no ChatGPT → 
                 Colar resposta aqui → Importar IDs
      ════════════════════════════════════════════════════════ */}
      {showAssistenteIA && (
        <div style={S.overlay} onClick={() => setShowAssistenteIA(false)}>
          <div style={S.modalIA} onClick={e => e.stopPropagation()}>

            {/* Título */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, color: '#2c3e50', fontSize: '1.05em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                🤖 Assistente IA — Seleção de Veículos por Critério
                <span style={S.badgeIA}>{resultadosBusca.length} veículos no catálogo</span>
              </h4>
              <button onClick={() => setShowAssistenteIA(false)} style={{ ...S.btn, padding: '3px 10px', fontSize: '1em', lineHeight: 1 }}>✕</button>
            </div>

            <p style={{ margin: 0, fontSize: '0.82em', color: '#7f8c8d', lineHeight: 1.5 }}>
              Este assistente gera um prompt com o catálogo atual para você colar no <strong>ChatGPT</strong> ou <strong>Claude</strong>.
              A IA retorna apenas os IDs dos veículos compatíveis, que são importados automaticamente para a sua lista.
            </p>

            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: 0 }} />

            {/* Passo 1: Critério */}
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: 6, fontSize: '0.88em' }}>
                <strong>Passo 1</strong> — Descreva quais veículos você quer (texto livre):
              </label>
              <textarea
                value={iaCriterioText}
                onChange={e => setIaCriterioText(e.target.value)}
                rows={4}
                placeholder={`Ex:\nToyota Corolla 2018 a 2023\nHonda Civic 2019 a 2022 (todos os motores)\nVW Jetta 2015 em diante`}
                style={{ ...S.textarea, minHeight: 90 }}
              />
            </div>

            {/* Passo 2: Gerar prompt */}
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={handleGerarPromptIA} style={{ ...S.btnPrimary, flex: 1 }}>
                  ① Gerar Prompt com Catálogo Atual
                </button>
                <button
                  onClick={handleCopiarPrompt}
                  style={{ ...S.btn, flex: 1 }}
                  disabled={!iaPromptGerado}
                >
                  📋 Copiar Prompt
                </button>
                <button
                  onClick={() => window.open('https://chatgpt.com/', '_blank')}
                  style={{ ...S.btn }}
                  title="Abrir ChatGPT"
                >
                  🔗 ChatGPT
                </button>
                <button
                  onClick={() => window.open('https://claude.ai/', '_blank')}
                  style={{ ...S.btn }}
                  title="Abrir Claude"
                >
                  🔗 Claude
                </button>
              </div>
              <label style={{ ...S.label, display: 'block', marginBottom: 4, fontSize: '0.82em' }}>
                <strong>Passo 2</strong> — Prompt gerado (copie e cole em um chat novo da IA):
              </label>
              <textarea
                ref={iaPromptRef}
                value={iaPromptGerado}
                readOnly
                rows={7}
                placeholder="Clique em 'Gerar Prompt' para criar o prompt com o catálogo atual..."
                style={{ ...S.textarea, backgroundColor: iaPromptGerado ? '#f0f8ff' : '#f9f9f9', cursor: 'text' }}
                onClick={e => e.target.select()}
              />
              {iaPromptGerado && resultadosBusca.length > 1200 && (
                <p style={{ fontSize: '0.76em', color: '#e67e22', margin: '4px 0 0' }}>
                  ⚠️ O catálogo tem {resultadosBusca.length} veículos, mas o prompt foi limitado a 1.200 para caber melhor na IA.
                  Refine os filtros de Marca/Modelo/Ano para um resultado mais preciso.
                </p>
              )}
            </div>

            {/* Passo 3: Resposta da IA */}
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: 4, fontSize: '0.82em' }}>
                <strong>Passo 3</strong> — Cole aqui a resposta da IA (IDs de veículos):
              </label>
              <textarea
                value={iaRespostaText}
                onChange={e => { setIaRespostaText(e.target.value); setIaIdsEncontrados([]); setIaStatusMsg(''); }}
                rows={6}
                placeholder="Cole aqui a resposta do ChatGPT ou Claude..."
                style={{ ...S.textarea, minHeight: 110 }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleAnalisarRespostaIA} style={{ ...S.btnPrimary, flex: 1 }} disabled={!iaRespostaText.trim()}>
                  🔍 Analisar Resposta e Extrair IDs
                </button>
                <button
                  onClick={handleImportarIdsIA}
                  style={{
                    ...S.btn, flex: 1, fontWeight: 600,
                    backgroundColor: iaIdsEncontrados.length > 0 ? '#27ae60' : undefined,
                    color: iaIdsEncontrados.length > 0 ? '#fff' : undefined,
                    border: iaIdsEncontrados.length > 0 ? 'none' : undefined,
                  }}
                  disabled={iaIdsEncontrados.length === 0}
                >
                  ✅ Importar {iaIdsEncontrados.length > 0 ? `${iaIdsEncontrados.length} IDs` : 'IDs'} para a Lista
                </button>
              </div>
            </div>

            {/* IDs encontrados — preview */}
            {iaIdsEncontrados.length > 0 && (
              <div style={{ padding: '10px 14px', backgroundColor: '#d4edda', borderRadius: 6, border: '1px solid #c3e6cb', fontSize: '0.82em' }}>
                <strong style={{ color: '#155724' }}>✅ {iaIdsEncontrados.length} ID(s) encontrado(s):</strong>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {iaIdsEncontrados.slice(0, 30).map(id => (
                    <span key={id} style={{ fontFamily: 'monospace', backgroundColor: '#fff', padding: '2px 7px', borderRadius: 3, border: '1px solid #bee5be', fontSize: '0.9em' }}>{id}</span>
                  ))}
                  {iaIdsEncontrados.length > 30 && (
                    <span style={{ color: '#6c757d', fontSize: '0.9em', alignSelf: 'center' }}>+ {iaIdsEncontrados.length - 30} mais...</span>
                  )}
                </div>
              </div>
            )}

            {/* Status do assistente */}
            {iaStatusMsg && (
              <div style={{
                padding: '8px 12px', borderRadius: 4, fontSize: '0.83em',
                backgroundColor: iaStatusMsg.startsWith('⚠️') ? '#fff3cd' : iaStatusMsg.startsWith('✅') ? '#d4edda' : '#e7f3fe',
                color: iaStatusMsg.startsWith('⚠️') ? '#856404' : iaStatusMsg.startsWith('✅') ? '#155724' : '#0c549c',
                border: iaStatusMsg.startsWith('⚠️') ? '1px solid #ffeeba' : iaStatusMsg.startsWith('✅') ? '1px solid #c3e6cb' : '1px solid #d0eaff',
              }}>
                {iaStatusMsg}
              </div>
            )}
          </div>
        </div>
      )}
      </>}

    </div>
  );
}
