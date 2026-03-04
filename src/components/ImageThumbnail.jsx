import React, { useState, useEffect } from 'react';

// Componente para exibir a miniatura, suas dimensões e validar o tamanho
export default function ImageThumbnail({ src, alt, onClick }) {
  const [dimensions, setDimensions] = useState(null);
  const [isInvalidSize, setIsInvalidSize] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      setDimensions({ width: naturalWidth, height: naturalHeight });
      // Valida se alguma das dimensões é menor que 500px
      if (naturalWidth < 500 || naturalHeight < 500) {
        setIsInvalidSize(true);
      }
    };
  }, [src]);

  return (
    <div 
      onClick={onClick} 
      className={`relative group cursor-pointer border-2 rounded-md overflow-hidden transition-all
                  ${isInvalidSize ? 'border-red-500' : 'border-gray-200 hover:border-blue-400'}`}
    >
      <img src={src} alt={alt} className="w-full h-24 object-cover" />
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-xs text-center py-0.5
                    ${isInvalidSize ? 'text-red-300 font-bold' : 'text-white'}`}
      >
        {dimensions ? `${dimensions.width} x ${dimensions.height}` : 'Carregando...'}
      </div>
    </div>
  );
}