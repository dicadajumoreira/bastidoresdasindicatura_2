// Bastidores · SOBRE A JULIANA
// Bloco onix profundo. Foto retrato (mármore) + texto + grade de números do mídia kit.

const BsSobre = () => (
  <section className="bs-sobre" id="sobre" data-screen-label="03 Sobre Juliana">
    <div className="bs-sobre-inner">
      {/* Cabeçalho */}
      <div className="bs-sobre-head">
        <span className="bs-eyebrow" style={{color: 'var(--lavender)'}}>Capítulo II · Quem conduz</span>
        <h2 className="bs-sobre-title">
          Juliana<br/>
          <em>Moreira.</em>
        </h2>
      </div>

      {/* Conteúdo principal */}
      <div className="bs-sobre-grid">
        <div className="bs-sobre-media">
          <img src="assets/ju-sobre.jpg" alt="Juliana Moreira" />
          <div className="bs-sobre-tag">
            <span>JM · CEO</span>
            <span>Sindicompany</span>
          </div>
        </div>

        <div className="bs-sobre-text">
          <p className="bs-sobre-lead">
            Um dos principais nomes do mercado condominial brasileiro.
            CEO da <strong>Sindicompany</strong> e da
            <strong> Condo Academy</strong>, professora de
            <strong> gestão condominial no IBMEC</strong>,
            formada em Finanças pela USP e certificada como Perita
            Judicial. Mais de
            <strong> trinta anos</strong> no mercado imobiliário
            e condominial.
          </p>

          <div className="bs-sobre-body">
            <p>
              Começou cedo. Aos quinze anos, deu os primeiros
              passos no setor ao trabalhar com o pai em sua
              construtora. Aos vinte, fundou um <em>family office</em>
              {' '}que, com o tempo, a levou ao universo da
              administração condominial e da sindicatura profissional.
            </p>
            <p>
              Hoje lidera a Sindicompany, empresa de médio porte
              em crescimento acelerado, com 91 profissionais entre
              backoffice e síndicos. A necessidade de manter o alto
              padrão em escala deu origem à Condo Academy, escola
              para todo o ecossistema condominial.
            </p>
          </div>

          <div className="bs-sobre-signature">
            <span className="bs-sig-name">Juliana Moreira</span>
            <span className="bs-sig-role">CEO Sindicompany · Condo Academy</span>
          </div>
        </div>
      </div>

      {/* Grade de números */}
      <div className="bs-sobre-numbers">
        <div className="bs-num-item">
          <span className="bs-num-val">+70<span className="bs-num-suf">mil</span></span>
          <span className="bs-num-lbl">Famílias nos condomínios</span>
        </div>
        <div className="bs-num-item">
          <span className="bs-num-val">+300</span>
          <span className="bs-num-lbl">Condomínios sob gestão</span>
        </div>
        <div className="bs-num-item">
          <span className="bs-num-val">+158k</span>
          <span className="bs-num-lbl">Seguidores no Instagram</span>
        </div>
        <div className="bs-num-item">
          <span className="bs-num-val">+33k</span>
          <span className="bs-num-lbl">Inscritos no YouTube</span>
        </div>
      </div>

      {/* Faixa de mídias */}
      <div className="bs-sobre-press">
        <span className="bs-eyebrow" style={{color: 'var(--sand)'}}>Presença em mídias e eventos</span>
        <div className="bs-press-list">
          <span>Nutricar</span>
          <span className="bs-press-sep">·</span>
          <span>CondTV</span>
          <span className="bs-press-sep">·</span>
          <span>SindicoNet</span>
          <span className="bs-press-sep">·</span>
          <span>Expo Síndico</span>
          <span className="bs-press-sep">·</span>
          <span>Eletromidia</span>
          <span className="bs-press-sep">·</span>
          <span>Conasi</span>
        </div>
      </div>
    </div>
  </section>
);

window.BsSobre = BsSobre;
