import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.erro);
      
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
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
        {/* Logo / Título */}
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
        
        <h2 style={{ color: '#ecf0f1', marginBottom: '25px', fontSize: '1.4em', fontWeight: 600 }}>
          Painel Administrativo
        </h2>

        {error && (
          <p style={{ color: '#e74c3c', marginBottom: '15px', fontSize: '0.9em' }}>
            {error}
          </p>
        )}

        <div onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          {/* Campo E-mail */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em', color: '#bdc3c7' }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              style={{
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
              }}
              onFocus={(e) => e.target.style.borderColor = '#e67e22'}
              onBlur={(e) => e.target.style.borderColor = '#7f8c8d'}
            />
          </div>

          {/* Campo Senha */}
          <div style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em', color: '#bdc3c7' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
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
              }}
              onFocus={(e) => e.target.style.borderColor = '#e67e22'}
              onBlur={(e) => e.target.style.borderColor = '#7f8c8d'}
            />
          </div>

          {/* Botão Entrar */}
          <button
            type="button"
            onClick={handleSubmit}
            style={{
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
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#d35400'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#e67e22'}
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}
