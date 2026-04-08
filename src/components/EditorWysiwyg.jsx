import { useState, useEffect, useRef } from 'react';

export default function EditorWysiwyg({ value, onChange, minHeight = 380 }) {
  const editorRef = useRef(null);
  const [modoHtml, setModoHtml] = useState(false);
  const [htmlBruto, setHtmlBruto] = useState(value || '');

  useEffect(() => {
    if (editorRef.current && !modoHtml) {
      editorRef.current.innerHTML = value || '';
    }
  }, []);

  const execCmd = (cmd, valor = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
    sincronizarParent();
  };

  const sincronizarParent = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const inserirLink = () => {
    const url = window.prompt('URL do link:', 'https://');
    if (url) execCmd('createLink', url);
  };

  const inserirImagem = () => {
    const url = window.prompt('URL da imagem:');
    if (url) execCmd('insertHTML', `<img src="${url}" style="max-width:100%;border-radius:6px;margin:8px 0;" alt="imagem" />`);
  };

  const inserirVideo = () => {
    const url = window.prompt('URL do YouTube (ex: https://youtu.be/abc123):');
    if (!url) return;
    let videoId = '';
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) videoId = u.pathname.slice(1);
      else videoId = u.searchParams.get('v') || '';
    } catch {
      videoId = url;
    }
    if (!videoId) return;
    execCmd('insertHTML', `<div style="position:relative;padding-bottom:56.25%;height:0;margin:12px 0;"><iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:8px;" allowfullscreen></iframe></div>`);
  };

  const inserirTabela = () => {
    const cols = parseInt(window.prompt('Número de colunas:', '3'), 10) || 3;
    const rows = parseInt(window.prompt('Número de linhas (sem contar cabeçalho):', '3'), 10) || 3;
    const ths = Array.from({ length: cols }, (_, i) => `<th style="border:1px solid #d0d7de;padding:8px 12px;background:#f6f8fa;font-weight:600;">Coluna ${i + 1}</th>`).join('');
    const tds = Array.from({ length: cols }, () => `<td style="border:1px solid #d0d7de;padding:8px 12px;">  </td>`).join('');
    const trs = Array.from({ length: rows }, () => `<tr>${tds}</tr>`).join('');
    execCmd('insertHTML', `<table style="border-collapse:collapse;width:100%;margin:12px 0;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
  };

  const toggleHtml = () => {
    if (!modoHtml) {
      const html = editorRef.current?.innerHTML || '';
      setHtmlBruto(html);
      setModoHtml(true);
    } else {
      if (editorRef.current) editorRef.current.innerHTML = htmlBruto;
      onChange(htmlBruto);
      setModoHtml(false);
    }
  };

  const btn = (active) => ({
    padding: '4px 8px', fontSize: '0.82em', border: '1px solid #d0d7de',
    borderRadius: 4, background: active ? '#0969da' : '#f6f8fa',
    color: active ? '#fff' : '#1f2328', cursor: 'pointer', fontWeight: 500,
    lineHeight: 1.4, whiteSpace: 'nowrap',
  });

  const sep = { width: 1, height: 20, background: '#d0d7de', margin: '0 2px', flexShrink: 0 };

  return (
    <div style={{ border: '1px solid #d0d7de', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── Barra de ferramentas ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '8px 10px', background: '#f6f8fa', borderBottom: '1px solid #d0d7de', alignItems: 'center' }}>

        {/* Formatação básica */}
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('bold'); }} title="Negrito"><b>N</b></button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('italic'); }} title="Itálico"><i>I</i></button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('underline'); }} title="Sublinhado"><u>S</u></button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('strikeThrough'); }} title="Tachado"><s>T</s></button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('superscript'); }} title="Sobrescrito">x²</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('subscript'); }} title="Subscrito">x₂</button>
        <button type="button" style={{ ...btn(false), color: '#c0392b', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); execCmd('removeFormat'); }} title="Limpar formatação">✕fmt</button>

        <div style={sep} />

        {/* Títulos */}
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'h1'); }} title="Título 1">H1</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'h2'); }} title="Título 2">H2</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'h3'); }} title="Título 3">H3</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'h4'); }} title="Título 4">H4</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'p'); }} title="Parágrafo">¶</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'blockquote'); }} title="Citação">" "</button>

        <div style={sep} />

        {/* Tamanho da fonte */}
        <select
          title="Tamanho da fonte"
          style={{ padding: '3px 4px', fontSize: '0.82em', border: '1px solid #d0d7de', borderRadius: 4, background: '#f6f8fa', cursor: 'pointer', color: '#1f2328' }}
          defaultValue=""
          onChange={e => { if (e.target.value) { execCmd('fontSize', e.target.value); e.target.value = ''; } }}
        >
          <option value="" disabled>Tam.</option>
          <option value="1">Muito pequeno</option>
          <option value="2">Pequeno</option>
          <option value="3">Normal</option>
          <option value="4">Médio</option>
          <option value="5">Grande</option>
          <option value="6">Muito grande</option>
          <option value="7">Enorme</option>
        </select>

        <div style={sep} />

        {/* Cor do texto */}
        <label title="Cor do texto" style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: '0.82em', border: '1px solid #d0d7de', borderRadius: 4, background: '#f6f8fa', padding: '3px 6px', color: '#1f2328', fontWeight: 500 }}>
          A
          <input type="color" defaultValue="#e63946"
            style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            onInput={e => execCmd('foreColor', e.target.value)}
          />
        </label>

        {/* Cor de fundo */}
        <label title="Realce / cor de fundo do texto" style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: '0.82em', border: '1px solid #d0d7de', borderRadius: 4, background: '#f6f8fa', padding: '3px 6px', color: '#1f2328', fontWeight: 500 }}>
          🖊
          <input type="color" defaultValue="#F5C518"
            style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            onInput={e => execCmd('hiliteColor', e.target.value)}
          />
        </label>

        <div style={sep} />

        {/* Listas */}
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }} title="Lista com marcadores">• Lista</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList'); }} title="Lista numerada">1. Lista</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('indent'); }} title="Aumentar recuo">⇥</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('outdent'); }} title="Diminuir recuo">⇤</button>

        <div style={sep} />

        {/* Alinhamento */}
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('justifyLeft'); }} title="Esquerda">⬅</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('justifyCenter'); }} title="Centralizar">⬛</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('justifyRight'); }} title="Direita">➡</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('justifyFull'); }} title="Justificado">☰</button>

        <div style={sep} />

        {/* Links e mídia */}
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); inserirLink(); }} title="Inserir link">🔗 Link</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('unlink'); }} title="Remover link">Unlink</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); inserirImagem(); }} title="Inserir imagem por URL">🖼 Imagem</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); inserirVideo(); }} title="Inserir vídeo do YouTube">▶ Vídeo</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); inserirTabela(); }} title="Inserir tabela">⊞ Tabela</button>

        <div style={sep} />

        {/* Extras */}
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('insertHTML', '<pre style="background:#f1f3f4;padding:12px;border-radius:6px;font-family:monospace;overflow:auto;">código aqui</pre>'); }} title="Bloco de código">&lt;/&gt;</button>
        <button type="button" style={btn(false)} onMouseDown={e => { e.preventDefault(); execCmd('insertHorizontalRule'); }} title="Linha divisória">──</button>

        <div style={{ flex: 1 }} />
        <button type="button" style={btn(modoHtml)} onClick={toggleHtml} title="Ver/editar HTML fonte">HTML</button>
      </div>

      {modoHtml ? (
        <textarea
          value={htmlBruto}
          onChange={e => { setHtmlBruto(e.target.value); onChange(e.target.value); }}
          style={{ width: '100%', minHeight, padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.85em', border: 'none', outline: 'none', resize: 'vertical', background: '#1e1e1e', color: '#d4d4d4', boxSizing: 'border-box' }}
          spellCheck={false}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={sincronizarParent}
          style={{ minHeight, padding: '14px 16px', outline: 'none', fontSize: '0.95em', lineHeight: 1.7, color: '#1f2328', background: '#fff' }}
          className="ajuda-editor-content"
        />
      )}
    </div>
  );
}
