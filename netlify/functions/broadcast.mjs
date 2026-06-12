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
import { makeUnsubscribeUrl } from '../lib/email-resend.mjs';

export const config = {
  path: ['/api/broadcast', '/.netlify/functions/broadcast'],
};

const FROM = 'Bastidores da Sindicatura <contato@dicadajumoreira.com.br>';

// Bloco de rodapé com redes sociais + descadastro. Anexado a TODO disparo.
// {{unsubscribe_url}} é substituído por uma URL única por destinatário.
const BROADCAST_FOOTER = `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
  <tr><td align="center" style="padding:0 16px 32px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
      <tr><td style="padding:14px 40px 8px;background:#F7F5F2;border-top:1px solid #E8E2D8;text-align:center">
        <p style="margin:0;font-size:12px;line-height:1.7;color:#8a8881">
          <a href="https://instagram.com/dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">Instagram @dicadajumoreira</a>
          &nbsp;·&nbsp;
          <a href="https://linkedin.com/in/dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">LinkedIn @dicadajumoreira</a>
          &nbsp;·&nbsp;
          <a href="https://youtube.com/@dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">YouTube @dicadajumoreira</a>
        </p>
      </td></tr>
      <tr><td style="padding:14px 40px 18px;background:#FBF8F2;border-top:1px solid #E8E2D8;text-align:center">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8881">
          Não quer mais receber? <a href="{{unsubscribe_url}}" style="color:#B89579">Descadastre ou reduza a frequência</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

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

  // ====== MODO REENVIO DE FALHAS ======
  // Quando body.resendFailedFrom é setado, ignoramos subject/html/filter
  // e mandamos o MESMO conteúdo do disparo original APENAS pros e-mails
  // que falharam naquela campanha.
  const resendFailedFrom = body.resendFailedFrom ? String(body.resendFailedFrom) : null;

  let subject, html;
  if (resendFailedFrom) {
    try {
      const historyStore = getStore({name: 'broadcasts', consistency: 'strong'});
      const original = await historyStore.get(resendFailedFrom, {type: 'json'});
      if (!original) return json({error: 'Disparo original não encontrado pra reenvio'}, 404);
      subject = original.subject || '';
      html = original.html || '';
      if (!subject || !html) return json({error: 'Disparo original sem subject/html salvo'}, 500);
    } catch (err) {
      return json({error: 'Falha ao ler disparo original: ' + err.message}, 500);
    }
  } else {
    subject = String(body.subject || '').trim();
    html = String(body.html || '');
    if (!subject) return json({error: 'O assunto é obrigatório'}, 400);
    if (!html) return json({error: 'O corpo do e-mail é obrigatório'}, 400);
  }

  // ====== MODO TESTE ======
  if (body.test && body.test.email) {
    try {
      const unsubUrl = makeUnsubscribeUrl(body.test.email, 'broadcast') || '';
      await sendOne({
        from: FROM,
        to: [body.test.email],
        subject: personalize(subject, {nome: 'Teste', material: 'o material'}),
        html: personalize(html + BROADCAST_FOOTER, {nome: 'Teste', material: 'o material'})
          .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl),
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
    let allTargets;
    // Estes vars são populados no modo NORMAL e usados depois pra salvar
    // histórico. No modo REENVIO ficam vazios (já que o reenvio não usa filtros).
    let excludeOrigens = new Set();
    let includeOrigens = null;
    let statuses = null;
    let states = null;

    if (resendFailedFrom) {
      // ====== Modo REENVIO ======
      // Targets são os e-mails que falharam no broadcast original.
      // Lê do store broadcast-recipients com prefix do broadcastId original.
      const recipientsStore = getStore({name: 'broadcast-recipients', consistency: 'strong'});
      const list = await recipientsStore.list({prefix: `${resendFailedFrom}__`});
      const failed = [];
      const seenEmails = new Set(); // dedupe (pode haver tentativas múltiplas)
      const keys = (list.blobs || []).map((b) => b.key);
      for (const k of keys) {
        try {
          const part = await recipientsStore.get(k, {type: 'json'});
          if (Array.isArray(part)) {
            for (const r of part) {
              if (r.status === 'failed' && r.email && !seenEmails.has(r.email)) {
                seenEmails.add(r.email);
                failed.push(r);
              }
            }
          }
        } catch {}
      }
      // Converte pra formato de target que o resto da função espera
      allTargets = failed.map((r) => ({
        email: r.email,
        rep: {nome: r.nome || '', email: r.email},
        origens: ['mentoria'], // origem não importa no reenvio
      }));
      allTargets.sort((a, b) => a.email.localeCompare(b.email));
    } else {
      // ====== Modo NORMAL ======
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
        await new Promise((res) => setTimeout(res, 250));
      }
      if (offset === 0 && leads.length < totalLeadsInStore * 0.95) {
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
      excludeOrigens = new Set(filter.excludeOrigens || []);
      includeOrigens = filter.includeOrigens && filter.includeOrigens.length
        ? new Set(filter.includeOrigens) : null;
      statuses = filter.statuses && filter.statuses.length
        ? new Set(filter.statuses) : null;
      states = filter.states && filter.states.length
        ? new Set(filter.states) : null;

      allTargets = [];
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

      // ====== LEADS FRIOS (opcional) ======
      // Quando filter.includeCold === true, agrega leads frios da store
      // 'cold-leads'. Pula descadastrados; respeita frequência reduzida
      // (1 a cada 4 disparos — heurística simples: skipa quando o
      // broadcastId hashado mod 4 != 0 pra cada lead).
      if (body.filter && body.filter.includeCold) {
        try {
          const coldStore = getStore({name: 'cold-leads', consistency: 'strong'});
          const list = await coldStore.list();
          const seenEmails = new Set(allTargets.map((t) => t.email));
          // Hash determinístico do broadcastId pra rolar a frequência menor
          const hashSeed = [...broadcastId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
          for (const b of (list.blobs || [])) {
            if (!b.key.startsWith('lead:')) continue;
            try {
              const lead = await coldStore.get(b.key, {type: 'json'});
              if (!lead) continue;
              if (lead.unsubscribed) continue;
              const emails = lead.emails && lead.emails.length ? lead.emails : (lead.email ? [lead.email] : []);
              for (const em of emails) {
                const email = String(em || '').trim().toLowerCase();
                if (!email || !email.includes('@')) continue;
                if (seenEmails.has(email)) continue;
                // Frequência menor: pula 3 a cada 4 disparos
                if (lead.frequencia === 'menor') {
                  const emHash = [...email].reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, hashSeed);
                  if (emHash % 4 !== 0) continue;
                }
                seenEmails.add(email);
                allTargets.push({email, rep: {nome: lead.nome || '', email}, origens: ['cold']});
              }
            } catch {}
          }
        } catch (e) {
          console.error('[broadcast] cold leads load failed:', e.message);
        }
      }

      // Ordem estável: por email pra paginação consistente entre calls
      allTargets.sort((a, b) => a.email.localeCompare(b.email));
    }

    const total = allTargets.length;
    const slice = allTargets.slice(offset, offset + limit);
    const processed = slice.length;

    // Resend rate limit: 5 req/s. Pra ficar SEM RAJADA (causa de 429
    // mesmo respeitando a média), enviamos sequencialmente, 1 e-mail por
    // vez, com 250ms entre cada = ~4 req/s constantes.
    const RATE_DELAY_MS = 250;
    let sent = 0, failed = 0;
    const errors = [];
    const recipientsLog = [];

    for (let i = 0; i < slice.length; i++) {
      const t = slice[i];
      const sentAt = new Date().toISOString();
      const firstName = String(t.rep.nome || '').trim().split(/\s+/)[0] || '';
      const primaryOrigem = t.origens[0];
      const vars = {
        nome: firstName || 'aí',
        material: MATERIAL_NAMES[primaryOrigem] || 'o material',
      };
      const unsubUrl = makeUnsubscribeUrl(t.email, 'broadcast') || '';
      const personalizedHtml = personalize(html + BROADCAST_FOOTER, vars)
        .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl);
      try {
        await sendOne({
          from: FROM,
          to: [t.email],
          subject: personalize(subject, vars),
          html: personalizedHtml,
          reply_to: 'contato@dicadajumoreira.com.br',
        });
        sent++;
        recipientsLog.push({email: t.email, nome: t.rep.nome || '', status: 'sent', sentAt});
      } catch (e) {
        failed++;
        const errMsg = String(e.message || 'erro').slice(0, 200);
        if (errors.length < 5) errors.push(errMsg);
        recipientsLog.push({email: t.email, nome: t.rep.nome || '', status: 'failed', sentAt, error: errMsg});
      }
      // Pausa entre envios (exceto o último)
      if (i < slice.length - 1) {
        await new Promise((res) => setTimeout(res, RATE_DELAY_MS));
      }
    }

    // Salva log detalhado de destinatários desta chamada
    try {
      const recipientsStore = getStore({name: 'broadcast-recipients', consistency: 'strong'});
      await recipientsStore.setJSON(`${broadcastId}__${String(offset).padStart(7, '0')}`, recipientsLog);
    } catch (e) {
      console.error('[broadcast] failed to save recipients log:', e.message);
    }

    const nextOffset = offset + processed;
    const hasMore = nextOffset < total;

    // Atualiza histórico cumulativamente (best-effort)
    try {
      const histStore = getStore({name: 'broadcasts', consistency: 'strong'});
      let existing = null;
      try { existing = await histStore.get(broadcastId, {type: 'json'}); } catch {}
      const filterSummary = [];
      if (resendFailedFrom) {
        filterSummary.push(`reenvio dos que falharam · origem ${resendFailedFrom}`);
      } else {
        if (excludeOrigens.size) filterSummary.push(`excluir ${[...excludeOrigens].join(', ')}`);
        if (includeOrigens) filterSummary.push(`incluir ${[...includeOrigens].join(', ')}`);
        if (statuses) filterSummary.push(`status ${[...statuses].join(', ')}`);
        if (states) filterSummary.push(`UF ${[...states].join(', ')}`);
      }
      await histStore.setJSON(broadcastId, {
        id: broadcastId,
        sentAt: existing?.sentAt || new Date().toISOString(),
        subject,
        html,
        sent: (existing?.sent || 0) + sent,
        failed: (existing?.failed || 0) + failed,
        total,
        filter: resendFailedFrom ? {resendFailedFrom} : {
          excludeOrigens: [...excludeOrigens],
          includeOrigens: includeOrigens ? [...includeOrigens] : null,
          statuses: statuses ? [...statuses] : null,
          states: states ? [...states] : null,
        },
        filterSummary: filterSummary.join(' · ') || 'todos os leads',
        completed: !hasMore,
        lastBatchAt: new Date().toISOString(),
        resendOf: resendFailedFrom || null,
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
