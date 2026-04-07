import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import DashboardLayout from './components/DashboardLayout';
import SuporteClienteSelector from './components/SuporteClienteSelector';
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
import DimensoesEmbalagem from './components/DimensoesEmbalagem.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AgendadorTarefas from './components/AgendadorTarefas.jsx';
import TelaAssinatura from './components/TelaAssinatura.jsx';
import CorretorPrecoPlanilha from './components/CorretorPrecoPlanilha.jsx';
import PlanejadorProductAds from './components/PlanejadorProductAds.jsx';
import PainelRascunhos from './components/PainelRascunhos.jsx';
import TabelaMedidas from './components/TabelaMedidas.jsx';
import ConcorrenciaPreco from './components/ConcorrenciaPreco.jsx';
import Chamados from './components/Chamados.jsx';

function App() {
  const { isLoggedIn, usuarioAtual, login, logout, stopImpersonating, canAccess, impersonating, role, assinaturaAtiva, assinaturaVerificada, recarregarAssinatura } = useAuth();

  const [activePage, setActivePage] = useState(() => {
    const redirectPage = localStorage.getItem('redirect_to_page');
    if (redirectPage) {
      localStorage.removeItem('redirect_to_page');
      return redirectPage;
    }
    // SUPER_ADMIN sempre começa no painel admin
    const savedPage = localStorage.getItem('saas_active_page') || 'home';
    return savedPage;
  });
  const [produtoParaAnunciar, setProdutoParaAnunciar] = useState(null);

  useEffect(() => {
    localStorage.setItem('saas_active_page', activePage);
  }, [activePage]);

  // SUPER_ADMIN sem impersonação → redireciona para adminPanel se estiver numa página de cliente
  const ADMIN_PAGES = ['adminPanel', 'agendadorTarefas', 'home'];
  useEffect(() => {
    if (isLoggedIn && role === 'SUPER_ADMIN' && !impersonating && !ADMIN_PAGES.includes(activePage)) {
      setActivePage('adminPanel');
    }
  }, [isLoggedIn, role, impersonating, activePage]);

  // Redirecionar para home se a página ativa não for acessível
  useEffect(() => {
    if (isLoggedIn && activePage !== 'home' && !canAccess(activePage)) {
      setActivePage('home');
    }
  }, [isLoggedIn, activePage, canAccess]);

  const resetToken = new URLSearchParams(window.location.search).get('resetToken');
  const [showLogin, setShowLogin] = useState(!!resetToken);

  if (!isLoggedIn || resetToken) {
    if (!showLogin && !resetToken) {
      return <LandingPage onLoginClick={() => setShowLogin(true)} />;
    }
    return (
      <Login
        onLogin={login}
        initialToken={resetToken}
        onShowLanding={() => setShowLogin(false)}
      />
    );
  }

  // Suporte logado mas sem impersonação: mostra seletor de cliente
  if (role === 'SUPPORT' && !impersonating) {
    return <SuporteClienteSelector />;
  }

  // Gate de assinatura — aguarda verificação, depois bloqueia se sem assinatura
  // SUPER_ADMIN e impersonação ficam isentos
  if (role !== 'SUPER_ADMIN' && !impersonating) {
    if (!assinaturaVerificada) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)' }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.2)', borderTop: '4px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      );
    }
    if (!assinaturaAtiva) {
      return <TelaAssinatura onAssinaturaAtivada={recarregarAssinatura} />;
    }
  }

  // Para banners e sair da conta de impersonação
  const handleSairConta = () => {
    if (impersonating) {
      stopImpersonating();
    } else {
      logout();
    }
  };

  const uid = usuarioAtual?.id;

  return (
    <DashboardLayout
      activePage={activePage}
      setActivePage={setActivePage}
      onLogout={impersonating ? handleSairConta : logout}
      canAccess={canAccess}
      impersonating={impersonating}
      role={role}
      usuarioId={uid}
    >
      {canAccess('adminPanel') && activePage === 'adminPanel' && <AdminPanel setActivePage={setActivePage} />}
      {canAccess('agendadorTarefas') && activePage === 'agendadorTarefas' && <AgendadorTarefas />}

      {activePage === 'home' && (
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#2c3e50' }}>
            Bem-vindo, {usuarioAtual?.email}!
          </h2>
          <p className="mt-2" style={{ color: '#7f8c8d' }}>
            Use o menu lateral para navegar.
          </p>
        </div>
      )}

      {canAccess('produtosErp') && activePage === 'produtosErp' && <Anuncios onAnunciar={(p) => { setProdutoParaAnunciar(p); setActivePage('criarAnuncio'); }} usuarioId={uid} />}

      {canAccess('gerenciadorML') && activePage === 'gerenciadorML' && <GerenciadorAnuncios usuarioId={uid} />}

      {canAccess('replicadorAnuncio') && activePage === 'replicadorAnuncio' && <ReplicadorAnuncio usuarioId={uid} />}

      {canAccess('configuracoes') && activePage === 'configuracoes' && <Configuracoes usuarioId={uid} />}
      {canAccess('criarAnuncio') && activePage === 'criarAnuncio' && <CriarAnuncio produto={produtoParaAnunciar} usuarioId={uid} />}
      {canAccess('cadastramentoMassa') && activePage === 'cadastramentoMassa' && <CadastramentoMassa usuarioId={uid} />}
      {canAccess('fila') && activePage === 'fila' && <GerenciadorFila usuarioId={uid} />}
      {canAccess('compatibilidade') && activePage === 'compatibilidade' && <CompatibilidadeAutopecas usuarioId={uid} />}
      {canAccess('tabelaMedidas') && activePage === 'tabelaMedidas' && <TabelaMedidas usuarioId={uid} />}
      {canAccess('centralPromocoes') && activePage === 'centralPromocoes' && <CentralPromocoes usuarioId={uid} />}
      {canAccess('monitorConcorrentes') && activePage === 'monitorConcorrentes' && <MonitorConcorrentes usuarioId={uid} />}
      {canAccess('perguntasPreVenda') && activePage === 'perguntasPreVenda' && <PerguntasPreVenda usuarioId={uid} />}
      {activePage === 'posVenda' && <PosVenda usuarioId={uid} />}
      {canAccess('catalogo') && activePage === 'catalogo' && <Catalogo usuarioId={uid} />}
      {canAccess('qualidadePublicacoes') && activePage === 'qualidadePublicacoes' && <QualidadePublicacoes usuarioId={uid} />}
      {canAccess('otimizadorImagens') && activePage === 'otimizadorImagens' && <OtimizadorImagens usuarioId={uid} />}
      {canAccess('clienteAPI') && activePage === 'clienteAPI' && <ClienteAPI usuarioId={uid} />}
      {canAccess('dimensoesEmbalagem') && activePage === 'dimensoesEmbalagem' && <DimensoesEmbalagem usuarioId={uid} />}
      {canAccess('corretorPrecoPlanilha') && activePage === 'corretorPrecoPlanilha' && <CorretorPrecoPlanilha usuarioId={uid} />}
      {canAccess('concorrenciaPreco') && activePage === 'concorrenciaPreco' && <ConcorrenciaPreco usuarioId={uid} />}
      {canAccess('planejadorProductAds') && activePage === 'planejadorProductAds' && <PlanejadorProductAds usuarioId={uid} />}
      {canAccess('chamados') && activePage === 'chamados' && <Chamados usuarioId={uid} />}
      {activePage === 'rascunhos' && <PainelRascunhos setActivePage={setActivePage} setProdutoParaAnunciar={setProdutoParaAnunciar} usuarioId={uid} />}
    </DashboardLayout>
  );
}

export default App;
