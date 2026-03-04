import { useState, useEffect } from 'react';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import Configuracoes from './components/Configuracoes';
import Anuncios from './components/Anuncios';
import CriarAnuncio from './components/CriarAnuncio'; 
import GerenciadorAnuncios from './components/GerenciadorAnuncios';
import GerenciadorFila from './components/GerenciadorFila';
import ReplicadorAnuncio from './components/ReplicadorAnuncio.jsx';
import CompatibilidadeAutopecas from './components/CompatibilidadeAutopecas.jsx';
import CentralPromocoes from './components/CentralPromocoes.jsx';
import MonitorConcorrentes from './components/MonitorConcorrentes.jsx';
import PerguntasPreVenda from './components/PerguntasPreVenda.jsx';
import PosVenda from './components/PosVenda.jsx';

function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(() => {
    const salvo = localStorage.getItem('saas_usuario');
    return salvo ? JSON.parse(salvo) : null;
  });

  const handleLogin = (userDados) => {
    setUsuarioLogado(userDados);
    localStorage.setItem('saas_usuario', JSON.stringify(userDados));
  };

  const handleLogout = () => {
    setUsuarioLogado(null);
    localStorage.removeItem('saas_usuario');
  }
  
  const [activePage, setActivePage] = useState('home');
  const [produtoParaAnunciar, setProdutoParaAnunciar] = useState(null);

  useEffect(() => {
    const redirectPage = localStorage.getItem('redirect_to_page');
    if (redirectPage) {
      setActivePage(redirectPage);
      localStorage.removeItem('redirect_to_page');
    }
  }, []); 

  const resetToken = new URLSearchParams(window.location.search).get('resetToken');

  if (!usuarioLogado || resetToken) {
    return <Login onLogin={handleLogin} initialToken={resetToken} />;
  }

  return (
    <DashboardLayout activePage={activePage} setActivePage={setActivePage} onLogout={handleLogout}>
      {activePage === 'home' && (
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#2c3e50' }}>
            Bem-vindo, {usuarioLogado.email}!
          </h2>
          <p className="mt-2" style={{ color: '#7f8c8d' }}>
            Use o menu lateral para navegar.
          </p>
        </div>
      )}
      
      {activePage === 'produtosErp' && <Anuncios onAnunciar={(p) => { setProdutoParaAnunciar(p); setActivePage('criarAnuncio'); }} usuarioId={usuarioLogado.id} />}
      
      {activePage === 'gerenciadorML' && <GerenciadorAnuncios usuarioId={usuarioLogado.id} />}

      {activePage === 'replicadorAnuncio' && <ReplicadorAnuncio usuarioId={usuarioLogado.id} />}

      {activePage === 'configuracoes' && <Configuracoes usuarioId={usuarioLogado.id} />}
      {activePage === 'criarAnuncio' && <CriarAnuncio produto={produtoParaAnunciar} usuarioId={usuarioLogado.id} />}
      {activePage === 'fila' && <GerenciadorFila usuarioId={usuarioLogado.id} />}
      {activePage === 'compatibilidade' && <CompatibilidadeAutopecas usuarioId={usuarioLogado.id} />}
      {activePage === 'centralPromocoes' && <CentralPromocoes />}
      {activePage === 'monitorConcorrentes' && <MonitorConcorrentes />}
      {activePage === 'perguntasPreVenda' && <PerguntasPreVenda />}
      {activePage === 'posVenda' && <PosVenda />}
      {activePage === 'qualidadePublicacoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px', color: '#7f8c8d' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#bdc3c7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <h2 style={{ margin: 0, fontSize: '1.4em', fontWeight: 600, color: '#95a5a6' }}>Qualidade das Publicações</h2>
          <p style={{ margin: 0, fontSize: '0.95em' }}>Em breve. Esta funcionalidade está em desenvolvimento.</p>
        </div>
      )}
      {activePage === 'otimizadorImagens' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px', color: '#7f8c8d' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#bdc3c7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <h2 style={{ margin: 0, fontSize: '1.4em', fontWeight: 600, color: '#95a5a6' }}>Otimizador de Imagens</h2>
          <p style={{ margin: 0, fontSize: '0.95em' }}>Em breve. Esta funcionalidade está em desenvolvimento.</p>
        </div>
      )}
      {activePage === 'catalogo' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px', color: '#7f8c8d' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#bdc3c7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <h2 style={{ margin: 0, fontSize: '1.4em', fontWeight: 600, color: '#95a5a6' }}>Catálogo</h2>
          <p style={{ margin: 0, fontSize: '0.95em' }}>Em breve. Esta funcionalidade está em desenvolvimento.</p>
        </div>
      )}
    </DashboardLayout>
  );
}

export default App;
