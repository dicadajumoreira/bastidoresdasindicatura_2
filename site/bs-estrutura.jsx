// Bastidores · ESTRUTURA DA MENTORIA
// 12 semanas. Formato dos encontros em 5 partes.

const BsEstrutura = () => {
  const partes = [
    {
      no: '01',
      titulo: 'Bastidor da semana',
      descr: 'Abrimos o encontro com uma situação real vivida na semana. O que aconteceu, como conduzi, o que poderia ter sido diferente.',
    },
    {
      no: '02',
      titulo: 'Tema estratégico',
      descr: 'Um conteúdo central por semana, escolhido para construir o repertório executivo que sustenta a carreira na profissão.',
    },
    {
      no: '03',
      titulo: 'Estudo de caso real',
      descr: 'Mergulho em um caso vivido por mim ou por outro síndico do grupo. Decisões, consequências e o que se aprende com elas.',
    },
    {
      no: '04',
      titulo: 'Hot Seat',
      descr: 'Uma cadeira aberta para o caso da sua semana. Você traz o desafio, o grupo discute, eu dou o direcionamento.',
    },
    {
      no: '05',
      titulo: 'Direcionamento prático',
      descr: 'Saímos do encontro com decisões anotadas, próximos passos definidos e clareza sobre o que fazer até a próxima terça.',
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
            Todas as terças, das sete e meia às nove da manhã,
            via Microsoft Teams. Um encontro pensado para abrir a
            semana com clareza estratégica e fechar a anterior com
            aprendizado.
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
