// Netlify Function v2 · GET /api/leads-migrate-whatsapp-status
//
// Le o progresso da migracao WhatsApp E.164 (leads + cold-leads).
// Retorna: { ok, overall, leads, cold }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/leads-migrate-whatsapp-status', '/.netlify/functions/leads-migrate-whatsapp-status'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  try {
    const store = getStore({name: 'migration-status', consistency: 'strong'});
    const [overall, leads, cold] = await Promise.all([
      store.get('whatsapp-e164/overall', {type: 'json'}).catch(() => null),
      store.get('whatsapp-e164/leads', {type: 'json'}).catch(() => null),
      store.get('whatsapp-e164/cold-leads', {type: 'json'}).catch(() => null),
    ]);
    return json({ok: true, overall, leads, cold});
  } catch (err) {
    return json({error: err.message}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
