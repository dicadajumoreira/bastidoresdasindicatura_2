// Rodapé padrão pra TODO disparo em massa: link de descadastro
// (token assinado por destinatário) + redes sociais + política de
// privacidade.
//
// Uso típico:
//   import { withBroadcastFooter } from '../lib/broadcast-footer.mjs';
//   const personalizedHtml = withBroadcastFooter(html, email, vars);
//
// O footer é APPENDED ao html da campanha. Substituições {{nome}} /
// {{material}} continuam funcionando normalmente em personalize().

import { makeUnsubscribeUrl } from './email-resend.mjs';

const BROADCAST_FOOTER = `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
  <tr><td align="center" style="padding:0 16px 32px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
      <tr><td style="padding:14px 40px 8px;background:#F7F5F2;border-top:1px solid #E8E2D8;text-align:center">
        <p style="margin:0;font-size:12px;line-height:1.7;color:#8a8881">
          <a href="https://instagram.com/dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">Instagram @dicadajumoreira</a>
          &nbsp;·&nbsp;
          <a href="https://youtube.com/@dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">YouTube @dicadajumoreira</a>
        </p>
      </td></tr>
      <tr><td style="padding:14px 40px 18px;background:#FBF8F2;border-top:1px solid #E8E2D8;text-align:center">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8881">
          Não quer mais receber? <a href="{{unsubscribe_url}}" style="color:#B89579">Descadastre ou reduza a frequência</a>.
        </p>
        <p style="margin:6px 0 0;font-size:10px;line-height:1.6;color:#8a8881;letter-spacing:.06em">
          <a href="https://bastidoresdasindicatura.com.br/politica-de-privacidade/" style="color:#B89579">Política de Privacidade</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

// Aplica personalização de variáveis ({{nome}}, etc) E injeta a URL
// única de descadastro do destinatário no rodapé.
export function withBroadcastFooter(html, recipientEmail, vars = {}) {
  const unsubUrl = makeUnsubscribeUrl(recipientEmail, 'broadcast') || '';
  return personalize(html + BROADCAST_FOOTER, vars)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl);
}

export function personalize(template, vars) {
  return String(template == null ? '' : template).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

export { BROADCAST_FOOTER };
