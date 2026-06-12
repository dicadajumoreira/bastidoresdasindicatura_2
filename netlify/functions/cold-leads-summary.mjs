// Netlify Function v2 · GET/POST /api/cold-leads-summary
//
// GET: retorna o status atual do índice (ready/building/missing) + contagem
// POST: dispara o background pra reconstruir o índice
//
// O índice é consumido pelo broadcast quando o usuário marca "incluir leads
// frios" — em vez de escanear ~14k registros (estoura timeout), o broadcast
// faz UMA leitura do blob 'summary' nesta store.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/cold-leads-summary', '/.netlify/functions/cold-leads-summary'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const summaryStore = getStore({name: 'cold-leads-summary', consistency: 'strong'});

  if (req.method === 'GET') {
    try {
      const status = await safeGet(summaryStore, 'status');
      const summary = await safeGet(summaryStore, 'summary');
      return json({
        ok: true,
        exists: !!summary,
        builtAt: summary?.builtAt || null,
        count: summary?.count || 0,
        sourceRecords: summary?.sourceRecords || 0,
        status: status?.state || (summary ? 'ready' : 'missing'),
        progress: status?.progress || 0,
        progressTotal: status?.total || 0,
        startedAt: status?.startedAt || null,
        error: status?.error || null,
      });
    } catch (err) {
      return json({error: err.message}, 500);
    }
  }

  if (req.method === 'POST') {
    // Dispara o background fire-and-forget
    try {
      const origin = new URL(req.url).origin;
      const bgUrl = `${origin}/.netlify/functions/cold-leads-summary-build-background`;
      // Marca status pra UI saber imediatamente
      await summaryStore.setJSON('status', {
        state: 'building',
        startedAt: new Date().toISOString(),
        progress: 0,
        total: 0,
      });
      // Fire-and-forget — não aguarda
      fetch(bgUrl, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }).catch((e) => console.error('[summary trigger] fetch failed:', e.message));
      return json({ok: true, building: true});
    } catch (err) {
      return json({error: err.message}, 500);
    }
  }

  if (req.method === 'DELETE') {
    try {
      try { await summaryStore.delete('summary'); } catch {}
      try { await summaryStore.delete('status'); } catch {}
      return json({ok: true});
    } catch (err) {
      return json({error: err.message}, 500);
    }
  }

  return json({error: 'Method not allowed'}, 405);
};

async function safeGet(store, key) {
  try { return await store.get(key, {type: 'json'}); } catch { return null; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
