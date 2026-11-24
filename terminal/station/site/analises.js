/* =========================================================
   ANÁLISES (código da aba Análises que ficava no app.js)
   20/11/2026: primeiro módulo tirado do app.js (que tinha 5.753 linhas), para cada aba ter o seu arquivo.
   O código é o mesmo, sem mudança de comportamento. É carregado logo depois do app.js no index.html
   (script comum, não módulo): as funções e variáveis continuam globais como antes, e o extras.js e o
   mercado-novo.js, que usam algumas delas, vêm depois.
   ========================================================= */
/* =========================================================
   ANÁLISE AVANÇADA (aba Análises)
   Histórico de 1 ano por ativo, buscado só quando a seção é aberta,
   no máximo 1 vez por dia (localStorage "assessor_hist").
   ========================================================= */
const ANA_HIST_KEY = 'assessor_hist';
const ANA_PREFS_KEY = 'assessor_analise';
const ANA_GROUP_NAMES = { indices: 'Índices', brasil: 'Brasil', moedas: 'Moedas', cripto: 'Cripto', juros: 'Juros EUA', commodities: 'Commodities' };
const ANA_COLORS = ['#3b82f6', '#f97316', '#14b8a6'];
const ANA_ASSETS = MARKET_SECTIONS.flatMap(sec => sec.items
  .filter(it => it.type === 'yahoo' && it.symbol)
  .map(it => ({ sym: it.symbol, name: it.name, group: sec.id })));
const ANA_BY_SYM = Object.fromEntries(ANA_ASSETS.map(a => [a.sym, a]));
const ANA_DAY = 86400;

let anaOpen = false;
let anaHist = null;              // { day, data: { sym: { t:[], c:[], off, p, pt } } }
let anaLoading = false;
let anaFetchedToday = 0;         // requisições feitas nesta abertura
let anaPrefs = { filter: 'all', sort: { key: 'd1', dir: -1 }, period: '3M', cmp: ['^BVSP', '^GSPC', 'BRL=X'] };
try { Object.assign(anaPrefs, JSON.parse(localStorage.getItem(ANA_PREFS_KEY) || '{}')); } catch (e) { /* silencioso */ }
const anaSavePrefs = () => { try { localStorage.setItem(ANA_PREFS_KEY, JSON.stringify(anaPrefs)); } catch (e) { /* silencioso */ } };

function anaToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

function anaLoadStoredHist() {
  try {
    const h = JSON.parse(localStorage.getItem(ANA_HIST_KEY) || 'null');
    if (h && h.day === anaToday() && h.data) return h;
  } catch (e) { /* silencioso */ }
  return null;
}
function anaStoreHist() {
  try { localStorage.setItem(ANA_HIST_KEY, JSON.stringify(anaHist)); } catch (e) { /* cota cheia: segue só na memória */ }
}

function anaParseHist(json) {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error('Resposta inválida');
  const ts = r.timestamp || [];
  const cl = r.indicators?.quote?.[0]?.close || [];
  const t = [], c = [];
  for (let i = 0; i < ts.length; i++) {
    if (cl[i] != null && isFinite(cl[i])) { t.push(ts[i]); c.push(+cl[i].toPrecision(7)); }
  }
  if (c.length < 2) throw new Error('Histórico vazio');
  return { t, c, off: r.meta?.gmtoffset || 0, p: r.meta?.regularMarketPrice ?? null, pt: r.meta?.regularMarketTime ?? null };
}

async function anaFetchHist(sym) {
  const y = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`;
  const res = await fetchT(`${CORS_PROXY}/?url=${encodeURIComponent(y)}`, {}, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return anaParseHist(await res.json());
}

// Busca só o que falta no dia (no máximo 6 ao mesmo tempo)
async function anaEnsureHist() {
  if (anaLoading) return;
  if (!anaHist) anaHist = anaLoadStoredHist() || { day: anaToday(), data: {}, failed: [] };
  if (anaHist.day !== anaToday()) anaHist = { day: anaToday(), data: {}, failed: [] };
  // cada ativo é tentado no máximo 1 vez por dia; os que falharam ficam só com a cotação do dia
  const tried = new Set([...Object.keys(anaHist.data), ...(anaHist.failed || [])]);
  const missing = ANA_ASSETS.map(a => a.sym).filter(s => !tried.has(s));
  if (!missing.length) return;
  anaLoading = true;
  anaSetStatus(`carregando 0 de ${missing.length}…`);
  let done = 0;
  const queue = missing.slice();
  const worker = async () => {
    while (queue.length) {
      if (document.hidden) { await new Promise(r => setTimeout(r, 1000)); continue; }
      const sym = queue.shift();
      try { anaHist.data[sym] = await anaFetchHist(sym); }
      catch (e) { (anaHist.failed = anaHist.failed || []).push(sym); }
      anaFetchedToday++;
      done++;
      if (done % 6 === 0) anaStoreHist(); // salva aos poucos: fechar a página no meio não perde o que já veio
      anaSetStatus(`carregando ${done} de ${missing.length}…`);
    }
  };
  try { await Promise.all(Array.from({ length: 6 }, worker)); }
  finally { anaLoading = false; }
  anaStoreHist();
}

function anaSetStatus(txt) {
  const el = $('#ana-hist-status');
  if (el) el.textContent = txt;
  $('#ana-info')?.classList.toggle('loading', /carregando/.test(txt));
  // ponto verde só com histórico carregado; "não carregado" fica neutro e "indisponível" fica âmbar
  const dot = $('#ana-info .dot');
  if (dot) { dot.classList.toggle('off', /não carregado/.test(txt)); dot.classList.toggle('warn', /indispon/.test(txt)); }
}

/* ---- números ---- */
const anaExchDay = (ts, off) => new Date((ts + off) * 1000).toISOString().slice(0, 10);

// Série diária do ativo com o preço atual no fim + variação do dia
function anaSeries(sym) {
  const h = anaHist?.data?.[sym];
  const live = yahooMemo[sym];
  if (!h) {
    if (!live || live.value == null) return null;
    return { price: live.value, d1: live.change ?? null, t: [], c: [], noHist: true };
  }
  const price = live?.value ?? h.p ?? h.c[h.c.length - 1];
  const pts = live?.ts ? Math.floor(live.ts / 1000) : (h.pt || h.t[h.t.length - 1]);
  const pday = anaExchDay(pts, h.off);
  const t = [], c = [];
  for (let i = 0; i < h.t.length; i++) {
    if (anaExchDay(h.t[i], h.off) < pday) { t.push(h.t[i]); c.push(h.c[i]); }
  }
  const prev = c.length ? c[c.length - 1] : null;
  t.push(pts); c.push(price);
  return { price, prev, d1: prev ? (price / prev - 1) * 100 : (live?.change ?? null), t, c, off: h.off };
}

// Retorno desde o último fechamento em (ou antes de) "alvo"
function anaRetSince(s, targetTs) {
  if (!s || !s.t.length) return null;
  let base = null;
  for (let i = s.t.length - 2; i >= 0; i--) { if (s.t[i] <= targetTs) { base = s.c[i]; break; } }
  if (base == null && s.t[0] - targetTs < 7 * ANA_DAY && s.t.length > 1) base = s.c[0];
  return base ? (s.price / base - 1) * 100 : null;
}
function anaYtd(s) {
  if (!s || !s.t.length) return null;
  const now = s.t[s.t.length - 1];
  const year = anaExchDay(now, s.off).slice(0, 4);
  let base = null;
  for (let i = s.t.length - 2; i >= 0; i--) { if (anaExchDay(s.t[i], s.off).slice(0, 4) < year) { base = s.c[i]; break; } }
  return base ? (s.price / base - 1) * 100 : null;
}
function anaStdev(arr) {
  if (arr.length < 2) return null;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
function anaLogRets(c) {
  const r = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1] > 0 && c[i] > 0) r.push(Math.log(c[i] / c[i - 1]));
  return r;
}
const anaAnnual = (sym) => Math.sqrt(ANA_BY_SYM[sym]?.group === 'cripto' ? 365 : 252);
function anaVol30(sym, s) {
  if (!s || s.c.length < 31) return null;
  const sd = anaStdev(anaLogRets(s.c.slice(-31)));
  return sd == null ? null : sd * anaAnnual(sym) * 100;
}
const anaSma = (c, n) => c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null;
function anaTrend(s) {
  if (!s) return null;
  const m50 = anaSma(s.c, 50), m200 = anaSma(s.c, 200);
  if (m50 == null || m200 == null) return null;
  if (s.price > m50 && s.price > m200) return 'up';
  if (s.price < m50 && s.price < m200) return 'dn';
  return 'flat';
}
function anaFromHigh(s) {
  if (!s || s.c.length < 20) return null;
  const hi = Math.max(...s.c.slice(-253));
  return hi ? (s.price / hi - 1) * 100 : null;
}

function anaRow(a) {
  const s = anaSeries(a.sym);
  const now = s && s.t.length ? s.t[s.t.length - 1] : Date.now() / 1000;
  const r = { ...a, s, price: s?.price ?? null, d1: s?.d1 ?? null };
  if (s && !s.noHist) {
    r.m1 = anaRetSince(s, now - 30 * ANA_DAY);
    r.m3 = anaRetSince(s, now - 91 * ANA_DAY);
    r.ytd = anaYtd(s);
    r.m12 = anaRetSince(s, now - 365 * ANA_DAY);
    r.hi = anaFromHigh(s);
    r.vol = anaVol30(a.sym, s);
    r.trend = anaTrend(s);
    const cut = now - 91 * ANA_DAY;
    r.spark = s.c.filter((_, i) => s.t[i] >= cut);
  }
  return r;
}

/* ---- formatação ---- */
const anaPct = (v, d = 2) => v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNumber(Math.abs(v), { min: d, max: d })}%`;
const anaCls = (v) => v == null ? 'ana-mut' : v > 0 ? 'ana-up' : v < 0 ? 'ana-dn' : '';
function anaPrice(a, v) {
  if (v == null || !isFinite(v)) return '—';
  if (a.group === 'juros') return `${fmtNumber(v, { min: 2, max: 3 })}%`;
  if (a.sym.endsWith('BRL=X') || a.sym === 'BRL=X') return `R$ ${fmtNumber(v, { min: 4, max: 4 })}`;
  if (v >= 10000) return fmtNumber(v, { min: 0, max: 0 });
  if (v >= 100) return fmtNumber(v, { min: 2, max: 2 });
  return fmtNumber(v, { min: 2, max: 4 });
}
function anaHeat(v, scale) {
  if (v == null || !isFinite(v)) return '';
  const k = Math.min(1, Math.abs(v) / scale);
  const pct = Math.round(6 + k * 34);
  return `background:color-mix(in srgb, var(${v >= 0 ? '--pos' : '--neg'}) ${pct}%, transparent)`;
}
function anaSparkSVG(vals, w = 92, h = 26, color) {
  if (!vals || vals.length < 2) return '<span class="ana-mut">—</span>';
  const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 2) + 1).toFixed(1)},${(h - 2 - (v - min) / rng * (h - 4)).toFixed(1)}`).join(' ');
  const col = color || (vals[vals.length - 1] >= vals[0] ? 'var(--pos)' : 'var(--neg)');
  return `<svg class="ana-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---- 1. Humor do mercado ---- */
const ANA_MOOD = [['^BVSP', 'Ibovespa', 1], ['^GSPC', 'S&P 500', 1], ['^IXIC', 'Nasdaq', 1], ['^VIX', 'VIX', -0.25], ['BRL=X', 'Dólar', -1], ['DX-Y.NYB', 'DXY', -0.7]];
function anaRenderMood(rows) {
  const by = Object.fromEntries(rows.map(r => [r.sym, r]));
  const comps = ANA_MOOD.map(([sym, label, w]) => {
    const d = by[sym]?.d1;
    return { label, d, v: d == null ? null : Math.max(-1, Math.min(1, d * w / 1.5)) };
  });
  const valid = comps.filter(c => c.v != null);
  const el = $('#ana-mood');
  const top = '<div class="aa-k-top"><span class="aa-k-lbl">Humor do mercado</span><span class="aa-k-nota">Nota</span></div>';
  if (!valid.length) { el.innerHTML = `${top}<div class="aa-k-row"><b class="aa-k-big">—</b></div><div class="ana-loading">Sem cotações do dia ainda.</div>`; return; }
  const score = Math.round(valid.reduce((a, c) => a + c.v, 0) / valid.length * 100);
  const label = score > 25 ? 'Apetite a risco' : score < -25 ? 'Aversão a risco' : 'Neutro';
  // a nota sai das variações do dia: a composição fica na dica do cartão
  el.title = 'Calculada com: ' + comps.map(c => `${c.label} ${anaPct(c.d)}`).join(' · ');
  el.innerHTML = `${top}
    <div class="aa-k-row"><b class="aa-k-big">${label}</b><b class="aa-k-score ${anaCls(score)}">${score > 0 ? '+' : score < 0 ? '−' : ''}${Math.abs(score)}</b></div>
    <div class="aa-mood-bar" style="--aa-mood:${score > 25 ? 'var(--pos)' : score < -25 ? 'var(--neg)' : '#8a94a6'}" role="img" aria-label="Nota ${score} de -100 a +100"><span style="left:${(score + 100) / 2}%"></span></div>
    <div class="aa-mood-scale"><span>−100</span><span>0</span><span>+100</span></div>`;
}

/* ---- 2. Amplitude: ativos em alta ---- */
function anaRenderBreadth(rows) {
  const valid = rows.filter(r => r.d1 != null);
  const up = valid.filter(r => r.d1 > 0).length, dn = valid.filter(r => r.d1 < 0).length;
  const el = $('#ana-breadth');
  const top = '<div class="aa-k-top"><span class="aa-k-lbl">Amplitude</span></div>';
  if (!valid.length) { el.innerHTML = `${top}<div class="aa-k-row"><b class="aa-k-big">—</b></div><div class="ana-loading">Sem cotações do dia ainda.</div>`; return; }
  const pu = Math.round(up / valid.length * 100), pd = Math.round(dn / valid.length * 100);
  el.title = 'Variação média do dia por grupo: ' + Object.keys(ANA_GROUP_NAMES).map(g => {
    const gs = valid.filter(r => r.group === g);
    return `${ANA_GROUP_NAMES[g]} ${anaPct(gs.length ? gs.reduce((a, r) => a + r.d1, 0) / gs.length : null)}`;
  }).join(' · ');
  el.innerHTML = `${top}
    <div class="aa-k-row"><b class="aa-k-big">${up} de ${valid.length}</b></div>
    <div class="aa-k-sub">ativos em alta</div>
    <div class="aa-br-bar" role="img" aria-label="${up} em alta, ${dn} em baixa"><i style="width:${up / valid.length * 100}%;background:var(--pos)"></i><i style="width:${dn / valid.length * 100}%;background:var(--neg)"></i></div>
    <div class="aa-mood-scale"><span>${up} em alta (${pu}%)</span><span>${dn} em baixa (${pd}%)</span></div>`;
}

/* ---- 3. Tabela de desempenho ---- */
// bandeiras e ícones dos ativos (desenhados em SVG, sem emoji)
const ANA_FLAG = {
  br: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.2 10 15 17.8 2.8 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/>',
  us: '<rect width="30" height="20" fill="#b22234"/><g fill="#fff"><rect y="1.54" width="30" height="1.54"/><rect y="4.62" width="30" height="1.54"/><rect y="7.69" width="30" height="1.54"/><rect y="10.77" width="30" height="1.54"/><rect y="13.85" width="30" height="1.54"/><rect y="16.92" width="30" height="1.54"/></g><rect width="12" height="10.77" fill="#3c3b6e"/>',
  eu: '<rect width="30" height="20" fill="#039"/><circle cx="15" cy="10" r="5.5" fill="none" stroke="#fc0" stroke-width="1.6" stroke-dasharray="1.2 1.68"/>',
  de: '<rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#d00"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/>',
  uk: '<rect width="30" height="20" fill="#012169"/><path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/><path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/>',
  jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.6" fill="#bc002d"/>',
  hk: '<rect width="30" height="20" fill="#de2910"/><circle cx="15" cy="10" r="4.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="2.4 1.2"/>',
  cn: '<rect width="30" height="20" fill="#de2910"/><path d="M7 3.2l1.2 3.6h3.8l-3 2.2 1.1 3.6L7 10.4l-3.1 2.2L5 9 2 6.8h3.8z" fill="#ffde00"/>'
};
const ANA_FLAG_DE = {
  '^GSPC': 'us', '^IXIC': 'us', '^NDX': 'us', '^DJI': 'us', '^RUT': 'us', '^VIX': 'us', '^GDAXI': 'de', '^STOXX50E': 'eu', '^FTSE': 'uk',
  '^N225': 'jp', '^HSI': 'hk', '000001.SS': 'cn', 'DX-Y.NYB': 'us', 'EURUSD=X': 'eu', 'GBPUSD=X': 'uk', 'JPY=X': 'jp', 'EURBRL=X': 'eu', 'BRL=X': 'us', 'GBPBRL=X': 'uk'
};
const ANA_CRIPTO = { 'BTC-USD': ['#f7931a', 'B'], 'ETH-USD': ['#627eea', 'E'], 'SOL-USD': ['#7b4fe0', 'S'], 'ADA-USD': ['#0033ad', 'A'], 'XRP-USD': ['#3a4048', 'X'], 'DOGE-USD': ['#c2a633', 'D'] };
const ANA_COMMOD = { 'CL=F': ['fa-droplet', '#8a94a6'], 'BZ=F': ['fa-droplet', '#8a94a6'], 'GC=F': ['fa-coins', '#e2b33c'], 'SI=F': ['fa-coins', '#b8c0cc'], 'KC=F': ['fa-mug-hot', '#a9774f'], 'ZS=F': ['fa-seedling', '#7cb342'] };
function anaIcon(r) {
  const f = ANA_FLAG_DE[r.sym] || (r.group === 'brasil' ? 'br' : r.group === 'juros' ? 'us' : null);
  if (f) return `<svg class="aa-flag" viewBox="0 0 30 20" aria-hidden="true">${ANA_FLAG[f]}</svg>`;
  const c = ANA_CRIPTO[r.sym];
  if (c) return `<span class="aa-ico" style="background:${c[0]};color:#fff" aria-hidden="true">${c[1]}</span>`;
  const m = ANA_COMMOD[r.sym] || ['fa-cube', 'var(--text-3)'];
  return `<span class="aa-ico" aria-hidden="true"><i class="fa-solid ${m[0]}" style="color:${m[1]}"></i></span>`;
}
const ANA_TICK = { '^BVSP': 'IBOV', '^GSPC': 'SPX', 'DX-Y.NYB': 'DXY', 'BRL=X': 'USDBRL', 'JPY=X': 'USDJPY', '000001.SS': 'SSEC', '^GDAXI': 'DAX', '^STOXX50E': 'SX5E', '^FTSE': 'UKX' };
const anaTick = (s) => ANA_TICK[s] || s.replace(/^\^/, '').replace(/\.SA$/, '').replace(/=X$/, '').replace(/-USD$/, 'USD').replace(/=F$/, '');

// colunas: as "extras" só aparecem com "Mais métricas"
const ANA_COLS = [
  ['name', 'Ativo', 'l'], ['price', 'Preço'], ['d1', 'Dia'], ['m1', 'Mês'],
  ['m3', '3 meses', 'x'], ['ytd', 'No ano', 'x'], ['m12', '12 meses', 'x'], ['hi', 'Da máxima', 'x'], ['vol', 'Volatilidade', 'x'],
  ['trend', 'Tendência', 'l']
];
let anaBusca = '';
const anaSem = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const anaCmpList = () => anaPrefs.cmp.filter(s => s && ANA_BY_SYM[s]).slice(0, 3);
function anaRenderTable(rows) {
  const pills = $('#ana-filter');
  pills.innerHTML = [['all', 'Todos'], ...Object.entries(ANA_GROUP_NAMES)].map(([v, l]) =>
    `<button type="button" class="${v === anaPrefs.filter ? 'on' : ''}" data-v="${v}" aria-pressed="${v === anaPrefs.filter}">${l}</button>`).join('');
  pills.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { anaPrefs.filter = b.dataset.v; anaSavePrefs(); anaRender(); } };
  const mais = !!anaPrefs.mais;
  const mb = $('#ana-mais');
  mb.setAttribute('aria-pressed', mais);
  mb.onclick = () => { anaPrefs.mais = !anaPrefs.mais; anaSavePrefs(); anaRender(); };
  const busca = $('#ana-busca');
  if (!busca.dataset.ok) {
    busca.dataset.ok = '1';
    busca.addEventListener('input', () => { anaBusca = busca.value; anaRenderTable(ANA_ASSETS.map(anaRow)); });
  }
  const { key, dir } = anaPrefs.sort;
  const tval = { up: 1, flat: 0, dn: -1 };
  const q = anaSem(anaBusca.trim());
  const list = rows.filter(r => (anaPrefs.filter === 'all' || r.group === anaPrefs.filter) && (!q || anaSem(r.name + ' ' + anaTick(r.sym) + ' ' + r.sym).includes(q))).sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'trend') { va = tval[va]; vb = tval[vb]; }
    if (key === 'name') return dir * a.name.localeCompare(b.name, 'pt-BR');
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return dir * (va - vb);
  });
  const cols = ANA_COLS.filter(c => mais || c[2] !== 'x');
  const sel = anaCmpList();
  const head = `<th class="c"><input type="checkbox" id="ana-sel-all" aria-label="Limpar seleção"${sel.length ? ' checked' : ''}></th>` + cols.map(([k, label, cls]) =>
    `<th class="${cls === 'l' ? 'l' : ''}" data-k="${k}">${label}${k === key ? `<span class="arw">${dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('');
  const pct = (r, k) => `<td class="${anaCls(r[k])}">${anaPct(r[k])}</td>`;
  const body = list.map(r => {
    const on = sel.includes(r.sym);
    const hi = r.hi == null ? '—' : r.hi > -0.05 ? 'na máxima' : anaPct(r.hi, 1);
    const tcor = r.trend === 'up' ? 'var(--pos)' : r.trend === 'dn' ? 'var(--neg)' : 'var(--text-3)';
    const tr = r.trend === 'up' ? '<span class="aa-t up">Alta</span>' : r.trend === 'dn' ? '<span class="aa-t dn">Baixa</span>' : r.trend === 'flat' ? '<span class="aa-t">Lateral</span>' : '<span class="aa-t">—</span>';
    const cel = {
      name: `<td class="l"><span class="aa-ativo">${anaIcon(r)}<span><b>${escapeHTML(r.name)}</b><small>${escapeHTML(anaTick(r.sym))}</small></span></span></td>`,
      price: `<td>${anaPrice(r, r.price)}</td>`,
      d1: pct(r, 'd1'), m1: pct(r, 'm1'), m3: pct(r, 'm3'), ytd: pct(r, 'ytd'), m12: pct(r, 'm12'),
      hi: `<td class="${r.hi != null && r.hi > -0.05 ? 'ana-up' : ''}">${hi}</td>`,
      vol: `<td>${r.vol == null ? '—' : fmtNumber(r.vol, { min: 1, max: 1 }) + '%'}</td>`,
      trend: `<td class="l"><span class="aa-trend">${r.spark && r.spark.length > 1 ? anaSparkSVG(r.spark.slice(-22), 64, 22, tcor) : '<span class="ana-spark"></span>'}${tr}</span></td>`
    };
    return `<tr data-sym="${escapeHTML(r.sym)}" class="${on ? 'on' : ''}"><td class="c"><input type="checkbox"${on ? ' checked' : ''} aria-label="Comparar ${escapeHTML(r.name)}"></td>${cols.map(c => cel[c[0]]).join('')}</tr>`;
  }).join('');
  const t = $('#ana-table');
  t.classList.toggle('mais', mais);
  t.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td class="l" colspan="${cols.length + 1}">Nenhum ativo encontrado.</td></tr>`}</tbody>`;
  t.querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.k;
    anaPrefs.sort = { key: k, dir: anaPrefs.sort.key === k ? -anaPrefs.sort.dir : (k === 'name' ? 1 : -1) };
    anaSavePrefs(); anaRender();
  }));
  $('#ana-sel-all').addEventListener('click', (e) => { e.preventDefault(); anaPrefs.cmp = []; anaSavePrefs(); anaRenderTable(ANA_ASSETS.map(anaRow)); anaRenderCompare(); });
  t.querySelectorAll('tbody tr[data-sym]').forEach(tr => tr.addEventListener('click', (e) => { e.preventDefault(); anaToggleCompare(tr.dataset.sym); }));
  const n = sel.length;
  $('#ana-sel-n').textContent = n ? `${n} ${n === 1 ? 'ativo selecionado' : 'ativos selecionados'}` : 'Marque até 3 ativos';
  const go = $('#ana-cmp-go');
  go.disabled = !n;
  go.onclick = () => { const c = $('#ana-cmp-card'); c?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); c?.classList.remove('aa-pisca'); void c?.offsetWidth; c?.classList.add('aa-pisca'); };
}

/* ---- 4. Comparador ---- */
const ANA_PERIODS = [['1M', '1M', 30], ['3M', '3M', 91], ['6M', '6M', 182], ['1A', '1A', 365]];
const ANA_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// marca ou desmarca um ativo no comparador (até 3)
function anaToggleCompare(sym) {
  if (!ANA_BY_SYM[sym]) return;
  const cmp = anaCmpList();
  const i = cmp.indexOf(sym);
  if (i >= 0) cmp.splice(i, 1);
  else if (cmp.length >= 3) { toast('O comparador aceita até 3 ativos', 'info'); return; }
  else cmp.push(sym);
  anaPrefs.cmp = cmp;
  anaSavePrefs();
  anaRenderTable(ANA_ASSETS.map(anaRow));
  anaRenderCompare();
}

// Alinha as séries por data (dia da bolsa), repetindo o último fechamento nos dias sem pregão
function anaAlign(syms, days) {
  const series = syms.map(sym => ({ sym, s: anaSeries(sym) })).filter(x => x.s && !x.s.noHist && x.s.c.length > 1);
  if (!series.length) return null;
  const endTs = Math.max(...series.map(x => x.s.t[x.s.t.length - 1]));
  const startTs = endTs - days * ANA_DAY;
  const maps = series.map(x => {
    const m = new Map();
    x.s.t.forEach((t, i) => { if (t >= startTs - 10 * ANA_DAY) m.set(anaExchDay(t, x.s.off), x.s.c[i]); });
    return m;
  });
  const startDay = new Date(startTs * 1000).toISOString().slice(0, 10);
  const allDays = [...new Set(maps.flatMap(m => [...m.keys()]))].sort();
  const last = maps.map(() => null);
  const rows = [];
  allDays.forEach(d => {
    maps.forEach((m, i) => { if (m.has(d)) last[i] = m.get(d); });
    if (d >= startDay && last.every(v => v != null)) rows.push({ d, v: last.slice() });
  });
  if (rows.length < 2) return null;
  return { series, maps, rows };
}

function anaRenderCompare() {
  const cmp = anaCmpList();
  const colorOf = Object.fromEntries(cmp.map((s, i) => [s, ANA_COLORS[i]]));
  // chips com o x para tirar, e um seletor para incluir sem passar pela tabela
  const livres = ANA_ASSETS.filter(a => !cmp.includes(a.sym));
  const opts = '<option value="">+ Adicionar</option>' + Object.entries(ANA_GROUP_NAMES).map(([g, gn]) =>
    `<optgroup label="${gn}">${livres.filter(a => a.group === g).map(a => `<option value="${escapeHTML(a.sym)}">${escapeHTML(a.name)}</option>`).join('')}</optgroup>`).join('');
  const chips = $('#ana-cmp-sel');
  chips.innerHTML = cmp.map(s => `<span class="aa-chip"><i style="background:${colorOf[s]}"></i>${escapeHTML(ANA_BY_SYM[s].name)}<button type="button" data-s="${escapeHTML(s)}" aria-label="Tirar ${escapeHTML(ANA_BY_SYM[s].name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></span>`).join('')
    + (cmp.length < 3 ? `<select class="aa-add" aria-label="Adicionar ativo ao comparador">${opts}</select>` : '');
  chips.onclick = (e) => { const b = e.target.closest('button[data-s]'); if (b) anaToggleCompare(b.dataset.s); };
  const add = chips.querySelector('select');
  if (add) add.onchange = () => { if (add.value) anaToggleCompare(add.value); };
  const seg = $('#ana-periods');
  seg.innerHTML = ANA_PERIODS.map(p => `<button type="button" class="${p[0] === anaPrefs.period ? 'on' : ''}" data-v="${p[0]}" aria-pressed="${p[0] === anaPrefs.period}">${p[1]}</button>`).join('');
  seg.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { anaPrefs.period = b.dataset.v; anaSavePrefs(); anaRenderCompare(); } };

  const chart = $('#ana-chart'), cards = $('#ana-cmp-cards');
  if (!cmp.length) { chart.innerHTML = '<div class="ana-loading">Marque até 3 ativos na tabela ao lado.</div>'; cards.innerHTML = ''; return; }
  const days = (ANA_PERIODS.find(p => p[0] === anaPrefs.period) || ANA_PERIODS[1])[2];
  const al = anaAlign(cmp, days);
  if (!al) { chart.innerHTML = '<div class="ana-loading">Histórico indisponível para esses ativos.</div>'; cards.innerHTML = ''; return; }
  const lines = al.series.map((x, i) => {
    const base = al.rows[0].v[i];
    return { sym: x.sym, color: colorOf[x.sym], name: ANA_BY_SYM[x.sym].name, pts: al.rows.map(r => r.v[i] / base * 100) };
  });

  const W = Math.max(280, Math.round(chart.clientWidth || 500));
  const H = W < 420 ? 220 : 260, padL = 34, padR = 58, padT = 10, padB = 24;
  const all = lines.flatMap(l => l.pts).concat(100);
  let min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.08 || 1; min -= pad; max += pad;
  const n = al.rows.length;
  const X = i => padL + i / (n - 1) * (W - padL - padR);
  const Y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const ticks = [];
  const step = Math.pow(10, Math.floor(Math.log10((max - min) / 4)));
  const st = [1, 2, 2.5, 5, 10].map(m => m * step).find(s => (max - min) / s <= 5) || step * 10;
  for (let v = Math.ceil(min / st) * st; v <= max; v += st) ticks.push(v);
  // eixo de baixo: nome do mês no primeiro pregão de cada mês; em 1 mês, datas
  let xt = [];
  if (days <= 31) xt = [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1].map(i => [i, `${al.rows[i].d.slice(8, 10)}/${al.rows[i].d.slice(5, 7)}`]);
  else {
    al.rows.forEach((r, i) => { if (i > 0 && r.d.slice(5, 7) !== al.rows[i - 1].d.slice(5, 7)) xt.push([i, ANA_MES[+r.d.slice(5, 7) - 1]]); });
    if (xt.length > 7) xt = xt.filter((_, j) => j % 2 === 0);
  }
  // etiquetas no fim da linha, afastadas para não encavalar
  const ends = lines.map(l => ({ l, y: Y(l.pts[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 20) ends[i].y = ends[i - 1].y + 20;
  chart.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Retorno acumulado em base 100">
      ${ticks.map(v => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis" x="${padL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtNumber(v, { min: 0, max: st < 1 ? 1 : 0 })}</text>`).join('')}
      ${xt.map(([i]) => `<line class="grid v" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${padT}" y2="${H - padB}"/>`).join('')}
      <line class="base" x1="${padL}" x2="${W - padR}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}"/>
      ${xt.map(([i, t]) => `<text class="axis" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${t}</text>`).join('')}
      ${lines.map(l => `<polyline points="${l.pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${l.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${ends.map(({ l, y }) => `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(l.pts[n - 1]).toFixed(1)}" r="3.5" fill="${l.color}"/><rect x="${(X(n - 1) + 8).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="46" height="18" rx="5" fill="${l.color}"/><text class="endtag" x="${(X(n - 1) + 31).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${fmtNumber(l.pts[n - 1], { min: 1, max: 1 })}</text>`).join('')}
      <line class="cursor" id="ana-cursor" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/>
      <rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="transparent" id="ana-hit"/>
    </svg>
    <div class="ana-tip" id="ana-tip" hidden></div>`;
  const hit = $('#ana-hit'), cur = $('#ana-cursor'), tip = $('#ana-tip');
  const move = (ev) => {
    const box = chart.querySelector('svg').getBoundingClientRect();
    const x = (ev.clientX - box.left) * (W / box.width);
    const i = Math.max(0, Math.min(n - 1, Math.round((x - padL) / (W - padL - padR) * (n - 1))));
    cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('visibility', 'visible');
    const d = al.rows[i].d;
    tip.innerHTML = `<span class="d">${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}</span>` + lines.map(l =>
      `<div><span><i style="background:${l.color}"></i> ${escapeHTML(l.name)}</span><b class="${anaCls(l.pts[i] - 100)}">${anaPct(l.pts[i] - 100)}</b></div>`).join('');
    tip.hidden = false;
    const px = X(i) * box.width / W, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(box.width - tw, px + 12 > box.width - tw ? px - tw - 12 : px + 12))}px`;
    tip.style.top = '8px';
  };
  const leave = () => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);

  // tabela de retorno acumulado no período
  cards.innerHTML = `<table class="aa-ret"><thead><tr><th>Ativo</th><th>Retorno acumulado</th></tr></thead><tbody>${lines.map(l =>
    `<tr><td><i style="background:${l.color}"></i>${escapeHTML(l.name)} <small>(${escapeHTML(anaTick(l.sym))})</small></td><td class="${anaCls(l.pts[n - 1] - 100)}">${anaPct(l.pts[n - 1] - 100, 1)}</td></tr>`).join('')}</tbody></table>`;
  const missing = cmp.filter(s => !al.series.some(x => x.sym === s));
  if (missing.length) cards.insertAdjacentHTML('beforeend', `<p class="ana-foot">Sem histórico: ${missing.map(s => escapeHTML(ANA_BY_SYM[s].name)).join(', ')}.</p>`);
}

/* ---- Mini gráfico de 3 meses dentro dos cards de cotação ----
   Usa o histórico de 1 ano da Análise avançada quando ele já foi baixado; senão, um histórico leve
   de 3 meses que vem numa chamada só ao worker (/history), guardado no navegador por 1 dia
   (localStorage "mkt_3m_v1"). Assim os mini gráficos aparecem sem precisar abrir a Análise. */
const MKT3M_KEY = 'mkt_3m_v1';
let mkt3m = null;   // { day, data: { sym: { t:[], c:[], off } } }
try { mkt3m = JSON.parse(localStorage.getItem(MKT3M_KEY) || 'null'); } catch (e) { mkt3m = null; }
let mkt3mBusy = false;
async function mkt3mEnsure() {
  if (mkt3mBusy || (mkt3m && mkt3m.day === anaToday())) return;
  mkt3mBusy = true;
  try {
    const syms = ANA_ASSETS.map(a => a.sym), data = {};
    for (let i = 0; i < syms.length; i += 45) {
      const part = syms.slice(i, i + 45);
      const res = await fetchT(`${CORS_PROXY}/history?symbols=${encodeURIComponent(part.join(','))}`, {}, 20000);
      if (!res.ok && res.status !== 502) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      Object.entries(j || {}).forEach(([k, v]) => { if (v && Array.isArray(v.c) && v.c.length > 1) data[k] = v; });
    }
    if (Object.keys(data).length) {
      mkt3m = { day: anaToday(), data };
      try { localStorage.setItem(MKT3M_KEY, JSON.stringify(mkt3m)); } catch (e) { /* cota cheia: fica só na memória */ }
    }
  } catch (e) { /* worker sem a rota /history ou fora do ar: fica com o que já havia */ }
  finally { mkt3mBusy = false; }
}
function mkt3mVals(sym) {
  // 1º: histórico da Análise avançada (já inclui o preço ao vivo)
  if (anaHist?.data?.[sym]) {
    const s = anaSeries(sym);
    if (s && !s.noHist) { const cut = s.t[s.t.length - 1] - 91 * ANA_DAY; return s.c.filter((_, i) => s.t[i] >= cut); }
  }
  // 2º: histórico leve de 3 meses + preço ao vivo do dia
  const h = mkt3m?.data?.[sym];
  if (!h) return null;
  const t = h.t.slice(), c = h.c.slice(), live = yahooMemo[sym];
  if (live && live.value != null && live.ts) {
    const lt = Math.floor(live.ts / 1000);
    if (anaExchDay(lt, h.off) > anaExchDay(t[t.length - 1], h.off)) { t.push(lt); c.push(live.value); }
    else if (lt >= t[t.length - 1]) c[c.length - 1] = live.value;
  }
  const cut = t[t.length - 1] - 91 * ANA_DAY;
  return c.filter((_, i) => t[i] >= cut);
}
function anaDecorateCards() {
  if (!anaHist && !mkt3m) return;
  $$('#market-panel .quote-card[data-symbol]').forEach(card => {
    const vals = mkt3mVals(card.dataset.symbol);
    let el = card.querySelector('.qc-3m');
    if (!vals || vals.length < 2) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'qc-3m'; card.querySelector('.qc-footer')?.before(el); }
    const r = (vals[vals.length - 1] / vals[0] - 1) * 100;
    el.title = 'Últimos 3 meses';
    el.innerHTML = `<span>3M</span>${anaSparkSVG(vals, 120, 16)}<span class="${anaCls(r)}">${anaPct(r, 1)}</span>`;
  });
}

/* ---- Consumo do proxy ---- */
function anaRenderUsage() {
  const el = $('#ana-usage');
  if (!el) return;
  const n = ANA_ASSETS.length;
  // 1 lote por atualização (topo + aba Mercado juntos); pregão a cada 5 min, fora a cada 15 min; 8 h por dia útil
  const perDay = Math.round(8 * 60 / (REFRESH_OPEN_MS / 60000));
  const month = (perDay + n) * 22;
  el.innerHTML = `Consumo do proxy: a faixa do topo e a aba Mercado usam 1 requisição em lote por atualização (a cada ${REFRESH_OPEN_MS / 60000} min no pregão, ${REFRESH_CLOSED_MS / 60000} min fora), e só com a aba visível. A Análise avançada usa ${n} requisições, no máximo 1 vez por dia${anaFetchedToday ? ` (hoje: ${anaFetchedToday} feitas)` : ' (hoje: veio do cache)'}. Estimativa com o painel aberto 8 h por dia útil: cerca de ${fmtNumber(month, { min: 0, max: 0 })} requisições por mês.`;
}

/* ---- Render geral ---- */
function anaRender() {
  if (!anaOpen) return;
  const rows = ANA_ASSETS.map(anaRow);
  anaRenderMood(rows);
  anaRenderBreadth(rows);
  anaRenderTable(rows);
  anaRenderCompare();
  anaRenderUsage();
}

// abre quando a aba "Análise avançada" das Análises fica visível (barra de seções em ana-secoes.js)
async function anaOpenSection() {
  if (anaOpen) return;
  anaOpen = true;
  $('#ana-body').classList.remove('hidden');
  ['#ana-mood', '#ana-breadth'].forEach(s => { if (!$(s).innerHTML) $(s).innerHTML = '<div class="ana-loading">Carregando…</div>'; });
  try { await ensureYahooBatch(); } catch (e) { /* segue com o histórico */ }
  anaRender();
  try { await anaEnsureHist(); } catch (e) { /* segue */ }
  const ok = anaHist ? Object.keys(anaHist.data).length : 0;
  anaSetStatus(ok ? `${ok} de ${ANA_ASSETS.length} ativos · ${anaHist.day.split('-').reverse().join('/')}` : 'indisponível (mostrando só a cotação do dia)');
  anaRender();
  anaDecorateCards();
}
const anaVisivel = () => $('#analysis-panel')?.classList.contains('active') && $('#analysis-panel .ana-wrap')?.dataset.secao === 'mercado';
window.__anaAbrir = () => { if (anaVisivel()) anaOpenSection(); };

// Histórico do dia já salvo: mostra o status e os mini gráficos sem nenhuma requisição
(() => {
  const h = anaLoadStoredHist();
  if (h) {
    anaHist = h;
    anaSetStatus(`${Object.keys(h.data).length} de ${ANA_ASSETS.length} ativos · ${h.day.split('-').reverse().join('/')} (abra para ver)`);
    setTimeout(anaDecorateCards, 300);
  } else if (mkt3m) setTimeout(anaDecorateCards, 300);
  // baixa o histórico leve de 3 meses (1 vez por dia) e recoloca os mini gráficos
  // sempre que os cards da aba Mercado são redesenhados
  setTimeout(() => mkt3mEnsure().then(anaDecorateCards), 1500);
  const mp = $('#market-panel');
  if (mp) {
    let t = null;
    new MutationObserver(() => {
      if (!anaHist && !mkt3m) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const falta = [...$$('#market-panel .quote-card[data-symbol]')].some(c => !c.querySelector('.qc-3m') && (anaHist?.data?.[c.dataset.symbol] || mkt3m?.data?.[c.dataset.symbol]));
        if (falta) anaDecorateCards();
      }, 120);
    }).observe(mp, { childList: true, subtree: true });
  }
})();

// Redesenha o gráfico ao mudar o tamanho da tela
let anaResizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(anaResizeT);
  anaResizeT = setTimeout(() => { if (anaOpen && $('#analysis-panel')?.classList.contains('active')) anaRenderCompare(); }, 200);
});

/* ---- Cotações da aba Mercado só atualizam com a aba Mercado aberta ---- */
let marketPanelTs = Date.now();
const _updateMarketPanel = updateMarketPanel;
updateMarketPanel = async function (silent = false) {
  if (silent && !$('#market-panel')?.classList.contains('active')) return;   // outra aba aberta: não gasta requisição
  await _updateMarketPanel(silent);
  marketPanelTs = Date.now();
  anaDecorateCards();
  if (!mkt3m || mkt3m.day !== anaToday()) mkt3mEnsure().then(anaDecorateCards);   // virou o dia com a página aberta
  if (anaOpen) anaRender();
};
// 23/11/2026: encadeia com o gancho que já existia. Ao virar arquivo próprio (22/11) este passou a carregar depois do
// app.js e apagava o gancho do menu lateral: a aba mudava, mas o amarelo ficava na anterior
const __antesAnalises = window.__onTabSwitch;
window.__onTabSwitch = (tabId) => {
  if (__antesAnalises) __antesAnalises(tabId);
  if (tabId === 'market-panel' && liveMode && !document.hidden && Date.now() - marketPanelTs >= currentRefreshMs()) updateMarketPanel(true);
  if (tabId === 'analysis-panel') setTimeout(() => { if (anaOpen) anaRender(); else window.__anaAbrir(); }, 50);
};
