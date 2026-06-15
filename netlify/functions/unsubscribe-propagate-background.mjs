// Netlify Function v2 (BACKGROUND, 15min) ·
// POST /api/unsubscribe-propagate-background
//
// Atualiza todos os leads quentes com um e-mail especifico (unsubscribe
// ou frequencia=menor). Disparada pelo /api/unsubscribe que retorna ok
// pro usuario antes de terminar — assim a UX nao espera 30s+ pra ver a
// confirmacao com bases grandes (~7k leads quentes).
//
// Body: { email, action: 'unsubscribe' | 'reduce' }

import { getStore } from '@netlify/blobs';

export const config = {
  path: [
    '/api/unsubscribe-propagate-background',
    '/.netlify/functions/unsubscribe-propagate-background',
  ],
};

export default async (req) => {
  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const action = String(body.action || '');
  if (!email || !['unsubscribe', 'reduce'].includes(action)) {
    return json({error: 'email + action obrigatorios'}, 400);
  }

  const hot = getStore({name: 'leads', consistency: 'strong'});
  let touched = 0;
  try {
    const list = await hot.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');
    const CONC = 60;
    for (let i = 0; i < keys.length; i += CONC) {
      const batch = keys.slice(i, i + CONC);
      const ops = await Promise.allSettled(batch.map(async (k) => {
        const v = await hot.get(k, {type: 'json'});
        if (!v) return false;
        if (String(v.email || '').toLowerCase() !== email) return false;
        const updated = {...v};
        if (action === 'unsubscribe') {
          updated.unsubscribed = true;
          updated.ativo = false;
          updated.unsubscribedAt = updated.unsubscribedAt || new Date().toISOString();
        } else {
          updated.frequencia = 'menor';
        }
        updated.updatedAt = new Date().toISOString();
        await hot.setJSON(k, updated);
        return true;
      }));
      for (const op of ops) {
        if (op.status === 'fulfilled' && op.value === true) touched++;
      }
    }
  } catch (err) {
    console.error('[unsubscribe-propagate] failed:', err.message);
    return json({error: err.message}, 500);
  }

  return json({ok: true, touched});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
