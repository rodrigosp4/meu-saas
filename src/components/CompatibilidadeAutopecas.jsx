// =====================================================================
// src/components/CompatibilidadeAutopecas.jsx
// =====================================================================
// Componente TOTALMENTE FUNCIONAL para gerenciar compatibilidades
// de autopeças (fitment) no Mercado Livre.
//
// Funcionalidades implementadas:
//   1. Carregar compatibilidades existentes de um item ML
//   2. Campos de veículo em cascata (Marca → Modelo → Ano → Motor...)
//   3. Busca de veículos no catálogo ML
//   4. Adicionar/remover veículos na lista de compatibilidades
//   5. Perfis reutilizáveis (salvar/carregar/deletar)
//   6. Aplicar lista de compatibilidades ao item no ML (PUT)
//   7. Definição manual de veículo
// =====================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api/compat';

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export default function CompatibilidadeAutopecas({ usuarioId }) {

  // --- Estado: Conta ML ativa ---
  const [contasML, setContasML] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');

  // --- Estado: Item ---
  const [itemId, setItemId] = useState('');

  // --- Estado: Configuração do domínio ---
  const [domainConfig, setDomainConfig] = useState(null); // { domainId, attributes, attributeNames }

  // --- Estado: Dropdowns em cascata ---
  const [attrValues, setAttrValues] = useState({}); // { BRAND: [{id, name}], MODEL: [...], ... }
  const [attrSelected, setAttrSelected] = useState({}); // { BRAND: {id, name}, MODEL: {id, name}, ... }

  // --- Estado: Resultados da busca ---
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [totalBusca, setTotalBusca] = useState(0);
  const [selecionadosBusca, setSelecionadosBusca] = useState(new Set());

  // --- Estado: Lista de compatibilidades ---
  const [listaCompatibilidades, setListaCompatibilidades] = useState([]);
  const [selecionadosLista, setSelecionadosLista] = useState(new Set());

  // --- Estado: Perfis ---
  const [perfis, setPerfis] = useState([]);
  const [nomePerfil, setNomePerfil] = useState('');
  const [perfilSelecionado, setPerfilSelecionado] = useState('');

  // --- Estado: UI ---
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: 'Selecione uma conta ML e carregue os campos de veículo para começar.', type: 'info' });
  const [camposCarregados, setCamposCarregados] = useState(false);

  // --- Estado: Modal manual ---
  const [showModalManual, setShowModalManual] = useState(false);
  const [manualVehicleId, setManualVehicleId] = useState('');
  const [manualVehicleName, setManualVehicleName] = useState('');
  const [manualVehicleNote, setManualVehicleNote] = useState('');

  // Ref para evitar double-load
  const loadedRef = useRef(false);

  // =================================================================
  // EFEITO: Carregar contas ML do localStorage
  // =================================================================
  useEffect(() => {
    try {
      const salvas = JSON.parse(localStorage.getItem('saas_contas_ml') || '[]');
      setContasML(salvas);
      if (salvas.length > 0 && !contaSelecionada) {
        setContaSelecionada(salvas[0].id);
      }
    } catch (_) {}
  }, []);

  // =================================================================
  // EFEITO: Carregar perfis quando tem usuário
  // =================================================================
  useEffect(() => {
    if (usuarioId) loadPerfis();
  }, [usuarioId]);

  // =================================================================
  // HELPERS
  // =================================================================
  const setStatus = useCallback((text, type = 'info') => {
    setStatusMsg({ text, type });
  }, []);

  const getContaAtiva = useCallback(() => {
    return contasML.find(c => c.id === contaSelecionada);
  }, [contasML, contaSelecionada]);

  // =================================================================
  // 1. CARREGAR CONFIG DO DOMÍNIO + ATRIBUTOS
  // =================================================================
  const handleCarregarCamposVeiculo = async () => {
    if (!contaSelecionada || !usuarioId) {
      setStatus('Selecione uma conta ML primeiro.', 'warning');
      return;
    }

    setCarregando(true);
    setStatus('Carregando campos de veículo via API...', 'info');
    setCamposCarregados(false);
    setAttrValues({});
    setAttrSelected({});
    setResultadosBusca([]);

    try {
      // 1. Buscar config do domínio
      const configRes = await fetch(
        `${API_BASE}/config?contaId=${contaSelecionada}&userId=${usuarioId}`
      );
      if (!configRes.ok) throw new Error('Falha ao buscar config do domínio');
      const config = await configRes.json();
      setDomainConfig(config);

      // 2. Carregar valores do primeiro atributo (Marca)
      if (config.attributes && config.attributes.length > 0) {
        const firstAttr = config.attributes[0];
        const valRes = await fetch(`${API_BASE}/attribute-values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contaId: contaSelecionada,
            userId: usuarioId,
            domainId: config.domainId,
            attributeId: firstAttr,
            knownAttributes: [],
          }),
        });
        if (!valRes.ok) throw new Error('Falha ao buscar valores do atributo');
        const valData = await valRes.json();

        setAttrValues({ [firstAttr]: valData.values || [] });
        setCamposCarregados(true);

        const domainLabel = config.domainId.replace('MLB-', '').replace('MLA-', '').replace(/_/g, ' ');
        setStatus(`Campos carregados para ${domainLabel}. Selecione os filtros e busque veículos.`, 'success');
      }
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 2. CASCATA: Ao selecionar um atributo, carrega o próximo
  // =================================================================
  const handleAttrChange = async (attrId, selectedName) => {
    if (!domainConfig) return;

    const attrs = domainConfig.attributes;
    const currentIndex = attrs.indexOf(attrId);
    if (currentIndex === -1) return;

    // Encontra o id/value do item selecionado
    const currentValues = attrValues[attrId] || [];
    const selectedItem = currentValues.find(v => v.name === selectedName);

    // Atualiza a seleção do atributo atual
    const newSelected = { ...attrSelected };
    if (selectedName && selectedItem) {
      newSelected[attrId] = selectedItem;
    } else {
      delete newSelected[attrId];
    }

    // Limpa seleções e valores de todos os atributos DEPOIS do atual
    const newValues = { ...attrValues };
    for (let i = currentIndex + 1; i < attrs.length; i++) {
      delete newSelected[attrs[i]];
      delete newValues[attrs[i]];
    }

    setAttrSelected(newSelected);
    setAttrValues(newValues);

    // Se selecionou algo e existe próximo atributo, carrega seus valores
    if (selectedName && selectedItem && currentIndex + 1 < attrs.length) {
      const nextAttr = attrs[currentIndex + 1];

      // Monta known_attributes para a API
      const knownAttrs = [];
      for (let i = 0; i <= currentIndex; i++) {
        const a = attrs[i];
        const sel = (a === attrId) ? selectedItem : newSelected[a];
        if (sel) {
          const entry = { id: a };
          if (sel.id) {
            entry.value_id = String(sel.id);
          } else if (['VEHICLE_YEAR', 'YEAR'].includes(a) && sel.name) {
            entry.value_name = sel.name;
          }
          knownAttrs.push(entry);
        }
      }

      try {
        const valRes = await fetch(`${API_BASE}/attribute-values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contaId: contaSelecionada,
            userId: usuarioId,
            domainId: domainConfig.domainId,
            attributeId: nextAttr,
            knownAttributes: knownAttrs,
          }),
        });
        if (valRes.ok) {
          const valData = await valRes.json();
          setAttrValues(prev => ({ ...prev, [nextAttr]: valData.values || [] }));
        }
      } catch (e) {
        console.error('Erro ao carregar valores em cascata:', e);
      }
    }
  };

  // =================================================================
  // 3. BUSCAR VEÍCULOS NO CATÁLOGO ML
  // =================================================================
  const handleBuscarVeiculosML = async () => {
    if (!domainConfig || !contaSelecionada || !usuarioId) {
      setStatus('Carregue os campos de veículo primeiro.', 'warning');
      return;
    }

    // Monta filtros conhecidos
    const knownAttrs = [];
    for (const attrId of domainConfig.attributes) {
      const sel = attrSelected[attrId];
      if (sel) {
        const entry = { id: attrId };
        if (sel.id) {
          entry.value_id = String(sel.id);
        } else if (['VEHICLE_YEAR', 'YEAR'].includes(attrId) && sel.name) {
          entry.value_name = sel.name;
        }
        knownAttrs.push(entry);
      }
    }

    if (knownAttrs.length === 0) {
      setStatus('Selecione pelo menos um filtro (ex: Marca) antes de buscar.', 'warning');
      return;
    }

    setCarregando(true);
    setStatus('Buscando veículos no catálogo ML...', 'info');
    setResultadosBusca([]);
    setSelecionadosBusca(new Set());

    try {
      const res = await fetch(`${API_BASE}/search-vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contaId: contaSelecionada,
          userId: usuarioId,
          domainId: domainConfig.domainId,
          knownAttributes: knownAttrs,
          maxResults: 5000,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || 'Falha na busca');
      }

      const data = await res.json();
      setResultadosBusca(data.results || []);
      setTotalBusca(data.total || 0);
      setStatus(`${(data.results || []).length} veículos encontrados (total: ${data.total || 0}).`, 'success');
    } catch (error) {
      setStatus(`Erro na busca: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 4. CARREGAR COMPATIBILIDADES DE UM ITEM ML
  // =================================================================
  const handleCarregarItemML = async () => {
    const id = itemId.trim();
    if (!id) {
      setStatus('Insira um Item ID válido (ex: MLB1234567890).', 'warning');
      return;
    }
    if (!contaSelecionada || !usuarioId) {
      setStatus('Selecione uma conta ML primeiro.', 'warning');
      return;
    }

    setCarregando(true);
    setStatus(`Buscando compatibilidades do item ${id}...`, 'info');

    try {
      const res = await fetch(`${API_BASE}/load-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId: contaSelecionada, userId: usuarioId, itemId: id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || 'Falha ao carregar compatibilidades');
      }

      const data = await res.json();
      const compats = data.compatibilities || [];
      setListaCompatibilidades(compats);
      setSelecionadosLista(new Set());
      setStatus(`${compats.length} compatibilidades carregadas do item ${id}.`, 'success');
    } catch (error) {
      setStatus(`Erro: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 5. ADICIONAR SELECIONADOS DA BUSCA À LISTA
  // =================================================================
  const handleAdicionarSelecionadosDaBusca = () => {
    if (selecionadosBusca.size === 0) {
      setStatus('Selecione pelo menos um veículo dos resultados.', 'warning');
      return;
    }

    const existingIds = new Set(listaCompatibilidades.map(c => c.catalog_product_id || c.id));
    let addedCount = 0;

    const novosItens = [...listaCompatibilidades];
    for (const idx of selecionadosBusca) {
      const veiculo = resultadosBusca[idx];
      if (!veiculo) continue;
      const vid = veiculo.id;
      if (existingIds.has(vid)) continue;

      novosItens.push({
        catalog_product_id: vid,
        name: veiculo.name,
        note: '',
        restrictions: '',
        attributes: veiculo.attributes || [],
        creation_source: 'DEFAULT',
      });
      existingIds.add(vid);
      addedCount++;
    }

    setListaCompatibilidades(novosItens);
    setSelecionadosBusca(new Set());
    setStatus(`${addedCount} veículo(s) adicionados à lista.`, 'success');
  };

  // =================================================================
  // 6. DEFINIÇÃO MANUAL
  // =================================================================
  const handleAddManualConfirm = () => {
    if (!manualVehicleId.trim() && !manualVehicleName.trim()) {
      setStatus('Preencha pelo menos o ID ou Nome do veículo.', 'warning');
      return;
    }

    const vid = manualVehicleId.trim() || `manual_${Date.now()}`;
    const existingIds = new Set(listaCompatibilidades.map(c => c.catalog_product_id || c.id));

    if (existingIds.has(vid)) {
      setStatus('Este veículo já está na lista.', 'warning');
      return;
    }

    setListaCompatibilidades(prev => [...prev, {
      catalog_product_id: vid,
      name: manualVehicleName.trim() || vid,
      note: manualVehicleNote.trim(),
      restrictions: '',
      creation_source: 'DEFAULT',
    }]);

    setManualVehicleId('');
    setManualVehicleName('');
    setManualVehicleNote('');
    setShowModalManual(false);
    setStatus('Veículo adicionado manualmente à lista.', 'success');
  };

  // =================================================================
  // 7. REMOVER / LIMPAR LISTA
  // =================================================================
  const handleRemoverSelecionadas = () => {
    if (selecionadosLista.size === 0) {
      setStatus('Selecione itens para remover.', 'warning');
      return;
    }
    const novos = listaCompatibilidades.filter((_, idx) => !selecionadosLista.has(idx));
    setListaCompatibilidades(novos);
    setSelecionadosLista(new Set());
    setStatus(`${selecionadosLista.size} item(ns) removido(s) da lista.`, 'info');
  };

  const handleLimparLista = () => {
    if (listaCompatibilidades.length === 0) return;
    if (!window.confirm('Deseja realmente limpar toda a lista local?')) return;
    setListaCompatibilidades([]);
    setSelecionadosLista(new Set());
    setStatus('Lista limpa.', 'info');
  };

  // =================================================================
  // 8. APLICAR LISTA AO ITEM NO ML
  // =================================================================
  const handleAplicarListaML = async () => {
    const id = itemId.trim();
    if (!id) {
      setStatus('Insira o Item ID antes de aplicar.', 'warning');
      return;
    }
    if (!contaSelecionada || !usuarioId) {
      setStatus('Selecione uma conta ML.', 'warning');
      return;
    }

    if (listaCompatibilidades.length === 0) {
      if (!window.confirm(`A lista está vazia. Deseja REMOVER todas as compatibilidades do item ${id}?`)) return;
    } else {
      if (!window.confirm(`Aplicar ${listaCompatibilidades.length} compatibilidades ao item ${id}? Isto SUBSTITUI as existentes.`)) return;
    }

    setCarregando(true);
    setStatus(`Enviando ${listaCompatibilidades.length} compatibilidades para o ML...`, 'info');

    try {
      const res = await fetch(`${API_BASE}/apply-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contaId: contaSelecionada,
          userId: usuarioId,
          itemId: id,
          compatibilities: listaCompatibilidades,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.erro || data.message || 'Falha ao aplicar');
      }

      setStatus(`Sucesso! ${data.message}`, 'success');
    } catch (error) {
      setStatus(`Erro ao aplicar: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  // =================================================================
  // 9. PERFIS: Salvar / Carregar / Deletar
  // =================================================================
  const loadPerfis = async () => {
    try {
      const res = await fetch(`${API_BASE}/perfis?userId=${usuarioId}`);
      if (res.ok) {
        const data = await res.json();
        setPerfis(data);
      }
    } catch (_) {}
  };

  const handleSalvarPerfil = async () => {
    if (!nomePerfil.trim()) {
      setStatus('Digite um nome para o perfil.', 'warning');
      return;
    }
    if (listaCompatibilidades.length === 0) {
      setStatus('A lista está vazia. Adicione veículos antes de salvar.', 'warning');
      return;
    }

    setCarregando(true);
    try {
      const res = await fetch(`${API_BASE}/perfis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuarioId,
          nome: nomePerfil.trim(),
          descricao: '',
          compatibilities: listaCompatibilidades,
        }),
      });
      if (!res.ok) throw new Error('Falha ao salvar perfil');
      const data = await res.json();
      setStatus(`Perfil "${data.nome}" salvo com ${listaCompatibilidades.length} veículos.`, 'success');
      await loadPerfis();
    } catch (error) {
      setStatus(`Erro ao salvar perfil: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  const handleCarregarPerfil = async (perfilId) => {
    const id = perfilId || perfilSelecionado;
    if (!id) {
      setStatus('Selecione um perfil para carregar.', 'warning');
      return;
    }

    setCarregando(true);
    try {
      const res = await fetch(`${API_BASE}/perfis/${id}?userId=${usuarioId}`);
      if (!res.ok) throw new Error('Falha ao carregar perfil');
      const data = await res.json();
      setListaCompatibilidades(data.compatibilities || []);
      setSelecionadosLista(new Set());
      setNomePerfil(data.nome || '');
      setStatus(`Perfil "${data.nome}" carregado com ${(data.compatibilities || []).length} veículos.`, 'success');
    } catch (error) {
      setStatus(`Erro ao carregar perfil: ${error.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  const handleDeletarPerfil = async () => {
    if (!perfilSelecionado) return;
    const perfilInfo = perfis.find(p => p.id === perfilSelecionado);
    if (!window.confirm(`Deletar o perfil "${perfilInfo?.nome || perfilSelecionado}"?`)) return;

    try {
      await fetch(`${API_BASE}/perfis/${perfilSelecionado}?userId=${usuarioId}`, { method: 'DELETE' });
      setPerfilSelecionado('');
      setStatus('Perfil deletado.', 'info');
      await loadPerfis();
    } catch (_) {
      setStatus('Erro ao deletar perfil.', 'error');
    }
  };

  // =================================================================
  // TOGGLE SELEÇÃO (checkbox helpers)
  // =================================================================
  const toggleBuscaSelection = (idx) => {
    setSelecionadosBusca(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAllBusca = () => {
    if (selecionadosBusca.size === resultadosBusca.length) {
      setSelecionadosBusca(new Set());
    } else {
      setSelecionadosBusca(new Set(resultadosBusca.map((_, i) => i)));
    }
  };

  const toggleListaSelection = (idx) => {
    setSelecionadosLista(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAllLista = () => {
    if (selecionadosLista.size === listaCompatibilidades.length) {
      setSelecionadosLista(new Set());
    } else {
      setSelecionadosLista(new Set(listaCompatibilidades.map((_, i) => i)));
    }
  };

  // =================================================================
  // HELPER: Nome de atributo legível
  // =================================================================
  const getAttrDisplayName = (attrId) => {
    if (domainConfig?.attributeNames?.[attrId]) return domainConfig.attributeNames[attrId];
    const map = {
      BRAND: 'Marca', MODEL: 'Modelo', VEHICLE_YEAR: 'Ano',
      ENGINE: 'Motor', TRIM: 'Versão', FUEL_TYPE: 'Combustível',
      SHORT_VERSION: 'Versão Curta', YEAR: 'Ano',
    };
    return map[attrId] || attrId;
  };

  // =================================================================
  // ESTILOS
  // =================================================================
  const S = {
    container: { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: '#2c3e50' },
    titulo: { fontSize: '1.1em', fontWeight: 600, color: '#2c3e50', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #e67e22', display: 'flex', alignItems: 'center', gap: 8 },
    barraSuperior: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap', padding: '10px 0' },
    label: { fontSize: '0.83em', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' },
    input: { padding: '6px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.85em', outline: 'none', transition: 'border-color 0.2s', backgroundColor: '#f5f6f7' },
    btn: { padding: '6px 14px', fontSize: '0.8em', fontWeight: 500, border: '1px solid #bdc3c7', borderRadius: 4, backgroundColor: '#f8f9fa', color: '#2c3e50', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' },
    btnPrimary: { padding: '7px 16px', fontSize: '0.83em', fontWeight: 600, border: 'none', borderRadius: 4, backgroundColor: '#e67e22', color: '#fff', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' },
    btnDanger: { padding: '6px 14px', fontSize: '0.8em', fontWeight: 500, border: '1px solid #e74c3c', borderRadius: 4, backgroundColor: '#fff', color: '#e74c3c', cursor: 'pointer', transition: 'all 0.15s' },
    btnSuccess: { display: 'block', width: '100%', marginTop: 14, padding: '12px 24px', fontSize: '0.95em', fontWeight: 700, border: 'none', borderRadius: 6, backgroundColor: '#27ae60', color: '#fff', cursor: 'pointer', transition: 'background-color 0.2s', textAlign: 'center' },
    select: { padding: '6px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.85em', backgroundColor: '#fff', minWidth: 160, cursor: 'pointer' },
    divider: { width: 1, height: 28, backgroundColor: '#ddd', margin: '0 6px' },
    painelContainer: { display: 'flex', gap: 16, marginTop: 8 },
    painelEsquerdo: { flex: '0 0 440px', display: 'flex', flexDirection: 'column', gap: 12 },
    painelDireito: { flex: 1, display: 'flex', flexDirection: 'column' },
    fieldset: { border: '1px solid #ddd', borderRadius: 6, padding: 14, margin: 0 },
    legend: { fontSize: '0.85em', fontWeight: 600, color: '#2c3e50', padding: '0 8px' },
    campoLinha: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 },
    campoLabel: { width: 90, fontSize: '0.82em', fontWeight: 500, color: '#555', textAlign: 'right', flexShrink: 0 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' },
    th: { padding: '8px 10px', backgroundColor: '#f1f3f5', borderBottom: '2px solid #dee2e6', textAlign: 'left', fontWeight: 600, color: '#495057', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 },
    td: { padding: '6px 10px', borderBottom: '1px solid #eee', color: '#555' },
    tdCheckbox: { padding: '6px 10px', borderBottom: '1px solid #eee', width: 30, textAlign: 'center' },
    emptyRow: { textAlign: 'center', padding: '35px 10px', color: '#adb5bd', fontStyle: 'italic', fontSize: '0.9em' },
    statusBar: (type) => ({
      padding: '8px 12px', borderRadius: 4, fontSize: '0.85em', marginBottom: 8,
      backgroundColor: type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : type === 'warning' ? '#fff3cd' : '#e7f3fe',
      color: type === 'error' ? '#721c24' : type === 'success' ? '#155724' : type === 'warning' ? '#856404' : '#0c549c',
      border: `1px solid ${type === 'error' ? '#f5c6cb' : type === 'success' ? '#c3e6cb' : type === 'warning' ? '#ffeeba' : '#d0eaff'}`,
    }),
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
    modal: { background: '#fff', borderRadius: 8, padding: 24, minWidth: 380, maxWidth: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
    contaSelect: { padding: '5px 10px', border: '1px solid #ccd0d5', borderRadius: 4, fontSize: '0.83em', backgroundColor: '#fff', minWidth: 180 },
    badge: { display: 'inline-block', backgroundColor: '#e67e22', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: '0.75em', fontWeight: 600, marginLeft: 6 },
  };

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <div style={S.container}>

      {/* ===== TÍTULO ===== */}
      <h3 style={S.titulo}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e67e22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
        Gerenciar Compatibilidades de Autopeças (Fitment)
      </h3>

      {/* ===== BARRA SUPERIOR: Conta + Item ID + Perfil ===== */}
      <div style={S.barraSuperior}>
        {/* Seletor de conta ML */}
        <span style={S.label}>Conta ML:</span>
        <select
          value={contaSelecionada}
          onChange={(e) => setContaSelecionada(e.target.value)}
          style={S.contaSelect}
        >
          <option value="">-- Selecione --</option>
          {contasML.map(c => (
            <option key={c.id} value={c.id}>{c.nickname || c.id}</option>
          ))}
        </select>

        <div style={S.divider} />

        {/* Item ID */}
        <span style={S.label}>Item ID (Peça):</span>
        <input
          type="text"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="MLB..."
          style={{ ...S.input, width: 160 }}
          onKeyDown={(e) => e.key === 'Enter' && handleCarregarItemML()}
        />
        <button onClick={handleCarregarItemML} style={S.btn} disabled={carregando}>
          Carregar do Item ML
        </button>

        <div style={S.divider} />

        {/* Perfis */}
        <span style={S.label}>Nome Perfil:</span>
        <input
          type="text"
          value={nomePerfil}
          onChange={(e) => setNomePerfil(e.target.value)}
          style={{ ...S.input, width: 180 }}
          placeholder="meu_perfil"
        />
        <button onClick={handleSalvarPerfil} style={S.btn} disabled={carregando}>
          Salvar como Perfil
        </button>

        <div style={S.divider} />

        <span style={S.label}>Carregar:</span>
        <select
          value={perfilSelecionado}
          onChange={(e) => setPerfilSelecionado(e.target.value)}
          style={{ ...S.select, minWidth: 160 }}
        >
          <option value="">-- Perfis --</option>
          {perfis.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <button onClick={() => handleCarregarPerfil()} style={S.btn} disabled={carregando || !perfilSelecionado}>
          Carregar
        </button>
        <button onClick={handleDeletarPerfil} style={S.btnDanger} disabled={!perfilSelecionado}>
          ✕
        </button>
      </div>

      {/* ===== STATUS BAR ===== */}
      <div style={S.statusBar(statusMsg.type)}>
        {carregando && <span style={{ marginRight: 8 }}>⏳</span>}
        {statusMsg.text}
        {listaCompatibilidades.length > 0 && (
          <span style={S.badge}>{listaCompatibilidades.length} veículos</span>
        )}
      </div>

      {/* ===== PAINÉIS LADO A LADO ===== */}
      <div style={S.painelContainer}>

        {/* ======================== PAINEL ESQUERDO ======================== */}
        <div style={S.painelEsquerdo}>

          {/* -- Passo 1: Definir/Buscar Veículo -- */}
          <fieldset style={S.fieldset}>
            <legend style={S.legend}>Passo 1: Definir/Buscar Veículo</legend>

            {/* Botão carregar campos */}
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={handleCarregarCamposVeiculo}
                style={{ ...S.btnPrimary, width: '100%', padding: '8px 16px' }}
                disabled={carregando || !contaSelecionada}
              >
                {camposCarregados ? '↻ Recarregar Campos de Veículo (API)' : 'Carregar Campos de Veículo (API)'}
              </button>
            </div>

            {/* Dropdowns em cascata */}
            {domainConfig && domainConfig.attributes.map((attrId) => {
              const values = attrValues[attrId] || [];
              const selectedVal = attrSelected[attrId]?.name || '';
              const isDisabled = values.length === 0;

              return (
                <div key={attrId} style={S.campoLinha}>
                  <span style={S.campoLabel}>{getAttrDisplayName(attrId)}:</span>
                  <select
                    value={selectedVal}
                    onChange={(e) => handleAttrChange(attrId, e.target.value)}
                    style={{ ...S.select, flex: 1, opacity: isDisabled ? 0.5 : 1 }}
                    disabled={isDisabled || carregando}
                  >
                    <option value="">-- Selecione --</option>
                    {values.map(v => (
                      <option key={v.id} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}

            {!camposCarregados && (
              <p style={{ fontSize: '0.8em', color: '#adb5bd', textAlign: 'center', margin: '12px 0 4px' }}>
                Clique no botão acima para carregar os filtros de veículo.
              </p>
            )}

            {/* Botões de ação */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={handleBuscarVeiculosML}
                style={{ ...S.btnPrimary, flex: 1 }}
                disabled={carregando || !camposCarregados}
              >
                Buscar Veículos ML
              </button>
              <button
                onClick={() => setShowModalManual(true)}
                style={{ ...S.btn, flex: 1 }}
              >
                Add Manual &gt;&gt;
              </button>
            </div>
          </fieldset>

          {/* -- Resultados da Busca -- */}
          <fieldset style={S.fieldset}>
            <legend style={S.legend}>
              Resultados da Busca
              {resultadosBusca.length > 0 && <span style={S.badge}>{resultadosBusca.length}</span>}
            </legend>

            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>
                      <input
                        type="checkbox"
                        checked={resultadosBusca.length > 0 && selecionadosBusca.size === resultadosBusca.length}
                        onChange={toggleAllBusca}
                        disabled={resultadosBusca.length === 0}
                      />
                    </th>
                    <th style={S.th}>ID Catálogo</th>
                    <th style={S.th}>Nome/Descrição Veículo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosBusca.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={S.emptyRow}>
                        Nenhum resultado. Use os filtros e clique "Buscar Veículos ML".
                      </td>
                    </tr>
                  ) : (
                    resultadosBusca.map((veiculo, idx) => (
                      <tr
                        key={veiculo.id}
                        style={{ backgroundColor: selecionadosBusca.has(idx) ? '#fef9f0' : 'transparent', cursor: 'pointer' }}
                        onClick={() => toggleBuscaSelection(idx)}
                      >
                        <td style={S.tdCheckbox}>
                          <input
                            type="checkbox"
                            checked={selecionadosBusca.has(idx)}
                            onChange={() => toggleBuscaSelection(idx)}
                          />
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.85em' }}>{veiculo.id}</td>
                        <td style={S.td}>{veiculo.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                onClick={handleAdicionarSelecionadosDaBusca}
                style={{ ...S.btnPrimary, width: '100%' }}
                disabled={selecionadosBusca.size === 0}
              >
                Adicionar {selecionadosBusca.size > 0 ? `${selecionadosBusca.size} Selecionado(s)` : 'Selecionados'} à Lista &gt;&gt;
              </button>
            </div>
          </fieldset>
        </div>

        {/* ======================== PAINEL DIREITO ======================== */}
        <div style={S.painelDireito}>
          <fieldset style={{ ...S.fieldset, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <legend style={S.legend}>
              Passo 2: Lista de Compatibilidades para o Item
              {listaCompatibilidades.length > 0 && <span style={S.badge}>{listaCompatibilidades.length}</span>}
            </legend>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4, minHeight: 350 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>
                      <input
                        type="checkbox"
                        checked={listaCompatibilidades.length > 0 && selecionadosLista.size === listaCompatibilidades.length}
                        onChange={toggleAllLista}
                        disabled={listaCompatibilidades.length === 0}
                      />
                    </th>
                    <th style={S.th}>ID/Def Veículo</th>
                    <th style={S.th}>Nome/Desc Veículo</th>
                    <th style={S.th}>Nota</th>
                    <th style={S.th}>Restrições Posição</th>
                  </tr>
                </thead>
                <tbody>
                  {listaCompatibilidades.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={S.emptyRow}>
                        Lista vazia. Adicione veículos pela busca, manualmente ou via perfil.
                      </td>
                    </tr>
                  ) : (
                    listaCompatibilidades.map((compat, idx) => (
                      <tr
                        key={`${compat.catalog_product_id || compat.id}-${idx}`}
                        style={{ backgroundColor: selecionadosLista.has(idx) ? '#fef9f0' : 'transparent', cursor: 'pointer' }}
                        onClick={() => toggleListaSelection(idx)}
                      >
                        <td style={S.tdCheckbox}>
                          <input
                            type="checkbox"
                            checked={selecionadosLista.has(idx)}
                            onChange={() => toggleListaSelection(idx)}
                          />
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.85em' }}>
                          {compat.catalog_product_id || compat.id || '-'}
                        </td>
                        <td style={S.td}>{compat.name || '-'}</td>
                        <td style={S.td}>{compat.note || '-'}</td>
                        <td style={S.td}>
                          {typeof compat.restrictions === 'object'
                            ? JSON.stringify(compat.restrictions)
                            : (compat.restrictions || '-')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Botões de ação da lista */}
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={handleRemoverSelecionadas}
                style={{ ...S.btnDanger, flex: 1 }}
                disabled={selecionadosLista.size === 0}
              >
                Remover {selecionadosLista.size > 0 ? `${selecionadosLista.size} Selecionada(s)` : 'Selecionada(s)'}
              </button>
              <button
                onClick={handleLimparLista}
                style={{ ...S.btn, flex: 1 }}
                disabled={listaCompatibilidades.length === 0}
              >
                Limpar Lista Local
              </button>
            </div>
          </fieldset>
        </div>
      </div>

      {/* ===== BOTÃO FINAL: APLICAR NO ML ===== */}
      <button
        onClick={handleAplicarListaML}
        style={{
          ...S.btnSuccess,
          opacity: (carregando || !itemId.trim()) ? 0.6 : 1,
          cursor: (carregando || !itemId.trim()) ? 'not-allowed' : 'pointer',
        }}
        disabled={carregando || !itemId.trim()}
        onMouseEnter={(e) => { if (!carregando && itemId.trim()) e.currentTarget.style.backgroundColor = '#219a52'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#27ae60'; }}
      >
        {carregando ? '⏳ Enviando...' : `Aplicar Lista (${listaCompatibilidades.length}) ao Item no ML (Substitui Todas Existentes)`}
      </button>

      {/* ===== MODAL: Definição Manual ===== */}
      {showModalManual && (
        <div style={S.overlay} onClick={() => setShowModalManual(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 16px', color: '#2c3e50', fontSize: '1em' }}>Adicionar Veículo Manualmente</h4>

            <div style={{ marginBottom: 12 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>ID do Catálogo (opcional):</label>
              <input
                type="text"
                value={manualVehicleId}
                onChange={(e) => setManualVehicleId(e.target.value)}
                placeholder="Ex: MLA12345-67890"
                style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>Nome/Descrição do Veículo:</label>
              <input
                type="text"
                value={manualVehicleName}
                onChange={(e) => setManualVehicleName(e.target.value)}
                placeholder="Ex: Toyota Corolla 2020 1.8"
                style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ ...S.label, display: 'block', marginBottom: 4 }}>Nota (opcional):</label>
              <input
                type="text"
                value={manualVehicleNote}
                onChange={(e) => setManualVehicleNote(e.target.value)}
                placeholder="Ex: Verificar compatibilidade"
                style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModalManual(false)} style={S.btn}>Cancelar</button>
              <button onClick={handleAddManualConfirm} style={S.btnPrimary}>Adicionar à Lista</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
