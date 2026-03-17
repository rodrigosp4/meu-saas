import React from 'react';

const REGRAS_FIXAS = [
  { id: 'preco_venda', nome: 'Preço de Venda do ERP' },
  { id: 'preco_promocional', nome: 'Preço de Venda ou Promocional do ERP' },
  { id: 'manual', nome: 'Informar manualmente' },
];

export default function TabelaContas(props) {
  const { contasML, regrasPreco, configPublicacao, setConfigPublicacao, precosCalculados, isCalculatingPrices, strategy, setStrategy, configAtacado } = props;

  // Função auxiliar para renderizar os detalhes matemáticos
  const renderDetalhes = (calcObj, tituloBloco, corTitulo) => {
    if (!calcObj || !calcObj.historico) return null;
    return (
      <div className="bg-white p-4 rounded border border-gray-200 shadow-inner mb-4 last:mb-0 mt-3">
        {tituloBloco && <h4 className={`font-black ${corTitulo} mb-3 border-b pb-2`}>{tituloBloco}</h4>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h5 className="font-bold text-gray-600 border-b pb-1 mb-2 text-xs uppercase">Evolução do Custo</h5>
            <ul className="space-y-1 text-xs">
              {calcObj.historico.filter(h => h.tipo === 'valor' || h.tipo === 'custo').map((h, i) => (
                <li key={i} className="flex justify-between border-b border-gray-50 pb-1">
                  <span>{h.descricao} {h.isPerc && `(${h.originalPerc > 0 ? '+' : ''}${h.originalPerc}%)`}</span>
                  <span className={h.valor < 0 ? 'text-red-500 font-medium' : ''}>
                    {h.valor < 0 ? '-' : (i > 0 ? '+' : '')} R$ {Math.abs(h.valor).toFixed(2).replace('.',',')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-gray-600 border-b pb-1 mb-2 text-xs uppercase">Custos e Taxas da Venda</h5>
            <ul className="space-y-1 text-xs">
              {calcObj.historico.filter(h => h.tipo === 'custo_ml' || h.tipo === 'taxa_venda').map((h, i) => (
                <li key={i} className="flex justify-between border-b border-gray-50 pb-1">
                  <span>{h.descricao} {h.originalPerc ? `(${h.originalPerc > 0 ? '+' : ''}${h.originalPerc}%)` : ''}</span>
                  <span className={h.valor < 0 ? 'text-red-500 font-medium' : 'text-blue-600 font-medium'}>
                    {h.valor < 0 ? '-' : '+'} R$ {Math.abs(h.valor).toFixed(2).replace('.',',')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="sm:col-span-2 border-t border-dashed border-gray-300 pt-3 mt-1 flex justify-between items-center text-sm font-black text-green-800">
            <span>PREÇO FINAL:</span>
            <span>R$ {calcObj.precoFinal.toFixed(2).replace('.',',')}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Estratégia de Promoção e Frete</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-purple-700 mb-1">Inflar Preço (%)</label>
            <p className="text-xs text-gray-500 mb-2">Aumente para poder aplicar descontos do ML depois.</p>
            <input type="number" min="0" value={strategy.inflar} onChange={e => setStrategy(p => ({...p, inflar: Number(e.target.value)}))} className="w-full px-3 py-2 border rounded-md" />
          </div>
          <div>
            <label className="block text-sm font-bold text-red-600 mb-1">Reduzir p/ fugir de Frete Grátis (%)</label>
            <p className="text-xs text-gray-500 mb-2">Abate até X% para tentar cravar o preço em R$ 78,99.</p>
            <input type="number" min="0" value={strategy.reduzir} onChange={e => setStrategy(p => ({...p, reduzir: Number(e.target.value)}))} className="w-full px-3 py-2 border rounded-md" />
          </div>
        </div>

        {/* Opção de preço de atacado */}
        {configAtacado?.ativo && Array.isArray(configAtacado.faixas) && configAtacado.faixas.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                className="w-5 h-5 cursor-pointer accent-green-600"
                checked={strategy.enviarAtacado || false}
                onChange={e => setStrategy(p => ({ ...p, enviarAtacado: e.target.checked }))}
              />
              <div>
                <span className="text-sm font-bold text-green-700">Enviar preços de atacado (B2B)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Enviará {configAtacado.faixas.length} faixa(s) de desconto configurada(s) em Configurações.
                  O desconto é aplicado sobre o preço final de venda (com promoção ativa, se houver).
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {configAtacado.faixas.map(f => (
                    <span key={f.id} className="text-[10px] px-2 py-0.5 rounded font-semibold bg-green-50 text-green-700 border border-green-200">
                      {f.minQtd}+ un → -{f.desconto}%
                    </span>
                  ))}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Opção de ativar promoções automaticamente */}
        {(strategy.inflar || 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                className="w-5 h-5 cursor-pointer accent-purple-600"
                checked={strategy.ativarPromocoes || false}
                onChange={e => setStrategy(p => ({ ...p, ativarPromocoes: e.target.checked }))}
              />
              <div>
                <span className="text-sm font-bold text-purple-700">Ativar promoções dentro da margem inflada</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Após publicar, ativará automaticamente todas as campanhas candidatas onde o desconto do vendedor é ≤ {strategy.inflar}% (sua margem inflada).
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex justify-between">
          Estratégia de Venda (Contas e Preços)
          {isCalculatingPrices && <span className="text-sm text-blue-500 animate-pulse">Calculando frete ML...</span>}
        </h3>
        
        {contasML.length === 0 ? (<div className="p-4 bg-red-50 text-red-700 rounded">Adicione contas em Configurações.</div>) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-gray-50 text-gray-600 text-sm border-b"><th className="p-3">Pub?</th><th className="p-3">Conta</th><th className="p-3">Tipo</th><th className="p-3">Regra</th><th className="p-3 text-right">Preço Final</th></tr></thead>
              <tbody>
                {contasML.map(conta => {
                  const conf = configPublicacao[conta.id];
                  if(!conf) return null;

                  const handleConfig = (campo, val) => setConfigPublicacao(p => ({...p, [conta.id]: {...p[conta.id], [campo]: val}}));

                  const hasCalculated = conf.ativo && (conf.tipo === 'ambos' ? (precosCalculados[`${conta.id}_classico`] && precosCalculados[`${conta.id}_premium`]) : precosCalculados[`${conta.id}_${conf.tipo}`]);

                  return (
                    <React.Fragment key={conta.id}>
                      <tr className={`border-b ${conf.ativo ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                        <td className="p-3"><input type="checkbox" className="w-5 h-5 cursor-pointer" checked={conf.ativo} onChange={e => handleConfig('ativo', e.target.checked)} /></td>
                        <td className="p-3 font-bold">{conta.nickname}</td>
                        <td className="p-3"><select disabled={!conf.ativo} value={conf.tipo} onChange={e => handleConfig('tipo', e.target.value)} className="border rounded p-1 text-sm w-full"><option value="classico">Clássico</option><option value="premium">Premium</option><option value="ambos">Ambos</option></select></td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <select disabled={!conf.ativo} value={conf.regraId || ''} onChange={e => handleConfig('regraId', e.target.value)} className="border rounded p-1 text-sm flex-1">
                              {regrasPreco.length > 0 && (
                                <optgroup label="Regras Personalizadas">
                                  {regrasPreco.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                                </optgroup>
                              )}
                              <optgroup label="Opções Fixas">
                                {REGRAS_FIXAS.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                              </optgroup>
                            </select>
                            {conf.regraId === 'manual' && (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="R$ 0,00"
                                disabled={!conf.ativo}
                                value={conf.precoManual || ''}
                                onChange={e => handleConfig('precoManual', e.target.value)}
                                className="border rounded p-1 text-sm w-28"
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right font-black text-green-700">
                          {conf.tipo === 'ambos' ? (
                            <div className="text-sm">
                              C: {precosCalculados[`${conta.id}_classico`] ? `R$ ${precosCalculados[`${conta.id}_classico`].precoFinal.toFixed(2)}` : '...'}<br/>
                              P: {precosCalculados[`${conta.id}_premium`] ? `R$ ${precosCalculados[`${conta.id}_premium`].precoFinal.toFixed(2)}` : '...'}
                            </div>
                          ) : (
                            precosCalculados[`${conta.id}_${conf.tipo}`] ? `R$ ${precosCalculados[`${conta.id}_${conf.tipo}`].precoFinal.toFixed(2)}` : '...'
                          )}
                        </td>
                      </tr>
                      {/* RESTAURAÇÃO: Detalhes Expansíveis da Matemática do Preço */}
                      {conf.ativo && hasCalculated && (
                        <tr className="bg-gray-50 border-b">
                          <td colSpan="5" className="p-3">
                            <details className="text-sm text-gray-700 group">
                              <summary className="cursor-pointer font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 select-none">
                                <span className="transform transition-transform group-open:rotate-90">▶</span> Ver detalhes do cálculo
                              </summary>
                              {conf.tipo === 'ambos' ? (
                                <div className="flex flex-col gap-2">
                                  {renderDetalhes(precosCalculados[`${conta.id}_classico`], 'Cálculo: Clássico', 'text-blue-800')}
                                  {renderDetalhes(precosCalculados[`${conta.id}_premium`], 'Cálculo: Premium', 'text-purple-800')}
                                </div>
                              ) : (
                                renderDetalhes(precosCalculados[`${conta.id}_${conf.tipo}`], null, null)
                              )}
                            </details>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}