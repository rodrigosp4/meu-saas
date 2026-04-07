import React, { useState, useRef, useCallback, useMemo } from 'react';
import { TAG_DISPLAY_MAP } from './GerenciadorAnuncios';
import { useContasML } from '../contexts/ContasMLContext';
import { useAuth } from '../contexts/AuthContext';

const IMAGE_QUALITY_TAGS = ['poor_quality_thumbnail', 'poor_quality_picture', 'picture_downloading_pending'];

// ===== CACHE =====
const CACHE_KEY_OTIMIZADOR = 'otimizador_anuncios_v1';
let _memCacheOtimizador = { anuncios: null, ts: null };

function lerCacheOtimizador() {
  if (_memCacheOtimizador.anuncios && _memCacheOtimizador.ts)
    return { data: _memCacheOtimizador.anuncios, ts: _memCacheOtimizador.ts };
  try {
    const raw = localStorage.getItem(CACHE_KEY_OTIMIZADOR);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    _memCacheOtimizador = { anuncios: data, ts };
    return { data, ts };
  } catch { return null; }
}

function salvarCacheOtimizador(anuncios) {
  const ts = Date.now();
  _memCacheOtimizador = { anuncios, ts };
  try { localStorage.setItem(CACHE_KEY_OTIMIZADOR, JSON.stringify({ data: anuncios, ts })); } catch {}
  return ts;
}

// ===== PREVIEW DE IMAGEM COM VALIDAÇÃO =====
function ImagePreview({ url, label, onValidated }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [dims, setDims] = useState(null);

  const handleLoad = (e) => {
    const w = e.target.naturalWidth;
    const h = e.target.naturalHeight;
    setDims({ w, h });
    const valid = w >= 500 && h >= 500;
    setStatus(valid ? 'ok' : 'error');
    if (onValidated) onValidated(valid, w, h);
  };

  const handleError = () => {
    setStatus('error');
    if (onValidated) onValidated(false, 0, 0);
  };

  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <p className="text-xs text-gray-400">{label || 'Sem imagem'}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" />
        </div>
      )}
      <img
        src={url}
        alt="preview"
        onLoadStart={() => setStatus('loading')}
        onLoad={handleLoad}
        onError={handleError}
        className="max-w-full max-h-full object-contain"
        style={{ display: status === 'loading' ? 'none' : 'block' }}
      />
      {dims && (
        <div className={`absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${status === 'ok' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {dims.w}×{dims.h}px {status === 'error' && dims.w > 0 ? '⚠ muito pequena' : status === 'ok' ? '✓' : '✗'}
        </div>
      )}
      {status === 'error' && dims?.w === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50">
          <p className="text-xs text-red-500 font-semibold text-center px-2">URL inválida ou imagem não carregou</p>
        </div>
      )}
    </div>
  );
}

// ===== COMPONENTE PRINCIPAL =====
export default function OtimizadorImagens({ usuarioId }) {
  const { canUseResource } = useAuth();
  const { contas: contasMLCtx } = useContasML();
  const [anuncios, setAnuncios] = useState(() => lerCacheOtimizador()?.data || []);
  const [cacheTs, setCacheTs] = useState(() => lerCacheOtimizador()?.ts || null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(() => {
    const cache = lerCacheOtimizador();
    return cache ? `Dados em cache de ${new Date(cache.ts).toLocaleString('pt-BR')}.` : '';
  });
  const [selecionado, setSelecionado] = useState(null);

  // Editor state
  const [urlsNovas, setUrlsNovas] = useState(['']);
  const [urlTestandoIdx, setUrlTestandoIdx] = useState(null);
  const [urlsValidas, setUrlsValidas] = useState({});
  const [imagensRemovidas, setImagensRemovidas] = useState(new Set());
  const [modoReplace, setModoReplace] = useState('FIRST'); // FIRST | ALL | APPEND
  const [aplicarTodosSku, setAplicarTodosSku] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // Filtros
  const [filtroSemVendas, setFiltroSemVendas] = useState(true);
  const [filtroThumbRuim, setFiltroThumbRuim] = useState(true);
  const [filtroFotoRuim, setFiltroFotoRuim] = useState(false);
  const [filtroApenasAtivos, setFiltroApenasAtivos] = useState(true);
  const [ocultarCatalogo, setOcultarCatalogo] = useState(true);
  const [filtroApenasComEstoque, setFiltroApenasComEstoque] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTextoDebouncado, setFiltroTextoDebouncado] = useState('');
  const [sortReverse, setSortReverse] = useState(true);
  const [agrupaPorSku, setAgrupaPorSku] = useState(false);
  const [grupoSelecionado, setGrupoSelecionado] = useState(null); // array de ads quando agrupado

  // Aba ativa
  const [abaAtiva, setAbaAtiva] = useState('otimizador'); // 'otimizador' | 'troca'

  // Estados da aba Sugestão de Troca (A/B test)
  const [trocaSku, setTrocaSku] = useState(null);
  const [aplicandoAlvo, setAplicandoAlvo] = useState(null); // adId sendo aplicado
  const [alvosAplicados, setAlvosAplicados] = useState(new Set()); // adIds já aplicados na sessão
  const [trocaImgsPorAlvo, setTrocaImgsPorAlvo] = useState({}); // { adId: string[] }
  const [skusAplicados, setSkusAplicados] = useState(new Set()); // SKUs removidos da lista
  const [focusedAlvo, setFocusedAlvo] = useState(null); // adId com foco para paste global
  const [uploadandoAlvo, setUploadandoAlvo] = useState(null); // adId fazendo upload

  const debounceRef = useRef(null);
  const handleFiltroTexto = (val) => {
    setFiltroTexto(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFiltroTextoDebouncado(val), 250);
  };

  const carregarLista = useCallback(async () => {
    const contas = contasMLCtx;
    if (!contas.length) {
      setStatusMsg('Nenhuma conta ML conectada. Configure em "Configurações".');
      return;
    }
    const contasIds = contas.map(c => c.id).join(',');

    setLoading(true);
    setStatusMsg('Carregando anúncios...');

    try {
      let page = 1;
      const limite = 500;
      let todos = [];
      let total = 1;

      while (todos.length < total) {
        const res = await fetch(`/api/ml/anuncios?contasIds=${contasIds}&limit=${limite}&page=${page}&sortBy=vendas_desc`);
        if (!res.ok) throw new Error('Falha ao carregar anúncios');
        const data = await res.json();
        total = data.total || 0;
        const batch = data.anuncios || [];
        todos = todos.concat(batch);
        if (batch.length < limite) break;
        page++;
        setStatusMsg(`Carregando... ${todos.length}/${total}`);
      }

      // Deduplica por id (paginação com empates em vendas pode repetir itens)
      const seen = new Set();
      const todosSemDuplicatas = todos.filter(ad => {
        if (seen.has(ad.id)) return false;
        seen.add(ad.id);
        return true;
      });
      setAnuncios(todosSemDuplicatas);
      const ts = salvarCacheOtimizador(todosSemDuplicatas);
      setCacheTs(ts);
      setStatusMsg(`Dados em cache de ${new Date(ts).toLocaleString('pt-BR')}.`);
    } catch (e) {
      setStatusMsg(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [contasMLCtx]);

  const listaFiltrada = useMemo(() => {
    const normalize = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const termos = filtroTextoDebouncado ? normalize(filtroTextoDebouncado).split(/\s+/).filter(Boolean) : [];

    return anuncios
      .filter(ad => {
        if (filtroApenasAtivos && ad.status !== 'active') return false;

        const tags = [ad.tagPrincipal, ...(ad.dadosML?.tags || [])].filter(Boolean);
        const hasThumbRuim = tags.includes('poor_quality_thumbnail');
        const hasFotoRuim = tags.includes('poor_quality_picture');

        if (filtroThumbRuim || filtroFotoRuim) {
          if (filtroThumbRuim && !filtroFotoRuim && !hasThumbRuim) return false;
          if (filtroFotoRuim && !filtroThumbRuim && !hasFotoRuim) return false;
          if (filtroThumbRuim && filtroFotoRuim && !hasThumbRuim && !hasFotoRuim) return false;
        }

        if (filtroSemVendas && Number(ad.vendas || 0) > 0) return false;
        if (ocultarCatalogo && ad.dadosML?.catalog_product_id) return false;
        if (filtroApenasComEstoque && !(ad.estoque > 0)) return false;

        if (termos.length > 0) {
          const haystack = normalize(`${ad.sku || ''} ${ad.id || ''} ${ad.titulo || ''}`);
          if (termos.some(t => !haystack.includes(t))) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const va = Number(a.vendas || 0), vb = Number(b.vendas || 0);
        return sortReverse ? vb - va : va - vb;
      });
  }, [anuncios, filtroApenasAtivos, filtroThumbRuim, filtroFotoRuim, filtroSemVendas, filtroTextoDebouncado, sortReverse, ocultarCatalogo, filtroApenasComEstoque]);

  // Agrupamento por SKU — apenas ads COM sku real são agrupados
  const { listaAgrupada, semSkuAds } = useMemo(() => {
    if (!agrupaPorSku) return { listaAgrupada: null, semSkuAds: [] };
    const groups = {};
    const semSku = [];
    listaFiltrada.forEach(ad => {
      if (!ad.sku) { semSku.push(ad); return; }
      if (!groups[ad.sku]) {
        groups[ad.sku] = { sku: ad.sku, ads: [], titulo: ad.titulo, thumbnail: ad.thumbnail, totalVendas: 0 };
      }
      groups[ad.sku].ads.push(ad);
      groups[ad.sku].totalVendas += Number(ad.vendas || 0);
    });
    return {
      listaAgrupada: Object.values(groups).sort((a, b) => b.totalVendas - a.totalVendas),
      semSkuAds: semSku,
    };
  }, [agrupaPorSku, listaFiltrada]);

  // Sugestões de troca: SKUs com pelo menos 1 anúncio com vendas e pelo menos 1 ativo sem vendas
  const sugestoesTroca = useMemo(() => {
    if (anuncios.length === 0) return [];
    const groups = {};
    anuncios.forEach(ad => {
      if (!ad.sku) return;
      if (!groups[ad.sku]) groups[ad.sku] = { sku: ad.sku, ads: [] };
      groups[ad.sku].ads.push(ad);
    });
    const result = [];
    Object.values(groups).forEach(g => {
      if (skusAplicados.has(g.sku)) return;
      const comVendas = g.ads
        .filter(ad => Number(ad.vendas || 0) > 0)
        .sort((a, b) => Number(b.vendas || 0) - Number(a.vendas || 0));
      const semVendas = g.ads.filter(ad => Number(ad.vendas || 0) === 0 && ad.status === 'active' && !ad.dadosML?.catalog_product_id);
      if (comVendas.length > 0 && semVendas.length > 0) {
        result.push({
          sku: g.sku,
          titulo: comVendas[0].titulo,
          doador: comVendas[0],
          targets: semVendas,
          maxVendas: Number(comVendas[0].vendas || 0),
        });
      }
    });
    return result.sort((a, b) => b.maxVendas - a.maxVendas);
  }, [anuncios, skusAplicados]);

  const selecionarItem = (ad) => {
    setSelecionado(ad);
    setGrupoSelecionado(null);
    setUrlsNovas(['']);
    setUrlsValidas({});
    setImagensRemovidas(new Set());
  };

  const selecionarGrupo = (group) => {
    setSelecionado(group.ads[0]);
    setGrupoSelecionado(group.ads);
    setUrlsNovas(['']);
    setUrlsValidas({});
    setImagensRemovidas(new Set());
  };

  const handleUrlChange = (idx, val) => {
    setUrlsNovas(prev => { const n = [...prev]; n[idx] = val; return n; });
    setUrlsValidas(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };

  const addUrl = () => {
    if (urlsNovas.length >= 12) return;
    setUrlsNovas(prev => [...prev, '']);
  };

  const removeUrl = (idx) => {
    setUrlsNovas(prev => prev.filter((_, i) => i !== idx));
    setUrlsValidas(prev => {
      const n = {};
      Object.entries(prev).forEach(([k, v]) => { if (Number(k) !== idx) n[Number(k) > idx ? Number(k) - 1 : k] = v; });
      return n;
    });
  };

  const urlsParaEnviar = urlsNovas.filter(u => u.trim().startsWith('http'));
  const primeiraUrlValida = urlsValidas[0] === true;

  // ===== UPLOAD IMGUR =====
  const [uploadando, setUploadando] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
      // Insere a URL no primeiro campo vazio ou adiciona novo
      setUrlsNovas(prev => {
        const idx = prev.findIndex(u => !u.trim());
        if (idx >= 0) { const n = [...prev]; n[idx] = data.url; return n; }
        if (prev.length < 12) return [...prev, data.url];
        return prev;
      });
    } catch (e) {
      alert(`Erro ao enviar para o Imgur: ${e.message}`);
    } finally {
      setUploadando(false);
    }
  }, [usuarioId]);

  const handlePasteZone = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      uploadParaImgur(imgItem.getAsFile());
    }
  };

  const handleDropZone = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    files.forEach(uploadParaImgur);
  };

  // Captura Ctrl+V globalmente quando o editor está aberto
  React.useEffect(() => {
    if (!selecionado) return;
    const onGlobalPaste = (e) => {
      // Não intercepta se o foco está num input/textarea de texto
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) {
        e.preventDefault();
        uploadParaImgur(imgItem.getAsFile());
      }
    };
    window.addEventListener('paste', onGlobalPaste);
    return () => window.removeEventListener('paste', onGlobalPaste);
  }, [selecionado, uploadParaImgur]);

  const aplicarImagens = async (autoNext = false) => {
    if (!selecionado || (urlsParaEnviar.length === 0 && imagensRemovidas.size === 0)) return;

    let itemsParaAtualizar = [];

    if (grupoSelecionado) {
      // Modo agrupado: aplica em todos os anúncios do grupo
      itemsParaAtualizar = grupoSelecionado.map(ad => ({ id: ad.id, contaId: ad.contaId }));
    } else if (aplicarTodosSku && selecionado.sku) {
      itemsParaAtualizar = anuncios
        .filter(ad => ad.sku === selecionado.sku && ad.status === 'active')
        .map(ad => ({ id: ad.id, contaId: ad.contaId }));
    } else {
      itemsParaAtualizar = [{ id: selecionado.id, contaId: selecionado.contaId }];
    }

    if (itemsParaAtualizar.length === 0) {
      alert('Nenhum anúncio elegível para atualização.');
      return;
    }

    let pictures;
    let modoReplaceEfetivo = modoReplace;
    if (imagensRemovidas.size > 0) {
      const picsAtuais = selecionado.dadosML?.pictures?.length
        ? selecionado.dadosML.pictures
        : selecionado.thumbnail ? [{ source: selecionado.thumbnail }] : [];
      const picsRestantes = picsAtuais
        .filter((_, i) => !imagensRemovidas.has(i))
        .map(p => p.id ? { id: p.id } : { source: p.secure_url || p.url || p.source });
      pictures = [...urlsParaEnviar.map(u => ({ source: u })), ...picsRestantes].slice(0, 12);
      modoReplaceEfetivo = 'ALL';
    } else {
      pictures = urlsParaEnviar.slice(0, 12).map(u => ({ source: u }));
    }
    setEnviando(true);

    try {
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items: itemsParaAtualizar, acao: 'atualizar_imagens', valor: pictures, modoReplace: modoReplaceEfetivo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');

      alert(`✅ ${pictures.length} imagem(ns) enviada(s) para ${itemsParaAtualizar.length} anúncio(s)!\nAcompanhe na aba "Gerenciador de Fila".`);

      if (autoNext) {
        const idsAtualizados = new Set(itemsParaAtualizar.map(i => i.id));
        setAnuncios(prev => prev.filter(ad => !idsAtualizados.has(ad.id)));

        if (agrupaPorSku && listaAgrupada) {
          const idx = listaAgrupada.findIndex(g => g.ads[0]?.id === selecionado.id);
          const proximoGrupo = listaAgrupada[idx + 1] || listaAgrupada[idx - 1] || null;
          if (proximoGrupo) selecionarGrupo(proximoGrupo);
          else { setSelecionado(null); setGrupoSelecionado(null); }
        } else {
          const idx = listaFiltrada.findIndex(ad => ad.id === selecionado.id);
          const proximo = listaFiltrada[idx + 1] || listaFiltrada[idx - 1] || null;
          setSelecionado(proximo);
          setGrupoSelecionado(null);
        }
        setUrlsNovas(['']);
        setUrlsValidas({});
        setImagensRemovidas(new Set());
      }
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

  const ignorarItem = () => {
    if (!selecionado) return;
    const idsIgnorar = grupoSelecionado ? new Set(grupoSelecionado.map(a => a.id)) : new Set([selecionado.id]);
    setAnuncios(prev => prev.filter(ad => !idsIgnorar.has(ad.id)));

    if (agrupaPorSku && listaAgrupada) {
      const idx = listaAgrupada.findIndex(g => g.ads[0]?.id === selecionado.id);
      const proximoGrupo = listaAgrupada[idx + 1] || listaAgrupada[idx - 1] || null;
      if (proximoGrupo) selecionarGrupo(proximoGrupo);
      else { setSelecionado(null); setGrupoSelecionado(null); }
    } else {
      const idx = listaFiltrada.findIndex(ad => ad.id === selecionado.id);
      const proximo = listaFiltrada[idx + 1] || listaFiltrada[idx - 1] || null;
      setSelecionado(proximo);
      setGrupoSelecionado(null);
    }
    setUrlsNovas(['']);
    setUrlsValidas({});
  };

  const aplicarImagemAlvo = async (alvo, urls) => {
    const pics = urls.filter(u => u.trim().startsWith('http')).map(u => ({ source: u.trim() }));
    if (pics.length === 0) { alert('Adicione pelo menos uma URL de imagem válida.'); return; }
    setAplicandoAlvo(alvo.id);
    try {
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items: [{ id: alvo.id, contaId: alvo.contaId }], acao: 'atualizar_imagens', valor: pics, modoReplace: 'FIRST' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
      setAlvosAplicados(prev => new Set([...prev, alvo.id]));
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setAplicandoAlvo(null);
    }
  };

  const getUrlsAlvo = (adId) => trocaImgsPorAlvo[adId] || [''];
  const setUrlsAlvo = (adId, urls) => setTrocaImgsPorAlvo(prev => ({ ...prev, [adId]: urls }));

  const urlsDoador = (doador) => doador?.dadosML?.pictures?.length
    ? doador.dadosML.pictures.map(p => p.secure_url || p.url || p.source).filter(Boolean)
    : doador?.thumbnail ? [doador.thumbnail] : [];

  const uploadParaImgurAlvo = useCallback(async (adId, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadandoAlvo(adId);
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
      setTrocaImgsPorAlvo(prev => {
        const urls = prev[adId] || [''];
        const idx = urls.findIndex(u => !u.trim());
        if (idx >= 0) { const n = [...urls]; n[idx] = data.url; return { ...prev, [adId]: n }; }
        if (urls.length < 12) return { ...prev, [adId]: [...urls, data.url] };
        return prev;
      });
    } catch (e) {
      alert(`Erro ao enviar para o Imgur: ${e.message}`);
    } finally {
      setUploadandoAlvo(null);
    }
  }, [usuarioId]);

  // Paste global para a aba troca — envia para o card com foco
  React.useEffect(() => {
    if (abaAtiva !== 'troca' || !focusedAlvo) return;
    const onPaste = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) { e.preventDefault(); uploadParaImgurAlvo(focusedAlvo, imgItem.getAsFile()); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [abaAtiva, focusedAlvo, uploadParaImgurAlvo]);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white flex-shrink-0 px-4">
        <button
          onClick={() => setAbaAtiva('otimizador')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${abaAtiva === 'otimizador' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Otimizador de Imagens
        </button>
        <button
          onClick={() => setAbaAtiva('troca')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${abaAtiva === 'troca' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Sugestão de Troca de Imagens
          {sugestoesTroca.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${abaAtiva === 'troca' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {sugestoesTroca.length}
            </span>
          )}
        </button>
      </div>

      {abaAtiva === 'otimizador' && <>
      {/* Filtros + Carregar */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Filtros:</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filtroSemVendas} onChange={e => setFiltroSemVendas(e.target.checked)} />
          Sem vendas
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filtroThumbRuim} onChange={e => setFiltroThumbRuim(e.target.checked)} />
          Thumb Ruim (Tag)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filtroFotoRuim} onChange={e => setFiltroFotoRuim(e.target.checked)} />
          Foto Ruim (Tag)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filtroApenasAtivos} onChange={e => setFiltroApenasAtivos(e.target.checked)} />
          Apenas Ativos
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={ocultarCatalogo} onChange={e => setOcultarCatalogo(e.target.checked)} />
          Ocultar Catálogo
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filtroApenasComEstoque} onChange={e => setFiltroApenasComEstoque(e.target.checked)} />
          Apenas c/ Estoque
        </label>

        <label
          className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer px-2.5 py-1 rounded-md border transition-colors ${agrupaPorSku ? 'bg-violet-600 text-white border-violet-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        >
          <input type="checkbox" className="hidden" checked={agrupaPorSku} onChange={e => { setAgrupaPorSku(e.target.checked); setSelecionado(null); setGrupoSelecionado(null); }} />
          Agrupar por SKU
        </label>

        <div className="ml-auto flex items-center gap-2">
          {cacheTs && (
            <span className="text-xs text-gray-400">
              Cache de {new Date(cacheTs).toLocaleString('pt-BR')}
            </span>
          )}
          <button
            onClick={carregarLista}
            disabled={loading}
            className="px-4 py-2 text-sm font-bold text-white rounded-lg transition flex items-center gap-2 disabled:opacity-60"
            style={{ background: '#e67e22' }}
          >
            {loading
              ? <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block" /> Carregando...</>
              : '🔄 Forçar Atualização'}
          </button>
        </div>
      </div>

      {(statusMsg || anuncios.length > 0) && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex-shrink-0">
          {statusMsg || (agrupaPorSku && listaAgrupada
            ? `${listaAgrupada.length} grupo(s) de SKU${semSkuAds.length > 0 ? ` · ${semSkuAds.length} sem SKU` : ''} · ${listaFiltrada.length} anúncio(s) (de ${anuncios.length} carregados).`
            : `${listaFiltrada.length} anúncio(s) listado(s) com os filtros aplicados (de ${anuncios.length} carregados).`)}
        </div>
      )}

      {/* Body split */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Lista */}
        <div className="flex flex-col" style={{ width: 420, flexShrink: 0, borderRight: '1px solid #e5e7eb' }}>
          {/* Filtro SKU + sort + Título */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Buscar por SKU, MLB ou título..."
              value={filtroTexto}
              onChange={e => handleFiltroTexto(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={() => setSortReverse(r => !r)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded hover:bg-white transition flex-shrink-0"
              title="Ordenar por vendas"
            >
              Vendas {sortReverse ? '↓' : '↑'}
            </button>
          </div>

          <div className="overflow-auto flex-1">
            {listaFiltrada.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm p-6 gap-2">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth={1.5} />
                  <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.5} />
                  <polyline points="21 15 16 10 5 21" strokeWidth={1.5} />
                </svg>
                <p>{anuncios.length === 0 ? 'Clique em "Carregar Lista" para começar.' : 'Nenhum resultado com os filtros atuais. Tente remover alguns filtros.'}</p>
              </div>
            )}

            {agrupaPorSku ? (
              <>
                {(listaAgrupada || []).map(group => {
                  const isGroupSelected = grupoSelecionado
                    ? grupoSelecionado[0]?.id === group.ads[0]?.id
                    : false;
                  const multiThumb = group.ads.length > 1;

                  return (
                    <div
                      key={group.sku}
                      onClick={() => selecionarGrupo(group)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-200 cursor-pointer transition-colors ${isGroupSelected ? 'bg-violet-100 border-l-4 border-l-violet-600' : 'bg-violet-50 hover:bg-violet-100 border-l-4 border-l-transparent'}`}
                    >
                      <div className="relative flex-shrink-0" style={{ width: 48, height: 48 }}>
                        {group.ads.slice(0, 4).map((ad, i) => (
                          <img
                            key={ad.id}
                            src={ad.thumbnail || ''}
                            alt=""
                            className="absolute object-cover border-2 border-white rounded"
                            style={{
                              width: multiThumb ? 30 : 48,
                              height: multiThumb ? 30 : 48,
                              top: multiThumb ? (i >= 2 ? 18 : 0) : 0,
                              left: multiThumb ? (i % 2 === 0 ? 0 : 18) : 0,
                              zIndex: 4 - i,
                            }}
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-mono font-black text-violet-700 truncate">{group.sku}</p>
                          <span className="flex-shrink-0 text-[10px] font-bold text-white bg-violet-600 px-1.5 py-0.5 rounded-full">
                            {group.ads.length}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 truncate leading-tight mt-0.5">{group.titulo}</p>
                        <span className="text-[10px] text-gray-400">{group.totalVendas} vendas</span>
                      </div>
                    </div>
                  );
                })}

                {semSkuAds.length > 0 && (
                  <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                      {semSkuAds.length} anúncio{semSkuAds.length > 1 ? 's' : ''} sem SKU — desative o agrupamento para ver
                    </span>
                  </div>
                )}
              </>
            ) : (
              listaFiltrada.map(ad => {
                const isSelected = selecionado?.id === ad.id;
                const imgQTags = [ad.tagPrincipal, ...(ad.dadosML?.tags || [])].filter(t => IMAGE_QUALITY_TAGS.includes(t));
                return (
                  <div
                    key={ad.id}
                    onClick={() => selecionarItem(ad)}
                    className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'}`}
                  >
                    <img
                      src={ad.thumbnail || ''}
                      alt=""
                      className={`w-12 h-12 object-cover rounded border flex-shrink-0 ${imgQTags.length > 0 ? 'border-red-400' : 'border-gray-200'}`}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-bold text-blue-600 truncate">{ad.id}</p>
                      <p className="text-xs text-gray-700 truncate leading-tight">{ad.titulo}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ad.sku && <span className="text-[10px] text-gray-400 font-mono">{ad.sku}</span>}
                        <span className="text-[10px] text-gray-400">· {ad.vendas} vendas</span>
                        {imgQTags.map(tag => {
                          const mapped = TAG_DISPLAY_MAP[tag];
                          return (
                            <span key={tag} className={`${mapped?.color || 'bg-gray-100 text-gray-600 border-gray-200'} border text-[9px] px-1 py-0.5 rounded font-bold`}>
                              {mapped?.label || tag}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto bg-white flex flex-col p-4 gap-4">
          {!selecionado ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-gray-300">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth={1.5} />
                <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.5} />
                <polyline points="21 15 16 10 5 21" strokeWidth={1.5} />
              </svg>
              <p className="text-sm font-medium">Selecione um anúncio para editar as imagens</p>
            </div>
          ) : (
            <>
              {/* Header do anúncio / grupo */}
              <div>
                {grupoSelecionado ? (
                  <>
                    <p className="font-bold text-violet-700 truncate font-mono">{selecionado.sku || 'Sem SKU'}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{selecionado.titulo}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-bold text-white bg-violet-600 px-2 py-0.5 rounded">
                        {grupoSelecionado.length} anúncios serão atualizados
                      </span>
                      <span className="text-[10px] text-gray-400">{grupoSelecionado.map(a => a.id).join(', ')}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-gray-800 truncate">{selecionado.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selecionado.id} · {selecionado.conta?.nickname || selecionado.contaId} · {selecionado.vendas} vendas
                      {selecionado.permalink && (
                        <a href={selecionado.permalink} target="_blank" rel="noreferrer" className="ml-2 text-blue-500 hover:underline">Abrir no ML →</a>
                      )}
                    </p>
                  </>
                )}
              </div>

              {/* Imagens Atuais */}
              {(() => {
                const picsAtuais = selecionado.dadosML?.pictures?.length
                  ? selecionado.dadosML.pictures
                  : selecionado.thumbnail ? [{ source: selecionado.thumbnail }] : [];
                if (picsAtuais.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Imagens Atuais ({picsAtuais.length - imagensRemovidas.size}/{picsAtuais.length})
                      </p>
                      {imagensRemovidas.size > 0 && (
                        <span className="text-[10px] text-red-500 font-bold">{imagensRemovidas.size} marcada(s) p/ exclusão</span>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {picsAtuais.map((pic, i) => {
                        const removida = imagensRemovidas.has(i);
                        return (
                          <div
                            key={i}
                            className={`relative flex-shrink-0 rounded overflow-hidden border-2 transition-all ${removida ? 'border-red-500 opacity-40' : 'border-gray-200'}`}
                            style={{ width: 90, height: 90 }}
                          >
                            <img
                              src={pic.secure_url || pic.url || pic.source}
                              alt={`img-${i + 1}`}
                              className="w-full h-full object-cover"
                              onError={e => { e.target.style.display = 'none'; }}
                            />
                            <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 rounded">
                              {i + 1}
                            </span>
                            <button
                              onClick={() => setImagensRemovidas(prev => {
                                const n = new Set(prev);
                                if (n.has(i)) n.delete(i); else n.add(i);
                                return n;
                              })}
                              className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${removida ? 'bg-gray-400 text-white hover:bg-gray-500' : 'bg-red-500 text-white hover:bg-red-600'}`}
                              title={removida ? 'Cancelar exclusão' : 'Marcar para excluir'}
                            >
                              {removida ? '↩' : '✕'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Novas Imagens — grid visual */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Novas Imagens (Máx 12)</p>
                  <span className="text-[10px] text-gray-400">{urlsParaEnviar.length} URL(s) válida(s)</span>
                </div>

                {/* Zona de Paste / Drop para Imgur */}
                <div
                  onPaste={handlePasteZone}
                  onDrop={handleDropZone}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-lg px-4 py-2.5 mb-3 transition-colors cursor-pointer text-sm ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'}`}
                  onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.multiple = true; el.onchange = e => Array.from(e.target.files).forEach(uploadParaImgur); el.click(); }}
                  title="Clique para selecionar, arraste ou cole (Ctrl+V) uma imagem para hospedar no Imgur"
                >
                  {uploadando ? (
                    <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 inline-block flex-shrink-0" /><span className="text-blue-600 font-semibold">Enviando para o Imgur...</span></>
                  ) : (
                    <><span className="text-lg">🖼️</span><span className="text-gray-500 text-xs">Clique, arraste ou <kbd className="bg-gray-200 px-1 rounded text-xs">Ctrl+V</kbd> para hospedar no Imgur</span></>
                  )}
                </div>

                {/* Grid de imagens novas */}
                <div className="grid grid-cols-3 gap-2">
                  {urlsNovas.map((url, idx) => {
                    const urlValida = url.trim().startsWith('http') ? url.trim() : null;
                    return (
                      <div key={idx} className="flex flex-col gap-1">
                        {/* Preview */}
                        <div className="relative rounded overflow-hidden border border-gray-200 bg-gray-50" style={{ height: 90 }}>
                          {urlValida ? (
                            <ImagePreview
                              url={urlValida}
                              onValidated={(valid) => setUrlsValidas(prev => ({ ...prev, [idx]: valid }))}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[10px] text-gray-300 font-bold">{idx + 1}</span>
                            </div>
                          )}
                          {/* Badge posição */}
                          <span className={`absolute top-1 left-1 text-[9px] font-bold px-1 rounded ${idx === 0 ? 'bg-blue-600 text-white' : 'bg-black/50 text-white'}`}>
                            {idx === 0 ? 'CAPA' : idx + 1}
                          </span>
                          {/* Botão remover */}
                          {idx > 0 && (
                            <button
                              onClick={() => removeUrl(idx)}
                              className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold hover:bg-red-600"
                            >✕</button>
                          )}
                          {/* Indicador válida/inválida */}
                          {urlsValidas[idx] === true && (
                            <span className="absolute bottom-1 right-1 text-[9px] bg-green-500 text-white px-1 rounded font-bold">✓</span>
                          )}
                          {urlsValidas[idx] === false && (
                            <span className="absolute bottom-1 right-1 text-[9px] bg-red-500 text-white px-1 rounded font-bold">✗</span>
                          )}
                        </div>
                        {/* Input URL */}
                        <input
                          type="text"
                          value={url}
                          onChange={e => handleUrlChange(idx, e.target.value)}
                          placeholder={idx === 0 ? 'URL da capa...' : 'URL...'}
                          className={`w-full text-[10px] px-2 py-1.5 border rounded focus:outline-none focus:ring-1 ${
                            urlsValidas[idx] === true ? 'border-green-400 focus:ring-green-400' :
                            urlsValidas[idx] === false ? 'border-red-400 focus:ring-red-400' :
                            'border-gray-300 focus:ring-blue-400'
                          }`}
                        />
                      </div>
                    );
                  })}

                  {/* Slot para adicionar nova */}
                  {urlsNovas.length < 12 && (
                    <div
                      onClick={addUrl}
                      className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      style={{ height: 90 + 28 + 4 }}
                    >
                      <span className="text-xl text-gray-300">+</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Adicionar</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Opções de aplicação */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Modo de Aplicação</p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="mode" value="FIRST" checked={modoReplace === 'FIRST'} onChange={() => setModoReplace('FIRST')} className="mt-0.5" />
                  <span className="text-xs text-gray-700">Novas imagens fornecidas (apenas as URLs acima)</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="mode" value="ALL" checked={modoReplace === 'ALL'} onChange={() => setModoReplace('ALL')} className="mt-0.5" />
                  <span className="text-xs text-gray-700">Substituir TODAS as imagens (apagar as antigas)</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="mode" value="APPEND" checked={modoReplace === 'APPEND'} onChange={() => setModoReplace('APPEND')} className="mt-0.5" />
                  <span className="text-xs text-gray-700">Adicionar ao final (mantendo as existentes)</span>
                </label>
              </div>

              {!grupoSelecionado && (
                <div className="border-t border-gray-100 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aplicarTodosSku}
                      onChange={e => setAplicarTodosSku(e.target.checked)}
                    />
                    <span className="text-xs text-gray-700 font-semibold">
                      ⚡ Aplicar a TODOS os anúncios que tiverem o mesmo SKU ({selecionado.sku || 'sem SKU'})
                    </span>
                  </label>
                </div>
              )}

              {/* Ações */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-shrink-0">
                {canUseResource('imagens.otimizar') && (
                <button
                  onClick={ignorarItem}
                  className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Ignorar (Ocultar)
                </button>
                )}
                <div className="flex-1" />
                {canUseResource('imagens.otimizar') && (
                <>
                <button
                  onClick={() => aplicarImagens(false)}
                  disabled={enviando || (urlsParaEnviar.length === 0 && imagensRemovidas.size === 0)}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
                >
                  {enviando ? 'Enviando...' : 'Apenas Aplicar'}
                </button>
                <button
                  onClick={() => aplicarImagens(true)}
                  disabled={enviando || (urlsParaEnviar.length === 0 && imagensRemovidas.size === 0)}
                  className="px-4 py-2 text-xs font-black text-white rounded-lg disabled:opacity-40 transition flex items-center gap-1"
                  style={{ background: '#27ae60' }}
                >
                  {enviando ? 'Enviando...' : <>Aplicar e Próximo ⚡</>}
                </button>
                </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </>}

      {/* ===== ABA: SUGESTÃO DE TROCA DE IMAGENS ===== */}
      {abaAtiva === 'troca' && (
        <div className="flex flex-1 min-h-0">
          {/* Lista de sugestões */}
          <div className="flex flex-col flex-shrink-0 border-r border-gray-200" style={{ width: 380 }}>
            <div className="px-3 py-2 bg-teal-50 border-b border-teal-100 flex-shrink-0">
              <p className="text-xs font-bold text-teal-700">
                {sugestoesTroca.length} SKU{sugestoesTroca.length !== 1 ? 's' : ''} com oportunidade de troca
              </p>
              <p className="text-[10px] text-teal-600 mt-0.5">
                SKUs onde há anúncios vendendo bem e outros ativos sem nenhuma venda.
              </p>
            </div>

            {anuncios.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-400 text-sm p-6 gap-2 text-center">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p>Carregue os dados primeiro na aba "Otimizador de Imagens".</p>
              </div>
            ) : sugestoesTroca.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-400 text-sm p-6 gap-2 text-center">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Nenhuma sugestão encontrada. Todos os SKUs têm padrão de vendas consistente.</p>
              </div>
            ) : (
              <div className="overflow-auto flex-1">
                {sugestoesTroca.map(s => {
                  const isSelected = trocaSku?.sku === s.sku;
                  return (
                    <div
                      key={s.sku}
                      onClick={() => { setTrocaSku(s); setAlvosAplicados(new Set()); setTrocaImgsPorAlvo({}); }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-teal-50 border-l-2 border-l-teal-500' : 'hover:bg-gray-50'}`}
                    >
                      <img
                        src={s.doador.thumbnail || ''}
                        alt=""
                        className="w-12 h-12 object-cover rounded border border-gray-200 flex-shrink-0"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono font-black text-teal-700 truncate">{s.sku}</p>
                        <p className="text-xs text-gray-600 truncate leading-tight">{s.titulo}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            campeão: {s.maxVendas} vendas
                          </span>
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            {s.targets.length} sem venda
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Painel A/B test */}
          <div className="flex-1 overflow-auto bg-gray-50 p-4 flex flex-col gap-3">
            {!trocaSku ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
                <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <p className="text-sm font-medium">Selecione um SKU para montar o teste A/B</p>
              </div>
            ) : (
              <>
                {/* Referência: campeão */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3 flex-shrink-0">
                  <div className="flex gap-1 flex-shrink-0">
                    {urlsDoador(trocaSku.doador).slice(0, 5).map((url, i) => (
                      <img key={i} src={url} alt="" className="w-12 h-12 object-cover rounded border-2 border-green-300" onError={e => { e.target.style.display = 'none'; }} />
                    ))}
                    {urlsDoador(trocaSku.doador).length > 5 && (
                      <div className="w-12 h-12 rounded border-2 border-green-300 bg-green-100 flex items-center justify-center text-[10px] font-bold text-green-700">
                        +{urlsDoador(trocaSku.doador).length - 5}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-green-700 bg-green-200 px-2 py-0.5 rounded-full uppercase">Referência — {trocaSku.maxVendas} vendas</span>
                      <span className="text-[10px] text-gray-400 font-mono">{trocaSku.doador.id}</span>
                    </div>
                    <p className="text-xs text-gray-700 truncate mt-0.5">{trocaSku.doador.titulo}</p>
                    <p className="text-[10px] text-gray-400">{trocaSku.doador.conta?.nickname || trocaSku.doador.contaId}</p>
                  </div>
                  {trocaSku.doador.permalink && (
                    <a href={trocaSku.doador.permalink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline flex-shrink-0">ML →</a>
                  )}
                </div>

                {/* Instrução */}
                <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex-shrink-0">
                  <span className="font-bold text-blue-700">Teste A/B:</span> defina imagens <span className="font-bold">diferentes</span> para cada anúncio sem venda. Cole URLs ou use "Copiar do campeão" para começar a partir das fotos de referência e depois personalizar.
                </div>

                {/* Um card por anúncio-alvo */}
                {trocaSku.targets.map((ad, idx) => {
                  const letra = String.fromCharCode(65 + idx); // A, B, C...
                  const urls = getUrlsAlvo(ad.id);
                  const aplicado = alvosAplicados.has(ad.id);
                  const enviando = aplicandoAlvo === ad.id;
                  const urlsValidas = urls.filter(u => u.trim().startsWith('http'));

                  const isFocused = focusedAlvo === ad.id;
                  const uploadandoEsteAlvo = uploadandoAlvo === ad.id;

                  return (
                    <div
                      key={ad.id}
                      className={`bg-white rounded-xl border-2 p-3 flex flex-col gap-2.5 transition-colors ${aplicado ? 'border-green-400' : isFocused ? 'border-teal-400' : 'border-gray-200'}`}
                      onClick={() => !aplicado && setFocusedAlvo(ad.id)}
                    >
                      {/* Header do card */}
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${aplicado ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {aplicado ? '✓' : letra}
                        </div>
                        <img src={ad.thumbnail || ''} alt="" className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-700 truncate">{ad.titulo}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{ad.id} · {ad.conta?.nickname || ad.contaId}</p>
                          {ad.permalink && <a href={ad.permalink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Abrir no ML →</a>}
                        </div>
                        {aplicado && <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex-shrink-0">Aplicado ✓</span>}
                      </div>

                      {/* Editor de URLs */}
                      {!aplicado && (
                        <>
                          {/* Zona de Imgur (drop / paste / clique) */}
                          <div
                            onDrop={e => { e.preventDefault(); Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => uploadParaImgurAlvo(ad.id, f)); }}
                            onDragOver={e => e.preventDefault()}
                            onPaste={e => { const items = Array.from(e.clipboardData?.items || []); const img = items.find(i => i.type.startsWith('image/')); if (img) { e.preventDefault(); uploadParaImgurAlvo(ad.id, img.getAsFile()); } }}
                            onClick={() => { setFocusedAlvo(ad.id); const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.multiple = true; el.onchange = ev => Array.from(ev.target.files).forEach(f => uploadParaImgurAlvo(ad.id, f)); el.click(); }}
                            className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 cursor-pointer text-xs transition-colors ${isFocused ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-gray-50 hover:border-teal-300 hover:bg-teal-50/40'}`}
                          >
                            {uploadandoEsteAlvo
                              ? <><span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-teal-500 inline-block flex-shrink-0" /><span className="text-teal-600 font-semibold">Enviando para o Imgur...</span></>
                              : <><span>🖼️</span><span className="text-gray-500">Clique, arraste ou <kbd className="bg-gray-200 px-1 rounded text-[10px]">Ctrl+V</kbd> para hospedar no Imgur{isFocused ? ' (card ativo)' : ''}</span></>
                            }
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {urls.map((url, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-gray-400 w-5 text-center flex-shrink-0">{i + 1}</span>
                                <input
                                  type="text"
                                  value={url}
                                  onChange={e => {
                                    const n = [...urls]; n[i] = e.target.value;
                                    setUrlsAlvo(ad.id, n);
                                  }}
                                  placeholder={i === 0 ? 'URL da capa (https://...)' : 'URL adicional...'}
                                  className="flex-1 text-[10px] px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-400"
                                />
                                {urls.length > 1 && (
                                  <button onClick={() => setUrlsAlvo(ad.id, urls.filter((_, j) => j !== i))} className="w-5 h-5 rounded-full bg-red-100 text-red-500 text-[10px] font-bold hover:bg-red-200 flex items-center justify-center flex-shrink-0">✕</button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Prévia das imagens */}
                          {urlsValidas.length > 0 && (
                            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                              {urlsValidas.map((url, i) => (
                                <img key={i} src={url} alt="" className="w-14 h-14 object-cover rounded border border-gray-200 flex-shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                              ))}
                            </div>
                          )}

                          {/* Ações do card */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {urls.length < 12 && (
                              <button onClick={() => setUrlsAlvo(ad.id, [...urls, ''])} className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition">
                                + URL
                              </button>
                            )}
                            <button
                              onClick={() => setUrlsAlvo(ad.id, [...urlsDoador(trocaSku.doador), ...Array(Math.max(0, urls.length - urlsDoador(trocaSku.doador).length)).fill('')])}
                              className="text-[10px] text-green-700 hover:text-green-800 border border-green-200 rounded px-2 py-1 hover:bg-green-50 transition"
                            >
                              Copiar do campeão
                            </button>
                            <div className="flex-1" />
                            {canUseResource('imagens.otimizar') && (
                              <button
                                onClick={() => aplicarImagemAlvo(ad, urls)}
                                disabled={enviando || urlsValidas.length === 0}
                                className="px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-40 transition flex items-center gap-1.5"
                                style={{ background: '#0d9488' }}
                              >
                                {enviando
                                  ? <><span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white inline-block" /> Enviando...</>
                                  : <>Aplicar {urlsValidas.length > 0 ? `(${urlsValidas.length} img)` : ''}</>
                                }
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Progresso geral */}
                {trocaSku.targets.length > 1 && (
                  <div className="text-xs text-gray-500 text-center py-1">
                    {alvosAplicados.size} de {trocaSku.targets.length} anúncios com imagens aplicadas
                    {alvosAplicados.size === trocaSku.targets.length && (
                      <span className="ml-2 font-bold text-green-600">— Teste A/B completo! ✓</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
