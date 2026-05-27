// Netlify Function v2 · GET /api/leads
// Lista todas as aplicações. Exige token Bearer válido.
//
// A leitura usa um índice persistido (ver netlify/lib/leads-index.mjs): a
// leitura pesada de todos os blobs acontece no máximo uma vez (protegida por
// orçamento de tempo) e fica salva; depois cada abertura lê basicamente 1
// arquivo, relendo do banco só o que mudou (etag). Resolve o "Resposta
// inválida" / lista zerada com centenas/milhares de leads.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { buildLeads } from '../lib/leads-index.mjs';

export const config = {
  path: ['/api/leads', '/.netlify/functions/leads'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!verify(token, secret)) {
    return json({error: 'Não autorizado'}, 401);
  }

  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    const {leads, total, truncated} = await buildLeads(store);
    return json({ok: true, leads, total, truncated});
  } catch (err) {
    // Nunca devolve corpo não-JSON: o admin mostra a causa em vez de "Resposta inválida".
    return json({error: 'Falha ao carregar os leads: ' + ((err && err.message) || 'erro desconhecido')}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
