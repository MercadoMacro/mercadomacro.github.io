/* Navegação móvel: as abas originais continuam responsáveis pelo conteúdo. */
(() => {
  const tabs = document.getElementById('tabs');
  if (!tabs || document.getElementById('mobile-navigation')) return;
  const originals = [...tabs.querySelectorAll('button[data-tab]')];
  const byId = new Map(originals.map(b => [b.dataset.tab, b]));
  const primary = ['market-panel', 'watch-panel', 'news-panel'];
  const groups = [
    ['Visão geral', ['market-panel', 'mesa-panel', 'watch-panel', 'heatmap-panel']],
    ['Informação', ['news-panel', 'weekly-panel', 'calendar-panel']],
    ['Análise', ['analysis-panel', 'fund-panel']],
    ['Ferramentas', ['indicators-panel', 'calculator-panel', 'options-panel']],
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
  all.innerHTML = '<i class="fas fa-th-large" aria-hidden="true"></i><span>Todas</span>';
  all.setAttribute('aria-expanded', 'false');
  all.setAttribute('aria-controls', 'mobile-navigation-list');
  const list = document.createElement('div');
  list.id = 'mobile-navigation-list'; list.className = 'mn-list'; list.hidden = true;
  function close() { list.hidden = true; all.setAttribute('aria-expanded', 'false'); }
  all.addEventListener('click', () => {
    list.hidden = !list.hidden;
    all.setAttribute('aria-expanded', String(!list.hidden));
  });
  for (const id of primary) { const b = button(id); if (b) bar.appendChild(b); }
  bar.appendChild(all);
  for (const [name, ids] of groups) {
    const heading = document.createElement('h3'); heading.textContent = name; list.appendChild(heading);
    for (const id of ids) { const b = button(id); if (b) list.appendChild(b); }
  }
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
