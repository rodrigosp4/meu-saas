import React, { useState, useEffect, useRef } from 'react';

export default function GerenciadorFila({ usuarioId }) {
  const [tarefas, setTarefas] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [filtroTipo, setFiltroTipo] = useState('Todos');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [logModal, setLogModal] = useState(null);

  const abortRef = useRef(null);

  const fetchFila = async () => {
    if (!usuarioId) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
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
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Falha ao carregar fila: HTTP ${res.status}`);
      }

      const data = await res.json();
      setTarefas(Array.isArray(data.tarefas) ? data.tarefas : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[GerenciadorFila] fetchFila:', error);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchFila();
    const interval = setInterval(fetchFila, 5000);

    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [usuarioId, filtroStatus, filtroTipo, currentPage]);

  const limparFila = async () => {
    if (
      window.confirm(
        'Isso removerá apenas tarefas concluídas ou com falha. Deseja continuar?'
      )
    ) {
      await fetch(`/api/fila/limpar/${usuarioId}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      setCurrentPage(1);
      fetchFila();
    }
  };

  const excluirTarefa = async (tarefaId) => {
    await fetch(`/api/fila/${tarefaId}?userId=${usuarioId}`, {
      method: 'DELETE',
      cache: 'no-store',
    });
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

  const totalPages = Math.ceil(total / itemsPerPage);

  return (
    <div className="space-y-4">
      {/* ✅ MODAL DE LOGS COMPLETOS */}
      {logModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setLogModal(null)}>
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📋</span> Log Detalhado da Tarefa
              </h3>
              <button onClick={() => setLogModal(null)} className="text-gray-400 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-sm text-green-400 whitespace-pre-wrap custom-scrollbar">
              {logModal.detalhes || 'Nenhum detalhe registrado.'}
            </div>
            <div className="p-3 bg-gray-800 border-t border-gray-700 flex justify-between text-xs text-gray-400">
              <span>ID: {logModal.id}</span>
              <span>Alvo: {logModal.alvo}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Gerenciador de Fila Unificado</h3>
          <p className="text-sm text-gray-500">Pendentes (Agora): {tarefas.filter(t => t.status === 'PENDENTE').length}</p>
        </div>
        
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">Status:</label>
            <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setCurrentPage(1); }} className="border rounded p-1 text-sm bg-white outline-none">
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
                <th className="px-4 py-3 font-semibold text-gray-600 w-1/3">Resumo / Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tarefas.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-gray-500">A fila está vazia.</td></tr>
              ) : (
                tarefas.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <span>{t.id.substring(0,8)}</span>
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
                        {/* Barra de progresso para tarefas em processamento */}
                        {t.status === 'PROCESSANDO' && t.detalhes?.startsWith('Processando...') ? (() => {
                          const match = t.detalhes.match(/(\d+)\/(\d+)\s+\((\d+)%\)/);
                          const atual = match ? Number(match[1]) : 0;
                          const tot = match ? Number(match[2]) : 0;
                          const pct = match ? Number(match[3]) : 0;
                          return (
                            <div className="w-full min-w-[200px]">
                              <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                                <span className="font-semibold text-blue-700">{atual}/{tot} anúncios</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {t.detalhes.split('—')[1]?.trim() || ''}
                              </div>
                            </div>
                          );
                        })() : (
                          <>
                            <div className="text-xs text-gray-600 truncate max-w-[250px]" title={t.detalhes}>
                              {t.detalhes?.split('\n')[0] || 'Aguardando processamento...'}
                            </div>
                            {t.detalhes && t.detalhes.includes('\n') && (
                              <button onClick={() => setLogModal(t)} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 font-bold border border-blue-200 rounded hover:bg-blue-100 transition-colors">
                                Ver Log Completo
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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