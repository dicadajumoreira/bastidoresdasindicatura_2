// Compartilhado entre auth, leads e update-status.
// Vive FORA de netlify/functions/ para o Netlify NÃO empacotar como function.
// Importando uma function em outra (./auth.mjs) quebrava o bundling em produção.

import crypto from 'node:crypto';

export const TOKEN_VALIDITY_HOURS = 12;

export function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verify(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
