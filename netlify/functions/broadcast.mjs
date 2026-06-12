// Netlify Function v2 · POST /api/broadcast
// Disparo de e-mail em massa, com PAGINAÇÃO. O frontend chama essa função
// repetidamente (offset/limit) até processar todos os destinatários, pra
// não exceder o tempo limite da serverless function.
//
// Body esperado:
// {
//   subject: string,
//   html: string,                     // pode usar {{nome}} e {{material}}
//   filter: {
//     excludeOrigens?: string[],
//     includeOrigens?: string[],
//     statuses?: string[],
//     states?: string[],
//   },
//   offset?: number,                  // padrão 0
//   limit?: number,                   // padrão 40 (cabe em ~6s)
//   broadcastId?: string,             // id da campanha (frontend gera no 1º call)
//   test?: { email: string },         // modo teste, manda só pra esse e-mail
// }
//
// Resposta:
// { ok: true, sent: N, failed: N, processed: N, total: N, hasMore: bool, nextOffset: N }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { buildLeads } from '../lib/leads-index.mjs';

export const config = {
  path: ['/api/broadcast', '/.netlify/functions/broadcast'],
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
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  if (!process.env.RESEND_API_KEY) {
    return json({error: 'RESEND_API_KEY não configurada no ambiente do Netlify'}, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const subject = String(body.subject || '').trim();
  const html = String(body.html || '');
  if (!subject) return json({error: 'O assunto é obrigatório'}, 400);
  if (!html) return json({error: 'O corpo do e-mail é obrigatório'}, 400);

  // ====== MODO TESTE ======
  if (body.test && body.test.email) {
    try {
      await sendOne({
        from: FROM,
        to: [body.test.email],
        subject: personalize(subject, {nome: 'Teste', material: 'o material'}),
        html: personalize(html, {nome: 'Teste', material: 'o material'}),
        reply_to: 'contato@dicadajumoreira.com.br',
      });
      return json({ok: true, sent: 1, failed: 0, total: 1, test: true});
    } catch (e) {
      return json({error: e.message, ok: false, sent: 0, failed: 1, total: 1, test: true}, 500);
    }
  }

  // ====== MODO REAL (paginado) ======
  const offset = Math.max(0, parseInt(body.offset || 0, 10) || 0);
  const limit = Math.max(1, Math.min(60, parseInt(body.limit || 40, 10) || 40));
  const broadcastId = String(body.broadcastId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    // Tenta carregar TODOS os leads (refresca o índice se truncado).
    // Em offsets > 0 confiamos no índice já populado: budget pequeno.
    let leads;
    let totalLeadsInStore;
    let attempts = 0;
    const maxAttempts = offset === 0 ? 4 : 1;
    while (attempts < maxAttempts) {
      attempts++;
      const r = await buildLeads(store, {budgetMs: 5000});
      leads = r.leads;
      totalLeadsInStore = r.total;
      if (!r.truncated && leads.length >= totalLeadsInStore) break;
      // Se truncou, espera um pouquinho e tenta de novo pra index ficar mais cheio
      await new Promise((res) => setTimeout(res, 250));
    }
    if (offset === 0 && leads.length < totalLeadsInStore * 0.95) {
      // No primeiro call, se ainda falta carregar muita coisa, falha cedo
      return json({
        error: `Base de leads ainda não foi totalmente carregada (${leads.length} de ${totalLeadsInStore}). Aguarde alguns segundos e tente de novo (o índice está sendo construído em background).`,
        leadsLoaded: leads.length,
        totalInStore: totalLeadsInStore,
      }, 503);
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

    const filter = body.filter || {};
    const excludeOrigens = new Set(filter.excludeOrigens || []);
    const includeOrigens = filter.includeOrigens && filter.includeOrigens.length
      ? new Set(filter.includeOrigens) : null;
    const statuses = filter.statuses && filter.statuses.length
      ? new Set(filter.statuses) : null;
    const states = filter.states && filter.states.length
      ? new Set(filter.states) : null;

    const allTargets = [];
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

      allTargets.push({email, rep, origens: [...entry.origens]});
    }

    // Ordem estável: por email (lexicográfica) pra paginação consistente entre calls
    allTargets.sort((a, b) => a.email.localeCompare(b.email));

    const total = allTargets.length;
    const slice = allTargets.slice(offset, offset + limit);
    const processed = slice.length;

    // Resend tem rate limit de 5 req/s. Disparamos em lotes de 4 em paralelo
    // (deixando margem) e aguardamos 1100ms entre lotes pra ficar abaixo do
    // limite. Pra 40 emails: ~10 lotes × 1.1s = ~11s por chamada, dentro do
    // budget da Netlify Function.
    const RATE_BATCH = 4;
    const RATE_DELAY_MS = 1100;
    let sent = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < slice.length; i += RATE_BATCH) {
      const batch = slice.slice(i, i + RATE_BATCH);
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
      for (const r of results) {
        if (r.status === 'fulfilled') sent++;
        else { failed++; if (errors.length < 5) errors.push(String(r.reason?.message || 'erro').slice(0, 200)); }
      }
      // Espera antes do próximo lote (exceto se for o último)
      if (i + RATE_BATCH < slice.length) {
        await new Promise((res) => setTimeout(res, RATE_DELAY_MS));
      }
    }

    const nextOffset = offset + processed;
    const hasMore = nextOffset < total;

    // Atualiza histórico cumulativamente (best-effort)
    try {
      const histStore = getStore({name: 'broadcasts', consistency: 'strong'});
      let existing = null;
      try { existing = await histStore.get(broadcastId, {type: 'json'}); } catch {}
      const filterSummary = [];
      if (excludeOrigens.size) filterSummary.push(`excluir ${[...excludeOrigens].join(', ')}`);
      if (includeOrigens) filterSummary.push(`incluir ${[...includeOrigens].join(', ')}`);
      if (statuses) filterSummary.push(`status ${[...statuses].join(', ')}`);
      if (states) filterSummary.push(`UF ${[...states].join(', ')}`);
      await histStore.setJSON(broadcastId, {
        id: broadcastId,
        sentAt: existing?.sentAt || new Date().toISOString(),
        subject,
        html,
        sent: (existing?.sent || 0) + sent,
        failed: (existing?.failed || 0) + failed,
        total,
        filter: {
          excludeOrigens: [...excludeOrigens],
          includeOrigens: includeOrigens ? [...includeOrigens] : null,
          statuses: statuses ? [...statuses] : null,
          states: states ? [...states] : null,
        },
        filterSummary: filterSummary.join(' · ') || 'todos os leads',
        completed: !hasMore,
        lastBatchAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[broadcast] failed to save history:', e.message);
    }

    return json({
      ok: true,
      sent,
      failed,
      processed,
      total,
      offset,
      nextOffset,
      hasMore,
      broadcastId,
      errors,
    });

  } catch (err) {
    return json({error: 'Falha no disparo: ' + (err && err.message || 'erro desconhecido')}, 500);
  }
};

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
