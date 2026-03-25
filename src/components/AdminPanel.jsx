import { useState, useEffect, useCallback } from 'react';
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

// ── Componente principal ──────────────────────────────────────────────────────
export default function AdminPanel({ setActivePage }) {
  const { setImpersonating } = useAuth();
  const [abaMain, setAbaMain] = useState('clientes');
  const [stats, setStats] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalFlags, setModalFlags] = useState(null);
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
        <button style={abaMainStyle('padroes')} onClick={() => setAbaMain('padroes')}>Padrões por Tipo</button>
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
                  <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#bbb' }}>Nenhum cliente encontrado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ABA: PADRÕES POR TIPO ── */}
      {abaMain === 'padroes' && (
        <div>
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#eaf4fb', border: '1px solid #aed6f1', fontSize: '0.87em', color: '#1a5276' }}>
            <strong>Como funciona:</strong> Os módulos e recursos configurados aqui como <em>bloqueados</em> serão aplicados automaticamente a cada novo cliente que se cadastrar na plataforma. Clientes já existentes não são afetados.
          </div>
          <SecaoPadroes />
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
    </div>
  );
}
