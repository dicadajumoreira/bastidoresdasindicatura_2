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
        if (action === 'unsubscribe') {
          updated.unsubscribed = true;
          updated.ativo = false;
          updated.unsubscribedAt = updated.unsubscribedAt || new Date().toISOString();
        } else {
          updated.frequencia = 'menor';
        }
        updated.updatedAt = new Date().toISOString();
        await cold.setJSON(`lead:${ptr.leadId}`, updated);
        updates.push('cold');
      }
    } else {
      // Schema antigo
      const old = await safeGet(cold, `cold:e:${email}`);
      if (old) {
        const updated = {...old};
        if (action === 'unsubscribe') {
          updated.unsubscribed = true;
          updated.ativo = false;
          updated.unsubscribedAt = updated.unsubscribedAt || new Date().toISOString();
        } else {
          updated.frequencia = 'menor';
        }
        updated.updatedAt = new Date().toISOString();
        await cold.setJSON(`cold:e:${email}`, updated);
        updates.push('cold');
      }
    }
  } catch (e) {
    console.error('[unsubscribe] cold update failed:', e.message);
  }

  // 2) Atualiza o cache members-email-index IMEDIATAMENTE (1 read+write).
  // Garante que /membros/ ja respeita o descadastro mesmo antes da
  // propagacao em background terminar de atualizar todos os blobs.
  try {
    const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
    const idx = await idxStore.get('index', {type: 'json'});
    if (idx && idx.byEmail && idx.byEmail[email]) {
      const entry = {...idx.byEmail[email]};
      if (action === 'unsubscribe') {
        entry.unsubscribed = true;
        entry.ativo = false;
      } else {
        entry.frequencia = 'menor';
      }
      idx.byEmail[email] = entry;
      idx.lastIncrementalAt = new Date().toISOString();
      await idxStore.setJSON('index', idx);
      updates.push('index');
    }
  } catch (e) {
    console.error('[unsubscribe] index update failed:', e.message);
  }

  // 3) Atualiza os leads QUENTES sincronamente, usando o leads-index
  // ja em memoria pra achar so os IDs com email matching. Muito mais
  // rapido que escanear ~7k blobs um por um.
  //
  // Antes essa parte rodava em background (timeout-safe), mas levava
  // 1+ min pra refletir no admin e as vezes falhava silenciosamente.
  // Agora: 1 read do indice + N writes (N = quantas aplicacoes a pessoa
  // tem · normalmente 1-5). Roda em ~1s.
  try {
    const hotStore = getStore({name: 'leads', consistency: 'strong'});
    const INDEX_KEY = '__leads_index__';
    const idx = await hotStore.get(INDEX_KEY, {type: 'json'});
    const entries = idx && idx.entries ? Object.values(idx.entries) : [];
    const matching = entries.filter((e) => e && e.lead
      && String(e.lead.email || '').toLowerCase() === email
      && !e.lead.deletedAt
    );

    let touched = 0;
    for (const e of matching) {
      try {
        const lead = e.lead;
        const updated = {...lead, updatedAt: new Date().toISOString()};
        if (action === 'unsubscribe') {
          updated.unsubscribed = true;
          updated.ativo = false;
          updated.unsubscribedAt = updated.unsubscribedAt || new Date().toISOString();
        } else {
          updated.frequencia = 'menor';
        }
        await hotStore.setJSON(lead.id, updated);
        touched++;
      } catch (err) {
        console.error('[unsubscribe] hot lead update failed:', lead?.id, err.message);
      }
    }
    if (touched) updates.push(`hot:${touched}`);
  } catch (e) {
    console.error('[unsubscribe] hot via index failed:', e.message);
    // Fallback: aciona background pra varrer manualmente caso o indice nao exista
    try {
      const origin = new URL(req.url).origin;
      fetch(`${origin}/.netlify/functions/unsubscribe-propagate-background`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, action}),
      }).catch(() => {});
      updates.push('hot-fallback-bg');
    } catch {}
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
