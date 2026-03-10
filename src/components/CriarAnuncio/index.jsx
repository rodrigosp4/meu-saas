import React, { useState, useEffect } from 'react';
import { stripHtml } from '../../utils/formatters';

import FormularioBasico from './FormularioBasico';
import SeletorCategoria from './SeletorCategoria';
import TabelaContas from './TabelaContas';
import FormularioAtributos from './FormularioAtributos';
import ImageThumbnail from '../ImageThumbnail';

// Função para garantir que a Grade do Tiny vire um Objeto tratável
const parseGrade = (gradeRaw) => {
  if (!gradeRaw) return {};
  if (typeof gradeRaw === 'object') return gradeRaw;
  if (typeof gradeRaw === 'string') {
    const obj = {};
    gradeRaw.split(';').forEach(part => {
      const [k, v] = part.split(':');
      if (k && v) obj[k.trim()] = v.trim();
    });
    return obj;
  }
  return {};
};

// 1. ADICIONADO O usuarioId AQUI NAS PROPS
export default function CriarAnuncio({ produto, usuarioId }) {
  const [detalhesProduto, setDetalhesProduto] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  
  const [activeTab, setActiveTab] = useState('pai');

  // Basico
  const [tituloAnuncio, setTituloAnuncio] = useState('');
  const [descricaoAnuncio, setDescricaoAnuncio] = useState('');
  const [prazoFabricacao, setPrazoFabricacao] = useState('');
  const [pesoEmbalagem, setPesoEmbalagem] = useState(0.1);
  const [alturaEmbalagem, setAlturaEmbalagem] = useState(10);
  const [larguraEmbalagem, setLarguraEmbalagem] = useState(10);
  const [comprimentoEmbalagem, setComprimentoEmbalagem] = useState(15);
  const [imagemAmpliada, setImagemAmpliada] = useState(null);

  // Categorias e Ficha
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null);
  const [categoriasSugeridas, setCategoriasSugeridas] = useState([]);
  const [atributosCategoria, setAtributosCategoria] = useState([]);
  const [valoresAtributos, setValoresAtributos] = useState({});

  // Estrategia e Contas
  const [strategy, setStrategy] = useState({ inflar: 0, reduzir: 0 });
  const [contasML, setContasML] = useState([]);
  const [regrasPreco, setRegrasPreco] = useState([]);
  const [configPublicacao, setConfigPublicacao] = useState({});
  const [precosCalculados, setPrecosCalculados] = useState({});
  const [isCalculatingPrices, setIsCalculatingPrices] = useState(false);

  // 2. CORRIGIDO O USEEFFECT PARA BUSCAR DADOS DO BANCO DE DADOS (ONLINE)
  useEffect(() => {
    const carregarConfiguracoes = async () => {
      try {
        const res = await fetch(`/api/usuario/${usuarioId}/config`);
        const data = await res.json();
        
        const contas = data.contasML || [];
        const regras = data.regrasPreco || [];

        setContasML(contas);
        setRegrasPreco(regras);

        const configInicial = {};
        contas.forEach(c => {
          configInicial[c.id] = { ativo: false, tipo: 'classico', regraId: regras[0]?.id || '' }
        });
        setConfigPublicacao(configInicial);
      } catch (error) {
        console.error("Erro ao buscar configurações do usuário:", error);
      }
    };

    if (usuarioId) {
      carregarConfiguracoes();
    }

    if (produto?.id) fetchDetalhesTiny();
  }, [produto, usuarioId]);

  useEffect(() => {
    if (categoriaSelecionada?.category_id) buscarFichaTecnica(categoriaSelecionada.category_id);
  }, [categoriaSelecionada]);

  const fetchDetalhesTiny = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/tiny-produto-detalhes', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id: produto.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || "O Tiny ERP rejeitou a requisição.");

      if ((!data.filhos || data.filhos.length === 0) && produto.dadosTiny?.variacoes) {
         let varTiny = produto.dadosTiny.variacoes;
         if (!Array.isArray(varTiny)) varTiny = Object.values(varTiny);
         
         if (varTiny.length > 0) {
            data.filhos = varTiny.map(v => {
                const base = v.variacao || v;
                return {
                    id: base.idProdutoFilho || base.id,
                    codigo: base.codigo || `${produto.sku}-var`,
                    estoque_atual: base.estoque_atual || 1,
                    preco: produto.preco,
                    grade: parseGrade(base.grade),
                    anexos: data.anexos 
                };
            });
         }
      }

      setDetalhesProduto(data);
      const nome = (data.nome || '').substring(0, 60);
      setTituloAnuncio(nome);
      setPesoEmbalagem(data.peso_bruto || 0.1);
      setAlturaEmbalagem(data.alturaEmbalagem || 10);
      setLarguraEmbalagem(data.larguraEmbalagem || 10);
      setComprimentoEmbalagem(data.comprimentoEmbalagem || 15);
      setDescricaoAnuncio(stripHtml(data.descricao_complementar || data.descricao));

      if (nome) {
        const pRes = await fetch(`/api/ml/predict-category?title=${encodeURIComponent(nome)}`);
        const pData = await pRes.json();
        setCategoriasSugeridas(pData);
        if(!categoriaSelecionada && pData.length > 0) setCategoriaSelecionada(pData[0]);
      }
    } catch (e) {
      setFetchError(e.message);
    } finally { setIsLoading(false); }
  };

  const buscarFichaTecnica = async (catId) => {
    try {
      const res = await fetch(`/api/ml/category-attributes/${catId}`);
      const data = await res.json();
      setAtributosCategoria(data);
      const valores = {};
      data.forEach(a => {
        if (a.id === 'BRAND') valores[a.id] = detalhesProduto?.marca || '';
        else if (a.id === 'GTIN') valores[a.id] = detalhesProduto?.gtin || '';
      });
      setValoresAtributos(valores);
    } catch(e) {}
  };

  const handleAtributoChange = (id, valor) => {
    setValoresAtributos(prev => ({ ...prev, [id]: valor }));
  };

  // 3. CORRIGIDA A FUNÇÃO DE REFRESH PARA SALVAR O NOVO TOKEN NO BANCO DE DADOS
  const refreshTokenIfNeeded = async (conta) => {
    if (conta.expiresAt && Date.now() < (conta.expiresAt - 120000)) return conta.accessToken;
    try {
      const res = await fetch('/api/ml/refresh-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: conta.refreshToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Falha");

      const contaAtualizada = { 
        ...conta, 
        accessToken: data.access_token, 
        refreshToken: data.refresh_token, 
        expiresAt: Date.now() + (data.expires_in * 1000) 
      };

      // Atualiza na tela
      setContasML(prev => prev.map(c => c.id === conta.id ? contaAtualizada : c));

      // Salva a renovação no banco de dados para não perder
      await fetch(`/api/usuario/${usuarioId}/contas-ml`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contaAtualizada)
      });

      return data.access_token;
    } catch (e) { return null; }
  };

  const calcularPrecoVendaDetalhadoAsync = async (conta, tipoOverride) => {
    if (!detalhesProduto || !categoriaSelecionada) return null;
    const config = configPublicacao[conta.id];
    if (!config || !config.regraId) return null;
    const regra = regrasPreco.find(r => r.id === config.regraId);
    if (!regra) return null;

    const tipoBase = regra.precoBase || 'promocional';
    const pVenda = Number(detalhesProduto.preco || 0);
    const pPromo = Number(detalhesProduto.preco_promocional || 0);
    const pCusto = Number(detalhesProduto.preco_custo || 0);

    let custoBase = 0;
    if (tipoBase === 'venda') {
      custoBase = pVenda;
    } else if (tipoBase === 'promocional') {
      custoBase = pPromo > 0 ? pPromo : pVenda;
    } else if (tipoBase === 'custo') {
      custoBase = pCusto > 0 ? pCusto : pVenda;
    } else {
      custoBase = pPromo > 0 ? pPromo : pVenda;
    }

    let historico =[{ descricao: `Preço Base (${tipoBase.toUpperCase()})`, valor: custoBase, tipo: 'valor' }];
    let valorAtualCusto = custoBase;
    let percVendaFatores = 1;

    let historicoCustos = [];
    let historicoTaxasVenda = [];

    (regra.variaveis ||[]).forEach(v => {
        if (v.tipo === 'fixo_custo') {
            valorAtualCusto += v.valor;
            historicoCustos.push({ descricao: v.nome, valor: v.valor, tipo: 'custo' });
        }
        else if (v.tipo === 'perc_custo') {
            const calcVal = valorAtualCusto * (v.valor / 100);
            valorAtualCusto += calcVal;
            historicoCustos.push({ descricao: v.nome, valor: calcVal, isPerc: true, originalPerc: v.valor, tipo: 'custo' });
        }
        else if (v.tipo === 'perc_venda') {
            percVendaFatores *= (1 - v.valor / 100);
            historicoTaxasVenda.push({ descricao: v.nome, originalPerc: v.valor, tipo: 'taxa_venda' });
        }
    });

    const tipoCalc = tipoOverride || config.tipo;
    const tarifaMLPerc = tipoCalc === 'premium' ? 16 : 11;
    const netFactor = (1 - tarifaMLPerc / 100) * percVendaFatores;

    if (netFactor <= 0) return { precoFinal: valorAtualCusto, historico };

    let precoBase = (valorAtualCusto + 6) / netFactor;
    let precoFinal = strategy.inflar > 0 ? precoBase / (1 - (strategy.inflar / 100)) : precoBase;
    let custoFreteML = 0;

    if (precoFinal >= 79 && strategy.reduzir > 0) {
        if (precoFinal * (1 - (strategy.reduzir / 100)) <= 78.99) precoFinal = 78.99;
    }

    if (precoFinal >= 79 && conta.envioSuportado !== 'ME1') {
      try {
        const token = await refreshTokenIfNeeded(conta);
        const dimStr = `${Math.round(alturaEmbalagem)}x${Math.round(larguraEmbalagem)}x${Math.round(comprimentoEmbalagem)},${Math.round(pesoEmbalagem * 1000)}`;

        precoFinal = valorAtualCusto / netFactor;

        for (let i = 0; i < 3; i++) {
          const res = await fetch('/api/ml/simulate-shipping', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, sellerId: conta.id, itemPrice: precoFinal, categoryId: categoriaSelecionada.category_id, listingTypeId: tipoCalc === 'premium' ? 'gold_pro' : 'gold_special', dimensions: dimStr })
          });
          const data = await res.json();
          custoFreteML = data.cost || 0;

          let npb = (valorAtualCusto + custoFreteML) / netFactor;
          let npf = strategy.inflar > 0 ? npb / (1 - (strategy.inflar / 100)) : npb;

          if (Math.abs(npf - precoFinal) < 0.1) { precoFinal = npf; break; }
          precoFinal = npf;
        }
      } catch (e) {
        custoFreteML = 35;
        precoFinal = strategy.inflar > 0 ? ((valorAtualCusto + custoFreteML) / netFactor) / (1 - (strategy.inflar / 100)) : ((valorAtualCusto + custoFreteML) / netFactor);
      }
    }

    historico = [...historico, ...historicoCustos];

    if (precoFinal < 79) {
        historico.push({ descricao: 'Custo Fixo (ML)', valor: 6.00, tipo: 'custo_ml' });
    }

    const tarifaMLValor = precoFinal * (tarifaMLPerc / 100);
    historico.push({ descricao: `Tarifa ML (${tipoCalc === 'premium' ? 'Premium' : 'Clássico'})`, valor: tarifaMLValor, isPerc: true, originalPerc: tarifaMLPerc, tipo: 'custo_ml' });

    if (conta.envioSuportado === 'ME1' && precoFinal >= 79) {
        historico.push({ descricao: 'Frete Grátis (Isento via ME1)', valor: 0, tipo: 'custo_ml' });
    }

    if (custoFreteML > 0) {
        historico.push({ descricao: 'Frete Grátis (ML)', valor: custoFreteML, tipo: 'custo_ml' });
    }

    historicoTaxasVenda.forEach(taxa => {
        taxa.valor = precoFinal * (taxa.originalPerc / 100);
        historico.push(taxa);
    });

    return { precoFinal, historico };
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsCalculatingPrices(true);
      const novos = {};
      for (const conta of contasML) {
        if (configPublicacao[conta.id]?.ativo) {
          if (configPublicacao[conta.id].tipo === 'ambos') {
            novos[`${conta.id}_classico`] = await calcularPrecoVendaDetalhadoAsync(conta, 'classico');
            novos[`${conta.id}_premium`] = await calcularPrecoVendaDetalhadoAsync(conta, 'premium');
          } else {
            novos[`${conta.id}_${configPublicacao[conta.id].tipo}`] = await calcularPrecoVendaDetalhadoAsync(conta, configPublicacao[conta.id].tipo);
          }
        }
      }
      setPrecosCalculados(novos);
      setIsCalculatingPrices(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [configPublicacao, detalhesProduto, categoriaSelecionada, strategy, pesoEmbalagem]);

const publicarAnuncios = async () => {
    if (!categoriaSelecionada) return alert("Selecione a categoria");
    if (!tituloAnuncio || tituloAnuncio.length > 60) return alert("O título deve ter entre 1 e 60 caracteres.");
    
    setIsPublishing(true);
    let sucessos = 0;
    let erros = 0;
    let mensagensErro =[];

    const attrFinais = Object.entries(valoresAtributos)
    .filter(([_, v]) => v && (typeof v !== 'object' || v.value_id) && String(v).trim() !== '')
    .map(([id, v]) => typeof v === 'object' ? { id, value_id: v.value_id, value_name: v.value_name } : { id, value_name: String(v) })
    .filter(a => !a.id.includes('PACKAGE')); 

    attrFinais.push({ id: 'SELLER_PACKAGE_LENGTH', value_name: `${Math.round(comprimentoEmbalagem)} cm` });
    attrFinais.push({ id: 'SELLER_PACKAGE_HEIGHT', value_name: `${Math.round(alturaEmbalagem)} cm` });
    attrFinais.push({ id: 'SELLER_PACKAGE_WIDTH', value_name: `${Math.round(larguraEmbalagem)} cm` });
    attrFinais.push({ id: 'SELLER_PACKAGE_WEIGHT', value_name: `${Math.round(pesoEmbalagem * 1000)} g` });

    if (produto?.sku && (!detalhesProduto.filhos || detalhesProduto.filhos.length === 0)) {
      attrFinais.push({ id: 'SELLER_SKU', value_name: String(produto.sku) });
    }

    const saleTermsExtra =[
      { id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' },
      { id: 'WARRANTY_TIME', value_name: '90 dias' },
    ];
    if (prazoFabricacao && Number(prazoFabricacao) > 0) {
      saleTermsExtra.push({ id: 'MANUFACTURING_TIME', value_name: `${prazoFabricacao} dias` });
    }

    const dimStr = `${Math.round(alturaEmbalagem)}x${Math.round(larguraEmbalagem)}x${Math.round(comprimentoEmbalagem)},${Math.round(pesoEmbalagem * 1000)}`;

    const chavesGradeUnicas = new Set();
    if (detalhesProduto.filhos && detalhesProduto.filhos.length > 0) {
        detalhesProduto.filhos.forEach(filho => {
            const parsedGrade = parseGrade(filho.grade);
            Object.keys(parsedGrade).forEach(k => chavesGradeUnicas.add(k));
        });
    }
    const arrayChavesGrade = Array.from(chavesGradeUnicas);

    const deParaAtributos = {
        'cor': 'COLOR', 'tamanho': 'SIZE', 'voltagem': 'VOLTAGE',
        'sabor': 'FLAVOR', 'modelo': 'MODEL', 'material': 'MATERIAL'
    };

    const allowedVarAttrs = atributosCategoria.filter(a => a.tags?.allow_variations);
    const defaultVarAttr = allowedVarAttrs.length > 0 ? allowedVarAttrs[0].id : 'COLOR';

    const enviarParaFilaBackend = async (payload, token, descricao, nomeDaConta) => {
        let res = await fetch('/api/ml/publish', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
              userId: usuarioId,              
              contaNome: nomeDaConta,      
              sku: produto?.sku || 'S/ SKU',  
              accessToken: token, 
              payload, 
              description: descricao 
            }) 
        });
        let data = await res.json();
        return { ok: res.ok, data };
    };

    for (const conta of contasML) {
      if (configPublicacao[conta.id]?.ativo) {
          
        const enviaML = async (tipo) => {
          const precoObj = precosCalculados[`${conta.id}_${tipo}`];
          if (!precoObj || precoObj.precoFinal <= 0) {
              erros++; return mensagensErro.push(`Conta ${conta.nickname}: Erro de cálculo de preço.`);
          }

          let variationsPayload = undefined;
          let allPicturesMap = new Map();

          (detalhesProduto.anexos ||[]).forEach(img => {
            const url = img.anexo || img.url || img;
            if (typeof url === 'string') allPicturesMap.set(url, { source: url });
          });

          const temVariacoes = detalhesProduto.filhos && detalhesProduto.filhos.length > 0;

          if (temVariacoes) {
            variationsPayload = detalhesProduto.filhos.map((filho, index) => {
                let imagensFilho = (filho.anexos && filho.anexos.length > 0) ? filho.anexos : detalhesProduto.anexos;
                if (!imagensFilho) imagensFilho =[];
                imagensFilho = imagensFilho.slice(0, 12); 
                
                let urlsFilho = imagensFilho.map(img => img.anexo || img.url || img).filter(u => typeof u === 'string');
                urlsFilho.forEach(url => allPicturesMap.set(url, { source: url }));

                const parsedGrade = parseGrade(filho.grade);
                
                let combinations = arrayChavesGrade.map(key => {
                    const keyLower = key.toLowerCase().trim();
                    const mlId = deParaAtributos[keyLower];
                    const comb = { value_name: String(parsedGrade[key] || "Padrão") };
                    if (mlId) {
                        comb.id = mlId; 
                    } else {
                        const matchedAttr = allowedVarAttrs.find(a => a.name.toLowerCase() === keyLower);
                        comb.id = matchedAttr ? matchedAttr.id : defaultVarAttr; 
                    }
                    return comb;
                });

                if (combinations.length === 0) {
                    combinations.push({ id: defaultVarAttr, value_name: String(filho.codigo || `Var-${index+1}`) });
                }

                const varAttributes =[{ id: 'SELLER_SKU', value_name: String(filho.codigo) }];
                const gtinVal = filho.gtin || filho.ean;
                if (gtinVal) varAttributes.push({ id: 'GTIN', value_name: String(gtinVal) });

                return {
                    price: Number(precoObj.precoFinal.toFixed(2)), 
                    available_quantity: Number(filho.estoque_atual) > 0 ? Number(filho.estoque_atual) : 1,
                    picture_ids: urlsFilho,
                    attributes: varAttributes,
                    attribute_combinations: combinations
                };
            });
          }

          const payloadPadrao = {
              title: tituloAnuncio,
              family_name: tituloAnuncio.substring(0, 60), // <-- ML AGORA EXIGE ISSO AQUI
              category_id: categoriaSelecionada.category_id,
              price: Number(precoObj.precoFinal.toFixed(2)),
              currency_id: 'BRL',
              buying_mode: 'buy_it_now',
              listing_type_id: tipo === 'premium' ? 'gold_pro' : 'gold_special',
              condition: 'new',
              pictures: Array.from(allPicturesMap.values()), 
              attributes: [...attrFinais],
              sale_terms: saleTermsExtra,
              shipping: { 
                  mode: conta.envioSuportado === 'ME1' ? 'me1' : 'me2', 
                  local_pick_up: false, 
                  free_shipping: conta.envioSuportado === 'ME1' ? false : (precoObj.precoFinal >= 79), 
                  dimensions: dimStr 
              }
          };
          if (temVariacoes) {
              payloadPadrao.variations = variationsPayload;
          } else {
              payloadPadrao.available_quantity = detalhesProduto.estoque_atual > 0 ? Number(detalhesProduto.estoque_atual) : 1;
          }

          try {
              // Agora a lógica pesada de Fallbacks de erro do Mercado Livre roda exclusivamente no Worker (Fila)
              let { ok, data } = await enviarParaFilaBackend(payloadPadrao, conta.accessToken, descricaoAnuncio, conta.nickname);

              if (ok) {
                sucessos++;
              } else {
                erros++;
                mensagensErro.push(`(${tipo}): Falha ao inserir na fila de processamento.`);
              }
          } catch (err) {
              erros++;
              mensagensErro.push(`${conta.nickname}: Falha na conexão com o servidor.`);
          }
        };

        if (configPublicacao[conta.id].tipo === 'ambos') {
          await enviaML('classico'); 
          await enviaML('premium');
        } else {
          await enviaML(configPublicacao[conta.id].tipo);
        }
      }
    }
    
    setIsPublishing(false);

    if (erros > 0) {
      alert(`⚠️ Finalizado com avisos.\n\nSucessos enviados para a fila: ${sucessos}\nErros: ${erros}\n\nDetalhes:\n- ${mensagensErro.join('\n- ')}`);
    } else if (sucessos > 0) {
      alert(`🚀 Sucesso! ${sucessos} tarefa(s) de publicação foram enviadas para a Fila.\n\nAcompanhe o status e a publicação final no menu "Gerenciador de Fila".`);
    }
  };

  if (!produto) return <div className="text-center p-8">Nenhum produto selecionado</div>;
  if (isLoading) return <div className="text-center p-8 mt-10"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>Buscando e formatando dados do produto no Tiny...</div>;
  if (fetchError || !detalhesProduto) return <div className="text-center p-8 text-red-500">Erro: {fetchError}</div>;

  const filhos = detalhesProduto.filhos || [];

  return (
    <div className="max-w-6xl mx-auto pb-12">
      
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-black text-gray-800">
          Criar Anúncio: <span className="text-blue-600 font-medium">{produto.nome}</span>
        </h2>
      </div>

      {imagemAmpliada && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center cursor-pointer" onClick={() => setImagemAmpliada(null)}>
          <img src={imagemAmpliada} className="max-h-[90vh]" alt="Ampliada" />
        </div>
      )}
      
      <div className="flex bg-white rounded-t-lg border-b border-gray-200 overflow-x-auto custom-scrollbar shadow-sm">
        <button onClick={() => setActiveTab('pai')} className={`py-4 px-6 text-sm font-bold whitespace-nowrap border-b-4 transition-colors focus:outline-none flex items-center gap-2 ${activeTab === 'pai' ? 'border-blue-600 text-blue-700 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
          📦 Dados Principais (Pai)
        </button>

        {filhos.map((filho, idx) => {
          const gradeParsed = parseGrade(filho.grade);
          const nomeAba = Object.values(gradeParsed).join(' / ') || filho.codigo || `Variação ${idx + 1}`;
          return (
            <button key={idx} onClick={() => setActiveTab(idx)} className={`py-4 px-6 text-sm font-bold whitespace-nowrap border-b-4 transition-colors focus:outline-none flex items-center gap-2 ${activeTab === idx ? 'border-purple-600 text-purple-700 bg-purple-50/30' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
              <span className="w-2 h-2 rounded-full bg-purple-400"></span> {nomeAba}
            </button>
          )
        })}
      </div>

      <div className="bg-white p-6 rounded-b-lg shadow-sm border border-t-0 border-gray-200 mb-6">
        {activeTab === 'pai' && (
          <FormularioBasico tituloAnuncio={tituloAnuncio} setTituloAnuncio={setTituloAnuncio} descricaoAnuncio={descricaoAnuncio} setDescricaoAnuncio={setDescricaoAnuncio} prazoFabricacao={prazoFabricacao} setPrazoFabricacao={setPrazoFabricacao} pesoEmbalagem={pesoEmbalagem} setPesoEmbalagem={setPesoEmbalagem} alturaEmbalagem={alturaEmbalagem} setAlturaEmbalagem={setAlturaEmbalagem} larguraEmbalagem={larguraEmbalagem} setLarguraEmbalagem={setLarguraEmbalagem} comprimentoEmbalagem={comprimentoEmbalagem} setComprimentoEmbalagem={setComprimentoEmbalagem} detalhesProduto={detalhesProduto} setImagemAmpliada={setImagemAmpliada} />
        )}

        {typeof activeTab === 'number' && filhos[activeTab] && (() => {
          const filho = filhos[activeTab];
          const imagens = (filho.anexos && filho.anexos.length > 0) ? filho.anexos : detalhesProduto.anexos;
          const gradeParsed = parseGrade(filho.grade);

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">Detalhes da Variação</h3>
                
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <span className="text-xs uppercase font-bold text-gray-500">SKU (Filho):</span> 
                  <span className="font-bold text-gray-900 text-lg">{filho.codigo}</span>
                </div>
                
                <div className="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-200">
                  <span className="text-xs uppercase font-bold text-green-800">Estoque Disponível:</span> 
                  <span className="font-black text-green-700 text-xl">{filho.estoque_atual} un.</span>
                </div>
                
                <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <span className="text-xs uppercase font-bold text-blue-800">Custo Base (Tiny):</span> 
                  <span className="font-bold text-blue-900 text-lg">R$ {Number(filho.preco_custo || filho.preco || 0).toFixed(2)}</span>
                </div>
                
                <div className="bg-white p-4 rounded-lg border border-gray-200 mt-4">
                  <span className="text-xs uppercase font-bold text-gray-500 block mb-3">Atributos da Grade:</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(gradeParsed).map(([k, v], i) => (
                       <span key={i} className="bg-purple-100 border border-purple-200 px-3 py-1.5 text-sm rounded-md text-purple-900 shadow-sm">
                         <b className="mr-1">{k}:</b> {v}
                       </span>
                    ))}
                    {Object.keys(gradeParsed).length === 0 && (
                      <span className="text-sm text-gray-400">Nenhuma grade definida no ERP.</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex justify-between items-center">
                  Imagens ({Math.min(imagens?.length || 0, 12)}/12 ML)
                </h3>
                
                {!(filho.anexos && filho.anexos.length > 0) && (
                   <p className="text-xs text-orange-700 font-bold mb-4 bg-orange-50 p-2 border border-orange-200 rounded-md flex items-center gap-2">
                     ⚠️ Esta variação não possui imagens próprias. O ML utilizará as imagens do Produto Pai.
                   </p>
                )}

                {imagens && imagens.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {imagens.slice(0, 12).map((img, idx) => (
                      <ImageThumbnail key={idx} src={img.anexo || img.url} alt={`Img ${idx}`} onClick={() => setImagemAmpliada(img.anexo || img.url)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 bg-gray-50 border border-dashed border-gray-300 p-8 rounded-lg text-center font-medium">
                    Nenhuma imagem disponível nesta variação nem no pai.
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <h3 className="text-xl font-black text-gray-800 mt-10 mb-4 px-2 border-l-4 border-blue-600">Configurações Globais do Anúncio</h3>
      
      <SeletorCategoria categoriaSelecionada={categoriaSelecionada} setCategoriaSelecionada={setCategoriaSelecionada} categoriasSugeridas={categoriasSugeridas} contasML={contasML} refreshTokenIfNeeded={refreshTokenIfNeeded} />
      <FormularioAtributos atributosCategoria={atributosCategoria} valoresAtributos={valoresAtributos} handleAtributoChange={handleAtributoChange} />
      <TabelaContas contasML={contasML} regrasPreco={regrasPreco} configPublicacao={configPublicacao} setConfigPublicacao={setConfigPublicacao} precosCalculados={precosCalculados} isCalculatingPrices={isCalculatingPrices} strategy={strategy} setStrategy={setStrategy} />

      <div className="flex justify-end gap-4 mt-6">
        <button onClick={publicarAnuncios} disabled={isPublishing || isCalculatingPrices} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-black uppercase rounded-lg shadow-lg disabled:opacity-50 transition-all transform hover:scale-105">
          {isPublishing ? '⏳ Publicando no ML...' : '🚀 Publicar Anúncios Agora'}
        </button>
      </div>

    </div>
  );
}