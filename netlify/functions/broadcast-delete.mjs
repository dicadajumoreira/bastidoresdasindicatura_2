// Netlify Function v2 · POST /api/broadcast-delete
// Apaga um disparo do historico: o registro do broadcast em si, todos
// os lotes de destinatarios (broadcast-recipients com prefix do id) e
// qualquer agendamento pendente desse broadcast. Exige token Bearer.
//
// Body: { id }
// Resposta: { ok: true, deleted: { broadcast, recipientBatches, schedules } }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/broadcast-delete', '/.netlify/functions/broadcast-delete'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const id = String(body.id || '').trim();
  if (!id) return json({error: 'id obrigatório'}, 400);

  let broadcastDeleted = false;
  let recipientBatches = 0;
  let schedulesDeleted = 0;

  try {
    const broadcastsStore = getStore({name: 'broadcasts', consistency: 'strong'});
    const existed = await broadcastsStore.get(id, {type: 'json'});
    if (existed) {
      await broadcastsStore.delete(id);
      broadcastDeleted = true;
    }
  } catch (err) {
    return json({error: 'Falha ao apagar broadcast: ' + err.message}, 500);
  }

  // Lotes de destinatarios: chave eh `${id}__${offset}`
  try {
    const recipientsStore = getStore({name: 'broadcast-recipients', consistency: 'strong'});
    const list = await recipientsStore.list({prefix: `${id}__`});
    const keys = (list.blobs || []).map((b) => b.key);
    const CONC = 10;
    for (let i = 0; i < keys.length; i += CONC) {
      const batch = keys.slice(i, i + CONC);
      await Promise.allSettled(batch.map((k) => recipientsStore.delete(k)));
      recipientBatches += batch.length;
    }
  } catch (err) {
    console.error('[broadcast-delete] recipients failed:', err.message);
  }

  // Agendamentos pendentes desse broadcast (pode haver mais de um se foi
  // re-agendado). Filtra por broadcastId.
  try {
    const scheduleStore = getStore({name: 'broadcast-schedules', consistency: 'strong'});
    const list = await scheduleStore.list();
    const keys = (list.blobs || []).map((b) => b.key);
    for (const k of keys) {
      try {
        const s = await scheduleStore.get(k, {type: 'json'});
        if (s && (s.broadcastId === id || s.id === id)) {
          await scheduleStore.delete(k);
          schedulesDeleted++;
        }
      } catch {}
    }
  } catch (err) {
    console.error('[broadcast-delete] schedules failed:', err.message);
  }

  if (!broadcastDeleted && recipientBatches === 0 && schedulesDeleted === 0) {
    return json({error: 'Nada encontrado pra apagar com esse id'}, 404);
  }

  return json({
    ok: true,
    deleted: {
      broadcast: broadcastDeleted,
      recipientBatches,
      schedules: schedulesDeleted,
    },
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
