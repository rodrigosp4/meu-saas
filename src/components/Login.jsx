import { useState } from 'react';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #7f8c8d',
  borderRadius: '4px',
  backgroundColor: '#2c3e50',
  color: '#ecf0f1',
  fontSize: '0.95em',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.3s ease',
};

const btnStyle = {
  width: '100%',
  padding: '12px',
  backgroundColor: '#e67e22',
  border: 'none',
  borderRadius: '4px',
  color: 'white',
  fontSize: '1em',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.3s ease',
  marginTop: '4px',
};

const linkStyle = {
  background: 'none',
  border: 'none',
  color: '#e67e22',
  cursor: 'pointer',
  fontSize: '0.88em',
  padding: 0,
  textDecoration: 'underline',
};

function Field({ label, type, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em', color: '#bdc3c7' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = '#e67e22')}
        onBlur={(e) => (e.target.style.borderColor = '#7f8c8d')}
      />
    </div>
  );
}

export default function Login({ onLogin, initialToken }) {
  const [mode, setMode] = useState(initialToken ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setError(''); setMessage(''); };

  const handleLogin = async (e) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    reset();
    if (password !== confirmPassword) return setError('As senhas não coincidem.');
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setMessage('Conta criada com sucesso! Faça login.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      setInviteCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setMessage(data.mensagem);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    reset();
    if (password !== confirmPassword) return setError('As senhas não coincidem.');
    setLoading(true);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: initialToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setMessage('Senha redefinida com sucesso! Faça login.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      // Remove o token da URL sem recarregar a página
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    login: 'Entrar',
    register: 'Criar Conta',
    forgot: 'Esqueci minha senha',
    reset: 'Redefinir Senha',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#2c3e50',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        margin: 0,
      }}
    >
      <div
        style={{
          backgroundColor: '#34495e',
          padding: '30px 40px',
          borderRadius: '8px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
          textAlign: 'center',
          width: '380px',
          maxWidth: '90vw',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: '8px' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #e67e22, #f1c40f)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 2px 10px rgba(230, 126, 34, 0.3)',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        <h2 style={{ color: '#ecf0f1', marginBottom: '20px', fontSize: '1.4em', fontWeight: 600 }}>
          {titles[mode]}
        </h2>

        {error && (
          <p style={{ color: '#e74c3c', marginBottom: '12px', fontSize: '0.9em' }}>{error}</p>
        )}
        {message && (
          <p style={{ color: '#2ecc71', marginBottom: '12px', fontSize: '0.9em' }}>{message}</p>
        )}

        <div style={{ textAlign: 'left' }}>
          {/* LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <Field label="E-mail" type="email" value={email} onChange={setEmail} placeholder="seu@email.com" />
              <Field label="Senha" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
              <button
                type="submit"
                disabled={loading}
                style={btnStyle}
                onMouseOver={(e) => (e.target.style.backgroundColor = '#d35400')}
                onMouseOut={(e) => (e.target.style.backgroundColor = '#e67e22')}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                <button type="button" style={linkStyle} onClick={() => { reset(); setMode('register'); }}>
                  Criar conta
                </button>
                <button type="button" style={linkStyle} onClick={() => { reset(); setMode('forgot'); }}>
                  Esqueci minha senha
                </button>
              </div>
            </form>
          )}

          {/* REGISTER */}
          {mode === 'register' && (
            <form onSubmit={handleRegister}>
              <Field label="E-mail" type="email" value={email} onChange={setEmail} placeholder="seu@email.com" />
              <Field label="Senha" type="password" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" />
              <Field label="Confirmar senha" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
              <Field label="Código de convite" type="text" value={inviteCode} onChange={setInviteCode} placeholder="Insira o código de convite" />
              <button
                type="submit"
                disabled={loading}
                style={btnStyle}
                onMouseOver={(e) => (e.target.style.backgroundColor = '#d35400')}
                onMouseOut={(e) => (e.target.style.backgroundColor = '#e67e22')}
              >
                {loading ? 'Criando...' : 'Criar conta'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button type="button" style={linkStyle} onClick={() => { reset(); setMode('login'); }}>
                  Já tenho conta
                </button>
              </div>
            </form>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <Field label="E-mail" type="email" value={email} onChange={setEmail} placeholder="seu@email.com" />
              <button
                type="submit"
                disabled={loading}
                style={btnStyle}
                onMouseOver={(e) => (e.target.style.backgroundColor = '#d35400')}
                onMouseOut={(e) => (e.target.style.backgroundColor = '#e67e22')}
              >
                {loading ? 'Enviando...' : 'Enviar instruções'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button type="button" style={linkStyle} onClick={() => { reset(); setMode('login'); }}>
                  Voltar ao login
                </button>
              </div>
            </form>
          )}

          {/* RESET PASSWORD */}
          {mode === 'reset' && (
            <form onSubmit={handleReset}>
              <Field label="Nova senha" type="password" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" />
              <Field label="Confirmar nova senha" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
              <button
                type="submit"
                disabled={loading}
                style={btnStyle}
                onMouseOver={(e) => (e.target.style.backgroundColor = '#d35400')}
                onMouseOut={(e) => (e.target.style.backgroundColor = '#e67e22')}
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
