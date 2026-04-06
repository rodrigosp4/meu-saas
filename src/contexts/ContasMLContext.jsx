import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const ContasMLContext = createContext(null);

export function ContasMLProvider({ children }) {
  const { usuarioAtual, auth, impersonating } = useAuth();
  const [contas, setContas] = useState([]);
  const [tinyToken, setTinyToken] = useState(null);
  const [tinyConectado, setTinyConectado] = useState(false);
  const [tinyPlano, setTinyPlano] = useState('descontinuado');
  const [blingConectado, setBlingConectado] = useState(false);
  const [erpAtivo, setErpAtivo] = useState(null); // 'tiny' | 'bling' | null
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
      setTinyConectado(!!data.tinyConectado);
      setTinyPlano(data.tinyPlano || 'descontinuado');
      setBlingConectado(!!data.blingConectado);
      setErpAtivo(data.erpAtivo || null);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [usuarioAtual?.id, impersonating?.token, auth?.token]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ERP conectado e ativo (qualquer um)
  const erpConectado = erpAtivo !== null && (tinyConectado || blingConectado);
  const nomeErp = erpAtivo === 'bling' ? 'Bling' : 'Tiny';

  return (
    <ContasMLContext.Provider value={{
      contas,
      tinyToken,
      tinyConectado,
      tinyPlano,
      blingConectado,
      erpAtivo,
      erpConectado,
      nomeErp,
      loading,
      refresh: fetchConfig,
    }}>
      {children}
    </ContasMLContext.Provider>
  );
}

export function useContasML() {
  const ctx = useContext(ContasMLContext);
  if (!ctx) throw new Error('useContasML deve ser usado dentro de ContasMLProvider');
  return ctx;
}
