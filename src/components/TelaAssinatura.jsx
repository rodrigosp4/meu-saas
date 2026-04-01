import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const PLANOS_LABEL = {
  '30d':  { titulo: '30 Dias',   subtitulo: 'Mensal',        cor: '#3498db' },
  '60d':  { titulo: '60 Dias',   subtitulo: '5% de desconto', cor: '#27ae60' },
  '90d':  { titulo: '90 Dias',   subtitulo: '10% de desconto', cor: '#8e44ad' },
  '180d': { titulo: '6 Meses',   subtitulo: '15% de desconto', cor: '#e67e22' },
};

export default function TelaAssinatura({ onAssinaturaAtivada }) {
  const { usuarioAtual, logout } = useAuth();
  const [planos, setPlanos] = useState([]);
  const [assinaturaAtual, setAssinaturaAtual] = useState(null);
  const [planoSelecionado, setPlanoSelecionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    carregarStatus();

    // Verifica retorno do MercadoPago via query string
    const params = new URLSearchParams(window.location.search);
    const statusMP = params.get('assinatura');
    const paymentId = params.get('payment_id');

    if (statusMP === 'success' && paymentId) {
      verificarPagamento(paymentId);
    } else if (statusMP === 'pending') {
      setErro('Pagamento em processamento. Aguarde a confirmação.');
    }

    // Limpa query string da URL sem recarregar
    if (statusMP) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function carregarStatus() {
    try {
      setLoading(true);
      const res = await fetch('/api/assinatura/status');
      const data = await res.json();
      if (data.ativo) {
        onAssinaturaAtivada?.();
        return;
      }
      setPlanos(data.planos || []);
      setAssinaturaAtual(data.assinatura);
    } catch {
      setErro('Erro ao carregar informações de assinatura.');
    } finally {
      setLoading(false);
    }
  }

  async function verificarPagamento(paymentId) {
    try {
      setProcessando(true);
      const res = await fetch('/api/assinatura/verificar-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json();
      if (data.ativo) {
        onAssinaturaAtivada?.();
      } else {
        await carregarStatus();
      }
    } catch {
      setErro('Erro ao verificar pagamento.');
    } finally {
      setProcessando(false);
    }
  }

  async function assinar() {
    if (!planoSelecionado) {
      setErro('Selecione um plano para continuar.');
      return;
    }
    setErro('');
    setProcessando(true);
    try {
      const res = await fetch('/api/assinatura/criar-preferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planoKey: planoSelecionado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao criar preferência.');
      // Redireciona para o checkout do MercadoPago
      window.location.href = data.initPoint;
    } catch (err) {
      setErro(err.message);
      setProcessando(false);
    }
  }

  const formatarData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
  const formatarMoeda = (v) => v != null ? `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '-';

  if (loading || processando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.2)', borderTop: '4px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>
            {processando ? 'Verificando pagamento...' : 'Carregando...'}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="MELIUNLOCKER" style={{ height: '40px', filter: 'drop-shadow(0 2px 6px rgba(241,196,15,0.4))' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }} />
          <span style={{ color: '#F5C518', fontWeight: 800, fontSize: '1.05rem', display: 'none' }}>MELIUNLOCKER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{usuarioAtual?.email}</span>
          <button onClick={logout} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sair
          </button>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>

        {/* Ícone de cadeado */}
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', fontSize: '28px' }}>
          🔒
        </div>

        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, marginBottom: '8px', textAlign: 'center' }}>
          Ative sua Assinatura
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1rem', marginBottom: '8px', textAlign: 'center', maxWidth: '500px' }}>
          Para acessar todas as funcionalidades da plataforma, escolha um plano abaixo.
        </p>

        {assinaturaAtual && (
          <div style={{ marginBottom: '16px', padding: '10px 20px', background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.4)', borderRadius: '8px', color: '#e74c3c', fontSize: '0.9rem' }}>
            {assinaturaAtual.status === 'expired' || (assinaturaAtual.expiraEm && new Date(assinaturaAtual.expiraEm) < new Date())
              ? `Sua assinatura venceu em ${formatarData(assinaturaAtual.expiraEm)}. Renove para continuar.`
              : 'Seu pagamento está pendente de confirmação.'}
          </div>
        )}

        {erro && (
          <div style={{ marginBottom: '16px', padding: '10px 20px', background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.4)', borderRadius: '8px', color: '#e74c3c', fontSize: '0.9rem' }}>
            {erro}
          </div>
        )}

        {/* Cards de planos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', width: '100%', maxWidth: '860px', marginBottom: '28px' }}>
          {planos.map((plano) => {
            const meta = PLANOS_LABEL[plano.key] || {};
            const selecionado = planoSelecionado === plano.key;
            const meses = plano.key === '180d' ? 6 : plano.dias / 30;
            const precoMensal = plano.valor / meses;

            return (
              <div
                key={plano.key}
                onClick={() => setPlanoSelecionado(plano.key)}
                style={{
                  cursor: 'pointer',
                  borderRadius: '14px',
                  padding: '24px 20px',
                  background: selecionado ? `${meta.cor}22` : 'rgba(255,255,255,0.05)',
                  border: selecionado ? `2px solid ${meta.cor}` : '2px solid rgba(255,255,255,0.1)',
                  transition: 'all 0.2s',
                  position: 'relative',
                  textAlign: 'center',
                }}
              >
                {plano.desconto > 0 && (
                  <div style={{ position: 'absolute', top: '-10px', right: '12px', background: meta.cor, color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '12px' }}>
                    {Math.round(plano.desconto * 100)}% OFF
                  </div>
                )}
                <div style={{ color: selecionado ? meta.cor : '#fff', fontWeight: 800, fontSize: '1.3rem', marginBottom: '4px' }}>
                  {meta.titulo}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '14px' }}>
                  {meta.subtitulo}
                </div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.8rem', marginBottom: '2px' }}>
                  {formatarMoeda(plano.valor)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>
                  ≈ {formatarMoeda(precoMensal)}/mês
                </div>
                {selecionado && (
                  <div style={{ marginTop: '12px', background: meta.cor, color: '#fff', borderRadius: '6px', padding: '4px 0', fontSize: '0.82rem', fontWeight: 600 }}>
                    Selecionado ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Botão de assinar */}
        <button
          onClick={assinar}
          disabled={!planoSelecionado || processando}
          style={{
            padding: '14px 48px',
            fontSize: '1.05rem',
            fontWeight: 700,
            borderRadius: '10px',
            border: 'none',
            cursor: planoSelecionado ? 'pointer' : 'not-allowed',
            background: planoSelecionado ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.15)',
            color: '#fff',
            transition: 'opacity 0.2s',
            opacity: planoSelecionado ? 1 : 0.6,
            marginBottom: '16px',
            minWidth: '260px',
          }}
        >
          {processando ? 'Redirecionando...' : 'Pagar com MercadoPago →'}
        </button>

        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', textAlign: 'center' }}>
          Pagamento seguro processado pelo MercadoPago. Após confirmação, o acesso é liberado automaticamente.
        </p>
      </div>
    </div>
  );
}
