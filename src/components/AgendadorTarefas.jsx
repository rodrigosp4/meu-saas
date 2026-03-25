import { useState, useEffect, useCallback } from 'react';

const PRESETS = [
  { label: 'Todo dia à meia-noite',  cron: '0 0 * * *' },
  { label: 'Todo dia às 01:00',      cron: '0 1 * * *' },
  { label: 'Todo dia às 02:00',      cron: '0 2 * * *' },
  { label: 'Todo dia às 03:00',      cron: '0 3 * * *' },
  { label: 'Todo dia às 04:00',      cron: '0 4 * * *' },
  { label: 'Todo dia às 06:00',      cron: '0 6 * * *' },
  { label: 'Todo dia às 12:00',      cron: '0 12 * * *' },
  { label: 'A cada 6 horas',         cron: '0 */6 * * *' },
  { label: 'A cada 12 horas',        cron: '0 */12 * * *' },
  { label: 'Personalizado...',       cron: 'custom' },
];

function cronToLabel(cron) {
  const p = PRESETS.find(p => p.cron === cron);
  return p ? p.label : cron;
}

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function StatusBadge({ status }) {
  const cfg = {
    completed: { color: '#27ae60', bg: '#f0faf4', label: 'Sucesso' },
    failed:    { color: '#e74c3c', bg: '#fff5f5', label: 'Falhou' },
    active:    { color: '#f39c12', bg: '#fffbf0', label: 'Executando' },
  }[status] || { color: '#95a5a6', bg: '#f8f8f8', label: status };
  return (
    <span style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`, padding: '2px 10px', borderRadius: '12px', fontSize: '0.8em', fontWeight: 600 }}>
      {cfg.label}
    </span>
  );
}

export default function AgendadorTarefas() {
  const [data, setData] = useState({ agendamentos: [], historico: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(null); // { job }
  const [presetSel, setPresetSel] = useState('');
  const [cronCustom, setCronCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [dispMsg, setDispMsg] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const res = await fetch('/api/admin/agendamentos');
      if (!res.ok) throw new Error((await res.json()).erro);
      setData(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirModal = (job) => {
    const preset = PRESETS.find(p => p.cron === job.cron);
    setPresetSel(preset ? job.cron : 'custom');
    setCronCustom(job.cron);
    setModal(job);
  };

  const salvar = async () => {
    const cronFinal = presetSel === 'custom' ? cronCustom : presetSel;
    if (!cronFinal) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/agendamentos/cron', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobKey: modal.key, jobName: modal.name, newCron: cronFinal, tz: 'America/Sao_Paulo' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.erro);
      setData(prev => ({ ...prev, agendamentos: d.agendamentos }));
      setModal(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const executarAgora = async (job) => {
    setDispMsg('');
    try {
      const res = await fetch('/api/admin/agendamentos/executar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName: job.name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.erro);
      setDispMsg(`✓ ${d.message}`);
      setTimeout(() => { setDispMsg(''); carregar(); }, 4000);
    } catch (e) {
      alert(e.message);
    }
  };

  const card = { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: '24px' };
  const cardHeader = { padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: '1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: '#2c3e50' }}>

      {erro && <div style={{ padding: '12px 16px', backgroundColor: '#fff5f5', border: '1px solid #e74c3c44', borderRadius: '8px', color: '#e74c3c', marginBottom: '16px' }}>{erro}</div>}
      {dispMsg && <div style={{ padding: '12px 16px', backgroundColor: '#f0faf4', border: '1px solid #27ae6044', borderRadius: '8px', color: '#27ae60', marginBottom: '16px' }}>{dispMsg}</div>}

      {/* Tarefas agendadas */}
      <div style={card}>
        <div style={cardHeader}>
          <span>Tarefas agendadas</span>
          <button onClick={carregar} style={{ padding: '5px 12px', background: '#f4f6f8', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85em' }}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#bbb' }}>Carregando...</div>
        ) : data.agendamentos.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#bbb' }}>Nenhuma tarefa agendada encontrada. O servidor de workers está rodando?</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Tarefa</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Agendamento</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Fuso</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Próxima execução</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.agendamentos.map((job, i) => (
                <tr key={job.key} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{job.label}</div>
                    {job.descricao && <div style={{ fontSize: '0.82em', color: '#7f8c8d', marginTop: '2px' }}>{job.descricao}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.88em', backgroundColor: '#f4f6f8', padding: '2px 8px', borderRadius: '4px', color: '#34495e' }}>{job.cron}</span>
                    <div style={{ fontSize: '0.8em', color: '#7f8c8d', marginTop: '4px' }}>{cronToLabel(job.cron)}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85em', color: '#7f8c8d' }}>{job.tz}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85em', color: '#2c3e50' }}>{formatTs(job.next)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        onClick={() => abrirModal(job)}
                        style={{ padding: '5px 12px', backgroundColor: '#3498db22', color: '#3498db', border: '1px solid #3498db55', borderRadius: '5px', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600 }}
                      >
                        Alterar horário
                      </button>
                      <button
                        onClick={() => executarAgora(job)}
                        style={{ padding: '5px 12px', backgroundColor: '#27ae6022', color: '#27ae60', border: '1px solid #27ae6055', borderRadius: '5px', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600 }}
                      >
                        Executar agora
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Histórico */}
      <div style={card}>
        <div style={cardHeader}>
          <span>Últimas execuções</span>
        </div>
        {data.historico.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#bbb', fontSize: '0.9em' }}>Nenhuma execução registrada ainda.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Tarefa</th>
                <th style={{ padding: '9px 16px', textAlign: 'center', fontWeight: 600, color: '#495057' }}>Status</th>
                <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Finalizado em</th>
                <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Resultado / Erro</th>
              </tr>
            </thead>
            <tbody>
              {data.historico.map((h, i) => (
                <tr key={h.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '9px 16px', color: '#2c3e50' }}>{h.name}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'center' }}><StatusBadge status={h.status} /></td>
                  <td style={{ padding: '9px 16px', color: '#7f8c8d' }}>{formatTs(h.finishedOn)}</td>
                  <td style={{ padding: '9px 16px', color: h.failedReason ? '#e74c3c' : '#7f8c8d', fontSize: '0.85em', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.failedReason || (h.returnvalue ? JSON.stringify(h.returnvalue) : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal alterar horário */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '28px', width: '420px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05em', marginBottom: '4px' }}>Alterar horário</div>
            <div style={{ fontSize: '0.85em', color: '#7f8c8d', marginBottom: '20px' }}>{modal.label}</div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Selecione o horário</label>
              {PRESETS.map(p => (
                <label key={p.cron} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', marginBottom: '4px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${presetSel === p.cron ? '#3498db88' : '#eee'}`, backgroundColor: presetSel === p.cron ? '#ebf5fb' : '#fff', fontSize: '0.88em' }}>
                  <input
                    type="radio"
                    name="preset"
                    value={p.cron}
                    checked={presetSel === p.cron}
                    onChange={() => { setPresetSel(p.cron); if (p.cron !== 'custom') setCronCustom(p.cron); }}
                    style={{ accentColor: '#3498db' }}
                  />
                  <span style={{ flex: 1 }}>{p.label}</span>
                  {p.cron !== 'custom' && <code style={{ fontSize: '0.82em', color: '#7f8c8d', backgroundColor: '#f4f6f8', padding: '1px 6px', borderRadius: '3px' }}>{p.cron}</code>}
                </label>
              ))}
            </div>

            {presetSel === 'custom' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Expressão cron personalizada</label>
                <input
                  value={cronCustom}
                  onChange={e => setCronCustom(e.target.value)}
                  placeholder="Ex: 0 2 * * *"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9em', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '0.78em', color: '#7f8c8d', marginTop: '4px' }}>
                  Formato: minuto hora dia mês dia-semana &nbsp;·&nbsp;
                  <a href="https://crontab.guru" target="_blank" rel="noreferrer" style={{ color: '#3498db' }}>crontab.guru</a>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setModal(null)} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: '#f8f8f8', fontSize: '0.9em' }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving} style={{ padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: '#3498db', color: '#fff', fontWeight: 600, fontSize: '0.9em' }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
