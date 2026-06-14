// Netlify Function v2 · POST /api/membros-update-profile
// Atualiza os dados do cadastro do membro autenticado.
//
// Body: { token, nome, cidade, estado, whatsapp, instagram, atuacao, data_nascimento, modalidade }
// Resposta: { ok, lead } ou { error }
//
// Validações:
// - Token de sessão (type='membros-session' ou 'membros') válido
// - Só altera os campos editáveis. NÃO permite mudar e-mail (é a
//   chave de identidade), origem, status, ativo, unsubscribed.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';

export const config = {
  path: ['/api/membros-update-profile', '/.netlify/functions/membros-update-profile'],
};

const UF_VALID = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const token = String(body.token || '');
  if (!token) return json({error: 'Sessão expirada. Faça login de novo.'}, 401);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const payload = verify(token, secret);
  if (!payload || !payload.email || (payload.type !== 'membros' && payload.type !== 'membros-session')) {
    return json({error: 'Sessão expirada. Faça login de novo.'}, 401);
  }

  const email = String(payload.email).toLowerCase();

  // Encontra o lead via índice (com fallback de scan)
  const lookup = await findLeadByEmail(email);
  if (!lookup.lead) return json({error: 'Cadastro não encontrado ou desativado.'}, 403);

  // Carrega o registro completo pra atualizar
  let current;
  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    current = await store.get(lookup.lead.id, {type: 'json'});
  } catch (err) {
    return json({error: 'Falha ao carregar o cadastro: ' + err.message}, 500);
  }
  if (!current) return json({error: 'Cadastro não encontrado.'}, 404);

  // Sanitiza os campos editáveis
  const sanitize = (v) => String(v == null ? '' : v).trim();
  const cleaned = {
    nome: sanitize(body.nome),
    cidade: sanitize(body.cidade),
    estado: sanitize(body.estado).toUpperCase().slice(0, 2),
    whatsapp: sanitize(body.whatsapp),
    instagram: sanitize(body.instagram).replace(/^@+/, ''),
    atuacao: sanitize(body.atuacao),
    data_nascimento: normalizeDataNasc(sanitize(body.data_nascimento)),
    modalidade: sanitize(body.modalidade), // só pra mentoria, mas inofensivo
  };

  if (cleaned.estado && !UF_VALID.has(cleaned.estado)) {
    return json({error: 'UF inválido.'}, 400);
  }
  if (!cleaned.nome) return json({error: 'Nome é obrigatório.'}, 400);

  // Monta o registro atualizado (preserva campos não-editáveis)
  const updated = {
    ...current,
    nome: cleaned.nome,
    cidade: cleaned.cidade,
    estado: cleaned.estado,
    whatsapp: cleaned.whatsapp,
    instagram: cleaned.instagram,
    atuacao: cleaned.atuacao,
    data_nascimento: cleaned.data_nascimento,
    ...(cleaned.modalidade ? {modalidade: cleaned.modalidade} : {}),
    updatedAt: new Date().toISOString(),
    profileUpdatedAt: new Date().toISOString(),
  };

  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    await store.setJSON(current.id, updated);
  } catch (err) {
    return json({error: 'Falha ao salvar: ' + err.message}, 500);
  }

  // Atualiza o índice incrementalmente
  try {
    const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
    const idx = await idxStore.get('index', {type: 'json'});
    if (idx && idx.byEmail && idx.byEmail[email]) {
      idx.byEmail[email] = {
        ...idx.byEmail[email],
        nome: updated.nome,
      };
      idx.lastIncrementalAt = new Date().toISOString();
      await idxStore.setJSON('index', idx);
    }
  } catch (err) {
    console.error('[membros-update-profile] index update failed:', err.message);
  }

  return json({
    ok: true,
    lead: {
      nome: updated.nome,
      email: updated.email,
      cidade: updated.cidade,
      estado: updated.estado,
      whatsapp: updated.whatsapp,
      instagram: updated.instagram,
      atuacao: updated.atuacao,
      data_nascimento: updated.data_nascimento,
      modalidade: updated.modalidade || '',
    },
  });
};

function normalizeDataNasc(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[2]}-${m[3]}-${m[1]}`;
  if ((m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/))) return s;
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return `${m[2]}-${m[1]}-${m[3]}`;
  return s;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
