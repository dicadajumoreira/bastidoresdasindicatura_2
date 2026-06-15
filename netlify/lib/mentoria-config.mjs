// Lib compartilhada · carrega config da Mentoria com defaults completos
// (cronograma das 14 aulas, link do Teams, horário) e devolve em duas
// modalidades: completa (pra inscritos) ou sanitizada (pra não-inscritos
// que vão ver só o calendário como teaser).
//
// Sanitizada: remove teamsLink e recordingLinks (segredo) mas mantém
// data + título + descrição das aulas (informação pública, é o próprio
// teaser da turma).

import { getStore } from '@netlify/blobs';

export function defaultAulas() {
  return [
    {numero: 1,  data: '2026-09-01', titulo: 'Aula 01', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 2,  data: '2026-09-08', titulo: 'Aula 02', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 3,  data: '2026-09-09', titulo: 'Mentoria Particular', tipo: 'particular', descricao: 'Sessão individual · só Executive', recordingLink: ''},
    {numero: 4,  data: '2026-09-15', titulo: 'Aula 03', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 5,  data: '2026-09-22', titulo: 'Aula 04', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 6,  data: '2026-09-29', titulo: 'Aula 05', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 7,  data: '2026-10-06', titulo: 'Aula 06', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 8,  data: '2026-10-13', titulo: 'Aula 07', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 9,  data: '2026-10-14', titulo: 'Mentoria Particular', tipo: 'particular', descricao: 'Sessão individual · só Executive', recordingLink: ''},
    {numero: 10, data: '2026-10-20', titulo: 'Aula 08', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 11, data: '2026-10-27', titulo: 'Aula 09', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 12, data: '2026-11-03', titulo: 'Aula 10', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 13, data: '2026-11-10', titulo: 'Aula 11', tipo: 'grupo',      descricao: '', recordingLink: ''},
    {numero: 14, data: '2026-11-17', titulo: 'Aula 12', tipo: 'grupo',      descricao: '', recordingLink: ''},
  ];
}

export function defaultConfig() {
  return {
    teamsLink: 'https://teams.microsoft.com/meet/276780535847602?p=cbQfvA1GTBBDNNYTQ7',
    horario: 'Terças · 07h30 às 09h00 (horário de Brasília)',
    horarioParticular: 'Horário individual a combinar',
    calendario: 'Setembro a Novembro de 2026',
    notes: '',
    aulas: defaultAulas(),
    updatedAt: null,
  };
}

// Carrega config salva e preenche com defaults o que estiver vazio.
// `sanitize: true` remove segredos (teamsLink, recordingLinks) — usado
// pra entregar o cronograma como teaser pra quem nao eh inscrito.
export async function loadMentoriaConfig({sanitize = false} = {}) {
  const store = getStore({name: 'mentoria-config', consistency: 'strong'});
  const defaults = defaultConfig();
  let cfg = null;
  try { cfg = await store.get('config', {type: 'json'}); } catch {}
  if (!cfg) cfg = {...defaults};

  if (!Array.isArray(cfg.aulas) || cfg.aulas.length === 0) {
    cfg.aulas = defaults.aulas;
  } else {
    const hasTipo = cfg.aulas.every((a) => a.tipo);
    if (!hasTipo) cfg.aulas = defaults.aulas;
  }
  if (!cfg.teamsLink || !cfg.teamsLink.trim()) cfg.teamsLink = defaults.teamsLink;
  if (!cfg.horario || !cfg.horario.trim()) cfg.horario = defaults.horario;
  if (!cfg.horarioParticular || !cfg.horarioParticular.trim()) cfg.horarioParticular = defaults.horarioParticular;
  if (!cfg.calendario || !cfg.calendario.trim()) cfg.calendario = defaults.calendario;

  if (!sanitize) return cfg;

  // Versao publica: sem link do Teams, sem gravacoes, sem materiais
  // exclusivos. Mantem datas, titulos, descricoes, horarios — info
  // publica que serve de teaser.
  return {
    horario: cfg.horario,
    horarioParticular: cfg.horarioParticular,
    calendario: cfg.calendario,
    notes: cfg.notes || '',
    teamsLink: null,
    aulas: (cfg.aulas || []).map((a) => ({
      numero: a.numero,
      data: a.data,
      titulo: a.titulo,
      tipo: a.tipo,
      descricao: a.descricao || '',
      recordingLink: null,
      materiais: [],
    })),
    updatedAt: cfg.updatedAt || null,
  };
}
