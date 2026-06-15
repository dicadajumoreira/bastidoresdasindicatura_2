// Netlify Function v2 · GET/POST /api/mentoria-config
// Configura a sala da Mentoria: link do Teams, horário, calendário,
// e o cronograma das 12 aulas (data + título + link da gravação).
//
// GET: retorna a config atual
// POST: salva nova config (exige token Bearer do admin)
// POST com action=update-aula: atualiza só uma aula específica

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/mentoria-config', '/.netlify/functions/mentoria-config'],
};

export default async (req) => {
  const store = getStore({name: 'mentoria-config', consistency: 'strong'});

  if (req.method === 'GET') {
    try {
      let cfg = await store.get('config', {type: 'json'});
      if (!cfg) {
        cfg = defaultConfig();
      } else if (!Array.isArray(cfg.aulas) || cfg.aulas.length === 0) {
        // Garante que tem o array de aulas mesmo em configs antigas
        cfg.aulas = defaultAulas();
      }
      return json({ok: true, config: cfg});
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

  // Carrega config atual pra preservar campos não enviados
  let current = null;
  try { current = await store.get('config', {type: 'json'}); } catch {}
  if (!current) current = defaultConfig();
  if (!Array.isArray(current.aulas)) current.aulas = defaultAulas();

  // MODO: atualizar uma aula específica
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

  // MODO: atualizar config geral
  const updated = {
    ...current,
    teamsLink: body.teamsLink !== undefined ? String(body.teamsLink).trim() : current.teamsLink,
    horario: body.horario !== undefined ? String(body.horario).trim() : current.horario,
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

// Gera 12 aulas começando na primeira terça de setembro/2026 e
// avançando 1 por semana.
function defaultAulas() {
  // 01/09/2026 é terça. Confirma e gera a partir daí.
  const aulas = [];
  const start = new Date(Date.UTC(2026, 8, 1)); // 01 setembro 2026 UTC
  // ajusta pra próxima terça caso não seja
  while (start.getUTCDay() !== 2) start.setUTCDate(start.getUTCDate() + 1);

  for (let i = 0; i < 12; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + (i * 7));
    aulas.push({
      numero: i + 1,
      data: d.toISOString().slice(0, 10), // YYYY-MM-DD
      titulo: `Aula ${String(i + 1).padStart(2, '0')}`,
      descricao: '',
      recordingLink: '',
    });
  }
  return aulas;
}

function defaultConfig() {
  return {
    teamsLink: '',
    horario: 'Terças, 07h30 (horário de Brasília)',
    calendario: 'Setembro a Novembro de 2026',
    notes: '',
    aulas: defaultAulas(),
    updatedAt: null,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
