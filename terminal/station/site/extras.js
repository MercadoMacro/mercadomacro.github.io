/* =========================================================
   EXTRAS DO SITE ANTIGO (Mercado Macro), refeitos para o painel
   1. Minha watchlist (aba própria): seus ativos, com cotação, mini gráfico do dia
      e de 3 meses, igual aos outros cards. Estrela em qualquer card adiciona ou tira.
      Salva no navegador em "trader_watchlist_v2:<usuario>", após confirmar a conta.
   2. Resumo semanal (aba própria): lê o arquivo resumo-semanal.txt (mesma pasta do index.html), com os dias da semana, leitura completa e cópia para WhatsApp.
   3. Frases: uma frase de investidor por vez abaixo das cotações do topo (arquivo frases.json).
      Liga e desliga em Ajustes > Painel.
   ========================================================= */
(() => {
  if (window.__extrasLoaded) return;
  window.__extrasLoaded = true;

  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m, t) => { if (typeof toast === 'function') toast(m, t); };
  const getJSON = async (url, ms = 15000) => {
    const r = await fetchT(url, {}, ms);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const PREFS_KEY = 'trader_prefs_v1';
  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const css = document.createElement('style');
  document.head.appendChild(css);

  /* =========================================================
     1. MINHA WATCHLIST
     ========================================================= */
  const WL3_KEY = 'watch_3m_v1', WL_MAX = 30;
  let wlUser = null, wlReady = false, wl = [], wlListId = 'main';
  const listsStore = new window.MMWatchlistsStore({
    changed: state => {
      wlUser = state.user; wlReady = state.ready; wl = state.items; wlListId = state.active;
      wlRender(); wlStars();
      if (state.quotes && document.getElementById('watch-panel')?.classList.contains('active')) {
        if (typeof wlLast !== 'undefined') wlLast = 0;
        wlRefresh();
      }
    },
    notify: message => say(message, 'warning')
  });
  const wlSave = (sync = true) => {
    if (!wlReady || window.__mmLoggingOut) return;
    try { listsStore.saveItems(wl, sync); } catch (e) { say(e.message, 'warning'); }
  };
  const wlSync = () => listsStore.sync();
  const inWl = (s) => wl.some((x) => x.s === s);
  const grid = document.getElementById('grid-watch');
  const ALIAS = {
    IBOV: '^BVSP', IBOVESPA: '^BVSP', SP500: '^GSPC', 'S&P500': '^GSPC', SPX: '^GSPC', NASDAQ: '^IXIC', DOW: '^DJI', VIX: '^VIX',
    DOLAR: 'BRL=X', 'DÓLAR': 'BRL=X', USDBRL: 'BRL=X', EURBRL: 'EURBRL=X', EURO: 'EURBRL=X', DXY: 'DX-Y.NYB',
    OURO: 'GC=F', GOLD: 'GC=F', PRATA: 'SI=F', BRENT: 'BZ=F', WTI: 'CL=F', PETROLEO: 'BZ=F', 'PETRÓLEO': 'BZ=F'
  };
  const CRYPTO = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE', 'BNB', 'AVAX', 'DOT', 'LINK', 'LTC', 'MATIC', 'TRX', 'SHIB', 'TON', 'USDT'];
  function normSym(raw) {
    let s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!s) return '';
    if (ALIAS[s]) return ALIAS[s];
    if (CRYPTO.includes(s)) return s + '-USD';
    if (/^[A-Z]{4}\d{1,2}F$/.test(s)) s = s.slice(0, -1);          // fracionário: PETR4F -> PETR4
    if (/^[A-Z]{4}\d{1,2}$/.test(s)) return s + '.SA';            // B3
    return s;
  }
  const nice = (s) => s.replace(/\.SA$/, '');

  let wlMemo = {}, wlBusy = false, wlLast = 0;
  let wlTableOwner = null, wlTableFresh = new Set();
  // 1 chamada em lote ao worker para todos os ativos da watchlist
  async function wlFetch(syms) {
    const out = {};
    for (let i = 0; i < syms.length; i += 45) {
      const part = syms.slice(i, i + 45);
      const j = await getJSON(`${PROXY}/quotes?symbols=${encodeURIComponent(part.join(','))}`, 20000);
      Object.entries(j || {}).forEach(([sym, chart]) => {
        try {
          const v = parseYahooChart(chart);
          const meta = chart?.chart?.result?.[0]?.meta || {};
          v.currency = meta.currency || '';
          out[sym] = { v, name: meta.shortName || meta.longName || '' };
        } catch (e) { /* sem dados para esse ativo */ }
      });
    }
    return out;
  }
  function wlCardHTML(it) {
    return quoteCardHTML({ name: it.n || nice(it.s), symbol: it.s, type: 'yahoo' })
      .replace('class="quote-card"', `class="quote-card wl-card" role="button" tabindex="0" title="Abrir o gráfico de ${esc(it.n || nice(it.s))}"`)
      .replace('<span class="qc-badge', `<button type="button" class="wl-x" data-wlrm="${esc(it.s)}" title="Tirar da watchlist" aria-label="Tirar ${esc(nice(it.s))} da watchlist"><i class="fas fa-times"></i></button><span class="qc-badge`);
  }

  function wlTablePublish() {
    const allowed = wlReady && !window.__mmLoggingOut;
    const rows = allowed ? wl.map(it => ({
      symbol: it.s, name: it.n || nice(it.s),
      quote: wlTableOwner === wlUser ? wlMemo[it.s] || null : null,
      fresh: wlTableOwner === wlUser && wlTableFresh.has(it.s)
    })) : [];
    window.dispatchEvent(new CustomEvent('mm-watchlist-table', {
      detail: { user: allowed ? wlUser : null, rows, loading: wlBusy }
    }));
  }
  window.addEventListener('mm-watchlist-table-request', wlTablePublish);

  function wlListsPublish() {
    const ready = listsStore.writable;
    const add = document.getElementById('wl-add-btn'), input = document.getElementById('wl-input');
    if (add) add.disabled = !ready;
    if (input) input.disabled = !ready;
    window.dispatchEvent(new CustomEvent('mm-watchlists-state', { detail: listsStore.state() }));
  }
  window.addEventListener('mm-watchlists-request', wlListsPublish);
  window.addEventListener('mm-watchlists-action', e => {
    const a = e.detail || {};
    try {
      if (a.type === 'select') listsStore.select(a.id);
      else if (a.type === 'create') listsStore.create(a.name, a.id);
      else if (a.type === 'rename') listsStore.rename(a.id, a.name);
      else if (a.type === 'remove') listsStore.remove(a.id);
      else if (a.type === 'retry') { if (listsStore.ready) listsStore.push(); else listsStore.sync(); }
    } catch (error) { say(error.message, 'warning'); }
  });
  window.addEventListener('online', () => { if (listsStore.error) { if (listsStore.ready) listsStore.push(); else listsStore.sync(); } });
  function wlRender() {
    wlTablePublish();
    wlListsPublish();
    if (!grid) return;
    const n = wl.length;
    const cnt = document.getElementById('m-count-watch');
    if (cnt) cnt.textContent = n ? `${n} ${n === 1 ? 'ativo' : 'ativos'}` : 'vazia';
    if (!n) {
      grid.innerHTML = `<div class="wl-empty"><i class="fas fa-star"></i><div><b>Sua watchlist está vazia.</b><span>Digite um código acima (PETR4, AAPL, BTC, IBOV, dólar…) ou toque na estrela de qualquer card da aba Mercado.</span></div></div>`;
      wlStars();
      return;
    }
    grid.innerHTML = wl.map(wlCardHTML).join('');
    // mostra na hora o último valor conhecido
    wl.forEach((it, i) => {
      const card = grid.children[i];
      const d = wlMemo[it.s] || (typeof marketDataCache !== 'undefined' && marketDataCache[it.s]) || (typeof storedMarket !== 'undefined' && storedMarket.data?.[it.s]);
      if (d && d.value !== undefined) { applyQuoteToCard(card, d, d.unit || ''); if (!wlMemo[it.s] && typeof markStale === 'function') markStale(card, d.ts || storedMarket?.timestamp); }
    });
    wlDecorate();
    wlStars();
  }
  async function wlRefresh() {
    if (!wlReady || window.__mmLoggingOut || !grid || !wl.length || wlBusy) return;
    wlBusy = true;
    const tableOwner = wlUser, tableList = wlListId;
    wlTableFresh = new Set();
    wlTablePublish();
    document.getElementById('wl-refresh-btn')?.classList.add('busy');
    try {
      const r = await wlFetch(wl.map((x) => x.s));
      if (tableOwner !== wlUser || tableList !== wlListId || !wlReady || window.__mmLoggingOut) return;
      wlTableOwner = tableOwner;
      let changed = false;
      wl.forEach((it) => {
        const q = r[it.s];
        if (!q) return;
        wlMemo[it.s] = { ...q.v, quoteAt: q.v.ts, ts: Date.now() };
        wlTableFresh.add(it.s);
        if (typeof yahooMemo !== 'undefined' && !yahooMemo[it.s]) yahooMemo[it.s] = wlMemo[it.s];
        if (q.name && !it.n) { it.n = q.name; changed = true; }
      });
      if (changed) wlSave(false);
      [...grid.querySelectorAll('.wl-card')].forEach((card) => {
        const s = card.dataset.symbol, d = wlMemo[s];
        if (d) { applyQuoteToCard(card, d, ''); if (typeof markStale === 'function') markStale(card, null); }
        else {
          const old = marketDataCache?.[s];
          if (old && old.value !== undefined) { applyQuoteToCard(card, old, ''); if (typeof markStale === 'function') markStale(card, old.ts); }
          else applyQuoteToCard(card, null);
        }
        if (changed) { const it = wl.find((x) => x.s === s); const nm = card.querySelector('.qc-name'); if (it && nm) nm.textContent = it.n || nice(s); }
      });
      if (typeof saveMarketCache === 'function') saveMarketCache();
      wlLast = Date.now();
      const info = document.getElementById('wl-info');
      if (info) info.innerHTML = `<span class="dot"></span>Atualizado às <b>${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b> · atualiza a cada 5 min com a aba aberta`;
    } catch (e) {
      [...grid.querySelectorAll('.wl-card')].forEach((card) => {
        const old = marketDataCache?.[card.dataset.symbol];
        if (old && old.value !== undefined && typeof markStale === 'function') markStale(card, old.ts);
        else if (!old) applyQuoteToCard(card, null);
      });
    } finally {
      wlBusy = false; document.getElementById('wl-refresh-btn')?.classList.remove('busy'); wlTablePublish();
      if ((tableOwner !== wlUser || tableList !== wlListId) && wlReady && !window.__mmLoggingOut && document.getElementById('watch-panel')?.classList.contains('active')) setTimeout(wlRefresh, 0);
    }
    wl3mEnsure().then(wlDecorate);
  }
  async function wlAdd(raw, name, quiet) {
    if (!listsStore.writable) { say(listsStore.migrating ? 'Preparando suas listas na conta. Aguarde a sincronização.' : 'Aguarde a identificação da conta. Se necessário, reabra o painel.', 'warning'); return; }
    const s = normSym(raw), targetOwner = wlUser, targetList = wlListId;
    if (!s) return;
    if (inWl(s)) { say(`${nice(s)} já está na watchlist`, 'info'); return; }
    if (wl.length >= WL_MAX) { say(`A watchlist aceita até ${WL_MAX} ativos`, 'warning'); return; }
    if (!name) {
      // confere se o código existe antes de adicionar
      const btn = document.getElementById('wl-add-btn'); btn?.classList.add('busy');
      try {
        const r = await wlFetch([s]);
        if (targetOwner !== wlUser || targetList !== wlListId || !listsStore.writable) { say('A lista mudou. Adicione o ativo novamente.', 'warning'); return; }
        if (!r[s]) { say(`Não encontrei "${raw}". Use o código do Yahoo (ex.: PETR4, AAPL, BTC, ^BVSP).`, 'warning'); return; }
        wlMemo[s] = { ...r[s].v, quoteAt: r[s].v.ts, ts: Date.now() };
        if (wlTableOwner !== wlUser) wlTableFresh = new Set();
        wlTableOwner = wlUser; wlTableFresh.add(s);
        name = r[s].name;
      } catch (e) { say('Sem conexão com o servidor de cotações agora. Tente de novo.', 'danger'); return; }
      finally { btn?.classList.remove('busy'); }
    }
    if (targetOwner !== wlUser || targetList !== wlListId || !listsStore.writable || inWl(s) || wl.length >= WL_MAX) return;
    wl.push({ s, n: (name || '').slice(0,80) });
    wlSave(); wlRender();
    if (!quiet) say(`${name || nice(s)} entrou na watchlist`, 'success');
    if (!wlMemo[s]) wlRefresh(); else wl3mEnsure().then(wlDecorate);
  }
  function wlRemove(s) {
    if (!listsStore.writable) return;
    const it = wl.find((x) => x.s === s);
    wl = wl.filter((x) => x.s !== s);
    wlSave(); wlRender();
    say(`${(it && it.n) || nice(s)} saiu da watchlist`, 'info');
  }

  // estrela nos demais cards (só ativos do Yahoo)
  function wlStars() {
    document.querySelectorAll('#market-panel .quote-card[data-symbol]:not(.wl-card)').forEach((card) => {
      const s = card.dataset.symbol;
      if (['selic', 'ipca', 'fred'].includes(s)) return;
      let b = card.querySelector('.wl-star');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button'; b.className = 'wl-star'; b.dataset.wlstar = s;
        card.querySelector('.qc-badge')?.before(b);
      }
      const on = inWl(s);
      b.classList.toggle('on', on);
      b.title = on ? 'Tirar da watchlist' : 'Adicionar à watchlist';
      b.setAttribute('aria-label', b.title);
      b.innerHTML = `<i class="${on ? 'fas' : 'far'} fa-star"></i>`;
    });
  }

  // histórico de 3 meses dos ativos da watchlist (1 vez por dia, como o dos outros cards)
  let wl3 = null;
  try { wl3 = JSON.parse(localStorage.getItem(WL3_KEY) || 'null'); } catch (e) { wl3 = null; }
  const today = () => (typeof anaToday === 'function' ? anaToday() : new Date().toISOString().slice(0, 10));
  let wl3Busy = false;
  async function wl3mEnsure() {
    if (wl3Busy || !wl.length) return;
    if (!wl3 || wl3.day !== today()) wl3 = { day: today(), data: {} };
    const falta = wl.map((x) => x.s).filter((s) => !wl3.data[s] && !(typeof mkt3m !== 'undefined' && mkt3m?.data?.[s]) && !(typeof anaHist !== 'undefined' && anaHist?.data?.[s]));
    if (!falta.length) return;
    wl3Busy = true;
    try {
      for (let i = 0; i < falta.length; i += 45) {
        const j = await getJSON(`${PROXY}/history?symbols=${encodeURIComponent(falta.slice(i, i + 45).join(','))}`, 20000).catch(() => null);
        Object.entries(j || {}).forEach(([k, v]) => { if (v && Array.isArray(v.c) && v.c.length > 1) wl3.data[k] = v; });
      }
      try { localStorage.setItem(WL3_KEY, JSON.stringify(wl3)); } catch (e) { /* cheio */ }
    } finally { wl3Busy = false; }
  }
  function wl3Vals(sym) {
    const h = wl3?.data?.[sym];
    if (!h) return null;
    const t = h.t.slice(), c = h.c.slice(), live = wlMemo[sym];
    if (live && live.value != null && live.ts && typeof anaExchDay === 'function') {
      const lt = Math.floor(live.ts / 1000);
      if (anaExchDay(lt, h.off || 0) > anaExchDay(t[t.length - 1], h.off || 0)) { t.push(lt); c.push(live.value); }
      else if (lt >= t[t.length - 1]) c[c.length - 1] = live.value;
    }
    const cut = t[t.length - 1] - 91 * 86400;
    return c.filter((_, i) => t[i] >= cut);
  }
  // o desenho de 3 meses dos outros cards passa a enxergar também a watchlist
  if (typeof mkt3mVals === 'function') {
    const base = mkt3mVals;
    mkt3mVals = function (sym) { return base(sym) || wl3Vals(sym); };
  }
  function wlDecorate() {
    if (!grid || typeof anaSparkSVG !== 'function') return;
    grid.querySelectorAll('.wl-card').forEach((card) => {
      const vals = typeof mkt3mVals === 'function' ? mkt3mVals(card.dataset.symbol) : wl3Vals(card.dataset.symbol);
      let el = card.querySelector('.qc-3m');
      if (!vals || vals.length < 2) { el?.remove(); return; }
      if (!el) { el = document.createElement('div'); el.className = 'qc-3m'; card.querySelector('.qc-footer')?.before(el); }
      const r = (vals[vals.length - 1] / vals[0] - 1) * 100;
      el.title = 'Últimos 3 meses';
      el.innerHTML = `<span>3M</span>${anaSparkSVG(vals, 120, 16)}<span class="${anaCls(r)}">${anaPct(r, 1)}</span>`;
    });
  }

  if (grid) {
    const form = document.getElementById('wl-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('wl-input');
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      inp.value = '';
      const list = v.split(/[,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, WL_MAX);
      const n0 = wl.length;
      list.reduce((p, x) => p.then(() => wlAdd(x, '', list.length > 1)), Promise.resolve())
        .then(() => { if (list.length > 1 && wl.length > n0) say(`${wl.length - n0} ${wl.length - n0 === 1 ? 'ativo entrou' : 'ativos entraram'} na watchlist`, 'success'); });
    });
    // estrela nos cards da aba Mercado: antes do clique geral dos cards (que atualiza a cotação)
    document.getElementById('market-panel')?.addEventListener('click', (e) => {
      const st = e.target.closest('[data-wlstar]');
      if (!st) return;
      e.stopPropagation();
      const s = st.dataset.wlstar;
      if (inWl(s)) wlRemove(s);
      else wlAdd(s, st.closest('.quote-card')?.querySelector('.qc-name')?.textContent || '');
    });
    const wp = document.getElementById('watch-panel');
    wp?.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-wlrm]');
      if (rm) { e.stopPropagation(); wlRemove(rm.dataset.wlrm); return; }
      // clique num card da watchlist: abre o gráfico completo (como no site antigo)
      const card = e.target.closest('.wl-card');
      if (card) wlChart(card.dataset.symbol);
    });
    wp?.addEventListener('keydown', (e) => {
      const card = e.target.closest?.('.wl-card');
      if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); wlChart(card.dataset.symbol); }
    });
    document.getElementById('wl-refresh-btn')?.addEventListener('click', () => wlRefresh());
    // as estrelas acompanham os cards da aba Mercado quando eles são redesenhados
    if (typeof updateMarketPanel === 'function') {
      const prev = updateMarketPanel;
      updateMarketPanel = async function () {
        const r = await prev.apply(this, arguments);
        wlStars();
        return r;
      };
    }
    // cotações da watchlist: ao abrir a aba (se a última tiver mais de 1 min) e a cada 5 min com ela aberta
    const wpOn = () => wp?.classList.contains('active');
    const prevHook = window.__onTabSwitch;
    window.__onTabSwitch = (tabId) => {
      if (prevHook) prevHook(tabId);
      if (tabId === 'watch-panel' && Date.now() - wlLast > 60 * 1000) wlRefresh();
    };
    setInterval(() => { if (wpOn() && !document.hidden && Date.now() - wlLast >= 5 * 60 * 1000) wlRefresh(); }, 30 * 1000);
    wlRender();
    setTimeout(wlStars, 2500);
    wlSync();
  }

  /* ---- gráfico do ativo (TradingView), aberto ao clicar num card da watchlist ---- */
  // código do Yahoo -> código do TradingView
  const TV_MAP = {
    '^BVSP': 'BMFBOVESPA:IBOV', '^GSPC': 'SP:SPX', '^IXIC': 'NASDAQ:IXIC', '^NDX': 'NASDAQ:NDX', '^DJI': 'DJ:DJI', '^VIX': 'TVC:VIX',
    '^RUT': 'TVC:RUT', '^FTSE': 'TVC:UKX', '^GDAXI': 'XETR:DAX', '^FCHI': 'TVC:CXA', '^N225': 'TVC:NI225', '^HSI': 'TVC:HSI', '^STOXX50E': 'TVC:SX5E',
    '^TNX': 'TVC:US10Y', '^IRX': 'TVC:US03MY', '^FVX': 'TVC:US05Y', '^TYX': 'TVC:US30Y', 'DX-Y.NYB': 'TVC:DXY',
    'GC=F': 'COMEX:GC1!', 'SI=F': 'COMEX:SI1!', 'HG=F': 'COMEX:HG1!', 'CL=F': 'NYMEX:CL1!', 'BZ=F': 'TVC:UKOIL', 'NG=F': 'NYMEX:NG1!',
    'ZS=F': 'CBOT:ZS1!', 'ZC=F': 'CBOT:ZC1!', 'ZW=F': 'CBOT:ZW1!', 'KC=F': 'ICEUS:KC1!', 'SB=F': 'ICEUS:SB1!', 'CC=F': 'ICEUS:CC1!',
    'BRL=X': 'FX_IDC:USDBRL', 'EURBRL=X': 'FX_IDC:EURBRL',
    'ES=F': 'CME_MINI:ES1!', 'NQ=F': 'CME_MINI:NQ1!', 'YM=F': 'CBOT_MINI:YM1!', 'RTY=F': 'CME_MINI:RTY1!', 'TIO=F': 'SGX:FEF1!',
    '^GSPTSE': 'TSX:TSX', '^MXX': 'BMV:ME', '^MERV': 'BCBA:IMV', '^IBEX': 'BME:IBC', '^SSMI': 'SIX:SMI', '^AEX': 'EURONEXT:AEX', 'FTSEMIB.MI': 'INDEX:FTSEMIB',
    '^KS11': 'KRX:KOSPI', '^TWII': 'TWSE:TAIEX', '^AXJO': 'ASX:XJO', '^BSESN': 'BSE:SENSEX', '000001.SS': 'SSE:000001', '399001.SZ': 'SZSE:399001', 'EWZ': 'AMEX:EWZ'
  };
  function tvSym(s) {
    if (TV_MAP[s]) return TV_MAP[s];
    if (/\.SA$/.test(s)) return 'BMFBOVESPA:' + s.replace(/\.SA$/, '');
    let m = /^([A-Z0-9]+)-USD$/.exec(s);
    if (m) return `BINANCE:${m[1]}USDT`;
    m = /^([A-Z]{6})=X$/.exec(s);
    if (m) return (/BRL/.test(m[1]) ? 'FX_IDC:' : 'FX:') + m[1];
    m = /^([A-Z]{3})=X$/.exec(s);
    if (m) return `FX_IDC:USD${m[1]}`;
    return s.replace(/^\^/, '').replace(/=F$/, '1!');
  }
  let tvBox = null, tvLast = null;
  const historyView = new window.MMAssetHistory.Viewer(sym => getJSON(`${PROXY}/history?symbols=${encodeURIComponent(sym)}`, 20000));
  // ctx (opcional): { name, list } para abrir de outras abas (a Mesa usa); sem ctx, navega pela watchlist
  function wlChart(sym, ctx) {
    const list = (ctx && ctx.list) || wl;
    const it = list.find((x) => x.s === sym) || wl.find((x) => x.s === sym) || { s: sym, n: (ctx && ctx.name) || '' };
    const tv = tvSym(sym), light = document.body.classList.contains('light');
    const canEmbed = ctx?._source !== 'mesa' && window.MMAssetHistory.canEmbed(tv, sym);
    const mode = canEmbed ? ctx?._chartMode || window.MMAssetHistory.defaultMode(sym, tv) : 'history';
    if (!tvBox) {
      tvBox = document.createElement('div');
      tvBox.className = 'wlc';
      tvBox.hidden = true;
      tvBox.innerHTML = `<div class="wlc-scrim" data-wlc="close"></div>
        <div class="wlc-box" role="dialog" aria-modal="true" aria-labelledby="wlc-name">
          <header class="wlc-head"></header>
          <div class="wlc-chart"></div>
        </div>`;
      document.body.appendChild(tvBox);
      tvBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-wlc]');
        if (!b) return;
        if (b.dataset.wlc === 'close') wlChartClose();
        else if (b.dataset.wlc === 'history' || b.dataset.wlc === 'tradingview') wlChart(tvBox.dataset.sym, { ...(tvBox._ctx || {}), list: tvBox._list, _chartMode: b.dataset.wlc });
        else if (b.dataset.wlc === 'prev' || b.dataset.wlc === 'next') {
          const L = tvBox._list || wl;
          const i = L.findIndex((x) => x.s === tvBox.dataset.sym);
          const n = L[(i + (b.dataset.wlc === 'next' ? 1 : -1) + L.length) % L.length];
          if (n) wlChart(n.s, tvBox._ctx);
        }
      });
      document.addEventListener('keydown', (e) => {
        if (!tvBox || tvBox.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); wlChartClose(); }
        else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
          tvBox.querySelector(`[data-wlc="${e.key === 'ArrowRight' ? 'next' : 'prev'}"]`)?.click();
        }
      }, true);
    }
    tvBox.dataset.sym = sym;
    tvBox._list = list; tvBox._ctx = ctx || null;
    const d = wlMemo[sym] || (ctx && ctx.quote && ctx.quote(sym)) || (typeof marketDataCache !== 'undefined' && marketDataCache[sym]) || null;
    const has = d && d.value != null && !isNaN(d.value);
    const chg = has && d.change != null && !isNaN(d.change) ? d.change : null;
    const price = has ? (typeof fmtNumber === 'function' ? fmtNumber(d.value, { min: 2, max: d.value < 10 ? 4 : 2 }) : d.value.toFixed(2)) : '—';
    tvBox.querySelector('.wlc-head').innerHTML = `
      <div class="wlc-id"><b id="wlc-name">${esc(it.n || nice(sym))}</b><span>${esc(nice(sym))} · ${mode === 'history' ? 'Histórico diário' : 'TradingView ' + esc(tv)}</span></div>
      <div class="wlc-q"><b>${price}</b>${chg == null ? '<em class="na">—</em>' : `<em class="${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</em>`}</div>
      <span class="sp"></span>
      ${canEmbed ? `<div class="wlc-modes" role="group" aria-label="Tipo de gráfico"><button type="button" class="wlc-b" data-wlc="history" aria-pressed="${mode === 'history'}">Histórico</button><button type="button" class="wlc-b" data-wlc="tradingview" aria-pressed="${mode === 'tradingview'}">Avançado</button></div>` : ''}
      ${list.length > 1 ? `<button type="button" class="wlc-b" data-wlc="prev" title="Ativo anterior (seta esquerda)" aria-label="Ativo anterior"><i class="fas fa-chevron-left"></i></button>
      <button type="button" class="wlc-b" data-wlc="next" title="Próximo ativo (seta direita)" aria-label="Próximo ativo"><i class="fas fa-chevron-right"></i></button>` : ''}
      <a class="wlc-b wlc-ext" href="https://br.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}" target="_blank" rel="noopener" title="Abrir no TradingView"><i class="fas fa-external-link-alt"></i><span>TradingView</span></a>
      <button type="button" class="wlc-b" data-wlc="close" title="Fechar (Esc)" aria-label="Fechar"><i class="fas fa-times"></i></button>`;
    // gráfico avançado do TradingView (o mesmo do site antigo): diário, média móvel, troca de ativo, detalhes e notícias
    const box = tvBox.querySelector('.wlc-chart');
    historyView.destroy();
    if (mode === 'history') { tvLast = null; box.replaceChildren(); }
    else if (tvLast !== `${tv}|${light}`) {
      box.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div><div class="wlc-load">Carregando gráfico…</div>';
      const sc = document.createElement('script');
      sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      sc.async = true;
      sc.textContent = JSON.stringify({
        autosize: true, symbol: tv, interval: 'D', timezone: 'America/Sao_Paulo', theme: light ? 'light' : 'dark', style: '1', locale: 'br',
        allow_symbol_change: true, details: true, hotlist: false, calendar: false, withdateranges: true, hide_side_toolbar: false,
        studies: ['STD;SMA'], support_host: 'https://www.tradingview.com'
      });
      sc.onerror = () => { if (tvBox.hidden || tvBox.dataset.sym !== sym || tvBox._ctx?._chartMode === 'history') return; wlChart(sym, { ...(ctx || {}), list, _chartMode: 'history' }); };
      box.querySelector('.tradingview-widget-container').appendChild(sc);
      tvLast = `${tv}|${light}`;
    }
    if (tvBox.hidden) {
      tvBox._focus = document.activeElement;
      tvBox.hidden = false;
      document.body.classList.add('wlc-open');
      requestAnimationFrame(() => tvBox.classList.add('on'));
      setTimeout(() => tvBox.querySelector('[data-wlc="close"].wlc-b')?.focus(), 60);
    }
    if (mode === 'history') historyView.show(box, sym, it.n || nice(sym), light);
  }
  window.openAssetChart = (sym, name, list, quote, source) => wlChart(sym, { _source: source, name, list: list && list.length ? list : [{ s: sym, n: name }], quote });
  function wlChartClose() {
    if (!tvBox || tvBox.hidden) return;
    historyView.destroy(); tvLast = null;
    tvBox.querySelector('.wlc-chart').replaceChildren();
    tvBox.classList.remove('on');
    document.body.classList.remove('wlc-open');
    setTimeout(() => { tvBox.hidden = true; }, 180);
    tvBox._focus?.focus?.();
  }

  css.textContent += `
  .wl-head-form { display:flex; gap:6px; margin-left:auto; }
  .wl-head-form input { width:220px; height:32px; padding:0 10px; border-radius:9px; font-size:12.5px; text-transform:uppercase; }
  .wl-head-form input::placeholder { text-transform:none; }
  .wl-head-form button { height:32px; display:inline-flex; align-items:center; gap:6px; }
  .wl-head-form button.busy i, #wl-refresh-btn.busy i { animation:spin .8s linear infinite; }
  #wl-info b { color:var(--text-2); font-weight:600; }
  #watch-panel .market-section { margin-top:6px; }
  .wl-card { cursor:pointer; }
  .wl-card:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .wlc { position:fixed; inset:0; z-index:8500; }
  .wlc-scrim { position:absolute; inset:0; background:rgba(3,6,12,.6); opacity:0; transition:opacity .18s; }
  .wlc.on .wlc-scrim { opacity:1; }
  .wlc-box { position:absolute; inset:4vh 4vw; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line-2); border-radius:16px; overflow:hidden; box-shadow:var(--shadow-lg);
    opacity:0; transform:scale(.98); transition:opacity .18s, transform .18s; }
  .wlc.on .wlc-box { opacity:1; transform:none; }
  .wlc-head { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; padding:12px 14px 12px 18px; border-bottom:1px solid var(--line); }
  .wlc-head .sp { flex:1; }
  .wlc-id { display:flex; flex-direction:column; min-width:0; }
  .wlc-id b { font-size:16px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wlc-id span { font:11px 'JetBrains Mono', monospace; color:var(--text-3); }
  .wlc-q { display:flex; align-items:baseline; gap:10px; font-family:'JetBrains Mono', monospace; }
  .wlc-q b { font-size:20px; color:var(--text); font-variant-numeric:tabular-nums; }
  .wlc-q em { font-style:normal; font-size:13px; font-weight:600; }
  .wlc-q em.up { color:var(--pos); } .wlc-q em.dn { color:var(--neg); } .wlc-q em.na { color:var(--text-3); }
  .wlc-b { display:inline-flex; align-items:center; gap:7px; height:34px; min-width:34px; justify-content:center; padding:0 10px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12.5px; cursor:pointer; text-decoration:none; }
  .wlc-b:hover { color:var(--text); border-color:var(--line-2); }
  .wlc-chart { position:relative; flex:1; min-height:0; }
  .wlc-load { position:absolute; inset:0; display:grid; place-items:center; color:var(--text-3); font-size:13px; pointer-events:none; z-index:0; text-align:center; padding:20px; }
  .wlc-chart .tradingview-widget-container { position:relative; z-index:1; }
  .wlc-load a { pointer-events:auto; color:var(--accent); }
  body.wlc-open { overflow:hidden; }
  @media (max-width: 640px) { .wlc-box { inset:0; border-radius:0; } .wlc-ext span { display:none; } .wlc-head { padding:10px 10px 10px 14px; } .wlc-q b { font-size:17px; } }
  .wl-empty { grid-column:1 / -1; display:flex; align-items:center; gap:14px; padding:16px 18px; border:1px dashed var(--line-2); border-radius:14px; color:var(--text-3); font-size:12.5px; }
  .wl-empty > i { font-size:18px; color:var(--accent); }
  .wl-empty b { display:block; color:var(--text-2); font-size:13px; margin-bottom:2px; }
  .wl-x, .wl-star { border:0; background:transparent; color:var(--text-3); cursor:pointer; padding:2px 4px; margin-right:4px; font-size:11px; line-height:1; border-radius:6px; }
  .wl-x { opacity:0; transition:opacity .15s; }
  .wl-card:hover .wl-x, .wl-x:focus-visible { opacity:1; }
  .wl-x:hover { color:var(--neg); }
  .wl-star { opacity:0; transition:opacity .15s, color .15s; }
  .quote-card:hover .wl-star, .wl-star:focus-visible, .wl-star.on { opacity:1; }
  .wl-star:hover, .wl-star.on { color:var(--accent); }
  @media (hover: none) { .wl-x { opacity:.7; } .wl-star { opacity:.55; } }
  .quote-card .qc-head { align-items:flex-start; }
  .quote-card .qc-head > .wl-x, .quote-card .qc-head > .wl-star { margin-left:auto; }
  @media (max-width: 640px) {
    #watch-section .market-section-head { flex-wrap:wrap; }
    .wl-head-form { width:100%; margin-left:0; }
    .wl-head-form input { flex:1; width:auto; min-width:0; }
  }
  `;

  /* =========================================================
     2. RESUMO SEMANAL (arquivo resumo-semanal.txt)
     ========================================================= */
  const RS_LOCAL = 'trader_resumo_semanal_v1';
  const noEmoji = (s) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(“"])\*([^*\n]+?)\*(?=[\s.,;:!?)”"]|$)/g, '$1<i>$2</i>');
  // transforma o texto em blocos: título, dias (com bolinha verde/vermelha), seções e parágrafos
  function rsParse(txt) {
    const lines = String(txt || '').replace(/\r\n?/g, '\n').split('\n');
    const out = { title: '', intro: [], days: [], blocks: [] };
    let cur = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const mood = /^\u{1F534}/u.test(line) ? 'dn' : /^\u{1F7E2}/u.test(line) ? 'up' : /^\u{1F7E1}/u.test(line) ? 'eq' : '';
      const clean = noEmoji(line);
      const head = /^\*\*([^*]+)\*\*$/.exec(clean);
      if (!out.title && head) { out.title = head[1]; continue; }
      if (head) {
        cur = { h: head[1], mood, p: [] };
        out.blocks.push(cur);
        if (mood || /feira|s[áa]bado|domingo/i.test(head[1])) out.days.push({ h: head[1].replace(/\s*\(.*\)$/, ''), date: (/\(([^)]+)\)/.exec(head[1]) || [])[1] || '', mood, i: out.blocks.length - 1 });
        continue;
      }
      if (cur) cur.p.push(clean); else out.intro.push(clean);
    }
    return out;
  }
  function rsWhats(txt) {
    return String(txt || '').replace(/\r\n?/g, '\n')
      .replace(/(^|[\s(“"])\*([^*\n]+?)\*(?=[\s.,;:!?)”"]|$)/g, '$1_$2_')
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  let rsTxt = '', rsSrc = '', rsDate = null, rsEdit = false, rsLoaded = false;
  const rsRoot = document.getElementById('rs-root');
  let rsBox = null;
  if (rsRoot) {
    rsBox = document.createElement('section');
    rsBox.className = 'rs-card';
    rsBox.id = 'rs-card';
    rsRoot.replaceChildren(rsBox);
  }
  function rsRender() {
    if (!rsBox) return;
    if (!rsTxt && !rsEdit) {
      rsBox.innerHTML = rsLoaded ? `
        <div class="rs-top"><span class="rs-kicker"><i class="fas fa-book-open"></i> Resumo semanal</span><span class="sp"></span>
          <button type="button" class="rs-ic" data-rs="edit"><i class="fas fa-pen"></i><span>Escrever</span></button></div>
        <p class="rs-lead">Nenhum resumo publicado. Publique o arquivo <b>resumo-semanal.txt</b> na mesma pasta do site, ou escreva o texto aqui.</p>`
        : '<div class="ind-boot">Carregando resumo semanal…</div>';
      return;
    }
    if (rsEdit) {
      rsBox.innerHTML = `
        <div class="rs-top"><span class="rs-kicker"><i class="fas fa-pen"></i> Editar resumo semanal</span></div>
        <p class="rs-help">Cole o texto da semana. A primeira linha em <b>**negrito**</b> vira o título; dias começando com bolinha vermelha ou verde (ou só <b>**Segunda-feira (06/10)**</b>) viram as etiquetas do topo. Salvar guarda só neste navegador; para todos verem, baixe o arquivo e publique ele no lugar do <b>resumo-semanal.txt</b>.</p>
        <textarea id="rs-ta" spellcheck="true">${esc(rsTxt)}</textarea>
        <div class="rs-actions">
          <button type="button" class="btn-sm rs-pri" data-rs="save"><i class="fas fa-check"></i> Salvar neste navegador</button>
          <button type="button" class="btn-sm" data-rs="dl"><i class="fas fa-download"></i> Baixar resumo-semanal.txt</button>
          ${localStorage.getItem(RS_LOCAL) ? '<button type="button" class="btn-sm" data-rs="reset"><i class="fas fa-undo"></i> Voltar ao publicado</button>' : ''}
          <button type="button" class="btn-sm" data-rs="cancel">Cancelar</button>
        </div>`;
      setTimeout(() => document.getElementById('rs-ta')?.focus(), 30);
      return;
    }
    const d = rsParse(rsTxt);
    const when = rsDate ? rsDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const body = `
      <div class="rs-body">
        ${d.intro.map((p) => `<p>${inline(p)}</p>`).join('')}
        ${d.blocks.map((b, i) => `<div class="rs-blk" id="rs-b${i}"><h4>${b.mood ? `<i class="rs-dot ${b.mood}"></i>` : ''}${inline(b.h)}</h4>${b.p.map((p) => `<p>${inline(p)}</p>`).join('')}</div>`).join('')}
      </div>`;
    rsBox.innerHTML = `
      <div class="rs-top">
        <span class="rs-kicker"><i class="fas fa-newspaper"></i> Resumo semanal</span>
        ${rsSrc === 'local' ? '<span class="rs-tag" title="Texto salvo neste navegador; quem abre o site vê o arquivo publicado">versão deste navegador</span>' : when ? `<span class="rs-tag">publicado em ${when}</span>` : ''}
        <span class="sp"></span>
        <button type="button" class="rs-ic" data-rs="copy" title="Copiar no formato do WhatsApp"><i class="fab fa-whatsapp"></i><span>Copiar</span></button>
        <button type="button" class="rs-ic" data-rs="edit" title="Editar o texto da semana"><i class="fas fa-pen"></i><span>Editar</span></button>
      </div>
      <h3 class="rs-title">${inline(d.title || 'Resumo da semana')}</h3>
      ${d.days.length ? `<div class="rs-days">${d.days.map((x) => `<button type="button" class="rs-day ${x.mood}" data-rsday="${x.i}"><i class="rs-dot ${x.mood}"></i>${esc(x.h.replace(/-feira/i, ''))}${x.date ? `<em>${esc(x.date)}</em>` : ''}</button>`).join('')}</div>` : ''}
      ${body}`;
  }
  async function rsLoad() {
    let pub = '', pubDate = null;
    try {
      const r = await fetchT(`resumo-semanal.txt?t=${Math.floor(Date.now() / 600000)}`, {}, 10000);
      if (r.ok) {
        pub = (await r.text()).trim();
        const lm = r.headers.get('last-modified');
        if (lm && !isNaN(Date.parse(lm))) pubDate = new Date(lm);
        if (/<html|<!doctype/i.test(pub.slice(0, 200))) pub = '';   // hospedagem devolveu a página no lugar do arquivo
      }
    } catch (e) { /* sem arquivo publicado */ }
    let loc = null;
    try { loc = JSON.parse(localStorage.getItem(RS_LOCAL) || 'null'); } catch (e) { loc = null; }
    if (loc && loc.txt && (!pub || !pubDate || loc.ts > pubDate.getTime())) { rsTxt = loc.txt; rsSrc = 'local'; rsDate = new Date(loc.ts); }
    else if (pub) { rsTxt = pub; rsSrc = 'file'; rsDate = pubDate; }
    rsLoaded = true;
    rsRender();
  }
  rsBox?.addEventListener('click', (e) => {
    const day = e.target.closest('[data-rsday]');
    if (day) {
      const el = document.getElementById(`rs-b${day.dataset.rsday}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); }
      return;
    }
    const b = e.target.closest('[data-rs]');
    if (!b) return;
    const a = b.dataset.rs;
    if (a === 'copy') {
      const t = rsWhats(rsTxt);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say('Resumo semanal copiado no formato do WhatsApp', 'success'), () => say('Não foi possível copiar', 'danger'));
    }
    else if (a === 'edit') { rsEdit = true; rsRender(); }
    else if (a === 'cancel') { rsEdit = false; rsRender(); }
    else if (a === 'save') {
      const v = document.getElementById('rs-ta').value.trim();
      if (!v) { say('O texto está vazio', 'warning'); return; }
      try { localStorage.setItem(RS_LOCAL, JSON.stringify({ txt: v, ts: Date.now() })); } catch (err) { say('Sem espaço no navegador para salvar', 'danger'); return; }
      rsTxt = v; rsSrc = 'local'; rsDate = new Date(); rsEdit = false; rsRender();
      say('Resumo salvo neste navegador. Baixe o arquivo para publicar.', 'success');
    }
    else if (a === 'dl') {
      const v = document.getElementById('rs-ta')?.value ?? rsTxt;
      const url = URL.createObjectURL(new Blob([v], { type: 'text/plain;charset=utf-8' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: 'resumo-semanal.txt' });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    else if (a === 'reset') { localStorage.removeItem(RS_LOCAL); rsEdit = false; rsLoad(); }
  });
  rsLoad();

  css.textContent += `
  .rs-card { max-width:980px; margin:0 auto 16px; padding:20px 24px; border:1px solid var(--line); border-radius:16px; background:radial-gradient(120% 160% at 0% 0%, var(--accent-soft), transparent 50%), var(--surface); }
  .rs-top { display:flex; align-items:center; flex-wrap:wrap; gap:8px 10px; }
  .rs-top .sp { flex:1; }
  .rs-kicker { font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--accent); display:inline-flex; gap:7px; align-items:center; }
  .rs-tag { font:11px 'JetBrains Mono', monospace; color:var(--text-3); border:1px solid var(--line); border-radius:99px; padding:2px 8px; }
  .rs-ic { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; padding:5px 10px; border-radius:9px; cursor:pointer; }
  .rs-ic:hover { color:var(--text); border-color:var(--line-2); }
  .rs-title { margin:12px 0 0; font-size:20px; line-height:1.35; letter-spacing:-.01em; color:var(--text); }
  .rs-days { display:flex; flex-wrap:wrap; gap:6px; margin-top:14px; position:sticky; top:0; z-index:2; padding:8px 0; background:var(--surface); }
  .rs-day { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; font-weight:600; padding:5px 10px; border-radius:99px; cursor:pointer; }
  .rs-day em { font-style:normal; font:11px 'JetBrains Mono', monospace; color:var(--text-3); }
  .rs-day:hover { border-color:var(--line-2); color:var(--text); }
  .rs-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--text-3); flex:0 0 auto; }
  .rs-dot.up { background:var(--pos); box-shadow:0 0 0 3px color-mix(in srgb, var(--pos) 18%, transparent); }
  .rs-dot.dn { background:var(--neg); box-shadow:0 0 0 3px color-mix(in srgb, var(--neg) 18%, transparent); }
  .rs-dot.eq { background:var(--accent); }
  .rs-lead { margin:12px 0 0; font-size:13.5px; line-height:1.6; color:var(--text-2); max-width:90ch; }
  .rs-body { margin-top:8px; font-size:14.5px; line-height:1.75; color:var(--text-2); }
  .rs-blk { scroll-margin-top:70px; }
  .rs-body p { margin:0 0 10px; max-width:90ch; }
  .rs-body b { color:var(--text); }
  .rs-blk { margin-top:16px; padding:2px 0 0 12px; border-left:2px solid var(--line); transition:background .3s; border-radius:0 8px 8px 0; }
  .rs-blk.flash { background:var(--accent-soft); }
  .rs-blk h4 { margin:0 0 8px; font-size:14px; color:var(--text); display:flex; align-items:center; gap:8px; }
  .rs-more { margin-top:12px; border:0; background:none; color:var(--accent); font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; padding:0; display:inline-flex; gap:7px; align-items:center; }
  .rs-help { font-size:12px; line-height:1.55; color:var(--text-3); margin:10px 0; }
  #rs-ta { width:100%; min-height:300px; resize:vertical; padding:12px; font:12.5px/1.55 'JetBrains Mono', monospace; border-radius:10px; }
  .rs-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .rs-actions .btn-sm { display:inline-flex; align-items:center; gap:7px; }
  .rs-actions .rs-pri { color:var(--accent); border-color:var(--accent-line); }
  @media (max-width: 640px) { .rs-card { padding:14px; } .rs-ic span { display:none; } .rs-title { font-size:16.5px; } .rs-body { font-size:14px; } }
  `;

  /* =========================================================
     3. FRASES (arquivo frases.json) abaixo das cotações do topo
     ========================================================= */
  const ticker = document.getElementById('ticker');
  let frases = [], fi = -1, fTimer = null, fBar = null;
  const fOn = () => prefs().frases !== 'off';
  function fShow(step = 1) {
    if (!fBar || !frases.length) return;
    fi = fi < 0 ? Math.floor(Math.random() * frases.length) : (fi + step + frases.length) % frases.length;
    const raw = frases[fi], k = raw.lastIndexOf(' — ');
    const txt = k > 0 ? raw.slice(0, k) : raw, who = k > 0 ? raw.slice(k + 3) : '';
    const sp = fBar.querySelector('.qb-txt');
    sp.classList.remove('in'); void sp.offsetWidth;
    sp.innerHTML = `<span>${esc(noEmoji(txt))}</span>${who ? `<em>${esc(who)}</em>` : ''}`;
    sp.classList.add('in');
  }
  function fStart() {
    clearInterval(fTimer);
    fTimer = setInterval(() => { if (!document.hidden && !fBar?.matches(':hover')) fShow(1); }, 30000);
  }
  function fMount() {
    if (!ticker) return;
    if (!fOn()) { fBar?.remove(); fBar = null; clearInterval(fTimer); return; }
    if (fBar || !frases.length) return;
    fBar = document.createElement('div');
    fBar.className = 'qbanner';
    fBar.innerHTML = `<i class="fas fa-quote-left qb-ic" aria-hidden="true"></i><div class="qb-txt" aria-live="polite"></div>
      <button type="button" class="qb-btn" data-q="prev" title="Frase anterior" aria-label="Frase anterior"><i class="fas fa-chevron-left"></i></button>
      <button type="button" class="qb-btn" data-q="next" title="Próxima frase" aria-label="Próxima frase"><i class="fas fa-chevron-right"></i></button>
      <button type="button" class="qb-btn" data-q="off" title="Esconder frases (volta em Ajustes)" aria-label="Esconder frases"><i class="fas fa-times"></i></button>`;
    // ao lado da marca, como no site antigo (sem a marca, cai abaixo da faixa)
    const right = document.querySelector('.topbar-right');
    if (right) right.before(fBar); else ticker.after(fBar);
    fBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      if (b.dataset.q === 'next') { fShow(1); fStart(); }
      else if (b.dataset.q === 'prev') { fShow(-1); fStart(); }
      else if (b.dataset.q === 'off') {
        const p = prefs(); p.frases = 'off';
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (err) { /* nada */ }
        fMount();
        say('Frases escondidas. Para voltar: Ajustes > Painel.', 'info');
        window.dispatchEvent(new Event('prefs-changed'));
      }
    });
    fShow(1); fStart();
  }
  (async () => {
    try {
      const r = await fetchT('frases.json', {}, 10000);
      if (!r.ok) throw new Error('sem arquivo');
      const j = await r.json();
      frases = (Array.isArray(j) ? j : j.phrases || []).filter((x) => typeof x === 'string' && x.trim());
    } catch (e) { frases = []; }
    fMount();
  })();
  // Ajustes liga/desliga
  window.__frasesSync = fMount;
  window.addEventListener('storage', (e) => { if (e.key === PREFS_KEY) fMount(); });

  css.textContent += `
  .qbanner { display:flex; align-items:center; gap:8px; min-width:0; max-width:760px; justify-self:center; width:100%; padding:7px 6px 7px 14px;
    background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:10px; color:var(--text-3); font-size:12.5px; }
  .topbar:has(> .qbanner) { grid-template-columns:auto minmax(0,1fr) auto; }
  /* para a frase caber ao lado da marca: subtítulo quebra em 2 linhas e a busca vira só o atalho */
  .topbar:has(> .qbanner) .brand { max-width:360px; }
  .topbar:has(> .qbanner) .brand-text .sub { flex-wrap:wrap; row-gap:3px; }
  .topbar:has(> .qbanner) .cmdk-hint { min-width:0; }
  .topbar:has(> .qbanner) .cmdk-hint .tx { display:none; }
  .qb-ic { color:var(--accent); font-size:11px; opacity:.8; flex:0 0 auto; }
  .qb-txt { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .qb-txt span { font-style:italic; color:var(--text-2); }
  .qb-txt em { font-style:normal; margin-left:8px; font-size:11.5px; color:var(--text-3); font-family:'JetBrains Mono', monospace; }
  .qb-txt em::before { content:'— '; }
  .qb-txt.in { animation:qbIn .5s ease; }
  @keyframes qbIn { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:none; } }
  .qbanner:hover .qb-txt { white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .qb-btn { flex:0 0 auto; border:0; background:none; color:var(--text-3); cursor:pointer; width:22px; height:22px; border-radius:6px; font-size:10px; opacity:.6; }
  .qb-btn:hover { opacity:1; color:var(--text); background:var(--surface-2); }
  html[data-motion="off"] .qb-txt.in { animation:none; }
  .qb-btn { opacity:0; transition:opacity .15s; }
  .qbanner:hover .qb-btn, .qbanner:focus-within .qb-btn { opacity:.6; }
  .qbanner .qb-btn:hover { opacity:1; }
  @media (max-width: 1100px) { .topbar:has(> .qbanner) { grid-template-columns:minmax(0,1fr) auto; } .qbanner { grid-column:1 / -1; grid-row:2; max-width:none; } }
  @media (max-width: 640px) { .topbar:has(> .qbanner) { grid-template-columns:1fr; } .qbanner { grid-row:auto; font-size:12px; padding:6px 4px 6px 10px; } .qb-btn { opacity:.6; } .qb-btn[data-q="prev"] { display:none; } }
  `;

  /* =========================================================
     4. COTAÇÕES DO TOPO EM CARROSSEL CORRIDO (como o site antigo)
     Os itens originais (com ids) continuam sendo os atualizados pelo painel;
     uma cópia sem ids vem logo atrás para o giro não ter emenda.
     ========================================================= */
  if (ticker && !ticker.querySelector('.tk-track')) {
    const items = [...ticker.querySelectorAll(':scope > .item')];
    const track = document.createElement('div');
    track.className = 'tk-track';
    const grpA = document.createElement('div');
    grpA.className = 'tk-grp';
    items.forEach((it) => grpA.appendChild(it));
    const grpB = document.createElement('div');
    grpB.className = 'tk-grp tk-clone';
    grpB.setAttribute('aria-hidden', 'true');
    track.append(grpA, grpB);
    const vp = document.createElement('div');
    vp.className = 'tk-vp';
    vp.appendChild(track);
    ticker.prepend(vp);
    ticker.classList.add('tk-marquee');

    let syncQ = false;
    const sync = () => {
      syncQ = false;
      const c = grpA.cloneNode(true);
      c.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      c.querySelectorAll('[tabindex]').forEach((el) => el.setAttribute('tabindex', '-1'));
      grpB.replaceChildren(...c.childNodes);
      // velocidade constante (~45 px/s), qualquer que seja a largura
      const w = grpA.scrollWidth;
      if (w) track.style.setProperty('--tk-dur', `${Math.max(20, Math.round(w / 45))}s`);
    };
    const queue = () => { if (!syncQ) { syncQ = true; requestAnimationFrame(sync); } };
    new MutationObserver(queue).observe(grpA, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'title'] });
    window.addEventListener('resize', queue);
    sync();
    // clique na cópia faz o mesmo que no original
    grpB.addEventListener('click', (e) => {
      const it = e.target.closest('.item');
      const orig = it && grpA.querySelector(`.item[data-symbol="${it.dataset.symbol}"]`);
      if (orig) orig.click();
    });
  }

  css.textContent += `
  .ticker.tk-marquee { display:flex !important; align-items:center; gap:4px; overflow:hidden !important; padding:4px 4px 4px 0; -webkit-mask-image:none !important; mask-image:none !important; }
  .tk-marquee .tk-vp { flex:1; min-width:0; overflow:hidden;
    -webkit-mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent); mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent); }
  .tk-marquee .tk-track { display:flex; width:max-content; animation:tkRun var(--tk-dur, 60s) linear infinite; }
  .tk-marquee:hover .tk-track, .tk-marquee:focus-within .tk-track { animation-play-state:paused; }
  .tk-marquee .tk-grp { display:flex; flex:0 0 auto; align-items:center; }
  .tk-marquee .item { flex:0 0 auto; overflow:visible; position:relative; padding:5px 14px; }
  .tk-marquee .item + .item::before { content:''; position:absolute; left:0; top:50%; width:3px; height:3px; margin-top:-1.5px; border-radius:50%; background:var(--text-3); opacity:.5; }
  .tk-marquee .tk-grp + .tk-grp > .item:first-child::before { content:''; position:absolute; left:0; top:50%; width:3px; height:3px; margin-top:-1.5px; border-radius:50%; background:var(--text-3); opacity:.5; }
  .tk-marquee .refresh-btn { flex:0 0 auto; }
  @keyframes tkRun { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  html[data-motion="off"] .tk-marquee .tk-clone { display:none; }
  html[data-motion="off"] .tk-marquee .tk-vp { overflow-x:auto; scrollbar-width:none; -webkit-mask-image:none; mask-image:none; }
  @media (prefers-reduced-motion: reduce) {
    .tk-marquee .tk-track { animation:none; }
    .tk-marquee .tk-clone { display:none; }
    .tk-marquee .tk-vp { overflow-x:auto; scrollbar-width:none; -webkit-mask-image:none; mask-image:none; }
  }
  @media (max-width: 640px) { .tk-marquee .item { padding:4px 10px; } }
  `;
})();
