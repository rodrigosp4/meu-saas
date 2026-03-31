import { useState, useEffect, useRef } from 'react';
import { ModalPreenchimentoRapido } from './CompatibilidadeAutopecas';
import { useDraftManager, formatarDataDraft } from '../hooks/useDraftManager';

// Extrai o ID de um anúncio/produto ML a partir de uma URL ou ID direto
// Retorna { tipo: 'item' | 'produto', id: 'MLB...' | 'MLBU...' , itemId?: 'MLB...' }
function extrairId(input) {
  if (!input) return null;
  const s = input.trim();

  // ID direto item: MLB6429235734
  if (/^MLB\d+$/i.test(s)) return { tipo: 'item', id: s.toUpperCase() };
  // ID direto produto catálogo usuário: MLBU3641853473
  if (/^MLBU\d+$/i.test(s)) return { tipo: 'produto', id: s.toUpperCase() };

  // 1º TIPO CATÁLOGO: URL com /p/MLB... (Produto de Catálogo Geral)
  const catProdPath = s.match(/\/p\/(MLB\d+)/i);
  if (catProdPath) {
    const id = catProdPath[1].toUpperCase();
    const queryItem =
      s.match(/item_id[:%]3A(MLB\d+)/i) ||
      s.match(/item_id:(MLB\d+)/i) ||
      s.match(/[?&#]wid=(MLB\d+)/i) ||
      s.match(/[?&#]sid=(MLB\d+)/i);
    const itemId = queryItem ? queryItem[1].toUpperCase() : null;
    return { tipo: 'produto', id, itemId };
  }

  // 2º TIPO CATÁLOGO: URL tipo /up/MLBU... (Produto Catálogo Usuário)
  const prodUrl = s.match(/\/up\/(MLBU\d+)/i);
  if (prodUrl) {
    const id = prodUrl[1].toUpperCase();
    const queryItem =
      s.match(/item_id[:%]3A(MLB\d+)/i) ||
      s.match(/item_id:(MLB\d+)/i) ||
      s.match(/[?&#]wid=(MLB\d+)/i) ||
      s.match(/[?&#]sid=(MLB\d+)/i);
    const itemId = queryItem ? queryItem[1].toUpperCase() : null;
    return { tipo: 'produto', id, itemId };
  }

  // ID de produto no path: /MLBU3641853473
  const prodPath = s.match(/\/(MLBU\d+)/i);
  if (prodPath) return { tipo: 'produto', id: prodPath[1].toUpperCase() };

  // URL com traço item: MLB-6429235734
  const itemTracao = s.match(/MLB-(\d+)/i);
  if (itemTracao) return { tipo: 'item', id: `MLB${itemTracao[1]}` };

  // item_id:MLB... nos query params — prioridade menor
  const queryItem = s.match(/item_id[:%]3A(MLB\d+)/i) || s.match(/item_id:(MLB\d+)/i);
  if (queryItem) return { tipo: 'item', id: queryItem[1].toUpperCase() };

  return null;
}

// Extrai dimensões do atributo shipping.dimensions ("30x55x15,8000")
function parseDimensions(dimStr) {
  if (!dimStr) return { altura: '', largura: '', comprimento: '', pesoG: '' };
  const [dims, peso] = dimStr.split(',');
  const parts = dims ? dims.split('x') : [];
  return {
    altura: parts[0] || '',
    largura: parts[1] || '',
    comprimento: parts[2] || '',
    pesoG: peso || '',
  };
}

// Pega dimensões de atributos SELLER_PACKAGE_*
function dimDeAtributos(attrs) {
  const get = (id) => {
    const a = attrs.find(a => a.id === id);
    return a?.values?.[0]?.struct?.number || a?.values?.[0]?.name?.replace(/[^\d.]/g, '') || '';
  };
  return {
    altura: get('SELLER_PACKAGE_HEIGHT'),
    largura: get('SELLER_PACKAGE_WIDTH'),
    comprimento: get('SELLER_PACKAGE_LENGTH'),
    pesoG: get('SELLER_PACKAGE_WEIGHT'),
  };
}

const ATTRS_OCULTOS = new Set([
  'SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_WEIGHT',
  'PACKAGE_HEIGHT', 'PACKAGE_WIDTH', 'PACKAGE_LENGTH', 'PACKAGE_WEIGHT',
  'SHIPMENT_PACKING', 'PRODUCT_FEATURES',
]);

const POSICOES_AUTOPECA = [
  'Dianteira', 'Traseira', 'Esquerda', 'Direita',
  'Superior', 'Inferior', 'Interno', 'Externo', 'Central',
  'Dianteira Esquerda', 'Dianteira Direita', 'Traseira Esquerda', 'Traseira Direita',
];


// Combobox: permite selecionar da lista OU digitar valor personalizado
function ComboboxAttr({ attr, idx, atributos, setAtributos, inputStyle }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(attr.value_name || '');
  const containerRef = useRef(null);

  // Sincroniza search quando value_name muda externamente
  useEffect(() => { setSearch(attr.value_name || ''); }, [attr.value_name]);

  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = attr.values.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        type="text"
        value={search}
        placeholder="Selecione ou digite..."
        onChange={e => {
          const val = e.target.value;
          setSearch(val);
          const next = [...atributos];
          next[idx] = { ...attr, value_name: val, value_id: '' };
          setAtributos(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '2px' }}>
          {filtered.map(v => (
            <div
              key={v.id}
              onMouseDown={() => {
                setSearch(v.name);
                const next = [...atributos];
                next[idx] = { ...attr, value_id: String(v.id), value_name: v.name };
                setAtributos(next);
                setOpen(false);
              }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.84em', color: '#374151', borderBottom: '1px solid #f1f5f9', backgroundColor: String(v.id) === attr.value_id ? '#eff6ff' : '#fff' }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = String(v.id) === attr.value_id ? '#eff6ff' : '#fff'}
            >
              {v.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReplicadorAnuncio({ usuarioId }) {
  const [urlAnuncio, setUrlAnuncio] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('geral');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [loadingDimTiny, setLoadingDimTiny] = useState(false);
  const [dadosOriginais, setDadosOriginais] = useState(null);
  const veioDeRecomendacoesRef = useRef(false);
  const skuRecomendadoRef = useRef(null);
  const [replicando, setReplicando] = useState(false);

  // Geral
  const [titulo, setTitulo] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');
  const [novoSku, setNovoSku] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  // Variações
  const [variacoes, setVariacoes] = useState([]); // array de variações editáveis

  // Dimensões
  const [altura, setAltura] = useState('');
  const [largura, setLargura] = useState('');
  const [comprimento, setComprimento] = useState('');
  const [pesoG, setPesoG] = useState('');

  // Descrição
  const [descricao, setDescricao] = useState('');

  // Imagens: array de URLs, Set de selecionadas
  const [imagens, setImagens] = useState([]);
  const [imagensSelecionadas, setImagensSelecionadas] = useState(new Set());
  const [uploadandoImagem, setUploadandoImagem] = useState(false);
  const fileInputRefRep = useRef(null);

  // Atributos (ficha técnica)
  const [atributos, setAtributos] = useState([]);

  // Categoria
  const [categoriaId, setCategoriaId] = useState('');
  const [categoriaSugerida, setCategoriaSugerida] = useState(false);
  const [categoriaOpcoes, setCategoriaOpcoes] = useState([]);
  const [categoriaInput, setCategoriaInput] = useState('');
  const [carregandoCategoria, setCarregandoCategoria] = useState(false);
  const [categoriaFullPath, setCategoriaFullPath] = useState('');
  const [categoriaDomainName, setCategoriaDomainName] = useState('');

  // Navegação de categoria (modal árvore)
  const [isModalCatOpen, setIsModalCatOpen] = useState(false);
  const [categoryTree, setCategoryTree] = useState([]);
  const [isLoadingCat, setIsLoadingCat] = useState(false);
  const [categoryDump, setCategoryDump] = useState(null);
  const [searchCatTerm, setSearchCatTerm] = useState('');
  const [searchCatResults, setSearchCatResults] = useState([]);
  // Árvore inline expandível
  const [catChildrenMap, setCatChildrenMap] = useState({});
  const [catExpanded, setCatExpanded] = useState(new Set());
  const [catLoadingIds, setCatLoadingIds] = useState(new Set());

  // Contas do usuário
  const [contasML, setContasML] = useState([]);
  const [contasSelecionadas, setContasSelecionadas] = useState(new Set());
  const [tiposPorConta, setTiposPorConta] = useState({});

  const getTiposConta = (contaId) => tiposPorConta[contaId] || { classico: true, premium: false };
  const toggleTipoConta = (contaId, tipo) => {
    setTiposPorConta(prev => {
      const curr = prev[contaId] || { classico: true, premium: false };
      return { ...prev, [contaId]: { ...curr, [tipo]: !curr[tipo] } };
    });
  };

  // Opções adicionais
  const [permitirRetirada, setPermitirRetirada] = useState(false);
  const [prazoFabricacao, setPrazoFabricacao] = useState('');

  // Produto vinculado
  const [buscaProduto, setBuscaProduto] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [produtoVinculado, setProdutoVinculado] = useState(null);
  const [regrasPreco, setRegrasPreco] = useState([]);
  const [regraPrecoId, setRegraPrecoId] = useState('preco_venda');
  const buscaRef = useRef(null);

  // Promoções e Atacado
  const [ativarPromocoes, setAtivarPromocoes] = useState(false);
  const [toleranciaPromo, setTolercanciaPromo] = useState(0);
  const [enviarAtacado, setEnviarAtacado] = useState(false);
  const [configAtacado, setConfigAtacado] = useState(null);
  const [inflarPct, setInflarPct] = useState(0);
  const [reduzirPct, setReduzirPct] = useState(0);

  // Simulação de preço por canal
  const [precosSimulados, setPrecosSimulados] = useState({});
  const [isCalculandoSimulacao, setIsCalculandoSimulacao] = useState(false);

  // Autopeças
  const [perfisCompat, setPerfisCompat] = useState([]);
  const [perfilCompatId, setPerfilCompatId] = useState('');
  const [perfilCompatData, setPerfilCompatData] = useState(null);
  const [posicoesSelecionadas, setPosicoesSelecionadas] = useState(new Set());
  const [compatRapida, setCompatRapida] = useState(null);
  const [modalPreenchRapido, setModalPreenchRapido] = useState(false);

  // Modo principal
  const [modoAtivo, setModoAtivo] = useState('replicar'); // 'replicar' | 'recomendacoes' | 'rascunhos'

  // Rascunhos
  const { drafts, salvarDraft, excluirDraft } = useDraftManager();
  const draftIdRef = useRef(null);
  const timerRascunho = useRef(null);
  const rascunhosReplicar = drafts.filter(d => d.tipo === 'replicar');

  // Recomendações
  const [recomendacoes, setRecomendacoes] = useState([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [erroRec, setErroRec] = useState('');
  const [recBuscado, setRecBuscado] = useState(false);
  const [filtrarSemEstoque, setFiltrarSemEstoque] = useState(false);

  const cargaInicialConcluida = useRef(false);

  const carregarRascunhoReplicar = (draft) => {
    setUrlAnuncio(draft.urlAnuncio || '');
    setTitulo(draft.titulo || '');
    setPrecoVenda(draft.precoVenda || '');
    setNovoSku(draft.novoSku || '');
    setQuantidade(draft.quantidade || '1');
    setAltura(draft.altura || '');
    setLargura(draft.largura || '');
    setComprimento(draft.comprimento || '');
    setPesoG(draft.pesoG || '');
    setDescricao(draft.descricao || '');
    if (Array.isArray(draft.imagens)) setImagens(draft.imagens);
    if (Array.isArray(draft.imagensSelecionadas)) setImagensSelecionadas(new Set(draft.imagensSelecionadas));
    if (Array.isArray(draft.atributos)) setAtributos(draft.atributos);
    setCategoriaId(draft.categoriaId || '');
    setCategoriaFullPath(draft.categoriaFullPath || '');
    setCategoriaDomainName(draft.categoriaDomainName || '');
    if (Array.isArray(draft.contasSelecionadas)) setContasSelecionadas(new Set(draft.contasSelecionadas));
    if (draft.tiposPorConta) setTiposPorConta(draft.tiposPorConta);
    setAtivarPromocoes(draft.ativarPromocoes || false);
    setTolercanciaPromo(draft.toleranciaPromo || 0);
    setEnviarAtacado(draft.enviarAtacado || false);
    setInflarPct(draft.inflarPct || 0);
    setReduzirPct(draft.reduzirPct || 0);
    setPermitirRetirada(draft.permitirRetirada || false);
    setPrazoFabricacao(draft.prazoFabricacao || '');
    draftIdRef.current = draft.id;
    setModoAtivo('replicar');
  };

  // Aplica rascunho pendente (vindo do PainelRascunhos) no mount
  useEffect(() => {
    try {
      const pd = JSON.parse(localStorage.getItem('ml_pending_draft') || 'null');
      if (pd?.tipo === 'replicar') {
        carregarRascunhoReplicar(pd);
        localStorage.removeItem('ml_pending_draft');
      }
    } catch (_) {}
  }, []);

  // Carrega contas, regras de preço e perfis de compatibilidade
  useEffect(() => {
    if (!usuarioId) return;
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.contasML)) setContasML(data.contasML);
        if (Array.isArray(data.regrasPreco)) setRegrasPreco(data.regrasPreco);
        if (data.configAtacado) setConfigAtacado(data.configAtacado);
      })
      .catch(() => {});
    fetch(`/api/compat/perfis?userId=${usuarioId}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setPerfisCompat(data); })
      .catch(() => {});
  }, [usuarioId]);

  // Auto-save rascunho com debounce de 1.5s (só após carga inicial concluída)
  useEffect(() => {
    if (!cargaInicialConcluida.current || !titulo || !draftIdRef.current) return;
    clearTimeout(timerRascunho.current);
    timerRascunho.current = setTimeout(() => {
      salvarDraft({
        id: draftIdRef.current,
        tipo: 'replicar',
        titulo,
        urlAnuncio,
        precoVenda,
        novoSku,
        quantidade,
        altura,
        largura,
        comprimento,
        pesoG,
        descricao,
        imagens,
        imagensSelecionadas: [...imagensSelecionadas],
        atributos,
        categoriaId,
        categoriaFullPath,
        categoriaDomainName,
        contasSelecionadas: [...contasSelecionadas],
        tiposPorConta,
        ativarPromocoes,
        toleranciaPromo,
        enviarAtacado,
        inflarPct,
        reduzirPct,
        permitirRetirada,
        prazoFabricacao,
      });
    }, 1500);
    return () => clearTimeout(timerRascunho.current);
  }, [
    dadosOriginais, titulo, precoVenda, novoSku, quantidade,
    altura, largura, comprimento, pesoG, descricao,
    imagens, imagensSelecionadas, atributos,
    categoriaId, categoriaFullPath, categoriaDomainName,
    contasSelecionadas, tiposPorConta,
    ativarPromocoes, toleranciaPromo, enviarAtacado, inflarPct, reduzirPct,
    permitirRetirada, prazoFabricacao,
  ]);

  // Refresh do token ML (idêntico ao CriarAnuncio)
  const refreshTokenIfNeeded = async (conta) => {
    if (!conta) return null;
    if (conta.accessToken && conta.accessToken.length > 10) return conta.accessToken;
    try {
      const res = await fetch('/api/ml/refresh-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...conta, userId: usuarioId }),
      });
      if (!res.ok) return conta.accessToken || null;
      const data = await res.json();
      return data.access_token || conta.accessToken || null;
    } catch { return conta.accessToken || null; }
  };

  // Calcula preço detalhado por conta e canal — idêntico ao CriarAnuncio (por conta)
  const calcularPrecoDetalhado = async (produto, tipoCalc, conta) => {
    if (!produto || !conta) return null;
    const dados = produto.dadosTiny || {};
    const pVenda = Number(dados.preco || produto.preco || 0);
    const pPromo = Number(dados.preco_promocional || 0);
    const pCusto = Number(dados.preco_custo || 0);

    if (regraPrecoId === 'manual') return null;

    if (regraPrecoId === 'preco_venda') {
      if (!pVenda) return null;
      return { precoFinal: pVenda, historico: [{ descricao: 'Preço de Venda (ERP)', valor: pVenda, tipo: 'valor' }] };
    }
    if (regraPrecoId === 'preco_promocional') {
      const precoFinal = pPromo > 0 ? pPromo : pVenda;
      if (!precoFinal) return null;
      return { precoFinal, historico: [{ descricao: pPromo > 0 ? 'Preço Promocional (ERP)' : 'Preço de Venda (ERP)', valor: precoFinal, tipo: 'valor' }] };
    }

    const regra = regrasPreco.find(r => r.id === regraPrecoId);
    if (!regra) return null;

    const tipoBase = regra.precoBase || 'promocional';
    let custoBase = tipoBase === 'venda' ? pVenda
      : tipoBase === 'custo' ? (pCusto > 0 ? pCusto : pVenda)
      : (pPromo > 0 ? pPromo : pVenda);
    if (!custoBase || custoBase <= 0) return null;

    let historico = [{ descricao: `Preço Base (${tipoBase.toUpperCase()})`, valor: custoBase, tipo: 'valor' }];
    let valorAtualCusto = custoBase;
    let totalTaxasVendaPerc = 0;
    let historicoCustos = [];
    let historicoTaxasVenda = [];

    (regra.variaveis || []).forEach(v => {
      if (v.tipo === 'fixo_custo') {
        valorAtualCusto += Number(v.valor || 0);
        historicoCustos.push({ descricao: v.nome, valor: Number(v.valor || 0), tipo: 'custo' });
      } else if (v.tipo === 'perc_custo') {
        const calcVal = valorAtualCusto * (Number(v.valor || 0) / 100);
        valorAtualCusto += calcVal;
        historicoCustos.push({ descricao: v.nome, valor: calcVal, isPerc: true, originalPerc: v.valor, tipo: 'custo' });
      } else if (v.tipo === 'perc_venda') {
        totalTaxasVendaPerc += Number(v.valor || 0);
        historicoTaxasVenda.push({ descricao: v.nome, originalPerc: v.valor, tipo: 'taxa_venda' });
      }
    });

    const tarifaMLPerc = tipoCalc === 'premium' ? 16 : 11;
    const netFactor = 1 - ((tarifaMLPerc + totalTaxasVendaPerc) / 100);
    if (netFactor <= 0) return { precoFinal: valorAtualCusto, historico };

    let precoAlvo = (valorAtualCusto + 6) / netFactor;
    let precoFinal = inflarPct > 0 ? precoAlvo / (1 - inflarPct / 100) : precoAlvo;
    let custoFreteML = 0;
    let freteAplicado = false;
    let foiReduzido = false;

    const catId = categoriaId || dadosOriginais?.category_id;

    // Simula frete com o token da própria conta (igual ao CriarAnuncio)
    if (precoFinal >= 79 && conta.envioSuportado !== 'ME1' && catId && altura && largura && comprimento && pesoG) {
      try {
        const token = await refreshTokenIfNeeded(conta);
        const dimStr = `${Math.round(Number(altura))}x${Math.round(Number(largura))}x${Math.round(Number(comprimento))},${Math.round(Number(pesoG))}`;
        for (let i = 0; i < 3; i++) {
          const res = await fetch('/api/ml/simulate-shipping', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: token, sellerId: conta.id, itemPrice: precoFinal,
              categoryId: catId, listingTypeId: tipoCalc === 'premium' ? 'gold_pro' : 'gold_special',
              dimensions: dimStr,
            }),
          });
          const data = await res.json();
          custoFreteML = data.cost || 0;
          const nAlvo = (valorAtualCusto + custoFreteML) / netFactor;
          const nFinal = inflarPct > 0 ? nAlvo / (1 - inflarPct / 100) : nAlvo;
          if (Math.abs(nFinal - precoFinal) < 0.1) { precoFinal = nFinal; precoAlvo = nAlvo; break; }
          precoFinal = nFinal; precoAlvo = nAlvo;
        }
      } catch {
        custoFreteML = 35;
        precoAlvo = (valorAtualCusto + custoFreteML) / netFactor;
        precoFinal = inflarPct > 0 ? precoAlvo / (1 - inflarPct / 100) : precoAlvo;
      }
    }

    if (precoFinal >= 79) {
      freteAplicado = true;
      if (reduzirPct > 0 && precoFinal * (1 - reduzirPct / 100) <= 78.99) {
        precoFinal = 78.99;
        precoAlvo = inflarPct > 0 ? precoFinal * (1 - inflarPct / 100) : precoFinal;
        foiReduzido = true;
        freteAplicado = false;
      }
    }

    precoAlvo = Math.round(precoAlvo * 100) / 100;
    precoFinal = Math.round(precoFinal * 100) / 100;

    historico = [...historico, ...historicoCustos];
    if (freteAplicado && custoFreteML > 0) historico.push({ descricao: 'Frete Grátis (ML)', valor: custoFreteML, tipo: 'custo_ml' });
    if (!freteAplicado && !foiReduzido) historico.push({ descricao: 'Custo Fixo (ML)', valor: 6.00, tipo: 'custo_ml' });
    if (conta.envioSuportado === 'ME1' && precoFinal >= 79) historico.push({ descricao: 'Frete Grátis (Isento via ME1)', valor: 0, tipo: 'custo_ml' });
    if (foiReduzido) historico.push({ descricao: 'Reduzido para R$ 78,99', valor: -(precoAlvo - 78.99), tipo: 'custo' });
    if (inflarPct > 0 && !foiReduzido) historico.push({ descricao: `Inflado em ${inflarPct}% (Margem Promo)`, valor: precoFinal - precoAlvo, isPerc: true, originalPerc: inflarPct, tipo: 'custo' });

    const tarifaMLValor = precoAlvo * (tarifaMLPerc / 100);
    historico.push({ descricao: `Tarifa ML (${tipoCalc === 'premium' ? 'Premium' : 'Clássico'})`, valor: tarifaMLValor, isPerc: true, originalPerc: tarifaMLPerc, tipo: 'custo_ml' });
    historicoTaxasVenda.forEach(taxa => {
      taxa.valor = precoAlvo * (taxa.originalPerc / 100);
      historico.push(taxa);
    });

    return { precoFinal, historico };
  };

  // Dispara simulação POR CONTA E CANAL quando produto ou parâmetros mudam
  // Chave: `${contaId}_classico` e `${contaId}_premium` — igual ao CriarAnuncio
  useEffect(() => {
    if (!produtoVinculado || contasML.length === 0) { setPrecosSimulados({}); return; }
    let cancelled = false;
    const runSimulacao = async () => {
      setIsCalculandoSimulacao(true);
      const novos = {};
      for (const conta of contasML) {
        if (cancelled) break;
        novos[`${conta.id}_classico`] = await calcularPrecoDetalhado(produtoVinculado, 'classico', conta);
        if (cancelled) break;
        novos[`${conta.id}_premium`] = await calcularPrecoDetalhado(produtoVinculado, 'premium', conta);
      }
      if (!cancelled) {
        setPrecosSimulados(novos);
        // Atualiza precoVenda com referência da primeira conta (classico)
        const primeiraContaId = contasML[0]?.id;
        const precoRef = novos[`${primeiraContaId}_classico`]?.precoFinal || novos[`${primeiraContaId}_premium`]?.precoFinal;
        if (precoRef && precoRef > 0) setPrecoVenda(String(precoRef));
        setIsCalculandoSimulacao(false);
      }
    };
    runSimulacao();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoVinculado, regraPrecoId, inflarPct, reduzirPct, categoriaId, altura, largura, comprimento, pesoG, contasML.length]);

  const handleBuscarProduto = async (query) => {
    setBuscaProduto(query);
    if (!query.trim() || query.length < 2) { setResultadosBusca([]); return; }
    setLoadingBusca(true);
    try {
      const res = await fetch(`/api/produtos?userId=${usuarioId}&search=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      setResultadosBusca(data.produtos || []);
    } catch {}
    setLoadingBusca(false);
  };

  const handleSelecionarProduto = async (produto) => {
    setProdutoVinculado(produto);
    setResultadosBusca([]);
    setBuscaProduto('');
    setNovoSku(produto.sku || '');

    // Se alguma dimensão estiver vazia/zero, busca em tempo real na Tiny
    const vazio = (v) => !v || Number(v) === 0;
    const dimFalta = vazio(altura) || vazio(largura) || vazio(comprimento) || vazio(pesoG);
    if (!dimFalta) return;

    const sku = produto.sku;
    if (!sku) return;

    setLoadingDimTiny(true);
    try {
      // 1) Resolve o ID Tiny: usa dadosTiny.id ou busca pelo SKU
      let idTiny = produto.dadosTiny?.id;
      if (!idTiny) {
        const listRes = await fetch('/api/cliente-api/tiny', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: usuarioId, path: '/produtos', queryParams: { codigo: sku, limit: 1 } }),
        });
        const listJson = await listRes.json();
        idTiny = listJson?.data?.itens?.[0]?.id;
      }
      if (!idTiny) return;

      // 2) Busca detalhes do produto para obter dimensões
      const detRes = await fetch('/api/cliente-api/tiny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, path: `/produtos/${idTiny}` }),
      });
      const detJson = await detRes.json();
      const dim = detJson?.data?.dimensoes;
      if (dim) {
        if (vazio(altura) && dim.altura) setAltura(String(dim.altura));
        if (vazio(largura) && dim.largura) setLargura(String(dim.largura));
        if (vazio(comprimento) && dim.comprimento) setComprimento(String(dim.comprimento));
        if (vazio(pesoG) && (dim.pesoBruto || dim.pesoLiquido)) {
          // Tiny armazena em kg, ML espera gramas
          const pesoKg = dim.pesoBruto || dim.pesoLiquido;
          setPesoG(String(Math.round(pesoKg * 1000)));
        }
      }
    } catch {}
    finally { setLoadingDimTiny(false); }

    // Simulação de preço é disparada pelo useEffect que monitora produtoVinculado
  };

  const handleLimparProduto = () => {
    setProdutoVinculado(null);
    setBuscaProduto('');
    setResultadosBusca([]);
  };

  const handlePerfilCompatChange = async (id) => {
    setPerfilCompatId(id);
    setPerfilCompatData(null);
    if (!id) return;
    try {
      const res = await fetch(`/api/compat/perfis/${id}?userId=${usuarioId}`);
      if (res.ok) setPerfilCompatData(await res.json());
    } catch {}
  };

  const handlePuxarDados = async () => {
    const extraido = extrairId(urlAnuncio);
    if (!extraido) {
      setErro('URL ou ID inválido. Exemplos aceitos: MLB6429235734, MLBU3641853473, ou cole a URL completa do ML.');
      return;
    }
    setErro('');
    setLoading(true);
    setDadosOriginais(null);
    cargaInicialConcluida.current = false;

    const endpoint = extraido.tipo === 'produto'
      ? `/api/ml/item-clone-data/produto/${extraido.id}?userId=${usuarioId}${extraido.itemId ? `&itemId=${extraido.itemId}` : ''}`
      : `/api/ml/item-clone-data/${extraido.id}?userId=${usuarioId}`;

    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro || 'Erro ao buscar dados do anúncio');
        return;
      }

      setDadosOriginais(data);
      // Estabelece o ID do draft baseado no ID do anúncio ML
      const parsedId = extrairId(urlAnuncio);
      if (parsedId) draftIdRef.current = `replicar_${parsedId.id}`;
      setTitulo(data.title || '');
      setPrecoVenda(String(data.price || ''));
      setNovoSku(data.seller_custom_field || '');
      setQuantidade(String(data.available_quantity || '1'));
      setDescricao(data.description || '');
      setCategoriaId(data.category_id || '');
      setCategoriaInput(data.category_id || '');
      setCategoriaSugerida(data.category_sugerida || false);
      setCategoriaOpcoes(data.category_opcoes || []);

      // Imagens
      const urls = (data.pictures || []).map(p => p.secure_url || p.url || '').filter(Boolean);
      setImagens(urls);
      setImagensSelecionadas(new Set(urls));

      // Dimensões: tenta shipping.dimensions, senão usa atributos
      const dimStr = data.shipping?.dimensions;
      const dims = dimStr ? parseDimensions(dimStr) : dimDeAtributos(data.attributes || []);
      setAltura(String(dims.altura || ''));
      setLargura(String(dims.largura || ''));
      setComprimento(String(dims.comprimento || ''));
      setPesoG(String(dims.pesoG || ''));

      // Se dimensões ainda vazias/zero e houver SKU, busca automaticamente na Tiny
      const vazio = (v) => !v || Number(v) === 0;
      const dimFaltaAposML = vazio(dims.altura) || vazio(dims.largura) || vazio(dims.comprimento) || vazio(dims.pesoG);
      const skuAnuncio = data.seller_custom_field;
      if (dimFaltaAposML && skuAnuncio) {
        setLoadingDimTiny(true);
        (async () => {
          try {
            let idTiny = null;
            const listRes = await fetch('/api/cliente-api/tiny', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: usuarioId, path: '/produtos', queryParams: { codigo: skuAnuncio, limit: 1 } }),
            });
            const listJson = await listRes.json();
            idTiny = listJson?.data?.itens?.[0]?.id;
            if (idTiny) {
              const detRes = await fetch('/api/cliente-api/tiny', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: usuarioId, path: `/produtos/${idTiny}` }),
              });
              const detJson = await detRes.json();
              const dim = detJson?.data?.dimensoes;
              if (dim) {
                if (vazio(dims.altura) && dim.altura) setAltura(String(dim.altura));
                if (vazio(dims.largura) && dim.largura) setLargura(String(dim.largura));
                if (vazio(dims.comprimento) && dim.comprimento) setComprimento(String(dim.comprimento));
                if (vazio(dims.pesoG) && (dim.pesoBruto || dim.pesoLiquido)) {
                  const pesoKg = dim.pesoBruto || dim.pesoLiquido;
                  setPesoG(String(Math.round(pesoKg * 1000)));
                }
              }
            }
          } catch {}
          finally { setLoadingDimTiny(false); }
        })();
      }

      // Mapa de valores do produto original (id → { value_id, value_name })
      const mapaOriginal = Object.fromEntries(
        (data.attributes || [])
          .filter(a => !ATTRS_OCULTOS.has(a.id))
          .map(a => [a.id, { value_id: a.values?.[0]?.id ? String(a.values[0].id) : '', value_name: a.values?.[0]?.name || '' }])
      );

      // Busca atributos editáveis da categoria e remapeia valores do produto
      const catId = data.category_id;
      let attrsFinais = Object.entries(mapaOriginal).map(([id, v]) => ({ id, name: id, value_id: v.value_id, value_name: v.value_name, values: [] }));
      if (catId && /^MLB\d+$/.test(catId)) {
        // Busca caminho completo da categoria para exibição
        try {
          const catDetRes = await fetch(`https://api.mercadolibre.com/categories/${catId}`);
          if (catDetRes.ok) {
            const catDet = await catDetRes.json();
            const path = (catDet.path_from_root || []).map(n => n.name).join(' > ');
            setCategoriaFullPath(path || catDet.name || '');
            setCategoriaDomainName(catDet.name || '');
          }
        } catch {}
        try {
          const catRes = await fetch(`/api/ml/category-attributes/${catId}`);
          if (catRes.ok) {
            const catAttrs = await catRes.json();
            attrsFinais = catAttrs
              .filter(a => !ATTRS_OCULTOS.has(a.id))
              .map(a => {
                const orig = mapaOriginal[a.id] || { value_id: '', value_name: '' };
                // Se o atributo tem opções, tenta encontrar o value_id correto pelo name
                let value_id = orig.value_id;
                let value_name = orig.value_name;
                if (a.values?.length > 0 && value_name && !value_id) {
                  const match = a.values.find(v => v.name.toLowerCase() === value_name.toLowerCase());
                  if (match) value_id = String(match.id);
                }
                return { id: a.id, name: a.name, values: a.values || [], value_id, value_name, required: !!a.tags?.required };
              });
            // Adiciona extras read-only que o produto possui mas não vieram na lista da categoria
            const catAttrIds = new Set(attrsFinais.map(a => a.id));
            const extras = (data.attributes || [])
              .filter(a => !ATTRS_OCULTOS.has(a.id) && !catAttrIds.has(a.id) && a.values?.[0]?.name)
              .map(a => ({ id: a.id, name: a.name, values: [], value_id: '', value_name: a.values[0].name, readOnly: true }));
            attrsFinais = [...attrsFinais, ...extras];
          }
        } catch {}
      }
      setAtributos(attrsFinais);

      // Variações
      const vars = (data.variations || []).map(v => ({
        id: v.id,
        price: String(v.price ?? data.price ?? ''),
        available_quantity: String(v.available_quantity ?? '1'),
        sku: v.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || '',
        attribute_combinations: v.attribute_combinations || [],
        picture_ids: v.picture_ids || [],
        attributes: (v.attributes || []).filter(a => a.id !== 'SELLER_SKU'),
      }));
      setVariacoes(vars);

      // Quando veio de Recomendações: auto-vincular produto pelo SKU para usar precificação da Tiny
      const skuParaVincular = data.seller_custom_field || skuRecomendadoRef.current;
      if (veioDeRecomendacoesRef.current && skuParaVincular) {
        veioDeRecomendacoesRef.current = false;
        skuRecomendadoRef.current = null;
        const skuRec = skuParaVincular;
        (async () => {
          try {
            const res = await fetch(`/api/produtos?userId=${usuarioId}&search=${encodeURIComponent(skuRec)}&limit=5`);
            const json = await res.json();
            const match = (json.produtos || []).find(p => p.sku === skuRec) || json.produtos?.[0];
            if (match) {
              setProdutoVinculado(match);
              setBuscaProduto('');
            }
          } catch {}
        })();
      }

      // Marca carga inicial como concluída — auto-save pode começar
      cargaInicialConcluida.current = true;

    } catch (e) {
      setErro('Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Upload de imagem para o Imgur
  const uploadParaImgur = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadandoImagem(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/usuario/${usuarioId}/imgur/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro no upload');
      setImagens(prev => [...prev, data.url]);
      setImagensSelecionadas(prev => new Set([...prev, data.url]));
    } catch (e) {
      alert(`Erro ao enviar para o Imgur: ${e.message}`);
    } finally {
      setUploadandoImagem(false);
    }
  };

  // Listener global de paste para imagens (aba imagens ativa)
  useEffect(() => {
    if (abaAtiva !== 'imagens') return;
    const handleGlobalPaste = (e) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (isTyping) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) { e.preventDefault(); uploadParaImgur(imgItem.getAsFile()); }
    };
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [abaAtiva, usuarioId]);

  const toggleImagem = (url) => {
    setImagensSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleConta = (contaId) => {
    setContasSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(contaId)) next.delete(contaId);
      else next.add(contaId);
      return next;
    });
  };

  const handleMudarCategoria = async (novaCatId) => {
    const id = novaCatId.trim().toUpperCase();
    setCategoriaId(id);
    setCategoriaInput(id);
    if (!/^MLB\d+$/.test(id)) return;
    setCarregandoCategoria(true);
    try {
      // Busca atributos e detalhes da categoria em paralelo
      const [attrsRes, detalhesRes] = await Promise.all([
        fetch(`/api/ml/category-attributes/${id}`),
        fetch(`https://api.mercadolibre.com/categories/${id}`),
      ]);
      if (!attrsRes.ok) { setCarregandoCategoria(false); return; }
      const novosAttrs = await attrsRes.json();
      // Re-mapeia: mantém valores existentes onde o id do atributo bate
      const mapa = Object.fromEntries(atributos.map(a => [a.id, { value_id: a.value_id || '', value_name: a.value_name || '' }]));
      const remapeados = novosAttrs
        .filter(a => !ATTRS_OCULTOS.has(a.id))
        .map(a => {
          const prev = mapa[a.id] || { value_id: '', value_name: '' };
          return { id: a.id, name: a.name, values: a.values || [], value_id: prev.value_id, value_name: prev.value_name };
        });
      setAtributos(remapeados);
      setCategoriaSugerida(false);
      // Armazena caminho completo da categoria
      if (detalhesRes.ok) {
        const detalhes = await detalhesRes.json();
        const path = (detalhes.path_from_root || []).map(n => n.name).join(' > ');
        setCategoriaFullPath(path || detalhes.name || '');
        setCategoriaDomainName(detalhes.name || '');
      }
    } catch {}
    setCarregandoCategoria(false);
  };

  const buscarSugestoesCategoria = async () => {
    if (!titulo.trim()) return;
    setCarregandoCategoria(true);
    try {
      const res = await fetch(`/api/ml/predict-category?title=${encodeURIComponent(titulo)}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const opcoes = data.map(o => ({ category_id: o.category_id, category_name: o.category_name }));
        setCategoriaOpcoes(opcoes);
        setCategoriaSugerida(true);
      }
    } catch {}
    setCarregandoCategoria(false);
  };

  // ---- Funções do modal de navegação de categoria ----
  const getValidCatToken = async () => {
    if (contasML.length === 0) return '';
    try { return await refreshTokenIfNeeded(contasML[0]) || ''; } catch { return ''; }
  };

  const carregarRaizCat = async () => {
    setIsLoadingCat(true);
    try {
      const token = await getValidCatToken();
      const url = token ? `/api/ml/categories?token=${token}` : '/api/ml/categories';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao carregar categorias');
      const data = await res.json();
      setCategoryTree(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar categorias:', e);
      setCategoryTree([]);
    }
    setIsLoadingCat(false);
  };

  const abrirModalCat = async () => {
    setIsModalCatOpen(true);
    setSearchCatTerm('');
    setSearchCatResults([]);
    setCatExpanded(new Set());
    setCatChildrenMap({});
    setCatLoadingIds(new Set());
    await carregarRaizCat();
    if (!categoryDump) {
      fetch('/api/ml/categories-all').then(r => r.json()).then(d => {
        setCategoryDump(Array.isArray(d) ? d : Object.values(d));
      }).catch(() => {});
    }
  };

  const handleSearchCat = (term) => {
    setSearchCatTerm(term);
    if (!term || !categoryDump) { setSearchCatResults([]); return; }
    const results = [];
    for (const cat of categoryDump) {
      if (typeof cat !== 'object') continue;
      const fullPath = (cat.path_from_root || []).map(n => n.name).join(' > ');
      if ((fullPath || cat.name || '').toLowerCase().includes(term.toLowerCase())) {
        results.push({ ...cat, fullPath });
      }
      if (results.length >= 50) break;
    }
    setSearchCatResults(results);
  };

  // ---- Árvore inline expandível ----
  const selecionarCatLeaf = (cat) => {
    // Se vem de resultado de busca com fullPath, já temos o caminho
    if (cat.fullPath) setCategoriaFullPath(cat.fullPath);
    if (cat.name) setCategoriaDomainName(cat.name);
    setCategoriaOpcoes([]);
    setIsModalCatOpen(false);
    handleMudarCategoria(cat.id);
  };

  const toggleExpandCat = async (cat) => {
    if (catExpanded.has(cat.id)) {
      setCatExpanded(prev => { const n = new Set(prev); n.delete(cat.id); return n; });
      return;
    }
    if (catChildrenMap[cat.id]) {
      setCatExpanded(prev => new Set([...prev, cat.id]));
      return;
    }
    setCatLoadingIds(prev => new Set([...prev, cat.id]));
    try {
      const res = await fetch(`https://api.mercadolibre.com/categories/${cat.id}`);
      const data = await res.json();
      if (data?.children_categories?.length > 0) {
        setCatChildrenMap(prev => ({ ...prev, [cat.id]: data.children_categories }));
        setCatExpanded(prev => new Set([...prev, cat.id]));
      } else {
        selecionarCatLeaf(cat);
      }
    } catch { selecionarCatLeaf(cat); }
    setCatLoadingIds(prev => { const n = new Set(prev); n.delete(cat.id); return n; });
  };

  const renderCatNode = (cat, depth = 0) => {
    const isExpanded = catExpanded.has(cat.id);
    const isLoading = catLoadingIds.has(cat.id);
    const children = catChildrenMap[cat.id] || [];
    return (
      <div key={cat.id}>
        <button
          onClick={() => toggleExpandCat(cat)}
          style={{ width: '100%', textAlign: 'left', paddingLeft: `${14 + depth * 18}px`, paddingRight: '14px', paddingTop: '9px', paddingBottom: '9px', backgroundColor: '#fff', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '0.84em', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
          onMouseOut={e => e.currentTarget.style.backgroundColor = '#fff'}
        >
          <span style={{ fontSize: '0.8em', color: '#94a3b8', width: '12px', flexShrink: 0 }}>
            {isLoading ? '⏳' : isExpanded ? '▼' : '▶'}
          </span>
          <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{cat.name}</span>
        </button>
        {isExpanded && children.map(child => renderCatNode(child, depth + 1))}
      </div>
    );
  };
  // ---- Fim funções modal categoria ----

  const buscarRecomendacoes = async () => {
    if (contasML.length < 2) { setErroRec('Você precisa de pelo menos 2 contas conectadas para comparar.'); return; }
    setLoadingRec(true);
    setErroRec('');
    setRecomendacoes([]);
    setRecBuscado(false);
    try {
      const res = await fetch(`/api/ml/recomendacoes-replicacao?userId=${usuarioId}`);
      if (!res.ok) throw new Error('Erro ao buscar recomendações');
      const data = await res.json();
      setRecomendacoes(data);
      setRecBuscado(true);
    } catch (e) {
      setErroRec(e.message || 'Erro ao buscar recomendações');
    } finally {
      setLoadingRec(false);
    }
  };

  const usarAnuncioRecomendado = (ad, contaIds) => {
    setUrlAnuncio(ad.id);
    const ids = Array.isArray(contaIds) ? contaIds : [contaIds];
    if (ids.length > 0) setContasSelecionadas(new Set(ids));
    veioDeRecomendacoesRef.current = true;
    skuRecomendadoRef.current = ad.allSkus?.[0] || ad.variacoes?.[0]?.sku || null;
    setModoAtivo('replicar');
    setTimeout(() => {
      document.getElementById('btn-buscar-anuncio')?.click();
    }, 100);
  };

  const handleReplicar = async () => {
    if (!dadosOriginais) { alert('Puxe os dados de um anúncio antes de replicar.'); return; }
    if (contasSelecionadas.size === 0) { alert('Selecione ao menos uma conta para replicar.'); return; }
    const algumTipoSelecionado = [...contasSelecionadas].some(id => { const t = getTiposConta(id); return t.classico || t.premium; });
    if (!algumTipoSelecionado) { alert('Selecione ao menos um tipo de anúncio em uma das contas.'); return; }
    if (!titulo.trim()) { alert('O título do anúncio é obrigatório.'); return; }
    const atributosObrigatoriosFaltando = atributos.filter(a => a.required && !a.readOnly && !a.value_name?.trim());
    if (atributosObrigatoriosFaltando.length > 0) {
      alert(`Preencha os campos obrigatórios da Ficha Técnica antes de publicar:\n\n${atributosObrigatoriosFaltando.map(a => `• ${a.name}`).join('\n')}`);
      setAbaAtiva('fichaTecnica');
      return;
    }
    const temPrecoValido = (produtoVinculado && (precosSimulados.classico?.precoFinal > 0 || precosSimulados.premium?.precoFinal > 0)) || Number(precoVenda) > 0;
    if (!temPrecoValido) { alert('Informe um preço de venda válido ou vincule um produto com regra de preço.'); return; }
    const catFinal = categoriaId || dadosOriginais.category_id;
    if (!catFinal || !/^MLB\d+$/.test(catFinal)) { alert('Selecione uma categoria válida antes de publicar (formato: MLB + números).'); return; }

    setReplicando(true);
    let sucessos = 0, erros = 0, msgs = [];

    const picsSelecionadas = imagens.filter(u => imagensSelecionadas.has(u));

    // Monta atributos: aplica novo SKU se informado; remove valores vazios
    const attrsFinal = atributos
      .filter(a => !a.readOnly)
      .map(a => a.value_id ? { id: a.id, value_id: a.value_id, value_name: a.value_name } : { id: a.id, value_name: a.value_name })
      .filter(a => a.value_name != null && String(a.value_name).trim() !== '');
    if (novoSku) {
      const idxSku = attrsFinal.findIndex(a => a.id === 'SELLER_SKU');
      if (idxSku >= 0) attrsFinal[idxSku].value_name = novoSku;
      else attrsFinal.push({ id: 'SELLER_SKU', value_name: novoSku });
    }

    // Adiciona atributos de embalagem — ML só aceita inteiros; parseFloat ignora sufixo "cm"/"g"
    const toInt = v => Math.round(parseFloat(String(v))) || 0;
    if (altura && toInt(altura) > 0) attrsFinal.push({ id: 'SELLER_PACKAGE_HEIGHT', value_name: `${toInt(altura)} cm` });
    if (largura && toInt(largura) > 0) attrsFinal.push({ id: 'SELLER_PACKAGE_WIDTH', value_name: `${toInt(largura)} cm` });
    if (comprimento && toInt(comprimento) > 0) attrsFinal.push({ id: 'SELLER_PACKAGE_LENGTH', value_name: `${toInt(comprimento)} cm` });
    if (pesoG && toInt(pesoG) > 0) attrsFinal.push({ id: 'SELLER_PACKAGE_WEIGHT', value_name: `${toInt(pesoG)} g` });

    const dimStr = (altura && largura && comprimento && pesoG)
      ? `${altura}x${largura}x${comprimento},${pesoG}`
      : undefined;

    // ✅ CORREÇÃO: Preserva as condições de venda originais (como Garantia)
    let termosVenda = (dadosOriginais.sale_terms ||[]).filter(t => t.id !== 'MANUFACTURING_TIME');
    if (prazoFabricacao && Number(prazoFabricacao) > 0) {
      termosVenda.push({ id: 'MANUFACTURING_TIME', value_name: `${prazoFabricacao} dias` });
    }
    // Fallback de segurança: Se não tem garantia, injeta a padrão para evitar erro em Auto Peças
    if (!termosVenda.some(t => t.id === 'WARRANTY_TYPE')) {
      termosVenda.push({ id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' });
      termosVenda.push({ id: 'WARRANTY_TIME', value_name: '90 dias' });
    }

    for (const contaId of contasSelecionadas) {
      const conta = contasML.find(c => c.id === contaId);
      if (!conta) continue;

      const tc = getTiposConta(contaId);
      const tipos = [];
      if (tc.classico) tipos.push('gold_special');
      if (tc.premium) tipos.push('gold_pro');

      for (const listingType of tipos) {
        const canal = listingType === 'gold_pro' ? 'premium' : 'classico';
        // Usa o preço simulado da conta específica; fallback para precoVenda se não houver simulação
        const preco = (produtoVinculado && precosSimulados[`${conta.id}_${canal}`]?.precoFinal) || Number(precoVenda);
        const payload = {
          title: titulo,
          ...(variacoes.length === 0 ? { family_name: titulo.substring(0, 60) } : {}),
          category_id: categoriaId || dadosOriginais.category_id,
          price: preco,
          currency_id: 'BRL',
          buying_mode: 'buy_it_now',
          listing_type_id: listingType,
          condition: dadosOriginais.condition || 'new',
          ...(variacoes.length === 0 ? { available_quantity: Number(quantidade) || 1 } : {}),
          pictures: picsSelecionadas.map(url => ({ source: url })),
          attributes: attrsFinal,
          ...(variacoes.length > 0 ? {
            variations: variacoes.map(v => ({
              price: Number(v.price) || preco,
              available_quantity: Number(v.available_quantity) || 1,
              attribute_combinations: v.attribute_combinations,
              picture_ids: v.picture_ids,
              attributes:[
                ...v.attributes,
                ...(v.sku ? [{ id: 'SELLER_SKU', value_name: v.sku }] : []),
              ],
            })),
          } : {}),
          ...(prazoFabricacao && Number(prazoFabricacao) > 0 ? {
            sale_terms: [{ id: 'MANUFACTURING_TIME', value_name: `${prazoFabricacao} dias` }],
          } : {}),
          shipping: {
            mode: conta.envioSuportado === 'ME1' ? 'me1' : 'me2',
            local_pick_up: permitirRetirada,
            free_shipping: conta.envioSuportado === 'ME1' ? false : preco >= 79,
            ...(dimStr ? { dimensions: dimStr } : {}),
          },
        };

        try {
          const res = await fetch('/api/ml/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: usuarioId,
              contaNome: conta.nickname,
              sku: novoSku || titulo.substring(0, 30),
              accessToken: conta.accessToken,
              payload,
              description: descricao,
              ativarPromocoes,
              toleranciaPromo: ativarPromocoes ? (Number(toleranciaPromo) || 0) : 0,
              enviarAtacado,
              inflar: Number(inflarPct) || 0,
              compatibilidades: compatRapida ? compatRapida.slice(0, 200) : perfilCompatData ? (perfilCompatData.compatibilities || []).slice(0, 200) : [],
              posicoes: Array.from(posicoesSelecionadas),
            }),
          });
          if (res.ok) sucessos++;
          else {
            erros++;
            const d = await res.json().catch(() => ({}));
            msgs.push(`${conta.nickname} (${listingType}): ${d.erro || 'Erro desconhecido'}`);
          }
        } catch (e) {
          erros++;
          msgs.push(`${conta.nickname}: Falha de conexão`);
        }
      }
    }

    setReplicando(false);
    if (erros > 0) {
      alert(`⚠️ Finalizado com avisos.\nSucessos: ${sucessos} | Erros: ${erros}\n\n${msgs.join('\n')}`);
    } else {
      if (draftIdRef.current) excluirDraft(draftIdRef.current);
      alert(`Sucesso! ${sucessos} tarefa(s) de publicação enviadas para a Fila.\n\nAcompanhe em "Gerenciador de Fila".`);
    }
  };

  // ============================================================
  // ESTILOS
  // ============================================================
  const s = {
    container: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#1e293b' },
    headerTitle: { fontSize: '1.05em', fontWeight: 700, color: '#1e293b', marginBottom: '18px', paddingBottom: '12px', borderBottom: '2px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' },
    urlSection: { marginBottom: '14px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    urlLabel: { fontSize: '0.72em', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' },
    urlRow: { display: 'flex', gap: '10px', alignItems: 'center' },
    urlInput: { flex: 1, padding: '9px 13px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.87em', outline: 'none', backgroundColor: '#f8fafc', color: '#1e293b' },
    btnPrimary: { padding: '9px 18px', backgroundColor: '#1e293b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600, whiteSpace: 'nowrap' },
    erroBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.83em', color: '#dc2626' },
    tabsContainer: { display: 'flex', borderBottom: '2px solid #f1f5f9', marginBottom: '0', backgroundColor: '#fff', borderTopLeftRadius: '10px', borderTopRightRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    tab: (isActive) => ({ padding: '10px 16px', fontSize: '0.81em', fontWeight: isActive ? 700 : 500, color: isActive ? '#e67e22' : '#64748b', backgroundColor: '#fff', borderBottom: `2.5px solid ${isActive ? '#e67e22' : 'transparent'}`, cursor: 'pointer', border: 'none', fontFamily: 'inherit', transition: 'color 0.15s', whiteSpace: 'nowrap' }),
    formCard: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderTop: 'none', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px', padding: '20px 22px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    formRow: { display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '12px' },
    formLabel: { fontSize: '0.82em', fontWeight: 600, color: '#555', minWidth: '160px', textAlign: 'right' },
    formInput: { padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.85em', outline: 'none', color: '#1e293b' },
    formInputFull: { flex: 1, padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.85em', outline: 'none', color: '#1e293b' },
    fieldGroup: { marginBottom: '14px' },
    fieldLabel: { fontSize: '0.72em', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' },
    fieldInput: { width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.87em', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box', color: '#1e293b' },
    checkbox: { marginRight: '6px', cursor: 'pointer', accentColor: '#e67e22', width: '15px', height: '15px' },
    checkboxLabel: { fontSize: '0.83em', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    sectionTitle: { fontSize: '0.72em', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', marginTop: '16px' },
    replicacaoSection: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px 22px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    contasGrid: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' },
    btnReplicar: (disabled) => ({ width: '100%', padding: '14px', backgroundColor: disabled ? '#f1f5f9' : '#16a34a', color: disabled ? '#94a3b8' : '#fff', border: 'none', borderRadius: '10px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.93em', fontWeight: 700, letterSpacing: '0.4px', fontFamily: 'inherit', boxShadow: disabled ? 'none' : '0 4px 14px rgba(22,163,74,0.25)', transition: 'all 0.2s' }),
    footerNote: { fontSize: '0.75em', color: '#94a3b8', marginTop: '10px', textAlign: 'center' },
    placeholderTab: { padding: '40px 20px', color: '#94a3b8', textAlign: 'center', fontSize: '0.88em' },
    vinculoSection: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    vinculoHeader: { fontSize: '0.72em', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' },
    searchWrap: { position: 'relative' },
    searchInput: { width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85em', outline: 'none', boxSizing: 'border-box', backgroundColor: '#f8fafc' },
    searchDropdown: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto' },
    searchItem: { padding: '8px 12px', cursor: 'pointer', fontSize: '0.83em', borderBottom: '1px solid #f8fafc' },
    produtoInfo: { display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginTop: '8px' },
    produtoPrecos: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' },
    precoBtn: (ativo) => ({ padding: '4px 12px', fontSize: '0.78em', fontWeight: 600, borderRadius: '6px', border: `1.5px solid ${ativo ? '#16a34a' : '#e2e8f0'}`, backgroundColor: ativo ? '#dcfce7' : '#f8fafc', color: ativo ? '#15803d' : '#64748b', cursor: 'pointer' }),
    promoSection: { marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' },
    autoSecao: { marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' },
    attrRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '5px 0', borderBottom: '1px solid #f8fafc' },
    attrName: { fontSize: '0.8em', color: '#475569', minWidth: '200px', textAlign: 'right', fontWeight: 500 },
    attrInput: { flex: 1, padding: '5px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.83em', outline: 'none' },
  };

  const abas = [
    { id: 'geral', label: 'Geral & Preço' },
    { id: 'dimensoes', label: loadingDimTiny ? 'Dimensões & Peso ⏳' : 'Dimensões & Peso' },
    { id: 'descricao', label: 'Descrição' },
    { id: 'imagens', label: `Imagens${imagens.length ? ` (${imagensSelecionadas.size}/${imagens.length})` : ''}` },
    { id: 'fichaTecnica', label: 'Ficha Técnica' },
    ...(variacoes.length > 0 ? [{ id: 'variacoes', label: `Variações (${variacoes.length})` }] : []),
  ];

  const renderDetalhesCalculo = (calcObj) => {
    if (!calcObj?.historico) return null;
    return (
      <div style={{ padding: '8px 0', fontSize: '0.76em' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', fontSize: '0.88em', marginBottom: '4px', borderBottom: '1px solid #f3f4f6', paddingBottom: '2px' }}>Evolução do Custo</div>
            {calcObj.historico.filter(h => h.tipo === 'valor' || h.tipo === 'custo').map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ color: '#374151' }}>{h.descricao}{h.isPerc ? ` (${h.originalPerc > 0 ? '+' : ''}${h.originalPerc}%)` : ''}</span>
                <span style={{ color: h.valor < 0 ? '#ef4444' : '#111', fontWeight: 500 }}>
                  {i > 0 ? (h.valor < 0 ? '-' : '+') : ''} R$ {Math.abs(h.valor).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', fontSize: '0.88em', marginBottom: '4px', borderBottom: '1px solid #f3f4f6', paddingBottom: '2px' }}>Custos da Venda</div>
            {calcObj.historico.filter(h => h.tipo === 'custo_ml' || h.tipo === 'taxa_venda').map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ color: '#374151' }}>{h.descricao}{h.originalPerc ? ` (${h.originalPerc > 0 ? '+' : ''}${h.originalPerc}%)` : ''}</span>
                <span style={{ color: '#2563eb', fontWeight: 500 }}>+ R$ {Math.abs(h.valor).toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px dashed #d1d5db', paddingTop: '5px', fontWeight: 700, color: '#166534', fontSize: '0.9em' }}>
          <span>PREÇO FINAL:</span>
          <span>R$ {calcObj.precoFinal.toFixed(2).replace('.', ',')}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={s.container}>
      <div style={s.headerTitle}>
        <span style={{ fontSize: '1.3em' }}>📋</span>
        <div>
          <div>Replicar Anúncio</div>
          <div style={{ fontSize: '0.65em', fontWeight: 400, color: '#94a3b8', marginTop: '1px' }}>Copie um anúncio do ML para outras contas com preço e configurações personalizadas</div>
        </div>
      </div>

      {/* Toggle de modo */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setModoAtivo('replicar')}
          style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${modoAtivo === 'replicar' ? '#2563eb' : '#e2e8f0'}`, backgroundColor: modoAtivo === 'replicar' ? '#eff6ff' : '#f8fafc', color: modoAtivo === 'replicar' ? '#1d4ed8' : '#64748b', fontWeight: modoAtivo === 'replicar' ? 700 : 500, fontSize: '0.85em', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          🔁 Replicar Anúncio
        </button>
        <button
          onClick={() => setModoAtivo('recomendacoes')}
          style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${modoAtivo === 'recomendacoes' ? '#7c3aed' : '#e2e8f0'}`, backgroundColor: modoAtivo === 'recomendacoes' ? '#f5f3ff' : '#f8fafc', color: modoAtivo === 'recomendacoes' ? '#6d28d9' : '#64748b', fontWeight: modoAtivo === 'recomendacoes' ? 700 : 500, fontSize: '0.85em', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          💡 Recomendações
        </button>
        {rascunhosReplicar.length > 0 && (
          <button
            onClick={() => setModoAtivo('rascunhos')}
            style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${modoAtivo === 'rascunhos' ? '#d97706' : '#fbbf24'}`, backgroundColor: modoAtivo === 'rascunhos' ? '#fef3c7' : '#fffbeb', color: '#92400e', fontWeight: modoAtivo === 'rascunhos' ? 700 : 500, fontSize: '0.85em', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            📝 Rascunhos ({rascunhosReplicar.length})
          </button>
        )}
      </div>

      {/* ====== MODO RASCUNHOS ====== */}
      {modoAtivo === 'rascunhos' && (
        <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fbbf24', borderRadius: '10px', padding: '20px 22px' }}>
          <div style={{ fontSize: '0.78em', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            📝 Rascunhos salvos — clique para retomar
          </div>
          {rascunhosReplicar.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.86em', textAlign: 'center', padding: '20px 0' }}>Nenhum rascunho salvo.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rascunhosReplicar.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.87em', color: '#1e293b' }}>{d.titulo || d.urlAnuncio || d.id}</div>
                    <div style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '2px' }}>
                      {d.urlAnuncio && <span style={{ marginRight: '8px' }}>URL: {d.urlAnuncio.substring(0, 40)}…</span>}
                      Salvo: {formatarDataDraft(d.updatedAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => carregarRascunhoReplicar(d)}
                    style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontWeight: 600, fontSize: '0.79em', cursor: 'pointer' }}
                  >
                    Retomar
                  </button>
                  <button
                    onClick={() => excluirDraft(d.id)}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #fca5a5', backgroundColor: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: '0.79em', cursor: 'pointer' }}
                  >
                    Excluir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== MODO RECOMENDAÇÕES ====== */}
      {modoAtivo === 'recomendacoes' && (
        <div>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px 22px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.85em', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>Anúncios que não estão em todas as contas</div>
            <div style={{ fontSize: '0.78em', color: '#64748b', marginBottom: '16px' }}>
              Compara automaticamente todas as contas conectadas ({contasML.map(c => c.nickname).join(', ') || '—'}) e lista qualquer anúncio ausente em pelo menos uma delas.
            </div>
            <button
              onClick={buscarRecomendacoes}
              disabled={loadingRec}
              style={{ width: '100%', padding: '11px', backgroundColor: loadingRec ? '#f1f5f9' : '#7c3aed', color: loadingRec ? '#94a3b8' : '#fff', border: 'none', borderRadius: '8px', fontSize: '0.88em', fontWeight: 700, cursor: loadingRec ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {loadingRec ? '⏳ Comparando todas as contas...' : '🔍 Buscar Recomendações'}
            </button>
          </div>

          {erroRec && <div style={s.erroBox}>⚠ {erroRec}</div>}

          {recBuscado && !loadingRec && (
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {recomendacoes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#15803d', fontSize: '0.88em' }}>
                  <div style={{ fontSize: '2em', marginBottom: '8px' }}>✅</div>
                  Todos os anúncios desta conta já existem nas demais contas.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.85em', fontWeight: 700, color: '#1e293b' }}>
                      {recomendacoes.filter(ad => !filtrarSemEstoque || ad.estoque > 0).length} anúncio{recomendacoes.filter(ad => !filtrarSemEstoque || ad.estoque > 0).length !== 1 ? 's' : ''} sem replicação completa
                    </span>
                    <span style={{ fontSize: '0.75em', color: '#64748b' }}>Clique em "Replicar →" para a conta desejada</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '7px 10px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '7px', cursor: 'pointer' }} onClick={() => setFiltrarSemEstoque(v => !v)}>
                    <input type="checkbox" id="filtroSemEstoque" checked={filtrarSemEstoque} onChange={() => setFiltrarSemEstoque(v => !v)} style={{ cursor: 'pointer', accentColor: '#16a34a', width: '15px', height: '15px' }} />
                    <label htmlFor="filtroSemEstoque" style={{ fontSize: '0.82em', fontWeight: 600, color: '#15803d', cursor: 'pointer', userSelect: 'none' }}>
                      Mostrar apenas com estoque ({recomendacoes.filter(ad => ad.estoque > 0).length})
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recomendacoes.filter(ad => !filtrarSemEstoque || ad.estoque > 0).map(ad => (
                      <div key={ad.id} style={{ border: '1px solid #f1f5f9', borderRadius: '8px', backgroundColor: '#fafafa', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px' }}>
                          {ad.thumbnail && (
                            <img src={ad.thumbnail} alt="" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '4px', flexShrink: 0, border: '1px solid #e5e7eb' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.83em', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.titulo}</div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72em', padding: '1px 7px', borderRadius: '4px', fontWeight: 600,
                                backgroundColor: ad.listingType === 'Premium' ? '#f5f3ff' : '#fff7ed',
                                color: ad.listingType === 'Premium' ? '#6d28d9' : '#c2610f',
                                border: `1px solid ${ad.listingType === 'Premium' ? '#ddd6fe' : '#fed7aa'}`
                              }}>
                                {ad.listingType === 'Premium' ? '🏆 Premium' : '📦 Clássico'}
                              </span>
                              {ad.contaOrigemNick && (
                                <span style={{ fontSize: '0.72em', color: '#64748b' }}>em {ad.contaOrigemNick}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.76em', color: '#16a34a', fontWeight: 600 }}>R$ {Number(ad.preco).toFixed(2).replace('.', ',')}</span>
                              <span style={{ fontSize: '0.72em', padding: '1px 7px', borderRadius: '4px', fontWeight: 600,
                                backgroundColor: ad.estoque === 0 ? '#fee2e2' : '#f0fdf4',
                                color: ad.estoque === 0 ? '#dc2626' : '#15803d',
                                border: `1px solid ${ad.estoque === 0 ? '#fca5a5' : '#86efac'}`
                              }}>
                                {ad.estoque === 0 ? 'Sem estoque' : `Estoque: ${ad.estoque}`}
                              </span>
                              {ad.temVariacoes && (
                                <span style={{ fontSize: '0.72em', backgroundColor: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: '4px', fontWeight: 600 }}>
                                  {(ad.variacoes || ad.allSkus || []).length} variações
                                </span>
                              )}
                              {(ad.allSkus || []).map(s => (
                                <span key={s} style={{ fontSize: '0.73em', color: '#64748b', backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{s}</span>
                              ))}
                              <span style={{ fontSize: '0.73em', color: '#94a3b8', fontFamily: 'monospace' }}>{ad.id}</span>
                            </div>
                            {ad.variacoes && ad.variacoes.length > 0 && (
                              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {ad.variacoes.map((v, i) => (
                                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.76em' }}>
                                    <span style={{ color: '#475569', fontWeight: 500 }}>{v.combinacao}</span>
                                    {v.sku && <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>SKU: {v.sku}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Contas que não têm esse anúncio */}
                        <div style={{ padding: '6px 12px 10px 68px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.73em', color: '#b45309', fontWeight: 600, marginRight: '2px' }}>Falta em:</span>
                          {ad.contasAusentes.map(({ nickname, contaId }) => (
                            <button
                              key={contaId}
                              onClick={() => usarAnuncioRecomendado(ad, contaId)}
                              style={{ padding: '3px 10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.76em', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              {nickname} →
                            </button>
                          ))}
                          {ad.contasAusentes.length > 1 && (
                            <button
                              onClick={() => usarAnuncioRecomendado(ad, ad.contasAusentes.map(c => c.contaId))}
                              style={{ padding: '3px 10px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.76em', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Replicar em todas →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====== MODO REPLICAR ====== */}
      {modoAtivo === 'replicar' && <>

      {/* URL */}
      <div style={s.urlSection}>
        <span style={s.urlLabel}>URL ou ID do Anúncio</span>
        <div style={s.urlRow}>
          <input
            type="text"
            value={urlAnuncio}
            onChange={(e) => setUrlAnuncio(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePuxarDados()}
            placeholder="Cole a URL do anúncio ou o ID (MLB123456, MLBU123456...)"
            style={s.urlInput}
          />
          <button id="btn-buscar-anuncio" onClick={handlePuxarDados} disabled={loading} style={s.btnPrimary}>
            {loading ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
        </div>
      </div>

      {erro && <div style={s.erroBox}>⚠ {erro}</div>}

      {dadosOriginais && (
        <div style={{ fontSize: '0.8em', color: '#15803d', marginBottom: '12px', padding: '8px 14px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>✓</span>
          <span>Anúncio <strong>{dadosOriginais.id}</strong> carregado — categoria <strong>{dadosOriginais.category_id}</strong></span>
        </div>
      )}

      {/* Seção: Vincular ao Meu Produto */}
      {dadosOriginais && (
        <div style={s.vinculoSection}>
          <div style={s.vinculoHeader}>
            🔗 Vincular ao Meu Produto
            <span style={{ fontSize: '1em', fontWeight: 400, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>— para calcular preço, ativar promoções e enviar compatibilidade</span>
          </div>

          {!produtoVinculado ? (
            <div style={s.searchWrap} ref={buscaRef}>
              <input
                type="text"
                value={buscaProduto}
                onChange={e => handleBuscarProduto(e.target.value)}
                placeholder="Buscar por SKU ou nome do produto..."
                style={s.searchInput}
              />
              {loadingBusca && (
                <div style={{ ...s.searchDropdown, padding: '8px 12px', fontSize: '0.82em', color: '#888' }}>Buscando...</div>
              )}
              {!loadingBusca && resultadosBusca.length > 0 && (
                <div style={s.searchDropdown}>
                  {resultadosBusca.map(p => (
                    <div
                      key={p.id}
                      style={s.searchItem}
                      onMouseDown={() => handleSelecionarProduto(p)}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#f0f4ff'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = ''}
                    >
                      <span style={{ fontWeight: 600, color: '#2563eb', marginRight: '8px', fontFamily: 'monospace' }}>{p.sku}</span>
                      <span style={{ color: '#333' }}>{p.nome}</span>
                      {p.dadosTiny?.preco > 0 && (
                        <span style={{ float: 'right', color: '#16a34a', fontWeight: 600 }}>R$ {Number(p.dadosTiny.preco).toFixed(2)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={s.produtoInfo}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', fontSize: '0.9em' }}>{produtoVinculado.sku}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.85em', color: '#1e293b' }}>{produtoVinculado.nome}</span>
                  <button onClick={handleLimparProduto} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '1em' }} title="Remover vínculo">✕</button>
                </div>

                <div style={s.produtoPrecos}>
                  {produtoVinculado.dadosTiny?.preco > 0 && (
                    <button
                      style={s.precoBtn(regraPrecoId === 'preco_venda')}
                      onClick={() => setRegraPrecoId('preco_venda')}
                    >
                      Venda: R$ {Number(produtoVinculado.dadosTiny.preco).toFixed(2)}
                    </button>
                  )}
                  {produtoVinculado.dadosTiny?.preco_promocional > 0 && (
                    <button
                      style={s.precoBtn(regraPrecoId === 'preco_promocional')}
                      onClick={() => setRegraPrecoId('preco_promocional')}
                    >
                      Promo: R$ {Number(produtoVinculado.dadosTiny.preco_promocional).toFixed(2)}
                    </button>
                  )}
                  {produtoVinculado.dadosTiny?.preco_custo > 0 && (
                    <span style={{ fontSize: '0.78em', color: '#6b7280', alignSelf: 'center' }}>
                      Custo: R$ {Number(produtoVinculado.dadosTiny.preco_custo).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Simulação de preço por canal — idêntico ao CriarAnuncio */}
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.78em', fontWeight: 600, color: '#555' }}>Regra:</span>
                    <select
                      value={regraPrecoId}
                      onChange={e => setRegraPrecoId(e.target.value)}
                      style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.78em', outline: 'none' }}
                    >
                      {regrasPreco.length > 0 && (
                        <optgroup label="Regras Personalizadas">
                          {regrasPreco.map(r => <option key={r.id} value={r.id}>{r.nome || r.id}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Opções Fixas">
                        <option value="preco_venda">Preço de Venda (ERP)</option>
                        <option value="preco_promocional">Preço Venda ou Promocional (ERP)</option>
                        <option value="manual">Informar manualmente</option>
                      </optgroup>
                    </select>
                    <span style={{ fontSize: '0.75em', color: '#888' }}>Inflar:</span>
                    <input
                      type="number" value={inflarPct}
                      onChange={e => setInflarPct(Number(e.target.value) || 0)}
                      style={{ width: '52px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.78em', outline: 'none' }}
                      min="0" max="50" step="1" placeholder="0"
                    />
                    <span style={{ fontSize: '0.75em', color: '#888' }}>%</span>
                    <span style={{ fontSize: '0.75em', color: '#dc2626' }}>Reduzir frete:</span>
                    <input
                      type="number" value={reduzirPct}
                      onChange={e => setReduzirPct(Number(e.target.value) || 0)}
                      style={{ width: '52px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.78em', outline: 'none' }}
                      min="0" max="50" step="1" placeholder="0"
                    />
                    <span style={{ fontSize: '0.75em', color: '#888' }}>%</span>
                  </div>

                  {regraPrecoId === 'manual' && (
                    <div style={{ fontSize: '0.78em', color: '#6b7280', padding: '4px 8px', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb', marginBottom: '6px' }}>
                      Use o campo "Preço de Venda" na aba Geral para informar o preço manualmente.
                    </div>
                  )}

                  {isCalculandoSimulacao && (
                    <div style={{ fontSize: '0.78em', color: '#3b82f6', padding: '4px 0' }}>⏳ Calculando frete por conta...</div>
                  )}
                  {!isCalculandoSimulacao && produtoVinculado && Object.keys(precosSimulados).length > 0 && (
                    <div style={{ fontSize: '0.75em', color: '#6b7280', padding: '3px 0' }}>
                      ✅ Preços calculados por conta — veja abaixo em "Replicar para as Contas"
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Abas */}
      <div style={s.tabsContainer}>
        {abas.map(aba => (
          <button key={aba.id} onClick={() => setAbaAtiva(aba.id)} style={s.tab(abaAtiva === aba.id)}>
            {aba.label}
          </button>
        ))}
      </div>

      <div style={s.formCard}>

        {/* ABA: Geral & Preço */}
        {abaAtiva === 'geral' && (
          <div>
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Título do Anúncio</label>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} style={s.fieldInput} placeholder="Título do anúncio" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px 110px', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={s.fieldLabel}>Preço de Venda (R$)</label>
                <input type="number" value={precoVenda} onChange={e => setPrecoVenda(e.target.value)} style={s.fieldInput} min="0" step="0.01" />
              </div>
              <div>
                <label style={s.fieldLabel}>Novo SKU <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span></label>
                <input type="text" value={novoSku} onChange={e => setNovoSku(e.target.value)} style={s.fieldInput} placeholder="SKU..." />
              </div>
              <div>
                <label style={s.fieldLabel}>Qtd. Estoque</label>
                <input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={s.fieldInput} min="1" />
              </div>
              <div>
                <label style={s.fieldLabel}>Prazo Fabr. (dias)</label>
                <input type="number" value={prazoFabricacao} onChange={e => setPrazoFabricacao(e.target.value)} style={s.fieldInput} min="0" max="45" placeholder="0" />
              </div>
            </div>
            <label style={s.checkboxLabel}>
              <input type="checkbox" checked={permitirRetirada} onChange={e => setPermitirRetirada(e.target.checked)} style={s.checkbox} />
              Permitir Retirada no Local
            </label>
            {dadosOriginais && (
              <>
                {/* Categoria */}
                <div style={{ marginTop: '14px', padding: '12px 14px', backgroundColor: categoriaSugerida ? '#fffbeb' : '#f8f8f8', border: `1px solid ${categoriaSugerida ? '#fcd34d' : '#e0e0e0'}`, borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: categoriaSugerida ? '10px' : '0' }}>
                    <span style={{ fontSize: '0.82em', fontWeight: 600, color: '#555', minWidth: '160px', textAlign: 'right' }}>
                      Categoria ML:
                    </span>
                    <input
                      type="text"
                      value={categoriaInput}
                      onChange={e => setCategoriaInput(e.target.value)}
                      onBlur={e => handleMudarCategoria(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleMudarCategoria(categoriaInput)}
                      placeholder="Ex: MLB1234"
                      style={{ ...s.formInput, width: '130px', fontFamily: 'monospace' }}
                    />
                    <button
                      onClick={buscarSugestoesCategoria}
                      disabled={carregandoCategoria || !titulo}
                      style={{ ...s.btnPrimary, fontSize: '0.78em', padding: '6px 12px', backgroundColor: '#6b7280' }}
                    >
                      {carregandoCategoria ? '...' : 'Sugerir'}
                    </button>
                    <button
                      onClick={abrirModalCat}
                      style={{ ...s.btnPrimary, fontSize: '0.78em', padding: '6px 12px', backgroundColor: '#2563eb' }}
                    >
                      🌲 Navegar
                    </button>
                    {categoriaSugerida && (
                      <span style={{ fontSize: '0.75em', color: '#b45309', fontWeight: 600, backgroundColor: '#fef3c7', padding: '3px 8px', borderRadius: '4px' }}>
                        ⚠ Categoria sugerida — confirme antes de publicar
                      </span>
                    )}
                  </div>

                  {/* Árvore completa da categoria selecionada */}
                  {categoriaFullPath && (
                    <div style={{ marginLeft: '172px', marginTop: '6px', fontSize: '0.78em', color: '#15803d', backgroundColor: '#f0fdf4', padding: '5px 10px', borderRadius: '4px', border: '1px solid #bbf7d0', fontWeight: 500 }}>
                      📂 {categoriaFullPath}
                    </div>
                  )}

                  {categoriaSugerida && categoriaOpcoes.length > 0 && (
                    <div style={{ marginLeft: '172px' }}>
                      <div style={{ fontSize: '0.78em', color: '#78350f', marginBottom: '6px' }}>Selecione a categoria correta:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {categoriaOpcoes.map(op => (
                          <label key={op.category_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82em', color: '#333' }}>
                            <input
                              type="radio"
                              name="categoria-opcao"
                              checked={categoriaId === op.category_id}
                              onChange={() => handleMudarCategoria(op.category_id)}
                            />
                            <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{op.category_id}</span>
                            <span>{op.category_name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f8f8', borderRadius: '4px', fontSize: '0.78em', color: '#666' }}>
                  <strong>Anúncio original:</strong> {dadosOriginais.listing_type_id === 'gold_pro' ? 'Premium' : 'Clássico'} &nbsp;|&nbsp; Preço: R$ {dadosOriginais.price} &nbsp;|&nbsp; Condição: {dadosOriginais.condition}
                </div>
              </>
            )}
          </div>
        )}

        {/* ABA: Dimensões */}
        {abaAtiva === 'dimensoes' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Altura (cm)</label>
                <input type="number" value={altura} onChange={e => setAltura(e.target.value)} style={s.fieldInput} min="0" step="0.1" placeholder="0" />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Largura (cm)</label>
                <input type="number" value={largura} onChange={e => setLargura(e.target.value)} style={s.fieldInput} min="0" step="0.1" placeholder="0" />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Comprimento (cm)</label>
                <input type="number" value={comprimento} onChange={e => setComprimento(e.target.value)} style={s.fieldInput} min="0" step="0.1" placeholder="0" />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Peso <span style={{ fontWeight: 400, color: '#94a3b8' }}>(gramas — ex: 8000 = 8 kg)</span></label>
                <input type="number" value={pesoG} onChange={e => setPesoG(e.target.value)} style={s.fieldInput} min="0" placeholder="0" />
              </div>
            </div>
          </div>
        )}

        {/* ABA: Descrição */}
        {abaAtiva === 'descricao' && (
          <div>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Descrição do anúncio (texto simples, sem HTML)"
              style={{ width: '100%', minHeight: '260px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85em', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: '0.75em', color: '#999', marginTop: '6px' }}>{descricao.length} caracteres</div>
          </div>
        )}

        {/* ABA: Imagens */}
        {abaAtiva === 'imagens' && (
          <div>
            {/* Zona de upload/paste/drag */}
            <div
              onDrop={e => { e.preventDefault(); Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/')).forEach(uploadParaImgur); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRefRep.current?.click()}
              style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '12px', marginBottom: '14px', cursor: 'pointer', textAlign: 'center', backgroundColor: '#f8fafc', fontSize: '0.82em', color: '#64748b' }}
            >
              <input ref={fileInputRefRep} type="file" accept="image/*" multiple className="hidden" style={{ display: 'none' }} onChange={e => Array.from(e.target.files).forEach(uploadParaImgur)} />
              {uploadandoImagem
                ? <span>⏳ Enviando para Imgur...</span>
                : <span>🖼️ Colar (Ctrl+V), arrastar ou clicar para adicionar imagens</span>
              }
            </div>
            {imagens.length === 0 ? (
              <div style={s.placeholderTab}>Puxe os dados de um anúncio para ver as imagens — ou adicione novas acima.</div>
            ) : (
              <>
                <div style={{ fontSize: '0.82em', color: '#555', marginBottom: '12px' }}>
                  Selecione as imagens que deseja incluir no anúncio replicado:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {imagens.map((url, idx) => {
                    const sel = imagensSelecionadas.has(url);
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleImagem(url)}
                        style={{ position: 'relative', cursor: 'pointer', border: `3px solid ${sel ? '#e67e22' : '#ddd'}`, borderRadius: '6px', overflow: 'hidden', width: '110px', height: '110px' }}
                      >
                        <img src={url} alt={`img-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {!sel && (
                          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontSize: '1.4em' }}>✗</span>
                          </div>
                        )}
                        {sel && (
                          <div style={{ position: 'absolute', bottom: '4px', right: '4px', backgroundColor: '#e67e22', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontSize: '0.75em', fontWeight: 700 }}>✓</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.78em', color: '#888' }}>
                  {imagensSelecionadas.size} de {imagens.length} imagem(ns) selecionada(s)
                </div>
              </>
            )}
          </div>
        )}

        {/* ABA: Ficha Técnica */}
        {abaAtiva === 'fichaTecnica' && (
          <div>
            {atributos.length === 0 ? (
              <div style={s.placeholderTab}>Puxe os dados de um anúncio para ver os atributos da ficha técnica.</div>
            ) : (
              <>
                <div style={{ fontSize: '0.82em', color: '#555', marginBottom: '10px' }}>
                  Edite os valores dos atributos conforme necessário:
                  {atributos.some(a => a.required && !a.readOnly && !a.value_name?.trim()) && (
                    <span style={{ marginLeft: '10px', color: '#dc2626', fontWeight: 700, fontSize: '0.92em' }}>
                      ⚠ Campos obrigatórios em vermelho precisam ser preenchidos
                    </span>
                  )}
                </div>
                {atributos.map((attr, idx) => {
                  const vazio = attr.required && !attr.readOnly && !attr.value_name?.trim();
                  return (
                  <div key={attr.id} style={{ ...s.attrRow, ...(vazio ? { backgroundColor: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 6px' } : {}) }}>
                    <span style={{ ...s.attrName, color: attr.readOnly ? '#aaa' : vazio ? '#dc2626' : '#555', fontWeight: vazio ? 700 : undefined }}>
                      {attr.name}{attr.required && !attr.readOnly ? <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span> : ''}:
                    </span>
                    {attr.readOnly ? (
                      <input
                        type="text"
                        value={attr.value_name}
                        readOnly
                        style={{ ...s.attrInput, backgroundColor: '#f5f5f5', color: '#999', cursor: 'default' }}
                        title="Atributo somente leitura — não será enviado na publicação"
                      />
                    ) : attr.values?.length > 0 ? (
                      <ComboboxAttr attr={attr} idx={idx} atributos={atributos} setAtributos={setAtributos} inputStyle={s.attrInput} />
                    ) : (
                      <input
                        type="text"
                        value={attr.value_name}
                        onChange={e => {
                          const next = [...atributos];
                          next[idx] = { ...attr, value_name: e.target.value, value_id: '' };
                          setAtributos(next);
                        }}
                        style={s.attrInput}
                      />
                    )}
                  </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ABA: Variações */}
        {abaAtiva === 'variacoes' && (
          <div>
            <div style={{ fontSize: '0.78em', color: '#64748b', marginBottom: '12px' }}>
              Edite preço, estoque e SKU por variação. Os atributos de combinação (cor, tamanho, etc.) são copiados do original e não podem ser alterados aqui.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Combinação</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, width: '120px' }}>Preço (R$)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, width: '80px' }}>Estoque</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, width: '140px' }}>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {variacoes.map((v, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', color: '#1e293b' }}>
                        {v.attribute_combinations.map(ac => ac.value_name).join(' / ') || `Variação ${idx + 1}`}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          value={v.price}
                          onChange={e => { const n = [...variacoes]; n[idx] = { ...v, price: e.target.value }; setVariacoes(n); }}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '0.9em', outline: 'none' }}
                          min="0" step="0.01"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          value={v.available_quantity}
                          onChange={e => { const n = [...variacoes]; n[idx] = { ...v, available_quantity: e.target.value }; setVariacoes(n); }}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '0.9em', outline: 'none' }}
                          min="0"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="text"
                          value={v.sku}
                          onChange={e => { const n = [...variacoes]; n[idx] = { ...v, sku: e.target.value }; setVariacoes(n); }}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '0.9em', outline: 'none' }}
                          placeholder="SKU opcional"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Replicação */}
      <div style={s.replicacaoSection}>
        <div style={{ fontSize: '0.95em', fontWeight: 700, color: '#1e293b', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🚀</span> Publicar nas Contas
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={s.sectionTitle}>Contas de Destino</div>
          {contasML.length === 0 ? (
            <div style={{ fontSize: '0.82em', color: '#aaa' }}>Nenhuma conta ML conectada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isCalculandoSimulacao && produtoVinculado && (
                <div style={{ fontSize: '0.78em', color: '#3b82f6', padding: '4px 0' }}>⏳ Calculando frete por conta...</div>
              )}
              {contasML.map(conta => {
                const calcC = precosSimulados[`${conta.id}_classico`];
                const calcP = precosSimulados[`${conta.id}_premium`];
                const temSimulacao = produtoVinculado && (calcC || calcP);
                const tc = getTiposConta(conta.id);
                const selecionada = contasSelecionadas.has(conta.id);
                return (
                  <div key={conta.id} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: selecionada ? '#f0fdf4' : '#fafafa' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={selecionada}
                          onChange={() => toggleConta(conta.id)}
                          style={s.checkbox}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.85em', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conta.nickname}</span>
                        {conta.envioSuportado === 'ME1' && (
                          <span style={{ fontSize: '0.72em', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>ME1</span>
                        )}
                      </label>

                      {/* Tipo por conta */}
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', border: `1.5px solid ${tc.classico ? '#e67e22' : '#e2e8f0'}`, backgroundColor: tc.classico ? '#fff7ed' : '#f8fafc', fontSize: '0.78em', fontWeight: tc.classico ? 700 : 500, color: tc.classico ? '#c2610f' : '#94a3b8', userSelect: 'none' }}>
                          <input type="checkbox" checked={tc.classico} onChange={() => toggleTipoConta(conta.id, 'classico')} style={{ display: 'none' }} />
                          📦 Clássico
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', border: `1.5px solid ${tc.premium ? '#7c3aed' : '#e2e8f0'}`, backgroundColor: tc.premium ? '#f5f3ff' : '#f8fafc', fontSize: '0.78em', fontWeight: tc.premium ? 700 : 500, color: tc.premium ? '#6d28d9' : '#94a3b8', userSelect: 'none' }}>
                          <input type="checkbox" checked={tc.premium} onChange={() => toggleTipoConta(conta.id, 'premium')} style={{ display: 'none' }} />
                          🏆 Premium
                        </label>
                      </div>

                      {temSimulacao && !isCalculandoSimulacao && (
                        <span style={{ display: 'flex', gap: '8px', fontSize: '0.8em', flexShrink: 0 }}>
                          {calcC && tc.classico && (
                            <span style={{ color: '#1e40af', fontWeight: 700 }}>C: R$ {calcC.precoFinal.toFixed(2).replace('.', ',')}</span>
                          )}
                          {calcP && tc.premium && (
                            <span style={{ color: '#6d28d9', fontWeight: 700 }}>P: R$ {calcP.precoFinal.toFixed(2).replace('.', ',')}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {temSimulacao && !isCalculandoSimulacao && selecionada && (
                      <div style={{ borderTop: '1px solid #f3f4f6', padding: '4px 12px 6px' }}>
                        <details>
                          <summary style={{ cursor: 'pointer', fontSize: '0.75em', color: '#6b7280', padding: '3px 0', userSelect: 'none' }}>▶ Ver detalhes do cálculo</summary>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {calcC && tc.classico && (
                              <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ fontSize: '0.78em', fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>📦 Clássico (11%)</div>
                                {renderDetalhesCalculo(calcC)}
                              </div>
                            )}
                            {calcP && tc.premium && (
                              <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ fontSize: '0.78em', fontWeight: 700, color: '#6d28d9', marginBottom: '4px' }}>🏆 Premium (16%)</div>
                                {renderDetalhesCalculo(calcP)}
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Promoções */}
        <div style={s.promoSection}>
          <div style={s.sectionTitle}>Promoções</div>
          <label style={s.checkboxLabel}>
            <input type="checkbox" checked={ativarPromocoes} onChange={e => setAtivarPromocoes(e.target.checked)} style={s.checkbox} />
            Ativar promoções automaticamente após publicar
          </label>
          {ativarPromocoes && !produtoVinculado && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <span style={{ fontSize: '0.8em', color: '#555' }}>Margem inflada para promoção:</span>
              <input
                type="number"
                value={inflarPct}
                onChange={e => setInflarPct(Number(e.target.value) || 0)}
                style={{ width: '60px', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.82em', outline: 'none' }}
                min="0" max="50" step="1"
              />
              <span style={{ fontSize: '0.8em', color: '#888' }}>% (publica inflado, promoção desconta)</span>
            </div>
          )}
          {ativarPromocoes && inflarPct > 0 && (
            <div style={{ marginTop: '8px', marginLeft: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={toleranciaPromo > 0} onChange={e => setTolercanciaPromo(e.target.checked ? 2 : 0)}
                  style={{ width: '14px', height: '14px', accentColor: '#9333ea', cursor: 'pointer' }} />
                <span style={{ fontSize: '0.78em', fontWeight: 600, color: '#7c3aed' }}>Aceitar promoções que ultrapassem a margem em até</span>
              </label>
              {toleranciaPromo > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', marginLeft: '20px' }}>
                  <input type="number" min="0.1" max="20" step="0.5" value={toleranciaPromo}
                    onChange={e => setTolercanciaPromo(Number(e.target.value) || 0)}
                    style={{ width: '56px', padding: '3px 6px', border: '1px solid #d8b4fe', borderRadius: '4px', fontSize: '0.78em', outline: 'none' }} />
                  <span style={{ fontSize: '0.75em', color: '#888' }}>% (aceita até {Number(inflarPct) + Number(toleranciaPromo)}%)</span>
                </div>
              )}
            </div>
          )}

          {/* Preço de Atacado (B2B) */}
          {configAtacado?.ativo && Array.isArray(configAtacado.faixas) && configAtacado.faixas.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <label style={s.checkboxLabel}>
                <input type="checkbox" checked={enviarAtacado} onChange={e => setEnviarAtacado(e.target.checked)} style={s.checkbox} />
                <span style={{ color: '#15803d', fontWeight: 600 }}>Enviar preços de atacado (B2B)</span>
              </label>
              <div style={{ marginLeft: '22px', marginTop: '3px', fontSize: '0.78em', color: '#6b7280' }}>
                Enviará {configAtacado.faixas.length} faixa(s) configurada(s) em Configurações.
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {configAtacado.faixas.map(f => (
                    <span key={f.id} style={{ padding: '1px 8px', borderRadius: '4px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 600 }}>
                      {f.minQtd}+ un → -{f.desconto}%
                    </span>
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Autopeças — exclusivo para categorias de autopeças */}
        {(atributos.some(a => a.id === 'COMPATIBILITY') ||
          (categoriaFullPath && /autopeça|autopeca|peça.*veículo|peça.*automovel|peça.*moto|peça.*carro/i.test(categoriaFullPath))) && (
          <div style={s.autoSecao}>
            <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#444', marginBottom: '10px' }}>🚗 Autopeças:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'uppercase' }}>Compatibilidade de Veículos</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {perfisCompat.length === 0 ? (
                    <div style={{ fontSize: '0.78em', color: '#b45309', backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fcd34d', flex: 1 }}>
                      Nenhum perfil salvo. Crie em "Compatibilidade".
                    </div>
                  ) : (
                    <select
                      value={perfilCompatId}
                      onChange={e => { handlePerfilCompatChange(e.target.value); setCompatRapida(null); }}
                      style={{ flex: 1, padding: '6px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.82em', outline: 'none' }}
                    >
                      <option value="">-- Não aplicar --</option>
                      {perfisCompat.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalPreenchRapido(true)}
                    style={{ padding: '5px 10px', fontSize: '0.78em', fontWeight: 700, border: '1px solid #c4b5fd', color: '#6d28d9', backgroundColor: '#f5f3ff', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                  >
                    ⚡ Preenchimento Rápido
                  </button>
                </div>
                {compatRapida && (
                  <div style={{ marginTop: '6px', fontSize: '0.75em', color: '#6d28d9', backgroundColor: '#f5f3ff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #c4b5fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚡ {compatRapida.length} veículos (preenchimento rápido)</span>
                    <button onClick={() => setCompatRapida(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1em', lineHeight: 1 }}>×</button>
                  </div>
                )}
                {!compatRapida && perfilCompatData && (
                  <div style={{ marginTop: '6px', fontSize: '0.75em', color: '#15803d', backgroundColor: '#f0fdf4', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                    ✅ {(perfilCompatData.compatibilities || []).length} veículos — enviado após criação
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'uppercase' }}>Posição da Peça</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  {POSICOES_AUTOPECA.map(pos => (
                    <label
                      key={pos}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '3px 6px', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '0.78em', fontWeight: 500,
                        border: `1px solid ${posicoesSelecionadas.has(pos) ? '#0891b2' : '#e5e7eb'}`,
                        backgroundColor: posicoesSelecionadas.has(pos) ? '#ecfeff' : 'transparent',
                        color: posicoesSelecionadas.has(pos) ? '#0e7490' : '#555',
                      }}
                    >
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        checked={posicoesSelecionadas.has(pos)}
                        onChange={() => setPosicoesSelecionadas(prev => {
                          const next = new Set(prev);
                          next.has(pos) ? next.delete(pos) : next.add(pos);
                          return next;
                        })}
                      />
                      {pos}
                    </label>
                  ))}
                </div>
                {posicoesSelecionadas.size > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '0.75em', color: '#0e7490', backgroundColor: '#ecfeff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #a5f3fc' }}>
                    ✅ {posicoesSelecionadas.size} posição(ões) selecionada(s)
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {dadosOriginais && (
          <button
            onClick={() => {
              if (!draftIdRef.current) {
                const parsed = extrairId(urlAnuncio);
                draftIdRef.current = parsed ? `replicar_${parsed.id}` : `replicar_${Date.now()}`;
              }
              salvarDraft({
                id: draftIdRef.current, tipo: 'replicar', titulo,
                urlAnuncio, precoVenda, novoSku, quantidade,
                altura, largura, comprimento, pesoG, descricao,
                imagens, imagensSelecionadas: [...imagensSelecionadas],
                atributos, categoriaId, categoriaFullPath, categoriaDomainName,
                contasSelecionadas: [...contasSelecionadas], tiposPorConta,
                ativarPromocoes, toleranciaPromo, enviarAtacado, inflarPct, reduzirPct,
                permitirRetirada, prazoFabricacao,
              });
              alert('Rascunho salvo!');
            }}
            style={{ width: '100%', padding: '11px', marginBottom: '8px', backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.88em', fontWeight: 700, fontFamily: 'inherit' }}
          >
            📝 Salvar Rascunho
          </button>
        )}

        <button
          onClick={handleReplicar}
          disabled={replicando || !dadosOriginais}
          style={s.btnReplicar(replicando || !dadosOriginais)}
          onMouseOver={e => { if (!replicando && dadosOriginais) e.currentTarget.style.backgroundColor = '#15803d'; }}
          onMouseOut={e => { if (!replicando && dadosOriginais) e.currentTarget.style.backgroundColor = '#16a34a'; }}
        >
          {replicando ? '⏳ Replicando...' : '✓ Replicar Anúncio nas Contas Selecionadas'}
        </button>

        <div style={s.footerNote}>
          As tarefas são processadas em background — acompanhe o status em "Gerenciador de Fila".
        </div>
      </div>
      </> }

      {/* Modal de Preenchimento Rápido de Compatibilidade */}
      {modalPreenchRapido && (
        <ModalPreenchimentoRapido
          contaId={contasML[0]?.id}
          usuarioId={usuarioId}
          onClose={() => setModalPreenchRapido(false)}
          onAplicarLocal={(veiculos) => { setCompatRapida(veiculos); setPerfilCompatId(''); setPerfilCompatData(null); setModalPreenchRapido(false); }}
        />
      )}

      {/* Modal de navegação de categoria */}
      {isModalCatOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', height: '80vh', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f8fafc', borderTopLeftRadius: '10px', borderTopRightRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95em', color: '#1e293b' }}>Buscar Categoria</span>
              <button onClick={() => setIsModalCatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3em', color: '#ef4444', fontWeight: 700, lineHeight: 1 }}>&times;</button>
            </div>

            {/* Search */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <input
                type="text"
                placeholder="Buscar categoria por nome... Ex: Placa de Vídeo"
                value={searchCatTerm}
                onChange={e => handleSearchCat(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.87em', outline: 'none', boxSizing: 'border-box' }}
                autoFocus
              />
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff' }}>
              {isLoadingCat ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: '#64748b', fontSize: '0.87em' }}>
                  <div style={{ width: '28px', height: '28px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Carregando categorias...
                </div>
              ) : searchCatTerm ? (
                <div>
                  {searchCatResults.length > 0 ? searchCatResults.map(c => (
                    <button key={c.id} onClick={() => selecionarCatLeaf(c)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', backgroundColor: '#fff', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '0.84em', color: '#374151' }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      {c.fullPath}
                    </button>
                  )) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px', fontSize: '0.87em' }}>Nenhuma categoria encontrada para "{searchCatTerm}"</div>
                  )}
                </div>
              ) : categoryTree.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 24px', fontSize: '0.87em' }}>
                  Nenhuma categoria encontrada. Verifique sua conexão ou tente buscar pelo nome.
                </div>
              ) : (
                <div>
                  {categoryTree.map(c => renderCatNode(c, 0))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
