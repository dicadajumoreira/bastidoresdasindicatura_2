// Widget flutuante fixo no canto superior direito de TODAS as páginas
// públicas. Dois botões lado a lado:
//   1. "Reservar Mentoria" → /#contato (anchor da home)
//   2. "Área de Membros"   → /membros/  (vira "Minha biblioteca" se logado)
//
// Pra adicionar em nova página, inclua no final do <body>:
//   <script src="/bs-members-link.js" defer></script>
//
// Skip automático em /admin/ e /membros/.

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const path = window.location.pathname || '';
  if (path.startsWith('/admin') || path.startsWith('/membros')) return;

  function inject() {
    if (document.getElementById('bs-floating-cta')) return;

    let membersLabel = 'Área de Membros';
    try {
      const saved = sessionStorage.getItem('bs-membros-token');
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.email && data.exp && Date.now() < data.exp) {
          membersLabel = 'Minha biblioteca';
        }
      }
    } catch {}

    // Link 'Reservar' vai pra /#contato (sempre absoluto, funciona em
    // qualquer página). Se já estamos na home, hash navigation acontece
    // suave; em landings vira pra home + scroll automático.
    const reservarHref = path === '/' ? '#contato' : '/#contato';

    const wrap = document.createElement('div');
    wrap.id = 'bs-floating-cta';
    wrap.style.cssText = [
      'position:fixed',
      'top:14px',
      'right:14px',
      'z-index:9999',
      'display:flex',
      'gap:8px',
      'align-items:stretch',
    ].join(';');

    const baseBtn = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'padding:10px 18px',
      'font-family:Georgia,"Bodoni Moda",serif',
      'font-size:11px',
      'font-weight:700',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'text-decoration:none',
      'border:1px solid rgba(218,189,169,0.55)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'transition:all 160ms ease',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');

    const reservar = document.createElement('a');
    reservar.href = reservarHref;
    reservar.textContent = 'Reservar Mentoria';
    reservar.setAttribute('aria-label', 'Reservar minha aplicação para a Mentoria');
    reservar.style.cssText = baseBtn
      + ';background:rgba(218,189,169,0.95);color:#1A1C29';
    reservar.addEventListener('mouseenter', () => {
      reservar.style.background = '#F7F5F2';
    });
    reservar.addEventListener('mouseleave', () => {
      reservar.style.background = 'rgba(218,189,169,0.95)';
    });

    const membros = document.createElement('a');
    membros.href = '/membros/';
    membros.textContent = membersLabel;
    membros.setAttribute('aria-label', 'Acessar a Área de Membros');
    membros.style.cssText = baseBtn
      + ';background:rgba(26,28,41,0.92);color:#F7F5F2';
    membros.addEventListener('mouseenter', () => {
      membros.style.background = 'rgba(218,189,169,1)';
      membros.style.color = '#1A1C29';
    });
    membros.addEventListener('mouseleave', () => {
      membros.style.background = 'rgba(26,28,41,0.92)';
      membros.style.color = '#F7F5F2';
    });

    wrap.appendChild(reservar);
    wrap.appendChild(membros);

    const mq = window.matchMedia('(max-width: 720px)');
    const applyMobile = (matches) => {
      if (matches) {
        reservar.textContent = 'Mentoria';
        membros.textContent = membersLabel === 'Minha biblioteca' ? 'Biblioteca' : 'Membros';
        const compactBase = [
          'display:inline-flex','align-items:center','justify-content:center',
          'padding:8px 12px','font-family:Georgia,"Bodoni Moda",serif',
          'font-size:10px','font-weight:700','letter-spacing:0.14em',
          'text-transform:uppercase','text-decoration:none',
          'border:1px solid rgba(218,189,169,0.55)','transition:all 160ms ease',
          'box-shadow:0 4px 12px rgba(0,0,0,0.25)','cursor:pointer','white-space:nowrap',
        ].join(';');
        reservar.style.cssText = compactBase + ';background:rgba(218,189,169,0.95);color:#1A1C29';
        membros.style.cssText = compactBase + ';background:rgba(26,28,41,0.92);color:#F7F5F2';
        wrap.style.top = '10px';
        wrap.style.right = '10px';
        wrap.style.gap = '6px';
      }
    };
    applyMobile(mq.matches);
    mq.addEventListener('change', (e) => applyMobile(e.matches));

    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
