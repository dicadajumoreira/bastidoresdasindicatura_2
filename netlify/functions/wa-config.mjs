// Netlify Function v2 · GET/POST /api/wa-config
//
// GET  → devolve config atual + status das env vars + ultima sincronizacao
// POST → atualiza config (keywords, dailyCap, hourlyCap, sendWindow, warmupStartedAt)
//
// Tokens sensiveis (access token, app secret, webhook verify token) NAO
// passam por aqui — ficam SO em env var do Netlify. Esse endpoint mexe
// no que e configuravel pela UI: keywords, limites, janela de envio.

import { verify } from '../lib/auth-token.mjs';
import { getConfig, setConfig, auditLog } from '../lib/wa-store.mjs';
import { configStatus } from '../lib/wa-meta.mjs';

export const config = {
  path: ['/api/wa-config', '/.netlify/functions/wa-config'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  if (req.method === 'GET') {
    const cfg = await getConfig();
    return json({ok: true, config: cfg, meta: configStatus()});
  }

  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  // So aceita os campos editaveis pela UI. Ignora tudo o resto.
  const patch = {};
  if (Array.isArray(body.optOutKeywords)) {
    patch.optOutKeywords = body.optOutKeywords
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean).slice(0, 30);
  }
  if (typeof body.dailyCap === 'number' && body.dailyCap > 0 && body.dailyCap <= 100000) {
    patch.dailyCap = Math.floor(body.dailyCap);
  }
  if (typeof body.hourlyCap === 'number' && body.hourlyCap > 0 && body.hourlyCap <= 10000) {
    patch.hourlyCap = Math.floor(body.hourlyCap);
  }
  if (body.sendWindow && typeof body.sendWindow === 'object') {
    patch.sendWindow = {
      start: String(body.sendWindow.start || '08:00').slice(0, 5),
      end: String(body.sendWindow.end || '20:00').slice(0, 5),
      weekendsAllowed: !!body.sendWindow.weekendsAllowed,
    };
  }
  if (body.warmupStartedAt === null || typeof body.warmupStartedAt === 'string') {
    patch.warmupStartedAt = body.warmupStartedAt;
  }
  if (typeof body.notes === 'string') {
    patch.notes = body.notes.slice(0, 1000);
  }

  const next = await setConfig(patch);
  await auditLog({actor: 'admin', action: 'wa-config-update', target: 'config', payload: patch});

  return json({ok: true, config: next, meta: configStatus()});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
