// Netlify Function v2 · POST /api/stripe-checkout-session
//
// Cria sessao de Stripe Checkout pra Mentoria Experience ou Executive.
// Recebe os dados do aluno + modalidade + metodo de pagamento desejado
// e devolve a URL pra onde o frontend redireciona.
//
// Body: {
//   modalidade: 'experience' | 'executive',
//   metodo: 'card' | 'pix',
//   nome, email, whatsapp, cidade, estado, instagram, atuacao, data_nascimento
// }
//
// Resposta: { url: 'https://checkout.stripe.com/...' }
//
// Variaveis de ambiente esperadas no Netlify:
//   STRIPE_SECRET_KEY        — sk_live_... ou sk_test_...
//   STRIPE_PRICE_EXP_CARD    — price_... (Experience, cartao R$ 4.997)
//   STRIPE_PRICE_EXP_PIX     — price_... (Experience, Pix R$ 4.497,30 com 10% off)
//   STRIPE_PRICE_EXEC_CARD   — price_... (Executive, cartao R$ 8.997)
//   STRIPE_PRICE_EXEC_PIX    — price_... (Executive, Pix R$ 8.097,30 com 10% off)

import Stripe from 'stripe';

export const config = {
  path: ['/api/stripe-checkout-session', '/.netlify/functions/stripe-checkout-session'],
};

const SITE = 'https://bastidoresdasindicatura.com.br';

const PRICE_MAP = {
  'experience-card': 'STRIPE_PRICE_EXP_CARD',
  'experience-pix':  'STRIPE_PRICE_EXP_PIX',
  'executive-card':  'STRIPE_PRICE_EXEC_CARD',
  'executive-pix':   'STRIPE_PRICE_EXEC_PIX',
};

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  if (!process.env.STRIPE_SECRET_KEY) {
    return json({error: 'STRIPE_SECRET_KEY não configurada no Netlify'}, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({error: 'JSON inválido'}, 400); }

  const modalidade = body.modalidade === 'executive' ? 'executive' : 'experience';
  const metodo = body.metodo === 'pix' ? 'pix' : 'card';

  const priceVar = PRICE_MAP[`${modalidade}-${metodo}`];
  const priceId = process.env[priceVar];
  if (!priceId) return json({error: `Variável ${priceVar} não configurada no Netlify`}, 500);

  // Sanitiza dados do aluno pra repassar no metadata da sessao —
  // o webhook usa isso pra criar o lead no banco apos pagamento.
  const aluno = {
    nome: String(body.nome || '').trim().slice(0, 120),
    email: String(body.email || '').trim().toLowerCase().slice(0, 200),
    whatsapp: String(body.whatsapp || '').replace(/\D/g, '').slice(0, 20),
    cidade: String(body.cidade || '').trim().slice(0, 120),
    estado: String(body.estado || '').trim().toUpperCase().slice(0, 2),
    instagram: String(body.instagram || '').trim().replace(/^@+/, '').slice(0, 60),
    atuacao: String(body.atuacao || '').trim().slice(0, 60),
    data_nascimento: String(body.data_nascimento || '').trim().slice(0, 20),
    modalidade,
    metodo,
  };
  if (!aluno.nome || !aluno.email) {
    return json({error: 'Nome e e-mail são obrigatórios'}, 400);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const params = {
      mode: 'payment',
      line_items: [{price: priceId, quantity: 1}],
      customer_email: aluno.email,
      success_url: `${SITE}/comprar-mentoria/obrigado/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/comprar-mentoria/cancelado/`,
      // Locale BR pra interface em portugues e moeda BRL no Stripe Checkout
      locale: 'pt-BR',
      // Metadados que o webhook le pra criar o lead corretamente
      metadata: {
        ...aluno,
        origem: 'mentoria-paga',
      },
      // Repassa pra Payment Intent tambem pra ficar visivel no Dashboard
      payment_intent_data: {
        metadata: {
          modalidade,
          metodo,
          nome: aluno.nome,
          whatsapp: aluno.whatsapp,
        },
      },
    };

    if (metodo === 'pix') {
      params.payment_method_types = ['pix'];
    } else {
      // Cartao com parcelamento ate 12x sem juros. O Stripe Brasil exige
      // habilitar parcelamento no Dashboard (Settings > Payment methods).
      params.payment_method_types = ['card'];
      params.payment_method_options = {
        card: {
          installments: {enabled: true},
        },
      };
    }

    const session = await stripe.checkout.sessions.create(params);
    return json({url: session.url});
  } catch (err) {
    console.error('[stripe-checkout-session]', err.message);
    return json({error: 'Falha ao criar checkout: ' + err.message}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
