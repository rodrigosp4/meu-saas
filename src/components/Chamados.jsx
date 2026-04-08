import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

const STATUS_LABEL = {
  ABERTO:             { label: 'Aberto',              color: '#3498db', bg: '#eaf4fb' },
  EM_ANDAMENTO:       { label: 'Em Andamento',         color: '#e67e22', bg: '#fef9f0' },
  AGUARDANDO_USUARIO: { label: 'Aguardando sua resp.', color: '#8e44ad', bg: '#f5eef8' },
  RESOLVIDO:          { label: 'Resolvido',            color: '#27ae60', bg: '#eafaf1' },
  FECHADO:            { label: 'Fechado',              color: '#95a5a6', bg: '#f4f6f7' },
};

const MIME_ICONE = (tipo) => {
  if (tipo.startsWith('image/')) return '🖼️';
  if (tipo === 'application/pdf') return '📄';
  if (tipo.includes('word')) return '📝';
  if (tipo.includes('excel') || tipo.includes('sheet')) return '📊';
  return '📎';
};

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function formatData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Seletor de arquivos para anexos ───────────────────────────────────────────
function SeletorAnexos({ anexos, onChange }) {
  const inputRef = useRef(null);

  const adicionarArquivos = (files) => {
    const novos = [];
    for (const file of files) {
      if (anexos.length + novos.length >= 3) break;
      if (file.size > 5 * 1024 * 1024) {
        alert(`Arquivo "${file.name}" excede 5 MB`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        onChange(prev => [...prev, { nome: file.name, tipo: file.type || 'application/octet-stream', dados: base64, _preview: e.target.result }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const remover = (idx) => onChange(prev => prev.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: anexos.length ? '8px' : 0 }}>
        {anexos.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', border: '1px solid #dce', borderRadius: '20px', background: '#f8f3ff', fontSize: '0.82em' }}>
            <span>{MIME_ICONE(a.tipo)}</span>
            <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
            <button onClick={() => remover(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#e74c3c', fontWeight: 700, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        ))}
      </div>
      {anexos.length < 3 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{ fontSize: '0.82em', padding: '4px 12px', border: '1px dashed #bbb', borderRadius: '6px', background: 'none', cursor: 'pointer', color: '#7f8c8d' }}
        >
          + Anexar arquivo (máx. 3 × 5 MB)
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => { adicionarArquivos(Array.from(e.target.files)); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Chip de anexo para visualização ──────────────────────────────────────────
function ChipAnexo({ anexo }) {
  const [carregando, setCarregando] = useState(false);

  const baixar = async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/chamados/anexos/${anexo.id}`);
      const data = await r.json();
      const link = document.createElement('a');
      link.href = `data:${data.tipo};base64,${data.dados}`;
      link.download = data.nome;
      link.click();
    } catch {
      alert('Erro ao baixar anexo');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <button
      onClick={baixar}
      disabled={carregando}
      title={`${anexo.nome} (${formatBytes(anexo.tamanho)})`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '3px 10px', border: '1px solid #c8d6e5',
        borderRadius: '16px', background: '#f0f4f8', cursor: 'pointer',
        fontSize: '0.8em', color: '#2c3e50', opacity: carregando ? 0.6 : 1,
      }}
    >
      {MIME_ICONE(anexo.tipo)}
      <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anexo.nome}</span>
      <span style={{ color: '#7f8c8d' }}>↓</span>
    </button>
  );
}

// ── Modal de novo chamado ─────────────────────────────────────────────────────
function ModalNovoChamado({ onClose, onCriado }) {
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [anexos, setAnexos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!titulo.trim() || !mensagem.trim()) { setErro('Preencha todos os campos'); return; }
    setSalvando(true);
    setErro('');
    try {
      const r = await fetch('/api/chamados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), mensagem: mensagem.trim(), anexos }),
      });
      const data = await r.json();
      if (!r.ok) { setErro(data.erro || 'Erro ao criar chamado'); return; }
      onCriado(data);
    } catch {
      setErro('Erro de conexão');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '520px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.1em', marginBottom: '20px', color: '#2c3e50' }}>Abrir novo chamado</div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.87em', fontWeight: 600, color: '#34495e', marginBottom: '5px' }}>Título *</label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Descreva brevemente o problema"
              maxLength={120}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.9em', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.87em', fontWeight: 600, color: '#34495e', marginBottom: '5px' }}>Mensagem *</label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              placeholder="Descreva o problema em detalhes..."
              rows={5}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.9em', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '0.87em', fontWeight: 600, color: '#34495e', marginBottom: '6px' }}>Anexos (opcional)</label>
            <SeletorAnexos anexos={anexos} onChange={setAnexos} />
          </div>
          {erro && <div style={{ color: '#e74c3c', fontSize: '0.87em', marginBottom: '12px' }}>{erro}</div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: '7px', background: '#f4f6f8', cursor: 'pointer', fontSize: '0.9em' }}>Cancelar</button>
            <button type="submit" disabled={salvando} style={{ padding: '8px 22px', background: '#3498db', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9em', opacity: salvando ? 0.7 : 1 }}>
              {salvando ? 'Enviando...' : 'Abrir chamado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tela de detalhe do chamado ─────────────────────────────────────────────────
function DetalheChamado({ chamadoId, onVoltar, onAtualizado, isAdmin }) {
  const { usuarioAtual } = useAuth();
  const [chamado, setChamado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [resposta, setResposta] = useState('');
  const [anexos, setAnexos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);

  const carregar = async () => {
    try {
      const r = await fetch(`/api/chamados/${chamadoId}`);
      const data = await r.json();
      if (r.ok) setChamado(data);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [chamadoId]);

  useEffect(() => {
    if (chamado) fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chamado?.mensagens?.length]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!resposta.trim()) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await fetch(`/api/chamados/${chamadoId}/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: resposta.trim(), anexos }),
      });
      const data = await r.json();
      if (!r.ok) { setErro(data.erro || 'Erro ao enviar'); return; }
      setChamado(prev => ({ ...prev, mensagens: [...prev.mensagens, data] }));
      setResposta('');
      setAnexos([]);
      if (onAtualizado) onAtualizado();
    } catch {
      setErro('Erro de conexão');
    } finally {
      setEnviando(false);
    }
  };

  const mudarStatus = async (status) => {
    const r = await fetch(`/api/chamados/${chamadoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const data = await r.json();
      setChamado(prev => ({ ...prev, status: data.status }));
      if (onAtualizado) onAtualizado();
    }
  };

  if (carregando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Carregando...</div>;
  if (!chamado) return <div style={{ padding: '20px', color: '#e74c3c' }}>Chamado não encontrado.</div>;

  const statusInfo = STATUS_LABEL[chamado.status] || STATUS_LABEL.ABERTO;
  const fechado = chamado.status === 'FECHADO';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={onVoltar} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '7px', background: '#f4f6f8', cursor: 'pointer', fontSize: '0.87em' }}>← Voltar</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.1em', color: '#2c3e50', marginBottom: '4px' }}>{chamado.titulo}</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.8em', fontWeight: 600, color: statusInfo.color, background: statusInfo.bg }}>
              {statusInfo.label}
            </span>
            {isAdmin && (
              <span style={{ fontSize: '0.82em', color: '#7f8c8d' }}>
                {chamado.usuario.email}
              </span>
            )}
            <span style={{ fontSize: '0.8em', color: '#aaa' }}>#{chamado.numero ?? chamado.id.slice(0, 8)}</span>
          </div>
        </div>
        {/* Ações de status */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {isAdmin && !fechado && chamado.status !== 'RESOLVIDO' && (
            <button onClick={() => mudarStatus('RESOLVIDO')} style={{ padding: '5px 12px', background: '#27ae6022', color: '#27ae60', border: '1px solid #27ae6055', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600 }}>
              Marcar resolvido
            </button>
          )}
          {isAdmin && !fechado && (
            <button onClick={() => mudarStatus('FECHADO')} style={{ padding: '5px 12px', background: '#95a5a622', color: '#7f8c8d', border: '1px solid #bbb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em' }}>
              Fechar chamado
            </button>
          )}
          {!isAdmin && !fechado && (
            <button onClick={() => mudarStatus('FECHADO')} style={{ padding: '5px 12px', background: '#95a5a622', color: '#7f8c8d', border: '1px solid #bbb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em' }}>
              Fechar chamado
            </button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '16px', marginBottom: '16px', maxHeight: '480px', overflowY: 'auto' }}>
        {chamado.mensagens.map((msg) => {
          const eAdmin = msg.isAdmin;
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: eAdmin ? 'flex-start' : 'flex-end', marginBottom: '14px' }}>
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: eAdmin ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                background: eAdmin ? '#fff' : '#3498db',
                color: eAdmin ? '#2c3e50' : '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}>
                <div style={{ fontSize: '0.75em', fontWeight: 600, marginBottom: '5px', opacity: 0.75 }}>
                  {eAdmin ? '🛡️ Suporte' : msg.autor.email}
                  {' · '}
                  {formatData(msg.criadoEm)}
                </div>
                <div style={{ fontSize: '0.92em', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.conteudo}</div>
                {msg.anexos?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {msg.anexos.map(a => <ChipAnexo key={a.id} anexo={a} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {/* Caixa de resposta */}
      {!fechado ? (
        <form onSubmit={enviar}>
          <textarea
            value={resposta}
            onChange={e => setResposta(e.target.value)}
            placeholder="Escreva sua mensagem..."
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.9em', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <SeletorAnexos anexos={anexos} onChange={setAnexos} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {erro && <span style={{ color: '#e74c3c', fontSize: '0.82em' }}>{erro}</span>}
              <button type="submit" disabled={enviando || !resposta.trim()} style={{ padding: '8px 20px', background: '#3498db', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9em', opacity: (enviando || !resposta.trim()) ? 0.6 : 1 }}>
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div style={{ padding: '12px 16px', background: '#f4f6f7', border: '1px solid #e0e0e0', borderRadius: '8px', color: '#7f8c8d', fontSize: '0.87em', textAlign: 'center' }}>
          Este chamado está fechado.
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Chamados() {
  const { usuarioAtual } = useAuth();
  const [chamados, setChamados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [chamadoAberto, setChamadoAberto] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/chamados');
      const data = await r.json();
      if (r.ok) setChamados(Array.isArray(data) ? data : []);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const chamadosFiltrados = filtroStatus === 'todos'
    ? chamados
    : chamados.filter(c => c.status === filtroStatus);

  if (chamadoAberto) {
    return (
      <div style={{ maxWidth: '860px' }}>
        <DetalheChamado
          chamadoId={chamadoAberto}
          onVoltar={() => { setChamadoAberto(null); carregar(); }}
          onAtualizado={carregar}
          isAdmin={false}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '860px' }}>
      {modalNovo && (
        <ModalNovoChamado
          onClose={() => setModalNovo(false)}
          onCriado={(c) => { setModalNovo(false); carregar(); setChamadoAberto(c.id); }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3em', color: '#2c3e50', fontWeight: 700 }}>Meus Chamados</h2>
          <p style={{ margin: '4px 0 0', color: '#7f8c8d', fontSize: '0.87em' }}>Abra e acompanhe solicitações de suporte</p>
        </div>
        <button
          onClick={() => setModalNovo(true)}
          style={{ padding: '8px 20px', background: '#3498db', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9em' }}
        >
          + Novo chamado
        </button>
      </div>

      {/* Filtro por status */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[{ id: 'todos', label: 'Todos' }, ...Object.entries(STATUS_LABEL).map(([id, s]) => ({ id, label: s.label }))].map(f => (
          <button
            key={f.id}
            onClick={() => setFiltroStatus(f.id)}
            style={{
              padding: '4px 12px', borderRadius: '16px', border: '1px solid',
              fontSize: '0.82em', cursor: 'pointer', fontWeight: filtroStatus === f.id ? 700 : 400,
              borderColor: filtroStatus === f.id ? '#3498db' : '#ddd',
              background: filtroStatus === f.id ? '#3498db' : '#f4f6f8',
              color: filtroStatus === f.id ? '#fff' : '#555',
            }}
          >
            {f.label}
            {f.id !== 'todos' && (
              <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                ({chamados.filter(c => c.status === f.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {carregando ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Carregando...</div>
      ) : chamadosFiltrados.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#bbb', background: '#fafafa', borderRadius: '10px', border: '1px dashed #e0e0e0' }}>
          {filtroStatus === 'todos' ? 'Nenhum chamado aberto. Clique em "+ Novo chamado" para começar.' : 'Nenhum chamado com este status.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {chamadosFiltrados.map((c) => {
            const statusInfo = STATUS_LABEL[c.status] || STATUS_LABEL.ABERTO;
            return (
              <div
                key={c.id}
                onClick={() => setChamadoAberto(c.id)}
                style={{
                  padding: '14px 18px', background: '#fff', borderRadius: '10px',
                  border: '1px solid #e8ecf0', cursor: 'pointer', transition: 'box-shadow .15s',
                  display: 'flex', alignItems: 'center', gap: '14px',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.75em', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', borderRadius: '4px', padding: '1px 7px', whiteSpace: 'nowrap' }}>
                      #{c.numero ?? c.id.slice(0, 8)}
                    </span>
                    <span style={{ fontWeight: 600, color: '#2c3e50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.titulo}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#95a5a6' }}>
                    {c._count.mensagens} mensagem(ns) · Atualizado {formatData(c.atualizadoEm)}
                  </div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.78em', fontWeight: 600, color: statusInfo.color, background: statusInfo.bg, whiteSpace: 'nowrap' }}>
                  {statusInfo.label}
                </span>
                <span style={{ color: '#bbb', fontSize: '1.1em' }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Exporta também o DetalheChamado para uso no AdminPanel ────────────────────
export { DetalheChamado };
