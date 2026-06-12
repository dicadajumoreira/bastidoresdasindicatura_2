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

    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    const errors = [];

    // Coleta os e-mails normalizados pra um lookup eficiente
    const candidates = [];
    for (const e of entries) {
      const email = normEmail(e.email);
      if (!isValidEmail(email)) {
        invalid++;
        continue;
      }
      candidates.push({
        email,
        nome: String(e.nome || '').trim(),
        whatsapp: String(e.whatsapp || '').trim() || null,
        source: String(e.source || source),
        emailStatus: e.emailStatus || null,
      });
    }

    // Salva em paralelo com concorrência baixa pra não estourar Blobs
    const CONCURRENCY = 10;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (c) => {
        const key = `cold:${c.email}`;
        try {
          const existing = await store.get(key, {type: 'json'});
          if (existing) return {status: 'dup'};
        } catch {}
        const lead = {
          id: key,
          email: c.email,
          nome: c.nome,
          whatsapp: c.whatsapp,
          source: c.source,
          emailStatus: c.emailStatus,
          tipo: 'frio',
          importedAt: new Date().toISOString(),
          unsubscribed: false,
          frequencia: 'normal',
          convertedToHotAt: null,
        };
        await store.setJSON(key, lead);
        return {status: 'imported'};
      }));
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.status === 'imported') imported++;
          else if (r.value.status === 'dup') duplicates++;
        } else {
          invalid++;
          if (errors.length < 5) errors.push(String(r.reason?.message || 'erro').slice(0, 200));
        }
      }
    }

    return json({ok: true, imported, duplicates, invalid, total: entries.length, errors});
  }

  // ====== DELETE ======
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const email = (url.searchParams.get('email') || '').toLowerCase().trim();
    if (!email) return json({error: 'Falta o e-mail'}, 400);
    try {
      await store.delete(`cold:${email}`);
      return json({ok: true});
    } catch (err) {
      return json({error: err.message}, 500);
    }
  }

  return json({error: 'Method not allowed'}, 405);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
