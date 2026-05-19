// Bastidores · PÚBLICO + TRANSFORMAÇÃO
// Para quem é a mentoria. Antes / depois em duas colunas.

const BsPublico = () => (
  <section className="bs-publico" data-screen-label="05 Para quem">
    <div className="bs-publico-inner">
      <div className="bs-publico-head">
        <span className="bs-eyebrow" style={{color: 'var(--lavender-deep)'}}>Capítulo IV · Para quem</span>
        <h2 className="bs-publico-title">
          Pensada para quem<br/>
          já está <em>dentro do jogo.</em>
        </h2>
      </div>

      <div className="bs-publico-grid">
        <div className="bs-publico-perfil">
          <span className="bs-eyebrow bs-eyebrow-dark">Perfil</span>
          <ul>
            <li>Síndicos profissionais em atuação</li>
            <li>Síndicos em fase de crescimento</li>
            <li>Gestores condominiais</li>
            <li>Profissionais do mercado condominial</li>
            <li>Síndicos emocionalmente sobrecarregados</li>
            <li>Profissionais que querem crescer no mercado</li>
          </ul>
        </div>

        <div className="bs-publico-transform">
          <div className="bs-tcol bs-tcol-antes">
            <span className="bs-eyebrow bs-eyebrow-dark">Antes</span>
            <ul>
              <li>Sobrecarga</li>
              <li>Insegurança</li>
              <li>Pressão</li>
              <li>Sensação de estar sozinho</li>
              <li>Apagando incêndios</li>
              <li>Desgaste emocional</li>
            </ul>
          </div>

          <div className="bs-tcol-arrow" aria-hidden="true">
            <svg width="48" height="14" viewBox="0 0 48 14" fill="none">
              <path d="M1 7h44M37 1l6 6-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className="bs-tcol bs-tcol-depois">
            <span className="bs-eyebrow bs-eyebrow-dark">Depois</span>
            <ul>
              <li>Liderança estratégica</li>
              <li>Comunicação mais forte</li>
              <li>Clareza nas decisões</li>
              <li>Posicionamento profissional</li>
              <li>Gestão emocional</li>
              <li>Crescimento profissional</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
);

window.BsPublico = BsPublico;
