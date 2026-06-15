// Netlify Function v2 · GET/POST /api/mentoria-config
// Configura a sala da Mentoria: link do Teams, horário, calendário.
// Os membros marcados com `mentoria: true` veem essas informações na
// Área de Membros.
//
// GET: retorna a config atual (sem auth — info é pública pros membros)
// POST: salva nova config (exige token Bearer do admin)
//
// Body do POST: { teamsLink, horario, calendario, notes }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/mentoria-config', '/.netlify/functions/mentoria-config'],
};

export default async (req) => {
  const store = getStore({name: 'mentoria-config', consistency: 'strong'});

  if (req.method === 'GET') {
    try {
      const cfg = await store.get('config', {type: 'json'});
      return json({ok: true, config: cfg || defaultConfig()});
    } catch (err) {
      return json({error: 'Falha ao carregar: ' + err.message}, 500);
    }
  }

  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  // POST exige auth admin
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const updated = {
    teamsLink: String(body.teamsLink || '').trim(),
    horario: String(body.horario || '').trim(),
    calendario: String(body.calendario || '').trim(),
    notes: String(body.notes || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await store.setJSON('config', updated);
    return json({ok: true, config: updated});
  } catch (err) {
    return json({error: 'Falha ao salvar: ' + err.message}, 500);
  }
};

function defaultConfig() {
  return {
    teamsLink: '',
    horario: 'Terças, 07h30 (horário de Brasília)',
    calendario: 'Setembro de 2026 a Setembro de 2027',
    notes: '',
    updatedAt: null,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
