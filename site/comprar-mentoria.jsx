// Landing de compra da Mentoria (Experience ou Executive).
// O HTML que carrega esse script informa a modalidade + precos via
// atributos data-* no <script>. O componente cria a Stripe Checkout
// Session no backend e redireciona pra pagina segura do Stripe.

(() => {
  const scriptEl = document.currentScript;
  const MODALIDADE = scriptEl.dataset.modalidade || 'experience';
  const MODALIDADE_LABEL = scriptEl.dataset.modalidadeLabel || 'Experience';
  const PRECO_CARD = parseFloat(scriptEl.dataset.precoCard || '4997');
  const PRECO_PIX = parseFloat(scriptEl.dataset.precoPix || '4497.30');
  const AULAS_INFO = scriptEl.dataset.aulas || '';

  const fmtBRL = (v) => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const cardParcela = PRECO_CARD / 12;

  const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  const App = () => {
    const [data, setData] = React.useState(() => {
      const defaults = {nome: '', cidade: '', estado: '', whatsapp: '', email: '', instagram: '', atuacao: '', data_nascimento: ''};
      try {
        const saved = JSON.parse(localStorage.getItem('bs-lead') || '{}');
        return {...defaults, ...Object.fromEntries(Object.entries(saved).filter(([k]) => k in defaults))};
      } catch { return defaults; }
    });
    const [metodo, setMetodo] = React.useState('pix');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');

    const setField = (k, v) => setData((d) => ({...d, [k]: v}));

    const canSend = data.nome && data.email && data.whatsapp && data.cidade && data.estado && data.instagram && data.atuacao && data.data_nascimento && !busy;

    const submit = async (e) => {
      e.preventDefault();
      if (!canSend) return;
      setBusy(true);
      setError('');

      // Salva no localStorage pra reaproveitar em outros forms
      try { localStorage.setItem('bs-lead', JSON.stringify(data)); } catch {}

      try {
        const res = await fetch('/api/stripe-checkout-session', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({...data, modalidade: MODALIDADE, metodo}),
        });
        const body = await res.json().catch(() => ({error: 'Resposta inválida'}));
        if (!res.ok || !body.url) {
          throw new Error(body.error || 'Falha ao iniciar o pagamento.');
        }
        // Redireciona pro Stripe Checkout
        window.location.href = body.url;
      } catch (err) {
        setError(err.message);
        setBusy(false);
      }
    };

    const totalAtual = metodo === 'pix' ? PRECO_PIX : PRECO_CARD;

    return (
      <div className="cmp-stage">
        <header className="cmp-topbar">
          <a className="cmp-back" href="/vagas/">
            <svg width="14" height="10" viewBox="0 0 18 12" fill="none">
              <path d="M17 6H2M7 1L2 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Voltar pras vagas</span>
          </a>
          <div className="cmp-brand">
            <span className="cmp-brand-l1">Bastidores da Sindicatura</span>
            <span className="cmp-brand-l2">Mentoria · Turma 01 · 2026</span>
          </div>
        </header>

        <div className="cmp-grid">
          {/* Coluna esquerda · descricao da modalidade */}
          <div>
            <span className="cmp-info-eyebrow">Mentoria {MODALIDADE_LABEL}</span>
            <h1 className="cmp-info-title">Garanta sua <em>vaga.</em></h1>
            <p className="cmp-info-lead">
              {MODALIDADE === 'executive' ? (
                <>
                  A modalidade mais completa: <strong>12 aulas em grupo + 2 sessões particulares</strong> comigo, pra ajustar o método à sua realidade. Vagas extremamente limitadas.
                </>
              ) : (
                <>
                  <strong>12 encontros ao vivo no Microsoft Teams</strong> com uma comunidade pequena que se conhece. O método estruturado pra profissionalizar a gestão de vez.
                </>
              )}
            </p>

            <ul className="cmp-bullets">
              <li>{AULAS_INFO}</li>
              <li>Todas as aulas gravadas e disponíveis na Área de Membros</li>
              <li>Materiais exclusivos por aula (PDFs, vídeos, exercícios)</li>
              <li>Comunidade fechada de síndicos profissionais</li>
              {MODALIDADE === 'executive' && <li>2 sessões particulares comigo (datas individuais a combinar)</li>}
              <li>Acesso vitalício ao conteúdo da turma</li>
            </ul>

            <div className="cmp-prices">
              <div className={'cmp-price-block ' + (metodo === 'pix' ? 'is-pix' : '')}>
                <span className="cmp-price-label">Pix · 10% off</span>
                <span className="cmp-price-value">{fmtBRL(PRECO_PIX)}</span>
                <span className="cmp-price-sub">à vista · liberação na hora</span>
              </div>
              <div className={'cmp-price-block ' + (metodo === 'card' ? 'is-card' : '')}>
                <span className="cmp-price-label">Cartão</span>
                <span className="cmp-price-value">{fmtBRL(PRECO_CARD)}</span>
                <span className="cmp-price-sub">ou 12x de {fmtBRL(cardParcela)} sem juros</span>
              </div>
            </div>
          </div>

          {/* Coluna direita · form */}
          <div className="cmp-form-card">
            <p className="cmp-form-eyebrow">Sua aplicação</p>
            <h2 className="cmp-form-title">Pagamento seguro via Stripe</h2>

            <form onSubmit={submit}>
              <label className="cmp-field">
                <span className="cmp-label">Nome completo</span>
                <input type="text" required value={data.nome} onChange={(e) => setField('nome', e.target.value)} placeholder="Como devo te chamar?" />
              </label>
              <label className="cmp-field">
                <span className="cmp-label">E-mail</span>
                <input type="email" required value={data.email} onChange={(e) => setField('email', e.target.value)} placeholder="seu@email.com" />
              </label>
              <label className="cmp-field">
                <span className="cmp-label">WhatsApp</span>
                <input type="tel" required value={data.whatsapp} onChange={(e) => setField('whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
              </label>
              <div className="cmp-row">
                <label className="cmp-field">
                  <span className="cmp-label">Cidade</span>
                  <input type="text" required value={data.cidade} onChange={(e) => setField('cidade', e.target.value)} placeholder="Sua cidade" />
                </label>
                <label className="cmp-field">
                  <span className="cmp-label">Estado</span>
                  <select required value={data.estado} onChange={(e) => setField('estado', e.target.value)}>
                    <option value="" disabled>UF</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </label>
              </div>
              <label className="cmp-field">
                <span className="cmp-label">@ Instagram</span>
                <input type="text" required value={data.instagram} onChange={(e) => setField('instagram', e.target.value)} placeholder="@seuuser" />
              </label>
              <label className="cmp-field">
                <span className="cmp-label">Atua como</span>
                <select required value={data.atuacao} onChange={(e) => setField('atuacao', e.target.value)}>
                  <option value="" disabled>Selecione</option>
                  <option>Síndico profissional</option>
                  <option>Síndico morador</option>
                  <option>Gestor condominial</option>
                  <option>Administradora</option>
                  <option>Conselheiro</option>
                  <option>Outro</option>
                </select>
              </label>
              <label className="cmp-field">
                <span className="cmp-label">Data de nascimento</span>
                <input type="date" required value={data.data_nascimento} onChange={(e) => setField('data_nascimento', e.target.value)} />
              </label>

              <p className="cmp-label" style={{marginTop: 18}}>Método de pagamento</p>
              <div className="cmp-method-group">
                <button type="button" className={'cmp-method ' + (metodo === 'pix' ? 'is-on' : '')} onClick={() => setMetodo('pix')}>
                  <span className="cmp-method-name">Pix · 10% OFF</span>
                  <span className="cmp-method-desc">{fmtBRL(PRECO_PIX)} · à vista · <strong>libera na hora</strong></span>
                </button>
                <button type="button" className={'cmp-method ' + (metodo === 'card' ? 'is-on' : '')} onClick={() => setMetodo('card')}>
                  <span className="cmp-method-name">Cartão</span>
                  <span className="cmp-method-desc">{fmtBRL(PRECO_CARD)} · até 12x sem juros</span>
                </button>
              </div>

              <button type="submit" className="cmp-cta" disabled={!canSend}>
                <span>{busy ? 'Abrindo pagamento…' : `Pagar ${fmtBRL(totalAtual)}`}</span>
                {!busy && (
                  <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
                    <path d="M1 6h15M11 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {error && <p className="cmp-error">{error}</p>}

              <p className="cmp-micro">
                Você será redirecionado pra página segura do Stripe pra finalizar. Após o pagamento confirmado, recebe e-mail de boas-vindas com instruções pra criar sua senha na Área de Membros.
              </p>
              <p className="cmp-micro" style={{marginTop: 6}}>
                Ao se inscrever você aceita a{' '}
                <a href="/politica-de-privacidade/" style={{color: 'var(--sand-deep, #B89579)', textDecoration: 'underline'}}>política de privacidade</a>.
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  };

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
