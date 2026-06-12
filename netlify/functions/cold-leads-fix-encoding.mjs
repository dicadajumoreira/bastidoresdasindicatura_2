// Netlify Function v2 · POST /api/cold-leads-fix-encoding
// Conserta nomes que ficaram com mojibake (UTF-8 lido como Latin-1) em
// imports anteriores. Exemplos: "RogÃ©rio" → "Rogério", "MÃ¡rcia" → "Márcia".
//
// Estratégia: pega cada registro, tenta detectar padrão de mojibake no
// campo 'nome' e re-encoda. Salva de volta se mudou.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/cold-leads-fix-encoding', '/.netlify/functions/cold-leads-fix-encoding'],
};

// Detecta o padrão de mojibake (sequências de bytes UTF-8 lidas como Latin-1)
// e reverte. Ex: bytes 0xC3 0xA9 (UTF-8 'é') foram lidos como 0xC3='Ã' + 0xA9='©',
// virando 'Ã©'. Pra consertar, codifica como Latin-1 (1 byte por char) e
// decodifica de volta como UTF-8.
function fixMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  // Detecta presença do padrão Ã + qualquer char alto
  if (!/Ã[-¿]/.test(str)) return str;
  try {
    // Reconstrói os bytes assumindo Latin-1
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c > 255) return str; // se tem char não-Latin-1, não é mojibake puro
      bytes[i] = c;
    }
    // Decodifica como UTF-8
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    return str;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  const store = getStore({name: 'cold-leads', consistency: 'strong'});

  try {
    const list = await store.list();
    const keys = (list.blobs || []).map((b) => b.key);
    // Só registros (skip índices)
    const recordKeys = keys.filter((k) =>
      k.startsWith('lead:') || k.startsWith('cold:e:') || k.startsWith('cold:p:')
    );

    let scanned = 0;
    let fixed = 0;
    const examples = [];
    const CONC = 8;

    for (let i = 0; i < recordKeys.length; i += CONC) {
      const batch = recordKeys.slice(i, i + CONC);
      const ops = await Promise.allSettled(batch.map(async (k) => {
        const v = await store.get(k, {type: 'json'});
        if (!v) return {fixed: false};
        scanned++;
        const oldNome = v.nome || '';
        const newNome = fixMojibake(oldNome);
        if (newNome !== oldNome) {
          await store.setJSON(k, {...v, nome: newNome});
          return {fixed: true, old: oldNome, new: newNome};
        }
        return {fixed: false};
      }));
      for (const op of ops) {
        if (op.status === 'fulfilled' && op.value.fixed) {
          fixed++;
          if (examples.length < 10) {
            examples.push({old: op.value.old, new: op.value.new});
          }
        }
      }
    }

    return json({ok: true, scanned, fixed, examples});
  } catch (err) {
    return json({error: 'Falha ao consertar encoding: ' + err.message}, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}
