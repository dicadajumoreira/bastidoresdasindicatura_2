// Netlify Function · POST /api/auth
// Valida a senha enviada. Retorna um token simples (com hmac+timestamp)
// que o admin guarda em sessionStorage. Outras functions validam esse token.

import crypto from 'node:crypto';

const TOKEN_VALIDITY_HOURS = 12;

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verify(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({error: 'Method not allowed'}, 405);
  }

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

export const config = {
  path: '/api/auth',
};
