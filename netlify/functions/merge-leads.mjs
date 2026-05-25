// Netlify Function v2 · POST /api/merge-leads
// Mescla 2+ leads num único principal. Os secundários vão pra Lixeira
// marcados como `mergedInto: <primaryId>`. O principal recebe campos
// vazios preenchidos a partir dos secundários (não sobrescreve dados
// existentes do principal) e notas concatenadas com separador.
// Exige token Bearer válido.

import { getStore } from '@netlify/blobs';
import { verify } from '../lib/auth-token.mjs';

export const config = {
  path: ['/api/merge-leads', '/.netlify/functions/merge-leads'],
};

// Campos que podem ser "preenchidos" no principal se estiverem vazios
const FILLABLE_FIELDS = [
  'cidade', 'estado', 'instagram', 'atuacao', 'tempoMercado',
  'qtdCondominios', 'maiorDesafio', 'desgaste', 'areas',
  'desenvolvimento', 'objetivo', 'onde2anos', 'bastidor',
  'modalidade', 'compromisso', 'participacao',
];

const isEmpty = (v) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0);

export default async (req) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  const secret = process.env.AUTH_SECRET || 'bastidores-da-sindicatura-fallback';
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, secret)) return json({error: 'Não autorizado'}, 401);

  let body;
  try { body = await req.json(); } catch { return json({error: 'Invalid JSON'}, 400); }

  const { primaryId, secondaryIds } = body || {};
  if (!primaryId || !Array.isArray(secondaryIds) || secondaryIds.length === 0) {
    return json({error: 'primaryId e secondaryIds (array) são obrigatórios'}, 400);
  }
  if (secondaryIds.includes(primaryId)) {
    return json({error: 'primaryId não pode estar em secondaryIds'}, 400);
  }

  const store = getStore({name: 'leads', consistency: 'strong'});

  const primary = await store.get(primaryId, {type: 'json'});
  if (!primary) return json({error: 'Lead principal não encontrado'}, 404);

  const secondaries = await Promise.all(
    secondaryIds.map((id) => store.get(id, {type: 'json'}))
  );
  if (secondaries.some((s) => !s)) {
    return json({error: 'Um ou mais leads secundários não encontrados'}, 404);
  }

  // Preenche campos vazios do principal com dados dos secundários
  // (ordem: do mais antigo pro mais novo — primeira ocorrência vence)
  const ordered = [...secondaries].sort((a, b) =>
    (a.createdAt || '') < (b.createdAt || '') ? -1 : 1
  );

  const filled = {...primary};
  for (const field of FILLABLE_FIELDS) {
    if (isEmpty(filled[field])) {
      for (const sec of ordered) {
        if (!isEmpty(sec[field])) {
          filled[field] = sec[field];
          break;
        }
      }
    }
  }

  // Agrega emails, whatsapps e instagrams distintos dos secundários nos arrays
  // *Extras do principal (sem incluir o valor principal, sem duplicar).
  const normE = (e) => (e || '').trim().toLowerCase();
  const normP = (p) => (p || '').replace(/\D/g, '');
  const normH = (h) => (h || '').trim().toLowerCase().replace(/^@+/, '');

  const aggregateAlt = (primaryKey, extrasKey, normalize) => {
    const principalNorm = normalize(filled[primaryKey]);
    const existing = new Set(
      (filled[extrasKey] || []).map(normalize).filter(Boolean)
    );
    if (principalNorm) existing.add(principalNorm);
    const result = [...(filled[extrasKey] || [])];

    for (const sec of secondaries) {
      if (sec[primaryKey] && !existing.has(normalize(sec[primaryKey]))) {
        result.push(sec[primaryKey]);
        existing.add(normalize(sec[primaryKey]));
      }
      for (const v of (sec[extrasKey] || [])) {
        if (v && !existing.has(normalize(v))) {
          result.push(v);
          existing.add(normalize(v));
        }
      }
    }
    if (result.length) filled[extrasKey] = result;
  };

  aggregateAlt('email', 'emailsExtras', normE);
  aggregateAlt('whatsapp', 'whatsappsExtras', normP);
  aggregateAlt('instagram', 'instagramsExtras', normH);

  // Concatena notas (se principal já tem nota, mantém em cima)
  const allNotes = [primary.notes, ...ordered.map((s) => s.notes)]
    .map((n) => (n || '').trim())
    .filter(Boolean);
  if (allNotes.length > 1) {
    filled.notes = allNotes.join('\n---\n');
  } else if (allNotes.length === 1 && !filled.notes) {
    filled.notes = allNotes[0];
  }

  // Metadados de mescla no principal
  const prevMerged = Array.isArray(primary.mergedFrom) ? primary.mergedFrom : [];
  filled.mergedFrom = [
    ...prevMerged,
    ...secondaries.map((s) => ({
      id: s.id,
      nome: s.nome,
      origem: s.origem,
      createdAt: s.createdAt,
      mergedAt: new Date().toISOString(),
    })),
  ];
  filled.updatedAt = new Date().toISOString();

  // Salva principal atualizado
  await store.setJSON(primaryId, filled);

  // Marca secundários como deletados + mergedInto
  const now = new Date().toISOString();
  await Promise.all(secondaries.map((s) =>
    store.setJSON(s.id, {
      ...s,
      deleted: true,
      deletedAt: now,
      mergedInto: primaryId,
      updatedAt: now,
    })
  ));

  return json({ok: true, primary: filled, merged: secondaries.length});
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
