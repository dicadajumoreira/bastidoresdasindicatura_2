// Netlify Function · GET /api/leads
// Retorna a lista de aplicações. Requer token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from './auth.mjs';

export default async (req) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return json({error: 'Servidor não configurado (AUTH_SECRET)'}, 500);
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!verify(token, secret)) {
    return json({error: 'Não autorizado'}, 401);
  }

  const store = getStore({name: 'leads', consistency: 'strong'});
  const { blobs } = await store.list();

  const leads = await Promise.all(
    blobs.map(async (b) => {
      try { return await store.get(b.key, {type: 'json'}); }
      catch { return null; }
    })
  );

  // Ordena por data de criação desc
  leads
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return json({
    ok: true,
    leads: leads.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

export const config = {
  path: '/api/leads',
};
