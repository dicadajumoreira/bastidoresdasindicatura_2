// Netlify Function v2 · POST /api/update-lead
// Edita campos arbitrários de um lead. Diferente de update-status (que mexe
// apenas em status/notes/deleted), esse aceita qualquer campo editável:
// nome, cidade, estado, whatsapp, email, instagram, atuacao, modalidade,
// tempoMercado, qtdCondominios, etc., E os arrays emailsExtras / whatsappsExtras.
// Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/update-lead', '/.netlify/functions/update-lead'],
};

// Campos que o admin pode editar
const EDITABLE = new Set([
  'nome', 'cidade', 'estado', 'whatsapp', 'email', 'instagram',
  'atuacao', 'tempoMercado', 'qtdCondominios',
  'maiorDesafio', 'desgaste', 'areas',
  'desenvolvimento', 'objetivo', 'onde2anos',
  'bastidor', 'modalidade', 'compromisso', 'participacao',
  'emailsExtras', 'whatsappsExtras', 'instagramsExtras',
  'notes',
]);

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const { id, fields } = body || {};
  if (!id) return json({error: 'id obrigatório'}, 400);
  if (!fields || typeof fields !== 'object') return json({error: 'fields obrigatório'}, 400);

  const store = getStore({name: 'leads', consistency: 'strong'});
  const current = await store.get(id, {type: 'json'});
  if (!current) return json({error: 'Não encontrado'}, 404);

  const patch = {};
  for (const k of Object.keys(fields)) {
    if (EDITABLE.has(k)) patch[k] = fields[k];
  }

  // Limpa arrays vazios e remove duplicatas / valores vazios
  for (const arrKey of ['emailsExtras', 'whatsappsExtras', 'instagramsExtras']) {
    if (Array.isArray(patch[arrKey])) {
      patch[arrKey] = [...new Set(patch[arrKey].map((v) => (v || '').trim()).filter(Boolean))];
    }
  }

  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(id, updated);

  return json({ok: true, lead: updated});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
