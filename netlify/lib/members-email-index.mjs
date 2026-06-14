// Lib compartilhada: consulta o índice de e-mails dos membros.
// O índice é construído por members-email-index-build-background.mjs
// e fica no blob 'members-email-index/index'.

import { getStore } from '@netlify/blobs';

// Retorna { lead: {id, nome, ...} | null, indexMissing: boolean }
// indexMissing=true significa que o índice não foi construído ainda
// (a função login/request deve disparar o build em background)
export async function findLeadByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return {lead: null, indexMissing: false};

  try {
    const indexStore = getStore({name: 'members-email-index', consistency: 'strong'});
    const index = await indexStore.get('index', {type: 'json'});
    if (!index || !index.byEmail) return {lead: null, indexMissing: true};
    const entry = index.byEmail[normalized];
    if (!entry) return {lead: null, indexMissing: false};
    // Respeita inativo/descadastrado: índice traz os dados, mas a
    // checagem é feita aqui pra centralizar a regra de elegibilidade.
    if (entry.unsubscribed || entry.ativo === false) {
      return {lead: null, indexMissing: false};
    }
    return {lead: entry, indexMissing: false};
  } catch (err) {
    console.error('[members-email-index] read failed:', err.message);
    return {lead: null, indexMissing: true};
  }
}
