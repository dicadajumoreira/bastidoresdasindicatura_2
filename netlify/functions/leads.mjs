// Netlify Function v2 · GET /api/leads
// Lista todas as aplicações. Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: '/api/leads',
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!verify(token, secret)) {
    return json({error: 'Não autorizado'}, 401);
  }

  const store = getStore({name: 'leads', consistency: 'strong'});
  const { blobs } = await store.list();

  const raw = await Promise.all(
    blobs.map(async (b) => {
      try { return await store.get(b.key, {type: 'json'}); }
      catch { return null; }
    })
  );

  const leads = raw
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return json({ok: true, leads});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
