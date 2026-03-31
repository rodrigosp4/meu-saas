import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ml_rascunhos';
const MAX_DRAFTS = 10;

function lerDrafts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function gravarDrafts(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function useDraftManager() {
  const [drafts, setDrafts] = useState(lerDrafts);

  const salvarDraft = useCallback((data) => {
    // data deve ter: { id, tipo, titulo, ...estadoDoFormulario }
    const all = lerDrafts();
    const idx = all.findIndex(d => d.id === data.id);
    const now = Date.now();
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, updatedAt: now };
    } else {
      if (all.length >= MAX_DRAFTS) {
        // Remove o rascunho mais antigo
        all.sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
        all.shift();
      }
      all.push({ ...data, createdAt: now, updatedAt: now });
    }
    gravarDrafts(all);
    setDrafts([...all]);
  }, []);

  const excluirDraft = useCallback((draftId) => {
    const all = lerDrafts().filter(d => d.id !== draftId);
    gravarDrafts(all);
    setDrafts([...all]);
  }, []);

  return { drafts, salvarDraft, excluirDraft };
}

export function formatarDataDraft(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
