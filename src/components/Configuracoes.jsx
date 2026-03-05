import React, { useState, useEffect, useRef } from 'react';

export default function Configuracoes({ usuarioId }) {
  const [tinyToken, setTinyToken] = useState('');
  const [isTokenSalvo, setIsTokenSalvo] = useState(false);
  const [contasML, setContasML] = useState([]);
  const [regrasPreco, setRegrasPreco] = useState([]);
  const isProcessingOAuth = useRef(new URLSearchParams(window.location.search).has('code'));
  
  const [novaRegraNome, setNovaRegraNome] = useState('');
  const [novaRegraPrecoBase, setNovaRegraPrecoBase] = useState('promocional'); 
  const [novaRegraVariaveis, setNovaRegraVariaveis] = useState([]);
  const [varNome, setVarNome] = useState('');
  const [varTipo, setVarTipo] = useState('perc_custo');
  const [varValor, setVarValor] = useState('');
  const [editandoRegraId, setEditandoRegraId] = useState(null);

  // 1. CARREGA TUDO DO BANCO DE DADOS
  const carregarConfig = (id) => {
    return fetch(`/api/usuario/${id}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.tinyToken) {
          setTinyToken(data.tinyToken);
          setIsTokenSalvo(true);
        }
        setContasML(data.contasML || []);
        setRegrasPreco(data.regrasPreco || []);
        localStorage.setItem('saas_contas_ml', JSON.stringify(data.contasML || []));
        localStorage.setItem('saas_regras_preco', JSON.stringify(data.regrasPreco || []));
      });
  };

  useEffect(() => {
    // Pula o carregamento inicial se há um código OAuth — o Effect 5 fará o reload após salvar
    if (isProcessingOAuth.current) return;
    carregarConfig(usuarioId);
  }, [usuarioId]);

  // 2. SALVAR TOKEN TINY NO BANCO
  const salvarTokenTiny = async () => {
    if (!tinyToken) return alert("Insira um token.");
    await fetch(`/api/usuario/${usuarioId}/tiny`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tinyToken })
    });
    const userDb = JSON.parse(localStorage.getItem('saas_usuario'));
    localStorage.setItem('saas_usuario', JSON.stringify({...userDb, tinyToken}));
    setIsTokenSalvo(true);
    alert('Token Tiny Salvo no banco de dados!');
  };

  // 3. EXCLUIR CONTA NO BANCO
  const removerContaML = async (id) => {
    if (window.confirm("Tem certeza que deseja remover esta conta?")) {
      await fetch(`/api/usuario/${usuarioId}/contas-ml/${id}`, { method: 'DELETE' });
      setContasML(prev => prev.filter(c => c.id !== id));
    }
  };

  const editarApelidoConta = async (id) => {
    const conta = contasML.find(c => c.id === id);
    const novoNome = window.prompt("Digite o nome ou apelido para esta conta:", conta.nickname);
    if (novoNome && novoNome.trim() !== "") {
      const contaAtualizada = { ...conta, nickname: novoNome.trim() };
      await fetch(`/api/usuario/${usuarioId}/contas-ml`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contaAtualizada)
      });
      setContasML(prev => prev.map(c => c.id === id ? contaAtualizada : c));
    }
  };

  const alternarLogistica = async (id, currentLogistica) => {
    const novoModo = currentLogistica === 'ME1' ? 'ME2' : 'ME1';
    const conta = contasML.find(c => c.id === id);
    const contaAtualizada = { ...conta, envioSuportado: novoModo };
    try {
      const res = await fetch(`/api/usuario/${usuarioId}/contas-ml`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contaAtualizada)
      });
      if (!res.ok) throw new Error("Erro na API");
      setContasML(prev => prev.map(c => c.id === id ? { ...c, envioSuportado: novoModo } : c));
      const contasSalvas = JSON.parse(localStorage.getItem('saas_contas_ml')) ||[];
      const novasContas = contasSalvas.map(c => c.id === id ? { ...c, envioSuportado: novoModo } : c);
      localStorage.setItem('saas_contas_ml', JSON.stringify(novasContas));
    } catch (error) {
      alert("Erro ao alterar logística.");
    }
  };

  // 4. SALVAR REGRAS NO BANCO
  const salvarRegra = async () => {
    if (!novaRegraNome.trim()) return alert("Dê um nome à regra.");
    if (novaRegraVariaveis.length === 0) return alert("Adicione pelo menos uma taxa.");
    const payload = {
      id: editandoRegraId,
      nome: novaRegraNome.trim(),
      precoBase: novaRegraPrecoBase,
      variaveis: novaRegraVariaveis
    };
    const res = await fetch(`/api/usuario/${usuarioId}/regras`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const regraSalva = await res.json();
    if (editandoRegraId) {
      setRegrasPreco(prev => prev.map(r => r.id === editandoRegraId ? regraSalva : r));
    } else {
      setRegrasPreco(prev => [...prev, regraSalva]);
    }
    cancelarEdicao();
  };

  const removerRegra = async (id) => {
    if (window.confirm("Deseja realmente excluir esta regra?")) {
      await fetch(`/api/usuario/${usuarioId}/regras/${id}`, { method: 'DELETE' });
      setRegrasPreco(prev => prev.filter(r => r.id !== id));
    }
  };

  const adicionarVariavel = () => {
    if (!varNome.trim() || !varValor) return alert("Preencha o nome e o valor da taxa/custo.");
    const novaVariavel = { id: Date.now().toString(), nome: varNome.trim(), tipo: varTipo, valor: Number(varValor) };
    setNovaRegraVariaveis([...novaRegraVariaveis, novaVariavel]);
    setVarNome(''); setVarValor('');
  };
  const removerVariavelTemp = (id) => setNovaRegraVariaveis(novaRegraVariaveis.filter(v => v.id !== id));
  const moverVariavelTemp = (index, direcao) => {
    const novasVars = [...novaRegraVariaveis];
    if (direcao === -1 && index > 0) [novasVars[index - 1], novasVars[index]] = [novasVars[index], novasVars[index - 1]];
    else if (direcao === 1 && index < novasVars.length - 1) [novasVars[index + 1], novasVars[index]] = [novasVars[index], novasVars[index + 1]];
    setNovaRegraVariaveis(novasVars);
  };
  const editarRegra = (id) => {
    const regra = regrasPreco.find(r => r.id === id);
    if (regra) {
      setNovaRegraNome(regra.nome); setNovaRegraPrecoBase(regra.precoBase || 'promocional'); setNovaRegraVariaveis(regra.variaveis); setEditandoRegraId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const cancelarEdicao = () => {
    setNovaRegraNome(''); setNovaRegraPrecoBase('promocional'); setNovaRegraVariaveis([]); setEditandoRegraId(null);
  };

  const iniciarLoginML = () => {
    localStorage.setItem('redirect_to_page', 'configuracoes');
    const url = new URL('https://auth.mercadolivre.com.br/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', import.meta.env.VITE_ML_APP_ID);
    url.searchParams.set('redirect_uri', import.meta.env.VITE_ML_REDIRECT_URI);
    window.location.assign(url.toString());
  };
  
  // 5. CALLBACK DO MERCADO LIVRE (Salva no Banco)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    (async () => {
      try {
        const resp = await fetch('/api/ml/auth', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error('Falha ao autenticar.');
        const novaConta = {
          id: data.user_id,
          nickname: data.nickname || `Usuário ${data.user_id}`,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in * 1000),
          envioSuportado: data.envioSuportado || 'ME2'
        };
        const resDb = await fetch(`/api/usuario/${usuarioId}/contas-ml`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novaConta)
        });
        const contaSalva = await resDb.json();
        if (!resDb.ok) throw new Error(contaSalva.erro || 'Erro ao salvar conta no banco.');
        // Re-busca do banco para garantir que o estado reflete o que foi salvo
        await carregarConfig(usuarioId);
        alert('Conta do Mercado Livre conectada com sucesso!');
      } catch (e) { alert('Erro: ' + e.message); }
    })();
  }, [usuarioId]);

  const formatarPrecoBaseText = (tipo) => {
    if (tipo === 'venda') return 'Preço de Venda';
    if (tipo === 'custo') return 'Preço de Custo';
    return 'Preço Promocional ou Venda';
  }

  // ===== Cores do tema MeliUnlocker =====
  const c = {
    orange: '#e67e22',
    orangeHover: '#d35400',
    yellow: '#f1c40f',
    heading: '#2c3e50',
    headingSub: '#34495e',
    green: '#27ae60',
    greenHover: '#229954',
    red: '#c0392b',
    redHover: '#e74c3c',
    muted: '#7f8c8d',
    border: '#e0e0e0',
    inputBg: '#f5f6f7',
    cardBg: '#ffffff',
  };

  return (
    <div className="space-y-8 max-w-5xl pb-10">
      <h3 className="text-2xl font-bold" style={{ color: c.heading }}>Configurações e Integrações</h3>
      
      {/* 1. TINY ERP */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        <h4 className="text-lg font-bold" style={{ color: c.orange }}>Conexão Tiny ERP</h4>
        <div className="mt-4 flex gap-4">
          <input 
            type="text" 
            value={tinyToken}
            onChange={(e) => setTinyToken(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md"
            placeholder="Token API Tiny..."
            disabled={isTokenSalvo}
          />
          <button 
            onClick={salvarTokenTiny} 
            disabled={isTokenSalvo} 
            className="px-4 py-2 text-white rounded transition"
            style={{ backgroundColor: c.orange }}
            onMouseOver={e => { if (!e.target.disabled) e.target.style.backgroundColor = c.orangeHover; }}
            onMouseOut={e => e.target.style.backgroundColor = c.orange}
          >
            Salvar
          </button>
        </div>
      </div>

      {/* 2. CONTAS MERCADO LIVRE */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-bold" style={{ color: c.orange }}>Contas do Mercado Livre</h4>
          <button 
            type="button" 
            onClick={iniciarLoginML} 
            className="px-4 py-2 font-bold rounded transition"
            style={{ backgroundColor: '#f1c40f', color: '#34495e' }}
            onMouseOver={e => e.target.style.backgroundColor = '#f39c12'}
            onMouseOut={e => e.target.style.backgroundColor = '#f1c40f'}
          >
            + Conectar Nova Conta
          </button>
        </div>
        {contasML.length === 0 ? <p className="text-sm" style={{ color: c.muted }}>Nenhuma conta conectada.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contasML.map(conta => (
              <div key={conta.id} className="p-4 rounded flex justify-between items-start shadow-sm" 
                style={{ backgroundColor: '#fdf8f2', border: `1px solid ${c.border}`, borderLeft: `5px solid ${c.orange}` }}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold" style={{ color: c.headingSub }}>{conta.nickname}</p>
                    <button onClick={() => editarApelidoConta(conta.id)} className="text-xs hover:underline" style={{ color: c.orange }}>
                      ✏️ Editar
                    </button>
                  </div>
                  <div className="text-xs font-semibold mt-1 flex items-center gap-2" style={{ color: c.green }}>
                    Logística: {conta.envioSuportado}
                    <button 
                      onClick={() => alternarLogistica(conta.id, conta.envioSuportado)} 
                      className="text-[10px] hover:underline px-1.5 py-0.5 rounded cursor-pointer"
                      style={{ color: c.orange, backgroundColor: '#fef5e7' }}
                    >
                      🔁 Trocar
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => removerContaML(conta.id)} 
                  className="text-xs font-semibold px-2 py-1 rounded transition"
                  style={{ color: c.red }}
                  onMouseOver={e => e.target.style.backgroundColor = '#fce4e4'}
                  onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. MOTOR DE PRECIFICAÇÃO DINÂMICO */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        <h4 className="text-lg font-bold mb-4" style={{ color: editandoRegraId ? c.orange : c.headingSub }}>
          {editandoRegraId ? '✏️ Editando Regra de Precificação' : 'Construtor de Regras de Precificação'}
        </h4>
        
        <div className="p-5 rounded-lg mb-6" style={{ backgroundColor: '#fef5e7', border: '1px solid #f5d9a0' }}>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-bold" style={{ color: c.headingSub }}>1. Nome da Regra</label>
              <input 
                type="text" 
                value={novaRegraNome} 
                onChange={e => setNovaRegraNome(e.target.value)} 
                placeholder="Ex: Fórmula Padrão com Frete Grátis" 
                className="w-full mt-1 px-3 py-2 rounded-md" 
                style={{ border: `1px solid ${c.orange}40` }}
              />
            </div>
            
            <div>
              <label className="text-sm font-bold" style={{ color: c.headingSub }}>2. Preço Base (Base de Cálculo)</label>
              <select 
                value={novaRegraPrecoBase} 
                onChange={e => setNovaRegraPrecoBase(e.target.value)} 
                className="w-full mt-1 px-3 py-2 rounded-md bg-white"
                style={{ border: `1px solid ${c.orange}40` }}
              >
                <option value="promocional">Preço Promocional (Se houver) ou Venda</option>
                <option value="venda">Apenas Preço de Venda</option>
                <option value="custo">Apenas Preço de Custo</option>
              </select>
            </div>
          </div>

          <div className="pt-4 mb-4" style={{ borderTop: `1px solid ${c.orange}30` }}>
            <label className="text-sm font-bold mb-2 block" style={{ color: c.headingSub }}>3. Adicionar Variáveis (Custos, Taxas, Margens)</label>
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <div className="flex-1 w-full">
                <input type="text" value={varNome} onChange={e => setVarNome(e.target.value)} placeholder="Nome (Ex: Custo da Caixa, Imposto...)" className="w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <div className="flex-1 w-full">
                <select value={varTipo} onChange={e => setVarTipo(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm bg-white">
                  <option value="perc_custo">% Sobre o Custo (Margem de Lucro)</option>
                  <option value="fixo_custo">R$ Fixo Adicionado ao Custo</option>
                  <option value="perc_venda">% Sobre o Valor Final de Venda (Impostos)</option>
                </select>
              </div>
              <div className="w-full sm:w-32">
                <input type="number" step="0.01" value={varValor} onChange={e => setVarValor(e.target.value)} placeholder="Valor" className="w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <button 
                onClick={adicionarVariavel} 
                className="w-full sm:w-auto px-4 py-2 text-white font-bold rounded text-sm transition"
                style={{ backgroundColor: c.orange }}
                onMouseOver={e => e.target.style.backgroundColor = c.orangeHover}
                onMouseOut={e => e.target.style.backgroundColor = c.orange}
              >
                + Adicionar
              </button>
            </div>
          </div>

          {/* Lista de Variáveis Adicionadas */}
          {novaRegraVariaveis.length > 0 && (
            <div className="bg-white p-3 rounded border shadow-sm mb-4" style={{ borderColor: c.border }}>
              <h5 className="text-xs font-bold uppercase mb-2" style={{ color: c.muted }}>Composição da Regra (Ordem de Cálculo):</h5>
              <ul className="space-y-1">
                {novaRegraVariaveis.map((v, index) => (
                  <li key={v.id} className="flex justify-between items-center text-sm py-1 border-b last:border-0 hover:bg-gray-50 px-2 rounded">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: c.headingSub }}>{index + 1}. {v.nome}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold" style={{ color: v.valor >= 0 ? c.orange : c.red }}>
                        {v.valor > 0 ? '+' : ''}{v.tipo === 'fixo_custo' ? `R$ ${v.valor}` : `${v.valor}%`} 
                        <span className="text-xs font-normal ml-1" style={{ color: c.muted }}>
                          ({v.tipo === 'perc_venda' ? 'S/ Venda' : 'S/ Custo'})
                        </span>
                      </span>
                      <div className="flex items-center gap-1 ml-2">
                        <button onClick={() => moverVariavelTemp(index, -1)} disabled={index === 0} className="hover:text-blue-600 disabled:opacity-30 p-1" style={{ color: c.muted }}>▲</button>
                        <button onClick={() => moverVariavelTemp(index, 1)} disabled={index === novaRegraVariaveis.length - 1} className="hover:text-blue-600 disabled:opacity-30 p-1" style={{ color: c.muted }}>▼</button>
                        <button onClick={() => removerVariavelTemp(v.id)} className="font-bold px-2 ml-1" style={{ color: c.red }}>&times;</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-right flex justify-end gap-3 mt-6">
            {editandoRegraId && (
              <button onClick={cancelarEdicao} className="px-6 py-2 text-white font-bold rounded shadow transition" style={{ backgroundColor: '#7f8c8d' }}>
                Cancelar Edição
              </button>
            )}
            <button 
              onClick={salvarRegra} 
              className="px-6 py-2 text-white font-bold rounded shadow transition"
              style={{ backgroundColor: c.green }}
              onMouseOver={e => e.target.style.backgroundColor = c.greenHover}
              onMouseOut={e => e.target.style.backgroundColor = c.green}
            >
              {editandoRegraId ? 'Atualizar Regra' : 'Salvar Nova Regra'}
            </button>
          </div>
        </div>

        {/* Listar Regras Salvas */}
        <h4 className="text-md font-bold mb-3" style={{ color: c.headingSub }}>Regras Salvas</h4>
        <div className="space-y-3">
          {regrasPreco.length === 0 && <p className="text-sm" style={{ color: c.muted }}>Nenhuma regra criada ainda.</p>}
          {regrasPreco.map(regra => (
             <div key={regra.id} className="p-4 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="font-black text-lg block" style={{ color: c.headingSub }}>{regra.nome}</span>
                  <span className="text-xs px-2 py-0.5 rounded font-semibold mt-1 inline-block" 
                    style={{ backgroundColor: '#fef5e7', color: c.orange, border: `1px solid ${c.orange}30` }}>
                    Base: {formatarPrecoBaseText(regra.precoBase || 'promocional')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => editarRegra(regra.id)} 
                    className="text-sm font-bold px-3 py-1 rounded transition"
                    style={{ color: c.orange, backgroundColor: '#fef5e7' }}
                  >
                    ✏️ Editar
                  </button>
                  <button 
                    onClick={() => removerRegra(regra.id)} 
                    className="text-sm font-bold px-3 py-1 rounded transition"
                    style={{ color: c.red, backgroundColor: '#fce4e4' }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {regra.variaveis ? (
                    regra.variaveis.map((v, idx) => (
                      <span key={v.id} className="text-xs px-2 py-1 rounded border" style={{ backgroundColor: '#f9f9f9', color: c.headingSub }}>
                        {idx + 1}. {v.nome}: <strong style={{ color: v.valor >= 0 ? c.orange : c.red }}>{v.valor > 0 ? '+' : ''}{v.tipo === 'fixo_custo' ? `R$ ${v.valor}` : `${v.valor}%`}</strong>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs" style={{ color: c.muted }}>
                      Regra Legada (Recomendado recriar): + R${regra.custoFixo} | + {regra.margemCustoPerc}% Lucro | - {regra.impostoVendaPerc}% Imposto
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded font-semibold" 
                    style={{ backgroundColor: '#fef5e7', color: c.orange, border: `1px solid ${c.orange}30` }}>
                    * Tarifa do Mercado Livre calculada automaticamente.
                  </span>
                </div>
             </div>
          ))}
        </div>

      </div>
    </div>
  );
}
