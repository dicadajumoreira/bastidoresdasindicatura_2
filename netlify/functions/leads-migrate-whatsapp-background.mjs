// Netlify Background Function v2 (15 min budget) ·
// POST /.netlify/functions/leads-migrate-whatsapp-background
//
// Migracao one-off: varre todos os leads (hot + cold) e normaliza o
// campo whatsapp pro formato E.164 com +55 (ex.: '+5511999999999').
// Preserva o valor original em `whatsapp_raw` se a normalizacao
// tiver mudado o dado, pra rastreabilidade.
//
// Idempotente: pula leads ja migrados (com whatsapp_migratedAt).
// Nao apaga dados invalidos — mantem o original.
//
// Trigger pelo admin (botao no painel de leads) ou via curl:
//   curl -X POST https://.../api/leads-migrate-whatsapp-background \
//     -H "Authorization: Bearer <token>"
//
// Progresso lido via GET /api/leads-migrate-whatsapp-status.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { toE164 } from '../lib/wa-phone.mjs';

export const config = {
  path: ['/api/leads-migrate-whatsapp-background', '/.netlify/functions/leads-migrate-whatsapp-background'],
};

const STATUS_STORE = 'migration-status';
const STATUS_KEY_PREFIX = 'whatsapp-e164';

async function migrateStore(storeName, statusStore) {
  const store = getStore({name: storeName, consistency: 'strong'});
  const status = {
    store: storeName,
    startedAt: new Date().toISOString(),
    finished: false,
    total: 0,
    processed: 0,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    alreadyMigrated: 0,
    errors: 0,
    lastKey: null,
  };
  const statusKey = `${STATUS_KEY_PREFIX}/${storeName}`;
  await statusStore.setJSON(statusKey, status);

  let list;
  try { list = await store.list(); }
  catch (err) {
    status.errors++;
    status.errorMessage = 'list-failed: ' + err.message;
    status.finished = true;
    status.finishedAt = new Date().toISOString();
    await statusStore.setJSON(statusKey, status);
    return status;
  }

  const keys = (list.blobs || []).map((b) => b.key);
  status.total = keys.length;
  await statusStore.setJSON(statusKey, status);

  const CONC = 10;
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    await Promise.allSettled(batch.map(async (k) => {
      try {
        const lead = await store.get(k, {type: 'json'});
        if (!lead || typeof lead !== 'object') { status.errors++; return; }

        // Ja migrado? Skip
        if (lead.whatsapp_migratedAt) { status.alreadyMigrated++; return; }

        // Le o campo whatsapp (ou fallback pra telefone/phone se cold-leads
        // usam nome de coluna diferente)
        const rawSource = lead.whatsapp || lead.telefone || lead.phone || lead.celular || '';
        const raw = String(rawSource).trim();
        if (!raw) { status.unchanged++; return; }

        const e164 = toE164(raw);
        if (!e164) {
          // Nao conseguiu normalizar. Mantem original, marca como invalido.
          status.invalid++;
          lead.whatsapp_invalid = true;
          lead.whatsapp_migratedAt = new Date().toISOString();
          await store.setJSON(k, lead);
          return;
        }

        const normalized = '+' + e164;
        if (normalized === raw) {
          // Ja estava no formato certo. Marca como migrado pra nao reprocessar.
          status.unchanged++;
          lead.whatsapp_migratedAt = new Date().toISOString();
          await store.setJSON(k, lead);
          return;
        }

        // Aplica normalizacao. Preserva original em whatsapp_raw.
        if (!lead.whatsapp_raw) lead.whatsapp_raw = raw;
        lead.whatsapp = normalized;
        lead.whatsapp_migratedAt = new Date().toISOString();
        await store.setJSON(k, lead);
        status.updated++;
      } catch (err) {
        status.errors++;
      } finally {
        status.processed++;
      }
    }));

    status.lastKey = batch[batch.length - 1];
    // Salva progresso a cada 500 leads
    if (status.processed % 500 === 0 || i + CONC >= keys.length) {
      try { await statusStore.setJSON(statusKey, status); } catch {}
    }
  }

  status.finished = true;
  status.finishedAt = new Date().toISOString();
  await statusStore.setJSON(statusKey, status);
  return status;
}

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) {
    return new Response('Não autorizado', {status: 401});
  }

  const body = await req.json().catch(() => ({}));
  const stores = Array.isArray(body.stores) && body.stores.length
    ? body.stores : ['leads', 'cold-leads'];

  const statusStore = getStore({name: STATUS_STORE, consistency: 'strong'});

  // Marca inicio global
  await statusStore.setJSON(`${STATUS_KEY_PREFIX}/overall`, {
    startedAt: new Date().toISOString(),
    stores,
    finished: false,
  });

  const results = {};
  for (const s of stores) {
    console.log(`[migrate-whatsapp] iniciando ${s}`);
    results[s] = await migrateStore(s, statusStore);
    console.log(`[migrate-whatsapp] ${s} concluido:`, {
      total: results[s].total,
      updated: results[s].updated,
      unchanged: results[s].unchanged,
      invalid: results[s].invalid,
      alreadyMigrated: results[s].alreadyMigrated,
      errors: results[s].errors,
    });
  }

  await statusStore.setJSON(`${STATUS_KEY_PREFIX}/overall`, {
    startedAt: results[stores[0]]?.startedAt,
    finishedAt: new Date().toISOString(),
    stores,
    finished: true,
    results,
  });

  return new Response(JSON.stringify({ok: true, results}), {
    status: 200,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
};
