// Netlify Function v2 · POST /api/membros-get-profile
// Devolve os dados do cadastro do membro autenticado pra preencher
// o formulário de edição.
//
// Body: { token }
// Resposta: { ok, lead: {nome, email, cidade, estado, whatsapp, instagram, atuacao, data_nascimento, modalidade} }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';

export const config = {
  path: ['/api/membros-get-profile', '/.netlify/functions/membros-get-profile'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const token = String(body.token || '');
  if (!token) return json({error: 'Sessão expirada.'}, 401);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const payload = verify(token, secret);
  if (!payload || !payload.email || (payload.type !== 'membros' && payload.type !== 'membros-session')) {
    return json({error: 'Sessão expirada.'}, 401);
  }

  const email = String(payload.email).toLowerCase();
  const lookup = await findLeadByEmail(email);
  if (!lookup.lead) return json({error: 'Cadastro não encontrado.'}, 404);

  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    const lead = await store.get(lookup.lead.id, {type: 'json'});
    if (!lead) return json({error: 'Cadastro não encontrado.'}, 404);
    return json({
      ok: true,
      lead: {
        nome: lead.nome || '',
        email: lead.email || email,
        cidade: lead.cidade || '',
        estado: lead.estado || '',
        whatsapp: lead.whatsapp || '',
        instagram: lead.instagram || '',
        atuacao: lead.atuacao || '',
        data_nascimento: lead.data_nascimento || '',
        modalidade: lead.modalidade || '',
        origem: lead.origem || '',
        createdAt: lead.createdAt || '',
      },
    });
  } catch (err) {
    return json({error: 'Falha ao carregar: ' + err.message}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
