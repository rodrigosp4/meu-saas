import React, { useState, useEffect, useRef } from 'react';
import { ModalPreenchimentoRapido } from './CompatibilidadeAutopecas';
import { useAuth } from '../contexts/AuthContext';
import { useContasML } from '../contexts/ContasMLContext';

// ✅ Mapa de tradução das tags do ML para labels amigáveis e cores
export const TAG_DISPLAY_MAP = {
  incomplete_compatibilities:           { label: 'Compat. Incompleta',    color: 'bg-orange-100 text-orange-800 border-orange-200' },
  incomplete_position_compatibilities:  { label: 'Posição Compat. Inc.',  color: 'bg-orange-100 text-orange-800 border-orange-200' },
  poor_quality_picture:                 { label: 'Foto Ruim',            color: 'bg-red-100 text-red-800 border-red-200' },
  poor_quality_thumbnail:               { label: 'Thumb Ruim',           color: 'bg-red-100 text-red-800 border-red-200' },
  picture_downloading_pending:          { label: 'Download Foto Pend.',  color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  moderation_penalty:                   { label: 'Penalidade Moderação', color: 'bg-red-200 text-red-900 border-red-300' },
  out_of_stock:                         { label: 'Sem Estoque (Tag)',    color: 'bg-gray-200 text-gray-800 border-gray-300' },
  incomplete_technical_specs:           { label: 'Ficha Técnica Inc.',   color: 'bg-amber-100 text-amber-800 border-amber-200' },
  waiting_for_patch:                    { label: 'Aguardando Patch',     color: 'bg-blue-100 text-blue-800 border-blue-200' },
  standard_price_by_quantity:           { label: 'Atacado Ativo',        color: 'bg-teal-100 text-teal-800 border-teal-200' },
};

export function getTagBadge(tagValue) {
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

function ModalFichaTecnica({ anuncio, usuarioId, onClose }) {
  const [valores, setValores] = useState(() => {
    const v = {};
    const attrList = anuncio?.dadosML?.attributes || [];
    for (const a of attrList) {
      const val = a.value_name || (a.value_struct?.number ? String(a.value_struct.number) : '');
      if (val) v[a.id] = val;
    }
    return v;
  });
  const [enviando, setEnviando] = useState(false);

  if (!anuncio) return null;

  const handleChange = (id, val) => setValores(prev => ({ ...prev, [id]: val }));

  const handleSalvar = async () => {
    const atributosParaEnviar = CAMPOS_FICHA
      .filter(c => String(valores[c.id] || '').trim())
      .map(c => ({ id: c.id, value_name: String(valores[c.id]).trim() }));

    if (!atributosParaEnviar.length) return alert('Preencha pelo menos um campo.');
    setEnviando(true);
    try {
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuarioId,
          items: [{ id: anuncio.id, contaId: anuncio.contaId }],
          acao: 'atualizar_atributos',
          valor: atributosParaEnviar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.erro || data?.message || 'Erro ao salvar');
      alert(`✅ ${atributosParaEnviar.length} atributo(s) enfileirado(s)!\nAcompanhe na aba "Gerenciador de Fila".`);
      onClose();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

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
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={enviando}
            className="px-5 py-2 text-sm font-black text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {enviando ? 'Enviando...' : 'Salvar na ML'}
          </button>
        </div>
      </div>
    </div>
  );
}
// =========================================

// ===== MODAL PRAZO DE FABRICAÇÃO =====
function ModalPrazoFabricacao({ anunciosSelecionados, usuarioId, onClose, onSuccess }) {
  const [dias, setDias] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSalvar = async () => {
    const diasNum = dias === '' ? 0 : Number(dias);
    if (isNaN(diasNum) || diasNum < 0 || diasNum > 60) return alert('Digite um valor entre 0 e 60 dias (0 para remover o prazo).');
    setIsLoading(true);
    try {
      const items = anunciosSelecionados.map(ad => ({ id: ad.id, contaId: ad.contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'prazo_fabricacao', valor: diasNum })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      alert('✅ Ação enviada para a fila!\nAcompanhe na aba "Gerenciador de Fila".');
      onSuccess();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-white font-black text-base">Prazo de Fabricação</h2>
            <p className="text-violet-200 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-700">
            Define quantos dias o produto leva para ser disponibilizado. Máximo: <strong>60 dias</strong>. Digite <strong>0</strong> para remover o prazo.
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Dias de Fabricação (0–60)</label>
            <input
              type="number" min="0" max="60"
              value={dias}
              onChange={e => setDias(e.target.value)}
              placeholder="Ex: 7 (ou 0 para remover)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleSalvar} disabled={isLoading || dias === ''} className="px-5 py-2 text-sm font-black text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition">
            {isLoading ? 'Enviando...' : 'Aplicar em Massa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== MODAL EDITAR TÍTULO =====
function ModalEditarTitulo({ anunciosSelecionados, usuarioId, onClose, onSuccess }) {
  const [titulo, setTitulo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const comVendas = anunciosSelecionados.filter(ad => Number(ad.vendas || 0) > 0);

  const handleSalvar = async () => {
    if (!titulo.trim()) return alert('Digite um título.');
    setIsLoading(true);
    try {
      const items = anunciosSelecionados.map(ad => ({ id: ad.id, contaId: ad.contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'editar_titulo', valor: titulo.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      alert(`✅ Ação enviada para a fila!\n\nAcompanhe na aba "Gerenciador de Fila".`);
      onSuccess();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-white font-black text-base">Editar Título</h2>
            <p className="text-sky-200 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {comVendas.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-bold text-amber-700">
                ⚠️ {comVendas.length} anúncio(s) possuem vendas. O sistema utilizará o método "Family Name" para alterar o título diretamente.
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Novo Título</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              maxLength={60}
              placeholder="Digite o novo título do anúncio..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <p className="text-xs text-gray-400 mt-1">{titulo.length}/60 caracteres</p>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleSalvar} disabled={isLoading || !titulo.trim()} className="px-5 py-2 text-sm font-black text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition">
            {isLoading ? 'Enviando...' : `Aplicar em ${anunciosSelecionados.length} anúncio(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}


// ===== MODAL EDITAR DESCRIÇÃO =====
function ModalEditarDescricao({ anunciosSelecionados, usuarioId, onClose, onSuccess }) {
  const [descricao, setDescricao] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSalvar = async () => {
    if (!descricao.trim()) return alert('Digite uma descrição.');
    setIsLoading(true);
    try {
      const items = anunciosSelecionados.map(ad => ({ id: ad.id, contaId: ad.contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'editar_descricao', valor: descricao.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      alert('✅ Ação enviada para a fila!\nAcompanhe na aba "Gerenciador de Fila".');
      onSuccess();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-white font-black text-base">Editar Descrição</h2>
            <p className="text-emerald-200 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Somente <strong>texto simples</strong>. Use <code className="bg-blue-100 px-1 rounded">\n</code> para quebra de linha. Sem formatação, negrito ou HTML.
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Descrição (Texto Simples)</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={8}
              placeholder="Digite a descrição do produto aqui..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">{descricao.length} caracteres</p>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleSalvar} disabled={isLoading || !descricao.trim()} className="px-5 py-2 text-sm font-black text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition">
            {isLoading ? 'Enviando...' : 'Salvar Descrição'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== MODAL ALTERAR SKU =====
function ModalAlterarSku({ selectedIds, allKnownAds, usuarioId, onClose, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);

  const buildRows = () => {
    const rows = [];
    const addedVariationIds = new Set();
    Array.from(selectedIds).forEach(id => {
      const parentAd = allKnownAds[id];
      if (parentAd) {
        const variations = parentAd.dadosML?.variations || [];
        if (variations.length > 0) {
          variations.forEach(v => {
            if (addedVariationIds.has(v.id)) return;
            addedVariationIds.add(v.id);
            const grade = v.attribute_combinations || [];
            const label = grade.map(g => `${g.name}: ${g.value_name}`).join(' / ') || `ID ${v.id}`;
            const currentSku = v.seller_custom_field || v.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || '';
            rows.push({ parentId: parentAd.id, contaId: parentAd.contaId, variationId: v.id, label, currentSku, newSku: '', thumbnail: parentAd.thumbnail, isSimple: false });
          });
        } else {
          rows.push({ parentId: parentAd.id, contaId: parentAd.contaId, variationId: null, label: parentAd.titulo || parentAd.id, currentSku: parentAd.sku || '', newSku: '', thumbnail: parentAd.thumbnail, isSimple: true });
        }
      } else {
        if (addedVariationIds.has(id)) return;
        const parent = Object.values(allKnownAds).find(ad => ad.dadosML?.variations?.some(v => v.id === id));
        if (!parent) return;
        const variation = parent.dadosML.variations.find(v => v.id === id);
        addedVariationIds.add(id);
        const grade = variation?.attribute_combinations || [];
        const label = grade.map(g => `${g.name}: ${g.value_name}`).join(' / ') || `ID ${id}`;
        const currentSku = variation?.seller_custom_field || variation?.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || '';
        rows.push({ parentId: parent.id, contaId: parent.contaId, variationId: id, label, currentSku, newSku: '', thumbnail: parent.thumbnail, isSimple: false });
      }
    });
    return rows;
  };

  const [rows, setRows] = useState(() => buildRows());

  // allSimple: todos os selecionados são anúncios simples (sem variações)
  const allSimple = rows.every(r => r.isSimple);

  // modo: null = pergunta, 'unico' = mesmo SKU para todos, 'individual' = um para cada
  const [modo, setModo] = useState(() => (allSimple && rows.length > 1) ? null : 'individual');
  const [skuUnico, setSkuUnico] = useState('');

  const updateSku = (idx, value) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, newSku: value } : r));
  };

  const handleSalvar = async () => {
    const rowsToSave = modo === 'unico'
      ? (skuUnico.trim() ? rows.map(r => ({ ...r, newSku: skuUnico.trim() })) : [])
      : rows.filter(r => r.newSku.trim());

    if (rowsToSave.length === 0) return alert(modo === 'unico' ? 'Preencha o SKU.' : 'Preencha ao menos um SKU.');
    setIsLoading(true);
    try {
      const byParent = {};
      rowsToSave.forEach(r => {
        if (!byParent[r.parentId]) byParent[r.parentId] = { contaId: r.contaId, skuMap: {}, simpleSku: null };
        if (r.variationId) byParent[r.parentId].skuMap[r.variationId] = r.newSku.trim();
        else byParent[r.parentId].simpleSku = r.newSku.trim();
      });
      for (const [parentId, data] of Object.entries(byParent)) {
        const hasVariations = Object.keys(data.skuMap).length > 0;
        const item = { id: parentId, contaId: data.contaId, hasVariations, variationsIds: Object.keys(data.skuMap) };
        const valor = hasVariations ? data.skuMap : data.simpleSku;
        const res = await fetch('/api/ml/acoes-massa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: usuarioId, items: [item], acao: 'alterar_sku', valor })
        });
        const responseData = await res.json();
        if (!res.ok) throw new Error(responseData.erro);
      }
      alert('✅ Ação enviada para a fila!\nAcompanhe na aba "Gerenciador de Fila".');
      onSuccess();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const header = (title, subtitle) => (
    <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
      <div>
        <h2 className="text-white font-black text-base">{title}</h2>
        {subtitle && <p className="text-indigo-200 text-xs mt-0.5">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
    </div>
  );

  const overlay = (children, maxW = 'max-w-lg') => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxW} mx-4 flex flex-col max-h-[90vh]`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  // ── Tela 1: Perguntar modo (só para múltiplos simples) ──
  if (modo === null) return overlay(
    <>
      {header('Alterar SKU', `${rows.length} anúncios selecionados`)}
      <div className="p-6 space-y-3">
        <p className="text-sm text-gray-600">Como deseja definir o SKU?</p>
        <button
          onClick={() => setModo('unico')}
          className="w-full text-left px-4 py-3 border-2 border-indigo-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition"
        >
          <div className="font-bold text-indigo-700 text-sm">Mesmo SKU para todos</div>
          <div className="text-xs text-gray-500 mt-0.5">Um único valor aplicado aos {rows.length} anúncios</div>
        </button>
        <button
          onClick={() => setModo('individual')}
          className="w-full text-left px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition"
        >
          <div className="font-bold text-gray-700 text-sm">SKU diferente para cada anúncio</div>
          <div className="text-xs text-gray-500 mt-0.5">Define um SKU individual por anúncio</div>
        </button>
      </div>
    </>, 'max-w-sm'
  );

  // ── Tela 2a: Mesmo SKU para todos ──
  if (modo === 'unico') return overlay(
    <>
      {header('Mesmo SKU para todos', `${rows.length} anúncio(s)`)}
      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Novo SKU</label>
          <input
            type="text"
            value={skuUnico}
            onChange={e => setSkuUnico(e.target.value)}
            placeholder="Ex: SKU-001"
            autoFocus
            className="w-full px-3 py-2 border-2 border-indigo-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
              {r.thumbnail
                ? <img src={r.thumbnail} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                : <div className="w-9 h-9 bg-gray-200 rounded flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-700 truncate font-medium">{r.label}</div>
                {r.currentSku && <div className="text-[10px] font-mono text-gray-400">Atual: {r.currentSku}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-5 pt-3 flex justify-between gap-3 flex-shrink-0 border-t">
        <button onClick={() => setModo(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">← Voltar</button>
        <button onClick={handleSalvar} disabled={isLoading || !skuUnico.trim()} className="px-5 py-2 text-sm font-black text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {isLoading ? 'Enviando...' : `Aplicar em ${rows.length} anúncio(s)`}
        </button>
      </div>
    </>
  );

  // ── Tela 2b: Individual (simples com thumb, ou variações em tabela) ──
  const totalPreenchidos = rows.filter(r => r.newSku.trim()).length;
  return overlay(
    <>
      {header('Alterar SKU', `${rows.length} ${allSimple ? 'anúncio(s)' : 'variação(ões) / anúncio(s)'}`)}
      <div className="p-4 overflow-y-auto flex-1 space-y-2">
        <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          Preencha o <strong>NOVO SKU</strong> para cada {allSimple ? 'anúncio' : 'variação'}. Linhas em branco serão ignoradas.
        </p>
        {allSimple ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 border rounded-lg">
                {r.thumbnail
                  ? <img src={r.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 bg-gray-200 rounded flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-700 truncate font-medium">{r.label}</div>
                  {r.currentSku && <div className="text-[10px] font-mono text-gray-400">Atual: {r.currentSku}</div>}
                </div>
                <input
                  type="text"
                  value={r.newSku}
                  onChange={e => updateSku(i, e.target.value)}
                  placeholder="novo SKU"
                  className="w-32 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 flex-shrink-0"
                />
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-gray-500 uppercase border-b">
                <th className="py-2 text-left">Variação / Anúncio</th>
                <th className="py-2 text-left pl-2 w-28">SKU Atual</th>
                <th className="py-2 text-left pl-2 w-36">Novo SKU</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-2 text-gray-700 text-xs">{r.label}</td>
                  <td className="py-2 pl-2 font-mono text-xs text-gray-400">{r.currentSku || '—'}</td>
                  <td className="py-2 pl-2">
                    <input
                      type="text"
                      value={r.newSku}
                      onChange={e => updateSku(i, e.target.value)}
                      placeholder="novo SKU"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="px-6 pb-5 pt-3 flex justify-between gap-3 flex-shrink-0 border-t">
        {allSimple && rows.length > 1
          ? <button onClick={() => setModo(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">← Voltar</button>
          : <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
        }
        <button onClick={handleSalvar} disabled={isLoading || totalPreenchidos === 0} className="px-5 py-2 text-sm font-black text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {isLoading ? 'Enviando...' : `Aplicar em ${totalPreenchidos} linha(s)`}
        </button>
      </div>
    </>
  );
}

// ===== MODAL EXCLUIR PUBLICAÇÃO =====
function ModalExcluir({ anunciosSelecionados, usuarioId, onClose, onSuccess }) {
  const [confirmInput, setConfirmInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const temVendas = anunciosSelecionados.some(ad => Number(ad.vendas || 0) > 0);
  const confirmado = !temVendas || confirmInput === 'CONFIRMAR';

  const handleExcluir = async () => {
    if (!confirmado) return;
    setIsLoading(true);
    try {
      const items = anunciosSelecionados.map(ad => ({ id: ad.id, contaId: ad.contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'excluir', valor: null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      alert('🗑️ Exclusão enviada para a fila!\nAcompanhe na aba "Gerenciador de Fila".');
      onSuccess();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-white font-black text-base">⚠️ Excluir Publicações</h2>
            <p className="text-red-200 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <p className="text-sm font-black text-red-700">ATENÇÃO: Esta ação é IRREVERSÍVEL!</p>
            <p className="text-xs text-red-600 mt-1">Os anúncios serão encerrados e deletados permanentemente do Mercado Livre. Não será possível reativá-los.</p>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {anunciosSelecionados.map(ad => (
              <div key={ad.id} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded">
                <span className="font-mono text-gray-400 flex-shrink-0">{ad.id}</span>
                <span className="truncate flex-1">{ad.titulo}</span>
                {Number(ad.vendas || 0) > 0 && <span className="text-red-500 font-bold flex-shrink-0">{ad.vendas} venda(s)</span>}
              </div>
            ))}
          </div>
          {temVendas && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-red-700">Um ou mais anúncios possuem histórico de vendas. Digite <strong>CONFIRMAR</strong> para prosseguir:</p>
              <input
                type="text"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                placeholder="Digite: CONFIRMAR"
                className="w-full px-3 py-2 border-2 border-red-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
              />
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleExcluir} disabled={isLoading || !confirmado} className="px-5 py-2 text-sm font-black text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition">
            {isLoading ? 'Processando...' : `🗑️ Excluir ${anunciosSelecionados.length} Anúncio(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== MODAL COMPATIBILIDADE — Aplicar Perfil nos Anúncios Selecionados =====
export function ModalCompatibilidade({ anunciosSelecionados, onClose, usuarioId, onSuccess }) {
  const { contas: contasMLCtx } = useContasML();
  const [contasML, setContasML] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [perfis, setPerfis] = useState([]);
  const [perfilSelecionado, setPerfilSelecionado] = useState('');
  const [perfilData, setPerfilData] = useState(null);
  const [loadingPerfil, setLoadingPerfil] = useState(false);
  const [loading, setLoading] = useState(false);

  // Carrega contas e perfis ao abrir
  useEffect(() => {
    const contas = contasMLCtx;
    setContasML(contas);
    if (contas.length > 0) setContaSelecionada(contas[0].id);
    if (usuarioId) {
      fetch(`/api/compat/perfis?userId=${usuarioId}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setPerfis(data))
        .catch(() => {});
    }
  }, [usuarioId, contasMLCtx]);

  // Carrega dados do perfil ao selecionar
  const handlePerfilChange = async (id) => {
    setPerfilSelecionado(id);
    setPerfilData(null);
    if (!id || !usuarioId) return;
    setLoadingPerfil(true);
    try {
      const res = await fetch(`/api/compat/perfis/${id}?userId=${usuarioId}`);
      if (res.ok) setPerfilData(await res.json());
    } catch (_) {}
    setLoadingPerfil(false);
  };

  // Aplica o perfil aos anúncios selecionados via fila
  const LIMITE_ML = 200;
  const handleAplicar = async () => {
    if (!perfilData) return;
    const totalVeiculos = (perfilData.compatibilities || []).length;
    const foiLimitado = totalVeiculos > LIMITE_ML;
    const compatToApply = (perfilData.compatibilities || []).slice(0, LIMITE_ML);
    const msgLimite = foiLimitado
      ? `\n\n⚠️ O perfil tem ${totalVeiculos} veículos, mas a API do ML limita a ${LIMITE_ML}. Serão enviados apenas os primeiros ${LIMITE_ML}.`
      : '';
    if (!window.confirm(`Enviar para a fila: perfil "${perfilData.nome}" (${foiLimitado ? `${LIMITE_ML} de ${totalVeiculos}` : totalVeiculos} veículos) em ${anunciosSelecionados.length} anúncio(s)?${msgLimite}`)) return;

    setLoading(true);
    try {
      const items = anunciosSelecionados.map(a => ({ id: a.id, contaId: a.contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'compatibilidade', valor: compatToApply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao enfileirar');
      alert('✅ Compatibilidade enviada para a fila!\nAcompanhe na aba "Gerenciador de Fila".');
      if (onSuccess) onSuccess(anunciosSelecionados.map(a => a.id));
      onClose();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-500 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-base">🚗 Aplicar Compatibilidade de Veículos</h2>
            <p className="text-amber-200 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">  

          {/* Perfil */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Perfil de Compatibilidade</label>
            {perfis.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Nenhum perfil salvo. Acesse a aba <strong>Compatibilidade</strong> no menu lateral para criar perfis de veículos.
              </p>
            ) : (
              <select value={perfilSelecionado} onChange={e => handlePerfilChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">-- Selecione um perfil --</option>
                {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}
          </div>

          {/* Preview do perfil selecionado */}
          {loadingPerfil && <p className="text-sm text-gray-400">⏳ Carregando perfil...</p>}
          {perfilData && !loadingPerfil && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                {(perfilData.compatibilities || []).length} veículos neste perfil
              </p>
              {(perfilData.compatibilities || []).length > LIMITE_ML && (
                <div className="mb-2 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded text-xs text-amber-700 font-semibold">
                  ⚠️ Este perfil tem {(perfilData.compatibilities || []).length} veículos — serão enviados apenas os primeiros {LIMITE_ML} (limite da API do ML).
                </div>
              )}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {(perfilData.compatibilities || []).slice(0, 50).map((v, i) => {
                  // Extrai posições
                  const posAttr = Array.isArray(v.restrictions) ? v.restrictions.find(r => r.attribute_id === 'POSITION') : null;
                  const posStr = posAttr ? (posAttr.attribute_values || []).map(av => (av.values || []).map(x => x.value_name).join('+')).join(' | ') : '';
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-gray-400 font-mono w-5 flex-shrink-0">{i + 1}.</span>
                      <div>
                        <span className="text-gray-800 font-medium">{v.name || v.catalog_product_id}</span>
                        {v.note && <span className="text-gray-500 ml-1">— {v.note}</span>}
                        {posStr && <span className="ml-1 inline-block bg-green-100 text-green-800 rounded px-1">{posStr}</span>}
                      </div>
                    </div>
                  );
                })}
                {(perfilData.compatibilities || []).length > 50 && (
                  <p className="text-xs text-gray-400 text-center pt-1">+ {(perfilData.compatibilities || []).length - 50} mais...</p>
                )}
              </div>
            </div>
          )}

          {/* Anúncios que receberão */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Anúncios que receberão a compatibilidade</p>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {anunciosSelecionados.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 rounded px-2 py-1">
                  <span className="font-mono text-blue-700 font-bold">{a.id}</span>
                  <span className="text-gray-600 truncate">{a.titulo}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3 border-t border-gray-100 pt-4 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button
            onClick={handleAplicar}
            disabled={loading || !perfilData}
            className="flex-1 px-4 py-2 text-sm font-black text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Enfileirando...' : `🚀 Enviar para Fila (${anunciosSelecionados.length} anúncio(s))`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== MODAL POSIÇÃO (AUTOPEÇA) =====
const POSICOES_AUTOPECA =[
  'Dianteira', 'Traseira', 'Esquerda', 'Direita', 
  'Superior', 'Inferior', 'Interno', 'Externo', 'Central',
  // ✅ Adicionadas as variações combinadas para evitar erro "Missing request parameter"
  'Dianteira Esquerda', 'Dianteira Direita', 'Traseira Esquerda', 'Traseira Direita'
];

export function ModalPosicao({ anunciosSelecionados, usuarioId, onClose, onSuccess }) {
  // Voltamos para o SET (múltiplas escolhas permitidas)
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const toggle = (pos) => setSelecionadas(prev => {
    const next = new Set(prev);
    next.has(pos) ? next.delete(pos) : next.add(pos);
    return next;
  });

  const handleSalvar = async () => {
    if (selecionadas.size === 0) return alert('Selecione pelo menos uma posição.');
    setIsLoading(true);
    
    // ✅ CORREÇÃO: Agora enviamos um ARRAY puro, não mais um texto com barras " / "
    const valorPosicaoArray = Array.from(selecionadas);
    
    try {
      const items = anunciosSelecionados.map(ad => ({ id: ad.id, contaId: ad.contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'posicao', valor: valorPosicaoArray })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      alert('✅ Posições enviadas para a fila!\nAcompanhe na aba "Gerenciador de Fila".');
      onSuccess(anunciosSelecionados.map(a => a.id));
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-white font-black text-base">Posição da Peça</h2>
            <p className="text-cyan-200 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="bg-cyan-50 border-b border-cyan-200 px-6 py-2.5 flex items-center gap-2">
          <span className="text-cyan-700 text-xs font-semibold">Você pode selecionar múltiplas posições.</span>
        </div>

        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {POSICOES_AUTOPECA.map(pos => (
              <label
                key={pos}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition select-none text-xs font-semibold ${
                  selecionadas.has(pos)
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-cyan-300 hover:bg-cyan-50/50'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={selecionadas.has(pos)} 
                  onChange={() => toggle(pos)} 
                  className="w-4 h-4 rounded border-gray-400 text-cyan-600 cursor-pointer" 
                />
                {pos}
              </label>
            ))}
          </div>
        </div>

        <div className="px-6 pb-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleSalvar} disabled={isLoading || selecionadas.size === 0} className="px-5 py-2 text-sm font-black text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition">
            {isLoading ? 'Enviando...' : 'Aplicar Posição'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  let totalTaxasVendaPerc = 0;
  let historicoCustos = [];
  let historicoTaxasVenda = [];

  (regra.variaveis || []).forEach(v => {
    if (v.tipo === 'fixo_custo') {
      custoBaseOriginal += v.valor;
      historicoCustos.push({ descricao: v.nome, valor: v.valor, tipo: 'custo' });
    } else if (v.tipo === 'perc_custo') {
      const calcVal = custoBaseOriginal * (v.valor / 100);
      custoBaseOriginal += calcVal;
      historicoCustos.push({ descricao: v.nome, valor: calcVal, isPerc: true, originalPerc: v.valor, tipo: 'custo' });
    } else if (v.tipo === 'perc_venda') {
      totalTaxasVendaPerc += v.valor;
      historicoTaxasVenda.push({ descricao: v.nome, originalPerc: v.valor, tipo: 'taxa_venda' });
    }
  });

  const tarifaML = tipoML === 'premium' ? 16 : 11;
  const netFactor = 1 - ((tarifaML + totalTaxasVendaPerc) / 100);

  if (netFactor <= 0) return { precoFinal: Math.round(custoBaseOriginal * 100) / 100, historico: [] };

  const inflarSafe = Math.min(Math.max(0, inflar || 0), 99);

  let precoAlvo = (custoBaseOriginal + 6) / netFactor;
  let precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
  let freteAplicado = false;
  let foiReduzido = false;

  if (precoFinal >= 79) {
     let custoComFrete = custoBaseOriginal + custoFreteGratis;
     precoAlvo = custoComFrete / netFactor; 
     precoFinal = inflarSafe > 0 ? precoAlvo / (1 - inflarSafe / 100) : precoAlvo;
     freteAplicado = true;

     if (reduzir > 0 && precoFinal * (1 - reduzir / 100) <= 78.99) {
       precoFinal = 78.99;
       precoAlvo = inflarSafe > 0 ? precoFinal * (1 - inflarSafe / 100) : precoFinal;
       foiReduzido = true;
       freteAplicado = false; 
     }
  }

  precoAlvo = Math.round(precoAlvo * 100) / 100;
  precoFinal = Math.round(precoFinal * 100) / 100;

  let historico = [{ descricao: 'Preço Base (Tiny)', valor: precoBase, tipo: 'valor' }];
  historico = [...historico, ...historicoCustos];

  if (freteAplicado && custoFreteGratis > 0) {
     historico.push({ descricao: 'Frete Grátis (API ML)', valor: custoFreteGratis, tipo: 'custo_ml' });
  }

  if (!freteAplicado) {
    historico.push({ descricao: 'Custo Fixo (ML)', valor: 6.00, tipo: 'custo_ml' });
  }

  if (inflarSafe > 0 && !foiReduzido) {
    historico.push({ descricao: `Inflado em ${inflarSafe}% (Margem Promo)`, valor: precoFinal - precoAlvo, isPerc: true, originalPerc: inflarSafe, tipo: 'custo' });
  }

  if (foiReduzido) {
    historico.push({ descricao: `Reduzido para R$ 78,99`, valor: -(precoAlvo - 78.99), tipo: 'custo' });
  }

  const tarifaMLValor = precoAlvo * (tarifaML / 100);
  historico.push({ descricao: `Tarifa ML (${tipoML === 'premium' ? 'Premium' : 'Clássico'})`, valor: tarifaMLValor, isPerc: true, originalPerc: tarifaML, tipo: 'custo_ml' });

  historicoTaxasVenda.forEach(taxa => {
    taxa.valor = precoAlvo * (taxa.originalPerc / 100);
    historico.push(taxa);
  });

  return { precoFinal, historico };
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

function ModalCorrigirPreco({ anunciosSelecionados, regrasPreco, usuarioId, configAtacado, onClose, onSuccess }) {
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
  const [enviarAtacado, setEnviarAtacado] = useState(false);
  const [ativarPromocoes, setAtivarPromocoes] = useState(false);
  const [toleranciaPromo, setTolercanciaPromo] = useState(0);
  const [tipoPrecoTiny, setTipoPrecoTiny] = useState('venda');

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


  useEffect(() => {
    if (anunciosSelecionados.length === 0 || modo !== 'regra') {
      setLoadingFrete(false);
      return;
    }

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
  },[anunciosSelecionados, usuarioId, modo]);

  const calcularPrecoPorItem = (anuncio) => {
    const tipoAnuncioML = anuncio.dadosML?.listing_type_id?.includes('pro') ? 'premium' : 'classico';
    const skuDoAnuncio = getEfetivaSku(anuncio);

    if (modo === 'manual') {
      return calcularPrecoCorrigir(Number(precoManual), inflar, reduzir)?.precoFinal;
    }

    if (modo === 'tiny') {
      const dadosTiny = precosTinyMap[skuDoAnuncio];
      if (!dadosTiny || dadosTiny === 'NOT_FOUND') return null;
      const base = resolverPrecoBase(dadosTiny, tipoPrecoTiny);
      return base > 0 ? calcularPrecoCorrigir(base, inflar, reduzir)?.precoFinal : null;
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
    if (modo === 'tiny') {
      const dadosTiny = precosTinyMap[skuDoAnuncio];
      if (!dadosTiny || dadosTiny === 'NOT_FOUND') return null;
      const base = resolverPrecoBase(dadosTiny, tipoPrecoTiny);
      return base > 0 ? calcularPrecoCorrigir(base, inflar, reduzir) : null;
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
    // Validação: modo manual sem preço
    if (modo === 'manual' && !precoManual) {
      alert('⚠️ Informe o Preço Base para usar o modo manual.');
      return;
    }
    // Validação: modo tiny sem SKUs
    if (modo === 'tiny' && skusUnicos.length === 0) {
      alert('⚠️ O modo "Preço da Tiny" requer anúncios com SKU vinculado.');
      return;
    }
    // Validação: modo regra sem SKU e sem preço base manual
    if (modo === 'regra' && skusUnicos.length === 0 && !precoBaseManual) {
      const ok = window.confirm('⚠️ Nenhum anúncio tem SKU vinculado ao Tiny e nenhum Preço Base foi informado.\n\nSem isso o cálculo vai falhar para todos os itens. Deseja continuar mesmo assim?');
      if (!ok) return;
    }

    setIsLoading(true);
    setResultados(null);
    try {
      // ✅ ENVIA APENAS INSTRUÇÕES PARA A FILA, SEM CALCULAR FRETE AQUI!
      const body = {
        userId: usuarioId,
        items: anunciosSelecionados.map(ad => ({ id: ad.id, contaId: ad.contaId, sku: getEfetivaSku(ad) })),
        modo,
        regraId,
        precoManual: Number(precoManual),
        precoBaseManual: Number(precoBaseManual),
        inflar,
        reduzir,
        removerPromocoes,
        enviarAtacado,
        ativarPromocoes,
        toleranciaPromo: ativarPromocoes ? (Number(toleranciaPromo) || 0) : 0,
        tipoPrecoTiny,
      };

      const res = await fetch('/api/ml/corrigir-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.erro || 'Erro no servidor');

      alert(`🚀 Processamento em Massa iniciado!\n\n${anunciosSelecionados.length} anúncios enviados para a Fila.\n\nAcompanhe a atualização na aba "Gerenciador de Fila".`);
      onSuccess?.();
      
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
            {anunciosSelecionados.slice(0, 50).map(ad => (
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
            {anunciosSelecionados.length > 50 && (
              <div className="text-center py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded">
                 + {anunciosSelecionados.length - 50} anúncios selecionados (ocultados para não travar a tela). O envio será feito para TODOS.
              </div>
            )}
          </div>

          {/* Modo */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Modo de Precificação</p>
            <div className="flex gap-2">
              <button onClick={() => setModo('manual')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'manual' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Preço Manual</button>
              <button onClick={() => setModo('tiny')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'tiny' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Preço da Tiny</button>
              <button onClick={() => setModo('regra')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'regra' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Por Regra</button>
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

          {modo === 'tiny' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tipo de Preço da Tiny</label>
                <div className="flex gap-2">
                  <button onClick={() => setTipoPrecoTiny('venda')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${tipoPrecoTiny === 'venda' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Preço de Venda</button>
                  <button onClick={() => setTipoPrecoTiny('promocional')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${tipoPrecoTiny === 'promocional' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Preço Promocional</button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">O preço da Tiny será enviado diretamente ao ML, sem aplicar regras de margem. Inflar/reduzir ainda serão aplicados.</p>
              </div>
              {loadingPrecos && <p className="text-[10px] text-blue-500">Buscando preço da Tiny...</p>}
              {!loadingPrecos && skusUnicos.length === 0 && (
                <p className="text-[10px] text-red-500 bg-red-50 border border-red-200 rounded px-2 py-1.5">⚠️ Nenhum anúncio tem SKU vinculado ao Tiny. Este modo não funcionará.</p>
              )}
              {!loadingPrecos && skusUnicos.length > 0 && !temMultiplosSKUs && (() => {
                const dadosTiny = precosTinyMap[skusUnicos[0]];
                const base = dadosTiny && dadosTiny !== 'NOT_FOUND' ? resolverPrecoBase(dadosTiny, tipoPrecoTiny) : null;
                const precoFinal = base ? calcularPrecoCorrigir(base, inflar, reduzir)?.precoFinal : null;
                return base ? (
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-emerald-700 font-semibold">Preço da Tiny ({tipoPrecoTiny === 'venda' ? 'Venda' : 'Promocional'})</p>
                      <p className="text-sm font-black text-emerald-800">R$ {base.toFixed(2)}</p>
                    </div>
                    {precoFinal && (
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500">Preço Final (com inflar/reduzir)</p>
                        <p className="text-sm font-black text-green-700">R$ {precoFinal.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">⚠️ Preço não encontrado na Tiny para este SKU.</p>
                );
              })()}
              {!loadingPrecos && temMultiplosSKUs && Object.keys(precosTinyMap).length > 0 && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase mb-2">Preço por anúncio (SKUs diferentes)</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {anunciosSelecionados.map(ad => {
                      const efSku = getEfetivaSku(ad);
                      const dadosTiny = efSku ? precosTinyMap[efSku] : null;
                      const base = dadosTiny && dadosTiny !== 'NOT_FOUND' ? resolverPrecoBase(dadosTiny, tipoPrecoTiny) : null;
                      const precoFinal = base ? calcularPrecoCorrigir(base, inflar, reduzir)?.precoFinal : null;
                      return (
                        <div key={ad.id} className="flex items-center justify-between text-xs">
                          <span className="truncate text-gray-600 max-w-[50%]">{ad.titulo}</span>
                          <span className={`font-bold ${precoFinal ? 'text-green-700' : 'text-red-500'}`}>
                            → R$ {precoFinal?.toFixed(2) || 'N/A'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
                {precoBaseAutoPreenchido && !loadingPrecos && precosTinyMap[skusUnicos[0]]?.fonte === 'local' && <p className="text-[10px] text-amber-600 mb-1">⚠️ Preço do banco local (Tiny indisponível). Pode estar desatualizado.</p>}
                {precoBaseAutoPreenchido && !loadingPrecos && precosTinyMap[skusUnicos[0]]?.fonte !== 'local' && <p className="text-[10px] text-green-600 mb-1">✅ Preenchido automaticamente da Tiny.</p>}
                {temMultiplosSKUs && <p className="text-[10px] text-amber-600 mb-1">⚠️ SKUs diferentes — cada item usará seu próprio preço base da Tiny.</p>}
                {!loadingPrecos && !temMultiplosSKUs && !precoBaseAutoPreenchido && skusUnicos.length > 0 && <p className="text-[10px] text-red-500 mb-1">❌ Produto não encontrado na Tiny nem no banco local.</p>}
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

          {/* Enviar preços de atacado (B2B) */}
          {configAtacado?.ativo && Array.isArray(configAtacado.faixas) && configAtacado.faixas.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer select-none mt-1">
              <input
                type="checkbox"
                checked={enviarAtacado}
                onChange={e => setEnviarAtacado(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-green-600 cursor-pointer flex-shrink-0"
              />
              <div>
                <span className="text-sm font-bold text-green-700">Enviar preços de atacado (B2B) junto com a atualização</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Aplicará {configAtacado.faixas.length} faixa(s) configurada(s) sobre o preço final de venda
                  {inflar > 0 ? ` (preço com promoção ativa, descontando os ${inflar}% de inflação)` : ''}.
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {configAtacado.faixas.map(f => (
                    <span key={f.id} className="text-[10px] px-2 py-0.5 rounded font-semibold bg-green-50 text-green-700 border border-green-200">
                      {f.minQtd}+ un → -{f.desconto}%
                    </span>
                  ))}
                </div>
              </div>
            </label>
          )}

          {/* Ativar promoções automaticamente */}
          <label className="flex items-start gap-3 cursor-pointer select-none mt-1">
            <input
              type="checkbox"
              checked={ativarPromocoes}
              onChange={e => setAtivarPromocoes(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-purple-600 cursor-pointer flex-shrink-0"
            />
            <div>
              <span className="text-sm font-bold text-purple-700">
                Ativar promoções automaticamente{inflar > 0 ? ` (margem ${inflar}%)` : ''}
              </span>
              <p className="text-xs text-gray-400 mt-0.5">
                {inflar > 0
                  ? `Ativará campanhas candidatas onde o desconto do vendedor é ≤ ${inflar}%.`
                  : 'Ativará todas as campanhas candidatas disponíveis no item.'}
              </p>
            </div>
          </label>
          {ativarPromocoes && inflar > 0 && (
            <label className="flex items-start gap-3 cursor-pointer select-none ml-7">
              <input
                type="checkbox"
                checked={toleranciaPromo > 0}
                onChange={e => setTolercanciaPromo(e.target.checked ? 2 : 0)}
                className="mt-0.5 w-4 h-4 accent-purple-400 cursor-pointer flex-shrink-0"
              />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-purple-600">
                  Aceitar promoções que ultrapassem a margem em até
                </span>
                {toleranciaPromo > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.1" max="20" step="0.5"
                      value={toleranciaPromo}
                      onChange={e => setTolercanciaPromo(Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-xs border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <span className="text-xs text-gray-400">% (aceita até {inflar + Number(toleranciaPromo)}% sem alterar o preço)</span>
                  </div>
                )}
              </div>
            </label>
          )}
        </div>

        {/* Footer */}
        {modo === 'manual' && !precoManual && (
          <div className="px-6 pb-0 pt-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠️ Informe o Preço Base acima para continuar.</p>
          </div>
        )}
        {modo === 'tiny' && skusUnicos.length === 0 && (
          <div className="px-6 pb-0 pt-2">
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">⚠️ Nenhum anúncio tem SKU vinculado. O modo "Preço da Tiny" requer SKU cadastrado.</p>
          </div>
        )}
        {modo === 'regra' && skusUnicos.length === 0 && !precoBaseManual && (
          <div className="px-6 pb-0 pt-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠️ Nenhum anúncio tem SKU no Tiny. Insira um Preço Base acima ou o cálculo vai falhar para todos.</p>
          </div>
        )}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={isLoading}
            className="px-6 py-2 text-sm font-black text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isLoading ? 'Enviando para Fila...' : `Enviar para ML (${anunciosSelecionados.length})`}
          </button>
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

// ===== MODAL VERIFICAR PREÇO =====
// (Substitua a função ModalVerificarPreco inteira)
function ModalVerificarPreco({ anunciosSelecionados, regrasPreco, usuarioId, onClose, onJobStart }) {
  const [modo, setModo] = useState('regra');
  const [precoManual, setPrecoManual] = useState('');
  const [regraId, setRegraId] = useState(regrasPreco[0]?.id || '');
  const [precoBaseManual, setPrecoBaseManual] = useState('');
  const [inflar, setInflar] = useState(0);
  const [reduzir, setReduzir] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const semSkus = anunciosSelecionados.every(ad => !ad.sku);

  const handleVerificar = async () => {
    // Validação: modo manual sem preço
    if (modo === 'manual' && !precoManual) {
      alert('⚠️ Informe o Preço Alvo para usar o modo manual.');
      return;
    }
    // Validação: sem regras cadastradas
    if (modo === 'regra' && regrasPreco.length === 0) {
      alert('❌ Nenhuma regra de precificação cadastrada. Configure uma regra em Configurações primeiro.');
      return;
    }
    // Validação: modo regra sem SKU e sem preço base
    if (modo === 'regra' && semSkus && !precoBaseManual) {
      const ok = window.confirm('⚠️ Nenhum anúncio tem SKU vinculado ao Tiny e nenhum Preço Base foi informado.\n\nSem isso a verificação resultará em 0 anúncios calculados. Deseja continuar?');
      if (!ok) return;
    }

    setIsLoading(true);
    try {
      // Simplificamos: enviamos apenas ID e contaId. O worker busca o resto no banco para evitar Payload Too Large.
      const anunciosPayload = anunciosSelecionados.map(ad => ({
        id: ad.id,
        contaId: ad.contaId
      }));

      const body = {
        userId: usuarioId,
        anuncios: anunciosPayload,
        modo,
        regraId,
        precoManual,
        precoBaseManual,
        inflar,
        reduzir
      };
      const res = await fetch('/api/ml/verificar-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error((data.erro || 'Erro no servidor') + (data.detalhes ? ` | ${data.detalhes}` : ''));

      onJobStart(data.jobId); // Passa o ID do Job para o componente pai
      onClose(); // Fecha o modal
      alert('🚀 Verificação enviada para a fila! Os resultados aparecerão na tabela em instantes.');

    } catch(e) {
      alert("Erro ao enfileirar verificação: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-base">Verificar Preço em Segundo Plano</h2>
            <p className="text-teal-100 text-xs mt-0.5">{anunciosSelecionados.length} anúncio(s) selecionado(s).</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <p className="text-xs text-gray-500 bg-gray-50 p-2 border rounded">Esta função irá calcular os preços em segundo plano e atualizar a coluna "Dif. Preço". Você pode continuar usando o sistema.</p>

          {semSkus && modo === 'regra' && !precoBaseManual && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠️</span>
              <p className="text-xs text-amber-700"><strong>Nenhum anúncio tem SKU vinculado ao Tiny.</strong> Sem SKU, a verificação resultará em 0 anúncios calculados. Informe um <strong>Preço Base</strong> manualmente abaixo, ou troque para o modo <strong>Preço Manual</strong>.</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Modo de Precificação</p>
            <div className="flex gap-2">
              <button onClick={() => setModo('regra')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'regra' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Por Regra</button>
              <button onClick={() => setModo('manual')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${modo === 'manual' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>Preço Manual</button>
            </div>
          </div>
          {modo === 'regra' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Regra de Precificação</label>
                <select value={regraId} onChange={e => setRegraId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {regrasPreco.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Preço Base R$ (Opcional)</label>
                 <p className="text-[10px] text-gray-400 mb-1">Deixe em branco para usar o preço do Tiny por SKU. Preencha para forçar um valor base para todos.</p>
                <input type="number" min="0" step="0.01" value={precoBaseManual} onChange={e => setPrecoBaseManual(e.target.value)} placeholder="Automático por SKU (Recomendado)" className="w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Preço Alvo (base) R$</label>
              <input type="number" min="0" step="0.01" value={precoManual} onChange={e => setPrecoManual(e.target.value)} placeholder="Ex: 89.90" className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          )}
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
             <p className="text-xs font-bold text-purple-700 uppercase mb-2">Estratégia de Promoção</p>
             <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-purple-700 mb-1">Inflar Preço (%)</label>
                  <input type="number" min="0" max="99" value={inflar} onChange={e => setInflar(Number(e.target.value))} className="w-full px-2 py-1.5 border-purple-200 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-red-600 mb-1">Reduzir p/ fugir Frete Grátis (%)</label>
                  <input type="number" min="0" max="100" value={reduzir} onChange={e => setReduzir(Number(e.target.value))} className="w-full px-2 py-1.5 border-red-200 rounded-md text-sm" />
                </div>
             </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={handleVerificar} disabled={isLoading} className="px-6 py-2 text-sm font-black text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {isLoading ? 'Enviando...' : 'Verificar em Segundo Plano'}
          </button>
        </div>
      </div>
    </div>
  );
}
// =========================================

export default function GerenciadorAnuncios({ usuarioId }) {
  const { canUseResource } = useAuth();
  const { contas: contasMLCtx } = useContasML();
  const [anuncios, setAnuncios] = useState([]);
  const[allKnownAds, setAllKnownAds] = useState({});
  const [total, setTotal] = useState(0);
  const [contasML, setContasML] = useState([]);
  const [regrasPreco, setRegrasPreco] = useState([]);
  const [configAtacado, setConfigAtacado] = useState(null);
  const [fichaTecnicaModal, setFichaTecnicaModal] = useState(null);
  const [modalCorrigirPreco, setModalCorrigirPreco] = useState(false);
  const [expandedAds, setExpandedAds] = useState(new Set());
  
  // ✅ 1. ESTADO PARA O JOB ID ATIVO (lendo do localStorage)
  const [activeJobId, setActiveJobId] = useState(() => localStorage.getItem('ml_sync_job_id'));
  
  const [syncProgress, setSyncProgress] = useState(null);
  const [contaParaSincronizar, setContaParaSincronizar] = useState('');
  const [importarApenasNovos, setImportarApenasNovos] = useState(false);

  // Estados para busca individual
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [singleMlbId, setSingleMlbId] = useState('');
  const [singleSku, setSingleSku] = useState('');
  const [selectedAccountForFetch, setSelectedAccountForFetch] = useState('');

  // Filtros principais
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('todos');
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
  const [descontoMin, setDescontoMin] = useState('');
  const [descontoMax, setDescontoMax] = useState('');
  const [semSkuFilter, setSemSkuFilter] = useState(false);
  const [freteGratisFilter, setFreteGratisFilter] = useState('Todos');
  const [produtoFullFilter, setProdutoFullFilter] = useState('Todos');
  const [palavrasExcluir, setPalavrasExcluir] = useState([]);
  const [palavrasExcluirInput, setPalavrasExcluirInput] = useState('');

  // Ordenação
  const [sortBy, setSortBy] = useState('padrao');

  // Agrupamento por SKU
  const [agrupaPorSku, setAgrupaPorSku] = useState(false);

  // Checkboxes / seleção em massa
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAcoesMassa, setShowAcoesMassa] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isSyncingSelected, setIsSyncingSelected] = useState(false);

  // Verificar Preço
  const [modalVerificarPreco, setModalVerificarPreco] = useState(false);
  const [priceCheckJobId, setPriceCheckJobId] = useState(null);
  const [modalPrazoFabricacao, setModalPrazoFabricacao] = useState(false);
  const [modalEditarTitulo, setModalEditarTitulo] = useState(false);
  const [modalEditarDescricao, setModalEditarDescricao] = useState(false);
  const [modalAlterarSku, setModalAlterarSku] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [modalCompatibilidade, setModalCompatibilidade] = useState(false);
  const [modalPosicao, setModalPosicao] = useState(false);
  const [modalRapido, setModalRapido] = useState(false);
  const [dropdownCompat, setDropdownCompat] = useState(false);
  const dropdownCompatRef = useRef(null);
  const [dropdownCampanhas, setDropdownCampanhas] = useState(false);
  const dropdownCampanhasRef = useRef(null);
  const [dropdownPreco, setDropdownPreco] = useState(false);
  const dropdownPrecoRef = useRef(null);
  const [dropdownStatus, setDropdownStatus] = useState(false);
  const dropdownStatusRef = useRef(null);
  const [dropdownFlexTurbo, setDropdownFlexTurbo] = useState(false);
  const dropdownFlexTurboRef = useRef(null);
  const [dropdownAlterarProduto, setDropdownAlterarProduto] = useState(false);
  const dropdownAlterarProdutoRef = useRef(null);
  const [dropdownEstoque, setDropdownEstoque] = useState(false);
  const dropdownEstoqueRef = useRef(null);
  const [priceCheckResults, setPriceCheckResults] = useState({});
  const [priceCheckFilter, setPriceCheckFilter] = useState('Todos');
  const [priceDetailPopup, setPriceDetailPopup] = useState(null); // { ad, resultado }
  const [atacadoSendingIds, setAtacadoSendingIds] = useState(new Set());
  const [isEnviandoAtacadoMassa, setIsEnviandoAtacadoMassa] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const itemsPerPage = 50;

  // ✅ NOVO: Conta quantos filtros adicionais estão ativos (para badge no botão)
  const activeAdvancedFiltersCount = [
    promoFilter !== 'Todos',
    precoMin !== '',
    precoMax !== '',
    prazoFilter !== 'Todos',
    descontoMin !== '',
    descontoMax !== '',
    priceCheckFilter !== 'Todos',
    semSkuFilter,
    freteGratisFilter !== 'Todos',
    produtoFullFilter !== 'Todos',
    palavrasExcluir.length > 0,
  ].filter(Boolean).length;
  
  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.contasML) setContasML(data.contasML);
        if (data.regrasPreco) setRegrasPreco(data.regrasPreco);
        if (data.configAtacado) setConfigAtacado(data.configAtacado);
      });
  }, [usuarioId]);

  useEffect(() => {
    if (!dropdownCompat) return;
    const handler = (e) => {
      if (dropdownCompatRef.current && !dropdownCompatRef.current.contains(e.target)) {
        setDropdownCompat(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownCompat]);

  useEffect(() => {
    if (!dropdownCampanhas) return;
    const handler = (e) => {
      if (dropdownCampanhasRef.current && !dropdownCampanhasRef.current.contains(e.target)) {
        setDropdownCampanhas(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownCampanhas]);

  useEffect(() => {
    if (!dropdownPreco) return;
    const handler = (e) => { if (dropdownPrecoRef.current && !dropdownPrecoRef.current.contains(e.target)) setDropdownPreco(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownPreco]);

  useEffect(() => {
    if (!dropdownStatus) return;
    const handler = (e) => { if (dropdownStatusRef.current && !dropdownStatusRef.current.contains(e.target)) setDropdownStatus(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownStatus]);

  useEffect(() => {
    if (!dropdownFlexTurbo) return;
    const handler = (e) => { if (dropdownFlexTurboRef.current && !dropdownFlexTurboRef.current.contains(e.target)) setDropdownFlexTurbo(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownFlexTurbo]);

  useEffect(() => {
    if (!dropdownAlterarProduto) return;
    const handler = (e) => { if (dropdownAlterarProdutoRef.current && !dropdownAlterarProdutoRef.current.contains(e.target)) setDropdownAlterarProduto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownAlterarProduto]);

  useEffect(() => {
    if (!dropdownEstoque) return;
    const handler = (e) => { if (dropdownEstoqueRef.current && !dropdownEstoqueRef.current.contains(e.target)) setDropdownEstoque(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownEstoque]);

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
        page: agrupaPorSku ? 1 : currentPage,
        limit: agrupaPorSku ? 99999 : itemsPerPage,
        search: searchTerm,
        searchType: searchType,
        status: statusFilter, tag: tagFilter, promo: promoFilter, precoMin: precoMin,
        precoMax: precoMax, prazo: prazoFilter, descontoMin: descontoMin,
        descontoMax: descontoMax, semSku: semSkuFilter, sortBy: sortBy,
        priceCheckStatus: priceCheckFilter, freteGratis: freteGratisFilter, produtoFull: produtoFullFilter, userId: usuarioId,
      });

      const res = await fetch(`/api/ml/anuncios?${params.toString()}`);
      const data = await res.json();
      setAnuncios(data.anuncios);
      setTotal(data.total);

      // Armazena no dicionário global de memória
      setAllKnownAds(prev => {
        const next = { ...prev };
        data.anuncios.forEach(ad => next[ad.id] = ad);
        return next;
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contasML.length === 0) return; 
    fetchAnuncios();
  }, [currentPage, searchTerm, searchType, statusFilter, contaFilter, tagFilter, promoFilter, precoMin, precoMax, prazoFilter, descontoMin, descontoMax, semSkuFilter, sortBy, contasML, agrupaPorSku, priceCheckFilter, freteGratisFilter, produtoFullFilter]);

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
    setDescontoMin('');
    setDescontoMax('');
    setPriceCheckFilter('Todos');
    setSemSkuFilter(false);
    setFreteGratisFilter('Todos');
    setProdutoFullFilter('Todos');
    setPalavrasExcluir([]);
    setPalavrasExcluirInput('');
    setCurrentPage(1);
  };

const handleSelectAllFiltered = async () => {
    setIsSelectingAll(true);
    try {
      const idsPermitidos = contasML.map(c => c.id).join(',');
      let queryConta = contaFilter === 'Todas' ? idsPermitidos : contaFilter;
      const params = new URLSearchParams({
        contasIds: queryConta, search: searchTerm, searchType: searchType, status: statusFilter,
        tag: tagFilter, promo: promoFilter, precoMin, precoMax, prazo: prazoFilter,
        descontoMin, descontoMax, semSku: semSkuFilter,
        priceCheckStatus: priceCheckFilter, freteGratis: freteGratisFilter, produtoFull: produtoFullFilter, userId: usuarioId,
      });
      const res = await fetch(`/api/ml/anuncios/ids?${params.toString()}`);
      const data = await res.json();
      
      if (data.anuncios) {
        // Varre os anúncios e coleta IDs dos pais e filhos
        const allIds = new Set();
        data.anuncios.forEach(ad => {
          allIds.add(ad.id); // Id do Pai
          
          if (ad.dadosML?.variations?.length > 0) {
            ad.dadosML.variations.forEach(v => allIds.add(v.id)); // Ids das Variações (Filhos)
          }
        });
        
        setSelectedIds(allIds);

        setAllKnownAds(prev => {
          const next = { ...prev };
          data.anuncios.forEach(ad => next[ad.id] = ad);
          return next;
        });
      }
    } catch (e) {
      console.error('Erro ao selecionar todos:', e);
    } finally {
      setIsSelectingAll(false);
    }
  };


const handleEnviarAtacadoMassa = async () => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.');
    if (!configAtacado?.faixas?.length) return alert('Configure as faixas de atacado em Configurações API antes de usar esta função.');
    const adsSelecionados = Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean);
    // filtra apenas itens pai (sem variações no ID — evita enviar para variações filhas)
    const adsPai = adsSelecionados.filter(ad => ad && !String(ad.id).includes('-'));
    if (adsPai.length === 0) return alert('Nenhum anúncio válido selecionado.');
    if (!window.confirm(`Enviar preços de atacado (${configAtacado.faixas.length} faixa(s)) para ${adsPai.length} anúncio(s)?`)) return;

    setIsEnviandoAtacadoMassa(true);
    let ok = 0, erros = 0;
    for (const ad of adsPai) {
      try {
        const res = await fetch('/api/ml/atacado-preco', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: ad.id, contaId: ad.contaId, userId: usuarioId, precoAlvo: ad.preco, faixas: configAtacado.faixas })
        });
        if (res.ok) {
          ok++;
          setAnuncios(prev => prev.map(a => {
            if (a.id !== ad.id) return a;
            const mlTags = a.dadosML?.tags || [];
            if (!mlTags.includes('standard_price_by_quantity')) {
              return { ...a, dadosML: { ...a.dadosML, tags: [...mlTags, 'standard_price_by_quantity'] } };
            }
            return a;
          }));
        } else erros++;
      } catch { erros++; }
    }
    setIsEnviandoAtacadoMassa(false);
    alert(`Preços de atacado enviados!\n✅ ${ok} com sucesso${erros > 0 ? `\n❌ ${erros} com erro` : ''}`);
  };

const handleEnviarAtacadoRapido = async (ad) => {
    if (!configAtacado?.ativo || !configAtacado?.faixas?.length) {
      alert('Configure as faixas de atacado em Configurações API antes de usar esta função.');
      return;
    }
    setAtacadoSendingIds(prev => new Set([...prev, ad.id]));
    try {
      const precoAlvo = ad.preco;
      const res = await fetch('/api/ml/atacado-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: ad.id,
          contaId: ad.contaId,
          userId: usuarioId,
          precoAlvo,
          faixas: configAtacado.faixas
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
      // Atualiza a tag localmente para refletir o atacado ativo
      setAnuncios(prev => prev.map(a => {
        if (a.id !== ad.id) return a;
        const mlTags = a.dadosML?.tags || [];
        if (!mlTags.includes('standard_price_by_quantity')) {
          return { ...a, dadosML: { ...a.dadosML, tags: [...mlTags, 'standard_price_by_quantity'] } };
        }
        return a;
      }));
    } catch (err) {
      alert(`Erro ao enviar preços de atacado: ${err.message}`);
    } finally {
      setAtacadoSendingIds(prev => { const next = new Set(prev); next.delete(ad.id); return next; });
    }
  };

const handleSyncSelected = async () => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.');
    if (!window.confirm(`Sincronizar ${selectedIds.size} anúncio(s) com a API do ML?`)) return;
    setIsSyncingSelected(true);

    try {
      const res = await fetch('/api/ml/sync-selected-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selectedIds), userId: usuarioId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');

      const jobId = data.jobId;

      // Polling do status do job na fila
      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/ml/sync-ads-status/${jobId}`);
            if (!statusRes.ok) { clearInterval(interval); return resolve(); }
            const statusData = await statusRes.json();
            if (statusData.state === 'completed') {
              clearInterval(interval);
              resolve();
            } else if (statusData.state === 'failed') {
              clearInterval(interval);
              reject(new Error('Falha na sincronização. Verifique o console do worker.'));
            }
          } catch (e) {
            clearInterval(interval);
            reject(e);
          }
        }, 2000);
      });

      alert(`✅ ${selectedIds.size} anúncio(s) sincronizado(s).`);
      fetchAnuncios();
    } catch (e) {
      alert(`Erro ao sincronizar: ${e.message}`);
    } finally {
      setIsSyncingSelected(false);
    }
  };
// ─────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 3: Frontend — NÃO abortar no primeiro erro
// Substitua a função iniciarSincronizacaoML no seu componente React
// ─────────────────────────────────────────────────────────────────────────────
  // ✅ 2. useEffect DEDICADO PARA MONITORAR O JOB (igual ao do ERP)
  useEffect(() => {
    if (!activeJobId) return;

    // Se a página for recarregada com um job ativo, mostre a barra de progresso imediatamente
    setSyncProgress(prev => prev ?? 0); 
    
    const interval = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/ml/sync-ads-status/${activeJobId}`);
        if (statusRes.status === 404) { // Job não existe mais
          clearInterval(interval);
          setActiveJobId(null);
          localStorage.removeItem('ml_sync_job_id');
          setSyncProgress(null);
          return;
        }
        const statusData = await statusRes.json();

        if (statusData.state === 'completed' || statusData.state === 'failed') {
          clearInterval(interval);
          setSyncProgress(statusData.state === 'completed' ? 100 : null);
          
          if(statusData.state === 'completed') {
            alert("✅ Anúncios importados do Mercado Livre!");
          } else {
            alert("❌ Falha na importação. Verifique o console do worker.");
          }

          setTimeout(() => {
            setActiveJobId(null);
            localStorage.removeItem('ml_sync_job_id');
            setSyncProgress(null);
            fetchAnuncios();
            fetchAvailableTags();
          }, 1500);
        } else {
          setSyncProgress(statusData.progress || 5);
        }
      } catch (e) {
        console.error("Erro ao checar status da fila:", e);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId]);


  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.contasML) setContasML(data.contasML);
        if (data.regrasPreco) setRegrasPreco(data.regrasPreco);
        if (data.configAtacado) setConfigAtacado(data.configAtacado);
      });
  }, [usuarioId]);

  // Carrega verificação de preço persistida ao abrir a tela
  useEffect(() => {
    fetch(`/api/usuario/${usuarioId}/verificacao-preco`)
      .then(res => res.json())
      .then(data => {
        if (data.resultados && Object.keys(data.resultados).length > 0) {
          setPriceCheckResults(data.resultados);
        }
      })
      .catch(() => {});
  }, [usuarioId]);

const getSelectedItemsData = () => {
    return Array.from(selectedIds).map(id => {
      // IDs de variação são numéricos; IDs pai começam com "MLB"
      if (typeof id !== 'string' || !id.startsWith('MLB')) {
        const parentAd = Object.values(allKnownAds).find(ad =>
          ad.dadosML?.variations?.some(v => v.id === id)
        );
        if (!parentAd) return null;
        return {
          id: parentAd.id,
          contaId: parentAd.contaId,
          hasVariations: true,
          variationsIds: [id],
        };
      }
      const ad = allKnownAds[id];
      if (!ad) return null;
      const variations = ad.dadosML?.variations || [];
      return {
        id: ad.id,
        contaId: ad.contaId,
        hasVariations: variations.length > 0,
        variationsIds: variations.map(v => v.id)
      };
    }).filter(Boolean);
  };

  const handleAcaoMassa = async (acao) => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.');

    let valor = null;
    if (acao === 'estoque') {
      const input = window.prompt('Digite a nova quantidade de ESTOQUE para aplicar em todos os selecionados:');
      if (input === null) return;
      valor = Number(input);
      if (isNaN(valor) || valor < 0) return alert('Valor de estoque inválido.');
    } else {
      const nomeAcao = {
        'ativar': 'ATIVAR',
        'pausar': 'PAUSAR',
        'flex': 'ativar MERCADO ENVIOS FLEX em',
        'remover_flex': 'DESATIVAR o Envios Flex em',
        'turbo': 'ativar ENVIOS TURBO em'
      }[acao];
      if (!window.confirm(`Tem certeza que deseja ${nomeAcao} ${selectedIds.size} anúncio(s)?\n\nIsso será processado em segundo plano.`)) return;
    }

    setIsSyncingSelected(true);
    try {
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuarioId,
          items: getSelectedItemsData(),
          acao,
          valor
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);

      alert(`🚀 Ação enviada para a fila com sucesso!\n\nAs alterações em ${selectedIds.size} anúncio(s) serão processadas em segundo plano.\n\nAcompanhe o status e veja os LOGS DE ERRO na aba "Gerenciador de Fila".`);
      setSelectedIds(new Set());
    } catch (e) {
      alert(`Erro ao enviar para fila: ${e.message}`);
    } finally {
      setIsSyncingSelected(false);
    }
  };

  const handleAtivarDesconto = async () => {
    const input = window.prompt('Digite o desconto máximo (%) para ativar:\n\nTodos os anúncios candidatos com desconto do vendedor até esse valor serão ativados nas promoções disponíveis.');
    if (input === null) return;
    const maxPct = parseFloat(input);
    if (isNaN(maxPct) || maxPct <= 0) return alert('Percentual inválido.');

    const itemIds = Array.from(selectedIds).filter(id => typeof id === 'string' && id.startsWith('MLB'));
    if (itemIds.length === 0) return alert('Nenhum anúncio válido selecionado.');

    if (!window.confirm(`Ativar candidatos com desconto até ${maxPct}% nos ${itemIds.length} anúncio(s) selecionados?\n\nAs promoções serão buscadas em tempo real da API do Mercado Livre.`)) return;

    setIsSyncingSelected(true);
    try {
      const res = await fetch('/api/promocoes/ativar-candidatos-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, itemIds, maxPct }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro no servidor');
      alert(`✅ Busca em tempo real iniciada!\n\nOs candidatos dentro de ${maxPct}% serão ativados em segundo plano.\n\nAcompanhe o progresso no Gerenciador de Fila.${data.tarefaId ? `\n\nTarefa ID: ${data.tarefaId}` : ''}`);
    } catch (e) {
      alert('Erro ao ativar campanhas: ' + e.message);
    } finally {
      setIsSyncingSelected(false);
    }
  };

  const handleExcluirTodasCampanhas = async () => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.');
    if (!window.confirm(`Excluir TODAS as campanhas ativas dos ${selectedIds.size} anúncio(s) selecionado(s)?\n\nIsso removerá todas as promoções started/pending encontradas no banco local.`)) return;
    setIsSyncingSelected(true);
    try {
      const res = await fetch('/api/promocoes/excluir-campanhas-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, itemIds: [...selectedIds], maxPct: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro no servidor');
      alert(`✅ Exclusão enfileirada!\n\nAcompanhe na aba "Gerenciador de Fila".${data.tarefaId ? `\nTarefa: ${data.tarefaId}` : ''}`);
    } catch (e) {
      alert('Erro ao excluir campanhas: ' + e.message);
    } finally {
      setIsSyncingSelected(false);
    }
  };

  const handleExcluirCampanhasAte = async () => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.');
    const input = window.prompt('Digite o % máximo do vendedor:\n\nCampanhas cujo desconto do vendedor ULTRAPASSAR esse valor serão excluídas. As demais serão mantidas.');
    if (input === null) return;
    const maxPct = parseFloat(input);
    if (isNaN(maxPct) || maxPct <= 0) return alert('Percentual inválido.');
    if (!window.confirm(`Excluir campanhas acima de ${maxPct}% dos ${selectedIds.size} anúncio(s) selecionado(s)?\n\nCampanhas com desconto do vendedor ≤ ${maxPct}% serão mantidas.`)) return;
    setIsSyncingSelected(true);
    try {
      const res = await fetch('/api/promocoes/excluir-campanhas-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, itemIds: [...selectedIds], maxPct }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro no servidor');
      alert(`✅ Exclusão enfileirada!\n\nAcompanhe na aba "Gerenciador de Fila".${data.tarefaId ? `\nTarefa: ${data.tarefaId}` : ''}`);
    } catch (e) {
      alert('Erro ao excluir campanhas: ' + e.message);
    } finally {
      setIsSyncingSelected(false);
    }
  };

  const cancelarSincronizacaoML = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`/api/ml/sync-ads/${activeJobId}`, { method: 'DELETE' });
    } catch (_) {}
    setActiveJobId(null);
    localStorage.removeItem('ml_sync_job_id');
    setSyncProgress(null);
  };

// ✅ 3. MODIFIQUE A FUNÇÃO DE INICIAR A SINCRONIZAÇÃO
  const iniciarSincronizacaoML = async () => {
    if (!contaParaSincronizar) return alert("Selecione uma conta para puxar os anúncios.");

    setSyncProgress(0);

    const contasParaSync = contaParaSincronizar === '_TODAS_'
      ? contasML.map(c => c.id)
      : [contaParaSincronizar];

    try {
      let jobId;
      const isMultiAccount = contasParaSync.length > 1;

      const endpoint = isMultiAccount ? '/api/ml/sync-all-ads' : '/api/ml/sync-ads';
      const body = isMultiAccount
        ? { contaIds: contasParaSync, importarApenasNovos }
        : { contaId: contasParaSync[0], importarApenasNovos };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // ✅ TRATAMENTO SEGURO DE ERROS NÃO-JSON AQUI TAMBÉM
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("O servidor falhou ao iniciar a varredura. Verifique o terminal do Node.js.");
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Falha ao iniciar varredura');
      }

      if (data.erros && data.erros.length > 0) {
        alert(`⚠️ ${data.erros.length} conta(s) com problema:\n\n${data.erros.join('\n')}`);
      }

      jobId = data.jobId;

      if (jobId) {
        localStorage.setItem('ml_sync_job_id', jobId);
        setActiveJobId(jobId);
      } else {
        setSyncProgress(null);
      }

    } catch (e) {
      alert("Erro ao disparar varredura: " + e.message);
      setSyncProgress(null);
    }
  };


  // useEffect para monitorar a sincronização principal
  useEffect(() => {
    if (!activeJobId) return;
    // ... (código existente)
  }, [activeJobId]);

  // ✅ NOVO useEffect para monitorar a verificação de preço
  useEffect(() => {
    if (!priceCheckJobId) return;

    const interval = setInterval(async () => {
      try {
        // Usaremos a fila de tarefas geral para saber o status
        const res = await fetch(`/api/fila?userId=${usuarioId}&jobId=${priceCheckJobId}`);
        const data = await res.json();
        const tarefa = data.tarefas?.[0];

        if (!tarefa || tarefa.status === 'CONCLUIDO' || tarefa.status === 'FALHA') {
          clearInterval(interval);
          setPriceCheckJobId(null);
          
          if (tarefa?.status === 'CONCLUIDO') {
            // Se concluiu, busca os resultados salvos no banco
            const resultsRes = await fetch(`/api/usuario/${usuarioId}/verificacao-preco`);
            const resultsData = await resultsRes.json();
            if (resultsData.resultados) {
              setPriceCheckResults(resultsData.resultados);
              alert('✅ Verificação de preços concluída!');
            }
          } else {
            alert('❌ Falha na verificação de preços. Verifique o Gerenciador de Fila.');
          }
        }
      } catch (e) {
        clearInterval(interval);
        setPriceCheckJobId(null);
      }
    }, 5000); // Verifica a cada 5 segundos

    return () => clearInterval(interval);
  }, [priceCheckJobId, usuarioId]);


  const mergeAdsIntoState = (newAds) => {
    const adMap = new Map(anuncios.map(ad =>[ad.id, ad]));
    newAds.forEach(newAd => adMap.set(newAd.id, newAd));
    setAnuncios(Array.from(adMap.values()));
    setTotal(adMap.size);

    setAllKnownAds(prev => {
        const next = { ...prev };
        newAds.forEach(ad => next[ad.id] = ad);
        return next;
    });

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

  // Filtragem client-side por palavras excluídas (price check filter é server-side)
  const displayedAnuncios = anuncios
    .filter(ad => {
      if (palavrasExcluir.length === 0) return true;
      const titulo = (ad.titulo || '').toLowerCase();
      return !palavrasExcluir.some(p => titulo.includes(p.toLowerCase()));
    });

  // Agrupamento por SKU: soma visitas e vendas de todos os anúncios (pai + variações) com o mesmo SKU
  const skuGroups = React.useMemo(() => {
    if (!agrupaPorSku) return null;

    const groups = {};

    displayedAnuncios.forEach(ad => {
      // Coleta SKUs de variações do campo direto do banco
      const skusVariacoes = Array.isArray(ad.skusVariacoes) ? ad.skusVariacoes.filter(Boolean) : [];

      // Determina SKU do anúncio pai.
      // Se o pai não tem SKU mas tem variações com SKU, usa o primeiro SKU de variação como grupo.
      let skuPai = ad.sku || (skusVariacoes.length > 0 ? skusVariacoes[0] : null) || '__sem_sku__';

      const skuGroup = skuPai;

      if (!groups[skuGroup]) {
        groups[skuGroup] = {
          sku: skuGroup === '__sem_sku__' ? null : skuGroup,
          ads: [],
          totalVisitas: 0,
          totalVendas: 0,
          totalEstoque: 0,
          contas: new Set(),
          titulo: ad.titulo,
          skusRelacionados: new Set(),
        };
      }

      groups[skuGroup].ads.push(ad);
      groups[skuGroup].totalVisitas += Number(ad.visitas || 0);
      groups[skuGroup].totalVendas += Number(ad.vendas || 0);
      groups[skuGroup].totalEstoque += Number(ad.estoque || 0);
      groups[skuGroup].contas.add(ad.conta?.nickname || '?');

      // Registra SKUs de variações relacionados (para exibição informativa)
      skusVariacoes.forEach(s => {
        if (s !== skuPai) groups[skuGroup].skusRelacionados.add(s);
      });
    });

    const sorters = {
      visitas_desc: (a, b) => b.totalVisitas - a.totalVisitas,
      visitas_asc:  (a, b) => a.totalVisitas - b.totalVisitas,
      vendas_desc:  (a, b) => b.totalVendas - a.totalVendas,
      vendas_asc:   (a, b) => a.totalVendas - b.totalVendas,
      estoque_desc: (a, b) => b.totalEstoque - a.totalEstoque,
      estoque_asc:  (a, b) => a.totalEstoque - b.totalEstoque,
    };
    const sorter = sorters[sortBy] || sorters['visitas_desc'];
    return Object.values(groups).sort(sorter);
  }, [agrupaPorSku, displayedAnuncios, sortBy]);

  return (
    <>
    <div className="space-y-6 w-full">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Edição em Massa e Gerenciador ML</h3>
          <p className="text-sm text-gray-500 mb-2">{total} anúncios sincronizados no banco local.</p>
          
          {syncProgress !== null && (
            <div className="w-72 mt-2">
               <div className="flex justify-between mb-1">
                 <span className="text-xs font-bold text-green-700">Lendo API do ML...</span>
                 <div className="flex items-center gap-2">
                   <span className="text-xs font-bold text-green-700">{syncProgress}%</span>
                   <button
                     onClick={cancelarSincronizacaoML}
                     className="text-xs font-bold text-red-600 hover:text-red-800 underline leading-none"
                     title="Cancelar varredura"
                   >
                     Cancelar
                   </button>
                 </div>
               </div>
               <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${syncProgress}%` }}></div></div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
           {/* ✅ NOVO: CHECKBOX DE APENAS NOVOS */}
           <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mr-2 cursor-pointer select-none">
             <input 
               type="checkbox" 
               checked={importarApenasNovos}
               onChange={(e) => setImportarApenasNovos(e.target.checked)}
               className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer"
             />
             Apenas Novos
           </label>

           <select 
             value={contaParaSincronizar} 
             onChange={e => setContaParaSincronizar(e.target.value)}
             className="px-3 py-2 border border-gray-300 rounded text-sm bg-white font-medium focus:ring-blue-500"
           >
             <option value="">Selecione a Conta...</option>
            <option value="_TODAS_">📦 Todas as Contas</option>
            {contasML.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
           </select>
           {canUseResource('gerenciadorML.sincronizar') && (
           <button
             onClick={iniciarSincronizacaoML}
             disabled={syncProgress !== null || !contaParaSincronizar}
             className="px-5 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 transition disabled:opacity-50"
           >
            {syncProgress !== null ? 'Sincronizando...' : (importarApenasNovos ? '⬇ Importar Novos' : '⬇ Importar Tudo')}
           </button>
           )}
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
          <div className="flex flex-1 min-w-[200px]">
            <select
              value={searchType}
              onChange={(e) => { setSearchType(e.target.value); setCurrentPage(1); }}
              className="px-2 py-2 border border-r-0 border-gray-300 rounded-l-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10"
            >
              <option value="todos">Todos</option>
              <option value="titulo">Título</option>
              <option value="mlb">MLB</option>
              <option value="sku">SKU</option>
            </select>
            <input
              type="text"
              placeholder={{ todos: 'Buscar por Título, MLB ou SKU...', titulo: 'Buscar por título...', mlb: 'Buscar por MLB (ex: MLB123...)...', sku: 'Buscar por SKU...' }[searchType]}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
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

          {/* Agrupar por SKU */}
          <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-md border text-sm font-bold transition-colors ${agrupaPorSku ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            <input
              type="checkbox"
              checked={agrupaPorSku}
              onChange={(e) => setAgrupaPorSku(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-white"
            />
            Agrupar por SKU
          </label>
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
              showAdvancedFilters ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
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

                {/* Filtro Frete Grátis */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Frete Grátis</label>
                  <select
                    value={freteGratisFilter}
                    onChange={(e) => { setFreteGratisFilter(e.target.value); setCurrentPage(1); }}
                    className="mt-1 w-full text-xs py-1.5 px-2 border border-gray-300 rounded font-semibold text-gray-700 bg-white"
                  >
                    <option value="Todos">Todos</option>
                    <option value="sim">🚚 Com Frete Grátis</option>
                    <option value="nao">Sem Frete Grátis</option>
                  </select>
                </div>

                {/* Filtro Produto FULL */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Produto FULL</label>
                  <select
                    value={produtoFullFilter}
                    onChange={(e) => { setProdutoFullFilter(e.target.value); setCurrentPage(1); }}
                    className="mt-1 w-full text-xs py-1.5 px-2 border border-gray-300 rounded font-semibold text-gray-700 bg-white"
                  >
                    <option value="Todos">Todos</option>
                    <option value="sim">⚡ É de FULL</option>
                    <option value="nao">Não é FULL</option>
                  </select>
                </div>

                {/* Filtro de Preço Checado */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-teal-600 uppercase tracking-wide">Preço Checado</label>
                  <select
                    value={priceCheckFilter}
                    onChange={(e) => setPriceCheckFilter(e.target.value)}
                    className="w-48 px-3 py-2 border border-teal-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Todos">Todos</option>
                    <option value="perfeito">✓ Preço Perfeito</option>
                    <option value="lucro">📈 Com Lucro</option>
                    <option value="prejuizo">📉 Com Prejuízo</option>
                    <option value="erro">⚠️ Com Erro</option>
                  </select>
                  {priceCheckFilter !== 'Todos' && Object.keys(priceCheckResults).length === 0 && (
                    <p className="text-[10px] text-amber-600">Use "Verificar Preço" primeiro.</p>
                  )}
                </div>

                {/* Filtro Frete Grátis */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Frete Grátis</label>
                  <select
                    value={freteGratisFilter}
                    onChange={(e) => { setFreteGratisFilter(e.target.value); setCurrentPage(1); }}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Todos">Todos</option>
                    <option value="sim">🚚 Com Frete Grátis</option>
                    <option value="nao">Sem Frete Grátis</option>
                  </select>
                </div>

                {/* Filtro Sem SKU */}
                <div className="flex flex-col gap-1.5 justify-end">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={semSkuFilter}
                      onChange={(e) => { setSemSkuFilter(e.target.checked); setCurrentPage(1); }}
                      className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Sem SKU</span>
                  </label>
                </div>

                {/* Filtro: Excluir por Palavras-chave */}
                <div className="flex flex-col gap-1.5 w-full mt-2 border-t border-gray-200 pt-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Excluir resultados com as seguintes palavras-chave
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Digite uma palavra e pressione Enter..."
                      value={palavrasExcluirInput}
                      onChange={e => setPalavrasExcluirInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && palavrasExcluirInput.trim()) {
                          e.preventDefault();
                          const nova = palavrasExcluirInput.trim().replace(/,$/, '');
                          if (nova && !palavrasExcluir.includes(nova.toLowerCase())) {
                            setPalavrasExcluir(prev => [...prev, nova.toLowerCase()]);
                          }
                          setPalavrasExcluirInput('');
                        } else if (e.key === 'Backspace' && !palavrasExcluirInput && palavrasExcluir.length > 0) {
                          setPalavrasExcluir(prev => prev.slice(0, -1));
                        }
                      }}
                      className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  {palavrasExcluir.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {palavrasExcluir.map(palavra => (
                        <span
                          key={palavra}
                          className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-xs font-semibold px-2 py-0.5 rounded-full"
                        >
                          {palavra}
                          <button
                            onClick={() => setPalavrasExcluir(prev => prev.filter(p => p !== palavra))}
                            className="hover:text-red-900 transition-colors ml-0.5 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
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
            className={`transition-all duration-300 ease-in-out ${
              showAcoesMassa ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
            }`}
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50">
              {/* Linha: Selecionar Todos */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={handleSelectAllFiltered}
                  disabled={isSelectingAll}
                  className="px-3 py-1.5 text-xs font-bold border rounded-md transition-colors text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSelectingAll ? (
                    <span className="animate-pulse">Selecionando...</span>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      Selecionar Todos os Filtrados ({total})
                    </>
                  )}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 text-xs font-bold border rounded-md transition-colors text-gray-600 bg-white border-gray-300 hover:bg-gray-100"
                  >
                    ✕ Desmarcar Todos
                  </button>
                )}
                {selectedIds.size === 0 && (
                  <p className="text-xs text-gray-400 italic">Selecione anúncios na tabela abaixo para habilitar as ações.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Sincronizar Selecionados */}
                {canUseResource('gerenciadorML.sincronizar') && (
                <button
                  onClick={handleSyncSelected}
                  disabled={isSyncingSelected}
                  className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100 disabled:opacity-50"
                >
                  {isSyncingSelected ? '⏳ Sincronizando...' : '🔄 Sincronizar Selecionados'}
                </button>
                )}

                {/* Preço dropdown */}
                {canUseResource('gerenciadorML.editarPreco') && (
                <div className="relative" ref={dropdownPrecoRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownPreco(v => !v); }}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 flex items-center gap-1.5"
                  >
                    💲 Preço
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownPreco ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownPreco && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[220px] py-1" onMouseLeave={() => setDropdownPreco(false)}>
                      <button onClick={() => { setDropdownPreco(false); setModalCorrigirPreco(true); }} className="w-full text-left px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2">
                        💲 <span><span className="font-semibold">Corrigir Preço</span><br/><span className="text-xs text-gray-400">Ajusta preço com base em regras</span></span>
                      </button>
                      <button onClick={() => { setDropdownPreco(false); setModalVerificarPreco(true); }} className="w-full text-left px-4 py-2.5 text-sm text-teal-700 hover:bg-teal-50 flex items-center gap-2">
                        🔍 <span><span className="font-semibold">Verificar Preço</span><br/><span className="text-xs text-gray-400">Verifica em segundo plano</span></span>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button onClick={() => { setDropdownPreco(false); handleEnviarAtacadoMassa(); }} disabled={isEnviandoAtacadoMassa} className="w-full text-left px-4 py-2.5 text-sm text-teal-700 hover:bg-teal-50 flex items-center gap-2 disabled:opacity-50">
                        💰 <span><span className="font-semibold">Enviar Atacado</span><br/><span className="text-xs text-gray-400">Envia para lista de atacado</span></span>
                      </button>
                    </div>
                  )}
                </div>
                )}

                {/* Campanhas dropdown */}
                <div className="relative" ref={dropdownCampanhasRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownCampanhas(v => !v); }}
                    disabled={isSyncingSelected}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    🏷️ Campanhas
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownCampanhas ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownCampanhas && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px] py-1"
                      onMouseLeave={() => setDropdownCampanhas(false)}
                    >
                      <button
                        onClick={() => { setDropdownCampanhas(false); handleAtivarDesconto(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-pink-700 hover:bg-pink-50 flex items-center gap-2"
                      >
                        🏷️ <span><span className="font-semibold">Ativar Campanhas</span><br/><span className="text-xs text-gray-400">Ativa candidatos até o % informado</span></span>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { setDropdownCampanhas(false); handleExcluirTodasCampanhas(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2"
                      >
                        🗑️ <span><span className="font-semibold">Excluir todas as campanhas</span><br/><span className="text-xs text-gray-400">Remove todas as promoções ativas</span></span>
                      </button>
                      <button
                        onClick={() => { setDropdownCampanhas(false); handleExcluirCampanhasAte(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-2"
                      >
                        ✂️ <span><span className="font-semibold">Excluir campanhas acima de X%</span><br/><span className="text-xs text-gray-400">Mantém as de menor desconto</span></span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Status dropdown */}
                {canUseResource('gerenciadorML.pausar') && (
                <div className="relative" ref={dropdownStatusRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownStatus(v => !v); }}
                    disabled={isSyncingSelected}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-green-700 bg-green-50 border-green-200 hover:bg-green-100 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    ▶ Status
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownStatus ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownStatus && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] py-1" onMouseLeave={() => setDropdownStatus(false)}>
                      <button onClick={() => { setDropdownStatus(false); handleAcaoMassa('ativar'); }} className="w-full text-left px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2">
                        ▶ <span><span className="font-semibold">Ativar</span><br/><span className="text-xs text-gray-400">Ativa os anúncios selecionados</span></span>
                      </button>
                      <button onClick={() => { setDropdownStatus(false); handleAcaoMassa('pausar'); }} className="w-full text-left px-4 py-2.5 text-sm text-yellow-700 hover:bg-yellow-50 flex items-center gap-2">
                        ⏸ <span><span className="font-semibold">Pausar</span><br/><span className="text-xs text-gray-400">Pausa os anúncios selecionados</span></span>
                      </button>
                    </div>
                  )}
                </div>
                )}

                {/* Flex / Turbo dropdown */}
                <div className="relative" ref={dropdownFlexTurboRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownFlexTurbo(v => !v); }}
                    disabled={isSyncingSelected}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    ⚡ Flex / Turbo
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownFlexTurbo ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownFlexTurbo && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[230px] py-1" onMouseLeave={() => setDropdownFlexTurbo(false)}>
                      <button onClick={() => { setDropdownFlexTurbo(false); handleAcaoMassa('flex'); }} className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-2">
                        ⚡ <span><span className="font-semibold">Ativar Flex</span><br/><span className="text-xs text-gray-400">Endereço precisa estar habilitado</span></span>
                      </button>
                      <button onClick={() => { setDropdownFlexTurbo(false); handleAcaoMassa('remover_flex'); }} className="w-full text-left px-4 py-2.5 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2">
                        ❌ <span><span className="font-semibold">Desativar Flex</span><br/><span className="text-xs text-gray-400">Remove o Flex dos selecionados</span></span>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button onClick={() => { setDropdownFlexTurbo(false); handleAcaoMassa('turbo'); }} className="w-full text-left px-4 py-2.5 text-sm text-rose-700 hover:bg-rose-50 flex items-center gap-2">
                        🚀 <span><span className="font-semibold">Ativar Turbo</span><br/><span className="text-xs text-gray-400">Requer Flex habilitado</span></span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Alterar Produto dropdown */}
                <div className="relative" ref={dropdownAlterarProdutoRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownAlterarProduto(v => !v); }}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100 flex items-center gap-1.5"
                  >
                    ✏️ Alterar Produto
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownAlterarProduto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownAlterarProduto && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[210px] py-1" onMouseLeave={() => setDropdownAlterarProduto(false)}>
                      <button onClick={() => { setDropdownAlterarProduto(false); setModalEditarTitulo(true); }} className="w-full text-left px-4 py-2.5 text-sm text-sky-700 hover:bg-sky-50 flex items-center gap-2">
                        ✏️ <span><span className="font-semibold">Editar Título</span></span>
                      </button>
                      <button onClick={() => { setDropdownAlterarProduto(false); setModalEditarDescricao(true); }} className="w-full text-left px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-2">
                        📝 <span><span className="font-semibold">Editar Descrição</span></span>
                      </button>
                      <button onClick={() => { setDropdownAlterarProduto(false); setModalAlterarSku(true); }} className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-2">
                        🏷️ <span><span className="font-semibold">Alterar SKU</span></span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Estoque dropdown */}
                <div className="relative" ref={dropdownEstoqueRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownEstoque(v => !v); }}
                    disabled={isSyncingSelected}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    📦 Estoque
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownEstoque ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownEstoque && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[220px] py-1" onMouseLeave={() => setDropdownEstoque(false)}>
                      <button onClick={() => { setDropdownEstoque(false); handleAcaoMassa('estoque'); }} className="w-full text-left px-4 py-2.5 text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-2">
                        📦 <span><span className="font-semibold">Alterar Estoque</span><br/><span className="text-xs text-gray-400">Define a quantidade em estoque</span></span>
                      </button>
                      <button onClick={() => { setDropdownEstoque(false); setModalPrazoFabricacao(true); }} className="w-full text-left px-4 py-2.5 text-sm text-violet-700 hover:bg-violet-50 flex items-center gap-2">
                        🕐 <span><span className="font-semibold">Prazo de Fabricação</span><br/><span className="text-xs text-gray-400">Define dias para fabricar</span></span>
                      </button>
                    </div>
                  )}
                </div>

                {canUseResource('gerenciadorML.excluir') && (
                <button
                  onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setModalExcluir(true); }}
                  className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-red-700 bg-red-50 border-red-200 hover:bg-red-100"
                >
                  🗑️ Excluir
                </button>
                )}

                {/* Compatibilidade dropdown */}
                <div className="relative" ref={dropdownCompatRef}>
                  <button
                    onClick={() => { if (selectedIds.size === 0) return alert('Selecione ao menos um anúncio.'); setDropdownCompat(v => !v); }}
                    className="px-4 py-2 text-sm font-semibold border rounded-md transition-colors text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 flex items-center gap-1.5"
                  >
                    🚗 Compatibilidade
                    <svg className={`w-3.5 h-3.5 transition-transform ${dropdownCompat ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownCompat && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[220px] py-1"
                      onMouseLeave={() => setDropdownCompat(false)}
                    >
                      <button
                        onClick={() => { setDropdownCompat(false); setModalCompatibilidade(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 flex items-center gap-2"
                      >
                        🚗 <span><span className="font-semibold">Aplicar Perfil</span><br/><span className="text-xs text-gray-400">Usa compatibilidade já cadastrada</span></span>
                      </button>
                      <button
                        onClick={() => { setDropdownCompat(false); setModalRapido(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-violet-700 hover:bg-violet-50 flex items-center gap-2"
                      >
                        ⚡ <span><span className="font-semibold">Preenchimento Rápido</span><br/><span className="text-xs text-gray-400">Busca e aplica sem perfil salvo</span></span>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { setDropdownCompat(false); setModalPosicao(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-cyan-700 hover:bg-cyan-50 flex items-center gap-2"
                      >
                        📍 <span><span className="font-semibold">Posição da Peça</span><br/><span className="text-xs text-gray-400">Define dianteira, traseira, etc.</span></span>
                      </button>
                    </div>
                  )}
                </div>
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
                  checked={displayedAnuncios.length > 0 && displayedAnuncios.every(ad => selectedIds.has(ad.id))}
                  onChange={(e) => {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      const isChecked = e.target.checked;
                      
                      displayedAnuncios.forEach(ad => {
                        if (isChecked) {
                          next.add(ad.id);
                          // Adiciona as variações, se houverem
                          if (ad.dadosML?.variations?.length > 0) {
                            ad.dadosML.variations.forEach(v => next.add(v.id));
                          }
                        } else {
                          next.delete(ad.id);
                          // Remove as variações, se houverem
                          if (ad.dadosML?.variations?.length > 0) {
                            ad.dadosML.variations.forEach(v => next.delete(v.id));
                          }
                        }
                      });
                      
                      return next;
                    });
                  }}
                />
              </th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase w-16">Img</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-600 uppercase">Conta / ID</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-600 uppercase">Título / SKU</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
              <th className="px-2 py-3 text-right text-xs font-bold text-gray-600 uppercase">Preço (de/por)</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">% Desc</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">Estoque</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">Visitas</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">Vendas</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">T. Fabr.</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-600 uppercase">Tipo An.</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-600 uppercase">Catálogo / Tags</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-teal-600 uppercase">Dif. Preço</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan="15" className="px-6 py-10 text-center text-sm font-semibold text-gray-500">Buscando anúncios no banco local...</td></tr>
            ) : agrupaPorSku && skuGroups ? (
              skuGroups.length === 0 ? (
                <tr><td colSpan="15" className="px-6 py-10 text-center text-sm text-gray-500">Nenhum anúncio encontrado para agrupar.</td></tr>
              ) : skuGroups.map((group) => {
                const groupIds = group.ads.map(a => a.id);
                const allSelected = groupIds.length > 0 && groupIds.every(id => selectedIds.has(id));
                const someSelected = !allSelected && groupIds.some(id => selectedIds.has(id));
                return (
                <tr key={group.sku ?? '__sem_sku__'} className={`hover:bg-violet-50/30 transition-colors ${someSelected || allSelected ? 'bg-indigo-50/40' : ''}`}>
                  {/* Expander placeholder */}
                  <td className="px-2 py-3 w-7" />
                  {/* Checkbox grupo */}
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-400 text-indigo-600 cursor-pointer"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) groupIds.forEach(id => next.add(id));
                          else groupIds.forEach(id => next.delete(id));
                          return next;
                        });
                      }}
                    />
                  </td>
                  {/* Thumb: imagem do primeiro ad */}
                  <td className="px-2 py-3 w-16 text-center">
                    <img src={group.ads[0]?.thumbnail} alt="" className="w-12 h-12 object-contain rounded shadow-sm border border-gray-200 mx-auto bg-white" />
                  </td>
                  {/* SKU */}
                  <td className="px-3 py-3 text-sm" colSpan="2">
                    <div className="font-black text-violet-700 font-mono text-base leading-tight">
                      {group.sku ?? <span className="text-gray-400 italic font-normal">Sem SKU</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 truncate max-w-xs" title={group.titulo}>{group.titulo}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from(group.contas).map(c => (
                        <span key={c} className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] px-1.5 py-0.5 rounded font-semibold">{c}</span>
                      ))}
                      {group.skusRelacionados.size > 0 && (
                        <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 text-[10px] px-1.5 py-0.5 rounded font-semibold" title={Array.from(group.skusRelacionados).join(', ')}>
                          +{group.skusRelacionados.size} SKU(s) variação
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Anúncios (count) */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex flex-col items-center">
                      <span className="text-lg font-black text-gray-800">{group.ads.length}</span>
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">anúncio{group.ads.length > 1 ? 's' : ''}</span>
                    </span>
                  </td>
                  {/* Preço (vazio no agrupado) */}
                  <td className="px-3 py-3 text-center text-gray-300 text-xs">—</td>
                  {/* % Desc vazio */}
                  <td className="px-3 py-3 text-center text-gray-300 text-xs">—</td>
                  {/* Estoque total */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex flex-col items-center">
                      <span className="text-base font-black text-gray-700">{group.totalEstoque}</span>
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">estoque</span>
                    </span>
                  </td>
                  {/* Total Visitas */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex flex-col items-center">
                      <span className="text-base font-black text-blue-600">{group.totalVisitas.toLocaleString('pt-BR')}</span>
                      <span className="text-[10px] text-blue-400 uppercase font-semibold">visitas</span>
                    </span>
                  </td>
                  {/* Total Vendas */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex flex-col items-center">
                      <span className="text-base font-black text-green-600">{group.totalVendas.toLocaleString('pt-BR')}</span>
                      <span className="text-[10px] text-green-400 uppercase font-semibold">vendas</span>
                    </span>
                  </td>
                  {/* T.Fabr, Tipo An, Tags, Dif.Preço — vazios no modo agrupado */}
                  <td colSpan="4" />
                </tr>
              ); })
            ) : displayedAnuncios.length > 0 ? (
              displayedAnuncios.map((ad) => {
                const dadosML = ad.dadosML || {};
                const tags = dadosML.tags || [];
                const isCatalog = dadosML.catalog_listing;
                const mfgTime = getMfgTime(dadosML);
                const discount = getDiscountPerc(ad.preco, ad.precoOriginal);
                const variations = dadosML.variations || [];
                const hasVariations = variations.length > 0;
                // Se a busca é por SKU de variação específica → auto-expande e filtra só essa variação
                const isVariationSkuSearch = searchTerm &&
                  (searchType === 'sku' || searchType === 'todos') &&
                  Array.isArray(ad.skusVariacoes) && ad.skusVariacoes.includes(searchTerm) &&
                  !ad.sku?.toLowerCase().includes(searchTerm.toLowerCase());
                const isExpanded = expandedAds.has(ad.id) || isVariationSkuSearch;
                const variationsToShow = isVariationSkuSearch
                  ? variations.filter(v => {
                      const vSku = v.seller_custom_field
                        || v.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name
                        || null;
                      return vSku?.toLowerCase() === searchTerm.toLowerCase();
                    })
                  : variations;

                return (
                  <React.Fragment key={ad.id}>
                  {!isVariationSkuSearch && <tr className={`hover:bg-blue-50/30 transition-colors ${selectedIds.has(ad.id) ? 'bg-indigo-50/40' : ''}`}>
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
                            const isChecked = e.target.checked;
                            
                            if (isChecked) {
                              // Adiciona o pai
                              next.add(ad.id);
                              // Adiciona automaticamente todas as variações (filhos)
                              if (hasVariations) {
                                variations.forEach(v => next.add(v.id));
                              }
                            } else {
                              // Remove o pai
                              next.delete(ad.id);
                              // Remove automaticamente todas as variações (filhos)
                              if (hasVariations) {
                                variations.forEach(v => next.delete(v.id));
                              }
                            }
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 w-16 text-center">
                      <img src={ad.thumbnail} alt="thumb" className="w-12 h-12 object-contain rounded shadow-sm border border-gray-200 mx-auto bg-white" />
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-bold text-gray-800">{ad.conta?.nickname}</div>
                      <a href={ad.permalink} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-blue-600 hover:underline">{ad.id}</a>
                    </td>
                    <td className="px-3 py-2 text-sm max-w-xs">
                      <div className="font-semibold text-gray-900 truncate" title={ad.titulo}>{ad.titulo}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="text-[11px] font-mono text-gray-500">SKU: {ad.sku || 'S/ SKU'}</div>
                        {ad.dadosML?.shipping?.logistic_type === 'fulfillment' && (
                          <span className="italic text-[10px] uppercase font-black text-green-700 bg-green-100 px-1 py-0.5 rounded leading-none flex items-center gap-0.5">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd" /></svg>
                            FULL
                          </span>
                        )}
                      </div>
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

                        {tags.includes('standard_price_by_quantity') && (
                          <span className="bg-teal-100 text-teal-800 border border-teal-200 text-[9px] px-1.5 py-0.5 rounded font-bold">Atacado Ativo</span>
                        )}

                        {(
                          <button
                            onClick={() => handleEnviarAtacadoRapido(ad)}
                            disabled={atacadoSendingIds.has(ad.id)}
                            className="mt-1 flex items-center gap-1 text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-300 px-2 py-0.5 rounded hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={configAtacado?.faixas?.length > 0 ? `Enviar ${configAtacado.faixas.length} faixa(s) de atacado • preço base: R$ ${Number(ad.preco).toFixed(2)}` : 'Configure as faixas de atacado em Configurações API'}
                          >
                            {atacadoSendingIds.has(ad.id) ? (
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            {atacadoSendingIds.has(ad.id) ? 'Enviando...' : 'Atacado'}
                          </button>
                        )}
                      </div>
                    </td>
                    {/* Coluna Dif. Preço */}
                    <td className="px-3 py-2 text-center">
                      {priceCheckResults[ad.id] ? (() => {
                        const { status, diferenca, precoCalculado, precoDE } = priceCheckResults[ad.id];
                        const cfg = ({
                          perfeito: { bg: 'bg-blue-50 border-blue-200 text-blue-700', label: '✓ Perfeito' },
                          perfeito_promo: { bg: 'bg-emerald-50 border-emerald-300 text-emerald-700', label: '✓ Perf. (Promo)' },
                          lucro:    { bg: 'bg-green-50 border-green-200 text-green-700', label: `+${diferenca.toFixed(1)}%` },
                          prejuizo: { bg: 'bg-red-50 border-red-200 text-red-700', label: `${diferenca.toFixed(1)}%` },
                        }[status]) ?? { bg: 'bg-gray-50 border-gray-200 text-gray-500', label: status };
                        return (
                          <button
                            onClick={() => setPriceDetailPopup({ ad, resultado: priceCheckResults[ad.id] })}
                            title={`Correto Cheio: R$ ${precoDE?.toFixed(2) || '---'} | Correto Desconto: R$ ${precoCalculado?.toFixed(2)}`}
                            className={`inline-block text-[11px] font-black px-2 py-0.5 rounded border cursor-pointer hover:opacity-75 transition-opacity ${cfg.bg}`}>
                            {cfg.label}
                          </button>
                        );
                      })() : <span className="text-gray-200 text-xs">—</span>}
                    </td>
                  </tr>}
                  {/* Variações expandidas */}
                  {hasVariations && isExpanded && variationsToShow.map((v) => {
                    const grade = v.attribute_combinations || [];
                    const gradeStr = grade.map(g => `${g.name}: ${g.value_name}`).join(' / ') || `ID ${v.id}`;
                    const vSku = v.seller_custom_field
                      || (v.attributes && v.attributes.find(a => a.id === 'SELLER_SKU'))?.value_name
                      || null;
                    const vDiscount = getDiscountPerc(v.price, ad.precoOriginal);

                    // Quando busca por SKU de variação: linha completa (sem pai acima)
                    if (isVariationSkuSearch) {
                      return (
                        <tr key={v.id} className={`hover:bg-blue-50/30 transition-colors ${selectedIds.has(v.id) ? 'bg-indigo-50/40' : ''}`}>
                          <td className="px-2 py-2 text-center w-7" />
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-400 text-indigo-600 cursor-pointer"
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
                          <td className="px-3 py-2">
                            <img src={ad.thumbnail} alt="thumb" className="w-10 h-10 object-cover rounded shadow-sm border border-gray-200" />
                          </td>
                          <td className="px-3 py-2 text-sm">
                            <div className="font-bold text-gray-800">{ad.conta?.nickname}</div>
                            <a href={ad.permalink} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-blue-600 hover:underline">{ad.id}</a>
                          </td>
                          <td className="px-3 py-2 text-sm max-w-xs">
                            <div className="font-semibold text-gray-900 truncate" title={gradeStr}>{gradeStr}</div>
                            <div className="text-[11px] font-mono text-gray-500 mt-0.5">
                              SKU: <span className="text-indigo-600 font-bold">{vSku || 'S/ SKU'}</span>
                              <span className="ml-2 text-gray-400">ID var: {v.id}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-full border ${ad.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' : ad.status === 'paused' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                              {ad.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-sm">
                            <div className="font-bold text-gray-900">R$ {Number(v.price || 0).toFixed(2)}</div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {vDiscount ? <span className="text-[11px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded">-{vDiscount}%</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2 text-center text-sm font-black text-gray-700">
                            {v.available_quantity ?? '-'}
                          </td>
                          <td colSpan="6" />
                        </tr>
                      );
                    }

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
                        <td colSpan="6" />
                      </tr>
                    );
                  })}
                  </React.Fragment>
                )
              })
            ) : (
              <tr><td colSpan="15" className="px-6 py-10 text-center text-sm text-gray-500">{priceCheckFilter !== 'Todos' ? 'Nenhum anúncio com esse resultado de verificação. Use "Verificar Preço" primeiro.' : 'Nenhum anúncio encontrado. Verifique os filtros ou importe dados.'}</td></tr>
            )}
          </tbody>
        </table>
        
        {/* Paginação */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <span className="text-sm font-semibold text-gray-600">
            {agrupaPorSku && skuGroups
              ? <><span className="text-violet-700">{skuGroups.length} grupo(s) de SKU</span> · {displayedAnuncios.length} anúncio(s)</>
              : <>Página {currentPage} — {total} anúncio(s)</>
            }
            {tagFilter !== 'Todas' && <span className="text-blue-600 ml-2">(filtrado por tag)</span>}
            {activeAdvancedFiltersCount > 0 && <span className="text-purple-600 ml-2">(+{activeAdvancedFiltersCount} filtro(s) adicional(is))</span>}
          </span>
          {!agrupaPorSku && (
            <div className="flex gap-2">
              <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</button>
              <button className="px-4 py-1.5 border border-gray-300 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 text-sm font-bold text-gray-700" disabled={anuncios.length < itemsPerPage} onClick={() => setCurrentPage(p => p + 1)}>Próxima</button>
            </div>
          )}
        </div>
      </div>
    </div>

    <ModalFichaTecnica anuncio={fichaTecnicaModal} usuarioId={usuarioId} onClose={() => setFichaTecnicaModal(null)} />

    {modalCorrigirPreco && (
      <ModalCorrigirPreco
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        regrasPreco={regrasPreco}
        usuarioId={usuarioId}
        configAtacado={configAtacado}
        onClose={() => setModalCorrigirPreco(false)}
        onSuccess={() => { fetchAnuncios(); setModalCorrigirPreco(false); }}
      />
    )}


    {modalVerificarPreco && (
      <ModalVerificarPreco
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        regrasPreco={regrasPreco}
        usuarioId={usuarioId}
        onClose={() => setModalVerificarPreco(false)}
        onJobStart={(jobId) => {
          setPriceCheckJobId(jobId); // Inicia o monitoramento
        }}
      />
    )}

    {modalPrazoFabricacao && (
      <ModalPrazoFabricacao
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        usuarioId={usuarioId}
        onClose={() => setModalPrazoFabricacao(false)}
        onSuccess={() => { setModalPrazoFabricacao(false); setSelectedIds(new Set()); }}
      />
    )}

    {modalEditarTitulo && (
      <ModalEditarTitulo
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        usuarioId={usuarioId}
        onClose={() => setModalEditarTitulo(false)}
        onSuccess={() => { setModalEditarTitulo(false); setSelectedIds(new Set()); }}
      />
    )}

    {modalEditarDescricao && (
      <ModalEditarDescricao
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        usuarioId={usuarioId}
        onClose={() => setModalEditarDescricao(false)}
        onSuccess={() => { setModalEditarDescricao(false); setSelectedIds(new Set()); }}
      />
    )}

    {modalAlterarSku && (
      <ModalAlterarSku
        selectedIds={selectedIds}
        allKnownAds={allKnownAds}
        usuarioId={usuarioId}
        onClose={() => setModalAlterarSku(false)}
        onSuccess={() => { setModalAlterarSku(false); setSelectedIds(new Set()); }}
      />
    )}

    {modalExcluir && (
      <ModalExcluir
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        usuarioId={usuarioId}
        onClose={() => setModalExcluir(false)}
        onSuccess={() => { fetchAnuncios(); setModalExcluir(false); setSelectedIds(new Set()); }}
      />
    )}

    {modalCompatibilidade && (
      <ModalCompatibilidade
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        onClose={() => setModalCompatibilidade(false)}
        usuarioId={usuarioId}
      />
    )}

    {modalPosicao && (
      <ModalPosicao
        anunciosSelecionados={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        usuarioId={usuarioId}
        onClose={() => setModalPosicao(false)}
        onSuccess={() => { setModalPosicao(false); setSelectedIds(new Set()); }}
      />
    )}

    {modalRapido && (
      <ModalPreenchimentoRapido
        ads={Array.from(selectedIds).map(id => allKnownAds[id]).filter(Boolean)}
        usuarioId={usuarioId}
        onClose={() => setModalRapido(false)}
        onSuccess={(ids) => { setModalRapido(false); setSelectedIds(new Set()); }}
      />
    )}

    {/* Popup: Cálculo Detalhado do Dif. Preço */}
    {priceDetailPopup && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPriceDetailPopup(null)}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm">Cálculo Detalhado</p>
              <p className="text-blue-100 text-[10px] truncate max-w-[240px]">{priceDetailPopup.ad.titulo}</p>
            </div>
            <button onClick={() => setPriceDetailPopup(null)} className="text-white/80 hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-4">
            {!priceDetailPopup.resultado?.historico ? (
              <p className="text-sm text-red-500 text-center py-2">Sem detalhes disponíveis.</p>
            ) : (
              <div className="space-y-1">
                {priceDetailPopup.resultado.historico.map((item, i) => (
                  <div key={i} className={`flex justify-between items-center text-xs py-1 border-b border-gray-100 last:border-0 ${item.tipo === 'valor' ? 'font-bold text-gray-800' : item.tipo === 'custo_ml' ? 'text-orange-600' : 'text-red-500'}`}>
                    <span>{item.descricao}{item.isPerc ? ` (${item.originalPerc}%)` : ''}</span>
                    <span>{item.tipo === 'valor' ? `R$ ${item.valor.toFixed(2)}` : `+ R$ ${item.valor.toFixed(2)}`}</span>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t-2 border-blue-200 space-y-1">
                  {/* Preço DE (anunciado no ML) */}
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500">Preço DE (anunciado)</span>
                    <span className="text-xs font-bold text-gray-600">R$ {priceDetailPopup.resultado.precoDE?.toFixed(2)}</span>
                  </div>
                  {/* Preço POR (o que o comprador paga, base da comparação) */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-blue-700">
                      Preço POR{priceDetailPopup.resultado.inflar > 0 ? ` (−${priceDetailPopup.resultado.inflar}%)` : ''}
                    </span>
                    <span className="text-sm font-black text-blue-700">R$ {priceDetailPopup.resultado.precoCalculado.toFixed(2)}</span>
                  </div>
                  {/* Preço atual no ML */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-500">Preço Atual (ML)</span>
                    <span className="text-sm font-bold text-gray-600">R$ {priceDetailPopup.ad.preco.toFixed(2)}</span>
                  </div>
                  {/* Diferença */}
                  <div className={`flex justify-between items-center pt-1 border-t border-dashed border-gray-300 ${priceDetailPopup.resultado.diferenca < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    <span className="text-sm font-black">Diferença</span>
                    <span className="text-sm font-black">{priceDetailPopup.resultado.diferenca > 0 ? '+' : ''}{priceDetailPopup.resultado.diferenca.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
