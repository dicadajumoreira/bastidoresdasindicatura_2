// Netlify Function v2 · POST e GET e DELETE /api/scheduled-broadcasts
// Gerencia agendamentos de disparo. Cron processa quando a hora chega.
//
// POST: cria um agendamento. Body: {subject, html, filter, scheduledFor (ISO)}
// GET: lista todos os agendamentos pendentes
// DELETE: cancela um agendamento. Query: id=...

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/scheduled-broadcasts', '/.netlify/functions/scheduled-broadcasts'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const store = getStore({name: 'broadcast-schedules', consistency: 'strong'});

  // ====== LISTAR ======
  if (req.method === 'GET') {
    try {
      const list = await store.list();
      const keys = (list.blobs || []).map((b) => b.key);
      const records = [];
      for (const k of keys) {
        try {
          const v = await store.get(k, {type: 'json'});
          if (v && v.status === 'pending') {
            records.push({
              id: v.id,
              scheduledFor: v.scheduledFor,
              subject: v.subject,
              filterSummary: v.filterSummary,
              createdAt: v.createdAt,
              targetCount: v.targetCount || null,
            });
          }
        } catch {}
      }
      records.sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1));
      return json({ok: true, scheduled: records});
    } catch (err) {
      return json({error: 'Falha ao ler agendamentos: ' + err.message}, 500);
    }
  }

  // ====== CRIAR ======
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

    const subject = String(body.subject || '').trim();
    const html = String(body.html || '');
    const scheduledFor = String(body.scheduledFor || '');
    if (!subject) return json({error: 'O assunto é obrigatório'}, 400);
    if (!html) return json({error: 'O corpo do e-mail é obrigatório'}, 400);
    if (!scheduledFor) return json({error: 'A data e hora do agendamento são obrigatórias'}, 400);

    // scheduledFor chega já em ISO UTC (o frontend converte de Brasília → UTC).
    const scheduledDate = new Date(scheduledFor);
    if (isNaN(scheduledDate.getTime())) return json({error: 'Data/hora inválida'}, 400);
    if (scheduledDate.getTime() < Date.now() - 60000) {
      const brasiliaTime = new Date(scheduledDate).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'});
      return json({error: `Não dá pra agendar pro passado (horário interpretado: ${brasiliaTime} BRT). Confira a data e hora.`}, 400);
    }

    const filter = body.filter || {};
    const excludeOrigens = filter.excludeOrigens || [];
    const includeOrigens = filter.includeOrigens || null;
    const statuses = filter.statuses || null;
    const states = filter.states || null;

    const filterSummary = [];
    if (excludeOrigens.length) filterSummary.push(`excluir ${excludeOrigens.join(', ')}`);
    if (includeOrigens) filterSummary.push(`incluir ${includeOrigens.join(', ')}`);
    if (statuses) filterSummary.push(`status ${statuses.join(', ')}`);
    if (states) filterSummary.push(`UF ${states.join(', ')}`);

    const id = `${scheduledDate.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id,
      status: 'pending',
      scheduledFor: scheduledDate.toISOString(),
      createdAt: new Date().toISOString(),
      subject,
      html,
      filter: {excludeOrigens, includeOrigens, statuses, states},
      filterSummary: filterSummary.join(' · ') || 'todos os leads',
      targetCount: body.targetCount || null, // dica do frontend pra exibir
    };

    try {
      await store.setJSON(id, record);
      return json({ok: true, id, scheduledFor: record.scheduledFor});
    } catch (err) {
      return json({error: 'Falha ao salvar agendamento: ' + err.message}, 500);
    }
  }

  // ====== CANCELAR ======
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return json({error: 'Falta o id do agendamento'}, 400);
    try {
      await store.delete(id);
      return json({ok: true});
    } catch (err) {
      return json({error: 'Falha ao cancelar: ' + err.message}, 500);
    }
  }

  return json({error: 'Method not allowed'}, 405);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
