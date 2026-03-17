import React from 'react';
import ImageThumbnail from '../ImageThumbnail';

export default function FormularioBasico(props) {
  // ADICIONE posicaoPeca e setPosicaoPeca na desestruturação abaixo:
  const { tituloAnuncio, setTituloAnuncio, descricaoAnuncio, setDescricaoAnuncio, prazoFabricacao, setPrazoFabricacao, pesoEmbalagem, setPesoEmbalagem, alturaEmbalagem, setAlturaEmbalagem, larguraEmbalagem, setLarguraEmbalagem, comprimentoEmbalagem, setComprimentoEmbalagem, detalhesProduto, setImagemAmpliada, posicaoPeca, setPosicaoPeca } = props;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-1">Título do Anúncio (ML)</label>
            <input type="text" value={tituloAnuncio} onChange={e => setTituloAnuncio(e.target.value)} maxLength={60} className={`w-full px-3 py-2 border rounded-md shadow-sm text-lg font-medium focus:outline-none focus:ring-2 ${tituloAnuncio.length >= 60 ? 'border-red-500' : 'border-gray-300'}`} />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-1">Descrição do Anúncio</label>
            <textarea value={descricaoAnuncio} onChange={e => setDescricaoAnuncio(e.target.value)} rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none" placeholder="Descreva seu produto..." />
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
              <input type="number" min="0" max="45" value={prazoFabricacao} onChange={e => setPrazoFabricacao(e.target.value)} placeholder="0" className="w-16 bg-transparent font-bold text-lg outline-none border-b border-yellow-300" />
            </div>
          </div>
            {/* ADICIONE ESTE BLOCO AQUI */}
            <div className="bg-cyan-50 border border-cyan-200 text-cyan-900 px-4 py-2 rounded-lg flex-1 min-w-[150px]">
              <label className="text-xs uppercase font-bold block mb-1">Posição (Autopeças)</label>
              <select value={posicaoPeca} onChange={e => setPosicaoPeca(e.target.value)} className="w-full bg-transparent font-bold text-sm outline-none border-b border-cyan-300 pb-1 cursor-pointer">
                <option value="">Não se aplica</option>
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
          <div className="bg-gray-50 border border-gray-200 text-gray-800 px-4 py-3 rounded-lg flex flex-col gap-2 w-full mt-4">
            <span className="text-xs uppercase font-bold block text-gray-600">Dimensões da Embalagem (Para Cálculo ML)</span>
            <div className="grid grid-cols-4 gap-4">
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Peso (Kg)</label><input type="number" step="0.1" value={pesoEmbalagem} onChange={e => setPesoEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm"/></div>
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Altura (cm)</label><input type="number" value={alturaEmbalagem} onChange={e => setAlturaEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm"/></div>
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Largura (cm)</label><input type="number" value={larguraEmbalagem} onChange={e => setLarguraEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm"/></div>
              <div><label className="text-xs text-gray-500 font-semibold block mb-1">Comp (cm)</label><input type="number" value={comprimentoEmbalagem} onChange={e => setComprimentoEmbalagem(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm"/></div>
            </div>
          </div>
        </div>
        
        <div>
          <p className="text-sm text-gray-600 font-semibold mb-2">Imagens do Produto:</p>
          {detalhesProduto.anexos && detalhesProduto.anexos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {detalhesProduto.anexos.map((img, idx) => (
                <ImageThumbnail key={idx} src={img.anexo || img.url} alt={`Imagem ${idx}`} onClick={() => setImagemAmpliada(img.anexo || img.url)} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 bg-gray-100 rounded-md text-sm text-gray-400">Sem imagens</div>
          )}
        </div>
      </div>
    </div>
  );
}