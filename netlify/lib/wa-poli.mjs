// Cliente HTTP da API Poli Digital (BSP · WhatsApp).
// Docs: https://cs.poli.digital/api-cliente/
//
// Base URL: https://app.poli.digital/api/v1
// Auth: Authorization: Bearer <token>
//
// Path params globais que aparecem nos endpoints:
//   {customer} — ID da conta/empresa na Poli
//   {contact}  — ID do contato (destinatario da msg)
//   {user}     — ID do atendente que assina o envio
//   {channel}  — ID do canal (instancia do WhatsApp — ex.: 92994)
//   {tag}      — ID da tag
//
// Env vars esperadas no Netlify:
//   POLI_API_TOKEN     — Bearer token (secret)
//   POLI_CUSTOMER_ID   — ID da conta HubStation na Poli
//   POLI_CHANNEL_ID    — ID do canal WhatsApp (92994 no caso)
//   POLI_USER_ID       — ID do atendente que assina os envios

const BASE_URL = 'https://app.poli.digital/api/v1';

function token() {
  const t = process.env.POLI_API_TOKEN;
  if (!t) throw new Error('POLI_API_TOKEN nao configurado no Netlify');
  return t;
}
function customerId() {
  const id = process.env.POLI_CUSTOMER_ID;
  if (!id) throw new Error('POLI_CUSTOMER_ID nao configurado');
  return id;
}
function channelId() {
  const id = process.env.POLI_CHANNEL_ID;
  if (!id) throw new Error('POLI_CHANNEL_ID nao configurado');
  return id;
}
function userId() {
  const id = process.env.POLI_USER_ID;
  if (!id) throw new Error('POLI_USER_ID nao configurado');
  return id;
}

// Wrapper HTTP padrao com auth + tratamento de erro
async function poli(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${token()}`,
    'Accept': 'application/json',
    ...(options.headers || {}),
  };
  // POST/PUT precisam de Content-Type
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {...options, headers});
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {raw: text}; }
  if (!res.ok) {
    const msg = body?.message || body?.error || body?.errors || `HTTP ${res.status}`;
    const err = new Error(`Poli API ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ==================== CHATS ====================

// Lista todos os chats (conversas ativas). Usado no healthcheck e no
// futuro "inbox" pra ver respostas.
// Params opcionais: {fields, sort, filters, name, phone, limit, page}
export async function listChats(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    qs.append(k, String(v));
  }
  const url = `/customers/${customerId()}/chats${qs.toString() ? '?' + qs.toString() : ''}`;
  return poli(url);
}

// Historico de mensagens de um contato especifico
export async function listMessages(contactId, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    qs.append(k, String(v));
  }
  const url = `/customers/${customerId()}/chats/contacts/${contactId}/messages${qs.toString() ? '?' + qs.toString() : ''}`;
  return poli(url);
}

// ==================== SEND ====================

// Dispara mensagem TEXTO ou MIDIA pra 1 contato. IMPORTANTE:
// - O `contactId` precisa JA EXISTIR na base da Poli (esse endpoint nao
//   aceita telefone direto). Pra criar contato, a Poli deve expor outro
//   endpoint que precisamos documentar antes de fazer broadcast em massa.
// - Este endpoint envia TEXTO LIVRE — Meta so permite texto livre dentro
//   da janela de 24h apos a ultima msg do contato. Pra business-initiated
//   (nosso caso: broadcast frio), Meta EXIGE template. Poli deve ter um
//   endpoint separado /send_template — precisa documentar.
//
// Args:
//   contactId  — ID do contato na Poli
//   opts:
//     text       — string · mensagem de texto
//     mediaBase64 — string · arquivo em base64 (sem prefixo data:...)
//     mimetype   — string · ex.: 'image/png', 'application/pdf'
//     caption    — string · legenda da midia (opcional)
export async function sendText(contactId, {text, mediaBase64, mimetype, caption} = {}) {
  if (!contactId) throw new Error('contactId obrigatorio');
  const url = `/customers/${customerId()}/whatsapp/send_text/channels/${channelId()}/contacts/${contactId}/users/${userId()}`;
  const body = {
    usermsg: text || '',
    database64: mediaBase64 || '',
    mimetype: mimetype || '',
    caption: caption || '',
  };
  return poli(url, {method: 'POST', body: JSON.stringify(body)});
}

// ==================== TAGS ====================

export async function listTags() {
  return poli(`/tags/${customerId()}`);
}

export async function createTag({name, color = '#B89579'}) {
  return poli(`/tags/${customerId()}`, {
    method: 'POST',
    body: JSON.stringify({name, color}),
  });
}

export async function addTagToContact(tagId, contactId) {
  return poli(`/tags/${customerId()}/${tagId}/addContact/${contactId}`, {method: 'POST'});
}

export async function deleteTag(tagId) {
  return poli(`/tags/${customerId()}/${tagId}`, {method: 'DELETE'});
}

// ==================== HEALTHCHECK ====================

// Testa a conexao com a Poli. Tenta VARIOS endpoints em sequencia
// ate um passar — assim se algum estiver com bug do lado deles
// (recebemos 500 as vezes), ainda conseguimos validar que auth+customer
// estao certos. Retorna { ok, status, latency, sample?, tried?, lastError? }.
export async function ping() {
  const t0 = Date.now();
  const attempts = [
    {name: 'tags-list', run: () => poli(`/tags/${customerId()}`)},
    {name: 'chats-list', run: () => poli(`/customers/${customerId()}/chats`)},
    {name: 'chats-list-limit-1', run: () => poli(`/customers/${customerId()}/chats?limit=1`)},
  ];
  const tried = [];
  let lastError = null;
  for (const a of attempts) {
    try {
      const res = await a.run();
      return {
        ok: true,
        via: a.name,
        latency: Date.now() - t0,
        tried,
        customerId: customerId(),
        channelId: channelId(),
        userId: userId(),
        sample: Array.isArray(res?.data)
          ? {items: res.data.length, total: res.total || null}
          : (res && typeof res === 'object' ? {keys: Object.keys(res).slice(0, 5)} : {raw: 'ok'}),
      };
    } catch (err) {
      tried.push({name: a.name, status: err.status || 500, error: err.message.slice(0, 160)});
      lastError = err;
    }
  }
  return {
    ok: false,
    latency: Date.now() - t0,
    error: lastError?.message || 'todos endpoints falharam',
    status: lastError?.status || 500,
    tried,
  };
}

// ==================== STATUS DAS ENV VARS (sem expor valores) ====================

export function configStatus() {
  return {
    apiToken: !!process.env.POLI_API_TOKEN,
    customerId: !!process.env.POLI_CUSTOMER_ID,
    channelId: !!process.env.POLI_CHANNEL_ID,
    userId: !!process.env.POLI_USER_ID,
    tokenStartsWith: process.env.POLI_API_TOKEN ? String(process.env.POLI_API_TOKEN).slice(0, 6) + '…' : null,
    last4CustomerId: process.env.POLI_CUSTOMER_ID ? '…' + String(process.env.POLI_CUSTOMER_ID).slice(-4) : null,
    channelIdMasked: process.env.POLI_CHANNEL_ID ? String(process.env.POLI_CHANNEL_ID) : null, // channel id nao eh secret
    last4UserId: process.env.POLI_USER_ID ? '…' + String(process.env.POLI_USER_ID).slice(-4) : null,
  };
}
