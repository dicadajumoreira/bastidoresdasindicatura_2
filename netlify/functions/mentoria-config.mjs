// Netlify Function v2 · GET/POST /api/mentoria-config
// Configura a sala da Mentoria: link do Teams, horário, calendário,
// e os cronogramas das aulas por modalidade.
//
// MODALIDADES:
//   - 'experience': 12 aulas em grupo (terças)
//   - 'executive': 14 aulas — 12 em grupo + 2 particulares
//
// As aulas particulares (tipo: 'particular') aparecem SÓ pra inscritos
// na modalidade Executive. Inscritos em Experience veem só as de grupo.
//
// GET: retorna a config atual (cronograma das 14 aulas)
// POST: salva nova config (exige token Bearer do admin)
// POST com action=update-aula: atualiza só uma aula específica

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { defaultAulas, defaultConfig, loadMentoriaConfig } from '../lib/mentoria-config.mjs';

export const config = {
  path: ['/api/mentoria-config', '/.netlify/functions/mentoria-config'],
};

export default async (req) => {
  const store = getStore({name: 'mentoria-config', consistency: 'strong'});

  if (req.method === 'GET') {
    try {
      const cfg = await loadMentoriaConfig({sanitize: false});
      return json({ok: true, config: cfg});
    } catch (err) {
      return json({error: 'Falha ao carregar: ' + err.message}, 500);
    }
  }

  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  let current = null;
  try { current = await store.get('config', {type: 'json'}); } catch {}
  if (!current) current = defaultConfig();
  if (!Array.isArray(current.aulas) || current.aulas.length === 0) current.aulas = defaultAulas();

  if (body.action === 'update-aula' && typeof body.aulaIndex === 'number') {
    const i = body.aulaIndex;
    if (i < 0 || i >= current.aulas.length) return json({error: 'Aula inexistente'}, 400);
    const aula = current.aulas[i];
    const updated = {
      ...aula,
      ...(body.titulo !== undefined ? {titulo: String(body.titulo).trim()} : {}),
      ...(body.data !== undefined ? {data: String(body.data).trim()} : {}),
      ...(body.descricao !== undefined ? {descricao: String(body.descricao).trim()} : {}),
      ...(body.recordingLink !== undefined ? {recordingLink: String(body.recordingLink).trim()} : {}),
      ...(body.tipo !== undefined ? {tipo: body.tipo === 'particular' ? 'particular' : 'grupo'} : {}),
    };
    current.aulas[i] = updated;
    current.updatedAt = new Date().toISOString();
    try {
      await store.setJSON('config', current);
      return json({ok: true, config: current});
    } catch (err) {
      return json({error: 'Falha ao salvar aula: ' + err.message}, 500);
    }
  }

  const updated = {
    ...current,
    teamsLink: body.teamsLink !== undefined ? String(body.teamsLink).trim() : current.teamsLink,
    horario: body.horario !== undefined ? String(body.horario).trim() : current.horario,
    horarioParticular: body.horarioParticular !== undefined ? String(body.horarioParticular).trim() : (current.horarioParticular || 'Horário individual a combinar'),
    calendario: body.calendario !== undefined ? String(body.calendario).trim() : current.calendario,
    notes: body.notes !== undefined ? String(body.notes).trim() : current.notes,
    aulas: Array.isArray(body.aulas) ? body.aulas : current.aulas,
    updatedAt: new Date().toISOString(),
  };

  try {
    await store.setJSON('config', updated);
    return json({ok: true, config: updated});
  } catch (err) {
    return json({error: 'Falha ao salvar: ' + err.message}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
