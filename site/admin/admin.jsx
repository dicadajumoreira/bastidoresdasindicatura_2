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
};
const ORIGEM_ORDER = ['mentoria', 'checklist', 'ebook-ia', 'sindico-profissional', 'sobrevivencia-whatsapp', '50-frases', 'nr1', 'conflitos', 'saude-mental', 'gestao-sob-ataque', 'bombeiro', 'politico', 'solitario', 'burocrata', 'estrategista', 'sargento'];

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
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    nome: l.nome || '', whatsapp: l.whatsapp || '', email: l.email || '',
    cidade: loc.cidade, estado: loc.estado, pagina: ORIGEM_LABELS[l.origem || 'mentoria'],
  };
};

// Linha de planilha a partir de um cadastro único (todas as origens da pessoa juntas)
const clusterToRow = (c) => {
  const loc = splitLocation(c.rep);
  return {
    nome: c.rep.nome || '',
    whatsapp: unionContacts(c.forms, getAllPhones).join(' · ') || (c.rep.whatsapp || ''),
    email: unionContacts(c.forms, getAllEmails).join(' · ') || (c.rep.email || ''),
    cidade: loc.cidade,
    estado: loc.estado,
    pagina: c.origens.map((o) => ORIGEM_LABELS[o] || o).join(', '),
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
    {header: 'WhatsApp', key: 'whatsapp', width: 20},
    {header: 'E-mail', key: 'email', width: 36},
    {header: 'Cidade', key: 'cidade', width: 24},
    {header: 'Estado', key: 'estado', width: 10},
    {header: 'Página de captação', key: 'pagina', width: 26},
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
const Overview = ({onLogout, onOpenLeads}) => {
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
   APP
   ============================================================ */
const App = () => {
  const [authed, setAuthed] = React.useState(!!sessionStorage.getItem(TOKEN_KEY));
  // view inicial após login: 'overview' (dashboard) | 'leads' (lista completa)
  const [view, setView] = React.useState('overview');

  if (!authed) return <Login onSuccess={() => { setAuthed(true); setView('overview'); }} />;
  if (view === 'overview') {
    return <Overview onLogout={() => setAuthed(false)} onOpenLeads={() => setView('leads')} />;
  }
  return <LeadsPanel onLogout={() => setAuthed(false)} onBackToOverview={() => setView('overview')} />;
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
