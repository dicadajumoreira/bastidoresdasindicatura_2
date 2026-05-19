// Netlify Function · POST /api/submit
// Recebe uma aplicação do formulário, salva em Netlify Blobs.
// O e-mail de notificação é enviado pelo próprio Netlify Forms
// (form HTML estático escondido no index.html).

import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({error: 'Method not allowed'}), {
      status: 405,
      headers: {'Content-Type': 'application/json'},
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({error: 'Invalid JSON'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  // Validação por tipo de formulário
  const origem = body.origem === 'checklist' ? 'checklist' : 'mentoria';
  const required = origem === 'checklist'
    ? ['nome', 'email', 'whatsapp', 'atuacao']
    : ['nome', 'email', 'whatsapp', 'cidade', 'modalidade'];

  for (const k of required) {
    if (!body[k] || String(body[k]).trim() === '') {
      return new Response(JSON.stringify({error: `Campo obrigatório ausente: ${k}`}), {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      });
    }
  }

  // Gera id único
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const lead = {
    id,
    createdAt: new Date().toISOString(),
    status: 'novo',  // novo | lido | respondido | convidado | recusado
    notes: '',
    origem,  // mentoria | checklist
    ...body,
  };

  // Salva no Netlify Blobs (store "leads")
  const store = getStore({name: 'leads', consistency: 'strong'});
  await store.setJSON(id, lead);

  return new Response(JSON.stringify({ok: true, id}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
};
