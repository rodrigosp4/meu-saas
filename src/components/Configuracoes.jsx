import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useContasML } from '../contexts/ContasMLContext';

export default function Configuracoes({ usuarioId }) {
  const { role } = useAuth();
  const { refresh: refreshContas } = useContasML();
  const [tinyToken, setTinyToken] = useState('');
  const [tinyPlano, setTinyPlano] = useState('descontinuado');
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

  // Atacado (Preço por Quantidade)
  const [cepOrigem, setCepOrigem] = useState('');
  const [salvandoCep, setSalvandoCep] = useState(false);

  const [atacadoAtivo, setAtacadoAtivo] = useState(false);
  const [faixasAtacado, setFaixasAtacado] = useState([]);
  const [novaFaixaMinQtd, setNovaFaixaMinQtd] = useState('');
  const [novaFaixaDesconto, setNovaFaixaDesconto] = useState('');
  const [salvandoAtacado, setSalvandoAtacado] = useState(false);

  // ===== IMGUR =====
  const [imgurClientId, setImgurClientId] = useState('');
  const [imgurClientSecret, setImgurClientSecret] = useState('');
  const [imgurSalvo, setImgurSalvo] = useState(false);
  const [salvandoImgur, setSalvandoImgur] = useState(false);

  // ===== REMOVE.BG =====
  const [removeBgApiKey, setRemoveBgApiKey] = useState('');
  const [removeBgSalvo, setRemoveBgSalvo] = useState(false);
  const [salvandoRemoveBg, setSalvandoRemoveBg] = useState(false);

  // ===== SUB-USUÁRIOS =====
  const [subUsuarios, setSubUsuarios] = useState([]);
  const [modalSubUser, setModalSubUser] = useState(null); // null | 'criar' | { ...subUser }
  const [subEmail, setSubEmail] = useState('');
  const [subSenha, setSubSenha] = useState('');
  const [subRole, setSubRole] = useState('OPERATOR');
  const [subPermissoesCustom, setSubPermissoesCustom] = useState([]);
  const [salvandoSub, setSalvandoSub] = useState(false);

  // ===== SUPORTE =====
  const [suporteAtivo, setSuporteAtivo] = useState(false);
  const [suporteExpira, setSuporteExpira] = useState(null);
  const [salvandoSuporteToggle, setSalvandoSuporteToggle] = useState(false);

// 1. CARREGA TUDO DO BANCO DE DADOS
  const carregarConfig = (id) => {
    // O Date.now() impede que a Vercel entregue dados cacheados (antigos)
    return fetch(`/api/usuario/${id}/config?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error('Falha ao carregar dados do servidor');
        return res.json();
      })
      .then(data => {
        if (data.tinyToken) {
          setTinyToken(data.tinyToken);
          setTinyPlano(data.tinyPlano || 'descontinuado');
          setIsTokenSalvo(true);
        }
        setContasML(data.contasML || []);
        setRegrasPreco(data.regrasPreco || []);
        if (data.cepOrigem) setCepOrigem(data.cepOrigem);
        if (data.configAtacado) {
          setAtacadoAtivo(data.configAtacado.ativo || false);
          setFaixasAtacado(data.configAtacado.faixas || []);
        }
        // Carrega credenciais do Imgur
        if (data.imgurClientId) {
          setImgurClientId(data.imgurClientId);
          setImgurSalvo(true);
        }
        if (data.imgurClientSecret) {
          setImgurClientSecret(data.imgurClientSecret);
        }
        // Carrega chave do Remove.bg
        if (data.removeBgApiKey) {
          setRemoveBgApiKey(data.removeBgApiKey);
          setRemoveBgSalvo(true);
        }
      });
  };

  useEffect(() => {
    // Pula o carregamento inicial se há um código OAuth — o Effect 5 fará o reload após salvar
    if (isProcessingOAuth.current) return;
    carregarConfig(usuarioId);
  }, [usuarioId]);

  const salvarTokenTiny = async () => {
    if (!tinyToken) return alert("Insira um token.");
    await fetch(`/api/usuario/${usuarioId}/tiny`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tinyToken, tinyPlano })
    });
    refreshContas();
    setIsTokenSalvo(true);
    alert('Configurações do Tiny salvas no banco de dados!');
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
      refreshContas();
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

  const adicionarFaixaAtacado = () => {
    const minQtd = Number(novaFaixaMinQtd);
    const desconto = Number(novaFaixaDesconto);
    if (!minQtd || minQtd < 2) return alert('A quantidade mínima deve ser maior que 1.');
    if (!desconto || desconto <= 0 || desconto >= 100) return alert('O desconto deve ser entre 0% e 100%.');
    if (faixasAtacado.length >= 5) return alert('Máximo de 5 faixas por produto (limite da API do ML).');
    if (faixasAtacado.some(f => f.minQtd === minQtd)) return alert('Já existe uma faixa com essa quantidade mínima.');
    const novasFaixas = [...faixasAtacado, { id: Date.now().toString(), minQtd, desconto }]
      .sort((a, b) => a.minQtd - b.minQtd);
    setFaixasAtacado(novasFaixas);
    setNovaFaixaMinQtd('');
    setNovaFaixaDesconto('');
  };

  const removerFaixaAtacado = (id) => setFaixasAtacado(prev => prev.filter(f => f.id !== id));

  const salvarAtacado = async () => {
    setSalvandoAtacado(true);
    try {
      const res = await fetch(`/api/usuario/${usuarioId}/config-atacado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: atacadoAtivo, faixas: faixasAtacado })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || `Erro ${res.status}`);
      }
      alert('Configuração de preço por quantidade salva!');
    } catch (e) {
      alert('Erro ao salvar configuração de atacado: ' + e.message);
    } finally {
      setSalvandoAtacado(false);
    }
  };

  const salvarCepOrigem = async () => {
    const cep = cepOrigem.replace(/\D/g, '');
    if (cep.length !== 8) return alert('Informe um CEP válido com 8 dígitos.');
    setSalvandoCep(true);
    try {
      const res = await fetch(`/api/usuario/${usuarioId}/cep-origem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cepOrigem: cep })
      });
      if (!res.ok) throw new Error((await res.json()).erro || `Erro ${res.status}`);
      alert('CEP de origem salvo!');
    } catch (e) {
      alert('Erro ao salvar CEP: ' + e.message);
    } finally {
      setSalvandoCep(false);
    }
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
        
        // 👇 FORÇA A CONTA A APARECER NA TELA IMEDIATAMENTE
        setContasML(prev => {
          const existe = prev.find(c => c.id === contaSalva.id);
          if (existe) return prev.map(c => c.id === contaSalva.id ? contaSalva : c);
          return [...prev, contaSalva];
        });

        await carregarConfig(usuarioId);
        alert('Conta do Mercado Livre conectada com sucesso!');
      } catch (e) { alert('Erro: ' + e.message); }
    })();
  }, [usuarioId]);

  // ===== SALVAR IMGUR =====
  const salvarImgur = async () => {
    if (!imgurClientId.trim()) return alert('Insira o Client ID do Imgur.');
    setSalvandoImgur(true);
    try {
      const res = await fetch(`/api/usuario/${usuarioId}/integracoes/imgur`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imgurClientId: imgurClientId.trim(), imgurClientSecret: imgurClientSecret.trim() })
      });
      if (!res.ok) throw new Error((await res.json()).erro || `Erro ${res.status}`);
      setImgurSalvo(true);
      alert('Credenciais do Imgur salvas com sucesso!');
    } catch (e) {
      alert('Erro ao salvar Imgur: ' + e.message);
    } finally {
      setSalvandoImgur(false);
    }
  };

  const editarImgur = () => {
    setImgurSalvo(false);
  };

  // ===== SALVAR REMOVE.BG =====
  const salvarRemoveBg = async () => {
    if (!removeBgApiKey.trim()) return alert('Insira a API Key do Remove.bg.');
    setSalvandoRemoveBg(true);
    try {
      const res = await fetch(`/api/usuario/${usuarioId}/integracoes/removebg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeBgApiKey: removeBgApiKey.trim() })
      });
      if (!res.ok) throw new Error((await res.json()).erro || `Erro ${res.status}`);
      setRemoveBgSalvo(true);
      alert('API Key do Remove.bg salva com sucesso!');
    } catch (e) {
      alert('Erro ao salvar Remove.bg: ' + e.message);
    } finally {
      setSalvandoRemoveBg(false);
    }
  };

  const editarRemoveBg = () => {
    setRemoveBgSalvo(false);
  };

  // ===== HANDLERS SUB-USUÁRIOS =====
  const carregarSubUsuarios = async () => {
    try {
      const res = await fetch('/api/sub-usuarios');
      if (!res.ok) return;
      const data = await res.json();
      setSubUsuarios(data);
    } catch (_) {}
  };

  useEffect(() => {
    if (role === 'OWNER') {
      carregarSubUsuarios();
      carregarStatusSuporte();
    }
  }, [role]);

  const abrirModalCriar = () => {
    setSubEmail(''); setSubSenha(''); setSubRole('OPERATOR'); setSubPermissoesCustom([]);
    setModalSubUser('criar');
  };

  const abrirModalEditar = (sub) => {
    setSubEmail(sub.email); setSubSenha(''); setSubRole(sub.role);
    setSubPermissoesCustom(sub.permissoesCustom || []);
    setModalSubUser(sub);
  };

  const fecharModal = () => setModalSubUser(null);

  const salvarSubUsuario = async () => {
    setSalvandoSub(true);
    try {
      if (modalSubUser === 'criar') {
        const res = await fetch('/api/sub-usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: subEmail, password: subSenha, role: subRole,
            permissoesCustom: subPermissoesCustom.length > 0 ? subPermissoesCustom : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.erro); return; }
        setSubUsuarios(prev => [...prev, data]);
      } else {
        const body = { role: subRole, permissoesCustom: subPermissoesCustom.length > 0 ? subPermissoesCustom : null };
        if (subSenha) body.password = subSenha;
        const res = await fetch(`/api/sub-usuarios/${modalSubUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.erro); return; }
        setSubUsuarios(prev => prev.map(s => s.id === data.id ? data : s));
      }
      fecharModal();
    } finally {
      setSalvandoSub(false);
    }
  };

  const toggleSubAtivo = async (sub) => {
    const res = await fetch(`/api/sub-usuarios/${sub.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !sub.ativo }),
    });
    if (res.ok) {
      const data = await res.json();
      setSubUsuarios(prev => prev.map(s => s.id === data.id ? data : s));
    }
  };

  const excluirSubUsuario = async (sub) => {
    if (!confirm(`Excluir sub-usuário "${sub.email}"?`)) return;
    const res = await fetch(`/api/sub-usuarios/${sub.id}`, { method: 'DELETE' });
    if (res.ok) setSubUsuarios(prev => prev.filter(s => s.id !== sub.id));
  };

  // ===== HANDLERS SUPORTE =====
  const carregarStatusSuporte = async () => {
    try {
      const res = await fetch('/api/usuario/suporte-status');
      if (!res.ok) return;
      const data = await res.json();
      setSuporteAtivo(data.suporteAtivo);
      setSuporteExpira(data.suporteExpira);
    } catch (_) {}
  };

  const toggleSuporteAcesso = async () => {
    setSalvandoSuporteToggle(true);
    try {
      const novoEstado = !suporteAtivo;
      const res = await fetch('/api/usuario/suporte-toggle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: novoEstado }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuporteAtivo(data.suporteAtivo);
        setSuporteExpira(data.suporteExpira);
      }
    } finally {
      setSalvandoSuporteToggle(false);
    }
  };

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
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex gap-4">
            <input 
              type="text" 
              value={tinyToken}
              onChange={(e) => {
                setTinyToken(e.target.value);
                setIsTokenSalvo(false);
              }}
              className="flex-1 px-3 py-2 border rounded-md"
              placeholder="Token API Tiny..."
            />
            <select
              title="Ajuste do Limite da API conforme o plano configurado do Tiny ERP"
              value={tinyPlano}
              onChange={(e) => {
                setTinyPlano(e.target.value);
                setIsTokenSalvo(false);
              }}
              className="w-48 px-3 py-2 border rounded-md bg-white"
            >
              <option value="comecar">Plano Começar (Sem API)</option>
              <option value="crescer">Plano Crescer (30 reqs/min)</option>
              <option value="evoluir">Plano Evoluir (60 reqs/min)</option>
              <option value="potencializar">Plano Potencializar (120 reqs/min)</option>
              <option value="descontinuado">Planos Descontinuados (20 reqs/min)</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button 
              onClick={salvarTokenTiny} 
              disabled={isTokenSalvo} 
              className="px-4 py-2 text-white rounded transition disabled:opacity-50"
              style={{ backgroundColor: c.orange }}
              onMouseOver={e => { if (!e.target.disabled) e.target.style.backgroundColor = c.orangeHover; }}
              onMouseOut={e => e.target.style.backgroundColor = c.orange}
            >
              {isTokenSalvo ? 'Salvo' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. CEP DE ORIGEM */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        <h4 className="text-lg font-bold" style={{ color: c.orange }}>CEP de Origem (Frete Grátis)</h4>
        <p className="text-xs mt-1 mb-4" style={{ color: c.muted }}>
          Informe o CEP do seu endereço de despacho. Ele é usado para simular o custo do frete grátis ao criar anúncios e verificar preços.
        </p>
        <div className="flex gap-4">
          <input
            type="text"
            value={cepOrigem}
            onChange={e => setCepOrigem(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="flex-1 px-3 py-2 border rounded-md"
            placeholder="Ex: 01001000"
            maxLength={8}
          />
          <button
            onClick={salvarCepOrigem}
            disabled={salvandoCep}
            className="px-4 py-2 text-white rounded transition disabled:opacity-60"
            style={{ backgroundColor: c.orange }}
            onMouseOver={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = c.orangeHover; }}
            onMouseOut={e => e.currentTarget.style.backgroundColor = c.orange}
          >
            {salvandoCep ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* 3. CONTAS MERCADO LIVRE */}
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

      {/* 4. MOTOR DE PRECIFICAÇÃO DINÂMICO */}
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

      {/* 5. PREÇOS POR QUANTIDADE (ATACADO) */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h4 className="text-lg font-bold" style={{ color: c.headingSub }}>Preços por Quantidade (Atacado)</h4>
            <p className="text-xs mt-1" style={{ color: c.muted }}>
              Configure faixas de desconto por quantidade. Disponível para compradores B2B no Mercado Livre.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm font-semibold" style={{ color: c.headingSub }}>
              {atacadoAtivo ? 'Habilitado' : 'Desabilitado'}
            </span>
            <div
              onClick={() => setAtacadoAtivo(p => !p)}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ backgroundColor: atacadoAtivo ? c.green : '#ccc', cursor: 'pointer' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ left: atacadoAtivo ? '22px' : '2px' }}
              />
            </div>
          </label>
        </div>

        {/* Adicionar faixa */}
        <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: '#fef5e7', border: '1px solid #f5d9a0' }}>
          <label className="text-sm font-bold mb-2 block" style={{ color: c.headingSub }}>Adicionar Faixa de Desconto</label>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold block mb-1" style={{ color: c.muted }}>Qtd. Mínima (unidades)</label>
              <input
                type="number" min="2" step="1"
                value={novaFaixaMinQtd}
                onChange={e => setNovaFaixaMinQtd(e.target.value)}
                placeholder="Ex: 5"
                className="w-full px-3 py-2 border rounded-md text-sm"
                style={{ border: `1px solid ${c.orange}40` }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold block mb-1" style={{ color: c.muted }}>Desconto (%)</label>
              <input
                type="number" min="0.1" max="99" step="0.1"
                value={novaFaixaDesconto}
                onChange={e => setNovaFaixaDesconto(e.target.value)}
                placeholder="Ex: 10"
                className="w-full px-3 py-2 border rounded-md text-sm"
                style={{ border: `1px solid ${c.orange}40` }}
              />
            </div>
            <button
              onClick={adicionarFaixaAtacado}
              disabled={faixasAtacado.length >= 5}
              className="px-4 py-2 text-white font-bold rounded text-sm transition disabled:opacity-50"
              style={{ backgroundColor: c.orange }}
              onMouseOver={e => { if (!e.target.disabled) e.target.style.backgroundColor = c.orangeHover; }}
              onMouseOut={e => e.target.style.backgroundColor = c.orange}
            >
              + Adicionar
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: c.muted }}>
            Máximo de 5 faixas. O desconto é aplicado sobre o <strong>preço final de venda</strong> (com promoção ativa, se houver).
          </p>
        </div>

        {/* Lista de faixas */}
        {faixasAtacado.length === 0 ? (
          <p className="text-sm" style={{ color: c.muted }}>Nenhuma faixa cadastrada ainda.</p>
        ) : (
          <div className="rounded-lg overflow-hidden border mb-4" style={{ borderColor: c.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold uppercase" style={{ backgroundColor: '#f5f6f7', color: c.muted }}>
                  <th className="p-3 text-left">A partir de</th>
                  <th className="p-3 text-left">Desconto</th>
                  <th className="p-3 text-left">Exemplo (preço R$ 100)</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {faixasAtacado.map((f) => (
                  <tr key={f.id} className="border-t" style={{ borderColor: c.border }}>
                    <td className="p-3 font-bold" style={{ color: c.headingSub }}>{f.minQtd} unidades</td>
                    <td className="p-3 font-bold" style={{ color: c.green }}>-{f.desconto}%</td>
                    <td className="p-3 text-xs" style={{ color: c.muted }}>
                      R$ {(100 * (1 - f.desconto / 100)).toFixed(2).replace('.', ',')} por unidade
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => removerFaixaAtacado(f.id)}
                        className="text-xs font-bold px-2 py-1 rounded"
                        style={{ color: c.red, backgroundColor: '#fce4e4' }}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={salvarAtacado}
            disabled={salvandoAtacado}
            className="px-6 py-2 text-white font-bold rounded shadow transition disabled:opacity-60"
            style={{ backgroundColor: c.green }}
            onMouseOver={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = c.greenHover; }}
            onMouseOut={e => e.currentTarget.style.backgroundColor = c.green}
          >
            {salvandoAtacado ? 'Salvando...' : 'Salvar Configuração de Atacado'}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 6. IMGUR — HOSPEDAGEM DE IMAGENS                                 */}
      {/* ================================================================ */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-1">
          <img
            src="https://s.imgur.com/images/favicon-96x96.png"
            alt="Imgur"
            className="w-7 h-7 rounded"
            onError={e => { e.target.style.display = 'none'; }}
          />
          <h4 className="text-lg font-bold" style={{ color: c.orange }}>Imgur — Hospedagem de Imagens</h4>
          {imgurSalvo && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' }}
            >
              ✓ Configurado
            </span>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: c.muted }}>
          O Imgur permite fazer upload e hospedar imagens de forma gratuita. As imagens hospedadas podem ser usadas
          diretamente nos anúncios do Mercado Livre. Crie seu app em{' '}
          <a
            href="https://api.imgur.com/oauth2/addclient"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: c.orange }}
            className="hover:underline"
          >
            api.imgur.com/oauth2/addclient
          </a>{' '}
          e copie as credenciais abaixo.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client ID */}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: c.headingSub }}>
              Client ID <span style={{ color: c.red }}>*</span>
            </label>
            <input
              type="text"
              value={imgurClientId}
              onChange={e => { setImgurClientId(e.target.value); setImgurSalvo(false); }}
              disabled={imgurSalvo}
              placeholder="Ex: a1b2c3d4e5f6789"
              className="w-full px-3 py-2 border rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-400"
              style={{ border: `1px solid ${c.border}` }}
            />
            <p className="text-xs mt-1" style={{ color: c.muted }}>
              Obrigatório. Usado para fazer upload sem autenticação OAuth.
            </p>
          </div>

          {/* Client Secret */}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: c.headingSub }}>
              Client Secret <span style={{ color: c.muted }}>(opcional)</span>
            </label>
            <input
              type="password"
              value={imgurClientSecret}
              onChange={e => { setImgurClientSecret(e.target.value); setImgurSalvo(false); }}
              disabled={imgurSalvo}
              placeholder="Ex: abc123def456..."
              className="w-full px-3 py-2 border rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-400"
              style={{ border: `1px solid ${c.border}` }}
            />
            <p className="text-xs mt-1" style={{ color: c.muted }}>
              Necessário apenas para upload autenticado em conta pessoal.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          {imgurSalvo && (
            <button
              onClick={editarImgur}
              className="px-4 py-2 font-bold rounded transition text-sm"
              style={{ color: c.orange, backgroundColor: '#fef5e7', border: `1px solid ${c.orange}40` }}
            >
              ✏️ Editar
            </button>
          )}
          <button
            onClick={salvarImgur}
            disabled={salvandoImgur || imgurSalvo}
            className="px-6 py-2 text-white font-bold rounded shadow transition text-sm disabled:opacity-60"
            style={{ backgroundColor: c.orange }}
            onMouseOver={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = c.orangeHover; }}
            onMouseOut={e => e.currentTarget.style.backgroundColor = c.orange}
          >
            {salvandoImgur ? 'Salvando...' : imgurSalvo ? '✓ Salvo' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 7. REMOVE.BG — REMOÇÃO DE FUNDO DE IMAGENS                       */}
      {/* ================================================================ */}
      <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-black"
            style={{ backgroundColor: '#6c47ff' }}
          >
            rb
          </div>
          <h4 className="text-lg font-bold" style={{ color: c.orange }}>Remove.bg — Remoção de Fundo</h4>
          {removeBgSalvo && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' }}
            >
              ✓ Configurado
            </span>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: c.muted }}>
          O Remove.bg remove automaticamente o fundo de imagens de produtos usando inteligência artificial.
          Crie sua conta e obtenha sua API Key em{' '}
          <a
            href="https://www.remove.bg/pt-br/api"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: c.orange }}
            className="hover:underline"
          >
            remove.bg/pt-br/api
          </a>
          . O plano gratuito oferece 50 créditos/mês (1 crédito = 1 imagem).
        </p>

        {/* Aviso de créditos */}
        <div
          className="flex items-start gap-3 p-3 rounded-lg mb-4 text-xs"
          style={{ backgroundColor: '#fff8e1', border: '1px solid #ffe082', color: '#7a5c00' }}
        >
          <span className="text-base">💡</span>
          <span>
            Cada remoção de fundo consome <strong>1 crédito</strong>. Monitore seu saldo em{' '}
            <a
              href="https://www.remove.bg/pt-br/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: c.orange }}
              className="hover:underline"
            >
              remove.bg/dashboard
            </a>
            .
          </span>
        </div>

        {/* Campo API Key */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: c.headingSub }}>
            API Key <span style={{ color: c.red }}>*</span>
          </label>
          <input
            type="password"
            value={removeBgApiKey}
            onChange={e => { setRemoveBgApiKey(e.target.value); setRemoveBgSalvo(false); }}
            disabled={removeBgSalvo}
            placeholder="Ex: aBcDeFgHiJkLmNoPqRsTuVwXyZ"
            className="w-full px-3 py-2 border rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-400"
            style={{ border: `1px solid ${c.border}` }}
          />
          <p className="text-xs mt-1" style={{ color: c.muted }}>
            Encontre sua API Key em: remove.bg → Dashboard → API Keys.
          </p>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          {removeBgSalvo && (
            <button
              onClick={editarRemoveBg}
              className="px-4 py-2 font-bold rounded transition text-sm"
              style={{ color: c.orange, backgroundColor: '#fef5e7', border: `1px solid ${c.orange}40` }}
            >
              ✏️ Editar
            </button>
          )}
          <button
            onClick={salvarRemoveBg}
            disabled={salvandoRemoveBg || removeBgSalvo}
            className="px-6 py-2 text-white font-bold rounded shadow transition text-sm disabled:opacity-60"
            style={{ backgroundColor: c.orange }}
            onMouseOver={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = c.orangeHover; }}
            onMouseOut={e => e.currentTarget.style.backgroundColor = c.orange}
          >
            {salvandoRemoveBg ? 'Salvando...' : removeBgSalvo ? '✓ Salvo' : 'Salvar'}
          </button>
        </div>
      </div>


    {/* ================================================================
        SEÇÃO: CONTROLE DE USUÁRIOS (apenas OWNER)
        ================================================================ */}
    {role === 'OWNER' && (
      <>
        {/* SUB-USUÁRIOS */}
        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: c.heading }}>Sub-usuários</h2>
              <p className="text-sm mt-1" style={{ color: c.muted }}>
                Crie usuários adicionais para sua equipe. Eles compartilham os mesmos dados da conta.
              </p>
            </div>
            <button
              onClick={abrirModalCriar}
              className="px-4 py-2 text-white font-bold rounded shadow text-sm"
              style={{ backgroundColor: c.orange }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = c.orangeHover}
              onMouseOut={e => e.currentTarget.style.backgroundColor = c.orange}
            >
              + Adicionar
            </button>
          </div>

          {subUsuarios.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: c.muted }}>
              Nenhum sub-usuário cadastrado.
            </p>
          ) : (
            <div className="space-y-2">
              {subUsuarios.map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-md" style={{ border: `1px solid ${c.border}`, backgroundColor: '#f9f9f9' }}>
                  <div className="flex items-center gap-3">
                    <span style={{
                      fontSize: '0.7em', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                      backgroundColor: sub.role === 'OPERATOR' ? '#eaf4fb' : '#f0f4c3',
                      color: sub.role === 'OPERATOR' ? '#2980b9' : '#827717',
                    }}>
                      {sub.role === 'OPERATOR' ? 'Operador' : 'Visualizador'}
                    </span>
                    <span className="text-sm font-medium" style={{ color: c.headingSub }}>{sub.email}</span>
                    {!sub.ativo && (
                      <span style={{ fontSize: '0.7em', color: '#c0392b', fontWeight: 700 }}>INATIVO</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => abrirModalEditar(sub)}
                      className="px-3 py-1 text-xs font-bold rounded"
                      style={{ color: c.orange, border: `1px solid ${c.orange}40`, backgroundColor: '#fef5e7' }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleSubAtivo(sub)}
                      className="px-3 py-1 text-xs font-bold rounded"
                      style={{ color: sub.ativo ? '#c0392b' : c.green, border: `1px solid ${sub.ativo ? '#c0392b' : c.green}40`, backgroundColor: sub.ativo ? '#fdf2f2' : '#eafaf1' }}
                    >
                      {sub.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => excluirSubUsuario(sub)}
                      className="px-3 py-1 text-xs font-bold rounded"
                      style={{ color: '#c0392b', border: '1px solid #c0392b40', backgroundColor: '#fdf2f2' }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Perfis resumo */}
          <div className="mt-4 p-3 rounded text-xs" style={{ backgroundColor: '#f4f6f8', color: c.muted }}>
            <strong style={{ color: c.headingSub }}>Perfis disponíveis:</strong>
            {' '}
            <strong>Operador</strong> — acesso a todas as telas exceto Configurações e Cliente API.
            {' · '}
            <strong>Visualizador</strong> — acesso somente leitura às telas principais.
          </div>
        </div>

        {/* ACESSO DE SUPORTE */}
        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.border}` }}>
          <h2 className="text-lg font-bold mb-1" style={{ color: c.heading }}>Acesso de Suporte</h2>
          <p className="text-sm mb-4" style={{ color: c.muted }}>
            Permite que a equipe de suporte acesse sua conta temporariamente para resolver problemas.
            O acesso expira automaticamente em <strong>24 horas</strong>.
          </p>
          <div className="flex items-center justify-between p-4 rounded-lg" style={{ border: `1px solid ${suporteAtivo ? '#27ae60' : c.border}`, backgroundColor: suporteAtivo ? '#eafaf1' : '#f9f9f9' }}>
            <div>
              <p className="font-bold text-sm" style={{ color: suporteAtivo ? c.green : c.headingSub }}>
                {suporteAtivo ? '✓ Acesso de suporte ATIVO' : 'Acesso de suporte inativo'}
              </p>
              {suporteAtivo && suporteExpira && (
                <p className="text-xs mt-1" style={{ color: c.muted }}>
                  Expira em: {new Date(suporteExpira).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <button
              onClick={toggleSuporteAcesso}
              disabled={salvandoSuporteToggle}
              className="px-5 py-2 text-white font-bold rounded text-sm disabled:opacity-60"
              style={{ backgroundColor: suporteAtivo ? '#c0392b' : c.green }}
              onMouseOver={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = suporteAtivo ? '#e74c3c' : c.greenHover; }}
              onMouseOut={e => e.currentTarget.style.backgroundColor = suporteAtivo ? '#c0392b' : c.green}
            >
              {salvandoSuporteToggle ? 'Salvando...' : suporteAtivo ? 'Revogar acesso' : 'Permitir acesso (24h)'}
            </button>
          </div>
        </div>
      </>
    )}

    {/* MODAL SUB-USUÁRIO */}
    {modalSubUser && (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '28px', width: '420px', maxWidth: '90vw', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}>
          <h3 className="text-lg font-bold mb-4" style={{ color: c.heading }}>
            {modalSubUser === 'criar' ? 'Novo Sub-usuário' : `Editar: ${modalSubUser.email}`}
          </h3>

          {modalSubUser === 'criar' && (
            <div className="mb-3">
              <label className="text-xs font-bold block mb-1" style={{ color: c.headingSub }}>E-mail</label>
              <input
                type="email"
                value={subEmail}
                onChange={e => setSubEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                style={{ border: `1px solid ${c.border}` }}
                placeholder="usuario@empresa.com"
              />
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-bold block mb-1" style={{ color: c.headingSub }}>
              Senha{modalSubUser !== 'criar' && ' (deixe em branco para manter)'}
            </label>
            <input
              type="password"
              value={subSenha}
              onChange={e => setSubSenha(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              style={{ border: `1px solid ${c.border}` }}
              placeholder={modalSubUser === 'criar' ? 'Mínimo 6 caracteres' : '••••••••'}
            />
          </div>

          <div className="mb-4">
            <label className="text-xs font-bold block mb-1" style={{ color: c.headingSub }}>Perfil</label>
            <select
              value={subRole}
              onChange={e => setSubRole(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              style={{ border: `1px solid ${c.border}` }}
            >
              <option value="OPERATOR">Operador — todas as telas exceto Configurações</option>
              <option value="VIEWER">Visualizador — apenas telas de consulta</option>
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={fecharModal}
              className="px-4 py-2 text-sm font-bold rounded"
              style={{ color: c.muted, border: `1px solid ${c.border}` }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarSubUsuario}
              disabled={salvandoSub}
              className="px-5 py-2 text-white text-sm font-bold rounded disabled:opacity-60"
              style={{ backgroundColor: c.orange }}
            >
              {salvandoSub ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}
