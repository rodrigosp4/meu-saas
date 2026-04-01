import { useDraftManager, formatarDataDraft } from '../hooks/useDraftManager';

export default function PainelRascunhos({ setActivePage, setProdutoParaAnunciar, usuarioId }) {
  const { drafts, excluirDraft } = useDraftManager(usuarioId);

  const retomar = (draft) => {
    localStorage.setItem('ml_pending_draft', JSON.stringify(draft));
    if (draft.tipo === 'criar') {
      setProdutoParaAnunciar({ id: draft.produtoId, sku: draft.produtoSku, nome: draft.produtoNome });
      setActivePage('criarAnuncio');
    } else {
      setActivePage('replicadorAnuncio');
    }
  };

  const criar = drafts.filter(d => d.tipo === 'criar');
  const replicar = drafts.filter(d => d.tipo === 'replicar');

  const Grupo = ({ titulo, lista }) => (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '0.72em', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>{titulo}</div>
      {lista.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: '0.85em', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>Nenhum rascunho.</div>
      ) : lista.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: '#fff', border: '1.5px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.92em', color: '#1e293b', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.titulo || d.produtoNome || d.urlAnuncio || '(sem título)'}
            </div>
            <div style={{ fontSize: '0.74em', color: '#94a3b8' }}>
              {d.produtoSku && <span style={{ marginRight: '10px' }}>SKU: <b style={{ color: '#475569' }}>{d.produtoSku}</b></span>}
              {d.urlAnuncio && <span style={{ marginRight: '10px' }}>URL: <b style={{ color: '#475569' }}>{d.urlAnuncio.length > 35 ? d.urlAnuncio.slice(0, 35) + '…' : d.urlAnuncio}</b></span>}
              Salvo: {formatarDataDraft(d.updatedAt)}
            </div>
          </div>
          <button
            onClick={() => retomar(d)}
            style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.83em', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Retomar
          </button>
          <button
            onClick={() => excluirDraft(d.id)}
            style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid #fca5a5', backgroundColor: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: '0.83em', cursor: 'pointer' }}
          >
            Excluir
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ fontSize: '1.3em', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>📝 Rascunhos</h2>
      <p style={{ fontSize: '0.85em', color: '#64748b', marginBottom: '28px' }}>
        Cadastros salvos automaticamente. Clique em <b>Retomar</b> para continuar de onde parou.
      </p>

      {drafts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: '2em', marginBottom: '10px' }}>📭</div>
          Nenhum rascunho salvo ainda.
        </div>
      ) : (
        <>
          <Grupo titulo="Criar Anúncio" lista={criar} />
          <Grupo titulo="Replicar Anúncio" lista={replicar} />
        </>
      )}
    </div>
  );
}
