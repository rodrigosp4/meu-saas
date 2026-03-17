import React, { useState } from 'react';

const ATRIBUTOS_CRITICOS_AUTOPECAS = [
  'BRAND',
  'MODEL',
  'PART_NUMBER',
  'ALPHANUMERIC_MODEL',
  'ITEM_CONDITION'
];

// Apenas os campos de embalagem do vendor são ignorados no prompt (preenchidos via campos próprios do formulário)
const ATRIBUTOS_IGNORAR_PROMPT = [
  'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_WEIGHT',
];

// Esses campos têm campos dedicados no formulário — recomendamos preenchê-los por lá
const ATRIBUTOS_EMBALAGEM_VENDOR = new Set([
  'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_WEIGHT',
]);

function gerarPromptIA({ tituloAnuncio, descricaoAnuncio, fotosUrls, atributosCategoria }) {
  const atribsFiltrados = atributosCategoria.filter(a => !ATRIBUTOS_IGNORAR_PROMPT.includes(a.id));

  const listaAtributos = atribsFiltrados.map(attr => {
    const obrigatorio = attr.tags?.required || attr.tags?.catalog_required || ATRIBUTOS_CRITICOS_AUTOPECAS.includes(attr.id);
    let linha = `- ID: "${attr.id}" | Nome: "${attr.name}"${obrigatorio ? ' [OBRIGATÓRIO]' : ''}`;
    if (attr.values && attr.values.length > 0) {
      const opcoes = attr.values.slice(0, 30).map(v => `  • { "value_id": "${v.id}", "value_name": "${v.name}" }`).join('\n');
      linha += `\n  Tipo: SELEÇÃO — valores válidos:\n${opcoes}`;
    } else {
      linha += `\n  Tipo: TEXTO LIVRE`;
    }
    return linha;
  }).join('\n\n');

  const exJson = `{
  "BRAND": "Samsung",
  "MODEL": { "value_id": "123456", "value_name": "Galaxy S24" },
  "ITEM_CONDITION": { "value_id": "2230284", "value_name": "Novo" },
  "COLOR": { "value_id": "283155", "value_name": "Preto" },
  "VOLTAGE": { "value_id": "127V", "value_name": "127V" }
}`;

  const fotos = fotosUrls && fotosUrls.length > 0
    ? fotosUrls.slice(0, 10).join('\n')
    : '(sem fotos disponíveis)';

  return `Você é um assistente especializado em fichas técnicas do Mercado Livre Brasil.

Analise as informações do produto abaixo e preencha a ficha técnica em formato JSON.

## PRODUTO
Título: ${tituloAnuncio || '(sem título)'}

Descrição:
${descricaoAnuncio || '(sem descrição)'}

URLs das fotos (para analisar visualmente se necessário):
${fotos}

## INSTRUÇÕES
1. Retorne SOMENTE o JSON, sem nenhum texto adicional, explicação ou markdown
2. Preencha o MÁXIMO de campos possível com base no produto
3. Para campos com valores predefinidos (Tipo: SELEÇÃO), use EXATAMENTE o value_id e value_name listados abaixo — nunca invente valores
4. Para campos de TEXTO LIVRE, forneça o valor mais preciso possível
5. Se não souber o valor de um campo, OMITA-O do JSON (não coloque null ou vazio)
6. Não inclua os campos de embalagem e peso, eles já são preenchidos automaticamente

## ATRIBUTOS DA FICHA TÉCNICA

${listaAtributos}

## FORMATO DE SAÍDA ESPERADO
${exJson}`;
}

export default function FormularioAtributos({
  atributosCategoria, valoresAtributos, handleAtributoChange,
  tituloAnuncio, descricaoAnuncio, fotosUrls
}) {
  const [showModal, setShowModal] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [aplicado, setAplicado] = useState(false);

  const isRequired = (attr) =>
    attr.tags?.required || attr.tags?.catalog_required || ATRIBUTOS_CRITICOS_AUTOPECAS.includes(attr.id);

  const requiredAttrs = atributosCategoria.filter(isRequired);
  const optionalAttrs = atributosCategoria.filter(a => !isRequired(a));

  const abrirModal = () => {
    const prompt = gerarPromptIA({ tituloAnuncio, descricaoAnuncio, fotosUrls, atributosCategoria });
    setPromptText(prompt);
    setJsonInput('');
    setJsonError('');
    setCopiado(false);
    setAplicado(false);
    setShowModal(true);
  };

  const copiarPrompt = () => {
    navigator.clipboard.writeText(promptText);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const aplicarJSON = () => {
    setJsonError('');
    let dados;
    try {
      // Remove possíveis blocos markdown ```json ... ```
      const limpo = jsonInput.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      dados = JSON.parse(limpo);
    } catch (e) {
      setJsonError('JSON inválido. Verifique se a IA retornou apenas o JSON sem texto extra.');
      return;
    }

    let aplicados = 0;
    Object.entries(dados).forEach(([id, valor]) => {
      if (ATRIBUTOS_IGNORAR_PROMPT.includes(id)) return;
      const attr = atributosCategoria.find(a => a.id === id);
      if (!attr) return;

      if (typeof valor === 'object' && valor !== null && valor.value_id) {
        // Valida se o value_id existe nas opções do atributo
        const opcaoValida = (attr.values || []).find(v => String(v.id) === String(valor.value_id));
        if (opcaoValida || (attr.values && attr.values.length === 0)) {
          handleAtributoChange(id, { value_id: String(valor.value_id), value_name: valor.value_name });
          aplicados++;
        }
      } else if (typeof valor === 'string' && valor.trim() !== '') {
        if (attr.values && attr.values.length > 0) {
          // Tenta encontrar por value_name se veio string em vez de objeto
          const opcao = attr.values.find(v => v.name.toLowerCase() === valor.toLowerCase());
          if (opcao) {
            handleAtributoChange(id, { value_id: String(opcao.id), value_name: opcao.name });
            aplicados++;
          }
        } else {
          handleAtributoChange(id, valor);
          aplicados++;
        }
      }
    });

    setAplicado(aplicados);
  };

  const renderAtributo = (attr) => {
    const isFieldRequired = isRequired(attr);
    const currentValue = (typeof valoresAtributos[attr.id] === 'string')
      ? valoresAtributos[attr.id]
      : (valoresAtributos[attr.id]?.value_name || '');
    const isEmpty = !currentValue || currentValue.trim() === '';

    const inputClasses = `w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      isFieldRequired && isEmpty
        ? 'border-red-400 bg-red-50 text-red-900 placeholder-red-300'
        : 'border-gray-300 bg-white'
    }`;

    const labelClasses = `text-xs font-bold mb-1 ${
      isFieldRequired ? (isEmpty ? 'text-red-700' : 'text-gray-800') : 'text-gray-500'
    }`;

    const isEmbalagem = ATRIBUTOS_EMBALAGEM_VENDOR.has(attr.id);

    return (
      <div key={attr.id} className="flex flex-col">
        <label className={labelClasses}>
          {attr.name} {isFieldRequired && <span className="text-red-600 ml-1" title="Campo Obrigatório">*</span>}
        </label>
        {isEmbalagem && (
          <span className="text-xs text-amber-600 font-semibold mb-1">
            ⚠️ Recomendado — preencha nas <em>Dimensões da Embalagem</em> acima
          </span>
        )}
        {attr.values && attr.values.length > 0 ? (
          <select
            value={(valoresAtributos[attr.id]?.value_id) || ''}
            onChange={(e) => {
              const selectedId = e.target.value;
              const selected = (attr.values || []).find(v => String(v.id) === String(selectedId));
              handleAtributoChange(attr.id, selected ? { value_id: String(selected.id), value_name: selected.name } : '');
            }}
            className={inputClasses}
          >
            <option value="">Selecione...</option>
            {(attr.values || []).map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={currentValue}
            onChange={e => handleAtributoChange(attr.id, e.target.value)}
            className={inputClasses}
            placeholder={isFieldRequired ? 'Obrigatório' : `Digite ${attr.name.toLowerCase()}`}
          />
        )}
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex justify-between items-center border-b pb-2 mb-4">
        <h3 className="text-lg font-bold text-gray-800">Ficha Técnica</h3>
        {atributosCategoria.length > 0 && (
          <button
            onClick={abrirModal}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg shadow-sm transition-all"
            title="Gera um prompt para ChatGPT ou Claude preencher a ficha automaticamente"
          >
            🤖 Gerar Prompt para IA
          </button>
        )}
      </div>

      {atributosCategoria.length === 0 ? (
        <p className="text-sm text-gray-500">Aguardando seleção de categoria ou atributos não disponíveis.</p>
      ) : (
        <div className="space-y-8">
          {requiredAttrs.length > 0 && (
            <div className="bg-red-50/50 p-4 rounded-lg border border-red-100">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">⚠️</span>
                <div>
                  <h4 className="text-sm font-black text-red-800 uppercase tracking-wider">Campos Obrigatórios</h4>
                  <p className="text-xs text-red-600">O Mercado Livre recusará o anúncio se estes campos estiverem vazios (destacados em vermelho).</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {requiredAttrs.map(renderAtributo)}
              </div>
            </div>
          )}

          {optionalAttrs.length > 0 && (
            <div className="px-4">
              <h4 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">Campos Opcionais (Melhoram a busca)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {optionalAttrs.map(renderAtributo)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-black text-gray-900">🤖 Prompt para IA — Ficha Técnica</h2>
                <p className="text-xs text-gray-500 mt-0.5">Copie o prompt abaixo e cole no ChatGPT, Claude ou outra IA. Depois cole o JSON retornado na segunda caixa.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none font-bold">&times;</button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* Passo 1: Prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-gray-700">1. Copie este prompt e cole na IA</span>
                  <button
                    onClick={copiarPrompt}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${copiado ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  >
                    {copiado ? '✓ Copiado!' : '📋 Copiar Prompt'}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={promptText}
                  className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-gray-50 text-gray-700 resize-none focus:outline-none"
                />
              </div>

              {/* Passo 2: Colar JSON */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-gray-700">2. Cole aqui o JSON retornado pela IA</span>
                  {aplicado !== false && aplicado !== '' && (
                    <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-md">
                      ✓ {aplicado} campo(s) preenchido(s)
                    </span>
                  )}
                </div>
                <textarea
                  value={jsonInput}
                  onChange={e => { setJsonInput(e.target.value); setJsonError(''); setAplicado(false); }}
                  placeholder={'Cole aqui o JSON da IA...\n\nExemplo:\n{\n  "BRAND": "Samsung",\n  "MODEL": { "value_id": "123", "value_name": "Galaxy S24" }\n}'}
                  className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-white text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {jsonError && (
                  <p className="text-xs text-red-600 font-bold mt-1">{jsonError}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all">
                Fechar
              </button>
              <button
                onClick={aplicarJSON}
                disabled={!jsonInput.trim()}
                className="px-5 py-2 text-sm font-black text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm disabled:opacity-40 transition-all"
              >
                ✨ Aplicar Ficha Técnica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
