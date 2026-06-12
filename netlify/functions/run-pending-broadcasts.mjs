// Netlify Function v2 · POST /api/run-pending-broadcasts
// Aciona MANUALMENTE o processamento dos disparos pendentes.
// É um plano B caso o cron não rode. Mesma lógica do
// process-scheduled-broadcasts-background, só que disparada por HTTP
// autenticado pelo admin.
//
// Body opcional: { id } pra rodar só 1 agendamento específico.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { buildLeads } from '../lib/leads-index.mjs';
import { withBroadcastFooter } from '../lib/broadcast-footer.mjs';

export const config = {
  path: ['/api/run-pending-broadcasts', '/.netlify/functions/run-pending-broadcasts'],
};

const FROM = 'Bastidores da Sindicatura <contato@dicadajumoreira.com.br>';

const MATERIAL_NAMES = {
  'mentoria': 'a Mentoria',
  'checklist': 'o Checklist de Assembleia',
  'ebook-ia': 'o E-book de IA',
  'sindico-profissional': 'o E-book do Síndico Profissional',
  'sobrevivencia-whatsapp': 'o Manual do WhatsApp',
  '50-frases': 'o Guia das 50 Frases',
  'nr1': 'o Guia da NR-1',
  'conflitos': 'o Guia dos Conflitos',
  'saude-mental': 'o Guia de Saúde Mental',
  'gestao-sob-ataque': 'o Guia da Gestão sob Ataque',
  'bombeiro': 'o Guia do Bombeiro',
  'politico': 'o Guia do Político',
  'solitario': 'o Guia do Solitário',
  'burocrata': 'o Guia do Burocrata',
  'estrategista': 'o Guia do Estrategista',
  'sargento': 'o Guia do Sargento',
  'sorteio-mba': 'o Sorteio MBA IBMEC',
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  if (!process.env.RESEND_API_KEY) {
    return json({error: 'RESEND_API_KEY não configurada'}, 500);
  }

  let body = {};
  try { body = await req.json(); } catch {}

  const scheduleStore = getStore({name: 'broadcast-schedules', consistency: 'strong'});
  const leadsStore = getStore({name: 'leads', consistency: 'strong'});
  const historyStore = getStore({name: 'broadcasts', consistency: 'strong'});
  const recipientsStore = getStore({name: 'broadcast-recipients', consistency: 'strong'});

  // Lista pendentes
  let pending = [];
  try {
    if (body.id) {
      // Rodar agendamento específico
      const v = await scheduleStore.get(body.id, {type: 'json'});
      if (v && v.status === 'pending') pending.push(v);
    } else {
      const list = await scheduleStore.list();
      const keys = (list.blobs || []).map((b) => b.key);
      for (const k of keys) {
        try {
          const v = await scheduleStore.get(k, {type: 'json'});
          if (v && v.status === 'pending') pending.push(v);
        } catch {}
      }
      // Ordena por horário marcado, mais antigo primeiro
      pending.sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1));
    }
  } catch (err) {
    return json({error: 'Falha ao listar pendentes: ' + err.message}, 500);
  }

  if (pending.length === 0) {
    return json({ok: true, processed: 0, message: 'Nenhum disparo pendente encontrado.'});
  }

  const results = [];
  for (const schedule of pending) {
    try {
      // Re-checa status pra evitar concorrência com o cron
      const fresh = await scheduleStore.get(schedule.id, {type: 'json'});
      if (!fresh || fresh.status !== 'pending') {
        results.push({id: schedule.id, skipped: true, reason: `status=${fresh?.status}`});
        continue;
      }
      await scheduleStore.setJSON(schedule.id, {...schedule, status: 'processing', processingAt: new Date().toISOString()});
      const stats = await runBroadcast(schedule, leadsStore, historyStore, recipientsStore);
      await scheduleStore.setJSON(schedule.id, {...schedule, status: 'sent', sentAt: new Date().toISOString(), stats});
      results.push({id: schedule.id, ...stats});
    } catch (err) {
      await scheduleStore.setJSON(schedule.id, {...schedule, status: 'failed', error: err.message, failedAt: new Date().toISOString()});
      results.push({id: schedule.id, error: err.message});
    }
  }

  return json({ok: true, processed: pending.length, results});
};

async function runBroadcast(schedule, leadsStore, historyStore, recipientsStore) {
  const {subject, html, filter, id: broadcastId} = schedule;

  let leads, totalInStore;
  for (let i = 0; i < 6; i++) {
    const r = await buildLeads(leadsStore, {budgetMs: 8000});
    leads = r.leads;
    totalInStore = r.total;
    if (!r.truncated && leads.length >= totalInStore) break;
    await new Promise((res) => setTimeout(res, 300));
  }

  const byEmail = new Map();
  for (const l of leads) {
    if (l.deletedAt) continue;
    const email = String(l.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    if (!byEmail.has(email)) byEmail.set(email, {leads: [], origens: new Set()});
    const e = byEmail.get(email);
    e.leads.push(l);
    e.origens.add(l.origem || 'mentoria');
  }

  const excludeOrigens = new Set(filter?.excludeOrigens || []);
  const includeOrigens = filter?.includeOrigens && filter.includeOrigens.length
    ? new Set(filter.includeOrigens) : null;
  const statuses = filter?.statuses && filter.statuses.length
    ? new Set(filter.statuses) : null;
  const states = filter?.states && filter.states.length
    ? new Set(filter.states) : null;

  const targets = [];
  for (const [email, entry] of byEmail) {
    let excluded = false;
    for (const o of entry.origens) if (excludeOrigens.has(o)) { excluded = true; break; }
    if (excluded) continue;
    if (includeOrigens) {
      let any = false;
      for (const o of entry.origens) if (includeOrigens.has(o)) { any = true; break; }
      if (!any) continue;
    }
    const rep = entry.leads.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (statuses && !statuses.has(rep.status || 'novo')) continue;
    if (states && !states.has(rep.estado || '')) continue;
    targets.push({email, rep, origens: [...entry.origens]});
  }

  // Resend rate limit: 5 req/s. Envia SEQUENCIAL com 250ms entre cada = 4 req/s.
  const RATE_DELAY_MS = 250;
  const RECIPIENTS_BATCH_SAVE = 10;
  let sent = 0, failed = 0;
  const errors = [];
  let pendingLog = [];
  let batchSaveIndex = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const sentAt = new Date().toISOString();
    const firstName = String(t.rep.nome || '').trim().split(/\s+/)[0] || '';
    const primaryOrigem = t.origens[0];
    const vars = {
      nome: firstName || 'aí',
      material: MATERIAL_NAMES[primaryOrigem] || 'o material',
    };
    try {
      await sendOne({
        from: FROM,
        to: [t.email],
        subject: personalize(subject, vars),
        html: withBroadcastFooter(html, t.email, vars),
        reply_to: 'contato@dicadajumoreira.com.br',
      });
      sent++;
      pendingLog.push({email: t.email, nome: t.rep.nome || '', status: 'sent', sentAt});
    } catch (e) {
      failed++;
      const errMsg = String(e.message || 'erro').slice(0, 200);
      if (errors.length < 10) errors.push(errMsg);
      pendingLog.push({email: t.email, nome: t.rep.nome || '', status: 'failed', sentAt, error: errMsg});
    }
    if (pendingLog.length >= RECIPIENTS_BATCH_SAVE || i === targets.length - 1) {
      try {
        await recipientsStore.setJSON(`${broadcastId}__${String(batchSaveIndex).padStart(7, '0')}`, pendingLog);
        batchSaveIndex++;
        pendingLog = [];
      } catch (e) {}
    }
    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    }
  }

  try {
    await historyStore.setJSON(broadcastId, {
      id: broadcastId,
      sentAt: new Date().toISOString(),
      subject,
      html,
      sent,
      failed,
      total: targets.length,
      filter,
      filterSummary: schedule.filterSummary,
      completed: true,
      scheduled: true,
      scheduledFor: schedule.scheduledFor,
      triggeredBy: 'manual',
    });
  } catch (e) {}

  return {sent, failed, total: targets.length, errors};
}

async function sendOne(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${t.slice(0, 200)}`);
  }
}

function personalize(template, vars) {
  return String(template == null ? '' : template).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
