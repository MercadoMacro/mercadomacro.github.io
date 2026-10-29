/* Navegação móvel: as abas originais continuam responsáveis pelo conteúdo.
   As áreas fixas na barra (1 a 3) são escolhidas pelo alfinete de cada item em "Todas"
   e ficam em localStorage "trader_mobile_nav_v1"; o padrão é Mercado, Watchlist e Notícias. */
(() => {
  const tabs = document.getElementById('tabs');
  if (!tabs || document.getElementById('mobile-navigation')) return;
  const originals = [...tabs.querySelectorAll('button[data-tab]')];
  const byId = new Map(originals.map(b => [b.dataset.tab, b]));
  const PIN_KEY = 'trader_mobile_nav_v1', PIN_MAX = 3;
  const DEFAULT_PINS = ['market-panel', 'watch-panel', 'news-panel'];
  // plano grátis (plano-livre.js): a barra padrão traz as áreas abertas
  const GRATIS_PINS = ['mesa-panel', 'news-panel', 'edu-panel'];
  let gratis = false, escolheu = false;
  try { gratis = localStorage.getItem('mm_plano') === 'gratis'; } catch { /* sem armazenamento */ }
  let primary = gratis ? GRATIS_PINS : DEFAULT_PINS;
  try {
    const saved = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
    if (Array.isArray(saved)) {
      const ok = [...new Set(saved)].filter(id => byId.has(id)).slice(0, PIN_MAX);
      if (ok.length) { primary = ok; escolheu = true; }
    }
  } catch { /* padrão */ }
  const groups = [
    ['Visão geral', ['market-panel', 'mesa-panel', 'watch-panel', 'heatmap-panel']],
    ['Informação', ['news-panel', 'weekly-panel', 'calendar-panel']],
    ['Análise', ['analysis-panel', 'fund-panel']],
    ['Ferramentas', ['indicators-panel', 'calculator-panel', 'options-panel', 'edu-panel']],
  ];
  const label = b => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() || b.textContent.trim();
  const nav = document.createElement('nav');
  nav.id = 'mobile-navigation';
  nav.setAttribute('aria-label', 'Navegação do terminal');
  const bar = document.createElement('div');
  bar.className = 'mn-bar';
  function button(id, icon) {
    const original = byId.get(id);
    if (!original) return null;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.mobileTab = id;
    const i = document.createElement('i');
    i.className = icon || original.querySelector('i')?.className || 'fas fa-circle';
    i.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = label(original);
    b.append(i, text);
    b.addEventListener('click', () => {
      const fromList = list.contains(b);
      close();
      if (fromList) all.focus();
      original.click();
      sync();
    });
    return b;
  }
  const all = document.createElement('button');
  all.type = 'button'; all.className = 'mn-all';
  all.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i><span>Todas</span>';
  all.setAttribute('aria-expanded', 'false');
  all.setAttribute('aria-controls', 'mobile-navigation-list');
  const list = document.createElement('div');
  list.id = 'mobile-navigation-list'; list.className = 'mn-list'; list.hidden = true;
  function close() { list.hidden = true; all.setAttribute('aria-expanded', 'false'); }
  all.addEventListener('click', () => {
    list.hidden = !list.hidden;
    all.setAttribute('aria-expanded', String(!list.hidden));
  });
  bar.appendChild(all);
  function fillBar() {
    bar.querySelectorAll('[data-mobile-tab]').forEach(b => b.remove());
    for (const id of primary) { const b = button(id); if (b) all.before(b); }
    bar.style.setProperty('--mn-n', String(primary.length + 1));
  }
  fillBar();
  // aviso para leitor de tela (fixou, desafixou, limite)
  const live = document.createElement('p');
  live.className = 'mn-live'; live.setAttribute('role', 'status');
  const pins = [];
  function syncPins() {
    pins.forEach(p => {
      const on = primary.includes(p.dataset.pin), name = label(byId.get(p.dataset.pin));
      p.setAttribute('aria-pressed', String(on));
      p.setAttribute('aria-label', on ? 'Tirar ' + name + ' da barra' : 'Fixar ' + name + ' na barra');
      p.title = on ? 'Tirar da barra' : 'Fixar na barra (até ' + PIN_MAX + ')';
    });
  }
  function togglePin(id) {
    const name = label(byId.get(id));
    if (primary.includes(id)) {
      if (primary.length <= 1) { live.textContent = 'A barra precisa de pelo menos uma área fixa.'; return; }
      primary = primary.filter(x => x !== id);
      live.textContent = name + ' saiu da barra.';
    } else {
      if (primary.length >= PIN_MAX) { live.textContent = 'Já há ' + PIN_MAX + ' áreas fixas. Tire uma antes de fixar ' + name + '.'; return; }
      // mantém a ordem das abas originais
      primary = originals.map(b => b.dataset.tab).filter(x => x === id || primary.includes(x));
      live.textContent = name + ' fixada na barra.';
    }
    escolheu = true;
    try { localStorage.setItem(PIN_KEY, JSON.stringify(primary)); } catch { /* sem armazenamento: vale até recarregar */ }
    fillBar(); syncPins(); sync();
  }
  const hint = document.createElement('p');
  hint.className = 'mn-hint';
  hint.textContent = 'Toque no alfinete para escolher até ' + PIN_MAX + ' áreas fixas na barra.';
  list.appendChild(hint);
  for (const [name, ids] of groups) {
    const heading = document.createElement('h3'); heading.textContent = name; list.appendChild(heading);
    for (const id of ids) {
      const b = button(id);
      if (!b) continue;
      const row = document.createElement('div'); row.className = 'mn-row';
      const pin = document.createElement('button');
      pin.type = 'button'; pin.className = 'mn-pin'; pin.dataset.pin = id;
      pin.innerHTML = '<i class="fas fa-thumbtack" aria-hidden="true"></i>';
      pin.addEventListener('click', () => togglePin(id));
      pins.push(pin);
      row.append(b, pin); list.appendChild(row);
    }
  }
  list.appendChild(live);
  syncPins();
  const current = document.createElement('div');
  current.className = 'mn-current'; current.hidden = true;
  function sync() {
    const active = originals.find(b => b.classList.contains('active'));
    const id = active?.dataset.tab;
    nav.querySelectorAll('[data-mobile-tab]').forEach(b => {
      if (b.dataset.mobileTab === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const secondary = !!active && !primary.includes(id);
    if (secondary) all.setAttribute('aria-current', 'page'); else all.removeAttribute('aria-current');
    current.hidden = !secondary;
    current.textContent = secondary ? label(active) : '';
    all.setAttribute('aria-label', secondary ? 'Todas as áreas. Atual: ' + label(active) : 'Todas as áreas');
  }
  document.addEventListener('mm-plano', e => {
    if (escolheu || !!e.detail?.gratis === gratis) return;
    gratis = !!e.detail?.gratis;
    primary = gratis ? GRATIS_PINS : DEFAULT_PINS;
    fillBar(); syncPins(); sync();
  });
  nav.append(bar, list, current);
  tabs.before(nav);
  document.body.classList.add('mobile-nav-ready');
  const observer = new MutationObserver(sync);
  originals.forEach(b => observer.observe(b, { attributes: true, attributeFilter: ['class'] }));
  nav.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); close(); all.focus(); }
  });
  document.addEventListener('click', e => { if (!nav.contains(e.target)) close(); });
  nav.addEventListener('focusout', e => { if (e.relatedTarget && !nav.contains(e.relatedTarget)) close(); });
  matchMedia('(min-width:901px)').addEventListener('change', e => { if (e.matches) close(); });
  sync();
})();
