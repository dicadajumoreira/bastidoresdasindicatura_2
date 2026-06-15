// Netlify Function v2 · POST /api/membros-login
// Autentica via e-mail + senha. Devolve um token de sessão (HMAC, 7 dias).
//
// Body: { email, password }
// Resposta: { ok: true, token, email, nome } ou { error }
//
// Importante: a resposta de "credenciais inválidas" e "e-mail não cadastrado"
// é IDÊNTICA pra não permitir enumerar a base.

import { getStore } from '@netlify/blobs';
import { sign } from '../lib/auth-token.mjs';
import { verifyPassword } from '../lib/password.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';

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

  // 2) Procura o cadastro do lead via índice (com fallback pra scan)
  const lookup = await findLeadByEmail(email);
  const lead = lookup.lead;

  // 3) Valida
  if (!lead || !credentials || !verifyPassword(password, credentials.passwordHash)) {
    return json({error: 'E-mail ou senha inválidos. Se ainda não criou senha, use a opção "Criar minha senha".'}, 401);
  }

  // 4) Emite token de sessão de 7 dias
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const token = sign({email, type: 'membros-session', exp}, secret);

  return json({
    ok: true, token, email,
    nome: lead.nome || '',
    perfil: lead.perfil || null,
    perfil_nome: lead.perfil_nome || null,
    mentoria: !!lead.mentoria,
  });
};

async function triggerIndexBuild(req) {
  try {
    const origin = new URL(req.url).origin;
    fetch(`${origin}/.netlify/functions/members-email-index-build-background`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    }).catch(() => {});
  } catch {}
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
