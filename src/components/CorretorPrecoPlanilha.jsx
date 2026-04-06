import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ── CSV Parser ─────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const result = [];
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ';' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function extrairProdutos(rows) {
  const produtos = [];
  let ignoradosV = 0, ignoradosInativo = 0, ignoradosSemSku = 0;

  for (const row of rows) {
    const sku = (row['Código (SKU)'] || '').trim();
    const tipo = (row['Tipo do produto'] || '').trim().toUpperCase();
    const situacao = (row['Situação'] || '').trim();
    const codigoPai = (row['Código do pai'] || '').trim();

    // Ignora pai de variação (tipo V)
    if (tipo === 'V') { ignoradosV++; continue; }
    if (!sku) { ignoradosSemSku++; continue; }

    const parsePreco = v => typeof v === 'number' ? v : parseFloat(String(v || '0').replace(',', '.')) || 0;
    const preco = parsePreco(row['Preço']);
    const precoCusto = parsePreco(row['Preço de custo']);
    const precoPromocional = parsePreco(row['Preço promocional']);
    const ativo = situacao.toLowerCase() === 'ativo';

    if (!ativo) { ignoradosInativo++; }

    produtos.push({
      sku,
      descricao: (row['Descrição'] || '').replace(/<[^>]*>/g, '').trim(),
      preco,
      precoCusto,
      precoPromocional,
      situacao,
      ativo,
      tipoProduto: tipo,
      codigoPai,
      ehFilho: !!codigoPai,
    });
  }

  return { produtos, ignoradosV, ignoradosInativo, ignoradosSemSku };
}

// ── Preview de preço ───────────────────────────────────────────────────────
function calcularPrecoCorrigir(precoBase, inflar, reduzir) {
  if (!precoBase || precoBase <= 0) return null;
  const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);
  let precoFinal = inflarSafe > 0 ? precoBase / (1 - inflarSafe / 100) : precoBase;
  if (precoFinal >= 79 && reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) precoFinal = 78.99;
  return Math.round(precoFinal * 100) / 100;
}

function calcularPrecoRegraSimples(precoBase, regra, tipoML, inflar, reduzir, custoFrete = 0) {
  if (!precoBase || !regra || precoBase <= 0) return { preco: null, historico: [] };
  const hist = [{ label: 'Base CSV', valor: precoBase }];
  let custoBase = precoBase;
  let totalTaxasPerc = 0;
  (regra.variaveis || []).forEach(v => {
    if (v.tipo === 'fixo_custo') { custoBase += v.valor; hist.push({ label: v.nome, valor: v.valor }); }
    else if (v.tipo === 'perc_custo') { const c = custoBase * (v.valor / 100); custoBase += c; hist.push({ label: `${v.nome} (${v.valor}%)`, valor: c }); }
    else if (v.tipo === 'perc_venda') totalTaxasPerc += v.valor;
  });
  const tarifaML = tipoML === 'premium' ? 16 : 11;
  const netFactor = 1 - ((tarifaML + totalTaxasPerc) / 100);
  if (netFactor <= 0) return { preco: Math.round(custoBase * 100) / 100, historico: hist };
  const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);

  // Preço alvo inicial sem frete (para saber se >= 79)
  let precoAlvo = (custoBase + 6) / netFactor;
  let precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
  const acima79 = precoFinal >= 79;

  // Acima de R$79 o frete grátis é obrigatório — inclui no custo
  if (acima79 && custoFrete > 0) {
    precoAlvo = (custoBase + custoFrete) / netFactor;
    precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
  }

  if (acima79 && reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) precoFinal = 78.99;

  hist.push({ label: `Tarifa ML (${tipoML === 'premium' ? 'Premium' : 'Clássico'})`, valor: precoAlvo * (tarifaML / 100), perc: tarifaML });
  if (totalTaxasPerc > 0) hist.push({ label: `Taxas adicionais`, valor: precoAlvo * (totalTaxasPerc / 100), perc: totalTaxasPerc });
  if (!acima79) hist.push({ label: 'Custo fixo ML', valor: 6 });
  if (acima79 && custoFrete > 0) hist.push({ label: 'Frete grátis (ML)', valor: custoFrete });
  if (inflarSafe > 0) hist.push({ label: `Inflado ${inflarSafe}%`, valor: Math.round((precoFinal - precoAlvo) * 100) / 100, perc: inflarSafe });
  return { preco: Math.round(precoFinal * 100) / 100, historico: hist };
}

function resolverPrecoBase(produto, tipoBase) {
  if (tipoBase === 'custo') return produto.precoCusto > 0 ? produto.precoCusto : produto.preco;
  if (tipoBase === 'promocional') return produto.precoPromocional > 0 ? produto.precoPromocional : produto.preco;
  return produto.preco;
}

// ── Formatação ─────────────────────────────────────────────────────────────
const fmtBRL = v => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtDiff = (novo, atual) => {
  if (!novo || !atual) return null;
  const diff = ((novo - atual) / atual) * 100;
  return diff;
};

// ── Componente principal ───────────────────────────────────────────────────
export default function CorretorPrecoPlanilha({ usuarioId }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  // CSV State
  const [produtos, setProdutos] = useState([]);       // todos os produtos do CSV
  const [csvStats, setCsvStats] = useState(null);
  const [incluirInativos, setIncluirInativos] = useState(false);

  // Config
  const [regrasPreco, setRegrasPreco] = useState([]);
  const [contasML, setContasML] = useState([]);
  const [configAtacado, setConfigAtacado] = useState(null);
  const [tipoBase, setTipoBase] = useState('venda');
  const [regraId, setRegraId] = useState('');
  // regrasPorConta: usa regraPrecoId de cada ContaML (configurado nas Configurações)
  // regrasContaMap: override local para esta sessão { contaId: regraId }
  const [regrasPorConta, setRegrasPorConta] = useState(false);
  const [regrasContaMap, setRegrasContaMap] = useState({});
  const [inflar, setInflar] = useState(0);
  const [reduzir, setReduzir] = useState(0);
  const [removerPromocoes, setRemoverPromocoes] = useState(false);
  const [enviarAtacado, setEnviarAtacado] = useState(false);
  const [ativarPromocoes, setAtivarPromocoes] = useState(false);
  const [toleranciaPromo, setTolercanciaPromo] = useState(0);

  // Resultados
  const [anunciosMap, setAnunciosMap] = useState({}); // sku → ad[]
  const [buscado, setBuscado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  // Tabela
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'match' | 'sem_match'
  const [detalheAberto, setDetalheAberto] = useState(null); // key da linha com detalhe aberto
  const [selecionados, setSelecionados] = useState(new Set()); // `${adId}||${contaId}`
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(r => r.json())
      .then(d => {
        if (d.regrasPreco) setRegrasPreco(d.regrasPreco);
        const contas = d.contasML || [];
        if (contas.length) setContasML(contas);
        if (d.configAtacado) setConfigAtacado(d.configAtacado);
        // Pré-carrega o mapa com as regras configuradas nas Configurações
        const mapa = {};
        for (const c of contas) { if (c.regraPrecoId) mapa[c.id] = c.regraPrecoId; }
        if (Object.keys(mapa).length > 0) {
          setRegrasContaMap(mapa);
          setRegrasPorConta(true);
        } else if (d.regrasPreco?.length) {
          setRegraId(d.regrasPreco[0].id);
        }
      })
      .catch(() => {});
  }, [usuarioId]);

  // ── Processar arquivo (CSV, XLS, XLSX) ────────────────────────────────
  const processarArquivo = useCallback((file) => {
    if (!file || !file.name.match(/\.(csv|xls|xlsx)$/i)) {
      alert('Selecione um arquivo .csv, .xls ou .xlsx exportado do ERP.');
      return;
    }
    setFileName(file.name);
    const isExcel = file.name.match(/\.xlsx?$/i);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let rows;
        if (isExcel) {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        } else {
          rows = parseCSV(e.target.result);
        }
        if (rows.length === 0) {
          alert('Arquivo vazio ou sem dados na primeira aba.');
          return;
        }
        const { produtos: p, ignoradosV, ignoradosInativo, ignoradosSemSku } = extrairProdutos(rows);
        if (p.length === 0 && rows.length > 0) {
          const colunas = Object.keys(rows[0]).join(', ');
          alert(`Nenhum produto encontrado.\n\nColunas detectadas:\n${colunas}\n\nEsperado: "Código (SKU)", "Tipo do produto", "Situação", "Preço" etc.\n\nCertifique-se de exportar via Produtos → Exportar → CSV/Excel no ERP.`);
          setFileName('');
          return;
        }
        setProdutos(p);
        setCsvStats({ total: rows.length, ignoradosV, ignoradosInativo, ignoradosSemSku, totalProdutos: p.length });
        setBuscado(false);
        setSelecionados(new Set());
        setAnunciosMap({});
      } catch (err) {
        alert(`Erro ao ler o arquivo: ${err.message}`);
        setFileName('');
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processarArquivo(file);
  }, [processarArquivo]);

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processarArquivo(file);
    e.target.value = '';
  };

  // ── Buscar Anúncios ML ─────────────────────────────────────────────────
  const produtosFiltrados = produtos.filter(p => incluirInativos ? true : p.ativo);

  const buscarAnuncios = async () => {
    if (produtosFiltrados.length === 0) return;
    setLoading(true);
    setLoadingMsg('Buscando anúncios no banco local...');
    setBuscado(false);
    setSelecionados(new Set());

    try {
      const skus = [...new Set(produtosFiltrados.map(p => p.sku))];
      const res = await fetch('/api/ml/anuncios-por-skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, skus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao buscar');

      // Monta mapa: sku → ad[]
      const mapa = {};
      for (const ad of (data.anuncios || [])) {
        // Verifica match por sku direto
        if (ad.sku && skus.includes(ad.sku)) {
          if (!mapa[ad.sku]) mapa[ad.sku] = [];
          if (!mapa[ad.sku].find(a => a.id === ad.id)) mapa[ad.sku].push(ad);
        }
        // Verifica match por variações
        for (const varSku of (ad.skusVariacoes || [])) {
          if (skus.includes(varSku)) {
            if (!mapa[varSku]) mapa[varSku] = [];
            if (!mapa[varSku].find(a => a.id === ad.id)) mapa[varSku].push(ad);
          }
        }
      }

      setAnunciosMap(mapa);
      setBuscado(true);

      // Auto-selecionar todos com match
      const novoSet = new Set();
      for (const [, ads] of Object.entries(mapa)) {
        for (const ad of ads) novoSet.add(`${ad.id}||${ad.contaId}`);
      }
      setSelecionados(novoSet);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  // ── Linhas da tabela ───────────────────────────────────────────────────
  const regraGlobal = regrasPreco.find(r => r.id === regraId);
  const linhas = [];

  for (const produto of produtosFiltrados) {
    const ads = anunciosMap[produto.sku] || [];
    const precoBase = resolverPrecoBase(produto, tipoBase);

    if (ads.length === 0) {
      if (buscado) {
        linhas.push({ produto, ad: null, precoBase, precoCalculado: null, key: `sem_${produto.sku}` });
      }
    } else {
      for (const ad of ads) {
        const tipoML = (ad.dadosML?.listing_type_id || '').includes('pro') ? 'premium' : 'classico';
        const regra = regrasPorConta
          ? regrasPreco.find(r => r.id === regrasContaMap[ad.contaId])
          : regraGlobal;
        let precoCalculado, historico;
        if (regra) {
          const r = calcularPrecoRegraSimples(precoBase, regra, tipoML, Number(inflar), Number(reduzir), ad.custoFrete || 0);
          precoCalculado = r.preco; historico = r.historico;
        } else {
          precoCalculado = calcularPrecoCorrigir(precoBase, Number(inflar), Number(reduzir));
          historico = [
            { label: 'Base CSV', valor: precoBase },
            ...(Number(inflar) > 0 ? [{ label: `Inflado ${inflar}%`, valor: precoCalculado - precoBase, perc: Number(inflar) }] : []),
          ];
        }
        linhas.push({
          produto, ad, precoBase, precoCalculado, tipoML, historico,
          key: `${produto.sku}||${ad.id}`,
          itemKey: `${ad.id}||${ad.contaId}`,
        });
      }
    }
  }

  const linhasFiltradas = linhas.filter(l => {
    if (filtro === 'match') return !!l.ad;
    if (filtro === 'sem_match') return !l.ad;
    return true;
  });

  const totalComMatch = linhas.filter(l => !!l.ad).length;
  const totalSemMatch = linhas.filter(l => !l.ad).length;

  // ── Aplicar ────────────────────────────────────────────────────────────
  const aplicarCorrecao = async () => {
    if (selecionados.size === 0) return alert('Selecione ao menos um anúncio.');
    setAplicando(true);
    try {
      // Monta items: cada item precisa de { id, contaId, sku }
      // e monta precosCSV: { [sku]: { preco, preco_custo, preco_promocional } }
      const produtoMapSku = {};
      for (const p of produtosFiltrados) produtoMapSku[p.sku] = p;

      const items = [];
      const precosCSV = {};

      for (const linha of linhas) {
        if (!linha.ad || !selecionados.has(linha.itemKey)) continue;
        const adId = linha.ad.id;
        const contaId = linha.ad.contaId;
        // Determine the SKU that matches this ad
        const skuParaPreco = linha.produto.sku;
        if (!items.find(i => i.id === adId)) {
          items.push({ id: adId, contaId, sku: skuParaPreco });
        }
        const p = linha.produto;
        precosCSV[skuParaPreco] = {
          preco: p.preco,
          preco_custo: p.precoCusto,
          preco_promocional: p.precoPromocional,
        };
      }

      if (items.length === 0) return alert('Nenhum item válido selecionado.');

      const res = await fetch('/api/ml/corrigir-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuarioId,
          items,
          modo: 'csv',
          regraId: !regrasPorConta ? (regraId || undefined) : undefined,
          regraIdPorConta: regrasPorConta ? regrasContaMap : undefined,
          inflar: Number(inflar),
          reduzir: Number(reduzir),
          removerPromocoes,
          enviarAtacado,
          ativarPromocoes,
          toleranciaPromo: ativarPromocoes ? (Number(toleranciaPromo) || 0) : 0,
          precosCSV,
          precosCSVTipoBase: tipoBase,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      alert(`✅ Enviado para a fila!\n${items.length} anúncio(s) serão atualizados.\n\nAcompanhe na aba "Gerenciador de Fila".`);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setAplicando(false);
    }
  };

  // ── Toggle seleção ─────────────────────────────────────────────────────
  const toggleItem = (key) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleTodos = () => {
    const keysVisiveis = linhasFiltradas.filter(l => !!l.ad).map(l => l.itemKey);
    const todosSelecionados = keysVisiveis.every(k => selecionados.has(k));
    setSelecionados(prev => {
      const next = new Set(prev);
      if (todosSelecionados) keysVisiveis.forEach(k => next.delete(k));
      else keysVisiveis.forEach(k => next.add(k));
      return next;
    });
  };

  const keysVisiveis = linhasFiltradas.filter(l => !!l.ad).map(l => l.itemKey);
  const todosSelecionados = keysVisiveis.length > 0 && keysVisiveis.every(k => selecionados.has(k));

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-full">
      {/* Header */}
      <div className="rounded-xl overflow-hidden shadow-sm border border-emerald-200">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-600 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-black text-lg tracking-tight">Corretor de Preço via Planilha</h1>
            <p className="text-emerald-100 text-xs mt-0.5">Importe o CSV do ERP e corrija preços em massa sem consumir a API</p>
          </div>
          <div className="bg-white/20 rounded-lg p-2">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Coluna Esquerda: Upload + Config ── */}
        <div className="space-y-4">

          {/* Upload */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="font-bold text-sm text-gray-700">1. Importar Planilha</span>
            </div>
            <div className="p-4">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50'}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={onFileChange} />
                {fileName ? (
                  <div>
                    <svg className="w-8 h-8 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-bold text-emerald-700 truncate">{fileName}</p>
                    <p className="text-xs text-gray-400 mt-1">Clique para trocar</p>
                  </div>
                ) : (
                  <div>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm font-semibold text-gray-500">Arraste o CSV aqui</p>
                    <p className="text-xs text-gray-400 mt-1">ou clique para selecionar</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const ws = XLSX.utils.aoa_to_sheet([
                    ['Código (SKU)', 'Descrição', 'Tipo do produto', 'Situação', 'Código do pai', 'Preço', 'Preço de custo', 'Preço promocional'],
                    ['SKU001', 'Produto Exemplo 1', 'P', 'Ativo', '', '99,90', '45,00', '89,90'],
                    ['SKU002', 'Produto Exemplo 2', 'P', 'Ativo', '', '149,90', '70,00', ''],
                    ['SKU003-P', 'Produto com Variação (pai)', 'V', 'Ativo', '', '', '', ''],
                    ['SKU003-A', 'Produto com Variação (filho)', 'S', 'Ativo', 'SKU003-P', '79,90', '35,00', '69,90'],
                  ]);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
                  XLSX.writeFile(wb, 'planilha_exemplo_corretor.xlsx');
                }}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-400 rounded-lg py-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Baixar planilha de exemplo (.xlsx)
              </button>

              {csvStats && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Total na planilha</span>
                    <span className="font-bold text-gray-700">{csvStats.total}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Ativos</span>
                    <span className="font-bold text-emerald-600">{produtos.filter(p => p.ativo).length}</span>
                  </div>
                  {csvStats.ignoradosV > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Ignorados (pai variação)</span>
                      <span className="font-semibold text-gray-400">{csvStats.ignoradosV}</span>
                    </div>
                  )}
                  {csvStats.ignoradosInativo > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Inativos</span>
                      <span className="font-semibold text-amber-500">{csvStats.ignoradosInativo}</span>
                    </div>
                  )}
                  {csvStats.ignoradosInativo > 0 && (
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input type="checkbox" checked={incluirInativos} onChange={e => setIncluirInativos(e.target.checked)} className="rounded border-gray-300 text-emerald-600" />
                      <span className="text-xs text-gray-600">Incluir inativos</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Configurações */}
          {csvStats && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span className="font-bold text-sm text-gray-700">2. Configurar Regras</span>
              </div>
              <div className="p-4 space-y-3">

                {/* Tipo base */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Preço Base da Planilha</label>
                  <select value={tipoBase} onChange={e => setTipoBase(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="venda">Preço de Venda</option>
                    <option value="custo">Preço de Custo</option>
                    <option value="promocional">Preço Promocional (se existir, senão usa Venda)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {tipoBase === 'venda' && 'Usa a coluna de preço de venda da planilha como base do cálculo.'}
                    {tipoBase === 'custo' && 'Usa a coluna de preço de custo da planilha como base do cálculo.'}
                    {tipoBase === 'promocional' && 'Usa o preço promocional quando preenchido; caso vazio, usa o preço de venda.'}
                  </p>
                </div>

                {/* Regra */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">Regra de Markup</label>
                    {contasML.length > 0 && regrasPreco.length > 0 && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={regrasPorConta}
                          onChange={e => {
                            setRegrasPorConta(e.target.checked);
                            if (!e.target.checked) setRegrasContaMap({});
                          }}
                          className="rounded border-gray-300 text-emerald-600"
                        />
                        <span className="text-[10px] text-gray-500 font-medium">Regra por conta</span>
                      </label>
                    )}
                  </div>

                  {!regrasPorConta ? (
                    <>
                      <select value={regraId} onChange={e => setRegraId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                        <option value="">Sem regra — publica o preço base diretamente</option>
                        {regrasPreco.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                      </select>
                      {regrasPreco.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">Nenhuma regra cadastrada. Configure em Configurações API.</p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 mt-1">
                      {contasML.map(conta => {
                        const temPadrao = !!conta.regraPrecoId;
                        return (
                          <div key={conta.id} className="flex items-center gap-2">
                            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 w-24 truncate" title={conta.nickname}>{conta.nickname}</span>
                            <select
                              value={regrasContaMap[conta.id] || ''}
                              onChange={e => setRegrasContaMap(prev => ({ ...prev, [conta.id]: e.target.value }))}
                              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            >
                              <option value="">Sem regra</option>
                              {regrasPreco.map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.nome}{temPadrao && conta.regraPrecoId === r.id ? ' ★' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                      <p className="text-[10px] text-gray-400">★ = regra padrão configurada nas Configurações API</p>
                    </div>
                  )}
                </div>

                {/* Inflar / Reduzir */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Inflar Preço (%)</label>
                    <input type="number" min="0" max="99" step="0.5" value={inflar} onChange={e => setInflar(e.target.value)}
                      placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <p className="text-[10px] text-gray-400 mt-1">Publica o preço X% acima do calculado para ter margem para promoções do ML.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-red-500 uppercase tracking-wide mb-1">Fugir do Frete Grátis (%)</label>
                    <input type="number" min="0" max="99" step="0.5" value={reduzir} onChange={e => setReduzir(e.target.value)}
                      placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <p className="text-[10px] text-gray-400 mt-1">Se o preço final ficar ≥ R$79, reduz até X% para tentar cravar em R$78,99.</p>
                  </div>
                </div>

                {/* Opções */}
                <div className="space-y-1.5 pt-1 border-t border-gray-100">
                  {[
                    { key: 'removerPromocoes', label: 'Remover promoções ativas antes de atualizar o preço', val: removerPromocoes, set: setRemoverPromocoes },
                    { key: 'atacado', label: `Enviar preços de atacado (B2B) ${configAtacado?.ativo ? '— ' + configAtacado.faixas?.length + ' faixa(s) configurada(s)' : '(inativo)'}`, val: enviarAtacado, set: setEnviarAtacado },
                    { key: 'promos', label: 'Ativar campanhas de promoção do ML automaticamente', val: ativarPromocoes, set: setAtivarPromocoes },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={opt.val} onChange={e => opt.set(e.target.checked)}
                        className="rounded border-gray-300 text-emerald-600" />
                      <span className="text-xs text-gray-600">{opt.label}</span>
                    </label>
                  ))}
                  {ativarPromocoes && inflar > 0 && (
                    <div className="ml-5 space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={toleranciaPromo > 0} onChange={e => setTolercanciaPromo(e.target.checked ? 2 : 0)}
                          className="rounded border-purple-300 text-purple-500" />
                        <span className="text-xs text-purple-600 font-medium">Aceitar promoções que ultrapassem a margem em até</span>
                      </label>
                      {toleranciaPromo > 0 && (
                        <div className="flex items-center gap-2 ml-5">
                          <input type="number" min="0.1" max="20" step="0.5" value={toleranciaPromo}
                            onChange={e => setTolercanciaPromo(Number(e.target.value) || 0)}
                            className="w-14 px-2 py-0.5 text-xs border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-400" />
                          <span className="text-xs text-gray-400">% (aceita até {Number(inflar) + Number(toleranciaPromo)}%)</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Buscar */}
                <button
                  onClick={buscarAnuncios}
                  disabled={loading || produtosFiltrados.length === 0}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {loadingMsg || 'Buscando...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      3. Buscar Anúncios ML ({produtosFiltrados.length} SKUs)
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Coluna Direita: Resultados ── */}
        <div className="lg:col-span-2">
          {!csvStats && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 text-sm font-semibold">Importe a planilha CSV do ERP para começar</p>
              <p className="text-gray-300 text-xs mt-1">Exporte em: Produtos → Exportar → CSV</p>
            </div>
          )}

          {csvStats && !buscado && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <svg className="w-12 h-12 text-emerald-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-gray-500 text-sm font-semibold">
                {produtosFiltrados.length} produto(s) prontos para buscar
              </p>
              <p className="text-gray-300 text-xs mt-1">Configure as regras e clique em "Buscar Anúncios ML"</p>
            </div>
          )}

          {buscado && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Summary + Filtros */}
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-700">Resultados</span>
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{totalComMatch} com match</span>
                  {totalSemMatch > 0 && <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-0.5 rounded-full">{totalSemMatch} sem match</span>}
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'match', label: 'Com match' },
                    { id: 'sem_match', label: 'Sem match' },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFiltro(f.id)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${filtro === f.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabela */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-left">
                        <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                          className="rounded border-gray-300 text-emerald-600" />
                      </th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">SKU</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">MLB</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wide">Produto</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Base CSV</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-bold uppercase tracking-wide">Conta</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Atual ML</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-bold uppercase tracking-wide">Calculado*</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-bold uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {linhasFiltradas.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-300">Nenhum resultado para este filtro</td></tr>
                    )}
                    {linhasFiltradas.map(linha => {
                      if (!linha.ad) {
                        return (
                          <tr key={linha.key} className="opacity-40">
                            <td className="px-3 py-2"><input type="checkbox" disabled className="rounded border-gray-200" /></td>
                            <td className="px-3 py-2 font-mono font-bold text-gray-400">{linha.produto.sku}</td>
                            <td className="px-3 py-2 text-center">—</td>
                            <td className="px-3 py-2 text-gray-400 max-w-[180px] truncate" title={linha.produto.descricao}>{linha.produto.descricao}</td>
                            <td className="px-3 py-2 text-right text-gray-400">{fmtBRL(linha.precoBase)}</td>
                            <td className="px-3 py-2 text-center">—</td>
                            <td className="px-3 py-2 text-right">—</td>
                            <td className="px-3 py-2 text-right">—</td>
                            <td className="px-3 py-2 text-center">
                              <span className="bg-gray-100 text-gray-400 px-2 py-0.5 rounded font-bold">Sem match</span>
                            </td>
                          </tr>
                        );
                      }

                      const selecionado = selecionados.has(linha.itemKey);
                      const diff = fmtDiff(linha.precoCalculado, linha.ad.preco);
                      const precoJaIdeal = linha.precoCalculado != null && Math.abs(linha.precoCalculado - linha.ad.preco) < 0.02;

                      return (
                        <tr key={linha.key} className={`hover:bg-gray-50 transition-colors ${selecionado ? 'bg-emerald-50/30' : ''}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={selecionado} onChange={() => toggleItem(linha.itemKey)}
                              className="rounded border-gray-300 text-emerald-600" />
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-gray-600">{linha.produto.sku}</td>
                          <td className="px-3 py-2 font-mono text-gray-500 text-[10px] break-all max-w-[80px]">
                            <a href={`https://produto.mercadolivre.com.br/${linha.ad.id}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-600 hover:underline">{linha.ad.id}</a>
                          </td>
                          <td className="px-3 py-2 max-w-[180px]">
                            <div className="truncate text-gray-700" title={linha.produto.descricao}>{linha.produto.descricao}</div>
                            <div className="text-gray-400 font-mono truncate" title={linha.ad.titulo}>{linha.ad.titulo}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-700">{fmtBRL(linha.precoBase)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">{linha.ad.conta?.nickname || '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-700">{fmtBRL(linha.ad.preco)}</td>
                          <td className="px-3 py-2 text-right">
                            {linha.precoCalculado != null ? (
                              <div className="relative inline-block">
                                <button
                                  onClick={() => setDetalheAberto(detalheAberto === linha.key ? null : linha.key)}
                                  className="text-right group"
                                >
                                  <span className={`font-black underline decoration-dotted ${precoJaIdeal ? 'text-gray-400' : 'text-emerald-700'}`}>{fmtBRL(linha.precoCalculado)}</span>
                                  {!precoJaIdeal && diff != null && (
                                    <span className={`ml-1 text-[10px] font-bold ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                    </span>
                                  )}
                                  {precoJaIdeal && <span className="ml-1 text-[10px] text-gray-400">= atual</span>}
                                </button>
                                {detalheAberto === linha.key && linha.historico?.length > 0 && (
                                  <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56 text-left">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">Detalhamento</p>
                                    <div className="space-y-1">
                                      {linha.historico.map((h, i) => (
                                        <div key={i} className="flex justify-between text-[11px]">
                                          <span className="text-gray-600">{h.label}</span>
                                          <span className={`font-bold ${i === 0 ? 'text-gray-700' : 'text-red-500'}`}>
                                            {i === 0 ? fmtBRL(h.valor) : `+ ${fmtBRL(h.valor)}`}
                                            {h.perc ? ` (${h.perc}%)` : ''}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between text-[11px]">
                                      <span className="font-black text-gray-700">Total</span>
                                      <span className="font-black text-emerald-700">{fmtBRL(linha.precoCalculado)}</span>
                                    </div>
                                    {(linha.ad?.custoFrete == null || linha.ad.custoFrete === 0) && (
                                      <p className="text-[9px] text-gray-400 mt-1">* Frete não disponível</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${linha.ad.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {linha.ad.status === 'active' ? 'Ativo' : linha.ad.status === 'paused' ? 'Pausado' : linha.ad.status || '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-400">* Frete obtido da API do ML por anúncio.</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500">{selecionados.size} selecionado(s)</span>
                  <button
                    onClick={aplicarCorrecao}
                    disabled={aplicando || selecionados.size === 0}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    {aplicando ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {aplicando ? 'Enviando...' : `Aplicar em ${selecionados.size} anúncio(s)`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
