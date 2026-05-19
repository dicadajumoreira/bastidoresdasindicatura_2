// Netlify Function · POST /api/update-status
// Atualiza status ou notes de uma aplicação. Requer token Bearer.

import { getStore } from '@netlify/blobs';
import { verify } from './auth.mjs';

const VALID_STATUS = new Set(['novo', 'lido', 'respondido', 'convidado', 'recusado']);

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const { id, status, notes } = body || {};
  if (!id) return json({error: 'id obrigatório'}, 400);
  if (status && !VALID_STATUS.has(status)) return json({error: 'status inválido'}, 400);

  const store = getStore({name: 'leads', consistency: 'strong'});
  const current = await store.get(id, {type: 'json'});
  if (!current) return json({error: 'Não encontrado'}, 404);

  const updated = {
    ...current,
    ...(status ? {status} : {}),
    ...(typeof notes === 'string' ? {notes} : {}),
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
