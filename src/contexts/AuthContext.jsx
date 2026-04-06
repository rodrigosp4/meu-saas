import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RECURSOS_SISTEMA } from '../constants/recursos';

// Permissões padrão por perfil
const PERMISSIONS_BY_ROLE = {
  SUPER_ADMIN: ['*'],
  OWNER: ['*'],
  SUPPORT: ['*'],
  OPERATOR: [
    'home', 'produtosErp', 'cadastramentoMassa', 'gerenciadorML',
    'replicadorAnuncio', 'criarAnuncio', 'fila', 'compatibilidade',
    'centralPromocoes', 'monitorConcorrentes', 'perguntasPreVenda',
    'posVenda', 'catalogo', 'qualidadePublicacoes', 'otimizadorImagens',
    'dimensoesEmbalagem', 'corretorPrecoPlanilha', 'planejadorProductAds',
  ],
  VIEWER: [
    'home', 'produtosErp', 'gerenciadorML', 'fila', 'catalogo',
    'qualidadePublicacoes', 'monitorConcorrentes',
  ],
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [assinaturaVerificada, setAssinaturaVerificada] = useState(false);

  const [auth, setAuth] = useState(() => {
    try {
      const salvo = localStorage.getItem('saas_auth');
      if (!salvo) return null;
      const parsed = JSON.parse(salvo);
      // Sessão inválida: sem token ou sem user → força re-login
      if (!parsed?.token || !parsed?.user?.id) {
        localStorage.removeItem('saas_auth');
        localStorage.removeItem('saas_usuario');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // Impersonação de suporte: token temporário e dados do cliente visualizado
  const [impersonating, setImpersonatingState] = useState(() => {
    try {
      const salvo = localStorage.getItem('saas_impersonating');
      return salvo ? JSON.parse(salvo) : null;
    } catch {
      return null;
    }
  });

  // Interceptar fetch global para injetar Authorization header e tratar 401
  useEffect(() => {
    const originalFetch = window._originalFetch || window.fetch;
    if (!window._originalFetch) window._originalFetch = originalFetch;

    window.fetch = async function (url, options = {}) {
      const token = impersonating?.token || auth?.token;
      if (token && typeof url === 'string' && url.startsWith('/api')) {
        options = {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        };
      }
      const response = await originalFetch(url, options);
      if (typeof url === 'string' && url.startsWith('/api')) {
        // Token Tiny expirado — avisa sem deslogar
        if (response.status === 503) {
          const clone = response.clone();
          clone.json().then(data => {
            if (data?.tinyTokenInvalid) {
              const key = 'erp_token_alert_shown';
              if (!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, '1');
                alert('Sua conexão com o ERP (Tiny ou Bling) expirou. Vá em Configurações para reconectar.');
              }
            }
          }).catch(() => {});
        }
        // Auto-logout em caso de token SaaS inválido/expirado (exceto rotas públicas)
        if (response.status === 401 &&
            !url.includes('/api/login') && !url.includes('/api/register') &&
            !url.includes('/api/forgot-password') && !url.includes('/api/reset-password')) {
          setAuth(null);
          setImpersonatingState(null);
          localStorage.removeItem('saas_auth');
          localStorage.removeItem('saas_usuario');
          localStorage.removeItem('saas_impersonating');
        }
      }
      return response;
    };

    return () => {
      if (window._originalFetch) {
        window.fetch = window._originalFetch;
      }
    };
  }, [auth?.token, impersonating?.token]);

  const calcPermissoes = useCallback((role, permissoesCustom) => {
    if (permissoesCustom && Array.isArray(permissoesCustom) && permissoesCustom.length > 0) {
      return permissoesCustom;
    }
    return PERMISSIONS_BY_ROLE[role] || PERMISSIONS_BY_ROLE.VIEWER;
  }, []);

  const canAccess = useCallback((pageId) => {
    const isSuperAdmin = auth?.user?.role === 'SUPER_ADMIN';

    // Páginas exclusivas do SUPER_ADMIN — nunca visíveis para outros roles
    if (['adminPanel', 'agendadorTarefas'].includes(pageId)) {
      return isSuperAdmin && !impersonating;
    }

    // SUPER_ADMIN sem impersonação: só acessa páginas administrativas (nenhuma página de cliente)
    if (isSuperAdmin && !impersonating) return false;

    // Feature flags do usuário alvo (durante impersonação) ou do próprio usuário
    const featureFlags = impersonating
      ? impersonating.targetUser?.featureFlags
      : auth?.user?.featureFlags;
    if (featureFlags && featureFlags[pageId] === false) return false;

    const role = impersonating ? 'SUPPORT' : auth?.user?.role;
    const permissoesCustom = !impersonating ? auth?.user?.permissoesCustom : null;
    const perms = calcPermissoes(role, permissoesCustom);
    return perms.includes('*') || perms.includes(pageId);
  }, [auth, impersonating, calcPermissoes]);

  // Verifica se o usuário pode usar um recurso granular (ação dentro de um módulo)
  const canUseResource = useCallback((resourceId) => {
    const isSuperAdmin = auth?.user?.role === 'SUPER_ADMIN';
    if (isSuperAdmin && !impersonating) return true;

    // Verifica se o módulo pai está habilitado
    const recurso = RECURSOS_SISTEMA.find(r => r.id === resourceId);
    if (recurso?.modulo && !canAccess(recurso.modulo)) return false;

    const resourceFlags = impersonating
      ? impersonating.targetUser?.resourceFlags
      : auth?.user?.resourceFlags;
    if (resourceFlags && resourceFlags[resourceId] === false) return false;

    return true;
  }, [auth, impersonating, canAccess]);

  // Verifica status de assinatura quando usuário loga
  useEffect(() => {
    if (!auth?.token || auth?.user?.role === 'SUPER_ADMIN') {
      setAssinaturaAtiva(auth?.user?.role === 'SUPER_ADMIN');
      setAssinaturaVerificada(true);
      return;
    }
    setAssinaturaVerificada(false);
    fetch('/api/assinatura/status')
      .then(r => r.json())
      .then(data => {
        setAssinaturaAtiva(!!data.ativo);
        setAssinaturaVerificada(true);
      })
      .catch(() => {
        setAssinaturaAtiva(false);
        setAssinaturaVerificada(true);
      });
  }, [auth?.token]);

  const login = useCallback((userData, token) => {
    const authData = { user: userData, token };
    setAuth(authData);
    localStorage.setItem('saas_auth', JSON.stringify(authData));
    // Legado: manter saas_usuario para compatibilidade
    localStorage.setItem('saas_usuario', JSON.stringify({ id: userData.id, email: userData.email, tinyToken: userData.tinyToken }));
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    setImpersonatingState(null);
    setAssinaturaAtiva(false);
    setAssinaturaVerificada(false);
    localStorage.removeItem('saas_auth');
    localStorage.removeItem('saas_usuario');
    localStorage.removeItem('saas_impersonating');
  }, []);

  const setImpersonating = useCallback((targetUser, token, sessaoId) => {
    const data = { targetUser, token, sessaoId };
    setImpersonatingState(data);
    localStorage.setItem('saas_impersonating', JSON.stringify(data));
  }, []);

  const stopImpersonating = useCallback(() => {
    setImpersonatingState(null);
    localStorage.removeItem('saas_impersonating');
  }, []);

  // Usuário efetivo para os componentes legados
  const usuarioAtual = impersonating
    ? { id: impersonating.targetUser.id, email: impersonating.targetUser.email }
    : auth?.user
    ? { id: auth.user.id, email: auth.user.email, tinyToken: auth.user.tinyToken }
    : null;

  return (
    <AuthContext.Provider
      value={{
        auth,
        impersonating,
        usuarioAtual,
        login,
        logout,
        setImpersonating,
        stopImpersonating,
        canAccess,
        canUseResource,
        isLoggedIn: !!auth,
        role: auth?.user?.role || null,
        assinaturaAtiva,
        assinaturaVerificada,
        recarregarAssinatura: () => {
          setAssinaturaVerificada(false);
          fetch('/api/assinatura/status')
            .then(r => r.json())
            .then(data => { setAssinaturaAtiva(!!data.ativo); setAssinaturaVerificada(true); })
            .catch(() => { setAssinaturaAtiva(false); setAssinaturaVerificada(true); });
        },
        PERMISSIONS_BY_ROLE,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
