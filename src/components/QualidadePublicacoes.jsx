import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TAG_DISPLAY_MAP } from './GerenciadorAnuncios';

// Tags que indicam problema de qualidade
const QUALITY_TAGS = [
  'incomplete_technical_specs',
  'poor_quality_picture',
  'poor_quality_thumbnail',
  'moderation_penalty',
  'incomplete_compatibilities',
  'incomplete_position_compatibilities',
  'out_of_stock',
  'waiting_for_patch',
  'picture_downloading_pending',
];

function healthColor(pct) {
  if (pct >= 80) return 'text-green-600';
  if (pct >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

// ===== MODAL FICHA TÉCNICA =====
function ModalFichaTecnica({ skuData, usuarioId, onClose }) {
  const [aba, setAba] = useState('atributos'); // 'atributos' | 'descricao' | 'titulo'
  const [attrs, setAttrs] = useState([]);
  const [valores, setValores] = useState({});
  const [marcados, setMarcados] = useState({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erroMsg, setErroMsg] = useState('');
  // Descrição
  const [descricao, setDescricao] = useState('');
  const [loadingDesc, setLoadingDesc] = useState(false);
  const [enviarDesc, setEnviarDesc] = useState(false);
  // Título
  const [titulo, setTitulo] = useState(skuData?.ads?.[0]?.titulo || '');
  const [alterarTitulo, setAlterarTitulo] = useState(false);
  // IA prompt/paste
  const [modalColagem, setModalColagem] = useState(false);
  const [textoColagem, setTextoColagem] = useState('');

  // Procura category_id em QUALQUER ad do SKU
  const categoryFromAds = skuData?.ads?.map(ad => ad.dadosML?.category_id).find(Boolean) || null;
  const [categoryId, setCategoryId] = useState(categoryFromAds);

  // Fallback: se nenhum ad tem category_id, busca via rota leve
  useEffect(() => {
    if (categoryFromAds) return; // já tem, não precisa buscar
    const adComId = skuData?.ads?.find(ad => ad.id);
    if (!adComId) { setLoading(false); setErroMsg('Nenhum anúncio com ID válido encontrado.'); return; }
    fetch(`/api/ml/item-category/${adComId.id}`)
      .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
      .then(d => {
        if (d?.category_id) setCategoryId(d.category_id);
        else { setLoading(false); setErroMsg('Categoria não encontrada para este anúncio.'); }
      })
      .catch(e => { setLoading(false); setErroMsg(`Erro ao buscar categoria: ${e}`); });
  }, []);

  useEffect(() => {
    if (!categoryId) return; // aguarda o fallback acima resolver
    setLoading(true);
    setErroMsg('');
    fetch(`/api/ml/category-attributes/${categoryId}`)
      .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
      .then(data => {
        const filtrados = Array.isArray(data)
          ? data.filter(a => a.id && !a.id.startsWith('SELLER_'))
          : [];
        setAttrs(filtrados);

        // Preenche valores atuais a partir de qualquer anúncio do SKU
        const valoresAtuais = {};
        for (const ad of (skuData.ads || [])) {
          const attrList = ad.dadosML?.attributes || [];
          for (const a of attrList) {
            if (!valoresAtuais[a.id] && (a.value_name || a.value_struct?.number)) {
              valoresAtuais[a.id] = a.value_name || String(a.value_struct?.number || '');
            }
          }
        }
        setValores(valoresAtuais);

        // Marca como "enviar" apenas atributos que estão vazios e são obrigatórios
        const initMarcados = {};
        filtrados.forEach(a => {
          const isRequired = a.tags?.required || a.tags?.catalog_required;
          initMarcados[a.id] = isRequired && !valoresAtuais[a.id];
        });
        setMarcados(initMarcados);
      })
      .catch(e => setErroMsg(`Erro ao buscar atributos: ${e}`))
      .finally(() => setLoading(false));
  }, [categoryId]);

  // Carrega descrição quando entra na aba
  useEffect(() => {
    if (aba !== 'descricao' || descricao !== '' || loadingDesc) return;
    const adComId = skuData?.ads?.find(ad => ad.id);
    if (!adComId) return;
    setLoadingDesc(true);
    fetch(`/api/ml/item-description/${adComId.id}`)
      .then(r => r.ok ? r.json() : { descricao: '' })
      .then(d => setDescricao(d.descricao || ''))
      .finally(() => setLoadingDesc(false));
  }, [aba]);

  const gerarPrompt = async () => {
    const tituloAtual = titulo || skuData?.ads?.[0]?.titulo || 'Produto sem título';
    const permalink = skuData?.ads?.[0]?.dadosML?.permalink || '';

    // Imagens: tenta pegar do dadosML (se foi sincronizado com pictures)
    // Caso contrário busca via endpoint on-demand
    const todasImagens = [];
    for (const ad of (skuData.ads || [])) {
      for (const pic of (ad.dadosML?.pictures || [])) {
        const url = pic.url || pic.secure_url || '';
        if (url && !todasImagens.includes(url)) todasImagens.push(url);
      }
    }
    if (todasImagens.length === 0) {
      const adComId = skuData?.ads?.find(ad => ad.id);
      if (adComId) {
        try {
          const r = await fetch(`/api/ml/item-pictures/${adComId.id}`);
          if (r.ok) {
            const d = await r.json();
            for (const pic of (d.pictures || [])) {
              const url = pic.url || pic.secure_url || '';
              if (url && !todasImagens.includes(url)) todasImagens.push(url);
            }
          }
        } catch {}
      }
    }

    // Fallback: imagens do produto no Tiny (armazenadas no DB)
    if (todasImagens.length === 0 && skuData?.sku && usuarioId) {
      try {
        const r = await fetch(`/api/produto-imagens?userId=${encodeURIComponent(usuarioId)}&sku=${encodeURIComponent(skuData.sku)}`);
        if (r.ok) {
          const d = await r.json();
          for (const url of (d.imagens || [])) {
            if (url && !todasImagens.includes(url)) todasImagens.push(url);
          }
        }
      } catch {}
    }
    const imagensTexto = todasImagens.length > 0
      ? todasImagens.map((url, i) => `- Imagem ${i + 1}: ${url}`).join('\n')
      : '(Nenhuma imagem encontrada)';

    // Descrição atual — busca se ainda não carregou
    let descricaoAtual = descricao;
    if (!descricaoAtual) {
      const adComId = skuData?.ads?.find(ad => ad.id);
      if (adComId) {
        try {
          const r = await fetch(`/api/ml/item-description/${adComId.id}`);
          if (r.ok) { const d = await r.json(); descricaoAtual = d.descricao || ''; if (descricaoAtual) setDescricao(descricaoAtual); }
        } catch {}
      }
    }

    // Ficha técnica atual (valores já preenchidos como referência)
    const fichaAtual = attrs.filter(a => valores[a.id])
      .map(a => `- ${a.name}: ${valores[a.id]}`).join('\n') || '(Nenhum atributo preenchido)';

    // Atributos faltando com opções
    const atribsFaltando = attrs.filter(a => !valores[a.id]);
    const faltandoTexto = atribsFaltando.length > 0
      ? atribsFaltando.map(a => {
          const opcoes = Array.isArray(a.values) && a.values.length > 0
            ? `\n    Opções: ${a.values.slice(0, 20).map(v => v.name).join(', ')}${a.values.length > 20 ? '...' : ''}`
            : '';
          return `- "${a.name}" (ID: ${a.id})${opcoes}`;
        }).join('\n')
      : '(Todos os atributos já estão preenchidos)';

    // Template JSON com comentários
    const jsonTemplate = atribsFaltando.length > 0
      ? '{\n' + atribsFaltando.map((a, i) =>
          `  "${a.id}": ""${i < atribsFaltando.length - 1 ? ',' : ''} // ${a.name}`
        ).join('\n') + '\n}'
      : '{}';

    const prompt = `Atue como um especialista de cadastro de produtos e SEO para o Mercado Livre.
Analise os dados abaixo:

TÍTULO ATUAL: ${tituloAtual}
LINK DO ANÚNCIO (ML): ${permalink || '(não disponível)'}

LINKS DAS IMAGENS (Acesse as imagens para tentar identificar a cor, o material, conectores e outros dados visuais):
${imagensTexto}

DESCRIÇÃO ATUAL:
${descricaoAtual || '(Nenhuma descrição encontrada para este anúncio)'}

FICHA TÉCNICA ATUAL (ATENÇÃO: Use isso APENAS como referência. Alguns campos podem ter sido preenchidos com valores genéricos/incorretos no passado apenas para ganhar posicionamento nas buscas. Valide visualmente usando as imagens e corrija se necessário):
${fichaAtual}

ATRIBUTOS QUE PRECISAM SER PREENCHIDOS:
${faltandoTexto}

Sua tarefa é dividida em TRÊS partes:

PARTE 1 - SUGESTÃO DE TÍTULO (opcional):
Se o título atual puder ser melhorado para SEO no Mercado Livre, sugira um novo.
Regras: máximo 60 caracteres, sem símbolos especiais, inclua palavras-chave relevantes.
Se o título atual já for bom, omita esta parte completamente.
Formato: coloque "TÍTULO: [novo título]" como PRIMEIRA linha da resposta.

PARTE 2 - NOVA DESCRIÇÃO PARA SEO:
Crie uma descrição melhorada e persuasiva para o Mercado Livre.
Formato obrigatório: TEXTO SIMPLES. Sem HTML. Use apenas parágrafos pulando uma linha, hifens (-) para listas e letras MAIÚSCULAS para destacar os subtítulos (ex: DESTAQUES, ESPECIFICAÇÕES).
A nova descrição NÃO deve estar dentro do bloco JSON.

PARTE 3 - COMPLETAR ATRIBUTOS (JSON):
Preencha os atributos que estão faltando, usando a descrição, as imagens e o seu conhecimento sobre o produto.
REGRAS IMPORTANTES:
- Preencha APENAS campos que você souber o valor correto com certeza.
- Se o campo tiver "Opções:" listadas, use EXATAMENTE um dos valores listados.
- Se você NÃO SOUBER o valor ou o campo não se aplicar ao produto, deixe o valor como "" (string vazia) — NÃO use "N/A", "Não se aplica", "0 mm" ou qualquer placeholder.
- Campos vazios ("") serão automaticamente ignorados no envio.
- CAMPOS DE DIMENSÃO/MEDIDA (largura, diâmetro, altura, comprimento, espessura, etc.): o valor DEVE incluir a unidade junto. Exemplos aceitos: "15 polegadas", "10.5 polegadas", "200 mm", "35 cm". Unidades válidas: cm, mm, m, km, polegadas, in, yd, milhas, ft, µm, mil, mãos, U. NUNCA envie apenas o número sem unidade (ex: "15" sozinho será rejeitado pelo sistema).

Responda EXATAMENTE neste formato (TÍTULO é opcional — omita se o atual já for bom):

TÍTULO: [novo título sugerido, ou omita esta linha]

[SUA NOVA DESCRIÇÃO AQUI]

\`\`\`json
${jsonTemplate}
\`\`\``;

    try {
      await navigator.clipboard.writeText(prompt);
      alert('✅ Prompt copiado!\n\nCole em ChatGPT, Claude ou outra IA.\nDepois clique em "2. Colar Resposta da IA".');
    } catch {
      setTextoColagem(prompt);
      setModalColagem(true);
    }
  };

  // Valores placeholder que a IA pode gerar mas o ML não aceita
  const VALORES_INVALIDOS = new Set([
    'n/a', 'na', 'não se aplica', 'nao se aplica', 'não aplicável', 'nao aplicavel',
    '0 mm', '0 cm', '0 g', '0 kg', '0 m', '0 l', '0', '-', '--', 'null', 'undefined',
  ]);
  const isValorValido = (val) => {
    if (!val || typeof val !== 'string' || !val.trim()) return false;
    return !VALORES_INVALIDOS.has(val.trim().toLowerCase());
  };

  const aplicarRespostaIA = (texto) => {
    // Extrai sugestão de título (primeira linha "TÍTULO: ...")
    let textoSemTitulo = texto;
    const tituloIAMatch = texto.match(/^TÍTULO:\s*(.+)/m);
    if (tituloIAMatch && tituloIAMatch[1].trim()) {
      setTitulo(tituloIAMatch[1].trim().substring(0, 60));
      textoSemTitulo = texto.replace(/^TÍTULO:.*\r?\n?/m, '').trim();
    }

    // Extrai bloco ```json ... ```
    const jsonBlockMatch = textoSemTitulo.match(/```json\s*([\s\S]*?)```/);
    let aplicou = false;

    if (jsonBlockMatch) {
      try {
        // Remove comentários // antes de parsear
        const jsonLimpo = jsonBlockMatch[1].replace(/\/\/[^\n]*/g, '').trim();
        const parsed = JSON.parse(jsonLimpo);
        const novosValores = { ...valores };
        const novosMarcados = { ...marcados };
        for (const [id, val] of Object.entries(parsed)) {
          if (isValorValido(val)) {
            novosValores[id] = val.trim();
            novosMarcados[id] = true;
          }
        }
        setValores(novosValores);
        setMarcados(novosMarcados);
        aplicou = true;
      } catch { alert('Erro ao analisar JSON. Verifique se a IA seguiu o formato solicitado.'); return; }

      // Descrição = tudo antes do bloco ```json
      const descTexto = textoSemTitulo.substring(0, textoSemTitulo.indexOf('```json')).trim();
      if (descTexto) setDescricao(descTexto);
    } else {
      // Fallback: JSON genérico sem code block
      const genericJson = textoSemTitulo.match(/\{[\s\S]*\}/);
      if (genericJson) {
        try {
          const jsonLimpo = genericJson[0].replace(/\/\/[^\n]*/g, '').trim();
          const parsed = JSON.parse(jsonLimpo);
          const novosValores = { ...valores };
          const novosMarcados = { ...marcados };
          for (const [id, val] of Object.entries(parsed)) {
            if (isValorValido(val)) {
              novosValores[id] = val.trim();
              novosMarcados[id] = true;
            }
          }
          setValores(novosValores);
          setMarcados(novosMarcados);
          const textoBefore = textoSemTitulo.substring(0, genericJson.index).trim();
          if (textoBefore) setDescricao(textoBefore);
          aplicou = true;
        } catch {}
      }
    }

    if (!aplicou) {
      // Fallback: trata o texto inteiro como descrição pura (sem JSON de atributos)
      if (textoSemTitulo.trim()) {
        setDescricao(textoSemTitulo.trim());
        setModalColagem(false);
        setTextoColagem('');
        setAba('descricao');
        alert('✅ Texto aplicado como descrição! Vá à aba "Descrição" para revisar e enviar.');
        return;
      }
      alert('Nenhum dado reconhecido. Cole a resposta completa da IA no formato solicitado.');
      return;
    }
    setModalColagem(false);
    setTextoColagem('');
    alert('✅ Dados aplicados! Revise os valores antes de enviar.');
  };


  const handleEnviar = async () => {
    setEnviando(true);
    let tituloEnviado = null;

    // Coleta todos os anúncios do grupo, incluindo vendas para a regra do título
    const allItems = (skuData?.ads || []).map((ad) => ({
      id: ad.id,
      contaId: ad.contaId,
      vendas: Number(ad.vendas || 0),
    }));

    try {
      if (!usuarioId) {
        throw new Error('Usuário não identificado.');
      }

      if (!allItems.length) {
        throw new Error('Nenhum anúncio encontrado para envio.');
      }

      if (aba === 'atributos') {
        const atributosParaEnviar = attrs
          .filter((a) => marcados[a.id] && String(valores[a.id] || '').trim())
          .map((a) => {
            const valorLimpo = String(valores[a.id] || '').trim();

            const payload = {
              id: a.id,
              value_name: valorLimpo,
            };

            if (Array.isArray(a.values)) {
              const match = a.values.find(
                (v) => String(v.name || '').trim().toLowerCase() === valorLimpo.toLowerCase()
              );

              if (match?.id) {
                payload.value_id = match.id;
              }
            }

            return payload;
          });

        if (!atributosParaEnviar.length) {
          alert('Nenhum atributo marcado para envio ou com valor preenchido.');
          return;
        }

        const res = await fetch('/api/ml/acoes-massa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: usuarioId,
            items: allItems,
            acao: 'atualizar_atributos',
            valor: atributosParaEnviar,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.erro || data?.message || 'Erro desconhecido');
        }

        alert(
          `✅ ${atributosParaEnviar.length} atributo(s) enfileirado(s) para ${allItems.length} anúncio(s)!\nAcompanhe na aba "Gerenciador de Fila".`
        );
      } else if (aba === 'titulo') {
        const novoTitulo = String(titulo || '').trim();

        if (!novoTitulo) {
          alert('O título está vazio.');
          return;
        }

        if (!alterarTitulo) {
          alert('Marque o checkbox para confirmar a alteração do título.');
          return;
        }

        // Prepara todos os itens para envio, incluindo os que têm vendas
        const itensParaEnviar = allItems.map(({ id, contaId }) => ({ id, contaId }));
        const itensComVendasCount = allItems.filter((ad) => Number(ad.vendas) > 0).length;

        const res = await fetch('/api/ml/acoes-massa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: usuarioId,
            items: itensParaEnviar,
            acao: 'editar_titulo',
            valor: novoTitulo,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.erro || data?.message || 'Erro desconhecido');
        }

        tituloEnviado = novoTitulo;

        let successMsg = `✅ Título enfileirado para ${itensParaEnviar.length} anúncio(s)!\nAcompanhe na aba "Gerenciador de Fila".`;

        if (itensComVendasCount > 0) {
          successMsg += `\n\n⚠️ ${itensComVendasCount} anúncio(s) possuem vendas. O sistema utilizará o método "Family Name" para alterar o título diretamente.`;
        }

        alert(successMsg);
      } else {
        const descricaoLimpa = String(descricao || '').trim();

        if (!descricaoLimpa) {
          alert('A descrição está vazia.');
          return;
        }

        const res = await fetch('/api/ml/acoes-massa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: usuarioId,
            items: allItems,
            acao: 'editar_descricao',
            valor: descricaoLimpa,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.erro || data?.message || 'Erro desconhecido');
        }

        alert(
          `✅ Descrição enviada para ${allItems.length} anúncio(s)!\nAcompanhe na aba "Gerenciador de Fila".`
        );
      }

      onClose(true, tituloEnviado);
    } catch (e) {
      alert(`Erro: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };


  const atributosFaltando = attrs.filter(a => !valores[a.id]);
  const atributosPreenchidos = attrs.filter(a => valores[a.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-base">Ficha Técnica & Descrição</h2>
            <p className="text-amber-100 text-xs mt-0.5">SKU: {skuData.sku} · {(skuData.ads || []).length} anúncio(s) · Cat: {categoryId || 'N/D'}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setAba('atributos')}
            className={`px-5 py-2.5 text-xs font-bold transition border-b-2 ${aba === 'atributos' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            📋 Atributos
          </button>
          <button
            onClick={() => setAba('descricao')}
            className={`px-5 py-2.5 text-xs font-bold transition border-b-2 ${aba === 'descricao' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            📝 Descrição
          </button>
          <button
            onClick={() => setAba('titulo')}
            className={`px-5 py-2.5 text-xs font-bold transition border-b-2 ${aba === 'titulo' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            ✏️ Título
          </button>
        </div>

        {/* Barra IA - visível em ambas as abas */}
        {!loading && !erroMsg && (
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide mr-1">✨ IA</span>
            <button
              onClick={gerarPrompt}
              className="px-3 py-1 text-xs font-bold text-white bg-indigo-500 rounded hover:bg-indigo-600 transition"
            >
              1. Gerar Prompt p/ IA
            </button>
            <button
              onClick={() => { setTextoColagem(''); setModalColagem(true); }}
              className="px-3 py-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-300 rounded hover:bg-indigo-50 transition"
            >
              2. Colar Resposta da IA
            </button>
          </div>
        )}

        {/* Modal de colagem */}
        {modalColagem && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl" onClick={() => setModalColagem(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-sm text-gray-800">Cole a resposta da IA</h3>
              <p className="text-xs text-gray-500">Cole aqui a resposta completa. O sistema irá extrair automaticamente os atributos e a descrição.</p>
              <textarea
                value={textoColagem}
                onChange={e => setTextoColagem(e.target.value)}
                placeholder="Cole aqui a resposta da IA..."
                rows={10}
                autoFocus
                className="w-full text-xs px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none font-mono"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setModalColagem(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">
                  Cancelar
                </button>
                <button
                  onClick={() => aplicarRespostaIA(textoColagem)}
                  disabled={!textoColagem.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  ✅ Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {aba === 'titulo' ? (
          <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 overflow-y-auto">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Título atual</p>
              {skuData.ads.map(ad => (
                <p key={ad.id} className="text-xs text-gray-600 truncate leading-relaxed">
                  <span className="font-mono text-blue-500 mr-1">{ad.id}</span>{ad.titulo}
                </p>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Novo título</label>
              <input
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value.substring(0, 60))}
                placeholder="Digite o novo título (máx. 60 caracteres)..."
                className="w-full text-xs px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <p className={`text-[10px] mt-1 ${titulo.length >= 55 ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>{titulo.length}/60 caracteres</p>
            </div>
            {skuData.vendas > 0 && (
              <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-700 font-semibold">⚠️ Este SKU possui {skuData.vendas} venda(s). O sistema utilizará o método "Family Name" para alterar o título diretamente.</p>
              </div>
            )}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alterarTitulo}
                onChange={e => setAlterarTitulo(e.target.checked)}
                className="mt-0.5 cursor-pointer"
              />
              <span className="text-xs text-gray-700">Confirmo que desejo alterar o título de <strong>todos os {skuData.ads.length} anúncio(s)</strong> deste SKU</span>
            </label>
          </div>
        ) : aba === 'descricao' ? (
          <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
            {/* Textarea descrição */}
            {loadingDesc ? (
              <div className="flex items-center gap-2 text-xs text-gray-400"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400 inline-block" /> Carregando descrição atual...</div>
            ) : (
              <textarea
                value={descricao}
                onChange={e => { setDescricao(e.target.value); setEnviarDesc(true); }}
                placeholder="Escreva ou cole uma descrição para os anúncios deste SKU..."
                className="flex-1 min-h-0 text-xs px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
              />
            )}
            <p className="text-[10px] text-gray-400 flex-shrink-0">{descricao.length} caracteres · será aplicada a todos os {(skuData.ads || []).length} anúncio(s) do SKU</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            <span className="ml-3 text-gray-500 text-sm">Carregando atributos da categoria...</span>
          </div>
        ) : erroMsg ? (
          <div className="p-8 text-center text-red-400">
            <p className="text-sm">{erroMsg}</p>
          </div>
        ) : attrs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p>Categoria <strong>{categoryId}</strong> não possui atributos editáveis.</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-amber-700 font-semibold">
                {atributosFaltando.length} atributo(s) sem valor · {atributosPreenchidos.length} já preenchido(s)
              </span>
              <button
                className="ml-auto text-xs text-blue-600 underline"
                onClick={() => {
                  const novo = {};
                  attrs.forEach(a => { novo[a.id] = !valores[a.id]; });
                  setMarcados(novo);
                }}
              >
                Marcar apenas vazios
              </button>
              <button
                className="text-xs text-blue-600 underline"
                onClick={() => {
                  const novo = {};
                  attrs.forEach(a => { novo[a.id] = true; });
                  setMarcados(novo);
                }}
              >
                Marcar todos
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {attrs.map(a => {
                const isRequired = a.tags?.required || a.tags?.catalog_required;
                const isEmpty = !valores[a.id];
                return (
                  <div key={a.id} className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${isEmpty ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                    <input
                      type="checkbox"
                      checked={!!marcados[a.id]}
                      onChange={e => setMarcados(prev => ({ ...prev, [a.id]: e.target.checked }))}
                      className="mt-1 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        {a.name}
                        {isRequired && <span className="text-red-500 text-[10px] font-bold">OBRIGATÓRIO</span>}
                        <span className="text-gray-300 font-mono text-[9px]">{a.id}</span>
                      </label>
                      {Array.isArray(a.values) && a.values.length > 0 ? (
                        <select
                          value={valores[a.id] || ''}
                          onChange={e => {
                            setValores(prev => ({ ...prev, [a.id]: e.target.value }));
                            if (e.target.value) setMarcados(prev => ({ ...prev, [a.id]: true }));
                          }}
                          className="mt-1 w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                        >
                          <option value="">-- Selecione --</option>
                          {a.values.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={valores[a.id] || ''}
                          onChange={e => {
                            setValores(prev => ({ ...prev, [a.id]: e.target.value }));
                            if (e.target.value) setMarcados(prev => ({ ...prev, [a.id]: true }));
                          }}
                          placeholder={a.hint || `Preencha ${a.name}...`}
                          className="mt-1 w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3 flex-shrink-0 rounded-b-xl">
          <span className="text-xs text-gray-400">
            {aba === 'atributos'
              ? `${Object.values(marcados).filter(Boolean).length} atributo(s) marcado(s) para envio`
              : aba === 'titulo'
              ? `${titulo.length}/60 caracteres${alterarTitulo ? ' · pronto para enviar' : ' · marque o checkbox para confirmar'}`
              : `${descricao.length} caracteres`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">
              Cancelar
            </button>
            <button
              onClick={handleEnviar}
              disabled={enviando || (aba === 'atributos' && loading)}
              className="px-5 py-2 text-sm font-black text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {enviando ? '⏳ Enviando...' : '✅ Salvar e Enfileirar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CACHE_KEY = 'qualidade_skumap_v3';
const PERF_CACHE_KEY = 'qualidade_perf_v1';

// Cache em memória (sobrevive à troca de telas na mesma sessão, sem limitação de quota)
let _memCache = { skuMap: null, ts: null };

function lerPerfCache() {
  try {
    const raw = localStorage.getItem(PERF_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function salvarPerfCache(m) {
  try { localStorage.setItem(PERF_CACHE_KEY, JSON.stringify(m)); } catch {}
}

// Normaliza as primeiras palavras do título para usar como chave de agrupamento
// Ignora stopwords para que "Rede Tela Organizadora" e "Rede Tela p/ Organizadora" caiam no mesmo grupo
// mas "Rede Tela Organizadora" e "Lanterna Traseira Troller" nunca se misturem
function tituloClave(titulo) {
  if (!titulo) return '_sem_titulo';
  const stop = new Set(['de','da','do','das','dos','para','com','em','por','um','uma','os','as','e','ou','a','o','na','no','nas','nos','p','pra']);
  return titulo
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stop.has(w))
    .slice(0, 3)
    .join('_');
}

function lerCache() {
  // Prioridade: memória (sem limite de quota) → localStorage (persistência entre sessões)
  if (_memCache.skuMap && _memCache.ts) return { data: _memCache.skuMap, ts: _memCache.ts };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Preenche memória com dado do localStorage para próximas leituras
    _memCache = { skuMap: data, ts };
    return { data, ts };
  } catch { return null; }
}

// ===== COMPONENTE PRINCIPAL =====
export default function QualidadePublicacoes({ usuarioId }) {
  const [skuMap, setSkuMap] = useState(() => {
    const cache = lerCache();
    return cache ? cache.data : {};
  });
  const [cacheTs, setCacheTs] = useState(() => {
    const cache = lerCache();
    return cache ? cache.ts : null;
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(() => {
    const cache = lerCache();
    return cache ? `Dados em cache de ${new Date(cache.ts).toLocaleString('pt-BR')}.` : '';
  });
  const [selectedSku, setSelectedSku] = useState(null);
  const [modalSku, setModalSku] = useState(null);
  const [feitos, setFeitos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('qualidade_feitos') || '{}'); }
    catch { return {}; }
  });

  // Performance cache (score oficial ML)
  const [perfMap, setPerfMap] = useState(() => lerPerfCache()); // { [itemId]: { score, level, fetchedAt } }
  const [perfLoading, setPerfLoading] = useState({}); // { [skuKey]: bool }

  // Filtros
  const [filtroSku, setFiltroSku] = useState('');
  const [filtroApenasCAviso, setFiltroApenasCAviso] = useState(true);
  const [filtroSemCatalogo, setFiltroSemCatalogo] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('Pendentes');
  const [filtroQualidadeMax, setFiltroQualidadeMax] = useState('');
  const [sortCol, setSortCol] = useState({ col: 'vendas', rev: true });

  const salvarFeitos = (novoFeitos) => {
    setFeitos(novoFeitos);
    localStorage.setItem('qualidade_feitos', JSON.stringify(novoFeitos));
  };

  // Retorna a qualidade real do grupo: usa score da API /performance quando disponível,
  // senão cai no campo health do anúncio (0-100)
  const getGroupQuality = useCallback((skuData) => {
    const scores = skuData.ads
      .map(ad => perfMap[ad.id]?.score)
      .filter(s => s !== undefined && s !== null);
    if (scores.length > 0) return Math.min(...scores); // pior anúncio do grupo
    return skuData.health;
  }, [perfMap]);

  // Re-busca dados do anúncio no ML e atualiza score de qualidade
  const atualizarNotaSku = useCallback(async (skuData) => {
    setPerfLoading(prev => ({ ...prev, [skuData._key]: true }));
    try {
      const novoPerf = { ...perfMap };
      let menorHealth = 100;

      for (const ad of skuData.ads) {
        try {
          const res = await fetch(`/api/ml/item-performance/${ad.id}?contaId=${ad.contaId}&userId=${usuarioId}`);
          if (res.ok) {
            const data = await res.json();
            novoPerf[ad.id] = { score: data.score, level: data.level, fetchedAt: Date.now() };
            if (data.score < menorHealth) menorHealth = data.score;
          }
        } catch {}
      }

      setPerfMap(novoPerf);
      salvarPerfCache(novoPerf);

      // Atualiza o health no skuMap para refletir visualmente sem precisar recarregar tudo
      setSkuMap(prev => {
        const atualizado = {
          ...prev,
          [skuData._key]: { ...prev[skuData._key], health: menorHealth }
        };
        _memCache = { ..._memCache, skuMap: atualizado };
        return atualizado;
      });
    } finally {
      setPerfLoading(prev => ({ ...prev, [skuData._key]: false }));
    }
  }, [perfMap, usuarioId]);

  const carregarAnuncios = useCallback(async () => {
    const contas = JSON.parse(localStorage.getItem('saas_contas_ml') || '[]');
    if (!contas.length) {
      setStatusMsg('Nenhuma conta ML conectada. Configure em "Configurações".');
      return;
    }
    const contasIds = contas.map(c => c.id).join(',');
    setLoading(true);
    setStatusMsg('Carregando anúncios...');
    setSkuMap({});
    _memCache = { skuMap: null, ts: null }; // limpa memória para forçar recarga
    localStorage.removeItem(CACHE_KEY);

    try {
      // Carrega todas as páginas
      let page = 1;
      const limite = 500;
      let todos = [];
      let total = 1;

      while (todos.length < total) {
        const res = await fetch(`/api/ml/anuncios?contasIds=${contasIds}&status=active&limit=${limite}&page=${page}&sortBy=vendas_desc`);
        if (!res.ok) throw new Error('Falha ao carregar anúncios');
        const data = await res.json();
        total = data.total || 0;
        const batch = data.anuncios || [];
        todos = todos.concat(batch);
        if (batch.length < limite) break;
        page++;
        setStatusMsg(`Carregando... ${todos.length}/${total}`);
      }

      // Agrupa por SKU + prefixo do título
      // Mesmo SKU com títulos diferentes → grupos separados (produtos distintos)
      // Mesmo produto em contas diferentes (mesmo SKU + título similar) → mesmo grupo
      const mapa = {};
      for (const ad of todos) {
        const skuBase = ad.sku || null;
        const tkey = tituloClave(ad.titulo);
        // Chave interna: SKU + título (evita misturar produtos diferentes com mesmo SKU)
        const grupoKey = skuBase ? `${skuBase}__${tkey}` : `SEM_SKU_${ad.id}`;

        if (!mapa[grupoKey]) {
          mapa[grupoKey] = {
            sku: skuBase || `SEM_SKU_${ad.id}`, // SKU exibido na tabela
            ads: [],
            vendas: 0,
            health: 100,
            tags: new Set(),
            categorias: new Set(),
            temCatalogo: false,
          };
        }
        const bucket = mapa[grupoKey];
        bucket.ads.push(ad);
        bucket.vendas += Number(ad.vendas || 0);
        const adHealth = Number(ad.dadosML?.health ?? 1) * 100;
        if (adHealth < bucket.health) bucket.health = adHealth;
        if (ad.tagPrincipal) bucket.tags.add(ad.tagPrincipal);
        if (ad.dadosML?.category_id) bucket.categorias.add(ad.dadosML.category_id);
        if (ad.dadosML?.catalog_product_id) bucket.temCatalogo = true;
      }

      // Serializa sets e adiciona _key (chave interna do mapa)
      const mapaFinal = {};
      for (const [key, d] of Object.entries(mapa)) {
        mapaFinal[key] = {
          ...d,
          _key: key,
          tags: Array.from(d.tags),
          categorias: Array.from(d.categorias),
        };
      }

      setSkuMap(mapaFinal);
      const agora = Date.now();
      setCacheTs(agora);

      // Salva na memória (sempre funciona, sem limitação de quota)
      _memCache = { skuMap: mapaFinal, ts: agora };

      // Salva no cache apenas os campos necessários para exibição (sem pictures/attributes/variations)
      const mapaSlim = {};
      for (const [s, d] of Object.entries(mapaFinal)) {
        mapaSlim[s] = {
          ...d,
          ads: d.ads.map(ad => ({
            id: ad.id,
            contaId: ad.contaId,
            sku: ad.sku,
            titulo: ad.titulo,
            preco: ad.preco,
            estoque: ad.estoque,
            vendas: ad.vendas,
            tagPrincipal: ad.tagPrincipal,
            thumbnail: ad.thumbnail,
            permalink: ad.permalink,
            conta: ad.conta,
            dadosML: ad.dadosML ? {
              health: ad.dadosML.health,
              category_id: ad.dadosML.category_id,
              catalog_product_id: ad.dadosML.catalog_product_id,
              permalink: ad.dadosML.permalink,
            } : null,
          })),
        };
      }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: mapaSlim, ts: agora }));
      } catch {
        // Quota excedida — memória já garante a sessão atual
      }
      setStatusMsg(`${Object.keys(mapaFinal).length} SKUs carregados (${todos.length} anúncios).`);
    } catch (e) {
      setStatusMsg(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportarCSV = () => {
    const linhas = [['SKU', 'Anúncios', 'Vendas', 'Health%', 'Catálogo', 'Tags/Avisos', 'Status']];
    for (const d of filtrouLinhas) {
      linhas.push([
        d.sku, d.ads.length, d.vendas,
        d.health.toFixed(0),
        d.temCatalogo ? 'Sim' : 'Não',
        d.tags.join(' | '),
        feitos[d._key] ? 'Feito' : 'Pendente',
      ]);
    }
    const csv = linhas.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `qualidade_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Filtragem e ordenação
  const todasLinhas = Object.values(skuMap);

  const filtrouLinhas = todasLinhas
    .filter(d => {
      if (filtroSku && !d.sku.toLowerCase().includes(filtroSku.toLowerCase())) return false;
      if (filtroApenasCAviso && d.tags.length === 0) return false;
      if (filtroSemCatalogo && d.temCatalogo) return false;
      const isFeito = feitos[d._key] || false;
      if (filtroStatus === 'Pendentes' && isFeito) return false;
      if (filtroStatus === 'Feitos' && !isFeito) return false;
      if (filtroQualidadeMax !== '') {
        if (getGroupQuality(d) > Number(filtroQualidadeMax)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let va = a[sortCol.col], vb = b[sortCol.col];
      if (sortCol.col === 'ads') { va = a.ads.length; vb = b.ads.length; }
      if (sortCol.col === 'tags') { va = a.tags.length; vb = b.tags.length; }
      if (sortCol.col === 'health') { va = getGroupQuality(a); vb = getGroupQuality(b); }
      if (typeof va === 'number' && typeof vb === 'number') return sortCol.rev ? vb - va : va - vb;
      return sortCol.rev ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });

  const handleSort = (col) => {
    setSortCol(prev => ({ col, rev: prev.col === col ? !prev.rev : true }));
  };

  const ThSort = ({ col, children }) => (
    <th
      className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {children} {sortCol.col === col ? (sortCol.rev ? '↓' : '↑') : ''}
    </th>
  );

  const selectedData = selectedSku ? skuMap[selectedSku] : null; // selectedSku é a _key interna

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <button
          onClick={carregarAnuncios}
          disabled={loading}
          className="px-4 py-2 text-sm font-bold text-white rounded-lg transition flex items-center gap-2 disabled:opacity-60"
          style={{ background: cacheTs ? '#e67e22' : '#27ae60' }}
        >
          {loading ? (
            <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block" /> Carregando...</>
          ) : cacheTs ? (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Forçar Atualização</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> Analisar Anúncios</>
          )}
        </button>

        {todasLinhas.length > 0 && (
          <button onClick={exportarCSV} className="px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Exportar CSV
          </button>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap ml-auto">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filtroSemCatalogo} onChange={e => setFiltroSemCatalogo(e.target.checked)} />
            S/ Catálogo
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filtroApenasCAviso} onChange={e => setFiltroApenasCAviso(e.target.checked)} />
            C/ Avisos
          </label>
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option>Todos</option>
            <option>Pendentes</option>
            <option>Feitos</option>
          </select>
          <select
            value={filtroQualidadeMax}
            onChange={e => setFiltroQualidadeMax(e.target.value)}
            className="text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">Todas Notas</option>
            <option value="40">Nota &lt; 40%</option>
            <option value="60">Nota &lt; 60%</option>
            <option value="70">Nota &lt; 70%</option>
            <option value="80">Nota &lt; 80%</option>
          </select>
          <input
            type="text"
            placeholder="Filtrar SKU..."
            value={filtroSku}
            onChange={e => setFiltroSku(e.target.value)}
            className="text-xs px-2 py-1.5 border border-gray-300 rounded w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Status bar */}
      {statusMsg && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex-shrink-0">
          {statusMsg}
          {filtrouLinhas.length !== todasLinhas.length && ` — Mostrando ${filtrouLinhas.length} de ${todasLinhas.length}`}
        </div>
      )}

      {/* Body split */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Tabela SKUs */}
        <div className="flex-1 overflow-auto border-r border-gray-200" style={{ minWidth: 0 }}>
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <ThSort col="sku">SKU</ThSort>
                <ThSort col="status">Tarefa</ThSort>
                <ThSort col="vendas">Vendas</ThSort>
                <ThSort col="ads">Anúncios</ThSort>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Catálogo</th>
                <ThSort col="health">Health</ThSort>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Tags / Avisos</th>
              </tr>
            </thead>
            <tbody>
              {filtrouLinhas.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {todasLinhas.length === 0
                      ? 'Clique em "Analisar Anúncios" para carregar os dados.'
                      : 'Nenhum SKU corresponde aos filtros selecionados.'}
                  </td>
                </tr>
              )}
              {filtrouLinhas.map(d => {
                const isFeito = feitos[d._key] || false;
                const isSelected = selectedSku === d._key;
                return (
                  <tr
                    key={d._key}
                    onClick={() => setSelectedSku(d._key)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} ${isFeito ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-bold text-gray-800">{d.sku}</span>
                      {d.ads[0]?.titulo && (
                        <p className="text-[10px] text-gray-400 truncate max-w-[180px] leading-tight mt-0.5">{d.ads[0].titulo}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {isFeito
                        ? <span className="text-green-600 font-semibold">Feito ✓</span>
                        : <span className="text-orange-500 font-semibold">Pendente ⏳</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-center font-semibold">{d.vendas}</td>
                    <td className="px-3 py-2 text-xs text-center">{d.ads.length}</td>
                    <td className="px-3 py-2 text-xs text-center">
                      {d.temCatalogo
                        ? <span className="text-green-600 font-bold">Sim</span>
                        : <span className="text-gray-400">Não</span>}
                    </td>
                    <td className={`px-3 py-2 text-xs font-bold text-center ${healthColor(getGroupQuality(d))}`}>
                      {getGroupQuality(d).toFixed(0)}%
                      {d.ads.some(ad => perfMap[ad.id]) && <span className="text-[8px] text-gray-400 ml-0.5">★</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {d.tags.map(tag => {
                          const mapped = TAG_DISPLAY_MAP[tag];
                          return (
                            <span key={tag} className={`${mapped?.color || 'bg-gray-100 text-gray-600 border-gray-200'} border text-[9px] px-1.5 py-0.5 rounded font-bold`}>
                              {mapped?.label || tag}
                            </span>
                          );
                        })}
                        {d.tags.length === 0 && <span className="text-gray-300 text-xs">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Painel de detalhes — key={selectedSku} garante reset de scroll ao trocar seleção */}
        <div key={selectedSku || '__empty'} className="w-80 flex-shrink-0 overflow-auto bg-white flex flex-col" style={{ minWidth: 280 }}>
          {!selectedData ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300 p-6">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <p className="text-sm font-medium text-gray-400">Selecione um SKU</p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-100 flex-shrink-0">
                <h3 className="font-bold text-gray-800 text-sm">{selectedData.sku}</h3>
                {selectedData.ads[0]?.titulo && (
                  <p className="text-xs text-gray-600 mt-0.5 leading-tight line-clamp-2">{selectedData.ads[0].titulo}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{selectedData.ads.length} anúncio(s) · {selectedData.vendas} vendas</p>
              </div>

              {/* Nota de qualidade */}
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Qualidade da Publicação</p>
                    <p className={`text-2xl font-black leading-tight ${healthColor(getGroupQuality(selectedData))}`}>
                      {getGroupQuality(selectedData).toFixed(0)}%
                    </p>
                    {selectedData.ads.some(ad => perfMap[ad.id]) ? (
                      <p className="text-[9px] text-blue-500 mt-0.5">★ Score oficial ML (API Performance)</p>
                    ) : (
                      <p className="text-[9px] text-gray-400 mt-0.5">Campo health do anúncio</p>
                    )}
                  </div>
                  <button
                    onClick={() => atualizarNotaSku(selectedData)}
                    disabled={perfLoading[selectedData._key]}
                    className="px-3 py-2 text-xs font-bold text-white rounded-lg transition disabled:opacity-60 flex items-center gap-1"
                    style={{ background: '#2980b9' }}
                  >
                    {perfLoading[selectedData._key]
                      ? <><span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white inline-block" /> Calculando...</>
                      : <>📊 Atualizar Nota</>}
                  </button>
                </div>
                {/* Mini-barra de progresso visual */}
                <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getGroupQuality(selectedData) >= 80 ? 'bg-green-500' : getGroupQuality(selectedData) >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${getGroupQuality(selectedData)}%` }}
                  />
                </div>
              </div>

              {/* Ações */}
              <div className="p-3 border-b border-gray-100 flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => setModalSku(selectedData)}
                  className="w-full px-3 py-2 text-xs font-bold text-white rounded-lg transition"
                  style={{ background: '#e67e22' }}
                >
                  ✏️ Preencher Ficha Técnica...
                </button>
                <button
                  onClick={() => {
                    const novo = { ...feitos, [selectedData._key]: !feitos[selectedData._key] };
                    salvarFeitos(novo);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  {feitos[selectedData._key] ? '↩ Desmarcar (Voltar p/ Pendente)' : '✓ Marcar como Feito'}
                </button>
              </div>

              {/* Tags */}
              {selectedData.tags.length > 0 && (
                <div className="p-3 border-b border-gray-100 flex-shrink-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Tags / Problemas</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedData.tags.map(tag => {
                      const mapped = TAG_DISPLAY_MAP[tag];
                      return (
                        <span key={tag} className={`${mapped?.color || 'bg-gray-100 text-gray-600 border-gray-200'} border text-[9px] px-1.5 py-0.5 rounded font-bold`}>
                          {mapped?.label || tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lista de anúncios */}
              <div className="p-3 overflow-auto flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Anúncios Associados</p>
                <div className="space-y-2">
                  {selectedData.ads.map(ad => (
                    <div key={ad.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                      <div className="flex items-start gap-2">
                        {ad.thumbnail && (
                          <img src={ad.thumbnail} alt="" className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-mono font-bold text-blue-600">{ad.id}</p>
                          <p className="text-xs text-gray-700 truncate leading-tight mt-0.5">{ad.titulo}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{ad.conta?.nickname || ad.contaId}</p>
                          {ad.tagPrincipal && (() => {
                            const mapped = TAG_DISPLAY_MAP[ad.tagPrincipal];
                            return (
                              <span className={`mt-1 inline-block ${mapped?.color || 'bg-gray-100 text-gray-600 border-gray-200'} border text-[9px] px-1 py-0.5 rounded font-bold`}>
                                {mapped?.label || ad.tagPrincipal}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-500">💰 R${Number(ad.preco).toFixed(2)}</span>
                        <span className="text-[10px] text-gray-500">📦 {ad.estoque}</span>
                        <span className="text-[10px] text-gray-500">🛒 {ad.vendas}</span>
                        {perfMap[ad.id] && (
                          <span className={`text-[10px] font-bold ${healthColor(perfMap[ad.id].score)}`}>
                            ★ {perfMap[ad.id].score}%
                          </span>
                        )}
                        {ad.permalink && (
                          <a href={ad.permalink} target="_blank" rel="noreferrer" className="ml-auto text-[10px] text-blue-500 hover:underline">Ver ML →</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal ficha técnica */}
      {modalSku && (
        <ModalFichaTecnica
          skuData={modalSku}
          usuarioId={usuarioId}
          onClose={(enviou, novoTitulo) => {
            setModalSku(null);
            if (enviou) {
              const novo = { ...feitos, [modalSku._key]: true };
              salvarFeitos(novo);
              if (novoTitulo) {
                setSkuMap(prev => {
                  const grupo = prev[modalSku._key];
                  if (!grupo) return prev;
                  return {
                    ...prev,
                    [modalSku._key]: {
                      ...grupo,
                      ads: grupo.ads.map(ad => ({ ...ad, titulo: novoTitulo })),
                    },
                  };
                });
              }
            }
          }}
        />
      )}
    </div>
  );
}
