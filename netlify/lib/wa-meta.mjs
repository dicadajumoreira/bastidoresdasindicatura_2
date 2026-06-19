// Lib compartilhada · cliente da Cloud API da Meta (WhatsApp).
//
// Funcoes essenciais usadas pelo modulo WA:
//   - sendTemplate(): dispara mensagem usando template aprovado
//   - listTemplates(): puxa templates aprovados/pendentes/rejeitados da WABA
//   - getPhoneNumberInfo(): traz quality_rating + messaging_limit do numero
//   - verifyWebhookSignature(): valida X-Hub-Signature-256 dos eventos
//
// Variaveis de ambiente esperadas no Netlify:
//   WHATSAPP_ACCESS_TOKEN        — Bearer token permanente (System User)
//   WHATSAPP_PHONE_NUMBER_ID     — ID do numero registrado
//   WHATSAPP_WABA_ID             — WhatsApp Business Account ID
//   WHATSAPP_APP_SECRET          — App Secret do Meta App (assina webhooks)
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN— string que voce define + cola no Meta

import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function token() {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!t) throw new Error('WHATSAPP_ACCESS_TOKEN nao configurado');
  return t;
}

function phoneId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error('WHATSAPP_PHONE_NUMBER_ID nao configurado');
  return id;
}

function wabaId() {
  const id = process.env.WHATSAPP_WABA_ID;
  if (!id) throw new Error('WHATSAPP_WABA_ID nao configurado');
  return id;
}

// Wrapper basico do fetch com auth + tratamento de erro padronizado da Graph.
async function graphFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${token()}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, {...options, headers});
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {raw: text}; }
  if (!res.ok) {
    const errMsg = body?.error?.message || body?.error?.error_user_msg || `HTTP ${res.status}`;
    const errCode = body?.error?.code || res.status;
    const err = new Error(`Meta API ${errCode}: ${errMsg}`);
    err.status = res.status;
    err.metaError = body?.error || null;
    throw err;
  }
  return body;
}

// Healthcheck simples: tenta puxar dados do numero. Funciona se o token
// e o phone_number_id estiverem corretos.
export async function ping() {
  try {
    const data = await graphFetch(`/${phoneId()}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status,platform_type`);
    return {ok: true, data};
  } catch (err) {
    return {ok: false, error: err.message, status: err.status || 500};
  }
}

// Lista todos os templates da WABA com paginacao basica.
// Retorna {data: [{name, language, status, category, components, id}, ...]}
export async function listTemplates({limit = 100} = {}) {
  const out = [];
  let next = `/${wabaId()}/message_templates?fields=name,language,status,category,components,quality_score&limit=${limit}`;
  let pages = 0;
  while (next && pages < 10) {
    pages++;
    const res = await graphFetch(next);
    if (Array.isArray(res.data)) out.push(...res.data);
    next = res.paging?.next || null;
  }
  return {templates: out};
}

// Dispara mensagem de template pra UM destinatario.
// `to` precisa estar em E.164 SEM +, ex.: '5511999991234'
// `components` segue formato Meta:
//   [{type:'body', parameters:[{type:'text', text:'Juliana'}]}]
export async function sendTemplate({to, templateName, language, components}) {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to),
    type: 'template',
    template: {
      name: templateName,
      language: {code: language || 'pt_BR'},
      ...(components && components.length ? {components} : {}),
    },
  };
  const res = await graphFetch(`/${phoneId()}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // resposta tipica: { messaging_product, contacts:[{input,wa_id}], messages:[{id}] }
  return {
    metaMessageId: res.messages?.[0]?.id || null,
    waId: res.contacts?.[0]?.wa_id || null,
    raw: res,
  };
}

// Dispara mensagem texto livre. SO usar dentro da janela de 24h apos
// resposta do contato (Meta nao permite free-form pra business-initiated).
export async function sendText({to, text}) {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to),
    type: 'text',
    text: {preview_url: false, body: String(text).slice(0, 4096)},
  };
  const res = await graphFetch(`/${phoneId()}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {metaMessageId: res.messages?.[0]?.id || null, raw: res};
}

// Marca mensagem do cliente como lida (atalho de UX, evita o "visto azul"
// fora de hora). Opcional.
export async function markAsRead({messageId}) {
  return graphFetch(`/${phoneId()}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
}

// Verifica assinatura X-Hub-Signature-256 dos eventos de webhook usando
// o WHATSAPP_APP_SECRET. Devolve true/false.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch { return false; }
}

// Verifica o handshake GET do webhook (Meta envia hub.mode/hub.challenge/hub.verify_token)
export function verifyWebhookHandshake(query) {
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) return null;
  if (query.get('hub.mode') === 'subscribe' && query.get('hub.verify_token') === expectedToken) {
    return query.get('hub.challenge');
  }
  return null;
}

// Estado de configuracao (pra dashboard mostrar o que falta)
export function configStatus() {
  return {
    accessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    wabaId: !!process.env.WHATSAPP_WABA_ID,
    appSecret: !!process.env.WHATSAPP_APP_SECRET,
    webhookVerifyToken: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    // Helpers pra UI
    last4PhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ? '…' + String(process.env.WHATSAPP_PHONE_NUMBER_ID).slice(-4) : null,
    last4Waba: process.env.WHATSAPP_WABA_ID ? '…' + String(process.env.WHATSAPP_WABA_ID).slice(-4) : null,
    tokenStartsWith: process.env.WHATSAPP_ACCESS_TOKEN ? String(process.env.WHATSAPP_ACCESS_TOKEN).slice(0, 4) + '…' : null,
  };
}
