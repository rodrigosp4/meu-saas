import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
  fontFamily: 'inherit',
};

export default function SuporteClienteSelector() {
  const { logout, setImpersonating } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [selecionando, setSelecionando] = useState(null);

  const carregar = async () => {
    setLoading(true);
    setErro('');
    try {
      const res = await fetch('/api/suporte/clientes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setClientes(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const handleSelecionar = async (cliente) => {
    setSelecionando(cliente.id);
    setErro('');
    try {
      const res = await fetch(`/api/suporte/acessar/${cliente.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setImpersonating(data.targetUser, data.token, data.sessaoId);
    } catch (err) {
      setErro(err.message);
      setSelecionando(null);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#2c3e50',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    }}>
      <div style={{
        backgroundColor: '#34495e',
        padding: '30px 40px',
        borderRadius: '8px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        width: '480px',
        maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #e67e22, #f1c40f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 style={{ color: '#ecf0f1', margin: 0, fontSize: '1.25em' }}>Modo Suporte</h2>
        </div>
        <p style={{ color: '#95a5a6', fontSize: '0.87em', marginBottom: '22px' }}>
          Selecione o cliente que deseja visualizar:
        </p>

        {erro && <p style={{ color: '#e74c3c', marginBottom: '12px', fontSize: '0.9em' }}>{erro}</p>}

        {loading && (
          <p style={{ color: '#bdc3c7', textAlign: 'center', padding: '16px 0' }}>Carregando...</p>
        )}

        {!loading && clientes.length === 0 && (
          <div style={{
            padding: '20px',
            backgroundColor: '#2c3e50',
            borderRadius: '6px',
            textAlign: 'center',
            color: '#95a5a6',
            fontSize: '0.9em',
            marginBottom: '16px',
          }}>
            Nenhum cliente autorizou o acesso de suporte no momento.
          </div>
        )}

        <div style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '16px' }}>
          {clientes.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelecionar(c)}
              disabled={selecionando === c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '12px 16px',
                marginBottom: '8px',
                backgroundColor: '#2c3e50',
                border: '1px solid #3a5068',
                borderRadius: '6px',
                color: '#ecf0f1',
                cursor: selecionando ? 'not-allowed' : 'pointer',
                fontSize: '0.9em',
                fontFamily: 'inherit',
                transition: 'background-color 0.2s',
                opacity: selecionando && selecionando !== c.id ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!selecionando) e.currentTarget.style.backgroundColor = '#3a5068'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2c3e50'; }}
            >
              <span style={{ fontWeight: 500 }}>
                {selecionando === c.id ? 'Acessando...' : c.email}
              </span>
              <span style={{ color: '#95a5a6', fontSize: '0.8em', flexShrink: 0 }}>
                Expira: {new Date(c.suporteExpira).toLocaleString('pt-BR')}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={carregar}
            disabled={loading}
            style={{ ...btnStyle, flex: 1, backgroundColor: '#2980b9' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3498db')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2980b9')}
          >
            Atualizar
          </button>
          <button
            onClick={logout}
            style={{ ...btnStyle, flex: 1, backgroundColor: '#c0392b' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e74c3c')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#c0392b')}
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
