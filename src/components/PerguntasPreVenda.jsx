import { useState, useEffect, useRef } from 'react';

const STATUS_OPCOES = ['UNANSWERED', 'ANSWERED', 'CLOSED_UNANSWERED', 'UNDER_REVIEW'];
const LS_KEY_RESPOSTAS = 'saas_respostas_rapidas';

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Modal: Pesquisar Anúncio para Anexar Link
// ============================================================
function ModalPesquisarAnuncio({ usuarioId, contas, onAnexar, onFechar }) {
  const [busca, setBusca] = useState('');
  const [anuncios, setAnuncios] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionado, setSelecionado] = useState(null);

  const pesquisar = async () => {
    if (!busca.trim()) return;
    setCarregando(true);
    try {
      const contasIds = contas.map(c => c.id).join(',');
      const res = await fetch(`/api/ml/anuncios?contasIds=${contasIds}&search=${encodeURIComponent(busca)}&limit=50`);
      const data = await res.json();
      setAnuncios(data.anuncios || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCarregando(false);
    }
  };

  const thS = { padding: '5px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.78em', color: '#555', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' };
  const tdS = { padding: '5px 8px', fontSize: '0.78em', borderBottom: '1px solid #eee', color: '#333', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '6px', width: '860px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95em', color: '#2c3e50' }}>Pesquisar Anúncio para Anexar Link</span>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', color: '#888' }}>✕</button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && pesquisar()}
            placeholder="Título, SKU ou ID do anúncio..."
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '0.85em', fontFamily: 'inherit' }}
          />
          <button onClick={pesquisar} style={{ padding: '5px 14px', backgroundColor: '#2980b9', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.82em', fontFamily: 'inherit' }}>
            {carregando ? 'Buscando...' : 'Pesquisar'}
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ ...thS, width: '44px' }}>Img</th>
                <th style={thS}>Conta</th>
                <th style={thS}>Título</th>
                <th style={thS}>SKU</th>
                <th style={thS}>Preço</th>
                <th style={thS}>Status</th>
                <th style={thS}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {anuncios.map(ad => (
                <tr
                  key={ad.id}
                  onClick={() => setSelecionado(ad)}
                  style={{ cursor: 'pointer', backgroundColor: selecionado?.id === ad.id ? '#1a6fbb' : 'transparent' }}
                  onMouseEnter={e => { if (selecionado?.id !== ad.id) e.currentTarget.style.backgroundColor = '#f0f4f8'; }}
                  onMouseLeave={e => { if (selecionado?.id !== ad.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <td style={{ ...tdS, width: '44px', padding: '3px 6px' }}>
                    {ad.thumbnail
                      ? <img src={ad.thumbnail.replace('http://', 'https://')} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '3px', display: 'block' }} />
                      : <div style={{ width: '36px', height: '36px', backgroundColor: '#ddd', borderRadius: '3px' }} />}
                  </td>
                  <td style={{ ...tdS, color: selecionado?.id === ad.id ? '#fff' : '#333' }}>{ad.conta?.nickname || ''}</td>
                  <td style={{ ...tdS, maxWidth: '260px', color: selecionado?.id === ad.id ? '#fff' : '#333' }}>{ad.titulo}</td>
                  <td style={{ ...tdS, color: selecionado?.id === ad.id ? '#dde' : '#666' }}>{ad.sku || '-'}</td>
                  <td style={{ ...tdS, color: selecionado?.id === ad.id ? '#fff' : '#333' }}>
                    {ad.preco ? `R$ ${ad.preco.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ ...tdS, color: selecionado?.id === ad.id ? '#fff' : ad.status === 'active' ? '#27ae60' : '#e67e22' }}>
                    {ad.status}
                  </td>
                  <td style={tdS}>
                    <a
                      href={ad.permalink}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: selecionado?.id === ad.id ? '#cde' : '#2980b9', fontSize: '0.78em', textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}
                    >
                      Abrir URL
                    </a>
                  </td>
                </tr>
              ))}
              {anuncios.length === 0 && !carregando && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.82em' }}>Nenhum anúncio. Digite algo e clique em Pesquisar.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #eee', display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={() => { if (selecionado) onAnexar(selecionado); }}
            disabled={!selecionado}
            style={{ padding: '6px 16px', backgroundColor: selecionado ? '#27ae60' : '#bbb', color: '#fff', border: 'none', borderRadius: '3px', cursor: selecionado ? 'pointer' : 'default', fontSize: '0.85em', fontFamily: 'inherit' }}
          >
            Anexar Link Selecionado
          </button>
          <button onClick={onFechar} style={{ padding: '6px 14px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.85em', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal: Gerenciar Respostas Rápidas
// ============================================================
function ModalRespostasRapidas({ onSelecionar, onFechar }) {
  const [respostas, setRespostas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY_RESPOSTAS) || '[]'); } catch { return []; }
  });
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [modoGerenciar, setModoGerenciar] = useState(false);

  const salvar = () => {
    if (!titulo.trim() || !texto.trim()) return;
    let novas;
    if (editandoId !== null) {
      novas = respostas.map(r => r.id === editandoId ? { ...r, titulo: titulo.trim(), texto: texto.trim() } : r);
    } else {
      novas = [...respostas, { id: Date.now(), titulo: titulo.trim(), texto: texto.trim() }];
    }
    localStorage.setItem(LS_KEY_RESPOSTAS, JSON.stringify(novas));
    setRespostas(novas);
    setTitulo('');
    setTexto('');
    setEditandoId(null);
  };

  const excluir = (id) => {
    const novas = respostas.filter(r => r.id !== id);
    localStorage.setItem(LS_KEY_RESPOSTAS, JSON.stringify(novas));
    setRespostas(novas);
  };

  const editar = (r) => {
    setEditandoId(r.id);
    setTitulo(r.titulo);
    setTexto(r.texto);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setTitulo('');
    setTexto('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '6px', width: '680px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95em', color: '#2c3e50' }}>Respostas Rápidas</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setModoGerenciar(!modoGerenciar)}
              style={{ padding: '4px 10px', backgroundColor: modoGerenciar ? '#e67e22' : '#6c757d', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.78em', fontFamily: 'inherit' }}
            >
              {modoGerenciar ? 'Modo Seleção' : 'Gerenciar'}
            </button>
            <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', color: '#888' }}>✕</button>
          </div>
        </div>

        {modoGerenciar && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', flexShrink: 0, backgroundColor: '#fafafa' }}>
            <div style={{ fontWeight: 600, fontSize: '0.82em', color: '#555', marginBottom: '6px' }}>
              {editandoId !== null ? 'Editando resposta' : 'Nova resposta rápida'}
            </div>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Título (ex: Prazo de entrega)"
              style={{ width: '100%', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '0.82em', fontFamily: 'inherit', marginBottom: '6px', boxSizing: 'border-box' }}
            />
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Texto da resposta..."
              rows={3}
              style={{ width: '100%', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '0.82em', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <button onClick={salvar} style={{ padding: '4px 12px', backgroundColor: '#27ae60', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8em', fontFamily: 'inherit' }}>
                {editandoId !== null ? 'Salvar' : 'Adicionar'}
              </button>
              {editandoId !== null && (
                <button onClick={cancelarEdicao} style={{ padding: '4px 12px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8em', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          {respostas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#aaa', fontSize: '0.85em' }}>
              Nenhuma resposta rápida. Clique em "Gerenciar" para adicionar.
            </div>
          ) : (
            respostas.map(r => (
              <div
                key={r.id}
                style={{
                  padding: '8px 10px', borderRadius: '4px', border: '1px solid #e0e0e0',
                  marginBottom: '6px', backgroundColor: '#fff', cursor: modoGerenciar ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
                onClick={() => { if (!modoGerenciar) onSelecionar(r.texto); }}
                onMouseEnter={e => { if (!modoGerenciar) e.currentTarget.style.backgroundColor = '#e8f4fd'; }}
                onMouseLeave={e => { if (!modoGerenciar) e.currentTarget.style.backgroundColor = '#fff'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82em', color: '#2c3e50', marginBottom: '3px' }}>{r.titulo}</div>
                  {modoGerenciar && (
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                      <button onClick={() => editar(r)} style={{ padding: '2px 7px', backgroundColor: '#2980b9', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.72em', fontFamily: 'inherit' }}>Editar</button>
                      <button onClick={() => excluir(r.id)} style={{ padding: '2px 7px', backgroundColor: '#c0392b', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.72em', fontFamily: 'inherit' }}>Excluir</button>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.78em', color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{r.texto}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid #eee', flexShrink: 0, fontSize: '0.75em', color: '#aaa' }}>
          {modoGerenciar ? 'Gerencie suas respostas rápidas acima.' : 'Clique em uma resposta para inserir no campo de resposta.'}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Componente Principal
// ============================================================
export default function PerguntasPreVenda({ usuarioId }) {
  const [contas, setContas] = useState([]);
  const [contaFiltro, setContaFiltro] = useState('todas');
  const [statusFiltro, setStatusFiltro] = useState('UNANSWERED');

  const [perguntas, setPerguntas] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);

  const [perguntaSelecionada, setPerguntaSelecionada] = useState(null);
  const [conversa, setConversa] = useState([]);
  const [itemInfo, setItemInfo] = useState(null);
  const [carregandoConversa, setCarregandoConversa] = useState(false);

  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msgStatus, setMsgStatus] = useState('');

  const [modalAnuncio, setModalAnuncio] = useState(false);
  const [modalRespostas, setModalRespostas] = useState(false);
  const [buyerNicknames, setBuyerNicknames] = useState({});

  // Cache de conversas/anúncios pré-carregados
  const conversaRef = useRef(null);
  const cacheRef = useRef({}); // <--- ADICIONE ESTA LINHA AQUI
  const [buscou, setBuscou] = useState(false);

  // Carrega contas do usuário
  useEffect(() => {
    if (!usuarioId) return;
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(r => r.json())
      .then(d => setContas(d.contasML || []))
      .catch(() => {});
  }, [usuarioId]);

  // Auto-scroll na conversa
  useEffect(() => {
    if (conversaRef.current) {
      conversaRef.current.scrollTop = conversaRef.current.scrollHeight;
    }
  }, [conversa]);

const fetchConversaItem = async (pergunta) => {
    const cacheKey = `${pergunta.contaId}_${pergunta.item_id}`;

    if (cacheRef.current[cacheKey]) {
      return cacheRef.current[cacheKey];
    }

    const params = new URLSearchParams({
      itemId: pergunta.item_id,
      contaId: pergunta.contaId,
      userId: usuarioId
    });

    const adParams = new URLSearchParams({
      contaId: pergunta.contaId,
      userId: usuarioId
    });

    // CORREÇÃO: Rota correta e `.catch` para evitar crash na tela
    const [convRes, adRes] = await Promise.all([
      fetch(`/api/ml/perguntas/item?${params}`).catch(() => ({ ok: false })),
      fetch(`/api/ml/anuncio/${pergunta.item_id}?${adParams}`).catch(() => ({ ok: false }))
    ]);

    let convData = { questions:[] };
    if (convRes.ok) {
      try { convData = await convRes.json(); } catch(e) {}
    }

    let adData = null;
    if (adRes.ok) {
      try { adData = await adRes.json(); } catch(e) {}
    }

    const payload = {
      conversa: convData.questions || [],
      itemInfo: adData,
      buyerNicknames: convData.buyerNicknames || {}
    };

    cacheRef.current[cacheKey] = payload;
    return payload;
  };


  const carregarPerguntas = async () => {
    if (!usuarioId) return;
    setCarregando(true);
    setMsgStatus('');
    setPerguntaSelecionada(null);
    setConversa([]);
    setItemInfo(null);
    setBuscou(false); // Reseta
    try {
      const params = new URLSearchParams({ userId: usuarioId, status: statusFiltro, limit: 100 });
      const res = await fetch(`/api/ml/perguntas?${params}`);
      const data = await res.json();
      let lista = data.perguntas || [];
      if (contaFiltro !== 'todas') {
        lista = lista.filter(p => p.contaId === contaFiltro);
      }
      setPerguntas(lista);
      setTotal(lista.length);
      setBuscou(true); // Marca que o fetch foi concluído
      // Sinaliza para o DashboardLayout atualizar o contador de notificações
      window.dispatchEvent(new CustomEvent('refresh-notificacoes'));
    } catch (e) {
      setMsgStatus('Erro ao carregar perguntas.');
    } finally {
      setCarregando(false);
    }
  };

  const selecionarPergunta = async (pergunta) => {
    setPerguntaSelecionada(pergunta);
    setResposta('');
    setMsgStatus('');

    setConversa([]);
    setItemInfo(null);
    setCarregandoConversa(true);
    
    try {
      // O fetchConversaItem agora gerencia o cache e retorna os dados de forma limpa
      const dados = await fetchConversaItem(pergunta);
      const compradorId = String(pergunta.compradorId || pergunta.dadosML?.from?.id || '');
      const conversaFiltrada = compradorId
        ? dados.conversa.filter(q => String(q.from?.id) === compradorId)
        : dados.conversa;
      setConversa(conversaFiltrada);
      setItemInfo(dados.itemInfo);
      setBuyerNicknames(dados.buyerNicknames || {});
    } catch (e) {
      console.error("Erro ao carregar conversa:", e);
    } finally {
      setCarregandoConversa(false);
    }
  };

  const enviarResposta = async () => {
    if (enviando) return; // <-- ADICIONE ESTA LINHA AQUI!
    if (!resposta.trim() || !perguntaSelecionada) return;
    setEnviando(true);
    setMsgStatus('');
    try {
      const res = await fetch('/api/ml/responder-pergunta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: perguntaSelecionada.id,
          text: resposta.trim(),
          contaId: perguntaSelecionada.contaId,
          userId: usuarioId
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.erro || 'Erro ao enviar');
      }
      setMsgStatus('Resposta enviada com sucesso!');
      setResposta('');
      
      // CORREÇÃO: Limpa o cache para forçar a API a trazer a sua nova resposta
      const cacheKey = `${perguntaSelecionada.contaId}_${perguntaSelecionada.item_id}`;
      delete cacheRef.current[cacheKey];

      // Recarrega a conversa
      await selecionarPergunta(perguntaSelecionada);
      
      // Remove da lista se filtro for UNANSWERED
      if (statusFiltro === 'UNANSWERED') {
        setPerguntas(prev => prev.filter(p => p.id !== perguntaSelecionada.id));
        setTotal(prev => prev - 1);
        setPerguntaSelecionada(null);
        setConversa([]);
        setItemInfo(null);
      }
    } catch (e) {
      setMsgStatus(`Erro: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

  const excluirPergunta = async () => {
    if (!perguntaSelecionada) return;
    if (!window.confirm('Excluir esta pergunta permanentemente?')) return;
    try {
      const params = new URLSearchParams({ contaId: perguntaSelecionada.contaId, userId: usuarioId });
      const res = await fetch(`/api/ml/excluir-pergunta/${perguntaSelecionada.id}?${params}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.erro || 'Erro ao excluir');
      }
      setPerguntas(prev => prev.filter(p => p.id !== perguntaSelecionada.id));
      setTotal(prev => prev - 1);

      // CORREÇÃO: Limpa o cache ao excluir para não manter lixo na memória
      const cacheKey = `${perguntaSelecionada.contaId}_${perguntaSelecionada.item_id}`;
      delete cacheRef.current[cacheKey];

      setPerguntaSelecionada(null);
      setConversa([]);
      setItemInfo(null);
      setMsgStatus('');
    } catch (e) {
      setMsgStatus(`Erro: ${e.message}`);
    }
  };

  const anexarLink = (anuncio) => {
    const link = anuncio.permalink || '';
    setResposta(prev => prev ? `${prev}\n${link}` : link);
    setModalAnuncio(false);
  };

  const inserirRespostaRapida = (texto) => {
    setResposta(texto);
    setModalRespostas(false);
  };

  // ---- Estilos comuns ----
  const thS = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, fontSize: '0.8em', color: '#555', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' };
  const tdS = { padding: '6px 10px', fontSize: '0.8em', borderBottom: '1px solid #eee', color: '#333', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const btnS = (bg) => ({ padding: '5px 11px', fontSize: '0.78em', backgroundColor: bg, color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>

      {/* Modais */}
      {modalAnuncio && (
        <ModalPesquisarAnuncio usuarioId={usuarioId} contas={contas} onAnexar={anexarLink} onFechar={() => setModalAnuncio(false)} />
      )}
      {modalRespostas && (
        <ModalRespostasRapidas onSelecionar={inserirRespostaRapida} onFechar={() => setModalRespostas(false)} />
      )}

      {/* Barra de filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82em', color: '#555' }}>Conta:</span>
        <select
          value={contaFiltro}
          onChange={e => setContaFiltro(e.target.value)}
          style={{ fontSize: '0.82em', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '3px', fontFamily: 'inherit' }}
        >
          <option value="todas">Todas as Contas</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
        </select>

        <span style={{ fontSize: '0.82em', color: '#555' }}>Status:</span>
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          style={{ fontSize: '0.82em', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '3px', fontFamily: 'inherit' }}
        >
          {STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}
        </select>

        <button
          onClick={carregarPerguntas}
          disabled={carregando}
          style={{ ...btnS('#2980b9'), display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {carregando ? 'Carregando...' : 'Carregar Perguntas'}
        </button>

        <span style={{ fontSize: '0.8em', color: '#666' }}>Total: {total} pergunta(s) encontrada(s).</span>

      </div>
      

      {/* Painel principal */}
      <div style={{ flex: 1, display: 'flex', gap: '10px', minHeight: 0 }}>

        {/* Lista de perguntas */}
        <div style={{ flex: '0 0 52%', border: '1px solid #ccc', borderRadius: '4px', overflow: 'auto', backgroundColor: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '47%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={thS}>Conta</th>
                <th style={thS}>Item ID</th>
                <th style={thS}>Pergunta</th>
                <th style={thS}>Data</th>
              </tr>
            </thead>
            <tbody>
              {perguntas.map(p => {
                const ativo = perguntaSelecionada?.id === p.id;
                return (
                  <tr
                    key={p.id}
                    onClick={() => selecionarPergunta(p)}
                    style={{ cursor: 'pointer', backgroundColor: ativo ? '#1a6fbb' : 'transparent' }}
                    onMouseEnter={e => { if (!ativo) e.currentTarget.style.backgroundColor = '#f0f4f8'; }}
                    onMouseLeave={e => { if (!ativo) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <td style={{ ...tdS, color: ativo ? '#fff' : '#333', fontWeight: ativo ? 600 : 400 }}>
                      {p.contaNickname || p.contaId}
                    </td>
                    <td style={{ ...tdS, color: ativo ? '#cde' : '#2980b9' }}>{p.item_id}</td>
                    <td style={{ ...tdS, color: ativo ? '#eee' : '#333' }}>{p.text}</td>
                    <td style={{ ...tdS, color: ativo ? '#ccc' : '#777', fontSize: '0.74em' }}>{formatarData(p.date_created)}</td>
                  </tr>
                );
              })}
              {perguntas.length === 0 && !carregando && !buscou && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#aaa', fontSize: '0.82em' }}>
                    Clique em "Carregar Perguntas" para buscar.
                  </td>
                </tr>
              )}
              {perguntas.length === 0 && !carregando && buscou && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#888', fontSize: '0.82em', fontWeight: 'bold' }}>
                    Nenhuma pergunta encontrada com estes filtros.
                  </td>
                </tr>
              )}
              {carregando && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.82em' }}>
                    Buscando perguntas...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Painel direito */}
        <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* Info do anúncio */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', backgroundColor: '#f8f9fa', flexShrink: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85em', color: '#2c3e50', marginBottom: '6px' }}>Conversa e Resposta</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              {/* Imagem */}
              <div style={{ width: '60px', height: '60px', flexShrink: 0, border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {itemInfo?.thumbnail
                  ? <img src={itemInfo.thumbnail.replace('http://', 'https://')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                }
              </div>

              {/* Detalhes */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82em', fontWeight: 600, color: '#2c3e50', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {itemInfo?.titulo || (perguntaSelecionada ? perguntaSelecionada.item_id : '(Selecione uma pergunta)')}
                </div>
                {itemInfo?.sku && (
                  <div style={{ fontSize: '0.75em', color: '#888', marginBottom: '3px' }}>SKU: {itemInfo.sku}</div>
                )}
                {(itemInfo?.permalink || perguntaSelecionada) && (
                  <a
                    href={itemInfo?.permalink || `https://www.mercadolivre.com.br/p/${perguntaSelecionada?.item_id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75em', color: '#2980b9', textDecoration: 'none', border: '1px solid #2980b9', padding: '2px 7px', borderRadius: '3px' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                    Ver no ML
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Histórico da conversa */}
          <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', padding: '6px 10px 2px', flexShrink: 0 }}>
            Histórico da Conversa
          </div>
          <div
            ref={conversaRef}
            style={{ flex: 1, overflow: 'auto', padding: '4px 10px', borderBottom: '1px solid #eee', minHeight: 0 }}
          >
            {carregandoConversa && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.8em' }}>Carregando conversa...</div>
            )}
            {!carregandoConversa && conversa.length === 0 && !perguntaSelecionada && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#ccc', fontSize: '0.8em' }}>Selecione uma pergunta para ver o histórico.</div>
            )}
            {!carregandoConversa && conversa.map(q => (
              <div key={q.id} style={{ marginBottom: '8px' }}>
                {/* Pergunta */}
                <div style={{ marginBottom: '3px' }}>
                  <div style={{ fontSize: '0.72em', color: '#888', marginBottom: '1px' }}>
                    PERGUNTA ({formatarData(q.date_created)}){q.from?.id ? <span style={{ marginLeft: '6px', color: '#aaa' }}>Comprador: <span style={{ color: '#2980b9' }}>{buyerNicknames[q.from.id] || `#${q.from.id}`}</span></span> : ''}:
                  </div>
                  <div style={{ fontSize: '0.82em', color: '#1a6fbb', lineHeight: 1.4 }}>{q.text || <em style={{ color: '#ccc' }}>[texto ocultado]</em>}</div>
                </div>
                {/* Resposta */}
                {q.answer && (
                  <div style={{ marginLeft: '12px', borderLeft: '2px solid #27ae60', paddingLeft: '8px', marginTop: '3px' }}>
                    <div style={{ fontSize: '0.72em', color: '#888', marginBottom: '1px' }}>
                      RESPOSTA ({formatarData(q.answer.date_created)}):
                    </div>
                    <div style={{ fontSize: '0.82em', color: q.answer.status === 'BANNED' ? '#e74c3c' : '#27ae60', lineHeight: 1.4 }}>
                      {q.answer.text || <em style={{ color: '#ccc' }}>[texto ocultado]</em>}
                      {q.answer.status === 'BANNED' && <span style={{ fontSize: '0.85em', marginLeft: '6px', color: '#e74c3c' }}>(BANNED)</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Campo de resposta */}
          <div style={{ padding: '6px 10px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', marginBottom: '3px' }}>Sua Resposta</div>
            <textarea
              value={resposta}
              onChange={e => setResposta(e.target.value)}
              placeholder={perguntaSelecionada ? 'Digite sua resposta (máx. 2000 caracteres)...' : ''}
              maxLength={2000}
              style={{
                width: '100%', height: '70px', resize: 'none',
                border: '1px solid #ccc', borderRadius: '3px',
                fontSize: '0.8em', padding: '5px 7px', boxSizing: 'border-box',
                fontFamily: 'inherit', color: '#333',
              }}
            />
            {resposta.length > 0 && (
              <div style={{ fontSize: '0.72em', color: '#aaa', textAlign: 'right', marginTop: '1px' }}>
                {resposta.length}/2000
              </div>
            )}
          </div>

          {/* Mensagem de status */}
          {msgStatus && (
            <div style={{
              margin: '0 10px 4px',
              padding: '4px 8px',
              borderRadius: '3px',
              fontSize: '0.78em',
              backgroundColor: msgStatus.startsWith('Erro') ? '#fdecea' : '#eafaf1',
              color: msgStatus.startsWith('Erro') ? '#c0392b' : '#27ae60',
              border: `1px solid ${msgStatus.startsWith('Erro') ? '#f5b7b1' : '#a9dfbf'}`,
              flexShrink: 0,
            }}>
              {msgStatus}
            </div>
          )}

          {/* Botões */}
          <div style={{ padding: '6px 10px 8px', borderTop: '1px solid #eee', display: 'flex', gap: '5px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={() => setModalAnuncio(true)}
              disabled={!perguntaSelecionada}
              style={{ ...btnS('#6c757d'), opacity: perguntaSelecionada ? 1 : 0.5 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '3px' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Pesquisar Anúncio...
            </button>
            <button
              onClick={() => setModalRespostas(true)}
              style={btnS('#8e44ad')}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '3px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Respostas Rápidas
            </button>
            <button
              onClick={excluirPergunta}
              disabled={!perguntaSelecionada}
              style={{ ...btnS('#c0392b'), opacity: perguntaSelecionada ? 1 : 0.5 }}
            >
              Excluir Pergunta
            </button>
            <button
              onClick={enviarResposta}
              disabled={!perguntaSelecionada || !resposta.trim() || enviando}
              style={{ ...btnS('#27ae60'), opacity: (perguntaSelecionada && resposta.trim() && !enviando) ? 1 : 0.5, marginLeft: 'auto' }}
            >
              {enviando ? 'Enviando...' : 'Enviar Resposta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
