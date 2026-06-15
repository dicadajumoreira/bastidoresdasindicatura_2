// Netlify Function v2 · POST /api/mentoria-diag
// Diagnóstico: dado um e-mail, retorna o estado real do lead, do
// índice de membros e do que seria devolvido pra UI da Sala da Mentoria.
// Exige token Bearer do admin.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';

export const config = {
  path: ['/api/mentoria-diag', '/.netlify/functions/mentoria-diag'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return json({error: 'email obrigatório'}, 400);

  const result = {email, leads: [], cacheEntry: null, lookupResult: null, mentoriaConfigPresent: false};

  // 1) Scan completo das leads desse email (mostra TODAS as aplicações)
  try {
    const leadsStore = getStore({name: 'leads', consistency: 'strong'});
    const list = await leadsStore.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');
    const CONC = 60;
    for (let i = 0; i < keys.length; i += CONC) {
      const batch = keys.slice(i, i + CONC);
      const got = await Promise.allSettled(batch.map((k) => leadsStore.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const v = r.value;
        if (String(v.email || '').toLowerCase() !== email) continue;
        result.leads.push({
          id: v.id,
          nome: v.nome,
          origem: v.origem,
          mentoria: !!v.mentoria,
          mentoriaModalidade: v.mentoriaModalidade || null,
          mentoriaAt: v.mentoriaAt || null,
          ativo: v.ativo !== false,
          unsubscribed: !!v.unsubscribed,
          deletedAt: v.deletedAt || null,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt || null,
        });
      }
    }
  } catch (err) {
    result.leadsError = err.message;
  }

  // 2) Entry do índice
  try {
    const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
    const idx = await idxStore.get('index', {type: 'json'});
    if (idx && idx.byEmail) {
      result.cacheEntry = idx.byEmail[email] || null;
      result.cacheTotalEmails = Object.keys(idx.byEmail).length;
      result.cacheBuiltAt = idx.builtAt || null;
      result.cacheLastIncrementalAt = idx.lastIncrementalAt || null;
    } else {
      result.cacheEntry = null;
      result.cacheBuilt = false;
    }
  } catch (err) {
    result.cacheError = err.message;
  }

  // 3) O que findLeadByEmail (usado por membros-validate) devolve agora
  try {
    const lookup = await findLeadByEmail(email);
    result.lookupResult = lookup;
  } catch (err) {
    result.lookupError = err.message;
  }

  // 4) Config da mentoria
  try {
    const cfgStore = getStore({name: 'mentoria-config', consistency: 'strong'});
    const cfg = await cfgStore.get('config', {type: 'json'});
    result.mentoriaConfigPresent = !!cfg;
    if (cfg) {
      result.mentoriaConfigSummary = {
        teamsLink: cfg.teamsLink ? cfg.teamsLink.slice(0, 50) + '…' : null,
        horario: cfg.horario,
        aulasCount: Array.isArray(cfg.aulas) ? cfg.aulas.length : 0,
      };
    }
  } catch (err) {
    result.mentoriaConfigError = err.message;
  }

  return json(result);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
