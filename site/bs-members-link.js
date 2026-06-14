// Widget flutuante fixo no canto superior direito de TODAS as páginas
// públicas. 6 botões:
//   Manifesto · Juliana · Estrutura · Vagas · Reservar Mentoria · Área de Membros
//
// Os links de navegação (Manifesto, Juliana, Estrutura, Vagas) são
// anchors da home; em landings viram '/#manifesto' etc (volta pra
// home + scroll automático).
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
    if (document.getElementById('bs-floating-nav')) return;

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

    // Prefixa anchors com '/' quando NÃO está na home (vira /#contato etc)
    const onHome = path === '/' || path === '/index.html';
    const href = (anchor) => onHome ? anchor : '/' + anchor;

    const wrap = document.createElement('nav');
    wrap.id = 'bs-floating-nav';
    wrap.setAttribute('aria-label', 'Navegação principal');
    wrap.style.cssText = [
      'position:fixed',
      'top:14px',
      'right:14px',
      'z-index:9999',
      'display:flex',
      'gap:4px',
      'align-items:center',
      'background:rgba(26,28,41,0.85)',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'border:1px solid rgba(218,189,169,0.30)',
      'padding:6px',
      'box-shadow:0 4px 18px rgba(0,0,0,0.35)',
    ].join(';');

    const linkBase = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'padding:8px 14px',
      'font-family:Georgia,"Bodoni Moda",serif',
      'font-size:10px',
      'font-weight:700',
      'letter-spacing:0.20em',
      'text-transform:uppercase',
      'text-decoration:none',
      'border:1px solid transparent',
      'transition:all 140ms ease',
      'cursor:pointer',
      'white-space:nowrap',
      'color:rgba(247,245,242,0.78)',
      'background:transparent',
    ].join(';');

    const linkHoverEnter = (el) => {
      el.style.color = '#F7F5F2';
      el.style.background = 'rgba(218,189,169,0.10)';
    };
    const linkHoverLeave = (el) => {
      el.style.color = 'rgba(247,245,242,0.78)';
      el.style.background = 'transparent';
    };

    const navItems = [
      {label: 'Manifesto', href: href('#manifesto')},
      {label: 'Juliana', href: href('#sobre')},
      {label: 'Estrutura', href: href('#estrutura')},
      {label: 'Vagas', href: href('#vagas')},
    ];

    const navEls = navItems.map((item) => {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      a.style.cssText = linkBase;
      a.addEventListener('mouseenter', () => linkHoverEnter(a));
      a.addEventListener('mouseleave', () => linkHoverLeave(a));
      return a;
    });

    // Separador visual antes dos CTAs
    const sep = document.createElement('span');
    sep.style.cssText = 'display:inline-block;width:1px;height:22px;background:rgba(247,245,242,0.18);margin:0 4px';

    const ctaBase = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'padding:9px 16px',
      'font-family:Georgia,"Bodoni Moda",serif',
      'font-size:10px',
      'font-weight:700',
      'letter-spacing:0.20em',
      'text-transform:uppercase',
      'text-decoration:none',
      'border:1px solid rgba(218,189,169,0.55)',
      'transition:all 140ms ease',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');

    const reservar = document.createElement('a');
    reservar.href = href('#contato');
    reservar.textContent = 'Reservar Mentoria';
    reservar.setAttribute('aria-label', 'Reservar minha aplicação para a Mentoria');
    reservar.style.cssText = ctaBase + ';background:rgba(218,189,169,0.95);color:#1A1C29';
    reservar.addEventListener('mouseenter', () => { reservar.style.background = '#F7F5F2'; });
    reservar.addEventListener('mouseleave', () => { reservar.style.background = 'rgba(218,189,169,0.95)'; });

    const membros = document.createElement('a');
    membros.href = '/membros/';
    membros.textContent = membersLabel;
    membros.setAttribute('aria-label', 'Acessar a Área de Membros');
    membros.style.cssText = ctaBase + ';background:transparent;color:#F7F5F2';
    membros.addEventListener('mouseenter', () => {
      membros.style.background = 'rgba(218,189,169,0.18)';
    });
    membros.addEventListener('mouseleave', () => {
      membros.style.background = 'transparent';
    });

    navEls.forEach((el) => wrap.appendChild(el));
    wrap.appendChild(sep);
    wrap.appendChild(reservar);
    wrap.appendChild(membros);

    // Mobile: esconde os links de nav (Manifesto/Juliana/Estrutura/Vagas)
    // e mantém só os 2 CTAs, com layout mais compacto
    const mq = window.matchMedia('(max-width: 880px)');
    const applyMobile = (matches) => {
      if (matches) {
        navEls.forEach((el) => { el.style.display = 'none'; });
        sep.style.display = 'none';
        wrap.style.padding = '4px';
        wrap.style.gap = '4px';
        wrap.style.top = '10px';
        wrap.style.right = '10px';
        reservar.textContent = 'Mentoria';
        membros.textContent = membersLabel === 'Minha biblioteca' ? 'Biblioteca' : 'Membros';
        reservar.style.cssText = ctaBase + ';padding:8px 12px;font-size:9px;letter-spacing:0.16em;background:rgba(218,189,169,0.95);color:#1A1C29';
        membros.style.cssText = ctaBase + ';padding:8px 12px;font-size:9px;letter-spacing:0.16em;background:transparent;color:#F7F5F2';
      } else {
        navEls.forEach((el) => { el.style.display = 'inline-flex'; });
        sep.style.display = 'inline-block';
        wrap.style.padding = '6px';
        wrap.style.gap = '4px';
        wrap.style.top = '14px';
        wrap.style.right = '14px';
        reservar.textContent = 'Reservar Mentoria';
        membros.textContent = membersLabel;
        reservar.style.cssText = ctaBase + ';background:rgba(218,189,169,0.95);color:#1A1C29';
        membros.style.cssText = ctaBase + ';background:transparent;color:#F7F5F2';
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
