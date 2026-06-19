// Lib compartilhada · normalizacao de numeros pra E.164 (formato Meta).
//
// Meta exige E.164 SEM o sinal de + (ex.: '5511999991234' pra Brasil).
// Aceita varios formatos de input (cliente cola de tudo) e tenta inferir
// pais quando faltar codigo. Default Brasil quando ambiguo.

const BR_COUNTRY = '55';

// Normaliza um numero pra E.164 sem +. Retorna null se nao for valido.
export function toE164(input) {
  if (!input) return null;
  // Remove tudo que nao for digito
  let d = String(input).replace(/\D/g, '');
  if (!d) return null;
  // Tira zeros a esquerda
  d = d.replace(/^0+/, '');
  if (d.length < 10) return null;

  // Brasil: nao tem 55 mas tem 10-11 digitos (DDD + numero)
  if (!d.startsWith(BR_COUNTRY) && (d.length === 10 || d.length === 11)) {
    d = BR_COUNTRY + d;
  }

  // Brasil moveis sem o 9 a frente (formato antigo 10 digitos com DDD + 8)
  // Ex.: 5511999991234 vs 551199991234 — Meta exige o 9.
  // Heuristica: se for 55 + DDD + 8 digitos e o primeiro digito apos o
  // DDD for >=7 (faixa movel antiga), adiciona 9.
  if (d.startsWith(BR_COUNTRY) && d.length === 12) {
    const ddd = d.slice(2, 4);
    const subscriber = d.slice(4);
    const firstDigit = subscriber[0];
    if (parseInt(firstDigit, 10) >= 6) {
      d = BR_COUNTRY + ddd + '9' + subscriber;
    }
  }

  // Validacao basica: E.164 vai de 8 a 15 digitos no total
  if (d.length < 8 || d.length > 15) return null;

  return d;
}

// Mascaramento pra UI sem permissao completa (LGPD-friendly)
export function maskPhone(e164) {
  const s = String(e164 || '');
  if (s.length < 8) return s;
  // Mantem codigo do pais + DDD + ultimos 4
  const head = s.slice(0, 4);
  const tail = s.slice(-4);
  const middle = '*'.repeat(Math.max(0, s.length - 8));
  return `+${head} ${middle}-${tail}`;
}

// Formatacao bonita pra exibir (sem mascarar)
export function formatPretty(e164) {
  const s = String(e164 || '');
  if (s.startsWith('55') && s.length === 13) {
    const ddd = s.slice(2, 4);
    const prefix = s.slice(4, 9);
    const suffix = s.slice(9);
    return `+55 ${ddd} ${prefix}-${suffix}`;
  }
  if (s.length >= 10) {
    return '+' + s;
  }
  return s;
}

export function isValidE164(s) {
  return /^\d{8,15}$/.test(String(s || ''));
}
