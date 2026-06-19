// Netlify Function v2 · GET /api/wa-status
//
// Healthcheck do modulo WhatsApp. Devolve:
//   - status das env vars (sem expor valores)
//   - ping na Cloud API da Meta (valida token + phone_number_id)
//   - qualidade do numero (rating, tier de limite)
//   - cap diario atual (apos warmup)
//   - quantos enviados hoje
//
// Usado pelo card de saude do numero no dashboard.

import { verify } from '../lib/auth-token.mjs';
import { configStatus, ping } from '../lib/wa-meta.mjs';
import { getConfig, getDailyLimit, computeWarmupCap } from '../lib/wa-store.mjs';

export const config = {
  path: ['/api/wa-status', '/.netlify/functions/wa-status'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const env = configStatus();
  const cfg = await getConfig();
  const cap = computeWarmupCap(cfg);

  let metaPing = {ok: false, error: 'envvars-missing'};
  if (env.accessToken && env.phoneNumberId) {
    metaPing = await ping();
  }

  const daily = await getDailyLimit();

  return json({
    ok: true,
    env,
    metaPing,
    config: cfg,
    daily: {
      date: daily.date,
      sent: daily.sent,
      cap,
      remaining: Math.max(0, cap - daily.sent),
    },
    warmup: {
      active: !!cfg.warmupStartedAt,
      startedAt: cfg.warmupStartedAt,
      currentCap: cap,
    },
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
