import React, { useState, useEffect } from 'react';
import { useDraftManager } from '../hooks/useDraftManager';

// ── Responsividade ─────────────────────────────────────────────────────────
function useIsMobile(bp = 768) {
  const [v, setV] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setV(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return v;
}

// ── Ícones SVG ─────────────────────────────────────────────────────────────
const icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  box: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  queue: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  copy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  fitment: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" />
    </svg>
  ),
  promocoes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  monitor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  question: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  posVenda: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.75 12 19.79 19.79 0 0 1 1.69 3.37 2 2 0 0 1 3.68 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.66a16 16 0 0 0 6.29 6.29l1.01-1.01a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  catalogo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  qualidade: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  image: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  mass: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <path d="M3 9h18" /><path d="M9 21V9" />
    </svg>
  ),
  apiClient: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  dimensoes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <line x1="12" y1="22" x2="12" y2="12" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05" />
    </svg>
  ),
  planilha: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  productAds: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  menu: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  draft: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
};

// ── Labels de página ───────────────────────────────────────────────────────
const pageTitles = {
  adminPanel: 'Painel Super Admin',
  agendadorTarefas: 'Agendador de Tarefas',
  home: 'Início',
  produtosErp: 'Produtos do ERP',
  cadastramentoMassa: 'Cadastramento em Massa com IA',
  gerenciadorML: 'Gerenciador ML',
  criarAnuncio: 'Criar Anúncio',
  replicadorAnuncio: 'Replicador de Anúncio',
  configuracoes: 'Configurações API',
  fila: 'Gerenciador de Fila',
  compatibilidade: 'Compatibilidade de Autopeças',
  centralPromocoes: 'Central de Promoções',
  monitorConcorrentes: 'Monitor de Anúncios Concorrentes',
  perguntasPreVenda: 'Perguntas Pré-Venda',
  posVenda: 'Pós-Venda (Mensagens & Reclamações)',
  catalogo: 'Catálogo',
  qualidadePublicacoes: 'Qualidade das Publicações (Ficha Técnica)',
  dimensoesEmbalagem: 'Dimensões de Embalagem',
  corretorPrecoPlanilha: 'Corretor de Preço (Planilha)',
  planejadorProductAds: 'Planejador de Product Ads',
  otimizadorImagens: 'Otimizador de Imagens',
  clienteAPI: 'Cliente API (ML & Tiny)',
  rascunhos: 'Rascunhos de Cadastro',
};

// ── Componente principal ───────────────────────────────────────────────────
export default function DashboardLayout({ children, setActivePage, activePage, onLogout, canAccess, impersonating, role, usuarioId }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const isSuperAdmin = role === 'SUPER_ADMIN' && !impersonating;
  const { drafts } = useDraftManager(usuarioId);

  // No desktop: sidebar colapsa quando não está em hover
  const collapsed = !isMobile && !sidebarHovered;
  const sidebarWidth = isMobile ? 240 : (collapsed ? 60 : 240);

  // Fecha drawer ao mudar de página no mobile
  const handleNavigate = (id) => {
    setActivePage(id);
    if (isMobile) setDrawerOpen(false);
  };

  // Fecha drawer ao pressionar ESC
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // Fecha drawer ao redimensionar para desktop
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // Bloqueia scroll do body quando drawer aberto
  useEffect(() => {
    document.body.style.overflow = (isMobile && drawerOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, drawerOpen]);

  const allMenuItems = [
    { id: 'adminPanel',          label: 'Painel Admin',           icon: icons.shield },
    { id: 'agendadorTarefas',    label: 'Agendador de Tarefas',   icon: icons.clock },
    { id: 'home',                label: 'Início',                 icon: icons.home },
    { id: 'produtosErp',         label: 'Produtos do ERP',        icon: icons.box },
    { id: 'cadastramentoMassa',  label: 'Cadastro em Massa (IA)', icon: icons.mass },
    { id: 'gerenciadorML',       label: 'Gerenciador ML',         icon: icons.list },
    { id: 'replicadorAnuncio',   label: 'Replicador de Anúncio',  icon: icons.copy },
    { id: 'compatibilidade',     label: 'Compatibilidade',        icon: icons.fitment },
    { id: 'centralPromocoes',    label: 'Central de Promoções',   icon: icons.promocoes },
    { id: 'monitorConcorrentes', label: 'Monitor de Concorrentes',icon: icons.monitor },
    { id: 'perguntasPreVenda',   label: 'Perguntas Pré-Venda',    icon: icons.question },
    { id: 'posVenda',            label: 'Pós-Venda',              icon: icons.posVenda },
    { id: 'catalogo',            label: 'Catálogo',               icon: icons.catalogo },
    { id: 'qualidadePublicacoes',label: 'Qualidade Publicações',  icon: icons.qualidade },
    { id: 'dimensoesEmbalagem',  label: 'Dimensões de Embalagem', icon: icons.dimensoes },
    { id: 'corretorPrecoPlanilha', label: 'Corretor Preço (CSV)', icon: icons.planilha },
    { id: 'planejadorProductAds',  label: 'Product Ads (IA)',    icon: icons.productAds },
    { id: 'otimizadorImagens',   label: 'Otimizador de Imagens',  icon: icons.image },
    { id: 'clienteAPI',          label: 'Cliente API',            icon: icons.apiClient },
    { id: 'configuracoes',       label: 'Configurações API',      icon: icons.settings },
    { id: 'fila',                label: 'Gerenciador de Fila',    icon: icons.queue },
    ...(drafts.length > 0 ? [{ id: 'rascunhos', label: `Rascunhos (${drafts.length})`, icon: icons.draft }] : []),
  ];

  const menuItems = canAccess ? allMenuItems.filter(i => canAccess(i.id) || i.id === 'rascunhos') : allMenuItems;

  // ── Sidebar interna
  const SidebarContent = () => (
    <>
      {/* Header logo */}
      <div style={{
        padding: collapsed ? '16px 0' : '16px 15px',
        borderBottom: '1px solid #3a5068',
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
        overflow: 'hidden',
        transition: 'padding 0.25s ease',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: isSuperAdmin
            ? 'linear-gradient(135deg, #8e44ad, #6c3483)'
            : 'linear-gradient(135deg, #e67e22, #f1c40f)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {isSuperAdmin ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          ) : (
            <img src="/logo.png" alt="MELIUNLOCKER" style={{ width: 52, height: 52, objectFit: 'contain' }} />
          )}
        </div>

        {/* Nome e botão fechar — ocultos quando colapsado */}
        <span style={{
          fontSize: '1.1em', fontWeight: 600, color: '#ecf0f1', flex: 1,
          whiteSpace: 'nowrap', overflow: 'hidden',
          opacity: collapsed ? 0 : 1,
          transition: 'opacity 0.15s ease',
          width: collapsed ? 0 : 'auto',
        }}>
          {isSuperAdmin ? 'Admin Panel' : 'MELIUNLOCKER'}
        </span>

        {/* Botão fechar no mobile */}
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: 'none', border: 'none', color: '#7f8c8d',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
              borderRadius: 6, transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ecf0f1'}
            onMouseLeave={e => e.currentTarget.style.color = '#7f8c8d'}
          >
            {icons.close}
          </button>
        )}
      </div>

      {/* Menu items */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {menuItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                padding: collapsed ? '11px 0' : (isMobile ? '14px 20px' : '11px 20px'),
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: isActive ? '#ffffff' : '#bdc3c7',
                fontSize: isMobile ? '0.95em' : '0.9em',
                borderLeft: `4px solid ${isActive ? '#f1c40f' : 'transparent'}`,
                backgroundColor: isActive ? '#e67e22' : 'transparent',
                fontWeight: isActive ? 500 : 400,
                cursor: 'pointer',
                transition: 'background-color 0.15s, color 0.15s, padding 0.25s',
                border: 'none', width: '100%', textAlign: 'left',
                fontFamily: 'inherit', borderRight: 'none',
                borderTop: 'none', borderBottom: 'none',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#34495e';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#bdc3c7';
                }
              }}
            >
              <span style={{
                marginRight: collapsed ? 0 : 10,
                width: 18, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: isActive ? '#ffffff' : '#7f8c8d',
                flexShrink: 0, transition: 'color 0.15s, margin 0.25s',
              }}>
                {item.icon}
              </span>
              <span style={{
                whiteSpace: 'nowrap', overflow: 'hidden',
                opacity: collapsed ? 0 : 1,
                maxWidth: collapsed ? 0 : 200,
                transition: 'opacity 0.15s ease, max-width 0.25s ease',
              }}>
                {item.label}
              </span>
            </button>
          );
        })}

        {!isSuperAdmin && activePage === 'criarAnuncio' && (
          <button
            onClick={() => handleNavigate('criarAnuncio')}
            title={collapsed ? 'Criar Anúncio' : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              padding: collapsed ? '11px 0' : '11px 20px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: '#ffffff', fontSize: '0.9em',
              borderLeft: '4px solid #f1c40f',
              backgroundColor: '#e67e22', fontWeight: 500,
              cursor: 'pointer', border: 'none', width: '100%',
              textAlign: 'left', fontFamily: 'inherit',
              transition: 'padding 0.25s',
            }}
          >
            <span style={{ marginRight: collapsed ? 0 : 10, width: 18, display: 'flex', color: '#ffffff', flexShrink: 0 }}>
              {icons.plus}
            </span>
            <span style={{
              whiteSpace: 'nowrap', overflow: 'hidden',
              opacity: collapsed ? 0 : 1,
              maxWidth: collapsed ? 0 : 200,
              transition: 'opacity 0.15s ease, max-width 0.25s ease',
            }}>
              Criar Anúncio
            </span>
          </button>
        )}
      </div>

      {/* Footer: user + logout */}
      <div style={{
        padding: collapsed ? '14px 0' : '14px 16px',
        borderTop: '1px solid #3a5068',
        flexShrink: 0,
        transition: 'padding 0.25s ease',
        overflow: 'hidden',
      }}>
        {/* Info usuário — só quando expandido */}
        <div style={{
          marginBottom: collapsed ? 0 : 10,
          height: collapsed ? 0 : 'auto',
          overflow: 'hidden',
          opacity: collapsed ? 0 : 1,
          transition: 'opacity 0.15s ease, height 0.25s ease, margin 0.25s ease',
          display: 'flex', alignItems: 'center',
          color: '#bdc3c7', gap: 8, fontSize: '0.85em',
        }}>
          <span style={{ color: '#7f8c8d', display: 'flex', flexShrink: 0 }}>{icons.user}</span>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {impersonating ? impersonating.targetUser?.email : 'Usuário'}
            </span>
            {isSuperAdmin && (
              <span style={{ fontSize: '0.78em', color: '#8e44ad', fontWeight: 600 }}>Super Admin</span>
            )}
          </div>
        </div>
        <button
          onClick={onLogout}
          title={collapsed ? 'Sair' : undefined}
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'center',
            padding: collapsed ? '8px 0' : (isMobile ? '10px' : '8px 10px'),
            backgroundColor: '#c0392b', color: 'white',
            borderRadius: 4, fontSize: '0.9em', border: 'none',
            cursor: 'pointer', width: '100%', gap: collapsed ? 0 : 6,
            fontFamily: 'inherit', transition: 'background-color 0.2s, padding 0.25s',
          }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = '#e74c3c'}
          onMouseOut={e => e.currentTarget.style.backgroundColor = '#c0392b'}
        >
          {icons.logout}
          <span style={{
            whiteSpace: 'nowrap', overflow: 'hidden',
            opacity: collapsed ? 0 : 1,
            maxWidth: collapsed ? 0 : 100,
            transition: 'opacity 0.15s ease, max-width 0.25s ease',
          }}>
            Sair
          </span>
        </button>
      </div>
    </>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      overflow: 'hidden', backgroundColor: '#f4f6f8',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    }}>

      {/* Banner impersonação */}
      {impersonating && (
        <div style={{
          backgroundColor: role === 'SUPER_ADMIN' ? '#8e44ad' : '#e67e22',
          color: 'white', padding: isMobile ? '7px 12px' : '8px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, fontSize: isMobile ? '0.78em' : '0.88em',
          fontWeight: 600, flexShrink: 0, zIndex: 2000, flexWrap: 'wrap',
          textAlign: 'center',
        }}>
          {role === 'SUPER_ADMIN' ? icons.shield : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
          <span>
            {role === 'SUPER_ADMIN' ? 'Super Admin' : 'Modo Suporte'}:{' '}
            <strong>{impersonating.targetUser?.email}</strong>
          </span>
          <button
            onClick={onLogout}
            style={{
              padding: '3px 10px',
              backgroundColor: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 4, color: 'white', cursor: 'pointer',
              fontSize: '0.9em', fontFamily: 'inherit',
            }}
          >
            Sair
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>

        {/* ── OVERLAY (mobile drawer) ── */}
        {isMobile && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1100,
              backgroundColor: 'rgba(0,0,0,0.55)',
              animation: 'fadeInUp 0.2s ease',
            }}
          />
        )}

        {/* ── SIDEBAR ── */}
        <nav
          onMouseEnter={() => { if (!isMobile) setSidebarHovered(true); }}
          onMouseLeave={() => { if (!isMobile) setSidebarHovered(false); }}
          style={{
            width: sidebarWidth,
            minWidth: sidebarWidth,
            backgroundColor: '#2d3e50',
            color: '#ecf0f1',
            display: 'flex', flexDirection: 'column',
            height: '100%',
            boxShadow: isMobile ? '4px 0 20px rgba(0,0,0,0.4)' : '2px 0 8px rgba(0,0,0,0.15)',
            zIndex: 1200,
            overflow: 'hidden',
            transition: 'width 0.25s ease, min-width 0.25s ease',
            // Mobile: drawer fixo, desliza da esquerda
            ...(isMobile ? {
              position: 'fixed', top: 0, bottom: 0, left: 0,
              width: 240, minWidth: 240,
              transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            } : {}),
          }}
        >
          <SidebarContent />
        </nav>

        {/* ── CONTEÚDO ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 0,
        }}>

          {/* Header */}
          <header style={{
            backgroundColor: '#ffffff',
            padding: isMobile ? '0 14px' : '0 25px',
            borderBottom: '1px solid #e0e0e0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
            height: isMobile ? 54 : 60,
            boxSizing: 'border-box', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 0 }}>
              {/* Botão hamburguer — só no mobile */}
              {isMobile && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  style={{
                    background: 'none', border: 'none',
                    color: '#34495e', cursor: 'pointer',
                    padding: '4px', display: 'flex', alignItems: 'center',
                    borderRadius: 6, transition: 'background 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  aria-label="Abrir menu"
                >
                  {icons.menu}
                </button>
              )}
              <h1 style={{
                margin: 0,
                fontSize: isMobile ? '1em' : '1.5em',
                color: '#34495e', fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: isMobile ? 'calc(100vw - 140px)' : 'none',
              }}>
                {pageTitles[activePage] || activePage}
              </h1>
            </div>

            {/* Versão — oculta em telas muito pequenas */}
            {!isMobile && (
              <div style={{
                fontSize: '0.85em', color: '#555',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
                MELIUNLOCKER v1.0
              </div>
            )}
          </header>

          {/* Conteúdo principal */}
          <main style={{
            flex: 1,
            padding: isMobile ? '14px 10px' : '20px 12px',
            overflowY: 'auto', overflowX: 'auto',
            backgroundColor: '#f4f6f8', minHeight: 0,
            position: 'relative', zIndex: 0,
          }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
