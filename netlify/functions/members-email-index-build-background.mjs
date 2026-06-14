// Netlify Function v2 (BACKGROUND, 15min) ·
// POST /api/members-email-index-build-background
//
// Constrói um índice email → {id, nome, ativo, unsubscribed} dos leads
// quentes e salva em UM blob único na store 'members-email-index'.
// Os endpoints da área de membros leem esse blob (1 read) em vez de
// escanear ~6500 leads (que estoura o timeout de 10s).

import { getStore } from '@netlify/blobs';

export const config = {
  path: [
    '/api/members-email-index-build-background',
    '/.netlify/functions/members-email-index-build-background',
  ],
};

export default async (req) => {
  const leads = getStore({name: 'leads', consistency: 'strong'});
  const indexStore = getStore({name: 'members-email-index', consistency: 'strong'});

  try {
    await indexStore.setJSON('status', {state: 'building', startedAt: new Date().toISOString()});

    const list = await leads.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');

    const byEmail = {};
    const CONC = 40;
    let scanned = 0;

    for (let i = 0; i < keys.length; i += CONC) {
      const batch = keys.slice(i, i + CONC);
      const results = await Promise.allSettled(batch.map((k) => leads.get(k, {type: 'json'})));
      for (const r of results) {
        scanned++;
        if (r.status !== 'fulfilled' || !r.value) continue;
        const v = r.value;
        if (v.deletedAt) continue;
        const email = String(v.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        // Prefere o cadastro ATIVO mais recente quando existem múltiplos
        // cadastros do mesmo e-mail (várias origens)
        const existing = byEmail[email];
        const isActive = !(v.unsubscribed || v.ativo === false);
        const existingActive = existing && !(existing.unsubscribed || existing.ativo === false);
        if (!existing) {
          byEmail[email] = {id: v.id, nome: v.nome || '', unsubscribed: !!v.unsubscribed, ativo: v.ativo !== false, createdAt: v.createdAt};
        } else if (isActive && !existingActive) {
          // Substitui registro inativo por ativo
          byEmail[email] = {id: v.id, nome: v.nome || '', unsubscribed: !!v.unsubscribed, ativo: v.ativo !== false, createdAt: v.createdAt};
        } else if (isActive === existingActive && v.createdAt && (!existing.createdAt || v.createdAt > existing.createdAt)) {
          // Empate em estado: pega o mais recente
          byEmail[email] = {id: v.id, nome: v.nome || existing.nome, unsubscribed: !!v.unsubscribed, ativo: v.ativo !== false, createdAt: v.createdAt};
        }
      }
      if (i % (CONC * 8) === 0) {
        try {
          await indexStore.setJSON('status', {
            state: 'building', progress: scanned, total: keys.length,
          });
        } catch {}
      }
    }

    await indexStore.setJSON('index', {
      builtAt: new Date().toISOString(),
      count: Object.keys(byEmail).length,
      sourceRecords: keys.length,
      byEmail,
    });
    await indexStore.setJSON('status', {
      state: 'ready',
      builtAt: new Date().toISOString(),
      count: Object.keys(byEmail).length,
      sourceRecords: keys.length,
    });

    return new Response(JSON.stringify({ok: true, count: Object.keys(byEmail).length}), {
      headers: {'Content-Type': 'application/json'},
    });
  } catch (err) {
    try {
      await indexStore.setJSON('status', {state: 'error', error: err.message, failedAt: new Date().toISOString()});
    } catch {}
    return new Response(JSON.stringify({error: err.message}), {
      status: 500, headers: {'Content-Type': 'application/json'},
    });
  }
};
