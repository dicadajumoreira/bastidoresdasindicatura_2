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
};
const ORIGEM_ORDER = ['mentoria', 'checklist', 'ebook-ia', 'sindico-profissional'];

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

const downloadXlsx = async (leads) => {
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

  leads.forEach((l) => {
    const loc = splitLocation(l);
    ws.addRow({
      nome: l.nome || '',
      whatsapp: l.whatsapp || '',
      email: l.email || '',
      cidade: loc.cidade,
      estado: loc.estado,
      pagina: ORIGEM_LABELS[l.origem || 'mentoria'],
    });
  });

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
const LeadDetail = ({lead, onClose, onUpdated, onDeleted, onHardDeleted, duplicates = [], onSelectLead, allLeads = []}) => {
  const mergedFromList = Array.isArray(lead.mergedFrom) ? lead.mergedFrom : [];
  const mergedIntoLead = lead.mergedInto ? allLeads.find((l) => l.id === lead.mergedInto) : null;
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

      {/* Duplicatas (mesmo e-mail ou WhatsApp) */}
      {duplicates.length > 0 && (
        <div className="ad-dup-card">
          <div className="ad-dup-head">
            <span className="ad-dup-badge ad-dup-badge-lg">{duplicates.length + 1}x</span>
            <div>
              <span className="ad-label">Outras aplicações desta pessoa</span>
              <p className="ad-dup-hint">Mesmo e-mail ou WhatsApp. Clique para abrir.</p>
            </div>
          </div>
          <ul className="ad-dup-list">
            {duplicates.map((d) => (
              <li key={d.id} className="ad-dup-item" onClick={() => onSelectLead && onSelectLead(d)}>
                <span className={'ad-status-dot ad-status-' + (d.status || 'novo')} aria-hidden="true"></span>
                <div className="ad-dup-item-main">
                  <div className="ad-dup-item-meta">
                    <span className="ad-dup-item-origem">{ORIGEM_LABELS[d.origem || 'mentoria']}</span>
                    <span className="ad-dot">·</span>
                    <span>{STATUS_LABELS[d.status || 'novo']}</span>
                    {d.modalidade && <><span className="ad-dot">·</span><em>{d.modalidade}</em></>}
                  </div>
                </div>
                <div className="ad-dup-item-date">{fmtDate(d.createdAt)}</div>
              </li>
            ))}
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
          <MultiField k="WhatsApp" primary={lead.whatsapp} extras={lead.whatsappsExtras} />
          <MultiField k="E-mail" primary={lead.email} extras={lead.emailsExtras} />
          <MultiField k="Instagram" primary={lead.instagram} extras={lead.instagramsExtras} />
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
const Dashboard = ({onLogout}) => {
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
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
      const res = await api('/api/leads');
      setLeads(res.leads || []);
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

  // Mapa de duplicatas, calculado SOMENTE entre leads ativos
  const duplicateMap = React.useMemo(() => {
    const map = new Map();
    activeLeads.forEach((l) => map.set(l.id, findDuplicates(l, activeLeads)));
    return map;
  }, [activeLeads]);

  const sourceLeads = showLixeira ? deletedLeads : activeLeads;

  const filtered = sourceLeads.filter((l) => {
    if (!showLixeira) {
      if (statusFilter !== 'todos' && l.status !== statusFilter) return false;
      if (origemFilter !== 'todos' && (l.origem || 'mentoria') !== origemFilter) return false;
      if (modFilter !== 'todos' && l.modalidade !== modFilter) return false;
      if (dupFilter && (duplicateMap.get(l.id) || []).length === 0) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = [l.nome, l.cidade, l.email, l.whatsapp, l.instagram].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = React.useMemo(() => {
    const c = {todos: activeLeads.length, duplicates: 0, lixeira: deletedLeads.length};
    STATUS_ORDER.forEach((s) => c[s] = 0);
    ORIGEM_ORDER.forEach((o) => c['origem_' + o] = 0);
    activeLeads.forEach((l) => {
      c[l.status || 'novo'] = (c[l.status || 'novo'] || 0) + 1;
      c['origem_' + (l.origem || 'mentoria')] = (c['origem_' + (l.origem || 'mentoria')] || 0) + 1;
      if ((duplicateMap.get(l.id) || []).length > 0) c.duplicates += 1;
    });
    return c;
  }, [activeLeads, deletedLeads, duplicateMap]);

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
    setSelectedIds(new Set(filtered.map((l) => l.id)));
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
          <button className="ad-btn-link" onClick={() => downloadXlsx(filtered)} disabled={!filtered.length}>Exportar planilha</button>
          <button className="ad-btn-link" onClick={load}>Atualizar</button>
          <button className="ad-btn-link ad-btn-logout" onClick={logout}>Sair</button>
        </div>
      </aside>

      {/* Main: lista */}
      <main className="ad-main">
        <header className="ad-main-head">
          <div>
            <h1 className="ad-h1">{showLixeira ? 'Lixeira' : 'Aplicações'}</h1>
            <p className="ad-h1-sub">{filtered.length} {filtered.length === 1 ? 'aplicação' : 'aplicações'} {sourceLeads.length !== filtered.length ? `(de ${sourceLeads.length} no total)` : ''}</p>
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
                Selecionar todas visíveis ({filtered.length})
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

        {loading && <div className="ad-state">Carregando aplicações…</div>}
        {error && <div className="ad-state ad-state-err">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="ad-empty-state">
            <h2>Sem aplicações por aqui ainda.</h2>
            <p>Quando alguém preencher o formulário, aparece aqui.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
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
                <th>Origem</th>
                <th>Status</th>
                <th className="ad-th-date">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const loc = splitLocation(l);
                const locStr = loc.cidade ? `${loc.cidade}${loc.estado ? ' / ' + loc.estado : ''}` : '';
                const waDigits = String(l.whatsapp || '').replace(/\D/g, '');
                const dupN = (duplicateMap.get(l.id) || []).length;
                const stopProp = (e) => e.stopPropagation();
                return (
                  <tr
                    key={l.id}
                    className={'ad-tr ' + (selected && selected.id === l.id ? 'is-on ' : '') + (selectedIds.has(l.id) ? 'is-checked' : '')}
                    onClick={() => setSelected(l)}>
                    <td className="ad-td-check" data-label="">
                      <input
                        type="checkbox"
                        className="ad-list-check"
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleSelected(l.id)}
                        onClick={stopProp}
                        aria-label="Selecionar"
                      />
                    </td>
                    <td className="ad-td-name" data-label="Nome">
                      <div className="ad-td-name-row">
                        <span className={'ad-status-dot ad-status-' + (l.status || 'novo')} aria-hidden="true"></span>
                        <span className="ad-td-name-text">{l.nome}</span>
                        {dupN > 0 && (
                          <span className="ad-dup-badge" title="Outras aplicações com mesmo e-mail ou WhatsApp">{dupN + 1}x</span>
                        )}
                      </div>
                    </td>
                    <td data-label="WhatsApp">
                      {l.whatsapp ? (
                        <a className="ad-td-link" href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" onClick={stopProp}>
                          {l.whatsapp}
                        </a>
                      ) : <span className="ad-td-empty">—</span>}
                    </td>
                    <td data-label="E-mail">
                      {l.email ? (
                        <a className="ad-td-link" href={`mailto:${l.email}`} onClick={stopProp}>
                          {l.email}
                        </a>
                      ) : <span className="ad-td-empty">—</span>}
                    </td>
                    <td data-label="Cidade / UF">
                      {locStr || <span className="ad-td-empty">—</span>}
                    </td>
                    <td data-label="Atuação">
                      {l.atuacao || <span className="ad-td-empty">—</span>}
                    </td>
                    <td data-label="Origem">
                      <span className={'ad-chip ad-chip-origem ad-chip-origem-' + (l.origem || 'mentoria')}>
                        {ORIGEM_LABELS[l.origem || 'mentoria']}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span className={'ad-chip ad-chip-status ad-chip-status-' + (l.status || 'novo')}>
                        {STATUS_LABELS[l.status || 'novo']}
                      </span>
                    </td>
                    <td className="ad-td-date" data-label="Data">
                      {fmtDate(l.createdAt).split(' · ')[0]}
                    </td>
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
          duplicates={duplicateMap.get(selected.id) || []}
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
   APP
   ============================================================ */
const App = () => {
  const [authed, setAuthed] = React.useState(!!sessionStorage.getItem(TOKEN_KEY));

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
