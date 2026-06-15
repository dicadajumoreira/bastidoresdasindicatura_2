// Netlify Function v2 · POST /api/update-status
// Atualiza status ou notas de uma aplicação. Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/update-status', '/.netlify/functions/update-status'],
};

const VALID_STATUS = new Set(['novo', 'lido', 'respondido', 'convidado', 'recusado']);

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const { id, status, notes, deleted, ativo, mentoria } = body || {};
  if (!id) return json({error: 'id obrigatório'}, 400);
  if (status && !VALID_STATUS.has(status)) return json({error: 'status inválido'}, 400);

  const store = getStore({name: 'leads', consistency: 'strong'});
  const current = await store.get(id, {type: 'json'});
  if (!current) return json({error: 'Não encontrado'}, 404);

  // Soft delete / restore via flag `deleted: true/false`
  const deletePatch = typeof deleted === 'boolean'
    ? {deleted, deletedAt: deleted ? new Date().toISOString() : null}
    : {};

  // Ativo/inativo: quando inativa (ativo:false), também marca
  // unsubscribed:true pra compatibilidade com checks legados.
  const ativoPatch = typeof ativo === 'boolean'
    ? {
        ativo,
        unsubscribed: !ativo,
        ...(ativo ? {} : {unsubscribedAt: current.unsubscribedAt || new Date().toISOString()}),
      }
    : {};

  // Mentoria: marca/desmarca o lead como inscrito na Mentoria. Ao
  // marcar, registra a data pra histórico. Ao desmarcar, mantém o
  // mentoriaAt pra rastreabilidade.
  const mentoriaPatch = typeof mentoria === 'boolean'
    ? {
        mentoria,
        ...(mentoria ? {mentoriaAt: current.mentoriaAt || new Date().toISOString()} : {}),
      }
    : {};

  const updated = {
    ...current,
    ...(status ? {status} : {}),
    ...(typeof notes === 'string' ? {notes} : {}),
    ...deletePatch,
    ...ativoPatch,
    ...mentoriaPatch,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(id, updated);

  // Atualiza o índice de membros com a flag de mentoria
  if (typeof mentoria === 'boolean' || typeof ativo === 'boolean') {
    try {
      const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
      const idx = await idxStore.get('index', {type: 'json'});
      const emailKey = String(updated.email || '').trim().toLowerCase();
      if (idx && idx.byEmail && emailKey && idx.byEmail[emailKey]) {
        idx.byEmail[emailKey] = {
          ...idx.byEmail[emailKey],
          mentoria: !!updated.mentoria,
          ativo: updated.ativo !== false,
          unsubscribed: !!updated.unsubscribed,
        };
        idx.lastIncrementalAt = new Date().toISOString();
        await idxStore.setJSON('index', idx);
      }
    } catch (err) {
      console.error('[update-status] members index update failed:', err.message);
    }
  }

  return json({ok: true, lead: updated});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
