import React, { useState } from 'react';

const mockData = [
  { id: 1, tipo: 'RECLAMACAO', conta: 'BEST SHOP77',        assunto: 'Etapa: dispute | ID: 5478115679', data: '2026-03-03 17:22', status: 'OPENED' },
  { id: 2, tipo: 'MENSAGEM',   conta: 'RAFAELDELUCCAC',     assunto: ': bom dia amigo, acredito que se...', data: '2026-03-03 14:50', status: 'Respondido' },
  { id: 3, tipo: 'RECLAMACAO', conta: 'GAMALOBOCOMER',      assunto: 'Etapa: dispute | ID: 5479608843', data: '2026-03-03 11:01', status: 'OPENED' },
  { id: 4, tipo: 'MENSAGEM',   conta: 'RAFAELDELUCCAC',     assunto: ': Por gentileza, quero os faróis...', data: '2026-03-03 03:35', status: 'Pendente' },
  { id: 5, tipo: 'RECLAMACAO', conta: 'CANAADIGITALMAG',    assunto: 'Etapa: dispute | ID: 5475854726', data: '2026-03-02 23:24', status: 'OPENED' },
  { id: 6, tipo: 'RECLAMACAO', conta: 'GAMALOBOCOMER',      assunto: 'Etapa: claim | ID: 5477802135',  data: '2026-03-02 23:21', status: 'OPENED' },
  { id: 7, tipo: 'RECLAMACAO', conta: 'CANAADIGITALMAG',    assunto: 'Etapa: claim | ID: 5476240013',  data: '2026-03-02 22:16', status: 'OPENED' },
  { id: 8, tipo: 'RECLAMACAO', conta: 'RAFAELDELUCCAC',     assunto: 'Etapa: dispute | ID: 5474411197', data: '2026-03-02 11:38', status: 'OPENED' },
  { id: 9, tipo: 'RECLAMACAO', conta: 'CANAADIGITALMAG',    assunto: 'Etapa: dispute | ID: 5477916900', data: '2026-03-02 10:46', status: 'OPENED' },
  { id: 10, tipo: 'RECLAMACAO', conta: 'RAFAELDELUCCAC',    assunto: 'Etapa: dispute | ID: 5475537116', data: '2026-02-27 23:12', status: 'OPENED' },
  { id: 11, tipo: 'RECLAMACAO', conta: 'CANAADIGITALMAG',   assunto: 'Etapa: dispute | ID: 5477502316', data: '2026-02-26 06:53', status: 'OPENED' },
  { id: 12, tipo: 'MENSAGEM',   conta: 'CENTRALOFFROAD',    assunto: ': Boa noite, tudo bem ?',          data: '2025-12-09 21:56', status: 'Pendente' },
  { id: 13, tipo: 'MENSAGEM',   conta: 'CENTRALOFFROAD',    assunto: ': Ninguém me chamou ...',          data: '2025-10-06 16:35', status: 'Pendente' },
  { id: 14, tipo: 'MENSAGEM',   conta: 'CENTRALOFFROAD',    assunto: ': Meu motor é uma ralava elétric...', data: '2025-10-04 16:55', status: 'Pendente' },
  { id: 15, tipo: 'MENSAGEM',   conta: 'CENTRALOFFROAD',    assunto: ': Bom dia. É só levar a encomend...', data: '2025-10-03 10:50', status: 'Pendente' },
];

const mockHistorico = [
  { de: 'complainant', para: 'respondent', data: '2026-02-23 06:51', texto: 'Não serve no meu veículo....', lado: 'esquerda' },
  { de: 'complainant', para: 'respondent', data: '2026-02-24 07:15', texto: 'Indico que descreva melhor sobre esse tapete pq não tem nada a ver com meu veículo...', lado: 'esquerda' },
  { de: 'complainant', para: 'respondent', data: '2026-02-25 15:36', texto: 'Da atenção ai fera não serviu quero devolver....tá difícil resolver isso ...\nVou colocar no reclame aqui', lado: 'esquerda' },
  { de: 'respondent',  para: 'complainant', data: '2026-02-25 16:18', texto: 'pode mostrar uma foto amigo, pois esse produto eu vendi centenas de peças ja', lado: 'direita' },
  { de: 'respondent',  para: 'complainant', data: '2026-02-25 16:19', texto: 'me manda uma foto de como você está fazendo para instalar', lado: 'direita' },
];

const mockProduto = {
  nome: 'Tapete Dianteiro Emborrachado Jeep Willys Cj5 1955 Em Diante Preto',
  sku: '10585',
  preco: 'R$ 356,83',
  pedido: '200014894462348',
};

export default function PosVenda() {
  const [filtro, setFiltro] = useState('Todos');
  const [selecionado, setSelecionado] = useState(mockData[6]);
  const [respostaTexto, setRespostaTexto] = useState('');
  const [acaoReclamacao, setAcaoReclamacao] = useState('Enviar ao Comprador');

  const dadosFiltrados = filtro === 'Todos'
    ? mockData
    : mockData.filter(d => d.tipo === filtro || d.status === filtro);

  const tipoStyle = (tipo) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.78em',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '3px',
    backgroundColor: tipo === 'RECLAMACAO' ? '#fff0f0' : '#f0f4ff',
    color: tipo === 'RECLAMACAO' ? '#c0392b' : '#2980b9',
    border: `1px solid ${tipo === 'RECLAMACAO' ? '#f5c6c6' : '#c0d4f0'}`,
    whiteSpace: 'nowrap',
  });

  const statusStyle = (status) => {
    const map = {
      'OPENED':     { bg: '#fff3cd', color: '#856404', border: '#ffc107' },
      'Pendente':   { bg: '#fff3cd', color: '#856404', border: '#ffc107' },
      'Respondido': { bg: '#d4edda', color: '#155724', border: '#28a745' },
    };
    const s = map[status] || { bg: '#e9ecef', color: '#495057', border: '#ced4da' };
    return {
      fontSize: '0.75em',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '10px',
      backgroundColor: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    };
  };

  return (
    <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 100px)', fontFamily: "'Segoe UI', sans-serif", fontSize: '0.9em' }}>

      {/* ===== PAINEL ESQUERDO ===== */}
      <div style={{ width: '580px', minWidth: '420px', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>

        {/* Filtros */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8e8', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82em', color: '#555', fontWeight: 500 }}>Exibir:</span>
          <select
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{ fontSize: '0.82em', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
          >
            <option>Todos</option>
            <option>RECLAMACAO</option>
            <option>MENSAGEM</option>
            <option>Pendente</option>
            <option>Respondido</option>
            <option>OPENED</option>
          </select>
          <button
            style={{ fontSize: '0.82em', padding: '4px 12px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'not-allowed', opacity: 0.7 }}
            disabled
            title="Funcionalidade em desenvolvimento"
          >
            Buscar Pós-Venda
          </button>
          <span style={{ fontSize: '0.78em', color: '#27ae60', fontWeight: 500, marginLeft: 'auto' }}>
            Pronto. {dadosFiltrados.length} registros carregados.
          </span>
        </div>

        {/* Tabela */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82em' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Tipo', 'Conta', 'Assunto / Comprador', 'Data', 'Status'].map(col => (
                  <th key={col} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dadosFiltrados.map((item) => {
                const isSelected = selecionado?.id === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelecionado(item)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#1565c0' : 'transparent',
                      color: isSelected ? '#fff' : '#333',
                      borderBottom: '1px solid #f0f0f0',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f0f4ff'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {isSelected ? (
                        <span style={{ fontSize: '0.78em', fontWeight: 600 }}>
                          {item.tipo === 'RECLAMACAO' ? '⚠ RECLAMAÇÃO' : '○ MENSAGEM'}
                        </span>
                      ) : (
                        <span style={tipoStyle(item.tipo)}>
                          {item.tipo === 'RECLAMACAO' ? '⚠ RECLAMAÇÃO' : '○ MENSAGEM'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.conta}</td>
                    <td style={{ padding: '6px 10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.assunto}</td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: isSelected ? '#cce' : '#888', fontSize: '0.9em' }}>{item.data}</td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {isSelected ? (
                        <span style={{ fontSize: '0.75em', fontWeight: 600 }}>{item.status}</span>
                      ) : (
                        <span style={statusStyle(item.status)}>{item.status}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== PAINEL DIREITO ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '12px', gap: '10px', minWidth: 0 }}>

        {selecionado ? (
          <>
            {/* Detalhes do Pedido */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.8em', fontWeight: 600, color: '#888', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Detalhes do Pedido
              </div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '6px', border: '1px solid #e0e0e0', overflow: 'hidden', flexShrink: 0, backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: '0.92em', lineHeight: 1.4, marginBottom: '6px' }}>
                    {mockProduto.nome}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#777', marginBottom: '4px' }}>
                    SKU: {mockProduto.sku} | {mockProduto.preco} | Pedido: {mockProduto.pedido}
                  </div>
                  <button
                    style={{ fontSize: '0.78em', padding: '3px 10px', backgroundColor: '#fff', border: '1px solid #bbb', borderRadius: '4px', cursor: 'not-allowed', color: '#555', opacity: 0.7 }}
                    disabled
                    title="Funcionalidade em desenvolvimento"
                  >
                    Ver Venda no ML ↗
                  </button>
                </div>
              </div>
            </div>

            {/* Histórico de Mensagens */}
            <div style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #e8e8e8', fontSize: '0.8em', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Histórico de Mensagens
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fafafa' }}>
                {mockHistorico.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.lado === 'direita' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize: '0.72em', color: '#aaa', marginBottom: '2px' }}>
                      [{msg.de} → {msg.para}] {msg.data}
                    </div>
                    <div style={{
                      maxWidth: '75%',
                      padding: '8px 12px',
                      borderRadius: msg.lado === 'direita' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      backgroundColor: msg.lado === 'direita' ? '#d4edda' : '#fff',
                      border: '1px solid',
                      borderColor: msg.lado === 'direita' ? '#b8dfc5' : '#e0e0e0',
                      fontSize: '0.85em',
                      color: '#333',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.texto}
                    </div>
                  </div>
                ))}
              </div>

              {/* Responder */}
              <div style={{ borderTop: '1px solid #e8e8e8', padding: '10px 14px', backgroundColor: '#fff' }}>
                <div style={{ fontSize: '0.78em', color: '#888', marginBottom: '6px', fontWeight: 500 }}>Responder</div>
                <textarea
                  value={respostaTexto}
                  onChange={e => setRespostaTexto(e.target.value)}
                  placeholder="Digite sua resposta aqui..."
                  disabled
                  style={{ width: '100%', height: '64px', resize: 'none', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', fontSize: '0.85em', color: '#333', backgroundColor: '#f9f9f9', cursor: 'not-allowed', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.78em', color: '#555' }}>Ação Reclamação:</span>
                    <select
                      value={acaoReclamacao}
                      onChange={e => setAcaoReclamacao(e.target.value)}
                      disabled
                      style={{ fontSize: '0.78em', padding: '3px 8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f9f9f9', cursor: 'not-allowed' }}
                    >
                      <option>Enviar ao Comprador</option>
                      <option>Reembolsar</option>
                      <option>Abrir Mediação</option>
                    </select>
                  </div>
                  <button
                    disabled
                    style={{ fontSize: '0.82em', padding: '6px 16px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'not-allowed', opacity: 0.6 }}
                    title="Funcionalidade em desenvolvimento"
                  >
                    Enviar Mensagem →
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.9em' }}>
            Selecione uma mensagem ou reclamação para ver os detalhes.
          </div>
        )}
      </div>
    </div>
  );
}
