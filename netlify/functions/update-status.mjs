// Netlify Function v2 · POST /api/update-status
// Atualiza status ou notas de uma aplicação. Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/update-status', '/.netlify/functions/update-status'],
};

const VALID_STATUS = new Set(['novo', 'lido', 'respondido', 'convidado', 'recusado']);

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const { id, status, notes, deleted, ativo, mentoria, mentoriaModalidade } = body || {};
  const VALID_MENTORIA_MODALIDADES = new Set(['experience', 'executive']);
  if (mentoriaModalidade && !VALID_MENTORIA_MODALIDADES.has(mentoriaModalidade)) {
    return json({error: 'Modalidade inválida (experience | executive)'}, 400);
  }
  if (!id) return json({error: 'id obrigatório'}, 400);
  if (status && !VALID_STATUS.has(status)) return json({error: 'status inválido'}, 400);

  const store = getStore({name: 'leads', consistency: 'strong'});
  const current = await store.get(id, {type: 'json'});
  if (!current) return json({error: 'Não encontrado'}, 404);

  // Soft delete / restore via flag `deleted: true/false`
  const deletePatch = typeof deleted === 'boolean'
    ? {deleted, deletedAt: deleted ? new Date().toISOString() : null}
    : {};

  // Ativo/inativo: quando inativa (ativo:false), também marca
  // unsubscribed:true pra compatibilidade com checks legados.
  const ativoPatch = typeof ativo === 'boolean'
    ? {
        ativo,
        unsubscribed: !ativo,
        ...(ativo ? {} : {unsubscribedAt: current.unsubscribedAt || new Date().toISOString()}),
      }
    : {};

  // Mentoria: marca/desmarca o lead como inscrito na Mentoria. Ao
  // marcar, registra a data pra histórico. Ao desmarcar, mantém o
  // mentoriaAt pra rastreabilidade.
  const mentoriaPatch = typeof mentoria === 'boolean'
    ? {
        mentoria,
        ...(mentoria ? {mentoriaAt: current.mentoriaAt || new Date().toISOString()} : {}),
        // Quando ativa sem especificar modalidade, default = 'experience'
        ...(mentoria && !mentoriaModalidade && !current.mentoriaModalidade ? {mentoriaModalidade: 'experience'} : {}),
      }
    : {};
  const modalidadePatch = mentoriaModalidade
    ? {mentoriaModalidade}
    : {};

  const updated = {
    ...current,
    ...(status ? {status} : {}),
    ...(typeof notes === 'string' ? {notes} : {}),
    ...deletePatch,
    ...ativoPatch,
    ...mentoriaPatch,
    ...modalidadePatch,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(id, updated);

  // Atualiza o índice de membros com a flag de mentoria/modalidade.
  // Dispara também quando SÓ a modalidade mudou. Se a entrada do
  // e-mail ainda não existe no índice (caso comum: membro nunca
  // logou ainda), CRIA ela na hora — assim a próxima visita ao
  // /membros/ pega o estado certo.
  if (typeof mentoria === 'boolean' || typeof ativo === 'boolean' || mentoriaModalidade) {
    try {
      const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
      const idx = (await idxStore.get('index', {type: 'json'})) || {builtAt: new Date().toISOString(), byEmail: {}, count: 0};
      if (!idx.byEmail) idx.byEmail = {};
      const emailKey = String(updated.email || '').trim().toLowerCase();
      if (emailKey) {
        const existing = idx.byEmail[emailKey] || {
          id: updated.id,
          nome: updated.nome || '',
          createdAt: updated.createdAt,
          perfil: updated.perfil || null,
          perfil_nome: updated.perfil_nome || null,
        };
        idx.byEmail[emailKey] = {
          ...existing,
          nome: updated.nome || existing.nome || '',
          mentoria: !!updated.mentoria,
          mentoriaModalidade: updated.mentoria ? (updated.mentoriaModalidade || existing.mentoriaModalidade || 'experience') : null,
          ativo: updated.ativo !== false,
          unsubscribed: !!updated.unsubscribed,
        };
        idx.count = Object.keys(idx.byEmail).length;
        idx.lastIncrementalAt = new Date().toISOString();
        await idxStore.setJSON('index', idx);
      }
    } catch (err) {
      console.error('[update-status] members index update failed:', err.message);
    }
  }

  return json({ok: true, lead: updated});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
