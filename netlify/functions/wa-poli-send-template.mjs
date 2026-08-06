// Netlify Function v2 · POST /api/wa-poli-send-template
//
// Envia UM template aprovado via Poli pra 1 contactId.
// Serve pra testar templates HSM antes de escalar broadcast.
//
// Body:
//   { contactId, templateName?, templateId?, language?, bodyParams?, headerParams?, buttonParams?, bodyOverride?, pathOverride? }
//
// Resposta: { ok, via, result, bodySent, tried } | { error, status, tried, bodySent }

import { verify } from '../lib/auth-token.mjs';
import { sendTemplate } from '../lib/wa-poli.mjs';
import { getStore } from '@netlify/blobs';

export const config = {
  path: ['/api/wa-poli-send-template', '/.netlify/functions/wa-poli-send-template'],
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
  if (!contactId) return json({error: 'contactId obrigatório'}, 400);
  if (!body.templateName && !body.templateId && !body.bodyOverride) {
    return json({error: 'templateName ou templateId ou bodyOverride obrigatório'}, 400);
  }

  try {
    const result = await sendTemplate(contactId, {
      templateName: body.templateName,
      templateId: body.templateId,
      language: body.language,
      bodyParams: body.bodyParams,
      headerParams: body.headerParams,
      buttonParams: body.buttonParams,
      bodyOverride: body.bodyOverride,
      pathOverride: body.pathOverride,
    });

    try {
      const audit = getStore({name: 'wa-audit-logs', consistency: 'strong'});
      const ts = new Date().toISOString();
      const rand = Math.random().toString(36).slice(2, 8);
      await audit.setJSON(`${ts}__${rand}`, {
        timestamp: ts,
        actor: payload.email || 'admin',
        action: 'wa-poli-send-template',
        target: contactId,
        payload: {
          templateName: body.templateName || null,
          templateId: body.templateId || null,
          language: body.language || 'pt_BR',
          channelId: process.env.POLI_CHANNEL_ID,
          via: result.via,
        },
        result: 'ok',
      });
    } catch {}

    return json({ok: true, ...result});
  } catch (err) {
    return json({
      ok: false,
      error: err.message,
      status: err.status || 500,
      tried: err.body?.tried || null,
      bodySent: err.body?.bodySent || null,
    }, 200);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
