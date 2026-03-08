import React, { useState, useEffect } from 'react';

export default function Anuncios({ onAnunciar, usuarioId }) { 
  const [produtos, setProdutos] = useState([]);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [syncProgress, setSyncProgress] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [specificSku, setSpecificSku] = useState('');

  // Novos estados para a matriz de anúncios
  const [contasML, setContasML] = useState([]);
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  const itemsPerPage = 50;

  // Carrega as contas ML do usuário para montar a matriz
  useEffect(() => {
    if (!usuarioId) return;
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.contasML) setContasML(data.contasML);
      })
      .catch(err => console.error("Erro ao carregar contas:", err));
  }, [usuarioId]);

  const fetchProdutos = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/produtos?userId=${usuarioId}&page=${currentPage}&limit=${itemsPerPage}&search=${searchTerm}&status=${statusFilter}`);
      const data = await res.json();
      setProdutos(data.produtos);
      setTotalProdutos(data.total);
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProdutos();
  }, [currentPage, searchTerm, statusFilter]);

  const iniciarSincronizacao = async (mode = 'all', sku = '') => {
    const userDb = JSON.parse(localStorage.getItem('saas_usuario'));
    const tinyToken = userDb?.tinyToken;

    if (!tinyToken) {
      alert("Vá em Configurações e salve seu Token do Tiny ERP primeiro!");
      return;
    }

    setIsSyncModalOpen(false);
    setSyncProgress(0);

    try {
      const res = await fetch('/api/produtos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, tinyToken, mode, sku })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || "Falha ao iniciar sincronização");

      const jobId = data.jobId;

      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/produtos/sync-status/${jobId}`);
          const statusData = await statusRes.json();

          if (statusData.state === 'completed') {
            clearInterval(interval);
            setSyncProgress(100);
            setTimeout(() => {
              setSyncProgress(null);
              fetchProdutos();
              alert("✅ Sincronização concluída com sucesso!");
            }, 500);
          } else if (statusData.state === 'failed') {
            clearInterval(interval);
            setSyncProgress(null);
            alert("❌ Erro ao sincronizar. Verifique o terminal do Worker.");
          } else {
            setSyncProgress(statusData.progress || 5);
          }
        } catch (e) {
          console.error("Erro ao checar status:", e);
        }
      }, 1500);

    } catch (error) {
      console.error(error);
      alert("Erro ao conectar com o servidor: " + error.message);
      setSyncProgress(null);
    }
  };

  const getVariacoesInfo = (produto) => {
    const variacoes = produto.dadosTiny?.variacoes;
    if (!variacoes) return { isPai: false, qtd: 0 };
    const lista = Array.isArray(variacoes) ? variacoes : Object.values(variacoes);
    return { isPai: lista.length > 0, qtd: lista.length };
  };

  const toggleExpand = (produtoId) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(produtoId)) next.delete(produtoId);
      else next.add(produtoId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* MODAL DE SINCRONIZAÇÃO */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ animation: 'slideIn 0.3s ease-out' }}>
            <h4 className="text-lg font-bold mb-4" style={{ color: '#34495e' }}>Opções de Sincronização</h4>
            
            <div className="p-4 border rounded-md mb-4" style={{ backgroundColor: '#d4edda', borderColor: '#c3e6cb' }}>
              <h5 className="font-semibold" style={{ color: '#155724' }}>⚡ Sincronização Rápida</h5>
              <p className="text-sm mb-3" style={{ color: '#155724' }}>Busca apenas os últimos ~500 produtos.</p>
              <button onClick={() => iniciarSincronizacao('recentes')} className="w-full px-4 py-2 text-white font-semibold rounded shadow-sm transition" style={{ backgroundColor: '#27ae60' }}
                onMouseOver={e => e.target.style.backgroundColor = '#229954'}
                onMouseOut={e => e.target.style.backgroundColor = '#27ae60'}
              >
                Sincronizar Recentes
              </button>
            </div>

            <div className="p-4 border rounded-md mb-4" style={{ borderColor: '#e0e0e0' }}>
              <h5 className="font-semibold" style={{ color: '#34495e' }}>Buscar SKU Específico</h5>
              <div className="flex gap-2 mt-2">
                <input type="text" value={specificSku} onChange={(e) => setSpecificSku(e.target.value)} placeholder="Ex: SKU-12345" className="w-full px-3 py-2 border rounded-md text-sm" />
                <button onClick={() => iniciarSincronizacao('sku', specificSku)} disabled={!specificSku} className="px-4 py-2 text-white font-semibold rounded shadow-sm transition disabled:opacity-50" style={{ backgroundColor: '#2d3e50' }}>
                  Buscar
                </button>
              </div>
            </div>

            <div className="p-4 border rounded-md" style={{ borderColor: '#f5c6cb' }}>
              <h5 className="font-semibold" style={{ color: '#c0392b' }}>Atualização Completa</h5>
              <button onClick={() => iniciarSincronizacao('all')} className="mt-2 w-full px-4 py-2 bg-white font-semibold rounded shadow-sm transition" style={{ border: '1px solid #c0392b', color: '#c0392b' }}>
                Iniciar Atualização Completa
              </button>
            </div>
            
            <button onClick={() => setIsSyncModalOpen(false)} className="mt-4 text-sm font-semibold w-full text-center" style={{ color: '#7f8c8d' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-medium" style={{ color: '#2c3e50' }}>Produtos do ERP (Catálogo Local)</h3>
          <p className="text-sm mb-4" style={{ color: '#7f8c8d' }}>{totalProdutos} produtos no banco de dados.</p>
          
          {syncProgress !== null && (
            <div className="w-full max-w-md">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: '#e67e22' }}>Sincronizando com o Tiny...</span>
                <span className="text-xs font-medium" style={{ color: '#e67e22' }}>{syncProgress}%</span>
              </div>
              <div className="w-full rounded-full h-2" style={{ backgroundColor: '#e0e0e0' }}>
                <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${syncProgress}%`, backgroundColor: '#e67e22' }}></div>
              </div>
            </div>
          )}
        </div>
        <button 
          onClick={() => setIsSyncModalOpen(true)} 
          disabled={syncProgress !== null} 
          className="px-4 py-2 text-white font-semibold rounded shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: '#e67e22' }}
          onMouseOver={e => { if (!e.target.disabled) e.target.style.backgroundColor = '#d35400'; }}
          onMouseOut={e => e.target.style.backgroundColor = '#e67e22'}
        >
          {syncProgress !== null ? 'Sincronizando...' : '🔄 Sincronizar com Tiny'}
        </button>
      </div>

      <div className="flex gap-4 p-4 rounded-lg shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0' }}>
        <input type="text" placeholder="Buscar por SKU ou Nome..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border rounded-md text-sm" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="w-64 px-3 py-2 border rounded-md text-sm">
          <option value="Todos">Todos os Status</option>
          <option value="Com Anúncios">Com Anúncios no ML</option>
          <option value="Sem Anúncios">Sem Anúncios no ML</option>
        </select>
      </div>

      <div className="shadow-sm rounded-lg overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0' }}>
        <table className="min-w-full divide-y" style={{ borderColor: '#e0e0e0' }}>
          <thead style={{ backgroundColor: '#f0f2f5' }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: '#34495e' }}>SKU</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: '#34495e' }}>Produto</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: '#34495e' }}>Estoque</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: '#34495e' }}>Preço</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: '#34495e' }}>Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ backgroundColor: '#ffffff' }}>
            {isLoading ? (
              <tr><td colSpan="5" className="px-6 py-8 text-center text-sm" style={{ color: '#7f8c8d' }}>Buscando no banco de dados...</td></tr>
            ) : produtos.length > 0 ? (
              produtos.map((produto) => {
                const varInfo = getVariacoesInfo(produto);
                const temAnuncios = produto.anunciosML && produto.anunciosML.length > 0;
                const isExpanded = expandedProducts.has(produto.id);
                
                return (
                  <React.Fragment key={produto.id}>
                    <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                      <td className="px-6 py-4 text-sm font-bold" style={{ color: '#34495e' }}>{produto.sku}</td>
                      
                      <td className="px-6 py-4 text-sm">
                        <div className="font-medium" style={{ color: '#2c3e50' }}>{produto.nome}</div>
                        <div className="flex flex-wrap gap-2 items-center mt-1.5">
                          {varInfo.isPai && (
                            <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold shadow-sm" 
                              style={{ backgroundColor: '#fdf8f2', color: '#e67e22', border: '1px solid #f1c40f' }}>
                              📦 Produto Pai ({varInfo.qtd} Variações)
                            </div>
                          )}
                          {temAnuncios && (
                            <button 
                              onClick={() => toggleExpand(produto.id)} 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              <svg className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                              {produto.anunciosML.length} Anúncio(s)
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <span className="font-semibold" style={{ color: produto.estoque > 0 ? '#27ae60' : '#7f8c8d' }}>
                           {produto.estoque} un
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">R$ {produto.preco.toFixed(2).replace('.', ',')}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button onClick={() => {
                            const idCorreto = produto.dadosTiny?.id || produto.idTiny;
                            if (!idCorreto) return alert("Erro: Produto sem ID do Tiny salvo.");
                            
                            onAnunciar({
                              id: idCorreto, 
                              sku: produto.sku,
                              nome: produto.nome,
                              preco: produto.preco,
                              dadosTiny: produto.dadosTiny
                            });
                          }} 
                          className="text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-sm transition-colors"
                          style={{ backgroundColor: '#e67e22' }}
                          onMouseOver={e => e.target.style.backgroundColor = '#d35400'}
                          onMouseOut={e => e.target.style.backgroundColor = '#e67e22'}
                        >
                          Criar Anúncio
                        </button>
                      </td>
                    </tr>

                    {/* MATRIZ DE ANÚNCIOS POR CONTA */}
                    {isExpanded && (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan="5" className="p-0">
                          <div className="p-4 bg-slate-50/50 shadow-inner">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                              Status de Publicação por Conta
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                               {contasML.map(conta => {
                                  const anunciosDaConta = produto.anunciosML.filter(a => a.contaId === conta.id);
                                  const classicos = anunciosDaConta.filter(a => a.dadosML?.listing_type_id?.includes('special'));
                                  const premiums = anunciosDaConta.filter(a => a.dadosML?.listing_type_id?.includes('pro'));

                                  return (
                                    <div key={conta.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col gap-2">
                                       <span className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-1 truncate" title={conta.nickname}>
                                          {conta.nickname}
                                       </span>
                                       
                                       <div className="flex justify-between items-center text-xs mt-1">
                                          <span className="text-gray-600 font-medium">Clássico:</span>
                                          {classicos.length > 0 ? (
                                            <span className="text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              ✅ Ativo <span className="text-[10px] text-green-600">({classicos.length})</span>
                                            </span>
                                          ) : (
                                            <span className="text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              ❌ Não
                                            </span>
                                          )}
                                       </div>
                                       
                                       <div className="flex justify-between items-center text-xs">
                                          <span className="text-gray-600 font-medium">Premium:</span>
                                          {premiums.length > 0 ? (
                                            <span className="text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              ✅ Ativo <span className="text-[10px] text-green-600">({premiums.length})</span>
                                            </span>
                                          ) : (
                                            <span className="text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              ❌ Não
                                            </span>
                                          )}
                                       </div>
                                    </div>
                                  )
                               })}
                               {contasML.length === 0 && (
                                 <p className="text-xs text-gray-500 italic col-span-full">Nenhuma conta Mercado Livre configurada em "Configurações".</p>
                               )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })
            ) : (
              <tr><td colSpan="5" className="px-6 py-8 text-center text-sm" style={{ color: '#7f8c8d' }}>Nenhum produto encontrado com os filtros atuais.</td></tr>
            )}
          </tbody>
        </table>
        
        <div className="flex items-center justify-between p-4" style={{ borderTop: '1px solid #e0e0e0' }}>
          <span className="text-sm" style={{ color: '#555' }}>Mostrando página {currentPage}</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded disabled:opacity-50" style={{ borderColor: '#ccd0d5', color: '#34495e' }} disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</button>
            <button className="px-3 py-1 border rounded disabled:opacity-50" style={{ borderColor: '#ccd0d5', color: '#34495e' }} disabled={produtos.length < itemsPerPage} onClick={() => setCurrentPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      </div>
    </div>
  );
}