// Botão flutuante "Área de Membros" injetado em TODAS as páginas
// públicas. Aparece no canto superior direito, sticky, com fundo
// translúcido pra não competir com o topbar editorial das landings.
//
// Pra adicionar numa nova página, basta incluir no final do <body>:
//   <script src="/bs-members-link.js" defer></script>
//
// O script:
// - Não aparece dentro de /admin/ nem da própria /membros/
// - Não aparece em e-mails, PDFs ou rotas de função
// - Detecta se o usuário já está logado (sessionStorage) e muda o
//   label pra "Minha biblioteca"

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const path = window.location.pathname || '';
  if (path.startsWith('/admin') || path.startsWith('/membros')) return;

  function inject() {
    if (document.getElementById('bs-members-link')) return;

    let label = 'Área de Membros';
    try {
      const saved = sessionStorage.getItem('bs-membros-token');
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.email && data.exp && Date.now() < data.exp) {
          label = 'Minha biblioteca';
        }
      }
    } catch {}

    const a = document.createElement('a');
    a.id = 'bs-members-link';
    a.href = '/membros/';
    a.textContent = label;
    a.setAttribute('aria-label', 'Acessar a Área de Membros');
    a.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:9999',
      'background:rgba(26,28,41,0.92)',
      'color:#F7F5F2',
      'padding:10px 18px',
      'font-family:Georgia,"Bodoni Moda",serif',
      'font-size:11px',
      'font-weight:700',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'text-decoration:none',
      'border:1px solid rgba(218,189,169,0.5)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'transition:all 160ms ease',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    ].join(';');

    a.addEventListener('mouseenter', () => {
      a.style.background = 'rgba(218,189,169,1)';
      a.style.color = '#1A1C29';
    });
    a.addEventListener('mouseleave', () => {
      a.style.background = 'rgba(26,28,41,0.92)';
      a.style.color = '#F7F5F2';
    });

    // No celular esconde o label e mostra ícone simples
    const mq = window.matchMedia('(max-width: 600px)');
    const applyMobile = (matches) => {
      if (matches) {
        a.textContent = '✦ Membros';
        a.style.padding = '8px 12px';
        a.style.fontSize = '10px';
        a.style.letterSpacing = '0.16em';
      } else {
        a.textContent = label;
        a.style.padding = '10px 18px';
        a.style.fontSize = '11px';
        a.style.letterSpacing = '0.18em';
      }
    };
    applyMobile(mq.matches);
    mq.addEventListener('change', (e) => applyMobile(e.matches));

    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
