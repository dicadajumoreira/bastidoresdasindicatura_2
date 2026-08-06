// Netlify Background Function v2 (15 min budget) ·
// POST /.netlify/functions/broadcast-run-background
//
// Processa um broadcast do inicio ao fim (ou ate o limite de tempo),
// chamando /api/broadcast internamente em pagina‐em‐pagina do mesmo
// jeito que o browser fazia antes — so que agora do lado servidor.
// Se o tempo se aproximar do limite (~14 min), salva estado e
// re-dispara ela mesma pro proximo chunk (auto-encadeamento).
//
// Body: { broadcastId }

import { getStore } from '@netlify/blobs';
import { verify, sign } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/broadcast-run-background', '/.netlify/functions/broadcast-run-background'],
};

const LIMIT_PER_CALL = 40;              // mesmo que o loop no browser
const TIME_BUDGET_MS = 14 * 60 * 1000;  // 14min (Netlify da 15min)
const START_TIME = () => Date.now();

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) {
    return new Response('Não autorizado', {status: 401});
  }

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const broadcastId = String(body.broadcastId || '').trim();
  if (!broadcastId) return json({error: 'broadcastId obrigatório'}, 400);

  const store = getStore({name: 'broadcasts', consistency: 'strong'});
  const start = START_TIME();

  // Carrega o job
  let job;
  try { job = await store.get(broadcastId, {type: 'json'}); }
  catch (err) { return json({error: 'Falha ao carregar job: ' + err.message}, 500); }
  if (!job) return json({error: 'Broadcast não encontrado'}, 404);
  if (job.status === 'completed' || job.status === 'cancelled') {
    return json({ok: true, alreadyDone: true, status: job.status});
  }

  // Marca 'sending' + carimba timestamp pra que o sweeper nao ache
  // que esta parado
  job.status = 'sending';
  job.startedAt = job.startedAt || new Date().toISOString();
  job.lastBatchAt = new Date().toISOString();
  try { await store.setJSON(broadcastId, job); } catch {}

  // Assina token interno pra chamar /api/broadcast (que exige Bearer)
  const internalToken = sign({email: 'internal-broadcast', exp: Date.now() + 20 * 60 * 1000}, secret);
  const origin = new URL(req.url).origin;

  let offset = (job.sent || 0) + (job.failed || 0);
  let processedTotal = offset;
  let iterations = 0;
  const MAX_ITER = 800; // cap defensivo (~32k emails/chunk se nao respeitasse tempo)

  while (iterations < MAX_ITER) {
    iterations++;

    // Time budget: se restar menos que 60s, re-dispara pro proximo chunk
    // e sai. O proximo chunk continua de onde parou.
    if (Date.now() - start > TIME_BUDGET_MS - 60_000) {
      console.log(`[broadcast-run] time budget alcancado apos ${iterations} iter, re-disparando`);
      try {
        fetch(`${origin}/.netlify/functions/broadcast-run-background`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${internalToken}`},
          body: JSON.stringify({broadcastId}),
        }).catch(() => {});
      } catch {}
      return json({ok: true, chunk: 'partial', reason: 'time-budget', offset, processedTotal});
    }

    // Chama o worker /api/broadcast pra processar UMA pagina
    let res;
    try {
      const r = await fetch(`${origin}/.netlify/functions/broadcast`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${internalToken}`},
        body: JSON.stringify({
          resumeFrom: broadcastId,
          offset,
          limit: LIMIT_PER_CALL,
        }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`worker retornou ${r.status}: ${text.slice(0, 200)}`);
      }
      res = await r.json();
    } catch (err) {
      console.error(`[broadcast-run] falha no worker iter ${iterations}:`, err.message);
      // Marca lastBatchAt pra sweeper nao considerar preso ainda
      try {
        const cur = await store.get(broadcastId, {type: 'json'}) || job;
        await store.setJSON(broadcastId, {
          ...cur,
          lastBatchAt: new Date().toISOString(),
          lastWorkerError: String(err.message).slice(0, 200),
        });
      } catch {}
      // Aguarda e tenta de novo (max 3 falhas seguidas)
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    if (!res.ok) {
      console.error(`[broadcast-run] worker respondeu !ok:`, res.error);
      // Salva erro e tenta de novo depois do proximo sweeper
      try {
        const cur = await store.get(broadcastId, {type: 'json'}) || job;
        await store.setJSON(broadcastId, {
          ...cur,
          lastBatchAt: new Date().toISOString(),
          lastWorkerError: String(res.error || 'erro').slice(0, 200),
        });
      } catch {}
      return json({ok: false, workerError: res.error});
    }

    processedTotal = res.nextOffset || offset;
    offset = processedTotal;

    // Se worker diz que acabou, marca completed e sai
    if (!res.hasMore) {
      try {
        const cur = await store.get(broadcastId, {type: 'json'}) || job;
        await store.setJSON(broadcastId, {
          ...cur,
          status: 'completed',
          completedAt: new Date().toISOString(),
          lastBatchAt: new Date().toISOString(),
        });
      } catch {}
      console.log(`[broadcast-run] completed apos ${iterations} iter · total ${processedTotal}`);
      return json({ok: true, chunk: 'final', iterations, processedTotal});
    }
  }

  // Estourou MAX_ITER (nao deveria) — re-dispara pra continuar
  console.warn(`[broadcast-run] MAX_ITER atingido, re-disparando pra continuar`);
  try {
    fetch(`${origin}/.netlify/functions/broadcast-run-background`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${internalToken}`},
      body: JSON.stringify({broadcastId}),
    }).catch(() => {});
  } catch {}
  return json({ok: true, chunk: 'partial', reason: 'max-iter', offset});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
