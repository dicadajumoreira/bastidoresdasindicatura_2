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
        const base = {
          id: v.id,
          nome: v.nome || '',
          unsubscribed: !!v.unsubscribed,
          ativo: v.ativo !== false,
          createdAt: v.createdAt,
          perfil: v.perfil || null,
          perfil_nome: v.perfil_nome || null,
          mentoria: !!v.mentoria,
        };
        if (!existing) {
          byEmail[email] = base;
        } else if (isActive && !existingActive) {
          byEmail[email] = base;
          if (!base.perfil_nome && existing.perfil_nome) byEmail[email].perfil_nome = existing.perfil_nome;
          if (!base.perfil && existing.perfil) byEmail[email].perfil = existing.perfil;
          // Mentoria é OR: se qualquer entrada marca, o membro tem acesso
          byEmail[email].mentoria = base.mentoria || !!existing.mentoria;
        } else if (isActive === existingActive) {
          if (!existing.perfil_nome && base.perfil_nome) byEmail[email].perfil_nome = base.perfil_nome;
          if (!existing.perfil && base.perfil) byEmail[email].perfil = base.perfil;
          byEmail[email].mentoria = !!existing.mentoria || base.mentoria;
          if (v.createdAt && (!existing.createdAt || v.createdAt > existing.createdAt)) {
            byEmail[email] = {...base,
              perfil: existing.perfil || base.perfil,
              perfil_nome: existing.perfil_nome || base.perfil_nome,
              mentoria: !!existing.mentoria || base.mentoria,
              nome: v.nome || existing.nome,
            };
          }
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
