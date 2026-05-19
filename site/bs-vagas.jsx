// Bastidores · VAGAS (Experience + Executive)
// Duas categorias lado a lado. Cards premium. Experience à esquerda, Executive destacado à direita.

const BsVagas = () => (
  <section className="bs-vagas" id="vagas" data-screen-label="06 Vagas">
    <div className="bs-vagas-inner">
      <div className="bs-vagas-head">
        <span className="bs-eyebrow" style={{color: 'var(--sand)'}}>Capítulo V · Vagas</span>
        <h2 className="bs-vagas-title">
          Dois modos<br/>
          de entrar nos<br/>
          <em>bastidores.</em>
        </h2>
        <p className="bs-vagas-lead">
          Trinta lugares ao todo. Vinte e cinco no formato em grupo,
          cinco no formato com conselhos individuais. A escolha depende
          do nível de proximidade que você precisa neste momento da
          carreira.
        </p>
      </div>

      <div className="bs-vagas-grid">
        {/* EXPERIENCE */}
        <article className="bs-tier bs-tier-experience">
          <header className="bs-tier-head">
            <span className="bs-tier-tag">Categoria I</span>
            <h3 className="bs-tier-name">Experience</h3>
            <p className="bs-tier-sub">A experiência coletiva da Bastidores da Sindicatura.</p>
          </header>

          <div className="bs-tier-vagas">
            <span className="bs-tier-vagas-n">25</span>
            <span className="bs-tier-vagas-lbl">vagas</span>
          </div>

          <ul className="bs-tier-list">
            <li>Encontros ao vivo</li>
            <li>Grupo fechado</li>
            <li>Estudos de caso reais</li>
            <li>Hot Seats</li>
            <li>Materiais complementares</li>
            <li>Templates</li>
            <li>Gravações</li>
            <li>Certificado Condo Academy</li>
          </ul>

          <footer className="bs-tier-foot">
            <span className="bs-tier-price-k">Investimento</span>
            <span className="bs-tier-price-v">R$ 4.997</span>
            <a href="#contato" className="bs-tier-cta">
              <span>Quero aplicar para a Experience</span>
              <svg width="14" height="10" viewBox="0 0 18 12" fill="none">
                <path d="M1 6h15M11 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </footer>
        </article>

        {/* EXECUTIVE */}
        <article className="bs-tier bs-tier-executive">
          <div className="bs-tier-ribbon">Apenas 5 lugares</div>
          <header className="bs-tier-head">
            <span className="bs-tier-tag">Categoria II</span>
            <h3 className="bs-tier-name">Executive</h3>
            <p className="bs-tier-sub">
              Uma experiência mais próxima, estratégica e personalizada
              para profissionais que desejam aprofundar decisões,
              posicionamento e crescimento.
            </p>
          </header>

          <div className="bs-tier-vagas">
            <span className="bs-tier-vagas-n">05</span>
            <span className="bs-tier-vagas-lbl">vagas</span>
          </div>

          <ul className="bs-tier-list">
            <li><strong>Tudo o que está incluso na Experience</strong></li>
            <li>2 Conselhos Executivos individuais com Juliana Moreira</li>
            <li>Acompanhamento mais próximo</li>
            <li>Acesso prioritário a próximas turmas</li>
          </ul>

          <div className="bs-tier-detail">
            <span className="bs-eyebrow" style={{color: 'var(--lavender)'}}>O que é o Conselho Executivo</span>
            <p>
              Um encontro privado, estratégico, voltado a posicionamento,
              crescimento, conflitos, expansão e decisões difíceis. É onde
              a mentoria se torna sob medida.
            </p>
          </div>

          <footer className="bs-tier-foot">
            <span className="bs-tier-price-k">Investimento</span>
            <span className="bs-tier-price-v">R$ 8.997</span>
            <a href="#contato" className="bs-tier-cta bs-tier-cta-light">
              <span>Quero aplicar para a Executive</span>
              <svg width="14" height="10" viewBox="0 0 18 12" fill="none">
                <path d="M1 6h15M11 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </footer>
        </article>
      </div>

      <p className="bs-vagas-note">
        As inscrições passam por uma breve conversa antes da confirmação,
        para garantir alinhamento com o grupo.
      </p>
    </div>
  </section>
);

window.BsVagas = BsVagas;
