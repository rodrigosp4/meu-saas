import React, { useState, useEffect } from 'react';

export default function GerenciadorFila({ usuarioId }) {
  const [tarefas, setTarefas] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [filtroTipo, setFiltroTipo] = useState('Todos');

  const fetchFila = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/fila?userId=${usuarioId}&status=${filtroStatus}&tipo=${filtroTipo}`);
      const data = await res.json();
      setTarefas(data.tarefas);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Atualiza a fila a cada 5 segundos automaticamente
  useEffect(() => {
    fetchFila();
    const interval = setInterval(fetchFila, 5000);
    return () => clearInterval(interval);
  }, [filtroStatus, filtroTipo]);

  const limparFila = async () => {
    if(window.confirm("Deseja limpar as tarefas concluídas e falhas da tela?")) {
      await fetch(`/api/fila/limpar/${usuarioId}`, { method: 'DELETE' });
      fetchFila();
    }
  };

  const getStatusCor = (status) => {
    switch(status) {
      case 'CONCLUIDO': return 'bg-green-100 text-green-800';
      case 'FALHA': return 'bg-red-100 text-red-800';
      case 'PROCESSANDO': return 'bg-blue-100 text-blue-800 animate-pulse';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Gerenciador de Fila Unificado</h3>
          <p className="text-sm text-gray-500">Pendentes (Agora): {tarefas.filter(t => t.status === 'PENDENTE').length}</p>
        </div>
        
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">Status:</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="border rounded p-1 text-sm">
              <option value="Todos">Todos</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="PROCESSANDO">Processando</option>
              <option value="CONCLUIDO">Concluídos</option>
              <option value="FALHA">Falhas</option>
            </select>
          </div>
          
          <button onClick={limparFila} className="px-4 py-2 bg-gray-200 text-gray-800 font-bold rounded hover:bg-gray-300 text-sm">
            Limpar Histórico
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm border rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y text-sm text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-600">ID Tarefa</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Tipo Tarefa</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-center">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-center">Tent.</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Alvo (ID/SKU)</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Conta</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-1/3">Último Erro/Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tarefas.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-8 text-gray-500">A fila está vazia.</td></tr>
            ) : (
              tarefas.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.id.substring(0,8)}</td>
                  <td className="px-4 py-2 font-semibold text-gray-700">{t.tipo}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 text-xs font-bold rounded ${getStatusCor(t.status)}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center font-bold text-gray-600">{t.tentativas}</td>
                  <td className="px-4 py-2 text-gray-800 font-mono text-xs">{t.alvo || '-'}</td>
                  <td className="px-4 py-2 text-gray-800">{t.conta || '-'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-xs" title={t.detalhes}>
                    {t.detalhes || 'Aguardando processamento...'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}