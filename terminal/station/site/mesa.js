/* =========================================================
   MESA (aba "Mesa"): tudo o que o trader precisa numa tela só.
   Cripto no topo, cards de destaque, índices das Américas, Europa e Ásia,
   moedas (cesta do DXY e emergentes), commodities, futuros e juros dos EUA,
   curva de juros do Tesouro Direto e as últimas notícias do painel.
   Fontes: Yahoo (lote /quotes do worker), Tesouro Direto (/tesouro), CDS (/cds),
   FRED (meta do Fed), BCB/SGS (Selic). Regra do painel: se a fonte falhar, mostra "—".
   O arquivo só é baixado na primeira vez que a aba é aberta.
   ========================================================= */
(() => {
  if (window.__mesaLoaded) return;
  window.__mesaLoaded = true;
  const root = document.getElementById('mesa-root');
  const panel = document.getElementById('mesa-panel');
  if (!root || !panel) return;

  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = async (url, ms = 20000) => {
    const r = await fetchT(url, {}, ms);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const nf = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (v, d = 2) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', ',')}%`);
  const cls = (v) => (v == null || !isFinite(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq');
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hhmm = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return sameDay(d, new Date()) ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ---------------- o que aparece na tela ---------------- */
  // [símbolo do Yahoo, nome, sigla do país/região, casas decimais]
  const CRYPTO = [['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ethereum'], ['USDT-USD', 'Tether'], ['BNB-USD', 'BNB'], ['XRP-USD', 'XRP'],
    ['SOL-USD', 'Solana'], ['DOGE-USD', 'Dogecoin'], ['USDC-USD', 'USDC'], ['ADA-USD', 'Cardano']];
  const CARDS = [
    { s: '^BVSP', n: 'Ibovespa', d: 0, pre: '' },
    { s: 'BRL=X', n: 'Dólar (USD/BRL)', d: 4, pre: 'R$ ' },
    { s: 'DX-Y.NYB', n: 'Índice dólar (DXY)', d: 2, pre: '' },
    { s: 'ES=F', n: 'S&P 500 futuro', d: 2, pre: '' },
    { s: 'BZ=F', n: 'Petróleo Brent', d: 2, pre: 'US$ ' },
    { s: '__juros', n: 'Juros: Fed e Selic' }
  ];
  const TABLES = [
    { id: 'am', col: 1, t: 'Índices das Américas', rows: [['^BVSP', 'Ibovespa', 'BR', 2], ['^GSPC', 'S&P 500', 'US'], ['^DJI', 'Dow Jones', 'US'], ['^IXIC', 'Nasdaq', 'US'],
      ['^RUT', 'Russell 2000', 'US'], ['^VIX', 'VIX (volatilidade)', 'US'], ['^GSPTSE', 'S&P/TSX', 'CA'], ['^MXX', 'S&P/BMV IPC', 'MX'], ['^MERV', 'Merval', 'AR']] },
    { id: 'eu', col: 1, t: 'Índices europeus', rows: [['^STOXX50E', 'Euro Stoxx 50', 'EU'], ['^GDAXI', 'DAX', 'DE'], ['^FCHI', 'CAC 40', 'FR'], ['^FTSE', 'FTSE 100', 'UK'],
      ['FTSEMIB.MI', 'FTSE MIB', 'IT'], ['^IBEX', 'IBEX 35', 'ES'], ['^SSMI', 'SMI', 'CH'], ['^AEX', 'AEX', 'NL']] },
    { id: 'as', col: 1, t: 'Índices asiáticos', rows: [['^N225', 'Nikkei 225', 'JP'], ['^HSI', 'Hang Seng', 'HK'], ['000001.SS', 'Shanghai', 'CN'], ['399001.SZ', 'Shenzhen', 'CN'],
      ['^KS11', 'KOSPI', 'KR'], ['^TWII', 'Taiwan', 'TW'], ['^AXJO', 'S&P/ASX 200', 'AU'], ['^BSESN', 'Sensex', 'IN']] },
    { id: 'dx', col: 2, t: 'Cesta do DXY', rows: [['DX-Y.NYB', 'DXY', 'US'], ['EUR=X', 'USD/EUR', 'EU', 4], ['JPY=X', 'USD/JPY', 'JP'], ['GBP=X', 'USD/GBP', 'UK', 4],
      ['CAD=X', 'USD/CAD', 'CA', 4], ['SEK=X', 'USD/SEK', 'SE', 4], ['CHF=X', 'USD/CHF', 'CH', 4]] },
    { id: 'em', col: 2, t: 'Moedas emergentes', rows: [['BRL=X', 'USD/BRL', 'BR', 4], ['MXN=X', 'USD/MXN', 'MX', 4], ['CLP=X', 'USD/CLP', 'CL'], ['COP=X', 'USD/COP', 'CO'],
      ['ARS=X', 'USD/ARS', 'AR'], ['CNY=X', 'USD/CNY', 'CN', 4], ['INR=X', 'USD/INR', 'IN'], ['ZAR=X', 'USD/ZAR', 'ZA', 4], ['TRY=X', 'USD/TRY', 'TR', 4],
      ['AUD=X', 'USD/AUD', 'AU', 4], ['EURBRL=X', 'EUR/BRL', 'BR', 4]] },
    { id: 'co', col: 3, t: 'Commodities', rows: [['TIO=F', 'Minério de ferro', 'SG'], ['GC=F', 'Ouro', 'US'], ['SI=F', 'Prata', 'US'], ['HG=F', 'Cobre', 'US', 3],
      ['BZ=F', 'Petróleo Brent', 'UK'], ['CL=F', 'Petróleo WTI', 'US'], ['NG=F', 'Gás natural', 'US', 3], ['ZS=F', 'Soja', 'US'], ['ZC=F', 'Milho', 'US'],
      ['KC=F', 'Café', 'US'], ['SB=F', 'Açúcar', 'US']] },
    { id: 'ou', col: 3, t: 'Futuros, juros e risco', rows: [['ES=F', 'S&P 500 futuro', 'US'], ['NQ=F', 'Nasdaq futuro', 'US'], ['YM=F', 'Dow Jones futuro', 'US', 0],
      ['RTY=F', 'Russell 2000 futuro', 'US'], ['^IRX', 'Treasury 3 meses', 'US', 3], ['^FVX', 'Treasury 5 anos', 'US', 3], ['^TNX', 'Treasury 10 anos', 'US', 3],
      ['^TYX', 'Treasury 30 anos', 'US', 3], ['EWZ', 'EWZ (Brasil em NY)', 'BR'], ['__cds', 'CDS Brasil 5 anos', 'BR']] }
  ];
  // datas de decisão do Fed e do Copom vêm do index.html (FOMC_DECISIONS e COPOM_DECISIONS)
  const FOMC = (typeof FOMC_DECISIONS !== 'undefined' && FOMC_DECISIONS.length) ? FOMC_DECISIONS : ['2026-10-28', '2026-12-09'];

  const SYMS = [...new Set([...CRYPTO.map((c) => c[0]), ...CARDS.map((c) => c.s), ...TABLES.flatMap((t) => t.rows.map((r) => r[0]))])].filter((s) => !s.startsWith('__'));

  /* ---------------- dados ---------------- */
  const CACHE_KEY = 'mesa_cache_v1', CURVE_KEY = 'mesa_curva_v1';
  let Q = {}, X = { cds: null, fed: null, selic: null, min: null }, lastTs = 0, busy = false, errMsg = '';
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.q) {
      Q = c.q; X = { ...X, ...(c.x || {}) };
      Object.values(Q).forEach((q) => { q.live = false; });
      Object.values(X).forEach((q) => { if (q) q.live = false; });
    }
  } catch (e) { /* sem cache */ }
  const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), q: Q, x: X })); } catch (e) { /* cheio */ } };

  async function loadQuotes() {
    const parts = [];
    for (let i = 0; i < SYMS.length; i += 45) parts.push(SYMS.slice(i, i + 45));
    let ok = 0;
    const res = await Promise.allSettled(parts.map((p) => getJSON(`${PROXY}/quotes?symbols=${encodeURIComponent(p.join(','))}`)));
    res.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      Object.entries(r.value || {}).forEach(([sym, chart]) => {
        try {
          const v = parseYahooChart(chart);
          if (v.value == null || !isFinite(v.value)) return;
          Q[sym] = { v: v.value, c: v.change, ts: v.ts, sp: (v.sparkline || []).filter((x) => x != null), live: true };
          ok++;
        } catch (e) { /* sem dados desse ativo: fica o último valor salvo, marcado como antigo */ }
      });
    });
    return ok;
  }
  async function loadExtras() {
    const [cds, fu, fl, se, mi] = await Promise.allSettled([
      getJSON(`${PROXY}/cds`),
      getJSON(`${PROXY}/fred/series?id=DFEDTARU&units=lin&limit=1`),
      getJSON(`${PROXY}/fred/series?id=DFEDTARL&units=lin&limit=1`),
      getJSON(`${PROXY}/bcb?c=432&q=${encodeURIComponent('/ultimos/1')}`).catch(() => getJSON('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json')),
      getJSON(`${PROXY}/minerio`)
    ]);
    // minério: rota própria do worker (Investing/SGX em US$, ou Dalian em yuan); o TIO=F do Yahoo fica só de reserva
    const m = mi.status === 'fulfilled' ? mi.value : null;
    if (m && m.valor != null && isFinite(m.valor)) X.min = { v: m.valor, c: m.variacao, ts: m.ts || Date.now(), moeda: m.moeda, mercado: m.mercado, live: true };
    if (cds.status === 'fulfilled' && cds.value?.valor != null) X.cds = { v: cds.value.valor, c: cds.value.variacao, ts: cds.value.ts || Date.now(), live: true };
    const up = fu.status === 'fulfilled' ? fu.value?.obs?.[0] : null, lo = fl.status === 'fulfilled' ? fl.value?.obs?.[0] : null;
    if (up && lo) X.fed = { lo: +lo[1], up: +up[1], d: up[0], live: true };
    const s = se.status === 'fulfilled' && Array.isArray(se.value) ? se.value[se.value.length - 1] : null;
    if (s) X.selic = { v: parseFloat(s.valor), d: s.data, live: true };
  }
  async function refresh(force) {
    if (busy) return;
    busy = true;
    root.querySelector('.ms-refresh')?.classList.add('busy');
    // valores vindos do cache ficam marcados como antigos até chegar o novo
    Object.values(Q).forEach((q) => { q.live = false; });
    Object.values(X).forEach((q) => { if (q) q.live = false; });
    try {
      const [n] = await Promise.all([loadQuotes(), loadExtras(), force || !curve || Date.now() - curve.ts > 30 * 60 * 1000 ? loadCurve() : null]);
      errMsg = n ? '' : `Sem conexão com o servidor de cotações agora.${Object.keys(Q).length ? ' Mostrando os últimos valores salvos.' : ''}`;
      if (n) { lastTs = Date.now(); saveCache(); }
    } catch (e) { errMsg = 'Falha ao atualizar. Mostrando os últimos valores salvos.'; }
    finally { busy = false; root.querySelector('.ms-refresh')?.classList.remove('busy'); }
    render();
  }

  /* ---------------- curva de juros (Tesouro Direto) ---------------- */
  let curve = null, curveErr = '', curveKind = 'pre', curveCmp = null;
  const parseVenc = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  function curvePoints(tit, kind) {
    const now = Date.now();
    return (tit || []).filter((t) => {
      const n = String(t[0] || t.nome || '');
      if (/renda\+|educa\+|selic/i.test(n)) return false;
      return kind === 'pre' ? /prefixado/i.test(n) : /ipca\+/i.test(n);
    }).map((t) => {
      const nome = t.nome ?? t[0], taxa = t.taxa ?? t[1], venc = parseVenc(t.vencimento ?? t[2]);
      return venc ? { nome, taxa, venc, y: (venc - now) / (365.25 * 86400000) } : null;
    }).filter((p) => p && p.y > 0 && isFinite(p.taxa)).sort((a, b) => a.y - b.y);
  }
  function loadSnaps() { try { return JSON.parse(localStorage.getItem(CURVE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  // curvas diárias de até 400 dias, gravadas pelo robô do GitHub (historico/curva.json, fonte Tesouro Transparente)
  const HIST_CURVA = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/historico/curva.json', 'historico/curva.json'];
  let histCurva = null, histCurvaTentou = false;
  async function loadHistCurva() {
    if (histCurvaTentou) return;
    histCurvaTentou = true;
    for (const u of HIST_CURVA) {
      try { const j = await getJSON(u); if (j && j.dias && Object.keys(j.dias).length) { histCurva = j.dias; break; } } catch (e) { /* tenta a próxima */ }
    }
    if (histCurva && root) { const b = root.querySelector('.ms-curvebox'); if (b) { b.innerHTML = curveHTML(); drawCurve(); } }
  }
  // dias guardados no navegador + histórico do GitHub (o oficial vale quando os dois têm o mesmo dia)
  const allSnaps = () => ({ ...loadSnaps(), ...(histCurva || {}) });
  // curva DI x pré da B3 (robô curva.yml, terminal/curva/curva.json): último pregão, anterior, 1 semana e 1 mês
  const DI_URL = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/curva/curva.json';
  const DI_CMP = [['ontem', 'pregão anterior'], ['semana', '1 semana'], ['mes', '1 mês']];
  let diCurvas = null, diTentou = 0, diCmp = 'semana';
  async function loadDI() {
    if (diCurvas || Date.now() - diTentou < 60000) return;
    diTentou = Date.now();
    try { const j = await getJSON(DI_URL); if (j && j.curvas && j.curvas.hoje) diCurvas = j.curvas; } catch (e) { /* fica sem */ }
    if (diCurvas && root && curveKind === 'di') { const b = root.querySelector('.ms-curvebox'); if (b) { b.innerHTML = curveHTML(); drawCurve(); } }
  }
  const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function diPoints(c) {
    if (!c || !c.v) return [];
    const d0 = new Date(c.d + 'T12:00:00');
    return c.v.map(([, dc, taxa]) => {
      const venc = new Date(d0.getTime() + dc * 86400000), y = dc / 365.25;
      return { nome: `DI ${MES3[venc.getMonth()]}/${venc.getFullYear()}`, taxa, venc, y };
    }).filter((p) => p.y > 0.05 && p.y <= 10.5 && isFinite(p.taxa));
  }
  async function loadCurve() {
    loadHistCurva();
    try {
      const j = await getJSON(`${PROXY}/tesouro`);
      if (!Array.isArray(j.titulos) || !j.titulos.length) throw new Error('vazio');
      curve = { t: j.titulos, ts: j.ts || Date.now() };
      curveErr = '';
      // guarda a curva do dia para comparar depois (até 60 dias)
      const snaps = loadSnaps();
      snaps[isoDay()] = j.titulos.filter((t) => /prefixado|ipca\+/i.test(t.nome) && !/renda\+|educa\+/i.test(t.nome)).map((t) => [t.nome, t.taxa, t.vencimento]);
      Object.keys(snaps).sort().slice(0, -60).forEach((k) => delete snaps[k]);
      try { localStorage.setItem(CURVE_KEY, JSON.stringify(snaps)); } catch (e) { /* cheio */ }
    } catch (e) {
      curveErr = 'Tesouro Direto indisponível agora.';
      const snaps = allSnaps(), k = Object.keys(snaps).sort().pop();
      if (!curve && k) { curve = { t: snaps[k].map(([nome, taxa, vencimento]) => ({ nome, taxa, vencimento })), ts: new Date(k + 'T12:00:00').getTime(), old: true }; }
    }
  }
  // o histórico oficial traz também títulos que não estão mais à venda: compara só os mesmos títulos da curva de hoje
  const mesmos = (cmp, pts) => { const f = cmp.filter((c) => pts.some((q) => +q.venc === +c.venc && /semestr/i.test(q.nome) === /semestr/i.test(c.nome))); return f.length >= 2 ? f : cmp; };
  const interp = (pts, y) => {
    if (pts.length < 2 || y < pts[0].y || y > pts[pts.length - 1].y) return null;
    for (let i = 1; i < pts.length; i++) if (pts[i].y >= y) { const a = pts[i - 1], b = pts[i]; return a.taxa + (b.taxa - a.taxa) * (y - a.y) / ((b.y - a.y) || 1); }
    return null;
  };
  function curveHTML() {
    if (curveKind === 'di') return curveHTMLdi();
    const snaps = allSnaps();
    const todos = Object.keys(snaps).filter((k) => k !== isoDay()).sort().reverse();
    const days = todos.slice(0, 10);
    // datas mais antigas: o dia guardado mais perto de 1, 3, 6 e 12 meses atrás
    const marcos = {};
    [[30, '1 mês'], [91, '3 meses'], [182, '6 meses'], [365, '1 ano']].forEach(([n, l]) => {
      const alvo = new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
      const k = todos.find((d) => d <= alvo);
      if (k && !days.includes(k) && !marcos[k] && (Date.parse(alvo) - Date.parse(k)) < 10 * 86400000) { days.push(k); marcos[k] = l; }
    });
    if (curveCmp && !days.includes(curveCmp)) curveCmp = null;
    if (curveCmp === null && days.length) {
      // padrão: o dia guardado mais perto de 1 semana atrás
      const alvo = Date.now() - 7 * 86400000;
      curveCmp = days.reduce((m, k) => (Math.abs(new Date(k + 'T12:00:00') - alvo) < Math.abs(new Date(m + 'T12:00:00') - alvo) ? k : m), days[0]);
    }
    const pts = curve ? curvePoints(curve.t, curveKind) : [];
    const cmp = curveCmp && snaps[curveCmp] ? mesmos(curvePoints(snaps[curveCmp], curveKind), pts) : [];
    const s2 = interp(pts, 2), s5 = interp(pts, 5);
    const slope = s2 != null && s5 != null ? Math.round((s5 - s2) * 100) : null;
    const c2 = interp(cmp, 2), c5 = interp(cmp, 5);
    const dSlope = slope != null && c2 != null && c5 != null ? slope - Math.round((c5 - c2) * 100) : null;
    const fmtDay = (k) => (marcos[k] ? `${k.split('-').reverse().join('/').replace(/\/(\d{2})(\d{2})$/, '/$2')} (${marcos[k]})` : k.split('-').reverse().slice(0, 2).join('/'));
    return `
      <div class="ms-head"><h3>Curva de juros</h3><span class="sp"></span>${segHTML()}</div>
      <div class="ms-curve-sub">
        <span>${slope != null ? `Inclinação 2a–5a: <b>${slope > 0 ? '+' : ''}${slope} bps</b>${dSlope != null ? ` · <span class="${cls(dSlope)}">${dSlope > 0 ? '+' : ''}${dSlope} bps</span> desde ${fmtDay(curveCmp)}` : ''}` : (pts.length ? 'Inclinação 2a–5a: —' : '')}</span>
        <span class="sp"></span>
        <label>Comparar com <select class="ms-cmp" ${days.length ? '' : 'disabled'}>${days.length ? `<option value="">Sem comparação</option>${days.map((k) => `<option value="${k}" ${k === curveCmp ? 'selected' : ''}>${fmtDay(k)}</option>`).join('')}` : '<option>sem histórico ainda</option>'}</select></label>
      </div>
      <div class="ms-curve" data-n="${pts.length}">${pts.length >= 2 ? '' : `<div class="ms-empty">${curve ? 'Sem títulos desse tipo no arquivo do Tesouro.' : (curveErr || 'Carregando curva…')}</div>`}</div>
      <div class="ms-foot">${curve ? `Taxas de compra do Tesouro Direto${curve.old ? `, salvas em ${new Date(curve.ts).toLocaleDateString('pt-BR')} (fonte fora do ar agora)` : `, ${new Date(curve.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}.` : ''}${histCurva ? ' Curvas anteriores: Tesouro Transparente.' : days.length ? '' : ' A comparação aparece a partir do segundo dia de uso, com as curvas que o painel guarda.'}</div>`;
  }
  const segHTML = () => `<div class="ms-seg" role="group" aria-label="Tipo de curva">
          <button type="button" data-curve="pre" class="${curveKind === 'pre' ? 'on' : ''}" title="Tesouro Prefixado">Pré</button>
          <button type="button" data-curve="ipca" class="${curveKind === 'ipca' ? 'on' : ''}" title="Tesouro IPCA+ (juro real)">IPCA+</button>
          <button type="button" data-curve="di" class="${curveKind === 'di' ? 'on' : ''}" title="Curva DI x pré da B3 (DI futuro)">DI</button>
        </div>`;
  function curveHTMLdi() {
    loadDI();
    const C = diCurvas || {};
    const pts = diPoints(C.hoje), cmp = diCmp && C[diCmp] ? diPoints(C[diCmp]) : [];
    const s2 = interp(pts, 2), s5 = interp(pts, 5), c2 = interp(cmp, 2), c5 = interp(cmp, 5);
    const slope = s2 != null && s5 != null ? Math.round((s5 - s2) * 100) : null;
    const dSlope = slope != null && c2 != null && c5 != null ? slope - Math.round((c5 - c2) * 100) : null;
    const dd = (k) => (C[k] ? C[k].d.split('-').reverse().slice(0, 2).join('/') : '');
    const opts = DI_CMP.filter(([k]) => C[k]);
    return `
      <div class="ms-head"><h3>Curva de juros</h3><span class="sp"></span>${segHTML()}</div>
      <div class="ms-curve-sub">
        <span>${slope != null ? `Inclinação 2a–5a: <b>${slope > 0 ? '+' : ''}${slope} bps</b>${dSlope != null ? ` · <span class="${cls(dSlope)}">${dSlope > 0 ? '+' : ''}${dSlope} bps</span> desde ${dd(diCmp)}` : ''}` : (pts.length ? 'Inclinação 2a–5a: —' : '')}</span>
        <span class="sp"></span>
        <label>Comparar com <select class="ms-cmp" ${opts.length ? '' : 'disabled'}>${opts.length ? `<option value="">Sem comparação</option>${opts.map(([k, l]) => `<option value="${k}" ${k === diCmp ? 'selected' : ''}>${dd(k)} (${l})</option>`).join('')}` : '<option>—</option>'}</select></label>
      </div>
      <div class="ms-curve" data-n="${pts.length}">${pts.length >= 2 ? '' : `<div class="ms-empty">${diTentou && !diCurvas ? 'Curva DI indisponível agora.' : 'Carregando curva…'}</div>`}</div>
      <div class="ms-foot">${C.hoje ? `Curva DI x pré da B3 (DI futuro), fechamento de ${C.hoje.d.split('-').reverse().join('/')}; atualiza à noite. Fonte: B3, Taxas de Swap.` : ''}</div>`;
  }
  function drawCurve() {
    const box = root.querySelector('.ms-curve');
    const di = curveKind === 'di';
    if (!box || (!di && !curve)) return;
    const pts = di ? diPoints(diCurvas?.hoje) : curvePoints(curve.t, curveKind);
    if (pts.length < 2) return;
    const snaps = di ? null : allSnaps();
    const cmpKey = di ? diCmp : curveCmp;
    const cmp = di ? (diCmp && diCurvas?.[diCmp] ? diPoints(diCurvas[diCmp]) : []) : (curveCmp && snaps[curveCmp] ? mesmos(curvePoints(snaps[curveCmp], curveKind), pts) : []);
    const W = Math.max(260, box.clientWidth), H = 220, L = 44, R = 12, T = 12, B = 24;
    const all = [...pts, ...cmp];
    let y0 = Math.min(...all.map((p) => p.taxa)), y1 = Math.max(...all.map((p) => p.taxa));
    const pad = Math.max(0.1, (y1 - y0) * 0.12); y0 -= pad; y1 += pad;
    const xMax = Math.max(...all.map((p) => p.y));
    const PX = (y) => L + (y / xMax) * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    const path = (ps) => ps.map((p, i) => `${i ? 'L' : 'M'}${PX(p.y).toFixed(1)},${Y(p.taxa).toFixed(1)}`).join('');
    const ticks = 5, yt = [...Array(ticks)].map((_, i) => y0 + (y1 - y0) * i / (ticks - 1));
    const years = [...new Set(pts.map((p) => p.venc.getFullYear()))];
    const step = Math.ceil(years.length / Math.max(2, Math.floor((W - L) / 56)));
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Curva de juros ${curveKind === 'pre' ? 'prefixada' : 'IPCA+'}">
      ${yt.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="g"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${nf(v, 2)}</text>`).join('')}
      ${years.filter((_, i) => i % step === 0).map((yr) => { const p = pts.find((q) => q.venc.getFullYear() === yr); return `<text x="${PX(p.y).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax">${yr}</text>`; }).join('')}
      ${cmp.length >= 2 ? `<path d="${path(cmp)}" class="cmp"/>` : ''}
      <path d="${path(pts)}" class="ln"/>
      ${di ? '' : pts.map((p, i) => `<circle cx="${PX(p.y).toFixed(1)}" cy="${Y(p.taxa).toFixed(1)}" r="3" class="pt" data-i="${i}"/>`).join('')}
      <line class="hv" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/>
    </svg><div class="ms-tip" hidden></div>`;
    const svg = box.querySelector('svg'), tip = box.querySelector('.ms-tip'), hv = box.querySelector('.hv');
    const show = (ev) => {
      const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (W / r.width);
      let best = pts[0], bd = Infinity;
      pts.forEach((p) => { const d = Math.abs(PX(p.y) - x); if (d < bd) { bd = d; best = p; } });
      const cx = PX(best.y);
      hv.setAttribute('x1', cx); hv.setAttribute('x2', cx); hv.style.display = '';
      svg.querySelectorAll('.pt').forEach((c) => c.classList.toggle('on', +c.dataset.i === pts.indexOf(best)));
      const old = cmp.length ? interp(cmp, best.y) : null;
      const bp = old != null ? Math.round((best.taxa - old) * 100) : null;
      tip.hidden = false;
      const desde = di ? diCurvas[diCmp].d : cmpKey;
      tip.innerHTML = `<b>${esc(best.nome)}</b><span>${nf(best.taxa, 2)}% ao ano${curveKind === 'ipca' ? ' + IPCA' : ''}</span>${bp != null ? `<span class="${cls(bp)}">${bp > 0 ? '+' : ''}${bp} bps desde ${desde.split('-').reverse().slice(0, Date.now() - Date.parse(desde) > 300 * 86400000 ? 3 : 2).join('/')}</span>` : ''}`;
      const left = (cx / W) * r.width;
      tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', () => { tip.hidden = true; hv.style.display = 'none'; svg.querySelectorAll('.pt.on').forEach((c) => c.classList.remove('on')); });
  }

  /* ---------------- desenho ---------------- */
  const spark = (vals, up) => {
    if (!vals || vals.length < 2) return '';
    const w = 120, h = 30, mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
    const p = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${p}" fill="none" stroke="var(${up ? '--pos' : '--neg'})" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const dec = (v, d) => (d != null ? d : Math.abs(v) >= 10000 ? 2 : Math.abs(v) < 10 ? 4 : 2);
  function rowHTML([s, n, cc, d], tid) {
    let q = s === '__cds' ? X.cds : Q[s];
    if (s === 'TIO=F' && X.min && (X.min.live || !(q && q.live))) {
      q = X.min;
      n = X.min.mercado === 'DCE' ? 'Minério de ferro (Dalian, ¥/t)' : 'Minério de ferro (US$/t)';
      cc = X.min.mercado === 'DCE' ? 'CN' : 'SG';
    }
    const has = q && q.v != null && isFinite(q.v);
    const stale = has && !q.live;
    const tag = s === '__cds' ? '' : ` data-sym="${esc(s)}" data-tb="${tid}" role="button" tabindex="0" title="Abrir o gráfico de ${esc(n)}"`;
    return `<tr class="${stale ? 'old' : ''}"${tag}>
      <td class="nm"><span class="cc">${esc(cc)}</span>${esc(n)}</td>
      <td class="px">${has ? nf(q.v, dec(q.v, d)) : '—'}</td>
      <td class="ch ${cls(has ? q.c : null)}">${has ? pct(q.c) : '—'}</td>
      <td class="tm">${has ? (stale ? '<i title="Valor salvo; a fonte não respondeu agora">salvo</i>' : hhmm(q.ts)) : ''}</td>
    </tr>`;
  }
  const tableHTML = (t) => `<section class="ms-box ms-tb" data-tb="${t.id}">
      <div class="ms-head"><h3>${esc(t.t)}</h3></div>
      <table><tbody>${t.rows.map((r) => rowHTML(r, t.id)).join('')}</tbody></table>
    </section>`;
  function cardHTML(c) {
    if (c.s === '__juros') {
      const f = X.fed, s = X.selic;
      const today = isoDay();
      const nextF = FOMC.find((d) => d >= today), nextC = (typeof COPOM_DECISIONS !== 'undefined' ? COPOM_DECISIONS : []).find((d) => d >= today);
      const dm = (d) => d ? d.split('-').reverse().slice(0, 2).join('/') : '—';
      return `<div class="ms-card ms-jur">
        <div class="ms-ct"><span>${esc(c.n)}</span></div>
        <div class="ms-jr"><em>Fed</em><b>${f ? `${nf(f.lo, 2)}–${nf(f.up, 2)}%` : '—'}</b></div>
        <div class="ms-jr"><em>Selic</em><b>${s ? `${nf(s.v, 2)}%` : '—'}</b></div>
        <div class="ms-jn" title="Próximas decisões de juros: Fed (FOMC) e Copom">FOMC ${dm(nextF)} · Copom ${dm(nextC)}</div>
      </div>`;
    }
    const q = Q[c.s], has = q && q.v != null && isFinite(q.v);
    return `<div class="ms-card ${has ? cls(q.c) : ''} ${has && !q.live ? 'old' : ''}" data-sym="${esc(c.s)}" data-name="${esc(c.n)}" role="button" tabindex="0" title="Abrir o gráfico de ${esc(c.n)}">
      <div class="ms-ct"><span>${esc(c.n)}</span><em class="${cls(has ? q.c : null)}">${has ? pct(q.c) : '—'}</em></div>
      <div class="ms-cv">${has ? esc(c.pre) + nf(q.v, c.d) : '—'}</div>
      <div class="ms-cs">${has ? spark(q.sp, q.c >= 0) : ''}</div>
    </div>`;
  }
  function cryptoHTML() {
    return CRYPTO.map(([s, n]) => {
      const q = Q[s], has = q && q.v != null && isFinite(q.v);
      return `<button type="button" class="ms-cr ${has && !q.live ? 'old' : ''}" data-sym="${esc(s)}" data-name="${esc(n)}" title="Abrir o gráfico de ${esc(n)}"><span>${esc(n)}</span><b>${has ? 'US$ ' + nf(q.v, q.v < 2 ? 4 : 2) : '—'}</b><em class="${cls(has ? q.c : null)}">${has ? pct(q.c) : ''}</em></button>`;
    }).join('');
  }
  function newsHTML() {
    const list = (typeof newsAll !== 'undefined' && Array.isArray(newsAll) ? newsAll : []).filter((n) => n && n.titulo && n.data).slice().sort((a, b) => b.data - a.data).slice(0, 14);
    if (!list.length) return '<div class="ms-empty">Carregando notícias…</div>';
    return `<ul class="ms-news">${list.map((n) => {
      const fonte = n.fonte === 'Google News' ? (n.veiculo || 'Google News') : n.fonte;
      const t = new Date(n.data), recent = Date.now() - n.data < 60 * 60 * 1000;
      return `<li><a href="${esc(n.link || '#')}" target="_blank" rel="noopener"><span class="tt">${esc(n.titulo)}</span><span class="src">${esc(fonte || '')}</span><span class="hr ${recent ? 'new' : ''}">${sameDay(t, new Date()) ? t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span></a></li>`;
    }).join('')}</ul>`;
  }

  function render() {
    const col = (n) => TABLES.filter((t) => t.col === n).map(tableHTML).join('');
    const sc = root.querySelector('.ms-wrap')?.scrollTop || 0;
    root.innerHTML = `<div class="ms-wrap">
      <div class="ms-bar">
        <div class="ms-info"><span class="dot ${errMsg ? 'bad' : ''}"></span>${errMsg ? `<span class="dn">${esc(errMsg)}</span>` : lastTs ? `Atualizado às <b>${new Date(lastTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b> · a cada 2 min com a aba aberta` : busy ? 'Carregando cotações…' : 'Últimos valores salvos'}</div>
        <button type="button" class="btn-sm ms-refresh ${busy ? 'busy' : ''}" title="Atualizar tudo"><i class="fas fa-sync-alt"></i> Atualizar</button>
      </div>
      <div class="ms-crypto">${cryptoHTML()}</div>
      <div class="ms-cards">${CARDS.map(cardHTML).join('')}</div>
      <div class="ms-grid">
        <div class="ms-col">${col(1)}</div>
        <div class="ms-col">${col(2)}</div>
        <div class="ms-col">${col(3)}</div>
        <div class="ms-col ms-c4">
          <section class="ms-box ms-curvebox">${curveHTML()}</section>
          <section class="ms-box ms-newsbox"><div class="ms-head"><h3>Notícias</h3><span class="sp"></span><button type="button" class="ms-link" data-go="news-panel">Ver todas</button></div>${newsHTML()}</section>
        </div>
      </div>
      <p class="ms-note">Cotações via Yahoo Finance (podem ter atraso de até 15 min), Tesouro Direto, Investing (CDS), FRED e Banco Central. Clique em qualquer ativo para abrir o gráfico.</p>
    </div>`;
    const w = root.querySelector('.ms-wrap'); if (w) w.scrollTop = sc;
    requestAnimationFrame(drawCurve);
  }

  /* ---------------- interação ---------------- */
  function openChart(sym, name, list) {
    const quote = (k) => { const q = Q[k]; return q && q.v != null ? { value: q.v, change: q.c } : null; };
    if (typeof window.openAssetChart === 'function') window.openAssetChart(sym, name, list, quote);
  }
  const listOf = (tid) => {
    const t = TABLES.find((x) => x.id === tid);
    return t ? t.rows.filter((r) => !r[0].startsWith('__')).map((r) => ({ s: r[0], n: r[1] })) : null;
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('.ms-refresh')) { refresh(true); return; }
    const cv = e.target.closest('[data-curve]');
    if (cv) { curveKind = cv.dataset.curve; const b = root.querySelector('.ms-curvebox'); if (b) { b.innerHTML = curveHTML(); drawCurve(); } return; }
    const go = e.target.closest('[data-go]');
    if (go) { switchTab(go.dataset.go); return; }
    const tr = e.target.closest('tr[data-sym]');
    if (tr) { openChart(tr.dataset.sym, tr.querySelector('.nm')?.lastChild?.textContent || tr.dataset.sym, listOf(tr.dataset.tb)); return; }
    const c = e.target.closest('.ms-card[data-sym], .ms-cr[data-sym]');
    if (c) {
      const group = c.classList.contains('ms-cr') ? CRYPTO.map(([s, n]) => ({ s, n })) : CARDS.filter((x) => !x.s.startsWith('__')).map((x) => ({ s: x.s, n: x.n }));
      openChart(c.dataset.sym, c.dataset.name, group);
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest?.('tr[data-sym], .ms-card[data-sym]');
    if (t && e.target === t) { e.preventDefault(); t.click(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.classList.contains('ms-cmp')) {
      if (curveKind === 'di') diCmp = e.target.value || ''; else curveCmp = e.target.value || '';
      const b = root.querySelector('.ms-curvebox'); if (b) { b.innerHTML = curveHTML(); drawCurve(); }
    }
  });
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (panel.classList.contains('active')) drawCurve(); }, 150); });

  // atualiza ao abrir a aba (se passou 1 min) e a cada 2 min com ela aberta; notícias seguem o painel de Notícias
  const active = () => panel.classList.contains('active') && !document.hidden;
  new MutationObserver(() => { if (panel.classList.contains('active') && Date.now() - lastTs > 60 * 1000) refresh(); else if (panel.classList.contains('active')) render(); })
    .observe(panel, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (active() && Date.now() - lastTs >= 2 * 60 * 1000) refresh(); }, 20 * 1000);
  setInterval(() => { if (active()) { const b = root.querySelector('.ms-newsbox'); if (b) b.innerHTML = b.querySelector('.ms-head').outerHTML + newsHTML(); } }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (active() && Date.now() - lastTs >= 2 * 60 * 1000) refresh(); });

  /* ---------------- estilos ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  #mesa-root { padding:0; overflow:hidden; display:flex; flex-direction:column; }
  .ms-wrap { flex:1; min-height:0; overflow-y:auto; padding:10px 18px 28px; }
  .ms-bar { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
  .ms-info { flex:1; min-width:0; font:11.5px 'JetBrains Mono', monospace; color:var(--text-3); }
  .ms-info b { color:var(--text-2); font-weight:600; }
  .ms-info .dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--pos); margin-right:7px; vertical-align:1px; }
  .ms-info .dot.bad { background:var(--neg); }
  .ms-refresh { display:inline-flex; align-items:center; gap:6px; }
  .ms-refresh.busy i { animation:spin .8s linear infinite; }
  .ms-wrap .up { color:var(--pos); } .ms-wrap .dn { color:var(--neg); } .ms-wrap .na, .ms-wrap .eq { color:var(--text-3); }

  .ms-crypto { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; margin-bottom:10px; }
  .ms-crypto::-webkit-scrollbar { display:none; }
  .ms-cr { flex:0 0 auto; display:inline-flex; align-items:baseline; gap:7px; padding:6px 11px; border:1px solid var(--line); border-radius:99px; background:var(--surface); color:var(--text-3); font:inherit; font-size:11.5px; cursor:pointer; white-space:nowrap; }
  .ms-cr b { font:600 12px 'JetBrains Mono', monospace; color:var(--text); }
  .ms-cr em { font:normal 11px 'JetBrains Mono', monospace; }
  .ms-cr:hover { border-color:var(--line-2); }
  .ms-cr.old b { color:var(--text-3); }

  .ms-cards { display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:10px; margin-bottom:12px; }
  .ms-card { position:relative; display:flex; flex-direction:column; gap:4px; padding:11px 13px 8px; border:1px solid var(--line); border-radius:12px; background:var(--surface); cursor:pointer; min-width:0; overflow:hidden; }
  .ms-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--line-2); }
  .ms-card.up::before { background:var(--pos); } .ms-card.dn::before { background:var(--neg); }
  .ms-card:hover { border-color:var(--line-2); }
  .ms-card:focus-visible, .ms-tb tr:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
  .ms-ct { display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--text-3); }
  .ms-ct span { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ms-ct em { font:normal 600 11px 'JetBrains Mono', monospace; padding:1px 6px; border-radius:6px; background:var(--surface-2); }
  .ms-cv { font:600 20px 'JetBrains Mono', monospace; color:var(--text); font-variant-numeric:tabular-nums; white-space:nowrap; letter-spacing:-.02em; }
  .ms-card.old .ms-cv { color:var(--text-2); }
  .ms-cs { height:26px; } .ms-cs svg { width:100%; height:26px; display:block; }
  .ms-jur { cursor:default; gap:3px; }
  .ms-jur::before { background:var(--info); }
  .ms-jr { display:flex; align-items:baseline; gap:8px; font-family:'JetBrains Mono', monospace; }
  .ms-jr em { font:normal 11px 'Inter', sans-serif; color:var(--text-3); width:34px; flex:0 0 34px; }
  .ms-jr b { font-size:15px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ms-jn { font-size:10.5px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:auto; }

  .ms-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)) minmax(0,1.35fr); gap:12px; align-items:start; }
  .ms-col { display:flex; flex-direction:column; gap:12px; min-width:0; }
  .ms-box { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; min-width:0; }
  .ms-head { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--surface-2) 70%, transparent); }
  .ms-head h3 { margin:0; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  .ms-head .sp, .ms-curve-sub .sp { flex:1; }
  .ms-tb table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .ms-tb tr { cursor:pointer; }
  .ms-tb tr:hover { background:var(--surface-2); }
  .ms-tb td { padding:5px 8px; font-size:12px; border-bottom:1px solid color-mix(in srgb, var(--line) 60%, transparent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ms-tb tr:last-child td { border-bottom:0; }
  .ms-tb td.nm { color:var(--text-2); padding-left:12px; }
  .ms-tb td.px { text-align:right; font-family:'JetBrains Mono', monospace; color:var(--text); font-variant-numeric:tabular-nums; }
  .ms-tb td.px { width:92px; }
  .ms-tb td.ch { text-align:right; width:66px; font-family:'JetBrains Mono', monospace; font-size:11.5px; }
  .ms-tb td.tm { text-align:right; width:56px; font:10.5px 'JetBrains Mono', monospace; color:var(--text-3); padding-right:12px; }
  .ms-tb td.tm i { font-style:normal; color:var(--accent); }
  .ms-tb tr.old td.px { color:var(--text-3); }
  .ms-tb tr:not([data-sym]) { cursor:default; }
  .cc { display:inline-block; min-width:22px; margin-right:7px; padding:0 3px; border-radius:4px; background:var(--surface-3); color:var(--text-3); font:600 9px 'JetBrains Mono', monospace; text-align:center; vertical-align:1px; }

  .ms-seg { display:inline-flex; gap:2px; padding:2px; border:1px solid var(--line); border-radius:8px; background:var(--surface); }
  .ms-seg button { border:0; background:none; color:var(--text-3); font:inherit; font-size:11px; font-weight:600; padding:3px 9px; border-radius:6px; cursor:pointer; }
  .ms-seg button.on { background:var(--accent-soft); color:var(--accent); }
  .ms-curve-sub { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 12px 0; font-size:11.5px; color:var(--text-3); }
  .ms-curve-sub b { color:var(--text); font-family:'JetBrains Mono', monospace; }
  .ms-curve-sub select { height:26px; padding:0 6px; font-size:11.5px; border-radius:7px; background:var(--surface-2); color:var(--text); border:1px solid var(--line-2); margin-left:4px; }
  .ms-curve { position:relative; padding:4px 6px 0; min-height:120px; }
  .ms-curve svg { display:block; width:100%; height:auto; touch-action:pan-y; }
  .ms-curve .g { stroke:var(--line); stroke-width:1; }
  .ms-curve .ax { fill:var(--text-3); font:10px 'JetBrains Mono', monospace; }
  .ms-curve .ln { fill:none; stroke:var(--accent); stroke-width:2; stroke-linejoin:round; }
  .ms-curve .cmp { fill:none; stroke:var(--text-3); stroke-width:1.4; stroke-dasharray:4 4; }
  .ms-curve .pt { fill:var(--surface); stroke:var(--accent); stroke-width:1.5; }
  .ms-curve .pt.on { fill:var(--accent); r:4.5; }
  .ms-curve .hv { stroke:var(--line-2); stroke-dasharray:3 3; }
  .ms-tip { position:absolute; top:6px; transform:translateX(-50%); display:flex; flex-direction:column; gap:2px; padding:7px 10px; border:1px solid var(--line-2); border-radius:9px; background:var(--surface-2); font-size:11.5px; color:var(--text-2); pointer-events:none; white-space:nowrap; box-shadow:var(--shadow-lg); }
  .ms-tip[hidden] { display:none; }
  .ms-tip b { color:var(--text); font-size:12px; }
  .ms-foot { padding:4px 12px 10px; font-size:10.5px; color:var(--text-3); line-height:1.5; }
  .ms-empty { padding:24px 12px; text-align:center; color:var(--text-3); font-size:12px; }

  .ms-news { list-style:none; margin:0; padding:0; max-height:520px; overflow-y:auto; }
  .ms-news li + li { border-top:1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  .ms-news a { display:grid; grid-template-columns:minmax(0,1fr) auto; grid-template-areas:'tt hr' 'src hr'; gap:2px 10px; padding:8px 12px; color:inherit; text-decoration:none; }
  .ms-news a:hover { background:var(--surface-2); }
  .ms-news .tt { grid-area:tt; font-size:12.5px; line-height:1.4; color:var(--text); }
  .ms-news .src { grid-area:src; font-size:10.5px; color:var(--text-3); }
  .ms-news .hr { grid-area:hr; align-self:start; font:600 10.5px 'JetBrains Mono', monospace; color:var(--text-3); padding:2px 6px; border-radius:6px; background:var(--surface-2); }
  .ms-news .hr.new { background:var(--neg); color:#fff; }
  .ms-link { border:0; background:none; color:var(--accent); font:inherit; font-size:11.5px; cursor:pointer; padding:0; }
  .ms-note { margin:14px 2px 0; font-size:11px; color:var(--text-3); }

  @media (min-width: 1501px) and (max-width: 1850px) { .ms-tb td.tm { display:none; } }
  @media (max-width: 1500px) { .ms-grid { grid-template-columns:repeat(2, minmax(0,1fr)); } .ms-c4 { grid-column:1 / -1; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:start; } }
  @media (max-width: 1250px) { .ms-cards { grid-template-columns:repeat(3, minmax(0,1fr)); } }
  @media (max-width: 860px) { .ms-grid, .ms-c4 { grid-template-columns:minmax(0,1fr); display:flex; flex-direction:column; } }
  @media (max-width: 640px) {
    .ms-wrap { padding:8px 10px 90px; }
    .ms-cards { grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
    .ms-cv { font-size:17px; }
    .ms-tb td.tm { display:none; }
  }
  `;
  document.head.appendChild(css);

  render();
  refresh(true);
})();
