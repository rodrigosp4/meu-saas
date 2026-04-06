import { useState, useEffect, useRef, useCallback } from 'react';

// Detecta atributos obrigatórios faltando no texto do log
function extrairAtributosObrigatorios(texto) {
  if (!texto) return [];
  const encontrados = new Set();
  // Padrão: "The attributes [ATTR1, ATTR2] are required"
  const matchBrackets = [...texto.matchAll(/The attributes \[([^\]]+)\] are required/gi)];
  for (const m of matchBrackets) {
    m[1].split(',').forEach(a => encontrados.add(a.trim()));
  }
  // Padrão: "O campo "Nome" é obrigatório" → extrai o nome
  const matchPt = [...texto.matchAll(/O campo [""]([^"""]+)[""] é obrigatório/gi)];
  for (const m of matchPt) encontrados.add(m[1].trim());
  return [...encontrados];
}

// Coloriza uma linha de log baseado no conteúdo
function LogLine({ line, index, searchTerm }) {
  if (!line) return null;

  const isAttrRequired =
    line.includes('are required for category') ||
    line.includes('é obrigatório e não foi adicionado') ||
    line.includes('[PART_NUMBER]') ||
    /The attributes \[/.test(line);

  let cls = 'text-gray-400';
  if (isAttrRequired) cls = 'text-amber-300 font-semibold bg-amber-950/40 px-1 rounded';
  else if (line.startsWith('>>')) cls = 'text-gray-500 italic';
  else if (line.startsWith('Resumo do Lote:')) cls = 'text-white font-bold text-base mt-2';
  else if (line.startsWith('✅')) cls = 'text-emerald-300 font-semibold';
  else if (line.startsWith('❌')) cls = 'text-red-400 font-semibold';
  else if (line.startsWith('Detalhes por Anúncio:')) cls = 'text-gray-300 font-semibold mt-2 border-t border-gray-700 pt-2';
  else if (line.includes('Erro:')) cls = 'text-red-400';
  else if (line.startsWith('[ID:') && line.includes('| Lmp Promo:')) cls = 'text-emerald-400';
  else if (line.startsWith('[ID:')) cls = 'text-yellow-300';

  if (searchTerm) {
    const parts = line.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <div key={index} className={`leading-5 ${cls}`}>
        {parts.map((part, i) =>
          part.toLowerCase() === searchTerm.toLowerCase()
            ? <mark key={i} className="bg-yellow-400 text-gray-900 rounded px-0.5">{part}</mark>
            : part
        )}
      </div>
    );
  }

  return <div key={index} className={`leading-5 ${cls}`}>{line}</div>;
}

function parseLogContent(detalhes) {
  if (!detalhes) return { isLive: false, progress: null, lines: [] };

  if (detalhes.startsWith('Processando...')) {
    const sepIdx = detalhes.indexOf('\n===\n');
    const header = sepIdx >= 0 ? detalhes.substring(0, sepIdx) : detalhes;
    const logsRaw = sepIdx >= 0 ? detalhes.substring(sepIdx + 5) : '';
    const match = header.match(/(\d+)\/(\d+)\s+\((\d+)%\)/);
    return {
      isLive: true,
      progress: match ? { atual: Number(match[1]), total: Number(match[2]), pct: Number(match[3]) } : null,
      lines: logsRaw ? logsRaw.split('\n') : [],
    };
  }

  return { isLive: false, progress: null, lines: detalhes.split('\n') };
}

function ReprocessForm({ usuarioId, tarefaId, erros, onClose, onReprocessed }) {
  const [regras, setRegras] = useState([]);
  const [modo, setModo] = useState('regra');
  const [regraId, setRegraId] = useState('');
  const [inflar, setInflar] = useState(0);
  const [reduzir, setReduzir] = useState(0);
  const [removerPromocoes, setRemoverPromocoes] = useState(false);
  const [enviarAtacado, setEnviarAtacado] = useState(false);
  const [ativarPromocoes, setAtivarPromocoes] = useState(false);
  const [toleranciaPromo, setTolercanciaPromo] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [loadingRegras, setLoadingRegras] = useState(true);

  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(r => r.json())
      .then(d => {
        const lista = d.regrasPreco || [];
        setRegras(lista);
        if (lista.length > 0) setRegraId(lista[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingRegras(false));
  }, [usuarioId]);

  const confirmar = async () => {
    setCarregando(true);
    try {
      const payloadOverride = { modo, regraId: modo === 'regra' ? regraId : undefined, inflar: Number(inflar), reduzir: Number(reduzir), removerPromocoes, enviarAtacado, ativarPromocoes, toleranciaPromo: ativarPromocoes ? (Number(toleranciaPromo) || 0) : 0 };
      const res = await fetch(`/api/fila/${tarefaId}/reprocessar-erros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, payloadOverride })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.erro || 'Erro ao reprocessar.'); return; }
      alert(`${data.itens} item(s) reenfileirado(s) com sucesso!`);
      onReprocessed?.();
      onClose();
    } catch {
      alert('Falha ao comunicar com o servidor.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-600 rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-bold text-base mb-1">Reprocessar {erros} erro(s)</h3>
        <p className="text-gray-400 text-xs mb-4">Defina os parâmetros para reprocessar apenas os itens que falharam.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Modo</label>
            <select value={modo} onChange={e => setModo(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5">
              <option value="regra">Regra de Preço</option>
              <option value="manual">Preço Manual</option>
            </select>
          </div>

          {modo === 'regra' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Regra</label>
              {loadingRegras ? (
                <p className="text-xs text-gray-500">Carregando regras...</p>
              ) : regras.length === 0 ? (
                <p className="text-xs text-red-400">Nenhuma regra encontrada.</p>
              ) : (
                <select value={regraId} onChange={e => setRegraId(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5">
                  {regras.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Inflar promo % (0=sem)</label>
              <input type="number" min="0" max="99" value={inflar} onChange={e => setInflar(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Reduzir frete %</label>
              <input type="number" min="0" max="99" value={reduzir} onChange={e => setReduzir(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={removerPromocoes} onChange={e => setRemoverPromocoes(e.target.checked)} className="accent-orange-500" />
              Remover promoções antes
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={ativarPromocoes} onChange={e => setAtivarPromocoes(e.target.checked)} className="accent-orange-500" />
              Ativar promoções depois
            </label>
            {ativarPromocoes && inflar > 0 && (
              <div className="ml-5 space-y-1">
                <label className="flex items-center gap-2 text-xs text-purple-400 cursor-pointer">
                  <input type="checkbox" checked={toleranciaPromo > 0} onChange={e => setTolercanciaPromo(e.target.checked ? 2 : 0)} className="accent-purple-400" />
                  Aceitar promoções que ultrapassem a margem em até
                </label>
                {toleranciaPromo > 0 && (
                  <div className="flex items-center gap-2 ml-5">
                    <input type="number" min="0.1" max="20" step="0.5" value={toleranciaPromo}
                      onChange={e => setTolercanciaPromo(Number(e.target.value) || 0)}
                      className="w-14 bg-gray-800 border border-purple-600 text-white text-xs rounded px-2 py-1" />
                    <span className="text-xs text-gray-500">% (aceita até {Number(inflar) + Number(toleranciaPromo)}%)</span>
                  </div>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={enviarAtacado} onChange={e => setEnviarAtacado(e.target.checked)} className="accent-orange-500" />
              Enviar preços atacado (B2B)
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded hover:bg-gray-600 transition">Cancelar</button>
          <button onClick={confirmar} disabled={carregando || (modo === 'regra' && !regraId)} className="flex-1 px-3 py-2 bg-orange-600 text-white text-sm font-bold rounded hover:bg-orange-500 transition disabled:opacity-50">
            {carregando ? 'Reenfileirando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogModal({ tarefa, usuarioId, onClose, onReprocessed, initialSearch = '' }) {
  const [detalhes, setDetalhes] = useState(tarefa.detalhes || '');
  const [status, setStatus] = useState(tarefa.status);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showReprocessForm, setShowReprocessForm] = useState(false);
  const [retomando, setRetomando] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const logEndRef = useRef(null);
  const containerRef = useRef(null);

  const fetchDetalhes = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/fila/${tarefa.id}/detalhes?userId=${encodeURIComponent(usuarioId)}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const data = await res.json();
      setDetalhes(data.detalhes || '');
      setStatus(data.status);
    } catch (_) {}
  }, [tarefa.id, usuarioId]);

  // Polling ao vivo enquanto PROCESSANDO
  useEffect(() => {
    if (status !== 'PROCESSANDO') return;
    fetchDetalhes();
    const interval = setInterval(fetchDetalhes, 3000);
    return () => clearInterval(interval);
  }, [status, fetchDetalhes]);

  // Auto-scroll para o final
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [detalhes, autoScroll]);

  // Detecta scroll manual para pausar auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(atBottom);
  };

  const { isLive, progress, lines } = parseLogContent(detalhes);

  const isAcoesTarefa = tarefa.tipo?.startsWith('Ação em Massa');
  const erros = lines.filter(l => l.includes('Erro:') || l.includes('ERRO:')).length;
  const acoesErros = isAcoesTarefa ? lines.filter(l => l.startsWith('❌')).length : 0;
  const sucessos = lines.filter(l => l.startsWith('[ID:') && !l.includes('Erro:')).length;
  const filteredLines = searchTerm
    ? lines.map((line, i) => ({ line, i })).filter(({ line }) => line.toLowerCase().includes(searchTerm.toLowerCase()))
    : lines.map((line, i) => ({ line, i }));
  const atributosObrigatorios = extrairAtributosObrigatorios(detalhes);

  const [retentando, setRetentando] = useState(false);

  const copyLog = () => {
    navigator.clipboard.writeText(detalhes || '').catch(() => {});
  };

  const reprocessarErros = () => setShowReprocessForm(true);

  const retentarAcoes = async () => {
    if (!confirm(`Retentar ${acoesErros} item(s) que falharam?`)) return;
    setRetentando(true);
    try {
      const res = await fetch(`/api/fila/${tarefa.id}/retentar-acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.erro || 'Erro ao retentar.'); return; }
      alert(`${data.itens} item(s) reenfileirado(s)!`);
      onReprocessed?.();
      onClose();
    } catch {
      alert('Falha ao comunicar com o servidor.');
    } finally {
      setRetentando(false);
    }
  };

  const retomar = async () => {
    if (!confirm('Forçar retomada da tarefa? O job será reenfileirado do início.')) return;
    setRetomando(true);
    try {
      const res = await fetch(`/api/fila/${tarefa.id}/retomar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.erro || 'Erro ao retomar.'); return; }
      setStatus('PENDENTE');
      setDetalhes(d => d + '\n>> Retomado manualmente...\n');
    } catch {
      alert('Falha ao comunicar com o servidor.');
    } finally {
      setRetomando(false);
    }
  };

  return (
    <>
    {showReprocessForm && (
      <ReprocessForm
        usuarioId={usuarioId}
        tarefaId={tarefa.id}
        erros={erros}
        onClose={() => setShowReprocessForm(false)}
        onReprocessed={onReprocessed}
      />
    )}
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold">Log Detalhado</span>
            {status === 'PROCESSANDO' && (
              <span className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                AO VIVO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(status === 'PROCESSANDO' || status === 'PENDENTE') && tarefa.payload && (
              <button
                onClick={retomar}
                disabled={retomando}
                title="Forçar retomada — use quando o job travar após reinício do servidor"
                className="text-xs px-3 py-1 bg-green-700 text-white rounded hover:bg-green-600 transition font-semibold disabled:opacity-50"
              >
                {retomando ? '...' : '▶ Retomar'}
              </button>
            )}
            {acoesErros > 0 && status !== 'PROCESSANDO' && (
              <button
                onClick={retentarAcoes}
                disabled={retentando}
                className="text-xs px-3 py-1 bg-red-700 text-white rounded hover:bg-red-600 transition font-semibold disabled:opacity-50"
              >
                {retentando ? '...' : `↺ Tentar de Novo (${acoesErros})`}
              </button>
            )}
            {!isAcoesTarefa && erros > 0 && status !== 'PROCESSANDO' && (
              <button
                onClick={reprocessarErros}
                className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-500 transition font-semibold"
              >
                ↺ Reprocessar {erros} erro(s)
              </button>
            )}
            <button
              onClick={copyLog}
              className="text-xs px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition"
            >
              Copiar
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Barra de progresso ao vivo */}
        {isLive && progress && (
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span className="font-semibold text-blue-300">{progress.atual}/{progress.total} itens processados</span>
              <span className="flex gap-4">
                <span className="text-emerald-400">✅ {sucessos} ok</span>
                <span className="text-red-400">❌ {erros} erros</span>
                <span>{progress.pct}%</span>
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Banner: atributos obrigatórios faltando */}
        {atributosObrigatorios.length > 0 && (
          <div className="px-4 py-3 bg-amber-900/50 border-b border-amber-700/60 flex-shrink-0">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 text-sm mt-0.5 flex-shrink-0">⚠</span>
              <div>
                <p className="text-amber-300 text-xs font-bold mb-1">
                  Campo(s) obrigatório(s) não preenchido(s) — a publicação foi rejeitada pelo Mercado Livre:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {atributosObrigatorios.map(attr => (
                    <span key={attr} className="bg-amber-700/60 text-amber-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-amber-600/50">
                      {attr}
                    </span>
                  ))}
                </div>
                <p className="text-amber-500/80 text-[10px] mt-1.5">
                  Preencha esses campos na Ficha Técnica do anúncio antes de reprocessar.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Barra de busca nos logs */}
        <div className="px-4 py-2 bg-gray-850 border-b border-gray-700 flex-shrink-0 flex items-center gap-2" style={{backgroundColor:'#111827'}}>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar nos logs..."
            className="flex-1 bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-500"
          />
          {searchTerm && (
            <span className="text-[11px] text-gray-400 whitespace-nowrap">
              {filteredLines.length} resultado{filteredLines.length !== 1 ? 's' : ''}
            </span>
          )}
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-gray-500 hover:text-gray-300 text-sm leading-none">&times;</button>
          )}
        </div>

        {/* Conteúdo dos logs */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-0.5 custom-scrollbar"
        >
          {lines.length === 0 ? (
            <p className="text-gray-500">Aguardando logs...</p>
          ) : filteredLines.length === 0 ? (
            <p className="text-gray-500 italic">Nenhum resultado para &quot;{searchTerm}&quot;.</p>
          ) : (
            filteredLines.map(({ line, i }) => <LogLine key={i} line={line} index={i} searchTerm={searchTerm} />)
          )}
          <div ref={logEndRef} />
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex justify-between items-center text-xs text-gray-500 flex-shrink-0">
          <span>ID: {tarefa.id}</span>
          <div className="flex items-center gap-3">
            {!autoScroll && status === 'PROCESSANDO' && (
              <button
                onClick={() => { setAutoScroll(true); logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="text-blue-400 hover:text-blue-300"
              >
                ↓ Voltar ao fim
              </button>
            )}
            <span>Alvo: {tarefa.alvo}</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default function GerenciadorFila({ usuarioId }) {
  const [tarefas, setTarefas] = useState([]);
  const [total, setTotal] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [filtroTipo] = useState('Todos');
  const [searchLog, setSearchLog] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [logModal, setLogModal] = useState(null);

  const abortRef = useRef(null);

  const fetchFila = async () => {
    if (!usuarioId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url =
        `/api/fila?userId=${encodeURIComponent(usuarioId)}` +
        `&status=${encodeURIComponent(filtroStatus)}` +
        `&tipo=${encodeURIComponent(filtroTipo)}` +
        `&page=${currentPage}` +
        `&limit=${itemsPerPage}` +
        `&_t=${Date.now()}`;

      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' },
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTarefas(Array.isArray(data.tarefas) ? data.tarefas : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[GerenciadorFila] fetchFila:', error);
    }
  };

  const temAtiva = tarefas.some(t => t.status === 'PROCESSANDO' || t.status === 'PENDENTE');

  useEffect(() => {
    fetchFila();
    const interval = setInterval(fetchFila, temAtiva ? 2000 : 5000);
    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [usuarioId, filtroStatus, filtroTipo, currentPage, temAtiva]);

  const limparFila = async () => {
    if (window.confirm('Isso removerá apenas tarefas concluídas ou com falha. Deseja continuar?')) {
      await fetch(`/api/fila/limpar/${usuarioId}`, { method: 'DELETE', cache: 'no-store' });
      setCurrentPage(1);
      fetchFila();
    }
  };

  const forcarLimparFila = async () => {
    if (window.confirm('⚠️ Isso cancela TODAS as tarefas (incluindo pendentes e em processamento) e limpa a fila do Redis. Usar apenas se a fila estiver travada. Continuar?')) {
      await fetch(`/api/fila/forcar-limpar/${usuarioId}`, { method: 'POST', cache: 'no-store' });
      setCurrentPage(1);
      fetchFila();
    }
  };

  const excluirTarefa = async (tarefaId) => {
    await fetch(`/api/fila/${tarefaId}?userId=${usuarioId}`, { method: 'DELETE', cache: 'no-store' });
    setTarefas(prev => prev.filter(t => t.id !== tarefaId));
  };

  const getStatusCor = (status) => {
    switch (status) {
      case 'CONCLUIDO': return 'bg-green-100 text-green-800 border-green-200';
      case 'FALHA': return 'bg-red-100 text-red-800 border-red-200';
      case 'PROCESSANDO': return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const tarefasFiltradas = searchLog
    ? tarefas.filter(t => t.detalhes?.toLowerCase().includes(searchLog.toLowerCase()))
    : tarefas;

  const totalPages = Math.ceil(total / itemsPerPage);

  return (
    <div className="space-y-4">
      {/* Modal ao vivo */}
      {logModal && (
        <LogModal
          tarefa={logModal}
          usuarioId={usuarioId}
          onClose={() => setLogModal(null)}
          onReprocessed={() => { setLogModal(null); fetchFila(); }}
          initialSearch={searchLog}
        />
      )}

      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Gerenciador de Fila Unificado</h3>
          <p className="text-sm text-gray-500">Pendentes (Agora): {tarefas.filter(t => t.status === 'PENDENTE').length}</p>
        </div>
        <div className="flex gap-4 items-center flex-wrap">
          <input
            type="text"
            value={searchLog}
            onChange={e => setSearchLog(e.target.value)}
            placeholder="Pesquisar nos logs..."
            className="border rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 w-56"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">Status:</label>
            <select
              value={filtroStatus}
              onChange={e => { setFiltroStatus(e.target.value); setCurrentPage(1); }}
              className="border rounded p-1 text-sm bg-white outline-none"
            >
              <option value="Todos">Todos</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="PROCESSANDO">Processando</option>
              <option value="CONCLUIDO">Concluídos</option>
              <option value="FALHA">Falhas</option>
            </select>
          </div>
          <button onClick={limparFila} className="px-4 py-2 bg-gray-200 text-gray-800 font-bold rounded hover:bg-gray-300 transition text-sm">
            Limpar Histórico
          </button>
          <button onClick={forcarLimparFila} className="px-4 py-2 bg-red-100 text-red-700 font-bold rounded hover:bg-red-200 transition text-sm border border-red-300">
            Forçar Limpar Fila
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-lg flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="min-w-full divide-y text-sm text-left">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">ID Tarefa</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-center">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Alvo</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Conta</th>
                <th className="px-4 py-3 font-semibold text-gray-600 w-1/3">Progresso / Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tarefasFiltradas.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-gray-500">{searchLog ? `Nenhum log contém "${searchLog}".` : 'A fila está vazia.'}</td></tr>
              ) : (
                tarefasFiltradas.map(t => {
                  const { isLive, progress } = parseLogContent(t.detalhes);
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <span>{t.id.substring(0, 8)}</span>
                          <button
                            onClick={() => excluirTarefa(t.id)}
                            title="Excluir tarefa"
                            className="text-gray-300 hover:text-red-500 transition-colors font-bold text-base leading-none"
                          >
                            &times;
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700">{t.tipo}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 text-[10px] uppercase font-black rounded border ${getStatusCor(t.status)}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-mono text-xs">{t.alvo || '-'}</td>
                      <td className="px-4 py-3 text-gray-800 text-xs">{t.conta || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          {isLive && progress ? (
                            <>
                              <div className="w-full min-w-[200px]">
                                <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                                  <span className="font-semibold text-blue-700">{progress.atual}/{progress.total} anúncios</span>
                                  <span>{progress.pct}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                                </div>
                              </div>
                              <button
                                onClick={() => setLogModal(t)}
                                className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 font-bold border border-blue-200 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block"></span>
                                Ver ao Vivo
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="text-xs text-gray-600 truncate max-w-[250px]" title={t.detalhes}>
                                {t.detalhes?.split('\n')[0] || 'Aguardando processamento...'}
                              </div>
                              {t.detalhes && (
                                <button
                                  onClick={() => setLogModal(t)}
                                  className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 font-bold border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                                >
                                  Ver Log Completo
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg mt-auto">
          <span className="text-sm font-semibold text-gray-600">
            Página {currentPage} de {totalPages || 1} ({total} tarefas)
          </span>
          <div className="flex gap-2">
            <button className="px-4 py-1.5 border bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</button>
            <button className="px-4 py-1.5 border bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold" disabled={currentPage >= totalPages || total === 0} onClick={() => setCurrentPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      </div>
    </div>
  );
}
