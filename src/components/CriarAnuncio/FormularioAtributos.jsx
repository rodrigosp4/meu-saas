import React from 'react';

// Força esses atributos a sempre aparecerem como OBRIGATÓRIOS, 
// mesmo que a API do Mercado Livre esqueça de mandar a flag "required".
const ATRIBUTOS_CRITICOS_AUTOPECAS = [
  'BRAND', 
  'MODEL', 
  'PART_NUMBER', 
  'ALPHANUMERIC_MODEL',
  'ITEM_CONDITION'
];

export default function FormularioAtributos({ atributosCategoria, valoresAtributos, handleAtributoChange }) {
  
  // Função que decide se um atributo é obrigatório (pela API do ML ou pela nossa lista forçada)
  const isRequired = (attr) => {
    return attr.tags?.required || attr.tags?.catalog_required || ATRIBUTOS_CRITICOS_AUTOPECAS.includes(attr.id);
  };

  const requiredAttrs = atributosCategoria.filter(isRequired);
  const optionalAttrs = atributosCategoria.filter(a => !isRequired(a));

  const renderAtributo = (attr) => {
    const isFieldRequired = isRequired(attr);
    
    // Pega o valor atual para saber se está vazio
    const currentValue = (typeof valoresAtributos[attr.id] === 'string') 
      ? valoresAtributos[attr.id] 
      : (valoresAtributos[attr.id]?.value_name || '');
      
    const isEmpty = !currentValue || currentValue.trim() === '';

    // Lógica de cores: Se for obrigatório e vazio = VERMELHO. Senão = NORMAL.
    const inputClasses = `w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      isFieldRequired && isEmpty 
        ? 'border-red-400 bg-red-50 text-red-900 placeholder-red-300' 
        : 'border-gray-300 bg-white'
    }`;

    const labelClasses = `text-xs font-bold mb-1 ${
      isFieldRequired ? (isEmpty ? 'text-red-700' : 'text-gray-800') : 'text-gray-500'
    }`;

    return (
      <div key={attr.id} className="flex flex-col">
        <label className={labelClasses}>
          {attr.name} {isFieldRequired && <span className="text-red-600 ml-1" title="Campo Obrigatório">*</span>}
        </label>
        
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
    </div>
  );
}