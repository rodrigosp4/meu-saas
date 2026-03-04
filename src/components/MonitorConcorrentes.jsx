import React, { useState } from 'react';

const subAbas = [
  '1. Anúncios Individuais (Grupos)',
  '2. Monitor de Lojas (Sellers)',
  '3. Oportunidades e Clonagem',
  '4. Analista IA',
];

const gruposMock = [
  { nome: 'GUINCHO ACO', skus: '15692, 18769, 21500, 21562, 22796, 25255, 28437, 3039' },
  { nome: 'teste', skus: '6940' },
];

export default function MonitorConcorrentes() {
  const [abaAtiva, setAbaAtiva] = useState(0);
  const [grupoSelecionado, setGrupoSelecionado] = useState(null);

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
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '0' }}>

      {/* Sub-abas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #ddd', marginBottom: '12px', flexShrink: 0 }}>
        {subAbas.map((aba, i) => (
          <button
            key={i}
            onClick={() => setAbaAtiva(i)}
            style={{
              padding: '7px 14px',
              fontSize: '0.82em',
              border: '1px solid #ddd',
              borderBottom: abaAtiva === i ? '2px solid white' : '1px solid #ddd',
              marginBottom: abaAtiva === i ? '-2px' : '0',
              backgroundColor: abaAtiva === i ? '#fff' : '#f5f5f5',
              fontWeight: abaAtiva === i ? 600 : 400,
              cursor: 'pointer',
              color: abaAtiva === i ? '#2c3e50' : '#666',
              fontFamily: 'inherit',
              borderRadius: '3px 3px 0 0',
              outline: 'none',
            }}
          >
            {aba}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba 1 */}
      {abaAtiva === 0 && (
        <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: 0 }}>

          {/* Painel Esquerdo — Grupos */}
          <div style={{ width: '320px', minWidth: '260px', display: 'flex', flexDirection: 'column', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '6px 10px', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc', fontSize: '0.85em', fontWeight: 600, color: '#333' }}>
              Meus Grupos de Produtos
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Nome do Grupo</th>
                    <th style={thStyle}>SKUs Vinculados</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposMock.map((g, i) => (
                    <tr
                      key={i}
                      onClick={() => setGrupoSelecionado(i)}
                      style={{ cursor: 'pointer', backgroundColor: grupoSelecionado === i ? '#cce5ff' : 'transparent' }}
                    >
                      <td style={tdStyle}>{g.nome}</td>
                      <td style={{ ...tdStyle, color: '#555', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.skus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Botões inferiores */}
            <div style={{ padding: '8px', borderTop: '1px solid #ddd', display: 'flex', gap: '6px', flexShrink: 0 }}>
              {['Novo Grupo', 'Editar Grupo', 'Excluir Grupo'].map((label) => (
                <button
                  key={label}
                  style={{
                    flex: 1,
                    padding: '5px 4px',
                    fontSize: '0.75em',
                    border: '1px solid #bbb',
                    borderRadius: '3px',
                    backgroundColor: '#f5f5f5',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: '#333',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Painel Direito */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>

            {/* Meus Anúncios para o Grupo Selecionado */}
            <div style={{ border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc', fontSize: '0.85em', fontWeight: 600, color: '#333' }}>
                Meus Anúncios para o Grupo Selecionado
              </div>
              <div style={{ height: '80px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Conta', 'Título', 'Preço', 'Status'].map((col) => (
                        <th key={col} style={thStyle}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} style={{ ...tdStyle, color: '#aaa', textAlign: 'center', padding: '16px' }}>
                        Selecione um grupo à esquerda para ver os anúncios.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Concorrentes Monitorados */}
            <div style={{ border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc', fontSize: '0.85em', fontWeight: 600, color: '#333' }}>
                Concorrentes Monitorados
              </div>
              <div style={{ padding: '8px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82em', color: '#555', whiteSpace: 'nowrap' }}>URL Concorrente:</span>
                <input
                  type="text"
                  disabled
                  placeholder=""
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    border: '1px solid #bbb',
                    borderRadius: '3px',
                    fontSize: '0.82em',
                    backgroundColor: '#fff',
                    color: '#333',
                  }}
                />
                <button
                  style={{
                    padding: '4px 12px',
                    fontSize: '0.82em',
                    border: '1px solid #bbb',
                    borderRadius: '3px',
                    backgroundColor: '#f5f5f5',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: '#333',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Adicionar Concorrente
                </button>
              </div>
            </div>

            {/* Lista de Concorrentes */}
            <div style={{ border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '6px 10px', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc', fontSize: '0.85em', fontWeight: 600, color: '#333', flexShrink: 0 }}>
                Lista de Concorrentes
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Título Concorrente', 'Preço', 'Estoque', 'Atualizado em'].map((col) => (
                        <th key={col} style={thStyle}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} style={{ ...tdStyle, color: '#aaa', textAlign: 'center', padding: '40px' }}>
                        Nenhum concorrente monitorado.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Botões de ação + comparativo */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                {['Atualizar Dados dos Concorrentes', 'Remover Concorrente Sel.'].map((label) => (
                  <button
                    key={label}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.82em',
                      border: '1px solid #bbb',
                      borderRadius: '3px',
                      backgroundColor: '#f5f5f5',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: '#333',
                    }}
                  >
                    {label}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  style={{
                    padding: '5px 14px',
                    fontSize: '0.82em',
                    border: 'none',
                    borderRadius: '3px',
                    backgroundColor: '#27ae60',
                    color: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  Igualar Preço Mais Baixo (R$ -1,00)
                </button>
              </div>

              {/* Comparativo Rápido */}
              <div style={{ border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', padding: '10px 14px' }}>
                <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#555', marginBottom: '8px' }}>Comparativo Rápido</div>
                <div style={{ display: 'flex', gap: '32px' }}>
                  {[
                    { label: 'Seu Anúncio Ativo Mais Barato', valor: 'N/A' },
                    { label: 'Concorrente Mais Barato', valor: 'N/A' },
                    { label: 'Diferença', valor: 'N/A' },
                  ].map(({ label, valor }) => (
                    <div key={label}>
                      <span style={{ fontSize: '0.75em', color: '#777' }}>{label}: </span>
                      <span style={{ fontSize: '1em', fontWeight: 700, color: '#2c3e50' }}>{valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Abas 2, 3, 4 — Em breve */}
      {abaAtiva > 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: '#aaa' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: '1em', fontWeight: 500 }}>Em breve</span>
          <span style={{ fontSize: '0.85em' }}>Esta seção será disponibilizada em uma próxima versão.</span>
        </div>
      )}
    </div>
  );
}
