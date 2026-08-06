// Netlify Function v2 · GET /api/wa-poli-templates
//
// Lista templates aprovados na Poli. Tenta varios endpoints ate um
// responder (a doc atual nao esclarece qual eh o oficial).
// Resposta: { ok, via, result, tried } ou { error, tried }

import { verify } from '../lib/auth-token.mjs';
import { listTemplates } from '../lib/wa-poli.mjs';

export const config = {
  path: ['/api/wa-poli-templates', '/.netlify/functions/wa-poli-templates'],
};

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  try {
    const res = await listTemplates();
    return json({ok: true, ...res});
  } catch (err) {
    return json({ok: false, error: err.message, status: err.status || 500, body: err.body || null}, 200);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
