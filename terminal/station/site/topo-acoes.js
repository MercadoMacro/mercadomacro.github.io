/* Menu compacto: reutiliza as ações e os atalhos existentes. */
(() => {
  const menu = document.getElementById('topbar-more');
  if (!menu) return;
  const trigger = menu.querySelector('summary');
  menu.addEventListener('click', (event) => {
    const item = event.target.closest('button[data-topbar-action]');
    if (!item || !menu.contains(item)) return;
    menu.open = false;
    // O modal que abrir deve receber o foco; Tema permanece no mesmo contexto.
    trigger.focus();
    document.getElementById(item.dataset.topbarAction)?.click();
  });
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      menu.open = false;
      trigger.focus();
    }
  });
  menu.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
})();
