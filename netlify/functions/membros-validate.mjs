// Netlify Function v2 · POST /api/membros-validate
// Valida um token de sessão da área de membros. Devolve nome e e-mail
// do membro pra UI personalizar a saudação. Devolve TAMBÉM a config da
// Mentoria — completa pra inscritos, sanitizada (sem teamsLink, sem
// gravações) pra não-inscritos que vão ver o cronograma como teaser.
//
// Body: { token }
// Resposta: { ok, email, nome, perfil, perfil_nome, mentoria, mentoriaModalidade, mentoriaConfig }

import { verify } from '../lib/auth-token.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';
import { loadMentoriaConfig } from '../lib/mentoria-config.mjs';

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
    return json({ok: true, email, nome: ''});
  }
  if (!lookup.lead) {
    return json({error: 'Cadastro não encontrado ou desativado'}, 403);
  }

  // Sempre devolve a config. Sanitizada pra quem nao eh inscrito (sem
  // teamsLink, sem recordingLinks) — assim o frontend renderiza o
  // cronograma como teaser pra todo membro logado.
  let mentoriaConfig = null;
  try {
    mentoriaConfig = await loadMentoriaConfig({sanitize: !lookup.lead.mentoria});
  } catch {}

  return json({
    ok: true, email,
    nome: lookup.lead.nome || '',
    perfil: lookup.lead.perfil || null,
    perfil_nome: lookup.lead.perfil_nome || null,
    mentoria: !!lookup.lead.mentoria,
    mentoriaModalidade: lookup.lead.mentoriaModalidade || null,
    mentoriaConfig,
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
