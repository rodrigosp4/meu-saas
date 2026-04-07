import React, { useState, useEffect, useCallback } from 'react';
import { useContasML } from '../contexts/ContasMLContext';

// Extrai a string de dimensões do dadosML
function getDimStr(anuncio) {
  return anuncio.dadosML?.shipping?.dimensions || null;
}

// Converte "LxAxC,P" para objeto legível
function parseDimStr(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return { largura: match[1], altura: match[2], comprimento: match[3], peso: match[4] };
}

function buildDimStr(largura, altura, comprimento, peso) {
  return `${largura}x${altura}x${comprimento},${peso}`;
}

function StatusBadge({ temDimensoes }) {
  return temDimensoes
    ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: 9, fontSize: '0.78em', fontWeight: 600 }}>Concluído</span>
    : <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: 9, fontSize: '0.78em', fontWeight: 600 }}>Pendente</span>;
}

export default function DimensoesEmbalagem({ usuarioId }) {
  const { contas: contasMLCtx } = useContasML();
  const [contas, setContas] = useState([]);
  const [contasSelecionadas, setContasSelecionadas] = useState([]);
  const [anuncios, setAnuncios] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos'); // todos | pendente | concluido
  const [filtroApenasComEstoque, setFiltroApenasComEstoque] = useState(false);
  const [ocultarCatalogo, setOcultarCatalogo] = useState(true);
  const [agruparPorSKU, setAgruparPorSKU] = useState(false);
  const [skusExpandidos, setSkusExpandidos] = useState(new Set());
  const [gruposSKU, setGruposSKU] = useState([]);
  const [totalGrupos, setTotalGrupos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState(new Set());
  const [modalAberto, setModalAberto] = useState(false);
  const [modalLargura, setModalLargura] = useState('');
  const [modalAltura, setModalAltura] = useState('');
  const [modalComprimento, setModalComprimento] = useState('');
  const [modalPeso, setModalPeso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [atualizandoML, setAtualizandoML] = useState(false);
  const [carregandoTodos, setCarregandoTodos] = useState(false);
  const LIMIT = 50;

  useEffect(() => {
    setContas(contasMLCtx);
    setContasSelecionadas(contasMLCtx.map(c => c.id));
  }, [contasMLCtx]);

  const buscarAnuncios = useCallback(async (pg = 1) => {
    if (contasSelecionadas.length === 0) { setAnuncios([]); setTotal(0); return; }
    setLoading(true);
    setSelecionados(new Set());
    try {
      const params = new URLSearchParams({
        contasIds: contasSelecionadas.join(','),
        search,
        page: pg,
        limit: LIMIT,
        status: 'Todos',
      });
      const res = await fetch(`/api/ml/anuncios?${params}`);
      if (!res.ok) throw new Error('Erro ao buscar anúncios');
      const data = await res.json();
      let lista = data.anuncios || [];

      // Filtra localmente por status de dimensões
      if (filtroStatus === 'pendente') {
        lista = lista.filter(a => !getDimStr(a));
      } else if (filtroStatus === 'concluido') {
        lista = lista.filter(a => !!getDimStr(a));
      }

      // Oculta anúncios de catálogo (catalog_product_id preenchido)
      if (ocultarCatalogo) {
        lista = lista.filter(a => !a.dadosML?.catalog_product_id);
      }

      if (filtroApenasComEstoque) {
        lista = lista.filter(a => a.estoque > 0);
      }

      setAnuncios(lista);
      setTotal(filtroStatus === 'todos' ? (data.total || lista.length) : lista.length);
      setPage(pg);
    } catch (e) {
      alert('Erro ao buscar anúncios: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [contasSelecionadas, search, filtroStatus, ocultarCatalogo, filtroApenasComEstoque]);

  const buscarGruposSKU = useCallback(async () => {
    if (contasSelecionadas.length === 0) { setGruposSKU([]); setTotalGrupos(0); return; }
    setLoading(true);
    setSkusExpandidos(new Set());
    setSelecionados(new Set());
    try {
      const params = new URLSearchParams({
        contasIds: contasSelecionadas.join(','),
        search,
        filtroStatus,
        ocultarCatalogo: String(ocultarCatalogo),
        filtroApenasComEstoque: String(filtroApenasComEstoque),
      });
      const res = await fetch(`/api/ml/dimensoes-embalagem/por-sku?${params}`);
      if (!res.ok) throw new Error('Erro ao buscar grupos por SKU');
      const data = await res.json();
      setGruposSKU(data.grupos || []);
      setTotalGrupos(data.totalGrupos || 0);
    } catch (e) {
      alert('Erro ao buscar grupos: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [contasSelecionadas, search, filtroStatus, ocultarCatalogo, filtroApenasComEstoque]);

  useEffect(() => {
    if (contasSelecionadas.length === 0) return;
    if (agruparPorSKU) buscarGruposSKU();
    else buscarAnuncios(1);
  }, [contasSelecionadas, filtroStatus, ocultarCatalogo, filtroApenasComEstoque, agruparPorSKU]);

  const toggleConta = (id) => {
    setContasSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelecionado = (id) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    const lista = agruparPorSKU ? todosItensGrupos : anuncios;
    if (selecionados.size === lista.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(lista.map(a => a.id)));
    }
  };

  const getItensSelecionados = () =>
    todosItensGrupos.filter(a => selecionados.has(a.id)).map(a => ({ id: a.id, contaId: a.contaId }));

  // Seleciona todos os IDs filtrados (todas as páginas)
  const selecionarTodosFiltrados = async () => {
    if (contasSelecionadas.length === 0) return;
    setCarregandoTodos(true);
    try {
      const params = new URLSearchParams({
        contasIds: contasSelecionadas.join(','),
        search,
        status: 'Todos',
      });
      const res = await fetch(`/api/ml/anuncios/ids?${params}`);
      if (!res.ok) throw new Error('Erro ao buscar IDs');
      const data = await res.json();
      setSelecionados(new Set(data.ids || []));
    } catch (e) {
      alert('Erro ao selecionar todos: ' + e.message);
    } finally {
      setCarregandoTodos(false);
    }
  };

  // Busca dimensões ao vivo do ML para os itens da página atual e atualiza a tabela
  const atualizarDimensoesDoML = async () => {
    if (anuncios.length === 0) return;
    setAtualizandoML(true);
    try {
      const items = anuncios.map(a => ({ id: a.id, contaId: a.contaId }));
      const res = await fetch('/api/ml/buscar-dimensoes-ml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao buscar');

      // Atualiza localmente sem rebuscar do servidor
      setAnuncios(prev => prev.map(a => {
        const dim = data.resultado?.[a.id];
        if (dim === undefined) return a;
        return {
          ...a,
          dadosML: {
            ...(a.dadosML || {}),
            shipping: { ...(a.dadosML?.shipping || {}), dimensions: dim }
          }
        };
      }));
    } catch (e) {
      alert('Erro ao buscar dimensões do ML: ' + e.message);
    } finally {
      setAtualizandoML(false);
    }
  };

  const enviarParaFila = async (modo) => {
    const itens = getItensSelecionados();
    if (itens.length === 0) return alert('Selecione ao menos um anúncio.');

    if (modo === 'novas') {
      if (!modalLargura || !modalAltura || !modalComprimento || !modalPeso) {
        return alert('Preencha todos os campos de dimensão.');
      }
      const l = Number(modalLargura), a = Number(modalAltura), c = Number(modalComprimento), p = Number(modalPeso);
      if ([l, a, c, p].some(v => isNaN(v) || v <= 0)) {
        return alert('Todos os valores devem ser números positivos.');
      }
    } else {
      // Verifica se todos os selecionados têm dimensões
      const semDim = todosItensGrupos.filter(a => selecionados.has(a.id) && !getDimStr(a));
      if (semDim.length > 0) {
        return alert(`${semDim.length} item(ns) selecionado(s) não possui(em) dimensões cadastradas para reenvio.`);
      }
    }

    const dimensoes = modo === 'novas'
      ? buildDimStr(modalLargura, modalAltura, modalComprimento, modalPeso)
      : null;

    setEnviando(true);
    try {
      const res = await fetch('/api/ml/dimensoes-embalagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items: itens, modo, dimensoes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
      setModalAberto(false);
      alert(`✅ ${itens.length} item(ns) enviado(s) para a fila! Acompanhe em "Gerenciador de Fila".`);
      setSelecionados(new Set());
    } catch (e) {
      alert('Erro ao enviar: ' + e.message);
    } finally {
      setEnviando(false);
    }
  };

  const toggleSKUExpandido = (sku) => {
    setSkusExpandidos(prev => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  };

  // Para verificação de "reenviar existentes" no modo agrupado,
  // coletamos todos os itens expandidos/selecionados de todos os grupos
  const todosItensGrupos = React.useMemo(() => {
    if (!agruparPorSKU) return anuncios;
    return gruposSKU.flatMap(g => g.itens);
  }, [agruparPorSKU, gruposSKU, anuncios]);

  const totalPages = Math.ceil(total / LIMIT);
  const listaAtiva = agruparPorSKU ? todosItensGrupos : anuncios;
  const todosCheck = listaAtiva.length > 0 && selecionados.size === listaAtiva.length;
  const algumCheck = selecionados.size > 0 && selecionados.size < listaAtiva.length;

  const conteinerStyle = { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" };

  return (
    <div style={conteinerStyle}>
      {/* ====== FILTROS ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end'
      }}>
        {/* Busca */}
        <div style={{ flex: '1 1 220px' }}>
          <label style={{ fontSize: '0.78em', color: '#666', display: 'block', marginBottom: 4 }}>Buscar (título / SKU / MLB)</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarAnuncios(1)}
            placeholder="Digite e pressione Enter..."
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9em', boxSizing: 'border-box' }}
          />
        </div>

        {/* Status dimensões */}
        <div>
          <label style={{ fontSize: '0.78em', color: '#666', display: 'block', marginBottom: 4 }}>Status</label>
          <select
            value={filtroStatus}
            onChange={e => { setFiltroStatus(e.target.value); }}
            style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9em' }}
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendente (sem dimensão)</option>
            <option value="concluido">Concluído (com dimensão)</option>
          </select>
        </div>

        {/* Filtro catálogo */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85em', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={ocultarCatalogo}
            onChange={e => setOcultarCatalogo(e.target.checked)}
          />
          Ocultar catálogo
        </label>

        {/* Filtro estoque */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85em', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={filtroApenasComEstoque}
            onChange={e => setFiltroApenasComEstoque(e.target.checked)}
          />
          Apenas c/ estoque
        </label>

        {/* Agrupar por SKU */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85em', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={agruparPorSKU}
            onChange={e => { setAgruparPorSKU(e.target.checked); setSkusExpandidos(new Set()); }}
          />
          Agrupar por SKU
        </label>

        {/* Botão buscar */}
        <button
          onClick={() => agruparPorSKU ? buscarGruposSKU() : buscarAnuncios(1)}
          disabled={loading}
          style={{
            padding: '7px 18px', background: '#2d3e50', color: '#fff', border: 'none',
            borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.9em', fontFamily: 'inherit'
          }}
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>

        <button
          onClick={atualizarDimensoesDoML}
          disabled={atualizandoML || anuncios.length === 0}
          title="Busca as dimensões atuais direto do ML para os itens desta página"
          style={{
            padding: '7px 16px', background: '#27ae60', color: '#fff', border: 'none',
            borderRadius: 6, cursor: (atualizandoML || anuncios.length === 0) ? 'not-allowed' : 'pointer',
            fontSize: '0.9em', fontFamily: 'inherit'
          }}
        >
          {atualizandoML ? '⏳ Buscando do ML...' : '🔍 Atualizar via ML'}
        </button>

        {/* Contas */}
        {contas.length > 0 && (
          <div>
            <label style={{ fontSize: '0.78em', color: '#666', display: 'block', marginBottom: 4 }}>Contas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {contas.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85em', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={contasSelecionadas.includes(c.id)}
                    onChange={() => toggleConta(c.id)}
                  />
                  {c.nickname}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ====== BARRA DE AÇÕES ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '10px 16px', marginBottom: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '0.9em', color: '#555' }}>
          {selecionados.size > 0
            ? <strong>{selecionados.size} selecionado(s)</strong>
            : agruparPorSKU
              ? `${totalGrupos} SKU(s) agrupado(s)`
              : `${total} anúncio(s) encontrado(s)`}
        </span>

        <button
          onClick={selecionarTodosFiltrados}
          disabled={carregandoTodos || contasSelecionadas.length === 0}
          title={`Seleciona todos os ${total} anúncios dos filtros atuais`}
          style={{
            padding: '6px 14px', background: 'transparent', color: '#2d3e50',
            border: '1px solid #2d3e50', borderRadius: 6,
            cursor: (carregandoTodos || contasSelecionadas.length === 0) ? 'not-allowed' : 'pointer',
            fontSize: '0.85em', fontFamily: 'inherit'
          }}
        >
          {carregandoTodos ? 'Selecionando...' : `Selecionar Todos (${total})`}
        </button>

        {selecionados.size > 0 && (
          <button
            onClick={() => setSelecionados(new Set())}
            style={{
              padding: '6px 12px', background: 'transparent', color: '#888',
              border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
              fontSize: '0.85em', fontFamily: 'inherit'
            }}
          >
            Limpar
          </button>
        )}

        <div style={{ flex: 1 }} />

        {selecionados.size > 0 && (
          <>
            <button
              onClick={() => setModalAberto(true)}
              style={{
                padding: '7px 16px', background: '#e67e22', color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontSize: '0.88em', fontFamily: 'inherit', fontWeight: 600
              }}
            >
              📦 Informar Novas Dimensões
            </button>
            <button
              onClick={() => enviarParaFila('existentes')}
              disabled={enviando}
              style={{
                padding: '7px 16px', background: '#2980b9', color: '#fff', border: 'none',
                borderRadius: 6, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: '0.88em', fontFamily: 'inherit', fontWeight: 600
              }}
            >
              🔄 Reenviar Dimensões Existentes
            </button>
          </>
        )}
      </div>

      {/* ====== TABELA ====== */}
      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>
        ) : anuncios.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
            Nenhum anúncio encontrado. Use os filtros e clique em Buscar.
          </div>
        ) : agruparPorSKU ? (
          /* ====== VISÃO AGRUPADA POR SKU ====== */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
            <thead>
              <tr style={{ background: '#f4f6f8', borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 36 }}></th>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 140 }}>SKU</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', width: 80 }}>Qtd</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Dimensões encontradas</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', width: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {gruposSKU.map(({ sku, itens, dims, temDivergencia, temPendente }) => {
                const expandido = skusExpandidos.has(sku);
                const skuLabel = sku === '__sem_sku__' ? <span style={{ color: '#bbb', fontStyle: 'italic' }}>Sem SKU</span> : sku;
                const rowBg = temDivergencia ? '#fff5f5' : temPendente ? '#fffdf0' : '#f6fff8';
                const statusLabel = temDivergencia
                  ? <span style={{ background: '#fde8e8', color: '#c0392b', padding: '2px 8px', borderRadius: 9, fontSize: '0.78em', fontWeight: 700 }}>⚠ Divergência</span>
                  : temPendente
                    ? <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: 9, fontSize: '0.78em', fontWeight: 600 }}>Pendente</span>
                    : <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: 9, fontSize: '0.78em', fontWeight: 600 }}>Concluído</span>;
                return (
                  <React.Fragment key={sku}>
                    <tr
                      style={{ background: rowBg, borderBottom: expandido ? 'none' : '1px solid #eee', cursor: 'pointer' }}
                      onClick={() => toggleSKUExpandido(sku)}
                    >
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#888', fontSize: '0.9em' }}>
                        {expandido ? '▾' : '▸'}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 600, color: '#2c3e50' }}>{skuLabel}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#555' }}>{itens.length}</td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {dims.filter(Boolean).length === 0 ? (
                            <span style={{ color: '#ccc', fontSize: '0.82em' }}>Não informado</span>
                          ) : dims.filter(Boolean).map((d, i) => {
                            const parsed = parseDimStr(d);
                            return (
                              <span key={i} style={{
                                background: temDivergencia ? (i === 0 ? '#fde8e8' : '#fef0e8') : '#eef4ff',
                                border: `1px solid ${temDivergencia ? '#f5c6c6' : '#c8daf5'}`,
                                borderRadius: 5, padding: '2px 8px', fontSize: '0.8em', color: '#444'
                              }}>
                                {parsed
                                  ? `L${parsed.largura}×A${parsed.altura}×C${parsed.comprimento} / ${parsed.peso}g`
                                  : d}
                                {temDivergencia && <span style={{ marginLeft: 4, color: '#c0392b', fontWeight: 700 }}>#{i + 1}</span>}
                              </span>
                            );
                          })}
                          {temPendente && (
                            <span style={{ background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: 5, padding: '2px 8px', fontSize: '0.8em', color: '#856404' }}>
                              {itens.filter(a => !getDimStr(a)).length}× sem dimensão
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{statusLabel}</td>
                    </tr>
                    {expandido && itens.map((ad, idx) => {
                      const dimStr = getDimStr(ad);
                      const dim = parseDimStr(dimStr);
                      const isSel = selecionados.has(ad.id);
                      return (
                        <tr
                          key={ad.id}
                          style={{
                            background: isSel ? '#fff8f0' : (idx % 2 === 0 ? '#fafeff' : '#f5fafe'),
                            borderBottom: idx === itens.length - 1 ? '2px solid #e0e0e0' : '1px solid #eee',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleSelecionado(ad.id)}
                        >
                          <td style={{ padding: '6px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelecionado(ad.id)} style={{ cursor: 'pointer' }} />
                          </td>
                          <td colSpan={2} style={{ padding: '6px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {ad.thumbnail
                                ? <img src={ad.thumbnail} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 3, border: '1px solid #eee', flexShrink: 0 }} />
                                : <div style={{ width: 32, height: 32, background: '#f0f0f0', borderRadius: 3, flexShrink: 0 }} />}
                              <div>
                                <div style={{ fontWeight: 500, color: '#2c3e50', fontSize: '0.9em', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.titulo}>{ad.titulo}</div>
                                <div style={{ fontSize: '0.78em', color: '#888' }}>{ad.id} · {ad.conta?.nickname || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {dim ? (
                              <span style={{ fontSize: '0.82em', color: '#444' }}>
                                L{dim.largura}×A{dim.altura}×C{dim.comprimento} / {dim.peso}g
                              </span>
                            ) : <span style={{ color: '#ccc', fontSize: '0.82em' }}>Não informado</span>}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <StatusBadge temDimensoes={!!dimStr} />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* ====== VISÃO NORMAL (lista) ====== */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
            <thead>
              <tr style={{ background: '#f4f6f8', borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={todosCheck}
                    ref={el => { if (el) el.indeterminate = algumCheck; }}
                    onChange={toggleTodos}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 50 }}></th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Anúncio</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 110 }}>MLB</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 120 }}>SKU</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 130 }}>Conta</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', width: 220 }}>Dimensões Atuais</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', width: 100 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {anuncios.map((ad, idx) => {
                const dimStr = getDimStr(ad);
                const dim = parseDimStr(dimStr);
                const isSel = selecionados.has(ad.id);
                return (
                  <tr
                    key={ad.id}
                    style={{
                      background: isSel ? '#fff8f0' : (idx % 2 === 0 ? '#fff' : '#fafafa'),
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleSelecionado(ad.id)}
                  >
                    <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelecionado(ad.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      {ad.thumbnail
                        ? <img src={ad.thumbnail} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, border: '1px solid #eee' }} />
                        : <div style={{ width: 40, height: 40, background: '#f0f0f0', borderRadius: 4 }} />}
                    </td>
                    <td style={{ padding: '8px', maxWidth: 260 }}>
                      <div style={{ fontWeight: 500, color: '#2c3e50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.titulo}>
                        {ad.titulo}
                      </div>
                    </td>
                    <td style={{ padding: '8px', color: '#666', fontSize: '0.85em' }}>{ad.id}</td>
                    <td style={{ padding: '8px', color: '#666', fontSize: '0.85em' }}>{ad.sku || <span style={{ color: '#bbb' }}>—</span>}</td>
                    <td style={{ padding: '8px', color: '#666', fontSize: '0.85em' }}>{ad.conta?.nickname || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {dim ? (
                        <div style={{ fontSize: '0.82em', color: '#444', lineHeight: 1.5 }}>
                          <div>
                            <span style={{ color: '#888' }}>L</span> {dim.largura}cm ×{' '}
                            <span style={{ color: '#888' }}>A</span> {dim.altura}cm ×{' '}
                            <span style={{ color: '#888' }}>C</span> {dim.comprimento}cm
                          </div>
                          <div><span style={{ color: '#888' }}>Peso</span> {dim.peso}g</div>
                        </div>
                      ) : dimStr ? (
                        <span style={{ fontSize: '0.82em', color: '#666' }}>{dimStr}</span>
                      ) : (
                        <span style={{ color: '#ccc', fontSize: '0.82em' }}>Não informado</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <StatusBadge temDimensoes={!!dimStr} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ====== PAGINAÇÃO ====== */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => buscarAnuncios(page - 1)}
            disabled={page === 1 || loading}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', cursor: page === 1 ? 'not-allowed' : 'pointer', background: '#fff', fontFamily: 'inherit' }}
          >
            ← Anterior
          </button>
          <span style={{ padding: '6px 12px', color: '#555', fontSize: '0.9em' }}>
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => buscarAnuncios(page + 1)}
            disabled={page === totalPages || loading}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', cursor: page === totalPages ? 'not-allowed' : 'pointer', background: '#fff', fontFamily: 'inherit' }}
          >
            Próxima →
          </button>
        </div>
      )}

      {/* ====== MODAL: NOVAS DIMENSÕES ====== */}
      {modalAberto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 28, width: 420, maxWidth: '95vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
          }}>
            <h3 style={{ margin: '0 0 6px', color: '#2c3e50', fontSize: '1.1em' }}>📦 Informar Novas Dimensões</h3>
            <p style={{ margin: '0 0 18px', color: '#888', fontSize: '0.85em' }}>
              Serão aplicadas aos <strong>{selecionados.size}</strong> anúncio(s) selecionado(s).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Largura (cm)', val: modalLargura, set: setModalLargura, icon: '↔' },
                { label: 'Altura (cm)', val: modalAltura, set: setModalAltura, icon: '↕' },
                { label: 'Comprimento (cm)', val: modalComprimento, set: setModalComprimento, icon: '↗' },
                { label: 'Peso (g)', val: modalPeso, set: setModalPeso, icon: '⚖' },
              ].map(({ label, val, set, icon }) => (
                <div key={label}>
                  <label style={{ fontSize: '0.8em', color: '#666', display: 'block', marginBottom: 4 }}>
                    {icon} {label}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={val}
                    onChange={e => set(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 10px', border: '1px solid #ddd',
                      borderRadius: 6, fontSize: '0.95em', boxSizing: 'border-box'
                    }}
                  />
                </div>
              ))}
            </div>

            {modalLargura && modalAltura && modalComprimento && modalPeso && (
              <div style={{
                background: '#f0f4ff', borderRadius: 6, padding: '8px 12px',
                fontSize: '0.82em', color: '#555', marginBottom: 14
              }}>
                Formato ML: <strong>{buildDimStr(modalLargura, modalAltura, modalComprimento, modalPeso)}</strong>
                <span style={{ marginLeft: 8, color: '#888' }}>(LxAxC,Peso)</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalAberto(false)}
                style={{
                  padding: '8px 18px', border: '1px solid #ddd', borderRadius: 6,
                  background: '#fff', cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => enviarParaFila('novas')}
                disabled={enviando}
                style={{
                  padding: '8px 20px', background: '#e67e22', color: '#fff', border: 'none',
                  borderRadius: 6, cursor: enviando ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontFamily: 'inherit', fontSize: '0.95em'
                }}
              >
                {enviando ? 'Enviando...' : '🚀 Enviar para Fila'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
