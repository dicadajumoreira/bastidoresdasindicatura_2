// Netlify Function v2 · GET /api/broadcast-history
// Lista os disparos já feitos. Exige token Bearer.
//
// Resposta: { ok: true, history: [{id, sentAt, subject, sent, failed, total, filterSummary}, ...] }
// Ordenação: mais recente primeiro.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/broadcast-history', '/.netlify/functions/broadcast-history'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  try {
    const store = getStore({name: 'broadcasts', consistency: 'strong'});
    const list = await store.list();
    const records = [];

    // Lê em paralelo com concorrência limitada
    const keys = (list.blobs || []).map((b) => b.key);
    const CONCURRENCY = 10;
    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      const batch = keys.slice(i, i + CONCURRENCY);
      const got = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status === 'fulfilled' && r.value) {
          const v = r.value;
          // Não devolve o HTML completo na listagem (economiza banda).
          // Quem quiser ver o corpo pode pedir o registro inteiro depois.
          records.push({
            id: v.id,
            sentAt: v.sentAt,
            subject: v.subject,
            sent: v.sent || 0,
            failed: v.failed || 0,
            total: v.total || 0,
            filterSummary: v.filterSummary || '',
            origensExcluded: (v.filter && v.filter.excludeOrigens) || [],
          });
        }
      }
    }

    records.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
    return json({ok: true, history: records});

  } catch (err) {
    return json({error: 'Falha ao ler histórico: ' + (err && err.message || 'erro desconhecido')}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
