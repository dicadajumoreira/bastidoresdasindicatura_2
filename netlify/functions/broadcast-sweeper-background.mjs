// Netlify Scheduled Function (background) · roda a cada 1 minuto.
//
// Sweeper self-healing pros disparos que ficaram "presos":
//   - status: 'queued' — nunca comecou (trigger inicial falhou)
//   - status: 'sending' com lastBatchAt > 3 min atras — background
//     function crashou/timeoutou/network fell
//
// Pra cada job preso, re-dispara /api/broadcast-run-background. Isso
// garante que o disparo sempre eventualmente termina, mesmo com falhas
// intermitentes de infra.
//
// Cron: */1 * * * * (a cada 1 minuto)

import { getStore } from '@netlify/blobs';
import { sign } from '../lib/auth-token.mjs';

export const config = {
  schedule: '* * * * *',
};

const STUCK_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutos sem atividade = preso

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const store = getStore({name: 'broadcasts', consistency: 'strong'});

  let stuck = [];
  try {
    const list = await store.list();
    const keys = (list.blobs || []).map((b) => b.key);
    const now = Date.now();
    const CONC = 20;
    for (let i = 0; i < keys.length; i += CONC) {
      const batch = keys.slice(i, i + CONC);
      const got = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const job = r.value;
        if (!job.status) continue;
        if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') continue;

        if (job.status === 'queued') {
          // Nunca comecou. Sempre re-dispara.
          stuck.push({id: job.id, reason: 'never-started'});
          continue;
        }

        if (job.status === 'sending') {
          const lastActivity = new Date(job.lastBatchAt || job.startedAt || job.queuedAt || 0).getTime();
          if (Number.isFinite(lastActivity) && (now - lastActivity) > STUCK_THRESHOLD_MS) {
            stuck.push({id: job.id, reason: 'stalled', staleFor: Math.round((now - lastActivity) / 1000) + 's'});
          }
        }
      }
    }
  } catch (err) {
    console.error('[broadcast-sweeper] falha ao varrer:', err.message);
    return json({error: err.message}, 500);
  }

  if (stuck.length === 0) {
    return json({ok: true, checked: 'no-stuck-jobs'});
  }

  console.log(`[broadcast-sweeper] re-disparando ${stuck.length} job(s) preso(s)`, stuck);

  // Re-dispara cada job preso. Assina token interno pra background
  // function aceitar. Fire-and-forget — se falhar de novo, proximo
  // cron pega em 1 min.
  const internalToken = sign({email: 'internal-sweeper', exp: Date.now() + 20 * 60 * 1000}, secret);
  // Netlify Scheduled Functions nao tem req.url convencional, entao
  // usamos a URL do site do proprio env
  const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'https://bastidoresdasindicatura.com.br';
  for (const s of stuck) {
    try {
      // Marca lastBatchAt agora pra evitar que outro cron dupliqe
      // a acao caso rode antes do background function comecar
      try {
        const cur = await store.get(s.id, {type: 'json'});
        if (cur) await store.setJSON(s.id, {...cur, lastBatchAt: new Date().toISOString(), lastSwept: new Date().toISOString(), lastSweepReason: s.reason});
      } catch {}

      await fetch(`${siteUrl}/.netlify/functions/broadcast-run-background`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${internalToken}`},
        body: JSON.stringify({broadcastId: s.id}),
      }).catch(() => {});
    } catch (e) {
      console.error('[broadcast-sweeper] falha re-dispatch:', s.id, e.message);
    }
  }

  return json({ok: true, rescued: stuck.length, jobs: stuck});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
