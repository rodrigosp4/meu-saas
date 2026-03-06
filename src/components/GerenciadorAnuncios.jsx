import React, { useState, useEffect } from 'react';

// ✅ Mapa de tradução das tags do ML para labels amigáveis e cores
const TAG_DISPLAY_MAP = {
  incomplete_compatibilities:           { label: 'Compat. Incompleta',    color: 'bg-orange-100 text-orange-800 border-orange-200' },
  incomplete_position_compatibilities:  { label: 'Posição Compat. Inc.',  color: 'bg-orange-100 text-orange-800 border-orange-200' },
  poor_quality_picture:                 { label: 'Foto Ruim',            color: 'bg-red-100 text-red-800 border-red-200' },
  poor_quality_thumbnail:               { label: 'Thumb Ruim',           color: 'bg-red-100 text-red-800 border-red-200' },
  picture_downloading_pending:          { label: 'Download Foto Pend.',  color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  moderation_penalty:                   { label: 'Penalidade Moderação', color: 'bg-red-200 text-red-900 border-red-300' },
  out_of_stock:                         { label: 'Sem Estoque (Tag)',    color: 'bg-gray-200 text-gray-800 border-gray-300' },
  incomplete_technical_specs:           { label: 'Ficha Técnica Inc.',   color: 'bg-amber-100 text-amber-800 border-amber-200' },
  waiting_for_patch:                    { label: 'Aguardando Patch',     color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

function getTagBadge(tagValue) {
  const mapped = TAG_DISPLAY_MAP[tagValue];
  if (mapped) {
    return <span className={`${mapped.color} border text-[9px] px-1.5 py-0.5 rounded font-bold`}>{mapped.label}</span>;
  }
  const label = tagValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[9px] px-1.5 py-0.5 rounded font-bold">{label}</span>;
}

// ===== MODAL PREENCHER FICHA TÉCNICA =====
const CAMPOS_FICHA = [
  { id: 'BRAND',       label: 'Marca',                   placeholder: 'Ex: Bosch, 3M, Würth...' },
  { id: 'MODEL',       label: 'Modelo',                   placeholder: 'Ex: GBH 2-26 D' },
  { id: 'PART_NUMBER', label: 'Código do Fabricante (Part Number)', placeholder: 'Ex: 0611253768' },
  { id: 'GTIN',        label: 'GTIN / EAN / Código de Barras', placeholder: 'Ex: 7891234567890' },
  { id: 'TYPE',        label: 'Tipo',                     placeholder: 'Ex: Furadeira de Impacto' },
  { id: 'MATERIAL',    label: 'Material',                 placeholder: 'Ex: Aço Inoxidável' },
  { id: 'COLOR',       label: 'Cor / Acabamento',         placeholder: 'Ex: Preto' },
  { id: 'VOLTAGE',     label: 'Voltagem',                 placeholder: 'Ex: 220V / Bivolt' },
  { id: 'WARRANTY',    label: 'Garantia',                 placeholder: 'Ex: 12 meses' },
];

function ModalFichaTecnica({ anuncio, onClose }) {
  const [valores, setValores] = useState({});

  if (!anuncio) return null;

  const handleChange = (id, val) => setValores(prev => ({ ...prev, [id]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-black text-base">Preencher Ficha Técnica</h2>
            <p className="text-amber-100 text-xs mt-0.5 truncate max-w-sm" title={anuncio.titulo}>{anuncio.titulo}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tag de aviso */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-amber-700 text-xs font-semibold">
            Anúncio <span className="font-black font-mono">{anuncio.id}</span> — Ficha Técnica Incompleta (incomplete_technical_specs)
          </span>
        </div>

        {/* Campos */}
        <div className="px-6 py-4 max-h-[55vh] overflow-y-auto space-y-3">
          {CAMPOS_FICHA.map(campo => (
            <div key={campo.id}>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                {campo.label}
              </label>
              <input
                type="text"
                value={valores[campo.id] || ''}
                onChange={e => handleChange(campo.id, e.target.value)}
                placeholder={campo.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400 italic">* Integração com API em breve</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              disabled
              title="Integração com ML em desenvolvimento"
              className="px-5 py-2 text-sm font-black text-white bg-amber-500 rounded-lg opacity-60 cursor-not-allowed flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Salvar na ML (em breve)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
// =========================================

// ===== MODAL CORRIGIR PREÇO DETALHADO =====
function calcularPrecoCorrigir(precoBase, inflar, reduzir) {
  if (!precoBase || isNaN(precoBase) || precoBase <= 0) return null;
  const inflarSafe = Math.min(Math.max(0, inflar), 99);
  let precoFinal = inflarSafe > 0 ? precoBase / (1 - inflarSafe / 100) : precoBase;
  if (precoFinal >= 79 && reduzir > 0) {
    if (precoFinal * (1 - reduzir / 100) <= 78.99) precoFinal = 78.99;
  }
  precoFinal = Math.round(precoFinal * 100) / 100;

  return {
    precoFinal,
    historico:[
      { descricao: 'Preço Manual', valor: precoBase, tipo: 'valor' },
      inflarSafe > 0 ? { descricao: `Inflado em ${inflarSafe}%`, valor: precoFinal - precoBase, tipo: 'custo' } : null,
      (precoFinal === 78.99 && reduzir > 0) ? { descricao: `Reduzido para R$ 78,99`, valor: -Math.abs(precoBase - 78.99), tipo: 'custo' } : null
    ].filter(Boolean)
  };
}

// ✅ CORRIGIDO: Lógica de cálculo e aplicação dinâmica do frete da API
function calcularPrecoRegra(precoBase, regra, tipoML, inflar, reduzir, custoFreteGratis = 0) {
  if (!precoBase || !regra || isNaN(precoBase) || precoBase <= 0) return null;

  let custoBaseOriginal = precoBase;
  let impostosPerc = 0;

  let historicoCustos = [];
  let historicoTaxasVenda = [];

  // Soma todas as taxas atreladas ao custo antes do ML
  (regra.variaveis || []).forEach(v => {
    if (v.tipo === 'fixo_custo') {
      custoBaseOriginal += v.valor;
      historicoCustos.push({ descricao: v.nome, valor: v.valor, tipo: 'custo' });
    } else if (v.tipo === 'perc_custo') {
      const calcVal = custoBaseOriginal * (v.valor / 100);
      custoBaseOriginal += calcVal;
      historicoCustos.push({ descricao: v.nome, valor: calcVal, isPerc: true, originalPerc: v.valor, tipo: 'custo' });
    } else if (v.tipo === 'perc_venda') {
      impostosPerc += v.valor;
      historicoTaxasVenda.push({ descricao: v.nome, originalPerc: v.valor, tipo: 'taxa_venda' });
    }
  });

  const tarifaML = tipoML === 'premium' ? 16 : 11;
  const totalTaxas = (tarifaML + impostosPerc) / 100;

  if (totalTaxas >= 1) return { precoFinal: Math.round(custoBaseOriginal * 100) / 100, historico: [] };

  const inflarSafe = Math.min(Math.max(0, inflar), 99);

  // TENTATIVA 1: Simula como se fosse abaixo de R$ 79,00 (com custo fixo de R$ 6,00 em vez do frete)
  let precoBaseCalc = (custoBaseOriginal + 6) / (1 - totalTaxas);
  let precoFinal = inflarSafe > 0 ? precoBaseCalc / (1 - inflarSafe / 100) : precoBaseCalc;

  let freteAplicado = false;
  let foiReduzido = false;

  // Se o preço final ultrapassar R$ 79,00, o ML isenta os R$ 6 e passa a cobrar o Frete Grátis
  if (precoFinal >= 79) {
     let custoComFrete = custoBaseOriginal + custoFreteGratis;
     precoBaseCalc = custoComFrete / (1 - totalTaxas);
     precoFinal = inflarSafe > 0 ? precoBaseCalc / (1 - inflarSafe / 100) : precoBaseCalc;
     freteAplicado = true;

     // Aplica estratégia de redução para tentar cravar em R$ 78,99 e fugir do frete grátis do ML
     if (reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) {
       precoFinal = 78.99;
       foiReduzido = true;
       freteAplicado = false; // Como o preço voltou pra < 79, o frete grátis cai e volta a taxa fixa de R$ 6,00.
       precoBaseCalc = (custoBaseOriginal + 6) / (1 - totalTaxas);
     }
  }

  // Monta o histórico visual para o popup na tela
  let historico = [{ descricao: 'Preço Base (Tiny)', valor: precoBase, tipo: 'valor' }];
  historico = [...historico, ...historicoCustos];

  if (freteAplicado && custoFreteGratis > 0) {
     historico.push({ descricao: 'Frete Grátis (API ML)', valor: custoFreteGratis, tipo: 'custo_ml' });
  }

  if (!freteAplicado) {
    historico.push({ descricao: 'Custo Fixo (ML)', valor: 6.00, tipo: 'custo_ml' });
  }

  if (inflarSafe > 0 && !foiReduzido) {
    historico.push({ descricao: `Inflado em ${inflarSafe}%`, valor: precoFinal - precoBaseCalc, isPerc: true, originalPerc: inflarSafe, tipo: 'custo' });
  }

  if (foiReduzido) {
    historico.push({ descricao: `Reduzido para R$ 78,99`, valor: -(precoBaseCalc - 78.99), tipo: 'custo' });
  }

  const tarifaMLValor = precoFinal * (tarifaML / 100);
  historico.push({ descricao: `Tarifa ML (${tipoML === 'premium' ? 'Premium' : 'Clássico'})`, valor: tarifaMLValor, isPerc: true, originalPerc: tarifaML, tipo: 'custo_ml' });

  historicoTaxasVenda.forEach(taxa => {
    taxa.valor = precoFinal * (taxa.originalPerc / 100);
    historico.push(taxa);
  });

  return { precoFinal: Math.round(precoFinal * 100) / 100, historico };
}

function resolverPrecoBase(precosTiny, tipoBase) {
  if (!precosTiny) return 0;
  const pVenda = Number(precosTiny.preco || 0);
  const pPromo = Number(precosTiny.preco_promocional || 0);
  const pCusto = Number(precosTiny.preco_custo || 0);

  if (tipoBase === 'venda') return pVenda;
  if (tipoBase === 'custo') return pCusto > 0 ? pCusto : pVenda;
  return pPromo > 0 ? pPromo : pVenda;
}

function ModalCorrigirPreco({ anunciosSelecionados, regrasPreco, usuarioId, onClose, onSuccess }) {
  const [modo, setModo] = useState('manual');
  const [precoManual, setPrecoManual] = useState('');
  const [regraId, setRegraId] = useState(regrasPreco[0]?.id || '');
  const [precoBaseManual, setPrecoBaseManual] = useState('');
  const [inflar, setInflar] = useState(0);
  const [reduzir, setReduzir] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [resultados, setResultados] = useState(null);
  const [detalheAberto, setDetalheAberto] = useState(null); // { ad, resultado }
  const [removerPromocoes, setRemoverPromocoes] = useState(false);

const [precosTinyMap, setPrecosTinyMap] = useState({});
  const [loadingPrecos, setLoadingPrecos] = useState(true);
  const [precoBaseAutoPreenchido, setPrecoBaseAutoPreenchido] = useState(false);
  const [custoFreteMap, setCustoFreteMap] = useState({});
  const [loadingFrete, setLoadingFrete] = useState(true); // <--- ADICIONE ESTA LINHA

  const regra = regrasPreco.find(r => r.id === regraId);

  // Para anúncios com variações, o SKU pode não estar no nível do item — busca na primeira variação
  const getEfetivaSku = (ad) => {
    if (ad.sku) return ad.sku;
    const variations = ad.dadosML?.variations;
    if (Array.isArray(variations)) {
      for (const v of variations) {
        const vSku = v.seller_custom_field
          || (Array.isArray(v.attributes) && v.attributes.find(a => a.id === 'SELLER_SKU'))?.value_name;
        if (vSku && vSku !== '-1') return vSku;
      }
    }
    return null;
  };

  const skusUnicos = [...new Set(anunciosSelecionados.map(ad => getEfetivaSku(ad)).filter(Boolean))];
  const temMultiplosSKUs = skusUnicos.length > 1;

  useEffect(() => {
    if (skusUnicos.length === 0) {
      setLoadingPrecos(false);
      return;
    }
    setLoadingPrecos(true);
    fetch('/api/produtos/precos-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: usuarioId, skus: skusUnicos })
    })
      .then(r => r.json())
      .then(data => { if (data.precos) setPrecosTinyMap(data.precos); })
      .catch(err => console.error('Erro ao buscar preços Tiny:', err))
      .finally(() => setLoadingPrecos(false));
  }, [anunciosSelecionados, usuarioId]);

  useEffect(() => {
    if (modo !== 'regra' || !regra || temMultiplosSKUs || skusUnicos.length === 0) {
      setPrecoBaseAutoPreenchido(false);
      setPrecoBaseManual('');
      return;
    }

    const sku = skusUnicos[0];
    const precosDoSku = precosTinyMap[sku];
    if (precosDoSku) {
      const tipoBase = regra.precoBase || 'promocional';
      const preco = resolverPrecoBase(precosDoSku, tipoBase);
      if (preco > 0) {
        setPrecoBaseManual(String(preco));
        setPrecoBaseAutoPreenchido(true);
      }
    } else {
      setPrecoBaseAutoPreenchido(false);
      setPrecoBaseManual('');
    }
  }, [modo, regraId, precosTinyMap, regra, temMultiplosSKUs]);

// ✅ CORRIGIDO: Remove o filtro falho e busca o frete para todos os itens selecionados
  useEffect(() => {
    if (anunciosSelecionados.length === 0) return;

    setLoadingFrete(true);
    fetch('/api/ml/shipping-cost-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: usuarioId,
        items: anunciosSelecionados.map(ad => ({ itemId: ad.id, contaId: ad.contaId }))
      })
    })
      .then(r => r.json())
      .then(data => { if (data.custos) setCustoFreteMap(data.custos); })
      .catch(err => console.error('Erro ao buscar custo de frete:', err))
      .finally(() => setLoadingFrete(false));
  }, [anunciosSelecionados, usuarioId]);

  const calcularPrecoPorItem = (anuncio) => {
    const tipoAnuncioML = anuncio.dadosML?.listing_type_id?.includes('pro') ? 'premium' : 'classico';
    const skuDoAnuncio = getEfetivaSku(anuncio);

    if (modo === 'manual') {
      return calcularPrecoCorrigir(Number(precoManual), inflar, reduzir)?.precoFinal;
    }

    if (!regra) return null;

    let precoBaseItem = Number(precoBaseManual);
    if (precosTinyMap[skuDoAnuncio]) {
      const tipoBaseRegra = regra.precoBase || 'promocional';
      precoBaseItem = resolverPrecoBase(precosTinyMap[skuDoAnuncio], tipoBaseRegra);
    }

    if (precoBaseItem <= 0) return null;

    const custoFrete = custoFreteMap[anuncio.id] || 0;
    return calcularPrecoRegra(precoBaseItem, regra, tipoAnuncioML, inflar, reduzir, custoFrete)?.precoFinal;
  };

  const calcularDetalhePorItem = (anuncio) => {
    const tipoAnuncioML = anuncio.dadosML?.listing_type_id?.includes('pro') ? 'premium' : 'classico';
    const skuDoAnuncio = getEfetivaSku(anuncio);
    if (modo === 'manual') {
      return calcularPrecoCorrigir(Number(precoManual), inflar, reduzir);
    }
    if (!regra) return null;
    let precoBaseItem = Number(precoBaseManual);
    if (precosTinyMap[skuDoAnuncio]) {
      precoBaseItem = resolverPrecoBase(precosTinyMap[skuDoAnuncio], regra.precoBase || 'promocional');
    }
    if (precoBaseItem <= 0) return null;
    const custoFrete = custoFreteMap[anuncio.id] || 0;
    return calcularPrecoRegra(precoBaseItem, regra, tipoAnuncioML, inflar, reduzir, custoFrete);
  };

  const handleEnviar = async () => {
    setIsLoading(true);
    setResultados(null);
    try {
      const itemsPayload = anunciosSelecionados.map(ad => ({
        itemId: ad.id,
        contaId: ad.contaId,
        preco: calcularPrecoPorItem(ad)
      }));

      const algumInvalido = itemsPayload.some(i => !i.preco || i.preco <= 0);
      if (algumInvalido) {
        const skusSemPreco = anunciosSelecionados
          .filter((_, i) => !itemsPayload[i].preco || itemsPayload[i].preco <= 0)
          .map(ad => ad.sku)
          .join(', ');
        throw new Error(`Alguns itens não puderam ser calculados. Verifique se os SKUs (${skusSemPreco}) estão sincronizados e têm preço no Tiny.`);
      }

      const body = { userId: usuarioId, items: itemsPayload, modoPrecoIndividual: true, removerPromocoes };

      const res = await fetch('/api/ml/corrigir-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro no servidor');

      setResultados(data);
      if (data.resumo?.ok > 0) onSuccess?.();
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const tipoBaseTexto = regra
    ? (regra.precoBase === 'venda' ? 'Preço de Venda' : regra.precoBase === 'custo' ? 'Preço de Custo' : 'Preço Promocional ou Venda')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-base">Corrigir Preço</h2>
            <p className="text-blue-100 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Anúncios selecionados */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 max-h-36 overflow-y-auto">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Anúncios selecionados</p>
            {anunciosSelecionados.map(ad => (
              <div key={ad.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={ad.thumbnail} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                  <span className="text-xs text-gray-700 truncate">{ad.titulo}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {getEfetivaSku(ad) && precosTinyMap[getEfetivaSku(ad)] && modo === 'regra' && regra && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                      Base: R$ {resolverPrecoBase(precosTinyMap[getEfetivaSku(ad)], regra.precoBase || 'promocional').toFixed(2)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-gray-400 line-through">R$ {ad.preco?.toFixed(2)}</span>
                  {(() => { const p = calcularPrecoPorItem(ad); return p ? <span className="text-xs font-bold text-green-700">R$ {p.toFixed(2)}</span> : null; })()}
                  
                  {/* ✅ CORRIGIDO: Só mostra o botão "ver" quando a API do ML devolver o frete */}
                  {loadingFrete ? (
                    <span className="text-[10px] text-orange-500 font-bold animate-pulse px-1">Lendo Frete...</span>
                  ) : (
                    <button
                      onClick={() => { const r = calcularDetalhePorItem(ad); setDetalheAberto({ ad, resultado: r }); }}
                      className="text-[10px] text-blue-600 border border-blue-300 rounded px-1.5 py-0.5 hover:bg-blue-50 transition font-semibold leading-none"
                      title="Ver cálculo detalhado"
                    >ver</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Modo */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Modo de Precificação</p>
            <div className="flex gap-2">
              <button onClick={() => setModo('manual')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'manual' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Preço Manual</button>
              <button onClick={() => setModo('regra')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'regra' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Por Regra de Precificação</button>
            </div>
          </div>

          {modo === 'manual' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Preço Alvo (base) R$</label>
              <p className="text-xs text-gray-400 mb-2">O preço mínimo que deseja receber. O sistema aplicará a estratégia por cima.</p>
              <input
                type="number" min="0" step="0.01" value={precoManual}
                onChange={e => setPrecoManual(e.target.value)}
                placeholder="Ex: 89.90"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {modo === 'regra' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Regra de Precificação</label>
                {regrasPreco.length === 0 ? <p className="text-sm text-red-500">Nenhuma regra cadastrada. Configure em Configurações.</p> : (
                  <select value={regraId} onChange={e => setRegraId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {regrasPreco.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Preço Base R$ ({tipoBaseTexto})</label>
                {loadingPrecos && <p className="text-[10px] text-blue-500 mb-1">Buscando preço da Tiny...</p>}
                {precoBaseAutoPreenchido && !loadingPrecos && <p className="text-[10px] text-green-600 mb-1">✅ Preenchido automaticamente da Tiny.</p>}
                {temMultiplosSKUs && <p className="text-[10px] text-amber-600 mb-1">⚠️ SKUs diferentes — cada item usará seu próprio preço base da Tiny.</p>}
                {!loadingPrecos && !temMultiplosSKUs && !precoBaseAutoPreenchido && skusUnicos.length > 0 && <p className="text-[10px] text-red-500 mb-1">❌ Produto não encontrado no banco local. Sincronize com a Tiny.</p>}
                {!loadingPrecos && !temMultiplosSKUs && !precoBaseAutoPreenchido && skusUnicos.length === 0 && <p className="text-[10px] text-amber-600 mb-1">⚠️ Anúncio sem SKU vinculado. Insira o preço base manualmente.</p>}

                <input type="number" min="0" step="0.01" value={precoBaseManual}
                  onChange={e => { setPrecoBaseManual(e.target.value); setPrecoBaseAutoPreenchido(false); }}
                  placeholder={temMultiplosSKUs ? "Automático por SKU" : "Ex: 45.00"}
                  disabled={temMultiplosSKUs}
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${precoBaseAutoPreenchido ? 'border-green-400 bg-green-50' : 'border-gray-300'} ${temMultiplosSKUs ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} />
              </div>

              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                <p className="text-xs text-blue-800 font-semibold">O tipo de anúncio (Clássico/Premium) será detectado e calculado automaticamente para cada item selecionado.</p>
              </div>

              {/* Preview por item quando SKUs diferentes */}
              {temMultiplosSKUs && regra && Object.keys(precosTinyMap).length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-[10px] font-bold text-blue-700 uppercase mb-2">Preço calculado por anúncio (SKUs diferentes)</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {anunciosSelecionados.map(ad => {
                      const precoItem = calcularPrecoPorItem(ad);
                      const efSku = getEfetivaSku(ad);
                      const baseItem = efSku && precosTinyMap[efSku]
                        ? resolverPrecoBase(precosTinyMap[efSku], regra.precoBase || 'promocional')
                        : null;
                      return (
                        <div key={ad.id} className="flex items-center justify-between text-xs">
                          <span className="truncate text-gray-600 max-w-[50%]">{ad.titulo}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">Base: R$ {baseItem?.toFixed(2) || '—'}</span>
                            <span className={`font-bold ${precoItem ? 'text-green-700' : 'text-red-500'}`}>
                              → R$ {precoItem?.toFixed(2) || 'N/A'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Estratégia de Promoção e Frete */}
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
            <p className="text-xs font-bold text-purple-700 uppercase mb-3">Estratégia de Promoção e Frete</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1">Inflar Preço (%)</label>
                <p className="text-[10px] text-gray-400 mb-1.5">Aumenta o preço publicado para ter margem para promoções do ML.</p>
                <input type="number" min="0" max="99" step="1" value={inflar} onChange={e => setInflar(Math.min(99, Math.max(0, Number(e.target.value))))}
                  className="w-full px-3 py-2 border border-purple-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-red-600 mb-1">Reduzir p/ fugir de Frete Grátis (%)</label>
                <p className="text-[10px] text-gray-400 mb-1.5">Abate até X% para tentar cravar em R$ 78,99.</p>
                <input type="number" min="0" max="100" step="0.01" value={reduzir} onChange={e => setReduzir(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-red-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            </div>
          </div>

          {/* Remover promoções antes de alterar preço */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={removerPromocoes}
              onChange={e => setRemoverPromocoes(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer flex-shrink-0"
            />
            <div>
              <span className="text-sm font-bold text-gray-700">Excluir campanhas promocionais ativas antes de alterar o preço</span>
              <p className="text-xs text-gray-400 mt-0.5">Remove todas as promoções do item no ML (exceto Oferta do Dia e Oferta Relâmpago ativas) antes de enviar o novo preço.</p>
            </div>
          </label>

          {/* Resultados */}
          {resultados && (
            <div className={`rounded-lg p-4 border ${resultados.resumo.erro > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-sm font-bold mb-2">
                {resultados.resumo.ok} atualizados com sucesso{resultados.resumo.erro > 0 ? `, ${resultados.resumo.erro} com erro` : ''}
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {resultados.resultados.map(r => (
                  <div key={r.itemId} className={`text-xs flex justify-between ${r.status === 'erro' ? 'text-red-700' : 'text-green-700'}`}>
                    <span className="font-mono">{r.itemId}</span>
                    <span>{r.status === 'ok' ? `R$ ${r.precoFinal?.toFixed(2)}` : r.mensagem}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            {resultados ? 'Fechar' : 'Cancelar'}
          </button>
          {!resultados && (
            <button
              onClick={handleEnviar}
              disabled={isLoading}
              className="px-6 py-2 text-sm font-black text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {isLoading ? 'Enviando...' : `Enviar para ML (${anunciosSelecionados.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Popup cálculo detalhado */}
      {detalheAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setDetalheAberto(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">Cálculo Detalhado</p>
                <p className="text-blue-100 text-[10px] truncate max-w-[240px]">{detalheAberto.ad.titulo}</p>
              </div>
              <button onClick={() => setDetalheAberto(null)} className="text-white/80 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              {!detalheAberto.resultado ? (
                <p className="text-sm text-red-500 text-center py-2">Não foi possível calcular. Verifique o preço base.</p>
              ) : (
                <div className="space-y-1">
                  {detalheAberto.resultado.historico.map((item, i) => (
                    <div key={i} className={`flex justify-between items-center text-xs py-1 border-b border-gray-100 last:border-0 ${item.tipo === 'valor' ? 'font-bold text-gray-800' : item.tipo === 'custo_ml' ? 'text-orange-600' : 'text-red-500'}`}>
                      <span>{item.descricao}{item.isPerc ? ` (${item.originalPerc}%)` : ''}</span>
                      <span>{item.tipo === 'valor' ? `R$ ${item.valor.toFixed(2)}` : `+ R$ ${item.valor.toFixed(2)}`}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-blue-200">
                    <span className="text-sm font-black text-blue-700">Preço Final</span>
                    <span className="text-sm font-black text-blue-700">R$ {detalheAberto.resultado.precoFinal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// =========================================

export default function GerenciadorAnuncios({ usuarioId }) {
  const [anuncios, setAnuncios] = useState([]);
  const [total, setTotal] = useState(0);
  const [contasML, setContasML] = useState([]);
  const [regrasPreco, setRegrasPreco] = useState([]);
  const [fichaTecnicaModal, setFichaTecnicaModal] = useState(null);
  const [modalCorrigirPreco, setModalCorrigirPreco] = useState(false);
  const [expandedAds, setExpandedAds] = useState(new Set());
  
  const [syncProgress, setSyncProgress] = useState(null);
  const [contaParaSincronizar, setContaParaSincronizar] = useState('');

  // Estados para busca individual
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [singleMlbId, setSingleMlbId] = useState('');
  const [singleSku, setSingleSku] = useState('');
  const [selectedAccountForFetch, setSelectedAccountForFetch] = useState('');

  // Filtros principais
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [contaFilter, setContaFilter] = useState('Todas');
  const [tagFilter, setTagFilter] = useState('Todas');
  const [availableTags, setAvailableTags] = useState([]);
  const [semTagCount, setSemTagCount] = useState(0);

  // ✅ NOVO: Filtros adicionais (expansíveis)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [promoFilter, setPromoFilter] = useState('Todos');       // 'Todos' | 'com_desconto' | 'sem_desconto'
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');
  const [prazoFilter, setPrazoFilter] = useState('Todos');       // 'Todos' | 'imediato' | 'com_prazo'
  const [descontoMin, setDescontoMin] = useState('');            // ✅ NOVO
  const [descontoMax, setDescontoMax] = useState('');            // ✅ NOVO

  // Ordenação
  const [sortBy, setSortBy] = useState('padrao');

  // Checkboxes / seleção em massa
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAcoesMassa, setShowAcoesMassa] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const itemsPerPage = 50;

  // ✅ NOVO: Conta quantos filtros adicionais estão ativos (para badge no botão)
  const activeAdvancedFiltersCount = [
    promoFilter !== 'Todos',
    precoMin !== '',
    precoMax !== '',
    prazoFilter !== 'Todos',
    descontoMin !== '',       // ✅ NOVO
    descontoMax !== '',       // ✅ NOVO
  ].filter(Boolean).length;
  
  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.contasML) setContasML(data.contasML);
        if (data.regrasPreco) setRegrasPreco(data.regrasPreco);
      });
  }, [usuarioId]);

  const fetchAvailableTags = async () => {
    try {
      const idsPermitidos = contasML.map(c => c.id).join(',');
      if (!idsPermitidos) return;
      
      let queryContas = contaFilter === 'Todas' ? idsPermitidos : contaFilter;
      const res = await fetch(`/api/ml/anuncios/tags?contasIds=${queryContas}`);
      const data = await res.json();
      setAvailableTags(data.tags || []);
      setSemTagCount(data.semTagCount || 0);
    } catch (error) {
      console.error("Erro ao buscar tags:", error);
    }
  };

  const fetchAnuncios = async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
    try {
      const idsPermitidos = contasML.map(c => c.id).join(',');
      if (!idsPermitidos) return setIsLoading(false);

      let queryConta = contaFilter === 'Todas' ? idsPermitidos : contaFilter;

      const params = new URLSearchParams({
        contasIds: queryConta,
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm,
        status: statusFilter,
        tag: tagFilter,
        promo: promoFilter,
        precoMin: precoMin,
        precoMax: precoMax,
        prazo: prazoFilter,
        descontoMin: descontoMin,
        descontoMax: descontoMax,
        sortBy: sortBy,
      });

      const res = await fetch(`/api/ml/anuncios?${params.toString()}`);
      const data = await res.json();
      setAnuncios(data.anuncios);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contasML.length === 0) return; 
    fetchAnuncios();
  }, [currentPage, searchTerm, statusFilter, contaFilter, tagFilter, promoFilter, precoMin, precoMax, prazoFilter, descontoMin, descontoMax, sortBy, contasML]);

  useEffect(() => {
    if (contasML.length === 0) return;
    fetchAvailableTags();
  }, [contaFilter, contasML]);

  // ✅ NOVO: Limpar todos os filtros adicionais de uma vez
  const limparFiltrosAdicionais = () => {
    setPromoFilter('Todos');
    setPrecoMin('');
    setPrecoMax('');
    setPrazoFilter('Todos');
    setDescontoMin('');         // ✅ NOVO
    setDescontoMax('');         // ✅ NOVO
    setCurrentPage(1);
  };

// ─────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 3: Frontend — NÃO abortar no primeiro erro
// Substitua a função iniciarSincronizacaoML no seu componente React
// ─────────────────────────────────────────────────────────────────────────────

const iniciarSincronizacaoML = async () => {
  if (!contaParaSincronizar) return alert("Selecione uma conta para puxar os anúncios.");

  setSyncProgress(0);

  const contasParaSync = contaParaSincronizar === '_TODAS_'
    ? contasML.map(c => c.id)
    : [contaParaSincronizar];

  try {
    let jobIds = [];

    if (contasParaSync.length > 1) {
      // Todas as contas: um único job que coleta todos os IDs primeiro, depois baixa detalhes
      const res = await fetch('/api/ml/sync-all-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaIds: contasParaSync })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`❌ Falha ao iniciar varredura:\n${data.erro}`);
        setSyncProgress(null);
        return;
      }

      if (data.erros && data.erros.length > 0) {
        alert(`⚠️ ${data.erros.length} conta(s) com problema:\n\n${data.erros.join('\n')}`);
      }

      jobIds = [data.jobId];
    } else {
      // Conta única: comportamento original
      const contaId = contasParaSync[0];
      const res = await fetch('/api/ml/sync-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`❌ Falha ao sincronizar:\n${data.erro || 'Erro desconhecido'}`);
        setSyncProgress(null);
        return;
      }

      jobIds = [data.jobId];
    }

    if (jobIds.length === 0) {
      setSyncProgress(null);
      return;
    }

    // Polling: acompanha o progresso do(s) job(s) criado(s)
    const interval = setInterval(async () => {
      try {
        let totalProgress = 0;
        let allDone = true;
        let anyFailed = false;

        for (const jobId of jobIds) {
          const statusRes = await fetch(`/api/ml/sync-ads-status/${jobId}`);
          const statusData = await statusRes.json();

          if (statusData.state === 'failed') {
            anyFailed = true;
          } else if (statusData.state !== 'completed') {
            allDone = false;
          }
          totalProgress += (statusData.progress || 0);
        }

        const avgProgress = Math.floor(totalProgress / jobIds.length);
        setSyncProgress(avgProgress);

        if (anyFailed) {
          clearInterval(interval);
          setSyncProgress(null);
          alert("❌ Falha na importação de uma ou mais contas. Verifique o console.");
        } else if (allDone) {
          clearInterval(interval);
          setSyncProgress(100);
          setTimeout(() => {
            setSyncProgress(null);
            fetchAnuncios();
            fetchAvailableTags();
            alert("✅ Anúncios importados do Mercado Livre!");
          }, 800);
        }
      } catch (e) { /* silencia erros de polling */ }
    }, 2000);

  } catch (e) {
    alert("Erro ao disparar varredura: " + e.message);
    setSyncProgress(null);
  }
};

  const mergeAdsIntoState = (newAds) => {
    const adMap = new Map(anuncios.map(ad => [ad.id, ad]));
    newAds.forEach(newAd => adMap.set(newAd.id, newAd));
    setAnuncios(Array.from(adMap.values()));
    setTotal(adMap.size);
    fetchAvailableTags();
  };

  const handleFetchSingleMlb = async () => {
    if (!singleMlbId || !selectedAccountForFetch) return alert("Selecione a conta e digite um MLB válido.");
    
    setIsFetchingSingle(true);
    try {
      const res = await fetch(`/api/ml/anuncio/${singleMlbId.trim()}?contaId=${selectedAccountForFetch}&userId=${usuarioId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao buscar anúncio.');

      // Atualiza o estado local imediatamente (feedback rápido)
      mergeAdsIntoState([data]);
      alert(`Anúncio ${data.id} importado/atualizado com sucesso!`);
      setSingleMlbId('');
      // Re-busca do banco para garantir dados consistentes com filtros/paginação
      fetchAnuncios();
    } catch(e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsFetchingSingle(false);
    }
  };

const handleFetchBySku = async () => {
    if (!singleSku) return alert("Digite um SKU para buscar.");

    setIsFetchingSingle(true);
    try {
        const res = await fetch('/api/ml/anuncios-por-sku', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sku: singleSku.trim(), 
              userId: usuarioId 
              // Removido o envio do contaId para que o backend puxe de todas
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Falha ao buscar por SKU.');

        if (data.length === 0) {
          alert(`Nenhum anúncio encontrado para o SKU "${singleSku}" em suas contas.`);
        } else {
          mergeAdsIntoState(data);
          alert(`${data.length} anúncio(s) encontrados e atualizados para o SKU "${singleSku}".`);
          setSingleSku('');
          // Re-busca do banco para garantir dados consistentes com filtros/paginação
          fetchAnuncios();
        }
    } catch(e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsFetchingSingle(false);
    }
  };

  // Funções Auxiliares de Formatação
  const getMfgTime = (dadosML) => {
    if (!dadosML || !dadosML.sale_terms) return '-';
    const mfgTerm = dadosML.sale_terms.find(t => t.id === 'MANUFACTURING_TIME');
    if (!mfgTerm) return 'Imediato';
    return mfgTerm.value_name.replace('dias', 'd').replace('days', 'd');
  };

  const getDiscountPerc = (preco, precoOriginal) => {
    if (!precoOriginal || precoOriginal <= preco) return null;
    return Math.round(((precoOriginal - preco) / precoOriginal) * 100);
  };

  return (
    <>
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Edição em Massa e Gerenciador ML</h3>
          <p className="text-sm text-gray-500 mb-2">{total} anúncios sincronizados no banco local.</p>
          
          {syncProgress !== null && (
            <div className="w-64 mt-2">
               <div className="flex justify-between mb-1"><span className="text-xs font-bold text-green-700">Lendo API do ML...</span><span className="text-xs font-bold text-green-700">{syncProgress}%</span></div>
               <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${syncProgress}%` }}></div></div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
           <select 
             value={contaParaSincronizar} 
             onChange={e => setContaParaSincronizar(e.target.value)}
             className="px-3 py-2 border border-gray-300 rounded text-sm bg-white font-medium focus:ring-blue-500"
           >
             <option value="">Selecione a Conta...</option>
            <option value="_TODAS_">📦 Todas as Contas</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
           </select>
           <button 
             onClick={iniciarSincronizacaoML} 
             disabled={syncProgress !== null || !contaParaSincronizar} 
             className="px-5 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 transition disabled:opacity-50"
           >
            {syncProgress !== null ? 'Sincronizando...' : '⬇ Importar Tudo'}
           </button>
        </div>
      </div>

      {/* Seção: Adicionar / Atualizar Individualmente */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h4 className="font-bold text-gray-700 mb-3 text-sm">Adicionar / Atualizar Individualmente</h4>
        <div className="flex items-center gap-4">
          {/* Busca por MLB */}
          <div className="flex items-center gap-2 border-r pr-4">
            <label className="text-sm font-semibold">Conta:</label>
            <select value={selectedAccountForFetch} onChange={e => setSelectedAccountForFetch(e.target.value)} className="w-48 px-2 py-1.5 border rounded-md text-sm">
              {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
            </select>
            <label className="text-sm font-semibold">MLB:</label>
            <input type="text" value={singleMlbId} onChange={e => setSingleMlbId(e.target.value)} placeholder="MLB123456789" className="w-40 px-2 py-1.5 border rounded-md text-sm"/>
            <button onClick={handleFetchSingleMlb} disabled={isFetchingSingle} className="px-4 py-1.5 bg-blue-600 text-white font-bold text-sm rounded disabled:opacity-50">
              {isFetchingSingle ? 'Buscando...' : 'Puxar MLB'}
            </button>
          </div>
          {/* Busca por SKU */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold">OU SKU:</label>
            <input type="text" value={singleSku} onChange={e => setSingleSku(e.target.value)} placeholder="SKU-PRODUTO-01" className="w-48 px-2 py-1.5 border rounded-md text-sm"/>
            <button onClick={handleFetchBySku} disabled={isFetchingSingle} className="px-4 py-1.5 bg-gray-700 text-white font-bold text-sm rounded disabled:opacity-50">
              {isFetchingSingle ? 'Buscando...' : 'Buscar SKU e Adicionar'}
            </button>
          </div>
        </div>
      </div>

      {/* ✅ Barra de Filtros Principais */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-4 p-4">
          <input type="text" placeholder="Buscar por Título, MLB ou SKU..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          
          <select value={contaFilter} onChange={(e) => { setContaFilter(e.target.value); setCurrentPage(1); }} className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="Todas">Todas as Contas</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value="Todos">Status (Todos)</option>
            <option value="active">Ativo (Active)</option>
            <option value="paused">Pausado (Paused)</option>
            <option value="under_review">Em Revisão</option>
            <option value="closed">Finalizado (Closed)</option>
          </select>

          {/* Dropdown de Tag Principal */}
          <select
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setCurrentPage(1); }}
            className="w-56 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="Todas">Tag Principal (Todas)</option>
            <option value="_sem_tag">✅ Sem Problema ({semTagCount})</option>
            {availableTags.map(t => (
              <option key={t.value} value={t.value}>
                ⚠️ {t.label} ({t.count})
              </option>
            ))}
          </select>

          {/* Ordenação */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
            className="w-52 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="padrao">Ordenar: Padrão</option>
            <option value="visitas_desc">↓ Mais Visitados</option>
            <option value="visitas_asc">↑ Menos Visitados</option>
            <option value="vendas_desc">↓ Mais Vendidos</option>
            <option value="vendas_asc">↑ Menos Vendidos</option>
            <option value="desconto_desc">↓ Maior Desconto</option>
            <option value="desconto_asc">↑ Menor Desconto</option>
            <option value="preco_desc">↓ Maior Preço</option>
            <option value="preco_asc">↑ Menor Preço</option>
            <option value="estoque_desc">↓ Mais Estoque</option>
            <option value="estoque_asc">↑ Menos Estoque</option>
          </select>
        </div>

        {/* ✅ NOVO: Botão "Filtros Adicionais" com seta e painel expansível */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            {/* Ícone de seta SVG */}
            <svg 
              className={`w-4 h-4 transition-transform duration-200 ${showAdvancedFilters ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Filtros Adicionais
            {/* Badge com quantidade de filtros ativos */}
            {activeAdvancedFiltersCount > 0 && (
              <span className="ml-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {activeAdvancedFiltersCount}
              </span>
            )}
          </button>

          {/* Painel de Filtros Adicionais (Expansível) */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showAdvancedFilters ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50">
              <div className="flex flex-wrap items-end gap-5">

                {/* Filtro de Promoção */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Promoção</label>
                  <select
                    value={promoFilter}
                    onChange={(e) => { setPromoFilter(e.target.value); setCurrentPage(1); }}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Todos">Todos</option>
                    <option value="com_desconto">🏷️ Com Desconto</option>
                    <option value="sem_desconto">Sem Desconto</option>
                  </select>
                </div>

                {/* Filtro de Preço */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Faixa de Preço (R$)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Mín"
                      value={precoMin}
                      onChange={(e) => { setPrecoMin(e.target.value); setCurrentPage(1); }}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                    />
                    <span className="text-gray-400 font-bold text-sm">até</span>
                    <input
                      type="number"
                      placeholder="Máx"
                      value={precoMax}
                      onChange={(e) => { setPrecoMax(e.target.value); setCurrentPage(1); }}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>


                {/* ✅ NOVO: Filtro de % de Desconto */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">% de Desconto</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Mín %"
                      value={descontoMin}
                      onChange={(e) => { setDescontoMin(e.target.value); setCurrentPage(1); }}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="1"
                    />
                    <span className="text-gray-400 font-bold text-sm">até</span>
                    <input
                      type="number"
                      placeholder="Máx %"
                      value={descontoMax}
                      onChange={(e) => { setDescontoMax(e.target.value); setCurrentPage(1); }}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="1"
                    />
                  </div>
                </div>

                {/* Filtro de Prazo de Fabricação */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Prazo de Fabricação</label>
                  <select
                    value={prazoFilter}
                    onChange={(e) => { setPrazoFilter(e.target.value); setCurrentPage(1); }}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Todos">Todos</option>
                    <option value="imediato">📦 Envio Imediato</option>
                    <option value="com_prazo">🕐 Com Prazo de Fabricação</option>
                  </select>
                </div>

                {/* Botão Limpar Filtros Adicionais */}
                {activeAdvancedFiltersCount > 0 && (
                  <button
                    onClick={limparFiltrosAdicionais}
                    className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                  >
                    ✕ Limpar Filtros
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== AÇÕES EM MASSA ===== */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowAcoesMassa(!showAcoesMassa)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showAcoesMassa ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Ações em Massa
            {selectedIds.size > 0 && (
              <span className="ml-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </span>
            )}
            <span className="ml-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              Em breve
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showAcoesMassa ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50">
              {selectedIds.size === 0 && (
                <p className="text-xs text-gray-400 italic mb-3">
                  Selecione anúncios na tabela abaixo para habilitar as ações.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {/* Corrigir Preço — funcional */}
                <button
                  onClick={() => {
                    if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.');
                    setModalCorrigirPreco(true);
                  }}
                  className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                >
                  💲 Corrigir Preço
                </button>
                {[
                  { label: '▶ Ativar Selecionados',   color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' },
                  { label: '⏸ Pausar Selecionados',    color: 'text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100' },
                  { label: '🏷️ Aplicar Desconto (%)',  color: 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100' },
                  { label: '✕ Remover Desconto',       color: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100' },
                  { label: '📋 Exportar CSV',           color: 'text-gray-700 bg-white border-gray-300 hover:bg-gray-100' },
                ].map(({ label, color }) => (
                  <button
                    key={label}
                    disabled
                    title="Funcionalidade em desenvolvimento"
                    className={`px-4 py-2 text-sm font-semibold border rounded-md cursor-not-allowed opacity-50 transition-colors ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="bg-white shadow-md border border-gray-200 rounded-lg overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 whitespace-nowrap">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-3 w-7"></th>
              <th className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-400 text-indigo-600 cursor-pointer"
                  checked={anuncios.length > 0 && anuncios.every(ad => selectedIds.has(ad.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(anuncios.map(ad => ad.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Img</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Conta / ID</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Título / SKU</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-600 uppercase">Preço (de/por)</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">% Desc</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Estoque</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Visitas</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Vendas</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">T. Fabr.</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase">Tipo An.</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase">Catálogo / Tags</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan="14" className="px-6 py-10 text-center text-sm font-semibold text-gray-500">Buscando anúncios no banco local...</td></tr>
            ) : anuncios.length > 0 ? (
              anuncios.map((ad) => {
                const dadosML = ad.dadosML || {};
                const tags = dadosML.tags || [];
                const isCatalog = dadosML.catalog_listing;
                const mfgTime = getMfgTime(dadosML);
                const discount = getDiscountPerc(ad.preco, ad.precoOriginal);
                const variations = dadosML.variations || [];
                const hasVariations = variations.length > 0;
                const isExpanded = expandedAds.has(ad.id);

                return (
                  <React.Fragment key={ad.id}>
                  <tr className={`hover:bg-blue-50/30 transition-colors ${selectedIds.has(ad.id) ? 'bg-indigo-50/40' : ''}`}>
                    {/* Expand button */}
                    <td className="px-2 py-2 text-center w-7">
                      {hasVariations ? (
                        <button
                          onClick={() => setExpandedAds(prev => {
                            const next = new Set(prev);
                            if (next.has(ad.id)) next.delete(ad.id);
                            else next.add(ad.id);
                            return next;
                          })}
                          className="w-5 h-5 rounded border border-gray-300 bg-gray-100 hover:bg-blue-100 hover:border-blue-400 text-gray-600 hover:text-blue-700 flex items-center justify-center text-xs font-black transition-colors"
                          title={`${variations.length} variação(ões) — clique para ${isExpanded ? 'recolher' : 'expandir'}`}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-400 text-indigo-600 cursor-pointer"
                        checked={selectedIds.has(ad.id)}
                        onChange={(e) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(ad.id);
                            else next.delete(ad.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <img src={ad.thumbnail} alt="thumb" className="w-10 h-10 object-cover rounded shadow-sm border border-gray-200" />
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-bold text-gray-800">{ad.conta?.nickname}</div>
                      <a href={ad.permalink} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-blue-600 hover:underline">{ad.id}</a>
                    </td>
                    <td className="px-3 py-2 text-sm max-w-xs">
                      <div className="font-semibold text-gray-900 truncate" title={ad.titulo}>{ad.titulo}</div>
                      <div className="text-[11px] font-mono text-gray-500 mt-0.5">SKU: {ad.sku || 'S/ SKU'}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-full border
                        ${ad.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' : 
                          ad.status === 'paused' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 
                          'bg-red-100 text-red-800 border-red-200'}`}>
                        {ad.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      {ad.precoOriginal && ad.precoOriginal > ad.preco && (
                        <div className="text-[10px] text-gray-400 line-through leading-none mb-1">de R$ {ad.precoOriginal.toFixed(2)}</div>
                      )}
                      <div className="font-bold text-gray-900">R$ {ad.preco.toFixed(2)}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {discount ? (
                        <span className="text-[11px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded">-{discount}%</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-black text-gray-700">
                      {ad.estoque}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-semibold text-blue-600">
                      {ad.visitas}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-semibold text-green-600">
                      {ad.vendas}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                      {mfgTime}
                    </td>
                    <td className="px-3 py-2 text-center text-[10px] font-bold uppercase text-gray-500">
                      {dadosML.listing_type_id?.replace('gold_special', 'Clássico').replace('gold_pro', 'Premium') || '-'}
                    </td>
                    {/* Coluna de Tags: tag principal + catálogo + botão ficha técnica */}
                    <td className="px-3 py-2 text-left">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {isCatalog && <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[9px] px-1.5 py-0.5 rounded font-bold">Catálogo</span>}

                        {ad.tagPrincipal && getTagBadge(ad.tagPrincipal)}

                        {!ad.tagPrincipal && tags.includes('good_quality_picture') && (
                          <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[9px] px-1.5 py-0.5 rounded font-bold">Img OK</span>
                        )}

                        {(ad.tagPrincipal === 'incomplete_technical_specs' || tags.includes('incomplete_technical_specs')) && (
                          <button
                            onClick={() => setFichaTecnicaModal(ad)}
                            className="mt-1 flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors"
                            title="Preencher Ficha Técnica"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            Preencher Ficha
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Variações expandidas */}
                  {hasVariations && isExpanded && variations.map((v) => {
                    const grade = v.attribute_combinations || [];
                    const gradeStr = grade.map(g => `${g.name}: ${g.value_name}`).join(' / ') || `ID ${v.id}`;
                    const vSku = v.seller_custom_field
                      || (v.attributes && v.attributes.find(a => a.id === 'SELLER_SKU'))?.value_name
                      || null;
                    const vDiscount = getDiscountPerc(v.price, ad.precoOriginal);
                    return (
                      <tr key={v.id} className="bg-blue-50/40 border-b border-blue-100">
                        <td className="pl-8 pr-2 py-1.5 text-center">
                          <span className="text-blue-300 text-xs">└</span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded border-gray-400 text-indigo-600 cursor-pointer"
                            checked={selectedIds.has(v.id)}
                            onChange={(e) => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(v.id);
                                else next.delete(v.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <img src={ad.thumbnail} alt="" className="w-7 h-7 object-cover rounded border border-gray-200 opacity-60" />
                        </td>
                        <td className="px-3 py-1.5 text-sm" colSpan="2">
                          <div className="font-medium text-gray-700 text-xs">{gradeStr}</div>
                          <div className="text-[10px] font-mono text-gray-400">
                            ID variação: {v.id}
                            {vSku && <span className="ml-2 text-indigo-600 font-bold">SKU: {vSku}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs">
                          <div className="font-bold text-gray-800">R$ {Number(v.price || 0).toFixed(2)}</div>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {vDiscount ? (
                            <span className="text-[11px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded">-{vDiscount}%</span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-1.5 text-center text-xs font-bold text-gray-700">
                          {v.available_quantity ?? '-'}
                        </td>
                        <td colSpan="5" />
                      </tr>
                    );
                  })}
                  </React.Fragment>
                )
              })
            ) : (
              <tr><td colSpan="14" className="px-6 py-10 text-center text-sm text-gray-500">Nenhum anúncio encontrado. Verifique os filtros ou importe dados.</td></tr>
            )}
          </tbody>
        </table>
        
        {/* Paginação */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <span className="text-sm font-semibold text-gray-600">
            Página {currentPage} — {total} anúncio(s)
            {tagFilter !== 'Todas' && <span className="text-blue-600 ml-2">(filtrado por tag)</span>}
            {activeAdvancedFiltersCount > 0 && <span className="text-purple-600 ml-2">(+{activeAdvancedFiltersCount} filtro(s) adicional(is))</span>}
          </span>
          <div className="flex gap-2">
            <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</button>
            <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700" disabled={anuncios.length < itemsPerPage} onClick={() => setCurrentPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      </div>
    </div>

    <ModalFichaTecnica anuncio={fichaTecnicaModal} onClose={() => setFichaTecnicaModal(null)} />

    {modalCorrigirPreco && (
      <ModalCorrigirPreco
        anunciosSelecionados={anuncios.filter(ad => selectedIds.has(ad.id))}
        regrasPreco={regrasPreco}
        usuarioId={usuarioId}
        onClose={() => setModalCorrigirPreco(false)}
        onSuccess={() => { fetchAnuncios(); setModalCorrigirPreco(false); }}
      />
    )}
    </>
  );
}
