// Bastidores · ESTRUTURA DA MENTORIA
// 12 semanas. Formato dos encontros em 5 partes.

const BsEstrutura = () => {
  const partes = [
    {
      no: '01',
      titulo: 'Bastidor da semana',
      descr: 'A gente abre com um caso real da semana. O que aconteceu, como eu conduzi, o que dava pra ter feito diferente.',
    },
    {
      no: '02',
      titulo: 'Tema estratégico',
      descr: 'Um conteúdo central a cada semana, escolhido pra construir o repertório que sustenta uma carreira de verdade na profissão.',
    },
    {
      no: '03',
      titulo: 'Estudo de caso real',
      descr: 'A gente mergulha num caso vivido por mim ou por alguém do grupo. Decisões, consequências e o que dá pra aprender com cada uma.',
    },
    {
      no: '04',
      titulo: 'Hot Seat',
      descr: 'Cadeira aberta pro caso da sua semana. Você traz o desafio, o grupo discute, eu direciono.',
    },
    {
      no: '05',
      titulo: 'Direcionamento prático',
      descr: 'A gente sai do encontro com decisão anotada, próximo passo definido e clareza do que fazer até terça que vem.',
    },
  ];

  return (
    <section className="bs-estrutura" id="estrutura" data-screen-label="04 Estrutura">
      <div className="bs-estrutura-inner">
        <div className="bs-estrutura-head">
          <span className="bs-eyebrow" style={{color: 'var(--sand-deep)'}}>Capítulo III · Estrutura</span>
          <h2 className="bs-estrutura-title">
            Doze semanas.<br/>
            Cinco partes em cada encontro.<br/>
            <em>Um único compromisso.</em>
          </h2>
          <p className="bs-estrutura-lead">
            Toda terça, das sete e meia às nove da manhã, no Teams.
            Um encontro pra abrir a semana com clareza estratégica
            e fechar a anterior com aprendizado.
          </p>
        </div>

        <ol className="bs-partes">
          {partes.map((p) => (
            <li key={p.no} className="bs-parte">
              <div className="bs-parte-no">{p.no}</div>
              <div className="bs-parte-body">
                <h3 className="bs-parte-titulo">{p.titulo}</h3>
                <p className="bs-parte-descr">{p.descr}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Grade de itens do programa */}
        <div className="bs-programa">
          <span className="bs-eyebrow" style={{color: 'var(--lavender-deep)'}}>O que está no programa</span>
          <ul className="bs-programa-grid">
            <li><span>Doze semanas</span><em>de mentoria</em></li>
            <li><span>Encontros</span><em>ao vivo</em></li>
            <li><span>Terças</span><em>07h30 às 09h00</em></li>
            <li><span>Microsoft</span><em>Teams</em></li>
            <li><span>Grupo</span><em>fechado</em></li>
            <li><span>Hot Seats</span><em>semanais</em></li>
            <li><span>Estudos</span><em>de caso reais</em></li>
            <li><span>Sprint de</span><em>implementação</em></li>
            <li><span>Materiais</span><em>complementares</em></li>
            <li><span>Gravações</span><em>dos encontros</em></li>
            <li><span>Certificado</span><em>Condo Academy</em></li>
          </ul>
        </div>
      </div>
    </section>
  );
};

window.BsEstrutura = BsEstrutura;
