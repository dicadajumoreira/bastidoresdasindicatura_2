// Bastidores · MANIFESTO
// Texto oficial do briefing. Listas das coisas que "as pessoas enxergam"
// e "quase ninguém vê" + pull quote com a frase oficial.

const BsManifesto = () => (
  <section className="bs-manifesto" id="manifesto" data-screen-label="02 Manifesto">
    <div className="bs-manifesto-inner">
      <div className="bs-manifesto-head">
        <span className="bs-eyebrow bs-eyebrow-dark">Capítulo I · Manifesto</span>
        <h2 className="bs-manifesto-title">
          Existe uma parte<br/>
          da sindicatura<br/>
          <em>que quase ninguém vê.</em>
        </h2>
      </div>

      <div className="bs-manifesto-body">
        <div className="bs-manifest-pair">
          <div className="bs-manifest-col">
            <span className="bs-manifest-k">As pessoas enxergam</span>
            <ul className="bs-manifest-list">
              <li>a assembleia,</li>
              <li>o comunicado,</li>
              <li>a advertência,</li>
              <li>a decisão final.</li>
            </ul>
          </div>

          <div className="bs-manifest-col bs-manifest-col-shadow">
            <span className="bs-manifest-k">Mas quase ninguém vê</span>
            <ul className="bs-manifest-list bs-manifest-list-shadow">
              <li>a pressão,</li>
              <li>o desgaste,</li>
              <li>os conflitos,</li>
              <li>as crises,</li>
              <li>as mensagens fora de hora,</li>
              <li>as madrugadas pensando em decisões difíceis,</li>
              <li>e o peso emocional de quem precisa manter o equilíbrio enquanto todo mundo perde o controle.</li>
            </ul>
          </div>
        </div>

        <figure className="bs-manifesto-quote">
          <span className="bs-quote-mark">"</span>
          <blockquote>
            O mercado ensina teoria.<br/>
            A vida real ensina <em>sobrevivência.</em>
          </blockquote>
        </figure>

        <p className="bs-manifest-closing">
          Foi por isso que nasceu a <strong>Bastidores da Sindicatura.</strong>
          Aqui, não falamos apenas sobre administração. Falamos sobre
          liderança, crises, conflitos, comunicação, pressão emocional,
          posicionamento, crescimento, decisões difíceis e os bastidores
          reais da vida condominial.
        </p>
      </div>
    </div>
  </section>
);

window.BsManifesto = BsManifesto;
