/* Abas na borda (celular, 29/10/2026): os botões flutuantes (Resumo e Assistente IA) ficam como ícones pequenos
   grudados na borda direita. O primeiro toque abre a aba com o nome; o segundo faz a ação.
   Tocar fora ou rolar a tela recolhe. Enquanto a tela rola, as abas se escondem na borda e voltam 1,2 s depois.
   No computador nada muda. */
(() => {
  const CEL = window.matchMedia('(max-width: 900px)');
  const css = document.createElement('style');
  css.textContent = `
  @media (max-width:900px){
    body .aba-borda{position:fixed !important;right:0 !important;left:auto !important;display:inline-flex !important;align-items:center;gap:9px;height:44px;width:auto !important;
      max-width:46px;padding:0 14px 0 15px !important;border-radius:22px 0 0 22px !important;overflow:hidden;white-space:nowrap;opacity:1 !important;
      transition:max-width .22s ease,box-shadow .22s ease,translate .25s ease,opacity .25s ease;justify-content:flex-start !important}
    /* rolando a tela (08/11/2026): as abas quase saem da borda e ficam claras, para não cobrir o conteúdo */
    body.abas-rolando .aba-borda:not(.aba-aberta){translate:62% 0;opacity:.45 !important}
    body .aba-borda.aba-aberta{max-width:230px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    body .aba-borda .fab-txt{display:inline !important}
    body .aba-borda .fab-txt,body .aba-borda .ia-fab-txt{opacity:0;transition:opacity .15s ease}
    body .aba-borda.aba-aberta .fab-txt,body .aba-borda.aba-aberta .ia-fab-txt{opacity:1}
    body #fab-summary.aba-borda{bottom:calc(14px + env(safe-area-inset-bottom)) !important}
    body #ia-fab.aba-borda{bottom:calc(66px + env(safe-area-inset-bottom)) !important;padding-left:8px !important;border-right:0 !important}
    body #ia-fab.aba-borda .ia-fab-txt small{display:none}
  }`;
  document.head.appendChild(css);

  const recolher = (exceto) => document.querySelectorAll('.aba-borda.aba-aberta').forEach((b) => { if (b !== exceto) b.classList.remove('aba-aberta'); });

  // fase de captura: o primeiro toque só abre a aba, sem chegar à ação do botão
  document.addEventListener('click', (e) => {
    if (!CEL.matches) return;
    const b = e.target.closest && e.target.closest('.aba-borda');
    if (!b) { recolher(); return; }
    if (!b.classList.contains('aba-aberta')) {
      e.preventDefault(); e.stopImmediatePropagation();
      recolher(b); b.classList.add('aba-aberta');
      return;
    }
    b.classList.remove('aba-aberta');
  }, true);
  let parouTimer = 0;
  window.addEventListener('scroll', () => {
    recolher();
    if (!CEL.matches) return;
    document.body.classList.add('abas-rolando');
    clearTimeout(parouTimer);
    parouTimer = setTimeout(() => document.body.classList.remove('abas-rolando'), 1200);
  }, { capture: true, passive: true });
  CEL.addEventListener?.('change', () => recolher());

  function marcar(el) { if (el && !el.classList.contains('aba-borda')) el.classList.add('aba-borda'); }
  marcar(document.getElementById('fab-summary'));
  window.MMAbaBorda = { marcar };
})();
