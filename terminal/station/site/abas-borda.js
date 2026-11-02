/* Ações mobile no fluxo da página: não cobrem gráficos nem cotações. */
(() => {
  const mobile = window.matchMedia('(max-width: 768px)');
  const dock = document.createElement('div');
  dock.className = 'mobile-actions';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Resumo e assistente');
  const footer = document.getElementById('site-foot');
  if (footer) footer.before(dock); else document.body.append(dock);
  const origins = new Map();
  function marcar(button) {
    if (!button) return;
    if (!origins.has(button)) {
      const place = document.createComment('posição original da ação');
      button.before(place);
      origins.set(button, place);
    }
    button.classList.remove('aba-borda', 'aba-aberta');
    if (mobile.matches) dock.append(button);
    else origins.get(button).after(button);
  }
  mobile.addEventListener?.('change', () => origins.forEach((_, b) => marcar(b)));
  marcar(document.getElementById('fab-summary'));
  marcar(document.getElementById('ia-fab'));
  window.MMAbaBorda = { marcar };
})();
