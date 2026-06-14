// Netlify Function v2 · POST /api/membros-request-password
// Envia magic link pro e-mail definir/redefinir senha. O link inclui um
// token assinado válido por 30 minutos com type='membros-set-password'.
//
// Body: { email }
// Resposta: { ok: true, sent: boolean } — sempre 200 mesmo se e-mail
// não estiver cadastrado (pra não vazar a base).

import { sign } from '../lib/auth-token.mjs';
import { findLeadByEmail } from '../lib/members-email-index.mjs';

export const config = {
  path: ['/api/membros-request-password', '/.netlify/functions/membros-request-password'],
};

const SITE = 'https://bastidoresdasindicatura.com.br';
const FROM = 'Bastidores da Sindicatura <contato@dicadajumoreira.com.br>';

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return json({error: 'E-mail inválido'}, 400);

  const lookup = await findLeadByEmail(email);
  if (lookup.indexMissing) {
    triggerIndexBuild(req).catch(() => {});
    return json({error: 'Estamos preparando o sistema pela primeira vez. Aguarde 1-2 minutos e tente novamente.', indexMissing: true}, 503);
  }
  const lead = lookup.lead;

  if (!lead) return json({ok: true, sent: false});

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const exp = Date.now() + 30 * 60 * 1000; // 30 minutos
  const token = sign({email, type: 'membros-set-password', exp}, secret);
  const url = `${SITE}/membros/?action=set-password&t=${encodeURIComponent(token)}`;

  if (process.env.RESEND_API_KEY) {
    try {
      const fn = String(lead.nome || '').trim().split(/\s+/)[0] || '';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: 'Criar/redefinir senha · Bastidores da Sindicatura',
          html: buildHtml({nome: fn || 'aí', url}),
        }),
      });
    } catch (err) {
      console.error('[membros-request-password] resend failed:', err.message);
      return json({error: 'Falha ao enviar o e-mail. Tenta de novo.'}, 502);
    }
  }

  return json({ok: true, sent: true});
};

async function triggerIndexBuild(req) {
  try {
    const origin = new URL(req.url).origin;
    fetch(`${origin}/.netlify/functions/members-email-index-build-background`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    }).catch(() => {});
  } catch {}
}

function buildHtml({nome, url}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9">
  <tr><td align="center" style="padding:32px 16px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#F7F5F2">
      <tr><td style="padding:32px 40px 18px;border-bottom:1px solid #E8E2D8">
        <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29;letter-spacing:-.01em">Bastidores da Sindicatura</p>
        <p style="margin:6px 0 0;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#B89579;font-weight:600">Área de Membros · Senha</p>
      </td></tr>
      <tr><td style="padding:40px">
        <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:30px;line-height:1.1;margin:0 0 18px;color:#1A1C29">Olá, ${esc(nome)}.</h1>
        <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 24px">
          Você pediu pra <strong>criar ou redefinir a sua senha</strong> da Área de Membros do Bastidores. Clica no botão abaixo pra escolher uma senha nova:
        </p>
        <p style="text-align:center;margin:0 0 24px">
          <a href="${url}" style="display:inline-block;background:#1A1C29;color:#F7F5F2;padding:16px 32px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Definir minha senha</a>
        </p>
        <p style="font-size:13px;line-height:1.5;color:#8a8881;margin:0 0 8px;text-align:center">
          O link expira em <strong>30 minutos</strong>. Se não foi você quem pediu, ignore este e-mail.
        </p>
        <p style="font-size:12px;line-height:1.5;color:#8a8881;margin:24px 0 0;text-align:center;word-break:break-all">
          Se o botão não funcionar, copia e cola este endereço no navegador:<br>
          <a href="${url}" style="color:#B89579">${url}</a>
        </p>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #E8E2D8">
          <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29">Juliana Moreira</p>
          <p style="margin:6px 0 0;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8881;font-weight:600">CEO Sindicompany · Condo Academy</p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
