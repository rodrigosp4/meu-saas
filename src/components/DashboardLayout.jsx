import React from 'react';

// Ícones SVG inline para não depender de Font Awesome CDN
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
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  ),
};

// Mapa de labels bonitos para o header
const pageTitles = {
  home: 'Início',
  produtosErp: 'Produtos do ERP',
  cadastramentoMassa: 'Cadastramento em Massa com IA', // <-- NOVA LINHA
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
  otimizadorImagens: 'Otimizador de Imagens',
};

export default function DashboardLayout({ children, setActivePage, activePage, onLogout }) {

  // Itens do menu principal
  const menuItems = [
    { id: 'home',            label: 'Início',              icon: icons.home },
    { id: 'produtosErp',     label: 'Produtos do ERP',     icon: icons.box },
    { id: 'cadastramentoMassa', label: 'Cadastro em Massa (IA)', icon: icons.mass }, // <-- NOVA LINHA
    { id: 'gerenciadorML',   label: 'Gerenciador ML',      icon: icons.list },
    { id: 'replicadorAnuncio', label: 'Replicador de Anúncio', icon: icons.copy },
    { id: 'compatibilidade', label: 'Compatibilidade',      icon: icons.fitment },
    { id: 'centralPromocoes',    label: 'Central de Promoções',         icon: icons.promocoes },
    { id: 'monitorConcorrentes', label: 'Monitor de Concorrentes',       icon: icons.monitor },
    { id: 'perguntasPreVenda',   label: 'Perguntas Pré-Venda',          icon: icons.question },
    { id: 'posVenda',            label: 'Pós-Venda',                    icon: icons.posVenda },
    { id: 'catalogo',            label: 'Catálogo',                     icon: icons.catalogo },
    { id: 'qualidadePublicacoes', label: 'Qualidade Publicações',        icon: icons.qualidade },
    { id: 'otimizadorImagens',   label: 'Otimizador de Imagens',        icon: icons.image },
    { id: 'configuracoes',       label: 'Configurações API',             icon: icons.settings },
    { id: 'fila',            label: 'Gerenciador de Fila',  icon: icons.queue },
  ];

  // Estilo base do item do menu
  const menuItemStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    color: isActive ? '#ffffff' : '#bdc3c7',
    textDecoration: 'none',
    fontSize: '0.9em',
    borderLeft: isActive ? '4px solid #f1c40f' : '4px solid transparent',
    backgroundColor: isActive ? '#e67e22' : 'transparent',
    fontWeight: isActive ? 500 : 400,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, color 0.2s ease, border-left-color 0.2s ease',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
  });

  const iconStyle = (isActive) => ({
    marginRight: '10px',
    width: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: isActive ? '#ffffff' : '#7f8c8d',
    transition: 'color 0.2s ease',
    flexShrink: 0,
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f4f6f8', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* ========== SIDEBAR ========== */}
      <nav style={{
        width: '240px',
        minWidth: '240px',
        backgroundColor: '#2d3e50',
        color: '#ecf0f1',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
        zIndex: 1000,
      }}>
        
        {/* Header da Sidebar (Logo) */}
        <div style={{
          padding: '18px 15px',
          borderBottom: '1px solid #3a5068',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #e67e22, #f1c40f)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span style={{ fontSize: '1.15em', fontWeight: 600, color: '#ecf0f1' }}>MeuSaaS Hub</span>
        </div>

        {/* Lista de Menu */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          margin: '10px 0 0 0', 
          padding: 0,
        }}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              style={menuItemStyle(activePage === item.id)}
              onMouseEnter={(e) => {
                if (activePage !== item.id) {
                  e.currentTarget.style.backgroundColor = '#34495e';
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.querySelector('.menu-icon').style.color = '#ecf0f1';
                }
              }}
              onMouseLeave={(e) => {
                if (activePage !== item.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#bdc3c7';
                  e.currentTarget.querySelector('.menu-icon').style.color = '#7f8c8d';
                }
              }}
            >
              <span className="menu-icon" style={iconStyle(activePage === item.id)}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Item extra "Criar Anúncio" só quando ativo */}
          {activePage === 'criarAnuncio' && (
            <button
              onClick={() => setActivePage('criarAnuncio')}
              style={menuItemStyle(true)}
            >
              <span className="menu-icon" style={iconStyle(true)}>{icons.plus}</span>
              Criar Anúncio
            </button>
          )}
        </div>

        {/* Divider */}
        <hr style={{ border: 0, height: '1px', backgroundColor: '#3a5068', margin: '0 15px' }} />

        {/* Footer da Sidebar (User + Logout) */}
        <div style={{ padding: '15px 20px', borderTop: '1px solid #3a5068', fontSize: '0.85em' }}>
          <div style={{ 
            marginBottom: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            color: '#bdc3c7',
            gap: '8px',
          }}>
            <span style={{ color: '#7f8c8d', display: 'flex' }}>{icons.user}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Usuário</span>
          </div>
          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 10px',
              backgroundColor: '#c0392b',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              textAlign: 'center',
              transition: 'background-color 0.2s ease',
              fontSize: '0.9em',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              gap: '6px',
              fontFamily: 'inherit',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e74c3c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#c0392b'}
          >
            {icons.logout}
            Sair
          </button>
        </div>
      </nav>

      {/* ========== CONTEÚDO PRINCIPAL ========== */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh', 
        overflow: 'hidden',
      }}>
        
        {/* Header Principal */}
        <header style={{
          backgroundColor: '#ffffff',
          padding: '0 25px',
          borderBottom: '1px solid #e0e0e0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '60px',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1.5em', 
            color: '#34495e', 
            fontWeight: 600,
          }}>
            {pageTitles[activePage] || activePage}
          </h1>
          <div style={{ 
            fontSize: '0.85em', 
            color: '#555',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10M12 20V4M6 20v-6" />
            </svg>
            MeuSaaS Hub v1.0
          </div>
        </header>

        {/* Área de Conteúdo (com scroll) */}
        <main style={{
          flex: 1,
          padding: '20px 25px',
          overflowY: 'auto',
          backgroundColor: '#f4f6f8',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

