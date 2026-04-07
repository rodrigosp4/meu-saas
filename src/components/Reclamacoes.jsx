import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const TIPO_LABEL = {
  mediations: 'Mediação',
  returns: 'Devolução',
  fulfillment: 'Fulfillment',
  ml_case: 'Caso ML',
  cancel_sale: 'Cancel. Venda',
  cancel_purchase: 'Cancel. Compra',
  change: 'Troca',
};

const STAGE_LABEL = {
  claim: 'Reclamação',
  dispute: 'Disputa/Mediação',
  recontact: 'Recontato',
  stale: 'Stale',
  none: '-',
};

const STAGE_COLOR = {
  claim: { bg: '#fff3cd', color: '#856404' },
  dispute: { bg: '#f8d7da', color: '#721c24' },
  recontact: { bg: '#d1ecf1', color: '#0c5460' },
  none: { bg: '#f0f0f0', color: '#555' },
};

const REASON_PREFIX = {
  PNR: { label: 'Não Recebido', color: '#e74c3c' },
  PDD: { label: 'Defeituoso/Diferente', color: '#e67e22' },
  CS: { label: 'Cancelamento', color: '#3498db' },
};

const ACTION_LABEL = {
  send_message_to_complainant: 'Enviar mensagem ao comprador',
  send_message_to_mediator: 'Enviar mensagem ao mediador',
  refund: 'Reembolsar comprador',
  open_dispute: 'Abrir disputa',
  return_review_ok: 'Confirmar recebimento da devolução',
  return_review_fail: 'Informar problema na devolução',
  return_review_unified_ok: 'Confirmar devolução (unificado)',
  return_review_unified_fail: 'Rejeitar devolução (unificado)',
  appeal: 'Contestar decisão',
  appeal_close: 'Encerrar contestação',
};

const RETURN_REVIEW_ACTIONS = new Set([
  'return_review_ok', 'return_review_fail',
  'return_review_unified_ok', 'return_review_unified_fail',
]);

function getReasonPrefix(reasonId) {
  if (!reasonId) return null;
  for (const [prefix, info] of Object.entries(REASON_PREFIX)) {
    if (reasonId.startsWith(prefix)) return info;
  }
  return null;
}

function temDevolucao(dadosML) {
  if (!dadosML) return false;
  if (dadosML.type === 'returns') return true;
  const actions = dadosML.players?.flatMap(p => p.available_actions?.map(a => a.action) || []) || [];
  return actions.some(a => RETURN_REVIEW_ACTIONS.has(a));
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Reclamacoes() {
  const { canUseResource } = useAuth();
  const [reclamacoes, setReclamacoes] = useState([]);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtroLida, setFiltroLida] = useState('todas'); // todas | nao_lidas
  const [claimAberto, setClaimAberto] = useState(null); // { claim, mensagens }
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msgTexto, setMsgTexto] = useState('');
  const [receiverRole, setReceiverRole] = useState('complainant');
  const [feedbackEnvio, setFeedbackEnvio] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);

  const fetchLista = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroLida === 'nao_lidas' ? '?lida=false' : '';
      const r = await fetch(`/api/reclamacoes${params}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setReclamacoes(data.reclamacoes || []);
      setTotalNaoLidas(data.totalNaoLidas || 0);
    } catch {
      setReclamacoes([]);
    } finally {
      setLoading(false);
    }
  }, [filtroLida]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      await fetch('/api/reclamacoes/sincronizar', { method: 'POST' });
      await fetchLista();
      window.dispatchEvent(new Event('refresh-notificacoes'));
    } catch {
      // silencioso
    } finally {
      setSincronizando(false);
    }
  }, [fetchLista]);

  // Na montagem: sincroniza automaticamente com o ML
  useEffect(() => { sincronizar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) fetchLista();
  }, [filtroLida]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrirDetalhe(rec) {
    setLoadingDetalhe(true);
    setClaimAberto(null);
    setMsgTexto('');
    setFeedbackEnvio(null);
    try {
      // Marca como lida
      await fetch(`/api/reclamacoes/${rec.id}/marcar-lida`, { method: 'POST' });
      // Busca detalhe completo
      const r = await fetch(`/api/reclamacoes/${rec.id}/detail`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setClaimAberto(data);
      // Determina receptor padrão (mediador se stage === dispute)
      const stage = data.claim?.stage;
      setReceiverRole(stage === 'dispute' ? 'mediator' : 'complainant');
      // Atualiza lista
      setReclamacoes(prev => prev.map(r2 => r2.id === rec.id ? { ...r2, lida: true } : r2));
      setTotalNaoLidas(prev => Math.max(0, prev - (rec.lida ? 0 : 1)));
      window.dispatchEvent(new Event('refresh-notificacoes'));
    } catch {
      setClaimAberto({ erro: true });
    } finally {
      setLoadingDetalhe(false);
    }
  }

  async function enviarMensagem() {
    if (!msgTexto.trim() || !claimAberto?.claim) return;
    setEnviando(true);
    setFeedbackEnvio(null);
    try {
      const r = await fetch(`/api/reclamacoes/${claimAberto.claim.id}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_role: receiverRole, message: msgTexto.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erro || 'Erro ao enviar');
      setFeedbackEnvio({ tipo: 'ok', msg: 'Mensagem enviada com sucesso!' });
      setMsgTexto('');
      // Recarrega mensagens
      const r2 = await fetch(`/api/reclamacoes/${claimAberto.claim.id}/detail`);
      if (r2.ok) {
        const d2 = await r2.json();
        setClaimAberto(d2);
      }
    } catch (e) {
      setFeedbackEnvio({ tipo: 'erro', msg: e.message });
    } finally {
      setEnviando(false);
    }
  }

  async function marcarTodasLidas() {
    await fetch('/api/reclamacoes/marcar-todas-lidas', { method: 'POST' });
    setReclamacoes(prev => prev.map(r => ({ ...r, lida: true })));
    setTotalNaoLidas(0);
    window.dispatchEvent(new Event('refresh-notificacoes'));
  }

  // Ações disponíveis do vendedor no claim
  // ML usa role='respondent' para o vendedor (não type='seller')
  const availableActions = claimAberto?.claim?.players
    ?.find(p => p.role === 'respondent' || p.type === 'seller')
    ?.available_actions || [];

  // Verifica se pode enviar mensagem (para qual receiver_role)
  const podeMensagemComprador = availableActions.some(a => a.action === 'send_message_to_complainant');
  const podeMensagemMediador = availableActions.some(a => a.action === 'send_message_to_mediator');
  const podeEnviarMsg = podeMensagemComprador || podeMensagemMediador;

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0 }}>

      {/* ── LISTA DE RECLAMAÇÕES ── */}
      <div style={{
        width: claimAberto || loadingDetalhe ? 340 : '100%',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'width 0.2s',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.2em', color: '#2c3e50', fontWeight: 700 }}>
              Reclamações ML
            </h2>
            {totalNaoLidas > 0 && (
              <span style={{
                backgroundColor: '#e74c3c', color: '#fff',
                borderRadius: 12, padding: '2px 8px',
                fontSize: '0.75em', fontWeight: 700,
              }}>
                {totalNaoLidas} nova{totalNaoLidas !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setFiltroLida('todas')}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: '0.82em', fontWeight: 600,
                backgroundColor: filtroLida === 'todas' ? '#2c3e50' : '#f0f0f0',
                color: filtroLida === 'todas' ? '#fff' : '#555',
              }}
            >
              Todas
            </button>
            <button
              onClick={() => setFiltroLida('nao_lidas')}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: '0.82em', fontWeight: 600,
                backgroundColor: filtroLida === 'nao_lidas' ? '#e74c3c' : '#f0f0f0',
                color: filtroLida === 'nao_lidas' ? '#fff' : '#555',
              }}
            >
              Não lidas
            </button>
            {totalNaoLidas > 0 && (
              <button
                onClick={marcarTodasLidas}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd',
                  cursor: 'pointer', fontSize: '0.78em', background: '#fff', color: '#555',
                }}
              >
                Marcar todas lidas
              </button>
            )}
            <button
              onClick={sincronizar}
              disabled={sincronizando}
              title="Sincronizar com ML"
              style={{
                padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd',
                cursor: sincronizando ? 'not-allowed' : 'pointer',
                background: '#fff', color: sincronizando ? '#aaa' : '#555',
                display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: sincronizando ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>

        {/* Lista */}
        {loading || sincronizando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            {sincronizando ? 'Sincronizando com Mercado Livre...' : 'Carregando...'}
          </div>
        ) : reclamacoes.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, color: '#aaa',
            backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e8e8e8',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Nenhuma reclamação aberta
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reclamacoes.map(rec => {
              const stageStyle = STAGE_COLOR[rec.stage] || STAGE_COLOR.none;
              const reasonInfo = getReasonPrefix(rec.reasonId);
              const isActive = claimAberto?.claim?.id === rec.id;

              return (
                <button
                  key={rec.id}
                  onClick={() => abrirDetalhe(rec)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: isActive ? '#eaf2fb' : (rec.lida ? '#fff' : '#fffbf0'),
                    border: `1px solid ${isActive ? '#3498db' : (rec.lida ? '#e0e0e0' : '#f0c040')}`,
                    borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s',
                    boxShadow: rec.lida ? 'none' : '0 1px 4px rgba(240,192,64,0.2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {!rec.lida && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: '#e74c3c', flexShrink: 0, display: 'inline-block',
                        }} />
                      )}
                      <span style={{
                        fontSize: '0.72em', fontWeight: 700, padding: '2px 6px',
                        borderRadius: 4, backgroundColor: stageStyle.bg, color: stageStyle.color,
                      }}>
                        {STAGE_LABEL[rec.stage] || rec.stage}
                      </span>
                      <span style={{ fontSize: '0.72em', color: '#888' }}>
                        {TIPO_LABEL[rec.type] || rec.type}
                      </span>
                      {reasonInfo && (
                        <span style={{
                          fontSize: '0.72em', fontWeight: 700,
                          color: reasonInfo.color,
                        }}>
                          {reasonInfo.label}
                        </span>
                      )}
                      {temDevolucao(rec.dadosML) && (
                        <span style={{
                          fontSize: '0.72em', fontWeight: 700,
                          backgroundColor: '#e8f4fd', color: '#1a6fa8',
                          borderRadius: 4, padding: '2px 6px',
                        }}>
                          Devolução
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7em', color: '#aaa', flexShrink: 0 }}>
                      {fmtDate(rec.lastUpdated)}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.82em', color: '#555' }}>
                    Pedido: <strong style={{ color: '#2c3e50' }}>{rec.resourceId || '-'}</strong>
                  </div>
                  <div style={{ marginTop: 2, fontSize: '0.75em', color: '#888' }}>
                    ID: {rec.id} • {rec.reasonId || '-'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── PAINEL DE DETALHE ── */}
      {(claimAberto || loadingDetalhe) && (
        <div style={{
          flex: 1, minWidth: 0, backgroundColor: '#fff',
          border: '1px solid #e0e0e0', borderRadius: 8,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header do painel */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
            backgroundColor: '#f8f9fa',
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.95em', color: '#2c3e50' }}>
              {loadingDetalhe ? 'Carregando...' : `Reclamação #${claimAberto?.claim?.id}`}
            </span>
            <button
              onClick={() => setClaimAberto(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#888', padding: 4, borderRadius: 4, display: 'flex',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {loadingDetalhe ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
              Carregando detalhes...
            </div>
          ) : claimAberto?.erro ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e74c3c' }}>
              Erro ao carregar detalhes.
            </div>
          ) : (
            <>
              {/* Produto do pedido */}
              {claimAberto.order?.order_items?.[0] && (() => {
                const item = claimAberto.order.order_items[0];
                const thumb = item.item?.thumbnail;
                const title = item.item?.title;
                const sku = item.item?.seller_sku;
                const qty = item.quantity;
                const price = item.unit_price;
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
                    backgroundColor: '#fafafa',
                  }}>
                    {thumb && (
                      <img
                        src={thumb.replace('http://', 'https://')}
                        alt={title}
                        style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 6, border: '1px solid #eee', flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88em', color: '#2c3e50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {title || '-'}
                      </div>
                      <div style={{ fontSize: '0.75em', color: '#888', marginTop: 2 }}>
                        {sku && <span>SKU: {sku} · </span>}
                        Qtd: {qty}
                        {price != null && <span> · R$ {Number(price).toFixed(2)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Info da reclamação */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: '0.82em' }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><span style={{ color: '#888' }}>Tipo: </span><strong>{TIPO_LABEL[claimAberto.claim.type] || claimAberto.claim.type}</strong></div>
                  <div><span style={{ color: '#888' }}>Etapa: </span><strong>{STAGE_LABEL[claimAberto.claim.stage] || claimAberto.claim.stage}</strong></div>
                  <div><span style={{ color: '#888' }}>Status: </span><strong>{claimAberto.claim.status}</strong></div>
                  <div><span style={{ color: '#888' }}>Motivo: </span><strong>{claimAberto.claim.reason_id || '-'}</strong></div>
                  <div><span style={{ color: '#888' }}>Pedido: </span><strong>{claimAberto.order?.id || claimAberto.claim.resource_id || '-'}</strong></div>
                  <div><span style={{ color: '#888' }}>Criado: </span><strong>{fmtDate(claimAberto.claim.date_created)}</strong></div>
                  {claimAberto.contaNickname && (
                    <div><span style={{ color: '#888' }}>Conta ML: </span><strong>{claimAberto.contaNickname}</strong></div>
                  )}
                </div>
                {/* Badge devolução em andamento */}
                {temDevolucao(claimAberto.claim) && (
                  <div style={{
                    marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                    backgroundColor: '#e8f4fd', color: '#1a6fa8',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.82em', fontWeight: 700,
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                    Devolução em andamento
                  </div>
                )}
                {/* Ações disponíveis */}
                {availableActions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ color: '#888' }}>Ações disponíveis: </span>
                    {availableActions.map(a => (
                      <span key={a.action} title={a.action} style={{
                        display: 'inline-block', marginRight: 6, marginTop: 4,
                        backgroundColor: RETURN_REVIEW_ACTIONS.has(a.action) ? '#e8f4fd' :
                          a.mandatory ? '#fff3cd' : '#e8f5e9',
                        color: RETURN_REVIEW_ACTIONS.has(a.action) ? '#1a6fa8' :
                          a.mandatory ? '#856404' : '#2e7d32',
                        borderRadius: 4, padding: '2px 7px', fontSize: '0.82em',
                        fontWeight: 600,
                      }}>
                        {ACTION_LABEL[a.action] || a.action}{a.mandatory ? ' ⚠️' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Mensagens */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(claimAberto.mensagens || []).length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: '0.85em', textAlign: 'center', padding: 20 }}>
                    Sem mensagens registradas
                  </div>
                ) : (
                  [...(claimAberto.mensagens || [])].reverse().map((msg, i) => {
                    const isSeller = msg.sender_role === 'respondent';
                    return (
                      <div key={i} style={{
                        alignSelf: isSeller ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        backgroundColor: isSeller ? '#2c3e50' : '#f0f4f8',
                        color: isSeller ? '#fff' : '#2c3e50',
                        borderRadius: isSeller ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        padding: '8px 12px', fontSize: '0.83em',
                      }}>
                        <div style={{ fontSize: '0.75em', opacity: 0.7, marginBottom: 4 }}>
                          {msg.sender_role === 'respondent' ? 'Você (vendedor)' :
                           msg.sender_role === 'complainant' ? 'Comprador' : 'Mediador ML'}
                          {' · '}{fmtDate(msg.date_created)}
                        </div>
                        {msg.sender_role === 'mediator' && msg.message?.includes('<') ? (
                          <div
                            style={{ wordBreak: 'break-word' }}
                            dangerouslySetInnerHTML={{ __html: msg.message }}
                          />
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.message}
                          </div>
                        )}
                        {msg.message_moderation?.status === 'rejected' && (
                          <div style={{ fontSize: '0.75em', color: '#e74c3c', marginTop: 4 }}>
                            Mensagem moderada
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Caixa de envio de mensagem */}
              {canUseResource('reclamacoes.responder') && podeEnviarMsg && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
                  {feedbackEnvio && (
                    <div style={{
                      marginBottom: 8, padding: '6px 10px', borderRadius: 6, fontSize: '0.82em',
                      backgroundColor: feedbackEnvio.tipo === 'ok' ? '#d4edda' : '#f8d7da',
                      color: feedbackEnvio.tipo === 'ok' ? '#155724' : '#721c24',
                    }}>
                      {feedbackEnvio.msg}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    {podeMensagemComprador && (
                      <button
                        onClick={() => setReceiverRole('complainant')}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontSize: '0.78em', fontWeight: 600,
                          backgroundColor: receiverRole === 'complainant' ? '#2c3e50' : '#f0f0f0',
                          color: receiverRole === 'complainant' ? '#fff' : '#555',
                        }}
                      >
                        Comprador
                      </button>
                    )}
                    {podeMensagemMediador && (
                      <button
                        onClick={() => setReceiverRole('mediator')}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontSize: '0.78em', fontWeight: 600,
                          backgroundColor: receiverRole === 'mediator' ? '#8e44ad' : '#f0f0f0',
                          color: receiverRole === 'mediator' ? '#fff' : '#555',
                        }}
                      >
                        Mediador ML
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <textarea
                      value={msgTexto}
                      onChange={e => setMsgTexto(e.target.value)}
                      placeholder={`Escreva para o ${receiverRole === 'mediator' ? 'mediador' : 'comprador'}...`}
                      rows={3}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: '0.85em',
                        fontFamily: 'inherit', resize: 'vertical',
                        outline: 'none',
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && e.ctrlKey) enviarMensagem();
                      }}
                    />
                    <button
                      onClick={enviarMensagem}
                      disabled={enviando || !msgTexto.trim()}
                      style={{
                        alignSelf: 'flex-end', padding: '8px 14px', borderRadius: 6,
                        border: 'none', cursor: enviando || !msgTexto.trim() ? 'not-allowed' : 'pointer',
                        backgroundColor: '#2c3e50', color: '#fff', fontWeight: 600,
                        fontSize: '0.85em', fontFamily: 'inherit',
                        opacity: enviando || !msgTexto.trim() ? 0.6 : 1,
                      }}
                    >
                      {enviando ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.72em', color: '#aaa', marginTop: 4 }}>
                    Ctrl+Enter para enviar
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
