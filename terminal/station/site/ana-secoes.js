/* Barra de seções da aba Análises, no mesmo estilo da barra dos Indicadores (pedido do Severino, 28/10/2026).
   Mostra uma parte da página por vez; a faixa de destaques fica sempre visível no topo. */
(() => {
  const wrap = document.querySelector('#analysis-panel .ana-wrap');
  const dq = document.getElementById('ana-destaques');
  if (!wrap || !dq) return;
  const SECOES = [
    ['fluxo', 'Fluxo na B3', 'fa-right-left'],
    ['fed', 'Fed', 'flag-us'],
    ['copom', 'Copom', 'flag-br'],
    ['cot', 'Especuladores', 'fa-scale-balanced'],
    ['f13', 'Grandes fundos', 'fa-briefcase'],
    ['mercado', 'Mercado', 'fa-chart-line']
  ];
  const ALVO = { 'ana-sec-fluxo': 'fluxo', 'ana-sec-fed': 'fed', 'ana-sec-cot': 'cot', 'ana-sec-13f': 'f13' };
  // Fed e Copom usam as bandeirinhas no lugar do ícone
  const BANDEIRA = { 'flag-us': '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#b22234"/><g fill="#fff"><rect y="1.54" width="30" height="1.54"/><rect y="4.62" width="30" height="1.54"/><rect y="7.69" width="30" height="1.54"/><rect y="10.77" width="30" height="1.54"/><rect y="13.85" width="30" height="1.54"/><rect y="16.92" width="30" height="1.54"/></g><rect width="12" height="10.77" fill="#3c3b6e"/></svg>', 'flag-br': '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.2 10 15 17.8 2.8 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.1c3-.8 6.2-.5 8.9.9" stroke="#fff" stroke-width=".8" fill="none"/></svg>' };
  const icone = (ic) => BANDEIRA[ic] || `<i class="fa-solid ${ic}" aria-hidden="true"></i>`;
  const TIT = { fed: ['Probabilidades do Fed', 'futuros de Fed Funds'], copom: ['Probabilidades do Copom', 'opções de Copom da B3'] };
  const CHAVE = 'ana_secao';
  // sem escolha salva, abre na primeira seção (Mercado ficou por último a pedido do Severino)
  let secao = SECOES[0][0];
  try { secao = localStorage.getItem(CHAVE) || secao; } catch (e) { /* sem armazenamento */ }
  if (secao === 'juros') secao = 'fed';   // a aba antiga "Fed e Copom" virou duas
  if (!SECOES.some(([k]) => k === secao)) secao = SECOES[0][0];

  const nav = document.createElement('nav');
  nav.className = 'ana-jump';
  nav.setAttribute('aria-label', 'Seções das Análises');
  nav.innerHTML = `<span class="aj-pill" aria-hidden="true"></span>${SECOES.map(([k, t, ic]) => `<button type="button" data-secao="${k}">${icone(ic)}<span>${t}</span></button>`).join('')}`;
  dq.after(nav);

  function pilula() {
    const on = nav.querySelector('button.on'), p = nav.querySelector('.aj-pill');
    if (!on || !p || !on.offsetWidth) return;
    p.style.width = on.offsetWidth + 'px';
    p.style.height = on.offsetHeight + 'px';
    p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }
  function mostra(k, salva = true) {
    secao = k;
    wrap.dataset.secao = k;
    if (TIT[k]) {
      const t = document.getElementById('pj-tit'), f = document.getElementById('pj-fonte');
      if (t) t.textContent = TIT[k][0];
      if (f) f.textContent = TIT[k][1];
    }
    nav.querySelectorAll('[data-secao]').forEach((b) => { const on = b.dataset.secao === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (salva) { try { localStorage.setItem(CHAVE, k); } catch (e) { /* sem armazenamento */ } }
    pilula();
    // gráficos desenhados com a largura real: avisa que a área mudou
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-secao]'); if (b) mostra(b.dataset.secao); });
  window.addEventListener('resize', pilula);
  // a pílula só tem medida quando a aba está visível
  new MutationObserver(() => requestAnimationFrame(pilula)).observe(document.getElementById('analysis-panel'), { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
  // os cartões de destaque levam à seção certa
  window.__anaSecao = (id) => { const k = ALVO[id]; if (k) mostra(k); return !!k; };
  nav.classList.add('sem-anim');
  mostra(secao, false);
  requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.remove('sem-anim')));

  const css = document.createElement('style');
  css.textContent = `
  .ana-jump { flex-shrink:0; position:relative; display:flex; gap:4px; width:max-content; max-width:100%; overflow-x:auto; scrollbar-width:none; padding:5px; border:1px solid var(--line); border-radius:14px; background:var(--surface); box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .ana-jump::-webkit-scrollbar { display:none; }
  .ana-jump button { position:relative; z-index:1; display:flex; align-items:center; gap:8px; border:0; background:none; color:var(--text-2); font:inherit; font-size:13.5px; font-weight:500; padding:9px 16px; border-radius:10px; cursor:pointer; white-space:nowrap; transition:color .2s, background .2s, box-shadow .2s, transform .2s; }
  .ana-jump button i { font-size:13px; color:var(--accent-ink); transition:color .2s; }
  .ana-jump button:not(.on):hover { background:var(--surface-2); color:var(--text); box-shadow:0 2px 6px rgba(0,0,0,.1); transform:translateY(-1px); }
  .ana-jump button.on { color:#fff; font-weight:600; }
  .ana-jump button.on i { color:inherit; }
  .ana-jump .pj-flag { width:18px; height:12px; }
  .aj-pill { position:absolute; z-index:0; top:0; left:0; width:0; height:0; border-radius:10px; background:color-mix(in srgb, var(--accent) 72%, #000); box-shadow:0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent); transition:transform .3s var(--ease,ease), width .3s var(--ease,ease), height .3s var(--ease,ease); }
  body:not(.light) .aj-pill { background:var(--accent); }
  body:not(.light) .ana-jump button.on { color:#17120a; }
  .ana-jump.sem-anim .aj-pill { transition:none; }
  .ana-wrap[data-secao]:not([data-secao="mercado"]) > .refresh-bar,
  .ana-wrap[data-secao]:not([data-secao="mercado"]) > #ana-toggle,
  .ana-wrap[data-secao]:not([data-secao="mercado"]) > #ana-body,
  .ana-wrap[data-secao="mercado"] > .ana-extra,
  .ana-wrap[data-secao="fluxo"] .ana-extra > .market-section:not(#ana-sec-fluxo),
  .ana-wrap[data-secao="fed"] .ana-extra > .market-section:not(#ana-sec-fed),
  .ana-wrap[data-secao="copom"] .ana-extra > .market-section:not(#ana-sec-fed),
  .ana-wrap[data-secao="fed"] #pj-col-br,
  .ana-wrap[data-secao="copom"] #pj-col-eua,
  .ana-wrap[data-secao="cot"] .ana-extra > .market-section:not(#ana-sec-cot),
  .ana-wrap[data-secao="f13"] .ana-extra > .market-section:not(#ana-sec-13f) { display:none !important; }
  /* seções no formato do Resumo semanal: cartão centralizado, título grande e margens fixas (28/10/2026) */
  #analysis-panel .ana-wrap { width:100%; max-width:1180px; margin-left:auto; margin-right:auto; }
  .ana-extra > .market-section { padding:20px 24px 22px; border:1px solid var(--line); border-radius:16px; background:radial-gradient(120% 160% at 0% 0%, var(--accent-soft), transparent 50%), var(--surface); }
  .ana-extra > .market-section > .market-section-head { border-bottom:0; padding-bottom:0; margin-bottom:16px; gap:10px; flex-wrap:wrap; }
  .ana-extra > .market-section > .market-section-head .sec-icon { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:9px; background:var(--accent-soft); border:1px solid var(--accent-line, var(--line)); color:var(--accent-ink); font-size:13px; }
  .ana-extra > .market-section > .market-section-head h2 { font-size:20px; font-weight:700; letter-spacing:-.01em; text-transform:none; color:var(--text); line-height:1.3; }
  .ana-extra > .market-section > .market-section-head::after { background:none; }
  .ana-extra > .market-section > .market-section-head .sec-count { font:11px 'JetBrains Mono', monospace; color:var(--text-3); border:1px solid var(--line); border-radius:99px; padding:2px 8px; }
  @media (max-width: 640px) {
    .ana-extra > .market-section { padding:16px 14px 18px; border-radius:14px; }
    .ana-extra > .market-section > .market-section-head h2 { font-size:17px; }
  }
  @media (max-width: 640px) {
    .ana-jump { display:grid; grid-template-columns:1fr 1fr; width:100%; overflow:visible; }
    .ana-jump button { justify-content:center; padding:9px 8px; font-size:13px; white-space:normal; text-align:center; }
    .ana-jump button:not(.on):hover { transform:none; }
  }
  @media (prefers-reduced-motion: reduce) { .aj-pill, .ana-jump button { transition:none; } }
  `;
  document.head.appendChild(css);
})();
