// Netlify Function v2 · POST /api/wa-poli-send-test
//
// Envia UMA mensagem de teste via Poli pra um contactId ja cadastrado
// na Poli. Serve pra validar credenciais e canal antes de fazer
// campanha em massa.
//
// Body: { contactId, text }
// Resposta: { ok, result }
//
// LIMITACAO ATUAL: precisa do contactId ja criado na Poli. Nao sabemos
// ainda como criar contato via API (nao esta na doc que temos). Ate isso
// ser esclarecido, so eh possivel testar com contatos que ja existem no
// painel Poli.

import { verify } from '../lib/auth-token.mjs';
import { sendText } from '../lib/wa-poli.mjs';
import { getStore } from '@netlify/blobs';

export const config = {
  path: ['/api/wa-poli-send-test', '/.netlify/functions/wa-poli-send-test'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verify(token, secret);
  if (!payload) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const contactId = String(body.contactId || '').trim();
  const text = String(body.text || '').trim();
  if (!contactId) return json({error: 'contactId obrigatório'}, 400);
  if (!text) return json({error: 'texto obrigatório'}, 400);

  try {
    const result = await sendText(contactId, {text});

    // Log de auditoria simples
    try {
      const audit = getStore({name: 'wa-audit-logs', consistency: 'strong'});
      const ts = new Date().toISOString();
      const rand = Math.random().toString(36).slice(2, 8);
      await audit.setJSON(`${ts}__${rand}`, {
        timestamp: ts,
        actor: payload.email || 'admin',
        action: 'wa-poli-send-test',
        target: contactId,
        payload: {text: text.slice(0, 200), channelId: process.env.POLI_CHANNEL_ID},
        result: 'ok',
      });
    } catch {}

    return json({ok: true, result});
  } catch (err) {
    return json({error: err.message, status: err.status || 500, body: err.body || null}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
