// Painel admin · Bastidores da Sindicatura
// Login → lista de leads → detalhe → status + notas → export CSV

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
};
const ORIGEM_ORDER = ['mentoria', 'checklist'];

/* ============================================================
   Helpers
   ============================================================ */
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

const downloadCsv = (leads) => {
  const cols = [
    ['createdAt', 'Data'],
    ['origem', 'Origem'],
    ['nome', 'Nome'],
    ['cidade', 'Cidade'],
    ['estado', 'Estado'],
    ['whatsapp', 'WhatsApp'],
    ['email', 'E-mail'],
    ['instagram', 'Instagram'],
    ['atuacao', 'Atuação'],
    ['tempoMercado', 'Tempo no mercado'],
    ['qtdCondominios', 'Condomínios'],
    ['maiorDesafio', 'Maior desafio'],
    ['desgaste', 'Desgaste'],
    ['areas', 'Áreas para evoluir'],
    ['desenvolvimento', 'Desenvolvimento'],
    ['objetivo', 'Objetivo'],
    ['onde2anos', 'Onde em 2 anos'],
    ['bastidor', 'Pergunta principal'],
    ['modalidade', 'Modalidade'],
    ['status', 'Status'],
    ['notes', 'Notas'],
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return '"' + s.replace(/"/g, '""').replace(/\n/g, ' ') + '"';
  };
  const head = cols.map((c) => esc(c[1])).join(',');
  const rows = leads.map((l) => cols.map(([k]) => esc(k === 'createdAt' ? fmtDate(l[k]) : l[k])).join(','));
  const csv = '\ufeff' + [head, ...rows].join('\n');

  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bastidores-leads-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
const LeadDetail = ({lead, onClose, onUpdated}) => {
  const [status, setStatus] = React.useState(lead.status || 'novo');
  const [notes, setNotes] = React.useState(lead.notes || '');
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(null);

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
      </div>

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
          <Field k="WhatsApp" v={lead.whatsapp} />
          <Field k="E-mail" v={lead.email} />
          {lead.instagram && <Field k="Instagram" v={lead.instagram} />}
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
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState(null);

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

  const filtered = leads.filter((l) => {
    if (statusFilter !== 'todos' && l.status !== statusFilter) return false;
    if (origemFilter !== 'todos' && (l.origem || 'mentoria') !== origemFilter) return false;
    if (modFilter !== 'todos' && l.modalidade !== modFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [l.nome, l.cidade, l.email, l.whatsapp, l.instagram].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = React.useMemo(() => {
    const c = {todos: leads.length};
    STATUS_ORDER.forEach((s) => c[s] = 0);
    ORIGEM_ORDER.forEach((o) => c['origem_' + o] = 0);
    leads.forEach((l) => {
      c[l.status || 'novo'] = (c[l.status || 'novo'] || 0) + 1;
      c['origem_' + (l.origem || 'mentoria')] = (c['origem_' + (l.origem || 'mentoria')] || 0) + 1;
    });
    return c;
  }, [leads]);

  const onUpdated = (updated) => {
    setLeads((all) => all.map((l) => (l.id === updated.id ? updated : l)));
    setSelected(updated);
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

        <div className="ad-side-foot">
          <button className="ad-btn-link" onClick={() => downloadCsv(filtered)} disabled={!filtered.length}>Exportar CSV</button>
          <button className="ad-btn-link" onClick={load}>Atualizar</button>
          <button className="ad-btn-link ad-btn-logout" onClick={logout}>Sair</button>
        </div>
      </aside>

      {/* Main: lista */}
      <main className="ad-main">
        <header className="ad-main-head">
          <div>
            <h1 className="ad-h1">Aplicações</h1>
            <p className="ad-h1-sub">{filtered.length} {filtered.length === 1 ? 'aplicação' : 'aplicações'} {leads.length !== filtered.length ? `(de ${leads.length} no total)` : ''}</p>
          </div>
          <input
            className="ad-search"
            placeholder="Buscar por nome, cidade, e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </header>

        {loading && <div className="ad-state">Carregando aplicações…</div>}
        {error && <div className="ad-state ad-state-err">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="ad-empty-state">
            <h2>Sem aplicações por aqui ainda.</h2>
            <p>Quando alguém preencher o formulário, aparece aqui.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="ad-list">
            {filtered.map((l) => (
              <li
                key={l.id}
                className={'ad-list-item ' + (selected && selected.id === l.id ? 'is-on' : '')}
                onClick={() => setSelected(l)}>
                <span className={'ad-status-dot ad-status-' + (l.status || 'novo')} aria-hidden="true"></span>
                <div className="ad-list-main">
                  <div className="ad-list-name">{l.nome}</div>
                  <div className="ad-list-meta">
                    <span className="ad-list-origem">{ORIGEM_LABELS[l.origem || 'mentoria']}</span>
                    <span className="ad-dot">·</span>
                    <span>{l.cidade ? `${l.cidade}${l.estado ? ' / ' + l.estado : ''}` : (l.atuacao || '—')}</span>
                    {l.modalidade && <><span className="ad-dot">·</span><em>{l.modalidade}</em></>}
                  </div>
                </div>
                <div className="ad-list-date">{fmtDate(l.createdAt).split(' · ')[0]}</div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {selected && (
        <LeadDetail
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdated={onUpdated}
        />
      )}
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
