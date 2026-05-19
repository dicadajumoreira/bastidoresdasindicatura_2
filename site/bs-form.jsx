// Bastidores · FORMULÁRIO OFICIAL DE APLICAÇÃO (multi-etapas)
// Substitui o formulário simples anterior. 6 etapas + tela final de obrigada.

const BsForm = () => {
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({
    nome: '',
    cidade: '',
    whatsapp: '',
    email: '',
    instagram: '',
    atuacao: '',
    tempoMercado: '',
    qtdCondominios: '',
    maiorDesafio: '',
    desgaste: '',
    areas: [],
    desenvolvimento: '',
    objetivo: '',
    onde2anos: '',
    bastidor: '',
    modalidade: '',
    compromisso: false,
    participacao: false,
  });

  const total = 6;
  const submitted = step === total + 1;

  const setField = (k, v) => setData((d) => ({...d, [k]: v}));
  const toggleArea = (a) => setData((d) => ({
    ...d,
    areas: d.areas.includes(a) ? d.areas.filter((x) => x !== a) : [...d.areas, a],
  }));

  const stepTitles = [
    'Dados pessoais',
    'Sua atuação',
    'Seu momento profissional',
    'Sobre o futuro',
    'A pergunta mais importante',
    'Sua experiência',
  ];

  const stepNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  // Validação simples por etapa
  const canAdvance = () => {
    if (step === 1) return data.nome && data.cidade && data.whatsapp && data.email && data.instagram;
    if (step === 2) return data.atuacao && data.tempoMercado && data.qtdCondominios;
    if (step === 3) return data.maiorDesafio && data.desgaste && data.areas.length > 0;
    if (step === 4) return data.desenvolvimento && data.objetivo && data.onde2anos;
    if (step === 5) return data.bastidor;
    if (step === 6) return data.modalidade && data.compromisso && data.participacao;
    return true;
  };

  const next = (e) => { if (e) e.preventDefault(); if (canAdvance()) setStep((s) => s + 1); };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!canAdvance() || submitting) return;
    setSubmitting(true);
    setSubmitError('');

    // Payload normalizado para a function backend
    const payload = {
      ...data,
      areas: data.areas,
    };

    // 1. Envia para o backend (Blobs + painel admin)
    let backendOk = false;
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      backendOk = res.ok;
    } catch (err) { /* ignora, tenta o forms abaixo */ }

    // 2. Envia para Netlify Forms (notificação por e-mail)
    try {
      const formData = new URLSearchParams();
      formData.append('form-name', 'bastidores-aplicacao');
      Object.entries(payload).forEach(([k, v]) => {
        formData.append(k, Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v)));
      });
      await fetch('/', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: formData.toString(),
      });
    } catch (err) { /* ignora */ }

    if (backendOk) {
      setStep(total + 1);
    } else {
      setSubmitError('Não conseguimos registrar agora. Tente novamente em instantes, por favor.');
    }
    setSubmitting(false);
  };

  const start = () => setStep(1);

  /* ============================================================
     INTRO (step 0)
     ============================================================ */
  if (step === 0) {
    return (
      <div className="bs-form-wrap bs-form-intro">
        <span className="bs-form-tag">Formulário oficial de aplicação</span>
        <h3 className="bs-form-title">Bastidores<br/><em>da Sindicatura.</em></h3>

        <div className="bs-form-intro-quote">
          <em>"O mercado ensina teoria.<br/>
          A vida real ensina sobrevivência."</em>
        </div>

        <div className="bs-form-intro-body">
          <p>
            Antes de tudo: a Bastidores da Sindicatura foi criada para
            profissionais que desejam viver a sindicatura de forma mais
            estratégica, profissional e consciente.
          </p>
          <p>
            Essa não é apenas uma mentoria técnica. É um ambiente de troca
            real, crescimento profissional e fortalecimento emocional dentro
            da vida condominial.
          </p>
          <p className="bs-form-intro-emph">
            As vagas da primeira turma são limitadas.<br/>
            Preencha sua aplicação com calma.
          </p>
        </div>

        <button type="button" className="bs-form-cta" onClick={start}>
          <span>Iniciar aplicação</span>
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
            <path d="M1 6h15M11 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <p className="bs-form-micro">
          A aplicação tem seis etapas curtas.<br/>
          Leva cerca de cinco minutos para concluir.
        </p>
      </div>
    );
  }

  /* ============================================================
     OBRIGADA (step total + 1)
     ============================================================ */
  if (submitted) {
    return (
      <div className="bs-form-wrap bs-form-thanks">
        <span className="bs-form-tag">Recebido</span>
        <h3 className="bs-form-title">Obrigada<br/><em>pela sua aplicação.</em></h3>

        <div className="bs-form-thanks-body">
          <p>
            A Bastidores da Sindicatura nasceu para falar sobre aquilo que
            quase ninguém mostra: os bastidores reais da vida condominial.
          </p>
          <p>
            Em breve, nossa equipe entrará em contato com os próximos passos
            pelo WhatsApp que você informou.
          </p>
        </div>

        <div className="bs-form-thanks-quote">
          <span>Frase oficial</span>
          <em>"O mercado ensina teoria.<br/>
          A vida real ensina sobrevivência."</em>
        </div>

        <div className="bs-form-thanks-foot">
          <span>Juliana Moreira</span>
          <a href="https://instagram.com/dicadajumoreira" target="_blank" rel="noreferrer">@dicadajumoreira</a>
        </div>
      </div>
    );
  }

  /* ============================================================
     ETAPAS 1..6
     ============================================================ */
  const isLast = step === total;

  return (
    <form className="bs-form-wrap bs-form-step" onSubmit={isLast ? submit : next}>
      {/* Progresso */}
      <div className="bs-form-progress">
        <div className="bs-form-progress-meta">
          <span className="bs-form-step-num">Etapa {stepNumerals[step - 1]} <span>·</span> {step} de {total}</span>
          <span className="bs-form-step-title">{stepTitles[step - 1]}</span>
        </div>
        <div className="bs-form-progress-bar" aria-hidden="true">
          {Array.from({length: total}).map((_, i) => (
            <span key={i} className={'bs-pbar-tick ' + (i < step ? 'is-done' : '')}></span>
          ))}
        </div>
      </div>

      {/* === ETAPA 1 · DADOS PESSOAIS === */}
      {step === 1 && (
        <div className="bs-form-fields">
          <label className="bs-field">
            <span className="bs-label">Nome completo</span>
            <input type="text" value={data.nome} onChange={(e) => setField('nome', e.target.value)} required placeholder="Como devo te chamar?" />
          </label>
          <label className="bs-field">
            <span className="bs-label">Cidade / Estado</span>
            <input type="text" value={data.cidade} onChange={(e) => setField('cidade', e.target.value)} required placeholder="Ex.: São Paulo, SP" />
          </label>
          <div className="bs-field-grid">
            <label className="bs-field">
              <span className="bs-label">WhatsApp</span>
              <input type="tel" value={data.whatsapp} onChange={(e) => setField('whatsapp', e.target.value)} required placeholder="(11) 99999-9999" />
            </label>
            <label className="bs-field">
              <span className="bs-label">E-mail</span>
              <input type="email" value={data.email} onChange={(e) => setField('email', e.target.value)} required placeholder="seu@email.com" />
            </label>
          </div>
          <label className="bs-field">
            <span className="bs-label">Instagram</span>
            <input type="text" value={data.instagram} onChange={(e) => setField('instagram', e.target.value)} required placeholder="@seuusuario" />
          </label>
        </div>
      )}

      {/* === ETAPA 2 · SUA ATUAÇÃO === */}
      {step === 2 && (
        <div className="bs-form-fields">
          <fieldset className="bs-field bs-radio">
            <legend className="bs-label">Você atua hoje como</legend>
            <div className="bs-radio-list">
              {['Síndico profissional', 'Síndico morador', 'Gestor condominial', 'Administradora', 'Outro'].map((o) => (
                <label key={o} className={'bs-radio-item ' + (data.atuacao === o ? 'is-selected' : '')}>
                  <input type="radio" name="atuacao" value={o} checked={data.atuacao === o} onChange={() => setField('atuacao', o)} />
                  <span className="bs-radio-mark" aria-hidden="true"></span>
                  <span className="bs-radio-text">{o}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="bs-field-grid">
            <label className="bs-field">
              <span className="bs-label">Tempo no mercado condominial</span>
              <input type="text" value={data.tempoMercado} onChange={(e) => setField('tempoMercado', e.target.value)} required placeholder="Ex.: 5 anos" />
            </label>
            <label className="bs-field">
              <span className="bs-label">Condomínios sob sua gestão</span>
              <input type="text" value={data.qtdCondominios} onChange={(e) => setField('qtdCondominios', e.target.value)} required placeholder="Ex.: 3" />
            </label>
          </div>
        </div>
      )}

      {/* === ETAPA 3 · SEU MOMENTO === */}
      {step === 3 && (
        <div className="bs-form-fields">
          <label className="bs-field">
            <span className="bs-label">Maior desafio da sua rotina hoje</span>
            <textarea rows="3" value={data.maiorDesafio} onChange={(e) => setField('maiorDesafio', e.target.value)} required placeholder="Conta com suas palavras." />
          </label>
          <label className="bs-field">
            <span className="bs-label">O que mais tem te desgastado emocionalmente</span>
            <textarea rows="3" value={data.desgaste} onChange={(e) => setField('desgaste', e.target.value)} required placeholder="Conta com suas palavras." />
          </label>
          <fieldset className="bs-field bs-check">
            <legend className="bs-label">Em quais áreas você sente que mais precisa evoluir</legend>
            <div className="bs-check-list">
              {['Comunicação','Liderança','Gestão financeira','Gestão emocional','Assembleias','Conflitos','Posicionamento profissional','Crescimento no mercado','Organização operacional','Outro'].map((a) => (
                <label key={a} className={'bs-check-item ' + (data.areas.includes(a) ? 'is-selected' : '')}>
                  <input type="checkbox" checked={data.areas.includes(a)} onChange={() => toggleArea(a)} />
                  <span className="bs-check-mark" aria-hidden="true"></span>
                  <span className="bs-check-text">{a}</span>
                </label>
              ))}
            </div>
            <span className="bs-field-hint">Pode marcar quantas precisar.</span>
          </fieldset>
        </div>
      )}

      {/* === ETAPA 4 · FUTURO === */}
      {step === 4 && (
        <div className="bs-form-fields">
          <label className="bs-field">
            <span className="bs-label">O que você espera desenvolver durante a mentoria</span>
            <textarea rows="3" value={data.desenvolvimento} onChange={(e) => setField('desenvolvimento', e.target.value)} required placeholder="Conta com suas palavras." />
          </label>
          <label className="bs-field">
            <span className="bs-label">Maior objetivo profissional hoje no mercado condominial</span>
            <textarea rows="3" value={data.objetivo} onChange={(e) => setField('objetivo', e.target.value)} required placeholder="Conta com suas palavras." />
          </label>
          <label className="bs-field">
            <span className="bs-label">Onde você deseja estar profissionalmente em dois anos</span>
            <textarea rows="3" value={data.onde2anos} onChange={(e) => setField('onde2anos', e.target.value)} required placeholder="Conta com suas palavras." />
          </label>
        </div>
      )}

      {/* === ETAPA 5 · A PERGUNTA MAIS IMPORTANTE === */}
      {step === 5 && (
        <div className="bs-form-fields bs-form-fields-emph">
          <div className="bs-emph-prefix">
            <span className="bs-emph-prefix-letter">A</span>
            <span className="bs-emph-prefix-text">A pergunta mais importante.</span>
          </div>
          <h4 className="bs-emph-q">
            O que ninguém vê<br/>
            <em>sobre a sua rotina na sindicatura?</em>
          </h4>
          <label className="bs-field">
            <textarea rows="6" value={data.bastidor} onChange={(e) => setField('bastidor', e.target.value)} required placeholder="O que normalmente fica fora da ata. O que pesa, o que ninguém vê, o que você guarda." />
          </label>
        </div>
      )}

      {/* === ETAPA 6 · MODALIDADE === */}
      {step === 6 && (
        <div className="bs-form-fields">
          <fieldset className="bs-field bs-radio bs-modal">
            <legend className="bs-label">Qual modalidade você deseja aplicar</legend>
            <div className="bs-modal-list">
              <label className={'bs-modal-item ' + (data.modalidade === 'Experience' ? 'is-selected' : '')}>
                <input type="radio" name="modalidade" value="Experience" checked={data.modalidade === 'Experience'} onChange={() => setField('modalidade', 'Experience')} />
                <div className="bs-modal-head">
                  <span className="bs-modal-mark" aria-hidden="true"></span>
                  <span className="bs-modal-name">Experience</span>
                  <span className="bs-modal-price">R$ 4.997</span>
                </div>
                <p className="bs-modal-descr">
                  Mentoria coletiva com 12 encontros ao vivo, grupo fechado,
                  estudos de caso, Hot Seats e materiais complementares.
                </p>
              </label>

              <label className={'bs-modal-item ' + (data.modalidade === 'Executive' ? 'is-selected' : '')}>
                <input type="radio" name="modalidade" value="Executive" checked={data.modalidade === 'Executive'} onChange={() => setField('modalidade', 'Executive')} />
                <div className="bs-modal-head">
                  <span className="bs-modal-mark" aria-hidden="true"></span>
                  <span className="bs-modal-name">Executive</span>
                  <span className="bs-modal-price">R$ 8.997</span>
                </div>
                <p className="bs-modal-descr">
                  Inclui tudo da Experience mais dois Conselhos Executivos
                  individuais com Juliana, acompanhamento próximo
                  e acesso prioritário.
                </p>
              </label>
            </div>
          </fieldset>

          <fieldset className="bs-field bs-commit">
            <legend className="bs-label">Comprometimento</legend>
            <p className="bs-commit-text">
              A mentoria acontece ao vivo durante doze semanas, com encontros
              às segundas, das sete e meia às nove, via Microsoft Teams.
            </p>
            <label className={'bs-commit-item ' + (data.compromisso ? 'is-selected' : '')}>
              <input type="checkbox" checked={data.compromisso} onChange={(e) => setField('compromisso', e.target.checked)} />
              <span className="bs-check-mark" aria-hidden="true"></span>
              <span>Entendo que é uma mentoria baseada em troca, participação e aplicação prática.</span>
            </label>
            <label className={'bs-commit-item ' + (data.participacao ? 'is-selected' : '')}>
              <input type="checkbox" checked={data.participacao} onChange={(e) => setField('participacao', e.target.checked)} />
              <span className="bs-check-mark" aria-hidden="true"></span>
              <span>Estou disposto(a) a participar ativamente da experiência.</span>
            </label>
          </fieldset>
        </div>
      )}

      {/* Navegação */}
      <div className="bs-form-nav">
        {step > 1 ? (
          <button type="button" className="bs-form-back" onClick={back} disabled={submitting}>
            <svg width="14" height="10" viewBox="0 0 18 12" fill="none">
              <path d="M17 6H2M7 1L2 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Voltar</span>
          </button>
        ) : <span></span>}

        <div className="bs-form-nav-right">
          {submitError && <span className="bs-form-err">{submitError}</span>}
          <button type="submit" className="bs-form-cta" disabled={!canAdvance() || submitting}>
            <span>{submitting ? 'Enviando…' : (isLast ? 'Enviar aplicação' : 'Continuar')}</span>
            {!submitting && (
              <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
                <path d="M1 6h15M11 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );
};

window.BsForm = BsForm;
