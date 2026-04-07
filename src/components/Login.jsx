import { useState, useEffect } from 'react';

function useIsMobile(bp = 480) {
  const [m, setM] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return m;
}

// Partículas geradas no background
function Particles() {
  const particles = Array.from({ length: 22 }, (_, i) => {
    const size = Math.random() * 60 + 10;
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const duration = Math.random() * 10 + 8;
    const delay = Math.random() * 6;
    const isYellow = i % 5 === 0;
    return { id: i, size, left, top, duration, delay, isYellow };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: p.isYellow
              ? 'radial-gradient(circle, rgba(241,196,15,0.25) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(41,128,185,0.2) 0%, transparent 70%)',
            animation: `${p.id % 2 === 0 ? 'floatUp' : 'floatAlt'} ${p.duration}s ease-in-out ${p.delay}s infinite`,
            filter: 'blur(1px)',
          }}
        />
      ))}
      {/* Orbs grandes fixos */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(241,196,15,0.08) 0%, transparent 70%)',
        animation: 'floatUp 15s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(41,128,185,0.1) 0%, transparent 70%)',
        animation: 'floatAlt 18s ease-in-out 3s infinite',
      }} />
      <div style={{
        position: 'absolute', top: '40%', left: '20%',
        width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(241,196,15,0.06) 0%, transparent 70%)',
        animation: 'floatUp 12s ease-in-out 1s infinite',
      }} />
    </div>
  );
}

// Ícone de cadeado SVG animado
function LockIcon() {
  return (
    <div className="animate-lock-bounce" style={{ display: 'inline-block', marginBottom: 8 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'linear-gradient(135deg, #F5C518 0%, #e6b800 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 30px rgba(241,196,15,0.5), 0 4px 20px rgba(0,0,0,0.3)',
        margin: '0 auto',
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="11" width="14" height="10" rx="2" fill="#0a1628" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#0a1628" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1.5" fill="#F5C518" />
        </svg>
      </div>
    </div>
  );
}

function InputField({ label, type, value, onChange, placeholder, icon }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'block', marginBottom: 6,
        fontSize: '0.82em', fontWeight: 600,
        color: focused ? '#F5C518' : 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        transition: 'color 0.3s',
      }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: focused ? '#F5C518' : 'rgba(255,255,255,0.35)',
            transition: 'color 0.3s', fontSize: 16, pointerEvents: 'none',
          }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            padding: icon ? '12px 14px 12px 42px' : '12px 14px',
            background: focused
              ? 'rgba(241,196,15,0.06)'
              : 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${focused ? 'rgba(241,196,15,0.6)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 10,
            color: '#fff',
            fontSize: '0.95em',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(4px)',
          }}
        />
      </div>
    </div>
  );
}

function PrimaryButton({ children, loading, onClick, type = 'submit' }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', padding: '13px',
        background: loading
          ? 'rgba(241,196,15,0.4)'
          : hover
            ? 'linear-gradient(135deg, #FFE033 0%, #F5C518 50%, #e6aa00 100%)'
            : 'linear-gradient(135deg, #F5C518 0%, #e6b800 100%)',
        border: 'none', borderRadius: 10,
        color: '#0a1628', fontSize: '0.95em', fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        letterSpacing: '0.05em',
        transition: 'all 0.3s ease',
        transform: hover && !loading ? 'translateY(-1px)' : 'none',
        boxShadow: hover && !loading
          ? '0 8px 25px rgba(241,196,15,0.45)'
          : '0 4px 15px rgba(241,196,15,0.25)',
        marginTop: 6,
      }}
    >
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{
            width: 16, height: 16, border: '2px solid rgba(10,22,40,0.3)',
            borderTopColor: '#0a1628', borderRadius: '50%',
            animation: 'spin 0.7s linear infinite', display: 'inline-block',
          }} />
          Aguarde...
        </span>
      ) : children}
    </button>
  );
}

function LinkButton({ children, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'none', border: 'none',
        color: hover ? '#F5C518' : 'rgba(255,255,255,0.5)',
        cursor: 'pointer', fontSize: '0.85em', padding: 0,
        textDecoration: hover ? 'underline' : 'none',
        transition: 'color 0.2s',
      }}
    >
      {children}
    </button>
  );
}

export default function Login({ onLogin, initialToken, onShowLanding }) {
  const [mode, setMode] = useState(initialToken ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cupom, setCupom] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const reset = () => { setError(''); setMessage(''); };
  const switchMode = (m) => { reset(); setMode(m); };

  const handleLogin = async (e) => {
    e.preventDefault(); reset(); setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      onLogin(data.user, data.token);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault(); reset();
    if (password !== confirmPassword) return setError('As senhas não coincidem.');
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      if (cupom.trim()) {
        localStorage.setItem('cupomPendente', cupom.trim().toUpperCase());
      }
      setMessage('Conta criada! Faça login.');
      switchMode('login');
      setPassword(''); setConfirmPassword(''); setCupom('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault(); reset(); setLoading(true);
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setMessage(data.mensagem);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault(); reset();
    if (password !== confirmPassword) return setError('As senhas não coincidem.');
    setLoading(true);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: initialToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setMessage('Senha redefinida! Faça login.');
      switchMode('login');
      setPassword(''); setConfirmPassword('');
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const titles = {
    login: 'Bem-vindo de volta',
    register: 'Criar sua conta',
    forgot: 'Recuperar senha',
    reset: 'Nova senha',
  };

  const subtitles = {
    login: 'Entre na sua conta para continuar',
    register: 'Preencha os dados para começar',
    forgot: 'Enviaremos um link para seu e-mail',
    reset: 'Defina sua nova senha de acesso',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #060d1a 0%, #0a1628 40%, #0d1f3c 70%, #091525 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      padding: isMobile ? '16px' : '0',
      boxSizing: 'border-box',
    }}>
      <Particles />

      {/* Grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(41,128,185,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(41,128,185,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
      }} />

      {/* Linha horizontal brilhante */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent 0%, rgba(241,196,15,0.1) 30%, rgba(241,196,15,0.25) 50%, rgba(241,196,15,0.1) 70%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Botão voltar para landing */}
      {onShowLanding && (
        <button
          onClick={onShowLanding}
          style={{
            position: 'absolute', top: isMobile ? 14 : 24, left: isMobile ? 14 : 24,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, padding: isMobile ? '7px 12px' : '8px 16px', color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: isMobile ? '0.8em' : '0.85em', display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all 0.2s', backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(241,196,15,0.12)'; e.currentTarget.style.color = '#F5C518'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
        >
          ← Início
        </button>
      )}

      {/* Card principal */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: 420, maxWidth: isMobile ? '100%' : '92vw',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        {/* Glow atrás do card */}
        <div style={{
          position: 'absolute', inset: -2,
          borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(241,196,15,0.15), rgba(41,128,185,0.1), rgba(241,196,15,0.08))',
          filter: 'blur(12px)',
          zIndex: -1,
          animation: 'pulseGlow 3s ease-in-out infinite',
        }} />

        <div style={{
          background: 'rgba(10, 20, 40, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(241,196,15,0.15)',
          borderRadius: isMobile ? 16 : 20,
          padding: isMobile ? '28px 20px' : '40px 36px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          {/* Logo + Lock */}
          <div style={{ textAlign: 'center', marginBottom: isMobile ? 20 : 28 }}>
            <LockIcon />
            <div style={{ marginTop: 10 }}>
              <img
                src="/logo.png"
                alt="MELI UNLOCKER"
                style={{ width: isMobile ? 110 : 130, objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(241,196,15,0.3))' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          </div>

          {/* Título */}
          <div style={{ textAlign: 'center', marginBottom: isMobile ? 20 : 28 }}>
            <h2 style={{
              margin: 0, fontSize: '1.3em', fontWeight: 700, color: '#fff',
              animation: 'slideInForm 0.4s ease forwards',
            }}>
              {titles[mode]}
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '0.85em', color: 'rgba(255,255,255,0.45)' }}>
              {subtitles[mode]}
            </p>
          </div>

          {/* Mensagens */}
          {error && (
            <div style={{
              background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              color: '#ff7675', fontSize: '0.88em', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}
          {message && (
            <div style={{
              background: 'rgba(39,174,96,0.12)', border: '1px solid rgba(39,174,96,0.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              color: '#55efc4', fontSize: '0.88em', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>✓</span> {message}
            </div>
          )}

          {/* Formulários */}
          <div style={{ animation: 'slideInForm 0.35s ease forwards' }} key={mode}>

            {mode === 'login' && (
              <form onSubmit={handleLogin}>
                <InputField label="E-mail" type="email" value={email} onChange={setEmail}
                  placeholder="seu@email.com" icon="✉" />
                <InputField label="Senha" type="password" value={password} onChange={setPassword}
                  placeholder="••••••••" icon="🔑" />
                <PrimaryButton loading={loading}>Entrar na plataforma</PrimaryButton>
                <div style={{
                  display: 'flex',
                  justifyContent: isMobile ? 'center' : 'space-between',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'center',
                  gap: isMobile ? 10 : 0,
                  marginTop: 18,
                }}>
                  <LinkButton onClick={() => switchMode('register')}>Criar conta</LinkButton>
                  <LinkButton onClick={() => switchMode('forgot')}>Esqueci minha senha</LinkButton>
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister}>
                <InputField label="E-mail" type="email" value={email} onChange={setEmail}
                  placeholder="seu@email.com" icon="✉" />
                <InputField label="Senha" type="password" value={password} onChange={setPassword}
                  placeholder="Mínimo 6 caracteres" icon="🔑" />
                <InputField label="Confirmar senha" type="password" value={confirmPassword} onChange={setConfirmPassword}
                  placeholder="Repita a senha" icon="🔑" />
                <div style={{ marginBottom: 18 }}>
                  <label style={{
                    display: 'block', marginBottom: 6,
                    fontSize: '0.82em', fontWeight: 600,
                    color: 'rgba(255,255,255,0.6)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    Cupom (opcional)
                  </label>
                  <input
                    type="text"
                    value={cupom}
                    onChange={e => setCupom(e.target.value.toUpperCase())}
                    placeholder="Tem um cupom? Digite aqui"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: cupom ? 'rgba(39,174,96,0.07)' : 'rgba(255,255,255,0.05)',
                      border: `1.5px solid ${cupom ? 'rgba(39,174,96,0.5)' : 'rgba(255,255,255,0.12)'}`,
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: '0.95em',
                      outline: 'none',
                      boxSizing: 'border-box',
                      letterSpacing: '0.06em',
                      transition: 'all 0.3s ease',
                    }}
                  />
                  {cupom && (
                    <div style={{ marginTop: 6, fontSize: '0.8em', color: 'rgba(39,174,96,0.8)' }}>
                      ✓ Cupom será aplicado após o login
                    </div>
                  )}
                </div>
                <PrimaryButton loading={loading}>Criar minha conta</PrimaryButton>
                <div style={{ textAlign: 'center', marginTop: 18 }}>
                  <LinkButton onClick={() => switchMode('login')}>Já tenho conta → Entrar</LinkButton>
                </div>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgot}>
                <InputField label="E-mail" type="email" value={email} onChange={setEmail}
                  placeholder="seu@email.com" icon="✉" />
                <PrimaryButton loading={loading}>Enviar instruções</PrimaryButton>
                <div style={{ textAlign: 'center', marginTop: 18 }}>
                  <LinkButton onClick={() => switchMode('login')}>← Voltar ao login</LinkButton>
                </div>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset}>
                <InputField label="Nova senha" type="password" value={password} onChange={setPassword}
                  placeholder="Mínimo 6 caracteres" icon="🔑" />
                <InputField label="Confirmar nova senha" type="password" value={confirmPassword} onChange={setConfirmPassword}
                  placeholder="Repita a senha" icon="🔑" />
                <PrimaryButton loading={loading}>Redefinir senha</PrimaryButton>
              </form>
            )}
          </div>

          {/* Rodapé */}
          <div style={{
            marginTop: 28, paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.25)' }}>
              🔒 Conexão segura · MELI UNLOCKER © 2025
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
