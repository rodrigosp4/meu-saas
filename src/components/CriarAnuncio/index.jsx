import React, { useState, useEffect, useCallback } from 'react';
import { useContasML } from '../../contexts/ContasMLContext';
import { stripHtml } from '../../utils/formatters';
import { ModalPreenchimentoRapido } from '../CompatibilidadeAutopecas';

import FormularioBasico from './FormularioBasico';
import SeletorCategoria from './SeletorCategoria';
import TabelaContas from './TabelaContas';
import FormularioAtributos from './FormularioAtributos';
import ImageThumbnail from '../ImageThumbnail';

const POSICOES_AUTOPECA = [
  'Dianteira', 'Traseira', 'Esquerda', 'Direita',
  'Superior', 'Inferior', 'Interno', 'Externo', 'Central',
  'Dianteira Esquerda', 'Dianteira Direita', 'Traseira Esquerda', 'Traseira Direita',
];

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
  const { tinyToken } = useContasML();
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

  // Gerenciamento de imagens
  const [imagensOrdenadas, setImagensOrdenadas] = useState([]);
  const [uploadando, setUploadando] = useState(false);
  const [removendoFundo, setRemovendoFundo] = useState(false);

  // Autopeças (pós-criação)
  const [perfisCompat, setPerfisCompat] = useState([]);
  const [perfilCompatId, setPerfilCompatId] = useState('');
  const [perfilCompatData, setPerfilCompatData] = useState(null);
  const [posicoesSelecionadas, setPosicoesSelecionadas] = useState(new Set());
  const [compatRapida, setCompatRapida] = useState(null);
  const [modalPreenchRapido, setModalPreenchRapido] = useState(false);

  // Categorias e Ficha
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null);
  const [categoriasSugeridas, setCategoriasSugeridas] = useState([]);
  const [atributosCategoria, setAtributosCategoria] = useState([]);
  const [valoresAtributos, setValoresAtributos] = useState({});

  // Estrategia e Contas
  const [strategy, setStrategy] = useState({ inflar: 0, reduzir: 0, enviarAtacado: false, ativarPromocoes: false });
  const [contasML, setContasML] = useState([]);
  const [regrasPreco, setRegrasPreco] = useState([]);
  const [configPublicacao, setConfigPublicacao] = useState({});
  const [precosCalculados, setPrecosCalculados] = useState({});
  const [isCalculatingPrices, setIsCalculatingPrices] = useState(false);
  const [configAtacado, setConfigAtacado] = useState(null);

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
        if (data.configAtacado) setConfigAtacado(data.configAtacado);

        // Carrega perfis de compatibilidade (autopeças)
        try {
          const compatRes = await fetch(`/api/compat/perfis?userId=${usuarioId}`);
          if (compatRes.ok) setPerfisCompat(await compatRes.json());
        } catch (_) {}

        const configInicial = {};
        contas.forEach(c => {
          configInicial[c.id] = { ativo: false, tipo: 'classico', regraId: regras[0]?.id || 'preco_venda', precoManual: 0 }
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
        body: JSON.stringify({ id: produto.id, tinyToken })
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
      // Inicializa imagens — prefere imagens customizadas > ordem salva no DB (dadosTiny) > API fresca
      const storedAnexos = produto.dadosTiny?.anexos;
      const urlsIniciais = (storedAnexos?.length > 0 ? storedAnexos : (data.anexos || []))
        .map(img => img.url || img.anexo).filter(Boolean);
      try {
        if (produto?.sku && usuarioId) {
          const customRes = await fetch(`/api/produto-imagens-custom?userId=${usuarioId}&sku=${encodeURIComponent(produto.sku)}`);
          if (customRes.ok) {
            const customData = await customRes.json();
            if (Array.isArray(customData.imagens) && customData.imagens.length > 0) {
              setImagensOrdenadas(customData.imagens);
            } else {
              setImagensOrdenadas(urlsIniciais);
            }
          } else {
            setImagensOrdenadas(urlsIniciais);
          }
        } else {
          setImagensOrdenadas(urlsIniciais);
        }
      } catch (_) {
        setImagensOrdenadas(urlsIniciais);
      }
      const nome = data.nome || '';
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
      const d = detalhesProduto || {};

      // Helper: encontra opção de select por nome aproximado
      const findOpt = (attr, needle) => {
        if (!needle || !attr.values?.length) return null;
        const low = String(needle).toLowerCase();
        return attr.values.find(v => v.name.toLowerCase().includes(low) || low.includes(v.name.toLowerCase())) || null;
      };

      // Mapeamento origem Tiny: 0=Nacional, 1=Estrangeira/Importada, 2=Nacional c/ importado
      const origemKeyword = { 0: 'nacional', 1: 'import', 2: 'nacional' }[Number(d.origem)] ?? '';

      const valores = {};
      data.forEach(a => {
        if (a.id === 'BRAND')                 { if (d.marca)       valores[a.id] = d.marca; }
        else if (a.id === 'GTIN')             { if (d.gtin)        valores[a.id] = d.gtin; }
        else if (a.id === 'SELLER_SKU')       { if (d.codigo)      valores[a.id] = String(d.codigo); }
        else if (a.id === 'MPN')              { if (d.mpn)         valores[a.id] = String(d.mpn); }
        else if (a.id === 'SELLER_PACKAGE_HEIGHT') { if (d.alturaEmbalagem)      valores[a.id] = `${d.alturaEmbalagem} cm`; }
        else if (a.id === 'SELLER_PACKAGE_WIDTH')  { if (d.larguraEmbalagem)     valores[a.id] = `${d.larguraEmbalagem} cm`; }
        else if (a.id === 'SELLER_PACKAGE_LENGTH')  { if (d.comprimentoEmbalagem) valores[a.id] = `${d.comprimentoEmbalagem} cm`; }
        else if (a.id === 'SELLER_PACKAGE_WEIGHT')  { if (d.peso_bruto)  valores[a.id] = `${d.peso_bruto} kg`; }
        else if (a.id === 'IS_KIT') {
          const isKit = d.tipo_produto === 'K';
          const opt = findOpt(a, isKit ? 'sim' : 'não') || findOpt(a, isKit ? 'yes' : 'no');
          if (opt) valores[a.id] = { value_id: String(opt.id), value_name: opt.name };
        }
        else if (a.id === 'ORIGIN' || a.id === 'PRODUCT_ORIGIN') {
          if (origemKeyword) {
            const opt = findOpt(a, origemKeyword);
            if (opt) valores[a.id] = { value_id: String(opt.id), value_name: opt.name };
          }
        }
      });
      setValoresAtributos(valores);
    } catch(e) {}
  };

  const handleAtributoChange = (id, valor) => {
    setValoresAtributos(prev => ({ ...prev, [id]: valor }));
  };

  // Upload de imagem para o Imgur
  const uploadParaImgur = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadando(true);
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
      setImagensOrdenadas(prev => prev.length < 12 ? [...prev, data.url] : prev);
    } catch (e) {
      alert(`Erro ao enviar para o Imgur: ${e.message}`);
    } finally {
      setUploadando(false);
    }
  }, [usuarioId]);

  // Remove fundo da imagem (idx), converte para JPG 1000x1000 e re-hospeda no Imgur
  const removerFundoEOtimizar = useCallback(async (idx) => {
    const urlAtual = imagensOrdenadas[idx];
    if (!urlAtual || !urlAtual.trim()) return alert('Nenhuma imagem na posição de capa.');
    setRemovendoFundo(true);
    try {
      // 1. Prepara payload. Se for blob/base64 local faz leitura, senão envia a URL para o backend contornar o CORS
      let payloadParams = {};
      if (urlAtual.startsWith('data:image')) {
        payloadParams.imageBase64 = urlAtual.split(',')[1];
      } else if (urlAtual.startsWith('blob:') || urlAtual.startsWith('blob/')) {
        const imgRes = await fetch(urlAtual);
        const blob = await imgRes.blob();
        const originalBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        payloadParams.imageBase64 = originalBase64;
      } else {
        payloadParams.imageUrl = urlAtual;
      }

      // 2. Remove fundo via backend (remove.bg)
      const rbRes = await fetch(`/api/usuario/${usuarioId}/imagem/remover-fundo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadParams),
      });
      const rbData = await rbRes.json();
      if (!rbRes.ok) throw new Error(rbData.erro || 'Erro no remove.bg');

      // 3. Converte PNG transparente → JPG 1000x1000 com fundo branco via Canvas
      const jpegBase64 = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1000;
          canvas.height = 1000;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 1000, 1000);
          const scale = Math.min(1000 / img.width, 1000 / img.height);
          const x = (1000 - img.width * scale) / 2;
          const y = (1000 - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          resolve(canvas.toDataURL('image/jpeg', 0.93).split(',')[1]);
        };
        img.onerror = reject;
        img.src = `data:image/png;base64,${rbData.pngBase64}`;
      });

      // 4. Faz upload do JPG no Imgur
      const upRes = await fetch(`/api/usuario/${usuarioId}/imgur/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: jpegBase64 }),
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.erro || 'Erro no upload Imgur');

      // 5. Move original para slot 2 e coloca imagem tratada na capa
      setImagensOrdenadas(prev => {
        const arr = [...prev];
        const originalUrl = arr[idx];
        // Insere a imagem tratada no slot idx e empurra o original logo após
        arr.splice(idx, 1, upData.url, originalUrl);
        const novas = arr.slice(0, 12); // respeita limite ML

        // 6. Salva no banco para não precisar re-tratar na próxima vez
        if (produto?.sku && usuarioId) {
          fetch('/api/produto-imagens-custom', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: usuarioId, sku: produto.sku, imagens: novas }),
          }).catch(() => {});
        }

        return novas;
      });
    } catch (e) {
      alert(`Erro ao remover fundo: ${e.message}`);
    } finally {
      setRemovendoFundo(false);
    }
  }, [usuarioId, imagensOrdenadas, produto]);

  // Carrega dados do perfil de compatibilidade selecionado
  const handlePerfilCompatChange = async (id) => {
    setPerfilCompatId(id);
    setPerfilCompatData(null);
    if (!id) return;
    try {
      const res = await fetch(`/api/compat/perfis/${id}?userId=${usuarioId}`);
      if (res.ok) setPerfilCompatData(await res.json());
    } catch (_) {}
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

    const regraId = config.regraId;

    // Opção fixa: Preço Manual — retorna diretamente sem cálculo
    if (regraId === 'manual') {
      const precoFinal = Number(config.precoManual || 0);
      if (precoFinal <= 0) return null;
      return {
        precoFinal,
        historico: [{ descricao: 'Preço Manual Informado', valor: precoFinal, tipo: 'valor' }]
      };
    }

    const pVenda = Number(detalhesProduto.preco || 0);
    const pPromo = Number(detalhesProduto.preco_promocional || 0);
    const pCusto = Number(detalhesProduto.preco_custo || 0);

    let custoBase = 0;
    let tipoBase = '';

    // Opções fixas — retornam o preço do ERP diretamente, sem tarifas ou cálculos
    if (regraId === 'preco_venda') {
      return {
        precoFinal: pVenda,
        historico: [{ descricao: 'Preço de Venda (ERP)', valor: pVenda, tipo: 'valor' }]
      };
    } else if (regraId === 'preco_promocional') {
      const precoFinal = pPromo > 0 ? pPromo : pVenda;
      const label = pPromo > 0 ? 'Preço Promocional (ERP)' : 'Preço de Venda (ERP)';
      return {
        precoFinal,
        historico: [{ descricao: label, valor: precoFinal, tipo: 'valor' }]
      };
    } else {
      // Regra customizada do usuário
      const regra = regrasPreco.find(r => r.id === regraId);
      if (!regra) return null;
      tipoBase = regra.precoBase || 'promocional';
      if (tipoBase === 'venda') custoBase = pVenda;
      else if (tipoBase === 'promocional') custoBase = pPromo > 0 ? pPromo : pVenda;
      else if (tipoBase === 'custo') custoBase = pCusto > 0 ? pCusto : pVenda;
      else custoBase = pPromo > 0 ? pPromo : pVenda;
    }

    let historico = [{ descricao: `Preço Base (${tipoBase.toUpperCase()})`, valor: custoBase, tipo: 'valor' }];
    let valorAtualCusto = custoBase;
    let totalTaxasVendaPerc = 0;

    let historicoCustos = [];
    let historicoTaxasVenda = [];

    // Variáveis da regra customizada (não se aplica às opções fixas)
    const regraCustomizada = regrasPreco.find(r => r.id === regraId);
    (regraCustomizada?.variaveis || []).forEach(v => {
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
            totalTaxasVendaPerc += v.valor;
            historicoTaxasVenda.push({ descricao: v.nome, originalPerc: v.valor, tipo: 'taxa_venda' });
        }
    });

    const tipoCalc = tipoOverride || config.tipo;
    const tarifaMLPerc = tipoCalc === 'premium' ? 16 : 11;
    const netFactor = 1 - ((tarifaMLPerc + totalTaxasVendaPerc) / 100);

    if (netFactor <= 0) return { precoFinal: valorAtualCusto, historico };

    let precoAlvo = (valorAtualCusto + 6) / netFactor;
    let precoFinal = strategy.inflar > 0 ? precoAlvo / (1 - (strategy.inflar / 100)) : precoAlvo;
    let custoFreteML = 0;
    let foiReduzido = false;
    let freteAplicado = false;

    if (precoFinal >= 79 && conta.envioSuportado !== 'ME1') {
      try {
        const token = await refreshTokenIfNeeded(conta);
        const dimStr = `${Math.round(alturaEmbalagem)}x${Math.round(larguraEmbalagem)}x${Math.round(comprimentoEmbalagem)},${Math.round(pesoEmbalagem * 1000)}`;

        // Loop de convergência para encontrar o frete exato (o frete muda conforme o preço sobe)
        for (let i = 0; i < 3; i++) {
          const res = await fetch('/api/ml/simulate-shipping', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, sellerId: conta.id, itemPrice: precoFinal, categoryId: categoriaSelecionada.category_id, listingTypeId: tipoCalc === 'premium' ? 'gold_pro' : 'gold_special', dimensions: dimStr })
          });
          const data = await res.json();
          custoFreteML = data.cost || 0;

          let n_alvo = (valorAtualCusto + custoFreteML) / netFactor;
          let n_final = strategy.inflar > 0 ? n_alvo / (1 - (strategy.inflar / 100)) : n_alvo;

          if (Math.abs(n_final - precoFinal) < 0.1) { 
              precoFinal = n_final; 
              precoAlvo = n_alvo; 
              break; 
          }
          precoFinal = n_final;
          precoAlvo = n_alvo;
        }
      } catch (e) {
        custoFreteML = 35;
        precoAlvo = (valorAtualCusto + custoFreteML) / netFactor;
        precoFinal = strategy.inflar > 0 ? precoAlvo / (1 - (strategy.inflar / 100)) : precoAlvo;
      }
    }

    if (precoFinal >= 79) {
        freteAplicado = true;
        if (strategy.reduzir > 0 && precoFinal * (1 - (strategy.reduzir / 100)) <= 78.99) {
           precoFinal = 78.99;
           precoAlvo = strategy.inflar > 0 ? precoFinal * (1 - (strategy.inflar / 100)) : precoFinal;
           foiReduzido = true;
           freteAplicado = false;
        }
    }

    precoAlvo = Math.round(precoAlvo * 100) / 100;
    precoFinal = Math.round(precoFinal * 100) / 100;

    historico = [...historico, ...historicoCustos];

    if (freteAplicado && custoFreteML > 0) {
        historico.push({ descricao: 'Frete Grátis (ML)', valor: custoFreteML, tipo: 'custo_ml' });
    }
    if (!freteAplicado) {
        historico.push({ descricao: 'Custo Fixo (ML)', valor: 6.00, tipo: 'custo_ml' });
    }
    if (conta.envioSuportado === 'ME1' && precoFinal >= 79) {
        historico.push({ descricao: 'Frete Grátis (Isento via ME1)', valor: 0, tipo: 'custo_ml' });
    }

    if (strategy.inflar > 0 && !foiReduzido) {
        historico.push({ descricao: `Inflado em ${strategy.inflar}% (Margem Promo)`, valor: precoFinal - precoAlvo, isPerc: true, originalPerc: strategy.inflar, tipo: 'custo' });
    }
    if (foiReduzido) {
        historico.push({ descricao: `Reduzido para R$ 78,99`, valor: -(precoAlvo - 78.99), tipo: 'custo' });
    }

    // A tarifa do ML incide sempre sobre o que o cliente pagou de fato
    const tarifaMLValor = precoAlvo * (tarifaMLPerc / 100);
    historico.push({ descricao: `Tarifa ML (${tipoCalc === 'premium' ? 'Premium' : 'Clássico'})`, valor: tarifaMLValor, isPerc: true, originalPerc: tarifaMLPerc, tipo: 'custo_ml' });

    historicoTaxasVenda.forEach(taxa => {
        taxa.valor = precoAlvo * (taxa.originalPerc / 100);
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
    .filter(([_, v]) => v && (typeof v !== 'object' || v.value_id || v.value_name) && String(v).trim() !== '')
    .map(([id, v]) => {
      if (typeof v === 'object') {
        const attr = { id, value_name: v.value_name };
        if (v.value_id) attr.value_id = v.value_id; // só inclui value_id se não for vazio
        return attr;
      }
      return { id, value_name: String(v) };
    })
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
        const res = await fetch('/api/ml/publish', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: usuarioId,
              contaNome: nomeDaConta,
              sku: produto?.sku || 'S/ SKU',
              accessToken: token,
              payload,
              description: descricao,
              enviarAtacado: strategy.enviarAtacado || false,
              inflar: strategy.inflar || 0,
              ativarPromocoes: strategy.ativarPromocoes || false,
              compatibilidades: compatRapida ? compatRapida.slice(0, 200) : (perfilCompatData ? (perfilCompatData.compatibilities || []).slice(0, 200) : []),
              posicoes: Array.from(posicoesSelecionadas),
            })
        });
        return { ok: res.ok, data: await res.json() };
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

          // Usa imagens ordenadas pelo usuário (ou as do Tiny se estiver vazio)
          const urlsPai = imagensOrdenadas.length > 0
            ? imagensOrdenadas
            : (detalhesProduto.anexos || []).map(img => img.anexo || img.url || img).filter(u => typeof u === 'string');
          urlsPai.filter(u => u.trim()).forEach(url => allPicturesMap.set(url, { source: url }));

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
              ...(!temVariacoes ? { family_name: tituloAnuncio.substring(0, 60) } : {}),
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

  const isAutoPecasCategory = (categoriaSelecionada?.domain_name && /VEHICLE|AUTO|MOTOR/i.test(categoriaSelecionada.domain_name)) || 
                              atributosCategoria.some(a => ['POSITION', 'PART_NUMBER', 'OEM', 'COMPATIBILITY'].includes(a.id));

  return (
    <>
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
          <FormularioBasico
            tituloAnuncio={tituloAnuncio} setTituloAnuncio={setTituloAnuncio}
            descricaoAnuncio={descricaoAnuncio} setDescricaoAnuncio={setDescricaoAnuncio}
            prazoFabricacao={prazoFabricacao} setPrazoFabricacao={setPrazoFabricacao}
            pesoEmbalagem={pesoEmbalagem} setPesoEmbalagem={setPesoEmbalagem}
            alturaEmbalagem={alturaEmbalagem} setAlturaEmbalagem={setAlturaEmbalagem}
            larguraEmbalagem={larguraEmbalagem} setLarguraEmbalagem={setLarguraEmbalagem}
            comprimentoEmbalagem={comprimentoEmbalagem} setComprimentoEmbalagem={setComprimentoEmbalagem}
            detalhesProduto={detalhesProduto} setImagemAmpliada={setImagemAmpliada}
            imagensOrdenadas={imagensOrdenadas} onImagensChange={setImagensOrdenadas}
            uploadando={uploadando} onUploadImagem={uploadParaImgur}
            onRemoverFundo={removerFundoEOtimizar} removendoFundo={removendoFundo}
          />
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
      <FormularioAtributos
        atributosCategoria={atributosCategoria}
        valoresAtributos={valoresAtributos}
        handleAtributoChange={handleAtributoChange}
        tituloAnuncio={tituloAnuncio}
        descricaoAnuncio={descricaoAnuncio}
        fotosUrls={imagensOrdenadas.filter(u => u.trim())}
      />

      {/* ===== SEÇÃO AUTOPEÇAS (visível para categorias automotivas) ===== */}
      {isAutoPecasCategory && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
          <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2 text-base">
            🚗 Autopeças
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Opcionais — enviados via fila após criação do anúncio
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">

            {/* Compatibilidade */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
                🔗 Compatibilidade de Veículos
              </label>
              <div className="flex gap-2 items-start">
                {perfisCompat.length === 0 ? (
                  <p className="flex-1 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Nenhum perfil salvo. Crie perfis na aba <strong>Compatibilidade</strong>.
                  </p>
                ) : (
                  <select
                    value={perfilCompatId}
                    onChange={e => { handlePerfilCompatChange(e.target.value); setCompatRapida(null); }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">-- Não aplicar --</option>
                    {perfisCompat.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setModalPreenchRapido(true)}
                  className="px-3 py-2 text-sm font-bold border border-violet-300 text-violet-700 bg-violet-50 rounded-md hover:bg-violet-100 transition whitespace-nowrap"
                >
                  ⚡ Preenchimento Rápido
                </button>
              </div>
              {compatRapida && (
                <p className="mt-2 text-xs text-violet-700 font-semibold bg-violet-50 border border-violet-200 rounded px-2 py-1 flex items-center justify-between">
                  <span>⚡ {compatRapida.length} veículos (preenchimento rápido) — enviados após criação.</span>
                  <button type="button" onClick={() => setCompatRapida(null)} className="ml-2 text-violet-400 hover:text-violet-700">✕</button>
                </p>
              )}
              {!compatRapida && perfilCompatData && (
                <p className="mt-2 text-xs text-green-700 font-semibold bg-green-50 border border-green-200 rounded px-2 py-1">
                  ✅ {(perfilCompatData.compatibilities || []).length} veículos — será enviado após a criação.
                </p>
              )}
            </div>

            {/* Posição */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
                📍 Posição da Peça
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {POSICOES_AUTOPECA.map(pos => (
                  <label
                    key={pos}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded border cursor-pointer text-xs font-semibold select-none transition-colors ${
                      posicoesSelecionadas.has(pos)
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                        : 'border-gray-200 text-gray-600 hover:border-cyan-300 hover:bg-cyan-50/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
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
                <p className="mt-2 text-xs text-cyan-700 font-semibold bg-cyan-50 border border-cyan-200 rounded px-2 py-1">
                  ✅ {posicoesSelecionadas.size} posição(ões) selecionada(s) — enviadas após criação.
                </p>
              )}
            </div>

          </div>
        </div>
      )}

      <TabelaContas contasML={contasML} regrasPreco={regrasPreco} configPublicacao={configPublicacao} setConfigPublicacao={setConfigPublicacao} precosCalculados={precosCalculados} isCalculatingPrices={isCalculatingPrices} strategy={strategy} setStrategy={setStrategy} configAtacado={configAtacado} />

      <div className="flex justify-end gap-4 mt-6">
        <button onClick={publicarAnuncios} disabled={isPublishing || isCalculatingPrices} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-black uppercase rounded-lg shadow-lg disabled:opacity-50 transition-all transform hover:scale-105">
          {isPublishing ? '⏳ Publicando no ML...' : '🚀 Publicar Anúncios Agora'}
        </button>
      </div>

    </div>

    {modalPreenchRapido && (
      <ModalPreenchimentoRapido
        contaId={contasML[0]?.id}
        usuarioId={usuarioId}
        onClose={() => setModalPreenchRapido(false)}
        onAplicarLocal={(veiculos) => { setCompatRapida(veiculos); setPerfilCompatId(''); setPerfilCompatData(null); }}
      />
    )}
    </>
  );
}