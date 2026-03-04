import React, { useState } from 'react';
import ImageThumbnail from '../ImageThumbnail';

export default function FormularioVariacoes({ detalhesProduto, setImagemAmpliada }) {
  const [activeTab, setActiveTab] = useState(0);

  const filhos = detalhesProduto?.filhos;
  if (!filhos || filhos.length === 0) return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
        <span>Variações do Produto</span>
        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-bold">{filhos.length} encontradas</span>
      </h3>
      
      {/* Container de Abas */}
      <div className="flex border-b border-gray-200 overflow-x-auto mb-4 custom-scrollbar">
        {filhos.map((filho, idx) => {
          // Tenta usar as chaves da grade como nome da aba (Ex: "Azul / M"), ou faz um fallback pro SKU
          const nomeAba = Object.values(filho.grade || {}).join(' / ') || filho.codigo || `Var ${idx + 1}`;
          
          return (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`py-2 px-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors focus:outline-none
                ${activeTab === idx ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              {nomeAba}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/50 p-4 rounded-lg border border-gray-100">
        {filhos[activeTab] && (() => {
          const filho = filhos[activeTab];
          // Se o filho não tem anexo, usa os anexos do PAI
          const imagens = (filho.anexos && filho.anexos.length > 0) ? filho.anexos : detalhesProduto.anexos;

          return (
            <>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-white p-2 rounded border">
                  <span className="text-xs uppercase font-bold text-gray-500">SKU (Filho):</span> 
                  <span className="font-bold text-gray-800">{filho.codigo}</span>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded border">
                  <span className="text-xs uppercase font-bold text-gray-500">Estoque:</span> 
                  <span className="font-black text-green-700">{filho.estoque_atual} un.</span>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded border">
                  <span className="text-xs uppercase font-bold text-gray-500">Custo (Tiny):</span> 
                  <span className="font-bold text-gray-800">R$ {Number(filho.preco_custo || filho.preco || 0).toFixed(2)}</span>
                </div>
                
                <div className="bg-white p-3 rounded border">
                  <span className="text-xs uppercase font-bold text-gray-500 block mb-2">Grade de Atributos:</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(filho.grade || {}).map(([k, v], i) => (
                       <span key={i} className="bg-blue-50 border border-blue-200 px-2 py-1 text-xs rounded text-blue-800">
                         <b>{k}:</b> {v}
                       </span>
                    ))}
                    {Object.keys(filho.grade || {}).length === 0 && (
                      <span className="text-xs text-gray-400">Nenhum atributo de grade definido no ERP.</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs uppercase font-bold text-gray-500">
                    Imagens da Variação
                  </span>
                  <span className="text-xs font-bold text-gray-400">
                    ({Math.min(imagens?.length || 0, 12)}/12 limit)
                  </span>
                </div>
                {!(filho.anexos && filho.anexos.length > 0) && (
                   <p className="text-xs text-orange-600 font-medium mb-2 bg-orange-50 p-1 border border-orange-100 rounded">
                     ⚠ Herdando imagens do Produto Pai
                   </p>
                )}

                {imagens && imagens.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {imagens.slice(0, 12).map((img, idx) => (
                      <ImageThumbnail key={idx} src={img.anexo || img.url} alt={`Img ${idx}`} onClick={() => setImagemAmpliada(img.anexo || img.url)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 bg-white border p-6 rounded text-center">Nenhuma imagem disponível</div>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}