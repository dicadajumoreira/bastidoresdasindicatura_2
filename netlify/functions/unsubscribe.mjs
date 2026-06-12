// Netlify Function v2 · POST /api/unsubscribe
// Processa pedido de descadastro ou redução de frequência de uma pessoa
// a partir de um token assinado (gerado quando o e-mail foi enviado).
//
// Body: { token, action: 'unsubscribe' | 'reduce' }
// Resposta: { ok, action, email }

import { getStore } from '@netlify/blobs';
import { verify, sign } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/unsubscribe', '/.netlify/functions/unsubscribe'],
};

export default async (req) => {
  // Modo GET: ler o token e devolver as info pro front renderizar a página
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const token = url.searchParams.get('t');
    if (!token) return json({error: 'Token ausente'}, 400);
    const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
    const payload = verify(token, secret);
    if (!payload || !payload.email) return json({error: 'Link inválido ou expirado'}, 400);
    return json({ok: true, email: payload.email, type: payload.type || 'unknown'});
  }

  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }
  const token = String(body.token || '');
  const action = String(body.action || '');
  if (!token) return json({error: 'Token ausente'}, 400);
  if (!['unsubscribe', 'reduce'].includes(action)) return json({error: 'Ação inválida'}, 400);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const payload = verify(token, secret);
  if (!payload || !payload.email) return json({error: 'Link inválido ou expirado'}, 400);

  const email = String(payload.email).toLowerCase();
  const updates = [];

  // 1) Atualiza no cold-leads se existir
  try {
    const cold = getStore({name: 'cold-leads', consistency: 'strong'});
    // Procura por índice de e-mail
    const ptr = await safeGet(cold, `idxe:${email}`);
    if (ptr?.leadId) {
      const lead = await safeGet(cold, `lead:${ptr.leadId}`);
      if (lead) {
        const updated = {...lead};
        if (action === 'unsubscribe') updated.unsubscribed = true;
        else updated.frequencia = 'menor';
        updated.updatedAt = new Date().toISOString();
        await cold.setJSON(`lead:${ptr.leadId}`, updated);
        updates.push('cold');
      }
    } else {
      // Schema antigo
      const old = await safeGet(cold, `cold:e:${email}`);
      if (old) {
        const updated = {...old};
        if (action === 'unsubscribe') updated.unsubscribed = true;
        else updated.frequencia = 'menor';
        updated.updatedAt = new Date().toISOString();
        await cold.setJSON(`cold:e:${email}`, updated);
        updates.push('cold');
      }
    }
  } catch (e) {
    console.error('[unsubscribe] cold update failed:', e.message);
  }

  // 2) Atualiza nos leads quentes (todos os cadastros desse e-mail)
  try {
    const hot = getStore({name: 'leads', consistency: 'strong'});
    const list = await hot.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');
    let touched = 0;
    const BATCH = 10;
    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      const ops = await Promise.allSettled(batch.map(async (k) => {
        const v = await hot.get(k, {type: 'json'});
        if (!v) return false;
        if (String(v.email || '').toLowerCase() !== email) return false;
        const updated = {...v};
        if (action === 'unsubscribe') updated.unsubscribed = true;
        else updated.frequencia = 'menor';
        updated.unsubscribedAt = updated.unsubscribedAt || new Date().toISOString();
        await hot.setJSON(k, updated);
        return true;
      }));
      for (const op of ops) {
        if (op.status === 'fulfilled' && op.value === true) touched++;
      }
    }
    if (touched) updates.push(`hot:${touched}`);
  } catch (e) {
    console.error('[unsubscribe] hot update failed:', e.message);
  }

  return json({ok: true, action, email, updates});
};

async function safeGet(store, key) {
  try { return await store.get(key, {type: 'json'}); } catch { return null; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}

// ====== Helper exportado pra outros módulos gerarem o token ======
export function makeUnsubscribeToken(email, type = 'broadcast', secret) {
  const exp = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 ano
  return sign({email: String(email || '').toLowerCase(), type, exp}, secret);
}

export function unsubscribeUrl(email, type, secret, baseUrl) {
  const t = makeUnsubscribeToken(email, type, secret);
  return `${baseUrl || 'https://bastidoresdasindicatura.com.br'}/sair?t=${encodeURIComponent(t)}`;
}
