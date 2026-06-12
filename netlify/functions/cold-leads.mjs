// Netlify Function v2 · POST /api/cold-leads (importação em lote)
// e GET /api/cold-leads (lista com paginação).
//
// SCHEMA (novo):
// - lead:{id}       → full record com emails: [...], whatsapps: [...]
// - idxe:{email}    → {leadId} (índice de e-mail → registro)
// - idxp:{phone}    → {leadId} (índice de telefone → registro)
//
// SCHEMA (antigo, mantido pra leitura backward-compat):
// - cold:e:{email}  → full record (single email)
// - cold:p:{phone}  → full record (single phone)
//
// Listagem combina os dois schemas. Imports novos vão pro novo schema.
// Pra migrar dados antigos, basta limpar por origem e re-importar.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/cold-leads', '/.netlify/functions/cold-leads'],
};

const KEY_LEAD = 'lead:';
const KEY_IDXE = 'idxe:';
const KEY_IDXP = 'idxp:';

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}
function isValidEmail(e) {
  if (!e || typeof e !== 'string') return false;
  const at = e.indexOf('@');
  const dot = e.lastIndexOf('.');
  return at > 0 && dot > at + 1 && dot < e.length - 1 && !e.includes(' ');
}
function normPhone(p) {
  return String(p || '').replace(/\D/g, '');
}
function isValidPhone(p) {
  const d = normPhone(p);
  return d.length >= 10 && d.length <= 13;
}

// Hash determinístico curto pra id de registro (a partir do primeiro e-mail ou tel)
function makeLeadId(primaryEmail, primaryPhone) {
  const base = primaryEmail || `p${primaryPhone}` || `${Date.now()}${Math.random()}`;
  // só caracteres seguros pra key
  return base.replace(/[^a-z0-9._@+-]/gi, '_').slice(0, 80);
}

export default async (req) => {
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const store = getStore({name: 'cold-leads', consistency: 'strong'});

  // ============================================================
  // LISTAR
  // ============================================================
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const search = (url.searchParams.get('search') || '').toLowerCase().trim();

    try {
      const list = await store.list();
      // Filtra só chaves de registro (skip índices)
      const allKeys = (list.blobs || []).map((b) => b.key);
      const recordKeys = allKeys.filter((k) =>
        k.startsWith(KEY_LEAD) || k.startsWith('cold:e:') || k.startsWith('cold:p:')
      );
      recordKeys.sort();
      const total = recordKeys.length;

      // Busca rápida pelo conteúdo da chave (rough)
      let filtered = recordKeys;
      if (search) {
        filtered = recordKeys.filter((k) => k.toLowerCase().includes(search));
      }
      const pageKeys = filtered.slice(offset, offset + limit);

      // Carrega registros em paralelo
      const leads = [];
      const BATCH = 12;
      for (let i = 0; i < pageKeys.length; i += BATCH) {
        const batch = pageKeys.slice(i, i + BATCH);
        const got = await Promise.allSettled(batch.map((k) => store.get(k, {type: 'json'})));
        for (let j = 0; j < got.length; j++) {
          const g = got[j];
          if (g.status === 'fulfilled' && g.value) {
            leads.push(toUnifiedLead(g.value, batch[j]));
          }
        }
      }
      return json({ok: true, leads, total: search ? filtered.length : total, totalAll: total});
    } catch (err) {
      return json({error: 'Falha ao listar leads frios: ' + err.message}, 500);
    }
  }

  // ============================================================
  // IMPORTAR EM LOTE (POST)
  // ============================================================
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

    const entries = Array.isArray(body.entries) ? body.entries : [];
    const source = String(body.source || 'import-manual');
    if (entries.length === 0) return json({error: 'Nenhuma entrada fornecida'}, 400);
    if (entries.length > 800) return json({error: 'Lote muito grande. Envie em chunks de até 500.'}, 400);

    let importedNew = 0;
    let merged = 0;
    let invalid = 0;
    const errors = [];

    // Normaliza entradas
    const candidates = [];
    for (const e of entries) {
      const email = normEmail(e.email);
      const phone = normPhone(e.whatsapp);
      const hasEmail = isValidEmail(email);
      const hasPhone = isValidPhone(phone);
      if (!hasEmail && !hasPhone) { invalid++; continue; }
      candidates.push({
        email: hasEmail ? email : null,
        whatsapp: hasPhone ? phone : null,
        nome: String(e.nome || '').trim(),
        source: String(e.source || source),
        emailStatus: e.emailStatus || null,
      });
    }

    // Processa um a um pra evitar conflitos de merge concorrente no mesmo registro
    for (const c of candidates) {
      try {
        const result = await upsertLead(store, c);
        if (result === 'new') importedNew++;
        else if (result === 'merged') merged++;
      } catch (err) {
        invalid++;
        if (errors.length < 5) errors.push(String(err.message || 'erro').slice(0, 200));
      }
    }

    return json({
      ok: true,
      imported: importedNew,
      merged,
      invalid,
      total: entries.length,
      errors,
    });
  }

  // ============================================================
  // PATCH (editar campos de 1 lead) e MERGE (mesclar 2+ leads)
  // ============================================================
  if (req.method === 'PATCH') {
    let body;
    try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

    // Modo MERGE: ?action=merge no querystring, body { leadIds: [...], primaryId: '...' }
    const url = new URL(req.url);
    if (url.searchParams.get('action') === 'merge') {
      const leadIds = Array.isArray(body.leadIds) ? body.leadIds.filter(Boolean) : [];
      const primaryId = body.primaryId || leadIds[0];
      if (leadIds.length < 2) return json({error: 'Selecione pelo menos 2 leads pra mesclar'}, 400);
      if (!leadIds.includes(primaryId)) return json({error: 'primaryId deve estar em leadIds'}, 400);

      try {
        const leads = [];
        for (const id of leadIds) {
          let lead = await safeGet(store, `${KEY_LEAD}${id}`);
          // Suporta também id no formato antigo (cold:e:foo ou cold:p:bar)
          if (!lead && (id.startsWith('cold:e:') || id.startsWith('cold:p:'))) {
            const old = await safeGet(store, id);
            if (old) lead = migrateOldLead(old);
          }
          if (lead) leads.push({lead, id});
        }
        if (leads.length < 2) return json({error: 'Pelo menos 2 leads não foram encontrados'}, 404);

        const primary = leads.find((l) => l.id === primaryId)?.lead || leads[0].lead;
        const others = leads.filter((l) => l.lead.id !== primary.id).map((l) => l.lead);

        // Mescla: junta arrays + preserva primary como base
        const mergedEmails = [...new Set([...(primary.emails || []), ...others.flatMap((o) => o.emails || [])])];
        const mergedPhones = [...new Set([...(primary.whatsapps || []), ...others.flatMap((o) => o.whatsapps || [])])];
        const mergedSources = [...new Set([...(primary.sources || []), ...others.flatMap((o) => o.sources || [])])];

        const out = {
          ...primary,
          emails: mergedEmails,
          whatsapps: mergedPhones,
          sources: mergedSources,
          nome: primary.nome || others.find((o) => o.nome)?.nome || '',
          instagram: primary.instagram || others.find((o) => o.instagram)?.instagram || '',
          cidade: primary.cidade || others.find((o) => o.cidade)?.cidade || '',
          estado: primary.estado || others.find((o) => o.estado)?.estado || '',
          atuacao: primary.atuacao || others.find((o) => o.atuacao)?.atuacao || '',
          notes: [primary.notes, ...others.map((o) => o.notes)].filter(Boolean).join('\n---\n'),
          canal: mergedEmails.length && mergedPhones.length ? 'both' : (mergedEmails.length ? 'email' : 'whatsapp'),
          updatedAt: new Date().toISOString(),
          mergedFrom: others.map((o) => o.id),
        };
        // Salva o primary atualizado
        await store.setJSON(`${KEY_LEAD}${primary.id}`, out);
        // Re-aponta TODOS os índices pros e-mails/telefones pro primary
        for (const e of mergedEmails) await store.setJSON(`${KEY_IDXE}${e}`, {leadId: primary.id});
        for (const p of mergedPhones) await store.setJSON(`${KEY_IDXP}${p}`, {leadId: primary.id});
        // Apaga os outros leads (sem deletar os índices, já apontamos pro novo)
        for (const o of others) {
          try { await store.delete(`${KEY_LEAD}${o.id}`); } catch {}
        }
        return json({ok: true, mergedInto: primary.id, removed: others.length});
      } catch (err) {
        return json({error: err.message}, 500);
      }
    }

    // Modo EDIT: body { leadId, ...campos a atualizar }
    const leadId = body.leadId;
    if (!leadId) return json({error: 'Falta o leadId'}, 400);

    try {
      let existing = await safeGet(store, `${KEY_LEAD}${leadId}`);
      let isOldFormat = false;
      if (!existing && (leadId.startsWith('cold:e:') || leadId.startsWith('cold:p:'))) {
        const old = await safeGet(store, leadId);
        if (old) {
          existing = migrateOldLead(old);
          isOldFormat = true;
        }
      }
      if (!existing) return json({error: 'Lead não encontrado'}, 404);

      // Sanitiza arrays
      const cleanEmails = Array.isArray(body.emails)
        ? [...new Set(body.emails.map(normEmail).filter(isValidEmail))]
        : (existing.emails || []);
      const cleanPhones = Array.isArray(body.whatsapps)
        ? [...new Set(body.whatsapps.map(normPhone).filter(isValidPhone))]
        : (existing.whatsapps || []);

      const updated = {
        ...existing,
        emails: cleanEmails,
        whatsapps: cleanPhones,
        nome: body.nome !== undefined ? String(body.nome || '').trim() : existing.nome,
        instagram: body.instagram !== undefined ? String(body.instagram || '').trim().replace(/^@+/, '') : existing.instagram,
        cidade: body.cidade !== undefined ? String(body.cidade || '').trim() : existing.cidade,
        estado: body.estado !== undefined ? String(body.estado || '').trim().toUpperCase().slice(0, 2) : existing.estado,
        atuacao: body.atuacao !== undefined ? String(body.atuacao || '').trim() : existing.atuacao,
        notes: body.notes !== undefined ? String(body.notes || '') : existing.notes,
        unsubscribed: body.unsubscribed !== undefined ? !!body.unsubscribed : existing.unsubscribed,
        frequencia: body.frequencia !== undefined ? (body.frequencia === 'menor' ? 'menor' : 'normal') : existing.frequencia,
        updatedAt: new Date().toISOString(),
      };
      updated.canal = cleanEmails.length && cleanPhones.length ? 'both' : (cleanEmails.length ? 'email' : 'whatsapp');

      // Detecta diff em emails/phones pra atualizar índices
      const oldEmails = new Set(existing.emails || []);
      const oldPhones = new Set(existing.whatsapps || []);
      const newEmails = new Set(cleanEmails);
      const newPhones = new Set(cleanPhones);

      // Apaga índices removidos
      for (const e of oldEmails) {
        if (!newEmails.has(e)) {
          try { await store.delete(`${KEY_IDXE}${e}`); } catch {}
        }
      }
      for (const p of oldPhones) {
        if (!newPhones.has(p)) {
          try { await store.delete(`${KEY_IDXP}${p}`); } catch {}
        }
      }
      // Cria índices novos
      for (const e of newEmails) {
        if (!oldEmails.has(e)) {
          await store.setJSON(`${KEY_IDXE}${e}`, {leadId: updated.id});
        }
      }
      for (const p of newPhones) {
        if (!oldPhones.has(p)) {
          await store.setJSON(`${KEY_IDXP}${p}`, {leadId: updated.id});
        }
      }

      await store.setJSON(`${KEY_LEAD}${updated.id}`, updated);
      // Se era formato antigo, remove a chave antiga
      if (isOldFormat) try { await store.delete(leadId); } catch {}

      return json({ok: true, lead: updated});
    } catch (err) {
      return json({error: 'Falha ao atualizar: ' + err.message}, 500);
    }
  }

  // ============================================================
  // DELETE
  // ============================================================
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const email = (url.searchParams.get('email') || '').toLowerCase().trim();
    const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
    const leadId = url.searchParams.get('leadId');
    const sourceContains = (url.searchParams.get('sourceContains') || '').trim();

    if (leadId) {
      try {
        await deleteLeadById(store, leadId);
        return json({ok: true});
      } catch (err) { return json({error: err.message}, 500); }
    }
    if (email) {
      try {
        // Procura novo schema primeiro
        const ptr = await store.get(`${KEY_IDXE}${email}`, {type: 'json'});
        if (ptr?.leadId) {
          await deleteLeadById(store, ptr.leadId);
        }
        // Apaga old schema também (cold:e:)
        try { await store.delete(`cold:e:${email}`); } catch {}
        try { await store.delete(`cold:${email}`); } catch {} // versão muito antiga
        return json({ok: true});
      } catch (err) { return json({error: err.message}, 500); }
    }
    if (phone) {
      try {
        const ptr = await store.get(`${KEY_IDXP}${phone}`, {type: 'json'});
        if (ptr?.leadId) {
          await deleteLeadById(store, ptr.leadId);
        }
        try { await store.delete(`cold:p:${phone}`); } catch {}
        return json({ok: true});
      } catch (err) { return json({error: err.message}, 500); }
    }
    if (sourceContains) {
      try {
        const list = await store.list();
        const allKeys = (list.blobs || []).map((b) => b.key);
        const recordKeys = allKeys.filter((k) =>
          k.startsWith(KEY_LEAD) || k.startsWith('cold:e:') || k.startsWith('cold:p:')
        );
        let deleted = 0;
        const CONC = 12;
        for (let i = 0; i < recordKeys.length; i += CONC) {
          const batch = recordKeys.slice(i, i + CONC);
          const checks = await Promise.allSettled(batch.map(async (k) => {
            const v = await store.get(k, {type: 'json'});
            if (!v) return false;
            const sources = v.sources || (v.source ? [v.source] : []);
            const matched = sources.some((s) => s && String(s).includes(sourceContains));
            if (matched) {
              if (k.startsWith(KEY_LEAD)) {
                await deleteLeadById(store, k.slice(KEY_LEAD.length));
              } else {
                // Old schema: deleta direto
                await store.delete(k);
              }
              return true;
            }
            return false;
          }));
          for (const r of checks) {
            if (r.status === 'fulfilled' && r.value === true) deleted++;
          }
        }
        return json({ok: true, deleted});
      } catch (err) { return json({error: err.message}, 500); }
    }

    return json({error: 'Especifique email, phone, leadId ou sourceContains'}, 400);
  }

  return json({error: 'Method not allowed'}, 405);
};

// ============================================================
// UPSERT — núcleo da lógica de merge multi-email/telefone
// ============================================================
async function upsertLead(store, c) {
  // 1. Tenta achar registro existente por QUALQUER e-mail ou telefone candidato
  let existingLeadId = null;

  // Primeiro tenta pelos índices novos
  if (c.email) {
    const ptr = await safeGet(store, `${KEY_IDXE}${c.email}`);
    if (ptr?.leadId) existingLeadId = ptr.leadId;
  }
  if (!existingLeadId && c.whatsapp) {
    const ptr = await safeGet(store, `${KEY_IDXP}${c.whatsapp}`);
    if (ptr?.leadId) existingLeadId = ptr.leadId;
  }

  // Se não achou nos índices novos, tenta no schema antigo
  let oldKey = null;
  let oldLead = null;
  if (!existingLeadId) {
    if (c.email) {
      const v = await safeGet(store, `cold:e:${c.email}`);
      if (v) { oldLead = v; oldKey = `cold:e:${c.email}`; }
    }
    if (!oldLead && c.whatsapp) {
      const v = await safeGet(store, `cold:p:${c.whatsapp}`);
      if (v) { oldLead = v; oldKey = `cold:p:${c.whatsapp}`; }
    }
  }

  let existingLead = null;
  if (existingLeadId) {
    existingLead = await safeGet(store, `${KEY_LEAD}${existingLeadId}`);
  } else if (oldLead) {
    // Migra registro antigo pra novo schema
    existingLead = migrateOldLead(oldLead);
    existingLeadId = existingLead.id;
    await store.setJSON(`${KEY_LEAD}${existingLeadId}`, existingLead);
    // Cria índices pros e-mails/telefones do registro migrado
    for (const e of existingLead.emails) {
      await store.setJSON(`${KEY_IDXE}${e}`, {leadId: existingLeadId});
    }
    for (const p of existingLead.whatsapps) {
      await store.setJSON(`${KEY_IDXP}${p}`, {leadId: existingLeadId});
    }
    // Remove a chave antiga
    try { await store.delete(oldKey); } catch {}
  }

  if (existingLead) {
    // MERGE: adiciona e-mail/telefone novos aos arrays, atualiza outros campos
    const newEmails = c.email && !existingLead.emails.includes(c.email)
      ? [...existingLead.emails, c.email]
      : existingLead.emails;
    const newPhones = c.whatsapp && !existingLead.whatsapps.includes(c.whatsapp)
      ? [...existingLead.whatsapps, c.whatsapp]
      : existingLead.whatsapps;

    const oldSources = existingLead.sources || [];
    const newSources = oldSources.includes(c.source) ? oldSources : [...oldSources, c.source];

    const updated = {
      ...existingLead,
      emails: newEmails,
      whatsapps: newPhones,
      nome: (c.nome && c.nome.trim()) ? c.nome : existingLead.nome,
      emailStatus: c.emailStatus || existingLead.emailStatus,
      sources: newSources,
      updatedAt: new Date().toISOString(),
    };
    updated.canal = newEmails.length && newPhones.length ? 'both' : (newEmails.length ? 'email' : 'whatsapp');

    await store.setJSON(`${KEY_LEAD}${existingLeadId}`, updated);

    // Atualiza índices pros e-mails/telefones que ainda não tinham ponteiro
    if (c.email && !existingLead.emails.includes(c.email)) {
      await store.setJSON(`${KEY_IDXE}${c.email}`, {leadId: existingLeadId});
    }
    if (c.whatsapp && !existingLead.whatsapps.includes(c.whatsapp)) {
      await store.setJSON(`${KEY_IDXP}${c.whatsapp}`, {leadId: existingLeadId});
    }
    return 'merged';
  }

  // Cria novo registro
  const leadId = makeLeadId(c.email, c.whatsapp);
  const emails = c.email ? [c.email] : [];
  const whatsapps = c.whatsapp ? [c.whatsapp] : [];
  const lead = {
    id: leadId,
    emails,
    whatsapps,
    nome: c.nome,
    source: c.source,
    sources: [c.source],
    emailStatus: c.emailStatus,
    tipo: 'frio',
    canal: emails.length && whatsapps.length ? 'both' : (emails.length ? 'email' : 'whatsapp'),
    importedAt: new Date().toISOString(),
    unsubscribed: false,
    frequencia: 'normal',
    convertedToHotAt: null,
  };

  await store.setJSON(`${KEY_LEAD}${leadId}`, lead);
  for (const e of emails) await store.setJSON(`${KEY_IDXE}${e}`, {leadId});
  for (const p of whatsapps) await store.setJSON(`${KEY_IDXP}${p}`, {leadId});

  return 'new';
}

async function deleteLeadById(store, leadId) {
  const lead = await safeGet(store, `${KEY_LEAD}${leadId}`);
  if (!lead) return;
  for (const e of (lead.emails || [])) {
    try { await store.delete(`${KEY_IDXE}${e}`); } catch {}
  }
  for (const p of (lead.whatsapps || [])) {
    try { await store.delete(`${KEY_IDXP}${p}`); } catch {}
  }
  try { await store.delete(`${KEY_LEAD}${leadId}`); } catch {}
}

async function safeGet(store, key) {
  try { return await store.get(key, {type: 'json'}); } catch { return null; }
}

// Converte registro do schema antigo (1 email + 1 phone) pro novo (arrays)
function migrateOldLead(old) {
  const emails = old.email ? [old.email] : [];
  const whatsapps = old.whatsapp ? [old.whatsapp] : [];
  const id = makeLeadId(old.email, old.whatsapp);
  return {
    id,
    emails,
    whatsapps,
    nome: old.nome || '',
    source: old.source || '',
    sources: old.sources || (old.source ? [old.source] : []),
    emailStatus: old.emailStatus || null,
    tipo: 'frio',
    canal: emails.length && whatsapps.length ? 'both' : (emails.length ? 'email' : 'whatsapp'),
    importedAt: old.importedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unsubscribed: !!old.unsubscribed,
    frequencia: old.frequencia || 'normal',
    convertedToHotAt: old.convertedToHotAt || null,
  };
}

// Normaliza qualquer registro (novo ou antigo) pro formato unificado que o front entende
function toUnifiedLead(v, key) {
  // Se é novo schema, já tem arrays
  if (Array.isArray(v.emails) || Array.isArray(v.whatsapps)) {
    return {
      ...v,
      emails: v.emails || [],
      whatsapps: v.whatsapps || [],
      // backwards-compat pro UI atual
      email: (v.emails || [])[0] || null,
      whatsapp: (v.whatsapps || [])[0] || null,
    };
  }
  // Schema antigo: cria arrays a partir dos campos singulares
  return {
    ...v,
    id: v.id || key,
    emails: v.email ? [v.email] : [],
    whatsapps: v.whatsapp ? [v.whatsapp] : [],
    email: v.email || null,
    whatsapp: v.whatsapp || null,
    sources: v.sources || (v.source ? [v.source] : []),
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
