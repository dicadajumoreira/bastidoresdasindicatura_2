// Disparo de e-mails transacionais via Resend
// Dois fluxos:
//   1) Notificação pra Juliana quando alguém se cadastra
//   2) Boas-vindas pro lead com link do material (quando aplicável)
//
// Best-effort: se o Resend falhar, NÃO derruba o cadastro.
// A chave RESEND_API_KEY é lida do ambiente do Netlify.

import { sign } from './auth-token.mjs';

const SITE = 'https://bastidoresdasindicatura.com.br';
const FROM = 'Bastidores da Sindicatura <contato@dicadajumoreira.com.br>';
const ADMIN_TO = 'contato@dicadajumoreira.com.br';

// Gera URL de descadastro/redução de frequência. Token vale 1 ano.
export function makeUnsubscribeUrl(email, type = 'transacional') {
  if (!email || !/@/.test(email)) return null;
  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const exp = Date.now() + 365 * 24 * 60 * 60 * 1000;
  const token = sign({email: String(email).toLowerCase(), type, exp}, secret);
  return `${SITE}/sair?t=${encodeURIComponent(token)}`;
}

// Mapa de origem → metadata do material entregue
const MATERIALS = {
  'mentoria': { nome: 'Aplicação Mentoria', flow: 'mentoria', pdf: null },
  'checklist': { nome: 'Checklist · Como organizar uma assembleia', flow: 'material', pdf: '/checklist/material.pdf' },
  'ebook-ia': { nome: 'E-book · Inteligência Artificial em Condomínios', flow: 'material', pdf: '/ebook-ia/material.pdf' },
  'sindico-profissional': { nome: 'E-book · Síndico Profissional', flow: 'material', pdf: '/sindico-profissional/material.pdf' },
  'sobrevivencia-whatsapp': { nome: 'Manual · Sobrevivência ao WhatsApp do Condomínio', flow: 'material', pdf: '/sobrevivencia-whatsapp/material.pdf' },
  '50-frases': { nome: 'Guia · 50 Frases para responder sem perder a cabeça', flow: 'material', pdf: '/50-frases/material.pdf' },
  'nr1': { nome: 'Guia · NR-1 nos Condomínios', flow: 'material', pdf: '/nr1/material.pdf' },
  'conflitos': { nome: 'Guia · Conflitos absurdos em condomínio', flow: 'material', pdf: '/conflitos/material.pdf' },
  'saude-mental': { nome: 'Guia · Saúde Mental do Síndico', flow: 'material', pdf: '/saude-mental/material.pdf' },
  'gestao-sob-ataque': { nome: 'Guia · Gestão sob Ataque', flow: 'material', pdf: '/gestao-sob-ataque/material.pdf' },
  'bombeiro': { nome: 'Arquétipo · O Bombeiro', flow: 'material', pdf: '/bombeiro/material.pdf' },
  'politico': { nome: 'Arquétipo · O Político', flow: 'material', pdf: '/politico/material.pdf' },
  'solitario': { nome: 'Arquétipo · O Solitário', flow: 'material', pdf: '/solitario/material.pdf' },
  'burocrata': { nome: 'Arquétipo · O Burocrata', flow: 'material', pdf: '/burocrata/material.pdf' },
  'estrategista': { nome: 'Arquétipo · O Estrategista', flow: 'material', pdf: '/estrategista/material.pdf' },
  'sargento': { nome: 'Arquétipo · O Sargento', flow: 'material', pdf: '/sargento/material.pdf' },
  'sorteio-mba': { nome: 'Sorteio MBA IBMEC', flow: 'sorteio', pdf: null },
};

function getInfo(origem) {
  return MATERIALS[origem] || { nome: origem || 'Cadastro', flow: 'generic', pdf: null };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// Dispara os 2 e-mails em paralelo. Cada um com try/catch próprio.
export async function sendEmails(lead) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // sem chave configurada → silencioso

  const info = getInfo(lead.origem);
  const tasks = [
    safePost({
      from: FROM,
      to: [ADMIN_TO],
      subject: `Novo cadastro · ${info.nome} · ${lead.nome || 'sem nome'}`,
      html: adminEmail(lead, info),
      reply_to: lead.email || undefined,
    }, 'admin'),
  ];

  if (lead.email && /@/.test(lead.email)) {
    tasks.push(safePost({
      from: FROM,
      to: [lead.email],
      subject: leadSubject(lead, info),
      html: leadEmail(lead, info, makeUnsubscribeUrl(lead.email, 'transacional')),
    }, 'lead'));
  }

  await Promise.allSettled(tasks);
}

async function safePost(payload, tag) {
  try {
    await postEmail(payload);
  } catch (e) {
    console.error(`[email-resend] ${tag} failed:`, e.message);
  }
}

async function postEmail(payload) {
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
    throw new Error(`Resend ${r.status}: ${t.slice(0, 240)}`);
  }
}

// ============================================================
// SUBJECTS
// ============================================================
function leadSubject(lead, info) {
  if (info.flow === 'mentoria') return 'Sua aplicação · Bastidores da Sindicatura';
  if (info.flow === 'sorteio') return 'Inscrição confirmada · Sorteio MBA IBMEC';
  if (lead.perfil_nome) return `Seu perfil é O ${lead.perfil_nome} · Bastidores da Sindicatura`;
  return `Seu guia chegou · ${info.nome}`;
}

// ============================================================
// HTML SHELL
// ============================================================
function baseHtml(content, unsubscribeUrl) {
  const unsubBlock = unsubscribeUrl ? `
        <p style="margin:8px 0 0;font-size:11px;line-height:1.6;color:#8a8881;text-align:center">
          Não quer mais receber? <a href="${unsubscribeUrl}" style="color:#B89579">Descadastre ou reduza a frequência</a>.
        </p>` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Bastidores da Sindicatura</title>
</head>
<body style="margin:0;padding:0;background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9">
  <tr><td align="center" style="padding:32px 16px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#F7F5F2">
      <tr><td style="padding:32px 40px 18px;border-bottom:1px solid #E8E2D8">
        <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29;letter-spacing:-.01em">Bastidores da Sindicatura</p>
        <p style="margin:6px 0 0;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#B89579;font-weight:600">por Juliana Moreira</p>
      </td></tr>
      <tr><td style="padding:40px">
        ${content}
      </td></tr>
      <tr><td style="padding:22px 40px;border-top:1px solid #E8E2D8;background:#FBF8F2">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8881;text-align:center">
          Você recebeu este e-mail porque se cadastrou em
          <a href="${SITE}" style="color:#B89579">bastidoresdasindicatura.com.br</a>.
        </p>${unsubBlock}
        <p style="margin:8px 0 0;font-size:10px;line-height:1.6;color:#8a8881;text-align:center;letter-spacing:.06em">
          <a href="${SITE}/politica-de-privacidade/" style="color:#B89579">Política de Privacidade</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function signature() {
  return `
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #E8E2D8">
      <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29">Juliana Moreira</p>
      <p style="margin:6px 0 0;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8881;font-weight:600">CEO Sindicompany · Condo Academy</p>
      <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:#8a8881">
        <a href="https://instagram.com/dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">Instagram @dicadajumoreira</a><br>
        <a href="https://youtube.com/@dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">YouTube @dicadajumoreira</a>
      </p>
    </div>`;
}

// ============================================================
// ADMIN EMAIL (notificação pra Juliana)
// ============================================================
function adminEmail(lead, info) {
  const fields = [
    ['Nome', lead.nome],
    ['WhatsApp', lead.whatsapp],
    ['E-mail', lead.email],
    ['Cidade', lead.cidade],
    ['Estado', lead.estado],
    ['Instagram', lead.instagram],
    ['Atuação', lead.atuacao],
    ['Modalidade', lead.modalidade],
    ['Perfil (Quiz)', lead.perfil_nome ? `${lead.perfil_nome} (${lead.perfil || ''})` : ''],
    ['Origem', info.nome],
  ].filter(([, v]) => v);

  const rows = fields.map(([k, v]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #E8E2D8;font-size:11px;color:#8a8881;letter-spacing:.16em;text-transform:uppercase;font-weight:600;width:130px;vertical-align:top">${esc(k)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E8E2D8;font-size:14px;color:#1A1C29;line-height:1.5">${esc(v)}</td>
    </tr>`).join('');

  return baseHtml(`
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B89579;font-weight:700">Novo cadastro</p>
    <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:30px;line-height:1.1;margin:0 0 8px;color:#1A1C29">${esc(lead.nome || 'Sem nome')}</h1>
    <p style="margin:0 0 24px;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:15px;color:#B89579">${esc(info.nome)}</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E8E2D8;border-collapse:collapse">${rows}</table>
    <p style="margin:28px 0 0;font-size:13px;color:#8a8881">
      Ver no painel: <a href="${SITE}/admin/" style="color:#B89579">${SITE}/admin/</a>
    </p>
  `);
}

// ============================================================
// LEAD EMAIL (boas-vindas pra quem se cadastrou)
// ============================================================
function leadEmail(lead, info, unsubscribeUrl) {
  const fn = firstName(lead.nome);
  const ola = fn ? `Olá, ${esc(fn)}.` : 'Olá.';

  // MENTORIA — aplicação para a mentoria
  if (info.flow === 'mentoria') {
    return baseHtml(`
      <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 24px;color:#1A1C29">${ola}</h1>
      <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
        Recebi sua aplicação pra <strong>Mentoria Bastidores da Sindicatura.</strong> Cada aplicação é lida pessoalmente.
      </p>
      <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
        Em alguns dias eu (ou alguém do meu time) entro em contato pelo WhatsApp pra alinhar próximos passos.
      </p>
      <p style="font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:18px;line-height:1.4;color:#B89579;margin:24px 0 0">
        O mercado ensina teoria.<br>A vida real ensina sobrevivência.
      </p>
      ${signature()}
    `, unsubscribeUrl);
  }

  // SORTEIO MBA
  if (info.flow === 'sorteio') {
    return baseHtml(`
      <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 24px;color:#1A1C29">Boa sorte, ${esc(fn || 'aí')}.</h1>
      <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
        Sua inscrição no sorteio da <strong>bolsa integral do MBA Executivo em Gestão Condominial</strong> foi confirmada. Patrocínio Condo Academy, certificação IBMEC.
      </p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;background:#FBF8F2;border-left:3px solid #B89579">
        <tr><td style="padding:18px 22px">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B89579;font-weight:700">Sorteio</p>
          <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-size:24px;color:#1A1C29">13 de junho de 2026</p>
        </td></tr>
      </table>
      <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
        O resultado sai no seu WhatsApp.
      </p>
      <p style="font-size:12px;line-height:1.5;color:#8a8881;margin:18px 0 0">
        Confira o <a href="${SITE}/regulamento-mba/" style="color:#B89579">regulamento completo do sorteio</a>.
      </p>
      ${signature()}
    `, unsubscribeUrl);
  }

  // MATERIAL (e-book / guia / arquétipo)
  const pdfUrl = info.pdf ? `${SITE}${info.pdf}` : null;
  const title = lead.perfil_nome
    ? `Você é O ${esc(lead.perfil_nome)}.`
    : 'Seu guia chegou.';
  const intro = lead.perfil_nome
    ? 'O guia do seu arquétipo está abaixo. Diagnóstico, ferramentas e plano de ação pra virar a chave.'
    : `Aqui está o material que você pediu${fn ? ', ' + esc(fn) : ''}.`;

  return baseHtml(`
    <p style="margin:0 0 6px;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:15px;color:#B89579">${esc(info.nome)}</p>
    <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:36px;line-height:1.05;margin:0 0 20px;color:#1A1C29">${title}</h1>
    <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 28px">${intro}</p>
    ${pdfUrl ? `
      <p style="text-align:center;margin:0 0 32px">
        <a href="${pdfUrl}" style="display:inline-block;background:#1A1C29;color:#F7F5F2;padding:16px 28px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Abrir o guia em PDF</a>
      </p>
      <p style="text-align:center;margin:0 0 32px;font-size:12px;color:#8a8881">
        Se o botão não funcionar: <a href="${pdfUrl}" style="color:#B89579">${pdfUrl}</a>
      </p>
    ` : ''}
    <hr style="border:none;border-top:1px dashed #E8E2D8;margin:32px 0">
    <p style="font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:18px;color:#1A1C29;margin:0 0 8px">P.S.</p>
    <p style="font-size:14px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
      Se quiser ir além do material, conheça a <strong>Mentoria Bastidores da Sindicatura.</strong> Turma 01 começa em setembro de 2026, vagas limitadas.
    </p>
    <p style="margin:0 0 8px">
      <a href="${SITE}/#vagas" style="color:#B89579;font-weight:600">Conhecer a Mentoria</a>
    </p>
    ${signature()}
  `, unsubscribeUrl);
}
