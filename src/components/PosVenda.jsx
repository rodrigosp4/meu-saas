import React, { useState, useEffect, useRef, useCallback } from 'react';

const STATUS_BLOQUEIO = {
  blocked_by_time: 'Prazo expirado (30 dias)',
  blocked_by_buyer: 'Bloqueado pelo comprador',
  blocked_by_mediation: 'Mediação em andamento',
  blocked_by_fulfillment: 'Aguardando entrega (Fulfillment)',
  blocked_by_payment: 'Pagamento pendente',
  blocked_by_cancelled_order: 'Pedido cancelado',
  blocked_by_ai_assistant: 'Assistente IA ativo (Fulfillment)',
  blocked_by_ai_assistant_expired: 'Assistente IA expirado',
  blocked_by_ai_assistant_contact_closed: 'Consulta finalizada pelo assistente',
  blocked_by_conversation_initiated_by_seller_limited: 'Use o guia de motivos (ME2)',
  blocked_by_refund: 'Reembolso realizado',
  blocked_by_deactivated_account: 'Conta desativada',
  blocked_by_restrictions: 'Restrição na conta',
  blocked_by_message_pending_review: 'Conversa em revisão',
};

function extrairPackId(resource) {
  if (!resource) return '';
  const m = resource.match(/packs\/(\d+)/);
  return m ? m[1] : resource.replace(/\//g, '');
}

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PosVenda({ usuarioId }) {
  const [contas, setContas] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [aba, setAba] = useState('nao-lidas'); // 'nao-lidas' | 'recentes' | 'buscar'
  const [apenasComMensagens, setApenasComMensagens] = useState(false);
  const [conversas, setConversas] = useState([]);     // para aba nao-lidas
  const [recentes, setRecentes] = useState([]);        // para aba recentes
  const [buscaInput, setBuscaInput] = useState('');    // para aba buscar
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [conversaStatus, setConversaStatus] = useState(null);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msgStatus, setMsgStatus] = useState('');
  const [actionGuide, setActionGuide] = useState(null);
  const [modoActionGuide, setModoActionGuide] = useState(false);
  const [optionSelecionada, setOptionSelecionada] = useState('');
  const chatRef = useRef(null);

  // ───── Carregar contas ML ─────
  useEffect(() => {
    fetch('/api/pos-venda/contas')
      .then(r => r.json())
      .then(d => {
        const lista = d.contas || [];
        setContas(lista);
        if (lista.length > 0) setContaSelecionada(lista[0].id);
      })
      .catch(() => {});
  }, []);

  // ───── Buscar não lidas ─────
  const buscarNaoLidas = useCallback(async () => {
    setCarregandoLista(true);
    limparDireito();
    try {
      const qs = contaSelecionada ? `?contaId=${contaSelecionada}` : '';
      const r = await fetch(`/api/pos-venda/nao-lidas${qs}`);
      const d = await r.json();
      setConversas(d.conversas || []);
    } catch {
      setConversas([]);
    } finally {
      setCarregandoLista(false);
    }
  }, [contaSelecionada]);

  // ───── Buscar pedidos recentes ─────
  const buscarRecentes = useCallback(async (comMensagens = apenasComMensagens) => {
    setCarregandoLista(true);
    limparDireito();
    try {
      const base = contaSelecionada ? `?contaId=${contaSelecionada}&limite=50` : '?limite=50';
      const qs = comMensagens ? `${base}&apenasComMensagens=true` : base;
      const r = await fetch(`/api/pos-venda/pedidos-recentes${qs}`);
      const d = await r.json();
      setRecentes(d.pedidos || []);
    } catch {
      setRecentes([]);
    } finally {
      setCarregandoLista(false);
    }
  }, [contaSelecionada, apenasComMensagens]);

  // ───── Disparar busca ao mudar aba ou conta ─────
  useEffect(() => {
    if (!contaSelecionada) return;
    if (aba === 'nao-lidas') buscarNaoLidas();
    else if (aba === 'recentes') buscarRecentes();
  }, [aba, contaSelecionada]);

  // ───── Scroll para o final do chat ─────
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensagens]);

  function limparDireito() {
    setConversaSelecionada(null);
    setMensagens([]);
    setPedido(null);
    setConversaStatus(null);
    setTexto('');
    setMsgStatus('');
    setActionGuide(null);
    setModoActionGuide(false);
    setOptionSelecionada('');
  }

  // ───── Abrir uma conversa a partir de packId + contaId ─────
  async function abrirConversa(packId, contaId, nicknameHint) {
    const conv = { resource: `/packs/${packId}/sellers/${contaId}`, contaId, nickname: nicknameHint };
    setConversaSelecionada(conv);
    setMensagens([]);
    setPedido(null);
    setConversaStatus(null);
    setTexto('');
    setMsgStatus('');
    setActionGuide(null);
    setModoActionGuide(false);
    setOptionSelecionada('');
    setCarregandoMensagens(true);

    const qs = `?contaId=${contaId}&markAsRead=false`;
    const [msgRes, pedidoRes] = await Promise.allSettled([
      fetch(`/api/pos-venda/mensagens/${packId}${qs}`).then(r => r.json()),
      fetch(`/api/pos-venda/pedido/${packId}?contaId=${contaId}`).then(r => r.json()),
    ]);

    setCarregandoMensagens(false);

    if (msgRes.status === 'fulfilled') {
      setMensagens(msgRes.value.messages || []);
      setConversaStatus(msgRes.value.conversation_status || null);
    }
    if (pedidoRes.status === 'fulfilled') {
      setPedido(pedidoRes.value.pedido || null);
    }

    const status = msgRes.value?.conversation_status;
    if (status?.substatus === 'blocked_by_conversation_initiated_by_seller_limited') {
      try {
        const agRes = await fetch(`/api/pos-venda/action-guide/${packId}?contaId=${contaId}`).then(r => r.json());
        setActionGuide(agRes);
        setModoActionGuide(true);
      } catch {}
    }
  }

  // ───── Busca manual por pack/pedido ─────
  async function executarBusca() {
    const id = buscaInput.trim();
    if (!id || !contaSelecionada) return;
    const conta = contas.find(c => c.id === contaSelecionada);
    await abrirConversa(id, contaSelecionada, conta?.nickname || '');
  }

  // ───── Enviar mensagem ─────
  async function enviarMensagem() {
    if (!texto.trim() || enviando || !conversaSelecionada) return;
    if (texto.trim().length > 350) { setMsgStatus('Máximo 350 caracteres.'); return; }
    setEnviando(true);
    setMsgStatus('');
    const packId = extrairPackId(conversaSelecionada.resource);
    try {
      const r = await fetch(`/api/pos-venda/mensagens/${packId}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId: conversaSelecionada.contaId, texto: texto.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsgStatus(`Erro: ${d.erro || 'falha ao enviar'}`);
      } else {
        setTexto('');
        setMsgStatus('Mensagem enviada!');
        const qs = `?contaId=${conversaSelecionada.contaId}&markAsRead=false`;
        const reload = await fetch(`/api/pos-venda/mensagens/${packId}${qs}`).then(r => r.json());
        setMensagens(reload.messages || []);
        setConversaStatus(reload.conversation_status || null);
        setTimeout(() => setMsgStatus(''), 3000);
      }
    } catch {
      setMsgStatus('Erro de conexão.');
    } finally {
      setEnviando(false);
    }
  }

  // ───── Enviar via Action Guide ─────
  async function enviarActionGuideOpcao() {
    if (!optionSelecionada || enviando || !conversaSelecionada) return;
    const packId = extrairPackId(conversaSelecionada.resource);
    const opcao = actionGuide?.options?.find(o => o.option_id === optionSelecionada);
    setEnviando(true);
    setMsgStatus('');
    try {
      const body = { contaId: conversaSelecionada.contaId, option_id: optionSelecionada };
      if (opcao?.type === 'template') { body.template_id = opcao.template_id; }
      else { if (!texto.trim()) { setMsgStatus('Digite o texto.'); setEnviando(false); return; } body.text = texto.trim(); }
      const r = await fetch(`/api/pos-venda/action-guide/${packId}/option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsgStatus(`Erro: ${d.erro || 'falha'}`);
      } else {
        setTexto('');
        setMsgStatus('Mensagem enviada!');
        setModoActionGuide(false);
        const qs = `?contaId=${conversaSelecionada.contaId}&markAsRead=false`;
        const reload = await fetch(`/api/pos-venda/mensagens/${packId}${qs}`).then(r => r.json());
        setMensagens(reload.messages || []);
        setConversaStatus(reload.conversation_status || null);
        setTimeout(() => setMsgStatus(''), 3000);
      }
    } catch {
      setMsgStatus('Erro de conexão.');
    } finally {
      setEnviando(false);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────

  const bloqueada = conversaStatus?.status === 'blocked';
  const motivoBloqueio = bloqueada
    ? (STATUS_BLOQUEIO[conversaStatus.substatus] || conversaStatus.substatus || 'Bloqueada')
    : null;

  const tabStyle = (id) => ({
    padding: '5px 14px', fontSize: '0.82em', fontWeight: 600, cursor: 'pointer',
    borderRadius: '4px 4px 0 0', border: '1px solid #ddd', borderBottom: 'none',
    backgroundColor: aba === id ? '#fff' : '#f5f5f5',
    color: aba === id ? '#1565c0' : '#555',
    marginRight: '2px',
  });

  return (
    <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 100px)', fontFamily: "'Segoe UI', sans-serif", fontSize: '0.9em' }}>

      {/* ═══════════ PAINEL ESQUERDO ═══════════ */}
      <div style={{ width: '420px', minWidth: '320px', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>

        {/* Conta + botão */}
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid #e8e8e8', backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82em', color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>Conta:</span>
            <select
              value={contaSelecionada}
              onChange={e => setContaSelecionada(e.target.value)}
              style={{ fontSize: '0.82em', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', flex: 1, minWidth: 0 }}
            >
              {contas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
              {contas.length === 0 && <option value="">Nenhuma conta ML</option>}
            </select>
            <button
              onClick={() => { if (aba === 'nao-lidas') buscarNaoLidas(); else if (aba === 'recentes') buscarRecentes(); }}
              disabled={carregandoLista || !contaSelecionada}
              style={{ fontSize: '0.82em', padding: '4px 10px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: carregandoLista ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
            >
              {carregandoLista ? '...' : '↻'}
            </button>
          </div>

          {/* Abas */}
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: '2px' }}>
            <button style={tabStyle('nao-lidas')} onClick={() => setAba('nao-lidas')}>Não lidas</button>
            <button style={tabStyle('recentes')} onClick={() => setAba('recentes')}>Recentes</button>
            <button style={tabStyle('buscar')} onClick={() => setAba('buscar')}>Buscar</button>
          </div>
        </div>

        {/* Aba: Busca manual */}
        {aba === 'buscar' && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8e8', backgroundColor: '#fafafa', display: 'flex', gap: '6px' }}>
            <input
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && executarBusca()}
              placeholder="Pack ID ou Order ID..."
              style={{ flex: 1, fontSize: '0.82em', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <button
              onClick={executarBusca}
              disabled={!buscaInput.trim() || !contaSelecionada}
              style={{ fontSize: '0.82em', padding: '5px 12px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Ir
            </button>
          </div>
        )}

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {aba === 'nao-lidas' && (
            <>
              <div style={{ padding: '6px 14px', fontSize: '0.76em', color: '#27ae60', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>
                {carregandoLista ? 'Carregando...' : `${conversas.length} conversa(s) com mensagens pendentes`}
              </div>
              {!carregandoLista && conversas.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '0.85em' }}>Nenhuma mensagem não lida.</div>
              )}
              {conversas.map((conv, i) => {
                const packId = extrairPackId(conv.resource);
                const isSelected = conversaSelecionada?.contaId === conv.contaId && extrairPackId(conversaSelecionada?.resource) === packId;
                return (
                  <div
                    key={i}
                    onClick={() => abrirConversa(packId, conv.contaId, conv.nickname)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                      backgroundColor: isSelected ? '#1565c0' : 'transparent',
                      color: isSelected ? '#fff' : '#333',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f0f4ff'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88em' }}>#{packId}</div>
                      <div style={{ fontSize: '0.76em', color: isSelected ? '#cce' : '#888', marginTop: '1px' }}>{conv.nickname}</div>
                    </div>
                    <span style={{
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#e74c3c',
                      color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '0.82em', fontWeight: 700, flexShrink: 0
                    }}>
                      {conv.count}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {aba === 'recentes' && (
            <>
              <div style={{ padding: '6px 14px', fontSize: '0.76em', color: '#555', fontWeight: 500, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span>{carregandoLista ? (apenasComMensagens ? 'Verificando mensagens...' : 'Carregando...') : `${recentes.length} pedido(s)`}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 400, color: apenasComMensagens ? '#1565c0' : '#888', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={apenasComMensagens}
                    onChange={e => {
                      const val = e.target.checked;
                      setApenasComMensagens(val);
                      buscarRecentes(val);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  Com mensagem
                </label>
              </div>
              {!carregandoLista && recentes.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '0.85em' }}>Nenhum pedido encontrado.</div>
              )}
              {recentes.map((p, i) => {
                const packId = String(p.packId);
                const isSelected = conversaSelecionada?.contaId === p.contaId && extrairPackId(conversaSelecionada?.resource) === packId;
                return (
                  <div
                    key={i}
                    onClick={() => abrirConversa(packId, p.contaId, p.nickname)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                      backgroundColor: isSelected ? '#1565c0' : 'transparent',
                      color: isSelected ? '#fff' : '#333',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f0f4ff'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      #{p.orderId}
                    </div>
                    <div style={{ fontSize: '0.76em', color: isSelected ? '#dde' : '#888', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.titulo}
                    </div>
                    <div style={{ fontSize: '0.72em', color: isSelected ? '#cce' : '#aaa', marginTop: '1px' }}>
                      {formatarData(p.dataCriacao)} · {p.nickname}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {aba === 'buscar' && !conversaSelecionada && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '0.85em' }}>
              Digite um Pack ID ou Order ID e clique em Ir.
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ PAINEL DIREITO ═══════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '12px', gap: '10px', minWidth: 0 }}>
        {conversaSelecionada ? (
          <>
            {/* Detalhes do Pedido */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '12px 16px' }}>
              <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {pedido?.orderId
                  ? `Pedido #${pedido.orderId}`
                  : `Pack ${extrairPackId(conversaSelecionada.resource)}`}
                {conversaStatus && (
                  <span style={{
                    marginLeft: '10px', padding: '2px 8px', borderRadius: '10px', fontSize: '0.88em',
                    backgroundColor: bloqueada ? '#fff0f0' : '#d4edda',
                    color: bloqueada ? '#c0392b' : '#155724',
                    border: `1px solid ${bloqueada ? '#f5c6c6' : '#b8dfc5'}`,
                  }}>
                    {bloqueada ? `🔒 ${motivoBloqueio}` : '● Ativa'}
                  </span>
                )}
              </div>

              {pedido ? (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  {pedido.produto?.thumbnail ? (
                    <img src={pedido.produto.thumbnail} alt="" style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #e0e0e0', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '4px', border: '1px solid #e0e0e0', backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: '0.9em', lineHeight: 1.4, marginBottom: '4px' }}>
                      {pedido.produto?.titulo || '—'}
                    </div>
                    <div style={{ fontSize: '0.78em', color: '#777' }}>
                      {pedido.comprador?.nome && <span>Comprador: {pedido.comprador.nome} · </span>}
                      {pedido.produto?.preco && <span>R$ {Number(pedido.produto.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · </span>}
                      <span>Pack #{pedido.packId}</span>
                    </div>
                    {pedido.produto?.permalink && (
                      <a href={pedido.produto.permalink} target="_blank" rel="noreferrer"
                        style={{ fontSize: '0.76em', color: '#2980b9', textDecoration: 'none', marginTop: '4px', display: 'inline-block' }}>
                        Ver no ML ↗
                      </a>
                    )}
                  </div>
                </div>
              ) : carregandoMensagens ? (
                <div style={{ fontSize: '0.82em', color: '#aaa' }}>Carregando dados do pedido...</div>
              ) : (
                <div style={{ fontSize: '0.82em', color: '#aaa' }}>Dados do pedido não disponíveis.</div>
              )}
            </div>

            {/* Chat */}
            <div style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #e8e8e8', fontSize: '0.78em', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Histórico de Mensagens
                {carregandoMensagens && <span style={{ fontWeight: 400, color: '#aaa' }}>Carregando...</span>}
              </div>

              <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fafafa' }}>
                {carregandoMensagens ? (
                  <div style={{ textAlign: 'center', color: '#aaa', fontSize: '0.85em', padding: '20px' }}>Carregando mensagens...</div>
                ) : mensagens.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#aaa', fontSize: '0.85em', padding: '20px' }}>Nenhuma mensagem nesta conversa.</div>
                ) : (
                  mensagens.map((msg, i) => {
                    const fromId = String(msg.from?.user_id);
                    const deLado = fromId === conversaSelecionada.contaId ? 'direita' : 'esquerda';
                    const modStatus = msg.message_moderation?.status;
                    const moderada = modStatus && modStatus !== 'clean' && modStatus !== 'NON_MODERATED';

                    return (
                      <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: deLado === 'direita' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ fontSize: '0.7em', color: '#aaa', marginBottom: '2px' }}>
                          {deLado === 'direita' ? 'Você' : 'Comprador'} · {formatarData(msg.message_date?.created || msg.message_date?.received)}
                          {moderada && <span style={{ color: '#e67e22', marginLeft: '6px' }}>⚠ {modStatus}</span>}
                        </div>
                        <div style={{
                          maxWidth: '80%', padding: '8px 12px',
                          borderRadius: deLado === 'direita' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          backgroundColor: deLado === 'direita' ? '#d4edda' : '#fff',
                          border: '1px solid', borderColor: deLado === 'direita' ? '#b8dfc5' : '#e0e0e0',
                          fontSize: '0.85em', color: '#333', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          opacity: msg.status === 'rejected' ? 0.5 : 1,
                        }}>
                          {msg.text || <em style={{ color: '#aaa' }}>[Mensagem sem texto]</em>}
                          {msg.message_attachments?.map((a, ai) => (
                            <div key={ai} style={{ marginTop: '4px', fontSize: '0.82em', color: '#2980b9' }}>📎 {a.original_filename || a.filename}</div>
                          ))}
                        </div>
                        {msg.message_date?.read && (
                          <div style={{ fontSize: '0.66em', color: '#27ae60', marginTop: '1px' }}>Lida</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Área de resposta */}
              <div style={{ borderTop: '1px solid #e8e8e8', padding: '10px 14px', backgroundColor: '#fff' }}>
                {bloqueada ? (
                  <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '8px 12px', fontSize: '0.82em', color: '#856404', marginBottom: '8px' }}>
                    🔒 Conversa bloqueada: <strong>{motivoBloqueio}</strong>. Não é possível enviar mensagens.
                  </div>
                ) : null}

                {modoActionGuide && actionGuide?.options && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.78em', color: '#555', marginBottom: '4px', fontWeight: 600 }}>Escolha o motivo do contato:</div>
                    <select
                      value={optionSelecionada}
                      onChange={e => setOptionSelecionada(e.target.value)}
                      style={{ width: '100%', fontSize: '0.82em', padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '6px' }}
                    >
                      <option value="">Selecione um motivo...</option>
                      {actionGuide.options.map(o => (
                        <option key={o.option_id} value={o.option_id}>{o.option_id}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!bloqueada && (
                  <>
                    <div style={{ fontSize: '0.78em', color: '#888', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{modoActionGuide ? 'Texto (opcional para templates)' : 'Resposta'}</span>
                      <span style={{ color: texto.length > 320 ? '#e74c3c' : '#aaa' }}>{texto.length}/350</span>
                    </div>
                    <textarea
                      value={texto}
                      onChange={e => setTexto(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      disabled={enviando}
                      style={{ width: '100%', height: '64px', resize: 'none', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', fontSize: '0.85em', color: '#333', backgroundColor: enviando ? '#f9f9f9' : '#fff', boxSizing: 'border-box' }}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !modoActionGuide) enviarMensagem(); }}
                    />
                  </>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                  <div style={{ fontSize: '0.78em' }}>
                    {msgStatus && (
                      <span style={{ color: msgStatus.startsWith('Erro') ? '#e74c3c' : '#27ae60', fontWeight: 500 }}>
                        {msgStatus}
                      </span>
                    )}
                    {!bloqueada && !modoActionGuide && (
                      <span style={{ color: '#aaa', marginLeft: msgStatus ? '8px' : 0 }}>Ctrl+Enter para enviar</span>
                    )}
                  </div>
                  {!bloqueada && (
                    <button
                      onClick={modoActionGuide ? enviarActionGuideOpcao : enviarMensagem}
                      disabled={enviando || (modoActionGuide ? !optionSelecionada : !texto.trim())}
                      style={{
                        fontSize: '0.82em', padding: '6px 16px',
                        backgroundColor: enviando ? '#95a5a6' : '#2c3e50',
                        color: '#fff', border: 'none', borderRadius: '4px', cursor: enviando ? 'wait' : 'pointer',
                        opacity: (!texto.trim() && !modoActionGuide) || (modoActionGuide && !optionSelecionada) ? 0.5 : 1,
                      }}
                    >
                      {enviando ? 'Enviando...' : 'Enviar →'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.9em', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            Selecione uma conversa na lista para ver as mensagens.
          </div>
        )}
      </div>
    </div>
  );
}
