// Netlify Function v2 · POST /api/submit
// Recebe uma aplicação (mentoria ou checklist) e salva em Netlify Blobs.
// A notificação por e-mail é feita pelo Netlify Forms (HTML estático escondido).

import { getStore } from '@netlify/blobs';

export const config = {
  path: '/api/submit',
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  // Validação por tipo de formulário
  const origem = body.origem === 'checklist' ? 'checklist' : 'mentoria';
  const required = origem === 'checklist'
    ? ['nome', 'email', 'whatsapp', 'atuacao']
    : ['nome', 'email', 'whatsapp', 'cidade', 'modalidade'];

  for (const k of required) {
    if (!body[k] || String(body[k]).trim() === '') {
      return json({error: `Campo obrigatório ausente: ${k}`}, 400);
    }
  }

  // Gera id único
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const lead = {
    id,
    createdAt: new Date().toISOString(),
    status: 'novo',  // novo | lido | respondido | convidado | recusado
    notes: '',
    origem,          // mentoria | checklist
    ...body,
  };

  const store = getStore({name: 'leads', consistency: 'strong'});
  await store.setJSON(id, lead);

  return json({ok: true, id});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
