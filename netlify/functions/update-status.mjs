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

  const { id, status, notes, deleted, ativo } = body || {};
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

  const updated = {
    ...current,
    ...(status ? {status} : {}),
    ...(typeof notes === 'string' ? {notes} : {}),
    ...deletePatch,
    ...ativoPatch,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(id, updated);

  return json({ok: true, lead: updated});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
