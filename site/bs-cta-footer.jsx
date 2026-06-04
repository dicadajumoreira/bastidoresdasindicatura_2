// Bastidores · DEPOIMENTOS + CTA + FOOTER

const BsDepoimentos = () => {
  const depos = [
    {
      texto: 'Sua palestra uniu conteúdo de alto nível, carisma e uma abordagem prática que tocou diretamente a realidade dos síndicos brasileiros. Foi uma verdadeira aula de liderança, propósito e inovação na gestão condominial.',
      autor: 'Conasi',
      papel: 'Congresso Nacional',
    },
    {
      texto: 'Mais do que compartilhar conhecimento técnico, ela inspirou síndicos e profissionais do setor a repensarem suas práticas e acreditarem no poder de uma gestão humana, estratégica e transformadora.',
      autor: 'SindicoNet',
      papel: 'Plataforma de conteúdo',
    },
    {
      texto: 'Trabalhar com a Ju Moreira foi muito bom. Lançamos alguns produtos e contamos com ela para produzir o conteúdo e ajudar a propagar. Foi um grande sucesso.',
      autor: 'Nutricar',
      papel: 'Marca parceira',
    },
  ];

  return (
    <section className="bs-depos" data-screen-label="07 Depoimentos">
      <div className="bs-depos-inner">
        <div className="bs-depos-head">
          <span className="bs-eyebrow" style={{color: 'var(--lavender)'}}>Capítulo VI · O que dizem</span>
          <h2 className="bs-depos-title">
            A voz de quem<br/>
            já esteve <em>na sala.</em>
          </h2>
        </div>

        <div className="bs-depos-grid">
          {depos.map((d, i) => (
            <figure key={i} className="bs-depo">
              <span className="bs-depo-no">{String(i + 1).padStart(2, '0')}</span>
              <blockquote>{d.texto}</blockquote>
              <figcaption>
                <span className="bs-depo-autor">{d.autor}</span>
                <span className="bs-depo-papel">{d.papel}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
};

const BsCta = () => {
  return (
    <section className="bs-cta" id="contato" data-screen-label="08 Aplicação">
      <div className="bs-cta-inner">
        <div className="bs-cta-text">
          <span className="bs-eyebrow" style={{color: 'var(--sand)'}}>Capítulo VII · Sua vaga</span>
          <h2 className="bs-cta-title">
            Aplicação<br/>
            <em>da Turma 01.</em>
          </h2>
          <p className="bs-cta-lead">
            Criei a Bastidores da Sindicatura pra quem quer viver
            essa profissão de um jeito mais estratégico,
            profissional e consciente. As vagas são limitadas e
            eu leio cada aplicação com atenção antes de responder.
          </p>

          <div className="bs-cta-info">
            <div>
              <span className="bs-cta-k">Início</span>
              <span className="bs-cta-v">Agosto · 2026</span>
            </div>
            <div>
              <span className="bs-cta-k">Encontros</span>
              <span className="bs-cta-v">Terças, 07h30</span>
            </div>
            <div>
              <span className="bs-cta-k">Plataforma</span>
              <span className="bs-cta-v">Microsoft Teams</span>
            </div>
          </div>

          <p className="bs-cta-quote">
            "O mercado ensina teoria.<br/>
            <em>A vida real ensina sobrevivência.</em>"
          </p>
        </div>

        <window.BsForm />
      </div>
    </section>
  );
};

const BsFooter = () => (
  <footer className="bs-footer">
    <div className="bs-footer-inner">
      <div className="bs-footer-brand-block">
        <div className="bs-brand bs-brand-footer">
          <span className="bs-brand-line1">Bastidores</span>
          <span className="bs-brand-line2">da Sindicatura</span>
        </div>
        <span className="bs-footer-byline">por Juliana Moreira · 2026</span>
      </div>

      <div className="bs-footer-cols">
        <div className="bs-footer-col">
          <span className="bs-eyebrow" style={{color: 'var(--sand)'}}>Mentoria</span>
          <a href="#manifesto">Manifesto</a>
          <a href="#estrutura">Estrutura</a>
          <a href="#vagas">Vagas</a>
          <a href="#contato">Reservar</a>
        </div>
        <div className="bs-footer-col">
          <span className="bs-eyebrow" style={{color: 'var(--sand)'}}>Juliana</span>
          <a href="https://instagram.com/dicadajumoreira" target="_blank" rel="noreferrer">Instagram</a>
          <a href="https://youtube.com/@dicadajumoreira" target="_blank" rel="noreferrer">YouTube</a>
          <a href="mailto:contato@dicadajumoreira.com.br">contato@dicadajumoreira.com.br</a>
        </div>
        <div className="bs-footer-col">
          <span className="bs-eyebrow" style={{color: 'var(--sand)'}}>Empresas</span>
          <span className="bs-footer-static">Sindicompany</span>
          <span className="bs-footer-static">Condo Academy</span>
        </div>
      </div>
    </div>

    <div className="bs-footer-base">
      <span>© 2026 · Bastidores da Sindicatura · Todos os direitos reservados</span>
      <span className="bs-footer-quote">A vida real ensina sobrevivência.</span>
    </div>
  </footer>
);

window.BsDepoimentos = BsDepoimentos;
window.BsCta = BsCta;
window.BsFooter = BsFooter;
