// Netlify Function v2 · POST /api/broadcast-start
//
// Substituto server-side do loop de paginacao que hoje roda no browser.
// A UI chama esse endpoint uma unica vez pra iniciar o disparo — o
// backend salva o job como 'queued' no store 'broadcasts', dispara uma
// background function pra processar, e retorna imediatamente com o
// broadcastId. A UI pode fechar o browser tranquila — o cron sweeper
// (broadcast-sweeper-background) garante que o job termina mesmo se
// a background function crashar/timeoutar no meio.
//
// Body: {
//   subject, html, filter,
//   test?: { email }  ← modo teste continua rodando sincrono (chama /api/broadcast)
// }
// Resposta: { ok: true, broadcastId, status: 'queued' }

import { getStore } from '@netlify/blobs';
import { verify, sign } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/broadcast-start', '/.netlify/functions/broadcast-start'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verify(token, secret);
  if (!payload) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const subject = String(body.subject || '').trim();
  const html = String(body.html || '');
  if (!subject) return json({error: 'O assunto é obrigatório'}, 400);
  if (!html) return json({error: 'O corpo do e-mail é obrigatório'}, 400);

  const broadcastId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filter = body.filter || {};

  // Salva o job. status='queued' significa que ainda nao comecou.
  // A background function e o sweeper procuram jobs 'queued' ou
  // 'sending' com lastBatchAt antigo pra retomar.
  try {
    const store = getStore({name: 'broadcasts', consistency: 'strong'});
    await store.setJSON(broadcastId, {
      id: broadcastId,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      subject,
      html,
      sent: 0,
      failed: 0,
      total: 0,
      filter: {
        excludeOrigens: filter.excludeOrigens || [],
        includeOrigens: filter.includeOrigens || null,
        statuses: filter.statuses || null,
        states: filter.states || null,
        includeCold: !!filter.includeCold,
        onlyNeverReceivedCold: !!filter.onlyNeverReceivedCold,
        onlyCold: !!filter.onlyCold,
      },
      filterSummary: summarizeFilter(filter),
      completed: false,
      resendOf: null,
      startedBy: payload.email || 'admin',
    });
  } catch (err) {
    return json({error: 'Falha ao salvar job: ' + err.message}, 500);
  }

  // Dispara a background function fire-and-forget. Assina um token
  // interno de curta duracao pra ela poder chamar /api/broadcast.
  try {
    const origin = new URL(req.url).origin;
    const internalToken = sign({email: 'internal-broadcast', exp: Date.now() + 20 * 60 * 1000}, secret);
    fetch(`${origin}/.netlify/functions/broadcast-run-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalToken}`,
      },
      body: JSON.stringify({broadcastId}),
    }).catch(() => {});
  } catch (e) {
    console.error('[broadcast-start] trigger background failed:', e.message);
    // Nao retorna erro — o cron sweeper vai pegar o job em 1min de qualquer forma.
  }

  return json({ok: true, broadcastId, status: 'queued'});
};

function summarizeFilter(filter) {
  const parts = [];
  if (filter.excludeOrigens?.length) parts.push(`excluir ${filter.excludeOrigens.join(', ')}`);
  if (filter.includeOrigens?.length) parts.push(`incluir ${filter.includeOrigens.join(', ')}`);
  if (filter.statuses?.length) parts.push(`status ${filter.statuses.join(', ')}`);
  if (filter.states?.length) parts.push(`UF ${filter.states.join(', ')}`);
  if (filter.includeCold) parts.push('+ leads frios');
  if (filter.onlyCold) parts.push('só frios');
  if (filter.onlyNeverReceivedCold) parts.push('só nunca receberam (frios)');
  return parts.join(' · ') || 'todos os leads';
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
