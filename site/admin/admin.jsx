// Painel admin · Bastidores da Sindicatura
// Login → lista de leads → detalhe → status + notas → export planilha .xlsx

const TOKEN_KEY = 'bs-admin-token';

const STATUS_LABELS = {
  novo: 'Novo',
  lido: 'Lido',
  respondido: 'Respondido',
  convidado: 'Convidado',
  recusado: 'Recusado',
};
const STATUS_ORDER = ['novo', 'lido', 'respondido', 'convidado', 'recusado'];

const ORIGEM_LABELS = {
  mentoria: 'Aplicação Mentoria',
  checklist: 'Checklist Assembleias',
  'ebook-ia': 'E-book IA',
  'sindico-profissional': 'E-book Síndico Profissional',
  'sobrevivencia-whatsapp': 'Manual WhatsApp',
  '50-frases': 'Guia 50 Frases',
  'nr1': 'Guia NR-1',
  'conflitos': 'Guia Conflitos',
  'saude-mental': 'Saúde Mental',
  'gestao-sob-ataque': 'Gestão sob Ataque',
  'bombeiro': 'Arquétipo · Bombeiro',
  'politico': 'Arquétipo · Político',
  'solitario': 'Arquétipo · Solitário',
  'burocrata': 'Arquétipo · Burocrata',
  'estrategista': 'Arquétipo · Estrategista',
  'sargento': 'Arquétipo · Sargento',
  'sorteio-mba': 'Sorteio MBA IBMEC',
};
const ORIGEM_ORDER = ['mentoria', 'sorteio-mba', 'checklist', 'ebook-ia', 'sindico-profissional', 'sobrevivencia-whatsapp', '50-frases', 'nr1', 'conflitos', 'saude-mental', 'gestao-sob-ataque', 'bombeiro', 'politico', 'solitario', 'burocrata', 'estrategista', 'sargento'];

/* ============================================================
   Helpers — gênero (inferido pelo primeiro nome)
   ============================================================ */
// Lista de exceções comuns que escapam à regra de terminação "a/o"
const NOMES_MASCULINOS = new Set([
  'andre','andré','tomas','tomás','lucas','jonas','elias','mateus','matheus',
  'vinicius','vinícius','marcus','silas','tobias','barnabas','barnabás','isaias','isaías',
  'jeremias','tales','thales','luca','noah','iuri','yuri','daniel','rafael','gabriel',
  'miguel','manoel','manuel','samuel','jose','josé','joaquim','joaquin','enzo',
  'kauã','kauan','enzo','heitor','arthur','artur','antonio','antônio','ezequiel',
  'lucca','ravi','davi','levi','liam','noah','benicio','benício','aaron','aarão',
]);
const NOMES_FEMININOS = new Set([
  'jaqueline','jacqueline','isis','íris','iris','beatris','beatriz','ines','inês','lais','laís',
  'tais','taís','jasmin','jazmin','carmem','carmen','helen','dolores','mercedes',
  'mirtes','iolanda','ester','esther','rute','ruth','raquel','isabel','mabel',
  'soraya','catherine','katherine','jennifer','heather','margareth','elizabeth',
  'meredith','judith','aparecida','astrid','ingrid','consuelo',
]);

const inferGender = (nome) => {
  if (!nome) return 'desconhecido';
  // Pega o primeiro nome, sem acentos e em minúsculas pra comparar com listas
  const first = String(nome).trim().split(/\s+/)[0].toLowerCase();
  if (!first) return 'desconhecido';
  if (NOMES_MASCULINOS.has(first)) return 'masculino';
  if (NOMES_FEMININOS.has(first)) return 'feminino';
  // Heurística por terminação (cobre ~85% dos nomes brasileiros)
  const last = first.slice(-1);
  if (last === 'a') return 'feminino';
  if (last === 'o') return 'masculino';
  if (last === 'e') return 'masculino'; // "Felipe", "Vicente", etc. (a maioria)
  // Outras terminações comuns
  if (/(son|ton|der|var|niel|rael|riel|riel|bel|nael|fael)$/.test(first)) return 'masculino';
  return 'desconhecido';
};

/* ============================================================
   Helpers
   ============================================================ */
// Formata data/hora SEMPRE no fuso de Brasília, independente do navegador.
const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', ' ·');
  } catch { return ''; }
};

// Versão curta (sem ano) também em Brasília.
const fmtDateShort = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', ' ·');
  } catch { return ''; }
};

// Converte "YYYY-MM-DDTHH:mm" (do input datetime-local) em ISO UTC,
// assumindo SEMPRE que o input está em horário de Brasília (UTC-3).
// Brasília não usa horário de verão desde 2019, então o offset é fixo.
const brasiliaInputToUtcIso = (local) => {
  if (!local) return null;
  // local format: "2026-06-13T22:30" — colamos o offset -03:00 antes de Date
  return new Date(local + ':00-03:00').toISOString();
};

// Normalização para detecção de duplicidade
const normEmail = (e) => (e || '').trim().toLowerCase();
const normPhone = (p) => (p || '').replace(/\D/g, '');
const normHandle = (h) => (h || '').trim().toLowerCase().replace(/^@+/, '');

// Retorna todos os emails / whatsapps / handles distintos de um lead
// (campo principal + arrays *Extras). Já normalizados, sem vazios.
const getAllEmails = (l) => {
  const set = new Set();
  if (l.email) set.add(normEmail(l.email));
  for (const e of (l.emailsExtras || [])) if (e) set.add(normEmail(e));
  set.delete('');
  return [...set];
};
const getAllPhones = (l) => {
  const set = new Set();
  if (l.whatsapp) set.add(normPhone(l.whatsapp));
  for (const p of (l.whatsappsExtras || [])) if (p) set.add(normPhone(p));
  set.delete('');
  return [...set];
};
const getAllHandles = (l) => {
  const set = new Set();
  if (l.instagram) set.add(normHandle(l.instagram));
  for (const h of (l.instagramsExtras || [])) if (h) set.add(normHandle(h));
  set.delete('');
  return [...set];
};

const intersects = (a, b) => a.some((x) => b.includes(x));

// Retorna os outros leads que compartilham QUALQUER email, WhatsApp ou @ com este
const findDuplicates = (lead, allLeads) => {
  const emails = getAllEmails(lead);
  const phones = getAllPhones(lead);
  const handles = getAllHandles(lead);
  if (!emails.length && !phones.length && !handles.length) return [];
  return allLeads.filter((other) => {
    if (other.id === lead.id) return false;
    if (emails.length && intersects(emails, getAllEmails(other))) return true;
    if (phones.length && intersects(phones, getAllPhones(other))) return true;
    if (handles.length && intersects(handles, getAllHandles(other))) return true;
    return false;
  });
};

// Une todos os e-mails/WhatsApps/@ distintos de um conjunto de formulários (cadastro único)
const unionContacts = (forms, getter) => {
  const set = new Set();
  forms.forEach((f) => getter(f).forEach((v) => set.add(v)));
  set.delete('');
  return [...set];
};

// Monta um "cadastro único" a partir das aplicações de uma mesma pessoa.
const aggregateCluster = (forms) => {
  const sorted = [...forms].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const rep = sorted[0]; // aplicação mais recente = representante do cadastro
  const origens = [];
  ORIGEM_ORDER.forEach((o) => { if (sorted.some((f) => (f.origem || 'mentoria') === o)) origens.push(o); });
  sorted.forEach((f) => { const o = f.origem || 'mentoria'; if (!origens.includes(o)) origens.push(o); }); // defensivo
  return {
    id: rep.id,                 // id do representante (seleção / detalhe)
    rep,
    forms: sorted,              // todos os formulários, do mais recente ao mais antigo
    ids: sorted.map((f) => f.id),
    count: sorted.length,
    origens,
    status: rep.status || 'novo',
    latestAt: sorted[0].createdAt,
  };
};

// Agrupa leads que são a mesma pessoa — transitivamente — por e-mail OU WhatsApp OU @.
// Ex.: A divide e-mail com B, B divide WhatsApp com C → {A, B, C} viram um cadastro.
const buildClusters = (leads) => {
  const parent = new Map();
  leads.forEach((l) => parent.set(l.id, l.id));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const linkByKey = (getter) => {
    const map = new Map();
    leads.forEach((l) => getter(l).forEach((k) => { if (!map.has(k)) map.set(k, []); map.get(k).push(l.id); }));
    map.forEach((ids) => { for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]); });
  };
  linkByKey(getAllEmails);
  linkByKey(getAllPhones);
  linkByKey(getAllHandles);
  const groups = new Map();
  leads.forEach((l) => { const r = find(l.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(l); });
  return [...groups.values()].map(aggregateCluster);
};

const api = async (path, opts = {}) => {
  const token = sessionStorage.getItem(TOKEN_KEY) || '';
  // Chama a function diretamente (sem depender do redirect /api/*)
  const realPath = path.startsWith('/api/')
    ? '/.netlify/functions/' + path.slice('/api/'.length)
    : path;
  const res = await fetch(realPath, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({error: 'Resposta inválida'}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
};

// Separa cidade e estado para a planilha.
// Leads novos do checklist: já vem separado (cidade + estado).
// Leads antigos da mentoria: cidade vem como "São Paulo / SP" sem estado.
const splitLocation = (lead) => {
  if (lead.estado) return {cidade: lead.cidade || '', estado: lead.estado};
  const raw = lead.cidade || '';
  const m = raw.match(/^(.+?)\s*\/\s*([A-Za-z]{2})\s*$/);
  if (m) return {cidade: m[1].trim(), estado: m[2].toUpperCase()};
  return {cidade: raw, estado: ''};
};

// Linha de planilha a partir de uma aplicação isolada (usada na Lixeira)
const leadToRow = (l) => {
  const loc = splitLocation(l);
  return {
    nome: l.nome || '',
    whatsapp: l.whatsapp || '',
    email: l.email || '',
    instagram: l.instagram || '',
    cidade: loc.cidade,
    estado: loc.estado,
    atuacao: l.atuacao || '',
    modalidade: l.modalidade || '',
    pagina: ORIGEM_LABELS[l.origem || 'mentoria'] || l.origem || '',
    perfil: l.perfil_nome ? `${l.perfil_nome} (${l.perfil || ''})` : '',
    status: STATUS_LABELS[l.status || 'novo'] || l.status || '',
    data: fmtDate(l.createdAt),
    notas: l.notes || '',
  };
};

// Linha de planilha a partir de um cadastro único (todas as origens da pessoa juntas)
const clusterToRow = (c) => {
  const loc = splitLocation(c.rep);
  // Coleta perfil do quiz se a pessoa tiver passado por ele em qualquer cadastro
  const formComPerfil = c.forms.find((f) => f.perfil_nome);
  // Modalidades vindas de aplicações de mentoria (qualquer cadastro)
  const modalidades = [...new Set(c.forms.map((f) => f.modalidade).filter(Boolean))];
  return {
    nome: c.rep.nome || '',
    whatsapp: unionContacts(c.forms, getAllPhones).join(' · ') || (c.rep.whatsapp || ''),
    email: unionContacts(c.forms, getAllEmails).join(' · ') || (c.rep.email || ''),
    instagram: c.rep.instagram || c.forms.map((f) => f.instagram).find(Boolean) || '',
    cidade: loc.cidade,
    estado: loc.estado,
    atuacao: c.rep.atuacao || c.forms.map((f) => f.atuacao).find(Boolean) || '',
    modalidade: modalidades.join(' · '),
    pagina: c.origens.map((o) => ORIGEM_LABELS[o] || o).join(', '),
    perfil: formComPerfil ? `${formComPerfil.perfil_nome} (${formComPerfil.perfil || ''})` : '',
    status: STATUS_LABELS[c.status || 'novo'] || c.status || '',
    data: fmtDate(c.rep.createdAt),
    notas: c.rep.notes || '',
  };
};

const downloadXlsx = async (rows) => {
  if (typeof ExcelJS === 'undefined') {
    alert('Biblioteca de planilha ainda carregando. Aguarde e tente de novo.');
    return;
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bastidores da Sindicatura';
  wb.created = new Date();

  const ws = wb.addWorksheet('Leads', {
    views: [{state: 'frozen', ySplit: 1}],
  });

  ws.columns = [
    {header: 'Nome', key: 'nome', width: 32},
    {header: 'WhatsApp', key: 'whatsapp', width: 22},
    {header: 'E-mail', key: 'email', width: 36},
    {header: 'Instagram', key: 'instagram', width: 22},
    {header: 'Cidade', key: 'cidade', width: 22},
    {header: 'Estado', key: 'estado', width: 8},
    {header: 'Atuação', key: 'atuacao', width: 22},
    {header: 'Modalidade', key: 'modalidade', width: 18},
    {header: 'Origem', key: 'pagina', width: 28},
    {header: 'Perfil (Quiz)', key: 'perfil', width: 22},
    {header: 'Status', key: 'status', width: 14},
    {header: 'Data do cadastro', key: 'data', width: 22},
    {header: 'Anotações', key: 'notas', width: 40},
  ];

  rows.forEach((row) => ws.addRow(row));

  // Header destacado
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = {bold: true, color: {argb: 'FFF7F5F2'}, size: 11};
    cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF1A1C29'}};
    cell.alignment = {vertical: 'middle', horizontal: 'left', indent: 1};
    cell.border = {
      top: {style: 'thin', color: {argb: 'FF1A1C29'}},
      left: {style: 'thin', color: {argb: 'FF1A1C29'}},
      bottom: {style: 'thin', color: {argb: 'FF1A1C29'}},
      right: {style: 'thin', color: {argb: 'FF1A1C29'}},
    };
  });

  // Bordas + zebra striping nas linhas de dados
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.height = 20;
    row.eachCell({includeEmpty: true}, (cell) => {
      cell.font = {color: {argb: 'FF1A1C29'}, size: 11};
      cell.alignment = {vertical: 'middle', horizontal: 'left', indent: 1};
      cell.border = {
        top: {style: 'thin', color: {argb: 'FFE0DAD0'}},
        left: {style: 'thin', color: {argb: 'FFE0DAD0'}},
        bottom: {style: 'thin', color: {argb: 'FFE0DAD0'}},
        right: {style: 'thin', color: {argb: 'FFE0DAD0'}},
      };
      if (r % 2 === 0) {
        cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFFBF9F5'}};
      }
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bastidores-leads-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ============================================================
   LOGIN
   ============================================================ */
const Login = ({onSuccess}) => {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api('/api/auth', {
        method: 'POST',
        body: JSON.stringify({password}),
      });
      sessionStorage.setItem(TOKEN_KEY, res.token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ad-login">
      <div className="ad-login-card">
        <div className="ad-brand">
          <span className="ad-brand-l1">Bastidores</span>
          <span className="ad-brand-l2">da Sindicatura</span>
        </div>
        <span className="ad-tag">Painel restrito</span>
        <h1 className="ad-login-title">Acesso<br/><em>privado.</em></h1>

        <form onSubmit={submit} className="ad-login-form">
          <label className="ad-field">
            <span className="ad-label">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              placeholder="••••••••"
            />
          </label>
          {error && <p className="ad-error">{error}</p>}
          <button type="submit" disabled={loading || !password} className="ad-btn ad-btn-primary">
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>

        <p className="ad-login-foot">Por Juliana Moreira · 2026</p>
      </div>
    </div>
  );
};

/* ============================================================
   LEAD DETAIL (drawer lateral)
   ============================================================ */
const LeadDetail = ({lead, onClose, onUpdated, onDeleted, onHardDeleted, clusterForms = [], onSelectLead, allLeads = []}) => {
  const mergedFromList = Array.isArray(lead.mergedFrom) ? lead.mergedFrom : [];
  const mergedIntoLead = lead.mergedInto ? allLeads.find((l) => l.id === lead.mergedInto) : null;

  // Todos os formulários deste cadastro (mais recente primeiro) e os "outros"
  const forms = clusterForms.length ? clusterForms : [lead];
  const otherForms = forms.filter((f) => f.id !== lead.id);

  // Junta os contatos distintos de TODAS as aplicações da pessoa (formatação original, sem repetir)
  const collectContacts = (primaryKey, extrasKey, norm) => {
    const seen = new Set();
    const out = [];
    forms.forEach((f) => {
      [f[primaryKey], ...((f[extrasKey]) || [])].forEach((v) => {
        if (!v || !String(v).trim()) return;
        const k = norm(v);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(String(v).trim());
      });
    });
    return out;
  };
  const allWhats = collectContacts('whatsapp', 'whatsappsExtras', normPhone);
  const allEmails = collectContacts('email', 'emailsExtras', normEmail);
  const allHandles = collectContacts('instagram', 'instagramsExtras', normHandle);
  const [status, setStatus] = React.useState(lead.status || 'novo');
  const [notes, setNotes] = React.useState(lead.notes || '');
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(null);
  const [editOpen, setEditOpen] = React.useState(false);

  React.useEffect(() => {
    setStatus(lead.status || 'novo');
    setNotes(lead.notes || '');
    setSavedAt(null);
  }, [lead.id]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api('/api/update-status', {
        method: 'POST',
        body: JSON.stringify({id: lead.id, status, notes}),
      });
      onUpdated(res.lead);
      setSavedAt(new Date());
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async () => {
    if (!window.confirm(`Excluir a aplicação de ${lead.nome}? Vai pra Lixeira — você pode restaurar depois.`)) return;
    try {
      const res = await api('/api/update-status', {
        method: 'POST',
        body: JSON.stringify({id: lead.id, deleted: true}),
      });
      onDeleted(res.lead);
    } catch (err) {
      alert(err.message);
    }
  };

  const restore = async () => {
    try {
      const res = await api('/api/update-status', {
        method: 'POST',
        body: JSON.stringify({id: lead.id, deleted: false}),
      });
      onUpdated(res.lead);
    } catch (err) {
      alert(err.message);
    }
  };

  const hardDelete = async () => {
    if (!window.confirm(`Apagar DEFINITIVAMENTE a aplicação de ${lead.nome}? Esta ação NÃO pode ser desfeita.`)) return;
    try {
      await api('/api/delete-permanent', {
        method: 'POST',
        body: JSON.stringify({id: lead.id}),
      });
      onHardDeleted(lead.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const waUrl = lead.whatsapp ? `https://wa.me/${String(lead.whatsapp).replace(/\D/g, '')}` : '';
  const mailUrl = lead.email ? `mailto:${lead.email}` : '';

  return (
    <div className="ad-detail">
      <header className="ad-detail-head">
        <div>
          <span className="ad-tag-sm">Aplicação · {fmtDate(lead.createdAt)}</span>
          <h2 className="ad-detail-name">{lead.nome}</h2>
          <p className="ad-detail-sub">
            <span className="ad-detail-origem">{ORIGEM_LABELS[lead.origem || 'mentoria']}</span>
            {lead.cidade ? <> · {lead.cidade}</> : null}
            {lead.modalidade ? <> · <em>{lead.modalidade}</em></> : null}
          </p>
        </div>
        <button className="ad-detail-close" onClick={onClose} aria-label="Fechar">×</button>
      </header>

      <div className="ad-detail-actions">
        {waUrl && <a className="ad-btn ad-btn-ghost" href={waUrl} target="_blank" rel="noreferrer">WhatsApp</a>}
        {mailUrl && <a className="ad-btn ad-btn-ghost" href={mailUrl}>E-mail</a>}
        {lead.instagram && (
          <a className="ad-btn ad-btn-ghost"
             href={`https://instagram.com/${String(lead.instagram).replace(/^@/, '')}`}
             target="_blank" rel="noreferrer">Instagram</a>
        )}
        <button className="ad-btn ad-btn-ghost" onClick={() => setEditOpen(true)}>Editar</button>
      </div>

      {editOpen && (
        <EditLeadModal
          lead={lead}
          onCancel={() => setEditOpen(false)}
          onSaved={(updated) => { onUpdated(updated); setEditOpen(false); }}
        />
      )}

      {/* Formulários baixados por esta pessoa (cadastro único) */}
      {forms.length > 1 && (
        <div className="ad-dup-card">
          <div className="ad-dup-head">
            <span className="ad-dup-badge ad-dup-badge-lg">{forms.length}</span>
            <div>
              <span className="ad-label">Formulários baixados por esta pessoa</span>
              <p className="ad-dup-hint">Mesmo e-mail, WhatsApp ou @. Clique em um para abrir os detalhes dele.</p>
            </div>
          </div>
          <ul className="ad-dup-list">
            {forms.map((d) => {
              const isCurrent = d.id === lead.id;
              return (
                <li key={d.id}
                    className={'ad-dup-item' + (isCurrent ? ' is-current' : '')}
                    onClick={() => { if (!isCurrent && onSelectLead) onSelectLead(d); }}>
                  <span className={'ad-status-dot ad-status-' + (d.status || 'novo')} aria-hidden="true"></span>
                  <div className="ad-dup-item-main">
                    <div className="ad-dup-item-meta">
                      <span className={'ad-chip ad-chip-origem ad-chip-origem-' + (d.origem || 'mentoria')}>{ORIGEM_LABELS[d.origem || 'mentoria']}</span>
                      <span className="ad-dot">·</span>
                      <span>{STATUS_LABELS[d.status || 'novo']}</span>
                      {d.modalidade && <><span className="ad-dot">·</span><em>{d.modalidade}</em></>}
                      {isCurrent && <span className="ad-dup-current-tag">aberto</span>}
                    </div>
                  </div>
                  <div className="ad-dup-item-date">{fmtDate(d.createdAt)}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Status + notas */}
      <div className="ad-status-card">
        <span className="ad-label">Status</span>
        <div className="ad-status-options">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={'ad-status-chip ' + (status === s ? 'is-on' : '')}
              onClick={() => setStatus(s)}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <label className="ad-field ad-field-notes">
          <span className="ad-label">Notas privadas</span>
          <textarea rows="4" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações pessoais sobre essa aplicação." />
        </label>

        <div className="ad-status-foot">
          <button className="ad-btn ad-btn-primary ad-btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
          {savedAt && <span className="ad-saved">Salvo às {fmtDate(savedAt.toISOString()).split(' · ')[1]}</span>}
        </div>
      </div>

      {/* Respostas */}
      <div className="ad-fields">
        <Section title="Dados de contato">
          <Field k="Nome" v={lead.nome} />
          {lead.cidade && (
            <Field
              k="Cidade / Estado"
              v={`${lead.cidade}${lead.estado ? ' / ' + lead.estado : ''}`}
            />
          )}
          <MultiField k="WhatsApp" primary={allWhats[0]} extras={allWhats.slice(1)} />
          <MultiField k="E-mail" primary={allEmails[0]} extras={allEmails.slice(1)} />
          <MultiField k="Instagram" primary={allHandles[0]} extras={allHandles.slice(1)} />
        </Section>

        <Section title="Atuação">
          <Field k="Atua como" v={lead.atuacao} />
          {lead.tempoMercado && <Field k="Tempo no mercado" v={lead.tempoMercado} />}
          {lead.qtdCondominios && <Field k="Condomínios sob gestão" v={lead.qtdCondominios} />}
        </Section>

        {/* Seções exclusivas da aplicação da mentoria */}
        {lead.origem !== 'checklist' && (lead.maiorDesafio || lead.desgaste || lead.areas) && (
          <Section title="Momento profissional">
            <Field k="Maior desafio da rotina" v={lead.maiorDesafio} long />
            <Field k="O que tem desgastado emocionalmente" v={lead.desgaste} long />
            <Field k="Áreas para evoluir" v={Array.isArray(lead.areas) ? lead.areas.join(' · ') : lead.areas} />
          </Section>
        )}

        {lead.origem !== 'checklist' && (lead.desenvolvimento || lead.objetivo || lead.onde2anos) && (
          <Section title="Sobre o futuro">
            <Field k="O que espera desenvolver" v={lead.desenvolvimento} long />
            <Field k="Maior objetivo profissional" v={lead.objetivo} long />
            <Field k="Onde quer estar em dois anos" v={lead.onde2anos} long />
          </Section>
        )}

        {lead.origem !== 'checklist' && lead.bastidor && (
          <Section title="A pergunta mais importante" highlight>
            <Field k="O que ninguém vê sobre a sua rotina" v={lead.bastidor} long />
          </Section>
        )}

        {lead.modalidade && (
          <Section title="Modalidade escolhida">
            <Field k="Modalidade" v={lead.modalidade} />
          </Section>
        )}
      </div>

      {/* Info de mescla */}
      {mergedFromList.length > 0 && (
        <div className="ad-dup-card">
          <div className="ad-dup-head">
            <span className="ad-dup-badge ad-dup-badge-lg">+{mergedFromList.length}</span>
            <div>
              <span className="ad-label">Leads mesclados aqui</span>
              <p className="ad-dup-hint">
                Estas aplicações foram identificadas como a mesma pessoa e mescladas neste lead.
              </p>
            </div>
          </div>
          <ul className="ad-dup-list">
            {mergedFromList.map((m) => (
              <li key={m.id} className="ad-dup-item is-static">
                <span className="ad-status-dot ad-status-recusado" aria-hidden="true"></span>
                <div className="ad-dup-item-main">
                  <div className="ad-dup-item-meta">
                    <span className="ad-dup-item-origem">{ORIGEM_LABELS[m.origem || 'mentoria']}</span>
                    <span className="ad-dot">·</span>
                    <span>Mesclado em {fmtDate(m.mergedAt)}</span>
                  </div>
                </div>
                <div className="ad-dup-item-date">de {fmtDate(m.createdAt)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mergedIntoLead && (
        <div className="ad-dup-card">
          <div className="ad-dup-head">
            <span className="ad-dup-badge ad-dup-badge-lg">→</span>
            <div>
              <span className="ad-label">Mesclado em outro lead</span>
              <p className="ad-dup-hint">Esta aplicação foi mesclada como duplicata. Clique para abrir o lead principal.</p>
            </div>
          </div>
          <ul className="ad-dup-list">
            <li className="ad-dup-item" onClick={() => onSelectLead && onSelectLead(mergedIntoLead)}>
              <span className={'ad-status-dot ad-status-' + (mergedIntoLead.status || 'novo')} aria-hidden="true"></span>
              <div className="ad-dup-item-main">
                <div className="ad-dup-item-meta">
                  <span className="ad-dup-item-origem">{mergedIntoLead.nome}</span>
                  <span className="ad-dot">·</span>
                  <span>{ORIGEM_LABELS[mergedIntoLead.origem || 'mentoria']}</span>
                </div>
              </div>
              <div className="ad-dup-item-date">{fmtDate(mergedIntoLead.createdAt)}</div>
            </li>
          </ul>
        </div>
      )}

      {/* Zona de exclusão */}
      <div className="ad-danger-zone">
        {lead.deleted ? (
          <>
            <p className="ad-danger-info">
              Esta aplicação está na <em>Lixeira</em> desde {fmtDate(lead.deletedAt)}.
            </p>
            <div className="ad-danger-actions">
              <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={restore}>Restaurar</button>
              <button className="ad-btn ad-btn-danger ad-btn-sm" onClick={hardDelete}>Apagar definitivamente</button>
            </div>
          </>
        ) : (
          <button className="ad-btn ad-btn-danger-ghost ad-btn-sm" onClick={softDelete}>
            Excluir aplicação
          </button>
        )}
      </div>
    </div>
  );
};

const Section = ({title, children, highlight}) => (
  <section className={'ad-section ' + (highlight ? 'is-highlight' : '')}>
    <h3 className="ad-section-title">{title}</h3>
    <dl className="ad-section-list">{children}</dl>
  </section>
);

const Field = ({k, v, long}) => (
  <div className={'ad-field-row ' + (long ? 'is-long' : '')}>
    <dt>{k}</dt>
    <dd>{v && String(v).trim() ? v : <span className="ad-empty">—</span>}</dd>
  </div>
);

// Campo de contato que mostra principal + extras como lista vertical
const MultiField = ({k, primary, extras = []}) => {
  const all = [primary, ...(extras || [])].filter((v) => v && String(v).trim());
  if (all.length === 0) return (
    <div className="ad-field-row">
      <dt>{k}</dt>
      <dd><span className="ad-empty">—</span></dd>
    </div>
  );
  return (
    <div className="ad-field-row ad-field-multi">
      <dt>
        {k}
        {all.length > 1 && <span className="ad-multi-count">+{all.length - 1}</span>}
      </dt>
      <dd>
        {all.map((v, i) => (
          <div key={i} className={'ad-multi-item' + (i === 0 ? ' is-primary' : '')}>
            {v}
          </div>
        ))}
      </dd>
    </div>
  );
};

/* ============================================================
   DASHBOARD
   ============================================================ */
const LeadsPanel = ({onLogout, onBackToOverview}) => {
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState('todos');
  const [modFilter, setModFilter] = React.useState('todos');
  const [origemFilter, setOrigemFilter] = React.useState('todos');
  const [dupFilter, setDupFilter] = React.useState(false);
  const [showLixeira, setShowLixeira] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelected = (id) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Recarrega até TODOS os blobs entrarem no índice (leads.length >= total).
      for (let attempts = 0; attempts < 15; attempts++) {
        const res = await api('/api/leads');
        setLeads(res.leads || []);
        setProgress({loaded: (res.leads || []).length, total: res.total || 0});
        if (!res.total || (res.leads || []).length >= res.total) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      if (err.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        onLogout();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  // Active leads = não-deletados; deletados ficam separados pra Lixeira
  const activeLeads = React.useMemo(() => leads.filter((l) => !l.deleted), [leads]);
  const deletedLeads = React.useMemo(() => leads.filter((l) => l.deleted), [leads]);

  // Cadastros únicos: agrupa as aplicações da mesma pessoa (e-mail OU WhatsApp OU @).
  // Ordenados pela atividade mais recente.
  const clusters = React.useMemo(
    () => buildClusters(activeLeads).sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1)),
    [activeLeads]
  );
  const clusterById = React.useMemo(() => {
    const m = new Map();
    clusters.forEach((c) => c.ids.forEach((id) => m.set(id, c)));
    return m;
  }, [clusters]);

  // Lixeira: continua por aplicação (não agrupa).
  const filteredDeleted = deletedLeads.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      const hay = [l.nome, l.cidade, l.email, l.whatsapp, l.instagram].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Ativos: filtra cadastros únicos.
  const filteredClusters = clusters.filter((c) => {
    if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
    if (origemFilter !== 'todos' && !c.origens.includes(origemFilter)) return false;
    if (modFilter !== 'todos' && !c.forms.some((f) => f.modalidade === modFilter)) return false;
    if (dupFilter && c.count < 2) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = c.forms.flatMap((l) => [
        l.nome, l.cidade, l.email, l.whatsapp, l.instagram,
        ...(l.emailsExtras || []), ...(l.whatsappsExtras || []), ...(l.instagramsExtras || []),
      ]).filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = React.useMemo(() => {
    const c = {todos: clusters.length, duplicates: 0, lixeira: deletedLeads.length};
    STATUS_ORDER.forEach((s) => c[s] = 0);
    ORIGEM_ORDER.forEach((o) => c['origem_' + o] = 0);
    clusters.forEach((cl) => {
      c[cl.status] = (c[cl.status] || 0) + 1;
      cl.origens.forEach((o) => { c['origem_' + o] = (c['origem_' + o] || 0) + 1; });
      if (cl.count > 1) c.duplicates += 1;
    });
    return c;
  }, [clusters, deletedLeads]);

  // Contagem/topo e exportação dependem da visão (cadastros únicos vs lixeira)
  const visibleCount = showLixeira ? filteredDeleted.length : filteredClusters.length;
  const totalCount = showLixeira ? deletedLeads.length : clusters.length;

  // Seleção por cadastro (marca/desmarca todas as aplicações da pessoa)
  const clusterChecked = (c) => c.ids.length > 0 && c.ids.every((id) => selectedIds.has(id));
  const toggleCluster = (c) => setSelectedIds((s) => {
    const next = new Set(s);
    const all = c.ids.every((id) => next.has(id));
    if (all) c.ids.forEach((id) => next.delete(id)); else c.ids.forEach((id) => next.add(id));
    return next;
  });

  const onUpdated = (updated) => {
    setLeads((all) => all.map((l) => (l.id === updated.id ? updated : l)));
    setSelected(updated);
  };

  const onDeleted = (updated) => {
    setLeads((all) => all.map((l) => (l.id === updated.id ? updated : l)));
    setSelected(null);
    setSelectedIds((s) => { const n = new Set(s); n.delete(updated.id); return n; });
  };

  const onHardDeleted = (id) => {
    setLeads((all) => all.filter((l) => l.id !== id));
    setSelected(null);
    setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  const bulkSoftDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Excluir ${ids.length} ${ids.length === 1 ? 'aplicação' : 'aplicações'}? Vai${ids.length === 1 ? '' : 'm'} pra Lixeira — você pode restaurar depois.`)) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(ids.map((id) =>
        api('/api/update-status', {method: 'POST', body: JSON.stringify({id, deleted: true})})
          .then((r) => r.lead).catch(() => null)
      ));
      const okMap = new Map(results.filter(Boolean).map((l) => [l.id, l]));
      setLeads((all) => all.map((l) => okMap.get(l.id) || l));
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkRestore = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(ids.map((id) =>
        api('/api/update-status', {method: 'POST', body: JSON.stringify({id, deleted: false})})
          .then((r) => r.lead).catch(() => null)
      ));
      const okMap = new Map(results.filter(Boolean).map((l) => [l.id, l]));
      setLeads((all) => all.map((l) => okMap.get(l.id) || l));
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkHardDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Apagar DEFINITIVAMENTE ${ids.length} ${ids.length === 1 ? 'aplicação' : 'aplicações'}? Esta ação NÃO pode ser desfeita.`)) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(ids.map((id) =>
        api('/api/delete-permanent', {method: 'POST', body: JSON.stringify({id})})
          .then(() => id).catch(() => null)
      ));
      const okSet = new Set(results.filter(Boolean));
      setLeads((all) => all.filter((l) => !okSet.has(l.id)));
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const selectAllVisible = () => {
    const ids = showLixeira
      ? filteredDeleted.map((l) => l.id)
      : filteredClusters.flatMap((c) => c.ids);
    setSelectedIds(new Set(ids));
  };

  // Mesclar leads — abre modal de escolha do principal
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const openMerge = () => setMergeOpen(true);
  const closeMerge = () => setMergeOpen(false);

  const doMerge = async (primaryId) => {
    const secondaryIds = [...selectedIds].filter((id) => id !== primaryId);
    if (!secondaryIds.length) return;
    setBulkBusy(true);
    try {
      const res = await api('/api/merge-leads', {
        method: 'POST',
        body: JSON.stringify({primaryId, secondaryIds}),
      });
      const secondarySet = new Set(secondaryIds);
      setLeads((all) => all.map((l) => {
        if (l.id === primaryId) return res.primary;
        if (secondarySet.has(l.id)) return {...l, deleted: true, deletedAt: new Date().toISOString(), mergedInto: primaryId};
        return l;
      }));
      clearSelection();
      closeMerge();
      setSelected(res.primary);
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    onLogout();
  };

  return (
    <div className={'ad-app ' + (selected ? 'has-detail' : '')}>
      {/* Sidebar */}
      <aside className="ad-side">
        <div className="ad-brand">
          <span className="ad-brand-l1">Bastidores</span>
          <span className="ad-brand-l2">Painel</span>
        </div>

        <span className="ad-side-section">Origem</span>
        <nav className="ad-side-nav">
          <button className={origemFilter === 'todos' ? 'is-on' : ''} onClick={() => setOrigemFilter('todos')}>
            <span>Todas</span><em>{counts.todos}</em>
          </button>
          {ORIGEM_ORDER.map((o) => (
            <button key={o} className={origemFilter === o ? 'is-on' : ''} onClick={() => setOrigemFilter(o)}>
              <span>{ORIGEM_LABELS[o]}</span><em>{counts['origem_' + o] || 0}</em>
            </button>
          ))}
        </nav>

        <span className="ad-side-section">Status</span>
        <nav className="ad-side-nav">
          <button className={statusFilter === 'todos' ? 'is-on' : ''} onClick={() => setStatusFilter('todos')}>
            <span>Todas</span><em>{counts.todos}</em>
          </button>
          {STATUS_ORDER.map((s) => (
            <button key={s} className={statusFilter === s ? 'is-on' : ''} onClick={() => setStatusFilter(s)}>
              <span>{STATUS_LABELS[s]}</span><em>{counts[s] || 0}</em>
            </button>
          ))}
        </nav>

        <span className="ad-side-section">Modalidade</span>
        <nav className="ad-side-nav">
          <button className={modFilter === 'todos' ? 'is-on' : ''} onClick={() => setModFilter('todos')}>Todas</button>
          <button className={modFilter === 'Experience' ? 'is-on' : ''} onClick={() => setModFilter('Experience')}>Experience</button>
          <button className={modFilter === 'Executive' ? 'is-on' : ''} onClick={() => setModFilter('Executive')}>Executive</button>
        </nav>

        <span className="ad-side-section">Duplicatas</span>
        <nav className="ad-side-nav">
          <button className={dupFilter ? 'is-on' : ''} onClick={() => setDupFilter(!dupFilter)}>
            <span>Apenas com duplicata</span><em>{counts.duplicates}</em>
          </button>
        </nav>

        <span className="ad-side-section">Lixeira</span>
        <nav className="ad-side-nav">
          <button className={showLixeira ? 'is-on' : ''} onClick={() => { setShowLixeira(!showLixeira); clearSelection(); setSelected(null); }}>
            <span>{showLixeira ? 'Voltar pra aplicações' : 'Ver excluídos'}</span><em>{counts.lixeira}</em>
          </button>
        </nav>

        <div className="ad-side-foot">
          {onBackToOverview && (
            <button className="ad-btn-link" onClick={onBackToOverview}>← Dashboard</button>
          )}
          <button className="ad-btn-link" onClick={() => downloadXlsx(showLixeira ? filteredDeleted.map(leadToRow) : filteredClusters.map(clusterToRow))} disabled={!visibleCount}>Exportar planilha</button>
          <button className="ad-btn-link" onClick={load}>Atualizar</button>
          <button className="ad-btn-link ad-btn-logout" onClick={logout}>Sair</button>
        </div>
      </aside>

      {/* Main: lista */}
      <main className="ad-main">
        <header className="ad-main-head">
          <div>
            <h1 className="ad-h1">{showLixeira ? 'Lixeira' : 'Cadastros'}</h1>
            <p className="ad-h1-sub">
              {visibleCount} {showLixeira
                ? (visibleCount === 1 ? 'aplicação' : 'aplicações')
                : (visibleCount === 1 ? 'cadastro' : 'cadastros')}
              {totalCount !== visibleCount ? ` (de ${totalCount})` : ''}
              {!showLixeira && progress && progress.total ? ` · ${progress.total} formulários` : ''}
              {loading && progress && progress.total && progress.loaded < progress.total ? ` · carregando ${progress.loaded}/${progress.total}…` : ''}
            </p>
          </div>
          <input
            className="ad-search"
            placeholder="Buscar por nome, cidade, e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </header>

        {selectedIds.size > 0 && (
          <div className="ad-bulk-bar">
            <span className="ad-bulk-count">
              <strong>{selectedIds.size}</strong> selecionada{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div className="ad-bulk-actions">
              <button className="ad-btn ad-btn-ghost-light ad-btn-sm" onClick={selectAllVisible} disabled={bulkBusy}>
                Selecionar todas visíveis ({visibleCount})
              </button>
              {showLixeira ? (
                <>
                  <button className="ad-btn ad-btn-light ad-btn-sm" onClick={bulkRestore} disabled={bulkBusy}>
                    {bulkBusy ? 'Restaurando…' : 'Restaurar'}
                  </button>
                  <button className="ad-btn ad-btn-danger ad-btn-sm" onClick={bulkHardDelete} disabled={bulkBusy}>
                    {bulkBusy ? 'Apagando…' : 'Apagar definitivamente'}
                  </button>
                </>
              ) : (
                <>
                  {selectedIds.size >= 2 && (
                    <button className="ad-btn ad-btn-light ad-btn-sm" onClick={openMerge} disabled={bulkBusy}>
                      Mesclar selecionadas
                    </button>
                  )}
                  <button className="ad-btn ad-btn-danger ad-btn-sm" onClick={bulkSoftDelete} disabled={bulkBusy}>
                    {bulkBusy ? 'Excluindo…' : 'Excluir selecionadas'}
                  </button>
                </>
              )}
              <button className="ad-btn ad-btn-ghost-light ad-btn-sm" onClick={clearSelection} disabled={bulkBusy}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {loading && <div className="ad-state">Carregando cadastros…{progress && progress.total ? ` ${progress.loaded}/${progress.total}` : ''}</div>}
        {error && (
          <div className="ad-state ad-state-err">
            <p>{error}</p>
            <button className="ad-btn ad-btn-primary ad-btn-sm" onClick={load} style={{marginTop: '14px'}}>Tentar de novo</button>
          </div>
        )}
        {!loading && !error && visibleCount === 0 && (
          <div className="ad-empty-state">
            <h2>{showLixeira ? 'Lixeira vazia.' : 'Sem cadastros por aqui ainda.'}</h2>
            <p>Quando alguém preencher o formulário, aparece aqui.</p>
          </div>
        )}

        {!loading && visibleCount > 0 && (
          <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th className="ad-th-check" aria-label="Selecionar"></th>
                <th>Nome</th>
                <th>WhatsApp</th>
                <th>E-mail</th>
                <th>Cidade / UF</th>
                <th>Atuação</th>
                <th>{showLixeira ? 'Origem' : 'Materiais'}</th>
                <th>Status</th>
                <th className="ad-th-date">Data</th>
              </tr>
            </thead>
            <tbody>
              {showLixeira
                ? filteredDeleted.map((l) => {
                  const loc = splitLocation(l);
                  const locStr = loc.cidade ? `${loc.cidade}${loc.estado ? ' / ' + loc.estado : ''}` : '';
                  const waDigits = String(l.whatsapp || '').replace(/\D/g, '');
                  const stopProp = (e) => e.stopPropagation();
                  return (
                    <tr
                      key={l.id}
                      className={'ad-tr ' + (selected && selected.id === l.id ? 'is-on ' : '') + (selectedIds.has(l.id) ? 'is-checked' : '')}
                      onClick={() => setSelected(l)}>
                      <td className="ad-td-check" data-label="">
                        <input type="checkbox" className="ad-list-check" checked={selectedIds.has(l.id)} onChange={() => toggleSelected(l.id)} onClick={stopProp} aria-label="Selecionar" />
                      </td>
                      <td className="ad-td-name" data-label="Nome">
                        <div className="ad-td-name-row">
                          <span className={'ad-status-dot ad-status-' + (l.status || 'novo')} aria-hidden="true"></span>
                          <span className="ad-td-name-text">{l.nome}</span>
                        </div>
                      </td>
                      <td data-label="WhatsApp">
                        {l.whatsapp ? (
                          <a className="ad-td-link" href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" onClick={stopProp}>{l.whatsapp}</a>
                        ) : <span className="ad-td-empty">—</span>}
                      </td>
                      <td data-label="E-mail">
                        {l.email ? <a className="ad-td-link" href={`mailto:${l.email}`} onClick={stopProp}>{l.email}</a> : <span className="ad-td-empty">—</span>}
                      </td>
                      <td data-label="Cidade / UF">{locStr || <span className="ad-td-empty">—</span>}</td>
                      <td data-label="Atuação">{l.atuacao || <span className="ad-td-empty">—</span>}</td>
                      <td data-label="Origem">
                        <span className={'ad-chip ad-chip-origem ad-chip-origem-' + (l.origem || 'mentoria')}>{ORIGEM_LABELS[l.origem || 'mentoria']}</span>
                      </td>
                      <td data-label="Status">
                        <span className={'ad-chip ad-chip-status ad-chip-status-' + (l.status || 'novo')}>{STATUS_LABELS[l.status || 'novo']}</span>
                      </td>
                      <td className="ad-td-date" data-label="Data">{fmtDate(l.createdAt).split(' · ')[0]}</td>
                    </tr>
                  );
                })
                : filteredClusters.map((c) => {
                  const l = c.rep;
                  const loc = splitLocation(l);
                  const locStr = loc.cidade ? `${loc.cidade}${loc.estado ? ' / ' + loc.estado : ''}` : '';
                  const waDigits = String(l.whatsapp || '').replace(/\D/g, '');
                  const stopProp = (e) => e.stopPropagation();
                  return (
                    <tr
                      key={c.id}
                      className={'ad-tr ' + (selected && c.ids.includes(selected.id) ? 'is-on ' : '') + (clusterChecked(c) ? 'is-checked' : '')}
                      onClick={() => setSelected(l)}>
                      <td className="ad-td-check" data-label="">
                        <input type="checkbox" className="ad-list-check" checked={clusterChecked(c)} onChange={() => toggleCluster(c)} onClick={stopProp} aria-label="Selecionar" />
                      </td>
                      <td className="ad-td-name" data-label="Nome">
                        <div className="ad-td-name-row">
                          <span className={'ad-status-dot ad-status-' + c.status} aria-hidden="true"></span>
                          <span className="ad-td-name-text">{l.nome}</span>
                          {c.count > 1 && (
                            <span className="ad-dup-badge" title={`${c.count} formulários desta pessoa`}>{c.count}x</span>
                          )}
                        </div>
                      </td>
                      <td data-label="WhatsApp">
                        {l.whatsapp ? (
                          <a className="ad-td-link" href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" onClick={stopProp}>{l.whatsapp}</a>
                        ) : <span className="ad-td-empty">—</span>}
                      </td>
                      <td data-label="E-mail">
                        {l.email ? <a className="ad-td-link" href={`mailto:${l.email}`} onClick={stopProp}>{l.email}</a> : <span className="ad-td-empty">—</span>}
                      </td>
                      <td data-label="Cidade / UF">{locStr || <span className="ad-td-empty">—</span>}</td>
                      <td data-label="Atuação">{l.atuacao || <span className="ad-td-empty">—</span>}</td>
                      <td data-label="Materiais">
                        <div className="ad-chip-group">
                          {c.origens.map((o) => (
                            <span key={o} className={'ad-chip ad-chip-origem ad-chip-origem-' + o}>{ORIGEM_LABELS[o] || o}</span>
                          ))}
                        </div>
                      </td>
                      <td data-label="Status">
                        <span className={'ad-chip ad-chip-status ad-chip-status-' + c.status}>{STATUS_LABELS[c.status]}</span>
                      </td>
                      <td className="ad-td-date" data-label="Data">{fmtDate(c.latestAt).split(' · ')[0]}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
        )}
      </main>

      {selected && (
        <LeadDetail
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          onHardDeleted={onHardDeleted}
          clusterForms={(clusterById.get(selected.id) || {forms: [selected]}).forms}
          onSelectLead={setSelected}
          allLeads={leads}
        />
      )}

      {mergeOpen && (
        <MergeModal
          leads={leads.filter((l) => selectedIds.has(l.id))}
          onCancel={closeMerge}
          onConfirm={doMerge}
          busy={bulkBusy}
        />
      )}
    </div>
  );
};

/* ============================================================
   EDIT LEAD MODAL — editar campos do lead (incl. emails/whatsapps extras)
   ============================================================ */
const UFS_ADMIN = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const EditLeadModal = ({lead, onCancel, onSaved}) => {
  const [form, setForm] = React.useState({
    nome: lead.nome || '',
    cidade: lead.cidade || '',
    estado: lead.estado || '',
    whatsapp: lead.whatsapp || '',
    whatsappsExtras: [...(lead.whatsappsExtras || [])],
    email: lead.email || '',
    emailsExtras: [...(lead.emailsExtras || [])],
    instagram: lead.instagram || '',
    instagramsExtras: [...(lead.instagramsExtras || [])],
    atuacao: lead.atuacao || '',
    modalidade: lead.modalidade || '',
    status: lead.status || 'novo',
  });
  const [saving, setSaving] = React.useState(false);

  const set = (k, v) => setForm((f) => ({...f, [k]: v}));
  const addExtra = (arrKey) => setForm((f) => ({...f, [arrKey]: [...f[arrKey], '']}));
  const setExtra = (arrKey, i, v) => setForm((f) => ({...f, [arrKey]: f[arrKey].map((x, j) => (j === i ? v : x))}));
  const rmExtra = (arrKey, i) => setForm((f) => ({...f, [arrKey]: f[arrKey].filter((_, j) => j !== i)}));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api('/api/update-lead', {
        method: 'POST',
        body: JSON.stringify({id: lead.id, fields: form}),
      });
      // Status mudou? Atualiza via update-status pra disparar lógica adequada
      if (form.status !== (lead.status || 'novo')) {
        await api('/api/update-status', {
          method: 'POST',
          body: JSON.stringify({id: lead.id, status: form.status}),
        });
      }
      onSaved({...res.lead, status: form.status});
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderExtraList = (arrKey, label, placeholder, type = 'text') => (
    <>
      {form[arrKey].map((v, i) => (
        <div className="ad-edit-extra-row" key={`${arrKey}-${i}`}>
          <input
            type={type}
            value={v}
            onChange={(e) => setExtra(arrKey, i, e.target.value)}
            placeholder={placeholder}
          />
          <button type="button" className="ad-edit-extra-rm" onClick={() => rmExtra(arrKey, i)} aria-label="Remover">×</button>
        </div>
      ))}
      <button type="button" className="ad-btn-link ad-edit-add" onClick={() => addExtra(arrKey)}>
        + Adicionar outro {label.toLowerCase()}
      </button>
    </>
  );

  return (
    <div className="ad-modal-backdrop" onClick={onCancel}>
      <div className="ad-modal ad-modal-edit" onClick={(e) => e.stopPropagation()}>
        <header className="ad-modal-head">
          <h2 className="ad-modal-title">Editar aplicação</h2>
          <button className="ad-modal-close" onClick={onCancel} aria-label="Fechar">×</button>
        </header>
        <div className="ad-edit-body">
          <div className="ad-edit-grid">
            <label className="ad-edit-field ad-edit-full">
              <span>Nome</span>
              <input type="text" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
            </label>
            <label className="ad-edit-field">
              <span>Cidade</span>
              <input type="text" value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
            </label>
            <label className="ad-edit-field ad-edit-narrow">
              <span>Estado (UF)</span>
              <select value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                <option value="">—</option>
                {UFS_ADMIN.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </label>
            <div className="ad-edit-field ad-edit-full">
              <span>WhatsApp</span>
              <input type="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="Principal" />
              {renderExtraList('whatsappsExtras', 'WhatsApp', '(11) 99999-9999', 'tel')}
            </div>
            <div className="ad-edit-field ad-edit-full">
              <span>E-mail</span>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Principal" />
              {renderExtraList('emailsExtras', 'e-mail', 'outro@email.com', 'email')}
            </div>
            <div className="ad-edit-field ad-edit-full">
              <span>Instagram / @ redes sociais</span>
              <input type="text" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@principal" />
              {renderExtraList('instagramsExtras', '@', '@outro_user')}
            </div>
            <label className="ad-edit-field">
              <span>Atuação</span>
              <select value={form.atuacao} onChange={(e) => set('atuacao', e.target.value)}>
                <option value="">—</option>
                <option>Síndico profissional</option>
                <option>Síndico morador</option>
                <option>Gestor condominial</option>
                <option>Administradora</option>
                <option>Conselheiro</option>
                <option>Outro</option>
              </select>
            </label>
            <label className="ad-edit-field">
              <span>Modalidade (mentoria)</span>
              <select value={form.modalidade} onChange={(e) => set('modalidade', e.target.value)}>
                <option value="">—</option>
                <option>Experience</option>
                <option>Executive</option>
              </select>
            </label>
            <label className="ad-edit-field ad-edit-full">
              <span>Status</span>
              <div className="ad-edit-status">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={'ad-status-chip ' + (form.status === s ? 'is-on' : '')}
                    onClick={() => set('status', s)}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </div>
        <footer className="ad-modal-foot">
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button className="ad-btn ad-btn-primary ad-btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
};

/* ============================================================
   BRAZIL MAP — choropleth de cadastros por UF
   ============================================================ */
const BrazilMap = ({ufCount = {}}) => {
  const states = window.BR_STATES || [];
  const vb = window.BR_VB || {w: 1000, h: 938};
  const max = Math.max(1, ...Object.values(ufCount));
  // 5 cores em escala (mais frio → mais quente), no tom da marca (sand → lavender → ataque)
  const palette = ['#23263a', '#3a3a55', '#5c5174', '#896a86', '#b26a3d'];
  const colorFor = (n) => {
    if (!n) return palette[0];
    const t = n / max;
    if (t <= 0.20) return palette[1];
    if (t <= 0.45) return palette[2];
    if (t <= 0.75) return palette[3];
    return palette[4];
  };
  const [hover, setHover] = React.useState(null);

  return (
    <div className="ad-br-map">
      <svg viewBox={`0 0 ${vb.w} ${vb.h}`} className="ad-br-map-svg" role="img" aria-label="Mapa do Brasil com cadastros por estado">
        {states.map((s) => {
          const n = ufCount[s.uf] || 0;
          return (
            <path
              key={s.uf}
              d={s.d}
              fill={colorFor(n)}
              stroke="rgba(247,245,242,0.18)"
              strokeWidth="0.8"
              className={'ad-br-map-state' + (hover === s.uf ? ' is-hover' : '')}
              onMouseEnter={() => setHover(s.uf)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${s.name} (${s.uf}): ${n} ${n === 1 ? 'cadastro' : 'cadastros'}`}</title>
            </path>
          );
        })}
        {states.map((s) => {
          const n = ufCount[s.uf] || 0;
          const showCount = n > 0;
          return (
            <g key={s.uf + '-l'} className="ad-br-map-label" pointerEvents="none">
              <text x={s.cx} y={s.cy - 4} textAnchor="middle" className="ad-br-map-uf">{s.uf}</text>
              {showCount && (
                <text x={s.cx} y={s.cy + 14} textAnchor="middle" className="ad-br-map-n">{n}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="ad-br-map-legend">
        <span className="ad-br-map-legend-k">Cadastros por UF</span>
        <div className="ad-br-map-scale">
          {palette.map((c, i) => (
            <span key={i} className="ad-br-map-scale-sw" style={{background: c}}></span>
          ))}
        </div>
        <span className="ad-br-map-legend-v">0 a {max}</span>
      </div>
    </div>
  );
};

/* ============================================================
   MERGE MODAL — escolher lead principal pra mescla manual
   ============================================================ */
const MergeModal = ({leads, onCancel, onConfirm, busy}) => {
  // Default: lead mais recente como principal (preserva status atualizado)
  const sorted = [...leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const [primaryId, setPrimaryId] = React.useState(sorted[0]?.id);

  return (
    <div className="ad-modal-backdrop" onClick={onCancel}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ad-modal-head">
          <h2 className="ad-modal-title">Mesclar {leads.length} aplicações</h2>
          <button className="ad-modal-close" onClick={onCancel} aria-label="Fechar">×</button>
        </header>
        <p className="ad-modal-intro">
          Qual aplicação será o <strong>lead principal</strong>? Os outros vão pra Lixeira
          marcados como mesclados. Campos vazios do principal são preenchidos com dados das
          outras; notas são concatenadas.
        </p>
        <ul className="ad-merge-list">
          {sorted.map((l) => {
            const isPrimary = primaryId === l.id;
            return (
              <li key={l.id} className={'ad-merge-item ' + (isPrimary ? 'is-primary' : '')}>
                <label>
                  <input
                    type="radio"
                    name="primary"
                    checked={isPrimary}
                    onChange={() => setPrimaryId(l.id)}
                  />
                  <div className="ad-merge-info">
                    <div className="ad-merge-name">
                      {l.nome}
                      {isPrimary && <span className="ad-merge-badge">PRINCIPAL</span>}
                    </div>
                    <div className="ad-merge-meta">
                      <span>{ORIGEM_LABELS[l.origem || 'mentoria']}</span>
                      <span className="ad-dot">·</span>
                      <span>{fmtDate(l.createdAt)}</span>
                      <span className="ad-dot">·</span>
                      <span>{STATUS_LABELS[l.status || 'novo']}</span>
                    </div>
                    <div className="ad-merge-contact">
                      {l.email && <span>{l.email}</span>}
                      {l.whatsapp && <span>· {l.whatsapp}</span>}
                      {l.instagram && <span>· @{String(l.instagram).replace(/^@/, '')}</span>}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
        <footer className="ad-modal-foot">
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => onConfirm(primaryId)} disabled={busy || !primaryId}>
            {busy ? 'Mesclando…' : 'Mesclar'}
          </button>
        </footer>
      </div>
    </div>
  );
};

/* ============================================================
   OVERVIEW — Dashboard com estatísticas, tela inicial do admin
   ============================================================ */
const Overview = ({onLogout, onOpenLeads, onOpenBroadcast, onOpenColdLeads}) => {
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // O índice pode vir incompleto nas primeiras leituras (muitos cadastros
      // + rate-limit). Recarrega até TODOS os blobs entrarem no índice
      // (leads.length >= total), não só enquanto o tempo estoura.
      for (let attempts = 0; attempts < 15; attempts++) {
        const res = await api('/api/leads');
        setLeads(res.leads || []);
        setProgress({loaded: (res.leads || []).length, total: res.total || 0});
        if (!res.total || (res.leads || []).length >= res.total) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      if (err.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        onLogout();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  React.useEffect(() => { load(); }, [load]);

  // Considera só leads ativos (não-excluídos) pras estatísticas
  const active = React.useMemo(() => leads.filter((l) => !l.deleted), [leads]);

  // Agrupa em CADASTROS ÚNICOS (mesmo critério da lista) — pra Visão geral
  // bater com a lista interna: contagem por pessoa, não por envio.
  const clusters = React.useMemo(() => buildClusters(active), [active]);

  const stats = React.useMemo(() => {
    const ufCount = {};
    const cidadeCount = {};
    const atuacaoCount = {};
    const origemCount = {};
    let masc = 0, fem = 0, indef = 0;

    clusters.forEach((c) => {
      const rep = c.rep;
      const loc = splitLocation(rep);
      if (loc.estado) ufCount[loc.estado] = (ufCount[loc.estado] || 0) + 1;
      if (loc.cidade) {
        const key = loc.estado ? `${loc.cidade} / ${loc.estado}` : loc.cidade;
        cidadeCount[key] = (cidadeCount[key] || 0) + 1;
      }
      const a = (rep.atuacao || '').trim();
      if (a) atuacaoCount[a] = (atuacaoCount[a] || 0) + 1;
      // Origens: conta 1 por material que a pessoa baixou (uma pessoa que
      // pegou 3 materiais aparece em cada um dos 3, mas conta 1x no total).
      c.origens.forEach((o) => { origemCount[o] = (origemCount[o] || 0) + 1; });

      const g = inferGender(rep.nome);
      if (g === 'masculino') masc++;
      else if (g === 'feminino') fem++;
      else indef++;
    });

    const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

    return {
      ufs: sortDesc(ufCount),
      cidades: sortDesc(cidadeCount),
      atuacoes: sortDesc(atuacaoCount),
      origens: sortDesc(origemCount),
      genero: {masculino: masc, feminino: fem, desconhecido: indef},
      total: clusters.length,        // cadastros únicos (pessoas)
      formularios: active.length,    // total bruto de envios
    };
  }, [clusters, active]);

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    onLogout();
  };

  const pct = (n) => stats.total ? Math.round((n / stats.total) * 100) : 0;
  const maxOf = (arr) => arr.length ? arr[0][1] : 1;

  if (loading) return <div className="ad-overview-loading">Carregando dashboard…{progress && progress.total ? ` · ${progress.loaded}/${progress.total}` : ''}</div>;
  if (error) return (
    <div className="ad-overview-error">
      <p className="ad-overview-error-msg">{error}</p>
      <div className="ad-overview-error-actions">
        <button className="ad-btn ad-btn-primary ad-btn-sm" onClick={load}>Tentar de novo</button>
        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onOpenLeads}>Ver aplicações</button>
        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={logout}>Sair</button>
      </div>
    </div>
  );

  return (
    <div className="ad-overview">
      <header className="ad-overview-head">
        <div>
          <span className="ad-tag-sm">Painel · {fmtDate(new Date().toISOString()).split(' · ')[0]}</span>
          <h1 className="ad-overview-title">
            Visão geral<em> · {stats.total} {stats.total === 1 ? 'cadastro' : 'cadastros'}{stats.formularios > stats.total ? ` · ${stats.formularios} formulários` : ''}</em>
          </h1>
        </div>
        <div className="ad-overview-actions">
          <button className="ad-btn ad-btn-primary" onClick={onOpenLeads}>Ver aplicações</button>
          {onOpenBroadcast && (
            <button className="ad-btn ad-btn-ghost" onClick={onOpenBroadcast}>Disparar e-mail</button>
          )}
          {onOpenColdLeads && (
            <button className="ad-btn ad-btn-ghost" onClick={onOpenColdLeads}>Leads frios</button>
          )}
          <button className="ad-btn ad-btn-ghost" onClick={logout}>Sair</button>
        </div>
      </header>

      {stats.total === 0 ? (
        <div className="ad-empty-state">
          <h2>Sem cadastros ainda.</h2>
          <p>Quando alguém preencher um formulário, as estatísticas aparecem aqui.</p>
        </div>
      ) : (
        <div className="ad-overview-grid">

          {/* Origem — ranking de páginas que mais geram cadastro */}
          <section className="ad-widget ad-widget-wide">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Ranking</span>
              <h2 className="ad-widget-title">Origens que mais geram cadastro</h2>
            </header>
            <ul className="ad-rank-list">
              {stats.origens.map(([key, n], i) => (
                <li key={key} className="ad-rank-item">
                  <span className="ad-rank-pos">{String(i + 1).padStart(2, '0')}</span>
                  <div className="ad-rank-main">
                    <div className="ad-rank-name">{ORIGEM_LABELS[key] || key}</div>
                    <div className="ad-rank-bar">
                      <span className="ad-rank-bar-fill" style={{width: `${(n / maxOf(stats.origens)) * 100}%`}}></span>
                    </div>
                  </div>
                  <span className="ad-rank-value">{n} <em>· {pct(n)}%</em></span>
                </li>
              ))}
            </ul>
          </section>

          {/* Sexo */}
          <section className="ad-widget">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Público</span>
              <h2 className="ad-widget-title">Sexo <small>(inferido)</small></h2>
            </header>
            <div className="ad-gender">
              <div className="ad-gender-bar" aria-hidden="true">
                <span className="ad-gender-seg ad-gender-fem" style={{width: pct(stats.genero.feminino) + '%'}}></span>
                <span className="ad-gender-seg ad-gender-masc" style={{width: pct(stats.genero.masculino) + '%'}}></span>
                <span className="ad-gender-seg ad-gender-indef" style={{width: pct(stats.genero.desconhecido) + '%'}}></span>
              </div>
              <ul className="ad-gender-legend">
                <li><span className="ad-gender-dot ad-gender-fem"></span>Feminino<em>{stats.genero.feminino} · {pct(stats.genero.feminino)}%</em></li>
                <li><span className="ad-gender-dot ad-gender-masc"></span>Masculino<em>{stats.genero.masculino} · {pct(stats.genero.masculino)}%</em></li>
                {stats.genero.desconhecido > 0 && (
                  <li><span className="ad-gender-dot ad-gender-indef"></span>Indefinido<em>{stats.genero.desconhecido} · {pct(stats.genero.desconhecido)}%</em></li>
                )}
              </ul>
            </div>
          </section>

          {/* Localização — estados + cidades */}
          <section className="ad-widget ad-widget-wide">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Público</span>
              <h2 className="ad-widget-title">Localização</h2>
            </header>
            <div className="ad-loc-grid">
              <div className="ad-loc-mapcol">
                <h3 className="ad-loc-sub">Cadastros por estado</h3>
                <BrazilMap ufCount={Object.fromEntries(stats.ufs)} />
              </div>
              <div>
                <h3 className="ad-loc-sub">Top cidades</h3>
                <ul className="ad-rank-list ad-rank-list-compact">
                  {stats.cidades.slice(0, 10).map(([cid, n]) => (
                    <li key={cid} className="ad-rank-item">
                      <span className="ad-rank-cid">{cid}</span>
                      <div className="ad-rank-bar">
                        <span className="ad-rank-bar-fill" style={{width: `${(n / maxOf(stats.cidades)) * 100}%`}}></span>
                      </div>
                      <span className="ad-rank-value">{n}</span>
                    </li>
                  ))}
                  {stats.cidades.length === 0 && <li className="ad-empty">Sem dados</li>}
                </ul>
              </div>
            </div>
          </section>

          {/* Atuação */}
          <section className="ad-widget">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Público</span>
              <h2 className="ad-widget-title">Atuação</h2>
            </header>
            <ul className="ad-rank-list ad-rank-list-compact">
              {stats.atuacoes.map(([a, n]) => (
                <li key={a} className="ad-rank-item">
                  <span className="ad-rank-cid">{a}</span>
                  <div className="ad-rank-bar">
                    <span className="ad-rank-bar-fill" style={{width: `${(n / maxOf(stats.atuacoes)) * 100}%`}}></span>
                  </div>
                  <span className="ad-rank-value">{n}</span>
                </li>
              ))}
              {stats.atuacoes.length === 0 && <li className="ad-empty">Sem dados</li>}
            </ul>
          </section>

        </div>
      )}
    </div>
  );
};

/* ============================================================
   COLD LEAD EDIT MODAL — edita um cadastro frio individualmente
   ============================================================ */
const COLD_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const COLD_ATUACOES = ['Síndico profissional', 'Síndico morador', 'Gestor condominial', 'Administradora', 'Conselheiro', 'Outro'];

const ColdLeadEditModal = ({lead, onClose, onSave}) => {
  const [form, setForm] = React.useState(() => ({
    emails: lead.emails && lead.emails.length ? [...lead.emails] : (lead.email ? [lead.email] : ['']),
    whatsapps: lead.whatsapps && lead.whatsapps.length ? [...lead.whatsapps] : (lead.whatsapp ? [lead.whatsapp] : ['']),
    nome: lead.nome || '',
    instagram: lead.instagram || '',
    cidade: lead.cidade || '',
    estado: lead.estado || '',
    atuacao: lead.atuacao || '',
    notes: lead.notes || '',
    unsubscribed: !!lead.unsubscribed,
    frequencia: lead.frequencia || 'normal',
  }));
  const [busy, setBusy] = React.useState(false);

  const setField = (k, v) => setForm((s) => ({...s, [k]: v}));
  const setArrayItem = (k, i, v) => setForm((s) => {
    const arr = [...s[k]];
    arr[i] = v;
    return {...s, [k]: arr};
  });
  const removeArrayItem = (k, i) => setForm((s) => {
    const arr = s[k].filter((_, idx) => idx !== i);
    return {...s, [k]: arr.length ? arr : ['']};
  });
  const addArrayItem = (k) => setForm((s) => ({...s, [k]: [...s[k], '']}));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        ...form,
        emails: form.emails.map((x) => x.trim()).filter(Boolean),
        whatsapps: form.whatsapps.map((x) => x.replace(/\D/g, '')).filter(Boolean),
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="ad-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal-card ad-modal-card-wide">
        <header className="ad-rec-head">
          <span className="ad-widget-eyebrow">Editar lead frio</span>
          <h3>{lead.nome || lead.emails?.[0] || lead.whatsapps?.[0] || 'sem nome'}</h3>
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>Fechar</button>
        </header>
        <form onSubmit={submit} className="ad-cold-edit-form">
          <label className="ad-bc-field">
            <span className="ad-bc-label">Nome</span>
            <input type="text" value={form.nome} onChange={(e) => setField('nome', e.target.value)} />
          </label>

          <div className="ad-bc-field">
            <span className="ad-bc-label">E-mails</span>
            {form.emails.map((em, i) => (
              <div key={i} className="ad-cold-arr-row">
                <input type="email" value={em} onChange={(e) => setArrayItem('emails', i, e.target.value)} placeholder="email@exemplo.com" />
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => removeArrayItem('emails', i)}>×</button>
              </div>
            ))}
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => addArrayItem('emails')}>+ E-mail</button>
          </div>

          <div className="ad-bc-field">
            <span className="ad-bc-label">WhatsApp / Telefones</span>
            {form.whatsapps.map((ph, i) => (
              <div key={i} className="ad-cold-arr-row">
                <input type="tel" value={ph} onChange={(e) => setArrayItem('whatsapps', i, e.target.value)} placeholder="11999999999" />
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => removeArrayItem('whatsapps', i)}>×</button>
              </div>
            ))}
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => addArrayItem('whatsapps')}>+ Telefone</button>
          </div>

          <label className="ad-bc-field">
            <span className="ad-bc-label">@ Instagram</span>
            <input type="text" value={form.instagram} onChange={(e) => setField('instagram', e.target.value.replace(/^@+/, ''))} placeholder="usuario (sem @)" />
          </label>

          <div className="ad-cold-edit-row">
            <label className="ad-bc-field">
              <span className="ad-bc-label">Cidade</span>
              <input type="text" value={form.cidade} onChange={(e) => setField('cidade', e.target.value)} />
            </label>
            <label className="ad-bc-field">
              <span className="ad-bc-label">UF</span>
              <select value={form.estado} onChange={(e) => setField('estado', e.target.value)}>
                <option value="">—</option>
                {COLD_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </label>
          </div>

          <label className="ad-bc-field">
            <span className="ad-bc-label">Atuação</span>
            <select value={form.atuacao} onChange={(e) => setField('atuacao', e.target.value)}>
              <option value="">—</option>
              {COLD_ATUACOES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="ad-bc-field">
            <span className="ad-bc-label">Notas internas</span>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} />
          </label>

          <div className="ad-cold-edit-row">
            <label className="ad-cold-check">
              <input type="checkbox" checked={form.unsubscribed} onChange={(e) => setField('unsubscribed', e.target.checked)} />
              <span>Descadastrado (não recebe mais e-mails)</span>
            </label>
          </div>
          <div className="ad-cold-edit-row">
            <label className="ad-cold-check">
              <input type="radio" name="freq" checked={form.frequencia === 'normal'} onChange={() => setField('frequencia', 'normal')} />
              <span>Frequência normal</span>
            </label>
            <label className="ad-cold-check">
              <input type="radio" name="freq" checked={form.frequencia === 'menor'} onChange={() => setField('frequencia', 'menor')} />
              <span>Frequência menor (1 a cada 4 disparos)</span>
            </label>
          </div>

          <div className="ad-modal-actions">
            <button type="button" className="ad-btn ad-btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ad-btn ad-btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ============================================================
   COLD LEADS PANEL — importação e gestão de bases frias
   ============================================================ */
const ColdLeadsPanel = ({onLogout, onBackToOverview}) => {
  const [fileName, setFileName] = React.useState('');
  const [parsed, setParsed] = React.useState(null);
  const [importing, setImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(null);
  const [importResult, setImportResult] = React.useState(null);
  const [coldList, setColdList] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // Edição inline
  const [editing, setEditing] = React.useState(null); // lead em edição (modal)
  // Seleção pra mesclagem
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [mergeBusy, setMergeBusy] = React.useState(false);

  const loadCold = React.useCallback(async (q = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({limit: '200'});
      if (q) params.set('search', q);
      const res = await api(`/api/cold-leads?${params}`);
      setColdList({leads: res.leads || [], total: res.total || 0, totalAll: res.totalAll || 0});
    } catch (e) {
      setColdList({leads: [], total: 0, error: e.message});
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { loadCold(); }, [loadCold]);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setParsed(null);
    try {
      const data = await file.arrayBuffer();
      const ext = file.name.toLowerCase().split('.').pop();
      let wb;
      if (ext === 'csv' || ext === 'txt') {
        // Pra CSV/TXT, detecta encoding com TextDecoder do navegador.
        // Tenta UTF-8 (padrão moderno). Se o arquivo for Windows-1252/Latin-1,
        // o decoder lança erro e a gente cai no fallback.
        let text;
        try {
          text = new TextDecoder('utf-8', {fatal: true}).decode(data);
        } catch {
          // Não é UTF-8 válido; assume Windows-1252 (export antigo de Excel/email)
          text = new TextDecoder('windows-1252').decode(data);
        }
        wb = window.XLSX.read(text, {type: 'string', raw: true});
      } else {
        // XLSX/XLS: SheetJS lê os bytes binários direto (encoding interno UTF-8)
        wb = window.XLSX.read(data, {type: 'array', raw: true});
      }

      const findCol = (headers, regex) => headers.find((h) => regex.test(String(h).toLowerCase().trim()));

      const sheets = wb.SheetNames.map((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(ws, {defval: '', raw: false});
        if (!rows.length) {
          return {name: sheetName, rows: [], headers: [], validCount: 0, selected: false, emailCol: null};
        }
        const headers = Object.keys(rows[0]);
        const emailCol = findCol(headers, /^e-?mail$/) || findCol(headers, /email/);
        const nameCol = findCol(headers, /^nome$/) || findCol(headers, /^name$/) || findCol(headers, /nome completo/) || findCol(headers, /nome/) || findCol(headers, /name/);
        const phoneCol = findCol(headers, /^celular$/) || findCol(headers, /^telefone$/) || findCol(headers, /^phone$/) || findCol(headers, /whatsapp/i) || findCol(headers, /celular/) || findCol(headers, /telefone/);
        const statusCol = findCol(headers, /email_status/) || findCol(headers, /verifierstatus/) || findCol(headers, /status/);
        // Conta linhas com e-mail válido OU telefone válido (ambos servem
        // como canal de contato — e-mail pro Resend, telefone pro WhatsApp).
        let countEmail = 0, countPhone = 0, countBoth = 0;
        for (const r of rows) {
          const email = String(emailCol ? r[emailCol] || '' : '').trim();
          const phoneRaw = String(phoneCol ? r[phoneCol] || '' : '').replace(/\D/g, '');
          const hasEmail = email && email.includes('@');
          const hasPhone = phoneRaw && phoneRaw.length >= 10;
          if (hasEmail && hasPhone) countBoth++;
          else if (hasEmail) countEmail++;
          else if (hasPhone) countPhone++;
        }
        const validCount = countEmail + countPhone + countBoth;
        return {
          name: sheetName,
          rows,
          headers,
          emailCol, nameCol, phoneCol, statusCol,
          validCount,
          countEmail, countPhone, countBoth,
          selected: validCount > 0, // selecionada por default se tem qualquer canal
          hasContact: !!(emailCol || phoneCol), // serve pra checkbox ativa/desativa
        };
      });

      if (sheets.every((s) => s.rows.length === 0)) {
        alert('Arquivo vazio ou sem dados.'); return;
      }
      setParsed({sheets});
    } catch (e) {
      alert('Falha ao ler o arquivo: ' + e.message);
    }
  };

  const toggleSheet = (name) => {
    setParsed((cur) => cur ? {
      ...cur,
      sheets: cur.sheets.map((s) => s.name === name ? {...s, selected: !s.selected} : s),
    } : cur);
  };

  const totalValidToImport = parsed
    ? parsed.sheets.filter((s) => s.selected && s.hasContact).reduce((sum, s) => sum + s.validCount, 0)
    : 0;
  const totalEmailToImport = parsed
    ? parsed.sheets.filter((s) => s.selected && s.hasContact).reduce((sum, s) => sum + (s.countEmail || 0) + (s.countBoth || 0), 0)
    : 0;
  const totalPhoneOnlyToImport = parsed
    ? parsed.sheets.filter((s) => s.selected && s.hasContact).reduce((sum, s) => sum + (s.countPhone || 0), 0)
    : 0;

  const doImport = async () => {
    if (!parsed) return;
    const selected = parsed.sheets.filter((s) => s.selected && s.hasContact);
    if (selected.length === 0) {
      alert('Selecione pelo menos uma aba que tenha e-mail ou telefone.');
      return;
    }
    if (!confirm(`Vai importar ${totalValidToImport} entradas (${totalEmailToImport} com e-mail · ${totalPhoneOnlyToImport} só com telefone) de ${selected.length} aba${selected.length === 1 ? '' : 's'}. Duplicatas vão ser MESCLADAS no registro existente. Continuar?`)) return;

    setImporting(true);
    setImportResult(null);
    setImportProgress({sent: 0, imported: 0, merged: 0, invalid: 0, total: totalValidToImport});

    // Coleta entries de todas as abas selecionadas: e-mail OU telefone basta
    const allEntries = [];
    for (const s of selected) {
      for (const r of s.rows) {
        const email = String(s.emailCol ? r[s.emailCol] || '' : '').trim();
        const phone = String(s.phoneCol ? r[s.phoneCol] || '' : '').replace(/\D/g, '');
        const hasEmail = email && email.includes('@');
        const hasPhone = phone && phone.length >= 10;
        if (!hasEmail && !hasPhone) continue;
        allEntries.push({
          email: hasEmail ? email : '',
          nome: s.nameCol ? String(r[s.nameCol] || '').trim() : '',
          whatsapp: hasPhone ? phone : '',
          emailStatus: s.statusCol ? String(r[s.statusCol] || '').trim() : '',
          source: `${fileName} · ${s.name}`,
        });
      }
    }

    // Chunks pequenos pra cada chamada caber no timeout de 10s da Netlify
    // Function (cada entrada faz ~6 ops no Blobs). 40 é folgado e seguro.
    const CHUNK = 40;
    let totals = {imported: 0, merged: 0, invalid: 0};
    const errorsAcc = [];
    try {
      for (let i = 0; i < allEntries.length; i += CHUNK) {
        const chunk = allEntries.slice(i, i + CHUNK);
        // Retry até 3x em falhas de rede/timeout (resposta inválida = HTML)
        let res = null;
        let attempt = 0;
        let lastErr = '';
        while (attempt < 3 && !res) {
          attempt++;
          try {
            res = await api('/api/cold-leads', {
              method: 'POST',
              body: JSON.stringify({entries: chunk, source: fileName}),
            });
          } catch (e) {
            lastErr = e.message || 'erro de rede';
            if (attempt < 3) await new Promise((r) => setTimeout(r, 1200 * attempt));
          }
        }
        if (!res) {
          errorsAcc.push(`Lote ${i}-${i + chunk.length}: ${lastErr} (3 tentativas)`);
          // Continua importando os próximos lotes mesmo assim
        } else if (res.ok) {
          totals.imported += res.imported || 0;
          totals.merged += res.merged || 0;
          totals.invalid += res.invalid || 0;
          if (res.errors?.length) errorsAcc.push(...res.errors);
        } else {
          errorsAcc.push(res.error || 'erro');
        }
        setImportProgress({sent: i + chunk.length, total: allEntries.length, ...totals});
      }
      setImportResult({ok: errorsAcc.length === 0 || (totals.imported + totals.merged) > 0,
        ...totals, total: allEntries.length, errors: errorsAcc.slice(0, 10), partial: errorsAcc.length > 0});
      loadCold();
    } catch (e) {
      setImportResult({ok: false, error: e.message, ...totals, errors: errorsAcc.slice(0, 10)});
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const deleteCold = async (lead) => {
    const emails = lead.emails || (lead.email ? [lead.email] : []);
    const phones = lead.whatsapps || (lead.whatsapp ? [lead.whatsapp] : []);
    const label = emails[0] || phones[0] || lead.nome || lead.id;
    if (!confirm(`Remover ${label} da base de leads frios?`)) return;
    try {
      const qs = lead.id ? `leadId=${encodeURIComponent(lead.id)}`
        : emails[0] ? `email=${encodeURIComponent(emails[0])}`
        : `phone=${encodeURIComponent(phones[0])}`;
      await api(`/api/cold-leads?${qs}`, {method: 'DELETE'});
      loadCold(search);
    } catch (e) { alert('Falha: ' + e.message); }
  };

  const deleteBySource = async () => {
    const source = prompt(
      'Digite parte do nome do arquivo importado pra apagar todos os leads daquele import.\n\nExemplo: pra apagar tudo do "addressbookreport_xxx.csv" você pode digitar "addressbookreport".'
    );
    if (!source || !source.trim()) return;
    if (!confirm(`ATENÇÃO: vai apagar TODOS os leads frios cuja origem contém "${source}". Essa ação não dá pra desfazer. Continuar?`)) return;
    try {
      const res = await api(`/api/cold-leads?sourceContains=${encodeURIComponent(source.trim())}`, {method: 'DELETE'});
      alert(`${res.deleted || 0} leads removidos.`);
      loadCold(search);
    } catch (e) { alert('Falha: ' + e.message); }
  };

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const startMerge = () => {
    if (selectedIds.size < 2) { alert('Selecione 2 ou mais cadastros pra mesclar.'); return; }
    if (!coldList) return;
    const leads = coldList.leads.filter((l) => selectedIds.has(l.id));
    if (leads.length < 2) { alert('Cadastros selecionados não estão na visão atual.'); return; }
    // Primary: o que tem mais dado preenchido
    const score = (l) => (l.emails?.length || 0) + (l.whatsapps?.length || 0) + (l.nome ? 1 : 0) + (l.instagram ? 1 : 0);
    const sorted = [...leads].sort((a, b) => score(b) - score(a));
    const primaryId = prompt(
      'Qual cadastro mantemos como base?\n\n' + sorted.map((l, i) => `${i + 1}. ${l.nome || l.emails?.[0] || l.whatsapps?.[0]} (${l.emails?.length || 0} e-mails · ${l.whatsapps?.length || 0} tel)`).join('\n') + '\n\nDigite o número (Enter pra usar o 1):',
      '1'
    );
    if (!primaryId) return;
    const idx = (parseInt(primaryId, 10) || 1) - 1;
    const primary = sorted[idx];
    if (!primary) { alert('Opção inválida.'); return; }
    doMerge([...selectedIds], primary.id);
  };

  const doMerge = async (leadIds, primaryId) => {
    setMergeBusy(true);
    try {
      const res = await api('/api/cold-leads?action=merge', {
        method: 'PATCH',
        body: JSON.stringify({leadIds, primaryId}),
      });
      if (res.ok) {
        alert(`Mesclados ${leadIds.length} cadastros em um. ${res.removed || 0} removidos.`);
        setSelectedIds(new Set());
        loadCold(search);
      } else {
        alert('Falha: ' + (res.error || 'erro'));
      }
    } catch (e) { alert('Falha: ' + e.message); }
    finally { setMergeBusy(false); }
  };

  const saveEdit = async (form) => {
    try {
      const res = await api('/api/cold-leads', {
        method: 'PATCH',
        body: JSON.stringify({
          leadId: editing.id,
          ...form,
        }),
      });
      if (res.ok) {
        setEditing(null);
        loadCold(search);
      } else {
        alert('Falha: ' + (res.error || 'erro'));
      }
    } catch (e) { alert('Falha: ' + e.message); }
  };

  const fixEncoding = async () => {
    if (!confirm('Vai escanear todos os leads frios e tentar consertar acentos quebrados (mojibake do tipo "RogÃ©rio" → "Rogério"). Pode demorar alguns segundos. Continuar?')) return;
    try {
      const res = await api('/api/cold-leads-fix-encoding', {method: 'POST', body: JSON.stringify({})});
      const ex = res.examples?.length ? '\n\nExemplos:\n' + res.examples.map((e) => `${e.old} → ${e.new}`).join('\n') : '';
      alert(`Escaneados: ${res.scanned}\nConsertados: ${res.fixed}${ex}`);
      loadCold(search);
    } catch (e) { alert('Falha: ' + e.message); }
  };

  // ============ Índice resumo (usado pelo disparo) ============
  const [summaryStatus, setSummaryStatus] = React.useState(null);
  const loadSummaryStatus = React.useCallback(async () => {
    try {
      const res = await api('/api/cold-leads-summary');
      setSummaryStatus(res);
    } catch { setSummaryStatus({exists: false, status: 'unknown'}); }
  }, []);
  React.useEffect(() => { loadSummaryStatus(); }, [loadSummaryStatus]);
  React.useEffect(() => {
    if (summaryStatus?.status !== 'building') return;
    const id = setInterval(loadSummaryStatus, 4000);
    return () => clearInterval(id);
  }, [summaryStatus?.status, loadSummaryStatus]);

  const rebuildSummary = async () => {
    if (!confirm('Vai reconstruir o índice de leads frios usado pelo disparo de e-mail. Demora ~1-2 min em background. Continuar?')) return;
    try {
      await api('/api/cold-leads-summary', {method: 'POST', body: JSON.stringify({})});
      loadSummaryStatus();
    } catch (e) { alert('Falha: ' + e.message); }
  };

  return (
    <div className="ad-broadcast">
      <header className="ad-broadcast-head">
        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onBackToOverview}>← Voltar à visão geral</button>
        <h1 className="ad-broadcast-title">Leads frios</h1>
        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onLogout}>Sair</button>
      </header>

      <section className="ad-widget">
        <header className="ad-widget-head">
          <span className="ad-widget-eyebrow">Importar nova base</span>
          <h2 className="ad-widget-title">Upload de planilha</h2>
        </header>
        <p className="ad-bc-drafts-lead">
          Aceita <strong>CSV</strong> ou <strong>XLSX</strong>. O sistema detecta automaticamente as colunas de e-mail, nome e telefone. Entradas sem e-mail são <em>ignoradas</em>. Bounces (status "You can't send emails…") são <em>importados marcados</em> pra não receberem disparos.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => handleFile(e.target.files[0])}
          disabled={importing}
          className="ad-cold-file"
        />

        {parsed && (
          <div className="ad-cold-preview">
            <p className="ad-bc-drafts-lead">
              Arquivo tem <strong>{parsed.sheets.length} aba{parsed.sheets.length === 1 ? '' : 's'}</strong>. Marque as que quer importar:
            </p>

            <div className="ad-cold-sheets">
              {parsed.sheets.map((s) => (
                <label key={s.name} className={'ad-cold-sheet' + (s.selected ? ' is-on' : '') + (!s.hasContact ? ' is-disabled' : '')}>
                  <input
                    type="checkbox"
                    checked={s.selected && !!s.hasContact}
                    disabled={!s.hasContact}
                    onChange={() => toggleSheet(s.name)}
                  />
                  <div className="ad-cold-sheet-body">
                    <p className="ad-cold-sheet-name">{s.name}</p>
                    <p className="ad-cold-sheet-info">
                      {s.rows.length === 0 ? <span style={{color:'rgba(247,245,242,0.4)'}}>vazia</span>
                        : !s.hasContact ? <span style={{color:'#d97757'}}>sem coluna de e-mail nem telefone · ignorada</span>
                        : (
                          <>
                            <strong>{s.validCount}</strong> contatos de {s.rows.length} linhas
                            {' ('}
                            {(s.countBoth || 0) > 0 && <span style={{color:'#819470'}}>{s.countBoth} e-mail+tel · </span>}
                            {(s.countEmail || 0) > 0 && <span style={{color:'var(--sand)'}}>{s.countEmail} só e-mail · </span>}
                            {(s.countPhone || 0) > 0 && <span style={{color:'#B89579'}}>{s.countPhone} só tel</span>}
                            {')'}
                            <span className="ad-cold-tag" style={{marginLeft: 8}}>
                              {s.emailCol && <>e-mail: <code>{s.emailCol}</code></>}
                              {s.nameCol && <> · nome: <code>{s.nameCol}</code></>}
                              {s.phoneCol && <> · telefone: <code>{s.phoneCol}</code></>}
                            </span>
                          </>
                        )
                      }
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <button
              className="ad-btn ad-btn-primary ad-btn-lg"
              disabled={importing || totalValidToImport === 0}
              onClick={doImport}
            >
              {importing ? 'Importando…' : `Importar ${totalValidToImport} contatos (${totalEmailToImport} com e-mail · ${totalPhoneOnlyToImport} só com telefone)`}
            </button>

            {importProgress && (
              <div className="ad-bc-progress">
                <div className="ad-bc-progress-track">
                  <div className="ad-bc-progress-fill" style={{width: `${Math.round((importProgress.sent / importProgress.total) * 100)}%`}}></div>
                </div>
                <p className="ad-bc-progress-label">
                  Processando {importProgress.sent} de {importProgress.total} ·
                  <strong style={{color:'#819470'}}> {importProgress.imported} novos</strong> ·
                  <span style={{color:'var(--sand)'}}> {importProgress.merged} complementados</span>
                </p>
              </div>
            )}

            {importResult && (
              <div className={'ad-bc-result ' + (importResult.ok ? 'is-ok' : 'is-err')}>
                {importResult.ok ? (
                  <p>✓ Import concluído: <strong>{importResult.imported} novos</strong> · <strong>{importResult.merged} complementados</strong> · {importResult.invalid} inválidos</p>
                ) : <p>Erro: {importResult.error}</p>}
                {importResult.errors?.length > 0 && (
                  <details><summary>Erros</summary><ul>{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {editing && (
        <ColdLeadEditModal
          lead={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      <section className="ad-widget ad-bc-history">
        <header className="ad-widget-head">
          <span className="ad-widget-eyebrow">Base atual</span>
          <h2 className="ad-widget-title">Leads frios cadastrados <small style={{color:'rgba(247,245,242,0.55)'}}>{coldList?.totalAll != null ? `· ${coldList.totalAll} total` : ''}</small></h2>
        </header>
        <div className="ad-cold-search">
          <input
            type="search"
            placeholder="Buscar por e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadCold(search)}
          />
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => loadCold(search)}>Buscar</button>
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={fixEncoding}>↻ Consertar acentos</button>
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={rebuildSummary} disabled={summaryStatus?.status === 'building'}>
            {summaryStatus?.status === 'building'
              ? `Construindo índice… ${summaryStatus.progress || 0}/${summaryStatus.progressTotal || '?'}`
              : '↻ Reconstruir índice de disparo'}
          </button>
          <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={deleteBySource} style={{color: '#d97757'}}>Limpar por origem…</button>
        </div>
        {summaryStatus && (
          <p className="ad-bc-hint" style={{margin: '6px 0 14px', fontSize: 12, color: 'rgba(247,245,242,0.55)'}}>
            Índice de disparo:
            {summaryStatus.status === 'ready' && summaryStatus.builtAt && (
              <> <span style={{color: '#819470'}}>pronto</span> · {summaryStatus.count} e-mails únicos · atualizado em {fmtDate(summaryStatus.builtAt)}</>
            )}
            {summaryStatus.status === 'building' && (
              <> <span style={{color: 'var(--sand)'}}>construindo…</span> {summaryStatus.progress}/{summaryStatus.progressTotal || '?'} registros processados</>
            )}
            {summaryStatus.status === 'missing' && (
              <> <span style={{color: '#d97757'}}>não construído</span> · clica em "Reconstruir índice" antes de fazer disparo com leads frios</>
            )}
            {summaryStatus.status === 'error' && (
              <> <span style={{color: '#d97757'}}>erro: {summaryStatus.error}</span></>
            )}
            <br/>
            <span style={{color: 'rgba(247,245,242,0.4)'}}>O índice é o que o disparo de e-mail lê pra mandar pros leads frios. Reconstrói depois de importar bases novas ou editar muitos cadastros.</span>
          </p>
        )}
        {loading ? <p className="ad-bc-empty">Carregando…</p>
          : !coldList || coldList.leads.length === 0 ? <p className="ad-bc-empty">Nenhum lead frio {search ? 'encontrado pra busca' : 'ainda. Importe uma planilha acima.'}</p>
          : (
            <>
            <table className="ad-bc-history-table">
              <thead>
                <tr>
                  <th style={{width: 32}}><input type="checkbox" onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(coldList.leads.map((l) => l.id)));
                    else setSelectedIds(new Set());
                  }} checked={coldList.leads.length > 0 && selectedIds.size === coldList.leads.length} /></th>
                  <th>Canal</th>
                  <th>E-mail</th>
                  <th>Nome</th>
                  <th>WhatsApp</th>
                  <th>Instagram</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {coldList.leads.map((l) => {
                  const emails = l.emails || (l.email ? [l.email] : []);
                  const phones = l.whatsapps || (l.whatsapp ? [l.whatsapp] : []);
                  const checked = selectedIds.has(l.id);
                  return (
                  <tr key={l.id || l.email || l.whatsapp} className={checked ? 'is-selected' : ''}>
                    <td><input type="checkbox" checked={checked} onChange={() => toggleSelect(l.id)} /></td>
                    <td>
                      {l.canal === 'both' ? <span style={{color: '#819470'}}>e-mail + WA</span>
                        : l.canal === 'email' ? <span style={{color: 'var(--sand)'}}>e-mail</span>
                        : l.canal === 'whatsapp' ? <span style={{color: '#B89579'}}>WhatsApp</span>
                        : <span style={{color: 'rgba(247,245,242,0.4)'}}>—</span>}
                    </td>
                    <td className="ad-bc-history-subject">
                      {emails.length === 0 ? <span style={{color:'rgba(247,245,242,0.35)'}}>—</span>
                        : emails.length === 1 ? emails[0]
                        : <span title={emails.join('\n')}>{emails[0]} <span style={{color:'var(--sand)', fontSize:'10px'}}>+{emails.length - 1}</span></span>}
                    </td>
                    <td>{l.nome || <span style={{color:'rgba(247,245,242,0.35)'}}>—</span>}</td>
                    <td>
                      {phones.length === 0 ? <span style={{color:'rgba(247,245,242,0.35)'}}>—</span>
                        : phones.length === 1 ? phones[0]
                        : <span title={phones.join('\n')}>{phones[0]} <span style={{color:'var(--sand)', fontSize:'10px'}}>+{phones.length - 1}</span></span>}
                    </td>
                    <td>{l.instagram ? '@' + l.instagram : <span style={{color:'rgba(247,245,242,0.35)'}}>—</span>}</td>
                    <td className="ad-bc-history-filter" title={(l.sources || [l.source]).join('\n')}>
                      {l.source}{l.sources && l.sources.length > 1 ? <span style={{color:'var(--sand)', fontSize:'10px'}}> +{l.sources.length - 1}</span> : ''}
                    </td>
                    <td>
                      {l.unsubscribed ? <span style={{color:'#d97757'}}>descadastrou</span>
                        : l.convertedToHotAt ? <span style={{color:'#819470'}}>virou quente</span>
                        : l.emailStatus && l.emailStatus.toLowerCase().includes("can't send") ? <span style={{color:'#d97757'}}>bounce</span>
                        : l.frequencia === 'menor' ? <span style={{color:'#B89579'}}>freq. menor</span>
                        : <span style={{color:'rgba(247,245,242,0.6)'}}>frio</span>}
                    </td>
                    <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                      <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setEditing(l)} style={{marginRight: 6}}>Editar</button>
                      <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => deleteCold(l)}>Remover</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {selectedIds.size >= 2 && (
              <div className="ad-cold-merge-bar">
                <span><strong>{selectedIds.size}</strong> selecionados</span>
                <button className="ad-btn ad-btn-primary ad-btn-sm" onClick={startMerge} disabled={mergeBusy}>
                  {mergeBusy ? 'Mesclando…' : 'Mesclar selecionados'}
                </button>
                <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setSelectedIds(new Set())}>Limpar seleção</button>
              </div>
            )}
            </>
          )}
        {coldList && coldList.leads.length === 200 && (
          <p className="ad-bc-empty" style={{marginTop: 16}}>Mostrando primeiros 200. Use a busca pra filtrar.</p>
        )}
      </section>
    </div>
  );
};

/* ============================================================
   BROADCAST PANEL — disparo de e-mail pros leads
   ============================================================ */

// Templates de materiais (rascunhos prontos). Pra cada material publicado,
// um e-mail pré-formatado que convida quem AINDA NÃO baixou a pegar.
// Quando você publicar um novo material, basta adicionar uma entrada aqui
// e ele já aparece na lista de rascunhos disponíveis.
const MATERIAL_BROADCASTS = [
  {
    origem: 'saude-mental',
    nome: 'Saúde Mental do Síndico',
    eyebrow: 'Volume 09 · Guia editorial',
    titulo: 'A profissão que todo mundo cobra mas poucos compreendem.',
    desc: 'Um guia sobre o custo emocional invisível da profissão, com 10 capítulos, autoavaliação com +50 itens e plano de ação de 30 dias.',
    landingPath: '/saude-mental/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'gestao-sob-ataque',
    nome: 'Gestão sob Ataque',
    eyebrow: 'Volume 07 · Guia editorial',
    titulo: 'Quando a oposição saudável vira sabotagem.',
    desc: '20 capítulos pra atravessar boatos, grupos inflamados e tentativas de destituição. Com 10 modelos prontos de resposta e checklist de proteção da gestão.',
    landingPath: '/gestao-sob-ataque/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'conflitos',
    nome: 'Conflitos absurdos em condomínio',
    eyebrow: 'Volume 08 · Guia editorial',
    titulo: 'O que ninguém te conta sobre conflito no condomínio.',
    desc: 'Os casos mais absurdos de conflito real em condomínio, com método pra desarmar antes de virarem crise.',
    landingPath: '/conflitos/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'nr1',
    nome: 'NR-1 nos Condomínios',
    eyebrow: 'Volume 06 · Guia editorial',
    titulo: 'A norma que mudou o jogo da gestão de pessoas no condomínio.',
    desc: 'Tudo sobre a NR-1 aplicada à realidade condominial. O que muda na prática e como se adequar sem virar refém de auditoria.',
    landingPath: '/nr1/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: '50-frases',
    nome: '50 Frases pra responder sem perder a cabeça',
    eyebrow: 'Volume 05 · Guia editorial',
    titulo: 'As frases certas pra responder no condomínio.',
    desc: '50 respostas prontas para os comentários, cobranças e provocações mais comuns no dia a dia da sindicatura.',
    landingPath: '/50-frases/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'sobrevivencia-whatsapp',
    nome: 'Sobrevivência ao WhatsApp do Condomínio',
    eyebrow: 'Volume 04 · Manual',
    titulo: 'Como sobreviver ao grupo de WhatsApp do condomínio.',
    desc: 'O guia prático pra parar de ser refém do grupo. Comunicação, protocolo e quando responder (ou não).',
    landingPath: '/sobrevivencia-whatsapp/',
    ctaLabel: 'Baixar o manual em PDF',
  },
  {
    origem: 'bombeiro',
    nome: 'O Bombeiro · Série Arquétipos',
    eyebrow: 'Volume 12 · Série Arquétipos',
    titulo: 'Você vive apagando incêndio?',
    desc: 'Diagnóstico pra síndicos que vivem correndo atrás de problema. Matriz de prioridades, método 30-30-30 e plano de 30 dias.',
    landingPath: '/bombeiro/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'politico',
    nome: 'O Político · Série Arquétipos',
    eyebrow: 'Volume 13 · Série Arquétipos',
    titulo: 'Quer agradar todo mundo? Tem preço.',
    desc: 'Pra síndicos bem-intencionados que estão perdendo autoridade na busca por consenso. Equilibrar ser aprovado e ser respeitado.',
    landingPath: '/politico/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'solitario',
    nome: 'O Solitário · Série Arquétipos',
    eyebrow: 'Volume 14 · Série Arquétipos',
    titulo: 'Você carrega o condomínio sozinho?',
    desc: 'Pra síndicos dedicados que viraram o gargalo da gestão. Delegação, processo e fim do modo herói.',
    landingPath: '/solitario/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'burocrata',
    nome: 'O Burocrata · Série Arquétipos',
    eyebrow: 'Volume 15 · Série Arquétipos',
    titulo: 'Você informa, mas não conecta?',
    desc: 'Pra síndicos organizados que escrevem comunicado impecável e ninguém lê. Transforme informação em conexão.',
    landingPath: '/burocrata/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'estrategista',
    nome: 'O Estrategista · Série Arquétipos',
    eyebrow: 'Volume 16 · Série Arquétipos',
    titulo: 'Os bastidores das gestões que viram referência.',
    desc: 'Pra quem já opera em modo estratégico e quer sustentar esse jeito de trabalhar. Visão dos 5 horizontes e plano de 12 meses.',
    landingPath: '/estrategista/',
    ctaLabel: 'Baixar o guia em PDF',
  },
  {
    origem: 'sargento',
    nome: 'O Sargento · Série Arquétipos',
    eyebrow: 'Volume 17 · Série Arquétipos',
    titulo: 'Obedecido ou seguido?',
    desc: 'Pra síndicos firmes que confundem autoridade com medo. 10 sinais de alerta e os 5 pilares da autoridade verdadeira.',
    landingPath: '/sargento/',
    ctaLabel: 'Baixar o guia em PDF',
  },
];

// Constrói o HTML do e-mail pra um material, com a identidade da marca.
function buildMaterialHtml(m) {
  const url = `https://bastidoresdasindicatura.com.br${m.landingPath}`;
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
  <tr><td align="center" style="padding:32px 16px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#F7F5F2">
      <tr><td style="padding:32px 40px 18px;border-bottom:1px solid #E8E2D8">
        <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29;letter-spacing:-.01em">Bastidores da Sindicatura</p>
        <p style="margin:6px 0 0;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#B89579;font-weight:600">por Juliana Moreira</p>
      </td></tr>
      <tr><td style="padding:40px">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B89579;font-weight:700">${m.eyebrow}</p>
        <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:32px;line-height:1.1;margin:0 0 18px;color:#1A1C29">Olá, {{nome}}.</h1>
        <p style="font-size:18px;line-height:1.4;color:#1A1C29;margin:0 0 18px;font-family:'Bodoni Moda',Georgia,serif;font-style:italic">${m.titulo}</p>
        <p style="font-size:15px;line-height:1.6;color:#1A1C29;margin:0 0 28px">${m.desc}</p>
        <p style="text-align:center;margin:0 0 32px">
          <a href="${url}" style="display:inline-block;background:#1A1C29;color:#F7F5F2;padding:16px 28px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">${m.ctaLabel}</a>
        </p>
        <hr style="border:none;border-top:1px dashed #E8E2D8;margin:24px 0">
        <p style="font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:18px;color:#1A1C29;margin:0 0 8px">P.S.</p>
        <p style="font-size:14px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
          Se quiser ir além dos materiais, conheça a <strong>Mentoria Bastidores da Sindicatura.</strong> Turma 01 começa em setembro de 2026, com vagas limitadas.
        </p>
        <p style="margin:0 0 8px">
          <a href="https://bastidoresdasindicatura.com.br/#vagas" style="color:#B89579;font-weight:600">Conhecer a Mentoria</a>
        </p>
        <div style="margin-top:28px;padding-top:24px;border-top:1px solid #E8E2D8">
          <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29">Juliana Moreira</p>
          <p style="margin:6px 0 0;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8881;font-weight:600">CEO Sindicompany · Condo Academy</p>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:#8a8881">
            <a href="https://instagram.com/dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">Instagram @dicadajumoreira</a><br>
            <a href="https://youtube.com/@dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">YouTube @dicadajumoreira</a>
          </p>
        </div>
      </td></tr>
      <tr><td style="padding:22px 40px;border-top:1px solid #E8E2D8;background:#FBF8F2">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8881;text-align:center">
          Você está recebendo este e-mail porque se cadastrou em <a href="https://bastidoresdasindicatura.com.br" style="color:#B89579">bastidoresdasindicatura.com.br</a>.
        </p>
        <p style="margin:6px 0 0;font-size:10px;line-height:1.6;color:#8a8881;text-align:center;letter-spacing:.06em">
          <a href="https://bastidoresdasindicatura.com.br/politica-de-privacidade/" style="color:#B89579">Política de Privacidade</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const MBA_DEFAULT_SUBJECT = 'Uma bolsa integral do MBA Executivo IBMEC vai ser sorteada no sábado.';
const MBA_DEFAULT_HTML = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2EFE9;font-family:Georgia,'Bodoni Moda',serif">
  <tr><td align="center" style="padding:32px 16px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#F7F5F2">
      <tr><td style="padding:32px 40px 18px;border-bottom:1px solid #E8E2D8">
        <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29;letter-spacing:-.01em">Bastidores da Sindicatura</p>
        <p style="margin:6px 0 0;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#B89579;font-weight:600">por Juliana Moreira</p>
      </td></tr>
      <tr><td style="padding:40px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B89579;font-weight:700">Concurso · Patrocínio Condo Academy</p>
        <h1 style="font-family:'Bodoni Moda',Georgia,serif;font-weight:400;font-size:34px;line-height:1.05;margin:0 0 18px;color:#1A1C29">Olá, {{nome}}.</h1>
        <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
          Tenho uma notícia importante e o tempo é curto.
        </p>
        <p style="font-size:16px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
          A <strong>Condo Academy</strong>, em parceria com a <strong>IBMEC</strong>, vai sortear <strong>uma bolsa integral de 100%</strong> do MBA Executivo em Gestão Condominial. 360 horas de aula, 12 meses, certificação IBMEC.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0;background:#FBF8F2;border-left:3px solid #B89579">
          <tr><td style="padding:18px 22px">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B89579;font-weight:700">Inscrições até</p>
            <p style="margin:0 0 16px;font-family:'Bodoni Moda',Georgia,serif;font-size:24px;color:#1A1C29">12 de junho de 2026</p>
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B89579;font-weight:700">Sorteio · ao vivo</p>
            <p style="margin:0 0 4px;font-family:'Bodoni Moda',Georgia,serif;font-size:24px;color:#1A1C29">Sábado, 13 de junho · 12h</p>
            <p style="margin:0;font-size:13px;color:#1A1C29">No Instagram <a href="https://instagram.com/dicadajumoreira" style="color:#B89579;font-weight:600;text-decoration:none">@dicadajumoreira</a></p>
          </td></tr>
        </table>
        <p style="text-align:center;margin:0 0 28px">
          <a href="https://bastidoresdasindicatura.com.br/mba/" style="display:inline-block;background:#1A1C29;color:#F7F5F2;padding:16px 28px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Quero concorrer à bolsa</a>
        </p>
        <p style="font-size:14px;line-height:1.6;color:#1A1C29;margin:0 0 16px">
          A inscrição leva 2 minutos. A turma começa semana que vem.
        </p>
        <p style="font-size:12px;line-height:1.5;color:#8a8881;margin:0 0 16px">
          Veja o <a href="https://bastidoresdasindicatura.com.br/regulamento-mba/" style="color:#B89579">regulamento completo do sorteio</a>.
        </p>
        <p style="font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:16px;color:#B89579;margin:24px 0 0">
          Boa sorte.
        </p>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #E8E2D8">
          <p style="margin:0;font-family:'Bodoni Moda',Georgia,serif;font-style:italic;font-size:20px;color:#1A1C29">Juliana Moreira</p>
          <p style="margin:6px 0 0;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8881;font-weight:600">CEO Sindicompany · Condo Academy</p>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:#8a8881">
            <a href="https://instagram.com/dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">Instagram @dicadajumoreira</a><br>
            <a href="https://youtube.com/@dicadajumoreira" style="color:#B89579;text-decoration:none;font-weight:600">YouTube @dicadajumoreira</a>
          </p>
        </div>
      </td></tr>
      <tr><td style="padding:22px 40px;border-top:1px solid #E8E2D8;background:#FBF8F2">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8881;text-align:center">
          Você está recebendo este e-mail porque se cadastrou em <a href="https://bastidoresdasindicatura.com.br" style="color:#B89579">bastidoresdasindicatura.com.br</a>.
        </p>
        <p style="margin:6px 0 0;font-size:10px;line-height:1.6;color:#8a8881;text-align:center;letter-spacing:.06em">
          <a href="https://bastidoresdasindicatura.com.br/politica-de-privacidade/" style="color:#B89579">Política de Privacidade</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

const BroadcastPanel = ({onLogout, onBackToOverview, leadsAll, leadsLoading, leadsLoadInfo, onReloadLeads}) => {
  const [subject, setSubject] = React.useState(MBA_DEFAULT_SUBJECT);
  const [html, setHtml] = React.useState(MBA_DEFAULT_HTML);
  const [excludeOrigens, setExcludeOrigens] = React.useState(() => new Set(['sorteio-mba']));
  const [statusFilter, setStatusFilter] = React.useState(() => new Set()); // vazio = todos
  const [includeCold, setIncludeCold] = React.useState(false);
  const [coldCount, setColdCount] = React.useState(null);
  const [testEmail, setTestEmail] = React.useState('contato@dicadajumoreira.com.br');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [history, setHistory] = React.useState(null);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  // Carrega o histórico de disparos
  const loadHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api('/api/broadcast-history');
      setHistory(res.history || []);
    } catch (e) {
      console.error('falha ao carregar histórico:', e);
      setHistory([]);
    } finally { setLoadingHistory(false); }
  }, []);
  React.useEffect(() => { loadHistory(); }, [loadHistory]);

  // Carrega a contagem de leads frios elegíveis (não-descadastrados)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/api/cold-leads?limit=1');
        if (!cancelled) setColdCount(res.totalAll || 0);
      } catch { if (!cancelled) setColdCount(0); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Carrega um rascunho de material no compositor
  const loadDraft = (m) => {
    setSubject(`${m.titulo}`);
    setHtml(buildMaterialHtml(m));
    setExcludeOrigens(new Set([m.origem]));
    setStatusFilter(new Set());
    setResult(null);
    // Sobe a tela pro topo do compositor
    setTimeout(() => window.scrollTo({top: 0, behavior: 'smooth'}), 50);
  };

  // Restaura a campanha do MBA (rascunho original)
  const loadMBADraft = () => {
    setSubject(MBA_DEFAULT_SUBJECT);
    setHtml(MBA_DEFAULT_HTML);
    setExcludeOrigens(new Set(['sorteio-mba']));
    setStatusFilter(new Set());
    setResult(null);
    setTimeout(() => window.scrollTo({top: 0, behavior: 'smooth'}), 50);
  };

  // Cálculo de destinatários no front (mesma lógica do backend) + funil detalhado
  const targets = React.useMemo(() => {
    if (!leadsAll || !leadsAll.length) {
      return {count: 0, list: [], funnel: {totalLeads: 0, activeLeads: 0, withEmail: 0, uniqueEmails: 0, afterExclude: 0, afterStatus: 0}};
    }
    const totalLeads = leadsAll.length;
    let activeLeads = 0;     // não estão na lixeira
    let withEmail = 0;       // têm campo email com @
    const byEmail = new Map();
    for (const l of leadsAll) {
      if (l.deletedAt) continue;
      activeLeads++;
      const email = String(l.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      withEmail++;
      if (!byEmail.has(email)) byEmail.set(email, {leads: [], origens: new Set()});
      const e = byEmail.get(email);
      e.leads.push(l);
      e.origens.add(l.origem || 'mentoria');
    }
    const uniqueEmails = byEmail.size;
    let afterExclude = 0;
    let afterStatus = 0;
    const list = [];
    for (const [email, entry] of byEmail) {
      let skip = false;
      for (const o of entry.origens) if (excludeOrigens.has(o)) { skip = true; break; }
      if (skip) continue;
      afterExclude++;
      const rep = entry.leads.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (statusFilter.size && !statusFilter.has(rep.status || 'novo')) continue;
      afterStatus++;
      list.push({email, rep, origens: [...entry.origens]});
    }
    return {
      count: list.length,
      list,
      funnel: {totalLeads, activeLeads, withEmail, uniqueEmails, afterExclude, afterStatus},
    };
  }, [leadsAll, excludeOrigens, statusFilter]);

  const toggleOrigem = (o) => setExcludeOrigens((prev) => {
    const next = new Set(prev);
    if (next.has(o)) next.delete(o); else next.add(o);
    return next;
  });
  const toggleStatus = (s) => setStatusFilter((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  const sendTest = async () => {
    if (!testEmail || !testEmail.includes('@')) { alert('Informe um e-mail válido pro teste.'); return; }
    setBusy(true); setResult(null);
    try {
      const res = await api('/api/broadcast', {
        method: 'POST',
        body: JSON.stringify({subject, html, test: {email: testEmail}}),
      });
      setResult({type: 'test', ok: true, ...res});
    } catch (e) {
      setResult({type: 'test', ok: false, error: e.message});
    } finally { setBusy(false); }
  };

  const [progress, setProgress] = React.useState(null); // {sent, failed, processed, total}
  const [scheduledFor, setScheduledFor] = React.useState(''); // ISO string "YYYY-MM-DDTHH:mm" do <input type="datetime-local">
  const [scheduledList, setScheduledList] = React.useState(null);
  const [recipientsModal, setRecipientsModal] = React.useState(null); // { broadcastId, subject, recipients, loading }

  const openRecipients = async (h) => {
    setRecipientsModal({broadcastId: h.id, subject: h.subject, recipients: null, loading: true});
    try {
      const res = await api(`/api/broadcast-recipients?broadcastId=${encodeURIComponent(h.id)}`);
      setRecipientsModal((cur) => cur && cur.broadcastId === h.id ? {...cur, recipients: res.recipients || [], loading: false} : cur);
    } catch (e) {
      setRecipientsModal((cur) => cur && cur.broadcastId === h.id ? {...cur, recipients: [], loading: false, error: e.message} : cur);
    }
  };

  // Retoma um disparo que parou no meio (offset = sent + failed do original).
  // Usa o MESMO broadcastId pra continuar acumulando no histórico, mesma
  // ordenação determinística dos destinatários (por email) garante que
  // não vai re-enviar pra quem já recebeu.
  const resumeBroadcast = async (h) => {
    const processed = (h.sent || 0) + (h.failed || 0);
    const remaining = h.total - processed;
    if (!confirm(`Vai continuar este disparo a partir do destinatário ${processed + 1} (faltam ${remaining}). Mesmo broadcastId, sem duplicar pra quem já recebeu. Continuar?`)) return;
    setBusy(true);
    setResult(null);
    setProgress({sent: h.sent || 0, failed: h.failed || 0, processed, total: h.total});

    const LIMIT_PER_CALL = 40;
    let offset = processed;
    let totalSent = h.sent || 0;
    let totalFailed = h.failed || 0;
    let total = h.total;
    const errorsAcc = [];
    let failCount = 0;

    try {
      for (let i = 0; i < 600; i++) {
        let res;
        try {
          // resumeFrom: backend lê subject/html/filter/broadcastId direto
          // do registro original. Frontend só passa o id e o offset.
          res = await api('/api/broadcast', {
            method: 'POST',
            body: JSON.stringify({
              resumeFrom: h.id,
              offset, limit: LIMIT_PER_CALL,
            }),
          });
        } catch (e) {
          failCount++;
          if (failCount >= 3) { errorsAcc.push(`Backend caiu 3x no offset ${offset}: ${e.message}`); break; }
          await new Promise((r) => setTimeout(r, 1500 * failCount));
          continue;
        }
        failCount = 0;
        if (!res.ok) { errorsAcc.push(res.error || 'erro'); break; }
        totalSent += res.sent || 0;
        totalFailed += res.failed || 0;
        total = res.total || total;
        if (res.errors?.length) errorsAcc.push(...res.errors);
        setProgress({sent: totalSent, failed: totalFailed, processed: res.nextOffset, total});
        if (!res.hasMore) break;
        offset = res.nextOffset;
      }
      setResult({type: 'real', ok: errorsAcc.length === 0 || totalSent > (h.sent || 0), sent: totalSent, failed: totalFailed, total, errors: errorsAcc.slice(0, 10)});
      loadHistory();
    } catch (e) {
      setResult({type: 'real', ok: false, error: e.message});
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const resendFailed = async (sourceId, failedCount) => {
    if (!confirm(`Reenviar pros ${failedCount} e-mails que falharam? O sistema vai mandar o MESMO conteúdo do disparo original, apenas pra quem não recebeu.`)) return;
    setRecipientsModal(null);
    setBusy(true);
    setResult(null);
    setProgress({sent: 0, failed: 0, processed: 0, total: 0});

    const broadcastId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const LIMIT_PER_CALL = 40;
    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let total = 0;
    const errorsAcc = [];
    let failCountApi = 0;

    try {
      for (let i = 0; i < 600; i++) {
        let res;
        try {
          res = await api('/api/broadcast', {
            method: 'POST',
            body: JSON.stringify({
              resendFailedFrom: sourceId,
              offset, limit: LIMIT_PER_CALL, broadcastId,
            }),
          });
        } catch (e) {
          failCountApi++;
          if (failCountApi >= 3) { errorsAcc.push(`Backend caiu 3x no offset ${offset}: ${e.message}`); break; }
          await new Promise((r) => setTimeout(r, 1500 * failCountApi));
          continue;
        }
        failCountApi = 0;
        if (!res.ok) { errorsAcc.push(res.error || 'erro'); break; }
        totalSent += res.sent || 0;
        totalFailed += res.failed || 0;
        total = res.total || total;
        if (res.errors?.length) errorsAcc.push(...res.errors);
        setProgress({sent: totalSent, failed: totalFailed, processed: res.nextOffset, total});
        if (!res.hasMore) break;
        offset = res.nextOffset;
      }
      setResult({type: 'resend', ok: errorsAcc.length === 0 || totalSent > 0, sent: totalSent, failed: totalFailed, total, errors: errorsAcc.slice(0, 10)});
      loadHistory();
    } catch (e) {
      setResult({type: 'resend', ok: false, error: e.message});
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // Carrega lista de agendamentos pendentes
  const loadScheduled = React.useCallback(async () => {
    try {
      const res = await api('/api/scheduled-broadcasts');
      setScheduledList(res.scheduled || []);
    } catch (e) { console.error('falha ao carregar agendamentos:', e); setScheduledList([]); }
  }, []);
  React.useEffect(() => { loadScheduled(); }, [loadScheduled]);

  const schedule = async () => {
    if (!scheduledFor) { alert('Escolha uma data e hora pro agendamento.'); return; }
    if (includeCold) {
      try {
        const s = await api('/api/cold-leads-summary');
        if (s.status !== 'ready' || !s.exists) {
          if (!confirm(
            'O índice de leads frios não está pronto. O agendamento pode falhar na hora marcada se o índice não estiver disponível.\n\nRecomendo cancelar, ir em "Leads frios" e clicar em "Reconstruir índice" antes de agendar.\n\nContinuar mesmo assim?'
          )) return;
        }
      } catch {}
    }
    setBusy(true); setResult(null);
    try {
      const filter = {
        excludeOrigens: [...excludeOrigens],
        statuses: statusFilter.size ? [...statusFilter] : undefined,
        includeCold: includeCold || undefined,
      };
      // Trata o valor do datetime-local SEMPRE como horário de Brasília (UTC-3),
      // ignorando o fuso do navegador da pessoa que está agendando.
      const brasiliaIso = brasiliaInputToUtcIso(scheduledFor);
      const res = await api('/api/scheduled-broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          subject, html, filter,
          scheduledFor: brasiliaIso,
          targetCount: targets.count,
        }),
      });
      if (res.ok) {
        setResult({type: 'schedule', ok: true, scheduledFor: res.scheduledFor});
        setScheduledFor('');
        loadScheduled();
      } else {
        setResult({type: 'schedule', ok: false, error: res.error});
      }
    } catch (e) {
      setResult({type: 'schedule', ok: false, error: e.message});
    } finally { setBusy(false); }
  };

  const cancelScheduled = async (id) => {
    if (!confirm('Cancelar esse agendamento? A ação não dá pra desfazer.')) return;
    try {
      await api(`/api/scheduled-broadcasts?id=${encodeURIComponent(id)}`, {method: 'DELETE'});
      loadScheduled();
    } catch (e) { alert('Falha ao cancelar: ' + e.message); }
  };

  const runScheduledNow = async (id) => {
    if (!confirm('Executar esse agendamento agora? O disparo vai começar imediatamente.')) return;
    setBusy(true);
    try {
      const res = await api('/api/run-pending-broadcasts', {
        method: 'POST',
        body: JSON.stringify({id}),
      });
      if (res.ok) {
        const r = res.results?.[0];
        if (r && !r.error) {
          alert(`Disparo concluído: ${r.sent} enviados${r.failed ? `, ${r.failed} falharam` : ''}.`);
        } else if (r && r.error) {
          alert('Erro no disparo: ' + r.error);
        } else {
          alert(res.message || 'Nenhum agendamento foi processado.');
        }
        loadScheduled();
        loadHistory();
      } else {
        alert('Erro: ' + (res.error || 'desconhecido'));
      }
    } catch (e) { alert('Falha: ' + e.message); }
    finally { setBusy(false); }
  };

  // Verifica se o índice de leads frios está pronto antes de chamar o
  // broadcast. Se não está, oferece pra construir.
  const ensureColdSummaryReady = async () => {
    if (!includeCold) return true;
    try {
      const s = await api('/api/cold-leads-summary');
      if (s.status === 'ready' && s.exists) return true;
      if (s.status === 'building') {
        alert(`O índice de leads frios ainda tá sendo construído (${s.progress || 0} de ${s.progressTotal || '?'} processados). Aguarda terminar e tenta de novo.`);
        return false;
      }
      // missing ou error
      if (confirm(
        'O índice de leads frios precisa ser construído antes do disparo (demora ~1-2 min em background).\n\nClica OK pra eu disparar a construção agora. Quando terminar, volta aqui e clica em "Disparar" de novo.'
      )) {
        try { await api('/api/cold-leads-summary', {method: 'POST', body: JSON.stringify({})}); } catch {}
        alert('Construção iniciada. Aguarda ~1-2 min, recarrega a página e tenta o disparo de novo.');
      }
      return false;
    } catch (e) {
      alert('Falha ao verificar índice de leads frios: ' + e.message);
      return false;
    }
  };

  const sendReal = async () => {
    setConfirmOpen(false);
    const okCold = await ensureColdSummaryReady();
    if (!okCold) return;
    setBusy(true);
    setResult(null);
    setProgress({sent: 0, failed: 0, processed: 0, total: 0});

    const filter = {
      excludeOrigens: [...excludeOrigens],
      statuses: statusFilter.size ? [...statusFilter] : undefined,
      includeCold: includeCold || undefined,
    };
    const broadcastId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const LIMIT_PER_CALL = 40;
    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let total = 0;
    const errorsAcc = [];
    let failCount = 0;

    try {
      // Loop de paginação: chama backend até não ter mais
      // Cap de segurança: 600 chamadas (= até 24.000 e-mails)
      // 11k leads × ~0.5s por chamada paginada ≈ 90 min total.
      for (let i = 0; i < 600; i++) {
        let res;
        try {
          res = await api('/api/broadcast', {
            method: 'POST',
            body: JSON.stringify({
              subject, html, filter,
              offset, limit: LIMIT_PER_CALL, broadcastId,
            }),
          });
        } catch (e) {
          // Backend caiu ou timeout. Tenta de novo até 3x antes de desistir.
          failCount++;
          if (failCount >= 3) {
            errorsAcc.push(`Backend não respondeu após 3 tentativas no offset ${offset}: ${e.message}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 1500 * failCount));
          continue;
        }
        failCount = 0;

        if (!res.ok) {
          errorsAcc.push(res.error || 'erro desconhecido');
          break;
        }

        totalSent += res.sent || 0;
        totalFailed += res.failed || 0;
        total = res.total || total;
        if (res.errors && res.errors.length) errorsAcc.push(...res.errors);

        setProgress({
          sent: totalSent,
          failed: totalFailed,
          processed: res.nextOffset,
          total,
        });

        if (!res.hasMore) break;
        offset = res.nextOffset;
      }

      setResult({
        type: 'real',
        ok: errorsAcc.length === 0 || totalSent > 0,
        sent: totalSent,
        failed: totalFailed,
        total,
        errors: errorsAcc.slice(0, 10),
      });
      loadHistory();
    } catch (e) {
      setResult({type: 'real', ok: false, error: e.message});
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const previewHtml = html
    .replace(/\{\{nome\}\}/g, 'Maria')
    .replace(/\{\{material\}\}/g, 'o seu material');

  // Conta quantos leads ainda não têm cada material (pra mostrar nos rascunhos)
  const countNotHaving = (origem) => {
    if (!leadsAll || !leadsAll.length) return 0;
    const byEmail = new Map();
    for (const l of leadsAll) {
      if (l.deletedAt) continue;
      const email = String(l.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      if (!byEmail.has(email)) byEmail.set(email, new Set());
      byEmail.get(email).add(l.origem || 'mentoria');
    }
    let n = 0;
    for (const origens of byEmail.values()) if (!origens.has(origem)) n++;
    return n;
  };

  // Marca quais rascunhos já foram disparados pelo menos uma vez
  const sentOrigens = React.useMemo(() => {
    const s = new Set();
    if (history) {
      for (const h of history) {
        for (const o of (h.origensExcluded || [])) s.add(o);
      }
    }
    return s;
  }, [history]);

  return (
    <div className="ad-broadcast">
      <header className="ad-broadcast-head">
        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onBackToOverview}>← Voltar à visão geral</button>
        <h1 className="ad-broadcast-title">Disparo de e-mail</h1>
        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onLogout}>Sair</button>
      </header>

      {/* Rascunhos prontos por material */}
      <section className="ad-widget ad-bc-drafts">
        <header className="ad-widget-head">
          <span className="ad-widget-eyebrow">Rascunhos prontos</span>
          <h2 className="ad-widget-title">Por material publicado</h2>
        </header>
        <p className="ad-bc-drafts-lead">
          Cada material já publicado tem um rascunho pré-formatado. Clica em um deles pra carregar no compositor abaixo. O filtro já vem marcado pra excluir quem <em>já tem</em> o material, ou seja, só vai pros leads que ainda não receberam.
        </p>
        <div className="ad-bc-drafts-grid">
          <button
            type="button"
            className={'ad-bc-draft' + (sentOrigens.has('sorteio-mba') ? ' is-sent' : '')}
            onClick={loadMBADraft}
          >
            <div className="ad-bc-draft-head">
              <span className="ad-bc-draft-eyebrow">Sorteio MBA IBMEC</span>
              {sentOrigens.has('sorteio-mba') && <span className="ad-bc-draft-badge">Já enviado</span>}
            </div>
            <h3 className="ad-bc-draft-title">Bolsa integral do MBA Executivo</h3>
            <p className="ad-bc-draft-meta">
              {leadsAll ? `${countNotHaving('sorteio-mba')} leads não inscritos` : 'Carregando…'}
            </p>
          </button>
          {MATERIAL_BROADCASTS.map((m) => (
            <button
              key={m.origem}
              type="button"
              className={'ad-bc-draft' + (sentOrigens.has(m.origem) ? ' is-sent' : '')}
              onClick={() => loadDraft(m)}
            >
              <div className="ad-bc-draft-head">
                <span className="ad-bc-draft-eyebrow">{m.eyebrow}</span>
                {sentOrigens.has(m.origem) && <span className="ad-bc-draft-badge">Já enviado</span>}
              </div>
              <h3 className="ad-bc-draft-title">{m.nome}</h3>
              <p className="ad-bc-draft-meta">
                {leadsAll ? `${countNotHaving(m.origem)} leads sem o material` : 'Carregando…'}
              </p>
            </button>
          ))}
        </div>
      </section>

      <div className="ad-broadcast-grid">
        <div className="ad-broadcast-compose">
          <section className="ad-widget">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Mensagem</span>
              <h2 className="ad-widget-title">Composição</h2>
            </header>
            <label className="ad-bc-field">
              <span className="ad-bc-label">Assunto</span>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do e-mail" />
            </label>
            <label className="ad-bc-field">
              <span className="ad-bc-label">Corpo do e-mail (HTML)</span>
              <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={18} spellCheck={false} />
              <span className="ad-bc-hint">Use <code>{'{{nome}}'}</code> e <code>{'{{material}}'}</code> pra personalizar.</span>
            </label>
          </section>

          <section className="ad-widget">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Quem recebe</span>
              <h2 className="ad-widget-title">Filtros</h2>
            </header>
            <div className="ad-bc-section">
              <p className="ad-bc-section-title">Excluir quem já se cadastrou em:</p>
              <div className="ad-bc-checks">
                {ORIGEM_ORDER.map((o) => (
                  <label key={o} className={'ad-bc-check' + (excludeOrigens.has(o) ? ' is-on' : '')}>
                    <input type="checkbox" checked={excludeOrigens.has(o)} onChange={() => toggleOrigem(o)} />
                    <span>{ORIGEM_LABELS[o] || o}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="ad-bc-section">
              <p className="ad-bc-section-title">Status (opcional · vazio = todos):</p>
              <div className="ad-bc-checks">
                {STATUS_ORDER.map((s) => (
                  <label key={s} className={'ad-bc-check' + (statusFilter.has(s) ? ' is-on' : '')}>
                    <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} />
                    <span>{STATUS_LABELS[s] || s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="ad-bc-section">
              <p className="ad-bc-section-title">Leads frios (base importada de planilhas):</p>
              <label className={'ad-bc-check' + (includeCold ? ' is-on' : '')}>
                <input type="checkbox" checked={includeCold} onChange={(e) => setIncludeCold(e.target.checked)} />
                <span>
                  Incluir leads frios no disparo
                  {coldCount != null && <span style={{color: 'var(--sand)', fontSize: '12px', marginLeft: 8}}>(~{coldCount} contatos com e-mail · descadastrados ficam de fora · freq. menor recebe 1 a cada 4)</span>}
                </span>
              </label>
            </div>
            <div className="ad-bc-funnel">
              <p className="ad-bc-funnel-title">
                Funil de destinatários
                <button type="button" className="ad-bc-reload" onClick={onReloadLeads} disabled={leadsLoading}>
                  {leadsLoading ? 'Recarregando…' : '↻ Recarregar leads'}
                </button>
              </p>
              {leadsLoadInfo && !leadsLoadInfo.error && (
                <p className="ad-bc-funnel-info">
                  Carregado: {leadsLoadInfo.loaded} de {leadsLoadInfo.total} leads {leadsLoadInfo.truncated && <span style={{color:'#d97757'}}>· truncado (a base é maior que a carregada — clica em Recarregar)</span>} · {leadsLoadInfo.calls} chamada{leadsLoadInfo.calls === 1 ? '' : 's'}
                </p>
              )}
              <ul className="ad-bc-funnel-list">
                <li>
                  <span className="ad-bc-funnel-n">{targets.funnel.totalLeads}</span>
                  <span className="ad-bc-funnel-lbl">cadastros totais (todos os formulários)</span>
                </li>
                <li>
                  <span className="ad-bc-funnel-n">{targets.funnel.activeLeads}</span>
                  <span className="ad-bc-funnel-lbl">ativos (excluindo lixeira)</span>
                </li>
                <li>
                  <span className="ad-bc-funnel-n">{targets.funnel.withEmail}</span>
                  <span className="ad-bc-funnel-lbl">com e-mail válido</span>
                  {targets.funnel.activeLeads > targets.funnel.withEmail && (
                    <span className="ad-bc-funnel-warn"> · {targets.funnel.activeLeads - targets.funnel.withEmail} sem e-mail</span>
                  )}
                </li>
                <li>
                  <span className="ad-bc-funnel-n">{targets.funnel.uniqueEmails}</span>
                  <span className="ad-bc-funnel-lbl">pessoas únicas (mesmo e-mail = 1 só)</span>
                </li>
                <li>
                  <span className="ad-bc-funnel-n">{targets.funnel.afterExclude}</span>
                  <span className="ad-bc-funnel-lbl">após excluir origens marcadas</span>
                </li>
                {statusFilter.size > 0 && (
                  <li>
                    <span className="ad-bc-funnel-n">{targets.funnel.afterStatus}</span>
                    <span className="ad-bc-funnel-lbl">após filtrar status</span>
                  </li>
                )}
                <li className="ad-bc-funnel-final">
                  <span className="ad-bc-funnel-n">{targets.count}</span>
                  <span className="ad-bc-funnel-lbl">{targets.count === 1 ? 'lead quente' : 'leads quentes'}</span>
                </li>
                {includeCold && coldCount != null && (
                  <li className="ad-bc-funnel-final" style={{color:'#B89579'}}>
                    <span className="ad-bc-funnel-n">+~{coldCount}</span>
                    <span className="ad-bc-funnel-lbl">leads frios da base (dedupe automático com quentes)</span>
                  </li>
                )}
                <li className="ad-bc-funnel-final" style={{borderTop: '1px dashed rgba(247,245,242,0.18)', paddingTop: 8, marginTop: 4}}>
                  <span className="ad-bc-funnel-n">{includeCold && coldCount != null ? `~${targets.count + coldCount}` : targets.count}</span>
                  <span className="ad-bc-funnel-lbl">{(targets.count + (includeCold ? (coldCount || 0) : 0)) === 1 ? 'pessoa vai receber' : 'pessoas vão receber'}{includeCold && coldCount != null ? ' (estimado · dedupe acontece no envio)' : ''}</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="ad-widget">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Enviar</span>
              <h2 className="ad-widget-title">Disparo</h2>
            </header>
            <div className="ad-bc-test">
              <label className="ad-bc-field">
                <span className="ad-bc-label">Enviar teste pra:</span>
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="seu@email.com" />
              </label>
              <button className="ad-btn ad-btn-ghost" onClick={sendTest} disabled={busy}>
                {busy && result?.type === 'test' ? 'Enviando teste…' : 'Enviar teste'}
              </button>
            </div>
            <hr className="ad-bc-divider" />
            <div className="ad-bc-schedule">
              <label className="ad-bc-field">
                <span className="ad-bc-label">Agendar pra (horário de Brasília · opcional)</span>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </label>
              {scheduledFor && (
                <p className="ad-bc-hint" style={{color: 'var(--sand)'}}>
                  Vai disparar em: <strong>{fmtDate(brasiliaInputToUtcIso(scheduledFor))}</strong> (Brasília)
                </p>
              )}
              <span className="ad-bc-hint">
                Em branco = disparo imediato. Preenchido = sistema agenda e dispara automaticamente na data/hora marcada (verifica a cada 5 min). O input sempre é interpretado como <strong>horário de Brasília</strong> (UTC-3), independente do fuso do seu dispositivo.
              </span>
            </div>
            {(() => {
              const totalEstimate = targets.count + (includeCold ? (coldCount || 0) : 0);
              const canSend = totalEstimate > 0;
              const countLbl = includeCold && coldCount != null ? `~${totalEstimate}` : String(totalEstimate);
              return scheduledFor ? (
                <button
                  className="ad-btn ad-btn-primary ad-btn-lg"
                  disabled={busy || !canSend}
                  onClick={schedule}
                >
                  {busy ? 'Agendando…' : `Agendar pra ${scheduledFor ? fmtDateShort(brasiliaInputToUtcIso(scheduledFor)) : ''} (Brasília) · ${countLbl} cadastros`}
                </button>
              ) : (
                <button
                  className="ad-btn ad-btn-primary ad-btn-lg"
                  disabled={busy || !canSend}
                  onClick={() => setConfirmOpen(true)}
                >
                  {busy ? 'Enviando…' : `Disparar agora pros ${countLbl} cadastros${includeCold && coldCount != null ? ' (quentes + frios)' : ''}`}
                </button>
              );
            })()}
            {progress && progress.total > 0 && (
              <div className="ad-bc-progress">
                <div className="ad-bc-progress-track">
                  <div className="ad-bc-progress-fill" style={{width: `${Math.round((progress.processed / progress.total) * 100)}%`}}></div>
                </div>
                <p className="ad-bc-progress-label">
                  Enviando <strong>{progress.processed}</strong> de <strong>{progress.total}</strong>
                  {progress.failed > 0 && <span style={{color:'#d97757'}}> · {progress.failed} falharam</span>}
                </p>
              </div>
            )}
            {result && (
              <div className={'ad-bc-result ' + (result.ok ? 'is-ok' : 'is-err')}>
                {result.type === 'schedule' && result.ok && <p>✓ Agendado pra <strong>{fmtDate(result.scheduledFor)}</strong> (horário de Brasília). O sistema vai disparar automaticamente.</p>}
                {result.type === 'test' && result.ok && <p>✓ Teste enviado pra <strong>{testEmail}</strong>. Confere a caixa de entrada (ou spam).</p>}
                {result.type === 'resend' && result.ok && (
                  <>
                    <p>✓ Reenvio concluído: <strong>{result.sent}</strong> e-mails enviados com sucesso.</p>
                    {result.failed > 0 && <p>{result.failed} falharam novamente. Você pode reenviar de novo pelo modal de destinatários do novo registro.</p>}
                  </>
                )}
                {result.type === 'real' && result.ok && (
                  <>
                    <p><strong>{result.sent}</strong> e-mails enviados com sucesso.</p>
                    {result.failed > 0 && <p>{result.failed} falharam.</p>}
                    {result.partial && <p style={{color: '#d97757'}}>Parcial: processados {result.processed} de {result.total}. Repita o disparo (os já-enviados não voltam, mas a função não tem dedupe entre runs — use filtro pra evitar duplicar).</p>}
                  </>
                )}
                {!result.ok && <p>Erro: {result.error || 'desconhecido'}</p>}
                {result.errors && result.errors.length > 0 && (
                  <details><summary>Primeiros erros</summary><ul>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="ad-broadcast-preview">
          <section className="ad-widget">
            <header className="ad-widget-head">
              <span className="ad-widget-eyebrow">Como vai aparecer</span>
              <h2 className="ad-widget-title">Pré-visualização</h2>
            </header>
            <div className="ad-bc-preview">
              <p className="ad-bc-preview-subject"><strong>Assunto:</strong> {subject.replace(/\{\{nome\}\}/g, 'Maria').replace(/\{\{material\}\}/g, 'o seu material')}</p>
              <iframe className="ad-bc-preview-frame" srcDoc={previewHtml} title="Pré-visualização" />
            </div>
          </section>
        </div>
      </div>

      {/* Agendamentos pendentes */}
      {scheduledList !== null && scheduledList.length > 0 && (
        <section className="ad-widget ad-bc-scheduled">
          <header className="ad-widget-head">
            <span className="ad-widget-eyebrow">Agendados</span>
            <h2 className="ad-widget-title">Disparos pendentes</h2>
          </header>
          <table className="ad-bc-history-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Assunto</th>
                <th>Filtro</th>
                <th style={{textAlign:'right'}}>Destinatários</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scheduledList.map((s) => (
                <tr key={s.id}>
                  <td className="ad-bc-history-date" style={{color: 'var(--sand)'}}>{fmtDate(s.scheduledFor)}</td>
                  <td className="ad-bc-history-subject">{s.subject}</td>
                  <td className="ad-bc-history-filter">{s.filterSummary}</td>
                  <td style={{textAlign:'right'}}>{s.targetCount != null ? s.targetCount : '—'}</td>
                  <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                    <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => runScheduledNow(s.id)} disabled={busy} style={{marginRight: 6}}>Executar agora</button>
                    <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => cancelScheduled(s.id)} disabled={busy}>Cancelar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Histórico de disparos já feitos */}
      <section className="ad-widget ad-bc-history">
        <header className="ad-widget-head">
          <span className="ad-widget-eyebrow">Histórico</span>
          <h2 className="ad-widget-title">Disparos já feitos</h2>
        </header>
        {loadingHistory ? (
          <p className="ad-bc-empty">Carregando…</p>
        ) : !history || history.length === 0 ? (
          <p className="ad-bc-empty">Nenhum disparo feito ainda.</p>
        ) : (
          <table className="ad-bc-history-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Assunto</th>
                <th>Filtro</th>
                <th style={{textAlign:'right'}}>Enviados</th>
                <th style={{textAlign:'right'}}>Falharam</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const processed = (h.sent || 0) + (h.failed || 0);
                const isIncomplete = h.total && processed < h.total && !h.resendOf;
                return (
                <tr key={h.id}>
                  <td className="ad-bc-history-date">{fmtDate(h.sentAt)}</td>
                  <td className="ad-bc-history-subject">{h.subject}</td>
                  <td className="ad-bc-history-filter">{h.filterSummary || 'todos'}</td>
                  <td style={{textAlign:'right'}}>
                    <strong>{h.sent}</strong> / {h.total}
                    {isIncomplete && <div style={{fontSize:10, color:'#d97757', marginTop:2}}>incompleto · {h.total - processed} faltam</div>}
                  </td>
                  <td style={{textAlign:'right'}}>{h.failed > 0 ? <span style={{color:'#d97757'}}>{h.failed}</span> : '—'}</td>
                  <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                    {isIncomplete && (
                      <button className="ad-btn ad-btn-primary ad-btn-sm" style={{marginRight: 6}} onClick={() => resumeBroadcast(h)}>Continuar</button>
                    )}
                    <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => openRecipients(h)}>Ver destinatários</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {recipientsModal && (
        <div className="ad-modal-bg" onClick={(e) => e.target === e.currentTarget && setRecipientsModal(null)}>
          <div className="ad-modal-card ad-modal-card-wide">
            <header className="ad-rec-head">
              <span className="ad-widget-eyebrow">Destinatários</span>
              <h3>{recipientsModal.subject}</h3>
              {recipientsModal.recipients && recipientsModal.recipients.filter((r) => r.status === 'failed').length > 0 && (
                <button
                  className="ad-btn ad-btn-primary ad-btn-sm"
                  onClick={() => resendFailed(recipientsModal.broadcastId, recipientsModal.recipients.filter((r) => r.status === 'failed').length)}
                >
                  ↻ Reenviar pros que falharam ({recipientsModal.recipients.filter((r) => r.status === 'failed').length})
                </button>
              )}
              <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setRecipientsModal(null)}>Fechar</button>
            </header>
            {recipientsModal.loading ? (
              <p className="ad-bc-empty">Carregando…</p>
            ) : recipientsModal.error ? (
              <p className="ad-bc-empty" style={{color:'#d97757'}}>Erro: {recipientsModal.error}</p>
            ) : !recipientsModal.recipients || recipientsModal.recipients.length === 0 ? (
              <p className="ad-bc-empty">Sem registro de destinatários para esse disparo.</p>
            ) : (
              <>
                <div className="ad-rec-summary">
                  <span><strong>{recipientsModal.recipients.length}</strong> total</span>
                  <span style={{color:'#819470'}}><strong>{recipientsModal.recipients.filter((r) => r.status === 'sent').length}</strong> entregues</span>
                  <span style={{color:'#d97757'}}><strong>{recipientsModal.recipients.filter((r) => r.status === 'failed').length}</strong> falharam</span>
                </div>
                <div className="ad-rec-table-wrap">
                  <table className="ad-bc-history-table ad-rec-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>E-mail</th>
                        <th>Nome</th>
                        <th>Horário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipientsModal.recipients.map((r, i) => (
                        <tr key={r.email + i}>
                          <td>
                            <span className={'ad-rec-badge ' + (r.status === 'sent' ? 'is-ok' : 'is-err')}>
                              {r.status === 'sent' ? '✓ enviado' : '✗ falhou'}
                            </span>
                          </td>
                          <td className="ad-bc-history-subject">{r.email}</td>
                          <td>{r.nome || <span style={{color:'rgba(247,245,242,0.4)'}}>—</span>}</td>
                          <td className="ad-bc-history-date">{r.sentAt ? fmtDate(r.sentAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="ad-modal-bg" onClick={(e) => e.target === e.currentTarget && setConfirmOpen(false)}>
          <div className="ad-modal-card">
            <h3>Confirmar disparo</h3>
            <p>
              Você vai enviar este e-mail pra <strong>{targets.count}</strong> {targets.count === 1 ? 'lead quente' : 'leads quentes'}
              {includeCold && coldCount != null && <> + <strong style={{color:'#B89579'}}>~{coldCount}</strong> leads frios da base (dedupe automático no envio)</>}
              .
            </p>
            <p>Total estimado: <strong>{includeCold && coldCount != null ? `~${targets.count + coldCount}` : targets.count}</strong> {(targets.count + (includeCold ? (coldCount || 0) : 0)) === 1 ? 'pessoa' : 'pessoas'}. Essa ação é definitiva e não dá pra desfazer.</p>
            <p>Assunto: <em>{subject}</em></p>
            <div className="ad-modal-actions">
              <button className="ad-btn ad-btn-ghost" onClick={() => setConfirmOpen(false)}>Cancelar</button>
              <button className="ad-btn ad-btn-primary" onClick={sendReal}>Disparar agora</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   APP
   ============================================================ */
const App = () => {
  const [authed, setAuthed] = React.useState(!!sessionStorage.getItem(TOKEN_KEY));
  // view: 'overview' (dashboard) | 'leads' (lista) | 'broadcast' (disparo de email)
  const [view, setView] = React.useState('overview');
  // Cache de leads compartilhado (usado pelo broadcast pra computar destinatários)
  const [leadsAll, setLeadsAll] = React.useState(null);
  const [leadsLoading, setLeadsLoading] = React.useState(false);
  const [leadsLoadInfo, setLeadsLoadInfo] = React.useState(null);

  const reloadLeads = React.useCallback(async () => {
    setLeadsLoading(true);
    setLeadsLoadInfo(null);
    try {
      // Loop até pegar todos os leads (até 20 chamadas, max ~minutos)
      let merged = [];
      let total = 0;
      let calls = 0;
      let truncated = false;
      for (let i = 0; i < 20; i++) {
        calls++;
        const res = await api('/api/leads');
        if (!res.leads) break;
        merged = res.leads;
        total = res.total || merged.length;
        truncated = !!res.truncated;
        if (merged.length >= total) break;
        if (!truncated) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      setLeadsAll(merged);
      setLeadsLoadInfo({loaded: merged.length, total, truncated, calls});
    } catch (e) {
      console.error('falha ao carregar leads pro disparo:', e);
      setLeadsAll([]);
      setLeadsLoadInfo({error: e.message});
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!authed || view !== 'broadcast' || leadsAll) return;
    reloadLeads();
  }, [authed, view, leadsAll, reloadLeads]);

  if (!authed) return <Login onSuccess={() => { setAuthed(true); setView('overview'); }} />;
  if (view === 'overview') {
    return <Overview
      onLogout={() => setAuthed(false)}
      onOpenLeads={() => setView('leads')}
      onOpenBroadcast={() => setView('broadcast')}
      onOpenColdLeads={() => setView('cold')}
    />;
  }
  if (view === 'broadcast') {
    return <BroadcastPanel
      onLogout={() => setAuthed(false)}
      onBackToOverview={() => setView('overview')}
      leadsAll={leadsAll}
      leadsLoading={leadsLoading}
      leadsLoadInfo={leadsLoadInfo}
      onReloadLeads={reloadLeads}
    />;
  }
  if (view === 'cold') {
    return <ColdLeadsPanel
      onLogout={() => setAuthed(false)}
      onBackToOverview={() => setView('overview')}
    />;
  }
  return <LeadsPanel onLogout={() => setAuthed(false)} onBackToOverview={() => setView('overview')} />;
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
