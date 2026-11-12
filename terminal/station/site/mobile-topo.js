/* Celular (12/11/2026, auditoria do mobile): ao rolar uma aba para baixo, o cabeçalho (logo e fita de cotações) sai
   e a barra de abas sobe; voltando ao topo, ele reaparece. Antes o cabeçalho ficava preso e ocupava quase metade
   da tela (sobravam 324 de 664 px num iPhone 13). A frase do topo some no celular pelo CSS (estilo.css).
   Só vale para os roladores internos das abas: em Notícias a página inteira rola e o cabeçalho já sai sozinho. */
(() => {
  const mq = matchMedia('(max-width: 768px)');
  let rolou = false;
  const set = (v) => { if (v !== rolou) { rolou = v; document.body.classList.toggle('mm-rolou', v); } };
  document.addEventListener('scroll', (e) => {
    if (!mq.matches) return set(false);
    const el = e.target;
    if (!(el instanceof Element) || !el.closest('.tab-panel.active')) return;
    const sobra = el.scrollHeight - el.clientHeight;
    // ignora caixas pequenas e as que só rolam para os lados (tabelas largas)
    if (sobra < 2 || el.clientHeight < innerHeight * 0.35) return;
    // só recolhe se, depois de ganhar a altura do cabeçalho, ainda sobrar o que rolar (senão ficaria piscando)
    if (!rolou) { if (el.scrollTop > 80 && sobra > 320) set(true); }
    else if (el.scrollTop < 16) set(false);
  }, { capture: true, passive: true });
  // trocar de aba volta o cabeçalho
  document.addEventListener('click', (e) => { if (e.target.closest('#mobile-navigation')) set(false); });
  mq.addEventListener('change', () => set(false));
  // qualquer troca de aba (menu, atalhos, links internos) também volta o cabeçalho
  const antes = window.__onTabSwitch;
  window.__onTabSwitch = (id) => { if (antes) antes(id); set(false); };
})();
