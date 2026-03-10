import React, { useState, useEffect } from 'react';

export default function GerenciadorFila({ usuarioId }) {
  const [tarefas, setTarefas] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [filtroTipo, setFiltroTipo] = useState('Todos');

  // ✅ NOVOS ESTADOS PARA PAGINAÇÃO
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const fetchFila = async () => {
    setIsLoading(true);
    try {
      // ✅ AGORA PASSA PAGE E LIMIT NA ROTA
      const res = await fetch(`/api/fila?userId=${usuarioId}&status=${filtroStatus}&tipo=${filtroTipo}&page=${currentPage}&limit=${itemsPerPage}`);
      const data = await res.json();
      setTarefas(data.tarefas);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Atualiza a fila a cada 5 segundos automaticamente (respeitando a página atual)
  useEffect(() => {
    fetchFila();
    const interval = setInterval(fetchFila, 5000);
    return () => clearInterval(interval);
  }, [filtroStatus, filtroTipo, currentPage]); // ✅ currentPage adicionado nas dependências

  const limparFila = async () => {
    // ✅ CORREÇÃO: Mensagem de confirmação mais clara
    if(window.confirm("Isso removerá TODAS as tarefas da sua tela, incluindo as que estão pendentes ou em processamento. Deseja continuar?")) {
      await fetch(`/api/fila/limpar/${usuarioId}`, { method: 'DELETE' });
      setCurrentPage(1); // Volta para a página 1 após limpar
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

  const totalPages = Math.ceil(total / itemsPerPage);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Gerenciador de Fila Unificado</h3>
          <p className="text-sm text-gray-500">Pendentes (Agora): {tarefas.filter(t => t.status === 'PENDENTE').length}</p>
        </div>
        
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">Status:</label>
            <select 
              value={filtroStatus} 
              onChange={e => {
                setFiltroStatus(e.target.value);
                setCurrentPage(1); // ✅ Volta para a página 1 ao mudar o filtro
              }} 
              className="border rounded p-1 text-sm bg-white"
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
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-lg flex flex-col">
        <div className="overflow-x-auto flex-1">
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
            <tbody className="divide-y divide-gray-100">
              {tarefas.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-gray-500">A fila está vazia.</td></tr>
              ) : (
                tarefas.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.id.substring(0,8)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-700">{t.tipo}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded ${getStatusCor(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gray-600">{t.tentativas}</td>
                    <td className="px-4 py-3 text-gray-800 font-mono text-xs">{t.alvo || '-'}</td>
                    <td className="px-4 py-3 text-gray-800">{t.conta || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-xs" title={t.detalhes}>
                      {t.detalhes || 'Aguardando processamento...'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ✅ CONTROLES DE PAGINAÇÃO ABAIXO DA TABELA */}
        <div className="flex items-center justify-between p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg mt-auto">
          <span className="text-sm font-semibold text-gray-600">
            Mostrando página {currentPage} de {totalPages || 1} (Total: {total} tarefas)
          </span>
          <div className="flex gap-2">
            <button 
              className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700 transition" 
              disabled={currentPage <= 1} 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button 
              className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700 transition" 
              disabled={currentPage >= totalPages || total === 0} 
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}