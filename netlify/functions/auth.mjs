// Netlify Function v2 · POST /api/auth
// Valida a senha e devolve um token HMAC que o admin guarda em sessionStorage.

import { sign, TOKEN_VALIDITY_HOURS } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/auth', '/.netlify/functions/auth'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';

  if (!adminPassword) {
    return json({error: 'Servidor não configurado (ADMIN_PASSWORD)'}, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const password = (body.password || '').trim();
  if (!password) return json({error: 'Senha obrigatória'}, 400);

  // Pequeno delay para mitigar força bruta
  await new Promise((r) => setTimeout(r, 250));

  if (password !== adminPassword) {
    return json({error: 'Senha incorreta'}, 401);
  }

  const exp = Date.now() + TOKEN_VALIDITY_HOURS * 60 * 60 * 1000;
  const token = sign({iat: Date.now(), exp}, secret);

  return json({ok: true, token, exp});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
