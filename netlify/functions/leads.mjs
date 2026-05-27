// Netlify Function v2 · GET /api/leads
// Lista todas as aplicações. Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/leads', '/.netlify/functions/leads'],
};

// Lê os blobs com concorrência limitada. Disparar centenas (ou mesmo 50)
// store.get() ao mesmo tempo dispara o rate-limit do Netlify Blobs: as leituras
// voltam vazias (0 leads) ou estouram o timeout da function ("Resposta inválida"
// no admin). Um lote pequeno (CONCURRENCY) lê tudo de forma estável e rápida —
// centenas de leads levam só alguns segundos.
const CONCURRENCY = 10;
// Orçamento de tempo: se a leitura passar disso, devolvemos o que já temos em
// vez de deixar a function estourar o timeout (~10s) e cair em "Resposta inválida".
const TIME_BUDGET_MS = 8000;

async function readAll(store, blobs) {
  const out = new Array(blobs.length);
  let cursor = 0;
  let truncated = false;
  const deadline = Date.now() + TIME_BUDGET_MS;
  const worker = async () => {
    while (cursor < blobs.length) {
      if (Date.now() > deadline) { truncated = true; return; }
      const i = cursor++;
      try { out[i] = await store.get(blobs[i].key, {type: 'json'}); }
      catch { out[i] = null; }
    }
  };
  await Promise.all(
    Array.from({length: Math.min(CONCURRENCY, blobs.length)}, worker)
  );
  return {out, truncated};
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

    const {out, truncated} = await readAll(store, blobs);

    const leads = out
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    // total = quantos blobs existem; leads.length = quantos deram pra ler no tempo.
    return json({ok: true, leads, total: blobs.length, truncated});
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
