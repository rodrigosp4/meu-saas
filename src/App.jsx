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
import CadastramentoMassa from './components/CadastramentoMassa.jsx';
import Catalogo from './components/Catalogo.jsx';
import QualidadePublicacoes from './components/QualidadePublicacoes.jsx';
import OtimizadorImagens from './components/OtimizadorImagens.jsx';
import ClienteAPI from './components/ClienteAPI.jsx';

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
  
  const [activePage, setActivePage] = useState(() => {
    const redirectPage = localStorage.getItem('redirect_to_page');
    if (redirectPage) {
      localStorage.removeItem('redirect_to_page');
      return redirectPage;
    }
    return localStorage.getItem('saas_active_page') || 'home';
  });
  const [produtoParaAnunciar, setProdutoParaAnunciar] = useState(null);

  useEffect(() => {
    localStorage.setItem('saas_active_page', activePage);
  }, [activePage]); 

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
      {activePage === 'cadastramentoMassa' && <CadastramentoMassa usuarioId={usuarioLogado.id} />}
      {activePage === 'fila' && <GerenciadorFila usuarioId={usuarioLogado.id} />}
      {activePage === 'compatibilidade' && <CompatibilidadeAutopecas usuarioId={usuarioLogado.id} />}
      {activePage === 'centralPromocoes' && <CentralPromocoes usuarioId={usuarioLogado.id} />}
      {activePage === 'monitorConcorrentes' && <MonitorConcorrentes />}
      {activePage === 'perguntasPreVenda' && <PerguntasPreVenda usuarioId={usuarioLogado.id} />}
      {activePage === 'posVenda' && <PosVenda />}
      {activePage === 'catalogo' && <Catalogo usuarioId={usuarioLogado.id} />}
      {activePage === 'qualidadePublicacoes' && <QualidadePublicacoes usuarioId={usuarioLogado.id} />}
      {activePage === 'otimizadorImagens' && <OtimizadorImagens usuarioId={usuarioLogado.id} />}
      {activePage === 'clienteAPI' && <ClienteAPI usuarioId={usuarioLogado.id} />}
    </DashboardLayout>
  );
}

export default App;
