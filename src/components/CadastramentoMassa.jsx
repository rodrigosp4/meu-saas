import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SeletorCategoria from './CriarAnuncio/SeletorCategoria';
import { stripHtml } from '../utils/formatters';

// === VALIDAÇÃO DINÂMICA VIA API DO MERCADO LIVRE ===
const isRequired = (attr) => {
  return Boolean(attr.tags?.required || attr.tags?.catalog_required);
};

// === FUNÇÕES AUXILIARES DE CÁLCULO E VALIDAÇÃO ===
const validateImageDimensions = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width >= 500 && img.height >= 500);
    img.onerror = () => resolve(false);
    img.src = url;
  });
};

const sanitizeTitle = (title) => title ? title.substring(0, 60) : '';

// CSV Helpers
const exportToCSV = (filename, rows) => {
  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.map(e => e.join(";")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const parseCSV = (csvText) => {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter(l => l.trim() !== '');

  const headerIndex = lines.findIndex(l => {
    const str = l.replace(/"/g, '').toLowerCase();
    return str.startsWith('sku;') || str.startsWith('sku,');
  });

  if (headerIndex === -1) {
    alert("Erro: Formato da planilha inválido. A linha contendo 'SKU' não foi encontrada.");
    return [];
  }

  const delimiter = lines[headerIndex].includes(';') ? ';' : ',';

  const splitCsvLine = (text) => {
    let ret =[], p = '', quote = false;
    for (let i = 0; i < text.length; i++) {
      let c = text[i];
      if (c === '"') {
        if (quote && text[i+1] === '"') { p += '"'; i++; } 
        else quote = !quote;
      } else if (c === delimiter && !quote) {
        ret.push(p); p = '';
      } else {
        p += c;
      }
    }
    ret.push(p);
    return ret.map(v => v.trim());
  };

  const headers = splitCsvLine(lines[headerIndex]);

  let dataStartIndex = headerIndex + 1;
  if (lines[dataStartIndex] && (
    lines[dataStartIndex].includes('[OBRIGATÓRIO]') || 
    lines[dataStartIndex].includes('[Opcional]') || 
    lines[dataStartIndex].includes('Não alterar')
  )) {
    dataStartIndex++; 
  }

  return lines.slice(dataStartIndex).map(line => {
    const values = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] !== undefined ? values[i] : '';
    });
    return obj;
  });
};

export default function CadastramentoMassa({ usuarioId }) {
  const { canUseResource } = useAuth();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  // == DADOS GERAIS ==
  const [contasML, setContasML] = useState([]);
  const[regrasPreco, setRegrasPreco] = useState([]);
  
  // == PASSO 1: Seleção ==
  const [produtosDB, setProdutosDB] = useState([]);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [selectedSkus, setSelectedSkus] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Sem Anúncios'); 
  const [currentPage, setCurrentPage] = useState(1);
  const[isSelectingAll, setIsSelectingAll] = useState(false);
  const itemsPerPage = 50;
  
  // == PASSO 2: Setup (Contas, Regra, Tipos, Estratégia) ==
  const [contasSelecionadas, setContasSelecionadas] = useState([]); // ✅ Array de IDs das contas selecionadas
  const[tiposAnuncio, setTiposAnuncio] = useState({ classico: false, premium: true }); // ✅ Clássico / Premium
  const [strategy, setStrategy] = useState({ inflar: 0, reduzir: 0, enviarAtacado: false, ativarPromocoes: false, toleranciaPromo: 0 }); // ✅ Estratégia de preço
  const [configAtacado, setConfigAtacado] = useState(null);
  const [posicaoGlobal, setPosicaoGlobal] = useState(''); // ADICIONE ESTA LINHA
  
  const[regraSelecionada, setRegraSelecionada] = useState('');
  const [categoriaSelecionadaObj, setCategoriaSelecionadaObj] = useState(null); 
  const categoriaId = categoriaSelecionadaObj?.category_id || ''; 
  const[atributosCategoria, setAtributosCategoria] = useState([]);

  // == PASSO 3 & 4: Processamento e IA ==
  const [produtosProcessados, setProdutosProcessados] = useState([]);
  const [verificandoSku, setVerificandoSku] = useState(null); // <-- ADICIONE ESTA LINHA

// ✅ NOVA FUNÇÃO: Busca os dados mais recentes do Tiny e revalida o produto
  const handleReverificarProduto = async (produto) => {
    const tinyId = produto.dadosTiny?.id;
    if (!tinyId) {
      alert("ID do Tiny não encontrado para este produto.");
      return;
    }

    setVerificandoSku(produto.sku);
    try {
      // 1. Busca dados frescos do ERP (Tiny ou Bling)
      const res = await fetch('/api/tiny-produto-detalhes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tinyId, userId: usuarioId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || "Falha ao buscar no ERP");

      // 2. Extrai imagens e refaz validação de dimensões (>= 500px)
      let imagensValidas = [];
      const anexos = Array.isArray(data.anexos) ? data.anexos : Object.values(data.anexos || {});
      for (const anexo of anexos) {
        const url = anexo.anexo || anexo.url;
        if (url) {
          const isValid = await validateImageDimensions(url);
          if (isValid) imagensValidas.push(url);
        }
      }

      // 3. Atualiza Ficha Técnica (ex: BRAND e GTIN, que vêm direto da Tiny)
      const novaFicha = { ...produto.fichaTecnica };
      if (data.marca) novaFicha['BRAND'] = data.marca;
      if (data.gtin || data.ean) novaFicha['GTIN'] = data.gtin || data.ean;

      // 4. Revalida se agora o produto passa nas regras
      const erroValidacao = validarFichaTecnica(novaFicha, imagensValidas);

      // 5. Atualiza o produto na lista da interface
      setProdutosProcessados(prev => prev.map(p => {
        if (p.sku === produto.sku) {
          return {
            ...p,
            dadosTiny: data,
            tituloML: sanitizeTitle(data.nome || p.nome),
            descricao: stripHtml(data.descricao_complementar || data.descricao || ''),
            imagens: imagensValidas,
            fichaTecnica: novaFicha,
            erro: erroValidacao,
            prontoParaEnvio: !erroValidacao
          };
        }
        return p;
      }));

    } catch (error) {
      alert("Erro ao verificar produto: " + error.message);
    } finally {
      setVerificandoSku(null);
    }
  };

  const refreshTokenIfNeeded = async (conta) => {
    if (conta.expiresAt && Date.now() < (conta.expiresAt - 120000)) return conta.accessToken;
    try {
      const res = await fetch('/api/ml/refresh-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: conta.refreshToken })
      });
      const data = await res.json();
      return data.access_token;
    } catch (e) { return null; }
  };

  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`).then(r => r.json()).then(d => {
      setContasML(d.contasML || []);
      setRegrasPreco(d.regrasPreco || []);
      if (d.configAtacado) setConfigAtacado(d.configAtacado);
    });
  },[usuarioId]);

  useEffect(() => {
    if (!categoriaId) return;
    fetch(`/api/ml/category-attributes/${categoriaId}`).then(r => r.json()).then(data => {
      setAtributosCategoria(data.filter(a => !a.tags?.read_only));
    });
  }, [categoriaId]);

  const fetchProdutos = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/produtos?userId=${usuarioId}&page=${currentPage}&limit=${itemsPerPage}&search=${searchTerm}&status=${statusFilter}`);
      const data = await res.json();
      setProdutosDB(data.produtos ||[]);
      setTotalProdutos(data.total || 0);
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProdutos();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [usuarioId, searchTerm, currentPage, statusFilter]);

  const addLog = (msg) => setLogs(p => [...p, msg]);
  const totalPages = Math.ceil(totalProdutos / itemsPerPage);

  const handleSelectPage = (marcar) => {
    const newSet = new Set(selectedSkus);
    produtosDB.forEach(p => {
      if (marcar) newSet.add(p.sku);
      else newSet.delete(p.sku);
    });
    setSelectedSkus(newSet);
  };
  
  const handleSelectAllFiltered = async () => {
    if (totalProdutos === 0) return;
    setIsSelectingAll(true);
    try {
      const params = new URLSearchParams({ userId: usuarioId, search: searchTerm, status: statusFilter });
      const res = await fetch(`/api/produtos/skus-filtrados?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao buscar todos os SKUs');
      setSelectedSkus(new Set(data.skus));
    } catch (error) {
      console.error(error);
      alert('Erro ao selecionar: ' + error.message);
    } finally {
      setIsSelectingAll(false);
    }
  };
  
  const isAllPageSelected = produtosDB.length > 0 && produtosDB.every(p => selectedSkus.has(p.sku));

  const validarFichaTecnica = (ficha, imagensValidas) => {
    const missingFields = atributosCategoria.filter(attr => 
      isRequired(attr) && (!ficha[attr.id] || ficha[attr.id].trim() === '')
    );

    if (imagensValidas.length === 0) return 'Nenhuma imagem >= 500px';
    if (missingFields.length > 0) {
      return `Faltam ${missingFields.length} campos OBRIGATÓRIOS: ${missingFields.map(m => m.name).join(', ')}`;
    }
    return null;
  };

  const processarLote = async () => {
    if (contasSelecionadas.length === 0) return alert("Selecione pelo menos uma Conta Destino.");
    if (!tiposAnuncio.classico && !tiposAnuncio.premium) return alert("Selecione pelo menos um tipo de anúncio (Clássico ou Premium).");
    if (!regraSelecionada) return alert("Selecione a Regra de Preço.");
    if (!categoriaId) return alert("Selecione a Categoria ML.");
    if (selectedSkus.size === 0) return alert("Selecione os produtos na etapa 1.");

    setIsLoading(true);
    setStep(3);
    setLogs([]);
    addLog(`Iniciando validação de ${selectedSkus.size} produtos para a Categoria ${categoriaId}...`);
    
    const skusArray = Array.from(selectedSkus);
    const res = await fetch(`/api/produtos?userId=${usuarioId}&limit=${skusArray.length}&skus=${skusArray.join(',')}`);
    const { produtos: produtosSelecionadosCompletos } = await res.json();

    const processados =[];

    for (const prod of produtosSelecionadosCompletos) {
      const dt = prod.dadosTiny || {};
      const tituloML = sanitizeTitle(dt.nome || prod.nome);
      let imagensValidas =[];
      const anexos = Array.isArray(dt.anexos) ? dt.anexos : Object.values(dt.anexos || {});
      
      for (const anexo of anexos) {
        const url = anexo.anexo || anexo.url;
        if (url) {
          const isValid = await validateImageDimensions(url);
          if (isValid) imagensValidas.push(url);
        }
      }

      const fichaTecnica = {};
      atributosCategoria.forEach(attr => {
        if (attr.id === 'BRAND') fichaTecnica['BRAND'] = dt.marca || '';
        else if (attr.id === 'GTIN') fichaTecnica['GTIN'] = dt.gtin || dt.ean || '';
        // ADICIONE A LINHA ABAIXO:
        else if (attr.id === 'POSITION' && posicaoGlobal) fichaTecnica['POSITION'] = posicaoGlobal;
        else fichaTecnica[attr.id] = '';
      });

      const erroValidacao = validarFichaTecnica(fichaTecnica, imagensValidas);
      const descricaoLimpa = stripHtml(dt.descricao_complementar || dt.descricao || '');

      processados.push({
        ...prod,
        tituloML,
        descricao: descricaoLimpa,
        imagens: imagensValidas,
        erro: erroValidacao,
        fichaTecnica,
        prontoParaEnvio: !erroValidacao
      });
    }

    setProdutosProcessados(processados);
    setIsLoading(false);
    addLog("Processamento local concluído.");
  };

  const handleExportCSV = () => {
    const headers =['SKU', 'Titulo', 'Descricao', 'Imagens', ...atributosCategoria.map(a => a.name)];
    const hints =['(Não alterar)', '(Não alterar)', '(Preencha com texto)', '(URLs separadas vírgula)'];
    
    atributosCategoria.forEach(attr => {
      let prefix = isRequired(attr) ? '[OBRIGATÓRIO] ' : '[Opcional] ';
      if (attr.values && attr.values.length > 0) {
        const allowed = attr.values.map(v => v.name).join(', ');
        hints.push(`${prefix}Valores possíveis: ${allowed}`);
      } else {
        hints.push(`${prefix}Texto livre`);
      }
    });

    const rows = [
      ["INSTRUÇÕES DE PREENCHIMENTO DA IA/USUÁRIO:"],["1. Preencha TODAS as colunas marcadas como [OBRIGATÓRIO] para aprovar o envio ao Mercado Livre."],
      ["2. NÃO altere os nomes das colunas na linha de Cabeçalho."],
      ["3. Respeite os 'Valores possíveis' sugeridos na linha abaixo do cabeçalho."],[], 
      headers,
      hints
    ];
    
    produtosProcessados.forEach(p => {
      let descLimpa = (p.descricao || '').replace(/;/g, ',').replace(/(\r\n|\n|\r)/gm, ' ').replace(/"/g, '""'); 
      const descSeguraCSV = `"${descLimpa}"`;
      const imagensSegurasCSV = `"${(p.imagens || []).join(', ')}"`;
      
      const row =[p.sku, p.tituloML, descSeguraCSV, imagensSegurasCSV];
      atributosCategoria.forEach(a => {
        row.push(p.fichaTecnica[a.id] || '');
      });
      rows.push(row);
    });
    
    exportToCSV(`preenchimento_ficha_${categoriaId}.csv`, rows);
  };

  const normalizeString = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const data = parseCSV(text);
      if (!data || data.length === 0) return;
      
      const normalizedData = data.map(row => {
        const newRow = {};
        Object.keys(row).forEach(key => {
           newRow[normalizeString(key)] = row[key]; 
           newRow[key] = row[key]; 
        });
        return newRow;
      });

      setProdutosProcessados(prev => {
        let aprovados = 0;
        let reprovados = 0;

        const newState = prev.map(p => {
          const skuNormalized = normalizeString(p.sku);
          const csvRow = normalizedData.find(r => 
            (r['sku'] && normalizeString(r['sku']) === skuNormalized) || 
            (r[normalizeString('sku')] && normalizeString(r[normalizeString('sku')]) === skuNormalized)
          );

          if (csvRow) {
            const novaFicha = { ...p.fichaTecnica };
            const novoTitulo = csvRow['titulo'] || csvRow['Titulo'] || p.tituloML;
            const novaDescricao = csvRow['descricao'] || csvRow['Descricao'] || p.descricao;
            
            let novasImagens = p.imagens;
            const imagensPlanilha = csvRow['imagens'] || csvRow['Imagens'];
            if (imagensPlanilha && String(imagensPlanilha).trim() !== '') {
               novasImagens = String(imagensPlanilha).split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
            }
            
            atributosCategoria.forEach(a => {
              const normalName = normalizeString(a.name);
              let valorNaPlanilha = csvRow[a.name] !== undefined ? csvRow[a.name] : csvRow[normalName];

              if (valorNaPlanilha !== undefined && valorNaPlanilha !== null) {
                const cleanValue = String(valorNaPlanilha).trim();
                if (!cleanValue.includes('[OBRIGATÓRIO]') && !cleanValue.includes('[Opcional]') && !cleanValue.includes('Não alterar')) {
                  novaFicha[a.id] = cleanValue;
                }
              }
            });

            const erroRevalidado = validarFichaTecnica(novaFicha, novasImagens);
            if (!erroRevalidado) aprovados++; else reprovados++;

            return { 
              ...p, 
              tituloML: novoTitulo.substring(0, 60),
              descricao: novaDescricao,
              imagens: novasImagens.length > 0 ? novasImagens : p.imagens,
              fichaTecnica: novaFicha, 
              erro: erroRevalidado, 
              prontoParaEnvio: !erroRevalidado 
            };
          }
          
          if (p.prontoParaEnvio) aprovados++; else reprovados++;
          return p;
        });

        setTimeout(() => {
          alert(`Planilha importada com sucesso!\n\n✅ Aprovados: ${aprovados}\n❌ Ainda com pendências: ${reprovados}`);
        }, 100);

        return newState;
      });
    };
    reader.readAsText(file, 'ISO-8859-1'); 
    e.target.value = null; 
  };

  // ✅ NOVO: Cálculo assíncrono real de preços (Suporta Inflar, Reduzir e Tipo de Anúncio)
  const calcularPrecoVendaFinalAsync = async (precoOriginal, regraId, conta, token, categoriaId, dimStr, tipoML, inflar, reduzir) => {
    const regra = regrasPreco.find(r => r.id === regraId);
    if (!regra || !precoOriginal) return precoOriginal;

    let custoBase = Number(precoOriginal);
    let percVendaFatores = 1;

    (regra.variaveis ||[]).forEach(v => {
      if (v.tipo === 'fixo_custo') custoBase += v.valor;
      if (v.tipo === 'perc_custo') custoBase += custoBase * (v.valor / 100);
      if (v.tipo === 'perc_venda') percVendaFatores *= (1 - v.valor / 100);
    });

    const tarifaMLPerc = tipoML === 'premium' ? 16 : 11;
    const netFactor = (1 - tarifaMLPerc / 100) * percVendaFatores;

    if (netFactor <= 0) return custoBase;

    const inflarSafe = Math.min(Math.max(0, inflar), 99);

    let precoBaseCalc = (custoBase + 6) / netFactor;
    let precoFinal = inflarSafe > 0 ? precoBaseCalc / (1 - inflarSafe / 100) : precoBaseCalc;
    let custoFreteML = 0;

    if (precoFinal >= 79 && conta.envioSuportado !== 'ME1') {
        try {
            const res = await fetch('/api/ml/simulate-shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: token, sellerId: conta.id, itemPrice: precoFinal,
                    categoryId: categoriaId, listingTypeId: tipoML === 'premium' ? 'gold_pro' : 'gold_special', dimensions: dimStr
                })
            });
            const data = await res.json();
            custoFreteML = data.cost || 0;

            precoBaseCalc = (custoBase + custoFreteML) / netFactor;
            precoFinal = inflarSafe > 0 ? precoBaseCalc / (1 - inflarSafe / 100) : precoBaseCalc;
        } catch (e) {
            custoFreteML = 35; // Fallback
            precoBaseCalc = (custoBase + custoFreteML) / netFactor;
            precoFinal = inflarSafe > 0 ? precoBaseCalc / (1 - inflarSafe / 100) : precoBaseCalc;
        }
    }

    // Redutor de fuga do frete grátis
    if (precoFinal >= 79 && reduzir > 0) {
      if (precoFinal * (1 - reduzir / 100) <= 78.99) precoFinal = 78.99;
    }

    return Math.round(precoFinal * 100) / 100;
  };


  const handleEnviarFila = async () => {
    const validos = produtosProcessados.filter(p => p.prontoParaEnvio);
    if (validos.length === 0) return alert("Nenhum produto aprovado para enviar. Corrija a ficha técnica.");
    
    // Contas selecionadas
    const contasAlvo = contasML.filter(c => contasSelecionadas.includes(c.id));
    if (contasAlvo.length === 0) return alert("Erro: Nenhuma conta alvo encontrada.");

    // Tipos selecionados
    const tiposAlvo =[];
    if (tiposAnuncio.classico) tiposAlvo.push('classico');
    if (tiposAnuncio.premium) tiposAlvo.push('premium');

    const totalDeEnvios = validos.length * contasAlvo.length * tiposAlvo.length;
    if(!window.confirm(`Serão enviados ${totalDeEnvios} anúncios (Produtos x Contas x Tipos) para a fila do ML. Deseja prosseguir?`)) return;

    setIsLoading(true);
    setStep(4);
    setLogs([]);

    for (const prod of validos) {
      for (const conta of contasAlvo) {
        for (const tipo of tiposAlvo) {
          addLog(`Preparando SKU ${prod.sku} para ${conta.nickname} (${tipo.toUpperCase()})...`);
          
          try {
            const token = await refreshTokenIfNeeded(conta);
            if (!token) throw new Error("Token expirado ou inválido.");

              const dt = prod.dadosTiny || {};

              let pesoG = Math.round(parseFloat(dt.peso_bruto || 0.5) * 1000) || 500;
              let alt = Math.round(parseFloat(dt.alturaEmbalagem || 10)) || 10;
              let larg = Math.round(parseFloat(dt.larguraEmbalagem || 11)) || 11;
              let comp = Math.round(parseFloat(dt.comprimentoEmbalagem || 15)) || 15;

              alt = Math.min(Math.max(alt, 10), 100);
              larg = Math.min(Math.max(larg, 11), 100);
              comp = Math.min(Math.max(comp, 15), 100);
              pesoG = Math.min(Math.max(pesoG, 100), 30000); 

              const dimStr = `${alt}x${larg}x${comp},${pesoG}`;

            // ✅ Preço calculado usando a estratégia completa
            const precoFinal = await calcularPrecoVendaFinalAsync(
              dt.preco || prod.preco, 
              regraSelecionada, 
              conta, 
              token, 
              categoriaId, 
              dimStr, 
              tipo, 
              strategy.inflar, 
              strategy.reduzir
            );

            let atributosML = Object.entries(prod.fichaTecnica)
              .filter(([k, v]) => v !== '')
              .map(([k, v]) => {
                 const attrCat = atributosCategoria.find(a => a.id === k);
                 if (attrCat && attrCat.values && attrCat.values.length > 0) {
                   const matchedVal = attrCat.values.find(val => val.name.toLowerCase() === String(v).toLowerCase().trim());
                   if (matchedVal) return { id: k, value_id: String(matchedVal.id) };
                 }
                 return { id: k, value_name: String(v) };
              })
              .filter(a => !a.id.includes('PACKAGE') && a.id !== 'SELLER_SKU');
              
              atributosML.push({ id: 'SELLER_PACKAGE_WEIGHT', value_name: `${pesoG} g` });
              atributosML.push({ id: 'SELLER_PACKAGE_LENGTH', value_name: `${comp} cm` });
              atributosML.push({ id: 'SELLER_PACKAGE_HEIGHT', value_name: `${alt} cm` });
              atributosML.push({ id: 'SELLER_PACKAGE_WIDTH', value_name: `${larg} cm` });

              if (prod.sku) {
                 atributosML.push({ id: 'SELLER_SKU', value_name: String(prod.sku) });
              }

            const payload = {
              title: prod.tituloML,
              family_name: prod.tituloML.substring(0, 60),
              category_id: categoriaId,
              price: precoFinal,
              currency_id: 'BRL',
              buying_mode: 'buy_it_now',
              listing_type_id: tipo === 'premium' ? 'gold_pro' : 'gold_special',
              condition: 'new',
              available_quantity: prod.estoque > 0 ? prod.estoque : 1,
              pictures: prod.imagens.map(img => ({ source: img })),
              attributes: atributosML,
              shipping: {
                  mode: conta.envioSuportado === 'ME1' ? 'me1' : 'me2',
                  local_pick_up: false,
                  free_shipping: conta.envioSuportado === 'ME1' ? false : (precoFinal >= 79),
                  dimensions: dimStr
              }
            };

            const res = await fetch('/api/ml/publish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: usuarioId,
                contaNome: `${conta.nickname} (${tipo})`,
                sku: prod.sku,
                accessToken: token,
                payload: payload,
                description: prod.descricao || "Anúncio criado em massa pelo MELIUNLOCKER",
                enviarAtacado: strategy.enviarAtacado || false,
                inflar: strategy.inflar || 0,
                ativarPromocoes: strategy.ativarPromocoes || false,
                toleranciaPromo: strategy.ativarPromocoes ? (Number(strategy.toleranciaPromo) || 0) : 0,
              })
            });

            if (res.ok) {
              addLog(`✅ SKU ${prod.sku} (${tipo}) enviado para fila de ${conta.nickname}.`);
            } else {
              const err = await res.json();
              addLog(`❌ Erro em ${conta.nickname} (SKU ${prod.sku}): ${err.erro}`);
            }
          } catch (e) {
            addLog(`❌ Falha crítica em ${conta.nickname} (SKU ${prod.sku}): ${e.message}`);
          }
          await new Promise(r => setTimeout(r, 400)); 
        }
      }
    }

    addLog("🎉 Processo de enfileiramento concluído! Acompanhe no Gerenciador de Fila.");
    setIsLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto pb-10 space-y-6 text-gray-800">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-black text-gray-800 mb-2">Cadastramento em Massa</h2>
        <p className="text-sm text-gray-500">Crie dezenas de anúncios de uma vez garantindo validação de ficha técnica exigida pelo ML.</p>
        
        <div className="flex gap-2 mt-6 mb-2">
          {[1,2,3,4].map(s => (
            <div key={s} className={`h-2 flex-1 rounded-full ${step >= s ? 'bg-orange-500' : 'bg-gray-200'}`}></div>
          ))}
        </div>
        <div className="flex justify-between text-xs font-bold text-gray-400">
          <span className={step >= 1 ? 'text-orange-600' : ''}>1. Seleção</span>
          <span className={step >= 2 ? 'text-orange-600' : ''}>2. Setup (Contas e Regras)</span>
          <span className={step >= 3 ? 'text-orange-600' : ''}>3. Validação Ficha</span>
          <span className={step >= 4 ? 'text-orange-600' : ''}>4. Fila</span>
        </div>
      </div>

      {/* PASSO 1 */}
      {step === 1 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-fade-in">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="font-bold text-lg text-gray-800">1. Selecione os Produtos do ERP</h3>
            </div>
            <button onClick={() => setStep(2)} disabled={selectedSkus.size === 0} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 disabled:opacity-50 transition-all">
              Avançar ({selectedSkus.size} selecionados) ➔
            </button>
          </div>

          <div className="flex flex-col gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
            <div className="flex gap-4 w-full">
              <input 
                type="text" placeholder="Pesquisar por SKU ou Nome..." value={searchTerm}
                onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none">
                <option value="Todos">Todos os Status</option>
                <option value="Com Anúncios">Com Anúncios no ML</option>
                <option value="Sem Anúncios">Sem Anúncios no ML</option>
              </select>
            </div>
            
            <div className="flex gap-2 w-full items-center">
              <button onClick={handleSelectAllFiltered} disabled={isSelectingAll || totalProdutos === 0} className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold rounded hover:bg-blue-100 disabled:opacity-50 transition">
                {isSelectingAll ? 'Buscando...' : `Marcar todos filtrados (${totalProdutos})`}
              </button>
              <button onClick={() => handleSelectPage(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded hover:bg-gray-100 transition">
                ✓ Marcar Página
              </button>
              <button onClick={() => handleSelectPage(false)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded hover:bg-gray-100 transition">
                ✕ Desmarcar Página
              </button>
              {selectedSkus.size > 0 && (
                 <button onClick={() => setSelectedSkus(new Set())} className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded hover:bg-red-100 transition ml-auto">
                 Limpar Seleção ({selectedSkus.size})
               </button>
              )}
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 w-10 text-center"><input type="checkbox" className="cursor-pointer w-4 h-4" checked={isAllPageSelected} onChange={(e) => handleSelectPage(e.target.checked)} /></th>
                  <th className="p-3 text-gray-600 font-bold uppercase text-xs">SKU</th>
                  <th className="p-3 text-gray-600 font-bold uppercase text-xs">Produto</th>
                  <th className="p-3 text-gray-600 font-bold uppercase text-xs text-center">Estoque</th>
                  <th className="p-3 text-gray-600 font-bold uppercase text-xs text-right">Preço Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">Carregando...</td></tr>
                ) : produtosDB.length === 0 ? (
                  <tr><td colSpan="5" className="p-8 text-center text-gray-500">Nenhum produto encontrado.</td></tr>
                ) : (
                  produtosDB.map(p => (
                    <tr key={p.id} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => {
                      const next = new Set(selectedSkus);
                      if(next.has(p.sku)) next.delete(p.sku); else next.add(p.sku);
                      setSelectedSkus(next);
                    }}>
                      <td className="p-3 text-center"><input type="checkbox" className="cursor-pointer w-4 h-4 pointer-events-none" checked={selectedSkus.has(p.sku)} readOnly /></td>
                      <td className="p-3 font-mono text-gray-500 text-xs">{p.sku}</td>
                      <td className="p-3 font-semibold text-gray-800">{p.nome}</td>
                      <td className="p-3 text-center text-green-600 font-bold">{p.estoque}</td>
                      <td className="p-3 text-right font-medium text-gray-700">R$ {p.preco.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 border border-t-0 border-gray-200 rounded-b-lg">
            <span className="text-sm font-semibold text-gray-600">Mostrando {produtosDB.length} de {totalProdutos} produtos.</span>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</button>
              <span className="px-4 py-1.5 text-sm font-bold text-gray-700">Pág {currentPage} de {totalPages || 1}</span>
              <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Próxima</button>
            </div>
          </div>
        </div>
      )}

      {/* PASSO 2 */}
      {step === 2 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-fade-in space-y-6">
          <div className="flex justify-between items-center border-b pb-4">
            <h3 className="font-bold text-lg">2. Setup do Lote (Contas, Regras e Estratégia)</h3>
            <button onClick={() => setStep(1)} className="text-gray-500 hover:text-gray-800 font-semibold">⬅ Voltar para Seleção</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Coluna Esquerda: Contas e Tipos */}
            <div className="space-y-6">
              {/* ✅ Múltiplas Contas */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">A. Contas Destino (Selecione 1 ou mais)</label>
                <div className="bg-gray-50 border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer border-b border-gray-200 pb-2 mb-2 hover:bg-gray-100 p-1 rounded">
                     <input type="checkbox"
                       checked={contasSelecionadas.length === contasML.length && contasML.length > 0}
                       onChange={(e) => {
                         if (e.target.checked) setContasSelecionadas(contasML.map(c => c.id));
                         else setContasSelecionadas([]);
                       }}
                       className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                     />
                     <span className="font-bold text-sm text-gray-800">Selecionar Todas</span>
                  </label>
                  {contasML.map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-1 rounded">
                      <input type="checkbox"
                        checked={contasSelecionadas.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) setContasSelecionadas(prev => [...prev, c.id]);
                          else setContasSelecionadas(prev => prev.filter(id => id !== c.id));
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{c.nickname}</span>
                    </label>
                  ))}
                  {contasML.length === 0 && <p className="text-sm text-red-500">Nenhuma conta cadastrada.</p>}
                </div>
              </div>

              {/* ✅ Tipos de Anúncio */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">B. Tipos de Anúncio</label>
                <p className="text-xs text-gray-500 mb-2">Se marcar as duas opções, o sistema criará 2 anúncios (um clássico e um premium) em cada conta selecionada.</p>
                <div className="flex gap-4">
                  <label className={`flex items-center gap-3 cursor-pointer p-3 border rounded-lg flex-1 transition-colors ${tiposAnuncio.classico ? 'bg-blue-50 border-blue-400' : 'bg-white hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={tiposAnuncio.classico} onChange={e => setTiposAnuncio(p => ({...p, classico: e.target.checked}))} className="w-5 h-5 text-blue-600"/>
                    <span className="text-sm font-bold text-blue-900">Clássico</span>
                  </label>
                  <label className={`flex items-center gap-3 cursor-pointer p-3 border rounded-lg flex-1 transition-colors ${tiposAnuncio.premium ? 'bg-purple-50 border-purple-400' : 'bg-white hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={tiposAnuncio.premium} onChange={e => setTiposAnuncio(p => ({...p, premium: e.target.checked}))} className="w-5 h-5 text-purple-600"/>
                    <span className="text-sm font-bold text-purple-900">Premium</span>
                  </label>
                </div>

                {/* Enviar preços de atacado */}
                {configAtacado?.ativo && Array.isArray(configAtacado.faixas) && configAtacado.faixas.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-orange-200">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 accent-green-600 cursor-pointer flex-shrink-0"
                        checked={strategy.enviarAtacado || false}
                        onChange={e => setStrategy(p => ({ ...p, enviarAtacado: e.target.checked }))}
                      />
                      <div>
                        <span className="text-xs font-bold text-green-700">Enviar preços de atacado (B2B)</span>
                        <p className="text-[10px] text-green-600 mt-0.5">
                          {configAtacado.faixas.map(f => `${f.minQtd}+ un: -${f.desconto}%`).join(' | ')}
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Ativar promoções automaticamente */}
                {(strategy.inflar || 0) > 0 && (
                  <div className="mt-3 pt-3 border-t border-orange-200">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 accent-purple-600 cursor-pointer flex-shrink-0"
                        checked={strategy.ativarPromocoes || false}
                        onChange={e => setStrategy(p => ({ ...p, ativarPromocoes: e.target.checked }))}
                      />
                      <div>
                        <span className="text-xs font-bold text-purple-700">Ativar promoções dentro da margem ({strategy.inflar}%)</span>
                        <p className="text-[10px] text-purple-600 mt-0.5">
                          Ativará campanhas candidatas com desconto do vendedor ≤ {strategy.inflar}% após publicar.
                        </p>
                      </div>
                    </label>
                    {strategy.ativarPromocoes && strategy.inflar > 0 && (
                      <label className="flex items-start gap-2 cursor-pointer ml-5 mt-1">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-3.5 h-3.5 accent-purple-400 cursor-pointer flex-shrink-0"
                          checked={(strategy.toleranciaPromo || 0) > 0}
                          onChange={e => setStrategy(p => ({ ...p, toleranciaPromo: e.target.checked ? 2 : 0 }))}
                        />
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold text-purple-600">Aceitar promoções que ultrapassem a margem em até</span>
                          {(strategy.toleranciaPromo || 0) > 0 && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min="0.1" max="20" step="0.5"
                                value={strategy.toleranciaPromo}
                                onChange={e => setStrategy(p => ({ ...p, toleranciaPromo: Number(e.target.value) || 0 }))}
                                className="w-14 px-2 py-0.5 text-[10px] border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-400"
                              />
                              <span className="text-[10px] text-gray-400">% (aceita até {strategy.inflar + Number(strategy.toleranciaPromo)}%)</span>
                            </div>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita: Preço e Estratégia */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">C. Regra de Preço</label>
                <select value={regraSelecionada} onChange={e => setRegraSelecionada(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium">
                  <option value="">-- Como calcular o preço base? --</option>
                  {regrasPreco.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>

              {/* ✅ Estratégia (Inflar e Reduzir) */}
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="text-sm font-black text-orange-800 uppercase mb-3">D. Estratégia de Promoção e Frete</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-orange-700 mb-1">Inflar Preço (%)</label>
                    <p className="text-[10px] text-orange-600 mb-1.5 leading-tight">Aumenta o preço para ter margem para promoções futuras do ML.</p>
                    <input type="number" min="0" max="99" value={strategy.inflar} onChange={e => setStrategy(p => ({...p, inflar: Number(e.target.value)}))} className="w-full px-3 py-2 border border-orange-300 rounded-md text-sm font-bold text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-red-700 mb-1">Reduzir p/ fugir Frete Grátis (%)</label>
                    <p className="text-[10px] text-red-600 mb-1.5 leading-tight">Se ficar &gt;= R$79, abate até X% para tentar cravar em R$ 78,99.</p>
                    <input type="number" min="0" max="100" value={strategy.reduzir} onChange={e => setStrategy(p => ({...p, reduzir: Number(e.target.value)}))} className="w-full px-3 py-2 border border-red-300 rounded-md text-sm font-bold text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Categoria (Ocupa linha toda abaixo) */}
            <div className="md:col-span-2 mt-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">E. Categoria ML (Aplicada para todos os itens do lote)</label>
              <div className="border border-gray-300 rounded-lg bg-gray-50 p-2">
                <SeletorCategoria 
                  categoriaSelecionada={categoriaSelecionadaObj} setCategoriaSelecionada={setCategoriaSelecionadaObj} 
                  categoriasSugeridas={[]} contasML={contasML} refreshTokenIfNeeded={refreshTokenIfNeeded} 
                />
              </div>
            </div>

            {/* 👇 ADICIONE ESTE BLOCO AQUI 👇 */}
            <div className="md:col-span-2 mt-2 bg-cyan-50 p-4 rounded-lg border border-cyan-200">
              <label className="block text-sm font-bold text-cyan-800 mb-1">F. Posição da Peça (Para todos os itens)</label>
              <p className="text-xs text-cyan-700 mb-3">Útil se você estiver cadastrando um lote inteiro de "Pastilhas Dianteiras", por exemplo. Será injetado na Ficha Técnica (Passo 3).</p>
              <select value={posicaoGlobal} onChange={e => setPosicaoGlobal(e.target.value)} className="w-full md:w-1/2 p-2.5 border border-cyan-300 rounded-md focus:ring-2 focus:ring-cyan-500 outline-none text-sm font-medium bg-white">
                <option value="">-- Deixar em branco (Não aplicar) --</option>
                <option value="Dianteira">Dianteira</option>
                <option value="Traseira">Traseira</option>
                <option value="Esquerda">Esquerda</option>
                <option value="Direita">Direita</option>
                <option value="Superior">Superior</option>
                <option value="Inferior">Inferior</option>
                <option value="Dianteira Esquerda">Dianteira Esquerda</option>
                <option value="Dianteira Direita">Dianteira Direita</option>
                <option value="Traseira Esquerda">Traseira Esquerda</option>
                <option value="Traseira Direita">Traseira Direita</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-gray-200 mt-4">
            {canUseResource('massa.gerar') && (
            <button onClick={processarLote} className="px-8 py-3 bg-orange-500 text-white font-black rounded-lg shadow-lg hover:bg-orange-600 transition-all text-lg">
              Processar Lote e Buscar Ficha Técnica ➔
            </button>
            )}
          </div>
        </div>
      )}

      {/* PASSO 3 */}
      {step === 3 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-fade-in">
          <div className="flex justify-between items-center border-b pb-4 mb-4">
            <h3 className="font-bold text-lg">3. Saneamento e Ficha Técnica Dinâmica (IA)</h3>
            {isLoading ? (
              <span className="text-orange-500 font-bold animate-pulse">⏳ Checando obrigatoriedades da Categoria...</span>
            ) : (
              <button onClick={() => setStep(2)} className="text-gray-500 hover:text-gray-800 font-semibold">⬅ Voltar para Setup</button>
            )}
          </div>

          {!isLoading && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-black text-blue-800 flex items-center gap-2 mb-1">🤖 Preenchimento Rápido com ChatGPT</h4>
                  <p className="text-sm text-blue-700 max-w-2xl">
                    O Mercado Livre muda as regras de obrigatoriedade por categoria. O sistema já detectou os campos exigidos. <br/>
                    Exporte, peça ao ChatGPT preencher as colunas <strong className="text-red-600 font-bold">[OBRIGATÓRIO]</strong> vazias, e importe de volta.
                  </p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                  <button onClick={handleExportCSV} className="flex-1 md:flex-none px-4 py-2 bg-white text-blue-600 border border-blue-300 font-bold rounded shadow-sm hover:bg-blue-100 transition text-center">
                    📥 Exportar CSV
                  </button>
                  <label className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white font-bold rounded shadow-sm hover:bg-blue-700 cursor-pointer transition text-center">
                    📤 Importar CSV
                    <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                  </label>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg mb-6">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-3 text-gray-600 font-bold uppercase text-xs">SKU</th>
                      <th className="p-3 text-gray-600 font-bold uppercase text-xs">Título</th>
                      <th className="p-3 text-gray-600 font-bold uppercase text-xs">Status do Envio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {produtosProcessados.map(p => (
                      <tr key={p.sku} className={p.prontoParaEnvio ? 'bg-white' : 'bg-red-50'}>
                        <td className="p-3 font-mono text-gray-500 text-xs">{p.sku}</td>
                        <td className="p-3 font-semibold text-gray-800">{p.tituloML}</td>
                        <td className="p-3">
                        {p.prontoParaEnvio ? (
                            <span className="bg-green-100 text-green-800 px-3 py-1 rounded text-xs font-bold border border-green-200">Aprovado</span>
                        ) : (
                            <div className="flex items-center gap-2">
                            <span className="bg-red-100 text-red-800 px-3 py-1 rounded text-xs font-bold border border-red-200 block max-w-sm truncate" title={p.erro}>
                                ⚠️ {p.erro}
                            </span>
                            <button
                                onClick={() => handleReverificarProduto(p)}
                                disabled={verificandoSku === p.sku}
                                className="px-2 py-1 bg-white border border-gray-300 rounded text-[10px] font-bold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                                title="Buscar dados mais recentes no ERP e verificar novamente"
                            >
                                {verificandoSku === p.sku ? (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full"></span>
                                ) : (
                                '🔄'
                                )}
                                Verificar Novamente
                            </button>
                            </div>
                        )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <span className="text-sm text-gray-500 font-semibold">Apenas produtos com status "Aprovado" irão para a fila.</span>
                <button onClick={handleEnviarFila} className="px-8 py-3 bg-green-600 text-white font-black rounded shadow-lg hover:bg-green-700 transition">
                  🚀 Enviar Lote para Fila do ML
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* PASSO 4 */}
      {step === 4 && (
        <div className="bg-gray-900 text-green-400 p-6 rounded-lg shadow-inner font-mono text-sm h-[500px] flex flex-col">
          <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <span className={isLoading ? "animate-spin" : ""}>⚙️</span> Terminal de Enfileiramento
            </h3>
            {!isLoading && (
              <button onClick={() => { setStep(1); setSelectedSkus(new Set()); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded font-sans text-sm font-bold">
                Concluir e Fazer Novo Envio
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {logs.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
            {isLoading && <div className="animate-pulse mt-4 text-gray-500">_ Aguardando resposta do servidor...</div>}
          </div>
        </div>
      )}
    </div>
  );
}