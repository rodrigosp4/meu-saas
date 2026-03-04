import React, { useState } from 'react';

const perguntasMock = [
  { id: 1, conta: 'GAMALOBOCOMERCIO', anuncio: 'MLB5275361276', pergunta: 'Boa noite, preciso das dimensões de: Comprimento, Largura e Altura', data: '03/03/26 17:45' },
  { id: 2, conta: 'CENTRALOFFROAD', anuncio: 'MLB1242415452', pergunta: 'Olá, Bisco flange para adaptar cambio de Jipe Willys, vcs trabalham com isso?', data: '03/03/26 17:26' },
  { id: 3, conta: 'RAFAELDELUCCACOMERCIO', anuncio: 'MLB3888883957', pergunta: 'meu jeep está com motor opala 4 cilindros com câmbio original vocês teriam um sistema', data: '03/03/26 17:20' },
  { id: 4, conta: 'CANAADIGITALMAGAZINE', anuncio: 'MLB5465217590', pergunta: 'Entendi, tem a 16 com tala mais larga? Estou em dúvida entre manter a 16 ou trocar pela', data: '03/03/26 16:17' },
  { id: 5, conta: 'GAMALOBOCOMERCIO', anuncio: 'MLB3342586559', pergunta: 'Boa tarde Ele é a prova de água?', data: '03/03/26 14:54' },
  { id: 6, conta: 'BEST SHOP77', anuncio: 'MLB41024S0441', pergunta: 'Boa tarde, serve na grand Cherokee Laredo ano 2000 3.1 turbo diesel?', data: '03/03/26 11:39' },
  { id: 7, conta: 'CENTRALOFFROAD', anuncio: 'MLB4944415580', pergunta: 'Qual a grossura desse pino', data: '02/03/26 19:12' },
  { id: 8, conta: 'CENTRALOFFROAD', anuncio: 'MLB1464014418', pergunta: 'Seria esse modelo mesmo do Fusca. Tem esse e o bege. O meu painel é bege', data: '28/02/26 07:50' },
];

const contasMock = ['Todas as Contas', 'GAMALOBOCOMERCIO', 'CENTRALOFFROAD', 'RAFAELDELUCCACOMERCIO', 'CANAADIGITALMAGAZINE', 'BEST SHOP77'];
const statusOpcoes = ['UNANSWERED', 'ANSWERED', 'CLOSED', 'UNDER_REVIEW', 'BANNED'];

export default function PerguntasPreVenda() {
  const [contaSelecionada, setContaSelecionada] = useState('Todas as Contas');
  const [statusSelecionado, setStatusSelecionado] = useState('UNANSWERED');
  const [perguntaSelecionada, setPerguntaSelecionada] = useState(null);
  const [resposta, setResposta] = useState('');

  const thStyle = {
    padding: '6px 10px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '0.82em',
    color: '#555',
    backgroundColor: '#f0f0f0',
    borderBottom: '1px solid #ddd',
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '6px 10px',
    fontSize: '0.82em',
    borderBottom: '1px solid #eee',
    color: '#333',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const btnStyle = (color = '#555') => ({
    padding: '5px 12px',
    fontSize: '0.8em',
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>

      {/* Título */}
      <div style={{ fontWeight: 600, fontSize: '1em', color: '#2c3e50', paddingBottom: '4px', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
        Gerenciador de Perguntas Pré-Venda
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: '0.82em', color: '#555' }}>Conta:</span>
        <select
          value={contaSelecionada}
          onChange={e => setContaSelecionada(e.target.value)}
          style={{ fontSize: '0.82em', padding: '3px 6px', border: '1px solid #ccc', borderRadius: '3px', fontFamily: 'inherit' }}
        >
          {contasMock.map(c => <option key={c}>{c}</option>)}
        </select>

        <span style={{ fontSize: '0.82em', color: '#555' }}>Status:</span>
        <select
          value={statusSelecionado}
          onChange={e => setStatusSelecionado(e.target.value)}
          style={{ fontSize: '0.82em', padding: '3px 6px', border: '1px solid #ccc', borderRadius: '3px', fontFamily: 'inherit' }}
        >
          {statusOpcoes.map(s => <option key={s}>{s}</option>)}
        </select>

        <button style={btnStyle('#6c757d')}>Buscar Perguntas</button>
      </div>

      <div style={{ fontSize: '0.8em', color: '#555', flexShrink: 0 }}>
        {perguntasMock.length} pergunta(s) encontrada(s).
      </div>

      {/* Painel principal: lista + detalhes */}
      <div style={{ flex: 1, display: 'flex', gap: '10px', minHeight: 0 }}>

        {/* Lista de Perguntas */}
        <div style={{ flex: 3, border: '1px solid #ccc', borderRadius: '4px', overflow: 'auto', backgroundColor: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '45%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle}>Conta</th>
                <th style={thStyle}>Anúncio</th>
                <th style={thStyle}>Última Pergunta</th>
                <th style={thStyle}>Data</th>
              </tr>
            </thead>
            <tbody>
              {perguntasMock.map(p => (
                <tr
                  key={p.id}
                  onClick={() => { setPerguntaSelecionada(p); setResposta(''); }}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: perguntaSelecionada?.id === p.id ? '#e8f4fd' : 'transparent',
                  }}
                  onMouseEnter={e => { if (perguntaSelecionada?.id !== p.id) e.currentTarget.style.backgroundColor = '#f9f9f9'; }}
                  onMouseLeave={e => { if (perguntaSelecionada?.id !== p.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <td style={{ ...tdStyle, fontWeight: perguntaSelecionada?.id === p.id ? 600 : 400 }}>{p.conta}</td>
                  <td style={{ ...tdStyle, color: '#2980b9' }}>{p.anuncio}</td>
                  <td style={tdStyle}>{p.pergunta}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#777' }}>{p.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Painel Direito: Conversa e Resposta */}
        <div style={{ flex: 2, border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Header do painel */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', backgroundColor: '#f8f9fa', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '0.88em', color: '#2c3e50' }}>Conversa e Resposta</span>
          </div>

          {/* Info do anúncio */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'flex-start', gap: '10px', flexShrink: 0 }}>
            {/* Imagem placeholder */}
            <div style={{
              width: '56px', height: '56px', flexShrink: 0,
              backgroundColor: '#e0e0e0', border: '1px solid #ccc',
              borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#aaa', fontSize: '0.7em',
            }}>
              Img
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8em', color: '#555', marginBottom: '3px' }}>
                <strong>Anúncio:</strong>{' '}
                {perguntaSelecionada
                  ? <a href="#" style={{ color: '#2980b9', textDecoration: 'none' }}>{perguntaSelecionada.anuncio}</a>
                  : <span style={{ color: '#999' }}>(Selecione uma pergunta)</span>
                }
              </div>
              <div style={{ fontSize: '0.8em', color: '#555', marginBottom: '6px' }}>
                <strong>SKU:</strong>{' '}
                <span style={{ color: '#999' }}>(Selecione uma pergunta)</span>
              </div>
              <button style={{ ...btnStyle('#6c757d'), fontSize: '0.75em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Atualizar Status
              </button>
            </div>
          </div>

          {/* Histórico da Conversa */}
          <div style={{ padding: '6px 10px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.8em', fontWeight: 600, color: '#555', marginBottom: '4px' }}>Histórico da Conversa</div>
            <textarea
              readOnly
              value={perguntaSelecionada ? perguntaSelecionada.pergunta : ''}
              style={{
                width: '100%', height: '80px', resize: 'none',
                border: '1px solid #ccc', borderRadius: '3px',
                fontSize: '0.8em', padding: '6px', boxSizing: 'border-box',
                backgroundColor: '#fafafa', color: '#333', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Pergunta destacada */}
          <div style={{ padding: '4px 10px', flexShrink: 0 }}>
            <span style={{ color: '#2980b9', fontWeight: 600, fontSize: '0.88em' }}>
              {perguntaSelecionada ? `Pergunta: ${perguntaSelecionada.pergunta}` : 'Pergunta: (Selecione na lista)'}
            </span>
          </div>

          {/* Resposta */}
          <div style={{ padding: '6px 10px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '0.8em', fontWeight: 600, color: '#555', marginBottom: '4px' }}>Sua Resposta:</div>
            <textarea
              value={resposta}
              onChange={e => setResposta(e.target.value)}
              placeholder={perguntaSelecionada ? 'Digite sua resposta...' : ''}
              style={{
                flex: 1, minHeight: '60px', resize: 'none',
                border: '1px solid #ccc', borderRadius: '3px',
                fontSize: '0.8em', padding: '6px', boxSizing: 'border-box',
                fontFamily: 'inherit', color: '#333',
              }}
            />
          </div>

          {/* Botões de ação */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #eee', display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button style={{ ...btnStyle('#6c757d'), flex: 1 }}>Pesquisar Anúncio...</button>
            <button style={{ ...btnStyle('#27ae60'), flex: 1 }}>Enviar Resposta</button>
            <button style={{ ...btnStyle('#c0392b'), flex: 1 }}>Excluir Pergunta</button>
          </div>
        </div>

      </div>
    </div>
  );
}
