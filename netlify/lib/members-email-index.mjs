// Lib compartilhada: encontra um lead quente por e-mail.
// Estratégia híbrida pra ser SEMPRE rápido:
//   1. Tenta o índice (cache em 1 blob). Se hit, retorna na hora.
//   2. Se cache não existe ou e-mail não está nele, faz scan direto
//      com paralelismo ALTO (BATCH=60). Early exit na primeira match.
//   3. Após scan, se encontrou, atualiza incrementalmente o índice
//      pra próxima consulta ser instantânea.
//
// Cabe folgado nos 10s da function pra ~6.5k leads. Pra bases maiores,
// rodar a função members-email-index-build-background manualmente.

import { getStore } from '@netlify/blobs';

export async function findLeadByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return {lead: null, indexMissing: false};

  const indexStore = getStore({name: 'members-email-index', consistency: 'strong'});

  // 1) Cache hit
  let index = null;
  try {
    index = await indexStore.get('index', {type: 'json'});
    if (index && index.byEmail && index.byEmail[normalized]) {
      const entry = index.byEmail[normalized];
      if (entry.unsubscribed || entry.ativo === false) {
        return {lead: null, indexMissing: false};
      }
      const merged = {perfil: null, perfil_nome: null, mentoria: false, mentoriaModalidade: null, ...entry};
      // Se o cache diz mentoria:false MAS existe id, faz uma checagem
      // direta no blob da lead pra cobrir o caso de cache stale (raro,
      // mas catastrófico pra UX da Sala da Mentoria). Custo: 1 read.
      if (!merged.mentoria && merged.id) {
        try {
          const leadsStore = getStore({name: 'leads', consistency: 'strong'});
          const fresh = await leadsStore.get(merged.id, {type: 'json'});
          if (fresh && fresh.mentoria === true && !fresh.unsubscribed && fresh.ativo !== false) {
            merged.mentoria = true;
            merged.mentoriaModalidade = fresh.mentoriaModalidade || 'experience';
            // Atualiza o cache pra próxima chamada
            try {
              index.byEmail[normalized] = {...entry, mentoria: true, mentoriaModalidade: merged.mentoriaModalidade};
              index.lastIncrementalAt = new Date().toISOString();
              await indexStore.setJSON('index', index);
            } catch {}
          }
        } catch (err) {
          console.error('[members-email-index] fresh mentoria check failed:', err.message);
        }
      }
      return {lead: merged, indexMissing: false};
    }
  } catch (err) {
    console.error('[members-email-index] cache read failed:', err.message);
  }

  // 2) Scan direto com paralelismo alto. Junta dados de TODOS os
  //    cadastros do mesmo e-mail (uma pessoa pode ter feito o quiz E
  //    pedido outros materiais — precisamos do perfil do quiz quando
  //    existe).
  let lead = null;
  let perfil = null;
  let perfil_nome = null;
  let mentoria = false;
  let mentoriaModalidade = null;
  let anyInactive = false;
  try {
    const leads = getStore({name: 'leads', consistency: 'strong'});
    const list = await leads.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__');
    const CONC = 60;
    const deadline = Date.now() + 7500; // 7.5s budget (deixa folga pro resto)
    let foundActive = false;
    for (let i = 0; i < keys.length; i += CONC) {
      if (Date.now() > deadline) {
        return {lead: null, indexMissing: true};
      }
      const batch = keys.slice(i, i + CONC);
      const got = await Promise.allSettled(batch.map((k) => leads.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const v = r.value;
        if (v.deletedAt) continue;
        if (String(v.email || '').toLowerCase() !== normalized) continue;
        if (v.unsubscribed || v.ativo === false) { anyInactive = true; continue; }
        foundActive = true;
        if (!lead) {
          lead = {
            id: v.id,
            nome: v.nome || '',
            unsubscribed: !!v.unsubscribed,
            ativo: v.ativo !== false,
            createdAt: v.createdAt,
          };
        }
        if (!perfil && v.perfil) perfil = v.perfil;
        if (!perfil_nome && v.perfil_nome) perfil_nome = v.perfil_nome;
        if (v.mentoria === true) {
          mentoria = true;
          // 'executive' tem prioridade sobre 'experience' se houver
          // múltiplas aplicações marcadas
          if (v.mentoriaModalidade === 'executive') mentoriaModalidade = 'executive';
          else if (!mentoriaModalidade && v.mentoriaModalidade) mentoriaModalidade = v.mentoriaModalidade;
        }
      }
      if (lead && perfil_nome && mentoria) break;
    }
    if (lead) {
      lead.perfil = perfil;
      lead.perfil_nome = perfil_nome;
      lead.mentoria = mentoria;
      lead.mentoriaModalidade = mentoriaModalidade || (mentoria ? 'experience' : null);
    }
    // Se TODAS as aplicações do e-mail estão inativas, retornamos null
    // pra bloquear o login.
    if (!foundActive && anyInactive) {
      return {lead: null, indexMissing: false};
    }
  } catch (err) {
    console.error('[members-email-index] scan failed:', err.message);
  }

  // 3) Atualiza cache incrementalmente pra próxima vez ser instantânea
  if (lead) {
    try {
      const current = index && index.byEmail
        ? index
        : {builtAt: new Date().toISOString(), byEmail: {}, count: 0};
      // Preserva mentoria se já existia no cache (admin pode ter marcado
      // depois e o scan poderia não ter pego ainda)
      const previousMentoria = current.byEmail && current.byEmail[normalized] && current.byEmail[normalized].mentoria;
      current.byEmail[normalized] = {...lead, mentoria: lead.mentoria || !!previousMentoria};
      current.count = Object.keys(current.byEmail).length;
      current.lastIncrementalAt = new Date().toISOString();
      await indexStore.setJSON('index', current);
    } catch (err) {
      console.error('[members-email-index] cache write failed:', err.message);
    }
  }

  return {lead, indexMissing: false};
}
