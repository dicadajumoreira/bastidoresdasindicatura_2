// Netlify Function v2 (BACKGROUND, 15min) ·
// POST /api/cold-leads-mark-broadcast-background
//
// Disparada pelo broadcast.mjs depois de cada batch enviado. Atualiza
// os registros dos COLD LEADS com:
//   - firstBroadcastAt / lastBroadcastAt / broadcastsReceived (sent)
//   - emailStatus: "Can't send" / bounceCount / lastBounceAt (failed)
//
// Body: { recipientsLog: [{email, status: 'sent'|'failed', sentAt, error?}, ...] }
//
// Roda em background pra nao atrasar o disparo. Best-effort: se falhar,
// o disparo ja foi feito e a UI mostra o log. Sem retry.

import { getStore } from '@netlify/blobs';

export const config = {
  path: [
    '/api/cold-leads-mark-broadcast-background',
    '/.netlify/functions/cold-leads-mark-broadcast-background',
  ],
};

export default async (req) => {
  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const log = Array.isArray(body.recipientsLog) ? body.recipientsLog : [];
  if (log.length === 0) return json({ok: true, touched: 0});

  const cold = getStore({name: 'cold-leads', consistency: 'strong'});
  let touchedSent = 0;
  let touchedFailed = 0;
  const errors = [];

  // Processa entradas. Cada e-mail tem 2 caminhos possiveis no schema:
  //   - novo: idxe:{email} -> {leadId} -> lead:{leadId}
  //   - antigo: cold:e:{email}
  const CONC = 12;
  for (let i = 0; i < log.length; i += CONC) {
    const batch = log.slice(i, i + CONC);
    await Promise.allSettled(batch.map(async (entry) => {
      try {
        const email = String(entry.email || '').trim().toLowerCase();
        if (!email) return;

        // Tenta resolver leadId via indice novo
        let leadKey = null;
        try {
          const ptr = await cold.get(`idxe:${email}`, {type: 'json'});
          if (ptr && ptr.leadId) leadKey = `lead:${ptr.leadId}`;
        } catch {}
        // Fallback schema antigo
        if (!leadKey) {
          try {
            const old = await cold.get(`cold:e:${email}`, {type: 'json'});
            if (old) leadKey = `cold:e:${email}`;
          } catch {}
        }
        if (!leadKey) return; // nao eh cold lead (lead quente, ja tratado por sua logica)

        const lead = await cold.get(leadKey, {type: 'json'});
        if (!lead) return;

        const now = entry.sentAt || new Date().toISOString();
        const updated = {...lead, updatedAt: now};

        if (entry.status === 'sent') {
          if (!updated.firstBroadcastAt) updated.firstBroadcastAt = now;
          updated.lastBroadcastAt = now;
          updated.broadcastsReceived = (updated.broadcastsReceived || 0) + 1;
          touchedSent++;
        } else if (entry.status === 'failed') {
          // Marca como bounce — proxima broadcast vai pular automaticamente
          updated.emailStatus = "Can't send";
          updated.bounceCount = (updated.bounceCount || 0) + 1;
          updated.lastBounceAt = now;
          updated.lastBounceError = String(entry.error || '').slice(0, 240);
          // Bounce eh sinal forte de email morto: marca como inativo pro
          // disparador parar de tentar. O admin pode reverter manualmente.
          updated.ativo = false;
          updated.unsubscribed = updated.unsubscribed || false; // nao mexe
          touchedFailed++;
        } else {
          return;
        }

        await cold.setJSON(leadKey, updated);
      } catch (err) {
        if (errors.length < 10) errors.push(String(err.message || 'erro').slice(0, 200));
      }
    }));
  }

  return json({ok: true, touchedSent, touchedFailed, errors});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
