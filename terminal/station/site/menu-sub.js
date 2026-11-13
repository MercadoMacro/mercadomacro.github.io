/* Sub-itens no menu (13/11/2026, pedido do Dante): as seções da aba Análises (Fluxo na B3, Fed, Copom,
   Especuladores, Grandes fundos, Análise avançada) aparecem logo abaixo de "Análises" no menu lateral quando a aba
   está aberta, e sempre no menu "Todas" do celular. Clicar leva direto à seção; a barra de seções dentro da aba
   continua e as duas andam juntas (evento mm-ana-secao do ana-secoes.js). */
(() => {
  const ABA = 'analysis-panel';
  const api = () => window.MMAnaSecoes;
  if (!api()) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ir = (k) => {
    if (!document.getElementById(ABA)?.classList.contains('active')) window.switchTab?.(ABA);
    api().ir(k);
    window.scrollTo?.(0, 0);
  };
  const botoes = (cls) => api().lista.map(({ k, t, icone }) => `<button type="button" class="${cls}" data-sub-secao="${k}" title="${esc(t)}">${icone}<span>${esc(t)}</span></button>`).join('');

  // ---- menu lateral (computador) ----
  const item = document.querySelector(`.side .side-item[data-tab="${ABA}"]`);
  let sub = null;
  if (item) {
    item.insertAdjacentHTML('beforeend', '<svg class="si-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>');
    item.setAttribute('aria-expanded', 'false');
    item.setAttribute('aria-controls', 'side-sub-analises');
    sub = document.createElement('div');
    sub.className = 'side-sub';
    sub.id = 'side-sub-analises';
    sub.setAttribute('role', 'group');
    sub.setAttribute('aria-label', 'Seções das Análises');
    sub.innerHTML = botoes('side-subitem');
    item.after(sub);
    sub.addEventListener('click', (e) => { const b = e.target.closest('[data-sub-secao]'); if (b) ir(b.dataset.subSecao); });
  }

  // ---- menu "Todas" do celular ----
  function noCelular() {
    const lista = document.getElementById('mobile-navigation-list');
    const linha = lista?.querySelector(`[data-mobile-tab="${ABA}"]`)?.closest('.mn-row');
    if (!linha || lista.querySelector('.mn-sub')) return !!linha;
    const d = document.createElement('div');
    d.className = 'mn-sub';
    d.setAttribute('role', 'group');
    d.setAttribute('aria-label', 'Seções das Análises');
    d.innerHTML = botoes('mn-subitem');
    linha.after(d);
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sub-secao]'); if (!b) return;
      lista.hidden = true;
      document.querySelector('#mobile-navigation .mn-all')?.setAttribute('aria-expanded', 'false');
      ir(b.dataset.subSecao);
    });
    return true;
  }
  if (!noCelular()) { let n = 0; const t = setInterval(() => { if (noCelular() || ++n > 20) clearInterval(t); }, 500); }

  // ---- marcar a seção atual e abrir/fechar com a aba ----
  function sync() {
    const aberta = !!document.getElementById(ABA)?.classList.contains('active'), atual = api().atual();
    if (sub) { sub.classList.toggle('aberto', aberta); item.setAttribute('aria-expanded', String(aberta)); }
    document.querySelectorAll('[data-sub-secao]').forEach((b) => {
      const on = aberta && b.dataset.subSecao === atual;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }
  document.addEventListener('mm-ana-secao', sync);
  const painel = document.getElementById(ABA);
  if (painel) new MutationObserver(sync).observe(painel, { attributes: true, attributeFilter: ['class'] });
  sync();

  const css = document.createElement('style');
  css.textContent = `
  .side-item .si-chev { flex:0 0 auto; opacity:.5; transition:transform .2s ease; }
  .side-item[aria-expanded="true"] .si-chev { transform:rotate(90deg); opacity:.8; }
  body.side-collapsed .side-item .si-chev { display:none; }
  .side-sub { margin:0 0 0 22px; border-left:1px solid var(--line); padding-left:6px; overflow:hidden; max-height:0; opacity:0; transition:max-height .22s ease, opacity .18s ease, margin .22s ease; }
  .side-sub.aberto { max-height:320px; opacity:1; margin-top:2px; margin-bottom:6px; }
  body.side-collapsed .side-sub { display:none; }
  .side-subitem { display:flex; align-items:center; gap:9px; width:100%; padding:6px 10px; margin:1px 0; border:0; border-radius:8px; background:none; color:var(--text-3); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
  .side-subitem:hover { background:var(--surface-2); color:var(--text); }
  .side-subitem.on { color:var(--accent-ink, var(--text)); background:var(--accent-soft); font-weight:600; }
  .side-subitem i, .mn-subitem i { width:16px; text-align:center; font-size:12px; opacity:.85; }
  .side-subitem .pj-flag, .mn-subitem .pj-flag { width:16px; height:11px; border-radius:2px; flex:none; }
  .side-subitem span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #mobile-navigation .mn-sub { display:flex; flex-direction:column; margin:0 0 6px 30px; padding-left:8px; border-left:1px solid var(--line); }
  #mobile-navigation .mn-sub .mn-subitem { display:flex; align-items:center; gap:10px; width:100%; min-height:38px; padding:6px 10px; font-size:13.5px; text-align:left; justify-content:flex-start; color:var(--text-2); }
  #mobile-navigation .mn-sub .mn-subitem.on { color:var(--accent); font-weight:600; }
  `;
  document.head.appendChild(css);
})();
