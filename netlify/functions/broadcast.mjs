// Netlify Function v2 · POST /api/broadcast
// Disparo de e-mail em massa pros leads cadastrados.
// Exige token Bearer válido (sessão do admin).
//
// Body esperado:
// {
//   subject: string,
//   html: string,                     // pode usar {{nome}} e {{material}}
//   filter: {
//     excludeOrigens?: string[],      // pessoa que tenha QUALQUER origem aqui é excluída
//     includeOrigens?: string[],      // se setado, precisa ter pelo menos uma
//     statuses?: string[],            // filtra por status do cadastro (rep)
//     states?: string[],              // filtra por UF do rep
//   },
//   test?: { email: string },         // se presente, manda só pra esse e-mail (modo teste)
// }
//
// Resposta:
// { ok: true, sent: N, failed: N, total: N, errors: string[] }
//
// Dedupe: agrupa por e-mail (lowercase). Cada e-mail único recebe 1 disparo.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { buildLeads } from '../lib/leads-index.mjs';

export const config = {
  path: ['/api/broadcast', '/.netlify/functions/broadcast'],
};

const FROM = 'Juliana Moreira <contato@dicadajumoreira.com.br>';

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

  // Auth
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
      });
      return json({ok: true, sent: 1, failed: 0, total: 1, test: true});
    } catch (e) {
      return json({error: e.message, ok: false, sent: 0, failed: 1, total: 1, test: true}, 500);
    }
  }

  // ====== MODO REAL ======
  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    const {leads} = await buildLeads(store, {budgetMs: 18000});

    // Dedupe por e-mail (lowercase, trim). Coleciona origens de TODOS os
    // cadastros daquele e-mail pra aplicar a regra de excluir corretamente.
    const byEmail = new Map();
    for (const l of leads) {
      if (l.deletedAt) continue; // ignora lixeira
      const email = String(l.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      if (!byEmail.has(email)) byEmail.set(email, {leads: [], origens: new Set()});
      const entry = byEmail.get(email);
      entry.leads.push(l);
      entry.origens.add(l.origem || 'mentoria');
    }

    const filter = body.filter || {};
    const excludeOrigens = new Set(filter.excludeOrigens || []);
    const includeOrigens = filter.includeOrigens && filter.includeOrigens.length
      ? new Set(filter.includeOrigens) : null;
    const statuses = filter.statuses && filter.statuses.length
      ? new Set(filter.statuses) : null;
    const states = filter.states && filter.states.length
      ? new Set(filter.states) : null;

    const targets = [];
    for (const [email, entry] of byEmail) {
      // Pula se qualquer origem da pessoa estiver na lista de exclusão
      let excluded = false;
      for (const o of entry.origens) if (excludeOrigens.has(o)) { excluded = true; break; }
      if (excluded) continue;

      // Se include configurado, precisa ter ao menos uma origem na lista
      if (includeOrigens) {
        let any = false;
        for (const o of entry.origens) if (includeOrigens.has(o)) { any = true; break; }
        if (!any) continue;
      }

      // Lead mais recente é o representante
      const rep = entry.leads.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (statuses && !statuses.has(rep.status || 'novo')) continue;
      if (states && !states.has(rep.estado || '')) continue;

      targets.push({
        email,
        rep,
        origens: [...entry.origens],
      });
    }

    // Dispara com concorrência limitada
    const CONCURRENCY = 20;
    let sent = 0, failed = 0;
    const errors = [];
    const startedAt = Date.now();
    const MAX_BUDGET_MS = 50000; // 50s budget (Netlify Pro permite mais; fica seguro)

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > MAX_BUDGET_MS) {
        return json({
          ok: false,
          partial: true,
          sent,
          failed,
          total: targets.length,
          processed: i,
          remaining: targets.length - i,
          errors,
          message: `Tempo limite atingido. Processei ${i} de ${targets.length}. Rode novamente pra continuar.`,
        });
      }
      const batch = targets.slice(i, i + CONCURRENCY);
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
        else { failed++; if (errors.length < 10) errors.push(String(r.reason?.message || 'erro').slice(0, 200)); }
      }
    }

    // Salva histórico do disparo (best-effort, não derruba a resposta)
    try {
      const histStore = getStore({name: 'broadcasts', consistency: 'strong'});
      const histId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filterSummary = [];
      if (excludeOrigens.size) filterSummary.push(`excluir ${[...excludeOrigens].join(', ')}`);
      if (includeOrigens) filterSummary.push(`incluir ${[...includeOrigens].join(', ')}`);
      if (statuses) filterSummary.push(`status ${[...statuses].join(', ')}`);
      if (states) filterSummary.push(`UF ${[...states].join(', ')}`);
      await histStore.setJSON(histId, {
        id: histId,
        sentAt: new Date().toISOString(),
        subject,
        html, // armazena pra reuso/cópia futura
        sent,
        failed,
        total: targets.length,
        filter: {
          excludeOrigens: [...excludeOrigens],
          includeOrigens: includeOrigens ? [...includeOrigens] : null,
          statuses: statuses ? [...statuses] : null,
          states: states ? [...states] : null,
        },
        filterSummary: filterSummary.join(' · ') || 'todos os leads',
      });
    } catch (e) {
      console.error('[broadcast] failed to save history:', e.message);
    }

    return json({ok: true, sent, failed, total: targets.length, errors});

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
