import { useState, useEffect, useRef, useCallback } from 'react';

// ── Hook de responsividade ─────────────────────────────────────────────────
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [breakpoint]);
  return isMobile;
}

// ── Dados ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '📋',
    title: 'Gerenciador de Anúncios',
    desc: 'Visualize, edite e gerencie todos os seus anúncios do Mercado Livre em um só lugar. Filtros avançados e ações em massa.',
    color: '#3498db',
  },
  {
    icon: '🔁',
    title: 'Replicador de Anúncios',
    desc: 'Replique anúncios entre contas com um clique. Economize horas de trabalho manual mantendo consistência total.',
    color: '#9b59b6',
  },
  {
    icon: '🏷️',
    title: 'Central de Promoções',
    desc: 'Crie e gerencie promoções, descontos e ofertas relâmpago para aumentar suas vendas nos momentos certos.',
    color: '#e67e22',
  },
  {
    icon: '🕵️',
    title: 'Monitor de Concorrentes',
    desc: 'Acompanhe os preços dos seus concorrentes em tempo real e tome decisões estratégicas com dados precisos.',
    color: '#e74c3c',
  },
  {
    icon: '💬',
    title: 'Perguntas Pré-Venda',
    desc: 'Responda perguntas de compradores automaticamente com inteligência artificial. Nunca perca uma venda por falta de resposta.',
    color: '#1abc9c',
  },
  {
    icon: '📦',
    title: 'Catálogo ML',
    desc: 'Gerencie sua participação no catálogo do Mercado Livre, analise oportunidades e otimize suas posições.',
    color: '#f39c12',
  },
  {
    icon: '✅',
    title: 'Qualidade de Publicações',
    desc: 'Identifique e corrija problemas nos seus anúncios automaticamente. Melhore seu ranking e visibilidade.',
    color: '#27ae60',
  },
  {
    icon: '🖼️',
    title: 'Otimizador de Imagens',
    desc: 'Otimize as imagens dos seus anúncios para melhor desempenho. Redimensionamento e melhoria automática.',
    color: '#2980b9',
  },
  {
    icon: '🚗',
    title: 'Compatibilidade Autopeças',
    desc: 'Gerencie tabelas de compatibilidade para peças automotivas de forma rápida e precisa.',
    color: '#8e44ad',
  },
  {
    icon: '📬',
    title: 'Pós-Venda',
    desc: 'Gerencie reclamações, avaliações e atendimento pós-venda para manter sua reputação impecável.',
    color: '#16a085',
  },
  {
    icon: '📏',
    title: 'Dimensões de Embalagem',
    desc: 'Cadastre e gerencie dimensões de embalagem em massa para reduzir custos de frete.',
    color: '#d35400',
  },
  {
    icon: '🚀',
    title: 'Cadastramento em Massa',
    desc: 'Publique centenas de anúncios de uma vez através de planilhas. Agilize seu processo de catalogação.',
    color: '#c0392b',
  },
];

const STATS = [
  { value: '50+', label: 'Ferramentas integradas' },
  { value: '24/7', label: 'Sincronização automática' },
  { value: '100%', label: 'API oficial ML' },
  { value: '∞', label: 'Anúncios gerenciados' },
];

const STEPS = [
  {
    num: '01',
    title: 'Conecte sua conta',
    desc: 'Vincule sua conta do Mercado Livre com segurança via OAuth. Sem precisar compartilhar senhas.',
    icon: '🔗',
  },
  {
    num: '02',
    title: 'Sincronize seus dados',
    desc: 'Todos os seus anúncios, pedidos e métricas são importados automaticamente em segundos.',
    icon: '⚡',
  },
  {
    num: '03',
    title: 'Turbine suas vendas',
    desc: 'Use as ferramentas para otimizar, monitorar e escalar suas operações no Mercado Livre.',
    icon: '📈',
  },
];

// ── Componentes ────────────────────────────────────────────────────────────
function NavBar({ onLoginClick, onAssinarClick }) {
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const navLinkStyle = {
    color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: '0.9em', transition: 'color 0.2s',
  };

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: isMobile ? '12px 16px' : '14px 32px',
      background: scrolled ? 'rgba(6,13,26,0.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(241,196,15,0.1)' : '1px solid transparent',
      transition: 'all 0.4s ease',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/logo.png" alt="MELI UNLOCKER"
          style={{ height: isMobile ? 52 : 64, filter: 'drop-shadow(0 2px 6px rgba(241,196,15,0.4))' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
        {!isMobile && (
          <>
            <a href="#features" style={navLinkStyle}
              onMouseEnter={e => e.target.style.color = '#F5C518'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.65)'}
            >Funcionalidades</a>
            <a href="#how-it-works" style={navLinkStyle}
              onMouseEnter={e => e.target.style.color = '#F5C518'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.65)'}
            >Como funciona</a>
            <a href="#pricing" style={navLinkStyle}
              onMouseEnter={e => e.target.style.color = '#F5C518'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.65)'}
            >Planos</a>
          </>
        )}
        {/* Botão Assinar */}
        <button
          onClick={onAssinarClick}
          style={{
            background: 'transparent',
            border: '1px solid rgba(241,196,15,0.55)', borderRadius: 8,
            padding: isMobile ? '7px 14px' : '8px 18px',
            color: '#F5C518', fontWeight: 700,
            fontSize: isMobile ? '0.82em' : '0.88em',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(241,196,15,0.1)'; e.currentTarget.style.borderColor = '#F5C518'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(241,196,15,0.55)'; }}
        >
          Assinar
        </button>
        {/* Botão Entrar */}
        <button
          onClick={onLoginClick}
          style={{
            background: 'linear-gradient(135deg, #F5C518, #e6aa00)',
            border: 'none', borderRadius: 8,
            padding: isMobile ? '8px 18px' : '9px 22px',
            color: '#0a1628', fontWeight: 700,
            fontSize: isMobile ? '0.85em' : '0.9em',
            cursor: 'pointer', transition: 'all 0.2s',
            boxShadow: '0 4px 15px rgba(241,196,15,0.3)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(241,196,15,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(241,196,15,0.3)'; }}
        >
          Entrar
        </button>
      </div>
    </nav>
  );
}

function HeroSection({ onLoginClick }) {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => { const t = setTimeout(() => setVisible(true), 100); return () => clearTimeout(t); }, []);

  return (
    <section style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #060d1a 0%, #0a1628 50%, #0d1f3c 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: isMobile ? '90px 18px 50px' : '80px 24px 60px',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(41,128,185,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(41,128,185,0.05) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />

      {/* Orbs decorativos */}
      <div style={{
        position: 'absolute', top: '15%', right: '8%',
        width: 350, height: 350, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(241,196,15,0.1) 0%, transparent 70%)',
        animation: 'floatUp 12s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '5%',
        width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(41,128,185,0.12) 0%, transparent 70%)',
        animation: 'floatAlt 15s ease-in-out 2s infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(241,196,15,0.04) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 760 }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(241,196,15,0.1)', border: '1px solid rgba(241,196,15,0.25)',
          borderRadius: 30, padding: '6px 14px', marginBottom: isMobile ? 20 : 28,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'all 0.6s ease',
          maxWidth: '100%',
        }}>
          <span style={{ fontSize: isMobile ? 10 : 12, color: '#F5C518', fontWeight: 700, letterSpacing: isMobile ? '0.04em' : '0.1em' }}>
            ⚡ {isMobile ? 'PLATAFORMA PARA VENDEDORES ML' : 'PLATAFORMA COMPLETA PARA VENDEDORES ML'}
          </span>
        </div>

        {/* Título principal */}
        <h1 style={{
          margin: '0 0 20px',
          fontSize: 'clamp(2.2em, 5vw, 3.8em)',
          fontWeight: 900, lineHeight: 1.1,
          color: '#fff',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.7s ease 0.15s',
        }}>
          Desbloqueie todo o{' '}
          <span style={{
            background: 'linear-gradient(135deg, #F5C518 0%, #FFE033 50%, #e6aa00 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            display: 'inline-block',
          }}>
            potencial
          </span>
          <br />do seu negócio no ML
        </h1>

        {/* Subtítulo */}
        <p style={{
          fontSize: 'clamp(1em, 2vw, 1.2em)',
          color: 'rgba(255,255,255,0.6)',
          maxWidth: 560, margin: '0 auto 40px',
          lineHeight: 1.7,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.7s ease 0.3s',
        }}>
          Gerencie anúncios, monitore concorrentes, automatize respostas e escale suas vendas no Mercado Livre com uma plataforma feita para profissionais.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex', gap: 12, justifyContent: 'center',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.7s ease 0.45s',
        }}>
          <button
            onClick={onLoginClick}
            style={{
              background: 'linear-gradient(135deg, #F5C518 0%, #e6aa00 100%)',
              border: 'none', borderRadius: 12,
              padding: isMobile ? '14px 28px' : '16px 36px',
              width: isMobile ? '100%' : 'auto',
              color: '#0a1628', fontSize: isMobile ? '1em' : '1.05em', fontWeight: 800,
              cursor: 'pointer', transition: 'all 0.25s',
              boxShadow: '0 8px 30px rgba(241,196,15,0.4)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(241,196,15,0.55)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(241,196,15,0.4)'; }}
          >
            🚀 Acessar plataforma
          </button>
          <a
            href="#features"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: isMobile ? '12px 24px' : '16px 32px',
              width: isMobile ? '100%' : 'auto',
              color: 'rgba(255,255,255,0.8)', fontSize: isMobile ? '0.95em' : '1em', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.25s', textDecoration: 'none',
              display: 'inline-block', textAlign: 'center', boxSizing: 'border-box',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(241,196,15,0.3)'; e.currentTarget.style.color = '#F5C518'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
          >
            Ver funcionalidades ↓
          </a>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, auto)',
          gap: isMobile ? '20px 16px' : '0 32px',
          justifyContent: 'center',
          marginTop: isMobile ? 44 : 64,
          opacity: visible ? 1 : 0, transition: 'opacity 0.8s ease 0.6s',
        }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: isMobile ? '1.7em' : 'clamp(1.6em, 3vw, 2.2em)', fontWeight: 900,
                background: 'linear-gradient(135deg, #F5C518, #FFE033)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {s.value}
              </div>
              <div style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seta para baixo */}
      <a href="#features" style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.3)', textDecoration: 'none', fontSize: '1.4em',
        animation: 'waveFloat 2s ease-in-out infinite',
      }}>
        ↓
      </a>
    </section>
  );
}

function FeatureCard({ feature, index }) {
  const [hover, setHover] = useState(false);
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover
          ? `rgba(${hexToRgb(feature.color)}, 0.08)`
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hover ? feature.color + '55' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        padding: isMobile ? '18px 16px' : '24px 20px',
        cursor: 'default',
        transition: 'all 0.35s ease',
        transform: visible
          ? hover ? 'translateY(-4px)' : 'translateY(0)'
          : 'translateY(30px)',
        opacity: visible ? 1 : 0,
        transitionDelay: `${(index % 4) * 0.07}s`,
        boxShadow: hover ? `0 8px 30px rgba(${hexToRgb(feature.color)}, 0.15)` : 'none',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `rgba(${hexToRgb(feature.color)}, 0.15)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5em', marginBottom: 14,
        border: `1px solid rgba(${hexToRgb(feature.color)}, 0.25)`,
        transition: 'transform 0.3s',
        transform: hover ? 'scale(1.1) rotate(3deg)' : 'scale(1)',
      }}>
        {feature.icon}
      </div>
      <h3 style={{
        margin: '0 0 8px', fontSize: '0.95em', fontWeight: 700,
        color: hover ? feature.color : '#fff',
        transition: 'color 0.3s',
      }}>
        {feature.title}
      </h3>
      <p style={{ margin: 0, fontSize: '0.82em', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
        {feature.desc}
      </p>
    </div>
  );
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function FeaturesSection() {
  const isMobile = useIsMobile();
  return (
    <section id="features" style={{
      background: '#070e1c',
      padding: isMobile ? '64px 16px' : '100px 24px',
      position: 'relative',
    }}>
      {/* Linha decorativa topo */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(241,196,15,0.3), transparent)',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 40 : 64 }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(241,196,15,0.08)', border: '1px solid rgba(241,196,15,0.2)',
            borderRadius: 20, padding: '5px 16px', marginBottom: 16,
          }}>
            <span style={{ fontSize: '0.78em', color: '#F5C518', fontWeight: 700, letterSpacing: '0.12em' }}>
              FUNCIONALIDADES
            </span>
          </div>
          <h2 style={{
            margin: '0 0 16px', fontSize: 'clamp(1.8em, 3vw, 2.6em)',
            fontWeight: 900, color: '#fff',
          }}>
            Tudo que você precisa para{' '}
            <span style={{
              background: 'linear-gradient(135deg, #F5C518, #e6aa00)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              vender mais
            </span>
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '1em', maxWidth: 480, margin: '0 auto' }}>
            Mais de 15 ferramentas integradas para você dominar o Mercado Livre
          </p>
        </div>

        {/* Grid de features */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: isMobile ? 12 : 16,
        }}>
          {FEATURES.map((f, i) => <FeatureCard key={i} feature={f} index={i} />)}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="how-it-works" ref={ref} style={{
      background: 'linear-gradient(180deg, #070e1c 0%, #0a1628 100%)',
      padding: isMobile ? '64px 16px' : '100px 24px',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(41,128,185,0.3), transparent)',
      }} />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 40 : 64 }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(41,128,185,0.08)', border: '1px solid rgba(41,128,185,0.25)',
            borderRadius: 20, padding: '5px 16px', marginBottom: 16,
          }}>
            <span style={{ fontSize: '0.78em', color: '#3498db', fontWeight: 700, letterSpacing: '0.12em' }}>
              COMO FUNCIONA
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: 'clamp(1.8em, 3vw, 2.6em)', fontWeight: 900, color: '#fff' }}>
            Comece em{' '}
            <span style={{
              background: 'linear-gradient(135deg, #F5C518, #e6aa00)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              3 passos simples
            </span>
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: isMobile ? 16 : 24,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: isMobile ? '20px 16px' : '28px 24px',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateX(0)' : 'translateX(-30px)',
              transition: `all 0.6s ease ${i * 0.15}s`,
            }}>
              {/* Número */}
              <div style={{
                minWidth: isMobile ? 44 : 56, height: isMobile ? 44 : 56, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(241,196,15,0.15), rgba(241,196,15,0.05))',
                border: '1px solid rgba(241,196,15,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isMobile ? '1.1em' : '1.3em', fontWeight: 900, color: '#F5C518',
              }}>
                {step.num}
              </div>
              {/* Conteúdo */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: '1.3em' }}>{step.icon}</span>
                  <h3 style={{ margin: 0, fontSize: '1.05em', fontWeight: 700, color: '#fff' }}>
                    {step.title}
                  </h3>
                </div>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: '0.9em', lineHeight: 1.7 }}>
                  {step.desc}
                </p>
              </div>
              {/* Conector */}
              {i < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', left: 50, marginTop: 84,
                  width: 2, height: 24,
                  background: 'linear-gradient(180deg, rgba(241,196,15,0.3), transparent)',
                }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLANO_VANTAGENS = {
  '30d': [
    '✅ Acesso completo a todas as ferramentas',
    '✅ Gerenciador de anúncios ilimitado',
    '✅ Monitor de concorrentes',
    '✅ Respostas automáticas com IA',
    '✅ Sincronização automática 24/7',
    '✅ Suporte por e-mail',
  ],
  '60d': [
    '✅ Tudo do plano mensal',
    '✅ 5% de desconto no valor total',
    '✅ Relatórios avançados',
    '✅ Replicador de anúncios multi-conta',
    '✅ Central de promoções completa',
    '✅ Suporte prioritário',
  ],
  '90d': [
    '✅ Tudo do plano bimestral',
    '✅ 10% de desconto no valor total',
    '✅ Cadastramento em massa via planilha',
    '✅ Corretor de preços por planilha',
    '✅ Otimizador de imagens',
    '✅ Acesso antecipado a novas funcionalidades',
  ],
  '180d': [
    '✅ Tudo do plano trimestral',
    '✅ 15% de desconto — maior economia',
    '✅ Planejador de Product Ads',
    '✅ API de integração para desenvolvedores',
    '✅ Compatibilidade autopeças avançada',
    '✅ Suporte VIP',
  ],
};

const PLANO_META = {
  '30d':  { titulo: '30 Dias',  subtitulo: 'Mensal',         cor: '#3498db', popular: false },
  '60d':  { titulo: '60 Dias',  subtitulo: '5% de desconto', cor: '#27ae60', popular: false },
  '90d':  { titulo: '90 Dias',  subtitulo: '10% de desconto', cor: '#8e44ad', popular: true },
  '180d': { titulo: '6 Meses', subtitulo: '15% de desconto', cor: '#e67e22', popular: false },
};

function PricingSection({ onAssinarClick }) {
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetch('/api/assinatura/planos')
      .then(r => r.json())
      .then(d => setPlanos(d.planos || []))
      .catch(() => {
        // fallback com valores padrão
        const base = 299;
        setPlanos([
          { key: '30d',  label: '30 dias',              dias: 30,  desconto: 0,    valor: 299,     precoMensal: base },
          { key: '60d',  label: '60 dias (5% off)',      dias: 60,  desconto: 0.05, valor: 568.10,  precoMensal: base },
          { key: '90d',  label: '90 dias (10% off)',     dias: 90,  desconto: 0.10, valor: 807.30,  precoMensal: base },
          { key: '180d', label: '6 meses (15% off)',     dias: 180, desconto: 0.15, valor: 1524.90, precoMensal: base },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  const formatarMoeda = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

  return (
    <section id="pricing" style={{
      background: 'linear-gradient(180deg, #0a1628 0%, #070e1c 100%)',
      padding: isMobile ? '64px 16px' : '100px 24px',
      position: 'relative',
    }}>
      {/* Linha decorativa */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(241,196,15,0.3), transparent)',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 40 : 60 }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(241,196,15,0.08)', border: '1px solid rgba(241,196,15,0.2)',
            borderRadius: 20, padding: '5px 16px', marginBottom: 16,
          }}>
            <span style={{ fontSize: '0.78em', color: '#F5C518', fontWeight: 700, letterSpacing: '0.12em' }}>PLANOS E PREÇOS</span>
          </div>
          <h2 style={{ margin: '0 0 16px', fontSize: 'clamp(1.8em, 3vw, 2.6em)', fontWeight: 900, color: '#fff' }}>
            Escolha o plano{' '}
            <span style={{
              background: 'linear-gradient(135deg, #F5C518, #e6aa00)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>ideal para você</span>
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '1em', maxWidth: 500, margin: '0 auto' }}>
            Quanto mais longo o plano, maior a economia. Cancele a qualquer momento.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '40px' }}>Carregando planos...</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: isMobile ? 16 : 20,
            alignItems: 'stretch',
          }}>
            {planos.map((plano) => {
              const meta = PLANO_META[plano.key] || { titulo: plano.key, subtitulo: '', cor: '#3498db', popular: false };
              const vantagens = PLANO_VANTAGENS[plano.key] || [];
              const meses = plano.key === '180d' ? 6 : plano.dias / 30;
              const precoMes = plano.valor / meses;

              return (
                <div key={plano.key} style={{
                  position: 'relative',
                  background: meta.popular
                    ? `linear-gradient(180deg, ${meta.cor}18 0%, rgba(255,255,255,0.04) 100%)`
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${meta.popular ? meta.cor + '66' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 18,
                  padding: isMobile ? '24px 20px' : '32px 24px',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: meta.popular ? `0 0 40px ${meta.cor}22` : 'none',
                }}>
                  {/* Badge popular */}
                  {meta.popular && (
                    <div style={{
                      position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                      background: `linear-gradient(135deg, ${meta.cor}, ${meta.cor}cc)`,
                      color: '#fff', fontSize: '0.72em', fontWeight: 700,
                      padding: '4px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                    }}>
                      ⭐ MAIS POPULAR
                    </div>
                  )}

                  {/* Desconto badge */}
                  {plano.desconto > 0 && (
                    <div style={{
                      display: 'inline-flex', alignSelf: 'flex-start',
                      background: meta.cor + '22', color: meta.cor,
                      fontSize: '0.72em', fontWeight: 700, padding: '3px 10px',
                      borderRadius: 12, marginBottom: 12,
                      border: `1px solid ${meta.cor}44`,
                    }}>
                      {Math.round(plano.desconto * 100)}% OFF
                    </div>
                  )}

                  {/* Nome do plano */}
                  <div style={{ color: meta.cor, fontWeight: 800, fontSize: '1.25em', marginBottom: 4 }}>
                    {meta.titulo}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82em', marginBottom: 20 }}>
                    {meta.subtitulo}
                  </div>

                  {/* Preço */}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(1.8em, 3vw, 2.2em)' }}>
                      {formatarMoeda(plano.valor)}
                    </span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78em', marginBottom: 24 }}>
                    ≈ {formatarMoeda(precoMes)}/mês
                  </div>

                  {/* Vantagens */}
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', flex: 1 }}>
                    {vantagens.map((v, i) => (
                      <li key={i} style={{
                        color: 'rgba(255,255,255,0.7)', fontSize: '0.84em', lineHeight: 1.5,
                        marginBottom: 8, paddingLeft: 0,
                      }}>
                        {v}
                      </li>
                    ))}
                  </ul>

                  {/* Botão assinar */}
                  <button
                    onClick={onAssinarClick}
                    style={{
                      width: '100%', padding: '13px 0',
                      background: meta.popular
                        ? `linear-gradient(135deg, ${meta.cor}, ${meta.cor}cc)`
                        : 'transparent',
                      border: `2px solid ${meta.cor}`,
                      borderRadius: 10,
                      color: meta.popular ? '#fff' : meta.cor,
                      fontWeight: 700, fontSize: '0.95em',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${meta.cor}, ${meta.cor}cc)`;
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = meta.popular ? `linear-gradient(135deg, ${meta.cor}, ${meta.cor}cc)` : 'transparent';
                      e.currentTarget.style.color = meta.popular ? '#fff' : meta.cor;
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    Assinar agora →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Nota rodapé */}
        <p style={{ textAlign: 'center', marginTop: 32, color: 'rgba(255,255,255,0.25)', fontSize: '0.8em' }}>
          Pagamento seguro via MercadoPago · Acesso liberado automaticamente após confirmação
        </p>
      </div>
    </section>
  );
}

function CTASection({ onLoginClick }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} style={{
      background: '#060d1a',
      padding: isMobile ? '64px 20px' : '100px 24px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Orb central */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 300,
        background: 'radial-gradient(ellipse, rgba(241,196,15,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(241,196,15,0.25), transparent)',
      }} />

      <div style={{
        maxWidth: 600, margin: '0 auto', textAlign: 'center', position: 'relative',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'all 0.7s ease',
      }}>
        <div style={{ fontSize: '3em', marginBottom: 16 }}>🔓</div>
        <h2 style={{
          margin: '0 0 16px', fontSize: 'clamp(1.8em, 3vw, 2.6em)',
          fontWeight: 900, color: '#fff', lineHeight: 1.2,
        }}>
          Pronto para{' '}
          <span style={{
            background: 'linear-gradient(135deg, #F5C518, #e6aa00)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            desbloquear
          </span>
          {' '}seu potencial?
        </h2>
        <p style={{
          color: 'rgba(255,255,255,0.5)', fontSize: '1em', lineHeight: 1.7, marginBottom: 36,
        }}>
          Junte-se a vendedores que já estão usando o MELI UNLOCKER para automatizar e escalar suas operações no Mercado Livre.
        </p>
        <button
          onClick={onLoginClick}
          style={{
            background: 'linear-gradient(135deg, #F5C518 0%, #e6aa00 100%)',
            border: 'none', borderRadius: 14,
            padding: isMobile ? '15px 32px' : '18px 48px',
            width: isMobile ? '100%' : 'auto',
            color: '#0a1628', fontSize: isMobile ? '1em' : '1.1em', fontWeight: 800,
            cursor: 'pointer', transition: 'all 0.25s',
            boxShadow: '0 8px 30px rgba(241,196,15,0.4)',
            letterSpacing: '0.03em',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(241,196,15,0.55)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(241,196,15,0.4)'; }}
        >
          🚀 Começar agora
        </button>
      </div>
    </section>
  );
}

function Footer() {
  const isMobile = useIsMobile();
  return (
    <footer style={{
      background: '#040a14',
      padding: isMobile ? '24px 16px' : '32px 24px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      textAlign: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
        <img src="/logo.png" alt="MELI UNLOCKER"
          style={{ height: 52, filter: 'brightness(0.7)' }}
          onError={e => e.target.style.display = 'none'}
        />
      </div>
      <p style={{ margin: 0, fontSize: isMobile ? '0.72em' : '0.8em', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
        {isMobile
          ? <>© 2025 MELI UNLOCKER<br />Todos os direitos reservados</>
          : '© 2025 MELI UNLOCKER · Plataforma de gestão para Mercado Livre · Todos os direitos reservados'
        }
      </p>
    </footer>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function LandingPage({ onLoginClick }) {
  const irParaPlanos = useCallback(() => {
    const el = document.getElementById('pricing');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else onLoginClick();
  }, [onLoginClick]);

  return (
    <div style={{
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: '#fff', minHeight: '100vh',
    }}>
      <NavBar onLoginClick={onLoginClick} onAssinarClick={irParaPlanos} />
      <HeroSection onLoginClick={onLoginClick} />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection onAssinarClick={onLoginClick} />
      <CTASection onLoginClick={onLoginClick} />
      <Footer />
    </div>
  );
}
