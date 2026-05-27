// Lógica do índice de leads. Vive FORA de netlify/functions/ (como auth-token.mjs)
// pra poder ser importada pela function sem quebrar o bundling, e testada
// isoladamente com um store simulado.
//
// Em vez de reler centenas de blobs (1 por lead) a cada chamada — o que
// estourava o timeout / batia no rate-limit do Netlify Blobs — mantemos um
// blob de índice e relemos do banco SÓ o que mudou (detectado por etag do
// store.list()). É um cache derivado: não altera os blobs por lead.

export const INDEX_KEY = '__leads_index__';
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_BUDGET_MS = 8000;

async function refreshStale(store, stale, entries, concurrency, deadline) {
  let cursor = 0;
  let truncated = false;
  const worker = async () => {
    while (cursor < stale.length) {
      if (Date.now() > deadline) { truncated = true; return; }
      const {key, etag} = stale[cursor++];
      try {
        const lead = await store.get(key, {type: 'json'});
        if (lead) entries[key] = {etag, lead};
      } catch { /* deixa pra próxima carga */ }
    }
  };
  await Promise.all(
    Array.from({length: Math.min(concurrency, stale.length)}, worker)
  );
  return truncated;
}

export async function buildLeads(store, opts = {}) {
  const concurrency = opts.concurrency || DEFAULT_CONCURRENCY;
  const budgetMs = opts.budgetMs || DEFAULT_BUDGET_MS;

  // 1) Índice persistido: { entries: { key: {etag, lead} } }
  let entries = {};
  try {
    const idx = await store.get(INDEX_KEY, {type: 'json'});
    if (idx && idx.entries) entries = idx.entries;
  } catch { /* índice ainda não existe */ }

  // 2) Chaves atuais (metadados + etag), exceto o próprio índice.
  const { blobs } = await store.list();
  const current = blobs.filter((b) => b.key !== INDEX_KEY);
  const currentKeys = new Set(current.map((b) => b.key));

  // 3) Tira do índice o que não existe mais (hard-delete).
  for (const k of Object.keys(entries)) {
    if (!currentKeys.has(k)) delete entries[k];
  }

  // 4) Relê só novos/alterados (etag diferente).
  const stale = current.filter((b) => !entries[b.key] || entries[b.key].etag !== b.etag);
  const truncated = await refreshStale(store, stale, entries, concurrency, Date.now() + budgetMs);

  // 5) Salva o índice (best-effort).
  try { await store.setJSON(INDEX_KEY, {updatedAt: Date.now(), entries}); } catch {}

  const leads = Object.values(entries)
    .map((e) => e.lead)
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {leads, total: current.length, truncated};
}
