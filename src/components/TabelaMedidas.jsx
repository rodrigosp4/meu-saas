// =====================================================================
// src/components/TabelaMedidas.jsx
// =====================================================================
// Gerenciador de Tabelas de Medidas (Fashion Size Charts) — Mercado Livre
//
// Funcionalidades:
//   1. Verificar domínios ativos que suportam tabela de medidas
//   2. Buscar tabelas existentes (BRAND, STANDARD, SPECIFIC)
//   3. Criar tabela personalizada (SPECIFIC) com linhas dinâmicas
//   4. Visualizar/detalhar tabela com suas linhas
//   5. Adicionar linhas a uma tabela existente
//   6. Renomear tabela
//   7. Solicitar exclusão de tabela
//   8. Associar tabela a anúncios (via fila de ações em massa)
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useContasML } from '../contexts/ContasMLContext';

const API = '/api/tabela-medidas';

// ── Estilos ──────────────────────────────────────────────────────────
const S = {
  container:    { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: '#2c3e50' },
  titulo:       { fontSize: '1.1em', fontWeight: 600, color: '#2c3e50', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #c0392b', display: 'flex', alignItems: 'center', gap: 8 },
  label:        { fontSize: '0.83em', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' },
  input:        { padding: '6px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.85em', outline: 'none', backgroundColor: '#f5f6f7', width: '100%', boxSizing: 'border-box' },
  select:       { padding: '6px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.85em', backgroundColor: '#fff', width: '100%', cursor: 'pointer' },
  btn:          { padding: '6px 14px', fontSize: '0.8em', fontWeight: 500, border: '1px solid #bdc3c7', borderRadius: 4, backgroundColor: '#f8f9fa', color: '#2c3e50', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnPrimary:   { padding: '7px 16px', fontSize: '0.83em', fontWeight: 600, border: 'none', borderRadius: 4, backgroundColor: '#c0392b', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSuccess:   { padding: '7px 16px', fontSize: '0.83em', fontWeight: 600, border: 'none', borderRadius: 4, backgroundColor: '#27ae60', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger:    { padding: '6px 12px', fontSize: '0.78em', fontWeight: 500, border: '1px solid #e74c3c', borderRadius: 4, backgroundColor: '#fff', color: '#e74c3c', cursor: 'pointer' },
  btnSecondary: { padding: '6px 14px', fontSize: '0.8em', fontWeight: 500, border: '1px solid #3498db', borderRadius: 4, backgroundColor: '#fff', color: '#3498db', cursor: 'pointer', whiteSpace: 'nowrap' },
  fieldset:     { border: '1px solid #ddd', borderRadius: 6, padding: 14, margin: 0 },
  legend:       { fontSize: '0.85em', fontWeight: 600, color: '#2c3e50', padding: '0 8px' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' },
  th:           { padding: '8px 10px', backgroundColor: '#f1f3f5', borderBottom: '2px solid #dee2e6', textAlign: 'left', fontWeight: 600, color: '#495057', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 },
  td:           { padding: '6px 10px', borderBottom: '1px solid #eee', color: '#555', verticalAlign: 'top' },
  statusBar:    (type) => ({
    padding: '8px 12px', borderRadius: 4, fontSize: '0.85em', marginBottom: 8,
    backgroundColor: type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : type === 'warning' ? '#fff3cd' : '#e7f3fe',
    color: type === 'error' ? '#721c24' : type === 'success' ? '#155724' : type === 'warning' ? '#856404' : '#0c549c',
    border: `1px solid ${type === 'error' ? '#f5c6cb' : type === 'success' ? '#c3e6cb' : type === 'warning' ? '#ffeeba' : '#d0eaff'}`,
  }),
  overlay:      { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal:        { background: '#fff', borderRadius: 8, padding: 24, minWidth: 480, maxWidth: 680, boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxHeight: '92vh', overflowY: 'auto' },
  badge:        (color) => ({ display: 'inline-block', backgroundColor: color || '#7f8c8d', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: '0.72em', fontWeight: 600 }),
  campoLinha:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  campoLabel:   { width: 110, fontSize: '0.82em', fontWeight: 500, color: '#555', textAlign: 'right', flexShrink: 0 },
};

const TYPE_COLORS = { SPECIFIC: '#8e44ad', BRAND: '#e67e22', STANDARD: '#2980b9' };
const TYPE_LABELS = { SPECIFIC: 'Personalizada', BRAND: 'Marca', STANDARD: 'Padrão ML' };

const DOMAIN_LABELS = {
  // Calçados
  SNEAKERS:              'Tênis / Calçados Esportivos',
  BOOTS_AND_BOOTIES:     'Botas e Botins',
  LOAFERS_AND_OXFORDS:   'Mocassins e Oxfords',
  FOOTBALL_SHOES:        'Chuteiras',
  SANDALS_AND_CLOGS:     'Sandálias e Tamancos',
  HEELS_AND_WEDGES:      'Saltos e Plataformas',
  SLIPPERS:              'Chinelos',
  FLIP_FLOPS:            'Havaianas / Chinelos',
  SNEAKERS_TEST:         'Tênis (Teste)',
  // Roupas superiores
  T_SHIRTS:              'Camisetas',
  SHIRTS:                'Camisas',
  BLOUSES:               'Blusas',
  SWEATSHIRTS_AND_HOODIES: 'Moletom / Blusa de Frio',
  JACKETS_AND_COATS:     'Jaquetas e Casacos',
  DRESSES:               'Vestidos',
  JUMPSUITS:             'Macacões',
  TOPS:                  'Tops',
  BODYSUITS:             'Bodies',
  // Roupas inferiores
  PANTS:                 'Calças',
  PANTS_TEST:            'Calças (Teste)',
  SHORTS:                'Shorts',
  LEGGINGS:              'Leggings',
  SKIRTS:                'Saias',
  // Outras
  PAJAMAS:               'Pijamas',
  LINGERIE:              'Lingerie',
  SWIMWEAR:              'Roupas de Banho',
  SPORTSWEAR:            'Roupas Esportivas',
  UNDERWEAR:             'Roupas Íntimas',
};

const domainLabel = (id) => {
  const key = id?.replace(/^[A-Z]+-/, ''); // remove prefixo de site (MLB-, MLA-, etc)
  return DOMAIN_LABELS[key] ? `${DOMAIN_LABELS[key]} (${key})` : id;
};

// ── Helper: exibe atributos de uma row de forma legível ─────────────
function renderRowAttributes(attributes = []) {
  return attributes.map(attr => {
    const vals = (attr.values || []).map(v => v.name).join(', ');
    return `${attr.name || attr.id}: ${vals}`;
  }).join(' | ');
}

// =====================================================================
// MODAL: CRIAR TABELA
// =====================================================================
function ModalCriarTabela({ contaId, userId, siteId, dominios, initialData, onClose, onSucesso }) {
  const FOOTWEAR_DOMAINS = ['SNEAKERS', 'BOOTS', 'BOOTS_AND_BOOTIES', 'SANDALS', 'SANDALS_AND_CLOGS', 'LOAFERS', 'LOAFERS_AND_OXFORDS', 'FOOTBALL_SHOES', 'FLIP_FLOPS'];
  const isFootwear = (d) => FOOTWEAR_DOMAINS.some(f => d?.toUpperCase().includes(f));

  const defaultDomain = initialData?.domain_id?.replace(`${siteId}-`, '') || dominios[0]?.domain_id?.replace(`${siteId}-`, '') || '';
  const defaultGenderAttr = initialData?.attributes?.find(a => a.id === 'GENDER');
  const defaultGender = defaultGenderAttr
    ? { valueId: defaultGenderAttr.values?.[0]?.id || '', name: defaultGenderAttr.values?.[0]?.name || '' }
    : { valueId: '', name: '' };

  const [nome, setNome] = useState(initialData ? `${initialData.names?.[siteId] || 'Cópia'} (Cópia)` : '');
  const [domainId, setDomainId] = useState(defaultDomain);
  const [genero, setGenero] = useState(defaultGender);
  const [mainAttr, setMainAttr] = useState(() => {
    if (initialData?.main_attribute_id) return initialData.main_attribute_id;
    return isFootwear(defaultDomain) ? 'MANUFACTURER_SIZE' : 'SIZE';
  });
  const [measureType, setMeasureType] = useState(initialData?.measure_type || 'BODY_MEASURE');
  const [linhas, setLinhas] = useState(() => {
    if (initialData?.rows?.length > 0) {
      const mainId = initialData.main_attribute_id;
      return initialData.rows.map(r => {
        const mainVal = r.attributes?.find(a => a.id === mainId);
        const footAttr = r.attributes?.find(a => a.id === 'FOOT_LENGTH');
        const extras = (r.attributes || [])
          .filter(a => a.id !== mainId && a.id !== 'FOOT_LENGTH')
          .map(a => ({ id: a.id, valor: (a.values || []).map(v => v.name).join(', ') }));
        return {
          tamanho: mainVal?.values?.[0]?.name || '',
          medida: footAttr?.values?.[0]?.name?.split(' ')?.[0] || '',
          unidade: footAttr?.values?.[0]?.name?.split(' ')?.[1] || 'cm',
          extras,
        };
      });
    }
    return [{ tamanho: '', medida: '', unidade: 'cm', extras: [] }];
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', type: 'info' });

  // Gêneros disponíveis para MLB — value_id global ML + name em pt-BR
  const GENEROS = [
    { valueId: '',        name: '— selecione —' },
    { valueId: '339666',  name: 'Masculino' },
    { valueId: '339665',  name: 'Feminino' },
    { valueId: '339667',  name: 'Meninos' },
    { valueId: '339668',  name: 'Meninas' },
    { valueId: '110461',  name: 'Unissex' },
  ];

  useEffect(() => {
    if (!initialData) {
      setMainAttr(isFootwear(domainId) ? 'MANUFACTURER_SIZE' : 'SIZE');
      // Ao trocar domínio, adiciona/remove extras das linhas existentes
      setLinhas(prev => prev.map(l => ({
        ...l,
        extras: isFootwear(domainId) ? [] : (l.extras?.length > 0 ? l.extras : CLOTHING_EXTRAS_DEFAULT.map(e => ({ ...e }))),
      })));
    }
  }, [domainId, initialData]);

  // Atributos que a API ML exige em domínios de roupa (TOPS/BOTTOMS/PAJAMAS, etc.)
  const CLOTHING_EXTRAS_DEFAULT = [
    { id: 'FILTRABLE_SIZE',         valor: '' },
    { id: 'BUST_CIRCUMFERENCE_FROM',valor: '' },
    { id: 'HIP_CIRCUMFERENCE_FROM', valor: '' },
  ];
  const defaultExtras = () => isFootwear(domainId) ? [] : CLOTHING_EXTRAS_DEFAULT.map(e => ({ ...e }));

  const addLinha = () => setLinhas(prev => [...prev, { tamanho: '', medida: '', unidade: 'cm', extras: defaultExtras() }]);
  const removeLinha = (i) => setLinhas(prev => prev.filter((_, idx) => idx !== i));
  const updateLinha = (i, field, val) => setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const addExtra = (i) => setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, extras: [...(l.extras || []), { id: '', valor: '' }] } : l));
  const removeExtra = (i, ei) => setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, extras: l.extras.filter((_, j) => j !== ei) } : l));
  const updateExtra = (i, ei, field, val) => setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, extras: l.extras.map((e, j) => j === ei ? { ...e, [field]: val } : e) } : l));

  const handleCriar = async () => {
    if (!nome.trim()) return setStatus({ text: 'Informe um nome para a tabela.', type: 'warning' });
    if (!domainId.trim()) return setStatus({ text: 'Selecione um domínio.', type: 'warning' });
    if (!genero.valueId && !genero.name) return setStatus({ text: 'Selecione um gênero.', type: 'warning' });
    if (linhas.some(l => !l.tamanho.trim())) return setStatus({ text: 'Preencha o tamanho de todas as linhas.', type: 'warning' });
    if (isFootwear(domainId) && linhas.some(l => !l.medida.trim())) return setStatus({ text: 'Para domínios de calçado, o FOOT_LENGTH (comprimento do pé) é obrigatório em todas as linhas.', type: 'warning' });

    setLoading(true);
    setStatus({ text: 'Criando tabela de medidas...', type: 'info' });
    try {
      const fullDomainId = domainId.includes('-') ? domainId.replace(`${siteId}-`, '') : domainId;

      const chart = {
        names: { [siteId]: nome.trim() },
        domain_id: fullDomainId,
        site_id: siteId,
        main_attribute: { attributes: [{ site_id: siteId, id: mainAttr }] },
        attributes: [{ id: 'GENDER', values: [{ id: genero.valueId || undefined, name: genero.name }] }],
        ...(!isFootwear(fullDomainId) && { measure_type: measureType }),
        rows: linhas
          .filter(l => l.tamanho.trim())
          .map(l => {
            const rowAttrs = [{ id: mainAttr, values: [{ name: l.tamanho.trim() }] }];
            if (l.medida.trim() && isFootwear(fullDomainId)) {
              rowAttrs.push({ id: 'FOOT_LENGTH', values: [{ name: `${l.medida.trim()} ${l.unidade}` }] });
            }
            // Atributos extras (para roupas: FILTRABLE_SIZE, BUST_CIRCUMFERENCE_FROM, etc.)
            (l.extras || []).filter(e => e.id.trim() && e.valor.trim()).forEach(e => {
              const attrId = e.id.trim().toUpperCase();
              let val = e.valor.trim();
              // Atributos de medida corporal exigem unidade (ex: "80 cm"). Se o valor for só
              // número, acrescenta " cm" automaticamente para evitar invalid_row_attribute_value.
              const MEDIDAS = ['CIRCUMFERENCE', 'LENGTH', 'WIDTH', 'HEIGHT', 'INSEAM', 'RISE', 'THIGH'];
              const precisaUnidade = MEDIDAS.some(m => attrId.includes(m));
              if (precisaUnidade && /^\d+([.,]\d+)?$/.test(val)) val = `${val} cm`;
              rowAttrs.push({ id: attrId, values: [{ name: val }] });
            });
            return { attributes: rowAttrs };
          }),
      };

      const res = await fetch(`${API}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId, userId, chart }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detalhes = data.detalhes;
        const errosEspecificos = detalhes?.errors?.length
          ? detalhes.errors.map(e => `[${e.code}] ${e.message}`).join('\n')
          : null;
        throw new Error(errosEspecificos || detalhes?.message || data.erro || 'Erro ao criar tabela');
      }
      setStatus({ text: `✅ Tabela criada com sucesso! ID: ${data.id}`, type: 'success' });
      setTimeout(() => { onSucesso(data); onClose(); }, 1500);
    } catch (e) {
      setStatus({ text: `Erro: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, minWidth: 560, maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '2px solid #c0392b', paddingBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05em', color: '#2c3e50' }}>{initialData ? '📄 Duplicar Tabela' : '📐 Criar Tabela de Medidas (SPECIFIC)'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3em', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {status.text && <div style={S.statusBar(status.type)}>{status.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Nome da Tabela *</div>
            <input style={S.input} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Guia de Tamanhos Tênis Masculino" />
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Domínio (categoria) *</div>
            {dominios.length > 0 ? (
              <select style={S.select} value={domainId} onChange={e => setDomainId(e.target.value)}>
                {dominios.map(d => {
                  const rawId = d.domain_id.replace(`${siteId}-`, '');
                  return <option key={rawId} value={rawId}>{domainLabel(rawId)}</option>;
                })}
              </select>
            ) : (
              <input style={S.input} value={domainId} onChange={e => setDomainId(e.target.value)} placeholder="Ex: SNEAKERS, SHIRTS, PANTS..." />
            )}
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Gênero *</div>
            <select style={S.select} value={genero.valueId} onChange={e => {
              const g = GENEROS.find(x => x.valueId === e.target.value);
              setGenero(g || { valueId: '', name: '' });
            }}>
              {GENEROS.map(g => <option key={g.valueId} value={g.valueId}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Atributo Principal (coluna de tamanho)</div>
            <input style={S.input} value={mainAttr} onChange={e => setMainAttr(e.target.value)} placeholder="Ex: SIZE, MANUFACTURER_SIZE, AR_SIZE..." />
          </div>
          {!isFootwear(domainId) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ ...S.label, marginBottom: 4 }}>Tipo de Medida — obrigatório para Roupas (TOPS/BOTTOMS)</div>
              <select style={S.select} value={measureType} onChange={e => setMeasureType(e.target.value)}>
                <option value="BODY_MEASURE">Medida Corporal (BODY_MEASURE)</option>
                <option value="CLOTHING_MEASURE">Medida da Roupa (CLOTHING_MEASURE)</option>
                <option value="MIXED_MEASURE">Mista — corporal + roupa (MIXED_MEASURE)</option>
              </select>
            </div>
          )}
        </div>

        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Linhas da tabela</legend>
          {!isFootwear(domainId) && (
            <div style={{ fontSize: '0.78em', color: '#0c549c', backgroundColor: '#e7f3fe', border: '1px solid #b8d4f5', borderRadius: 4, padding: '8px 12px', marginBottom: 10 }}>
              ℹ️ Para domínios de roupa a API exige atributos adicionais em cada linha. Eles já foram pré-preenchidos abaixo — complete os <strong>valores</strong>:<br/>
              <span style={{ marginLeft: 8 }}>• <strong>FILTRABLE_SIZE</strong> — tamanho no filtro do ML. Use o <strong>nome exato</strong> da lista do domínio (ex: P, M, G, GG). Números como "38" só são válidos se estiverem na lista do domínio.</span><br/>
              <span style={{ marginLeft: 8 }}>• <strong>BUST_CIRCUMFERENCE_FROM</strong> — busto/tórax: digite só o número (ex: <strong>80</strong>) — " cm" é adicionado automaticamente</span><br/>
              <span style={{ marginLeft: 8 }}>• <strong>HIP_CIRCUMFERENCE_FROM</strong> — quadril: digite só o número (ex: <strong>90</strong>) — " cm" é adicionado automaticamente</span>
            </div>
          )}
          {linhas.map((l, i) => (
            <div key={i} style={{ marginBottom: 10, padding: isFootwear(domainId) ? 0 : '8px 10px', border: isFootwear(domainId) ? 'none' : '1px solid #e9ecef', borderRadius: isFootwear(domainId) ? 0 : 5, backgroundColor: isFootwear(domainId) ? 'transparent' : '#fafafa' }}>
              {/* Linha principal */}
              <div style={{ display: 'grid', gridTemplateColumns: `1fr ${isFootwear(domainId) ? '1fr 80px' : ''} 30px`, gap: 6, alignItems: 'center' }}>
                <input style={S.input} value={l.tamanho} onChange={e => updateLinha(i, 'tamanho', e.target.value)} placeholder={isFootwear(domainId) ? 'Ex: 36, 37, 38 BR...' : 'Ex: P, M, G, PP, GG...'} />
                {isFootwear(domainId) && <input style={S.input} value={l.medida} onChange={e => updateLinha(i, 'medida', e.target.value)} placeholder="Ex: 23 (cm do pé)" />}
                {isFootwear(domainId) && (
                  <select style={{ ...S.select, width: '100%' }} value={l.unidade} onChange={e => updateLinha(i, 'unidade', e.target.value)}>
                    <option>cm</option><option>mm</option><option>in</option>
                  </select>
                )}
                <button onClick={() => removeLinha(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '1.1em', padding: '0 4px' }} title="Remover linha">✕</button>
              </div>
              {/* Atributos extras (apenas para roupas) */}
              {!isFootwear(domainId) && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #dee2e6' }}>
                  {(l.extras || []).map((e, ei) => (
                    <div key={ei} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 26px', gap: 5, marginBottom: 4, alignItems: 'center' }}>
                      <select
                        style={{ ...S.select, fontSize: '0.78em' }}
                        value={e.id}
                        onChange={ev => updateExtra(i, ei, 'id', ev.target.value)}
                      >
                        <option value="">-- O que você quer informar? --</option>
                        <option value="FILTRABLE_SIZE">Tamanho Filtro ML (P, M, G, GG — lista do domínio)</option>
                        <option value="BUST_CIRCUMFERENCE_FROM">Busto / Tórax</option>
                        <option value="WAIST_CIRCUMFERENCE_FROM">Cintura</option>
                        <option value="HIP_CIRCUMFERENCE_FROM">Quadril</option>
                        <option value="GARMENT_LENGTH_FROM">Comprimento da Roupa</option>
                        <option value="THIGH_CIRCUMFERENCE_FROM">Coxa</option>
                        <option value="INSEAM_LENGTH_FROM">Costura Interna / Cavalo</option>
                      </select>

                      <input
                        style={{ ...S.input, fontSize: '0.78em' }}
                        value={e.valor}
                        onChange={ev => updateExtra(i, ei, 'valor', ev.target.value)}
                        placeholder={
                          e.id === 'FILTRABLE_SIZE'
                            ? 'Ex: P, M, G, GG (use o nome exato do tamanho)'
                            : 'Só o número — ex: 80 (cm é adicionado auto)'
                        }
                      />
                      <button onClick={() => removeExtra(i, ei)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '1em' }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => addExtra(i)} style={{ ...S.btn, fontSize: '0.73em', padding: '3px 8px', marginTop: 2 }}>+ Atributo</button>
                </div>
              )}
            </div>
          ))}
          <button onClick={addLinha} style={{ ...S.btn, marginTop: 4, fontSize: '0.8em' }}>+ Adicionar linha</button>
        </fieldset>

        <div style={{ marginTop: 16, backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, padding: '8px 12px', fontSize: '0.8em', color: '#856404' }}>
          ℹ️ Este formulário cria tabelas <strong>SPECIFIC</strong> (personalizadas). Para domínios de calçado (SNEAKERS, BOOTS, etc.) o atributo principal deve ser <strong>MANUFACTURER_SIZE</strong> e o FOOT_LENGTH é <strong>obrigatório</strong>. Para roupas (SHIRTS, PANTS), o atributo principal é <strong>SIZE</strong>. O campo é preenchido automaticamente ao digitar o domínio.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={S.btn}>Cancelar</button>
          <button onClick={handleCriar} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Criando...' : '📐 Criar Tabela'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MODAL: ADICIONAR LINHA
// =====================================================================
function ModalAdicionarLinha({ contaId, userId, tabela, onClose, onSucesso }) {
  const [atributos, setAtributos] = useState([{ id: '', valor: '' }]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', type: 'info' });

  const addAttr = () => setAtributos(prev => [...prev, { id: '', valor: '' }]);
  const removeAttr = (i) => setAtributos(prev => prev.filter((_, idx) => idx !== i));
  const updateAttr = (i, field, val) => setAtributos(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  // Pré-preenche com o main_attribute da tabela
  useEffect(() => {
    if (tabela?.main_attribute_id) {
      setAtributos([{ id: tabela.main_attribute_id, valor: '' }]);
    }
  }, [tabela]);

  const handleSalvar = async () => {
    const validos = atributos.filter(a => a.id.trim() && a.valor.trim());
    if (validos.length === 0) return setStatus({ text: 'Preencha pelo menos um atributo com ID e valor.', type: 'warning' });

    setLoading(true);
    setStatus({ text: 'Adicionando linha...', type: 'info' });
    try {
      const row = {
        attributes: validos.map(a => ({
          id: a.id.trim().toUpperCase(),
          values: [{ name: a.valor.trim() }],
        })),
      };

      const res = await fetch(`${API}/${tabela.id}/linhas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId, userId, row }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalhes?.message || data.detalhes?.errors?.[0]?.message || data.erro || 'Erro ao adicionar linha');
      setStatus({ text: '✅ Linha adicionada com sucesso!', type: 'success' });
      setTimeout(() => { onSucesso(); onClose(); }, 1200);
    } catch (e) {
      setStatus({ text: `Erro: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '2px solid #27ae60', paddingBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50' }}>➕ Adicionar Linha — {tabela?.id}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3em', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {status.text && <div style={S.statusBar(status.type)}>{status.text}</div>}

        <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 12 }}>
          Main Attribute: <strong>{tabela?.main_attribute_id}</strong>
        </div>

        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Atributos da nova linha</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px', gap: 6, marginBottom: 6, fontSize: '0.78em', fontWeight: 600, color: '#888', padding: '0 4px' }}>
            <span>ID do Atributo (ex: SIZE, FOOT_LENGTH)</span><span>Valor (ex: 38 BR, 24 cm)</span><span></span>
          </div>
          {atributos.map((a, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input style={S.input} value={a.id} onChange={e => updateAttr(i, 'id', e.target.value.toUpperCase())} placeholder="Ex: SIZE" />
              <input style={S.input} value={a.valor} onChange={e => updateAttr(i, 'valor', e.target.value)} placeholder="Ex: 38 BR" />
              <button onClick={() => removeAttr(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '1.1em' }}>✕</button>
            </div>
          ))}
          <button onClick={addAttr} style={{ ...S.btn, marginTop: 6, fontSize: '0.8em' }}>+ Atributo</button>
        </fieldset>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={S.btn}>Cancelar</button>
          <button onClick={handleSalvar} disabled={loading} style={{ ...S.btnSuccess, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Salvando...' : '✅ Adicionar Linha'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MODAL: ASSOCIAR TABELA A ANÚNCIOS
// =====================================================================
function ModalAssociar({ contaId, userId, tabela, onClose, usuarioId }) {
  const [itemIds, setItemIds] = useState('');
  const [rowId, setRowId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', type: 'info' });

  const rows = tabela?.rows || [];

  const handleAplicar = async () => {
    const ids = itemIds.split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (ids.length === 0) return setStatus({ text: 'Informe pelo menos um ID de anúncio.', type: 'warning' });

    setLoading(true);
    setStatus({ text: 'Enviando para a fila...', type: 'info' });
    try {
      // Monta atributos: SIZE_GRID_ID + opcionalmente SIZE_GRID_ROW_ID
      const attributes = [{ id: 'SIZE_GRID_ID', value_name: String(tabela.id) }];
      if (rowId) attributes.push({ id: 'SIZE_GRID_ROW_ID', value_name: rowId });

      const items = ids.map(id => ({ id, contaId }));
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items, acao: 'atualizar_atributos', valor: attributes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao enfileirar');
      setStatus({ text: `✅ ${ids.length} anúncio(s) enviados para a fila! Acompanhe em "Gerenciador de Fila".`, type: 'success' });
    } catch (e) {
      setStatus({ text: `Erro: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '2px solid #2980b9', paddingBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50' }}>🔗 Associar Tabela a Anúncios — #{tabela?.id}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3em', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {status.text && <div style={S.statusBar(status.type)}>{status.text}</div>}

        <div style={{ backgroundColor: '#e8f4fd', border: '1px solid #b8d9f0', borderRadius: 4, padding: '10px 12px', fontSize: '0.82em', color: '#1a5276', marginBottom: 14 }}>
          <strong>Tabela:</strong> {tabela?.names?.[Object.keys(tabela?.names || {})[0]] || tabela?.id}<br />
          <strong>Domínio:</strong> {tabela?.domain_id} &nbsp;|&nbsp; <strong>Tipo:</strong> {TYPE_LABELS[tabela?.type] || tabela?.type}<br />
          <strong>Main Attribute:</strong> {tabela?.main_attribute_id}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>IDs dos Anúncios (um por linha ou separados por vírgula) *</div>
          <textarea
            style={{ ...S.input, resize: 'vertical', minHeight: 80, fontFamily: 'monospace' }}
            value={itemIds}
            onChange={e => setItemIds(e.target.value)}
            placeholder={'MLB123456789\nMLB987654321\n...'}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>
            Linha da tabela (SIZE_GRID_ROW_ID) — opcional, para anúncios SEM variações
          </div>
          <select style={S.select} value={rowId} onChange={e => setRowId(e.target.value)}>
            <option value="">— Não definir (apenas SIZE_GRID_ID) —</option>
            {rows.map(row => {
              const label = renderRowAttributes(row.attributes).substring(0, 80);
              return <option key={row.id} value={row.id}>{row.id} — {label}</option>;
            })}
          </select>
          <div style={{ fontSize: '0.77em', color: '#888', marginTop: 4 }}>
            Para anúncios COM variações, o SIZE_GRID_ROW_ID deve ser definido em cada variação individualmente no Gerenciador ML.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={S.btn}>Cancelar</button>
          <button onClick={handleAplicar} disabled={loading} style={{ ...S.btnPrimary, backgroundColor: '#2980b9', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Enviando...' : '🔗 Aplicar em Massa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PAINEL: DETALHE DE UMA TABELA
// =====================================================================
function PainelDetalhe({ contaId, userId, chartId, usuarioId, onVoltar, onRefresh, onDuplicar }) {
  const [tabela, setTabela] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', type: 'info' });
  const [modalAddLinha, setModalAddLinha] = useState(false);
  const [modalAssociar, setModalAssociar] = useState(false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [novoNome, setNovoNome] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setStatus({ text: 'Carregando tabela...', type: 'info' });
    try {
      const res = await fetch(`${API}/${chartId}?contaId=${contaId}&userId=${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao carregar tabela');
      setTabela(data);
      setStatus({ text: '', type: 'info' });
    } catch (e) {
      setStatus({ text: `Erro: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [chartId, contaId, userId]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleRenomear = async () => {
    if (!novoNome.trim()) return;
    try {
      const siteId = tabela?.site_id || 'MLB';
      const res = await fetch(`${API}/${chartId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId, userId, names: { [siteId]: novoNome.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao renomear');
      setEditandoNome(false);
      carregar();
    } catch (e) {
      setStatus({ text: `Erro ao renomear: ${e.message}`, type: 'error' });
    }
  };

  const handleDeletar = async () => {
    if (!window.confirm(`Solicitar exclusão da tabela ${chartId}?\n\nA tabela só será excluída se não estiver vinculada a nenhum anúncio ativo. Verifique o status em ~24h.`)) return;
    try {
      const res = await fetch(`${API}/${chartId}?contaId=${contaId}&userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao deletar');
      setStatus({ text: data.message || '✅ Solicitação de exclusão enviada. Verifique em 24h.', type: 'success' });
      setTimeout(() => { onRefresh(); onVoltar(); }, 2000);
    } catch (e) {
      setStatus({ text: `Erro: ${e.message}`, type: 'error' });
    }
  };

  if (loading && !tabela) return <div style={S.statusBar('info')}>Carregando tabela...</div>;

  const nomePrincipal = tabela ? (tabela.names?.[tabela.site_id] || Object.values(tabela.names || {})[0] || tabela.id) : '';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onVoltar} style={S.btn}>← Voltar</button>
        <div style={{ flex: 1 }}>
          {editandoNome ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...S.input, maxWidth: 360 }} value={novoNome} onChange={e => setNovoNome(e.target.value)} autoFocus />
              <button onClick={handleRenomear} style={S.btnSuccess}>Salvar</button>
              <button onClick={() => setEditandoNome(false)} style={S.btn}>Cancelar</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: '1em' }}>{nomePrincipal}</strong>
              {tabela?.type && <span style={S.badge(TYPE_COLORS[tabela.type])}>{TYPE_LABELS[tabela.type] || tabela.type}</span>}
              <span style={S.badge('#7f8c8d')}>#{tabela?.id}</span>
              {tabela?.type === 'SPECIFIC' && (
                <button onClick={() => { setNovoNome(nomePrincipal); setEditandoNome(true); }} style={{ ...S.btn, fontSize: '0.75em' }}>✏️ Renomear</button>
              )}
              {onDuplicar && tabela?.type === 'SPECIFIC' && (
                <button onClick={() => onDuplicar(tabela)} style={{ ...S.btnSecondary, fontSize: '0.75em' }}>📄 Duplicar</button>
              )}
            </div>
          )}
        </div>
        <button onClick={() => setModalAssociar(true)} style={{ ...S.btnPrimary, backgroundColor: '#2980b9' }}>🔗 Associar a Anúncios</button>
        {tabela?.type === 'SPECIFIC' && (
          <>
            <button onClick={() => setModalAddLinha(true)} style={S.btnSuccess}>+ Linha</button>
            <button onClick={handleDeletar} style={S.btnDanger}>🗑️ Excluir</button>
          </>
        )}
      </div>

      {status.text && <div style={S.statusBar(status.type)}>{status.text}</div>}

      {tabela && (
        <>
          {/* Info geral */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, fontSize: '0.83em', color: '#555' }}>
            <span>🏷️ Domínio: <strong>{tabela.domain_id}</strong></span>
            <span>🌐 Site: <strong>{tabela.site_id}</strong></span>
            <span>📌 Main Attr: <strong>{tabela.main_attribute_id}</strong></span>
            {tabela.secondary_attribute_id && <span>📌 Secondary: <strong>{tabela.secondary_attribute_id}</strong></span>}
          </div>

          {/* Atributos gerais (gênero, marca, etc.) */}
          {(tabela.attributes || []).length > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 14px', backgroundColor: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef' }}>
              <div style={{ fontSize: '0.8em', fontWeight: 600, color: '#888', marginBottom: 6 }}>ATRIBUTOS GERAIS</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.83em' }}>
                {tabela.attributes.map((attr, i) => (
                  <span key={i}><strong>{attr.name || attr.id}:</strong> {(attr.values || []).map(v => v.name).join(', ')}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de linhas — view pivô com colunas dinâmicas */}
          {(() => {
            const colunasSet = new Set();
            (tabela.rows || []).forEach(r => (r.attributes || []).forEach(a => colunasSet.add(a.id)));
            // Coloca main_attribute primeiro
            const colunas = [
              ...(tabela.main_attribute_id && colunasSet.has(tabela.main_attribute_id) ? [tabela.main_attribute_id] : []),
              ...Array.from(colunasSet).filter(c => c !== tabela.main_attribute_id),
            ];
            // Mapa de id → name (primeiro que aparecer)
            const nomeCol = {};
            (tabela.rows || []).forEach(r => (r.attributes || []).forEach(a => { if (!nomeCol[a.id]) nomeCol[a.id] = a.name || a.id; }));

            return (
              <div style={{ overflowX: 'auto', border: '1px solid #dee2e6', borderRadius: 6 }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: 80, color: '#888' }}>#</th>
                      {colunas.map(col => (
                        <th key={col} style={{ ...S.th, color: col === tabela.main_attribute_id ? '#c0392b' : '#495057' }}>
                          {nomeCol[col]}{col === tabela.main_attribute_id ? ' ★' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(tabela.rows || []).length === 0 ? (
                      <tr><td colSpan={colunas.length + 1} style={{ ...S.td, textAlign: 'center', color: '#adb5bd', fontStyle: 'italic', padding: 30 }}>Nenhuma linha cadastrada</td></tr>
                    ) : (
                      (tabela.rows || []).map((row, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.78em', color: '#aaa' }}>
                            {row.id?.split(':')?.[1] || row.id}
                          </td>
                          {colunas.map(col => {
                            const attr = (row.attributes || []).find(a => a.id === col);
                            const val = attr ? (attr.values || []).map(v => v.name).join(', ') : '—';
                            return (
                              <td key={col} style={{ ...S.td, fontWeight: col === tabela.main_attribute_id ? 600 : 400, color: col === tabela.main_attribute_id ? '#2c3e50' : '#555' }}>
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <div style={{ fontSize: '0.78em', color: '#aaa', marginTop: 6 }}>{(tabela.rows || []).length} linha(s)</div>
        </>
      )}

      {modalAddLinha && tabela && (
        <ModalAdicionarLinha
          contaId={contaId}
          userId={userId}
          tabela={tabela}
          onClose={() => setModalAddLinha(false)}
          onSucesso={() => carregar()}
        />
      )}

      {modalAssociar && tabela && (
        <ModalAssociar
          contaId={contaId}
          userId={userId}
          usuarioId={usuarioId}
          tabela={tabela}
          onClose={() => setModalAssociar(false)}
        />
      )}
    </div>
  );
}

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export default function TabelaMedidas({ usuarioId }) {
  const { contas } = useContasML();

  // ── Estados principais ─────────────────────────────────────────────
  const [contaId, setContaId] = useState('');
  const [siteId] = useState('MLB');
  const [dominiosAtivos, setDominiosAtivos] = useState([]);
  const [domainId, setDomainId] = useState('');
  const [generoFiltro, setGeneroFiltro] = useState('');
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [tabelas, setTabelas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: 'info' });
  const [chartIdSelecionado, setChartIdSelecionado] = useState(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [dominiosCarregados, setDominiosCarregados] = useState(false);
  const [tabelaParaDuplicar, setTabelaParaDuplicar] = useState(null);
  const [modalDuplicar, setModalDuplicar] = useState(false);
  const [buscaIdDireto, setBuscaIdDireto] = useState('');

  const userId = usuarioId;
  const conta = contas.find(c => c.id === contaId);

  // ── Carrega domínios ativos ao trocar conta ────────────────────────
  useEffect(() => {
    if (!contaId || !userId) return;
    setDominiosAtivos([]);
    setDominiosCarregados(false);
    setTabelas([]);
    setDomainId('');
    const load = async () => {
      try {
        const res = await fetch(`${API}/dominios-ativos?contaId=${contaId}&userId=${userId}&siteId=${siteId}`);
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 404) {
            setDominiosAtivos([]);
            setStatusMsg({ text: 'Nenhum domínio de moda ativo para esta conta/site.', type: 'warning' });
          } else {
            throw new Error(data.erro || 'Erro ao buscar domínios');
          }
        } else {
          setDominiosAtivos(data.domains || []);
          if ((data.domains || []).length > 0) setDomainId((data.domains[0].domain_id || '').replace(`${siteId}-`, ''));
          setStatusMsg({ text: '', type: 'info' });
        }
      } catch (e) {
        setStatusMsg({ text: `Erro ao carregar domínios: ${e.message}`, type: 'error' });
      } finally {
        setDominiosCarregados(true);
      }
    };
    load();
  }, [contaId, userId, siteId]);

  // Auto-seleciona a primeira conta
  useEffect(() => {
    if (contas.length > 0 && !contaId) setContaId(contas[0].id);
  }, [contas, contaId]);

  const handleBuscar = async () => {
    if (!contaId || !domainId.trim()) return setStatusMsg({ text: 'Selecione uma conta e um domínio.', type: 'warning' });

    setLoading(true);
    setTabelas([]);
    setStatusMsg({ text: 'Buscando tabelas...', type: 'info' });
    try {
      const attributes = [];
      if (generoFiltro) attributes.push({ id: 'GENDER', values: [{ name: generoFiltro }] });
      if (marcaFiltro) attributes.push({ id: 'BRAND', values: [{ name: marcaFiltro }] });

      const rawDomainId = domainId.replace(`${siteId}-`, '');

      const body = { contaId, userId, siteId, domainId: rawDomainId, attributes, limit: 100 };
      if (tipoFiltro) body.type = tipoFiltro;

      const res = await fetch(`${API}/buscar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const mlMessage = data.detalhes?.errors?.[0]?.message || data.detalhes?.message;
        const errMsg = mlMessage ? `ML: ${mlMessage}` : data.erro || 'Erro na busca';
        throw new Error(errMsg);
      }
      setTabelas(data.charts || []);
      setStatusMsg({ text: `${(data.charts || []).length} tabela(s) encontrada(s). Total: ${data.paging?.total || 0}`, type: (data.charts || []).length > 0 ? 'success' : 'warning' });
    } catch (e) {
      // Se a API pediu o GENDER, exibe uma mensagem mais amigável
      if (e.message.includes('GENDER')) {
        setStatusMsg({ text: 'O Mercado Livre exige que você selecione o filtro "Gênero" para buscar as tabelas deste domínio.', type: 'error' });
      } else {
        setStatusMsg({ text: `Erro: ${e.message}`, type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  };

  // Se um chart está selecionado, mostra o painel de detalhe
  if (chartIdSelecionado) {
    return (
      <div style={S.container}>
        <div style={S.titulo}>📐 Tabela de Medidas — Detalhes</div>
        <PainelDetalhe
          contaId={contaId}
          userId={userId}
          usuarioId={usuarioId}
          chartId={chartIdSelecionado}
          onVoltar={() => setChartIdSelecionado(null)}
          onRefresh={handleBuscar}
          onDuplicar={(tab) => { setTabelaParaDuplicar(tab); setModalDuplicar(true); }}
        />
        {modalDuplicar && tabelaParaDuplicar && (
          <ModalCriarTabela
            contaId={contaId}
            userId={userId}
            siteId={siteId}
            dominios={dominiosAtivos}
            initialData={tabelaParaDuplicar}
            onClose={() => { setModalDuplicar(false); setTabelaParaDuplicar(null); }}
            onSucesso={(novaTabela) => {
              setModalDuplicar(false);
              setTabelaParaDuplicar(null);
              handleBuscar();
              setChartIdSelecionado(novaTabela.id);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.titulo}>📐 Tabela de Medidas (Fashion)</div>

      {/* Conta */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={S.label}>Conta ML:</span>
          <select style={{ ...S.select, minWidth: 200, width: 'auto' }} value={contaId} onChange={e => setContaId(e.target.value)}>
            {contas.length === 0 && <option value="">Nenhuma conta conectada</option>}
            {contas.map(c => <option key={c.id} value={c.id}>{c.nickname || c.id}</option>)}
          </select>
        </div>
        {conta && <span style={{ fontSize: '0.8em', color: '#888' }}>ID: {conta.id}</span>}
      </div>

      {/* Aviso educativo */}
      <div style={{ backgroundColor: '#fdf8e1', border: '1px solid #f9d923', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: '0.83em', color: '#5d4037' }}>
        <strong>ℹ️ Sobre Tabelas de Medidas:</strong> Este recurso é para categorias de <strong>moda</strong> (calçados, roupas, etc.). Domínios de moda que aceitam tabela de medidas são listados automaticamente ao selecionar a conta. Tabelas <strong>SPECIFIC</strong> são criadas pelo vendedor. <strong>BRAND</strong> e <strong>STANDARD</strong> são fornecidas pelo ML/marcas.
      </div>

      {/* Painel de busca */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, padding: '14px', backgroundColor: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef', alignItems: 'flex-end' }}>
        {/* Domínio */}
        <div style={{ minWidth: 200 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Domínio *</div>
          {dominiosAtivos.length > 0 ? (
            <select style={S.select} value={domainId} onChange={e => setDomainId(e.target.value)}>
              {dominiosAtivos.map(d => {
                const rawId = d.domain_id.replace(`${siteId}-`, '');
                return <option key={d.domain_id} value={rawId}>{domainLabel(rawId)}</option>;
              })}
            </select>
          ) : (
            <input style={S.input} value={domainId} onChange={e => setDomainId(e.target.value)} placeholder="Ex: SNEAKERS, SHIRTS, PANTS..." />
          )}
        </div>

        {/* Gênero */}
        <div style={{ minWidth: 140 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Gênero</div>
          <select style={S.select} value={generoFiltro} onChange={e => setGeneroFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option>Homem</option><option>Mulher</option><option>Unissex</option>
            <option>Meninas</option><option>Meninos</option><option>Bebê</option>
          </select>
        </div>

        {/* Tipo */}
        <div style={{ minWidth: 160 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Tipo</div>
          <select style={S.select} value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="SPECIFIC">Personalizada (SPECIFIC)</option>
            <option value="BRAND">Marca (BRAND)</option>
            <option value="STANDARD">Padrão ML (STANDARD)</option>
          </select>
        </div>

        {/* Marca (para filtro BRAND) */}
        <div style={{ minWidth: 160 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Marca (filtro)</div>
          <input style={S.input} value={marcaFiltro} onChange={e => setMarcaFiltro(e.target.value)} placeholder="Ex: Nike, Adidas..." />
        </div>

        <button onClick={handleBuscar} disabled={loading || !contaId} style={{ ...S.btnPrimary, height: 34 }}>
          {loading ? 'Buscando...' : '🔍 Buscar'}
        </button>

        {/* Busca direta por ID */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Ir direto por ID</div>
            <input
              style={{ ...S.input, width: 130 }}
              value={buscaIdDireto}
              onChange={e => setBuscaIdDireto(e.target.value)}
              placeholder="Ex: 526618"
              onKeyDown={e => { if (e.key === 'Enter' && buscaIdDireto.trim()) { setChartIdSelecionado(buscaIdDireto.trim()); setBuscaIdDireto(''); } }}
            />
          </div>
          <button
            onClick={() => { if (buscaIdDireto.trim()) { setChartIdSelecionado(buscaIdDireto.trim()); setBuscaIdDireto(''); } }}
            disabled={!buscaIdDireto.trim() || !contaId}
            style={{ ...S.btnSecondary, height: 34 }}
          >→</button>
        </div>

        <button onClick={() => setModalCriar(true)} disabled={!contaId || !dominiosCarregados} style={{ ...S.btnSuccess, height: 34 }}>
          ＋ Criar Tabela
        </button>
      </div>

      {statusMsg.text && <div style={S.statusBar(statusMsg.type)}>{statusMsg.text}</div>}

      {/* Lista de tabelas */}
      {tabelas.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #dee2e6', borderRadius: 6 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>ID</th>
                <th style={S.th}>Nome</th>
                <th style={S.th}>Tipo</th>
                <th style={S.th}>Main Attr</th>
                <th style={S.th}>Atributos Gerais</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {tabelas.map((t, i) => {
                const nome = t.names ? (t.names[siteId] || Object.values(t.names)[0] || '—') : '—';
                const attrsGerais = (t.attributes || []).map(a => `${a.name || a.id}: ${(a.values || []).map(v => v.name).join(', ')}`).join(' | ') || '—';
                return (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                    onClick={() => setChartIdSelecionado(t.id)}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.8em', color: '#666' }}>{t.id}</td>
                    <td style={S.td}>{nome}</td>
                    <td style={S.td}>
                      <span style={S.badge(TYPE_COLORS[t.type])}>{TYPE_LABELS[t.type] || t.type}</span>
                    </td>
                    <td style={{ ...S.td, fontSize: '0.82em', color: '#3498db', fontWeight: 600 }}>{t.main_attribute_id}</td>
                    <td style={{ ...S.td, fontSize: '0.8em', color: '#777', maxWidth: 280 }}>{attrsGerais}</td>
                    <td style={S.td}>
                      <button onClick={e => { e.stopPropagation(); setChartIdSelecionado(t.id); }} style={{ ...S.btnSecondary, fontSize: '0.75em', padding: '3px 10px' }}>
                        Ver detalhes →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tabelas.length === 0 && dominiosCarregados && !loading && !statusMsg.text && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#adb5bd', fontSize: '0.9em' }}>
          Selecione um domínio e clique em <strong>Buscar</strong> para ver as tabelas de medidas disponíveis.
        </div>
      )}

      {/* Modal: Criar */}
      {modalCriar && (
        <ModalCriarTabela
          contaId={contaId}
          userId={userId}
          siteId={siteId}
          dominios={dominiosAtivos}
          onClose={() => setModalCriar(false)}
          onSucesso={(novaTabela) => {
            handleBuscar();
            setChartIdSelecionado(novaTabela.id);
          }}
        />
      )}
    </div>
  );
}
