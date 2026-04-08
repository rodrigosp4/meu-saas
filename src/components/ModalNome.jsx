import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function ModalNome({ onClose }) {
  const { updateUser } = useAuth();
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSalvar = async (e) => {
    e.preventDefault();
    const trimmed = nome.trim();
    if (!trimmed) return setError('Digite seu nome.');
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/usuario/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao salvar nome.');
      updateUser({ nome: data.nome });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0a1628',
        border: '1px solid rgba(241,196,15,0.25)',
        borderRadius: 16,
        padding: '36px 32px',
        width: 380,
        maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #F5C518, #e6b800)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 0 20px rgba(241,196,15,0.4)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="#0a1628" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#0a1628" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.2em', fontWeight: 700, color: '#fff' }}>
            Como podemos te chamar?
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: '0.85em', color: 'rgba(255,255,255,0.45)' }}>
            Adicione seu nome para personalizar sua experiência.
          </p>
        </div>

        <form onSubmit={handleSalvar}>
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Seu nome"
            autoFocus
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(241,196,15,0.4)',
              borderRadius: 10,
              color: '#fff',
              fontSize: '0.95em',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />
          {error && (
            <p style={{ margin: '0 0 10px', fontSize: '0.83em', color: '#ff7675' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: loading ? 'rgba(241,196,15,0.4)' : 'linear-gradient(135deg, #F5C518, #e6b800)',
              border: 'none', borderRadius: 10,
              color: '#0a1628', fontWeight: 700, fontSize: '0.95em',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 10,
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%', padding: '10px',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              color: 'rgba(255,255,255,0.4)',
              fontSize: '0.85em',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Pular por agora
          </button>
        </form>
      </div>
    </div>
  );
}
