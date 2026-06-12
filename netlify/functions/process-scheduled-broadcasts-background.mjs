// Netlify Scheduled Function (background) — processa disparos agendados.
// Roda a cada 5 minutos. Função "background" pode rodar até 15min, suficiente
// pra mandar centenas de e-mails respeitando o rate limit do Resend.
//
// Configurada em netlify.toml:
//   [[scheduled.functions]]
//     function = "process-scheduled-broadcasts-background"
//     schedule = "*/5 * * * *"

import { getStore } from '@netlify/blobs';
import { buildLeads } from '../lib/leads-index.mjs';

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

export default async () => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[scheduled-broadcasts] RESEND_API_KEY não setada, pulando');
    return new Response('skipped', {status: 200});
  }

  const scheduleStore = getStore({name: 'broadcast-schedules', consistency: 'strong'});
  const leadsStore = getStore({name: 'leads', consistency: 'strong'});
  const historyStore = getStore({name: 'broadcasts', consistency: 'strong'});

  let pending = [];
  try {
    const list = await scheduleStore.list();
    const keys = (list.blobs || []).map((b) => b.key);
    const now = Date.now();
    for (const k of keys) {
      try {
        const v = await scheduleStore.get(k, {type: 'json'});
        if (v && v.status === 'pending' && new Date(v.scheduledFor).getTime() <= now) {
          pending.push(v);
        }
      } catch {}
    }
  } catch (err) {
    console.error('[scheduled-broadcasts] failed to list:', err.message);
    return new Response('list-failed', {status: 500});
  }

  console.log(`[scheduled-broadcasts] ${pending.length} agendamento(s) prontos pra processar`);

  for (const schedule of pending) {
    try {
      // Marca como em processamento (idempotência)
      await scheduleStore.setJSON(schedule.id, {...schedule, status: 'processing', processingAt: new Date().toISOString()});
      await runBroadcast(schedule, leadsStore, historyStore);
      // Marca como concluído (mantém no store por algum tempo pra auditoria)
      await scheduleStore.setJSON(schedule.id, {...schedule, status: 'sent', sentAt: new Date().toISOString()});
    } catch (err) {
      console.error(`[scheduled-broadcasts] erro processando ${schedule.id}:`, err.message);
      try {
        await scheduleStore.setJSON(schedule.id, {...schedule, status: 'failed', error: err.message, failedAt: new Date().toISOString()});
      } catch {}
    }
  }

  return new Response(`processed ${pending.length}`, {status: 200});
};

async function runBroadcast(schedule, leadsStore, historyStore) {
  const {subject, html, filter, id: broadcastId} = schedule;

  // Carrega leads até completar (cron tem budget largo)
  let leads, totalInStore;
  for (let i = 0; i < 6; i++) {
    const r = await buildLeads(leadsStore, {budgetMs: 8000});
    leads = r.leads;
    totalInStore = r.total;
    if (!r.truncated && leads.length >= totalInStore) break;
    await new Promise((res) => setTimeout(res, 300));
  }

  // Dedupe por e-mail
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

  // Manda respeitando rate limit do Resend (5/s) com margem
  const RATE_BATCH = 4;
  const RATE_DELAY_MS = 1100;
  let sent = 0, failed = 0;
  const errors = [];
  const recipientsStore = (await import('@netlify/blobs')).getStore({name: 'broadcast-recipients', consistency: 'strong'});

  for (let i = 0; i < targets.length; i += RATE_BATCH) {
    const batch = targets.slice(i, i + RATE_BATCH);
    const sentAt = new Date().toISOString();
    const results = await Promise.allSettled(batch.map((t) => {
      const firstName = String(t.rep.nome || '').trim().split(/\s+/)[0] || '';
      const primaryOrigem = t.origens[0];
      const vars = {
        nome: firstName || 'aí',
        material: MATERIAL_NAMES[primaryOrigem] || 'o material',
      };
      return sendOne({
        from: FROM,
        to: [t.email],
        subject: personalize(subject, vars),
        html: personalize(html, vars),
        reply_to: 'contato@dicadajumoreira.com.br',
      });
    }));
    const recipientsLog = [];
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const t = batch[j];
      if (r.status === 'fulfilled') {
        sent++;
        recipientsLog.push({email: t.email, nome: t.rep.nome || '', status: 'sent', sentAt});
      } else {
        failed++;
        const errMsg = String(r.reason?.message || 'erro').slice(0, 200);
        if (errors.length < 10) errors.push(errMsg);
        recipientsLog.push({email: t.email, nome: t.rep.nome || '', status: 'failed', sentAt, error: errMsg});
      }
    }
    // Salva o log do lote
    try {
      await recipientsStore.setJSON(`${broadcastId}__${String(i).padStart(7, '0')}`, recipientsLog);
    } catch (e) {
      console.error('[scheduled-broadcasts] failed to save recipients log:', e.message);
    }
    if (i + RATE_BATCH < targets.length) {
      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    }
  }

  // Salva histórico
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
    });
  } catch (e) {
    console.error('[scheduled-broadcasts] failed to save history:', e.message);
  }

  console.log(`[scheduled-broadcasts] ${broadcastId}: ${sent} sent, ${failed} failed (de ${targets.length} targets)`);
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
