// Netlify Function v2 · GET /api/wa-poli-status
//
// Healthcheck do canal Poli Digital: verifica env vars + faz ping.
// Retorna: { ok, env, ping }

import { verify } from '../lib/auth-token.mjs';
import { configStatus, ping } from '../lib/wa-poli.mjs';

export const config = {
  path: ['/api/wa-poli-status', '/.netlify/functions/wa-poli-status'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const env = configStatus();
  let pingResult = {ok: false, error: 'envvars-missing'};
  if (env.apiToken && env.customerId && env.channelId && env.userId) {
    pingResult = await ping();
  }

  return json({ok: true, env, ping: pingResult});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
