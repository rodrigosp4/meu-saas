import React, { useState } from 'react';

/**
 * ============================================================
 * REPLICADOR DE ANÚNCIO DO MERCADO LIVRE
 * ============================================================
 * 
 * COMPONENTE VISUAL (NÃO FUNCIONAL)
 * 
 * Este componente é a interface para replicar anúncios do ML
 * em múltiplas contas. Abaixo estão listadas as funcionalidades
 * que precisam ser implementadas:
 * 
 * TODO: [PUXAR DADOS] Implementar chamada à API do ML para buscar
 *       dados do anúncio a partir da URL informada.
 * 
 * TODO: [CATEGORIA] Implementar busca e sugestão de categorias
 *       via API do ML (similar ao SeletorCategoria existente).
 * 
 * TODO: [IMAGENS] Implementar aba de imagens com preview e
 *       possibilidade de reordenar/remover imagens do anúncio original.
 * 
 * TODO: [FICHA TÉCNICA] Implementar carregamento dos atributos
 *       da categoria selecionada (similar ao FormularioAtributos).
 * 
 * TODO: [DIMENSÕES & PESO] Implementar campos de dimensões e peso
 *       do produto para cálculo de frete.
 * 
 * TODO: [DESCRIÇÃO] Implementar editor de descrição do anúncio.
 * 
 * TODO: [PREÇO ATACADO B2B] Implementar lógica de cálculo de preços
 *       por atacado com regras configuráveis por faixa de quantidade.
 * 
 * TODO: [AUTOMAÇÃO DE PREÇOS] Implementar automação de preços
 *       Min/Max após replicar o anúncio.
 * 
 * TODO: [COMPATIBILIDADE] Implementar aplicação de perfis de
 *       compatibilidade (autopeças) ao anúncio replicado.
 * 
 * TODO: [REPLICAR] Implementar lógica de replicação do anúncio
 *       nas contas selecionadas via API do ML (criar anúncio novo
 *       em cada conta com os dados copiados).
 * 
 * TODO: [CONTAS] Carregar lista de contas ML do usuário dinamicamente
 *       a partir do banco de dados.
 * 
 * TODO: [VALIDAÇÃO] Implementar validações de campos obrigatórios
 *       antes de permitir a replicação.
 * ============================================================
 */

export default function ReplicadorAnuncio({ usuarioId }) {
  // ---- Estado da URL do anúncio ----
  const [urlAnuncio, setUrlAnuncio] = useState('');

  // ---- Aba ativa dentro do formulário de dados ----
  // TODO: Implementar conteúdo de cada aba
  const [abaAtiva, setAbaAtiva] = useState('geral');

  // ---- Dados do anúncio (preenchidos após "Puxar Dados") ----
  // TODO: Popular esses estados ao puxar dados da API do ML
  const [titulo, setTitulo] = useState('');
  const [precoVenda, setPrecoVenda] = useState('0.0');
  const [novoSku, setNovoSku] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [categoria, setCategoria] = useState('');
  const [tempoFabricacao, setTempoFabricacao] = useState('');
  const [permitirRetirada, setPermitirRetirada] = useState(false);

  // ---- Preço Atacado (B2B) ----
  // TODO: Implementar lógica de cálculo de preços B2B
  const [enviarPrecoAtacado, setEnviarPrecoAtacado] = useState(false);

  // ---- Automação de Preços ----
  // TODO: Implementar automação de preços Min/Max
  const [ativarAutomacao, setAtivarAutomacao] = useState(false);

  // ---- Compatibilidade ----
  // TODO: Carregar perfis de compatibilidade do banco
  const [perfilCompatibilidade, setPerfilCompatibilidade] = useState('');

  // ---- Contas para replicação ----
  // TODO: Carregar contas dinamicamente do banco de dados do usuário
  const [contasSelecionadas, setContasSelecionadas] = useState({
    BEST_SHOP77: false,
    CANAADIGITALMAGAZINE: false,
    CENTRALOFFROAD: false,
    GAMALOBOCOMERCIODEPECASLT: false,
    RAFAELDELUCCACOMERCIO: false,
  });

  // ---- Tipos de anúncio ----
  const [tipoClassico, setTipoClassico] = useState(true);
  const [tipoPremium, setTipoPremium] = useState(true);

  // ---- Handlers placeholder ----

  /** TODO: Implementar chamada à API do ML para buscar dados do anúncio */
  const handlePuxarDados = () => {
    // TODO: Extrair o ID do anúncio da URL
    // TODO: Chamar endpoint GET /items/{id} da API do ML
    // TODO: Popular todos os estados com os dados retornados
    // TODO: Carregar imagens, ficha técnica, dimensões, etc.
    console.log('TODO: Implementar puxar dados da URL:', urlAnuncio);
  };

  /** TODO: Implementar busca de categorias */
  const handleBuscarCategoria = () => {
    // TODO: Abrir modal/dropdown de busca de categorias do ML
    console.log('TODO: Implementar busca de categoria');
  };

  /** TODO: Implementar sugestão automática de categoria */
  const handleSugerirCategoria = () => {
    // TODO: Usar API do ML para sugerir categoria baseado no título
    console.log('TODO: Implementar sugestão de categoria');
  };

  /** TODO: Implementar replicação nas contas selecionadas */
  const handleReplicar = () => {
    // TODO: Validar campos obrigatórios
    // TODO: Para cada conta selecionada, criar anúncio via API
    // TODO: Aplicar tipo de anúncio (Clássico/Premium)
    // TODO: Aplicar perfil de compatibilidade se selecionado
    // TODO: Aplicar preço atacado se habilitado
    // TODO: Aplicar automação de preços se habilitado
    // TODO: Exibir progresso e resultado da replicação
    console.log('TODO: Implementar replicação do anúncio');
  };

  /** TODO: Implementar abertura do modal de configuração de regras B2B */
  const handleConfigurarAtacado = () => {
    // TODO: Abrir modal para configurar faixas de desconto por quantidade
    console.log('TODO: Implementar configuração de atacado');
  };

  /** TODO: Implementar atualização de perfis de compatibilidade */
  const handleAtualizarPerfis = () => {
    // TODO: Recarregar lista de perfis de compatibilidade do banco
    console.log('TODO: Implementar atualização de perfis');
  };

  // ---- Toggle de conta selecionada ----
  const toggleConta = (conta) => {
    setContasSelecionadas(prev => ({ ...prev, [conta]: !prev[conta] }));
  };

  // ============================================================
  // ESTILOS
  // ============================================================
  const styles = {
    container: {
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: '#333',
    },
    headerTitle: {
      fontSize: '1em',
      fontWeight: 600,
      color: '#2c3e50',
      marginBottom: '16px',
      paddingBottom: '8px',
      borderBottom: '2px solid #e0e0e0',
    },
    // -- Seção URL --
    urlSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '20px',
      padding: '12px 16px',
      backgroundColor: '#fff',
      border: '1px solid #ddd',
      borderRadius: '6px',
    },
    urlLabel: {
      fontSize: '0.85em',
      fontWeight: 600,
      color: '#555',
      whiteSpace: 'nowrap',
    },
    urlInput: {
      flex: 1,
      padding: '8px 12px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '0.9em',
      outline: 'none',
    },
    btnPrimary: {
      padding: '8px 20px',
      backgroundColor: '#2d3e50',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.85em',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    },
    // -- Abas --
    tabsContainer: {
      display: 'flex',
      borderBottom: '2px solid #ddd',
      marginBottom: '0',
      backgroundColor: '#fff',
      borderTopLeftRadius: '6px',
      borderTopRightRadius: '6px',
      overflow: 'hidden',
    },
    tab: (isActive) => ({
      padding: '10px 20px',
      fontSize: '0.85em',
      fontWeight: isActive ? 600 : 400,
      color: isActive ? '#2d3e50' : '#777',
      backgroundColor: isActive ? '#fff' : '#f5f5f5',
      borderBottom: isActive ? '3px solid #e67e22' : '3px solid transparent',
      cursor: 'pointer',
      border: 'none',
      borderTop: 'none',
      borderLeft: 'none',
      borderRight: '1px solid #eee',
      fontFamily: 'inherit',
      transition: 'all 0.2s',
    }),
    // -- Formulário --
    formCard: {
      backgroundColor: '#fff',
      border: '1px solid #ddd',
      borderTop: 'none',
      borderBottomLeftRadius: '6px',
      borderBottomRightRadius: '6px',
      padding: '20px',
      marginBottom: '20px',
    },
    formRow: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '14px',
      gap: '12px',
    },
    formLabel: {
      fontSize: '0.82em',
      fontWeight: 600,
      color: '#555',
      minWidth: '180px',
      textAlign: 'right',
    },
    formInput: {
      padding: '7px 10px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '0.85em',
      outline: 'none',
    },
    formInputFull: {
      flex: 1,
      padding: '7px 10px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '0.85em',
      outline: 'none',
    },
    checkbox: {
      marginRight: '8px',
      cursor: 'pointer',
    },
    checkboxLabel: {
      fontSize: '0.83em',
      color: '#444',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
    },
    // -- Seções --
    sectionTitle: {
      fontSize: '0.9em',
      fontWeight: 700,
      color: '#2c3e50',
      marginTop: '16px',
      marginBottom: '10px',
    },
    regraAtual: {
      fontSize: '0.75em',
      color: '#27ae60',
      marginLeft: '24px',
      marginBottom: '12px',
    },
    // -- Botões secundários --
    btnSecondary: {
      padding: '6px 16px',
      backgroundColor: '#f5f5f5',
      color: '#555',
      border: '1px solid #ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.82em',
      fontWeight: 500,
    },
    btnConfig: {
      padding: '5px 14px',
      backgroundColor: '#f8f8f8',
      color: '#555',
      border: '1px solid #ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.8em',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    // -- Replicação --
    replicacaoSection: {
      backgroundColor: '#fff',
      border: '1px solid #ddd',
      borderRadius: '6px',
      padding: '20px',
      marginBottom: '20px',
    },
    replicacaoTitle: {
      fontSize: '0.95em',
      fontWeight: 700,
      color: '#2c3e50',
      marginBottom: '16px',
    },
    contasGrid: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '16px',
      marginBottom: '16px',
    },
    btnReplicar: {
      width: '100%',
      padding: '14px',
      backgroundColor: '#ecf0f1',
      color: '#2c3e50',
      border: '2px solid #bdc3c7',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.95em',
      fontWeight: 700,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      transition: 'all 0.2s',
      fontFamily: 'inherit',
    },
    footerNote: {
      fontSize: '0.8em',
      color: '#999',
      marginTop: '12px',
    },
    select: {
      flex: 1,
      padding: '7px 10px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '0.85em',
      backgroundColor: '#fff',
    },
  };

  // ============================================================
  // ABAS DO FORMULÁRIO
  // ============================================================
  const abas = [
    { id: 'geral', label: 'Geral & Preço' },
    { id: 'dimensoes', label: 'Dimensões & Peso' },
    { id: 'descricao', label: 'Descrição' },
    { id: 'imagens', label: 'Imagens' },
    { id: 'fichaTecnica', label: 'Ficha Técnica' },
  ];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={styles.container}>
      <div style={styles.headerTitle}>Replicar Anúncio do Mercado Livre</div>

      {/* ========== SEÇÃO: URL DO ANÚNCIO ========== */}
      <div style={styles.urlSection}>
        <span style={styles.urlLabel}>URL do Anúncio ML:</span>
        <input
          type="text"
          value={urlAnuncio}
          onChange={(e) => setUrlAnuncio(e.target.value)}
          placeholder="Cole aqui a URL do anúncio do Mercado Livre..."
          style={styles.urlInput}
        />
        {/* TODO: Implementar lógica de puxar dados ao clicar */}
        <button onClick={handlePuxarDados} style={styles.btnPrimary}>
          Puxar Dados
        </button>
      </div>

      {/* ========== ABAS DO FORMULÁRIO ========== */}
      <div style={styles.tabsContainer}>
        {abas.map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            style={styles.tab(abaAtiva === aba.id)}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* ========== CONTEÚDO DA ABA ========== */}
      <div style={styles.formCard}>

        {/* ---- ABA: Geral & Preço ---- */}
        {abaAtiva === 'geral' && (
          <div>
            {/* Título do Anúncio */}
            <div style={styles.formRow}>
              <span style={styles.formLabel}>Título do Anúncio:</span>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                style={styles.formInputFull}
                placeholder=""
              />
            </div>

            {/* Preço de Venda + Novo SKU */}
            <div style={styles.formRow}>
              <span style={styles.formLabel}>Preço de Venda (R$):</span>
              <input
                type="text"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                style={{ ...styles.formInput, width: '120px' }}
              />
              <span style={{ flex: 1 }} />
              <span style={{ ...styles.formLabel, minWidth: 'auto' }}>Novo SKU:</span>
              <input
                type="text"
                value={novoSku}
                onChange={(e) => setNovoSku(e.target.value)}
                style={{ ...styles.formInput, width: '180px' }}
              />
            </div>

            {/* Quantidade */}
            <div style={styles.formRow}>
              <span style={styles.formLabel}>Quantidade:</span>
              <input
                type="text"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                style={{ ...styles.formInput, width: '80px' }}
              />
            </div>

            {/* Categoria */}
            <div style={styles.formRow}>
              <span style={styles.formLabel}>Categoria:</span>
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                style={styles.formInputFull}
                placeholder=""
              />
              {/* TODO: Implementar sugestão de categoria via API */}
              <button onClick={handleSugerirCategoria} style={styles.btnSecondary}>Sugerir</button>
              {/* TODO: Implementar busca de categoria via modal */}
              <button onClick={handleBuscarCategoria} style={styles.btnSecondary}>Buscar...</button>
            </div>

            {/* Tempo de Fabricação */}
            <div style={styles.formRow}>
              <span style={styles.formLabel}>Tempo Fabric. (Ex: '5 dias', 0=remover):</span>
              <input
                type="text"
                value={tempoFabricacao}
                onChange={(e) => setTempoFabricacao(e.target.value)}
                style={{ ...styles.formInput, width: '120px' }}
              />
            </div>

            {/* Permitir Retirada no Local */}
            <div style={{ ...styles.formRow, marginLeft: '192px' }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={permitirRetirada}
                  onChange={(e) => setPermitirRetirada(e.target.checked)}
                  style={styles.checkbox}
                />
                Permitir Retirada no Local
              </label>
            </div>

            {/* ---- Seção: Preço por Atacado (B2B) ---- */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '14px', marginTop: '10px' }}>
              <div style={styles.sectionTitle}>Preço por Atacado (B2B)</div>

              <div style={styles.formRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={enviarPrecoAtacado}
                    onChange={(e) => setEnviarPrecoAtacado(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Enviar Preço de Atacado (Usar Tabela Global)
                </label>
                <span style={{ flex: 1 }} />
                {/* TODO: Implementar modal de configuração de regras B2B */}
                <button onClick={handleConfigurarAtacado} style={styles.btnConfig}>
                  ⚙ Configu
                </button>
              </div>

              {/* TODO: Carregar regras de atacado do banco e exibir aqui */}
              <div style={styles.regraAtual}>
                Regra Atual: 3un -&gt; 0.3% | 5un -&gt; 0.5% | 10un -&gt; 1.0% | 15un -&gt; 1.5% | 20un -&gt; 2.0%
              </div>
            </div>

            {/* ---- Automação de Preços ---- */}
            <div style={{ marginTop: '8px' }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={ativarAutomacao}
                  onChange={(e) => setAtivarAutomacao(e.target.checked)}
                  style={styles.checkbox}
                />
                Ativar Automação de Preços (Min/Max) após replicar
              </label>
            </div>
          </div>
        )}

        {/* ---- ABA: Dimensões & Peso ---- */}
        {abaAtiva === 'dimensoes' && (
          <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
            {/* TODO: Implementar campos de Altura, Largura, Comprimento e Peso */}
            {/* TODO: Preencher automaticamente ao puxar dados do anúncio original */}
            <p style={{ fontSize: '0.9em' }}>📦 Campos de Dimensões e Peso serão implementados aqui.</p>
            <p style={{ fontSize: '0.8em', color: '#bbb' }}>
              (Altura, Largura, Comprimento em cm / Peso em kg)
            </p>
          </div>
        )}

        {/* ---- ABA: Descrição ---- */}
        {abaAtiva === 'descricao' && (
          <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
            {/* TODO: Implementar editor de texto para descrição do anúncio */}
            {/* TODO: Preencher automaticamente ao puxar dados do anúncio original */}
            {/* TODO: Considerar usar editor rich text (ex: TinyMCE, ReactQuill) */}
            <p style={{ fontSize: '0.9em' }}>📝 Editor de Descrição será implementado aqui.</p>
            <p style={{ fontSize: '0.8em', color: '#bbb' }}>
              (Descrição em texto plano ou HTML do anúncio)
            </p>
          </div>
        )}

        {/* ---- ABA: Imagens ---- */}
        {abaAtiva === 'imagens' && (
          <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
            {/* TODO: Implementar galeria de imagens do anúncio */}
            {/* TODO: Preview das imagens puxadas do anúncio original */}
            {/* TODO: Drag-and-drop para reordenar */}
            {/* TODO: Botão para remover imagens individuais */}
            {/* TODO: Upload de novas imagens */}
            <p style={{ fontSize: '0.9em' }}>🖼️ Galeria de Imagens será implementada aqui.</p>
            <p style={{ fontSize: '0.8em', color: '#bbb' }}>
              (Preview, reordenação e upload de imagens)
            </p>
          </div>
        )}

        {/* ---- ABA: Ficha Técnica ---- */}
        {abaAtiva === 'fichaTecnica' && (
          <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
            {/* TODO: Implementar carregamento de atributos da categoria selecionada */}
            {/* TODO: Preencher automaticamente com dados do anúncio original */}
            {/* TODO: Permitir edição dos valores dos atributos */}
            {/* TODO: Reutilizar lógica do FormularioAtributos existente */}
            <p style={{ fontSize: '0.9em' }}>📋 Ficha Técnica / Atributos serão implementados aqui.</p>
            <p style={{ fontSize: '0.8em', color: '#bbb' }}>
              (Atributos obrigatórios e opcionais da categoria do ML)
            </p>
          </div>
        )}
      </div>

      {/* ========== OPÇÕES DE REPLICAÇÃO ========== */}
      <div style={styles.replicacaoSection}>
        <div style={styles.replicacaoTitle}>Opções de Replicação</div>

        {/* ---- Compatibilidade (Opcional) ---- */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#444', marginBottom: '8px' }}>
            Compatibilidade (Opcional)
          </div>
          <div style={styles.formRow}>
            <span style={{ ...styles.formLabel, minWidth: '200px' }}>Aplicar Perfil de Compatibilidade:</span>
            {/* TODO: Carregar perfis de compatibilidade do banco de dados */}
            <select
              value={perfilCompatibilidade}
              onChange={(e) => setPerfilCompatibilidade(e.target.value)}
              style={styles.select}
            >
              <option value="">-- Nenhum --</option>
              {/* TODO: Popular com perfis reais */}
            </select>
            {/* TODO: Implementar recarga de perfis */}
            <button onClick={handleAtualizarPerfis} style={styles.btnSecondary}>
              Atualizar Perfis
            </button>
          </div>
        </div>

        {/* ---- Replicar para as Contas ---- */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#444', marginBottom: '10px' }}>
            Replicar para as Contas:
          </div>
          {/* TODO: Carregar contas dinamicamente do banco de dados */}
          <div style={styles.contasGrid}>
            {Object.entries(contasSelecionadas).map(([conta, checked]) => (
              <label key={conta} style={{ ...styles.checkboxLabel, minWidth: '220px' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleConta(conta)}
                  style={styles.checkbox}
                />
                {conta}
              </label>
            ))}
          </div>
        </div>

        {/* ---- Tipos de Anúncio ---- */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '0.85em', fontWeight: 600, color: '#444' }}>Tipos de Anúncio:</span>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={tipoClassico}
                onChange={(e) => setTipoClassico(e.target.checked)}
                style={styles.checkbox}
              />
              Clássico
            </label>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={tipoPremium}
                onChange={(e) => setTipoPremium(e.target.checked)}
                style={styles.checkbox}
              />
              Premium
            </label>
          </div>
        </div>

        {/* ---- Botão Replicar ---- */}
        {/* TODO: Implementar lógica completa de replicação */}
        <button
          onClick={handleReplicar}
          style={styles.btnReplicar}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#2d3e50';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = '#2d3e50';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#ecf0f1';
            e.currentTarget.style.color = '#2c3e50';
            e.currentTarget.style.borderColor = '#bdc3c7';
          }}
        >
          REPLICAR ANÚNCIO NAS CONTAS SELECIONADAS
        </button>
      </div>

      {/* ========== NOTA DE RODAPÉ ========== */}
      <div style={styles.footerNote}>
        Insira a URL de um anúncio do ML e clique em 'Puxar Dados'.
      </div>
    </div>
  );
}
