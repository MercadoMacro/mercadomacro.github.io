/* Watchlist em tabela (padrão) com painel do ativo ao lado (24/10/2026, modelo do Severino).
   Mesmos dados da watchlist da conta (evento mm-watchlist-table do extras.js).
   Clicar numa linha abre o painel: preço, situação do pregão, gráfico 1D/5D/1M/1A (/history do worker)
   e os dados do dia (abertura, máxima, mínima, fechamento anterior). No celular o painel sobe de baixo.
   "Ver análise completa" e "Gráfico completo" abrem o gráfico do TradingView com fundamentos (extras.js). */
(() => {
  const core = globalThis.MMWatchTable, grid = document.getElementById('grid-watch');
  const panel = document.getElementById('watch-panel'), section = document.getElementById('watch-section');
  if (!core || !grid || !panel || !section) return;
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const nice = (s) => s.replace(/\.SA$/, '');

  /* ---------------- estrutura: lista à esquerda, painel do ativo à direita ---------------- */
  const wrapOuter = section.parentElement;
  const lay = document.createElement('div'); lay.className = 'wn';
  const main = document.createElement('div'); main.className = 'wn-main';
  const side = document.createElement('aside'); side.className = 'wn-side'; side.hidden = true; side.setAttribute('aria-label', 'Detalhes do ativo');
  wrapOuter.append(lay); lay.append(main, side); main.append(section);
  const head = section.querySelector('.market-section-head');
  const titulo = document.createElement('div'); titulo.className = 'wn-title';
  titulo.innerHTML = '<h2>Minha watchlist</h2><span class="wn-sub"></span>';
  head?.before(titulo);
  const sub = titulo.querySelector('.wn-sub');

  const root = document.createElement('div'); root.className = 'wt';
  root.innerHTML = `<div class="wt-toolbar"><div class="wt-modes" role="group" aria-label="Visualização da watchlist">
    <button type="button" class="btn-sm" data-wt-mode="table">Tabela</button><button type="button" class="btn-sm" data-wt-mode="cards">Cards</button></div>
    </div>
    <div class="wt-table-wrap"><table aria-label="Minha watchlist"><thead><tr>
      <th scope="col" data-wt-col="symbol"><button type="button" data-wt-sort="symbol">Ativo</button></th>
      <th scope="col" data-wt-col="price"><button type="button" data-wt-sort="price" title="Ordenação numérica; moedas diferentes não são convertidas">Preço</button></th>
      <th scope="col" data-wt-col="change"><button type="button" data-wt-sort="change">Var. dia</button></th>
      <th scope="col"><span class="wt-sr">Ações</span></th>
    </tr></thead><tbody></tbody></table></div><div class="wt-status" role="status"></div>
    <p class="wn-auto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>Atualização automática a cada 5 min com a aba aberta</p>`;
  grid.before(root);
  const modes = root.querySelector('.wt-modes'), bar = document.querySelector('#watchlists-controls .wls-bar');
  if (bar) { bar.insertBefore(modes, bar.querySelector('#wl-form')); root.querySelector('.wt-toolbar').remove(); }

  const wrap = root.querySelector('.wt-table-wrap'), body = root.querySelector('tbody'), status = root.querySelector('.wt-status');
  let user = null, state = { rows: [], loading: false }, prefs = core.preferences(), sel = null, menuAberto = null, atualizadaEm = 0;
  const key = () => 'trader_watch_table_v1:' + user;
  function save() { if (!user || window.__mmLoggingOut) return; try { localStorage.setItem(key(), JSON.stringify({ ...prefs, sel })); } catch { /* sem armazenamento */ } }
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  function original(symbol) { return [...grid.querySelectorAll('.wl-card')].find(c => c.dataset.symbol === symbol); }
  const completo = (s) => original(s)?.click();
  const remover = (s) => original(s)?.querySelector('[data-wlrm]')?.click();
  const largo = () => matchMedia('(min-width: 1101px)').matches;

  /* ---------------- tempo real (mesmas fontes da aba Mercado) ---------------- */
  const fx = window.MMForexLive?.entrar ? window.MMForexLive.entrar('watchlist', { onChange: (e) => { if (e.type === 'quote') vivoMudou(e.symbol); }, ref: (s) => { const q = linha(s)?.quote; return q && core.number(q.value) ? { v: q.value, c: q.change } : null; } }) : null;
  let cr = null;
  try { cr = window.MMCryptoLive?.hostAllowed(location.hostname) ? new window.MMCryptoLive.Client({ enabled: true, onChange: (e) => { if (e?.type === 'quote') vivoMudou(e.symbol); } }) : null; } catch { cr = null; }
  const liveOn = () => typeof liveMode === 'undefined' || !!liveMode;
  function vivo(s) {
    if (!liveOn() || !panel.classList.contains('active')) return null;
    const q = fx?.covers(s) ? fx.quote(s) : null;
    if (q && q.source !== 'Yahoo' && core.number(q.value)) return { v: q.value, src: q.source === 'Deriv' ? 'Deriv' : 'Capital.com (CFD)' };
    const c = cr?.quote?.(s);
    if (c && core.number(c.value)) return { v: c.value, src: 'Binance (USDT)' };
    return null;
  }
  const linha = (s) => state.rows.find(r => r.symbol === s);
  // cotação mostrada: a ao vivo quando houver (variação sobre o fechamento anterior do Yahoo)
  function cot(r) {
    const q = r?.quote, l = vivo(r?.symbol || '');
    if (!l) return q;
    const base = core.number(q?.value) && core.number(q?.change) ? q.value / (1 + q.change / 100) : null;
    return { ...(q || {}), value: l.v, change: base ? (l.v / base - 1) * 100 : q?.change, src: l.src };
  }
  let vivoT = 0;
  function vivoMudou(s) { if (!linha(s)) return; clearTimeout(vivoT); vivoT = setTimeout(() => { render(); if (sel === s) pintaTopo(); }, 250); }
  function ligaVivo() {
    const on = panel.classList.contains('active') && !document.hidden && liveOn();
    fx?.setActive?.(on);
    try { cr?.setActive(on); } catch { /* sem conexão ao vivo */ }
  }
  new MutationObserver(() => { ligaVivo(); if (!panel.classList.contains('active')) { fecharMenu(); if (!largo() && !side.hidden) fecharPainel(); } }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', ligaVivo);

  /* ---------------- tabela ---------------- */
  function fecharMenu() { menuAberto?.remove(); menuAberto = null; }
  function abrirMenu(btn, s) {
    const ja = menuAberto?.dataset.s === s; fecharMenu(); if (ja) return;
    const m = document.createElement('div'); m.className = 'wn-menu'; m.dataset.s = s; m.setAttribute('role', 'menu');
    const item = (t, fn, cls) => { const b = text('button', t, cls); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.addEventListener('click', (e) => { e.stopPropagation(); fecharMenu(); fn(); }); m.append(b); };
    item('Ver no painel', () => selecionar(s));
    item('Gráfico completo', () => completo(s));
    item('Tirar da lista', () => remover(s), 'wn-menu-rm');
    btn.closest('td').append(m); menuAberto = m; m.querySelector('button').focus();
  }
  document.addEventListener('click', (e) => { if (menuAberto && !e.target.closest('.wn-menu, .wn-more')) fecharMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (menuAberto) fecharMenu(); else if (!side.hidden && !largo()) fecharPainel(); } });

  function render() {
    grid.hidden = prefs.mode === 'table'; wrap.hidden = prefs.mode !== 'table';
    root.querySelector('.wn-auto').hidden = !user || !state.rows.length;
    modes.querySelectorAll('[data-wt-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wtMode === prefs.mode)));
    for (const h of root.querySelectorAll('[data-wt-col]')) {
      const active = h.dataset.wtCol === prefs.sort;
      if (active) h.setAttribute('aria-sort', prefs.direction === 1 ? 'ascending' : 'descending'); else h.removeAttribute('aria-sort');
      h.querySelector('button').textContent = ({ symbol: 'Ativo', price: 'Preço', change: 'Var. dia' })[h.dataset.wtCol] + (active ? prefs.direction === 1 ? ' ↑' : ' ↓' : '');
    }
    const n = state.rows.length;
    sub.textContent = user ? `${n} ${n === 1 ? 'ativo' : 'ativos'}${atualizadaEm ? ` · Atualizada às ${new Date(atualizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}` : '';
    fecharMenu();
    body.replaceChildren();
    if (!user || window.__mmLoggingOut) { status.textContent = 'Aguardando a identificação da conta.'; return; }
    status.textContent = n ? state.loading ? 'Atualizando cotações…' : '' : 'Adicione ativos à sua watchlist no campo acima.';
    for (const r of core.sorted(state.rows, prefs)) {
      const q = cot(r), tr = document.createElement('tr'), name = document.createElement('td');
      tr.dataset.s = r.symbol; if (r.symbol === sel && !side.hidden) tr.classList.add('on');
      const open = text('button', nice(r.symbol), 'wt-symbol'); open.type = 'button';
      open.setAttribute('aria-label', 'Ver ' + nice(r.symbol) + ' no painel');
      if (q?.src) { open.classList.add('rt'); open.title = `Tempo real pela ${q.src}; variação sobre o fechamento anterior do Yahoo`; }
      if (r.name && r.name !== nice(r.symbol)) { const nm = text('span', r.name, 'wt-name'); if (!open.title) open.title = r.name; open.append(nm); }
      name.append(open);
      if (!r.fresh && r.quote) name.append(text('span', 'Salvo', 'wt-saved'));
      else if (!core.number(r.quote?.value)) name.append(text('span', state.loading ? 'Carregando' : 'Sem dados', 'wt-saved'));
      tr.append(name, text('td', core.price(q), 'wt-number'), text('td', core.change(q), 'wt-number ' + (core.number(q?.change) ? q.change > 0 ? 'wt-up' : q.change < 0 ? 'wt-down' : '' : '')));
      const actions = document.createElement('td'); actions.className = 'wn-act';
      const more = document.createElement('button'); more.type = 'button'; more.className = 'wn-more';
      more.setAttribute('aria-label', 'Mais ações para ' + nice(r.symbol)); more.setAttribute('aria-haspopup', 'menu');
      more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
      more.addEventListener('click', (e) => { e.stopPropagation(); abrirMenu(more, r.symbol); });
      actions.append(more); tr.append(actions);
      tr.addEventListener('click', (e) => { if (!e.target.closest('.wn-act')) selecionar(r.symbol); });
      body.append(tr);
    }
  }
  modes.querySelectorAll('[data-wt-mode]').forEach(b => b.addEventListener('click', () => { prefs.mode = b.dataset.wtMode; save(); render(); }));
  root.querySelectorAll('[data-wt-sort]').forEach(b => b.addEventListener('click', () => {
    const sort = b.dataset.wtSort; prefs.direction = prefs.sort === sort ? -prefs.direction : sort === 'symbol' ? 1 : -1;
    prefs.sort = sort; save(); render();
  }));

  /* ---------------- painel do ativo ---------------- */
  const FAIXAS = [['1d', '1D'], ['5d', '5D'], ['1mo', '1M'], ['1y', '1A']];
  let faixa = '1d';
  const G = {}; // `${faixa}|${símbolo}` -> { t, c, em }
  const fmt = (v, q) => core.price({ value: v, currency: q?.currency });
  function pregao(s) {
    // situação pelo relógio da bolsa, com os feriados da B3 e de Nova York (feriados.js)
    const feriado = (b, tz) => { try { return window.MMFeriados ? MMFeriados[b](MMFeriados.hojeEm(tz)) : null; } catch (e) { return null; } };
    const agora = (tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return { m: +p.hour * 60 + +p.minute, d: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) }; };
    if (/-USD$/.test(s)) return { on: true, t: 'Cripto · 24 horas' };
    if (/=X$/.test(s)) { const { m, d } = agora('America/New_York'); const on = !(d === 6 || (d === 0 && m < 1020) || (d === 5 && m >= 1020)); return { on, t: on ? 'Câmbio aberto' : 'Câmbio fechado' }; }
    if (/\.SA$/.test(s) || s === '^BVSP') {
      const ny = new Date(), h = (tz) => +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(ny);
      const fecha = ((h('UTC') - h('America/New_York') + 24) % 24) === 4 ? 1020 : 1080;
      const { m, d } = agora('America/Sao_Paulo'), fer = feriado('b3', 'America/Sao_Paulo'), abre = fer?.abre ? 780 : 600;
      const on = d >= 1 && d <= 5 && !(fer && !fer.abre) && m >= abre && m < fecha;
      return { on, t: on ? 'B3 aberta' : d >= 1 && d <= 5 && fer && !fer.abre ? `B3 fechada · feriado (${fer.nome})` : 'B3 fechada' };
    }
    if (/^[A-Z.-]+$/.test(s) || ['^GSPC', '^IXIC', '^DJI', '^NDX', '^RUT'].includes(s)) {
      const { m, d } = agora('America/New_York'), fer = feriado('nyse', 'America/New_York'), on = d >= 1 && d <= 5 && !fer && m >= 570 && m < 960;
      return { on, t: on ? 'NYSE aberta' : d >= 1 && d <= 5 && fer ? `NYSE fechada · feriado (${fer.nome})` : 'NYSE fechada' };
    }
    return null;
  }
  side.innerHTML = `<div class="wn-sheet-grab" aria-hidden="true"></div>
    <header class="wn-side-head"><div><h3 class="wn-sym"></h3><p class="wn-nome"></p></div><button type="button" class="wn-x" aria-label="Fechar painel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
    <div class="wn-preco"><b></b><span></span></div>
    <p class="wn-pregao"><i></i><span></span></p>
    <div class="wn-graf"></div>
    <div class="wn-faixas" role="group" aria-label="Período do gráfico">${FAIXAS.map(([k, t]) => `<button type="button" data-f="${k}">${t}</button>`).join('')}</div>
    <h4>Detalhes do ativo</h4>
    <dl class="wn-dl"></dl>
    <div class="wn-cx" hidden></div>
    <button type="button" class="wn-full">Ver análise completa <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
  const fundo = document.createElement('div'); fundo.className = 'wn-fundo'; fundo.hidden = true; document.body.append(fundo);
  function fecharPainel() { side.hidden = true; fundo.hidden = true; lay.classList.remove('wn-com-painel'); document.body.classList.remove('wn-sheet-on'); sel = largo() ? sel : null; render(); }
  side.querySelector('.wn-x').addEventListener('click', () => { sel = null; save(); fecharPainel(); });
  fundo.addEventListener('click', () => { sel = null; fecharPainel(); });
  side.querySelector('.wn-full').addEventListener('click', () => { if (sel) completo(sel); });
  side.querySelector('.wn-faixas').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; faixa = b.dataset.f; pintaGrafico(); carrega(); });

  function selecionar(s) {
    sel = s; save();
    side.hidden = false; lay.classList.add('wn-com-painel');
    // no celular o painel vira folha: sai de dentro da aba (que tem animação e prenderia o position:fixed)
    if (!largo()) { if (side.parentElement !== document.body) document.body.append(side); fundo.hidden = false; document.body.classList.add('wn-sheet-on'); }
    else if (side.parentElement !== lay) lay.append(side);
    render(); pintaTopo(); pintaGrafico(); carrega();
  }
  function pintaTopo() {
    const r = linha(sel); if (!r) return;
    const q = cot(r), d = r.quote?.dia || {};
    side.querySelector('.wn-sym').textContent = nice(r.symbol);
    side.querySelector('.wn-nome').textContent = r.name && r.name !== nice(r.symbol) ? r.name : '';
    side.querySelector('.wn-preco b').textContent = core.price(q);
    const ch = side.querySelector('.wn-preco span'); ch.textContent = core.change(q);
    ch.className = core.number(q?.change) ? q.change > 0 ? 'wt-up' : q.change < 0 ? 'wt-down' : '' : '';
    const pg = pregao(r.symbol), pe = side.querySelector('.wn-pregao');
    pe.hidden = !pg && !q?.src;
    pe.classList.toggle('on', !!pg?.on);
    pe.querySelector('span').textContent = [pg?.t, q?.src ? `tempo real pela ${q.src}` : ''].filter(Boolean).join(' · ');
    const linhas = [['Abertura', d.abertura], ['Máxima', d.max], ['Mínima', d.min], ['Fechamento anterior', d.ant]];
    side.querySelector(':scope > .wn-dl').innerHTML = linhas.map(([k]) => `<div><dt>${k}</dt><dd></dd></div>`).join('');
    side.querySelectorAll(':scope > .wn-dl dd').forEach((dd, i) => { const v = linhas[i][1]; dd.textContent = core.number(v) ? fmt(v, r.quote) : '—'; });
    pintaComex(r.symbol);
  }
  // exportação da commodity ligada à empresa (Comex Stat, pelo comex.js da aba Indicadores)
  const COMMODITY = { VALE3: 'minerio', CMIN3: 'minerio', VALE: 'minerio', PETR3: 'petroleo', PETR4: 'petroleo', PRIO3: 'petroleo', BRAV3: 'petroleo', RECV3: 'petroleo', PBR: 'petroleo', SUZB3: 'celulose', KLBN11: 'celulose', KLBN4: 'celulose', JBSS3: 'bovina', JBS: 'bovina', MRFG3: 'bovina', MBRF3: 'bovina', BEEF3: 'bovina', BRFS3: 'frango', SLCE3: 'soja', AGRO3: 'soja', CSAN3: 'acucar', RAIZ4: 'acucar', JALL3: 'acucar', SMTO3: 'acucar' };
  let comexPedido = false;
  function pintaComex(s) {
    const box = side.querySelector('.wn-cx'), k = COMMODITY[String(s).replace(/\.SA$/, '')];
    if (!k) { box.hidden = true; return; }
    if (!window.MMComex) {
      box.hidden = true;
      if (!comexPedido) { comexPedido = true; const sc = document.createElement('script'); sc.src = 'comex.js?v=6'; sc.onload = () => pintaComex(sel); document.head.append(sc); }
      return;
    }
    const r = window.MMComex.resumo(k);
    if (!r) { box.hidden = true; if (!window.MMComex.pronto()) window.MMComex.carregar().then(() => { if (sel === s) pintaComex(s); }); return; }
    const n = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    const pc = (v) => (core.number(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${n(Math.abs(v), 1)}%` : '—');
    const c = (v) => (core.number(v) ? v > 0 ? 'wt-up' : v < 0 ? 'wt-down' : '' : '');
    const [a, m] = r.m.split('-'), mes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + a;
    const vol = !core.number(r.kg) ? '—' : r.kg >= 1e9 ? `${n(r.kg / 1e9, 1)} mi t` : `${n(Math.round(r.kg / 1e6), 0)} mil t`;
    box.hidden = false;
    box.innerHTML = `<h4>Exportação de ${r.nome.toLowerCase()} do Brasil</h4>
      <dl class="wn-dl">
        <div><dt>Valor em ${mes}</dt><dd>${core.number(r.fob) ? 'US$ ' + n(r.fob / 1e9, 2) + ' bi' : '—'} <small class="${c(r.vFob)}">${pc(r.vFob)}</small></dd></div>
        <div><dt>Volume em ${mes}</dt><dd>${vol} <small class="${c(r.vKg)}">${pc(r.vKg)}</small></dd></div>
        <div><dt>No ano</dt><dd>${core.number(r.ytd) ? 'US$ ' + n(r.ytd / 1e9, 1) + ' bi' : '—'} <small class="${c(r.vYtd)}">${pc(r.vYtd)}</small></dd></div>
      </dl>
      <p class="wn-cx-nota">Variações contra o mesmo período do ano passado. Fonte: Comex Stat (MDIC).</p>`;
  }
  async function carrega() {
    const s = sel, f = faixa, k = `${f}|${s}`;
    if (!s || (G[k] && Date.now() - G[k].em < (f === '1d' ? 120000 : 900000))) return;
    try {
      const r = await fetchT(`${PROXY}/history?symbols=${encodeURIComponent(s)}${f === '3mo' ? '' : '&r=' + f}`, {}, 20000);
      const j = r.ok ? await r.json() : null, v = j?.[s];
      if (v && Array.isArray(v.c) && v.c.length > 1) G[k] = { t: v.t, c: v.c, em: Date.now() };
      else G[k] = G[k] || { erro: true, em: Date.now() };
    } catch { G[k] = G[k] || { erro: true, em: Date.now() }; }
    if (sel === s && faixa === f) pintaGrafico();
  }
  const W = 400, H = 150;
  function pintaGrafico() {
    side.querySelectorAll('.wn-faixas button').forEach(b => { const on = b.dataset.f === faixa; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const box = side.querySelector('.wn-graf'), g = G[`${faixa}|${sel}`], r = linha(sel);
    if (!g || g.erro || !g.c) { box.innerHTML = `<div class="wn-graf-vazio">${g?.erro ? 'Gráfico indisponível agora' : 'Carregando gráfico…'}</div>`; return; }
    const q = r?.quote, ag = cot(r);
    const vals = faixa === '1d' && ag?.src && core.number(ag.value) ? [...g.c.slice(0, -1), ag.value] : g.c;
    const base = faixa === '1d' && core.number(q?.dia?.ant) ? q.dia.ant : vals[0];
    const lo = Math.min(...vals, base), hi = Math.max(...vals, base), span = hi - lo || 1;
    const x = (i) => (i / (vals.length - 1)) * W, y = (v) => 8 + (1 - (v - lo) / span) * (H - 16);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const sobe = vals[vals.length - 1] >= base;
    box.innerHTML = `<svg class="wn-svg ${sobe ? 'up' : 'dn'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="wn-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".3"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      ${faixa === '1d' ? `<line x1="0" x2="${W}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" class="wn-base"/>` : ''}
      <path d="M${pts.join('L')}L${W},${H}L0,${H}Z" fill="url(#wn-gr)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg><div class="wn-tip" hidden></div>`;
    box._g = { t: g.t, c: vals };
  }
  side.querySelector('.wn-graf').addEventListener('pointermove', (e) => {
    const box = e.currentTarget, g = box._g, tip = box.querySelector('.wn-tip'); if (!g || !tip) return;
    const rc = box.getBoundingClientRect(), k = Math.max(0, Math.min(g.c.length - 1, Math.round(((e.clientX - rc.left) / rc.width) * (g.c.length - 1))));
    const d = new Date(g.t[Math.min(k, g.t.length - 1)] * 1000), r = linha(sel);
    const quando = faixa === '1d' || faixa === '5d' ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' });
    tip.hidden = false; tip.textContent = `${fmt(g.c[k], r?.quote)} · ${quando}`;
    tip.style.left = `${Math.min(rc.width - 150, Math.max(0, e.clientX - rc.left - 75))}px`;
  });
  side.querySelector('.wn-graf').addEventListener('pointerleave', (e) => e.currentTarget.querySelector('.wn-tip')?.setAttribute('hidden', ''));

  /* ---------------- dados ---------------- */
  window.addEventListener('mm-watchlist-table', e => {
    if (user !== e.detail.user) {
      user = e.detail.user; prefs = core.preferences(); sel = null;
      side.hidden = true; fundo.hidden = true; lay.classList.remove('wn-com-painel'); document.body.classList.remove('wn-sheet-on');
      if (user) { try { const p = JSON.parse(localStorage.getItem(key()) || 'null'); prefs = core.preferences(p); sel = typeof p?.sel === 'string' ? p.sel : null; } catch { /* preferências padrão */ } }
    }
    const antes = state.loading; state = e.detail;
    if (antes && !state.loading && state.rows.some(r => r.fresh)) atualizadaEm = Date.now();
    if (sel && !linha(sel)) { sel = null; side.hidden = true; fundo.hidden = true; lay.classList.remove('wn-com-painel'); document.body.classList.remove('wn-sheet-on'); }
    // no computador o painel já abre com o ativo escolhido antes (ou o primeiro da lista)
    if (largo() && user && state.rows.length && side.hidden) { sel = sel || core.sorted(state.rows, prefs)[0].symbol; selecionar(sel); return; }
    render(); if (!side.hidden) pintaTopo();
  });
  matchMedia('(min-width: 1101px)').addEventListener('change', (m) => {
    if (m.matches) { fundo.hidden = true; document.body.classList.remove('wn-sheet-on'); if (side.hidden && state.rows.length) selecionar(sel || core.sorted(state.rows, prefs)[0].symbol); }
    else if (!side.hidden) { side.hidden = true; lay.classList.remove('wn-com-painel'); render(); }
  });
  document.addEventListener('click', e => { if (e.target.closest?.('[data-act="sair"]')) { user = null; state = { rows: [] }; sel = null; side.hidden = true; fundo.hidden = true; render(); } });
  render(); ligaVivo();
  window.dispatchEvent(new Event('mm-watchlist-table-request'));
})();
