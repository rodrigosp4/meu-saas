import React from 'react';

const features = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    titulo: 'Promoções Automáticas',
    descricao: 'Crie regras para aplicar descontos automaticamente com base em categorias, estoque ou datas.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    titulo: 'Cupons de Desconto',
    descricao: 'Gerencie cupons personalizados para campanhas e clientes específicos.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    titulo: 'Agendamento de Campanhas',
    descricao: 'Programe promoções para horários e períodos específicos com início e fim automáticos.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    titulo: 'Relatórios de Performance',
    descricao: 'Acompanhe o desempenho de cada promoção com métricas de vendas e conversão.',
  },
];

export default function CentralPromocoes() {
  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>

      {/* Banner principal */}
      <div style={{
        background: 'linear-gradient(135deg, #e67e22 0%, #f39c12 60%, #f1c40f 100%)',
        borderRadius: '12px',
        padding: '40px 36px',
        display: 'flex',
        alignItems: 'center',
        gap: '28px',
        marginBottom: '32px',
        boxShadow: '0 4px 18px rgba(230,126,34,0.25)',
      }}>
        {/* Ícone */}
        <div style={{
          width: '72px',
          height: '72px',
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        </div>

        {/* Texto */}
        <div>
          <div style={{
            display: 'inline-block',
            backgroundColor: 'rgba(255,255,255,0.25)',
            color: '#fff',
            fontSize: '0.72em',
            fontWeight: 700,
            letterSpacing: '1px',
            padding: '3px 10px',
            borderRadius: '20px',
            marginBottom: '8px',
            textTransform: 'uppercase',
          }}>
            Em breve
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.6em', fontWeight: 700, color: '#fff' }}>
            Central de Promoções
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: '0.95em', lineHeight: 1.5 }}>
            Gerencie todas as suas promoções e campanhas de desconto em um único lugar, integrado diretamente com o Mercado Livre.
          </p>
        </div>
      </div>

      {/* Grid de funcionalidades */}
      <h3 style={{ margin: '0 0 16px', fontSize: '1em', fontWeight: 600, color: '#34495e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        O que estará disponível
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {features.map((f, i) => (
          <div key={i} style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '22px',
            display: 'flex',
            gap: '16px',
            alignItems: 'flex-start',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            border: '1px solid #eaecef',
            opacity: 0.85,
          }}>
            <div style={{
              color: '#e67e22',
              backgroundColor: '#fff8f0',
              width: '52px',
              height: '52px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {f.icon}
            </div>
            <div>
              <p style={{ margin: '0 0 5px', fontWeight: 600, color: '#2c3e50', fontSize: '0.95em' }}>{f.titulo}</p>
              <p style={{ margin: 0, color: '#7f8c8d', fontSize: '0.85em', lineHeight: 1.55 }}>{f.descricao}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Nota de rodapé */}
      <div style={{
        backgroundColor: '#f4f6f8',
        border: '1px dashed #d0d7de',
        borderRadius: '8px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: '#7f8c8d',
        fontSize: '0.88em',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#e67e22' }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Esta funcionalidade está em desenvolvimento e será disponibilizada em uma próxima atualização.
      </div>

    </div>
  );
}
