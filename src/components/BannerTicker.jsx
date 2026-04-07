import { useState, useEffect, useRef } from 'react';

const PX_POR_SEGUNDO = 80;

export default function BannerTicker({ isSuperAdmin, impersonating }) {
  const [visivel, setVisivel] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [dispensado, setDispensado] = useState(false);
  const scrollAreaRef = useRef(null);
  const textRef = useRef(null);
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const deveExibir = !isSuperAdmin || impersonating;

  // Busca mensagens do servidor
  useEffect(() => {
    if (!deveExibir) return;
    const buscar = async () => {
      try {
        const r = await fetch('/api/banner');
        if (!r.ok) return;
        const data = await r.json();
        setVisivel(data.visivel && data.mensagens.length > 0);
        setMensagens(data.mensagens || []);
      } catch {}
    };
    buscar();
    const interval = setInterval(buscar, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [deveExibir]);

  // Mede a largura da área de rolagem (sem o label e botão)
  useEffect(() => {
    if (!scrollAreaRef.current) return;
    const obs = new ResizeObserver(() => {
      setScrollAreaWidth(scrollAreaRef.current?.offsetWidth || 0);
    });
    obs.observe(scrollAreaRef.current);
    return () => obs.disconnect();
  }, [visivel, mensagens]);

  // Mede a largura real do texto após render
  useEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.scrollWidth);
    }
  }, [mensagens, scrollAreaWidth]);

  if (!deveExibir || !visivel || dispensado || mensagens.length === 0) return null;

  const textoCompleto = mensagens.map(m => m.texto).join('    ★    ');
  const cW = Math.round(scrollAreaWidth);
  const tW = Math.round(textWidth);

  // Só anima quando as duas medidas estão prontas
  const pronto = cW > 0 && tW > 0;
  const duracao = pronto ? Math.max(8, (cW + tW) / PX_POR_SEGUNDO) : 0;

  // Nome único para forçar o browser a recriar o keyframe (evita cache)
  const animName = pronto ? `ticker-${cW}-${tW}` : 'ticker-idle';

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: '#1a1a2e',
        color: '#f1c40f',
        overflow: 'hidden',
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        zIndex: 1500,
        borderBottom: '1px solid rgba(44,62,80,0.26)',
      }}
    >
      {pronto && (
        <style>{`
          @keyframes ${animName} {
            0%   { transform: translateX(${cW}px); }
            100% { transform: translateX(-${tW}px); }
          }
        `}</style>
      )}

      {/* Label fixo "AVISO" */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 10px',
        background: '#e67e22',
        color: '#fff',
        fontSize: '0.75em',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        gap: '5px',
        zIndex: 3,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        AVISO
      </div>

      {/* Área de rolagem */}
      <div
        ref={scrollAreaRef}
        style={{
          position: 'absolute',
          left: '82px',
          right: '32px',
          top: 0,
          bottom: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          key={animName}           /* força remount → reinicia a animação */
          ref={textRef}
          style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            fontSize: '1.05em',
            fontWeight: 500,
            color: '#f1c40f',
            willChange: 'transform',
            animation: pronto
              ? `${animName} ${duracao}s linear infinite`
              : 'none',
          }}
        >
          {textoCompleto}
        </span>
      </div>

      {/* Botão fechar */}
      <button
        onClick={() => setDispensado(true)}
        title="Fechar aviso"
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: '32px',
          background: 'rgba(0,0,0,0.3)',
          border: 'none',
          color: '#f1c40f',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1em',
          zIndex: 3,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.3)'}
      >
        ×
      </button>
    </div>
  );
}
