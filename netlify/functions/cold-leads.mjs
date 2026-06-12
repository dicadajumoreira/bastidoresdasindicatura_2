// Netlify Function v2 · POST /api/cold-leads (importação em lote)
// e GET /api/cold-leads (lista com paginação).
//
// IMPORTAR (POST):
// Body: {
//   entries: [{email, nome?, whatsapp?, source?}, ...],
//   source: 'addressbookreport.csv' (origem do arquivo)
// }
// Resposta: { ok, imported, duplicates, invalid, total }
//
// LISTAR (GET):
// Query opcional: ?limit=100&offset=0&search=...
// Resposta: { ok, leads: [...], total }
//
// CHAVE: 'cold:{email_normalizado}' — permite dedupe O(1) por get(key)
// Status default: { unsubscribed: false, frequencia: 'normal' }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/cold-leads', '/.netlify/functions/cold-leads'],
};

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function isValidEmail(e) {
  if (!e || typeof e !== 'string') return false;
  const at = e.indexOf('@');
  const dot = e.lastIndexOf('.');
  return at > 0 && dot > at + 1 && dot < e.length - 1 && !e.includes(' ');
}

function normPhone(p) {
  // Normaliza pra só dígitos. Pra Brasil, números válidos têm 10-13 dígitos
  // (DDD 2 + 8/9 dígitos, opcionalmente com 55 do país).
  const digits = String(p || '').replace(/\D/g, '');
  return digits;
}

function isValidPhone(p) {
  const d = normPhone(p);
  return d.length >= 10 && d.length <= 13;
}

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const store = getStore({name: 'cold-leads', consistency: 'strong'});

  // ====== LISTAR ======
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const search = (url.searchParams.get('search') || '').toLowerCase().trim();

    try {
      const list = await store.list();
      let keys = (list.blobs || []).map((b) => b.key);
      keys.sort();
      const total = keys.length;
      // Aplica busca rápida no e-mail do próprio key
      if (search) {
        keys = keys.filter((k) => k.toLowerCase().includes(search));
      }
      const pageKeys = keys.slice(offset, offset + limit);
      const leads = [];
      const BATCH = 12;
      for (let i = 0; i < pageKeys.length; i += BATCH) {
        const batch = pageKeys.slice(i, i + BATCH);
        const got = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
        for (const g of got) {
          if (g.status === 'fulfilled' && g.value) leads.push(g.value);
        }
      }
      return json({ok: true, leads, total: search ? keys.length : total, totalAll: total});
    } catch (err) {
      return json({error: 'Falha ao listar leads frios: ' + err.message}, 500);
    }
  }

  // ====== IMPORTAR EM LOTE ======
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

    const entries = Array.isArray(body.entries) ? body.entries : [];
    const source = String(body.source || 'import-manual');

    if (entries.length === 0) {
      return json({error: 'Nenhuma entrada fornecida'}, 400);
    }
    if (entries.length > 800) {
      return json({error: 'Lote muito grande. Envie em chunks de até 500 por vez.'}, 400);
    }

    let importedEmail = 0;
    let importedPhone = 0;
    let duplicates = 0;
    let invalid = 0;
    const errors = [];

    // Aceita entradas com e-mail OU só telefone (vão pra canais diferentes
    // no futuro: e-mail via Resend, WhatsApp via outro disparador).
    const candidates = [];
    for (const e of entries) {
      const email = normEmail(e.email);
      const phone = normPhone(e.whatsapp);
      const hasEmail = isValidEmail(email);
      const hasPhone = isValidPhone(phone);
      if (!hasEmail && !hasPhone) { invalid++; continue; }
      candidates.push({
        email: hasEmail ? email : null,
        whatsapp: hasPhone ? phone : null,
        nome: String(e.nome || '').trim(),
        source: String(e.source || source),
        emailStatus: e.emailStatus || null,
      });
    }

    // Salva em paralelo com concorrência baixa
    const CONCURRENCY = 10;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (c) => {
        // Chave: prefere e-mail (dedupe mais forte). Se só tem telefone, usa telefone.
        const key = c.email ? `cold:e:${c.email}` : `cold:p:${c.whatsapp}`;
        try {
          const existing = await store.get(key, {type: 'json'});
          if (existing) return {status: 'dup'};
        } catch {}
        const canal = c.email && c.whatsapp ? 'both'
          : c.email ? 'email'
          : 'whatsapp';
        const lead = {
          id: key,
          email: c.email,
          whatsapp: c.whatsapp,
          nome: c.nome,
          source: c.source,
          emailStatus: c.emailStatus,
          tipo: 'frio',
          canal,
          importedAt: new Date().toISOString(),
          unsubscribed: false,
          frequencia: 'normal',
          convertedToHotAt: null,
        };
        await store.setJSON(key, lead);
        return {status: 'imported', canal: c.email ? 'email' : 'phone'};
      }));
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.status === 'imported') {
            if (r.value.canal === 'email') importedEmail++;
            else importedPhone++;
          } else if (r.value.status === 'dup') duplicates++;
        } else {
          invalid++;
          if (errors.length < 5) errors.push(String(r.reason?.message || 'erro').slice(0, 200));
        }
      }
    }

    return json({
      ok: true,
      imported: importedEmail + importedPhone,
      importedEmail,
      importedPhone,
      duplicates,
      invalid,
      total: entries.length,
      errors,
    });
  }

  // ====== DELETE ======
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const email = (url.searchParams.get('email') || '').toLowerCase().trim();
    const sourceContains = (url.searchParams.get('sourceContains') || '').trim();
    const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');

    // Delete por e-mail único
    if (email) {
      try {
        // Pode ter sido salvo com prefixo 'cold:' (antigo) ou 'cold:e:' (novo)
        await store.delete(`cold:e:${email}`);
        try { await store.delete(`cold:${email}`); } catch {}
        return json({ok: true});
      } catch (err) {
        return json({error: err.message}, 500);
      }
    }

    // Delete por telefone único
    if (phone) {
      try {
        await store.delete(`cold:p:${phone}`);
        return json({ok: true});
      } catch (err) {
        return json({error: err.message}, 500);
      }
    }

    // Delete em lote por origem (source contém X)
    if (sourceContains) {
      try {
        const list = await store.list();
        const keys = (list.blobs || []).map((b) => b.key);
        let deleted = 0;
        const CONCURRENCY = 15;
        for (let i = 0; i < keys.length; i += CONCURRENCY) {
          const batch = keys.slice(i, i + CONCURRENCY);
          const matches = await Promise.allSettled(batch.map(async (k) => {
            const v = await store.get(k, {type: 'json'});
            if (v && v.source && v.source.includes(sourceContains)) {
              await store.delete(k);
              return true;
            }
            return false;
          }));
          for (const m of matches) {
            if (m.status === 'fulfilled' && m.value === true) deleted++;
          }
        }
        return json({ok: true, deleted});
      } catch (err) {
        return json({error: err.message}, 500);
      }
    }

    return json({error: 'Especifique email, phone ou sourceContains'}, 400);
  }

  return json({error: 'Method not allowed'}, 405);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
