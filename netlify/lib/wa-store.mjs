// Lib compartilhada · abstracao sobre Netlify Blobs pro modulo WhatsApp.
//
// O objetivo eh isolar TODOS os acessos a Netlify Blobs aqui. Quando
// chegar a hora de migrar pra PostgreSQL/Redis (Fase 3), so essa lib
// muda — o resto do modulo nao sente.
//
// Stores usadas (logical tables):
//   wa-config          — chave fixa 'config'
//   wa-contacts        — chave = phone E.164 sem +
//   wa-optins          — chave = `{phone}__{timestamp}` (append-only)
//   wa-optouts         — chave = phone E.164 (sobrescreve)
//   wa-templates       — chave = `{name}__{language}`
//   wa-campaigns       — chave = campaignId (UUID-ish)
//   wa-messages        — chave = `{campaignId}__{phone}`
//   wa-message-events  — chave = `{metaMsgId}__{timestamp}` (append-only)
//   wa-daily-limits    — chave = 'YYYY-MM-DD'
//   wa-number-health   — chave = phoneNumberId
//   wa-conversations   — chave = phone (inbox por contato)
//   wa-audit-logs      — chave = `{timestamp}__{rand}` (append-only)

import { getStore } from '@netlify/blobs';

const STORES = {
  config: 'wa-config',
  contacts: 'wa-contacts',
  optins: 'wa-optins',
  optouts: 'wa-optouts',
  templates: 'wa-templates',
  campaigns: 'wa-campaigns',
  messages: 'wa-messages',
  messageEvents: 'wa-message-events',
  dailyLimits: 'wa-daily-limits',
  numberHealth: 'wa-number-health',
  conversations: 'wa-conversations',
  audit: 'wa-audit-logs',
};

function store(name) {
  const storeName = STORES[name];
  if (!storeName) throw new Error('Store desconhecida: ' + name);
  return getStore({name: storeName, consistency: 'strong'});
}

// =========== CONFIG ===========

const DEFAULT_CONFIG = {
  // Keywords que disparam opt-out automatico ao chegar como reply
  optOutKeywords: ['sair', 'parar', 'cancelar', 'descadastrar', 'nao quero', 'não quero', 'stop', 'remover'],
  // Cap diario global do numero (Meta vai limitar via tier tambem)
  dailyCap: 500,
  // Cap por hora (rampa horaria)
  hourlyCap: 80,
  // Aquecimento progressivo (dias desde startedAt → cap diario)
  warmupTiers: [
    {days: 3, cap: 50},
    {days: 7, cap: 100},
    {days: 14, cap: 250},
    {days: 9999, cap: 500},
  ],
  warmupStartedAt: null, // null = aquecimento desligado/nao iniciado
  // Janela permitida pra envio (horario de Brasilia)
  sendWindow: {start: '08:00', end: '20:00', weekendsAllowed: false},
  notes: '',
};

export async function getConfig() {
  try {
    const cfg = await store('config').get('config', {type: 'json'});
    return {...DEFAULT_CONFIG, ...(cfg || {})};
  } catch {
    return {...DEFAULT_CONFIG};
  }
}

export async function setConfig(patch) {
  const current = await getConfig();
  const next = {...current, ...patch, updatedAt: new Date().toISOString()};
  await store('config').setJSON('config', next);
  return next;
}

// =========== CONTACTS ===========

export async function getContact(phone) {
  if (!phone) return null;
  return store('contacts').get(phone, {type: 'json'});
}

export async function upsertContact(contact) {
  if (!contact || !contact.phone) throw new Error('phone obrigatorio');
  const existing = await getContact(contact.phone);
  const now = new Date().toISOString();
  const next = {
    ...existing,
    ...contact,
    phone: contact.phone,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await store('contacts').setJSON(contact.phone, next);
  return next;
}

export async function listContacts({prefix = '', limit = 500} = {}) {
  const s = store('contacts');
  const list = await s.list({prefix});
  const keys = (list.blobs || []).map((b) => b.key).slice(0, limit);
  const CONC = 30;
  const out = [];
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    const got = await Promise.allSettled(batch.map((k) => s.get(k, {type: 'json'})));
    for (const r of got) if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out;
}

// =========== OPT-IN / OPT-OUT ===========

export async function recordOptIn({phone, source, ip, userAgent, channel, campaignId, formData}) {
  if (!phone || !source) throw new Error('phone e source obrigatorios');
  const ts = new Date().toISOString();
  const proof = {phone, source, ip: ip || null, userAgent: userAgent || null, channel: channel || null, campaignId: campaignId || null, formData: formData || null, capturedAt: ts};
  await store('optins').setJSON(`${phone}__${ts}`, proof);
  // Atualiza estado no contato
  await upsertContact({phone, opt_in_status: 'opted_in', opt_in_at: ts, opt_in_source: source});
  return proof;
}

export async function recordOptOut({phone, reason, sourceMsgId}) {
  if (!phone) throw new Error('phone obrigatorio');
  const ts = new Date().toISOString();
  const record = {phone, reason: reason || 'manual', sourceMsgId: sourceMsgId || null, optOutAt: ts};
  await store('optouts').setJSON(phone, record);
  await upsertContact({phone, opt_in_status: 'opted_out', opt_out_at: ts, opt_out_reason: reason || 'manual'});
  return record;
}

export async function isOptedOut(phone) {
  if (!phone) return false;
  const rec = await store('optouts').get(phone, {type: 'json'});
  return !!rec;
}

export async function isOptedIn(phone) {
  if (!phone) return false;
  if (await isOptedOut(phone)) return false;
  const c = await getContact(phone);
  return c?.opt_in_status === 'opted_in';
}

export async function listOptOuts({limit = 500} = {}) {
  const s = store('optouts');
  const list = await s.list();
  const keys = (list.blobs || []).map((b) => b.key).slice(0, limit);
  const out = [];
  const CONC = 30;
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    const got = await Promise.allSettled(batch.map((k) => s.get(k, {type: 'json'})));
    for (const r of got) if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out.sort((a, b) => (a.optOutAt < b.optOutAt ? 1 : -1));
}

// =========== TEMPLATES ===========

export async function saveTemplates(templates) {
  const s = store('templates');
  for (const t of templates) {
    const key = `${t.name}__${t.language}`;
    await s.setJSON(key, {...t, syncedAt: new Date().toISOString()});
  }
}

export async function listTemplates() {
  const s = store('templates');
  const list = await s.list();
  const keys = (list.blobs || []).map((b) => b.key);
  const out = [];
  const CONC = 30;
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    const got = await Promise.allSettled(batch.map((k) => s.get(k, {type: 'json'})));
    for (const r of got) if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out;
}

// =========== AUDIT ===========

export async function auditLog({actor, action, target, payload}) {
  const ts = new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 8);
  const entry = {timestamp: ts, actor: actor || 'system', action, target: target || null, payload: payload || null};
  try {
    await store('audit').setJSON(`${ts}__${rand}`, entry);
  } catch (err) {
    console.error('[wa-store] audit log failed:', err.message);
  }
  return entry;
}

export async function listAuditLogs({limit = 200} = {}) {
  const s = store('audit');
  const list = await s.list();
  const keys = (list.blobs || []).map((b) => b.key).sort().reverse().slice(0, limit);
  const out = [];
  const CONC = 30;
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    const got = await Promise.allSettled(batch.map((k) => s.get(k, {type: 'json'})));
    for (const r of got) if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out;
}

// =========== DAILY LIMITS ===========

function todayBrasilia() {
  // Brasilia eh UTC-3 fixo
  const now = new Date();
  const brasilia = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().slice(0, 10);
}

export async function getDailyLimit(date = todayBrasilia()) {
  const cfg = await getConfig();
  const cap = computeWarmupCap(cfg);
  const rec = await store('dailyLimits').get(date, {type: 'json'}) || {date, sent: 0, locked: []};
  return {...rec, cap};
}

// Reserva slots no limite diario pra uma lista de telefones. Garante
// que o mesmo telefone nao receba 2 vezes no mesmo dia. Atomico via
// re-read antes do write.
export async function reserveDailySlots(phones, date = todayBrasilia()) {
  const s = store('dailyLimits');
  const cfg = await getConfig();
  const cap = computeWarmupCap(cfg);
  const rec = await s.get(date, {type: 'json'}) || {date, sent: 0, locked: []};
  const locked = new Set(rec.locked || []);
  const accepted = [];
  const rejected = [];
  for (const p of phones) {
    if (rec.sent + accepted.length >= cap) { rejected.push({phone: p, reason: 'daily-cap'}); continue; }
    if (locked.has(p)) { rejected.push({phone: p, reason: 'already-sent-today'}); continue; }
    accepted.push(p);
    locked.add(p);
  }
  const next = {date, sent: (rec.sent || 0) + accepted.length, locked: [...locked], cap, lastReservedAt: new Date().toISOString()};
  await s.setJSON(date, next);
  return {accepted, rejected, dailyLimit: next};
}

// Calcula o cap atual baseado no warmup
export function computeWarmupCap(cfg) {
  if (!cfg.warmupStartedAt) return cfg.dailyCap;
  const start = new Date(cfg.warmupStartedAt).getTime();
  if (Number.isNaN(start)) return cfg.dailyCap;
  const daysSince = Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000));
  for (const tier of (cfg.warmupTiers || [])) {
    if (daysSince < tier.days) return Math.min(tier.cap, cfg.dailyCap);
  }
  return cfg.dailyCap;
}

export const _internals = {store, todayBrasilia, STORES};
