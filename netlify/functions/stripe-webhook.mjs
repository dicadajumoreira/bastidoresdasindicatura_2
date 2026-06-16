// Netlify Function v2 · POST /api/stripe-webhook
//
// Recebe eventos do Stripe (configurar em Dashboard > Developers > Webhooks).
// Quando vem checkout.session.completed, cria/atualiza o lead quente:
//   - origem: 'mentoria-paga'
//   - mentoria: true + modalidade do plano comprado
//   - dados do aluno do metadata da sessao
// E manda e-mail de boas-vindas com instrucao pra criar senha na Area
// de Membros.
//
// Variaveis de ambiente esperadas:
//   STRIPE_SECRET_KEY      — sk_live_... ou sk_test_...
//   STRIPE_WEBHOOK_SECRET  — whsec_... (gerado ao criar o webhook no
//                            Dashboard do Stripe)

import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { sign } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/stripe-webhook', '/.netlify/functions/stripe-webhook'],
};

const SITE = 'https://bastidoresdasindicatura.com.br';
const FROM = 'Bastidores da Sindicatura <contato@dicadajumoreira.com.br>';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Stripe env vars não configuradas', {status: 500});
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers.get('stripe-signature') || '';
  const rawBody = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('[stripe-webhook] assinatura invalida:', err.message);
    return new Response('Invalid signature', {status: 400});
  }

  // Evento principal: pagamento confirmado.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      await processCheckoutCompleted(stripe, session);
    } catch (err) {
      console.error('[stripe-webhook] erro processando session:', err.message);
      // Stripe vai retentar se a gente devolver 5xx — entao nao chega
      // 500 aqui pra evitar duplicar lead. Loga o erro.
    }
  }
  // payment_intent.payment_failed pra ter visibilidade de falhas (apenas log).
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    console.warn('[stripe-webhook] pagamento falhou:', pi.id, pi.last_payment_error?.message);
  }

  return new Response('ok', {status: 200});
};

async function processCheckoutCompleted(stripe, session) {
  // Garante que o pagamento foi quitado (Pix e cartao quitam quando
  // checkout.session.completed eh disparado com payment_status=paid).
  if (session.payment_status !== 'paid') {
    console.warn('[stripe-webhook] session completed mas nao paid:', session.id, session.payment_status);
    return;
  }

  const meta = session.metadata || {};
  const email = String(meta.email || session.customer_email || '').trim().toLowerCase();
  if (!email) throw new Error('session sem email');

  const modalidade = meta.modalidade === 'executive' ? 'executive' : 'experience';
  const nome = meta.nome || '';

  // Idempotencia: ja processamos esse session.id antes? (caso o Stripe
  // re-tente o webhook por timeout/network). Usa a store de leads-backup
  // como cache rapido.
  const leadsStore = getStore({name: 'leads', consistency: 'strong'});
  const idempotencyKey = `stripe:${session.id}`;
  try {
    const seen = await leadsStore.get(idempotencyKey, {type: 'json'});
    if (seen) {
      console.log('[stripe-webhook] sessao ja processada:', session.id);
      return;
    }
  } catch {}

  // Cria/atualiza o lead. Se ja existe um lead com mesmo email, soma
  // mentoria=true em vez de duplicar.
  let leadId;
  try {
    const list = await leadsStore.list();
    const keys = (list.blobs || []).map((b) => b.key).filter((k) => k !== '__leads_index__' && !k.startsWith('stripe:'));
    const CONC = 60;
    let existing = null;
    for (let i = 0; i < keys.length && !existing; i += CONC) {
      const batch = keys.slice(i, i + CONC);
      const got = await Promise.allSettled(batch.map((k) => leadsStore.get(k, {type: 'json'})));
      for (const r of got) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        if (String(r.value.email || '').toLowerCase() === email && !r.value.deletedAt) {
          existing = r.value;
          break;
        }
      }
    }

    const now = new Date().toISOString();
    const base = existing ? {...existing} : {
      id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      nome,
      whatsapp: meta.whatsapp || '',
      cidade: meta.cidade || '',
      estado: meta.estado || '',
      instagram: meta.instagram || '',
      atuacao: meta.atuacao || '',
      data_nascimento: meta.data_nascimento || '',
      origem: 'mentoria-paga',
      createdAt: now,
      status: 'convidado',
      notes: '',
    };

    const updated = {
      ...base,
      nome: base.nome || nome,
      // Ativa mentoria na hora — o membro entra na Area de Membros e
      // ja ve a Sala desbloqueada.
      mentoria: true,
      mentoriaModalidade: modalidade,
      mentoriaAt: base.mentoriaAt || now,
      // Garante recebimento de e-mails
      unsubscribed: false,
      ativo: true,
      updatedAt: now,
      // Trilha do pagamento (sempre acumula)
      stripePayments: [
        ...(Array.isArray(base.stripePayments) ? base.stripePayments : []),
        {
          sessionId: session.id,
          amount: session.amount_total, // em centavos
          currency: session.currency,
          metodo: meta.metodo || (session.payment_method_types || [])[0] || 'unknown',
          modalidade,
          paidAt: now,
        },
      ],
    };

    leadId = updated.id;
    await leadsStore.setJSON(leadId, updated);

    // Marca idempotencia (ttl natural pelas chaves de stripe:)
    await leadsStore.setJSON(idempotencyKey, {processedAt: now, leadId});

    // Atualiza o cache members-email-index pra liberar a Sala da Mentoria
    // sem esperar o build do indice.
    try {
      const idxStore = getStore({name: 'members-email-index', consistency: 'strong'});
      const idx = (await idxStore.get('index', {type: 'json'})) || {builtAt: now, byEmail: {}, count: 0};
      if (!idx.byEmail) idx.byEmail = {};
      const existing = idx.byEmail[email] || {
        id: updated.id,
        nome: updated.nome || '',
        createdAt: updated.createdAt,
      };
      idx.byEmail[email] = {
        ...existing,
        nome: updated.nome,
        mentoria: true,
        mentoriaModalidade: modalidade,
        ativo: true,
        unsubscribed: false,
      };
      idx.lastIncrementalAt = now;
      await idxStore.setJSON('index', idx);
    } catch (e) {
      console.error('[stripe-webhook] index update:', e.message);
    }
  } catch (err) {
    throw new Error('falha ao salvar lead: ' + err.message);
  }

  // Manda e-mail de boas-vindas (best-effort)
  try {
    await sendWelcomeEmail({email, nome, modalidade, sessionAmount: session.amount_total});
  } catch (e) {
    console.error('[stripe-webhook] welcome email:', e.message);
  }
}

async function sendWelcomeEmail({email, nome, modalidade, sessionAmount}) {
  if (!process.env.RESEND_API_KEY) return;

  // Gera link de criar senha (token magico 7 dias)
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const token = sign({email, type: 'set-password', exp: Date.now() + 7 * 24 * 60 * 60 * 1000}, secret);
  const setPwdUrl = `${SITE}/membros/?action=set-password&t=${encodeURIComponent(token)}`;

  const planoLabel = modalidade === 'executive' ? 'Executive' : 'Experience';
  const firstName = String(nome || '').trim().split(/\s+/)[0] || 'aí';
  const valorFmt = sessionAmount ? `R$ ${(sessionAmount / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9">
  <tr><td align="center" style="padding:32px 16px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#F7F5F2">
      <tr><td style="padding:32px 40px 18px;border-bottom:1px solid #E8E2D8">
        <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29">Bastidores da Sindicatura</p>
        <p style="margin:6px 0 0;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#B89579;font-weight:600">Mentoria · Turma 01 · 2026</p>
      </td></tr>
      <tr><td style="padding:40px">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#819470;font-weight:700">✓ Pagamento confirmado</p>
        <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:32px;line-height:1.1;margin:0 0 18px;color:#1A1C29">Bem-vindo(a) à Mentoria, ${firstName}.</h1>
        <p style="font-size:18px;line-height:1.5;color:#1A1C29;margin:0 0 22px;font-family:'Bodoni Moda',Georgia,serif;font-style:italic">
          Sua vaga na modalidade ${planoLabel} está garantida.
        </p>
        <p style="font-size:15px;line-height:1.65;color:#1A1C29;margin:0 0 26px">
          ${valorFmt ? `Recebemos o pagamento de <strong>${valorFmt}</strong>. ` : ''}Você já está oficialmente inscrito(a) na Mentoria Bastidores da Sindicatura — Turma 01 · 2026.
        </p>
        <p style="font-size:15px;line-height:1.65;color:#1A1C29;margin:0 0 22px">
          <strong>Próximo passo:</strong> crie sua senha na Área de Membros pra acessar a Sala da Mentoria, o calendário das aulas e todos os materiais exclusivos.
        </p>
        <p style="text-align:center;margin:0 0 32px">
          <a href="${setPwdUrl}" style="display:inline-block;background:#1A1C29;color:#F7F5F2;padding:16px 28px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Criar minha senha</a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#1A1C29;margin:0 0 12px">
          O link acima expira em <strong>7 dias</strong>. Depois disso, é só pedir um novo em <a href="${SITE}/membros/" style="color:#B89579">${SITE}/membros/</a>.
        </p>
        <hr style="border:none;border-top:1px dashed #E8E2D8;margin:28px 0">
        <p style="font-size:13px;line-height:1.6;color:#1A1C29;margin:0 0 8px">
          As aulas começam em <strong>setembro de 2026</strong>, terças às 07h30 (horário de Brasília). O link do Microsoft Teams está disponível na sua área de membros assim que você criar a senha.
        </p>
        <p style="font-size:13px;line-height:1.6;color:#1A1C29;margin:18px 0 0;font-style:italic">
          Qualquer dúvida, é só responder este e-mail.<br><br>
          — Juliana Moreira
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: `✓ Inscrição confirmada · Mentoria ${planoLabel} · Bastidores da Sindicatura`,
      html,
      reply_to: 'contato@dicadajumoreira.com.br',
    }),
  });
}
