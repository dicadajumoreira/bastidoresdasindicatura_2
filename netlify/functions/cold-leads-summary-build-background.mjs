// Netlify Function v2 (BACKGROUND, 15min) · POST /api/cold-leads-summary-build-background
// Constrói o índice resumo dos leads frios pra broadcast usar.
// Lê TODOS os registros da store cold-leads, extrai email/nome/unsubscribed/
// frequencia, e salva como UM ÚNICO blob na store cold-leads-summary.
//
// Lendo esse blob, o broadcast monta os destinatários frios em
// milissegundos em vez de 30+ segundos.
//
// Rodando como -background = limite de 15min, suficiente pra ~50k leads.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: [
    '/api/cold-leads-summary-build-background',
    '/.netlify/functions/cold-leads-summary-build-background',
  ],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return new Response('Não autorizado', {status: 401});

  const coldStore = getStore({name: 'cold-leads', consistency: 'strong'});
  const summaryStore = getStore({name: 'cold-leads-summary', consistency: 'strong'});

  // Marca status 'building' pra UI saber
  await summaryStore.setJSON('status', {
    state: 'building',
    startedAt: new Date().toISOString(),
    progress: 0,
    total: 0,
  });

  try {
    const list = await coldStore.list();
    const recordKeys = (list.blobs || []).map((b) => b.key).filter((k) =>
      k.startsWith('lead:') || k.startsWith('cold:e:') || k.startsWith('cold:p:')
    );

    await summaryStore.setJSON('status', {
      state: 'building',
      startedAt: new Date().toISOString(),
      progress: 0,
      total: recordKeys.length,
    });

    const entries = [];
    const CONC = 30;
    let scanned = 0;
    for (let i = 0; i < recordKeys.length; i += CONC) {
      const batch = recordKeys.slice(i, i + CONC);
      const results = await Promise.allSettled(batch.map((k) => coldStore.get(k, {type: 'json'})));
      for (const r of results) {
        scanned++;
        if (r.status !== 'fulfilled' || !r.value) continue;
        const lead = r.value;
        const emailsArr = lead.emails && lead.emails.length
          ? lead.emails
          : (lead.email ? [lead.email] : []);
        for (const e of emailsArr) {
          const email = String(e || '').trim().toLowerCase();
          if (!email || !email.includes('@')) continue;
          entries.push({
            email,
            nome: lead.nome || '',
            // Inativo se descadastrou via /sair OU se foi marcado inativo no admin
            unsubscribed: !!lead.unsubscribed || lead.ativo === false,
            frequencia: lead.frequencia || 'normal',
            status: lead.emailStatus || null,
            // null/ausente = nunca recebeu disparo. Usado pelo filtro
            // "onlyNeverReceived" no broadcast pra mandar so pros novos.
            firstBroadcastAt: lead.firstBroadcastAt || null,
          });
        }
      }
      // Atualiza progresso a cada lote
      if (i % (CONC * 10) === 0) {
        try {
          await summaryStore.setJSON('status', {
            state: 'building',
            progress: scanned,
            total: recordKeys.length,
          });
        } catch {}
      }
    }

    // Dedupe por email — se um email aparecer em vários leads (raro), prefere
    // o registro NÃO descadastrado e o nome preenchido. Tambem mantem a
    // MAIS ANTIGA firstBroadcastAt (basta UMA aplicacao ter recebido pra
    // pessoa contar como "ja recebeu").
    const byEmail = new Map();
    for (const e of entries) {
      const existing = byEmail.get(e.email);
      if (!existing) { byEmail.set(e.email, e); continue; }
      // Se um dos dois é descadastrado, prefere o NÃO descadastrado
      if (existing.unsubscribed && !e.unsubscribed) byEmail.set(e.email, e);
      else if (!existing.unsubscribed && e.unsubscribed) { /* keep existing */ }
      else if (!existing.nome && e.nome) byEmail.set(e.email, {...existing, nome: e.nome});
      // Sempre preserva a primeira data de broadcast conhecida
      const merged = byEmail.get(e.email);
      const oldest = (existing.firstBroadcastAt && e.firstBroadcastAt)
        ? (existing.firstBroadcastAt < e.firstBroadcastAt ? existing.firstBroadcastAt : e.firstBroadcastAt)
        : (existing.firstBroadcastAt || e.firstBroadcastAt || null);
      if (merged.firstBroadcastAt !== oldest) {
        byEmail.set(e.email, {...merged, firstBroadcastAt: oldest});
      }
    }
    const deduped = [...byEmail.values()];

    await summaryStore.setJSON('summary', {
      builtAt: new Date().toISOString(),
      count: deduped.length,
      sourceRecords: recordKeys.length,
      entries: deduped,
    });
    await summaryStore.setJSON('status', {
      state: 'ready',
      builtAt: new Date().toISOString(),
      count: deduped.length,
      sourceRecords: recordKeys.length,
    });

    return new Response(JSON.stringify({ok: true, count: deduped.length}), {
      headers: {'Content-Type': 'application/json; charset=utf-8'},
    });
  } catch (err) {
    await summaryStore.setJSON('status', {
      state: 'error',
      error: err.message,
      failedAt: new Date().toISOString(),
    });
    return new Response(JSON.stringify({error: err.message}), {
      status: 500,
      headers: {'Content-Type': 'application/json; charset=utf-8'},
    });
  }
};
