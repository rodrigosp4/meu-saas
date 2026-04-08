import { useState, useEffect, useCallback } from 'react';
import EditorWysiwyg from './EditorWysiwyg.jsx';
import { useAuth } from '../contexts/AuthContext';
import { MODULOS, RECURSOS_SISTEMA, expandirDependencias } from '../constants/recursos';

const ROLE_LABELS = {
  OWNER:       { label: 'Owner',       color: '#27ae60' },
  SUPPORT:     { label: 'Suporte',     color: '#2980b9' },
  SUPER_ADMIN: { label: 'Super Admin', color: '#8e44ad' },
};

// ── helpers de estilo ──────────────────────────────────────────────────────────
const btn = (bg, color = '#fff') => ({
  padding: '4px 10px',
  backgroundColor: bg + '22',
  color: bg,
  border: `1px solid ${bg}55`,
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '0.82em',
  fontWeight: 600,
});

// ── Toggle switch reutilizável ─────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '6px' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
      <div style={{
        width: '38px', height: '20px', borderRadius: '10px', position: 'relative',
        backgroundColor: checked ? '#27ae60' : '#ccc', transition: 'background .2s',
      }}>
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff',
          position: 'absolute', top: '2px', left: checked ? '20px' : '2px',
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }} />
      </div>
    </label>
  );
}

// ── Painel de flags de módulos ─────────────────────────────────────────────────
function PainelModulos({ flags, onChange, titulo }) {
  const habilitar = () => { const s = {}; MODULOS.forEach(m => { s[m.id] = true; }); onChange(s); };
  const desabilitar = () => { const s = {}; MODULOS.forEach(m => { s[m.id] = false; }); onChange(s); };
  return (
    <div>
      {titulo && <div style={{ fontWeight: 600, marginBottom: '10px', color: '#34495e' }}>{titulo}</div>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button onClick={habilitar} style={{ flex: 1, padding: '5px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em', background: '#f8f8f8' }}>Habilitar todos</button>
        <button onClick={desabilitar} style={{ flex: 1, padding: '5px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em', background: '#f8f8f8' }}>Desabilitar todos</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
        {MODULOS.map(m => {
          const ativo = flags[m.id] !== false;
          return (
            <label key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              padding: '7px 10px', borderRadius: '6px', fontSize: '0.84em',
              border: `1px solid ${ativo ? '#27ae6055' : '#e74c3c44'}`,
              backgroundColor: ativo ? '#f0faf4' : '#fff5f5',
            }}>
              <input type="checkbox" checked={ativo}
                onChange={e => onChange({ ...flags, [m.id]: e.target.checked ? true : false })}
                style={{ accentColor: '#27ae60' }}
              />
              <span style={{ color: ativo ? '#2c3e50' : '#aaa' }}>{m.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Painel de flags de recursos granulares ─────────────────────────────────────
function PainelRecursos({ flags, onChange, titulo }) {
  // Agrupa por grupo
  const grupos = [];
  const gruposMap = {};
  for (const r of RECURSOS_SISTEMA) {
    if (!gruposMap[r.grupo]) {
      gruposMap[r.grupo] = [];
      grupos.push(r.grupo);
    }
    gruposMap[r.grupo].push(r);
  }

  const handleToggle = (recursoId, novoValor) => {
    const novasFlags = { ...flags };
    if (novoValor) {
      // habilitar: remove a flag false
      delete novasFlags[recursoId];
    } else {
      // bloquear: marca false + expande dependentes
      novasFlags[recursoId] = false;
      const bloqueados = expandirDependencias(
        Object.entries(novasFlags).filter(([, v]) => v === false).map(([k]) => k)
      );
      bloqueados.forEach(id => { novasFlags[id] = false; });
    }
    onChange(novasFlags);
  };

  const habilitarTodos = () => onChange({});
  const bloquearTodos = () => {
    const s = {};
    RECURSOS_SISTEMA.forEach(r => { s[r.id] = false; });
    onChange(s);
  };

  return (
    <div>
      {titulo && <div style={{ fontWeight: 600, marginBottom: '10px', color: '#34495e' }}>{titulo}</div>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button onClick={habilitarTodos} style={{ flex: 1, padding: '5px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em', background: '#f8f8f8' }}>Habilitar todos</button>
        <button onClick={bloquearTodos} style={{ flex: 1, padding: '5px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em', background: '#f8f8f8' }}>Bloquear todos</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {grupos.map(grupo => (
          <div key={grupo}>
            <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', color: '#7f8c8d', letterSpacing: '0.05em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #f0f0f0' }}>
              {grupo}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {gruposMap[grupo].map(r => {
                const bloqueado = flags[r.id] === false;
                const temDep = r.deps.length > 0;
                return (
                  <label key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                    padding: '6px 10px', borderRadius: '6px', fontSize: '0.83em',
                    border: `1px solid ${bloqueado ? '#e74c3c44' : '#27ae6055'}`,
                    backgroundColor: bloqueado ? '#fff5f5' : '#f0faf4',
                  }}>
                    <input type="checkbox" checked={!bloqueado}
                      onChange={e => handleToggle(r.id, e.target.checked)}
                      style={{ accentColor: '#27ae60' }}
                    />
                    <span style={{ color: bloqueado ? '#aaa' : '#2c3e50', flex: 1 }}>{r.label}</span>
                    {temDep && <span title="Bloquear este recurso também bloqueia dependentes" style={{ fontSize: '0.75em', color: '#e67e22' }}>⚠</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal de flags (módulos + recursos) por usuário ───────────────────────────
function ModalFlags({ usuario, onClose, onSave }) {
  const [aba, setAba] = useState('modulos');
  const [featureFlags, setFeatureFlags] = useState(() => {
    const flags = usuario.featureFlags || {};
    const estado = {};
    MODULOS.forEach(m => { estado[m.id] = flags[m.id] !== false; });
    return estado;
  });
  const [resourceFlags, setResourceFlags] = useState(() => {
    const rf = usuario.resourceFlags || {};
    return { ...rf };
  });
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    const ff = {};
    MODULOS.forEach(m => { if (!featureFlags[m.id]) ff[m.id] = false; });
    await onSave(usuario.id, {
      featureFlags: Object.keys(ff).length ? ff : null,
      resourceFlags: Object.keys(resourceFlags).length ? resourceFlags : null,
    });
    setSaving(false);
  };

  const abaStyle = (id) => ({
    padding: '6px 16px', cursor: 'pointer', fontSize: '0.88em', fontWeight: 600,
    color: aba === id ? '#3498db' : '#7f8c8d',
    background: 'none', border: 'none',
    borderBottom: aba === id ? '2px solid #3498db' : '2px solid transparent',
  });

  // Contagens para os badges
  const modulosBloqueados = MODULOS.filter(m => featureFlags[m.id] === false).length;
  const recursosBloqueados = Object.values(resourceFlags).filter(v => v === false).length;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '580px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.05em', marginBottom: '2px' }}>Permissões do usuário</div>
          <div style={{ fontSize: '0.83em', color: '#7f8c8d' }}>{usuario.email}</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[
            { id: 'modulos', label: 'Módulos', badge: modulosBloqueados },
            { id: 'recursos', label: 'Recursos Avançados', badge: recursosBloqueados },
          ].map(t => (
            <button key={t.id} onClick={() => setAba(t.id)} style={{
              padding: '7px 16px', cursor: 'pointer', fontSize: '0.87em', fontWeight: 600,
              borderRadius: '6px', border: 'none',
              backgroundColor: aba === t.id ? '#3498db' : '#f0f0f0',
              color: aba === t.id ? '#fff' : '#7f8c8d',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ background: aba === t.id ? 'rgba(255,255,255,0.3)' : '#e74c3c', color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '0.75em' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {aba === 'modulos' && (
          <PainelModulos
            flags={featureFlags}
            onChange={setFeatureFlags}
          />
        )}
        {aba === 'recursos' && (
          <div>
            <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fff8e1', border: '1px solid #ffe082', fontSize: '0.82em', color: '#7a5c00' }}>
              <strong>⚠ Dependências:</strong> Bloquear um recurso pode bloquear automaticamente outros que dependem dele. O ícone <strong>⚠</strong> indica recursos com dependentes.
            </div>
            <PainelRecursos flags={resourceFlags} onChange={setResourceFlags} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: '#f8f8f8', fontSize: '0.9em' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} style={{ padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#3498db', color: '#fff', fontWeight: 600, fontSize: '0.9em' }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seção de padrões para novos cadastros ──────────────────────────────────────
function SecaoPadroes() {
  const [aba, setAba] = useState('modulos');
  const [featureFlags, setFeatureFlags] = useState({});
  const [resourceFlags, setResourceFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config-padrao')
      .then(r => r.json())
      .then(data => {
        setFeatureFlags(data.defaultFeatureFlags || {});
        setResourceFlags(data.defaultResourceFlags || {});
      })
      .finally(() => setLoading(false));
  }, []);

  const salvar = async () => {
    setSaving(true);
    setSalvo(false);
    // Normaliza: envia apenas as entradas false (convenção sparse)
    const ff = {};
    Object.entries(featureFlags).forEach(([k, v]) => { if (v === false) ff[k] = false; });
    const rf = {};
    Object.entries(resourceFlags).forEach(([k, v]) => { if (v === false) rf[k] = false; });
    const res = await fetch('/api/admin/config-padrao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultFeatureFlags: ff, defaultResourceFlags: rf }),
    });
    setSaving(false);
    if (res.ok) setSalvo(true);
  };

  const abaStyle = (id) => ({
    padding: '6px 14px', cursor: 'pointer', fontSize: '0.86em', fontWeight: 600,
    color: aba === id ? '#3498db' : '#7f8c8d',
    background: 'none', border: 'none',
    borderBottom: aba === id ? '2px solid #3498db' : '2px solid transparent',
  });

  const modulosBloqueados = MODULOS.filter(m => featureFlags[m.id] === false).length;
  const recursosBloqueados = Object.values(resourceFlags).filter(v => v === false).length;

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginTop: '24px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#f8f9fa' }}>
        <div style={{ fontWeight: 700, fontSize: '0.95em', color: '#2c3e50' }}>Padrões para novos cadastros</div>
        <div style={{ fontSize: '0.8em', color: '#7f8c8d', marginTop: '2px' }}>
          Módulos e recursos bloqueados aqui serão aplicados automaticamente a cada novo cliente que se cadastrar.
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Carregando...</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {[
                { id: 'modulos', label: 'Módulos padrão', badge: modulosBloqueados },
                { id: 'recursos', label: 'Recursos padrão', badge: recursosBloqueados },
              ].map(t => (
                <button key={t.id} onClick={() => setAba(t.id)} style={{
                  padding: '7px 16px', cursor: 'pointer', fontSize: '0.87em', fontWeight: 600,
                  borderRadius: '6px', border: 'none',
                  backgroundColor: aba === t.id ? '#3498db' : '#f0f0f0',
                  color: aba === t.id ? '#fff' : '#7f8c8d',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  {t.label}
                  {t.badge > 0 && (
                    <span style={{ background: aba === t.id ? 'rgba(255,255,255,0.3)' : '#e74c3c', color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '0.75em' }}>
                      {t.badge} bloq.
                    </span>
                  )}
                </button>
              ))}
            </div>

            {aba === 'modulos' && (
              <PainelModulos
                flags={featureFlags}
                onChange={setFeatureFlags}
              />
            )}
            {aba === 'recursos' && (
              <div>
                <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fff8e1', border: '1px solid #ffe082', fontSize: '0.82em', color: '#7a5c00' }}>
                  <strong>⚠ Dependências:</strong> Bloquear um recurso pode bloquear automaticamente outros que dependem dele.
                </div>
                <PainelRecursos flags={resourceFlags} onChange={setResourceFlags} />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
              {salvo && <span style={{ fontSize: '0.84em', color: '#27ae60', fontWeight: 600 }}>✓ Padrões salvos</span>}
              <button
                onClick={salvar}
                disabled={saving}
                style={{ padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#27ae60', color: '#fff', fontWeight: 600, fontSize: '0.9em', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Salvando...' : 'Salvar padrões'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal de troca de senha ────────────────────────────────────────────────────
function ModalTrocarSenha({ usuario, onClose }) {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  const salvar = async () => {
    setErro('');
    if (novaSenha.length < 6) return setErro('A senha deve ter pelo menos 6 caracteres.');
    if (novaSenha !== confirmacao) return setErro('As senhas não coincidem.');
    setSaving(true);
    const res = await fetch(`/api/admin/usuarios/${usuario.id}/senha`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novaSenha }),
    });
    setSaving(false);
    if (res.ok) {
      setOk(true);
      setTimeout(onClose, 1200);
    } else {
      const d = await res.json();
      setErro(d.erro || 'Erro ao salvar.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '28px', width: '380px', maxWidth: '96vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.05em', marginBottom: '4px' }}>Trocar senha</div>
        <div style={{ fontSize: '0.83em', color: '#7f8c8d', marginBottom: '20px' }}>{usuario.email}</div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.84em', color: '#495057', display: 'block', marginBottom: '4px' }}>Nova senha</label>
          <input
            type="password"
            value={novaSenha}
            onChange={e => setNovaSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.84em', color: '#495057', display: 'block', marginBottom: '4px' }}>Confirmar senha</label>
          <input
            type="password"
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
            placeholder="Repita a senha"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', boxSizing: 'border-box' }}
          />
        </div>

        {erro && <div style={{ color: '#e74c3c', fontSize: '0.84em', marginBottom: '12px' }}>{erro}</div>}
        {ok  && <div style={{ color: '#27ae60', fontSize: '0.84em', marginBottom: '12px' }}>Senha alterada com sucesso!</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: '#f8f8f8', fontSize: '0.9em' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving || ok} style={{ padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#e67e22', color: '#fff', fontWeight: 600, fontSize: '0.9em', opacity: (saving || ok) ? 0.7 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seção de Assinaturas ──────────────────────────────────────────────────────
function SecaoAssinaturas() {
  const [config, setConfig] = useState({ precoMensal: 299, precoOperador: 50, mpAccessToken: '', mpPublicKey: '' });
  const [assinaturas, setAssinaturas] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingAss, setLoadingAss] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedConfig, setSavedConfig] = useState(false);
  const [erroConfig, setErroConfig] = useState('');

  useEffect(() => {
    fetch('/api/admin/config-assinatura')
      .then(r => r.json())
      .then(d => setConfig({ precoMensal: d.precoMensal, precoOperador: d.precoOperador ?? 50, mpAccessToken: d.mpAccessToken || '', mpPublicKey: d.mpPublicKey || '' }))
      .finally(() => setLoadingConfig(false));

    fetch('/api/admin/assinaturas')
      .then(r => r.json())
      .then(d => Array.isArray(d) ? setAssinaturas(d) : setAssinaturas([]))
      .finally(() => setLoadingAss(false));
  }, []);

  const salvarConfig = async () => {
    setErroConfig('');
    setSavingConfig(true);
    const res = await fetch('/api/admin/config-assinatura', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setSavingConfig(false);
    if (res.ok) { setSavedConfig(true); setTimeout(() => setSavedConfig(false), 2500); }
    else { const d = await res.json(); setErroConfig(d.erro || 'Erro ao salvar.'); }
  };

  const formatarData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const formatarMoeda = (v) => v != null ? `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '—';

  const STATUS_COLOR = { approved: '#27ae60', pending: '#e67e22', cancelled: '#e74c3c', expired: '#95a5a6' };
  const STATUS_LABEL = { approved: 'Ativo', pending: 'Pendente', cancelled: 'Cancelado', expired: 'Expirado' };

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.83em', color: '#495057', display: 'block', marginBottom: '4px', fontWeight: 600 };

  const PLANO_LABEL = { '30d': '30 dias', '60d': '60 dias', '90d': '90 dias', '180d': '6 meses' };

  // Calcula preços dos planos com base no precoMensal
  const planos = [
    { key: '30d',  meses: 1, desconto: 0 },
    { key: '60d',  meses: 2, desconto: 0.05 },
    { key: '90d',  meses: 3, desconto: 0.10 },
    { key: '180d', meses: 6, desconto: 0.15 },
  ].map(p => ({ ...p, valor: parseFloat((config.precoMensal * p.meses * (1 - p.desconto)).toFixed(2)) }));
  // Preço com 1 operador (para exemplo)
  const planosComOperador = planos.map(p => ({
    ...p,
    valorComOperador: parseFloat(((config.precoMensal + config.precoOperador) * p.meses * (1 - p.desconto)).toFixed(2)),
  }));

  return (
    <div>
      {/* Configuração */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#f8f9fa' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95em', color: '#2c3e50' }}>Configuração de Assinatura</div>
          <div style={{ fontSize: '0.8em', color: '#7f8c8d', marginTop: '2px' }}>Configure os valores e as chaves do MercadoPago.</div>
        </div>
        {loadingConfig ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>Carregando...</div>
        ) : (
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Preço Mensal Base (R$)</label>
                <input type="number" value={config.precoMensal} min="1" step="0.01"
                  onChange={e => setConfig(c => ({ ...c, precoMensal: parseFloat(e.target.value) || 0 }))}
                  style={fieldStyle}
                />
                <div style={{ marginTop: '10px' }}>
                  <label style={labelStyle}>Adicional por Usuário Operador (R$/mês)</label>
                  <input type="number" value={config.precoOperador} min="0" step="0.01"
                    onChange={e => setConfig(c => ({ ...c, precoOperador: parseFloat(e.target.value) || 0 }))}
                    style={fieldStyle}
                  />
                  <div style={{ fontSize: '0.75em', color: '#7f8c8d', marginTop: '3px' }}>
                    Cobrado por cada sub-usuário com perfil Operador ativo.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '8px' }}>
                <div style={{ padding: '8px 12px', background: '#f0f9f4', borderRadius: '6px', fontSize: '0.82em', color: '#2c3e50' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: '#7f8c8d' }}>Sem operadores</div>
                  {planos.map(p => (
                    <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ color: '#7f8c8d' }}>{PLANO_LABEL[p.key]}</span>
                      <strong>{formatarMoeda(p.valor)}</strong>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 12px', background: '#fef9ec', borderRadius: '6px', fontSize: '0.82em', color: '#2c3e50' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: '#7f8c8d' }}>Com 1 operador (+{formatarMoeda(config.precoOperador)}/mês)</div>
                  {planosComOperador.map(p => (
                    <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ color: '#7f8c8d' }}>{PLANO_LABEL[p.key]}</span>
                      <strong>{formatarMoeda(p.valorComOperador)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>MercadoPago Access Token</label>
              <input type="text" value={config.mpAccessToken}
                onChange={e => setConfig(c => ({ ...c, mpAccessToken: e.target.value }))}
                placeholder="APP_USR-..."
                style={fieldStyle}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>MercadoPago Public Key</label>
              <input type="text" value={config.mpPublicKey}
                onChange={e => setConfig(c => ({ ...c, mpPublicKey: e.target.value }))}
                placeholder="APP_USR-..."
                style={fieldStyle}
              />
            </div>
            {erroConfig && <div style={{ color: '#e74c3c', fontSize: '0.84em', marginBottom: '10px' }}>{erroConfig}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
              {savedConfig && <span style={{ fontSize: '0.84em', color: '#27ae60', fontWeight: 600 }}>✓ Configuração salva</span>}
              <button onClick={salvarConfig} disabled={savingConfig}
                style={{ padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#27ae60', color: '#fff', fontWeight: 600, fontSize: '0.9em', opacity: savingConfig ? 0.7 : 1 }}>
                {savingConfig ? 'Salvando...' : 'Salvar configuração'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de assinaturas */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#f8f9fa' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95em', color: '#2c3e50' }}>Histórico de Assinaturas</div>
        </div>
        {loadingAss ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>Carregando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Usuário</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Plano</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Valor</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Início</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Vence</th>
              </tr>
            </thead>
            <tbody>
              {assinaturas.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '9px 14px', color: '#2c3e50' }}>{a.user?.email || a.userId}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>{PLANO_LABEL[a.plano] || a.plano}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 600 }}>{formatarMoeda(a.valor)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <span style={{ background: (STATUS_COLOR[a.status] || '#95a5a6') + '22', color: STATUS_COLOR[a.status] || '#95a5a6', padding: '2px 10px', borderRadius: '10px', fontSize: '0.82em', fontWeight: 600 }}>
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', color: '#7f8c8d' }}>{formatarData(a.iniciaEm)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', color: a.expiraEm && new Date(a.expiraEm) < new Date() ? '#e74c3c' : '#7f8c8d', fontWeight: a.status === 'approved' ? 600 : 400 }}>{formatarData(a.expiraEm)}</td>
                </tr>
              ))}
              {assinaturas.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#bbb' }}>Nenhuma assinatura encontrada.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Seção de Cupons ───────────────────────────────────────────────────────────
function SecaoCupons() {
  const [cupons, setCupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({ codigo: '', tipo: 'percentual', valor: '', usoMaximo: '', expiraEm: '', descricao: '' });

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.83em', color: '#495057', display: 'block', marginBottom: '4px', fontWeight: 600 };

  const carregar = () => {
    setLoading(true);
    fetch('/api/admin/cupons')
      .then(r => r.json())
      .then(d => Array.isArray(d) ? setCupons(d) : setCupons([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    setErro('');
    if (!form.codigo.trim()) return setErro('Código obrigatório.');
    if (!form.valor || isNaN(Number(form.valor)) || Number(form.valor) <= 0) return setErro('Valor inválido.');
    setSalvando(true);
    const res = await fetch('/api/admin/cupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: form.codigo.trim(),
        tipo: form.tipo,
        valor: Number(form.valor),
        usoMaximo: form.usoMaximo ? Number(form.usoMaximo) : null,
        expiraEm: form.expiraEm || null,
        descricao: form.descricao || null,
      }),
    });
    setSalvando(false);
    if (res.ok) {
      setShowForm(false);
      setForm({ codigo: '', tipo: 'percentual', valor: '', usoMaximo: '', expiraEm: '', descricao: '' });
      carregar();
    } else {
      const d = await res.json();
      setErro(d.erro || 'Erro ao criar cupom.');
    }
  };

  const toggleAtivo = async (cupom) => {
    await fetch(`/api/admin/cupons/${cupom.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !cupom.ativo }),
    });
    carregar();
  };

  const deletar = async (cupom) => {
    if (!window.confirm(`Excluir o cupom "${cupom.codigo}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/admin/cupons/${cupom.id}`, { method: 'DELETE' });
    carregar();
  };

  const TIPO_LABEL = { percentual: '% desconto', fixo: 'R$ fixo', dias_gratis: 'Dias grátis' };
  const TIPO_COR = { percentual: '#3498db', fixo: '#27ae60', dias_gratis: '#e67e22' };

  const formatarValor = (c) => {
    if (c.tipo === 'percentual') return `${c.valor}%`;
    if (c.tipo === 'fixo') return `R$ ${Number(c.valor).toFixed(2).replace('.', ',')}`;
    if (c.tipo === 'dias_gratis') return `${c.valor} dias`;
    return c.valor;
  };

  const formatarData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  return (
    <div>
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95em', color: '#2c3e50' }}>Cupons de Desconto</div>
            <div style={{ fontSize: '0.8em', color: '#7f8c8d', marginTop: '2px' }}>Crie cupons de desconto percentual, valor fixo ou dias grátis.</div>
          </div>
          <button onClick={() => { setShowForm(f => !f); setErro(''); }} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#3498db', color: '#fff', fontWeight: 600, fontSize: '0.88em' }}>
            {showForm ? 'Cancelar' : '+ Novo cupom'}
          </button>
        </div>

        {showForm && (
          <div style={{ padding: '20px', borderBottom: '1px solid #f0f0f0', background: '#fafbfc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Código do cupom</label>
                <input type="text" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  placeholder="EX: PROMO10" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, valor: '' }))} style={fieldStyle}>
                  <option value="percentual">% de desconto na mensalidade</option>
                  <option value="fixo">R$ fixo de desconto</option>
                  <option value="dias_gratis">Dias grátis de acesso</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  {form.tipo === 'percentual' ? 'Desconto (%)' : form.tipo === 'fixo' ? 'Desconto (R$)' : 'Quantidade de dias'}
                </label>
                <input type="number" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  min="0" step={form.tipo === 'percentual' ? '1' : '0.01'} placeholder={form.tipo === 'percentual' ? 'Ex: 20' : form.tipo === 'fixo' ? 'Ex: 50.00' : 'Ex: 7'}
                  style={fieldStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Uso máximo (vazio = ilimitado)</label>
                <input type="number" value={form.usoMaximo} onChange={e => setForm(f => ({ ...f, usoMaximo: e.target.value }))}
                  min="1" placeholder="Ilimitado" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Válido até (vazio = sem expiração)</label>
                <input type="date" value={form.expiraEm} onChange={e => setForm(f => ({ ...f, expiraEm: e.target.value }))} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Descrição (opcional)</label>
                <input type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Cupom de lançamento" style={fieldStyle} />
              </div>
            </div>
            {erro && <div style={{ color: '#e74c3c', fontSize: '0.84em', marginBottom: '10px' }}>{erro}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={salvar} disabled={salvando} style={{ padding: '8px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#27ae60', color: '#fff', fontWeight: 600, fontSize: '0.9em', opacity: salvando ? 0.7 : 1 }}>
                {salvando ? 'Salvando...' : 'Criar cupom'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>Carregando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Código</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Tipo</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Benefício</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Usos</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Expira em</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {cupons.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', opacity: c.ativo ? 1 : 0.55 }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: '#2c3e50', letterSpacing: '0.04em' }}>
                    {c.codigo}
                    {c.descricao && <div style={{ fontWeight: 400, fontSize: '0.82em', color: '#7f8c8d', marginTop: '1px' }}>{c.descricao}</div>}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <span style={{ background: (TIPO_COR[c.tipo] || '#aaa') + '22', color: TIPO_COR[c.tipo] || '#aaa', padding: '2px 10px', borderRadius: '10px', fontSize: '0.82em', fontWeight: 600 }}>
                      {TIPO_LABEL[c.tipo] || c.tipo}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: TIPO_COR[c.tipo] || '#333' }}>{formatarValor(c)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', color: '#7f8c8d' }}>
                    {c.usoAtual}{c.usoMaximo !== null ? ` / ${c.usoMaximo}` : ''}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', color: c.expiraEm && new Date(c.expiraEm) < new Date() ? '#e74c3c' : '#7f8c8d' }}>
                    {formatarData(c.expiraEm)}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <Toggle checked={c.ativo} onChange={() => toggleAtivo(c)} />
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <button onClick={() => deletar(c)} style={btn('#e74c3c')}>Excluir</button>
                  </td>
                </tr>
              ))}
              {cupons.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#bbb' }}>Nenhum cupom criado ainda.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
function ModalCriarUsuario({ onClose, onCriado }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acessoLivre, setAcessoLivre] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    setErro('');
    if (!email) return setErro('E-mail obrigatório.');
    if (password.length < 6) return setErro('Senha deve ter pelo menos 6 caracteres.');
    setSaving(true);
    const res = await fetch('/api/admin/criar-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, acessoLivre }),
    });
    setSaving(false);
    if (res.ok) { const d = await res.json(); onCriado(d); onClose(); }
    else { const d = await res.json(); setErro(d.erro || 'Erro ao criar usuário.'); }
  };

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.83em', color: '#495057', display: 'block', marginBottom: '4px', fontWeight: 600 };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '28px', width: '400px', maxWidth: '96vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.05em', marginBottom: '20px' }}>Criar novo usuário</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" style={fieldStyle} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Senha</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" style={fieldStyle} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '20px', fontSize: '0.9em' }}>
          <Toggle checked={acessoLivre} onChange={setAcessoLivre} />
          <span style={{ color: '#495057' }}>Acesso livre (isento de pagamento)</span>
        </label>
        {erro && <div style={{ color: '#e74c3c', fontSize: '0.84em', marginBottom: '12px' }}>{erro}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: '#f8f8f8', fontSize: '0.9em' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} style={{ padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#27ae60', color: '#fff', fontWeight: 600, fontSize: '0.9em', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Criando...' : 'Criar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seção de Banner de Avisos ─────────────────────────────────────────────────
function SecaoBanner() {
  const [visivel, setVisivel] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoTexto, setNovoTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editTexto, setEditTexto] = useState('');
  const [erro, setErro] = useState('');

  const carregar = () => {
    setLoading(true);
    fetch('/api/admin/banner/config')
      .then(r => r.json())
      .then(d => {
        setVisivel(!!d.visivel);
        setMensagens(Array.isArray(d.mensagens) ? d.mensagens : []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []);

  const toggleVisivel = async (v) => {
    setVisivel(v);
    await fetch('/api/admin/banner/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visivel: v }),
    });
  };

  const adicionarMensagem = async () => {
    if (!novoTexto.trim()) return;
    setSalvando(true);
    setErro('');
    try {
      const r = await fetch('/api/admin/banner/mensagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: novoTexto.trim(), ordem: mensagens.length }),
      });
      const data = await r.json();
      if (!r.ok) { setErro(data.erro || 'Erro ao adicionar'); return; }
      setMensagens(prev => [...prev, data]);
      setNovoTexto('');
    } catch {
      setErro('Erro de conexão');
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (msg) => {
    const r = await fetch(`/api/admin/banner/mensagens/${msg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !msg.ativo }),
    });
    if (r.ok) {
      setMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, ativo: !m.ativo } : m));
    }
  };

  const salvarEdicao = async (id) => {
    if (!editTexto.trim()) return;
    const r = await fetch(`/api/admin/banner/mensagens/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: editTexto.trim() }),
    });
    if (r.ok) {
      setMensagens(prev => prev.map(m => m.id === id ? { ...m, texto: editTexto.trim() } : m));
      setEditandoId(null);
    }
  };

  const excluir = async (id) => {
    if (!confirm('Excluir esta mensagem?')) return;
    const r = await fetch(`/api/admin/banner/mensagens/${id}`, { method: 'DELETE' });
    if (r.ok) setMensagens(prev => prev.filter(m => m.id !== id));
  };

  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.9em', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div>
      {/* Toggle global */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', padding: '16px 20px', background: visivel ? '#eafaf1' : '#fff8f0', border: `1px solid ${visivel ? '#27ae6055' : '#e67e2244'}`, borderRadius: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#2c3e50', marginBottom: '2px' }}>Banner de avisos</div>
          <div style={{ fontSize: '0.83em', color: '#7f8c8d' }}>
            {visivel ? 'Visível para todos os usuários' : 'Oculto — os usuários não veem o banner'}
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" checked={visivel} onChange={e => toggleVisivel(e.target.checked)} style={{ display: 'none' }} />
          <div style={{ width: '46px', height: '24px', borderRadius: '12px', position: 'relative', backgroundColor: visivel ? '#27ae60' : '#ccc', transition: 'background .2s', cursor: 'pointer' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '3px', left: visivel ? '25px' : '3px', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </div>
          <span style={{ fontSize: '0.88em', fontWeight: 600, color: visivel ? '#27ae60' : '#95a5a6' }}>{visivel ? 'Ativo' : 'Inativo'}</span>
        </label>
      </div>

      {/* Adicionar mensagem */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 600, color: '#34495e', marginBottom: '8px', fontSize: '0.92em' }}>Adicionar mensagem</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionarMensagem()}
            placeholder="Texto do aviso que aparecerá no banner..."
            style={{ ...inputStyle, flex: 1 }}
            maxLength={300}
          />
          <button
            onClick={adicionarMensagem}
            disabled={salvando || !novoTexto.trim()}
            style={{ padding: '8px 18px', background: '#3498db', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9em', opacity: (salvando || !novoTexto.trim()) ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {salvando ? '...' : '+ Adicionar'}
          </button>
        </div>
        {erro && <div style={{ color: '#e74c3c', fontSize: '0.83em', marginTop: '5px' }}>{erro}</div>}
      </div>

      {/* Lista de mensagens */}
      <div style={{ fontWeight: 600, color: '#34495e', marginBottom: '10px', fontSize: '0.92em' }}>
        Mensagens ({mensagens.length})
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>Carregando...</div>
      ) : mensagens.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#bbb', background: '#fafafa', borderRadius: '8px', border: '1px dashed #e0e0e0', fontSize: '0.88em' }}>
          Nenhuma mensagem cadastrada. Adicione uma acima.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {mensagens.map((m, i) => (
            <div key={m.id} style={{ padding: '12px 14px', background: m.ativo ? '#fff' : '#f9f9f9', border: `1px solid ${m.ativo ? '#e0e8f0' : '#e8e8e8'}`, borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              {/* Ordem */}
              <div style={{ fontSize: '0.75em', color: '#bbb', minWidth: '20px', paddingTop: '2px', textAlign: 'center' }}>#{i + 1}</div>

              {/* Texto ou input de edição */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {editandoId === m.id ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      value={editTexto}
                      onChange={e => setEditTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(m.id); if (e.key === 'Escape') setEditandoId(null); }}
                      autoFocus
                      maxLength={300}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => salvarEdicao(m.id)} style={{ padding: '4px 10px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em' }}>Salvar</button>
                    <button onClick={() => setEditandoId(null)} style={{ padding: '4px 10px', background: '#f4f6f8', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82em' }}>×</button>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9em', color: m.ativo ? '#2c3e50' : '#aaa', lineHeight: 1.4 }}>{m.texto}</div>
                )}
              </div>

              {/* Ações */}
              {editandoId !== m.id && (
                <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                  {/* Toggle ativo */}
                  <button
                    onClick={() => toggleAtivo(m)}
                    title={m.ativo ? 'Ocultar esta mensagem' : 'Exibir esta mensagem'}
                    style={{ padding: '3px 8px', fontSize: '0.78em', fontWeight: 600, borderRadius: '5px', border: '1px solid', cursor: 'pointer', background: m.ativo ? '#eafaf1' : '#f9f9f9', color: m.ativo ? '#27ae60' : '#95a5a6', borderColor: m.ativo ? '#27ae6055' : '#ddd' }}
                  >
                    {m.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button
                    onClick={() => { setEditandoId(m.id); setEditTexto(m.texto); }}
                    style={{ padding: '3px 8px', fontSize: '0.78em', borderRadius: '5px', border: '1px solid #ddd', cursor: 'pointer', background: '#f4f6f8', color: '#3498db' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => excluir(m.id)}
                    style={{ padding: '3px 8px', fontSize: '0.78em', borderRadius: '5px', border: '1px solid #e74c3c44', cursor: 'pointer', background: '#fff5f5', color: '#e74c3c' }}
                  >
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      {mensagens.some(m => m.ativo) && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontWeight: 600, color: '#34495e', marginBottom: '8px', fontSize: '0.88em' }}>Preview do banner</div>
          <div style={{ position: 'relative', background: '#1a1a2e', height: '32px', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#e67e22', color: '#fff', fontSize: '0.72em', fontWeight: 700, textTransform: 'uppercase', gap: '4px', zIndex: 2 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              AVISO
            </div>
            <div style={{ flex: 1, paddingLeft: '80px', paddingRight: '10px', color: '#f1c40f', fontSize: '0.8em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {mensagens.filter(m => m.ativo).map(m => m.texto).join('    ★    ')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seção de Chamados (Admin) ─────────────────────────────────────────────────
function SecaoChamados() {
  const [chamados, setChamados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chamadoAberto, setChamadoAberto] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const STATUS_LABEL = {
    ABERTO:             { label: 'Aberto',              color: '#3498db', bg: '#eaf4fb' },
    EM_ANDAMENTO:       { label: 'Em Andamento',         color: '#e67e22', bg: '#fef9f0' },
    AGUARDANDO_USUARIO: { label: 'Aguardando usuário',   color: '#8e44ad', bg: '#f5eef8' },
    RESOLVIDO:          { label: 'Resolvido',            color: '#27ae60', bg: '#eafaf1' },
    FECHADO:            { label: 'Fechado',              color: '#95a5a6', bg: '#f4f6f7' },
  };

  const carregar = () => {
    setLoading(true);
    fetch('/api/chamados')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setChamados(d); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []);

  const filtrados = filtroStatus === 'todos' ? chamados : chamados.filter(c => c.status === filtroStatus);
  const abertos = chamados.filter(c => c.status === 'ABERTO' || c.status === 'AGUARDANDO_USUARIO').length;

  const formatData = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (chamadoAberto) {
    // Importação dinâmica do DetalheChamado — usamos lazy import via componente inline
    return <AdminDetalheChamado chamadoId={chamadoAberto} onVoltar={() => { setChamadoAberto(null); carregar(); }} onAtualizado={carregar} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50' }}>
          Chamados de Suporte
          {abertos > 0 && (
            <span style={{ marginLeft: '8px', background: '#e74c3c', color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '0.75em' }}>{abertos} aberto(s)</span>
          )}
        </div>
        <button onClick={carregar} style={{ padding: '5px 14px', background: '#f4f6f8', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85em' }}>Atualizar</button>
      </div>

      {/* Filtro por status */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[{ id: 'todos', label: 'Todos' }, ...Object.entries(STATUS_LABEL).map(([id, s]) => ({ id, label: s.label }))].map(f => (
          <button
            key={f.id}
            onClick={() => setFiltroStatus(f.id)}
            style={{
              padding: '3px 10px', borderRadius: '14px', border: '1px solid',
              fontSize: '0.8em', cursor: 'pointer', fontWeight: filtroStatus === f.id ? 700 : 400,
              borderColor: filtroStatus === f.id ? '#3498db' : '#ddd',
              background: filtroStatus === f.id ? '#3498db' : '#f4f6f8',
              color: filtroStatus === f.id ? '#fff' : '#555',
            }}
          >
            {f.label}
            {f.id !== 'todos' && <span style={{ marginLeft: '3px', opacity: 0.7 }}>({chamados.filter(c => c.status === f.id).length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#999' }}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#bbb', background: '#fafafa', borderRadius: '8px', border: '1px dashed #e0e0e0' }}>
          Nenhum chamado encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtrados.map((c) => {
            const si = STATUS_LABEL[c.status] || STATUS_LABEL.ABERTO;
            return (
              <div
                key={c.id}
                onClick={() => setChamadoAberto(c.id)}
                style={{ padding: '12px 16px', background: '#fff', borderRadius: '8px', border: '1px solid #e8ecf0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.09)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#2c3e50', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</div>
                  <div style={{ fontSize: '0.78em', color: '#95a5a6' }}>{c.usuario?.email} · {c._count.mensagens} msg · {formatData(c.atualizadoEm)}</div>
                </div>
                <span style={{ padding: '2px 9px', borderRadius: '11px', fontSize: '0.76em', fontWeight: 600, color: si.color, background: si.bg, whiteSpace: 'nowrap' }}>{si.label}</span>
                <span style={{ color: '#bbb' }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Seção Landing Page (Admin) ────────────────────────────────────────────────
function SecaoLandingPage() {
  const [secoes, setSecoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [secaoSelecionada, setSecaoSelecionada] = useState(null);
  const [conteudoEditado, setConteudoEditado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  const carregar = () => {
    setLoading(true);
    fetch('/api/landing/secoes')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setSecoes(d);
          if (!secaoSelecionada && d.length > 0) {
            setSecaoSelecionada(d[0]);
            setConteudoEditado(d[0].conteudo);
          }
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []);

  const selecionarSecao = (s) => {
    setSecaoSelecionada(s);
    setConteudoEditado(s.conteudo);
    setMsg(null);
  };

  const salvar = async () => {
    if (!secaoSelecionada) return;
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/landing/secoes/${secaoSelecionada.chave}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: conteudoEditado }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || 'Erro ao salvar');
      setMsg({ tipo: 'ok', texto: 'Salvo! As mudanças já estão visíveis na landing page.' });
      setSecoes(prev => prev.map(s => s.chave === secaoSelecionada.chave ? { ...s, conteudo: conteudoEditado, customizada: true } : s));
      setSecaoSelecionada(prev => ({ ...prev, conteudo: conteudoEditado, customizada: true }));
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const resetar = async () => {
    if (!secaoSelecionada) return;
    if (!window.confirm(`Resetar "${secaoSelecionada.titulo}" para o conteúdo padrão?`)) return;
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/landing/secoes/${secaoSelecionada.chave}/resetar`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || 'Erro ao resetar');
      setConteudoEditado(d.conteudo);
      setSecoes(prev => prev.map(s => s.chave === secaoSelecionada.chave ? { ...s, conteudo: d.conteudo, customizada: false } : s));
      setSecaoSelecionada(prev => ({ ...prev, conteudo: d.conteudo, customizada: false }));
      setMsg({ tipo: 'ok', texto: 'Resetado para o padrão.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const ICONES = {
    hero: '🦸',
    features: '✨',
    integracoes: '🔗',
    steps: '👣',
    plano_vantagens: '💎',
    cta: '📣',
    footer: '🦶',
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Carregando...</div>;

  return (
    <div style={{ display: 'flex', minHeight: 600 }}>
      {/* ── Sidebar de seções ── */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e9ecef' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 700, fontSize: '0.88em', color: '#34495e' }}>
          Seções da Landing Page
        </div>
        {secoes.map(s => (
          <div
            key={s.chave}
            onClick={() => selecionarSecao(s)}
            style={{
              padding: '10px 16px', cursor: 'pointer',
              background: secaoSelecionada?.chave === s.chave ? '#eaf4fb' : 'transparent',
              borderLeft: secaoSelecionada?.chave === s.chave ? '3px solid #3498db' : '3px solid transparent',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => { if (secaoSelecionada?.chave !== s.chave) e.currentTarget.style.background = '#f8f9fa'; }}
            onMouseLeave={e => { if (secaoSelecionada?.chave !== s.chave) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '1.1em' }}>{ICONES[s.chave] || '📄'}</span>
            <div>
              <div style={{ fontSize: '0.84em', fontWeight: 600, color: '#2c3e50' }}>{s.titulo}</div>
              {s.customizada && <div style={{ fontSize: '0.7em', color: '#27ae60', marginTop: 1 }}>● customizada</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Área de edição ── */}
      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!secaoSelecionada ? (
          <div style={{ textAlign: 'center', color: '#bbb', padding: 40 }}>Selecione uma seção para editar</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50' }}>
                  {ICONES[secaoSelecionada.chave] || '📄'} {secaoSelecionada.titulo}
                </div>
                <div style={{ fontSize: '0.78em', color: '#95a5a6', marginTop: 2 }}>
                  Editor HTML — insira textos, imagens e vídeos livremente
                  {secaoSelecionada.customizada && <span style={{ marginLeft: 8, color: '#27ae60' }}>● customizada</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {secaoSelecionada.customizada && (
                  <button onClick={resetar} disabled={salvando} style={{ padding: '6px 12px', background: '#fef9f0', border: '1px solid #f39c12', borderRadius: 6, color: '#e67e22', cursor: 'pointer', fontSize: '0.83em', fontWeight: 600 }}>
                    ↩ Resetar padrão
                  </button>
                )}
                <button onClick={salvar} disabled={salvando} style={{ padding: '6px 16px', background: '#3498db', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '0.88em', fontWeight: 700 }}>
                  {salvando ? 'Salvando...' : '💾 Salvar'}
                </button>
              </div>
            </div>

            {msg && (
              <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: '0.85em', fontWeight: 600, background: msg.tipo === 'ok' ? '#eafaf1' : '#fdf2f2', color: msg.tipo === 'ok' ? '#27ae60' : '#e74c3c', border: `1px solid ${msg.tipo === 'ok' ? '#a9dfbf' : '#f1948a'}` }}>
                {msg.tipo === 'ok' ? '✓' : '✗'} {msg.texto}
              </div>
            )}

            <EditorWysiwyg
              key={secaoSelecionada.chave}
              value={conteudoEditado}
              onChange={setConteudoEditado}
              minHeight={460}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Wrapper do DetalheChamado importado do Chamados.jsx para uso no AdminPanel
function AdminDetalheChamado({ chamadoId, onVoltar, onAtualizado }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    import('./Chamados.jsx').then(m => setComp(() => m.DetalheChamado));
  }, []);
  if (!Comp) return <div style={{ padding: '32px', textAlign: 'center', color: '#999' }}>Carregando...</div>;
  return <Comp chamadoId={chamadoId} onVoltar={onVoltar} onAtualizado={onAtualizado} isAdmin={true} />;
}

export default function AdminPanel({ setActivePage }) {
  const { setImpersonating } = useAuth();
  const [abaMain, setAbaMain] = useState('clientes');
  const [stats, setStats] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalFlags, setModalFlags] = useState(null);
  const [modalSenha, setModalSenha] = useState(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, uRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/usuarios'),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (uRes.ok) setUsuarios(await uRes.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const toggleAtivo = async (usuario) => {
    const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !usuario.ativo }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsuarios(prev => prev.map(u => u.id === updated.id ? { ...u, ativo: updated.ativo } : u));
    }
  };

  const salvarFlags = async (userId, { featureFlags, resourceFlags }) => {
    const res = await fetch(`/api/admin/usuarios/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureFlags, resourceFlags }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsuarios(prev => prev.map(u => u.id === updated.id ? { ...u, featureFlags: updated.featureFlags, resourceFlags: updated.resourceFlags } : u));
      setModalFlags(null);
    }
  };

  const toggleAcessoLivre = async (usuario) => {
    const res = await fetch(`/api/admin/usuarios/${usuario.id}/acesso-livre`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acessoLivre: !usuario.acessoLivre }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsuarios(prev => prev.map(u => u.id === updated.id ? { ...u, acessoLivre: updated.acessoLivre } : u));
    }
  };

  const impersonar = async (usuario) => {
    const res = await fetch(`/api/admin/impersonar/${usuario.id}`, { method: 'POST' });
    if (!res.ok) { const d = await res.json(); alert(d.erro); return; }
    const data = await res.json();
    setImpersonating(data.targetUser, data.token, data.sessaoId);
    setActivePage('home');
  };

  const usuariosFiltrados = usuarios.filter(u =>
    u.email.toLowerCase().includes(busca.toLowerCase())
  );

  const modulosAtivos = (u) => {
    const ff = u.featureFlags || {};
    return MODULOS.filter(m => ff[m.id] !== false).length;
  };

  const recursosBloqueados = (u) => {
    const rf = u.resourceFlags || {};
    return Object.values(rf).filter(v => v === false).length;
  };

  const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    flex: 1,
    minWidth: '140px',
  };

  const abaMainStyle = (id) => ({
    padding: '8px 20px', cursor: 'pointer', fontSize: '0.9em', fontWeight: 600,
    color: abaMain === id ? '#3498db' : '#7f8c8d',
    background: 'none', border: 'none',
    borderBottom: abaMain === id ? '2px solid #3498db' : '2px solid transparent',
  });

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: '#2c3e50' }}>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.78em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Total de Clientes</div>
            <div style={{ fontSize: '2em', fontWeight: 700 }}>{stats.totalClientes}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.78em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Clientes Ativos</div>
            <div style={{ fontSize: '2em', fontWeight: 700, color: '#27ae60' }}>{stats.clientesAtivos}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.78em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Contas ML</div>
            <div style={{ fontSize: '2em', fontWeight: 700, color: '#e67e22' }}>{stats.totalContas}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.78em', color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Sub-usuários</div>
            <div style={{ fontSize: '2em', fontWeight: 700, color: '#8e44ad' }}>{stats.totalSubUsuarios}</div>
          </div>
        </div>
      )}

      {/* Tabs principais */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e9ecef', marginBottom: '20px', gap: '4px' }}>
        <button style={abaMainStyle('clientes')} onClick={() => setAbaMain('clientes')}>Clientes</button>
        <button style={abaMainStyle('assinaturas')} onClick={() => setAbaMain('assinaturas')}>Assinaturas</button>
        <button style={abaMainStyle('cupons')} onClick={() => setAbaMain('cupons')}>Cupons</button>
        <button style={abaMainStyle('banner')} onClick={() => setAbaMain('banner')}>Banner</button>
        <button style={abaMainStyle('chamados')} onClick={() => setAbaMain('chamados')}>Chamados</button>
        <button style={abaMainStyle('padroes')} onClick={() => setAbaMain('padroes')}>Padrões por Tipo</button>
        <button style={abaMainStyle('landing')} onClick={() => setAbaMain('landing')}>Landing Page</button>
      </div>

      {/* ── ABA: CLIENTES ── */}
      {abaMain === 'clientes' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '1em' }}>Clientes cadastrados</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por e-mail..."
                style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', outline: 'none', width: '220px' }}
              />
              <button onClick={() => setModalCriar(true)} style={{ padding: '6px 14px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.88em', fontWeight: 600 }}>
                + Criar usuário
              </button>
              <button onClick={carregar} style={{ padding: '6px 14px', background: '#f4f6f8', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.88em' }}>
                Atualizar
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Carregando...</div>
          ) : erro ? (
            <div style={{ padding: '20px', color: '#e74c3c' }}>{erro}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>E-mail</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Role</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Status</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>ML</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Sub-us.</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Acesso Livre</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Módulos</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Recursos</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u, i) => {
                  const roleInfo = ROLE_LABELS[u.role] || { label: u.role, color: '#95a5a6' };
                  const ativosCount = modulosAtivos(u);
                  const bloqueadosRec = recursosBloqueados(u);
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 16px', color: u.ativo ? '#2c3e50' : '#aaa' }}>{u.email}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{ backgroundColor: roleInfo.color + '22', color: roleInfo.color, padding: '2px 10px', borderRadius: '12px', fontSize: '0.82em', fontWeight: 600 }}>
                          {roleInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{ color: u.ativo ? '#27ae60' : '#e74c3c', fontWeight: 600, fontSize: '0.85em' }}>
                          {u.ativo ? 'Ativo' : 'Bloqueado'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: '#7f8c8d' }}>{u._count.contasMl}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: '#7f8c8d' }}>{u._count.subUsuarios}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <Toggle checked={!!u.acessoLivre} onChange={() => toggleAcessoLivre(u)} />
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{ color: ativosCount < MODULOS.length ? '#e67e22' : '#27ae60', fontSize: '0.85em', fontWeight: 600 }}>
                          {ativosCount}/{MODULOS.length}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {bloqueadosRec > 0 ? (
                          <span style={{ color: '#e74c3c', fontSize: '0.85em', fontWeight: 600 }}>{bloqueadosRec} bloq.</span>
                        ) : (
                          <span style={{ color: '#27ae60', fontSize: '0.85em' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button onClick={() => setModalFlags(u)} style={btn('#3498db')}>Permissões</button>
                          <button onClick={() => setModalSenha(u)} style={btn('#e67e22')}>Senha</button>
                          <button
                            onClick={() => toggleAtivo(u)}
                            style={btn(u.ativo ? '#e74c3c' : '#27ae60')}
                          >
                            {u.ativo ? 'Bloquear' : 'Ativar'}
                          </button>
                          <button onClick={() => impersonar(u)} style={btn('#8e44ad')}>Entrar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {usuariosFiltrados.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#bbb' }}>Nenhum cliente encontrado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ABA: ASSINATURAS ── */}
      {abaMain === 'assinaturas' && <SecaoAssinaturas />}

      {/* ── ABA: CUPONS ── */}
      {abaMain === 'cupons' && <SecaoCupons />}

      {/* ── ABA: BANNER ── */}
      {abaMain === 'banner' && <SecaoBanner />}

      {/* ── ABA: CHAMADOS ── */}
      {abaMain === 'chamados' && <SecaoChamados />}

      {/* ── ABA: PADRÕES POR TIPO ── */}
      {abaMain === 'padroes' && (
        <div>
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#eaf4fb', border: '1px solid #aed6f1', fontSize: '0.87em', color: '#1a5276' }}>
            <strong>Como funciona:</strong> Os módulos e recursos configurados aqui como <em>bloqueados</em> serão aplicados automaticamente a cada novo cliente que se cadastrar na plataforma. Clientes já existentes não são afetados.
          </div>
          <SecaoPadroes />
        </div>
      )}

      {/* ── ABA: LANDING PAGE ── */}
      {abaMain === 'landing' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '1em', color: '#2c3e50' }}>Editor da Landing Page</span>
            <span style={{ fontSize: '0.8em', color: '#95a5a6' }}>As alterações são aplicadas em tempo real na página pública</span>
          </div>
          <SecaoLandingPage />
        </div>
      )}

      {/* Modal de permissões do usuário */}
      {modalFlags && (
        <ModalFlags
          usuario={modalFlags}
          onClose={() => setModalFlags(null)}
          onSave={salvarFlags}
        />
      )}

      {/* Modal de troca de senha */}
      {modalSenha && (
        <ModalTrocarSenha
          usuario={modalSenha}
          onClose={() => setModalSenha(null)}
        />
      )}

      {/* Modal criar usuário */}
      {modalCriar && (
        <ModalCriarUsuario
          onClose={() => setModalCriar(false)}
          onCriado={(novoUser) => setUsuarios(prev => [novoUser, ...prev])}
        />
      )}
    </div>
  );
}
