import React, { useState, useRef, useCallback } from 'react';
import { TAG_DISPLAY_MAP } from './GerenciadorAnuncios';

const IMAGE_QUALITY_TAGS = ['poor_quality_thumbnail', 'poor_quality_picture', 'picture_downloading_pending'];

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
  const [anuncios, setAnuncios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [selecionado, setSelecionado] = useState(null);

  // Editor state
  const [urlsNovas, setUrlsNovas] = useState(['']);
  const [urlTestandoIdx, setUrlTestandoIdx] = useState(null);
  const [urlsValidas, setUrlsValidas] = useState({});
  const [modoReplace, setModoReplace] = useState('FIRST'); // FIRST | ALL
  const [aplicarTodosSku, setAplicarTodosSku] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // Filtros
  const [filtroSemVendas, setFiltroSemVendas] = useState(true);
  const [filtroThumbRuim, setFiltroThumbRuim] = useState(true);
  const [filtroFotoRuim, setFiltroFotoRuim] = useState(false);
  const [filtroApenasAtivos, setFiltroApenasAtivos] = useState(true);
  const [filtroSku, setFiltroSku] = useState('');
  const [sortReverse, setSortReverse] = useState(true);

  const carregarLista = useCallback(async () => {
    const contas = JSON.parse(localStorage.getItem('saas_contas_ml') || '[]');
    if (!contas.length) {
      setStatusMsg('Nenhuma conta ML conectada. Configure em "Configurações".');
      return;
    }
    const contasIds = contas.map(c => c.id).join(',');

    setLoading(true);
    setStatusMsg('Carregando anúncios...');
    setAnuncios([]);
    setSelecionado(null);

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

      // Aplica filtros
      const filtrados = todos.filter(ad => {
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

        return true;
      });

      setAnuncios(filtrados);
      setStatusMsg(`${filtrados.length} anúncio(s) listado(s) com os filtros aplicados.`);
    } catch (e) {
      setStatusMsg(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [filtroSemVendas, filtroThumbRuim, filtroFotoRuim, filtroApenasAtivos]);

  const listaFiltrada = anuncios
    .filter(ad => !filtroSku || (ad.sku || '').toLowerCase().includes(filtroSku.toLowerCase()) || ad.id.includes(filtroSku))
    .sort((a, b) => {
      const va = Number(a.vendas || 0), vb = Number(b.vendas || 0);
      return sortReverse ? vb - va : va - vb;
    });

  const selecionarItem = (ad) => {
    setSelecionado(ad);
    setUrlsNovas(['']);
    setUrlsValidas({});
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

  const aplicarImagens = async (autoNext = false) => {
    if (!selecionado || urlsParaEnviar.length === 0) return;

    const sku = selecionado.sku;
    let itemsParaAtualizar = [];

    if (aplicarTodosSku && sku) {
      itemsParaAtualizar = anuncios
        .filter(ad => ad.sku === sku && ad.status === 'active')
        .map(ad => ({ id: ad.id, contaId: ad.contaId }));
    } else {
      itemsParaAtualizar = [{ id: selecionado.id, contaId: selecionado.contaId }];
    }

    if (itemsParaAtualizar.length === 0) {
      alert('Nenhum anúncio elegível para atualização.');
      return;
    }

    const pictures = urlsParaEnviar.slice(0, 12).map(u => ({ source: u }));
    setEnviando(true);

    try {
      const res = await fetch('/api/ml/acoes-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: usuarioId, items: itemsParaAtualizar, acao: 'atualizar_imagens', valor: pictures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');

      alert(`✅ ${pictures.length} imagem(ns) enviada(s) para ${itemsParaAtualizar.length} anúncio(s)!\nAcompanhe na aba "Gerenciador de Fila".`);

      // Remove os itens atualizados da lista se autoNext
      if (autoNext) {
        const idsAtualizados = new Set(itemsParaAtualizar.map(i => i.id));
        setAnuncios(prev => prev.filter(ad => !idsAtualizados.has(ad.id)));
        // Seleciona próximo
        const idx = listaFiltrada.findIndex(ad => ad.id === selecionado.id);
        const proximo = listaFiltrada[idx + 1] || listaFiltrada[idx - 1] || null;
        setSelecionado(proximo);
        setUrlsNovas(['']);
        setUrlsValidas({});
      }
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

  const ignorarItem = () => {
    if (!selecionado) return;
    setAnuncios(prev => prev.filter(ad => ad.id !== selecionado.id));
    const idx = listaFiltrada.findIndex(ad => ad.id === selecionado.id);
    const proximo = listaFiltrada[idx + 1] || listaFiltrada[idx - 1] || null;
    setSelecionado(proximo);
    setUrlsNovas(['']);
    setUrlsValidas({});
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
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

        <button
          onClick={carregarLista}
          disabled={loading}
          className="ml-auto px-4 py-2 text-sm font-bold text-white rounded-lg transition flex items-center gap-2 disabled:opacity-60"
          style={{ background: '#2980b9' }}
        >
          {loading
            ? <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block" /> Carregando...</>
            : '🔄 Carregar Lista'}
        </button>
      </div>

      {statusMsg && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex-shrink-0">
          {statusMsg}
        </div>
      )}

      {/* Body split */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Lista */}
        <div className="flex flex-col" style={{ width: 420, flexShrink: 0, borderRight: '1px solid #e5e7eb' }}>
          {/* Filtro SKU + sort */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Filtrar SKU ou MLB..."
              value={filtroSku}
              onChange={e => setFiltroSku(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={() => setSortReverse(r => !r)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded hover:bg-white transition"
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
                <p>{anuncios.length === 0 ? 'Clique em "Carregar Lista" para começar.' : 'Nenhum resultado com os filtros atuais.'}</p>
              </div>
            )}
            {listaFiltrada.map(ad => {
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
            })}
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
              {/* Header do anúncio */}
              <div>
                <p className="font-bold text-gray-800 truncate">{selecionado.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selecionado.id} · {selecionado.conta?.nickname || selecionado.contaId} · {selecionado.vendas} vendas
                  {selecionado.permalink && (
                    <a href={selecionado.permalink} target="_blank" rel="noreferrer" className="ml-2 text-blue-500 hover:underline">Abrir no ML →</a>
                  )}
                </p>
              </div>

              {/* Preview lado a lado */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Imagem Atual (Thumb)</p>
                  <div style={{ height: 200 }}>
                    <ImagePreview url={selecionado.thumbnail} label="Sem imagem atual" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Nova Capa (Preview da 1ª URL)</p>
                  <div style={{ height: 200 }}>
                    <ImagePreview
                      url={urlsNovas[0]?.trim().startsWith('http') ? urlsNovas[0].trim() : null}
                      label="Cole uma URL abaixo"
                      onValidated={(valid) => setUrlsValidas(prev => ({ ...prev, 0: valid }))}
                    />
                  </div>
                </div>
              </div>

              {/* URLs das novas imagens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">URLs das Novas Imagens (Máx 12)</p>
                  <span className="text-[10px] text-gray-400">{urlsParaEnviar.length} URL(s) válida(s)</span>
                </div>
                <div className="space-y-2">
                  {urlsNovas.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 flex-shrink-0 text-right">{idx + 1}.</span>
                      <input
                        type="text"
                        value={url}
                        onChange={e => handleUrlChange(idx, e.target.value)}
                        placeholder={idx === 0 ? 'Cole a URL da imagem principal aqui...' : 'URL adicional...'}
                        className={`flex-1 text-xs px-3 py-2 border rounded focus:outline-none focus:ring-1 ${
                          urlsValidas[idx] === true ? 'border-green-400 focus:ring-green-400' :
                          urlsValidas[idx] === false ? 'border-red-400 focus:ring-red-400' :
                          'border-gray-300 focus:ring-blue-400'
                        }`}
                      />
                      {urlsValidas[idx] === true && <span className="text-green-500 text-sm">✓</span>}
                      {urlsValidas[idx] === false && <span className="text-red-500 text-sm">✗</span>}
                      {idx > 0 && (
                        <button onClick={() => removeUrl(idx)} className="text-gray-400 hover:text-red-500 transition text-xs font-bold">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                {urlsNovas.length < 12 && (
                  <button
                    onClick={addUrl}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                  >
                    + Adicionar URL
                  </button>
                )}
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
              </div>

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

              {/* Ações */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={ignorarItem}
                  className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Ignorar (Ocultar)
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => aplicarImagens(false)}
                  disabled={enviando || urlsParaEnviar.length === 0}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
                >
                  {enviando ? 'Enviando...' : 'Apenas Aplicar'}
                </button>
                <button
                  onClick={() => aplicarImagens(true)}
                  disabled={enviando || urlsParaEnviar.length === 0}
                  className="px-4 py-2 text-xs font-black text-white rounded-lg disabled:opacity-40 transition flex items-center gap-1"
                  style={{ background: '#27ae60' }}
                >
                  {enviando ? 'Enviando...' : <>Aplicar e Próximo ⚡</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
