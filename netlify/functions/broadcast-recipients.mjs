// Netlify Function v2 · GET /api/broadcast-recipients?broadcastId=X
// Lista os destinatários de um disparo específico. Cada item tem
// { email, nome, status: 'sent'|'failed', sentAt, error? }
//
// Os dados são gravados pelo broadcast.mjs e pela função scheduled
// em lotes (chave = `{broadcastId}__{offset}`), e aqui a gente lê
// todos os lotes (por prefixo) e devolve a lista plana.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/broadcast-recipients', '/.netlify/functions/broadcast-recipients'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const url = new URL(req.url);
  const broadcastId = url.searchParams.get('broadcastId');
  if (!broadcastId) return json({error: 'Falta o broadcastId'}, 400);

  try {
    const store = getStore({name: 'broadcast-recipients', consistency: 'strong'});
    const list = await store.list({prefix: `${broadcastId}__`});
    const keys = (list.blobs || []).map((b) => b.key).sort();

    const all = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      const batch = keys.slice(i, i + CONCURRENCY);
      const parts = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
      for (const p of parts) {
        if (p.status === 'fulfilled' && Array.isArray(p.value)) {
          all.push(...p.value);
        }
      }
    }

    // Ordena por horário de envio crescente
    all.sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1));

    return json({ok: true, broadcastId, recipients: all, count: all.length});

  } catch (err) {
    return json({error: 'Falha ao carregar destinatários: ' + err.message}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
