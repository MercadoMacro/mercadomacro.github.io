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
    <button type="button" class="btn-sm" data-wt-mode="table">Tabela</button><button type="button" class="btn-sm" data-wt-mode="cards">Cards</button><button type="button" class="btn-sm wt-grp-bt" data-wt-grupos hidden title="Agrupar por tema ou ver em lista simples">Temas</button></div>
    </div>
    <div class="wt-table-wrap"><table aria-label="Minha watchlist"><thead><tr>
      <th scope="col" data-wt-col="symbol"><button type="button" data-wt-sort="symbol">Ativo</button></th>
      <th scope="col" data-wt-col="price"><button type="button" data-wt-sort="price" title="Ordenação numérica; moedas diferentes não são convertidas">Preço</button></th>
      <th scope="col" data-wt-col="change"><button type="button" data-wt-sort="change">Var. dia</button></th>
      <th scope="col" class="wt-c-x">Var. dia (valor)</th>
      <th scope="col" class="wt-c-sp">Tendência (5D)</th>
      <th scope="col" class="wt-c-vol" title="Volume de hoje e quantas vezes ele é a média diária dos últimos 3 meses">Volume (x média)</th>
      <th scope="col" class="wt-c-52">Faixa 52 semanas</th>
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
  // nomes dos fornecedores ao vivo ficam em Ajustes > Sobre (04/11/2026)
  const rotuloVivo = (src) => (src === 'calculado' || src === 'CFD' || src === 'ao vivo' ? 'Tempo real' : `Tempo real pela ${src}`);
  function vivo(s) {
    if (!liveOn() || !panel.classList.contains('active')) return null;
    const q = fx?.covers(s) ? fx.quote(s) : null;
    if (q && q.source !== 'Yahoo' && core.number(q.value)) return { v: q.value, src: q.source === 'Deriv' ? 'ao vivo' : q.source === 'Calculado' ? 'calculado' : 'CFD' };
    const c = cr?.quote?.(s);
    if (c && core.number(c.value)) return { v: c.value, src: 'Binance (USDT)' };
    return null;
  }
  const linha = (s) => state.rows.find(r => r.symbol === s);
  // cotação mostrada: a ao vivo quando houver (variação sobre o fechamento anterior do Yahoo)
  function cot(r) {
    const q = r?.quote, l = vivo(r?.symbol || '');
    if (!l) return q;
    // ações e ETFs americanos com a bolsa fechada: o preço e a variação ficam os oficiais do pregão; o preço em tempo real
    // aparece à parte (pré-mercado, after-hours ou fora do pregão), com a variação sobre o último fechamento (10/11/2026)
    const pg = /^[A-Z][A-Z.-]{0,9}$/.test(r.symbol) ? pregao(r.symbol) : null;
    if (pg && !pg.on && core.number(q?.value) && q.value > 0) return { ...q, ext: { v: l.v, c: (l.v / q.value - 1) * 100, rot: sessaoEstendida() } };
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
      h.querySelector('button').textContent = ({ symbol: 'Ativo', price: 'Último', change: 'Var. dia (%)' })[h.dataset.wtCol] + (active ? prefs.direction === 1 ? ' ↑' : ' ↓' : '');
    }
    const n = state.rows.length;
    sub.textContent = user ? `${n} ${n === 1 ? 'ativo' : 'ativos'}${atualizadaEm ? ` · Atualizada às ${new Date(atualizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}` : '';
    fecharMenu();
    body.replaceChildren();
    if (!user || window.__mmLoggingOut) { status.textContent = 'Aguardando a identificação da conta.'; return; }
    status.textContent = n ? state.loading ? 'Atualizando cotações…' : '' : 'Adicione ativos à sua watchlist no campo acima.';
    const temGrupos = state.rows.some(r => r.grupo), agrupar = temGrupos && prefs.grupos && prefs.mode === 'table';
    const bg = modes.querySelector('[data-wt-grupos]');
    if (bg) { bg.hidden = !temGrupos; bg.setAttribute('aria-pressed', String(agrupar)); bg.textContent = agrupar ? 'Temas' : 'Lista'; }
    // título da coluna de variação em dinheiro conforme a moeda dos ativos da lista
    const moedas = new Set(state.rows.map(r => r.quote?.currency).filter(Boolean)), thx = root.querySelector('th.wt-c-x');
    if (thx) thx.textContent = moedas.size === 1 ? `Var. dia (${{ BRL: 'R$', USD: 'US$', EUR: '€' }[[...moedas][0]] || [...moedas][0]})` : 'Var. dia (valor)';
    const ordem = core.sorted(state.rows, prefs), blocos = [];
    if (agrupar) { for (const r of ordem) { let b = blocos.find(x => x.g === (r.grupo || 'Outros')); if (!b) blocos.push(b = { g: r.grupo || 'Outros', rows: [] }); b.rows.push(r); } blocos.sort((a, b) => primeiro(a.g) - primeiro(b.g)); }
    else blocos.push({ g: '', rows: ordem });
    const vistos = {};
    for (const b of blocos) {
    if (b.g) {
      const fechado = prefs.fechados.includes(b.g), trg = document.createElement('tr'); trg.className = 'wt-grupo' + (fechado ? ' fechado' : '');
      const td = document.createElement('td'); td.colSpan = 8;
      const bt = document.createElement('button'); bt.type = 'button'; bt.setAttribute('aria-expanded', String(!fechado));
      bt.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
      bt.append(text('span', b.g), text('small', String(b.rows.length)));
      bt.addEventListener('click', () => { prefs.fechados = fechado ? prefs.fechados.filter(x => x !== b.g) : [...prefs.fechados, b.g]; save(); render(); });
      td.append(bt); trg.append(td); body.append(trg);
      if (fechado) continue;
    }
    for (const r of b.rows) {
      const q = cot(r), tr = document.createElement('tr'), name = document.createElement('td');
      tr.dataset.s = r.symbol; if (r.symbol === sel && !side.hidden) tr.classList.add('on');
      const open = text('button', nice(r.symbol), 'wt-symbol'); open.type = 'button';
      open.setAttribute('aria-label', 'Ver ' + nice(r.symbol) + ' no painel');
      if (q?.src || q?.ext) open.classList.add('rt');
      if (r.name && r.name !== nice(r.symbol)) { const nm = text('span', r.name, 'wt-name'); if (!open.title) open.title = r.name; open.append(nm); }
      name.append(open);
      if (!r.fresh && r.quote) name.append(text('span', 'Salvo', 'wt-saved'));
      else if (!core.number(r.quote?.value)) name.append(text('span', state.loading ? 'Carregando' : 'Sem dados', 'wt-saved'));
      const tdP = text('td', core.price(q), 'wt-number wt-preco');
      if (q?.ext) { const e = text('small', `${q.ext.rot} ${fmt(q.ext.v, q)} · ${core.change({ change: q.ext.c })}`, 'wt-ext ' + (q.ext.c > 0 ? 'wt-up' : q.ext.c < 0 ? 'wt-down' : '')); e.title = `${q.ext.rot}: preço em tempo real fora do pregão; a variação é sobre o último fechamento`; tdP.append(e); }
      // pisca quando o preço muda (atualização ao vivo ou nova consulta)
      const ant = mostrado[r.symbol], agora = core.number(q?.ext?.v) ? q.ext.v : q?.value;
      if (core.number(ant) && core.number(agora) && ant !== agora) tdP.classList.add(agora > ant ? 'wt-tick-up' : 'wt-tick-dn');
      vistos[r.symbol] = agora;
      const tdC = document.createElement('td'); tdC.className = 'wt-number';
      if (core.number(q?.change)) tdC.append(text('span', core.change(q), 'wt-badge ' + (q.change > 0 ? 'up' : q.change < 0 ? 'dn' : '')));
      else tdC.textContent = '—';
      const dx = core.number(q?.change) && core.number(q?.value) ? q.value - q.value / (1 + q.change / 100) : null;
      const tdX = text('td', core.number(dx) ? `${dx > 0 ? '+' : dx < 0 ? '−' : ''}${Math.abs(dx).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', 'wt-number wt-c-x ' + (dx > 0 ? 'wt-up' : dx < 0 ? 'wt-down' : ''));
      const tdS = document.createElement('td'); tdS.className = 'wt-c-sp'; tdS.innerHTML = spark(r.symbol);
      const tdV = text('td', volume(r), 'wt-number wt-c-vol');
      const tdF = document.createElement('td'); tdF.className = 'wt-c-52'; faixa52(tdF, r, q);
      tr.append(name, tdP, tdC, tdX, tdS, tdV, tdF);
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
    mostrado = vistos;
    pedeExtras();
  }
  // ordem dos grupos: a da lista
  function primeiro(g) { const i = state.rows.findIndex(r => (r.grupo || 'Outros') === g); return i < 0 ? 999 : i; }
  let mostrado = {};

  /* ---------------- colunas extras: tendência de 5 dias, volume relativo e faixa de 52 semanas ---------------- */
  const S5 = {}, VM = {}, F52 = {}; // F52: mínima/máxima de 52 semanas pelos fechamentos de 1 ano, quando o Yahoo manda zero (ações da B3)
  const lo52 = (r) => r.quote?.min52 ?? F52[r.symbol]?.lo ?? null, hi52 = (r) => r.quote?.max52 ?? F52[r.symbol]?.hi ?? null;
  // símbolo -> { c, em } (5 dias, de 30 em 30 min) | { media, em } (volume médio diário de 3 meses)
  let extrasPedindo = false;
  async function pedeExtras() {
    if (extrasPedindo || !user || prefs.mode !== 'table' || !panel.classList.contains('active')) return;
    const syms = state.rows.map(r => r.symbol).filter(s => !/^[@]/.test(s));
    const falta5 = syms.filter(s => !S5[s] || Date.now() - S5[s].em > 15 * 60000), faltaV = syms.filter(s => !VM[s] || Date.now() - VM[s].em > 6 * 3600000);
    const falta52 = state.rows.filter(r => r.quote && (!core.number(r.quote.min52) || !core.number(r.quote.max52)) && (!F52[r.symbol] || Date.now() - F52[r.symbol].em > 6 * 3600000)).map(r => r.symbol);
    if (!falta5.length && !faltaV.length && !falta52.length) return;
    extrasPedindo = true; // falhas também ficam guardadas (com valor vazio), então não há repetição em sequência
    const lote = async (lista, extra, fn) => { for (let i = 0; i < lista.length; i += 45) {
      const part = lista.slice(i, i + 45);
      try { const r = await fetchT(`${PROXY}/history?symbols=${encodeURIComponent(part.join(','))}${extra}`, {}, 25000); const j = r.ok ? await r.json() : {}; for (const s of part) fn(s, j?.[s]); }
      catch { for (const s of part) fn(s, null); }
    } };
    await Promise.all([
      lote(falta5, '&r=5d', (s, v) => { S5[s] = { c: Array.isArray(v?.c) && v.c.length > 1 ? v.c : null, em: Date.now() }; }),
      lote(falta52, '&r=1y', (s, v) => { const c = Array.isArray(v?.c) ? v.c.filter(x => core.number(x) && x > 0) : []; F52[s] = { lo: c.length > 100 ? Math.min(...c) : null, hi: c.length > 100 ? Math.max(...c) : null, em: Date.now() }; }),
      lote(faltaV, '&vol=1', (s, v) => {
        // média dos dias completos (o último pode ser o pregão de hoje, ainda pela metade)
        const vs = Array.isArray(v?.v) ? v.v.slice(0, -1).filter(x => core.number(x) && x > 0) : [];
        VM[s] = { media: vs.length >= 20 ? vs.reduce((a, b) => a + b, 0) / vs.length : null, em: Date.now() };
      }),
    ]);
    extrasPedindo = false;
    render(); if (!side.hidden) pintaTopo();
  }
  function spark(s) {
    const c = S5[s]?.c; if (!c) return '<span class="wt-vazio">—</span>';
    const lo = Math.min(...c), hi = Math.max(...c), sp = hi - lo || 1, w = 96, h = 26;
    const pts = c.map((v, i) => `${(i / (c.length - 1) * w).toFixed(1)},${(2 + (1 - (v - lo) / sp) * (h - 4)).toFixed(1)}`).join(' ');
    const sobe = c[c.length - 1] >= c[0];
    return `<svg class="wt-spark ${sobe ? 'up' : 'dn'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Tendência de 5 dias: ${sobe ? 'alta' : 'queda'}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  const abrev = (v) => !core.number(v) ? '—' : v >= 1e9 ? (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi' : v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : v >= 1e3 ? (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : v.toLocaleString('pt-BR');
  function volume(r) {
    const v = r.quote?.vol, m = VM[r.symbol]?.media;
    if (!core.number(v) || v <= 0) return '—';
    return core.number(m) && m > 0 ? `${abrev(v)} (${(v / m).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x)` : abrev(v);
  }
  function faixa52(td, r, q) {
    const lo = lo52(r), hi = hi52(r), v = q?.value;
    if (!core.number(lo) || !core.number(hi) || hi <= lo || !core.number(v)) { td.textContent = '—'; return; }
    const p = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    td.innerHTML = `<span class="wt-52" role="img" aria-label="Preço a ${Math.round(p * 100)}% entre a mínima e a máxima de 52 semanas"><i style="left:${(p * 100).toFixed(1)}%"></i></span>`;
    td.title = `Mínima de 52 semanas: ${fmt(lo, r.quote)} · Máxima: ${fmt(hi, r.quote)}`;
  }

  /* ---------------- exportar: copiar os códigos ou baixar CSV (menu ⋯ das listas) ---------------- */
  window.addEventListener('mm-watchlist-exportar', async (e) => {
    const rows = core.sorted(state.rows, prefs); if (!rows.length) return;
    const avisa = (m, t) => { try { typeof showToast === 'function' ? showToast(m, t) : alert(m); } catch { /* sem aviso */ } };
    if (e.detail === 'copiar') {
      const txt = rows.map(r => nice(r.symbol)).join(', ');
      try { await navigator.clipboard.writeText(txt); avisa(`${rows.length} códigos copiados`, 'success'); } catch { prompt('Copie os códigos:', txt); }
      return;
    }
    const n = (v, d = 4) => (core.number(v) ? v.toFixed(d) : '');
    const linhas = [['Ativo', 'Nome', 'Grupo', 'Ultimo', 'Moeda', 'Var dia %', 'Volume', 'Volume medio 3M', 'Min 52 sem', 'Max 52 sem']];
    for (const r of rows) { const q = r.quote || {}; linhas.push([nice(r.symbol), r.name || '', r.grupo || '', n(q.value), q.currency || '', n(q.change, 2), n(q.vol, 0), n(VM[r.symbol]?.media, 0), n(lo52(r)), n(hi52(r))]); }
    const csv = '\ufeff' + linhas.map(l => l.map(x => /[;"\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  modes.querySelectorAll('[data-wt-mode]').forEach(b => b.addEventListener('click', () => { prefs.mode = b.dataset.wtMode; save(); render(); }));
  modes.querySelector('[data-wt-grupos]')?.addEventListener('click', () => { prefs.grupos = !prefs.grupos; save(); render(); });
  root.querySelectorAll('[data-wt-sort]').forEach(b => b.addEventListener('click', () => {
    const sort = b.dataset.wtSort; prefs.direction = prefs.sort === sort ? -prefs.direction : sort === 'symbol' ? 1 : -1;
    prefs.sort = sort; save(); render();
  }));

  // nome da sessão fora do pregão regular de Nova York (horário de lá)
  function sessaoEstendida() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const m = +p.hour * 60 + +p.minute, util = !['Sat', 'Sun'].includes(p.weekday);
    return util && m >= 240 && m < 570 ? 'Pré-mercado' : util && m >= 960 && m < 1200 ? 'After-hours' : 'Fora do pregão';
  }
  /* ---------------- painel do ativo ---------------- */
  const FAIXAS = [['1d', '1D'], ['5d', '5D'], ['1mo', '1M'], ['ytd', 'No ano'], ['1y', '1A'], ['5y', '5A'], ['max', 'Máx']];
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
    <p class="wn-ext" hidden><em></em><b></b><span></span><small>em tempo real, sobre o último fechamento</small></p>
    <div class="wn-graf"></div>
    <div class="wn-faixas" role="group" aria-label="Período do gráfico">${FAIXAS.map(([k, t]) => `<button type="button" data-f="${k}">${t}</button>`).join('')}</div>
    <h4>Detalhes do ativo</h4>
    <dl class="wn-dl"></dl>
    <div class="wn-cx" hidden></div>
    <a class="wn-cap" target="_blank" rel="noopener" hidden>Notícias deste ETF na Capital.com <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>
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
    pe.hidden = !pg && !q?.src && !q?.ext;
    pe.querySelector('span').textContent = [pg?.t, q?.src ? rotuloVivo(q.src).toLowerCase() : ''].filter(Boolean).join(' · ');
    const ex = side.querySelector('.wn-ext');
    ex.hidden = !q?.ext;
    if (q?.ext) {
      ex.querySelector('em').textContent = q.ext.rot;
      ex.querySelector('b').textContent = fmt(q.ext.v, r.quote);
      const c = ex.querySelector('span'); c.textContent = core.change({ change: q.ext.c }); c.className = q.ext.c > 0 ? 'wt-up' : q.ext.c < 0 ? 'wt-down' : '';
    }
    const vm = VM[r.symbol]?.media, vh = r.quote?.vol;
    const linhas = [['Abertura', d.abertura], ['Máxima', d.max], ['Mínima', d.min], ['Fechamento anterior', d.ant],
      ['Volume de hoje', vh, 'vol'], ['Volume médio (3 meses)', vm, 'vol'], ['Mínima de 52 semanas', lo52(r)], ['Máxima de 52 semanas', hi52(r)]];
    side.querySelector(':scope > .wn-dl').innerHTML = linhas.map(([k]) => `<div><dt>${k}</dt><dd></dd></div>`).join('');
    side.querySelectorAll(':scope > .wn-dl dd').forEach((dd, i) => { const v = linhas[i][1]; dd.textContent = !core.number(v) || (linhas[i][2] === 'vol' && v <= 0) ? '—' : linhas[i][2] === 'vol' ? abrev(v) : fmt(v, r.quote); });
    pintaComex(r.symbol);
    const cap = side.querySelector('.wn-cap'), pg2 = CAP_PAGINA[r.symbol];
    cap.hidden = !pg2;
    if (pg2) cap.href = 'https://capital.com/en-int/markets/shares/' + pg2;
  }
  // página do ETF na Capital.com, que traz as notícias relacionadas (10/11/2026, Severino: opção 2).
  // Só um link: o conteúdo é deles (Reuters etc.) e não é copiado para o site. Endereços conferidos no sitemap da Capital;
  // EWG, EPP, EWT, BKF e INDA não têm página lá.
  const CAP_PAGINA = {
    SPY: 'spdr-s-p-500-etf-share-price-1', VOO: 'vanguard-s-p-500-etf-share-price', QQQ: 'invesco-qqq-trust-share-price',
    ONEQ: 'fidelity-nasdaq-composite-index-tracking-stock-fund-share-price-1', DIA: 'spdr-dow-jones-industrial-average-etf-share-price',
    IWM: 'ishares-russell-2000-etf-share-price', VTI: 'vanguard-total-stock-market-index-fund-etf-shares-share-price-1',
    XLK: 'technology-select-sector-spdr-fund-share-price-1', SMH: 'vaneck-vectors-semiconductor-etf-share-price',
    XLF: 'financial-select-sector-spdr-fund-share-price-1', XLE: 'energy-select-sector-spdr-fund-share-price-1',
    XLV: 'health-care-select-sector-spdr-fund-share-price', EWZ: 'ishares-msci-brazil-capped-etf-share-price',
    EEM: 'ishares-msci-emerging-markets-etf-share-price', EFA: 'ishares-msci-eafe-etf-share-price-1',
    TLT: 'ishares-20-year-treasury-bond-etf-share-price-1', IEF: 'ishares-7-10-year-treasury-bond-etf-share-price-2',
    LQD: 'ishares-iboxx-usd-investment-grade-corporate-bond-etf-share-price', HYG: 'ishares-iboxx-high-yield-corporate-bond-etf-share-price',
    GLD: 'spdr-gold-shares-share-price-1', SLV: 'ishares-silver-trust-share-price-1', USO: 'united-states-oil-fund-share-price',
    VNQ: 'vanguard-real-estate-index-fund-etf-shares-share-price-1', VGK: 'vanguard-ftse-europe-index-fund-etf-shares-share-price',
    EWU: 'ishares-msci-united-kingdom-etf-share-price', EWJ: 'ishares-msci-japan-etf-share-price', EWY: 'ishares-msci-south-korea-etf-share-price',
    EWA: 'ishares-msci-australia-etf-share-price', FXI: 'ishares-china-large-cap-etf-share-price-1'
  };
  // exportação da commodity ligada à empresa (Comex Stat, pelo comex.js da aba Indicadores)
  const COMMODITY = { VALE3: 'minerio', CMIN3: 'minerio', VALE: 'minerio', PETR3: 'petroleo', PETR4: 'petroleo', PRIO3: 'petroleo', BRAV3: 'petroleo', RECV3: 'petroleo', PBR: 'petroleo', SUZB3: 'celulose', KLBN11: 'celulose', KLBN4: 'celulose', JBSS3: 'bovina', JBS: 'bovina', MRFG3: 'bovina', MBRF3: 'bovina', BEEF3: 'bovina', BRFS3: 'frango', SLCE3: 'soja', AGRO3: 'soja', CSAN3: 'acucar', RAIZ4: 'acucar', JALL3: 'acucar', SMTO3: 'acucar' };
  let comexPedido = false;
  function pintaComex(s) {
    const box = side.querySelector('.wn-cx'), k = COMMODITY[String(s).replace(/\.SA$/, '')];
    if (!k) { box.hidden = true; return; }
    if (!window.MMComex) {
      box.hidden = true;
      if (!comexPedido) { comexPedido = true; const sc = document.createElement('script'); sc.src = 'comex.js?v=7'; sc.onload = () => pintaComex(sel); document.head.append(sc); }
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
