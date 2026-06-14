// Netlify Function v2 · POST /api/membros-set-password
// Recebe o magic token + nova senha, hasheia e salva.
//
// Body: { token, password }
// Resposta: { ok, email } ou { error }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { hashPassword } from '../lib/password.mjs';

export const config = {
  path: ['/api/membros-set-password', '/.netlify/functions/membros-set-password'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const token = String(body.token || '');
  const password = String(body.password || '');
  if (!token) return json({error: 'Token ausente'}, 400);
  if (password.length < 6) return json({error: 'A senha precisa ter pelo menos 6 caracteres.'}, 400);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const payload = verify(token, secret);
  if (!payload || !payload.email || payload.type !== 'membros-set-password') {
    return json({error: 'Link inválido ou expirado.'}, 401);
  }

  const email = String(payload.email).toLowerCase();
  const passwordHash = hashPassword(password);

  try {
    const pwStore = getStore({name: 'member-passwords', consistency: 'strong'});
    const existing = await pwStore.get(email, {type: 'json'});
    await pwStore.setJSON(email, {
      email,
      passwordHash,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({error: 'Falha ao salvar a senha: ' + err.message}, 500);
  }

  return json({ok: true, email});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
