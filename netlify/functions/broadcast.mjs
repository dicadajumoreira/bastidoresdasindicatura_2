// Netlify Function v2 · POST /api/broadcast
// Disparo de e-mail em massa, com PAGINAÇÃO. O frontend chama essa função
// repetidamente (offset/limit) até processar todos os destinatários, pra
// não exceder o tempo limite da serverless function.
//
// Body esperado:
// {
//   subject: string,
//   html: string,                     // pode usar {{nome}} e {{material}}
//   filter: {
//     excludeOrigens?: string[],
//     includeOrigens?: string[],
//     statuses?: string[],
//     states?: string[],
//   },
//   offset?: number,                  // padrão 0
//   limit?: number,                   // padrão 40 (cabe em ~6s)
//   broadcastId?: string,             // id da campanha (frontend gera no 1º call)
//   test?: { email: string },         // modo teste, manda só pra esse e-mail
// }
//
// Resposta:
// { ok: true, sent: N, failed: N, processed: N, total: N, hasMore: bool, nextOffset: N }

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';
import { buildLeads } from '../lib/leads-index.mjs';
import { makeUnsubscribeUrl } from '../lib/email-resend.mjs';

export const config = {
  path: ['/api/broadcast', '/.netlify/functions/broadcast'],
};

const FROM = 'Bastidores da Sindicatura <contato@dicadajumoreira.com.br>';

// Bloco de rodapé com redes sociais + descadastro. Anexado a TODO disparo.
// {{unsubscribe_url}} é substituído por uma URL única por destinatário.
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

const MATERIAL_NAMES = {
  'mentoria': 'a Mentoria',
  'checklist': 'o Checklist de Assembleia',
  'ebook-ia': 'o E-book de IA',
  'sindico-profissional': 'o E-book do Síndico Profissional',
  'sobrevivencia-whatsapp': 'o Manual do WhatsApp',
  '50-frases': 'o Guia das 50 Frases',
  'nr1': 'o Guia da NR-1',
  'conflitos': 'o Guia dos Conflitos',
  'saude-mental': 'o Guia de Saúde Mental',
  'gestao-sob-ataque': 'o Guia da Gestão sob Ataque',
  'terceirizados': 'o Guia dos Terceirizados em Condomínios',
  'carregadores': 'o Guia dos Carregadores elétricos em Condomínios',
  'bombeiro': 'o Guia do Bombeiro',
  'politico': 'o Guia do Político',
  'solitario': 'o Guia do Solitário',
  'burocrata': 'o Guia do Burocrata',
  'estrategista': 'o Guia do Estrategista',
  'sargento': 'o Guia do Sargento',
  'sorteio-mba': 'o Sorteio MBA IBMEC',
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  if (!process.env.RESEND_API_KEY) {
    return json({error: 'RESEND_API_KEY não configurada no ambiente do Netlify'}, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  // Total original do broadcast sendo retomado (usado pra detectar se o
  // disparo original tinha leads frios mas o filtro salvo não registrou).
  let resumeOrigTotal = 0;

  // ====== MODO RETOMAR DISPARO INCOMPLETO ======
  // Quando body.resumeFrom é setado, carrega subject/html/filter/broadcastId
  // do registro original e injeta no body antes do processamento normal.
  // O frontend só precisa mandar { resumeFrom, offset }.
  if (body.resumeFrom) {
    try {
      const histStore = getStore({name: 'broadcasts', consistency: 'strong'});
      const orig = await histStore.get(String(body.resumeFrom), {type: 'json'});
      if (!orig) return json({error: 'Disparo original não encontrado pra retomar'}, 404);
      if (!orig.subject || !orig.html) return json({error: 'Disparo original sem subject/html salvo (provavelmente foi feito antes desse recurso existir)'}, 500);
      body.subject = orig.subject;
      body.html = orig.html;
      body.filter = orig.filter || {};
      body.broadcastId = orig.id || String(body.resumeFrom);
      resumeOrigTotal = orig.total || 0;
    } catch (err) {
      return json({error: 'Falha ao ler disparo original: ' + err.message}, 500);
    }
  }

  // ====== MODO REENVIO DE FALHAS ======
  // Quando body.resendFailedFrom é setado, ignoramos subject/html/filter
  // e mandamos o MESMO conteúdo do disparo original APENAS pros e-mails
  // que falharam naquela campanha.
  const resendFailedFrom = body.resendFailedFrom ? String(body.resendFailedFrom) : null;

  let subject, html;
  if (resendFailedFrom) {
    try {
      const historyStore = getStore({name: 'broadcasts', consistency: 'strong'});
      const original = await historyStore.get(resendFailedFrom, {type: 'json'});
      if (!original) return json({error: 'Disparo original não encontrado pra reenvio'}, 404);
      subject = original.subject || '';
      html = original.html || '';
      if (!subject || !html) return json({error: 'Disparo original sem subject/html salvo'}, 500);
    } catch (err) {
      return json({error: 'Falha ao ler disparo original: ' + err.message}, 500);
    }
  } else {
    subject = String(body.subject || '').trim();
    html = String(body.html || '');
    if (!subject) return json({error: 'O assunto é obrigatório'}, 400);
    if (!html) return json({error: 'O corpo do e-mail é obrigatório'}, 400);
  }

  // ====== MODO TESTE ======
  if (body.test && body.test.email) {
    try {
      const unsubUrl = makeUnsubscribeUrl(body.test.email, 'broadcast') || '';
      await sendOne({
        from: FROM,
        to: [body.test.email],
        subject: personalize(subject, {nome: 'Teste', email: body.test.email, material: 'o material'}),
        html: personalize(html + BROADCAST_FOOTER, {nome: 'Teste', email: body.test.email, material: 'o material', unsubscribe_url: unsubUrl}),
        reply_to: 'contato@dicadajumoreira.com.br',
      });
      return json({ok: true, sent: 1, failed: 0, total: 1, test: true});
    } catch (e) {
      return json({error: e.message, ok: false, sent: 0, failed: 1, total: 1, test: true}, 500);
    }
  }

  // ====== MODO REAL (paginado) ======
  const offset = Math.max(0, parseInt(body.offset || 0, 10) || 0);
  const limit = Math.max(1, Math.min(60, parseInt(body.limit || 40, 10) || 40));
  const broadcastId = String(body.broadcastId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  try {
    let allTargets;
    // Estes vars são populados no modo NORMAL e usados depois pra salvar
    // histórico. No modo REENVIO ficam vazios (já que o reenvio não usa filtros).
    let excludeOrigens = new Set();
    let includeOrigens = null;
    let statuses = null;
    let states = null;
    // Breakdown dos motivos de filtragem (so populado no modo NORMAL).
    let breakdown = null;

    if (resendFailedFrom) {
      // ====== Modo REENVIO ======
      // Targets são os e-mails que falharam no broadcast original.
      // Lê do store broadcast-recipients com prefix do broadcastId original.
      const recipientsStore = getStore({name: 'broadcast-recipients', consistency: 'strong'});
      const list = await recipientsStore.list({prefix: `${resendFailedFrom}__`});
      const failed = [];
      const seenEmails = new Set(); // dedupe (pode haver tentativas múltiplas)
      const keys = (list.blobs || []).map((b) => b.key);
      for (const k of keys) {
        try {
          const part = await recipientsStore.get(k, {type: 'json'});
          if (Array.isArray(part)) {
            for (const r of part) {
              if (r.status === 'failed' && r.email && !seenEmails.has(r.email)) {
                seenEmails.add(r.email);
                failed.push(r);
              }
            }
          }
        } catch {}
      }
      // Converte pra formato de target que o resto da função espera
      allTargets = failed.map((r) => ({
        email: r.email,
        rep: {nome: r.nome || '', email: r.email},
        origens: ['mentoria'], // origem não importa no reenvio
      }));
      allTargets.sort((a, b) => a.email.localeCompare(b.email));
    } else {
      // ====== Modo NORMAL ======
      const store = getStore({name: 'leads', consistency: 'strong'});
      // Tenta carregar TODOS os leads (refresca o índice se truncado).
      // Em offsets > 0 confiamos no índice já populado: budget pequeno.
      let leads;
      let totalLeadsInStore;
      let attempts = 0;
      const maxAttempts = offset === 0 ? 4 : 1;
      while (attempts < maxAttempts) {
        attempts++;
        const r = await buildLeads(store, {budgetMs: 5000});
        leads = r.leads;
        totalLeadsInStore = r.total;
        if (!r.truncated && leads.length >= totalLeadsInStore) break;
        await new Promise((res) => setTimeout(res, 250));
      }
      if (offset === 0 && leads.length < totalLeadsInStore * 0.95) {
        return json({
          error: `Base de leads ainda não foi totalmente carregada (${leads.length} de ${totalLeadsInStore}). Aguarde alguns segundos e tente de novo (o índice está sendo construído em background).`,
          leadsLoaded: leads.length,
          totalInStore: totalLeadsInStore,
        }, 503);
      }

      // Dedupe por e-mail. Pula leads inativos:
      //  - deletadods (lixeira)
      //  - descadastrados via /sair (unsubscribed: true)
      //  - marcados como inativos no admin (ativo === false)
      // Marca frequencia: menor pra aplicar hash 1-em-4 depois.
      //
      // breakdown registra cada categoria filtrada — propagada pro front
      // exibir relatorio detalhado do disparo.
      breakdown = {
        hot: {
          total: leads.length,
          deletados: 0,
          descadastrados: 0, // unsubscribed: true
          inativos: 0,       // ativo: false (sem unsubscribed)
          semEmail: 0,
          freqMenorPulados: 0,
          excluidosPorOrigem: 0,
          excluidosPorEstado: 0,
          excluidosPorStatus: 0,
          duplicatasInternas: 0,
          finalElegiveis: 0,
        },
        cold: {
          total: 0,
          descadastrados: 0,
          bounces: 0,
          freqMenorPulados: 0,
          duplicatasComHot: 0,
          jaReceberam: 0, // quando filter.onlyNeverReceivedCold
          finalElegiveis: 0,
        },
      };
      const byEmail = new Map();
      for (const l of leads) {
        if (l.deletedAt) { breakdown.hot.deletados++; continue; }
        if (l.unsubscribed) { breakdown.hot.descadastrados++; continue; }
        if (l.ativo === false) { breakdown.hot.inativos++; continue; }
        const email = String(l.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) { breakdown.hot.semEmail++; continue; }
        if (!byEmail.has(email)) byEmail.set(email, {leads: [], origens: new Set(), frequenciaMenor: false});
        else breakdown.hot.duplicatasInternas++;
        const e = byEmail.get(email);
        e.leads.push(l);
        e.origens.add(l.origem || 'mentoria');
        // Basta UMA aplicacao do email ter freq=menor pra reduzir
        if (l.frequencia === 'menor') e.frequenciaMenor = true;
      }

      // Aplica hash 1-em-4 pros leads quentes com frequencia reduzida.
      // O hash usa broadcastId + email pra ser determinístico (mesmo
      // disparo, mesmo recipiente: mesma decisao — nao manda duplicado
      // no Continuar).
      const freqHashSeed = [...broadcastId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      for (const [email, entry] of byEmail) {
        if (entry.frequenciaMenor) {
          const emHash = [...email].reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, freqHashSeed);
          if (emHash % 4 !== 0) {
            byEmail.delete(email);
            breakdown.hot.freqMenorPulados++;
          }
        }
      }

      const filter = body.filter || {};
      excludeOrigens = new Set(filter.excludeOrigens || []);
      includeOrigens = filter.includeOrigens && filter.includeOrigens.length
        ? new Set(filter.includeOrigens) : null;
      statuses = filter.statuses && filter.statuses.length
        ? new Set(filter.statuses) : null;
      states = filter.states && filter.states.length
        ? new Set(filter.states) : null;

      allTargets = [];
      for (const [email, entry] of byEmail) {
        let excluded = false;
        for (const o of entry.origens) if (excludeOrigens.has(o)) { excluded = true; break; }
        if (excluded) { breakdown.hot.excluidosPorOrigem++; continue; }

        if (includeOrigens) {
          let any = false;
          for (const o of entry.origens) if (includeOrigens.has(o)) { any = true; break; }
          if (!any) { breakdown.hot.excluidosPorOrigem++; continue; }
        }

        const rep = entry.leads.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
        if (statuses && !statuses.has(rep.status || 'novo')) { breakdown.hot.excluidosPorStatus++; continue; }
        if (states && !states.has(rep.estado || '')) { breakdown.hot.excluidosPorEstado++; continue; }

        allTargets.push({email, rep, origens: [...entry.origens]});
      }
      breakdown.hot.finalElegiveis = allTargets.length;

      // ====== AUTO-DETECÇÃO PRA RETOMAR DISPARO ANTIGO ======
      // Se estamos retomando um disparo (resumeFrom) e o total atual de
      // leads quentes é MUITO menor que o total salvo no histórico,
      // significa que o disparo original incluía leads frios mas o filtro
      // salvo não registrou (bug histórico — broadcasts antes de junho/2026
      // não persistiam includeCold). Force includeCold=true pra
      // reconstruir os mesmos destinatários do disparo original.
      //
      // forceIncludeCold no body sobrescreve TUDO — a usuária pode forçar
      // inclusão via UI mesmo quando a auto-detecção não captura (caso de
      // histórico com total corrompido por tentativas anteriores).
      let effectiveIncludeCold = !!(body.filter && body.filter.includeCold);
      if (body.forceIncludeCold) effectiveIncludeCold = true;
      if (body.resumeFrom && resumeOrigTotal > 0 && allTargets.length < resumeOrigTotal * 0.7) {
        effectiveIncludeCold = true;
      }

      // filter.onlyCold = true → descarta TODOS os leads quentes coletados
      // ate aqui. Combinado com effectiveIncludeCold=true (forcado abaixo),
      // manda so pros frios. Util pra campanha de "deixa eu me apresentar"
      // que so faz sentido pra quem nunca ouviu falar do Bastidores.
      if (filter && filter.onlyCold) {
        breakdown.hot = {
          total: breakdown.hot.total, deletados: 0, descadastrados: 0, inativos: 0,
          semEmail: 0, freqMenorPulados: 0, excluidosPorOrigem: 0,
          excluidosPorEstado: 0, excluidosPorStatus: 0, duplicatasInternas: 0,
          finalElegiveis: 0, skippedByOnlyCold: allTargets.length,
        };
        allTargets = [];
        effectiveIncludeCold = true;
      }

      // ====== LEADS FRIOS (opcional) ======
      // Lê do índice resumo (cold-leads-summary) construído por uma
      // background function. UMA leitura de blob em vez de escanear 14k
      // registros. Frequência menor recebe 1 a cada 4 disparos (hash
      // determinístico por email × broadcastId).
      if (effectiveIncludeCold) {
        try {
          const summaryStore = getStore({name: 'cold-leads-summary', consistency: 'strong'});
          const summary = await summaryStore.get('summary', {type: 'json'});
          if (!summary || !Array.isArray(summary.entries)) {
            return json({
              error: 'Índice de leads frios ainda não foi construído. Vai em "Leads frios" no admin e clica em "Reconstruir índice", aguarda 1-2 minutos, depois tenta de novo.',
              needsColdIndex: true,
            }, 400);
          }
          const seenEmails = new Set(allTargets.map((t) => t.email));
          const hashSeed = [...broadcastId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
          // Filtro opcional: enviar SO pros cold leads que nunca receberam.
          const onlyNeverReceived = !!(filter && filter.onlyNeverReceivedCold);
          breakdown.cold.total = summary.entries.length;
          const coldStartCount = allTargets.length;
          for (const entry of summary.entries) {
            if (entry.unsubscribed) { breakdown.cold.descadastrados++; continue; }
            if (entry.status && String(entry.status).toLowerCase().includes("can't send")) {
              breakdown.cold.bounces++; continue;
            }
            const email = entry.email;
            if (!email) continue;
            if (seenEmails.has(email)) { breakdown.cold.duplicatasComHot++; continue; }
            if (onlyNeverReceived && entry.firstBroadcastAt) { breakdown.cold.jaReceberam++; continue; }
            if (entry.frequencia === 'menor') {
              const emHash = [...email].reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, hashSeed);
              if (emHash % 4 !== 0) { breakdown.cold.freqMenorPulados++; continue; }
            }
            seenEmails.add(email);
            allTargets.push({email, rep: {nome: entry.nome || '', email}, origens: ['cold']});
          }
          breakdown.cold.finalElegiveis = allTargets.length - coldStartCount;
        } catch (e) {
          console.error('[broadcast] cold summary load failed:', e.message);
        }
      }

      // Ordem estável: por email pra paginação consistente entre calls
      allTargets.sort((a, b) => a.email.localeCompare(b.email));
    }

    const total = allTargets.length;
    const slice = allTargets.slice(offset, offset + limit);
    const processed = slice.length;

    // Resend rate limit: 5 req/s. Pra ficar SEM RAJADA (causa de 429
    // mesmo respeitando a média), enviamos sequencialmente, 1 e-mail por
    // vez, com 250ms entre cada = ~4 req/s constantes.
    const RATE_DELAY_MS = 250;
    let sent = 0, failed = 0;
    const errors = [];
    const recipientsLog = [];

    for (let i = 0; i < slice.length; i++) {
      const t = slice[i];
      const sentAt = new Date().toISOString();
      const firstName = String(t.rep.nome || '').trim().split(/\s+/)[0] || '';
      const primaryOrigem = t.origens[0];
      const vars = {
        nome: firstName || 'aí',
        email: t.email,
        material: MATERIAL_NAMES[primaryOrigem] || 'o material',
      };
      const unsubUrl = makeUnsubscribeUrl(t.email, 'broadcast') || '';
      const personalizedHtml = personalize(html + BROADCAST_FOOTER, {...vars, unsubscribe_url: unsubUrl});
      try {
        await sendOne({
          from: FROM,
          to: [t.email],
          subject: personalize(subject, vars),
          html: personalizedHtml,
          reply_to: 'contato@dicadajumoreira.com.br',
        });
        sent++;
        recipientsLog.push({email: t.email, nome: t.rep.nome || '', status: 'sent', sentAt});
      } catch (e) {
        failed++;
        const errMsg = String(e.message || 'erro').slice(0, 200);
        if (errors.length < 5) errors.push(errMsg);
        recipientsLog.push({email: t.email, nome: t.rep.nome || '', status: 'failed', sentAt, error: errMsg});
      }
      // Pausa entre envios (exceto o último)
      if (i < slice.length - 1) {
        await new Promise((res) => setTimeout(res, RATE_DELAY_MS));
      }
    }

    // Salva log detalhado de destinatários desta chamada
    try {
      const recipientsStore = getStore({name: 'broadcast-recipients', consistency: 'strong'});
      await recipientsStore.setJSON(`${broadcastId}__${String(offset).padStart(7, '0')}`, recipientsLog);
    } catch (e) {
      console.error('[broadcast] failed to save recipients log:', e.message);
    }

    // Propaga sent/failed pros cold leads em background. Atualiza os blobs
    // com firstBroadcastAt/lastBroadcastAt (sent) e emailStatus Can't send
    // + ativo:false (failed). Assim o proximo disparo ja sabe quem
    // recebeu e pula os que deram bounce.
    if (recipientsLog.length > 0) {
      try {
        const origin = new URL(req.url).origin;
        fetch(`${origin}/.netlify/functions/cold-leads-mark-broadcast-background`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({recipientsLog}),
        }).catch(() => {});
      } catch (e) {
        console.error('[broadcast] cold mark trigger failed:', e.message);
      }
    }

    // Lê existing antes de calcular preservedTotal/hasMore
    let existing = null;
    try {
      const histStorePre = getStore({name: 'broadcasts', consistency: 'strong'});
      existing = await histStorePre.get(broadcastId, {type: 'json'});
    } catch {}

    // Preserva o MAIOR total já visto pra esse broadcastId. Protege contra
    // resumes que computam allTargets menor (ex.: filtro salvo não tinha
    // includeCold) e iam sobrescrever 11071 por 6500 e marcar como
    // completo erroneamente.
    const preservedTotal = Math.max(existing?.total || 0, total, resumeOrigTotal);
    const nextOffset = offset + processed;
    const hasMore = nextOffset < preservedTotal;

    // Atualiza histórico cumulativamente (best-effort)
    try {
      const histStore = getStore({name: 'broadcasts', consistency: 'strong'});
      const filterSummary = [];
      if (resendFailedFrom) {
        filterSummary.push(`reenvio dos que falharam · origem ${resendFailedFrom}`);
      } else {
        if (excludeOrigens.size) filterSummary.push(`excluir ${[...excludeOrigens].join(', ')}`);
        if (includeOrigens) filterSummary.push(`incluir ${[...includeOrigens].join(', ')}`);
        if (statuses) filterSummary.push(`status ${[...statuses].join(', ')}`);
        if (states) filterSummary.push(`UF ${[...states].join(', ')}`);
      }
      await histStore.setJSON(broadcastId, {
        id: broadcastId,
        sentAt: existing?.sentAt || new Date().toISOString(),
        subject,
        html,
        sent: (existing?.sent || 0) + sent,
        failed: (existing?.failed || 0) + failed,
        total: preservedTotal,
        filter: resendFailedFrom ? {resendFailedFrom} : {
          excludeOrigens: [...excludeOrigens],
          includeOrigens: includeOrigens ? [...includeOrigens] : null,
          statuses: statuses ? [...statuses] : null,
          states: states ? [...states] : null,
          includeCold: !!(body.filter && body.filter.includeCold) || !!body.forceIncludeCold || !!(existing?.filter && existing.filter.includeCold),
        },
        filterSummary: filterSummary.join(' · ') || 'todos os leads',
        completed: !hasMore,
        lastBatchAt: new Date().toISOString(),
        resendOf: resendFailedFrom || null,
        // Breakdown da primeira passada (quando montamos allTargets).
        // Resumes nao recomputam isso — preserva o que ja tinha.
        breakdown: existing?.breakdown || breakdown,
      });
    } catch (e) {
      console.error('[broadcast] failed to save history:', e.message);
    }

    return json({
      ok: true,
      sent,
      failed,
      processed,
      total: preservedTotal,
      offset,
      nextOffset,
      hasMore,
      broadcastId,
      errors,
      // breakdown so existe na primeira chamada (quando montamos allTargets);
      // calls seguintes (paginacao) nao tem o breakdown.
      breakdown,
    });

  } catch (err) {
    return json({error: 'Falha no disparo: ' + (err && err.message || 'erro desconhecido')}, 500);
  }
};

async function sendOne(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${t.slice(0, 200)}`);
  }
}

function personalize(template, vars) {
  return String(template == null ? '' : template).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
