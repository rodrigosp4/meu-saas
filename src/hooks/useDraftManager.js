import { useState, useCallback, useEffect } from 'react';

const MAX_DRAFTS = 10;

function getStorageKey(userId) {
  return userId ? `ml_rascunhos_${userId}` : null;
}

function lerDrafts(userId) {
  const key = getStorageKey(userId);
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function gravarDrafts(list, userId) {
  const key = getStorageKey(userId);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(list));
}

export function useDraftManager(userId) {
  const [drafts, setDrafts] = useState(() => lerDrafts(userId));

  // Reler do localStorage quando userId ficar disponível (ex: carregamento assíncrono)
  useEffect(() => {
    if (userId) {
      setDrafts(lerDrafts(userId));
    }
  }, [userId]);

  const salvarDraft = useCallback((data) => {
    // data deve ter: { id, tipo, titulo, ...estadoDoFormulario }
    const all = lerDrafts(userId);
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
    gravarDrafts(all, userId);
    setDrafts([...all]);
  }, [userId]);

  const excluirDraft = useCallback((draftId) => {
    const all = lerDrafts(userId).filter(d => d.id !== draftId);
    gravarDrafts(all, userId);
    setDrafts([...all]);
  }, [userId]);

  return { drafts, salvarDraft, excluirDraft };
}

export function formatarDataDraft(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
