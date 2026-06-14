// Netlify Function v2 · POST /api/membros-login
// Autentica via e-mail + senha. Devolve um token de sessão (HMAC, 7 dias).
//
// Body: { email, password }
// Resposta: { ok: true, token, email, nome } ou { error }
//
// Importante: a resposta de "credenciais inválidas" e "e-mail não cadastrado"
// é IDÊNTICA (mesma mensagem) pra não permitir enumerar a base.

import { getStore } from '@netlify/blobs';
import { sign } from '../lib/auth-token.mjs';
import { verifyPassword } from '../lib/password.mjs';

export const config = {
  path: ['/api/membros-login', '/.netlify/functions/membros-login'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !email.includes('@') || !password) {
    return json({error: 'E-mail ou senha inválidos.'}, 400);
  }

  // 1) Procura senha cadastrada
  let credentials = null;
  try {
    const pwStore = getStore({name: 'member-passwords', consistency: 'strong'});
    credentials = await pwStore.get(email, {type: 'json'});
  } catch {}

  // 2) Procura o cadastro do lead
  let lead = null;
  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    const list = await store.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');
    for (let i = 0; i < keys.length && !lead; i += 12) {
      const batch = keys.slice(i, i + 12);
      const got = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const v = r.value;
        if (v.deletedAt) continue;
        if (v.unsubscribed || v.ativo === false) continue;
        if (String(v.email || '').toLowerCase() === email) { lead = v; break; }
      }
    }
  } catch (err) {
    console.error('[membros-login] leads scan failed:', err.message);
  }

  // 3) Valida
  if (!lead || !credentials || !verifyPassword(password, credentials.passwordHash)) {
    // Mensagem genérica pra não vazar existência do cadastro
    return json({error: 'E-mail ou senha inválidos. Se ainda não criou senha, use a opção "Criar minha senha".'}, 401);
  }

  // 4) Emite token de sessão de 7 dias
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const token = sign({email, type: 'membros-session', exp}, secret);

  return json({ok: true, token, email, nome: lead.nome || ''});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
