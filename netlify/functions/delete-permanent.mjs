// Netlify Function v2 · POST /api/delete-permanent
// Apaga DEFINITIVAMENTE uma aplicação do Netlify Blobs.
// Exige token Bearer válido. Esta operação é IRREVERSÍVEL.
// (Para excluir com possibilidade de restaurar, use update-status com `deleted: true`.)

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/delete-permanent', '/.netlify/functions/delete-permanent'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const { id } = body || {};
  if (!id) return json({error: 'id obrigatório'}, 400);

  const store = getStore({name: 'leads', consistency: 'strong'});
  await store.delete(id);

  return json({ok: true, id});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
