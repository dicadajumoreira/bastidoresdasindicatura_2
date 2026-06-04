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
            <span>Juliana Moreira · CEO</span>
            <span>Sindicompany</span>
          </div>
        </div>

        <div className="bs-sobre-text">
          <p className="bs-sobre-lead">
            <strong>Trinta anos</strong> dentro do mercado
            imobiliário e condominial. CEO da
            <strong> Sindicompany</strong> e da
            <strong> Condo Academy</strong>, dou aula de
            <strong> gestão condominial no IBMEC</strong>, sou
            formada em Finanças pela USP e atuo como Perita
            Judicial.
          </p>

          <div className="bs-sobre-body">
            <p>
              Comecei cedo. Aos quinze, batendo perna em obra com
              o meu pai na construtora dele. Aos vinte, montei um
              {' '}<em>family office</em> que foi o que me empurrou
              pro mundo da administração condominial e da sindicatura
              profissional.
            </p>
            <p>
              Hoje toco a Sindicompany ao lado de 91 pessoas, entre
              backoffice e síndicos profissionais, cuidando de mais
              de 300 condomínios. A Condo Academy nasceu por
              necessidade: pra manter padrão alto quando a operação
              cresce, alguém precisa formar gente. Hoje ela atende o
              ecossistema condominial inteiro.
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
          <span className="bs-press-sep">·</span>
          <span>RedeTV</span>
          <span className="bs-press-sep">·</span>
          <span>Record</span>
          <span className="bs-press-sep">·</span>
          <span>Globo</span>
          <span className="bs-press-sep">·</span>
          <span>Expo Síndicos</span>
          <span className="bs-press-sep">·</span>
          <span>SindoExpo</span>
          <span className="bs-press-sep">·</span>
          <span>FeSindico</span>
          <span className="bs-press-sep">·</span>
          <span>Folha de São Paulo</span>
          <span className="bs-press-sep">·</span>
          <span>Exame</span>
          <span className="bs-press-sep">·</span>
          <span>Estadão</span>
        </div>
      </div>
    </div>
  </section>
);

window.BsSobre = BsSobre;
