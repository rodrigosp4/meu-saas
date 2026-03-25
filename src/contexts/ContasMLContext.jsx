import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const ContasMLContext = createContext(null);

export function ContasMLProvider({ children }) {
  const { usuarioAtual, auth, impersonating } = useAuth();
  const [contas, setContas] = useState([]);
  const [tinyToken, setTinyToken] = useState(null);
  const [tinyPlano, setTinyPlano] = useState('descontinuado');
  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    const uid = usuarioAtual?.id;
    if (!uid) return;
    const token = impersonating?.token || auth?.token;
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/usuario/${uid}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setContas(data.contasML || []);
      setTinyToken(data.tinyToken || null);
      setTinyPlano(data.tinyPlano || 'descontinuado');
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [usuarioAtual?.id, impersonating?.token, auth?.token]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return (
    <ContasMLContext.Provider value={{ contas, tinyToken, tinyPlano, loading, refresh: fetchConfig }}>
      {children}
    </ContasMLContext.Provider>
  );
}

export function useContasML() {
  const ctx = useContext(ContasMLContext);
  if (!ctx) throw new Error('useContasML deve ser usado dentro de ContasMLProvider');
  return ctx;
}
