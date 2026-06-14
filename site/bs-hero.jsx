// Bastidores · TOPBAR + HERO
// Hero documental sobre fundo Onix. Frase-marca "Nem tudo vai para a ata."
// Composição: texto à esquerda, retrato Onix à direita, faixa de dados abaixo.

const BsTopbar = () => (
  <header className="bs-topbar">
    <div className="bs-topbar-inner">
      <div className="bs-brand">
        <span className="bs-brand-line1">Bastidores</span>
        <span className="bs-brand-line2">da Sindicatura</span>
      </div>
      <span className="bs-brand-byline">
        <span className="bs-rule"></span>
        por Juliana Moreira
      </span>
      <nav className="bs-topnav">
        <a href="#manifesto">Manifesto</a>
        <a href="#sobre">Juliana</a>
        <a href="#estrutura">Estrutura</a>
        <a href="#vagas">Vagas</a>
      </nav>
    </div>
  </header>
);

const BsHero = () => (
  <section className="bs-hero" data-screen-label="01 Hero">
    {/* Coluna texto */}
    <div className="bs-hero-text">
      <div className="bs-hero-eyebrow">
        <span className="bs-rule"></span>
        <span className="bs-eyebrow">Mentoria executiva · Turma 01 · 2026</span>
      </div>

      <h1 className="bs-hero-title">
        <span className="bs-hero-l1">O mercado</span>
        <span className="bs-hero-l2">ensina teoria.</span>
        <span className="bs-hero-l3">A vida real ensina</span>
        <span className="bs-hero-l4"><em>sobrevivência.</em></span>
      </h1>

      <p className="bs-hero-lead">
        Tem uma parte da sindicatura que quase ninguém vê. Doze
        semanas de mentoria executiva pra síndicos e profissionais
        do mercado condominial que querem viver essa profissão de
        um jeito mais estratégico, profissional e humano.
      </p>

      <div className="bs-hero-ctas">
        <a href="#contato" className="bs-cta-primary">
          <span>Quero entrar para a lista prioritária</span>
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
            <path d="M1 6h15M11 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a href="#manifesto" className="bs-cta-ghost">Ler o manifesto</a>
      </div>
    </div>

    {/* Coluna retrato */}
    <div className="bs-hero-portrait">
      <img src="assets/ju-hero.jpg" alt="Juliana Moreira" />
      <div className="bs-portrait-frame"></div>
      <div className="bs-portrait-stamp">
        <span className="bs-stamp-line">JM</span>
        <span className="bs-stamp-sub">Edição 01</span>
      </div>
    </div>

    {/* Faixa de dados */}
    <div className="bs-hero-strip">
      <div className="bs-strip-item">
        <span className="bs-strip-k">Duração</span>
        <span className="bs-strip-v">12 semanas</span>
      </div>
      <div className="bs-strip-item">
        <span className="bs-strip-k">Encontros</span>
        <span className="bs-strip-v">Toda terça</span>
      </div>
      <div className="bs-strip-item">
        <span className="bs-strip-k">Horário</span>
        <span className="bs-strip-v">07h30 às 09h</span>
      </div>
      <div className="bs-strip-item">
        <span className="bs-strip-k">Formato</span>
        <span className="bs-strip-v">Ao vivo · Teams</span>
      </div>
      <div className="bs-strip-item">
        <span className="bs-strip-k">Vagas</span>
        <span className="bs-strip-v"><em>30 lugares</em></span>
      </div>
    </div>
  </section>
);

window.BsTopbar = BsTopbar;
window.BsHero = BsHero;
