// Netlify Function v2 (BACKGROUND, 15min) ·
// POST /api/sync-unsubscribes-background
//
// Backfill: percorre o cache members-email-index e cold leads procurando
// entradas marcadas como unsubscribed:true (ou ativo:false). Pra cada
// email descadastrado, garante que TODOS os leads quentes com aquele
// email tambem estao com unsubscribed:true / ativo:false / unsubscribedAt
// preenchidos.
//
// Util pra rodar UMA VEZ depois do bugfix da propagacao sincrona: os
// descadastros antigos (anteriores ao fix) nao tiveram os blobs de leads
// quentes atualizados, entao o admin nao mostrava direito. Esse backfill
// resolve.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: [
    '/api/sync-unsubscribes-background',
    '/.netlify/functions/sync-unsubscribes-background',
  ],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return new Response('Não autorizado', {status: 401});

  const stats = {
    emailsDescadastrados: 0,
    leadsAtualizados: 0,
    leadsJaCorretos: 0,
    erros: [],
  };

  try {
    // 1) Junta TODOS os emails descadastrados conhecidos (cache + cold leads)
    const unsubEmails = new Set();

    try {
      const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
      const idx = await idxStore.get('index', {type: 'json'});
      if (idx && idx.byEmail) {
        for (const [email, entry] of Object.entries(idx.byEmail)) {
          if (entry.unsubscribed || entry.ativo === false) {
            unsubEmails.add(email);
          }
        }
      }
    } catch (e) {
      stats.erros.push('index: ' + e.message);
    }

    try {
      const coldStore = getStore({name: 'cold-leads', consistency: 'strong'});
      const list = await coldStore.list();
      const keys = (list.blobs || []).map((b) => b.key).filter((k) =>
        k.startsWith('lead:') || k.startsWith('cold:e:')
      );
      const CONC = 40;
      for (let i = 0; i < keys.length; i += CONC) {
        const batch = keys.slice(i, i + CONC);
        const got = await Promise.allSettled(batch.map((k) => coldStore.get(k, {type: 'json'})));
        for (const r of got) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          const v = r.value;
          if (!(v.unsubscribed || v.ativo === false)) continue;
          const emails = v.emails && v.emails.length ? v.emails : (v.email ? [v.email] : []);
          for (const em of emails) {
            const norm = String(em || '').trim().toLowerCase();
            if (norm) unsubEmails.add(norm);
          }
        }
      }
    } catch (e) {
      stats.erros.push('cold-scan: ' + e.message);
    }

    stats.emailsDescadastrados = unsubEmails.size;

    // 2) Pra cada email descadastrado, encontra leads quentes e atualiza
    const hotStore = getStore({name: 'leads', consistency: 'strong'});
    const hotList = await hotStore.list();
    const hotKeys = (hotList.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');

    const CONC = 40;
    const now = new Date().toISOString();
    for (let i = 0; i < hotKeys.length; i += CONC) {
      const batch = hotKeys.slice(i, i + CONC);
      const got = await Promise.allSettled(batch.map((k) => hotStore.get(k, {type: 'json'})));
      for (let j = 0; j < got.length; j++) {
        const r = got[j];
        if (r.status !== 'fulfilled' || !r.value) continue;
        const lead = r.value;
        const email = String(lead.email || '').trim().toLowerCase();
        if (!email || !unsubEmails.has(email)) continue;
        if (lead.unsubscribed && lead.ativo === false) {
          stats.leadsJaCorretos++;
          continue;
        }
        try {
          await hotStore.setJSON(batch[j], {
            ...lead,
            unsubscribed: true,
            ativo: false,
            unsubscribedAt: lead.unsubscribedAt || now,
            updatedAt: now,
          });
          stats.leadsAtualizados++;
        } catch (err) {
          if (stats.erros.length < 10) stats.erros.push(`${lead.id}: ${err.message}`);
        }
      }
    }

    return json({ok: true, ...stats});
  } catch (err) {
    return json({error: err.message, ...stats}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
