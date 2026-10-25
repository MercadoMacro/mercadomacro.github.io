/* Aba Notícias no modelo que o Severino mandou (15/10/2026):
   uma barra só em toda a largura (modo, busca, atualização, avisos, briefing, atualizar), fontes na lateral
   com iniciais, contagem e o grupo Local aberto, tema "Favoritas", manchete na 2ª posição e cartões em até 4 colunas.
   Tudo por cima do app.js (mesmos ids e funções); para voltar, basta tirar este arquivo e o bloco de CSS. */
(() => {
  const $ = (s) => document.querySelector(s);
  const painel = $('#news-panel'), barra = painel?.querySelector('.news-toolbar');
  if (!painel || !barra) return;
  document.body.classList.add('nw2');

  // 1) barra única: info, avisos, briefing e atualizar vêm para a barra das notícias
  const info = $('#news-info'), avisos = $('#news-alert-btn'), brief = $('#briefing-btn'), atual = $('#news-refresh-btn');
  const layout = painel.querySelector('.news-layout');
  if (layout) layout.before(barra);
  if (info) barra.insertBefore(info, avisos);
  if (brief) { brief.insertAdjacentHTML('beforeend', '<span class="nw2-n" id="nw2-picks" hidden></span>'); barra.append(brief); }
  if (atual) {
    [...atual.childNodes].forEach((n) => { if (n.nodeType === 3) n.remove(); });
    atual.title = 'Atualizar todas as notícias';
    atual.setAttribute('aria-label', 'Atualizar todas as notícias');
    barra.append(atual);
  }
  const modoBtn = $('#nm-toggle [data-mode="news"]');
  modoBtn?.insertAdjacentHTML('beforeend', '<span class="nw2-n" id="nw2-total"></span>');

  // 2) temas: nomes do modelo e o filtro "Favoritas" (as notícias marcadas com a estrela)
  const ren = { all: 'Todos os temas', juros: 'Juros & Fed' };
  NEWS_ASSETS.forEach((a) => { if (ren[a[0]]) a[1] = ren[a[0]]; });
  if (!NEWS_ASSETS.some((a) => a[0] === 'fav')) NEWS_ASSETS.splice(1, 0, ['fav', 'Favoritas', null]);
  const filtroOrig = filterNewsByAsset;
  filterNewsByAsset = (list) => {
    if (newsAsset !== 'fav') return filtroOrig(list);
    const ids = new Set(getNewsPicks().map((p) => p.id));
    return list.filter((n) => ids.has(n.id));
  };
  const rotulaFav = () => {
    const n = getNewsPicks().length;
    const b = $('#news-assets [data-v="fav"]');
    if (b) b.innerHTML = `<span class="np-star">★</span> Favoritas (${n})`;
    const p = $('#nw2-picks');
    if (p) { p.textContent = `★ ${n}`; p.hidden = false; }
  };
  const picksOrig = renderPicksBar;
  renderPicksBar = () => { picksOrig(); rotulaFav(); };
  const temasOrig = renderNewsAssets;
  renderNewsAssets = () => { temasOrig(); rotulaFav(); };
  renderNewsAssets();
  renderPicksBar();

  // 3) lateral: título com o total, "Todas as fontes", contagem por fonte e o grupo Local aberto
  const fechaOrig = closeNewsCategories;
  closeNewsCategories = () => { if (!window.matchMedia('(min-width: 901px)').matches) fechaOrig(); };
  let abriu = false;
  function lateral() {
    const sb = $('#source-sidebar');
    if (!sb || !Array.isArray(newsAll)) return;
    const cont = {};
    newsAll.forEach((n) => { cont[n.fonte] = (cont[n.fonte] || 0) + 1; });
    if (!sb.querySelector('.nw2-head')) sb.insertAdjacentHTML('afterbegin', '<div class="nw2-head"><span>Fontes de notícias</span><b id="nw2-fontes"></b></div>');
    const t = $('#nw2-fontes'); if (t) t.textContent = newsAll.length || '';
    const todas = $('#ns-all-btn'); if (todas && todas.textContent !== 'Todas as fontes') todas.textContent = 'Todas as fontes';
    sb.querySelectorAll('.ns-sub-bubble').forEach((b) => {
      let c = b.querySelector('.nw2-c');
      if (!c) { c = document.createElement('span'); c.className = 'nw2-c'; b.append(c); }
      const v = cont[b.dataset.source] || 0;
      if (c.textContent !== String(v)) c.textContent = v;
      b.classList.toggle('nw2-vazio', !v);
      const dot = b.querySelector('.ns-dot');
      if (dot && !dot.style.getPropertyValue('--c')) dot.style.setProperty('--c', dot.style.backgroundColor || '#64748b');
    });
    if (!abriu && window.matchMedia('(min-width: 901px)').matches) { abriu = true; newsOpenCategory = 'br'; updateNewsCategoryUI(); }
    const tot = $('#nw2-total'); if (tot) tot.textContent = newsAll.length || '';
    const busca = $('#news-search');
    if (busca && newsAll.length) busca.placeholder = `Buscar nas ${newsAll.length} notícias (ex.: BCE, Selic, Fed, Petrobras)`;
  }
  // horário da última busca, curto, para caber na barra
  const encurta = () => {
    if (!info) return;
    const m = info.textContent.match(/(\d{2}:\d{2})(:\d{2})?/);
    const curto = m ? `Última atualiz.: ${m[1]}${m[2] || ''}` : null;
    const alvo = info.querySelector('.nw2-hora');
    if (curto && (!alvo || alvo.textContent !== curto)) {
      info.title = info.textContent.trim();
      info.innerHTML = `<span class="dot"></span><span class="nw2-hora">${curto}</span>`;
    }
  };
  if (info) new MutationObserver(encurta).observe(info, { childList: true, characterData: true, subtree: true });
  encurta();

  // a lateral é refeita quando a Política liga/desliga; as notícias chegam e mudam o tempo todo
  let fila = false;
  const agenda = () => { if (!fila) { fila = true; requestAnimationFrame(() => { fila = false; lateral(); }); } };
  new MutationObserver(agenda).observe($('#source-sidebar'), { childList: true });
  new MutationObserver(agenda).observe($('#news-view'), { childList: true });

  // manchete principal na 2ª posição, como no modelo, com "Ler notícia completa"
  function manchete() {
    const g = $('#news-view .nc-grid'), lead = g?.querySelector('.nc-lead');
    if (!lead) return;
    const r = lead.querySelector('.nc-readhere');
    if (r && !r.dataset.nw2) { r.dataset.nw2 = '1'; r.innerHTML = 'Ler notícia completa <i class="fas fa-arrow-right"></i>'; }
    const alvo = g.children[1];
    if (alvo && alvo !== lead && window.matchMedia('(min-width: 1100px)').matches) g.insertBefore(lead, alvo);
  }
  new MutationObserver(manchete).observe($('#news-view'), { childList: true });
  manchete();
  lateral();

  // Controles compactos, preservando os botões e seus eventos existentes.
  const actions = document.createElement('details');
  actions.className = 'nw-actions';
  actions.innerHTML = '<summary>Ações <i class="fas fa-chevron-down" aria-hidden="true"></i></summary><div class="nw-actions-body"></div>';
  barra.append(actions);
  if (brief) actions.lastElementChild.append(brief);
  if (avisos) actions.lastElementChild.append(avisos);
  actions.addEventListener('keydown', e => { if (e.key === 'Escape') { actions.open = false; actions.firstElementChild.focus(); } });
  document.addEventListener('click', e => { if (!actions.contains(e.target)) actions.open = false; });
  const subbar = document.createElement('div');
  subbar.className = 'nw-subbar';
  subbar.innerHTML = '<button type="button" class="btn-sm" id="nw-sources-toggle" aria-expanded="true" aria-controls="source-sidebar">Fontes</button><label>Ordenar <select id="nw-order"><option value="relevant">Mais relevantes</option><option value="recent">Mais recentes</option></select></label>';
  barra.after(subbar);
  if (info) subbar.append(info);
  const sourceButton = subbar.querySelector('button');
  const sidebar = $('#source-sidebar');
  let sourcesOpen = window.matchMedia('(min-width: 901px)').matches;
  function sourceState() {
    sidebar.hidden = !sourcesOpen;
    layout.classList.toggle('nw-sources-closed', !sourcesOpen);
    sourceButton.setAttribute('aria-expanded', String(sourcesOpen));
    const names = [...newsActiveSources].map(k => NEWS_SOURCES[k]?.name || k);
    sourceButton.textContent = 'Fontes: ' + (!names.length ? 'todas' : names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`);
    sourceButton.title = names.length ? names.join(', ') : 'Todas as fontes';
  }
  sourceButton.addEventListener('click', () => { sourcesOpen = !sourcesOpen; sourceState(); });
  const originalSourceStates = updateNewsBubbleStates;
  updateNewsBubbleStates = () => { originalSourceStates(); sourceState(); };
  // ordem escolhida fica salva neste navegador
  const ordem = subbar.querySelector('select');
  try { const o = localStorage.getItem('news_order_v1'); if (o === 'recent' || o === 'relevant') { newsOrder = o; ordem.value = o; if (o === 'recent') renderNewsView(); } } catch (e) {}
  ordem.addEventListener('change', e => { newsOrder = e.target.value; try { localStorage.setItem('news_order_v1', newsOrder); } catch (er) {} renderNewsView(); });
  const originalMode = setNewsMode;
  setNewsMode = mode => { originalMode(mode); subbar.querySelector('label').hidden = mode === 'live'; };
  sourceState();
})();
