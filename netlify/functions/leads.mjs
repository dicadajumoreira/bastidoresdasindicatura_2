// Netlify Function v2 · GET /api/leads
// Lista todas as aplicações. Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/leads', '/.netlify/functions/leads'],
};

// Lê os blobs com concorrência limitada. Disparar centenas de store.get() de
// uma vez congestiona o pool de conexões / dispara rate-limit do Blobs (com
// retries em backoff), o que estourava o timeout da function ("Resposta
// inválida" no admin). Em lotes de CONCURRENCY a leitura fica rápida e estável.
const CONCURRENCY = 50;

async function readAll(store, blobs) {
  const out = new Array(blobs.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < blobs.length) {
      const i = cursor++;
      try { out[i] = await store.get(blobs[i].key, {type: 'json'}); }
      catch { out[i] = null; }
    }
  };
  await Promise.all(
    Array.from({length: Math.min(CONCURRENCY, blobs.length)}, worker)
  );
  return out;
}

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!verify(token, secret)) {
    return json({error: 'Não autorizado'}, 401);
  }

  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    const { blobs } = await store.list();

    const raw = await readAll(store, blobs);

    const leads = raw
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return json({ok: true, leads});
  } catch (err) {
    // Nunca devolve corpo não-JSON: o admin mostra a causa em vez de "Resposta inválida".
    return json({error: 'Falha ao carregar os leads: ' + ((err && err.message) || 'erro desconhecido')}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
