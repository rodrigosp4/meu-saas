import React, { useState } from 'react';

export default function SeletorCategoria(props) {
  const { categoriaSelecionada, setCategoriaSelecionada, categoriasSugeridas, contasML, refreshTokenIfNeeded } = props;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryTree, setCategoryTree] = useState([]);
  const[categoryPath, setCategoryPath] = useState([{ id: 'root', name: 'Categorias' }]);
  const[isLoading, setIsLoading] = useState(false);
  const [categoryDump, setCategoryDump] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const getValidToken = async () => {
    if (contasML.length === 0) return '';
    return await refreshTokenIfNeeded(contasML[0]) || '';
  };

  const loadData = async (url) => {
    setIsLoading(true);
    const token = await getValidToken();
    const separator = url.includes('?') ? '&' : '?';
    const finalUrl = token ? `${url}${separator}token=${token}` : url;
    
    try {
      const res = await fetch(finalUrl);
      const data = await res.json();
      return data;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const carregarRaiz = async () => {
    setIsLoading(true);
    const data = await loadData('/api/ml/categories');
    if (data) setCategoryTree(Array.isArray(data) ? data : []);
    setCategoryPath([{ id: 'root', name: 'Categorias' }]);
    setIsLoading(false);
  };

  const abrirModal = async () => {
    setIsModalOpen(true);
    setSearchTerm('');
    await carregarRaiz();

    if (!categoryDump) {
      fetch('/api/ml/categories-all').then(r => r.json()).then(d => {
        setCategoryDump(Array.isArray(d) ? d : Object.values(d));
      });
    }
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
    if (!term || !categoryDump) return setSearchResults([]);
    const results =[];
    for (const cat of categoryDump) {
      if (typeof cat !== 'object') continue;
      const fullPath = (cat.path_from_root ||[]).map(n => n.name).join(' > ');
      if ((fullPath || cat.name).toLowerCase().includes(term.toLowerCase())) {
        results.push({ ...cat, fullPath });
      }
      if (results.length > 50) break;
    }
    setSearchResults(results);
  };

  const clicarCategoria = async (cat) => {
    setIsLoading(true);
    try {
      // Busca direto da API pública do ML para pegar os detalhes da categoria (filhos)
      const res = await fetch(`https://api.mercadolibre.com/categories/${cat.id}`);
      const data = await res.json();

      if (data?.children_categories && data.children_categories.length > 0) {
        // Se tem filhos, entra na árvore dessa categoria e zera a pesquisa
        setSearchTerm('');
        setCategoryTree(data.children_categories);
        
        // Monta o breadcrumb de forma inteligente usando o path_from_root do ML
        if (data.path_from_root) {
           const newPath =[{ id: 'root', name: 'Categorias' }, ...data.path_from_root];
           setCategoryPath(newPath);
        } else {
           setCategoryPath([...categoryPath, { id: cat.id, name: cat.name }]);
        }
      } else {
        // É uma categoria folha (pode ser selecionada)
        setCategoriaSelecionada({ 
          category_id: cat.id, 
          domain_name: cat.name, 
          category_name: cat.fullPath || cat.name 
        });
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error("Erro ao buscar subcategorias:", error);
      // Em caso de erro de API, permite selecionar a que clicou
      setCategoriaSelecionada({ category_id: cat.id, domain_name: cat.name, category_name: cat.fullPath || cat.name });
      setIsModalOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const navegarBreadcrumb = async (index) => {
    if (index === categoryPath.length - 1) return; // Já está na aba atual
    
    const target = categoryPath[index];
    const newPath = categoryPath.slice(0, index + 1);
    setCategoryPath(newPath);

    if (target.id === 'root') {
      await carregarRaiz();
    } else {
      setIsLoading(true);
      try {
        const res = await fetch(`https://api.mercadolibre.com/categories/${target.id}`);
        const data = await res.json();
        if (data?.children_categories) {
          setCategoryTree(data.children_categories);
        }
      } catch (e) {
         console.error(e);
      } finally {
         setIsLoading(false);
      }
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex justify-between items-center border-b pb-2 mb-4">
        <h3 className="text-lg font-bold text-gray-800">Categoria no Mercado Livre</h3>
        <button onClick={abrirModal} className="px-4 py-2 bg-blue-100 text-blue-700 font-bold text-sm rounded shadow-sm hover:bg-blue-200 transition-colors">
          Pesquisar Categoria Manualmente
        </button>
      </div>

      {categoriasSugeridas.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-sm text-gray-600 mb-2">Sugestões (Baseado no título):</p>
          {categoriasSugeridas.map((cat, idx) => (
            <label key={idx} className={`block p-3 border rounded cursor-pointer transition-colors ${categoriaSelecionada?.category_id === cat.category_id ? 'bg-yellow-50 border-yellow-400' : 'hover:bg-gray-50'}`}>
              <input type="radio" checked={categoriaSelecionada?.category_id === cat.category_id} onChange={() => setCategoriaSelecionada(cat)} className="mr-3"/>
              <span className="font-semibold">{cat.domain_name}</span> <span className="text-gray-500 text-sm">({cat.category_name})</span>
            </label>
          ))}
        </div>
      )}

      {categoriaSelecionada?.category_id && (
         <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded">
            <p className="text-sm text-green-800 font-semibold">Categoria Atual: <span className="font-black">{categoriaSelecionada.domain_name || categoriaSelecionada.category_name} ({categoriaSelecionada.category_id})</span></p>
         </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-3xl flex flex-col h-[80vh] shadow-2xl">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-lg">
              <h3 className="font-bold text-gray-800">Buscar Categoria</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-red-500 font-bold text-xl hover:bg-red-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors">&times;</button>
            </div>
            
            <div className="p-4 border-b bg-white">
              <input 
                type="text" 
                placeholder="Buscar categoria por nome... Ex: Placa de Vídeo" 
                value={searchTerm} 
                onChange={(e) => handleSearch(e.target.value)} 
                className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            
            {/* Breadcrumb de Navegação */}
            {!searchTerm && categoryPath.length > 0 && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex flex-wrap gap-2 text-sm items-center">
                {categoryPath.map((step, idx) => (
                  <React.Fragment key={idx}>
                    <button 
                      onClick={() => navegarBreadcrumb(idx)} 
                      className={`hover:underline transition-colors ${idx === categoryPath.length - 1 ? 'font-bold text-blue-900 cursor-default' : 'text-blue-600'}`}
                    >
                      {step.name}
                    </button>
                    {idx < categoryPath.length - 1 && <span className="text-blue-300">&rsaquo;</span>}
                  </React.Fragment>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {isLoading ? (
                 <div className="flex justify-center items-center h-full flex-col gap-2">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                   <span className="text-sm text-gray-500 font-medium">Carregando categorias...</span>
                 </div>
              ) : searchTerm ? (
                <ul className="space-y-1">
                  {searchResults.length > 0 ? searchResults.map(c => (
                    <li key={c.id}>
                      <button onClick={() => clicarCategoria(c)} className="w-full text-left p-3 bg-white hover:bg-blue-50 border rounded shadow-sm text-sm transition-colors text-gray-700">
                        {c.fullPath}
                      </button>
                    </li>
                  )) : (
                    <p className="text-center text-gray-500 py-4">Nenhuma categoria encontrada para "{searchTerm}"</p>
                  )}
                </ul>
              ) : (
                <ul className="space-y-1">
                  {categoryTree.map(c => (
                    <li key={c.id}>
                      <button onClick={() => clicarCategoria(c)} className="w-full text-left p-3 bg-white hover:bg-blue-50 border border-gray-200 rounded shadow-sm text-sm flex justify-between items-center transition-colors">
                        <span className="font-medium text-gray-700">{c.name}</span> 
                        <span className="text-gray-400 text-lg leading-none">&rsaquo;</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}