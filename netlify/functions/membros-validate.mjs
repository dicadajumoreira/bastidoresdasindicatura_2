// Netlify Function v2 · POST /api/membros-validate
// Valida um token de magic link da área de membros. Devolve nome e e-mail
// do membro pra UI personalizar a saudação.
//
// Body: { token }
// Resposta: { ok, email, nome }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

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

  // Busca o nome pra personalizar a área de membros
  let nome = '';
  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    const list = await store.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');
    for (let i = 0; i < keys.length && !nome; i += 12) {
      const batch = keys.slice(i, i + 12);
      const got = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const v = r.value;
        if (v.deletedAt) continue;
        if (v.unsubscribed || v.ativo === false) continue;
        if (String(v.email || '').toLowerCase() === email) {
          nome = v.nome || '';
          break;
        }
      }
    }
  } catch {}

  if (!nome) {
    // Token válido mas o cadastro foi removido/inativado depois
    return json({error: 'Cadastro não encontrado ou desativado'}, 403);
  }

  return json({ok: true, email, nome});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
