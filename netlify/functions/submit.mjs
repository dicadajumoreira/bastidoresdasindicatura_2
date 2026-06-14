// Netlify Function v2 · POST /api/submit
// Recebe uma aplicação (qualquer formulário) e salva no Netlify Blobs.
//
// O Blobs é o BANCO real e persistente (sobrevive a deploys). Gravamos no
// store principal "leads" com retry e, por segurança, uma cópia redundante
// em "leads-backup". Se a gravação principal falhar de vez, devolvemos erro —
// o front avisa o usuário pra refazer, então nenhum cadastro se perde em
// silêncio.
//
// Obs.: o Netlify Forms NÃO captura estes envios porque o site usa
// skip_processing (necessário pro preview de OG/WhatsApp das landings), o que
// desliga a detecção de forms do Netlify. Por isso o banco é o Blobs, lido
// pelo /admin/.

import { getStore } from '@netlify/blobs';
import { sendEmails } from '../lib/email-resend.mjs';

export const config = {
  path: ['/api/submit', '/.netlify/functions/submit'],
};

const VALID_ORIGENS = new Set(['mentoria', 'checklist', 'ebook-ia', 'sindico-profissional', 'sobrevivencia-whatsapp', '50-frases', 'nr1', 'conflitos', 'saude-mental', 'gestao-sob-ataque', 'bombeiro', 'politico', 'solitario', 'burocrata', 'estrategista', 'sargento', 'sorteio-mba']);

// Origens de material gratuito (isca): exigem os 7 campos do formulário padrão.
const MATERIAL_ORIGENS = new Set(['checklist', 'ebook-ia', 'sindico-profissional', 'sobrevivencia-whatsapp', '50-frases', 'nr1', 'conflitos', 'saude-mental', 'gestao-sob-ataque', 'bombeiro', 'politico', 'solitario', 'burocrata', 'estrategista', 'sargento', 'sorteio-mba']);

async function saveWithRetry(store, id, lead, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { await store.setJSON(id, lead); return; }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 200 * (i + 1))); }
  }
  throw lastErr;
}

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  // Validação por tipo de formulário
  const origem = VALID_ORIGENS.has(body.origem) ? body.origem : 'mentoria';

  // ENCERRAMENTO: sorteio do MBA fechou às 23h59 de 12/06/2026 (Brasília).
  // Bloqueia qualquer cadastro nessa origem depois disso, mesmo se alguém
  // tentar burlar o frontend (edição local, Postman, etc).
  const SORTEIO_MBA_CUTOFF_MS = Date.UTC(2026, 5, 13, 2, 59, 59); // 13/06 02:59:59 UTC = 12/06 23h59 BRT
  if (origem === 'sorteio-mba' && Date.now() >= SORTEIO_MBA_CUTOFF_MS) {
    return json({
      error: 'As inscrições do sorteio do MBA Executivo IBMEC foram encerradas em 12/06/2026 às 23h59 (Brasília). O sorteio acontece ao vivo no Instagram @dicadajumoreira.',
      closed: true,
    }, 403);
  }

  // Campos obrigatórios padronizados em TODOS os formulários:
  // nome, cidade, estado, e-mail, WhatsApp, Instagram, atuação, data de nascimento.
  // Mentoria adicionalmente exige 'modalidade'; quiz adiciona perfil/perfil_nome.
  const baseRequired = ['nome', 'cidade', 'estado', 'email', 'whatsapp', 'instagram', 'atuacao', 'data_nascimento'];
  const required = origem === 'mentoria' ? [...baseRequired, 'modalidade'] : baseRequired;

  for (const k of required) {
    if (!body[k] || String(body[k]).trim() === '') {
      return json({error: `Campo obrigatório ausente: ${k}`}, 400);
    }
  }

  // Gera id único
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const lead = {
    id,
    createdAt: new Date().toISOString(),
    status: 'novo',  // novo | lido | respondido | convidado | recusado
    notes: '',
    origem,          // mentoria | checklist | ebook-ia | sindico-profissional | sobrevivencia-whatsapp | 50-frases | nr1
    ...body,
  };

  // 1) Gravação principal (com retry). Se falhar de vez, devolve erro: o front
  //    mostra "tente novamente" e NÃO entrega o PDF, então o lead não some.
  try {
    const store = getStore({name: 'leads', consistency: 'strong'});
    await saveWithRetry(store, id, lead);
  } catch (err) {
    return json({error: 'Não foi possível salvar agora. Por favor, tente novamente.'}, 500);
  }

  // 2) Cópia redundante de segurança (best-effort: não derruba o cadastro).
  try {
    const backup = getStore({name: 'leads-backup', consistency: 'strong'});
    await backup.setJSON(id, lead);
  } catch { /* o principal já está salvo */ }

  // 3) Disparo de e-mails via Resend (best-effort, em paralelo, com
  //    timeout próprio dentro do módulo). Se falhar, NÃO derruba o
  //    cadastro nem atrasa demais a resposta pro front.
  try {
    await sendEmails(lead);
  } catch (err) {
    console.error('[submit] sendEmails failed:', err.message);
  }

  return json({ok: true, id});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
