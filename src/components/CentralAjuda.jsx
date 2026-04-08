import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import EditorWysiwyg from './EditorWysiwyg.jsx';

// ── Modal Editor ──────────────────────────────────────────────────────────────

function ModalEditor({ tipo, dados, categorias, artigos, onSalvar, onFechar }) {
  const [form, setForm] = useState(dados || {});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const handleSalvar = async () => {
    if (tipo === 'categoria' && !form.titulo?.trim()) return setErro('Título obrigatório');
    if (tipo === 'artigo' && !form.titulo?.trim()) return setErro('Título obrigatório');
    if (tipo === 'artigo' && !form.categoriaId) return setErro('Selecione uma categoria');
    setErro('');
    setSalvando(true);
    try {
      await onSalvar(form);
    } catch (e) {
      setErro(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '20px 16px', overflowY: 'auto',
  };

  const modalStyle = {
    background: '#fff', borderRadius: 12, width: '100%',
    maxWidth: tipo === 'artigo' ? 900 : 500,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '28px 32px',
    position: 'relative',
  };

  const labelStyle = { display: 'block', fontSize: '0.85em', fontWeight: 600, color: '#374151', marginBottom: 5 };
  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.92em', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onFechar()}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: '1.2em', color: '#111827' }}>
            {tipo === 'categoria'
              ? (form.id ? 'Editar Categoria' : 'Nova Categoria')
              : (form.id ? 'Editar Artigo' : 'Novo Artigo')}
          </h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4em', color: '#6b7280' }}>×</button>
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '10px 14px', color: '#b91c1c', fontSize: '0.9em', marginBottom: 16 }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Título *</label>
            <input style={inputStyle} value={form.titulo || ''} onChange={e => set('titulo', e.target.value)} placeholder={tipo === 'categoria' ? 'Nome da categoria' : 'Título do artigo'} />
          </div>

          {tipo === 'categoria' && (
            <>
              <div>
                <label style={labelStyle}>Ícone (emoji ou texto curto)</label>
                <input style={{ ...inputStyle, maxWidth: 120 }} value={form.icone || ''} onChange={e => set('icone', e.target.value)} placeholder="📚" />
              </div>
              <div>
                <label style={labelStyle}>Descrição</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} placeholder="Descrição breve da categoria..." />
              </div>
              <div>
                <label style={labelStyle}>Ordem (número)</label>
                <input type="number" style={{ ...inputStyle, maxWidth: 120 }} value={form.ordem ?? 0} onChange={e => set('ordem', Number(e.target.value))} />
              </div>
            </>
          )}

          {tipo === 'artigo' && (
            <>
              <div>
                <label style={labelStyle}>Categoria *</label>
                <select style={inputStyle} value={form.categoriaId || ''} onChange={e => { set('categoriaId', e.target.value); set('parentId', ''); }}>
                  <option value="">Selecione...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.icone ? `${c.icone} ` : ''}{c.titulo}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Artigo pai (sub-tópico de...)</label>
                <select style={inputStyle} value={form.parentId || ''} onChange={e => set('parentId', e.target.value || null)}>
                  <option value="">— Nenhum (tópico raiz) —</option>
                  {artigos
                    .filter(a => a.categoriaId === form.categoriaId && !a.parentId && a.id !== form.id)
                    .map(a => <option key={a.id} value={a.id}>{a.titulo}</option>)
                  }
                </select>
              </div>
              <div>
                <label style={labelStyle}>Descrição (resumo)</label>
                <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} placeholder="Resumo breve que aparece na listagem..." />
              </div>
              <div>
                <label style={labelStyle}>Conteúdo</label>
                <EditorWysiwyg value={form.conteudo || ''} onChange={v => set('conteudo', v)} />
              </div>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={labelStyle}>Ordem</label>
                  <input type="number" style={{ ...inputStyle, maxWidth: 120 }} value={form.ordem ?? 0} onChange={e => set('ordem', Number(e.target.value))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                  <input type="checkbox" id="publicado" checked={form.publicado ?? false} onChange={e => set('publicado', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor="publicado" style={{ ...labelStyle, margin: 0, cursor: 'pointer' }}>Publicado (visível para usuários)</label>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button onClick={onFechar} style={{ padding: '9px 20px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: '0.9em', color: '#374151' }}>
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={salvando} style={{ padding: '9px 22px', border: 'none', borderRadius: 7, background: '#2563eb', color: '#fff', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: '0.9em', fontWeight: 600, opacity: salvando ? 0.7 : 1 }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CentralAjuda() {
  const { role } = useAuth();
  const isAdmin = role === 'SUPER_ADMIN';

  const [categorias, setCategorias] = useState([]);
  const [artigos, setArtigos] = useState([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null);
  const [artigoSelecionado, setArtigoSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [artigoCarregando, setArtigoCarregando] = useState(false);
  const [busca, setBusca] = useState('');

  // Editor (admin)
  const [modal, setModal] = useState(null); // { tipo: 'categoria'|'artigo', dados: {} }

  // ── Carregamentos ─────────────────────────────────────────────────────────

  const carregarCategorias = useCallback(async () => {
    try {
      const r = await fetch('/api/ajuda/categorias');
      if (r.ok) {
        const data = await r.json();
        setCategorias(data);
        if (data.length > 0 && !categoriaSelecionada) setCategoriaSelecionada(data[0].id);
      }
    } catch {}
  }, []);

  const carregarArtigos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (isAdmin) params.set('todos', 'true');
      const r = await fetch(`/api/ajuda/artigos?${params}`);
      if (r.ok) setArtigos(await r.json());
    } catch {}
  }, [isAdmin]);

  useEffect(() => {
    Promise.all([carregarCategorias(), carregarArtigos()]).finally(() => setCarregando(false));
  }, [carregarCategorias, carregarArtigos]);

  const abrirArtigo = async (id) => {
    setArtigoCarregando(true);
    setArtigoSelecionado(null);
    try {
      const r = await fetch(`/api/ajuda/artigos/${id}`);
      if (r.ok) setArtigoSelecionado(await r.json());
    } catch {}
    setArtigoCarregando(false);
  };

  const abrirModalEdicao = async (e, id) => {
    e.stopPropagation();
    try {
      const r = await fetch(`/api/ajuda/artigos/${id}`);
      if (r.ok) setModal({ tipo: 'artigo', dados: await r.json() });
    } catch {}
  };

  // ── Salvar (admin) ────────────────────────────────────────────────────────

  const salvarModal = async (form) => {
    const tipo = modal.tipo;
    const isEdicao = !!form.id;
    const url = tipo === 'categoria'
      ? (isEdicao ? `/api/ajuda/categorias/${form.id}` : '/api/ajuda/categorias')
      : (isEdicao ? `/api/ajuda/artigos/${form.id}` : '/api/ajuda/artigos');
    const method = isEdicao ? 'PUT' : 'POST';

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.erro || 'Erro ao salvar');
    }
    const resultado = await r.json();

    if (tipo === 'categoria') {
      if (isEdicao) setCategorias(cs => cs.map(c => c.id === resultado.id ? resultado : c));
      else { setCategorias(cs => [...cs, resultado]); setCategoriaSelecionada(resultado.id); }
    } else {
      if (isEdicao) {
        setArtigos(as => as.map(a => a.id === resultado.id ? resultado : a));
        if (artigoSelecionado?.id === resultado.id) setArtigoSelecionado(resultado);
      } else {
        setArtigos(as => [...as, resultado]);
        setCategoriaSelecionada(resultado.categoriaId);
        abrirArtigo(resultado.id);
      }
    }
    setModal(null);
  };

  const excluirCategoria = async (id) => {
    if (!window.confirm('Excluir esta categoria e todos os artigos dentro dela?')) return;
    const r = await fetch(`/api/ajuda/categorias/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setCategorias(cs => cs.filter(c => c.id !== id));
      setArtigos(as => as.filter(a => a.categoriaId !== id));
      if (categoriaSelecionada === id) setCategoriaSelecionada(null);
      if (artigoSelecionado?.categoriaId === id) setArtigoSelecionado(null);
    }
  };

  const excluirArtigo = async (id) => {
    if (!window.confirm('Excluir este artigo?')) return;
    const r = await fetch(`/api/ajuda/artigos/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setArtigos(as => as.filter(a => a.id !== id));
      if (artigoSelecionado?.id === id) setArtigoSelecionado(null);
    }
  };

  // ── Filtragem ─────────────────────────────────────────────────────────────

  const artigosFiltrados = artigos.filter(a => {
    const dentroCategoria = !busca && categoriaSelecionada ? a.categoriaId === categoriaSelecionada : true;
    const matchBusca = busca ? (a.titulo.toLowerCase().includes(busca.toLowerCase()) || (a.descricao || '').toLowerCase().includes(busca.toLowerCase())) : true;
    return dentroCategoria && matchBusca;
  });

  // ── Estilos ───────────────────────────────────────────────────────────────

  const sidebarStyle = {
    width: 280, minWidth: 240, flexShrink: 0,
    borderRight: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column',
    background: '#f9fafb',
  };

  const catBtnStyle = (ativo) => ({
    width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    background: ativo ? '#dbeafe' : 'transparent',
    color: ativo ? '#1d4ed8' : '#374151',
    fontWeight: ativo ? 600 : 400, fontSize: '0.9em',
    display: 'flex', alignItems: 'center', gap: 8,
    transition: 'background 0.15s',
  });

  const artigoBtnStyle = (ativo) => ({
    width: '100%', textAlign: 'left', padding: '8px 12px 8px 28px',
    border: 'none', borderLeft: `3px solid ${ativo ? '#2563eb' : 'transparent'}`,
    cursor: 'pointer', fontFamily: 'inherit',
    background: ativo ? '#eff6ff' : 'transparent',
    color: ativo ? '#1d4ed8' : '#4b5563',
    fontWeight: ativo ? 600 : 400, fontSize: '0.85em',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    transition: 'background 0.15s',
  });

  if (carregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#6b7280', gap: 10 }}>
        <div style={{ width: 22, height: 22, border: '3px solid #e5e7eb', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        Carregando...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      <style>{`
        .ajuda-editor-content h1{font-size:1.8em;font-weight:700;margin:.6em 0 .3em;}
        .ajuda-editor-content h2{font-size:1.4em;font-weight:700;margin:.6em 0 .3em;}
        .ajuda-editor-content h3{font-size:1.15em;font-weight:700;margin:.5em 0 .3em;}
        .ajuda-editor-content p{margin:.4em 0;}
        .ajuda-editor-content ul,.ajuda-editor-content ol{padding-left:1.8em;margin:.4em 0;}
        .ajuda-editor-content li{margin:.2em 0;}
        .ajuda-editor-content a{color:#2563eb;text-decoration:underline;}
        .ajuda-editor-content img{max-width:100%;}
        .ajuda-editor-content pre{background:#f1f3f4;padding:12px;border-radius:6px;font-family:monospace;overflow:auto;}
        .ajuda-artigo-view h1{font-size:1.9em;font-weight:700;margin:.6em 0 .4em;color:#111827;}
        .ajuda-artigo-view h2{font-size:1.4em;font-weight:700;margin:.7em 0 .3em;color:#1f2937;border-bottom:1px solid #e5e7eb;padding-bottom:.2em;}
        .ajuda-artigo-view h3{font-size:1.15em;font-weight:700;margin:.6em 0 .2em;color:#374151;}
        .ajuda-artigo-view p{margin:.5em 0;line-height:1.75;}
        .ajuda-artigo-view ul,.ajuda-artigo-view ol{padding-left:2em;margin:.5em 0;}
        .ajuda-artigo-view li{margin:.3em 0;line-height:1.7;}
        .ajuda-artigo-view a{color:#2563eb;text-decoration:underline;}
        .ajuda-artigo-view img{max-width:100%;border-radius:8px;margin:8px 0;}
        .ajuda-artigo-view pre{background:#f1f3f4;padding:14px;border-radius:8px;font-family:monospace;font-size:.9em;overflow:auto;margin:.6em 0;}
        .ajuda-artigo-view iframe{max-width:100%;border-radius:8px;}
        .ajuda-artigo-view hr{border:none;border-top:1px solid #e5e7eb;margin:1.2em 0;}
        .ajuda-artigo-view blockquote{border-left:4px solid #2563eb;padding:.4em 1em;margin:.6em 0;background:#eff6ff;border-radius:0 6px 6px 0;color:#1e40af;}
        .cat-action-btn{opacity:0;transition:opacity 0.15s;background:none;border:none;cursor:pointer;padding:3px 5px;border-radius:4px;color:#9ca3af;}
        .cat-action-btn:hover{background:#e5e7eb;color:#374151;}
        .cat-row:hover .cat-action-btn{opacity:1;}
        .artigo-row:hover .cat-action-btn{opacity:1;}
      `}</style>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div style={sidebarStyle}>
        {/* Cabeçalho sidebar */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.95em', color: '#111827' }}>Central de Ajuda</span>
            {isAdmin && (
              <button
                onClick={() => setModal({ tipo: 'categoria', dados: {} })}
                title="Nova Categoria"
                style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.8em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                + Cat
              </button>
            )}
          </div>
          {/* Busca */}
          <input
            type="text"
            placeholder="Buscar artigos..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setArtigoSelecionado(null); }}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.85em', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Lista de categorias e artigos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {busca ? (
            // Modo busca: mostra todos os artigos filtrados
            <>
              {artigosFiltrados.length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85em', padding: '20px 0' }}>Nenhum resultado</p>
              )}
              {artigosFiltrados.map(artigo => (
                <div key={artigo.id} className="artigo-row" style={{ position: 'relative' }}>
                  <button
                    style={artigoBtnStyle(artigoSelecionado?.id === artigo.id)}
                    onClick={() => abrirArtigo(artigo.id)}
                  >
                    <span style={{ flex: 1 }}>
                      {!artigo.publicado && isAdmin && <span style={{ fontSize: '0.75em', background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 4px', marginRight: 5 }}>Rascunho</span>}
                      {artigo.titulo}
                    </span>
                    {isAdmin && (
                      <span style={{ display: 'flex', gap: 2 }}>
                        <button className="cat-action-btn" onClick={e => abrirModalEdicao(e, artigo.id)} title="Editar">✏</button>
                        <button className="cat-action-btn" onClick={e => { e.stopPropagation(); excluirArtigo(artigo.id); }} title="Excluir" style={{ color: '#ef4444' }}>🗑</button>
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </>
          ) : (
            // Modo normal: categorias com artigos expandidos
            categorias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af', fontSize: '0.9em' }}>
                {isAdmin ? 'Crie a primeira categoria clicando em "+ Cat"' : 'Nenhum conteúdo disponível ainda.'}
              </div>
            ) : (
              categorias.map(cat => {
                const artigosCat = artigos.filter(a => a.categoriaId === cat.id);
                const expandida = categoriaSelecionada === cat.id;
                return (
                  <div key={cat.id} style={{ marginBottom: 4 }}>
                    {/* Cabeçalho da categoria */}
                    <div className="cat-row" style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        style={catBtnStyle(expandida)}
                        onClick={() => {
                          setCategoriaSelecionada(expandida ? null : cat.id);
                          setArtigoSelecionado(null);
                        }}
                      >
                        <span style={{ fontSize: '1.1em' }}>{cat.icone || '📁'}</span>
                        <span style={{ flex: 1 }}>{cat.titulo}</span>
                        <span style={{ fontSize: '0.75em', background: '#e5e7eb', borderRadius: 10, padding: '1px 7px', color: '#6b7280' }}>
                          {artigosCat.filter(a => isAdmin || a.publicado).length}
                        </span>
                        <span style={{ fontSize: '0.8em', color: '#9ca3af', marginLeft: 2 }}>{expandida ? '▾' : '▸'}</span>
                      </button>
                      {isAdmin && (
                        <span style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
                          <button className="cat-action-btn" onClick={() => setModal({ tipo: 'categoria', dados: cat })} title="Editar categoria">✏</button>
                          <button className="cat-action-btn" onClick={() => excluirCategoria(cat.id)} title="Excluir categoria" style={{ color: '#ef4444' }}>🗑</button>
                        </span>
                      )}
                    </div>

                    {/* Artigos da categoria */}
                    {expandida && (
                      <div style={{ marginTop: 2 }}>
                        {isAdmin && (
                          <button
                            onClick={() => setModal({ tipo: 'artigo', dados: { categoriaId: cat.id, publicado: false } })}
                            style={{ width: '100%', textAlign: 'left', padding: '6px 12px 6px 28px', border: '1px dashed #93c5fd', borderRadius: 6, background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82em', marginBottom: 4 }}
                          >
                            + Novo artigo nesta categoria
                          </button>
                        )}
                        {artigosCat.filter(a => (isAdmin || a.publicado) && !a.parentId).length === 0 && (
                          <p style={{ padding: '6px 28px', color: '#9ca3af', fontSize: '0.82em', margin: 0 }}>Nenhum artigo ainda</p>
                        )}
                        {artigosCat.filter(a => (isAdmin || a.publicado) && !a.parentId).map(artigo => {
                          const filhos = artigosCat.filter(a => a.parentId === artigo.id && (isAdmin || a.publicado));
                          const temFilhos = filhos.length > 0;
                          const paiExpandido = artigoSelecionado?.id === artigo.id || artigoSelecionado?.parentId === artigo.id;
                          return (
                            <div key={artigo.id}>
                              <div className="artigo-row" style={{ position: 'relative' }}>
                                <button
                                  style={artigoBtnStyle(artigoSelecionado?.id === artigo.id)}
                                  onClick={() => abrirArtigo(artigo.id)}
                                >
                                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {temFilhos && (
                                      <span style={{ fontSize: '0.7em', color: '#9ca3af' }}>{paiExpandido ? '▾' : '▸'}</span>
                                    )}
                                    {!artigo.publicado && isAdmin && (
                                      <span style={{ fontSize: '0.72em', background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 4px' }}>Rascunho</span>
                                    )}
                                    {artigo.titulo}
                                  </span>
                                  {isAdmin && (
                                    <span style={{ display: 'flex', gap: 2 }}>
                                      <button className="cat-action-btn" title="Novo sub-tópico" onClick={e => { e.stopPropagation(); setModal({ tipo: 'artigo', dados: { categoriaId: cat.id, parentId: artigo.id, publicado: false } }); }}>⊕</button>
                                      <button className="cat-action-btn" onClick={e => abrirModalEdicao(e, artigo.id)} title="Editar">✏</button>
                                      <button className="cat-action-btn" onClick={e => { e.stopPropagation(); excluirArtigo(artigo.id); }} title="Excluir" style={{ color: '#ef4444' }}>🗑</button>
                                    </span>
                                  )}
                                </button>
                              </div>
                              {/* Sub-tópicos — sempre visíveis */}
                              {filhos.map(filho => (
                                <div key={filho.id} className="artigo-row" style={{ position: 'relative' }}>
                                  <button
                                    style={{
                                      ...artigoBtnStyle(artigoSelecionado?.id === filho.id),
                                      paddingLeft: 44,
                                      fontSize: '0.82em',
                                      borderLeft: `3px solid ${artigoSelecionado?.id === filho.id ? '#2563eb' : '#e5e7eb'}`,
                                    }}
                                    onClick={() => abrirArtigo(filho.id)}
                                  >
                                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ color: '#d1d5db', fontSize: '0.85em' }}>└</span>
                                      {!filho.publicado && isAdmin && (
                                        <span style={{ fontSize: '0.72em', background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 4px' }}>Rascunho</span>
                                      )}
                                      {filho.titulo}
                                    </span>
                                    {isAdmin && (
                                      <span style={{ display: 'flex', gap: 2 }}>
                                        <button className="cat-action-btn" onClick={e => abrirModalEdicao(e, filho.id)} title="Editar">✏</button>
                                        <button className="cat-action-btn" onClick={e => { e.stopPropagation(); excluirArtigo(filho.id); }} title="Excluir" style={{ color: '#ef4444' }}>🗑</button>
                                      </span>
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Botão criar artigo geral (admin) */}
        {isAdmin && (
          <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setModal({ tipo: 'artigo', dados: { categoriaId: categoriaSelecionada || '', publicado: false } })}
              style={{ width: '100%', padding: '9px', border: '1px solid #2563eb', borderRadius: 7, background: '#fff', color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88em', fontWeight: 600 }}
            >
              + Novo Artigo
            </button>
          </div>
        )}
      </div>

      {/* ── Área principal ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {artigoCarregando ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#6b7280' }}>
            <div style={{ width: 22, height: 22, border: '3px solid #e5e7eb', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Carregando artigo...
          </div>
        ) : artigoSelecionado ? (
          // Visualização do artigo
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '36px 40px' }}>
            {/* Breadcrumb */}
            <div style={{ fontSize: '0.82em', color: '#9ca3af', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setArtigoSelecionado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 'inherit', padding: 0 }}>
                Central de Ajuda
              </button>
              <span>›</span>
              <span>{categorias.find(c => c.id === artigoSelecionado.categoriaId)?.titulo}</span>
              {artigoSelecionado.parentId && (() => {
                const pai = artigos.find(a => a.id === artigoSelecionado.parentId);
                return pai ? (
                  <>
                    <span>›</span>
                    <button onClick={() => abrirArtigo(pai.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 'inherit', padding: 0 }}>
                      {pai.titulo}
                    </button>
                  </>
                ) : null;
              })()}
              <span>›</span>
              <span style={{ color: '#374151' }}>{artigoSelecionado.titulo}</span>
            </div>

            {/* Cabeçalho do artigo */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: '2em', fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>
                {artigoSelecionado.titulo}
              </h1>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, paddingTop: 4 }}>
                  {!artigoSelecionado.publicado && (
                    <span style={{ fontSize: '0.78em', background: '#fef3c7', color: '#92400e', borderRadius: 5, padding: '3px 8px', alignSelf: 'center' }}>Rascunho</span>
                  )}
                  <button
                    onClick={() => setModal({ tipo: 'artigo', dados: artigoSelecionado })}
                    style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: '0.85em', color: '#374151', fontWeight: 500 }}
                  >
                    ✏ Editar
                  </button>
                  <button
                    onClick={() => excluirArtigo(artigoSelecionado.id)}
                    style={{ padding: '6px 14px', border: '1px solid #fca5a5', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: '0.85em', color: '#ef4444' }}
                  >
                    🗑 Excluir
                  </button>
                </div>
              )}
            </div>

            {artigoSelecionado.descricao && (
              <p style={{ color: '#6b7280', fontSize: '1.05em', margin: '8px 0 0', lineHeight: 1.6 }}>{artigoSelecionado.descricao}</p>
            )}

            <div style={{ height: 1, background: '#e5e7eb', margin: '20px 0' }} />

            {/* Conteúdo HTML renderizado */}
            {artigoSelecionado.conteudo ? (
              <div
                className="ajuda-artigo-view"
                dangerouslySetInnerHTML={{ __html: artigoSelecionado.conteudo }}
              />
            ) : (
              <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>Este artigo ainda não tem conteúdo.</p>
            )}

            {/* Rodapé do artigo */}
            <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: '0.8em', color: '#9ca3af' }}>
                Atualizado em {new Date(artigoSelecionado.atualizadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => setArtigoSelecionado(null)}
                style={{ fontSize: '0.85em', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Voltar para a lista
              </button>
            </div>
          </div>
        ) : (
          // Tela de boas-vindas / lista de artigos da categoria
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '36px 40px' }}>
            {categoriaSelecionada ? (
              <>
                {/* Lista da categoria selecionada */}
                {(() => {
                  const cat = categorias.find(c => c.id === categoriaSelecionada);
                  const arts = artigos.filter(a => a.categoriaId === categoriaSelecionada && (isAdmin || a.publicado));
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                        <div style={{ fontSize: '2.5em', lineHeight: 1 }}>{cat?.icone || '📁'}</div>
                        <div>
                          <h1 style={{ margin: 0, fontSize: '1.8em', fontWeight: 800, color: '#111827' }}>{cat?.titulo}</h1>
                          {cat?.descricao && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '1em' }}>{cat.descricao}</p>}
                        </div>
                      </div>

                      {arts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                          <div style={{ fontSize: '3em', marginBottom: 12 }}>📝</div>
                          <p>Nenhum artigo disponível nesta categoria.</p>
                          {isAdmin && (
                            <button
                              onClick={() => setModal({ tipo: 'artigo', dados: { categoriaId: categoriaSelecionada, publicado: false } })}
                              style={{ marginTop: 12, padding: '9px 20px', border: 'none', borderRadius: 7, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                            >
                              + Criar primeiro artigo
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {arts.filter(a => !a.parentId).map(artigo => {
                            const filhosCat = arts.filter(a => a.parentId === artigo.id);
                            return (
                              <div key={artigo.id}>
                                {/* Card do tópico pai */}
                                <button
                                  onClick={() => abrirArtigo(artigo.id)}
                                  style={{
                                    width: '100%', textAlign: 'left', padding: '18px 22px', border: '1px solid #e5e7eb',
                                    borderRadius: filhosCat.length > 0 ? '10px 10px 0 0' : 10,
                                    background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                                    transition: 'border-color 0.15s, box-shadow 0.15s',
                                    borderBottom: filhosCat.length > 0 ? '1px solid #f3f4f6' : '1px solid #e5e7eb',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.borderColor = filhosCat.length > 0 ? '#e5e7eb' : '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      {!artigo.publicado && isAdmin && (
                                        <span style={{ fontSize: '0.75em', background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', marginRight: 8 }}>Rascunho</span>
                                      )}
                                      <span style={{ fontWeight: 700, fontSize: '1.05em', color: '#111827' }}>{artigo.titulo}</span>
                                      {artigo.descricao && (
                                        <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: '0.9em', lineHeight: 1.5 }}>{artigo.descricao}</p>
                                      )}
                                    </div>
                                    <span style={{ color: '#9ca3af', fontSize: '1.2em', marginLeft: 12, flexShrink: 0 }}>›</span>
                                  </div>
                                </button>
                                {/* Sub-tópicos aninhados */}
                                {filhosCat.length > 0 && (
                                  <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                                    {filhosCat.map((filho, idx) => (
                                      <button
                                        key={filho.id}
                                        onClick={() => abrirArtigo(filho.id)}
                                        style={{
                                          width: '100%', textAlign: 'left', padding: '13px 22px 13px 36px',
                                          border: 'none', borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none',
                                          background: '#fafafa', cursor: 'pointer', fontFamily: 'inherit',
                                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                          transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ color: '#d1d5db', fontSize: '0.9em', flexShrink: 0 }}>└</span>
                                          <div>
                                            {!filho.publicado && isAdmin && (
                                              <span style={{ fontSize: '0.72em', background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', marginRight: 6 }}>Rascunho</span>
                                            )}
                                            <span style={{ fontWeight: 600, fontSize: '0.95em', color: '#374151' }}>{filho.titulo}</span>
                                            {filho.descricao && (
                                              <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: '0.85em', lineHeight: 1.4 }}>{filho.descricao}</p>
                                            )}
                                          </div>
                                        </div>
                                        <span style={{ color: '#9ca3af', fontSize: '1em', marginLeft: 12, flexShrink: 0 }}>›</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              // Tela inicial
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ fontSize: '4em', marginBottom: 16 }}>📚</div>
                <h1 style={{ fontSize: '2em', fontWeight: 800, color: '#111827', margin: '0 0 12px' }}>Central de Ajuda</h1>
                <p style={{ color: '#6b7280', fontSize: '1.1em', maxWidth: 500, margin: '0 auto 40px' }}>
                  Selecione uma categoria no menu lateral para encontrar artigos e tutoriais.
                </p>
                {/* Grid de categorias */}
                {categorias.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, maxWidth: 700, margin: '0 auto', textAlign: 'left' }}>
                    {categorias.map(cat => {
                      const count = artigos.filter(a => a.categoriaId === cat.id && (isAdmin || a.publicado)).length;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setCategoriaSelecionada(cat.id)}
                          style={{
                            padding: '18px 16px', border: '1px solid #e5e7eb', borderRadius: 10,
                            background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <div style={{ fontSize: '2em', marginBottom: 8 }}>{cat.icone || '📁'}</div>
                          <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.95em' }}>{cat.titulo}</div>
                          {cat.descricao && <div style={{ color: '#9ca3af', fontSize: '0.8em', marginTop: 3 }}>{cat.descricao}</div>}
                          <div style={{ color: '#6b7280', fontSize: '0.8em', marginTop: 6 }}>{count} artigo{count !== 1 ? 's' : ''}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Editor ─────────────────────────────────────────────────── */}
      {modal && (
        <ModalEditor
          tipo={modal.tipo}
          dados={modal.dados}
          categorias={categorias}
          artigos={artigos}
          onSalvar={salvarModal}
          onFechar={() => setModal(null)}
        />
      )}
    </div>
  );
}
