/* Plano grátis (48 horas, 29/10/2026): só Mesa, Notícias e Educação ficam abertas.
   As outras abas aparecem com cadeado e mostram um cartão para assinar. A situação vem de /api/auth/eu
   (gratis: true) e fica guardada em localStorage mm_plano para valer já na próxima abertura. */
(() => {
  'use strict';
  const LIVRES = ['mesa-panel', 'news-panel', 'edu-panel'];
  const GUARDA = 'mm_plano';
  let gratis = false;
  try { gratis = localStorage.getItem(GUARDA) === 'gratis'; } catch (e) {}

  const fora = LIVRES.map((id) => `:not([data-tab="${id}"]):not([data-mobile-tab="${id}"])`).join('');
  const tranca = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='11' width='14' height='10' rx='2'/%3E%3Cpath d='M8 11V7a4 4 0 0 1 8 0v4'/%3E%3C/svg%3E\")";
  const css = document.createElement('style');
  css.textContent = `
  html[data-gratis] :is(.side-item[data-tab], .tab-btn[data-tab], [data-mobile-tab])${fora}::after{content:'';display:inline-block;width:12px;height:12px;margin-left:auto;flex:0 0 auto;background:currentColor;opacity:.55;-webkit-mask:${tranca} center/contain no-repeat;mask:${tranca} center/contain no-repeat}
  html[data-gratis] .tab-btn[data-tab]${fora}::after,html[data-gratis] [data-mobile-tab]${fora}::after{margin-left:6px}
  html[data-gratis] .tab-panel.mm-trancada > :not(.mm-cadeado){display:none !important}
  .mm-cadeado{display:none}
  html[data-gratis] .tab-panel.mm-trancada > .mm-cadeado{display:flex}
  .mm-cadeado{flex-direction:column;align-items:flex-start;gap:12px;max-width:560px;margin:48px auto;padding:28px 30px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--text)}
  .mm-cadeado .mm-cad-ico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
  .mm-cadeado .mm-cad-ico svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .mm-cadeado h3{margin:0;font-size:20px}
  .mm-cadeado p{margin:0;color:var(--text-2);line-height:1.55}
  .mm-cadeado .mm-cad-acoes{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
  .mm-cadeado a,.mm-cadeado button{display:inline-flex;align-items:center;min-height:40px;padding:9px 16px;border-radius:10px;font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;border:1px solid var(--line-2);background:var(--surface-2);color:var(--text)}
  .mm-cadeado a.prim{background:var(--accent);border-color:var(--accent);color:#141006}
  @media (max-width:640px){.mm-cadeado{margin:24px 0;padding:22px 18px}}`;
  document.head.appendChild(css);

  const NOMES = { 'mesa-panel': 'Mesa', 'news-panel': 'Notícias', 'edu-panel': 'Educação' };
  function cartao(painel) {
    if (painel.querySelector(':scope > .mm-cadeado')) return;
    const d = document.createElement('div');
    d.className = 'mm-cadeado';
    d.innerHTML = `<span class="mm-cad-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>
      <h3>Disponível para assinantes</h3>
      <p>No plano grátis você usa a Mesa, as Notícias e a Educação. Assine um plano para abrir esta aba e todo o resto do terminal.</p>
      <div class="mm-cad-acoes"><a class="prim" href="/assinar">Ver planos</a>${LIVRES.map((id) => `<button type="button" data-ir-aba="${id}">Ir para ${NOMES[id]}</button>`).join('')}</div>`;
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-ir-aba]'); if (b) document.getElementById('tab-' + b.dataset.irAba)?.click(); });
    painel.prepend(d);
  }

  function aplicar() {
    document.documentElement.toggleAttribute('data-gratis', gratis);
    document.dispatchEvent(new CustomEvent('mm-plano', { detail: { gratis } }));
    document.querySelectorAll('.tab-panel').forEach((p) => {
      const trancar = gratis && !LIVRES.includes(p.id);
      p.classList.toggle('mm-trancada', trancar);
      if (trancar) cartao(p);
    });
    // começa na Mesa quando a aba aberta está trancada
    const ativa = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (gratis && ativa && !LIVRES.includes(ativa)) document.getElementById('tab-mesa-panel')?.click();
  }

  aplicar();
  fetch('/api/auth/eu', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) return;
    const agora = !!j.gratis;
    try { if (agora) localStorage.setItem(GUARDA, 'gratis'); else localStorage.removeItem(GUARDA); } catch (e) {}
    if (agora !== gratis) { gratis = agora; aplicar(); }
  }).catch(() => {});
})();
