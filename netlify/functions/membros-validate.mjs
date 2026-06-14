// Netlify Function v2 · POST /api/membros-validate
// Valida um token de sessão da área de membros. Devolve nome e e-mail
// do membro pra UI personalizar a saudação.
//
// Body: { token }
// Resposta: { ok, email, nome }

import { verify } from '../lib/auth-token.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';

export const config = {
  path: ['/api/membros-validate', '/.netlify/functions/membros-validate'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const token = String(body.token || '');
  if (!token) return json({error: 'Token ausente'}, 400);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const payload = verify(token, secret);
  if (!payload || !payload.email || (payload.type !== 'membros' && payload.type !== 'membros-session')) {
    return json({error: 'Link inválido ou expirado'}, 401);
  }

  const email = String(payload.email).toLowerCase();
  const lookup = await findLeadByEmail(email);
  if (lookup.indexMissing) {
    // Caso raríssimo: token válido + índice sumiu. Devolve dados do
    // payload pra não derrubar a sessão.
    return json({ok: true, email, nome: ''});
  }
  if (!lookup.lead) {
    return json({error: 'Cadastro não encontrado ou desativado'}, 403);
  }

  return json({ok: true, email, nome: lookup.lead.nome || ''});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
