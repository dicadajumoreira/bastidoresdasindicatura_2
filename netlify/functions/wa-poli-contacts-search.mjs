// Netlify Function v2 · GET /api/wa-poli-contacts-search?name=X&phone=Y
//
// Busca contatos na Poli por nome ou telefone. Serve pra descobrir
// o Contact ID sem precisar mexer no painel Poli.

import { verify } from '../lib/auth-token.mjs';
import { searchContacts } from '../lib/wa-poli.mjs';

export const config = {
  path: ['/api/wa-poli-contacts-search', '/.netlify/functions/wa-poli-contacts-search'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const url = new URL(req.url);
  const name = url.searchParams.get('name') || '';
  const phone = url.searchParams.get('phone') || '';
  const limit = Number(url.searchParams.get('limit') || 20);

  if (!name && !phone) return json({error: 'name ou phone obrigatório'}, 400);

  try {
    const {via, contacts, tried} = await searchContacts({name, phone, limit});
    return json({ok: true, via, count: contacts.length, contacts, tried});
  } catch (err) {
    return json({
      ok: false,
      error: err.message,
      status: err.status || 500,
      tried: err.body?.tried || null,
    }, 200);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
