import { useRef, useState, useEffect } from 'react';

export default function FormularioBasico(props) {
  const {
    tituloAnuncio, setTituloAnuncio,
    descricaoAnuncio, setDescricaoAnuncio,
    prazoFabricacao, setPrazoFabricacao,
    pesoEmbalagem, setPesoEmbalagem,
    alturaEmbalagem, setAlturaEmbalagem,
    larguraEmbalagem, setLarguraEmbalagem,
    comprimentoEmbalagem, setComprimentoEmbalagem,
    detalhesProduto, setImagemAmpliada,
    // Gerenciamento de imagens
    imagensOrdenadas, onImagensChange, uploadando, onUploadImagem,
    onRemoverFundo, removendoFundo,
  } = props;

  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const mover = (idx, dir) => {
    const arr = [...imagensOrdenadas];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    onImagensChange(arr);
  };

  const remover = (idx) => {
    onImagensChange(imagensOrdenadas.filter((_, i) => i !== idx));
  };

  const handleUrlChange = (idx, val) => {
    const arr = [...imagensOrdenadas];
    arr[idx] = val;
    onImagensChange(arr);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    files.forEach(onUploadImagem);
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith('image/'));
    if (imgItem) { e.preventDefault(); onUploadImagem(imgItem.getAsFile()); }
  };

  // Listener global de paste — funciona sem precisar clicar na zona antes
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (isTyping) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) { e.preventDefault(); onUploadImagem(imgItem.getAsFile()); }
    };
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [onUploadImagem]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ===== CAMPOS DO ANÚNCIO ===== */}
        <div className="md:col-span-2">
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-1">Título do Anúncio (ML)</label>
            <input
              type="text"
              value={tituloAnuncio}
              onChange={e => setTituloAnuncio(e.target.value)}
              maxLength={60}
              className={`w-full px-3 py-2 border rounded-md shadow-sm text-lg font-medium focus:outline-none focus:ring-2 ${tituloAnuncio.length >= 60 ? 'border-red-500' : 'border-gray-300'}`}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-1">Descrição do Anúncio</label>
            <textarea
              value={descricaoAnuncio}
              onChange={e => setDescricaoAnuncio(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none"
              placeholder="Descreva seu produto..."
            />
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg">
              <span className="text-xs uppercase font-bold block mb-1">Preço (Venda / Promo)</span>
              <span className="text-lg font-bold">R$ {Number(detalhesProduto.preco_promocional || detalhesProduto.preco || 0).toFixed(2)}</span>
            </div>

            <div className="bg-purple-50 border border-purple-200 text-purple-800 px-4 py-2 rounded-lg">
              <span className="text-xs uppercase font-bold block mb-1">Custo (Tiny)</span>
              <span className="text-lg font-bold">R$ {Number(detalhesProduto.preco_custo || 0).toFixed(2)}</span>
            </div>

            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded-lg">
              <span className="text-xs uppercase font-bold block mb-1">Estoque Físico</span>
              <span className="text-lg font-bold">{detalhesProduto.estoque_atual || 0} un.</span>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-2 rounded-lg">
              <label className="text-xs uppercase font-bold block mb-1">Prazo Fabr. (Dias)</label>
              <input
                type="number" min="0" max="45"
                value={prazoFabricacao}
                onChange={e => setPrazoFabricacao(e.target.value)}
                placeholder="0"
                className="w-16 bg-transparent font-bold text-lg outline-none border-b border-yellow-300"
              />
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 text-gray-800 px-4 py-3 rounded-lg flex flex-col gap-2 w-full mt-4">
            <span className="text-xs uppercase font-bold block text-gray-600">Dimensões da Embalagem (Para Cálculo ML)</span>
            <div className="grid grid-cols-4 gap-4">
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Peso (Kg)</label><input type="number" step="0.1" value={pesoEmbalagem} onChange={e => setPesoEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></div>
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Altura (cm)</label><input type="number" value={alturaEmbalagem} onChange={e => setAlturaEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></div>
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Largura (cm)</label><input type="number" value={larguraEmbalagem} onChange={e => setLarguraEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></div>
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Comp (cm)</label><input type="number" value={comprimentoEmbalagem} onChange={e => setComprimentoEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></div>
            </div>
          </div>
        </div>

        {/* ===== COLUNA DE IMAGENS ===== */}
        <div>
          <p className="text-sm text-gray-600 font-semibold mb-2">
            Imagens do Anúncio ({Math.min(imagensOrdenadas.length, 12)}/12)
          </p>

          {/* Zona de upload */}
          <div
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            tabIndex={0}
            className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 mb-2 cursor-pointer text-xs transition-colors focus:outline-none ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
            }`}
            title="Clique, arraste ou cole (Ctrl+V) uma imagem para hospedar no Imgur"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => Array.from(e.target.files).forEach(onUploadImagem)}
            />
            {uploadando
              ? <><span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500 inline-block flex-shrink-0" /><span className="text-blue-600 font-semibold">Enviando para Imgur...</span></>
              : <><span>🖼️</span><span className="text-gray-500">Colar, arrastar ou clicar para adicionar</span></>
            }
          </div>

          {/* Grid de imagens */}
          <div className="grid grid-cols-2 gap-1.5">
            {imagensOrdenadas.slice(0, 12).map((url, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <div className="relative rounded overflow-hidden border border-gray-200 bg-gray-50" style={{ height: 72 }}>
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setImagemAmpliada && setImagemAmpliada(url)}
                      onError={e => { e.target.style.opacity = '0.3'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[10px] text-gray-300 font-bold">{idx + 1}</span>
                    </div>
                  )}

                  {/* Badge posição */}
                  <span className={`absolute top-0.5 left-0.5 text-[8px] font-bold px-1 rounded ${idx === 0 ? 'bg-blue-600 text-white' : 'bg-black/50 text-white'}`}>
                    {idx === 0 ? 'CAPA' : idx + 1}
                  </span>

                  {/* Botões de ação */}
                  <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); mover(idx, -1); }}
                      disabled={idx === 0}
                      className="w-4 h-4 bg-black/60 text-white rounded flex items-center justify-center text-[9px] disabled:opacity-30 hover:bg-black/80"
                      title="Mover para cima"
                    >↑</button>
                    <button
                      onClick={e => { e.stopPropagation(); mover(idx, 1); }}
                      disabled={idx >= imagensOrdenadas.length - 1}
                      className="w-4 h-4 bg-black/60 text-white rounded flex items-center justify-center text-[9px] disabled:opacity-30 hover:bg-black/80"
                      title="Mover para baixo"
                    >↓</button>
                    <button
                      onClick={e => { e.stopPropagation(); remover(idx); }}
                      className="w-4 h-4 bg-red-500 text-white rounded flex items-center justify-center text-[9px] hover:bg-red-600"
                      title="Remover"
                    >✕</button>
                  </div>
                </div>

                {/* Input URL */}
                <input
                  type="text"
                  value={url}
                  onChange={e => handleUrlChange(idx, e.target.value)}
                  placeholder={idx === 0 ? 'URL da capa...' : 'URL...'}
                  className="w-full text-[9px] px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                />

                {/* Botão remover fundo — só na capa */}
                {idx === 0 && url && (
                  <button
                    onClick={e => { e.stopPropagation(); onRemoverFundo(0); }}
                    disabled={removendoFundo}
                    className="w-full flex items-center justify-center gap-1 text-[9px] font-bold px-1.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded disabled:opacity-50 transition-colors"
                    title="Remove o fundo via Remove.bg, converte para JPG 1000x1000 e hospeda no Imgur"
                  >
                    {removendoFundo
                      ? <><span className="animate-spin inline-block w-2 h-2 border border-white border-t-transparent rounded-full" />Processando...</>
                      : <>✨ Remover fundo e otimizar</>
                    }
                  </button>
                )}
              </div>
            ))}

            {/* Slot para adicionar */}
            {imagensOrdenadas.length < 12 && (
              <div
                onClick={() => onImagensChange([...imagensOrdenadas, ''])}
                className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                style={{ height: 72 + 28 + 6 }}
              >
                <span className="text-gray-300 text-xl leading-none">+</span>
                <span className="text-[9px] text-gray-400 mt-0.5">Adicionar</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
