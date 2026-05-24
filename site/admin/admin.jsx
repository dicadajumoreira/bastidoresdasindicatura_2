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

// Normalização para detecção de duplicidade
const normEmail = (e) => (e || '').trim().toLowerCase();
const normPhone = (p) => (p || '').replace(/\D/g, '');

// Retorna os outros leads que compartilham email OU whatsapp com este
const findDuplicates = (lead, allLeads) => {
  const email = normEmail(lead.email);
  const phone = normPhone(lead.whatsapp);
  if (!email && !phone) return [];
  return allLeads.filter((other) => {
    if (other.id === lead.id) return false;
    if (email && normEmail(other.email) === email) return true;
    if (phone && normPhone(other.whatsapp) === phone) return true;
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
const LeadDetail = ({lead, onClose, onUpdated, onDeleted, onHardDeleted, duplicates = [], onSelectLead}) => {
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
      </div>

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
                <button className="ad-btn ad-btn-danger ad-btn-sm" onClick={bulkSoftDelete} disabled={bulkBusy}>
                  {bulkBusy ? 'Excluindo…' : 'Excluir selecionadas'}
                </button>
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
          <ul className="ad-list">
            {filtered.map((l) => (
              <li
                key={l.id}
                className={'ad-list-item ' + (selected && selected.id === l.id ? 'is-on' : '') + (selectedIds.has(l.id) ? ' is-checked' : '')}
                onClick={() => setSelected(l)}>
                <input
                  type="checkbox"
                  className="ad-list-check"
                  checked={selectedIds.has(l.id)}
                  onChange={() => toggleSelected(l.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Selecionar"
                />
                <span className={'ad-status-dot ad-status-' + (l.status || 'novo')} aria-hidden="true"></span>
                <div className="ad-list-main">
                  <div className="ad-list-name">
                    {l.nome}
                    {(() => {
                      const n = (duplicateMap.get(l.id) || []).length;
                      return n > 0 ? <span className="ad-dup-badge" title="Outras aplicações com mesmo e-mail ou WhatsApp">{n + 1}x</span> : null;
                    })()}
                  </div>
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
          onDeleted={onDeleted}
          onHardDeleted={onHardDeleted}
          duplicates={duplicateMap.get(selected.id) || []}
          onSelectLead={setSelected}
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
