/* Código principal do Mercado Macro (saiu do index.html) */
/* =========================================================
   ⚙️ CONFIGURAÇÃO
   ========================================================= */
const CORS_PROXY = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
const NEWS_WORKER_URL = 'https://news.cota-cotacao10.workers.dev/';

/* =========================================================
   CONSTANTS
   ========================================================= */
const STORAGE = {
  theme: 'trader_theme',
  activeTab: 'trader_active_tab',
  readArticles: 'trader_read_articles',
  liveMode: 'trader_live_mode'
};
const FETCH_TIMEOUT = 15000;
const NOTES_KEY = 'trader_calendar_notes_v1';
const MARKET_CACHE_KEY = 'trader_market_cache_v1';
const TICKER_CACHE_KEY = 'trader_ticker_cache_v1';
const NEWS_CACHE_KEY = 'market_pulse_cache_v9';
const NEWS_CACHE_TTL = 5 * 60 * 1000;
const HEATMAP_SOURCE_KEY = 'trader_heatmap_source';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// fetch com limite de tempo: evita cards presos em "carregando" se uma API travar
function fetchT(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/* =========================================================
   MARKET CATALOG
   ========================================================= */
const MARKET_SECTIONS = [
  { id: 'indices', gridId: 'grid-indices', countId: 'm-count-indices', items: [
    { name: 'S&P 500', symbol: '^GSPC', type: 'yahoo' },
    { name: 'Nasdaq', symbol: '^IXIC', type: 'yahoo' },
    { name: 'Nasdaq 100', symbol: '^NDX', type: 'yahoo' },
    { name: 'Dow Jones', symbol: '^DJI', type: 'yahoo' },
    { name: 'Russell 2000', symbol: '^RUT', type: 'yahoo' },
    { name: 'VIX', symbol: '^VIX', type: 'yahoo' },
    { name: 'DAX', symbol: '^GDAXI', type: 'yahoo' },
    { name: 'Euro Stoxx 50', symbol: '^STOXX50E', type: 'yahoo' },
    { name: 'FTSE 100', symbol: '^FTSE', type: 'yahoo' },
    { name: 'Nikkei 225', symbol: '^N225', type: 'yahoo' },
    { name: 'Hang Seng', symbol: '^HSI', type: 'yahoo' },
    { name: 'Shanghai Composite', symbol: '000001.SS', type: 'yahoo' },
  ]},
  { id: 'brasil', gridId: 'grid-brasil', countId: 'm-count-brasil', items: [
    { name: 'Ibovespa', symbol: '^BVSP', type: 'yahoo' },
    { name: 'IFIX', symbol: 'IFIX.SA', type: 'yahoo' },
    { name: 'Petrobras PN', symbol: 'PETR4.SA', type: 'yahoo' },
    { name: 'Vale', symbol: 'VALE3.SA', type: 'yahoo' },
    { name: 'Itaú PN', symbol: 'ITUB4.SA', type: 'yahoo' },
    { name: 'Banco do Brasil', symbol: 'BBAS3.SA', type: 'yahoo' },
    { name: 'SELIC', type: 'selic' },
    { name: 'IPCA', type: 'ipca' },
  ]},
  { id: 'moedas', gridId: 'grid-moedas', countId: 'm-count-moedas', items: [
    { name: 'Dólar Index (DXY)', symbol: 'DX-Y.NYB', type: 'yahoo' },
    { name: 'Euro (EUR/USD)', symbol: 'EURUSD=X', type: 'yahoo' },
    { name: 'Libra (GBP/USD)', symbol: 'GBPUSD=X', type: 'yahoo' },
    { name: 'Iene (USD/JPY)', symbol: 'JPY=X', type: 'yahoo' },
    { name: 'Euro (EUR/BRL)', symbol: 'EURBRL=X', type: 'yahoo' },
    { name: 'Dólar (USD/BRL)', symbol: 'BRL=X', type: 'yahoo' },
    { name: 'Libra (GBP/BRL)', symbol: 'GBPBRL=X', type: 'yahoo' },
  ]},
  { id: 'cripto', gridId: 'grid-cripto', countId: 'm-count-cripto', items: [
    { name: 'Bitcoin', symbol: 'BTC-USD', type: 'yahoo' },
    { name: 'Ethereum', symbol: 'ETH-USD', type: 'yahoo' },
    { name: 'Solana', symbol: 'SOL-USD', type: 'yahoo' },
    { name: 'Cardano', symbol: 'ADA-USD', type: 'yahoo' },
    { name: 'Ripple', symbol: 'XRP-USD', type: 'yahoo' },
    { name: 'Dogecoin', symbol: 'DOGE-USD', type: 'yahoo' },
  ]},
  { id: 'juros', gridId: 'grid-juros', countId: 'm-count-juros', items: [
    { name: 'Treasury 13W', symbol: '^IRX', type: 'yahoo' },
    { name: 'Treasury 10Y', symbol: '^TNX', type: 'yahoo' },
    { name: 'Treasury 20Y', type: 'fred' },
    { name: 'Treasury 30Y', symbol: '^TYX', type: 'yahoo' },
  ]},
  { id: 'commodities', gridId: 'grid-commodities', countId: 'm-count-commodities', items: [
    { name: 'Petróleo (WTI)', symbol: 'CL=F', type: 'yahoo' },
    { name: 'Petróleo (Brent)', symbol: 'BZ=F', type: 'yahoo' },
    { name: 'Ouro', symbol: 'GC=F', type: 'yahoo' },
    { name: 'Prata', symbol: 'SI=F', type: 'yahoo' },
    { name: 'Minério de ferro (Cingapura)', symbol: 'TIO=F', type: 'minerio' },
    { name: 'Minério de ferro (Dalian)', symbol: 'DCE-I', type: 'minerio_dce' },
    { name: 'Café', symbol: 'KC=F', type: 'yahoo' },
    { name: 'Soja', symbol: 'ZS=F', type: 'yahoo' },
  ]}
];

/* =========================================================
   NEWS SOURCES
   ========================================================= */
const NEWS_SOURCES = {
  'Valor Econômico':  { letter: 'VA',  color: '#f59e0b', scope: 'br', name: 'Valor' },
  'InfoMoney':        { letter: 'IM',  color: '#ef4444', scope: 'br', name: 'InfoMoney' },
  'Investing.com BR': { letter: 'IN',  color: '#10b981', scope: 'br', name: 'Investing' },
  'ADVFN BR':         { letter: 'AF',  color: '#06b6d4', scope: 'br', name: 'ADVFN' },
  'Notícia Brasil':   { letter: 'NB',  color: '#22c55e', scope: 'br', name: 'Notícia Brasil' },
  'BeInCrypto BR':    { letter: 'BC',  color: '#f7931a', scope: 'br', name: 'BeInCrypto' },
  'Cointelegraph BR': { letter: 'CT',  color: '#facc15', scope: 'br', name: 'Cointelegraph' },
  'Money Times':      { letter: 'MT',  color: '#e11d48', scope: 'br', name: 'Money Times' },
  'InvestNews':       { letter: 'IV',  color: '#0ea5e9', scope: 'br', name: 'InvestNews' },
  'Valor Investe':    { letter: 'VI',  color: '#d97706', scope: 'br', name: 'Valor Investe' },
  'Bloomberg Línea':  { letter: 'BL',  color: '#6366f1', scope: 'br', name: 'Bloomberg Línea' },
  'Suno':             { letter: 'SU',  color: '#84cc16', scope: 'br', name: 'Suno' },
  'BMC News':         { letter: 'BM',  color: '#14b8a6', scope: 'br', name: 'BMC News' },
  'Notícias Agrícolas': { letter: 'NA', color: '#65a30d', scope: 'br', name: 'Notícias Agrícolas' },
  'Folha':            { letter: 'FO',  color: '#0284c7', scope: 'br', name: 'Folha Mercado' },
  'O Antagonista':    { letter: 'OA',  color: '#dc2626', scope: 'pol', name: 'O Antagonista' },
  'Poder360':         { letter: 'P3',  color: '#2563eb', scope: 'pol', name: 'Poder360' },
  'G1 Política':      { letter: 'G1',  color: '#c4170c', scope: 'pol', name: 'G1 Política' },
  'Agência Brasil':   { letter: 'AB',  color: '#16a34a', scope: 'pol', name: 'Agência Brasil' },
  'Bloomberg':        { letter: 'B',   color: '#4c8dff', scope: 'int', name: 'Bloomberg' },
  'Financial Juice':  { letter: 'FJ',  color: '#f0b90b', scope: 'int', name: 'Financial Juice' },
  'ForexLive':        { letter: 'FL',  color: '#22d3ee', scope: 'int', name: 'ForexLive' },
  'Zero Hedge':       { letter: 'ZH',  color: '#ea3943', scope: 'int', name: 'Zero Hedge' },
  'FXStreet':         { letter: 'FS',  color: '#ec4899', scope: 'int', name: 'FXStreet' },
  'FX Markets':       { letter: 'FX',  color: '#8b5cf6', scope: 'int', name: 'FX Markets' },
  'ING Think':        { letter: 'ING', color: '#f97316', scope: 'int', name: 'ING Think' },
  'CNBC':             { letter: 'C',   color: '#a78bfa', scope: 'int', name: 'CNBC' },
  'WSJ':              { letter: 'WS',  color: '#cbd5e1', scope: 'int', name: 'WSJ Markets' },
  'CoinDesk':         { letter: 'CD',  color: '#3b82f6', scope: 'int', name: 'CoinDesk' },
  'Proactive Investors': { letter: 'PI', color: '#0d9488', scope: 'int', name: 'Proactive Investors' },
  'Reuters':          { letter: 'R',   color: '#ff8000', scope: 'int', name: 'Reuters' },
  'RTTNews':          { letter: 'RT',  color: '#0ea5e9', scope: 'int', name: 'RTTNews (Nasdaq)' },
  'Barchart':         { letter: 'BA',  color: '#2563eb', scope: 'int', name: 'Barchart' },
  'Seeking Alpha':    { letter: 'SA',  color: '#f97316', scope: 'int', name: 'Seeking Alpha' },
  'Google News':      { letter: 'G',   color: '#94a3b8', scope: 'br', name: 'Google Notícias' },
  'Invezz':           { letter: 'IZ',  color: '#2dd4bf', scope: 'br', name: 'Invezz' }
};

/* =========================================================
   UTILS
   ========================================================= */
function toast(msg, type = 'info') {
  const icons = { success: '✓', danger: '✕', warning: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ico">${icons[type] || 'ℹ'}</span><span>${escapeHTML(msg)}</span>`;
  $('#toast-container').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'all .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(24px)';
    setTimeout(() => el.remove(), 300);
  }, 2400);
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  // aspas também, porque o resultado vai dentro de atributos (href="...", data-id="...")
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* =========================================================
   STATE
   ========================================================= */
const AppState = {
  readArticles: new Set((() => { try { const a = JSON.parse(localStorage.getItem(STORAGE.readArticles) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } })()),
  addReadArticle(url) {
    if (!url || url === '#') return;
    this.readArticles.add(url);
    const arr = Array.from(this.readArticles).slice(-300);
    try { localStorage.setItem(STORAGE.readArticles, JSON.stringify(arr)); } catch (e) { /* silencioso */ }
  }
};

/* =========================================================
   DATE / THEME
   ========================================================= */
$('#current-date').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

function applyTheme(t) {
  document.body.classList.toggle('light', t === 'light');
  const themeButton = $('#theme-toggle');
  themeButton.innerHTML = '<i class="fas fa-adjust" aria-hidden="true"></i>'; // meio círculo: o sol parecia uma segunda engrenagem ao lado de Ajustes
  const themeAction = t === 'light' ? 'Ativar tema escuro (Alt+L)' : 'Ativar tema claro (Alt+L)';
  themeButton.setAttribute('aria-label', themeAction);
  themeButton.title = themeAction;
  localStorage.setItem(STORAGE.theme, t);
  if ($('#heatmap-panel')?.classList.contains('active')) {
    renderHeatmap(heatmapSource);
  }
}
applyTheme(localStorage.getItem(STORAGE.theme) || 'dark');
$('#theme-toggle').addEventListener('click', () => {
  applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
  if ($('#briefing-modal')?.classList.contains('visible')) {
    setTimeout(generateWordFrequencyChart, 120);
  }
});

/* =========================================================
   TABS
   ========================================================= */
function switchTab(tabId) {
  // Insiders virou seção de "Macro e Fluxo" (13/11/2026): endereço e aba guardada antigos levam para lá
  if (tabId === 'insiders-panel') { tabId = 'analysis-panel'; setTimeout(() => window.__anaSecao?.('ins'), 0); }
  // se o foco estava dentro da aba que vai sumir, ele passa para o botão da aba nova (aba escondida com foco gera aviso no navegador)
  const ativa = document.activeElement?.closest?.('.tab-panel');
  if (ativa && ativa.id !== tabId) document.getElementById('tab-' + tabId)?.focus({ preventScroll: true });
  $$('.tab-btn').forEach(b => { const on = b.dataset.tab === tabId; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $$('.tab-panel').forEach(p => { const on = p.id === tabId; p.classList.toggle('active', on); if (on) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true'); });
  localStorage.setItem(STORAGE.activeTab, tabId);
  if (tabId === 'calendar-panel') setTimeout(fitCalendarIframe, 100);
  if (tabId === 'heatmap-panel') setTimeout(() => initHeatmapIfNeeded(), 150);
  if (window.__onTabSwitch) window.__onTabSwitch(tabId);
  document.dispatchEvent(new Event('mm-news-visible'));
  contarAba(tabId);
}
// uso das abas no /admin (04/11/2026): manda só o nome da aba; 'nova' = primeira vez no dia neste navegador
let abaContada = null;
function contarAba(tabId) {
  if (tabId === abaContada || !/^[a-z-]+-panel$/.test(tabId)) return;
  abaContada = tabId;
  let nova = 0;
  try { const k = 'mm_uso_' + tabId, d = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); if (localStorage.getItem(k) !== d) { localStorage.setItem(k, d); nova = 1; } } catch (e) { /* nada */ }
  fetch('/api/uso', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aba: tabId, nova }) }).catch(() => {});
}
$$('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
const savedTab = localStorage.getItem(STORAGE.activeTab);
if (savedTab && ($(`#${savedTab}`) || savedTab === 'insiders-panel')) switchTab(savedTab);
else contarAba(document.querySelector('.tab-btn.active')?.dataset.tab || '');

/* =========================================================
   TICKER
   ========================================================= */
// Selic e IPCA: uma busca a cada 30 min serve o letreiro e os cards (o BCB atualiza 1x por dia/mês)
const bcbMemo = {};
async function bcbSerie(code, query) {
  const k = code + query, m = bcbMemo[k];
  if (m && Date.now() - m.t < 30 * 60 * 1000) return m.p;
  // primeiro pelo worker (cache e menos bloqueio); se falhar, direto no Banco Central
  const direto = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados${query}${query.includes('?') ? '&' : '?'}formato=json`;
  const busca = (u) => fetchT(u, {}, 12000)
    .then((r) => { if (!r.ok) throw new Error('BCB HTTP ' + r.status); return r.json(); })
    .then((d) => { if (!Array.isArray(d) || !d.length) throw new Error('BCB sem dados'); return d; });
  const p = busca(`${CORS_PROXY}/bcb?c=${code}&q=${encodeURIComponent(query)}`).catch(() => busca(direto));
  bcbMemo[k] = { t: Date.now(), p };
  p.catch(() => { delete bcbMemo[k]; });
  return p;
}
const bcbDia = (s) => { const [d, m, y] = String(s).split('/'); return `${d}/${m}/${String(y).slice(2)}`; };
const bcbMes = (s) => { const [, m, y] = String(s).split('/'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1]}/${y}`; };
const pp = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;

// Selic meta (SGS 432), 3 anos: valor, última decisão do Copom que mudou a taxa e a próxima reunião
async function fetchSelic() {
  const ini = new Date(Date.now() - 3 * 365 * 864e5);
  const d = await bcbSerie(432, `?dataInicial=${String(ini.getDate()).padStart(2, '0')}/${String(ini.getMonth() + 1).padStart(2, '0')}/${ini.getFullYear()}`);
  const vals = d.map((x) => parseFloat(x.valor)).filter((v) => isFinite(v));
  const last = vals[vals.length - 1];
  let i = d.length - 1;
  while (i > 0 && parseFloat(d[i - 1].valor) === last) i--;
  const delta = i > 0 ? last - parseFloat(d[i - 1].valor) : 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const prox = (typeof COPOM_DECISIONS !== 'undefined' ? COPOM_DECISIONS : []).find((x) => x >= hoje);
  const notas = [];
  if (i > 0) notas.push(`Última mudança: ${pp(delta)} em ${bcbDia(d[i].data)}`);
  if (prox) notas.push(`Próximo Copom: ${prox.slice(8, 10)}/${prox.slice(5, 7)}`);
  return {
    value: last, change: delta, chgText: i > 0 ? pp(delta) : 'estável', date: `desde ${bcbDia(d[i].data)}`, unit: '%',
    sparkline: downsample(vals, 60), note: notas.join(' · '), tone: delta > 0 ? 'dn' : delta < 0 ? 'up' : 'eq'
  };
}
// IPCA: acumulado em 12 meses e variação do mês; meta do CMN 3% (tolerância até 4,5%)
// Fonte 1: BCB (SGS 13522 e 433; a API aceita no máximo 20 em "ultimos"). Fonte 2: IBGE/SIDRA, tabela 1737.
async function ipcaBCB() {
  const [a12, mes] = await Promise.all([bcbSerie(13522, '/ultimos/20'), bcbSerie(433, '/ultimos/1').catch(() => null)]);
  const serie = a12.map((x) => ({ ref: x.data.slice(6, 10) + x.data.slice(3, 5), v: parseFloat(x.valor) })).filter((x) => isFinite(x.v));
  const ult = serie[serie.length - 1];
  const m = mes && mes[0] && mes[0].data.slice(6, 10) + mes[0].data.slice(3, 5) === ult.ref ? parseFloat(mes[0].valor) : null;
  return { serie, mes: m, fonte: 'BCB' };
}
async function ipcaSIDRA() {
  let rows = null;
  for (const url of [`${CORS_PROXY}/sidra?q=ipca12`, 'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63,2265/p/last%2024']) {
    try { const r = await fetchT(url, {}, 12000); const j = await r.json(); if (r.ok && Array.isArray(j) && j.length > 1) { rows = j; break; } } catch (e) { /* próxima */ }
  }
  if (!rows) throw new Error('IBGE sem dados');
  // a 1ª linha é o cabeçalho: acha as colunas de variável e de mês pelo nome
  const h = rows[0], col = (re) => Object.keys(h).find((k) => /C$/.test(k) && re.test(h[k]));
  const kv = col(/^Vari/i), kp = col(/^M[êe]s/i);
  if (!kv || !kp) throw new Error('IBGE: formato inesperado');
  const by = {};
  rows.slice(1).forEach((r) => { const v = parseFloat(r.V); if (!isFinite(v)) return; (by[r[kp]] = by[r[kp]] || {})[r[kv]] = v; });
  const refs = Object.keys(by).sort();
  const serie = refs.filter((k) => by[k]['2265'] != null).map((k) => ({ ref: k, v: by[k]['2265'] }));
  if (!serie.length) throw new Error('IBGE sem acumulado');
  const ult = serie[serie.length - 1];
  return { serie, mes: by[ult.ref]['63'] ?? null, fonte: 'IBGE' };
}
async function fetchIPCA() {
  let d;
  try { d = await ipcaBCB(); } catch (e) { d = await ipcaSIDRA(); }
  const vals = d.serie.map((x) => x.v);
  const last = vals[vals.length - 1], prev = vals.length > 1 ? vals[vals.length - 2] : last;
  const delta = last - prev;
  const ref = d.serie[d.serie.length - 1].ref;   // AAAAMM
  const mesTxt = `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+ref.slice(4, 6) - 1]}/${ref.slice(0, 4)}`;
  const meta = last > 4.5 ? 'acima do teto da meta (4,5%)' : last < 1.5 ? 'abaixo do piso da meta (1,5%)' : 'dentro da meta (3% ± 1,5)';
  // variação em p.p. = acumulado em 12 meses contra o do mês anterior
  return {
    value: last, change: delta, chgText: pp(delta), date: `12m até ${mesTxt}`, unit: '%',
    sparkline: vals, note: `${d.mes != null && isFinite(d.mes) ? `Variação no mês: ${d.mes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% · ` : ''}${meta}${d.fonte === 'IBGE' ? ' · fonte IBGE' : ''}`,
    tone: delta > 0 ? 'dn' : delta < 0 ? 'up' : 'eq'
  };
}
// Minério de ferro: rota /minerio do worker (SGX em US$/t ou Dalian em ¥/t); Yahoo (TIO=F) só se ela falhar
async function fetchMinerio() {
  try {
    const r = await fetchT(`${CORS_PROXY}/minerio`, {}, 12000);
    const j = await r.json();
    if (!r.ok || j.valor == null || !isFinite(j.valor)) throw new Error(j.error || 'HTTP ' + r.status);
    // Dalian tem linha própria desde 30/10/2026: aqui fica só Cingapura (SGX)
    if (j.mercado === 'DCE') throw new Error('sem SGX');
    return { value: j.valor, change: Number.isFinite(j.variacao) ? j.variacao : 0, note: 'Futuro 62% Fe (Cingapura), US$ por tonelada' };
  } catch (e) {
    const y = await fetchYahooChartSingle('TIO=F');
    return { ...y, note: 'Yahoo (TIO=F), US$ por tonelada; pode estar defasado' };
  }
}
// Minério de ferro na bolsa de Dalian (DCE), contrato principal, em yuan por tonelada (pedido do Severino, 30/10/2026)
async function fetchMinerioDCE() {
  const r = await fetchT(`${CORS_PROXY}/minerio?m=dce`, {}, 12000);
  const j = await r.json();
  if (!r.ok || j.valor == null || !isFinite(j.valor)) throw new Error(j.error || 'HTTP ' + r.status);
  if (j.moeda !== 'USD') throw new Error('sem preço em dólar');
  const cny = Number.isFinite(j.valorCNY) ? ` (¥ ${j.valorCNY.toLocaleString('pt-BR')} a ${j.cambio.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} yuan por dólar)` : '';
  return { value: j.valor, change: Number.isFinite(j.variacao) ? j.variacao : NaN, unit: 'US$', note: `Bolsa de Dalian (China), contrato principal, convertido para US$ por tonelada${cny}` };
}
// AwesomeAPI fica direto do navegador: ela recusa (HTTP 429) as chamadas vindas da Cloudflare.
// Se ela falhar, a reserva é a Twelve Data pelo worker (/td).
async function fxReal(par) {
  try {
    const d = await (await fetchT(`https://economia.awesomeapi.com.br/last/${par}`)).json();
    const q = d[par.replace('-', '')], v = parseFloat(q?.bid);
    if (!isFinite(v)) throw new Error('AwesomeAPI sem cotação');
    return { value: v, change: parseFloat(q.pctChange), unit: 'R$' };
  } catch (e1) {
    const s = par.replace('-', '/');
    const d = await (await fetchT(`${CORS_PROXY}/td?s=${encodeURIComponent(s)}`)).json().catch(() => null);
    const q = d?.cotacoes?.[s];
    if (!q || !isFinite(q.valor)) throw e1;
    return { value: q.valor, change: q.variacao ?? NaN, unit: 'R$' };
  }
}
const fetchUSD = () => fxReal('USD-BRL');
const fetchEUR = () => fxReal('EUR-BRL');

/* ---- Yahoo: 1 chamada em lote por ciclo (em vez de ~40) ---- */
const YAHOO_SYMBOLS = [...new Set(
  MARKET_SECTIONS.flatMap(sec => sec.items)
    .filter(it => it.type === 'yahoo')
    .map(it => it.symbol)
    .concat(['^BVSP', '^GSPC', 'ES=F', 'NQ=F', 'EURUSD=X', 'GBPUSD=X', '^FCHI', '^KS11']) // os dois últimos: só a aba Mercado (mercado-novo.js) usa
)];
const YAHOO_MEMO_TTL = 45 * 1000;
let yahooMemo = {};        // símbolo -> valor já processado
let yahooBatchTs = 0;      // quando o último lote chegou
let yahooInflight = null;  // lote em andamento (evita chamadas duplicadas)

let yahooLastError = null;
let yahooErrorTs = 0;

/* ---- B3: Ibovespa e ações brasileiras pelo site de cotações da B3 (/b3 do worker, atraso de cerca de 15 min).
   Desde 04/11/2026 (Severino) o Yahoo volta a ser a fonte; a B3 só entra se o Yahoo não trouxer o ativo. ---- */
const b3Ticker = (sym) => (sym === '^BVSP' ? 'IBOV' : /^[A-Z0-9]{4,6}\.SA$/.test(sym) ? sym.slice(0, -3) : null);
async function b3Cotacoes(syms) {
  const pares = syms.map((s) => [s, b3Ticker(s)]).filter(([, t]) => t);
  const out = {};
  for (let i = 0; i < pares.length; i += 12) {
    const parte = pares.slice(i, i + 12);
    try {
      const res = await fetchT(`${CORS_PROXY}/b3?s=${parte.map(([, t]) => t).join(',')}`, {}, 15000);
      if (!res.ok) continue;
      const q = (await res.json())?.q || {};
      parte.forEach(([s, t]) => { if (q[t] && isFinite(q[t].p)) out[s] = q[t]; });
    } catch (e) { /* fica o Yahoo */ }
  }
  return out;
}
// junta a cotação da B3 (b) com a do Yahoo já processada (y, pode faltar)
function b3Junta(b, y) {
  const sp = Array.isArray(b.sp) && b.sp.length > 1 ? downsample(b.sp, 32) : (y?.sparkline || []);
  const ts = b.ts || y?.ts || null;
  return {
    ...(y || {}),
    value: b.p,
    change: isFinite(b.c) ? b.c : (y?.change ?? NaN),
    ts,
    date: ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : (y?.date || ''),
    sparkline: sp,
    volume: sp === y?.sparkline ? (y?.volume || []) : [],
    fonte: 'B3',
    dia: { abertura: b.ab, max: b.mx, min: b.mn, medio: b.md }
  };
}
window.mmB3 = { cotacoes: b3Cotacoes, junta: b3Junta, ticker: b3Ticker };
const B3_SYMBOLS = () => YAHOO_SYMBOLS.filter(b3Ticker);

function ensureYahooBatch(force = false) {
  if (!force && Date.now() - yahooBatchTs < YAHOO_MEMO_TTL) return Promise.resolve();
  if (yahooInflight) return yahooInflight;
  // após uma falha, não tenta de novo por 10 s (evita esperar vários timeouts seguidos)
  if (!force && yahooLastError && Date.now() - yahooErrorTs < 10000) return Promise.reject(yahooLastError);
  yahooInflight = (async () => {
    // só os ativos que o Yahoo não trouxe (todos, se o Yahoo falhou) vão buscar na B3
    const aplicaB3 = async (todos) => {
      const faltam = B3_SYMBOLS().filter((sym) => todos || !yahooMemo[sym] || !isFinite(yahooMemo[sym].value));
      if (!faltam.length) return;
      const q = await b3Cotacoes(faltam);
      Object.entries(q).forEach(([sym, b]) => { yahooMemo[sym] = b3Junta(b, yahooMemo[sym]); });
    };
    try {
      const res = await fetchT(`${CORS_PROXY}/quotes?symbols=${encodeURIComponent(YAHOO_SYMBOLS.join(','))}`, {}, 20000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const batch = await res.json();
      Object.entries(batch).forEach(([sym, chart]) => {
        try { yahooMemo[sym] = parseYahooChart(chart); }
        catch { delete yahooMemo[sym]; }
      });
      await aplicaB3();
      yahooBatchTs = Date.now();
      yahooLastError = null;
    } catch (e) {
      yahooBatchTs = 0;            // invalida: os cards passam a mostrar "dado antigo" em vez de fingir sucesso
      try { await aplicaB3(true); } catch (e2) { /* sem a B3 também */ }  // sem o Yahoo, o Ibovespa e as ações ainda vêm da B3
      yahooLastError = e;
      yahooErrorTs = Date.now();
      throw e;
    } finally {
      yahooInflight = null;
    }
  })();
  return yahooInflight;
}

async function fetchYahooChart(symbol) {
  if (YAHOO_SYMBOLS.includes(symbol)) {
    await ensureYahooBatch();
    if (yahooMemo[symbol]) return yahooMemo[symbol];
    throw new Error('Sem dados');
  }
  return fetchYahooChartSingle(symbol);
}

// Fallback para símbolos fora do lote (chamada individual)
async function fetchYahooChartSingle(symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const res = await fetchT(`${CORS_PROXY}/?url=${encodeURIComponent(yahooUrl)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseYahooChart(await res.json());
}

function parseYahooChart(data) {
  if (!data || !data.chart || !data.chart.result || !data.chart.result[0]) throw new Error('Resposta inválida');

  const result = data.chart.result[0];
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;

  const rawCloses  = result.indicators?.quote?.[0]?.close  || [];
  const rawVolumes = result.indicators?.quote?.[0]?.volume || [];

  // Filtra pares (close, volume) válidos para manter alinhamento
  const closes = [], volumes = [];
  for (let i = 0; i < rawCloses.length; i++) {
    if (rawCloses[i] != null) {
      closes.push(rawCloses[i]);
      volumes.push(rawVolumes[i] ?? 0);
    }
  }

  const { closes: cDs, volumes: vDs } = downsamplePair(closes, volumes, 32);

  return {
    value: price,
    change: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    ts: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    date: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
      : '',
    sparkline: cDs,
    volume: vDs
  };
}

async function fetchIBOV() { return fetchYahooChart('^BVSP'); }
async function fetchSP500() { return fetchYahooChart('^GSPC'); }
async function fetchTreasury20Y() {
  const res = await fetchT(`${CORS_PROXY}/fred/treasury20y`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // o FRED usa "." para dia sem dado (feriado nos EUA)
  const obs = (data.observations || []).filter(o => o && o.value !== '.' && !isNaN(parseFloat(o.value)));
  if (obs.length === 0) throw new Error('Sem dados');
  const last = parseFloat(obs[0].value);
  const prev = obs.length > 1 ? parseFloat(obs[1].value) : last;
  return { value: last, change: prev !== 0 ? ((last-prev)/prev)*100 : 0, date: obs[0].date, unit: '%' };
}

function updateTickerItem(id, data) {
  const valEl = $(`#t-${id}`);
  const chgEl = $(`#t-${id}-chg`);
  if (!valEl) return;
  if (data && data.value !== undefined && !isNaN(data.value)) {
    if (id === 'selic' || id === 'ipca') valEl.textContent = `${data.value.toFixed(2)}%`;
    else if (id === 'ibov' || id === 'sp500') valEl.textContent = data.value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    else valEl.textContent = `R$ ${data.value.toFixed(4)}`;
    valEl.title = data.date ? `Data: ${data.date}` : '';
    if (chgEl) {
      const chg = data.change || 0;
      chgEl.textContent = data.chgText ? data.chgText : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      chgEl.className = `chg ${data.tone ? (data.tone === 'eq' ? '' : data.tone) : chg >= 0 ? 'up' : 'dn'}`;
    }
  } else {
    valEl.textContent = '—';
    if (chgEl) { chgEl.textContent = ''; chgEl.className = 'chg'; }
  }
}

const TICKER_KEYS = ['selic', 'ipca', 'usd', 'eur', 'ibov', 'sp500'];
let tickerLast = {};   // últimos valores bons (sobrevivem a falhas de rede)
try {
  const rawT = localStorage.getItem(TICKER_CACHE_KEY);
  if (rawT) { const pt = JSON.parse(rawT); if (pt && pt.data) tickerLast = { ...pt.data }; }
} catch (e) { /* silencioso */ }

function markTickerStale(key, stale) {
  const item = document.querySelector(`#t-${key}`)?.closest('.item');
  if (!item) return;
  item.classList.toggle('stale', stale);
  item.title = stale ? 'Falha ao atualizar. Mostrando o último valor obtido.' : '';
}

let tickerBusy = false;
async function updateTicker(silent = false) {
  if (tickerBusy) return; // já tem uma atualização em andamento
  tickerBusy = true;
  try { await updateTickerRun(silent); } finally { tickerBusy = false; }
}
async function updateTickerRun(silent) {
  const ticker = $('#ticker');
  const btn = $('#refresh-ticker');
  ticker.classList.add('loading');
  btn.classList.add('spinning');

  if (!silent) { try { await ensureYahooBatch(true); } catch (e) { /* cada ativo trata o próprio erro */ } }

  const results = await Promise.allSettled([
    fetchSelic(), fetchIPCA(), fetchUSD(), fetchEUR(), fetchIBOV(), fetchSP500()
  ]);
  TICKER_KEYS.forEach((k, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      tickerLast[k] = r.value;
      updateTickerItem(k, r.value);
      markTickerStale(k, false);
    } else if (tickerLast[k]) {
      updateTickerItem(k, tickerLast[k]);
      markTickerStale(k, true);
    } else {
      updateTickerItem(k, null);
    }
  });

  window.__lastTickerResults = results;
  saveTickerCache(results);

  ticker.classList.remove('loading');
  btn.classList.remove('spinning');
  if (!silent) toast('Cotações atualizadas', 'success');
}

$('#refresh-ticker').addEventListener('click', (e) => { e.stopPropagation(); updateTicker(false); });
$$('.ticker .item').forEach(item => item.addEventListener('click', () => switchTab('market-panel')));

/* =========================================================
   MARKET PANEL
   ========================================================= */
let marketPrevCache = {};
let marketLoading = false;
let marketDataCache = {};
let storedMarket = { data: {}, timestamp: 0 };   // último snapshot salvo, usado se a 1ª carga falhar
try {
  const rawM = localStorage.getItem(MARKET_CACHE_KEY);
  if (rawM) { const pm = JSON.parse(rawM); if (pm && pm.data) storedMarket = pm; }
} catch (e) { /* silencioso */ }

function markStale(card, ts) {
  if (ts === null) { card.classList.remove('stale'); card.removeAttribute('title'); return; }
  card.classList.add('stale');
  const badge = card.querySelector('[data-badge]');
  if (badge) { badge.textContent = 'Salvo'; badge.className = 'qc-badge na'; }
  const t = ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  card.title = `Falha ao atualizar. Mostrando o último dado${t ? ' de ' + t : ''}.`;
  const timeEl = card.querySelector('[data-time]');
  if (timeEl && t && !timeEl.textContent) timeEl.textContent = 'consulta ' + t;
}
let liveMode = localStorage.getItem(STORAGE.liveMode) !== 'false';
let autoRefreshInterval = null;

function fmtNumber(v, opts = {}) {
  if (v === undefined || v === null || isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: opts.min ?? 2,
    maximumFractionDigits: opts.max ?? 2
  });
}

/* ---- SPARKLINE HELPERS ---- */
function downsample(arr, target) {
  if (!arr || arr.length <= target) return arr || [];
  const step = arr.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

// Mantém closes e volumes alinhados após o downsample
function downsamplePair(closes, volumes, target) {
  const n = closes.length;
  if (n === 0) return { closes: [], volumes: [] };
  if (n <= target) return { closes, volumes };
  const step = n / target;
  const cOut = [], vOut = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.min(n - 1, Math.floor(i * step));
    cOut.push(closes[idx]);
    vOut.push(volumes[idx] ?? 0);
  }
  cOut.push(closes[n - 1]);
  vOut.push(volumes[n - 1] ?? 0);
  return { closes: cOut, volumes: vOut };
}

function renderSparkline(container, values, isUp, volumes) {
  if (!container) return;
  if (!values || values.length < 2) { container.innerHTML = ''; return; }

  const vw = 200, vh = 40;     // viewBox
  const padX = 3;
  const innerW = vw - padX * 2;
  const volH = 11;             // altura reservada p/ volume
  const gap = 1;               // espacinho entre preço e volume
  const priceH = vh - volH - gap;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = innerW / (values.length - 1);

  // pontos da linha de preço
  const pts = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = priceH - ((v - min) / range) * priceH;
    return [x, y];
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L${(padX + innerW).toFixed(2)},${priceH} L${padX},${priceH} Z`;

  const color = isUp ? 'var(--pos)' : 'var(--neg)';
  const gid = 'sg' + Math.random().toString(36).slice(2, 8);

  // barras de volume
  let volBars = '';
  if (volumes && volumes.length === values.length) {
    const maxVol = Math.max(...volumes) || 1;
    const bw = Math.max(0.8, stepX * 0.55);
    volBars = volumes.map((vv, i) => {
      const bh = Math.max(0.8, (vv / maxVol) * volH);
      const x = padX + i * stepX - bw / 2;
      const y = vh - bh;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${color}" opacity="0.22"/>`;
    }).join('');
  }

  // pontos: abertura (vazado) e fechamento (preenchido)
  const p0 = pts[0];
  const pN = pts[pts.length - 1];
  const dotStart = `<circle cx="${p0[0].toFixed(2)}" cy="${p0[1].toFixed(2)}" r="2.5" fill="var(--surface)" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
  const dotEnd   = `<circle cx="${pN[0].toFixed(2)}" cy="${pN[1].toFixed(2)}" r="2.5" fill="${color}" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;

  container.innerHTML = `
    <svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" class="qc-spark-svg">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${volBars}
      <path d="${areaPath}" fill="url(#${gid})"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5"
            stroke-linejoin="round" stroke-linecap="round"
            vector-effect="non-scaling-stroke"/>
      ${dotStart}
      ${dotEnd}
    </svg>
  `;
}

// opts (opcional): { cls, label } — a watchlist usa para abrir o gráfico em vez de atualizar a cotação
function quoteCardHTML(item, opts = {}) {
  const key = item.symbol || item.type;
  const code = item.symbol || item.type.toUpperCase();
  const label = opts.label || `${item.name} (${code}): atualizar a cotação`;
  return `
    <div class="quote-card${opts.cls ? ' ' + opts.cls : ''}" data-symbol="${escapeHTML(key)}" role="button" tabindex="0" aria-label="${escapeHTML(label)}">
      <div class="qc-head">
        <div>
          <div class="qc-name">${escapeHTML(item.name)}</div>
          <div class="qc-symbol">${escapeHTML(code)}</div>
        </div>
        <span class="qc-badge na" data-badge>Carregando</span>
      </div>
      <div class="qc-price skeleton" data-price>—</div>
      <div class="qc-spark" data-spark></div>
      <div class="qc-note" data-note></div>
      <div class="qc-footer">
        <span class="qc-change na" data-change>—</span>
        <span class="qc-time" data-time>Consultando…</span>
      </div>
      <div class="qc-source">${escapeHTML(({yahoo:"Yahoo Finance",selic:"Banco Central",ipca:"Banco Central",fred:"FRED"})[item.type] || "")}</div>
    </div>
  `;
}

function renderMarketSections() {
  MARKET_SECTIONS.forEach(sec => {
    const grid = document.getElementById(sec.gridId);
    if (!grid) return;
    grid.innerHTML = sec.items.map((it) => quoteCardHTML(it)).join('');
    const c = document.getElementById(sec.countId);
    if (c) c.textContent = `${sec.items.length} ativos`;
  });
}

function flashCard(card, dir) {
  card.classList.remove('flash-up', 'flash-dn');
  void card.offsetWidth;
  card.classList.add(dir === 'up' ? 'flash-up' : 'flash-dn');
  setTimeout(() => card.classList.remove('flash-up', 'flash-dn'), 800);
}

function applyQuoteToCard(card, data, unit) {
  const priceEl = card.querySelector('[data-price]');
  const changeEl = card.querySelector('[data-change]');
  const badgeEl = card.querySelector('[data-badge]');
  const timeEl = card.querySelector('[data-time]');
  const sparkEl = card.querySelector('[data-spark]');
  card.classList.remove('qc-rt');   // o selo "tempo real" volta só se a transmissão repintar o card

  if (!data || data.value == null || !Number.isFinite(data.value)) {
    priceEl.textContent = '—';
    priceEl.classList.remove('skeleton');
    changeEl.textContent = '—';
    changeEl.className = 'qc-change na';
    badgeEl.textContent = 'Indisponível';
    badgeEl.className = 'qc-badge na';
    timeEl.textContent = 'sem dados';
    if (sparkEl) sparkEl.innerHTML = '';
    const noteEl0 = card.querySelector('[data-note]');
    if (noteEl0) noteEl0.textContent = '';
    card.classList.remove('up', 'dn');
    return;
  }

  const v = data.value;
  const chg = Number.isFinite(data.change) ? data.change : 0;
  const isUp = chg >= 0;

  let priceText;
  if (unit === '%') priceText = `${fmtNumber(v, { min: 2, max: 2 })}%`;
  else if (unit === 'R$') priceText = `R$ ${fmtNumber(v, { min: 4, max: 4 })}`;
  else if (v >= 10000) priceText = fmtNumber(v, { min: 0, max: 2 });
  else if (v >= 100) priceText = fmtNumber(v, { min: 2, max: 2 });
  else priceText = fmtNumber(v, { min: 2, max: 4 });

  priceEl.textContent = priceText;
  priceEl.classList.remove('skeleton');
  // Selic/IPCA mandam a variação pronta em p.p. e a cor certa (juro e inflação subindo = vermelho)
  const tone = data.tone || (isUp ? 'up' : 'dn');
  changeEl.textContent = data.chgText || `${isUp ? '+' : ''}${chg.toFixed(2)}%`;
  changeEl.className = `qc-change ${tone === 'eq' ? 'na' : tone}`;
  badgeEl.textContent = chg > 0 ? '▲' : chg < 0 ? '▼' : (data.chgText ? '=' : '▲');
  badgeEl.className = `qc-badge ${tone === 'eq' ? 'na' : tone}`;
  const noteEl = card.querySelector('[data-note]');
  if (noteEl) noteEl.textContent = data.note || '';
  timeEl.textContent = data.date || 'consulta ' + new Date(data.ts || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Mini gráfico com volume + pontos de abertura/fechamento
  if (sparkEl) {
    if (data.sparkline && data.sparkline.length > 1) {
      renderSparkline(sparkEl, data.sparkline, tone !== 'dn', data.volume);
    } else {
      sparkEl.innerHTML = '';
    }
  }

  card.classList.remove('up', 'dn');
  if (tone !== 'eq') card.classList.add(tone);

  marketDataCache[card.dataset.symbol] = { ...data, unit: unit || '' };

  const key = card.dataset.symbol;
  const prev = marketPrevCache[key];
  if (prev !== undefined && prev !== v) flashCard(card, v > prev ? 'up' : 'dn');
  marketPrevCache[key] = v;
}

async function fetchItemQuote(item) {
  if (item.type === 'selic') return await fetchSelic();
  if (item.type === 'ipca') return await fetchIPCA();
  if (item.type === 'minerio') return await fetchMinerio();
  if (item.type === 'minerio_dce') return await fetchMinerioDCE();
  if (item.type === 'fred') return await fetchTreasury20Y();
  if (item.type === 'yahoo') return await fetchYahooChart(item.symbol);
  throw new Error('Tipo desconhecido');
}

async function updateMarketPanel(silent = false) {
  if (marketLoading) return;
  if (!liveMode && silent) return;
  marketLoading = true;

  const info = $('#market-info');
  info.classList.add('loading');

  const flat = [];
  MARKET_SECTIONS.forEach(sec => {
    const grid = document.getElementById(sec.gridId);
    if (!grid) return;
    sec.items.forEach((item, idx) => {
      const card = grid.children[idx];
      if (card) flat.push({ item, card });
    });
  });

  if (!silent) { try { await ensureYahooBatch(true); } catch (e) { /* cada ativo trata o próprio erro */ } }
  const results = await Promise.allSettled(flat.map(({ item }) => fetchItemQuote(item)));

  let ok = 0, fail = 0;
  results.forEach((res, i) => {
    const { item, card } = flat[i];
    if (res.status === 'fulfilled') {
      applyQuoteToCard(card, { ...res.value, ts: Date.now() }, res.value.unit || item.unit || '');
      markStale(card, null);
      ok++;
    } else {
      const key = item.symbol || item.type;
      const old = marketDataCache[key] || storedMarket.data[key];
      if (old && old.value !== undefined) {
        applyQuoteToCard(card, old, old.unit || item.unit || '');
        markStale(card, old.ts || storedMarket.timestamp);
      } else {
        applyQuoteToCard(card, null);
      }
      fail++;
    }
  });

  saveMarketCache();

  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
  const dotColor = liveMode ? 'var(--pos)' : 'var(--text-3)';
  info.innerHTML = fail === 0
    ? `<span class="dot" style="background:${dotColor}"></span>${liveMode ? 'Atualizado' : 'Snapshot'}: <span id="market-last-update">${now}</span> · ${ok} ativos`
    : `<span class="dot" style="background:var(--accent)"></span>${liveMode ? 'Atualizado' : 'Snapshot'}: <span id="market-last-update">${now}</span> · ${ok}/${ok+fail} ativos`;

  info.classList.remove('loading');
  marketLoading = false;
  if (!silent) toast(liveMode ? 'Painel atualizado' : 'Snapshot salvo', 'success');
}

function saveMarketCache() {
  try {
    localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: marketDataCache
    }));
  } catch (e) { /* silencioso */ }
}

function loadMarketFromCache() {
  const raw = localStorage.getItem(MARKET_CACHE_KEY);
  if (!raw) return false;
  try {
    const { timestamp, data } = JSON.parse(raw);
    if (!data || Object.keys(data).length === 0) return false;
    let ok = 0;
    MARKET_SECTIONS.forEach(sec => {
      const grid = document.getElementById(sec.gridId);
      if (!grid) return;
      sec.items.forEach((item, idx) => {
        const card = grid.children[idx];
        if (!card) return;
        const key = item.symbol || item.type;
        const d = data[key];
        if (d && d.value !== undefined) {
          applyQuoteToCard(card, d, d.unit || item.unit || '');
          ok++;
        } else {
          applyQuoteToCard(card, null);
        }
      });
    });
    const dt = new Date(timestamp);
    const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const info = $('#market-info');
    info.innerHTML = `<span class="dot" style="background:var(--text-3)"></span>Snapshot de ${dateStr} ${timeStr} · ${ok} ativos`;
    return true;
  } catch (e) { return false; }
}

function saveTickerCache() {
  try {
    localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: tickerLast }));
  } catch (e) { /* silencioso */ }
}

function loadTickerFromCache() {
  const raw = localStorage.getItem(TICKER_CACHE_KEY);
  if (!raw) return false;
  try {
    const { data } = JSON.parse(raw);
    if (!data) return false;
    ['selic','ipca','usd','eur','ibov','sp500'].forEach(k => {
      updateTickerItem(k, data[k] || null);
    });
    return true;
  } catch { return false; }
}

let lastLiveRefresh = Date.now();

function liveRefresh() {
  lastLiveRefresh = Date.now();
  updateTicker(true);
  updateMarketPanel(true);
  refreshNews(false);
}

function startAutoRefresh() {
  stopAutoRefresh();
  lastLiveRefresh = Date.now();
  // confere a cada 30 s se já passou o intervalo (5 min no pregão, 15 min fora)
  autoRefreshInterval = setInterval(() => {
    if (!liveMode || document.hidden) return;   // aba em segundo plano não gasta solicitações
    if (Date.now() - lastLiveRefresh >= currentRefreshMs()) liveRefresh();
  }, 30 * 1000);
}

// Ao voltar para a aba, atualiza só se os dados já passaram do intervalo
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  renderMarketStatus();
  if (liveMode && Date.now() - lastLiveRefresh >= currentRefreshMs()) liveRefresh();
});
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

function setLiveMode(on, silent = false) {
  liveMode = on;
  localStorage.setItem(STORAGE.liveMode, on ? 'true' : 'false');
  const toggle = $('#live-toggle');
  if (toggle) { toggle.classList.toggle('on', on); toggle.setAttribute('aria-checked', String(on)); }
  if (on) {
    startAutoRefresh();
    newsLiveTick();
    updateTicker(true);
    updateMarketPanel(true);
    if (!silent) toast('Atualização automática ligada · a cada 5 min no pregão (15 min fora dele)', 'success');
  } else {
    stopAutoRefresh();
    syncNewsStream();
    saveMarketCache();
    saveTickerCache(window.__lastTickerResults || []);
    if (!silent) toast('Atualização automática desligada · usando o último snapshot', 'info');
  }
}

$('#live-toggle')?.addEventListener('click', (e) => {
  e.preventDefault();
  setLiveMode(!liveMode);
});

// teclado: Enter ou Espaço no card faz o mesmo que o clique (os cards da watchlist têm o próprio, no extras.js)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest?.('.quote-card[role="button"]');
  if (!card || e.target !== card || card.classList.contains('wl-card')) return;
  e.preventDefault();
  card.click();
});

document.addEventListener('click', async (e) => {
  const card = e.target.closest('.quote-card');
  if (!card) return;
  const symbol = card.dataset.symbol;
  let found = null;
  MARKET_SECTIONS.forEach(sec => sec.items.forEach(it => {
    if ((it.symbol || it.type) === symbol) found = it;
  }));
  if (!found) return;
  card.querySelector('[data-price]').classList.add('skeleton');
  try {
    const r = await fetchItemQuote(found);
    applyQuoteToCard(card, { ...r, ts: Date.now() }, r.unit || found.unit || '');
    markStale(card, null);
    saveMarketCache();
  } catch {
    // falhou: mantém o último dado bom em vez de apagar o card
    const old = marketDataCache[symbol];
    if (old && old.value !== undefined) { applyQuoteToCard(card, old, old.unit || found.unit || ''); markStale(card, old.ts); }
    else applyQuoteToCard(card, null);
  }
});

/* =========================================================
   MAPA DE CALOR (TRADINGVIEW)
   ========================================================= */
// mercado, período, tamanho e agrupamento ficam salvos neste navegador
const HM_SOURCES = {
  IBOV: { label: 'Ibovespa', desc: 'ações do Ibovespa' },
  SPX500: { label: 'S&P 500', desc: 'ações do S&P 500' },
  NASDAQ100: { label: 'Nasdaq 100', desc: 'ações do Nasdaq 100' },
  DJDJI: { label: 'Dow Jones', desc: 'ações do Dow Jones' },
  CRYPTO: { label: 'Cripto', desc: 'maiores criptomoedas', crypto: true }
};
const HM_PERIODS = { change: 'no dia', 'Perf.W': 'na semana', 'Perf.1M': 'em 1 mês', 'Perf.3M': 'em 3 meses', 'Perf.6M': 'em 6 meses', 'Perf.YTD': 'no ano', 'Perf.Y': 'em 12 meses' };
let heatmapSource = localStorage.getItem(HEATMAP_SOURCE_KEY) || 'IBOV';
if (!HM_SOURCES[heatmapSource]) heatmapSource = 'IBOV';   // valor antigo ("IBOVESPA") vira Ibovespa
let hmPrefs = { period: 'change', size: 'cap', group: true };
try { hmPrefs = { ...hmPrefs, ...(JSON.parse(localStorage.getItem('trader_heatmap_v2') || '{}') || {}) }; } catch (e) { /* padrão */ }
if (!HM_PERIODS[hmPrefs.period]) hmPrefs.period = 'change';
let heatmapInitialized = false;

function renderHeatmap(source) {
  const container = document.getElementById('tradingview-heatmap-container');
  if (!container) return;
  const src = HM_SOURCES[source] || HM_SOURCES.IBOV;
  container.innerHTML = '';

  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'tradingview-widget-container';
  widgetDiv.style.height = '100%';
  widgetDiv.style.width = '100%';

  const widgetInner = document.createElement('div');
  widgetInner.className = 'tradingview-widget-container__widget';
  widgetInner.style.height = '100%';
  widgetInner.style.width = '100%';
  widgetDiv.appendChild(widgetInner);

  container.appendChild(widgetDiv);

  const theme = document.body.classList.contains('light') ? 'light' : 'dark';
  const common = {
    blockColor: hmPrefs.period,
    locale: 'br',
    symbolUrl: '',
    colorTheme: theme,
    hasTopBar: false,
    isDataSetEnabled: false,
    isZoomEnabled: true,
    hasSymbolTooltip: true,
    isMonoSize: hmPrefs.size === 'mono',
    width: '100%',
    height: '100%'
  };
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  if (src.crypto) {
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js';
    script.innerHTML = JSON.stringify({ ...common, dataSource: 'Crypto', blockSize: hmPrefs.size === 'volume' ? '24h_vol_cmc' : 'market_cap_calc' });
  } else {
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.innerHTML = JSON.stringify({ ...common, dataSource: source, grouping: hmPrefs.group ? 'sector' : 'no_group', blockSize: hmPrefs.size === 'volume' ? 'volume' : 'market_cap_basic' });
  }
  script.onerror = () => {
    container.innerHTML = '<div class="hm-fail">Não foi possível carregar o mapa do TradingView agora. Verifique a conexão e tente de novo.</div>';
  };
  widgetDiv.appendChild(script);
  updateHeatmapSelectorUI();
}

function initHeatmapIfNeeded() {
  if (!heatmapInitialized) {
    heatmapInitialized = true;
    updateHeatmapSelectorUI();
    renderHeatmap(heatmapSource);
  }
}

function updateHeatmapSelectorUI() {
  const selector = document.getElementById('heatmap-selector');
  if (!selector) return;
  selector.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === heatmapSource);
    btn.setAttribute('aria-pressed', btn.dataset.source === heatmapSource);
  });
  const src = HM_SOURCES[heatmapSource] || HM_SOURCES.IBOV;
  const per = $('#hm-period'), size = $('#hm-size'), grp = $('#hm-group');
  if (per) per.value = hmPrefs.period;
  if (size) size.value = hmPrefs.size;
  if (grp) { grp.checked = !!hmPrefs.group; grp.closest('.hm-ctl')?.classList.toggle('off', !!src.crypto); }
  const desc = $('#hm-desc');
  if (desc) desc.innerHTML = `Cor: variação <b>${HM_PERIODS[hmPrefs.period]}</b> · tamanho: <b>${hmPrefs.size === 'mono' ? 'todos iguais' : hmPrefs.size === 'volume' ? 'volume' : 'valor de mercado'}</b> · ${src.desc}`;
}

document.getElementById('heatmap-selector')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const newSource = btn.dataset.source;
  if (newSource === heatmapSource) return;
  heatmapSource = newSource;
  localStorage.setItem(HEATMAP_SOURCE_KEY, heatmapSource);
  renderHeatmap(heatmapSource);
});
document.getElementById('hm-controls')?.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'hm-period') hmPrefs.period = t.value;
  else if (t.id === 'hm-size') hmPrefs.size = t.value;
  else if (t.id === 'hm-group') hmPrefs.group = t.checked;
  else return;
  try { localStorage.setItem('trader_heatmap_v2', JSON.stringify(hmPrefs)); } catch (err) { /* cheio */ }
  renderHeatmap(heatmapSource);
});
// tela cheia: o mapa ocupa o monitor inteiro (bom para segunda tela); F liga e desliga com a aba aberta
function heatmapFullscreen() {
  const wrap = document.querySelector('#heatmap-panel .heatmap-wrap');
  if (!wrap) return;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else Promise.resolve(wrap.requestFullscreen?.()).catch(() => toast('O navegador não permitiu a tela cheia.'));
}
document.getElementById('hm-full')?.addEventListener('click', heatmapFullscreen);
document.addEventListener('fullscreenchange', () => {
  const b = document.getElementById('hm-full');
  const on = document.fullscreenElement?.classList?.contains('heatmap-wrap');
  if (b) b.innerHTML = on ? '<i class="fas fa-compress"></i> <span>Sair da tela cheia</span>' : '<i class="fas fa-expand"></i> <span>Tela cheia</span>';
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'f' && e.key !== 'F') return;
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable) return;
  if (!document.getElementById('heatmap-panel')?.classList.contains('active')) return;
  e.preventDefault();
  heatmapFullscreen();
});

/* NOTÍCIAS: desde 22/11/2026 o código fica em noticias.js (carregado logo depois deste arquivo) */

/* =========================================================
   CALENDÁRIO ECONÔMICO
   ========================================================= */
$('#calendar-refresh-btn')?.addEventListener('click', () => {
  if (typeof ecalPrefs !== 'undefined' && ecalPrefs.view !== 'iframe') return; // só a visão Investing recarrega o quadro
  const iframe = $('#economic-calendar');
  if (!iframe) return;
  const btn = $('#calendar-refresh-btn');
  btn?.classList.add('spinning');
  const baseSrc = (iframe.getAttribute('src') || iframe.dataset.src || '').split('&_=')[0];
  if (!baseSrc) return;
  iframe.src = baseSrc + '&_=' + Date.now();
  setTimeout(() => btn?.classList.remove('spinning'), 1200);
  toast('Calendário recarregado', 'success');
});

/* =========================================================
   MINI CALENDÁRIO + ANOTAÇÕES
   ========================================================= */
let calNotes = {};
try {
  const o = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
  if (o && typeof o === 'object' && !Array.isArray(o)) calNotes = o;
} catch (e) { /* notas corrompidas: começa vazio */ }
// sempre no dia 1, senão "próximo mês" a partir do dia 31 pula um mês
let calViewDate = new Date(); calViewDate.setDate(1);
let calSelectedKey = null;

function saveCalNotes() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(calNotes)); } catch (e) { toast('Não foi possível salvar a nota', 'warning'); } }

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function formatDateFull(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
function formatDateShort(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function renderMiniCalendar() {
  const monthEl = $('#mini-month');
  const daysEl = $('#mini-days');
  if (!monthEl || !daysEl) return;

  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  monthEl.textContent = `${MONTHS_PT[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayKey = dateKey(new Date());

  const days = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({ day: daysInPrevMonth - i, date: new Date(year, month - 1, daysInPrevMonth - i), otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, date: new Date(year, month, d), otherMonth: false });
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ day: d, date: new Date(year, month + 1, d), otherMonth: true });
  }

  daysEl.innerHTML = days.map(({ day, date, otherMonth }) => {
    const key = dateKey(date);
    const isToday = key === todayKey;
    const hasNote = !!calNotes[key] && calNotes[key].length > 0;
    const isSelected = key === calSelectedKey;
    const keyEvents = (window.__calKeyDays || {})[key];
    const classes = ['mini-cal-day'];
    if (keyEvents) classes.push('has-key');
    if (otherMonth) classes.push('other-month');
    if (isToday) classes.push('today');
    if (hasNote) classes.push('has-note');
    if (isSelected) classes.push('selected');
    const tip = keyEvents ? ` title="${escapeHTML(keyEvents.join(' · '))}"` : '';
    return `<button class="${classes.join(' ')}" data-key="${key}"${tip}>${day}</button>`;
  }).join('');

  daysEl.querySelectorAll('.mini-cal-day').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      calSelectedKey = key;
      renderMiniCalendar();
      openNoteModal(key);
    });
  });
}

function renderUpcomingNotes() {
  const list = $('#mini-notes-list');
  if (!list) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);

  const entries = Object.entries(calNotes)
    .filter(([key, arr]) => arr && arr.length > 0 && key >= todayKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 20);

  if (entries.length === 0) {
    list.innerHTML = `<li style="padding: 16px; text-align: center; color: var(--text-3); font-size: 11.5px; font-style: italic; list-style: none;">Nenhum compromisso agendado.</li>`;
    return;
  }

  list.innerHTML = entries.map(([key, arr]) => {
    const preview = arr[0].length > 60 ? arr[0].slice(0, 60) + '…' : arr[0];
    const extra = arr.length > 1 ? ` +${arr.length - 1}` : '';
    return `
      <li class="mini-note-item" data-key="${key}">
        <span class="mn-date">${formatDateShort(key)}</span>
        <span class="mn-text">${escapeHTML(preview)}${extra}</span>
      </li>
    `;
  }).join('');

  list.querySelectorAll('.mini-note-item').forEach(li => {
    li.addEventListener('click', () => {
      const key = li.dataset.key;
      const [y, m] = key.split('-').map(Number);
      calViewDate = new Date(y, m - 1, 1);
      calSelectedKey = key;
      renderMiniCalendar();
      openNoteModal(key);
    });
  });
}

function openNoteModal(key) {
  calSelectedKey = key;
  const modal = $('#note-modal');
  const title = $('#note-date-title');
  if (!modal || !title) return;
  title.textContent = formatDateFull(key);
  renderNoteList(key);
  // 17/11/2026: eventos importantes do dia (as bolinhas vermelhas do calendário) e atalho para a agenda daquele dia
  let ag = $('#note-agenda');
  if (!ag) { ag = document.createElement('div'); ag.id = 'note-agenda'; ag.className = 'note-agenda'; title.insertAdjacentElement('afterend', ag); }
  const evs = (window.__calKeyDays || {})[key] || [];
  const naAgenda = (window.__calFeed || []).some((e) => e && e.date && spDay(e.date) === key);
  ag.hidden = !evs.length && !naAgenda;
  ag.innerHTML = `${evs.length ? `<b>Eventos importantes</b><ul>${evs.map((t) => `<li>${escapeHTML(t)}</li>`).join('')}</ul>` : ''}${naAgenda ? '<button type="button" class="btn-sm" id="note-ver-agenda"><i class="fas fa-calendar-day"></i> Ver a agenda deste dia</button>' : ''}`;
  $('#note-ver-agenda')?.addEventListener('click', () => { closeNoteModal(); ecalPrefs.day = key; ecalSetView('list'); renderEcal(); });
  $('#note-textarea').value = '';
  modal.classList.add('visible');
  setTimeout(() => $('#note-textarea')?.focus(), 150);
}
function closeNoteModal() {
  $('#note-modal')?.classList.remove('visible');
  calSelectedKey = null;
  renderMiniCalendar();
}
function renderNoteList(key) {
  const list = $('#note-list');
  if (!list) return;
  const notes = calNotes[key] || [];
  if (notes.length === 0) {
    list.innerHTML = `<li class="note-empty">Nenhuma anotação para este dia.</li>`;
    return;
  }
  list.innerHTML = notes.map((text, idx) => `
    <li class="note-item">
      <span class="n-text">${escapeHTML(text)}</span>
      <button class="n-del" data-idx="${idx}" title="Remover" aria-label="Remover"><i class="fas fa-times"></i></button>
    </li>
  `).join('');

  list.querySelectorAll('.n-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      if (calNotes[key]) {
        calNotes[key].splice(idx, 1);
        if (calNotes[key].length === 0) delete calNotes[key];
        saveCalNotes();
        renderNoteList(key);
        renderMiniCalendar();
        renderUpcomingNotes();
        toast('Anotação removida', 'info');
      }
    });
  });
}
function addNote(key, text) {
  const t = text.trim();
  if (!t) return;
  if (!calNotes[key]) calNotes[key] = [];
  calNotes[key].push(t);
  saveCalNotes();
  renderNoteList(key);
  renderMiniCalendar();
  renderUpcomingNotes();
}

$('#mini-prev')?.addEventListener('click', () => {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() - 1, 1);
  renderMiniCalendar();
});
$('#mini-next')?.addEventListener('click', () => {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 1);
  renderMiniCalendar();
});
$('#note-modal-close')?.addEventListener('click', closeNoteModal);
$('#note-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'note-modal') closeNoteModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#note-modal')?.classList.contains('visible')) closeNoteModal();
});
$('#note-add-btn')?.addEventListener('click', () => {
  const ta = $('#note-textarea');
  if (!ta || !calSelectedKey) return;
  const t = ta.value.trim();
  if (!t) { toast('Escreva algo antes de adicionar', 'warning'); ta.focus(); return; }
  addNote(calSelectedKey, t);
  ta.value = '';
  ta.focus();
  toast('Anotação adicionada', 'success');
});
$('#note-textarea')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $('#note-add-btn').click();
  }
});

renderMiniCalendar();
renderUpcomingNotes();

/* =========================================================
   STATUS DOS MERCADOS (horário regular, com os feriados de feriados.js)
   ========================================================= */
// a B3 fecha às 17h enquanto vale o horário de verão nos EUA e às 18h no resto do ano
const b3Fecha = (d) => { const h = (tz) => +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d); return ((h('UTC') - h('America/New_York') + 24) % 24) === 4 ? 17 * 60 : 18 * 60; };
const MARKETS = [
  { label: 'B3',   bolsa: 'b3',   tz: 'America/Sao_Paulo', open: 10 * 60,     close: b3Fecha },
  { label: 'NYSE', bolsa: 'nyse', tz: 'America/New_York',  open: 9 * 60 + 30, close: () => 16 * 60 }
];
const feriadoHoje = (m, d = new Date()) => { try { return window.MMFeriados?.[m.bolsa](MMFeriados.hojeEm(m.tz, d)) || null; } catch (e) { return null; } };
const REFRESH_OPEN_MS = 5 * 60 * 1000;
const REFRESH_CLOSED_MS = 15 * 60 * 1000;

function zonedParts(tz, d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value;
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  return { wd: get('weekday'), min: h * 60 + parseInt(get('minute'), 10) };
}
function marketIsOpen(m, d = new Date()) {
  const { wd, min } = zonedParts(m.tz, d);
  if (wd === 'Sat' || wd === 'Sun') return false;
  const f = feriadoHoje(m, d);
  if (f && !f.abre) return false;
  const abre = f?.abre ? +f.abre.slice(0, 2) * 60 + +f.abre.slice(3) : m.open;
  return min >= abre && min < m.close(d);
}
function currentRefreshMs() {
  return MARKETS.some(m => marketIsOpen(m)) ? REFRESH_OPEN_MS : REFRESH_CLOSED_MS;
}
function renderMarketStatus() {
  const el = $('#market-status');
  if (!el) return;
  el.innerHTML = MARKETS.map(m => {
    const open = marketIsOpen(m), f = feriadoHoje(m), wd = zonedParts(m.tz).wd;
    const fer = f && !f.abre && wd !== 'Sat' && wd !== 'Sun';
    return `<span class="ms-pill ${open ? 'open' : 'closed'}" title="${fer ? `Feriado: ${f.nome}` : 'Horário regular de negociação'}"><i></i>${m.label} ${open ? 'aberta' : fer ? 'feriado' : 'fechada'}</span>`;
  }).join('');
}

/* =========================================================
   RESUMO DE MERCADO (texto para WhatsApp / clientes)
   ========================================================= */

function sumNum(v, min, max) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
}
function sumChg(c) {
  if (c == null || isNaN(c)) return '';
  return ` (${c >= 0 ? '+' : '−'}${sumNum(Math.abs(c), 2, 2)}%)`;
}
function sumLine(label, q, fmt) {
  if (!q || q.value == null || isNaN(q.value)) return null;
  return `• ${label}: ${fmt(q.value)}${sumChg(q.change)}`;
}
function pickSummaryNews(max = 3) {
  // notícias marcadas com ⭐ têm prioridade (curadoria do assessor)
  const picks = getNewsPicks();
  if (picks.length) return picks.slice(0, max);
  const now = Date.now();
  const pool = (Array.isArray(newsAll) ? newsAll : []).filter(n => NEWS_BR.has(n.fonte) || n.traduzido);
  const recent = pool.filter(n => now - n.data < 24 * 3600 * 1000);
  return clusterNews(recent.length ? recent : pool).slice(0, max);
}

function buildSummaryText() {
  const now = new Date();
  const when = `${now.toLocaleDateString('pt-BR')}, ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const y = (sym, tk) => yahooMemo[sym] || (tk && tickerLast[tk]) || null;

  const brasil = [
    sumLine('Ibovespa', y('^BVSP', 'ibov'), v => sumNum(v, 0, 0)),
    sumLine('Dólar', tickerLast.usd || y('BRL=X'), v => `R$ ${sumNum(v, 4, 4)}`),
    sumLine('Euro', tickerLast.eur || y('EURBRL=X'), v => `R$ ${sumNum(v, 4, 4)}`)
  ];
  const selic = tickerLast.selic, ipca = tickerLast.ipca;
  const macro = [
    selic && !isNaN(selic.value) ? `Selic (meta): ${sumNum(selic.value, 2, 2)}% a.a.` : null,
    ipca && !isNaN(ipca.value) ? `IPCA (12 meses): ${sumNum(ipca.value, 2, 2)}%` : null
  ].filter(Boolean);
  if (macro.length) brasil.push('• ' + macro.join(' | '));

  const exterior = [
    sumLine('S&P 500', y('^GSPC', 'sp500'), v => sumNum(v, 2, 2)),
    sumLine('Nasdaq', y('^IXIC'), v => sumNum(v, 2, 2)),
    sumBpLine('Treasury 10Y', y('^TNX'))
  ];
  const commod = [
    sumLine('Petróleo Brent', y('BZ=F'), v => `US$ ${sumNum(v, 2, 2)}`),
    sumLine('Ouro', y('GC=F'), v => `US$ ${sumNum(v, 2, 2)}`),
    sumLine('Bitcoin', y('BTC-USD'), v => `US$ ${sumNum(v, 0, 0)}`)
  ];
  const news = pickSummaryNews(3).map(n => {
    const t = n.titulo.replace(/\s+/g, ' ').trim();
    const src = newsSourceLabel(n);
    return src ? `• ${t} (${src})` : `• ${t}`;
  });

  const blocks = [
    ['Brasil', brasil], ['Exterior', exterior], ['Commodities e cripto', commod], ['Destaques do dia', news]
  ].map(([title, lines]) => [title, lines.filter(Boolean)]).filter(([, lines]) => lines.length);

  if (!blocks.length) return 'Os dados ainda não foram carregados. Aguarde a atualização do painel e clique em "Regerar com dados atuais".';
  return `*📊 Resumo de mercado* — ${when}\n\n` + blocks.map(([t, l]) => `*${t}*\n${l.join('\n')}`).join('\n\n');
}

function openSummaryModal() {
  window.closeNewsReader?.(); // o leitor ficaria por cima do modal
  generateSummary();
  const stale = document.querySelector('.quote-card.stale, .ticker .item.stale');
  $('#summary-hint').textContent = stale
    ? 'Atenção: alguns dados estão desatualizados (falha na última atualização). Confira os valores antes de enviar.'
    : 'O texto é editável. Confira os valores antes de enviar ao cliente.';
  $('#summary-modal').classList.add('visible');
}
function closeSummaryModal() { $('#summary-modal').classList.remove('visible'); }

async function copySummary() {
  const ta = $('#summary-text');
  try {
    await navigator.clipboard.writeText(ta.value);
  } catch (e) {
    ta.select();
    document.execCommand('copy');
  }
  toast('Resumo copiado', 'success');
}

$('#summary-btn')?.addEventListener('click', openSummaryModal);
$('#summary-close')?.addEventListener('click', closeSummaryModal);
$('#summary-copy')?.addEventListener('click', copySummary);
$('#summary-refresh')?.addEventListener('click', async () => {
  try { await ensureYahooBatch(true); } catch (e) { /* usa o que já tem */ }
  await generateSummary();
  toast('Resumo regerado', 'info');
});
$('#summary-wa')?.addEventListener('click', () => {
  window.open('https://wa.me/?text=' + encodeURIComponent($('#summary-text').value), '_blank', 'noopener');
});
$('#summary-modal')?.addEventListener('click', (e) => { if (e.target.id === 'summary-modal') closeSummaryModal(); });

/* =========================================================
   RESUMO: MODELOS DE ABERTURA E FECHAMENTO + AGENDA
   ========================================================= */
const SUMMARY_MODE_KEY = 'summary_mode_v1';
const SP_TZ = 'America/Sao_Paulo';

// Decisões do Copom (2º dia da reunião, ~18h30). Atualize a cada ano com o calendário do BCB.
// Datas de decisão de juros: o único lugar a atualizar (index.html, indicadores.js e mesa.js leem daqui).
// Copom: calendário do BCB (2027 divulgado em 23/06/2026). FOMC: calendário oficial do Fed (2027 divulgado em 05/09/2025).
const COPOM_DECISIONS = ['2026-11-04', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08'];
const FOMC_DECISIONS = ['2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08'];
window.COPOM_DECISIONS = COPOM_DECISIONS; window.FOMC_DECISIONS = FOMC_DECISIONS;

// Principais ações do Ibovespa usadas em "maiores altas e baixas" (máx. 45 por chamada do proxy)
const IBOV_STOCKS = [
  'PETR4.SA', 'PETR3.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'BBAS3.SA', 'B3SA3.SA', 'ABEV3.SA', 'WEGE3.SA',
  'ITSA4.SA', 'SUZB3.SA', 'RENT3.SA', 'PRIO3.SA', 'GGBR4.SA', 'BPAC11.SA', 'EQTL3.SA', 'RDOR3.SA', 'RADL3.SA',
  'SBSP3.SA', 'VIVT3.SA', 'CMIG4.SA', 'LREN3.SA', 'HAPV3.SA', 'CSAN3.SA', 'UGPA3.SA', 'KLBN11.SA', 'TOTS3.SA',
  'ENEV3.SA', 'BBSE3.SA', 'CSNA3.SA', 'USIM5.SA', 'MGLU3.SA', 'CYRE3.SA', 'ASAI3.SA', 'HYPE3.SA', 'VBBR3.SA',
  'BRAP4.SA', 'SANB11.SA', 'TIMS3.SA', 'EGIE3.SA', 'CPFE3.SA', 'GOAU4.SA', 'RAIL3.SA', 'MULT3.SA', 'CXSE3.SA'
];

// Títulos do calendário (ForexFactory) traduzidos; o que não estiver aqui sai em inglês
const CAL_TITLES = {
  'Non-Farm Employment Change': 'Payroll',
  'Unemployment Rate': 'Taxa de desemprego',
  'Average Hourly Earnings m/m': 'Salário médio por hora',
  'ADP Non-Farm Employment Change': 'ADP (emprego privado)',
  'JOLTS Job Openings': 'JOLTS (vagas abertas)',
  'Unemployment Claims': 'Pedidos de seguro-desemprego',
  'CPI m/m': 'Inflação ao consumidor (CPI) m/m',
  'CPI y/y': 'Inflação ao consumidor (CPI) a/a',
  'Core CPI m/m': 'Núcleo do CPI m/m',
  'CPI Flash Estimate y/y': 'Inflação (prévia) a/a',
  'Core CPI Flash Estimate y/y': 'Núcleo da inflação (prévia) a/a',
  'PPI m/m': 'Inflação ao produtor (PPI) m/m',
  'Core PPI m/m': 'Núcleo do PPI m/m',
  'Core PCE Price Index m/m': 'Núcleo do PCE m/m',
  'Advance GDP q/q': 'PIB (1ª leitura) t/t',
  'Prelim GDP q/q': 'PIB (preliminar) t/t',
  'Final GDP q/q': 'PIB (final) t/t',
  'GDP q/q': 'PIB t/t',
  'Retail Sales m/m': 'Vendas no varejo m/m',
  'Core Retail Sales m/m': 'Núcleo das vendas no varejo m/m',
  'ISM Manufacturing PMI': 'PMI industrial (ISM)',
  'ISM Services PMI': 'PMI de serviços (ISM)',
  'CB Consumer Confidence': 'Confiança do consumidor (Conference Board)',
  'Prelim UoM Consumer Sentiment': 'Sentimento do consumidor (Michigan)',
  'Federal Funds Rate': 'Decisão de juros do Fed',
  'FOMC Statement': 'Comunicado do Fed',
  'FOMC Press Conference': 'Entrevista do presidente do Fed',
  'FOMC Meeting Minutes': 'Ata do Fed',
  'Main Refinancing Rate': 'Decisão de juros do BCE',
  'Monetary Policy Statement': 'Comunicado de política monetária',
  'ECB Press Conference': 'Entrevista da presidente do BCE',
  'Official Bank Rate': 'Decisão de juros do BoE',
  'Crude Oil Inventories': 'Estoques de petróleo',
  'President Trump Speaks': 'Discurso de Trump'
};
// Títulos do TradingView: primeiro exatos por país, depois tradução por partes
const CAL_TITLES_BY_COUNTRY = {
  BRL: {
    'Interest Rate Decision': 'Decisão do Copom (Selic)',
    'Copom Meeting Minutes': 'Ata do Copom', 'Copom Minutes': 'Ata do Copom',
    'Inflation Rate YoY': 'IPCA a/a', 'Inflation Rate MoM': 'IPCA m/m',
    'Mid-month Inflation Rate YoY': 'IPCA-15 a/a', 'Mid-month Inflation Rate MoM': 'IPCA-15 m/m'
  },
  USD: {
    'Non Farm Payrolls': 'Payroll', 'Fed Interest Rate Decision': 'Decisão de juros do Fed',
    'FOMC Minutes': 'Ata do Fed', 'Fed Press Conference': 'Entrevista do presidente do Fed',
    'Inflation Rate YoY': 'CPI a/a', 'Inflation Rate MoM': 'CPI m/m',
    'Core Inflation Rate YoY': 'Núcleo do CPI a/a', 'Core Inflation Rate MoM': 'Núcleo do CPI m/m',
    'Initial Jobless Claims': 'Pedidos de seguro-desemprego', 'JOLTs Job Openings': 'JOLTS (vagas abertas)',
    'ADP Employment Change': 'ADP (emprego privado)', 'Michigan Consumer Sentiment': 'Sentimento do consumidor (Michigan)'
  },
  EUR: { 'ECB Interest Rate Decision': 'Decisão de juros do BCE', 'ECB Press Conference': 'Entrevista da presidente do BCE' }
};
const CAL_WORDS = [
  [/^Core /, 'Núcleo: '], [/Inflation Rate/, 'Inflação'], [/GDP Growth Rate/, 'PIB'], [/Unemployment Rate/, 'Taxa de desemprego'],
  [/Interest Rate Decision/, 'Decisão de juros'], [/Retail Sales/, 'Vendas no varejo'], [/Industrial Production/, 'Produção industrial'],
  [/Average Hourly Earnings/, 'Salário médio por hora'], [/Balance of Trade/, 'Balança comercial'], [/Consumer Confidence/, 'Confiança do consumidor'],
  [/Manufacturing PMI/, 'PMI industrial'], [/Services PMI/, 'PMI de serviços'], [/PCE Price Index/, 'PCE'],
  [/\bFlash\b/, '(prévia)'], [/\bAdv\b/, '(1ª leitura)'], [/\bFinal\b/, '(final)'], [/\bYoY\b/, 'a/a'], [/\bMoM\b/, 'm/m'], [/\bQoQ\b/, 't/t']
];
const CAL_MONTHS = { Jan: 'jan', Feb: 'fev', Mar: 'mar', Apr: 'abr', May: 'mai', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'set', Oct: 'out', Nov: 'nov', Dec: 'dez' };
function calTitle(country, title) {
  const byC = CAL_TITLES_BY_COUNTRY[country] || {};
  if (byC[title]) return byC[title];
  if (CAL_TITLES[title]) return CAL_TITLES[title];
  // Investing já vem em português; só ajusta Copom e o mês de referência
  if (country === 'BRL' && /decis[aã]o.*juros/i.test(title)) return 'Decisão do Copom (Selic)';
  if (country === 'USD' && /Payroll\) não-agrícola/i.test(title)) title = title.replace(/Relatório de Emprego \(Payroll\) não-agrícola/i, 'Payroll');
  return CAL_WORDS.reduce((t, [re, pt]) => t.replace(re, pt), title)
    .replace(/\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\)/g, (_, m) => `(${CAL_MONTHS[m]})`);
}
const calIgnored = (e) => /CFTC|Sondas|GDPNow/i.test(e.title || '');
const CAL_FLAGS = { USD: '🇺🇸', EUR: '🇪🇺', CNY: '🇨🇳', GBP: '🇬🇧', JPY: '🇯🇵', BRL: '🇧🇷' };   // só nos textos de WhatsApp/Telegram
const CAL_CODES = { USD: 'EUA', EUR: 'UE', CNY: 'CN', GBP: 'UK', JPY: 'JP', BRL: 'BR' };       // na tela do site (sem emoji)

const spDay = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: SP_TZ });   // AAAA-MM-DD
const spDayLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = dt.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const nextBusinessDay = (key) => {
  let k = addDays(key, 1);
  while ([0, 6].includes(new Date(k + 'T12:00:00Z').getUTCDay())) k = addDays(k, 1);
  return k;
};

/* ---- Calendário internacional (via proxy /calendar) ---- */
let calFeed = null, calFeedTs = 0, calFeedError = null;
// última lista boa fica no navegador (até 7 dias): se o proxy falhar, o calendário mostra ela
const CAL_FEED_KEY = 'cal_feed_v1';
try { const c = JSON.parse(localStorage.getItem(CAL_FEED_KEY) || 'null'); if (c && Array.isArray(c.data) && Date.now() - c.ts < 7 * 864e5) calFeed = c.data; } catch (e) { /* silencioso */ }
async function loadCalendarFeed() {
  if (calFeed && Date.now() - calFeedTs < 30 * 60 * 1000) return calFeed;
  // o site do calendário não libera CORS: só funciona via proxy
  const sources = [`${CORS_PROXY}/calendar`];
  const errors = [];
  for (const url of sources) {
    try {
      const res = await fetchT(url, {}, 20000);
      const txt = await res.text();
      let data = null;
      try { data = JSON.parse(txt); } catch { /* não é JSON */ }
      if (!res.ok || !Array.isArray(data)) {
        const msg = (data && data.error) || txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        throw new Error(`HTTP ${res.status}${msg ? ': ' + msg : ''}`);
      }
      calFeed = data; calFeedTs = Date.now(); calFeedError = null;
      try { localStorage.setItem(CAL_FEED_KEY, JSON.stringify({ ts: calFeedTs, data })); } catch (e) { /* cota cheia */ }
      return calFeed;
    } catch (e) {
      errors.push(`${url.includes('faireconomy') ? 'direto' : 'proxy'} → ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`);
    }
  }
  calFeedError = new Error(errors.join(' | '));
  return calFeed || [];
}

// Eventos de um dia: calendário internacional + Copom + seus Compromissos do painel
function agendaForDay(key, feed, { medium = true } = {}) {
  const items = [];
  const groups = new Map();
  feed.forEach(e => {
    if (!e || !e.date || spDay(e.date) !== key || calIgnored(e)) return;
    const high = e.impact === 'High' && ['USD', 'EUR', 'CNY', 'GBP', 'BRL'].includes(e.country);
    const med = medium && e.impact === 'Medium' && e.country === 'BRL';
    if (!high && !med) return;
    const allDay = /T00:00:00-/.test(e.date);
    const time = allDay ? '' : new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SP_TZ });
    const g = `${time}|${e.country}`;
    if (!groups.has(g)) groups.set(g, { time, country: e.country, titles: [] });
    const proj = e.impact === 'High' && e.forecast ? ` (proj. ${e.forecast})` : '';
    const t = calTitle(e.country, e.title) + proj;
    if (!groups.get(g).titles.includes(t)) groups.get(g).titles.push(t);
  });
  groups.forEach(g => {
    const extra = g.titles.length > 3 ? ` e mais ${g.titles.length - 3}` : '';
    items.push({ time: g.time, text: `${CAL_FLAGS[g.country] || g.country} ${g.titles.slice(0, 3).join('; ')}${extra}` });
  });

  const feedHasCopom = items.some(i => /copom/i.test(i.text));
  if (!feedHasCopom) COPOM_DECISIONS.forEach(d => {
    if (d === key) items.push({ time: '18:30', text: '🇧🇷 Decisão do Copom (Selic)' });
    if (addDays(d, 6) === key) items.push({ time: '08:00', text: '🇧🇷 Ata do Copom' });
  });
  (calNotes[key] || []).forEach(n => items.push({ time: '', text: `📌 ${n}` }));

  return items
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
    .map(i => `• ${i.time ? i.time + ' ' : ''}${i.text}`);
}

// "No radar": eventos de alto impacto dos próximos dias da semana
function agendaRadar(fromKey, feed, max = 5) {
  const out = [];
  for (let i = 1; i <= 6 && out.length < max; i++) {
    const k = addDays(fromKey, i);
    const titles = [];
    const order = ['BRL', 'USD', 'EUR', 'CNY'];
    feed
      .filter(e => e && e.date && spDay(e.date) === k && !calIgnored(e) && e.impact === 'High' && order.includes(e.country))
      .sort((a, b) => order.indexOf(a.country) - order.indexOf(b.country))
      .forEach(e => {
        // sem "(Mensal)", "(set)" etc., para não repetir o mesmo indicador
        const base = calTitle(e.country, e.title).replace(/\s*\([^)]*\)/g, '').trim();
        const t = `${CAL_FLAGS[e.country]} ${base}`;
        if (!titles.includes(t)) titles.push(t);
      });
    if (COPOM_DECISIONS.includes(k) && !titles.some(t => /copom/i.test(t))) titles.push('🇧🇷 Decisão do Copom (Selic)');
    if (titles.length) out.push(`• ${spDayLabel(k)}: ${titles.slice(0, 4).join(', ')}`);
  }
  return out;
}

// Indicadores de alto impacto já divulgados no dia, com resultado x projeção
function agendaResults(key, feed, max = 6) {
  return feed
    .filter(e => e && e.date && spDay(e.date) === key && e.impact === 'High' && e.actual && !calIgnored(e)
      && ['USD', 'EUR', 'CNY', 'BRL'].includes(e.country))
    .slice(0, max)
    .map(e => `• ${CAL_FLAGS[e.country]} ${calTitle(e.country, e.title)}: ${e.actual}${e.forecast ? ` (proj. ${e.forecast})` : ''}`);
}

/* ---- Ações do Ibovespa (maiores altas e baixas) ---- */
let stocksMemo = {}, stocksTs = 0;
async function loadIbovStocks() {
  if (Date.now() - stocksTs < 2 * 60 * 1000 && Object.keys(stocksMemo).length) return stocksMemo;
  const res = await fetchT(`${CORS_PROXY}/quotes?symbols=${encodeURIComponent(IBOV_STOCKS.join(','))}`, {}, 20000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const batch = await res.json();
  const memo = {};
  Object.entries(batch).forEach(([sym, chart]) => {
    try { memo[sym] = parseYahooChart(chart); } catch { /* símbolo sem dados */ }
  });
  stocksMemo = memo; stocksTs = Date.now();
  return memo;
}
function ibovMovers(memo, refTs, n = 3) {
  const refDay = refTs ? spDay(refTs) : null;
  const list = Object.entries(memo)
    .filter(([, q]) => q && q.value != null && !isNaN(q.change) && (!refDay || !q.ts || spDay(q.ts) === refDay))
    .map(([sym, q]) => ({ sym: sym.replace('.SA', ''), ...q }))
    .sort((a, b) => b.change - a.change);
  const fmt = (s) => `• ${s.sym}: R$ ${sumNum(s.value, 2, 2)}${sumChg(s.change)}${whyNews(s.sym, refTs)}`;
  return {
    up: list.slice(0, n).filter(s => s.change > 0).map(fmt),
    down: list.slice(-n).reverse().filter(s => s.change < 0).map(fmt),
    count: list.length
  };
}

/* ---- Montagem dos modelos ---- */
function summaryNewsLines(max = 3) {
  return pickSummaryNews(max).map(n => {
    const t = n.titulo.replace(/\s+/g, ' ').trim();
    const src = newsSourceLabel(n);
    return src ? `• ${t} (${src})` : `• ${t}`;
  });
}
function joinBlocks(header, blocks) {
  const ok = blocks.map(([t, l]) => [t, l.filter(Boolean)]).filter(([, l]) => l.length);
  if (!ok.length) return 'Os dados ainda não foram carregados. Aguarde a atualização do painel e clique em "Regerar com dados atuais".';
  return `${header}\n\n` + ok.map(([t, l]) => `*${t}*\n${l.join('\n')}`).join('\n\n');
}

async function buildOpeningText() {
  const feed = await loadCalendarFeed();
  const y = (sym, tk) => yahooMemo[sym] || (tk && tickerLast[tk]) || null;
  const today = spDay(Date.now());
  const head = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: SP_TZ });

  const asia = [
    sumLine('Nikkei (Japão)', y('^N225'), v => sumNum(v, 0, 0)),
    sumLine('Hang Seng (Hong Kong)', y('^HSI'), v => sumNum(v, 0, 0)),
    sumLine('Xangai (China)', y('000001.SS'), v => sumNum(v, 0, 0))
  ];
  const europa = [
    sumLine('Euro Stoxx 50', y('^STOXX50E'), v => sumNum(v, 0, 0)),
    sumLine('DAX (Alemanha)', y('^GDAXI'), v => sumNum(v, 0, 0)),
    sumLine('FTSE 100 (Reino Unido)', y('^FTSE'), v => sumNum(v, 0, 0))
  ];
  const eua = [
    sumLine('S&P 500 futuro', y('ES=F'), v => sumNum(v, 0, 0)),
    sumLine('Nasdaq futuro', y('NQ=F'), v => sumNum(v, 0, 0)),
    sumBpLine('Treasury 10Y', y('^TNX'))
  ];
  const ibov = y('^BVSP', 'ibov');
  const brasil = [
    ibov ? `• Ibovespa (último fechamento): ${sumNum(ibov.value, 0, 0)}${sumChg(ibov.change)}` : null,
    sumLine('Dólar', tickerLast.usd || y('BRL=X'), v => `R$ ${sumNum(v, 4, 4)}`)
  ];
  const commod = [
    sumLine('Petróleo Brent', y('BZ=F'), v => `US$ ${sumNum(v, 2, 2)}`),
    sumLine('Ouro', y('GC=F'), v => `US$ ${sumNum(v, 2, 2)}`),
    sumLine('Bitcoin', y('BTC-USD'), v => `US$ ${sumNum(v, 0, 0)}`)
  ];

  // texto da manhã pela IA (servidor, o mesmo do canal); sem ele, sai como antes com os Destaques
  let manha = null;
  try {
    const r = await fetchT('/api/abertura/manha', { credentials: 'same-origin' }, 40000);
    if (r.ok) manha = (await r.json()).manha || null;
  } catch (e) { /* segue sem o texto da IA */ }
  const visao = manha && manha.visao ? `\n\n*O que esperar hoje*\n${manha.visao}` : '';
  return joinBlocks(`*☀️ Abertura de mercado* — ${head}${visao}`, [
    ['Ásia (fechamento)', asia],
    ['Europa', europa],
    ['EUA (pré-abertura)', eua],
    ['Brasil', brasil],
    ['Commodities e cripto', commod],
    ['🗓️ Agenda de hoje (horário de Brasília)', agendaForDay(today, feed)],
    ['No radar da semana', agendaRadar(today, feed)],
    manha && manha.noticias && manha.noticias.length
      ? ['5 notícias para começar o dia', manha.noticias.map((n, i) => `${i + 1}. ${n}`)]
      : ['Destaques', summaryNewsLines(3)]
  ]);
}

async function buildClosingText() {
  const feed = await loadCalendarFeed();
  const y = (sym, tk) => yahooMemo[sym] || (tk && tickerLast[tk]) || null;
  const ibov = y('^BVSP', 'ibov');
  const refTs = ibov && ibov.ts ? ibov.ts : Date.now();
  const refDay = spDay(refTs);
  const head = new Date(refTs).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: SP_TZ });

  let movers = { up: [], down: [], count: 0 };
  try { movers = ibovMovers(await loadIbovStocks(), ibov && ibov.ts); } catch (e) { /* segue sem altas e baixas */ }

  const brasil = [
    sumLine('Ibovespa', ibov, v => sumNum(v, 0, 0)),
    sumLine('Dólar', tickerLast.usd || y('BRL=X'), v => `R$ ${sumNum(v, 4, 4)}`),
    sumLine('Euro', tickerLast.eur || y('EURBRL=X'), v => `R$ ${sumNum(v, 4, 4)}`)
  ];
  const selic = tickerLast.selic, ipca = tickerLast.ipca;
  const macro = [
    selic && !isNaN(selic.value) ? `Selic (meta): ${sumNum(selic.value, 2, 2)}% a.a.` : null,
    ipca && !isNaN(ipca.value) ? `IPCA (12 meses): ${sumNum(ipca.value, 2, 2)}%` : null
  ].filter(Boolean);
  if (macro.length) brasil.push('• ' + macro.join(' | '));

  const exterior = [
    sumLine('S&P 500', y('^GSPC', 'sp500'), v => sumNum(v, 2, 2)),
    sumLine('Nasdaq', y('^IXIC'), v => sumNum(v, 2, 2)),
    sumLine('Euro Stoxx 50', y('^STOXX50E'), v => sumNum(v, 0, 0)),
    sumBpLine('Treasury 10Y', y('^TNX'))
  ];
  const commod = [
    sumLine('Petróleo Brent', y('BZ=F'), v => `US$ ${sumNum(v, 2, 2)}`),
    sumLine('Ouro', y('GC=F'), v => `US$ ${sumNum(v, 2, 2)}`),
    sumLine('Bitcoin', y('BTC-USD'), v => `US$ ${sumNum(v, 0, 0)}`)
  ];
  const next = nextBusinessDay(refDay);

  return joinBlocks(`*🌙 Fechamento de mercado* — ${head}`, [
    ['Brasil', brasil],
    ['📈 Maiores altas do Ibovespa', movers.up],
    ['📉 Maiores baixas do Ibovespa', movers.down],
    ['Exterior', exterior],
    ['Commodities e cripto', commod],
    ['📋 Indicadores do dia', agendaResults(refDay, feed)],
    ['Destaques do dia', summaryNewsLines(3)],
    [`🗓️ Agenda de ${spDayLabel(next).toLowerCase()} (horário de Brasília)`, agendaForDay(next, feed, { medium: false })]
  ]);
}

function defaultSummaryMode() {
  let saved = null;
  try { saved = localStorage.getItem(SUMMARY_MODE_KEY); } catch (e) { /* silencioso */ }
  if (saved === 'completo') return saved;
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: SP_TZ })) % 24;
  return h >= 6 && h < 13 ? 'abertura' : 'fechamento';
}
let summaryMode = defaultSummaryMode();

let summarySeq = 0;
async function generateSummary() {
  const ta = $('#summary-text');
  const my = ++summarySeq; // um clique mais novo vence o resumo que ainda estava carregando
  $$('.summary-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === summaryMode));
  // rodapé com o link do site em todos os modelos (pedido do Severino, 12/11/2026)
  const rodape = (t) => (/^Os dados ainda não/.test(t) || /mercadomacro\.com\.br\s*$/.test(t) ? t : `${t.trimEnd()}\n\nPainel completo: https://mercadomacro.com.br`);
  if (summaryMode === 'completo') { ta.value = rodape(buildSummaryText()); return; }
  ta.value = 'Gerando…';
  let txt;
  try {
    txt = summaryMode === 'abertura' ? await buildOpeningText()
      : summaryMode === 'semana' ? await buildWeekAgendaText()
      : await buildClosingText();
  } catch (e) {
    txt = buildSummaryText();
  }
  if (my !== summarySeq) return;
  ta.value = rodape(txt);
  if (calFeedError && !(calFeed && calFeed.length)) {
    $('#summary-hint').textContent = 'Agenda internacional indisponível agora. Copom e seus Compromissos continuam aparecendo.';
  }
}

$$('.summary-mode-btn').forEach(b => b.addEventListener('click', () => {
  summaryMode = b.dataset.mode;
  try { localStorage.setItem(SUMMARY_MODE_KEY, summaryMode === 'completo' ? 'completo' : ''); } catch (e) { /* silencioso */ }
  generateSummary();
}));

/* =========================================================
   CALENDÁRIO PRÓPRIO (lista com filtros, a partir do /calendar)
   ========================================================= */
const ECAL_PREFS_KEY = 'ecal_prefs_v1';
const ECAL_KEY_RE = /copom|selic|juros|payroll|ipca|\bcpi\b|ipc\b|pce|\bpib\b|gdp|fomc|\bfed\b|bce|ecb/i;
let ecalPrefs = { view: 'list', country: 'all', impact: 'mid', day: null };
try { Object.assign(ecalPrefs, JSON.parse(localStorage.getItem(ECAL_PREFS_KEY) || '{}')); } catch (e) { /* silencioso */ }
ecalPrefs.day = null;   // sempre abre no dia de hoje
const saveEcalPrefs = () => { try { localStorage.setItem(ECAL_PREFS_KEY, JSON.stringify({ ...ecalPrefs, day: null })); } catch (e) { /* silencioso */ } };

const ECAL_COUNTRIES = [
  ['all', 'Todos'], ['BRL', 'Brasil'], ['USD', 'EUA'], ['EUR', 'Europa'], ['CNY', 'China']
];
const ECAL_IMPACTS = [['high', 'Alto'], ['mid', 'Médio e alto'], ['all', 'Todos']];
const ECAL_RANK = { High: 3, Medium: 2, Low: 1 };

// Dias com evento-chave (para o mini-calendário): { 'AAAA-MM-DD': ['Payroll', ...] }
function computeCalKeyDays(feed) {
  const map = {};
  const add = (k, t) => { (map[k] = map[k] || []); if (!map[k].includes(t)) map[k].push(t); };
  feed.forEach(e => {
    if (!e || !e.date || e.impact !== 'High' || !['BRL', 'USD', 'EUR'].includes(e.country)) return;
    if (!ECAL_KEY_RE.test(e.title)) return;
    add(spDay(e.date), `${CAL_CODES[e.country] || ''} ${calTitle(e.country, e.title).replace(/\s*\([^)]*\)/g, '')}`.trim());
  });
  COPOM_DECISIONS.forEach(d => add(d, 'BR Decisão do Copom (Selic)'));
  return map;
}

function ecalSetView(view) {
  ecalPrefs.view = view;
  saveEcalPrefs();
  $('#ecal')?.classList.toggle('hidden', view !== 'list');
  $('.calendar-iframe-wrap')?.classList.toggle('hidden', view !== 'iframe');
  $('#earn-root')?.classList.toggle('hidden', view !== 'earn');
  $('#ipo-root')?.classList.toggle('hidden', view !== 'ipo');
  $('#bbr-root')?.classList.toggle('hidden', view !== 'bbr');
  $('#focus-root')?.classList.toggle('hidden', view !== 'focus');
  $('#prov-root')?.classList.toggle('hidden', view !== 'prov');
  // no Focus a tabela é larga: o calendário do mês e os compromissos saem de lado
  $('.calendar-layout')?.classList.toggle('wide', view === 'focus' || view === 'prov' || view === 'bbr' || view === 'earn' || view === 'ipo');
  // os botões de agenda, .ics e avisos e o status só valem para a lista do calendário
  $('.ecal-actions')?.classList.toggle('hidden', view === 'earn' || view === 'ipo' || view === 'bbr' || view === 'focus' || view === 'prov');
  $('#ecal-status')?.classList.toggle('hidden', view === 'earn' || view === 'ipo' || view === 'bbr' || view === 'focus' || view === 'prov');
  $$('.ecal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'iframe') {
    // o calendário do Investing só carrega quando esta visão é aberta
    const ifr = $('#economic-calendar');
    if (ifr && !ifr.getAttribute('src') && ifr.dataset.src) ifr.src = ifr.dataset.src;
    setTimeout(fitCalendarIframe, 50);
  }
  if (view === 'earn') ecalEarn();
  if (view === 'focus') ecalLazy('#focus-root', 'focus.js?v=6', '__focusRender', 'o Boletim Focus');
  if (view === 'bbr') ecalLazy('#bbr-root', 'balancos-br.js?v=3', '__bbrRender', 'a agenda de balanços do Brasil');
  if (view === 'prov') ecalLazy('#prov-root', 'proventos.js?v=3', '__provRender', 'a agenda de proventos');
  if (view === 'ipo') ecalLazy('#ipo-root', 'ipos.js?v=2', '__ipoRender', 'o calendário de IPOs');
}

// carrega o arquivo da visão só na primeira vez que ela é aberta
function ecalLazy(sel, src, fn, nome) {
  const el = $(sel);
  if (!el) return;
  if (window[fn]) { window[fn](el); return; }
  if (document.querySelector(`script[data-lazy="${src}"]`)) return;
  const sc = document.createElement('script');
  sc.src = src; sc.dataset.lazy = src;
  sc.onload = () => window[fn] && window[fn](el);
  sc.onerror = () => { el.innerHTML = `<div class="er-msg" style="padding:40px;text-align:center">Não foi possível carregar ${nome}.</div>`; sc.remove(); };
  document.head.appendChild(sc);
}

function ecalEarn() {
  const el = $('#earn-root');
  if (!el) return;
  if (window.__earnRender) { window.__earnRender(el); return; }
  if (document.querySelector('script[data-earn]')) return;
  const sc = document.createElement('script');
  sc.src = 'balancos.js?v=5'; sc.dataset.earn = '1';
  sc.onload = () => window.__earnRender && window.__earnRender(el);
  sc.onerror = () => { el.innerHTML = '<div class="er-msg" style="padding:40px;text-align:center">Não foi possível carregar os balanços.</div>'; sc.remove(); };
  document.head.appendChild(sc);
}

function ecalChips(el, items, current, onPick) {
  el.innerHTML = items.map(([v, l]) => `<button class="ecal-chip${v === current ? ' active' : ''}" data-v="${v}">${l}</button>`).join('');
  el.querySelectorAll('.ecal-chip').forEach(b => b.addEventListener('click', () => onPick(b.dataset.v)));
}

function ecalBulls(impact) {
  const n = ECAL_RANK[impact] || 1;
  return `<span class="ecal-bulls i${n}" title="Impacto ${impact === 'High' ? 'alto' : impact === 'Medium' ? 'médio' : 'baixo'}">${'●'.repeat(n)}${'○'.repeat(3 - n)}</span>`;
}

function renderEcal() {
  const list = $('#ecal-list');
  if (!list) return;
  const feed = window.__calFeed || [];
  const today = spDay(Date.now());

  // dias disponíveis no feed (semana atual)
  const days = [...new Set(feed.filter(e => e && e.date).map(e => spDay(e.date)))].sort();
  if (!ecalPrefs.day || !days.includes(ecalPrefs.day)) ecalPrefs.day = days.includes(today) ? today : (days.find(d => d > today) || days[days.length - 1] || today);

  ecalChips($('#ecal-days'), days.map(d => [d, d === today ? `Hoje ${spDayLabel(d).slice(4)}` : spDayLabel(d)]), ecalPrefs.day,
    v => { ecalPrefs.day = v; renderEcal(); });
  ecalChips($('#ecal-countries'), ECAL_COUNTRIES, ecalPrefs.country, v => { ecalPrefs.country = v; saveEcalPrefs(); renderEcal(); });
  ecalChips($('#ecal-impacts'), ECAL_IMPACTS, ecalPrefs.impact, v => { ecalPrefs.impact = v; saveEcalPrefs(); renderEcal(); });

  const minRank = ecalPrefs.impact === 'high' ? 3 : ecalPrefs.impact === 'mid' ? 2 : 1;
  const rows = feed
    .filter(e => e && e.date && spDay(e.date) === ecalPrefs.day)
    .filter(e => ecalPrefs.country === 'all' || e.country === ecalPrefs.country)
    .filter(e => (ECAL_RANK[e.impact] || 1) >= minRank && !calIgnored(e))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!feed.length) {
    if (calFeedError) console.warn('calendário:', calFeedError.message); // o detalhe técnico fica no console, não na tela (auditoria 15/11/2026)
    list.innerHTML = `<div class="ecal-empty">Não foi possível carregar o calendário agora. Tente de novo em instantes ou veja a versão do Investing.
      <button class="btn-sm" id="ecal-go-iframe">Ver calendário do Investing</button></div>`;
    $('#ecal-go-iframe')?.addEventListener('click', () => ecalSetView('iframe'));
    return;
  }
  if (!rows.length) { list.innerHTML = '<div class="ecal-empty">Nenhum evento com esses filtros neste dia.</div>'; return; }

  const now = Date.now();
  const nextIdx = rows.findIndex(e => new Date(e.date).getTime() > now && !e.actual);
  list.innerHTML = `
    <table class="ecal-table">
      <thead><tr><th>Hora</th><th></th><th>Imp.</th><th class="l">Evento</th><th>Atual</th><th>Proj.</th><th>Ant.</th></tr></thead>
      <tbody>${rows.map((e, i) => {
        const allDay = /T00:00:00-/.test(e.date);
        const time = allDay ? '—' : new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SP_TZ });
        const sup = e.surprise === 'better' ? '<span class="ecal-badge up">▲ acima</span>'
          : e.surprise === 'worse' ? '<span class="ecal-badge dn">▼ abaixo</span>' : '';
        const key = ECAL_KEY_RE.test(e.title) && e.impact === 'High';
        return `<tr class="${i === nextIdx ? 'next' : ''}${key ? ' key' : ''}${e.actual ? ' done' : ''}">
          <td class="mono">${time}</td>
          <td class="mono" title="${escapeHTML(e.country)}">${escapeHTML(CAL_CODES[e.country] || e.country)}</td>
          <td>${ecalBulls(e.impact)}</td>
          <td class="l">${escapeHTML(calTitle(e.country, e.title))}${i === nextIdx ? ' <span class="ecal-badge next">próximo</span>' : ''}</td>
          <td class="mono act ${e.surprise === 'better' ? 'up' : e.surprise === 'worse' ? 'dn' : ''}">${escapeHTML(e.actual || '')}${sup}</td>
          <td class="mono">${escapeHTML(e.forecast || '')}</td>
          <td class="mono muted">${escapeHTML(e.previous || '')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  list.querySelector('tr.next')?.scrollIntoView({ block: 'nearest' });
}

async function refreshEcal(force = false) {
  const st = $('#ecal-status');
  if (st) st.textContent = 'Carregando…';
  if (force) calFeedTs = 0;
  await loadCalendarFeed();
  window.__calFeed = calFeed || [];
  window.__calKeyDays = computeCalKeyDays(window.__calFeed);
  renderMiniCalendar();
  renderEcal();
  if (st) {
    st.textContent = calFeed
      ? `Fonte: Investing.com · horário de Brasília · atualizado às ${new Date(calFeedTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SP_TZ })}`
      : 'Calendário indisponível';
  }
}

$$('.ecal-view-btn').forEach(b => b.addEventListener('click', () => ecalSetView(b.dataset.view)));
// cabeçalhos presos do Calendário: grudam na borda de cima da área que rola, descontando o respiro (padding) do topo
function calTopo() {
  const p = $('#calendar-panel'), w = p?.querySelector(':scope > .generic-wrap');
  if (w) p.style.setProperty('--cal-topo', -(parseFloat(getComputedStyle(w).paddingTop) || 0) + 'px');
}
calTopo(); window.addEventListener('resize', calTopo);
// 17/11/2026: o Recarregar fica na linha dos botões e vale para a visão aberta
$('#calendar-refresh-btn')?.addEventListener('click', () => {
  const v = ecalPrefs.view, btn = $('#calendar-refresh-btn');
  btn?.classList.add('spinning'); setTimeout(() => btn?.classList.remove('spinning'), 1200);
  if (v === 'list' || v === 'iframe') { refreshEcal(true); return; }
  const alvo = { earn: ['#earn-root', '__earnRender'], ipo: ['#ipo-root', '__ipoRender'], bbr: ['#bbr-root', '__bbrRender'], prov: ['#prov-root', '__provRender'], focus: ['#focus-root', '__focusRender'] }[v];
  if (alvo && window[alvo[1]]) window[alvo[1]]($(alvo[0]), true);
});
ecalSetView(ecalPrefs.view);
refreshEcal();
// mantém resultados e o "próximo" em dia
setInterval(() => { if (ecalPrefs.view === 'list' && $('#calendar-panel')?.classList.contains('active')) refreshEcal(); }, 10 * 60 * 1000);

/* =========================================================
   EXTRAS: Treasury em bp, "Por que subiu?", Agenda da semana,
   avisos antes dos eventos e exportação .ics
   ========================================================= */

// Treasury: variação em pontos-base (a variação % do yield confunde)
function sumBpLine(label, q) {
  if (!q || q.value == null || isNaN(q.value)) return null;
  let chg = '';
  if (q.change != null && !isNaN(q.change) && q.change > -100) {
    const bp = Math.round((q.value - q.value / (1 + q.change / 100)) * 100);
    chg = ` (${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp)} bp)`;
  }
  return `• ${label}: ${sumNum(q.value, 2, 2)}%${chg}`;
}

/* ---- "Por que subiu?": manchete da empresa ao lado da ação ---- */
const STOCK_NAMES = {
  PETR4: 'Petrobras', PETR3: 'Petrobras', VALE3: 'Vale(?! a pena)', ITUB4: 'Itaú(?!sa)|Itau Unibanco', BBDC4: 'Bradesco(?!par)',
  BBAS3: 'Banco do Brasil', ABEV3: 'Ambev', WEGE3: 'WEG', ITSA4: 'Itaúsa', SUZB3: 'Suzano', RENT3: 'Localiza',
  PRIO3: 'PRIO|PetroRio', GGBR4: 'Gerdau', BPAC11: 'BTG', EQTL3: 'Equatorial', RDOR3: "Rede D'Or|Rede D’Or",
  RADL3: 'Raia|RD Saúde', SBSP3: 'Sabesp', VIVT3: 'Vivo|Telefônica Brasil', CMIG4: 'Cemig', LREN3: 'Renner',
  HAPV3: 'Hapvida', CSAN3: 'Cosan', UGPA3: 'Ultrapar|Ipiranga', KLBN11: 'Klabin', TOTS3: 'Totvs|TOTVS', ENEV3: 'Eneva',
  BBSE3: 'BB Seguridade', CSNA3: 'CSN|Siderúrgica Nacional', USIM5: 'Usiminas', MGLU3: 'Magazine Luiza|Magalu',
  CYRE3: 'Cyrela', ASAI3: 'Assaí|Assai', HYPE3: 'Hypera', VBBR3: 'Vibra', BRAP4: 'Bradespar', SANB11: 'Santander Brasil|Santander',
  TIMS3: 'TIM', EGIE3: 'Engie', CPFE3: 'CPFL', GOAU4: 'Metalúrgica Gerdau', RAIL3: 'Rumo', MULT3: 'Multiplan', CXSE3: 'Caixa Seguridade'
};
function stockNewsRegex(sym) {
  const names = STOCK_NAMES[sym] ? `|${STOCK_NAMES[sym]}` : '';
  // borda de palavra que respeita acentos
  return new RegExp(`(?<![\\wÀ-ú])(?:${sym}${names})(?![\\wÀ-ú])`);
}
function whyNews(sym, refTs) {
  const re = stockNewsRegex(sym);
  const ref = refTs || Date.now();
  const hit = (Array.isArray(newsAll) ? newsAll : [])
    .filter(n => n && n.titulo && n.data > ref - 30 * 3600 * 1000 && n.data <= ref + 6 * 3600 * 1000 && re.test(n.titulo))
    .sort((a, b) => (NEWS_SOURCES[b.fonte]?.scope === 'br') - (NEWS_SOURCES[a.fonte]?.scope === 'br') || b.data - a.data)[0];
  if (!hit) return '';
  const t = hit.titulo.replace(/\s+/g, ' ').trim();
  const short = t.length > 110 ? t.slice(0, 107).trimEnd() + '…' : t;
  return `\n   ↳ ${short}${hit.fonte !== 'Google News' ? ` (${NEWS_SOURCES[hit.fonte]?.name || hit.fonte})` : ''}`;
}

/* ---- Agenda da semana (texto para WhatsApp) ---- */
async function buildWeekAgendaText() {
  const feed = await loadCalendarFeed();
  const today = spDay(Date.now());
  const days = [...new Set(feed.filter(e => e && e.date).map(e => spDay(e.date)))]
    .concat(COPOM_DECISIONS)
    .filter(d => d >= today && d <= addDays(today, 6))
    .filter((d, i, a) => a.indexOf(d) === i)
    .filter(d => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay()))
    .sort();
  const order = ['BRL', 'USD', 'EUR', 'CNY'];
  const blocks = days.map(d => {
    const seen = new Set();
    const lines = feed
      .filter(e => e && e.date && spDay(e.date) === d && e.impact === 'High' && order.includes(e.country) && !calIgnored(e))
      .sort((a, b) => order.indexOf(a.country) - order.indexOf(b.country) || a.date.localeCompare(b.date))
      .map(e => {
        const base = calTitle(e.country, e.title).replace(/\s*\((Mensal|Anual|Trimestral|ano a ano|[a-z]{3})\)/gi, '').trim();
        const k = e.country + base;
        if (seen.has(k)) return null;
        seen.add(k);
        const time = /T00:00:00-/.test(e.date) ? '' : new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SP_TZ }) + ' ';
        return `• ${time}${CAL_FLAGS[e.country]} ${base}${e.forecast ? ` (proj. ${e.forecast})` : ''}`;
      })
      .filter(Boolean)
      .slice(0, 5)
      .sort((a, b) => (a.match(/• (\d\d:\d\d)/)?.[1] || '99').localeCompare(b.match(/• (\d\d:\d\d)/)?.[1] || '99'));
    if (COPOM_DECISIONS.includes(d) && !lines.some(l => /copom/i.test(l))) lines.push('• 18:30 🇧🇷 Decisão do Copom (Selic)');
    return [spDayLabel(d), lines];
  });
  const first = days[0] || today, last = days[days.length - 1] || today;
  const fmt = (k) => k.slice(8, 10) + '/' + k.slice(5, 7);
  const text = joinBlocks(`*🗓️ Agenda da semana* — ${fmt(first)} a ${fmt(last)}\n_Horário de Brasília. Principais eventos do Brasil, EUA, Europa e China._`, blocks);
  return text;
}

/* ---- Avisos 5 minutos antes dos eventos-chave ---- */
const ALERT_KEY = 'ecal_alerts_v1';
const ALERT_RE = /copom|selic|payroll|ipca|\bcpi\b|fomc|\bfed\b|juros/i;
let alertsOn = false;
try { alertsOn = localStorage.getItem(ALERT_KEY) === '1'; } catch (e) { /* silencioso */ }
const alertedIds = new Set();

function alertEvents() {
  const feed = (window.__calFeed || []).filter(e => e && e.date && e.impact === 'High'
    && ['BRL', 'USD', 'EUR'].includes(e.country) && ALERT_RE.test(e.title) && !/T00:00:00-/.test(e.date))
    .map(e => ({ ts: new Date(e.date).getTime(), text: `${CAL_CODES[e.country] || e.country} ${calTitle(e.country, e.title)}${e.forecast ? ` (proj. ${e.forecast})` : ''}` }));
  // Copom: decisão por volta das 18h30 de Brasília
  COPOM_DECISIONS.forEach(d => feed.push({ ts: new Date(`${d}T21:30:00Z`).getTime(), text: 'BR Decisão do Copom (Selic)' }));
  return feed;
}
function checkEventAlerts() {
  if (!alertsOn) return;
  const now = Date.now();
  alertEvents().forEach(ev => {
    const id = ev.ts + ev.text;
    const left = ev.ts - now;
    if (left > 0 && left <= 5 * 60 * 1000 && !alertedIds.has(id)) {
      alertedIds.add(id);
      const hora = new Date(ev.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SP_TZ });
      const msg = `Às ${hora}: ${ev.text}`;
      toast(msg, 'info');
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Evento em 5 minutos', { body: msg }); } catch (e) { /* silencioso */ }
    }
  });
}
function renderAlertBtn() {
  window.__alertsOn = alertsOn;
  ['#ecal-alert-btn', '#news-alert-btn'].forEach(sel => {
    const b = $(sel);
    if (!b) return;
    b.classList.toggle('active', alertsOn);
    b.innerHTML = `<i class="fas fa-bell${alertsOn ? '' : '-slash'}"></i> Avisos ${alertsOn ? 'ligados' : 'desligados'}`;
    b.title = 'Avisa 5 minutos antes de Copom, Fed, Payroll, IPCA e CPI, e quando chega notícia de alto impacto (com o painel aberto)';
  });
}
$$('#ecal-alert-btn, #news-alert-btn').forEach(btn => btn.addEventListener('click', async () => {
  alertsOn = !alertsOn;
  try { localStorage.setItem(ALERT_KEY, alertsOn ? '1' : '0'); } catch (e) { /* silencioso */ }
  if (alertsOn && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) { /* silencioso */ }
  }
  renderAlertBtn();
  toast(alertsOn ? 'Avisos ligados: eventos-chave e notícias de alto impacto' : 'Avisos desligados', 'info');
}));
renderAlertBtn();
setInterval(checkEventAlerts, 30 * 1000);

/* ---- Exportar para Google Agenda / Outlook (.ics) ---- */
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsDate(ts) { return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function exportIcs() {
  const order = ['BRL', 'USD', 'EUR', 'CNY'];
  const events = (window.__calFeed || [])
    .filter(e => e && e.date && e.impact === 'High' && order.includes(e.country) && !calIgnored(e) && !/T00:00:00-/.test(e.date))
    .map(e => ({
      ts: new Date(e.date).getTime(),
      title: `${CAL_FLAGS[e.country]} ${calTitle(e.country, e.title)}`,
      desc: [e.forecast && `Projeção: ${e.forecast}`, e.previous && `Anterior: ${e.previous}`].filter(Boolean).join('\n')
    }));
  COPOM_DECISIONS.forEach(d => events.push({ ts: new Date(`${d}T21:30:00Z`).getTime(), title: '🇧🇷 Decisão do Copom (Selic)', desc: 'Horário aproximado' }));
  // só o que ainda vai acontecer
  const fromTs = Date.now() - 60 * 60 * 1000;
  events.splice(0, events.length, ...events.filter(e => e.ts >= fromTs));
  if (!events.length) { toast('Calendário ainda não carregado', 'danger'); return; }
  const stamp = icsDate(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Terminal do Trader//Agenda//PT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Agenda econômica'];
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${e.ts}-${i}@terminal-trade`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(e.ts)}`,
      'DURATION:PT15M', `SUMMARY:${icsEscape(e.title)}`);
    if (e.desc) lines.push(`DESCRIPTION:${icsEscape(e.desc)}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT5M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agenda-economica-${spDay(Date.now())}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${events.length} eventos exportados`, 'success');
}
$('#ecal-ics-btn')?.addEventListener('click', exportIcs);

// Botão "Agenda da semana" do calendário abre o modal do resumo nesse modelo
$('#ecal-week-btn')?.addEventListener('click', () => {
  summaryMode = 'semana';
  openSummaryModal();
});

/* =========================================================
   BACKUP (exportar / importar notas e preferências)
   ========================================================= */
const BACKUP_KEYS = [...Object.values(STORAGE), NOTES_KEY, HEATMAP_SOURCE_KEY, 'trader_prefs_v1', 'trader_watchlist_v1', 'trader_resumo_semanal_v1'];

function exportBackup() {
  const payload = { app: 'terminal-trade', version: 1, exportedAt: new Date().toISOString(), data: {} };
  BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) payload.data[k] = v; });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `terminal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup exportado', 'success');
}

function validateBackup(payload) {
  if (!payload || payload.app !== 'terminal-trade' || typeof payload.data !== 'object' || payload.data === null) {
    throw new Error('Arquivo não é um backup deste painel');
  }
  const out = {};
  for (const [k, v] of Object.entries(payload.data)) {
    if (!BACKUP_KEYS.includes(k) || typeof v !== 'string') continue;
    // estes valores são lidos com JSON.parse ao abrir o painel: precisam estar íntegros
    if (k === NOTES_KEY) { const o = JSON.parse(v); if (!o || typeof o !== 'object' || Array.isArray(o) || Object.values(o).some(x => !Array.isArray(x))) throw new Error('Notas inválidas'); }
    if (k === STORAGE.readArticles) { if (!Array.isArray(JSON.parse(v))) throw new Error('Lista de lidos inválida'); }
    out[k] = v;
  }
  if (!Object.keys(out).length) throw new Error('Backup vazio');
  return out;
}

async function importBackup(file) {
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Arquivo muito grande');
    const data = validateBackup(JSON.parse(await file.text()));
    if (!confirm('Importar substitui as anotações e preferências atuais deste navegador. Continuar?')) return;
    Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
    toast('Backup importado · recarregando...', 'success');
    setTimeout(() => location.reload(), 700);
  } catch (e) {
    toast('Não foi possível importar: ' + e.message, 'danger');
  }
}

function openBackupModal() { $('#backup-modal').classList.add('visible'); }
function closeBackupModal() { $('#backup-modal').classList.remove('visible'); }
$('#backup-btn')?.addEventListener('click', openBackupModal);
$('#backup-close')?.addEventListener('click', closeBackupModal);
$('#backup-modal')?.addEventListener('click', (e) => { if (e.target.id === 'backup-modal') closeBackupModal(); });
$('#backup-export')?.addEventListener('click', exportBackup);
$('#backup-import-btn')?.addEventListener('click', () => $('#backup-file').click());
$('#backup-file')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) importBackup(f);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeSummaryModal();
  closeBackupModal();
});

/* =========================================================
   SHORTCUTS
   ========================================================= */
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.code === 'KeyL') { e.preventDefault(); $('#theme-toggle').click(); }
  if (e.code === 'KeyR') {
    e.preventDefault();
    updateTicker(false);
    updateMarketPanel(false);
    fetchNewsFromWorker(false);
  }
  if (e.code === 'KeyM') { e.preventDefault(); openSummaryModal(); }
});

/* =========================================================
   INIT
   ========================================================= */
renderMarketSections();
renderMarketStatus();
setInterval(renderMarketStatus, 60 * 1000);

const liveToggle = $('#live-toggle');
if (liveToggle) { liveToggle.classList.toggle('on', liveMode); liveToggle.setAttribute('aria-checked', String(liveMode)); }

if (liveMode) {
  updateMarketPanel(true);
  updateTicker(true);
  startAutoRefresh();
} else {
  const marketLoaded = loadMarketFromCache();
  const tickerLoaded = loadTickerFromCache();
  if (!marketLoaded) updateMarketPanel(false);
  if (!tickerLoaded) updateTicker(true);
}

// notícias: a montagem inicial fica no fim do noticias.js

/* =========================================================
   AJUSTE DE ESCALA DO CALENDÁRIO
   ========================================================= */
function fitCalendarIframe() {
  const wrap = document.querySelector('.calendar-iframe-wrap');
  const iframe = document.getElementById('economic-calendar');
  if (!wrap || !iframe) return;

  const baseWidth = 660;
  const baseHeight = 900;

  const wrapWidth = wrap.clientWidth;
  const wrapHeight = wrap.clientHeight;

  const scaleX = wrapWidth / baseWidth;
  const scaleY = wrapHeight / baseHeight;
  const scale = Math.max(scaleX, scaleY);

  iframe.style.transform = `scale(${scale})`;
  iframe.style.height = (wrapHeight / scale) + 'px';
  iframe.style.width = (wrapWidth / scale) + 'px';
}

window.addEventListener('resize', () => {
  clearTimeout(window.__calResizeTimer);
  window.__calResizeTimer = setTimeout(fitCalendarIframe, 150);
});

setTimeout(fitCalendarIframe, 500);

if (savedTab === 'heatmap-panel') {
  setTimeout(initHeatmapIfNeeded, 200);
}

/* =========================================================
   UX v2
   ========================================================= */
// Mercado: atalhos para as seções
(function setupMarketNav() {
  const secs = [...document.querySelectorAll('#market-panel .market-section')];
  const jump = $('#mkt-jump');
  if (!jump || !secs.length) return;
  secs.forEach((sec, i) => { sec.id = sec.id || `mkt-sec-${i}`; });
  // trilho de seções: número, nome e quantidade de ativos; o ativo acompanha a rolagem
  jump.classList.add('mj');
  jump.innerHTML = secs.map((sec, i) => {
    const name = (sec.querySelector('h2')?.textContent || '').replace(' / Treasuries', '');
    const n = sec.querySelectorAll('.quote-card').length || '';
    return `<button class="mj-item" data-i="${i}" title="Ir para ${escapeHTML(name)}"><span class="mj-n">${String(i + 1).padStart(2, '0')}</span><span class="mj-l">${escapeHTML(name)}</span>${n ? `<span class="mj-c">${n}</span>` : ''}</button>`;
  }).join('') + '<span class="mj-bar" aria-hidden="true"></span>';
  const nav = jump.closest('.mkt-nav');
  const items = [...jump.querySelectorAll('.mj-item')];
  const bar = jump.querySelector('.mj-bar');
  let cur = -1, lockUntil = 0;
  const setActive = (i) => {
    if (i === cur) return;
    cur = i;
    items.forEach((b, j) => b.classList.toggle('on', j === i));
    const b = items[i];
    if (!b) { bar.style.opacity = 0; return; }
    bar.style.opacity = 1;
    bar.style.transform = `translateX(${b.offsetLeft}px)`;
    bar.style.width = `${b.offsetWidth}px`;
    // no celular o trilho rola de lado: mantém o item ativo visível
    if (jump.scrollWidth > jump.clientWidth) jump.scrollTo({ left: b.offsetLeft - 16, behavior: 'smooth' });
  };
  // quem rola: no desktop é a .market-wrap, no celular pode ser a página
  const scroller = () => {
    for (let el = jump.parentElement; el && el !== document.body; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
    }
    return null;
  };
  const viewTop = () => { const sc = scroller(); return sc ? sc.getBoundingClientRect().top : 0; };
  const navBottom = () => (nav ? nav.getBoundingClientRect().height : 0) + 8;
  const spy = () => {
    if (Date.now() < lockUntil || !document.getElementById('market-panel')?.classList.contains('active')) return;
    const line = viewTop() + navBottom() + 40;
    let idx = -1;
    secs.forEach((sec, i) => { if (sec.style.display !== 'none' && sec.getBoundingClientRect().top <= line) idx = i; });
    setActive(idx);
  };
  let raf = 0;
  // capture: pega a rolagem da página e da .market-wrap
  document.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(); }); }, { passive: true, capture: true });
  window.addEventListener('resize', () => { const i = cur; cur = -1; setActive(i); });
  items.forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i, sec = secs[i];
    if (sec.style.display === 'none') { const f = $('#mkt-filter'); if (f) { f.value = ''; f.dispatchEvent(new Event('input')); } }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const sc = scroller();
    const base = sc ? sc.scrollTop - sc.getBoundingClientRect().top : window.scrollY;
    const y = sec.getBoundingClientRect().top + base - navBottom();
    lockUntil = Date.now() + 900;
    setActive(i);
    (sc || window).scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
    // a seção pisca quando chega
    sec.classList.remove('sec-flash');
    void sec.offsetWidth;
    sec.classList.add('sec-flash');
    clearTimeout(sec._flashT);
    sec._flashT = setTimeout(() => sec.classList.remove('sec-flash'), 1600);
  }));
  // ao voltar para a aba Mercado, recalcula (o hook __onTabSwitch é redefinido mais abaixo, então observa a classe)
  // trilho cortado: esmaece a borda que tem mais itens escondidos
  const fade = () => {
    const over = jump.scrollWidth > jump.clientWidth + 1;
    jump.classList.toggle('fade-r', over && jump.scrollLeft + jump.clientWidth < jump.scrollWidth - 2);
    jump.classList.toggle('fade-l', over && jump.scrollLeft > 2);
  };
  jump.addEventListener('scroll', fade, { passive: true });
  window.addEventListener('resize', fade);
  const panel = document.getElementById('market-panel');
  if (panel) new MutationObserver(() => { if (panel.classList.contains('active')) requestAnimationFrame(() => { const i = cur; cur = -2; setActive(i); spy(); fade(); }); })
    .observe(panel, { attributes: true, attributeFilter: ['class'] });
  requestAnimationFrame(fade);
  requestAnimationFrame(spy);
  // filtro rápido por nome ou código
  $('#mkt-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    secs.forEach(sec => {
      let visible = 0;
      sec.querySelectorAll('.quote-card').forEach(card => {
        const show = !q || card.textContent.toLowerCase().includes(q) || (card.dataset.symbol || '').toLowerCase().includes(q);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      sec.style.display = visible ? '' : 'none';
    });
  });
})();

// Mercado: maiores altas e baixas entre todos os cards
function renderMarketMovers() {
  const el = $('#mkt-movers');
  if (!el) return;
  const names = {};
  MARKET_SECTIONS.forEach(sec => sec.items.forEach(it => { names[it.symbol || it.type] = it.name; }));
  const rows = Object.entries(marketDataCache || {})
    .filter(([k, d]) => d && d.change != null && !isNaN(d.change) && names[k] && !['selic', 'ipca', 'fred'].includes(k))
    .map(([k, d]) => ({ k, name: names[k], chg: d.change }));
  if (rows.length < 6) { el.innerHTML = ''; return; }
  rows.sort((a, b) => b.chg - a.chg);
  // sem repetir ativo nas duas listas, e só alta em "altas" / só queda em "baixas"
  const nTop = Math.min(4, Math.floor(rows.length / 2));
  const up = rows.slice(0, nTop).filter(r => r.chg > 0);
  const dn = rows.slice(-nTop).reverse().filter(r => r.chg < 0);
  const fmt = (r) => `<span class="it" data-k="${escapeHTML(r.k)}"><b>${escapeHTML(r.name)}</b> <span class="${r.chg >= 0 ? 'up' : 'dn'}">${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%</span></span>`;
  el.innerHTML = `
    <div class="mkt-mv"><h4>▲ Maiores altas do painel</h4><div class="row">${(up.map(fmt).join('') || '<span class="it">—</span>')}</div></div>
    <div class="mkt-mv"><h4>▼ Maiores baixas do painel</h4><div class="row">${(dn.map(fmt).join('') || '<span class="it">—</span>')}</div></div>`;
  el.querySelectorAll('.it').forEach(it => it.addEventListener('click', () => {
    const card = document.querySelector(`.quote-card[data-symbol="${CSS.escape(it.dataset.k)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('flash-target');
    setTimeout(() => card.classList.remove('flash-target'), 1600);
  }));
}
setInterval(renderMarketMovers, 4000);
setTimeout(renderMarketMovers, 1500);

// Abas: mantém a aba ativa visível no celular
$$('.tab-btn').forEach(b => b.addEventListener('click', () => b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })));

// Resumo: prévia no estilo WhatsApp e contador
function waFormat(txt) {
  return escapeHTML(txt)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,)!?]|$)/gm, '$1<i>$2</i>');
}
function updateSummaryExtras() {
  const ta = $('#summary-text');
  if (!ta) return;
  const n = ta.value.length;
  const cnt = $('#summary-count');
  if (cnt) cnt.textContent = `${n.toLocaleString('pt-BR')} caracteres`;
  const pv = $('#summary-preview');
  if (pv && $('#summary-modal .modal-content')?.classList.contains('summary-previewing')) pv.innerHTML = `<div class="bubble">${waFormat(ta.value)}</div>`;
}
$('#summary-text')?.addEventListener('input', updateSummaryExtras);
new MutationObserver(updateSummaryExtras).observe($('#summary-text') || document.body, { attributes: true });
setInterval(() => { if ($('#summary-modal')?.classList.contains('visible')) updateSummaryExtras(); }, 700);
$('#summary-preview-btn')?.addEventListener('click', () => {
  const box = $('#summary-modal .modal-content');
  box.classList.toggle('summary-previewing');
  $('#summary-preview-btn').innerHTML = box.classList.contains('summary-previewing') ? '<i class="fas fa-pen"></i> Voltar a editar' : '<i class="fas fa-eye"></i> Ver como fica no WhatsApp';
  updateSummaryExtras();
});
// Ctrl/Cmd + Enter copia o resumo
$('#summary-text')?.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#summary-copy')?.click(); }
});

// Botão flutuante no celular
$('#fab-summary')?.addEventListener('click', () => openSummaryModal());
// no celular o botão encolhe para só o ícone ao rolar a página, para não cobrir os valores
(() => {
  const fab = $('#fab-summary'); if (!fab) return;
  let t = 0;
  // os painéis rolam por dentro (.market-wrap etc.), então escuta a rolagem de qualquer elemento
  document.addEventListener('scroll', (e) => {
    const el = e.target === document ? document.scrollingElement : e.target;
    if (!t) t = requestAnimationFrame(() => { t = 0; fab.classList.toggle('fab-min', (el?.scrollTop || 0) > 120); });
  }, { passive: true, capture: true });
})();

// "/" foca a busca da aba atual
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;
  const active = document.querySelector('.tab-panel.active');
  const input = active?.querySelector('#news-search, #mkt-filter');
  if (input) { e.preventDefault(); input.focus(); }
});

/* ANÁLISE AVANÇADA (aba Análises): desde 20/11/2026 o código fica em analises.js (carregado logo depois deste arquivo) */


/* =========================================================
   BARRA LATERAL (desktop): mesmas abas, agrupadas por seção.
   No celular continua a barra de abas horizontal.
   ========================================================= */
(() => {
  const GROUPS = [
    ['Visão geral', ['market-panel', 'mesa-panel', 'watch-panel', 'heatmap-panel']],
    ['Informação', ['news-panel', 'weekly-panel', 'calendar-panel']],
    ['Análise', ['analysis-panel', 'fund-panel']],
    ['Ferramentas', ['indicators-panel', 'calculator-panel', 'options-panel', 'edu-panel']]
  ];
  const tabInfo = (id) => {
    const b = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (!b) return null;
    const ico = b.querySelector('i')?.className || 'fas fa-circle';
    const soon = !!b.querySelector('.soon-badge');
    const label = [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    return { id, ico, soon, label };
  };
  // ícones da barra lateral: cheios, no estilo das referências que o Severino mandou (30/10/2026); desenho próprio
  const SI = {
    'market-panel': '<path d="M12 2 2.5 7v1.8h19V7Z"/><rect x="3.5" y="10" width="2.6" height="8"/><rect x="17.9" y="10" width="2.6" height="8"/><rect x="8.2" y="13.5" width="1.9" height="4.5"/><rect x="11.05" y="11.5" width="1.9" height="6.5"/><rect x="13.9" y="10" width="1.9" height="8"/><rect x="2.5" y="19" width="19" height="2.5" rx=".6"/>',
    'mesa-panel': '<mask id="si-c1"><rect width="24" height="24" fill="#fff"/><circle cx="18.5" cy="16.8" r="5.9" fill="#000"/></mask><g mask="url(#si-c1)"><path fill-rule="evenodd" d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm.2 2.2v9.6h15.6V5.2Z"/><path d="M10.5 17h3v2.5H16V21H8v-1.5h2.5Z"/><rect x="6.2" y="8" width="1.8" height="4" rx=".3"/><rect x="6.85" y="6.8" width=".5" height="6.4"/><rect x="9.7" y="9.5" width="1.8" height="3" rx=".3"/><rect x="10.35" y="8.3" width=".5" height="5.2"/><rect x="13.2" y="7.2" width="1.8" height="3.6" rx=".3"/><rect x="13.85" y="6.2" width=".5" height="5.6"/></g><mask id="si-d1"><circle cx="18.5" cy="16.8" r="4.6" fill="#fff"/><text x="18.5" y="19.400000000000002" font-size="7.4" font-weight="700" font-family="Arial,Helvetica,sans-serif" text-anchor="middle" fill="#000">$</text></mask><rect width="24" height="24" mask="url(#si-d1)"/>',
    'watch-panel': '<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/>',
    'heatmap-panel': '<rect x="3" y="3" width="10" height="11" rx="1.5"/><rect x="14.5" y="3" width="6.5" height="6" rx="1.5"/><rect x="14.5" y="10.5" width="6.5" height="10.5" rx="1.5"/><rect x="3" y="15.5" width="10" height="5.5" rx="1.5"/>',
    'news-panel': '<mask id="si-n"><path d="M6.5 3H20a1.5 1.5 0 0 1 1.5 1.5V19a2 2 0 0 1-2 2H5a2.5 2.5 0 0 1-2.5-2.5V9h4Z" fill="#fff"/><g fill="#000"><rect x="4.6" y="9" width="1.9" height="10.3" rx=".9"/><rect x="8.6" y="5.8" width="6.4" height="5.4" rx=".6"/><rect x="16.3" y="6" width="3.4" height="1.7" rx=".5"/><rect x="16.3" y="9.3" width="3.4" height="1.7" rx=".5"/><rect x="8.6" y="13.2" width="11.1" height="1.7" rx=".5"/><rect x="8.6" y="16.4" width="11.1" height="1.7" rx=".5"/></g><path d="m9.7 10 1.6-1.6 1.2 1 1.6-1.9" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></mask><rect width="24" height="24" mask="url(#si-n)"/>',
    'weekly-panel': '<mask id="si-w"><g fill="#fff"><rect x="4.5" y="4" width="15" height="18" rx="2"/><rect x="8.3" y="2" width="7.4" height="4.2" rx="1.2"/></g><g fill="#000"><rect x="9.8" y="3.2" width="4.4" height="1.6" rx=".8"/><rect x="7.6" y="14" width="2.1" height="4.8" rx=".4"/><rect x="11" y="11" width="2.1" height="7.8" rx=".4"/><rect x="14.4" y="8.5" width="2.1" height="10.3" rx=".4"/></g></mask><rect width="24" height="24" mask="url(#si-w)"/>',
    'calendar-panel': '<mask id="si-k"><g fill="#fff"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><rect x="6.8" y="2" width="2.4" height="5" rx="1.2"/><rect x="14.8" y="2" width="2.4" height="5" rx="1.2"/></g><rect x="5" y="10" width="14" height="9.5" rx="1" fill="#000"/><g fill="#fff"><rect x="6.6" y="11.6" width="2.6" height="2.4" rx=".5"/><rect x="10.7" y="11.6" width="2.6" height="2.4" rx=".5"/><rect x="14.8" y="11.6" width="2.6" height="2.4" rx=".5"/><rect x="6.6" y="15.4" width="2.6" height="2.4" rx=".5"/><rect x="10.7" y="15.4" width="2.6" height="2.4" rx=".5"/></g></mask><rect width="24" height="24" mask="url(#si-k)"/>',
    'analysis-panel': '<path d="M2.5 3h2.1v15.9h16.9V21H3.5a1 1 0 0 1-1-1Z"/><rect x="7.85" y="8" width=".5" height="9"/><rect x="7" y="10" width="2.2" height="5" rx=".4"/><rect x="11.85" y="5" width=".5" height="10"/><rect x="11" y="7" width="2.2" height="6" rx=".4"/><rect x="15.85" y="9.5" width=".5" height="7.5"/><rect x="15" y="11" width="2.2" height="4" rx=".4"/><rect x="19.35" y="3.5" width=".5" height="10"/><rect x="18.5" y="5.5" width="2.2" height="6" rx=".4"/>',
    'fund-panel': '<mask id="si-c2"><rect width="24" height="24" fill="#fff"/><circle cx="18" cy="18" r="5.9" fill="#000"/></mask><g mask="url(#si-c2)"><path d="M10.8 3.2A8.9 8.9 0 1 0 20.7 13.2h-9.9Z"/><path d="M12.9 1.6v9.5h9.5a9.5 9.5 0 0 0-9.5-9.5Z"/></g><mask id="si-d2"><circle cx="18" cy="18" r="4.6" fill="#fff"/><text x="18" y="20.6" font-size="7.4" font-weight="700" font-family="Arial,Helvetica,sans-serif" text-anchor="middle" fill="#000">$</text></mask><rect width="24" height="24" mask="url(#si-d2)"/>',
    'indicators-panel': '<mask id="si-c3"><rect width="24" height="24" fill="#fff"/><circle cx="17.6" cy="17.6" r="5.9" fill="#000"/></mask><g mask="url(#si-c3)" fill="none" stroke-width="1.8"><circle cx="10.2" cy="10.2" r="7.6"/><ellipse cx="10.2" cy="10.2" rx="3.3" ry="7.6"/><path d="M2.8 10.2h14.8M4.2 6h12M4.2 14.4h12"/></g><mask id="si-b3"><circle cx="17.6" cy="17.6" r="4.7" fill="#fff"/><g fill="#000"><rect x="15.3" y="18" width="1.2" height="2.2"/><rect x="17" y="16.6" width="1.2" height="3.6"/><rect x="18.7" y="15" width="1.2" height="5.2"/></g></mask><rect width="24" height="24" mask="url(#si-b3)"/>',
    'calculator-panel': '<mask id="si-q"><rect x="4.5" y="2" width="15" height="20" rx="2.5" fill="#fff"/><g fill="#000"><rect x="7" y="4.5" width="10" height="4" rx="1"/><rect x="7" y="11" width="2.4" height="2.4" rx=".5"/><rect x="10.8" y="11" width="2.4" height="2.4" rx=".5"/><rect x="14.6" y="11" width="2.4" height="2.4" rx=".5"/><rect x="7" y="14.8" width="2.4" height="2.4" rx=".5"/><rect x="10.8" y="14.8" width="2.4" height="2.4" rx=".5"/><rect x="14.6" y="14.8" width="2.4" height="6" rx=".5"/><rect x="7" y="18.4" width="2.4" height="2.4" rx=".5"/><rect x="10.8" y="18.4" width="2.4" height="2.4" rx=".5"/></g></mask><rect width="24" height="24" mask="url(#si-q)"/>',
    'edu-panel': '<path d="M12 3 1.5 8.5 12 14l8.5-4.45V15h2V8.5Z"/><path d="M5.5 12.2v3.6c0 2 2.9 3.7 6.5 3.7s6.5-1.7 6.5-3.7v-3.6L12 15.6Z"/>',
    'options-panel': '<circle cx="12" cy="5" r="3.2"/><circle cx="5" cy="18" r="3.2"/><circle cx="19" cy="18" r="3.2"/><path fill="none" stroke-width="2" d="m10.5 7.5-4 8m7-8 4 8M8 18h8"/>',
    'buscar': '<path fill-rule="evenodd" d="M10.5 2a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm0 2.3a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4Z"/><path d="m15.8 17.4 1.6-1.6 4.4 4.4a1.13 1.13 0 0 1-1.6 1.6Z"/><rect x="7.95" y="7.2" width=".5" height="6"/><rect x="7.3" y="8.5" width="1.8" height="3.2" rx=".3"/><rect x="10.45" y="6.2" width=".5" height="6.5"/><rect x="9.8" y="7.3" width="1.8" height="3.8" rx=".3"/><rect x="12.95" y="8" width=".5" height="5.5"/><rect x="12.3" y="9.2" width="1.8" height="2.8" rx=".3"/>',
    'resumo': '<mask id="si-r"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#fff"/><g fill="#000"><path d="M13 2v5.5A1.5 1.5 0 0 0 14.5 9H20V7.6h-5.2V2Z"/><rect x="7.5" y="12" width="9" height="1.8" rx=".6"/><rect x="7.5" y="15.5" width="6" height="1.8" rx=".6"/></g></mask><rect width="24" height="24" mask="url(#si-r)"/>',
    'aparencia': '<circle cx="12" cy="12" r="4.6"/><path fill="none" stroke-width="2" d="M12 2v2.2m0 15.6V22M2 12h2.2m15.6 0H22M4.9 4.9l1.6 1.6m11 11 1.6 1.6m0-14.2-1.6 1.6M6.5 17.5l-1.6 1.6"/>',
    'ajustes': '<path fill-rule="evenodd" d="m9 2.5-.6 2.4-2 .9-2.2-.8-2.1 3.6 1.7 1.7v3.4l-1.7 1.7 2.1 3.6 2.2-.8 2 .9.6 2.4h6l.6-2.4 2-.9 2.2.8 2.1-3.6-1.7-1.7v-3.4l1.7-1.7-2.1-3.6-2.2.8-2-.9-.6-2.4Zm3 6.2a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6Z"/>',
    'auto': '<path fill="none" stroke-width="2" d="M20 11a8 8 0 0 0-14.9-3.6M4 4v4h4M4 13a8 8 0 0 0 14.9 3.6M20 20v-4h-4"/>',
    'recolher': '<path fill="none" stroke-width="2" d="m14 6-6 6 6 6M8 12h13"/>',
    'expandir': '<path fill="none" stroke-width="2" d="m10 6 6 6-6 6M3 12h13"/>'
  };
  const svg = (k) => `<svg class="si-svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SI[k] || ''}</svg>`;
  // bandeiras desenhadas (não emoji): Brasil e EUA, recortadas em círculo
  const FLAG = {
    B3: '<svg class="sm-flag" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#1f9e57"/><path d="M10 3.6 17 10l-7 6.4L3 10Z" fill="#f7d117"/><circle cx="10" cy="10" r="3.6" fill="#1d3f8f"/><path d="M6.6 9.3c2.3-.6 4.7-.3 6.8.9" stroke="#fff" stroke-width=".8" fill="none"/></svg>',
    NYSE: '<svg class="sm-flag" viewBox="0 0 20 20" aria-hidden="true"><clipPath id="sm-us"><circle cx="10" cy="10" r="10"/></clipPath><g clip-path="url(#sm-us)"><rect width="20" height="20" fill="#fff"/><path d="M0 0h20v1.54H0Zm0 3.08h20v1.54H0Zm0 3.08h20V7.7H0Zm0 3.08h20v1.54H0Zm0 3.08h20v1.54H0Zm0 3.08h20v1.54H0Zm0 3.08h20V20H0Z" fill="#c8323a"/><rect width="10" height="10.8" fill="#26387a"/></g></svg>'
  };
  const side = document.createElement('aside');
  side.className = 'side';
  side.setAttribute('aria-label', 'Navegação');
  side.innerHTML = `
    <div class="side-brand" aria-label="Mercado Macro"></div>
    <button class="side-item" id="side-search" title="Buscar ativo, aba ou ação (Ctrl+K)">${svg('buscar')}<span class="si-lbl">Buscar</span><span class="si-kbd">Ctrl K</span></button>
    <nav class="side-nav">${GROUPS.map(([g, ids]) => `<div class="side-group">${g}</div>` + ids.map(tabInfo).filter(Boolean).map(t =>
      `<button class="side-item" data-tab="${t.id}" title="${escapeHTML(t.label)}">${SI[t.id] ? svg(t.id) : `<i class="si-ico ${t.ico}"></i>`}<span class="si-lbl">${escapeHTML(t.label)}</span>${t.soon ? '<span class="si-soon">EM BREVE</span>' : `<span class="si-badge" data-badge="${t.id}" hidden></span>`}</button>`
    ).join('')).join('')}</nav>
    <div class="side-foot">
      <button class="side-item" id="side-summary" title="Resumo para o cliente (Alt+M)">${svg('resumo')}<span class="si-lbl">Resumo para cliente</span></button>
      <button class="side-item" id="side-live" title="Atualização automática: busca as cotações a cada 5 min no pregão e a cada 15 min fora dele" role="switch" aria-checked="false">${svg('auto')}<span class="si-lbl">Auto-atualizar</span><span class="si-switch" aria-hidden="true"></span></button>
      <button class="side-item" id="side-theme" title="Aparência: tema claro ou escuro (Alt+L)" role="switch" aria-checked="false">${svg('aparencia')}<span class="si-lbl">Aparência</span><span class="si-switch" aria-hidden="true"></span></button>
      <button class="side-item" id="side-settings" title="Ajustes do painel (Alt+A)">${svg('ajustes')}<span class="si-lbl">Ajustes</span></button>
      <button class="side-item" id="side-collapse" title="Recolher/expandir a barra">${svg('recolher')}<span class="si-lbl">Recolher</span></button>
    </div>`;
  document.body.prepend(side);
  document.body.classList.add('has-side');

  // na primeira visita abre aberta; depois lembra a escolha (chave própria, fora dos ajustes)
  const SIDE_KEY = 'trader_side_collapsed';
  let collapsed = false;
  try { collapsed = localStorage.getItem(SIDE_KEY) === '1'; } catch (e) { /* sem armazenamento */ }
  const applyCollapsed = () => {
    document.body.classList.toggle('side-collapsed', collapsed);
    const lbl = $('#side-collapse .si-lbl');
    if (lbl) lbl.textContent = collapsed ? 'Expandir' : 'Recolher';
    const ic = $('#side-collapse .si-svg');
    if (ic) ic.innerHTML = SI[collapsed ? 'expandir' : 'recolher'];
    $('#side-collapse')?.setAttribute('title', collapsed ? 'Expandir o menu' : 'Recolher o menu');
    $('#side-collapse')?.setAttribute('aria-expanded', String(!collapsed));
  };
  applyCollapsed();

  // recolhida: ao passar o mouse, abre por cima do painel (sem empurrar o conteúdo), como no Cloudflare
  let peekT = 0;
  const peek = (on) => {
    clearTimeout(peekT);
    peekT = setTimeout(() => {
      if (on && !collapsed) return;
      document.body.classList.toggle('side-peek', on);
      document.body.classList.toggle('side-collapsed', on ? false : collapsed);
    }, on ? 120 : 2000);   // ao sair, espera 2 s para recolher (pedido do Dante, 13/11/2026): dá tempo de ir aos sub-itens
  };
  if (matchMedia('(hover: hover)').matches) {
    side.addEventListener('mouseenter', () => { if (collapsed) peek(true); });
    side.addEventListener('mouseleave', () => { if (document.body.classList.contains('side-peek')) peek(false); });
  }

  const syncActive = () => {
    const active = document.querySelector('.tab-btn.active')?.dataset.tab;
    side.querySelectorAll('.side-item[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === active);
      b.setAttribute('aria-current', b.dataset.tab === active ? 'page' : 'false');
    });
    // janela baixa: rola só a lista lateral, o mínimo para mostrar a aba ativa (as primeiras abas não saem de vista à toa)
    const nav = side.querySelector('.side-nav'), on = side.querySelector('.side-item.active');
    if (nav && on && nav.scrollHeight > nav.clientHeight) {
      const top = on.offsetTop - nav.offsetTop, bot = top + on.offsetHeight;
      if (top < nav.scrollTop) nav.scrollTop = top - 28 < 40 ? 0 : top - 28;
      else if (bot > nav.scrollTop + nav.clientHeight) nav.scrollTop = bot - nav.clientHeight + 4;
    }
  };
  side.querySelectorAll('.side-item[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  const prevHook = window.__onTabSwitch;
  window.__onTabSwitch = (tabId) => { if (prevHook) prevHook(tabId); syncActive(); };
  syncActive();

  $('#side-summary').addEventListener('click', () => openSummaryModal());
  // Aparência: a chave fica ligada no tema claro
  const syncTheme = () => $('#side-theme')?.setAttribute('aria-checked', document.body.classList.contains('light') ? 'true' : 'false');
  $('#side-theme').addEventListener('click', () => { $('#theme-toggle')?.click(); setTimeout(syncTheme, 0); });
  new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  syncTheme();
  // busca, atualização automática e Ajustes moram na barra (o topo ficou só com a frase e as cotações)
  $('#side-search').addEventListener('click', () => document.querySelector('.cmdk-hint')?.click());
  $('#side-settings').addEventListener('click', () => window.openSettings?.());
  const syncLive = () => $('#side-live')?.setAttribute('aria-checked', $('#live-toggle')?.getAttribute('aria-checked') === 'true' ? 'true' : 'false');
  $('#side-live').addEventListener('click', () => { $('#live-toggle')?.click(); setTimeout(syncLive, 0); });
  if ($('#live-toggle')) new MutationObserver(syncLive).observe($('#live-toggle'), { attributes: true, attributeFilter: ['aria-checked'] });
  syncLive();
  // Efeito "lupa" do Dock do Mac: com a barra recolhida, os ícones perto do mouse crescem
  (() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const ALCANCE = 110, MAX = 0.75; // até 75% maior no ícone embaixo do mouse
    let raf = 0, y = null;
    const itens = () => side.querySelectorAll('.side-item:not(#side-collapse)');
    const desliga = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const aplica = () => {
      raf = 0;
      const ativo = y != null && document.body.classList.contains('side-collapsed') && !desliga();
      itens().forEach(el => {
        let m = 1;
        if (ativo) {
          const r = el.getBoundingClientRect();
          const d = Math.abs(y - (r.top + r.height / 2));
          if (d < ALCANCE) m = 1 + MAX * Math.cos((d / ALCANCE) * Math.PI / 2) ** 2;
        }
        el.style.setProperty('--mag', m.toFixed(3));
      });
    };
    side.addEventListener('mousemove', (e) => { y = e.clientY; if (!raf) raf = requestAnimationFrame(aplica); });
    side.addEventListener('mouseleave', () => { y = null; if (!raf) raf = requestAnimationFrame(aplica); });
  })();
  $('#side-collapse').addEventListener('click', () => {
    collapsed = !collapsed;
    clearTimeout(peekT); document.body.classList.remove('side-peek');
    applyCollapsed();
    try { localStorage.setItem(SIDE_KEY, collapsed ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    // gráficos que dependem da largura
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  });

  // Status das bolsas e contadores (notícias críticas recentes, eventos de alto impacto que faltam hoje)
  const setBadge = (id, n, title, crit) => {
    const el = side.querySelector(`[data-badge="${id}"]`);
    if (!el) return;
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : String(n || '');
    el.classList.toggle('crit', !!crit);
    el.title = title || '';
  };
  const refreshSide = () => {
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    if ($('#side-mkts')) $('#side-mkts').innerHTML = MARKETS.map(m => {
      const open = marketIsOpen(m), f = feriadoHoje(m), wd = zonedParts(m.tz).wd, fer = !open && f && !f.abre && wd !== 'Sat' && wd !== 'Sun';
      return `<div class="side-mkt${open ? ' open' : ''}" title="${m.label} ${open ? 'aberta' : fer ? `fechada: feriado (${f.nome})` : 'fechada'} (horário de Brasília ${hora})">${FLAG[m.label] || ''}<span>${m.label}</span><i></i><small>${open ? 'Aberta' : fer ? 'Feriado' : 'Fechada'}</small><time>${hora}</time></div>`;
    }).join('');
    // newsAll vem do noticias.js, que carrega logo depois deste arquivo: na 1ª passada ainda não existe
    const crit = (typeof newsAll !== 'undefined' && Array.isArray(newsAll) ? newsAll : []).filter(n => n.nivel === 'CRITICO' && Date.now() - n.data < 3 * 3600 * 1000).length;
    setBadge('news-panel', crit, `${crit} notícia(s) de alto impacto nas últimas 3 h`, true);
    const today = spDay(Date.now());
    const left = (window.__calFeed || []).filter(e => e && e.date && e.impact === 'High' && spDay(e.date) === today
      && !e.actual && new Date(e.date).getTime() > Date.now() && !calIgnored(e)).length;
    setBadge('calendar-panel', left, `${left} evento(s) de alto impacto ainda hoje`);
  };
  refreshSide();
  setInterval(refreshSide, 30 * 1000);
  setTimeout(refreshSide, 4000);
})();

/* =========================================================
   TOPO: horário da atualização, cor e mini gráfico dos indicadores
   ========================================================= */
(() => {
  const SPARK_SRC = { usd: 'BRL=X', eur: 'EURBRL=X', ibov: '^BVSP', sp500: '^GSPC' };
  const SUBS = { selic: 'meta ao ano', ipca: '12 meses', usd: 'USD/BRL', eur: 'EUR/BRL', ibov: 'pontos', sp500: 'pontos' };
  const spark = (vals, up) => {
    if (!vals || vals.length < 2) return '';
    const w = 84, h = 22, min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 2) + 1).toFixed(1)},${(h - 2 - (v - min) / r * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(${up ? '--pos' : '--neg'})" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  };
  function decorateTicker() {
    TICKER_KEYS.forEach(k => {
      const item = document.querySelector(`.ticker .item[data-symbol="${k}"]`);
      if (!item) return;
      const d = tickerLast[k];
      const has = d && d.value != null && !isNaN(d.value);
      const chg = has ? (d.change || 0) : null;
      item.classList.toggle('is-up', chg != null && chg >= 0);
      item.classList.toggle('is-dn', chg != null && chg < 0);
      const sub = $(`#t-${k}-sub`);
      if (sub) sub.textContent = SUBS[k];
      if (d?.date) item.title = `Referência: ${d.date}. Clique para abrir o Mercado`;
      const sp = item.querySelector('.tk-spark');
      const memo = SPARK_SRC[k] && yahooMemo[SPARK_SRC[k]];
      if (sp) sp.innerHTML = '';
    });
  }
  const stamp = () => {
    const el = $('#tk-updated');
    if (!el) return;
    // só marca o horário se ao menos uma cotação do topo chegou agora (valor guardado de antes não conta)
    const res = window.__lastTickerResults;
    if (!Array.isArray(res)) { el.textContent = '—'; return; }
    const algum = res.some(r => r.status === 'fulfilled' && r.value && r.value.value != null && isFinite(r.value.value));
    if (!algum) { el.textContent = 'Sem atualização'; return; }
    el.innerHTML = `Atualizado às <b>${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</b>`;
  };
  // quando o topo termina de carregar (a classe "loading" sai), marca o horário e redesenha
  const tk = $('#ticker');
  let wasLoading = tk.classList.contains('loading');
  new MutationObserver(() => {
    const loading = tk.classList.contains('loading');
    if (wasLoading && !loading) { stamp(); decorateTicker(); }
    wasLoading = loading;
  }).observe(tk, { attributes: true, attributeFilter: ['class'] });
  if (!wasLoading && Object.keys(tickerLast).length) stamp();
  // teclado: Enter/Espaço no indicador abre o Mercado
  $$('.ticker .item').forEach(item => item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('market-panel'); }
  }));
  decorateTicker();
  setTimeout(decorateTicker, 3000);
  setInterval(decorateTicker, 60 * 1000);
})();

/* ---- Faixa do topo: índices, juros, commodities e moedas (lidos do lote do Yahoo, sem requisição extra) ---- */
(() => {
  const STRIP = [
    ['sp500y', '^GSPC', v => fmtNumber(v, { min: 2, max: 2 })],
    ['nasdaq', '^IXIC', v => fmtNumber(v, { min: 2, max: 2 })],
    ['ibovy', '^BVSP', v => fmtNumber(v, { min: 0, max: 0 })],
    ['us10y', '^TNX', v => `${fmtNumber(v, { min: 2, max: 2 })}%`],
    ['ouro', 'GC=F', v => fmtNumber(v, { min: 2, max: 2 })],
    ['brent', 'BZ=F', v => fmtNumber(v, { min: 2, max: 2 })],
    ['eurusd', 'EURUSD=X', v => fmtNumber(v, { min: 4, max: 4 })],
    ['gbpusd', 'GBPUSD=X', v => fmtNumber(v, { min: 4, max: 4 })],
    ['dxy', 'DX-Y.NYB', v => fmtNumber(v, { min: 2, max: 2 })]
  ];
  const TITLES = { us10y: 'Treasury de 10 anos (yield)', ouro: 'Ouro (futuro, US$ por onça-troy)', brent: 'Petróleo Brent (US$ por barril)', eurusd: 'Euro contra dólar', gbpusd: 'Libra contra dólar', dxy: 'Índice do dólar (DXY)' };
  // DXY ao vivo: quando a Mesa ou o Mercado ligam o câmbio em tempo real, a faixa usa o DXY calculado (não abre conexão própria)
  const fxTopo = window.MMForexLive?.entrar ? window.MMForexLive.entrar('topo', {
    onChange: (e) => { if (e.type === 'quote' && e.symbol === 'DX-Y.NYB') renderStrip(); },
    ref: (s) => { const d = yahooMemo[s] || marketDataCache[s]; return d && Number.isFinite(d.value) ? { v: d.value, c: d.change } : null; },
  }) : null;
  const dxyVivo = () => { const q = fxTopo?.quote('DX-Y.NYB'); return q && Number.isFinite(q.value) && Date.now() - (q.ts || 0) < 60000 ? q : null; };
  function renderStrip() {
    STRIP.forEach(([k, sym, fmt]) => {
      const lv = k === 'dxy' ? dxyVivo() : null;
      const d = lv ? { value: lv.value, change: lv.change } : (yahooMemo[sym] || marketDataCache[sym]);
      const valEl = $(`#t2-${k}`), chgEl = $(`#t2-${k}-chg`);
      if (!valEl) return;
      if (d && d.value != null && !isNaN(d.value)) {
        valEl.textContent = fmt(d.value);
        const c = d.change || 0;
        if (k === 'us10y' && d.change != null) {
          // juros: variação em pontos-base
          const bp = Math.round((d.value - d.value / (1 + c / 100)) * 100);
          chgEl.textContent = `${bp >= 0 ? '+' : '−'}${Math.abs(bp)} bp`;
          chgEl.className = `chg ${bp >= 0 ? 'up' : 'dn'}`;
        } else {
          chgEl.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
          chgEl.className = `chg ${c >= 0 ? 'up' : 'dn'}`;
        }
      } else if (valEl.textContent === '—') {
        chgEl.textContent = '';
      }
      const item = valEl.closest('.item');
      if (item && TITLES[k]) item.title = TITLES[k];
    });
  }
  const tk = $('#ticker');
  new MutationObserver(() => { if (!tk.classList.contains('loading')) renderStrip(); })
    .observe(tk, { attributes: true, attributeFilter: ['class'] });
  // se não couber tudo: esmaece a borda direita e a roda do mouse rola a faixa de lado
  const fit = () => {
    tk.classList.toggle('overflows', tk.scrollWidth > tk.clientWidth + 2);
    tk.classList.toggle('at-end', tk.scrollLeft + tk.clientWidth >= tk.scrollWidth - 4);
  };
  tk.addEventListener('scroll', fit, { passive: true });
  window.addEventListener('resize', fit);
  tk.addEventListener('wheel', (e) => {
    if (tk.scrollWidth <= tk.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    tk.scrollLeft += e.deltaY;
  }, { passive: false });
  setInterval(fit, 5000);
  renderStrip();
  setTimeout(() => { renderStrip(); fit(); }, 2500);
  setInterval(renderStrip, 30 * 1000);
})();

/* =========================================================
   DESIGN v3: brilho que segue o mouse, transição entre abas
   e paleta de comandos (Ctrl/⌘ + K)
   ========================================================= */
(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Brilho nos cartões: posição do mouse em --mx/--my (um único listener para a página toda)
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.quote-card, .nc-card, .ana-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // Transição nativa do navegador ao trocar de aba (Chrome/Edge/Safari recentes; nos outros, troca normal)
  if (document.startViewTransition && !reduce) {
    const _switch = switchTab;
    let pending = null; // aba que ainda vai entrar (a transição roda no próximo quadro)
    switchTab = function (tabId) {
      const cur = pending ?? document.querySelector('.tab-panel.active')?.id;
      if (cur === tabId) { if (!pending) _switch(tabId); return; }
      if (document.hidden) { pending = null; return _switch(tabId); }
      pending = tabId;
      try { document.startViewTransition(() => { pending = null; _switch(tabId); }); }
      catch (err) { pending = null; _switch(tabId); }
    };
  }

  /* ---------------- Paleta de comandos ---------------- */
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const box = document.createElement('div');
  box.className = 'cmdk';
  box.hidden = true;
  box.innerHTML = `
    <div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <div class="cmdk-in"><i class="fas fa-search"></i><input id="cmdk-q" placeholder="Buscar ativo, aba ou ação…" autocomplete="off" spellcheck="false"><span class="kbd">Esc</span></div>
      <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
      <div class="cmdk-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> navegar</span><span><span class="kbd">Enter</span> abrir</span><span><span class="kbd">Ctrl</span> + <span class="kbd">K</span> abre de qualquer lugar</span></div>
    </div>`;
  document.body.appendChild(box);

  // Botão de busca no topo
  const hint = document.createElement('button');
  hint.className = 'cmdk-hint';
  hint.title = 'Buscar ativo, aba ou ação (Ctrl+K)';
  hint.innerHTML = `<i class="fas fa-search"></i><span class="tx">Buscar</span><span class="kbd">${/Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'} K</span>`;
  const right = document.querySelector('.topbar-right');
  right?.insertBefore(hint, right.querySelector('#summary-btn'));
  hint.addEventListener('click', () => open());

  const tabsList = () => [...document.querySelectorAll('.tab-btn[data-tab]')].map(b => ({
    sec: 'Abas',
    icon: `<i class="${b.querySelector('i')?.className || 'fas fa-circle'}"></i>`,
    label: [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(),
    hint: b.querySelector('.soon-badge') ? 'em breve' : '',
    run: () => switchTab(b.dataset.tab)
  }));
  const ACTIONS = [
    ['fa-clipboard-list', 'Resumo para o cliente', 'whatsapp abertura fechamento', () => openSummaryModal()],
    ['fa-sync-alt', 'Atualizar cotações', 'refresh recarregar', () => updateTicker(false)],
    ['fa-adjust', 'Alternar tema claro/escuro', 'dark light modo', () => $('#theme-toggle')?.click()],
    ['fa-database', 'Backup e restauração', 'exportar importar notas preferencias', () => $('#backup-btn')?.click()],
    ['fa-cog', 'Ajustes do painel', 'configuracoes tema papel de parede cor wallpaper fonte', () => window.openSettings?.()],
    ['fa-newspaper', 'Gerar briefing de notícias', 'briefing noticias', () => { switchTab('news-panel'); setTimeout(() => $('#briefing-btn')?.click(), 250); }],
    ['fa-calendar-week', 'Agenda da semana', 'calendario eventos', () => $('#ecal-week-btn')?.click()],
    ['fa-file-export', 'Exportar agenda (.ics)', 'google outlook calendario', () => { switchTab('calendar-panel'); setTimeout(() => $('#ecal-ics-btn')?.click(), 250); }],
    ['fa-chart-line', 'Análise avançada', 'humor comparador desempenho', () => { switchTab('analysis-panel'); setTimeout(() => window.__anaSecao?.('mercado'), 250); }],
    ['fa-user-tie', 'Radar de insiders', 'insiders cvm 44 controladores diretores compras vendas', () => { switchTab('analysis-panel'); setTimeout(() => window.__anaSecao?.('ins'), 250); }]
  ].map(([ic, label, kw, run]) => ({ sec: 'Ações', icon: `<i class="fas ${ic}"></i>`, label, kw, run }));

  // seções de dentro das abas (Fed, Copom, Balanços, Proventos, Focus...), vindas do menu-sub.js
  const areasList = () => (window.MMMenuSub?.areas() || []).map(a => ({
    sec: 'Áreas do terminal', icon: a.ic, label: a.t, hint: a.nome, kw: a.kw, run: a.ir
  }));
  const assetsList = () => MARKET_SECTIONS.flatMap(sec => sec.items.map(it => {
    const key = it.symbol || it.type;
    const d = marketDataCache[key];
    const chg = d && d.change != null && !isNaN(d.change) ? d.change : null;
    return {
      sec: 'Ativos', icon: '<i class="fas fa-chart-area"></i>',
      label: it.name, hint: it.symbol || '', kw: `${it.symbol || ''} ${sec.id}`,
      right: chg == null ? '' : `<span class="rt" style="color:var(${chg >= 0 ? '--pos' : '--neg'})">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`,
      run: () => goAsset(key)
    };
  }));

  function goAsset(key) {
    switchTab('market-panel');
    setTimeout(() => {
      const f = $('#mkt-filter');
      if (f && f.value) { f.value = ''; f.dispatchEvent(new Event('input')); }
      const card = document.querySelector(`#market-panel .quote-card[data-symbol="${CSS.escape(key)}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      card.classList.add('cmdk-hit');
      setTimeout(() => card.classList.remove('cmdk-hit'), 1800);
    }, 260);
  }

  let items = [], sel = 0;

  function render() {
    const q = norm($('#cmdk-q').value.trim());
    const all = [...tabsList(), ...areasList(), ...ACTIONS, ...assetsList()];
    // cada palavra digitada precisa aparecer (15/11/2026: "taxa de juros" também acha)
    const palavras = q.split(/\s+/).filter(w => w.length > 1 && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w));
    items = q ? all.filter(o => { const t = norm(`${o.label} ${o.hint || ''} ${o.kw || ''} ${o.sec}`); return palavras.length ? palavras.every(w => t.includes(w)) : t.includes(q); })
              : [...tabsList(), ...ACTIONS];
    items = items.slice(0, 40);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    const list = $('#cmdk-list');
    if (!items.length) { list.innerHTML = '<div class="cmdk-empty">Nada encontrado.</div>'; return; }
    let last = '';
    list.innerHTML = items.map((o, i) => {
      const head = o.sec !== last ? `<div class="cmdk-sec">${o.sec}</div>` : '';
      last = o.sec;
      return `${head}<button class="cmdk-opt${i === sel ? ' sel' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">
        <span class="ic">${o.icon}</span><span class="tx">${escapeHTML(o.label)}${o.hint ? `<small>${escapeHTML(o.hint)}</small>` : ''}</span>${o.right || ''}</button>`;
    }).join('');
    list.querySelectorAll('.cmdk-opt').forEach(b => {
      b.addEventListener('mousemove', () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; mark(); } });
      b.addEventListener('click', () => pick(+b.dataset.i));
    });
  }
  function mark() {
    $$('#cmdk-list .cmdk-opt').forEach(b => { const on = +b.dataset.i === sel; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ block: 'nearest' }); });
  }
  function pick(i) { const o = items[i]; close(); window.closeNewsReader?.(); if (o) o.run(); }
  function open() { box.hidden = false; $('#cmdk-q').value = ''; sel = 0; render(); setTimeout(() => $('#cmdk-q').focus(), 10); }
  function close() { box.hidden = true; }

  $('#cmdk-q').addEventListener('input', () => { sel = 0; render(); });
  $('#cmdk-q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); box.hidden ? open() : close(); }
  });
})();

/* =========================================================
   LEITOR DE NOTÍCIAS: o texto que o feed entrega, sem sair do painel
   ========================================================= */
function newsExcerpt(n, max = 230) {
  if (NEWS_EN.has(n.fonte) && !n.trechoPt) return ''; // 15/11/2026: o trecho em inglês só aparece já traduzido
  const t = n.trechoPt || n.trecho || (n.resumo ? n.resumo.split('\n\n')[0] : '');
  if (!t) return '';
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
function newsReadMins(n) {
  return n.palavras >= 80 ? Math.max(1, Math.round(n.palavras / 200)) : 0;
}

(() => {
  const FS_KEY = 'news_reader_fs';
  const trCache = {}, trOriginal = new Set(), trTentou = new Set();
  // aviso de tradução (15/11/2026): cartão com barra de progresso e pontinhos animados, e o texto "desenhando" embaixo
  const nrTradBox = () => '<div class="nr-traduzindo" role="status" aria-live="polite"><div class="nr-trad-top"><span class="nr-trad-ic"><i class="fas fa-language" aria-hidden="true"></i></span><span class="nr-trad-tx"><b>Traduzindo para o português<span class="nr-dots" aria-hidden="true"><i></i><i></i><i></i></span></b><small>Leva só alguns segundos</small></span></div><div class="nr-trad-bar" aria-hidden="true"><span></span></div></div>'
    + '<div class="nr-skel"></div><div class="nr-skel" style="width:94%"></div><div class="nr-skel" style="width:86%"></div><div class="nr-skel" style="width:90%;margin-top:22px"></div><div class="nr-skel" style="width:72%"></div>';
  // tira do texto a manchete repetida e o "Authored by... via..." do começo (Zero Hedge e outros)
  const limpaCorpo = (n, texto) => {
    const tits = [n.tituloOriginal, n.titulo].filter(Boolean).map(newsSoLetras);
    const ps = String(texto || '').split('\n\n');
    while (ps.length > 1 && (tits.includes(newsSoLetras(ps[0])) || /^(authored by|submitted by|via )/i.test(ps[0].trim()) || !ps[0].trim())) ps.shift();
    return ps.join('\n\n');
  };
  let fs = 16;
  try { fs = +localStorage.getItem(FS_KEY) || 16; } catch (e) { /* silencioso */ }
  let list = [], idx = -1, cur = null;

  const overlay = document.createElement('div');
  overlay.className = 'nr-overlay';
  overlay.hidden = true;
  const panel = document.createElement('aside');
  panel.className = 'nr';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Leitor de notícias');
  panel.inert = true;
  panel.innerHTML = `
    <div class="nr-head">
      <button class="nr-ib" id="nr-prev" title="Anterior (←)"><i class="fas fa-chevron-up"></i></button>
      <button class="nr-ib" id="nr-next" title="Próxima (→)"><i class="fas fa-chevron-down"></i></button>
      <span class="pos" id="nr-pos"></span>
      <span class="sp"></span>
      <button class="nr-ib" id="nr-fs-dn" title="Diminuir texto">A−</button>
      <button class="nr-ib" id="nr-fs-up" title="Aumentar texto">A+</button>
      <button class="nr-ib" id="nr-close" title="Fechar (Esc)"><i class="fas fa-times"></i></button>
    </div>
    <div class="nr-scroll" id="nr-scroll"><article class="nr-art" id="nr-art"></article></div>`;
  document.body.append(overlay, panel);

  const byId = (id) => (window.__newsLeads || []).find(n => n.id === id) || newsAll.find(n => n.id === id);
  const srcOf = (n) => (n.fonte === 'Google News' ? (n.veiculo || 'Google News') : (NEWS_SOURCES[n.fonte]?.name || n.fonte));
  const isIntl = (n) => NEWS_SOURCES[n.fonte]?.scope === 'int';

  function fmtPara(t) {
    return escapeHTML(t).replace(/([+−-]?\s?\d[\d.,]*\s?%)/g, (m) => {
      const cls = /^\s*\+/.test(m) ? ' up' : /^\s*[−-]/.test(m) ? ' dn' : '';
      return `<b class="n${cls}">${m}</b>`;
    });
  }
  function bodyHTML(text) {
    const paras = text.split('\n\n').filter(Boolean);
    let html = '', inList = false;
    paras.forEach(p => {
      if (p.startsWith('• ')) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${fmtPara(p.slice(2))}</li>`; }
      else { if (inList) { html += '</ul>'; inList = false; } html += `<p>${fmtPara(p)}</p>`; }
    });
    return html + (inList ? '</ul>' : '');
  }

  let bionicOn = false;
  try { bionicOn = localStorage.getItem('mm_bionic_reading') === '1'; } catch (_) {}

  function applyBionic(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      if (!n.nodeValue.trim()) return;
      if (n.parentElement && n.parentElement.tagName === 'B') return;
      const frag = document.createDocumentFragment();
      n.nodeValue.split(/(\s+)/).forEach(w => {
        if (!w.trim() || w.length <= 1 || /^[\d.,%+-]+$/.test(w)) {
          frag.appendChild(document.createTextNode(w));
          return;
        }
        const clean = w.replace(/[^\p{L}\p{N}]/gu, '');
        if (clean.length <= 1) {
          frag.appendChild(document.createTextNode(w));
          return;
        }
        const cut = Math.max(1, Math.ceil(clean.length * 0.45));
        const b = document.createElement('b');
        b.textContent = w.slice(0, cut);
        frag.append(b, document.createTextNode(w.slice(cut)));
      });
      n.parentNode.replaceChild(frag, n);
    });
    return div.innerHTML;
  }

  // Ouvir a notícia (23/11/2026, pedido do Dante): voz do próprio aparelho, escolhendo a mais natural em português
  // que houver (Google / Microsoft "Natural" / Apple aprimorada). Lê título, "por que importa" e o texto em português.
  // 23/11/2026: só no celular/tablet (tela de toque); no computador as vozes do sistema soam robóticas
  const podeOuvir = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
    && !!(window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
  let ouvindo = null; // link da notícia que está sendo lida
  if (podeOuvir) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices()); } catch (e) {} }
  function vozPt() {
    let vs = [];
    try { vs = speechSynthesis.getVoices().filter(v => /^pt([-_]|$)/i.test(v.lang)); } catch (e) {}
    const nota = v => (/natural|neural|online|premium|enhanced|aprimorad/i.test(v.name) ? 8 : 0) + (/google/i.test(v.name) ? 4 : 0)
      + (/^pt[-_]BR/i.test(v.lang) ? 2 : 0) + (/francisca|thalita|antonio|luciana|felipe|fernanda/i.test(v.name) ? 1 : 0);
    return vs.sort((a, b) => nota(b) - nota(a))[0] || null;
  }
  function textoParaOuvir(n, corpo, emPt) {
    const partes = [n.titulo];
    if (n.porque) partes.push('Por que importa. ' + n.porque);
    if (emPt && corpo) partes.push(corpo);
    else if (n.trechoPt && newsSoLetras(n.trechoPt) !== newsSoLetras(n.titulo)) partes.push(n.trechoPt);
    return partes.join('. \n').replace(/https?:\/\/\S+/g, '').replace(/\s*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
  }
  // o Chrome corta falas longas (~15 s): vai em pedaços de até ~220 letras, quebrando nas frases
  function pedacosDaFala(t) {
    const frases = t.split(/(?<=[.!?;:])\s+|\n+/).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (const f of frases) {
      if (out.length && (out[out.length - 1] + ' ' + f).length <= 220) out[out.length - 1] += ' ' + f;
      else if (f.length <= 220) out.push(f);
      else for (let i = 0; i < f.length; i += 200) { const k = f.lastIndexOf(' ', i + 200); out.push(f.slice(i, k > i ? k : i + 200)); if (k > i) i = k - 200 + 1; }
    }
    return out.map(x => x.trim()).filter(Boolean);
  }
  function botaoOuvir() {
    const b = $('#nr-ouvir');
    if (!b) return;
    const on = !!cur && ouvindo === cur.link;
    b.classList.toggle('on', on);
    b.innerHTML = on ? '<i class="fas fa-stop"></i> Parar' : '<i class="fas fa-volume-up"></i> Ouvir';
    b.title = on ? 'Parar a leitura em voz alta' : 'Ouvir a notícia em voz alta (voz do seu aparelho)';
  }
  function pararOuvir() {
    if (!podeOuvir) return;
    ouvindo = null;
    try { speechSynthesis.cancel(); } catch (e) {}
    botaoOuvir();
  }
  function ouvir(n, texto) {
    try { speechSynthesis.cancel(); } catch (e) {}
    const voz = vozPt(), partes = pedacosDaFala(texto), link = n.link;
    if (!partes.length) return;
    ouvindo = link;
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = voz ? voz.lang : 'pt-BR';
      if (voz) u.voice = voz;
      u.rate = 1.03;
      if (i === partes.length - 1) u.onend = () => { if (ouvindo === link) { ouvindo = null; botaoOuvir(); } };
      u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled' && ouvindo === link) { ouvindo = null; botaoOuvir(); } };
      speechSynthesis.speak(u);
    });
    botaoOuvir();
  }

  function render() {
    const n = cur;
    const art = $('#nr-art');
    art.style.setProperty('--fs', fs + 'px');
    const picked = getNewsFavs().some(p => p.id === n.id);
    const d = new Date(n.data);
    const mins = newsReadMins(n);
    const intl = isIntl(n);
    const verOrig = trOriginal.has(n.link);
    const tr = verOrig ? '' : trCache[n.link];
    // 25/11/2026: a lista chega só com o 1º parágrafo (rp); o texto inteiro está sendo buscado (carregarTexto)
    const carregando = !!n.rp;
    const traduzindo = !carregando && intl && !tr && !verOrig && n.resumo && !trTentou.has(n.link);
    const text = carregando ? '' : tr || limpaCorpo(n, n.resumo || '');
    // resumo em português que só repete a manchete não aparece
    const ledeBoa = n.trechoPt && newsSoLetras(n.trechoPt) !== newsSoLetras(n.titulo);
    const short = (n.palavras || 0) < 120;
    const impact = n.impactScore >= 10 ? '<span class="nc-impact critico">Alto Impacto</span>' : n.impactScore >= 7 ? '<span class="nc-impact alto">Relevante</span>' : n.impactScore >= 4 ? '<span class="nc-impact medio">Mercado</span>' : '';
    const related = (n.related || []);
    const tags = n.tags || [];
    const more = newsAll.filter(o => o.id !== n.id && !related.some(r => r.id === o.id) && tags.some(t => (o.tags || []).includes(t)))
      .sort((a, b) => b.data - a.data).slice(0, 5);
    art.innerHTML = `
      <div class="nr-meta">
        <span class="nc-source" style="${newsSourceBadgeStyle(n.fonte)}">${escapeHTML(srcOf(n))}</span>
        <span>${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="dotsep">há ${timeAgoShort(n.data)}</span>
        ${mins ? `<span class="dotsep">${mins} min de leitura</span>` : ''}
      </div>
      <h1 class="nr-title">${escapeHTML(n.titulo)}</h1>
      ${n.traduzido && n.tituloOriginal ? `<div class="nr-orig">${escapeHTML(n.tituloOriginal)}</div>` : ''}
      <div class="nr-tags">${impact}${tags.map(t => `<span class="nc-tag ${t.toLowerCase()}">${t}</span>`).join('')}</div>
      ${n.porque ? `<div class="nr-porque"><b><i class="fas fa-lightbulb" aria-hidden="true"></i> Por que importa</b><span>${escapeHTML(n.porque)}</span><small>Explicação curta feita por IA a partir de ${related.length + 1} manchetes sobre o mesmo fato.</small></div>` : ''}
      <div class="nr-actions">
        <a class="btn-sm" href="${escapeHTML(n.link)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> Abrir no site</a>
        ${podeOuvir ? '<button class="btn-sm" id="nr-ouvir" type="button"></button>' : ''}
        <button class="btn-sm${bionicOn ? ' on' : ''}" id="nr-bionic" title="Ativar/desativar Leitura Dinâmica (Bionic Reading)"><i class="fas fa-bolt"></i> Leitura Rápida</button>
        <button class="btn-sm${picked ? ' on' : ''}" id="nr-pick"><i class="fas fa-star"></i> ${picked ? 'Nas favoritas' : 'Favoritar'}</button>
        <button class="btn-sm" id="nr-copy"><i class="fab fa-whatsapp"></i> Copiar para WhatsApp</button>
        ${!carregando && intl && n.resumo && !tr && !traduzindo ? `<button class="btn-sm" id="nr-tr"><i class="fas fa-language"></i> ${verOrig ? 'Ver em português' : 'Traduzir texto completo'}</button>` : ''}
        ${intl && tr ? '<button class="btn-sm" id="nr-orig"><i class="fas fa-language"></i> Ver original em inglês</button>' : ''}
      </div>
      ${intl && ledeBoa && !tr && !traduzindo ? `<div class="nr-lede"><small>Resumo em português</small>${escapeHTML(n.trechoPt)}</div>` : ''}
      <div class="nr-body" id="nr-body">${carregando ? '<div class="nr-skel"></div><div class="nr-skel" style="width:94%"></div><div class="nr-skel" style="width:86%"></div><div class="nr-skel" style="width:90%;margin-top:22px"></div><div class="nr-skel" style="width:72%"></div>' : traduzindo ? nrTradBox() : text ? (bionicOn ? applyBionic(bodyHTML(text)) : bodyHTML(text)) : ''}</div>
      ${carregando ? '' : !text && n._salva ? `<div class="nr-note"><i class="fas fa-star"></i><span>Notícia guardada nas suas Favoritas. O texto completo está no site de ${escapeHTML(srcOf(n))}: use “Abrir no site”.</span></div>`
        : !text ? `<div class="nr-note"><i class="fas fa-info-circle"></i><span>${escapeHTML(srcOf(n))} envia só a manchete pelo feed, sem o texto. ${related.length ? 'Veja abaixo como outras fontes noticiaram o mesmo fato.' : ''}</span></div>`
        : short ? `<div class="nr-note"><i class="fas fa-info-circle"></i><span>Este é o trecho que ${escapeHTML(srcOf(n))} libera pelo feed. A matéria completa fica no site.</span></div>` : ''}
      ${related.length ? `<section class="nr-sec"><h3>Também noticiado por</h3>${related.map(r => `<button class="nr-link" data-id="${escapeHTML(r.id)}"><span>${escapeHTML(r.titulo)}</span><small>${escapeHTML(srcOf(r))} · ${timeAgoShort(r.data)}</small></button>`).join('')}</section>` : ''}
      ${more.length ? `<section class="nr-sec"><h3>Mais sobre ${escapeHTML(tags.join(', '))}</h3>${more.map(r => `<button class="nr-link" data-id="${escapeHTML(r.id)}"><span>${escapeHTML(r.titulo)}</span><small>${escapeHTML(srcOf(r))} · ${timeAgoShort(r.data)}</small></button>`).join('')}</section>` : ''}`;
    // 17/11/2026: noticias4.js acrescenta a linha do tempo do assunto e a variação do preço desde a notícia
    try { window.dispatchEvent(new CustomEvent('mm:leitor', { detail: { n, art } })); } catch (e) { /* segue sem os extras */ }
    $('#nr-pos').textContent = idx >= 0 ? `${idx + 1} de ${list.length}` : '';
    $('#nr-prev').disabled = idx <= 0;
    $('#nr-next').disabled = idx < 0 || idx >= list.length - 1;
    art.querySelectorAll('.nr-link').forEach(b => b.addEventListener('click', () => open(b.dataset.id, true)));
    $('#nr-bionic')?.addEventListener('click', () => {
      bionicOn = !bionicOn;
      try { localStorage.setItem('mm_bionic_reading', bionicOn ? '1' : '0'); } catch (_) {}
      render();
    });
    $('#nr-pick').addEventListener('click', () => { toggleNewsPick(n.id); render(); });
    botaoOuvir();
    $('#nr-ouvir')?.addEventListener('click', () => {
      if (ouvindo === n.link) { pararOuvir(); return; }
      ouvir(n, textoParaOuvir(n, text, !intl || !!tr));
    });
    $('#nr-copy').addEventListener('click', copyWa);
    $('#nr-tr')?.addEventListener('click', () => { if (trCache[n.link]) { trOriginal.delete(n.link); render(); } else translateFull(); });
    $('#nr-orig')?.addEventListener('click', () => { trOriginal.add(n.link); render(); });
    // 15/11/2026: notícia em inglês já abre traduzida (uma vez por notícia; se falhar, fica o botão)
    if (traduzindo) translateFull();
  }

  // Plano B: o próprio navegador pede a tradução ao Google (IP do usuário, que raramente é bloqueado)
  async function translateInBrowser(texto) {
    const blocos = [];
    let atual = '';
    for (const p of texto.split('\n\n')) {
      const parte = p.slice(0, 1400);
      if ((atual + '\n' + parte).length > 1400 && atual) { blocos.push(atual); atual = ''; }
      atual = atual ? atual + '\n' + parte : parte;
    }
    if (atual) blocos.push(atual);
    const out = [];
    for (const b of blocos.slice(0, 10)) {
      const res = await fetchT('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=' + encodeURIComponent(b), {}, 12000);
      if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
      const data = await res.json();
      out.push((data[0] || []).map(seg => seg[0]).join(''));
    }
    return out.join('\n').split('\n').map(x => x.trim()).filter(Boolean).join('\n\n');
  }

  async function translateFull() {
    const n = cur, btn = $('#nr-tr');
    trTentou.add(n.link); trOriginal.delete(n.link);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-language"></i> Traduzindo…'; }
    if (!$('#nr-body .nr-traduzindo')) $('#nr-body').innerHTML = nrTradBox();
    let texto = '', erroNav = '';
    // o navegador pede ao Google direto (1 a 2 s); o servidor fica de plano B, porque o Google costuma recusá-lo
    if (n.resumo) {
      try { texto = await translateInBrowser(limpaCorpo(n, n.resumo)); }
      catch (e) { erroNav = e.message; }
    }
    if (!texto) {
      try {
        const res = await fetchT(`${NEWS_WORKER_URL}traduzir?u=${encodeURIComponent(n.link)}`, { cache: 'no-store' }, 20000);
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.texto) texto = limpaCorpo(n, j.texto);
      } catch (e) { console.warn('Tradução falhou. Navegador:', erroNav, '| Servidor:', e.message); }
    }
    if (texto) trCache[n.link] = texto;
    else toast('Não foi possível traduzir agora. Tente de novo em alguns minutos.', 'warning');
    if (cur === n) render();
  }

  function copyWa() {
    const n = cur;
    const text = trCache[n.link] || limpaCorpo(n, n.resumo || '');
    let corpo = '';
    for (const p of text.split('\n\n')) { if ((corpo + p).length > 700) break; corpo += (corpo ? '\n\n' : '') + p; }
    if (!corpo && n.trechoPt) corpo = n.trechoPt;
    const msg = `*${n.titulo}*${corpo ? `\n\n${corpo}` : ''}\n\n_Fonte: ${srcOf(n)}_\n${n.link}`;
    navigator.clipboard?.writeText(msg).then(() => toast('Copiado para colar no WhatsApp', 'success'), () => toast('Não foi possível copiar', 'warning'));
  }

  // texto completo da notícia, pedido só quando ela é aberta (a lista da aba vem com o 1º parágrafo)
  function carregarTexto(n) {
    if (!n.rp || n._buscando) return;
    n._buscando = fetchT('/api/noticias/texto?link=' + encodeURIComponent(n.link), {}, 15000)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.resumo) n.resumo = j.resumo; })
      .catch(() => { /* fica o 1º parágrafo */ })
      .finally(() => { delete n.rp; if (cur === n) render(); });
  }
  function open(id, keepList = false) {
    const n = byId(id);
    if (!n) return;
    if (!keepList) list = (window.__newsLeads || []).slice();
    idx = list.findIndex(x => x.id === id);
    if (cur && cur.id !== n.id) pararOuvir();
    cur = n;
    carregarTexto(n);
    AppState.addReadArticle(n.link);
    document.querySelectorAll(`.nc-card[data-id="${CSS.escape(id)}"]`).forEach(c => c.classList.add('read'));
    render();
    $('#nr-scroll').scrollTop = 0;
    if (!panel.classList.contains('on')) {
      overlay.hidden = false;
      panel.inert = false;
      requestAnimationFrame(() => { overlay.classList.add('on'); panel.classList.add('on'); });
      document.body.style.overflow = 'hidden';
      setTimeout(() => $('#nr-close').focus({ preventScroll: true }), 50);
    }
  }
  function close() {
    pararOuvir();
    overlay.classList.remove('on');
    panel.classList.remove('on');
    panel.inert = true;
    document.body.style.overflow = '';
    setTimeout(() => { if (!panel.classList.contains('on')) overlay.hidden = true; }, 280);
  }
  const step = (d) => { const j = idx + d; if (j >= 0 && j < list.length) open(list[j].id, true); };

  $('#nr-close').addEventListener('click', close);
  overlay.addEventListener('click', close);
  $('#nr-prev').addEventListener('click', () => step(-1));
  $('#nr-next').addEventListener('click', () => step(1));
  const setFs = (v) => { fs = Math.max(13, Math.min(22, v)); try { localStorage.setItem(FS_KEY, fs); } catch (e) { /* silencioso */ } if (cur) render(); };
  $('#nr-fs-dn').addEventListener('click', () => setFs(fs - 1));
  $('#nr-fs-up').addEventListener('click', () => setFs(fs + 1));
  document.addEventListener('keydown', (e) => {
    if (!panel.classList.contains('on')) return;
    // Ctrl+K (paleta) e outros atalhos não mexem no leitor; ↑/↓ ficam livres para rolar o texto
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!document.querySelector('.cmdk')?.hidden) return;
    if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight' || e.key === 'j') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'k') { e.preventDefault(); step(-1); }
  });

  // "Ao Vivo": o título também abre no leitor
  $('#live-container')?.addEventListener('click', (e) => {
    const a = e.target.closest('.lc-title a');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    if (a.ownerDocument !== document) return; // na janela separada o link abre normal, numa aba nova
    const n = newsAll.find(x => x.link === a.getAttribute('href'));
    if (!n) return;
    e.preventDefault();
    list = [...filterNewsBySources(newsAll)].sort((x, y) => y.data - x.data).slice(0, 100);
    open(n.id, true);
  });

  window.openNewsReader = (id) => open(id);
  window.closeNewsReader = () => { if (panel.classList.contains('on')) close(); };
})();

/* =========================================================
   INDICADORES: o código fica em indicadores.js (mesma pasta do index.html)
   e só é baixado na primeira vez que a aba é aberta
   ========================================================= */
(() => {
  const panel = document.getElementById('indicators-panel');
  if (!panel) return;
  let asked = false;
  const load = () => {
    if (asked || !panel.classList.contains('active')) return;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'indicadores.js?v=36';
    sc.onerror = () => {
      asked = false;
      const r = document.getElementById('ind-root');
      if (r) r.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>indicadores.js</b>. Publique ele na mesma pasta do index.html.</div>';
    };
    document.body.appendChild(sc);
  };
  new MutationObserver(load).observe(panel, { attributes: true, attributeFilter: ['class'] });
  load();
  // pré-carrega em segundo plano alguns segundos depois de a página abrir,
  // para os indicadores já estarem prontos quando a aba for aberta
  const warm = () => {
    // não pré-carrega com economia de dados ligada ou internet lenta (2G/3G): aí só baixa ao abrir a aba
    const cn = navigator.connection;
    if (cn && (cn.saveData || /(^|-)2g|3g/.test(cn.effectiveType || ''))) return;
    if (asked || document.hidden) return;
    // 18/11/2026: os dados (Banco Central, IBGE, FRED: umas 30 consultas) só vêm antes para quem abriu Indicadores
    // nos últimos 14 dias; para os outros baixa só o código e os dados vêm ao abrir a aba
    let usa = false;
    try { const d = localStorage.getItem('mm_uso_indicators-panel'); usa = !!d && (Date.now() - Date.parse(d + 'T12:00:00Z')) < 14 * 864e5; } catch (e) { /* sem acesso: não pré-carrega dados */ }
    window.__indWarm = usa;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'indicadores.js?v=36';
    sc.onerror = () => { asked = false; };
    document.body.appendChild(sc);
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
  const schedule = () => setTimeout(() => idle(warm, { timeout: 3000 }), 2500);
  if (document.readyState === 'complete') schedule(); else window.addEventListener('load', schedule, { once: true });
})();
/* =========================================================
   CALCULADORAS: o código fica em calculadoras.js (mesma pasta do index.html)
   e só é baixado na primeira vez que a aba é aberta
   ========================================================= */
(() => {
  const panel = document.getElementById('calculator-panel');
  if (!panel) return;
  let asked = false;
  const load = () => {
    if (asked || !panel.classList.contains('active')) return;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'calculadoras.js?v=8';
    sc.onerror = () => {
      asked = false;
      const r = document.getElementById('calc-root');
      if (r) r.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>calculadoras.js</b>. Publique ele na mesma pasta do index.html.</div>';
    };
    document.body.appendChild(sc);
  };
  new MutationObserver(load).observe(panel, { attributes: true, attributeFilter: ['class'] });
  load();
})();
/* =========================================================
   MERCADO NOVO: cartões por região no lugar da grade da aba Mercado (padrão desde 24/10/2026).
   A grade antiga continua escondida por baixo (dá os preços ao vivo, Selic, IPCA e minério).
   O modo clássico selecionável saiu em 24/10/2026; backup no ramo git backup-mercado-classico.
   ========================================================= */
(() => {
  try { localStorage.removeItem('mercado_novo'); } catch (e) { /* sem armazenamento */ }
  const sc = document.createElement('script');
  sc.src = 'mercado-novo.js?v=36';
  document.body.appendChild(sc);
})();
/* =========================================================
   MESA: o código fica em mesa.js (mesma pasta do index.html)
   e só é baixado na primeira vez que a aba é aberta
   ========================================================= */
(() => {
  const panel = document.getElementById('mesa-panel');
  if (!panel) return;
  let asked = false;
  const load = () => {
    if (asked || !panel.classList.contains('active')) return;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'mesa.js?v=70';
    sc.onerror = () => {
      asked = false;
      const r = document.getElementById('mesa-root');
      if (r) r.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>mesa.js</b>. Publique ele na mesma pasta do index.html.</div>';
    };
    document.body.appendChild(sc);
  };
  new MutationObserver(load).observe(panel, { attributes: true, attributeFilter: ['class'] });
  load();
})();
/* =========================================================
   FUNDAMENTOS: o código fica em fundamentos.js (mesma pasta do index.html)
   e só é baixado na primeira vez que a aba é aberta
   ========================================================= */
(() => {
  const panel = document.getElementById('fund-panel');
  if (!panel) return;
  let asked = false;
  const load = () => {
    if (asked || !panel.classList.contains('active')) return;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'fundamentos.js?v=16';
    sc.onerror = () => {
      asked = false;
      const r = document.getElementById('fund-root');
      if (r) r.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>fundamentos.js</b>. Publique ele na mesma pasta do index.html.</div>';
    };
    document.body.appendChild(sc);
  };
  new MutationObserver(load).observe(panel, { attributes: true, attributeFilter: ['class'] });
  load();
})();
/* =========================================================
   INSIDERS (13/11/2026): seção de "Macro e Fluxo"; insiders.js só é baixado
   na primeira vez que a seção é aberta
   ========================================================= */
(() => {
  let asked = false;
  const load = () => {
    const panel = document.getElementById('analysis-panel'), wrap = panel?.querySelector('.ana-wrap');
    if (asked || !panel?.classList.contains('active') || wrap?.dataset.secao !== 'ins') return;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'insiders.js?v=2';
    sc.onerror = () => { asked = false; const r = document.getElementById('insiders-root'); if (r) r.innerHTML = '<div class="ind-boot">Não foi possível carregar o radar de insiders. Recarregue a página.</div>'; };
    document.body.appendChild(sc);
  };
  document.addEventListener('mm-ana-secao', load);
  const panel = document.getElementById('analysis-panel');
  if (panel) new MutationObserver(load).observe(panel, { attributes: true, attributeFilter: ['class'] });
  setTimeout(load, 0);
})();
/* =========================================================
   FLUXO NA B3 (aba Análises): fluxo.js só é baixado
   quando a seção chega perto da tela
   ========================================================= */
(() => {
  const el = document.getElementById('fluxo-root');
  if (!el) return;
  let pedido = false;
  const carrega = () => {
    if (window.__fluxoRender) { window.__fluxoRender(el); return; }
    if (pedido) return;
    pedido = true;
    const sc = document.createElement('script');
    sc.src = 'fluxo.js?v=6';
    sc.onload = () => window.__fluxoRender && window.__fluxoRender(el);
    sc.onerror = () => { pedido = false; el.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>fluxo.js</b>.</div>'; };
    document.body.appendChild(sc);
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es, io) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); carrega(); } }, { rootMargin: '600px 0px' }).observe(el);
  } else carrega();
})();
/* =========================================================
   PROBABILIDADES DE JUROS (aba Análises): Fed (fed.js) e Copom (copom.js) ficam na mesma seção;
   a barra de seções (ana-secoes.js) mostra um ou outro, cada um com a sua aba (28/10/2026).
   Cada arquivo só é baixado quando a seção chega perto da tela.
   ========================================================= */
(() => {
  const sec = document.getElementById('ana-sec-fed');
  if (!sec) return;
  const LADOS = {
    eua: { root: 'fed-root', js: 'fed.js?v=10', fn: '__fedRender' },
    br: { root: 'copom-root', js: 'copom.js?v=5', fn: '__copomRender' },
  };
  const pedidos = {};
  const carrega = (k) => {
    const L = LADOS[k], el = document.getElementById(L.root);
    if (window[L.fn]) { window[L.fn](el); return; }
    if (pedidos[k]) return;
    pedidos[k] = true;
    const sc = document.createElement('script');
    sc.src = L.js;
    sc.onload = () => window[L.fn] && window[L.fn](el);
    sc.onerror = () => { pedidos[k] = false; el.innerHTML = `<div class="ind-boot">Não foi possível carregar o arquivo <b>${L.js.split('?')[0]}</b>.</div>`; };
    document.body.appendChild(sc);
  };
  const abre = () => { carrega('eua'); carrega('br'); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es, io) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); abre(); } }, { rootMargin: '600px 0px' }).observe(sec);
  } else abre();
})();
/* =========================================================
   POSIÇÕES (CFTC e SEC 13F, aba Análises): posicoes.js só é baixado
   quando uma das duas seções chega perto da tela
   ========================================================= */
(() => {
  const els = [...document.querySelectorAll('[data-posicoes]')];
  if (!els.length) return;
  let pedido = false;
  const espera = new Set();
  const carrega = (el) => {
    if (window.__posicoesRender) { window.__posicoesRender(el.dataset.posicoes, el); return; }
    espera.add(el);
    if (pedido) return;
    pedido = true;
    const sc = document.createElement('script');
    sc.src = 'posicoes.js?v=3';
    sc.onload = () => espera.forEach((x) => window.__posicoesRender && window.__posicoesRender(x.dataset.posicoes, x));
    sc.onerror = () => { pedido = false; espera.forEach((x) => { x.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>posicoes.js</b>.</div>'; }); espera.clear(); };
    document.body.appendChild(sc);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); carrega(e.target); } }), { rootMargin: '600px 0px' });
    els.forEach((el) => io.observe(el));
  } else els.forEach(carrega);
})();
/* =========================================================
   DESTAQUES (topo da aba Análises): destaques.js só é baixado
   quando a faixa aparece na tela
   ========================================================= */
(() => {
  const el = document.querySelector('[data-destaques]');
  if (!el) return;
  let pedido = false;
  const carrega = () => {
    if (window.__destaquesRender) { window.__destaquesRender(el); return; }
    if (pedido) return;
    pedido = true;
    const sc = document.createElement('script');
    sc.src = 'destaques.js?v=2';
    sc.onload = () => window.__destaquesRender && window.__destaquesRender(el);
    sc.onerror = () => { pedido = false; };
    document.body.appendChild(sc);
  };
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) carrega(); }, { rootMargin: '200px 0px' }).observe(el);
  else carrega();
})();
/* =========================================================
   OPÇÕES: o código fica em opcoes.js (mesma pasta do index.html)
   e só é baixado na primeira vez que a aba é aberta
   ========================================================= */
(() => {
  const panel = document.getElementById('options-panel');
  if (!panel) return;
  let asked = false;
  const load = () => {
    if (asked || !panel.classList.contains('active')) return;
    asked = true;
    const sc = document.createElement('script');
    sc.src = 'opcoes.js?v=7';
    sc.onerror = () => {
      asked = false;
      const r = document.getElementById('opt-root');
      if (r) r.innerHTML = '<div class="ind-boot">Não foi possível carregar o arquivo <b>opcoes.js</b>. Publique ele na mesma pasta do index.html.</div>';
    };
    document.body.appendChild(sc);
  };
  new MutationObserver(load).observe(panel, { attributes: true, attributeFilter: ['class'] });
  load();
})();
/* =========================================================
   RODAPÉ (fontes e aviso do FRED): desde 24/10/2026 fica só em Ajustes > Sobre (ajustes.js lê o
   #site-foot escondido). O código abaixo, que levava o rodapé ao fim de cada aba, ficou desligado.
   ========================================================= */
(() => {
  const foot = document.getElementById('site-foot');
  const DESLIGADO = true; // rodapé agora mora em Ajustes > Sobre
  if (!foot || DESLIGADO) return;
  let host = null, mo = null;
  const scroller = (panel) => {
    const own = panel.querySelector(':scope > .market-wrap, :scope > .news-wrap, :scope > .generic-wrap');
    const scrolls = (el) => el && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
    if (scrolls(own)) return own;
    for (const el of panel.querySelectorAll('*')) if (scrolls(el)) return el;
    return own || panel;
  };
  const keepLast = () => { if (host && host.lastElementChild !== foot) host.appendChild(foot); };
  const place = () => {
    const panel = document.querySelector('.tab-panel.active');
    if (!panel) return;
    const h = scroller(panel);
    if (h !== host) {
      host = h;
      if (mo) mo.disconnect();
      mo = new MutationObserver(keepLast);
      mo.observe(host, { childList: true });
    }
    keepLast();
  };
  const soon = () => { [0, 400, 1500].forEach((ms) => setTimeout(place, ms)); };
  document.querySelectorAll('.tab-panel').forEach((p) => new MutationObserver(soon).observe(p, { attributes: true, attributeFilter: ['class'] }));
  addEventListener('resize', () => { clearTimeout(place.t); place.t = setTimeout(place, 200); });
  // abas que montam o conteúdo depois (arquivo .js separado) mudam a área que rola
  new MutationObserver(() => { const p = document.querySelector('.tab-panel.active'); if (p && scroller(p) !== host) place(); }).observe(document.body, { childList: true });
  place();
  setTimeout(place, 1500);
})();

/* =========================================================
   CELULAR: fileiras que rolam para o lado (chips, cartões) ganham uma borda
   esmaecida do lado em que ainda há conteúdo, para mostrar que dá para arrastar
   ========================================================= */
(() => {
  const mq = matchMedia('(max-width: 900px)');
  const marca = (el) => {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('sx-l', max > 8 && el.scrollLeft > 4);
    el.classList.toggle('sx-r', max > 8 && el.scrollLeft < max - 4);
  };
  const rolaLado = (el) => {
    if (el.clientHeight > 260 || el.scrollWidth <= el.clientWidth + 8 || el.closest('.ticker')) return false;
    return /(auto|scroll)/.test(getComputedStyle(el).overflowX);
  };
  let vistos = new Set(), t = 0;
  const varre = () => {
    t = 0;
    if (!mq.matches) { vistos.forEach((el) => el.classList.remove('sx-l', 'sx-r')); vistos = new Set(); return; }
    const raiz = [document.querySelector('.tab-panel.active, .panel.active, [id$="-panel"].active'), document.getElementById('tabs')].filter(Boolean);
    raiz.forEach((r) => { if (rolaLado(r)) { vistos.add(r); marca(r); } r.querySelectorAll('*').forEach((el) => { if (rolaLado(el)) { vistos.add(el); marca(el); } }); });
  };
  const agenda = () => { if (!t) t = setTimeout(varre, 1200); };
  document.addEventListener('scroll', (e) => { if (vistos.has(e.target)) marca(e.target); }, { passive: true, capture: true });
  addEventListener('resize', agenda);
  document.addEventListener('click', (e) => { if (e.target.closest('.tab-btn, .side-item, button')) agenda(); }, true);
  // só reage quando entram elementos novos (o relógio e as cotações mudando texto não contam)
  new MutationObserver((ms) => { if (mq.matches && ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1))) agenda(); })
    .observe(document.body, { childList: true, subtree: true });
  agenda();
  // a aba aberta fica sempre visível na barra de abas (no celular ela rola para o lado)
  const centraAba = () => {
    const bar = document.getElementById('tabs'), b = bar?.querySelector('.tab-btn.active');
    if (!mq.matches || !b || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
  };
  document.getElementById('tabs')?.addEventListener('click', () => setTimeout(centraAba, 50));
  setTimeout(centraAba, 400);
})();

/* =========================================================
   APLICATIVO (PWA): permite instalar o site na tela inicial e abrir sem internet
   ========================================================= */
/* =========================================================
   ABA MERCADO AO VIVO
   Os cards que têm fonte ao vivo trocam o preço sem esperar a próxima consulta ao Yahoo:
   câmbio e metais, USD/BRL, VIX, futuros e índices (CFD, pelo servidor do site) e cripto (Binance). Os nomes dos fornecedores ficam em Ajustes > Sobre.
   A variação do dia usa o fechamento anterior do Yahoo que o card já tem; o mini gráfico continua o do Yahoo.
   ========================================================= */
(function mercadoAoVivo() {
  const panel = document.getElementById('market-panel');
  if (!panel) return;
  const fx = window.MMForexLive?.entrar ? window.MMForexLive.entrar('mercado', {
    onChange: (e) => { if (e.type === 'quote') pinta(e.symbol, e.quote?.direction); },
    ref: (s) => { const d = marketDataCache[s]; return d && Number.isFinite(d.value) ? { v: d.value, c: d.change } : null; },
  }) : null;
  const cr = window.MMCryptoLive?.hostAllowed(location.hostname)
    ? new window.MMCryptoLive.Client({ enabled: true, onChange: (e) => { if (e?.type === 'quote') pinta(e.symbol, e.quote?.direction); } })
    : null;
  const cards = (s) => [...document.querySelectorAll('#market-panel .quote-card[data-symbol]')].filter((c) => c.dataset.symbol === s);
  function vivo(s) {
    const q = fx?.covers(s) ? fx.quote(s) : null;
    if (q && q.source !== 'Yahoo') return { v: q.value, src: q.source === 'Deriv' ? '' : q.source === 'Calculado' ? 'calculado' : 'CFD', ts: q.ts };
    const c = cr?.quote(s);
    if (c && Number.isFinite(c.value)) return { v: c.value, src: 'Binance (USDT)', ts: c.ts };
    return null;
  }
  function pinta(s, dir) {
    if (!liveMode || !panel.classList.contains('active')) return;
    const l = vivo(s), d = marketDataCache[s];
    if (!l) return;
    // o protótipo do Mercado novo (mercado-novo.js) recebe o mesmo preço ao vivo
    try { window.__onMercadoVivo?.(s, l, dir); } catch (e) { /* protótipo não derruba a aba */ }
    for (const card of cards(s)) {
      const unit = d?.unit || '';
      const priceEl = card.querySelector('[data-price]'), changeEl = card.querySelector('[data-change]'), badgeEl = card.querySelector('[data-badge]'), timeEl = card.querySelector('[data-time]');
      if (!priceEl) continue;
      const v = l.v;
      priceEl.textContent = unit === 'R$' ? `R$ ${fmtNumber(v, { min: 4, max: 4 })}` : v >= 10000 ? fmtNumber(v, { min: 0, max: 2 }) : v >= 100 ? fmtNumber(v, { min: 2, max: 2 }) : fmtNumber(v, { min: 2, max: 4 });
      priceEl.classList.remove('skeleton');
      // fechamento anterior do Yahoo: preço / (1 + variação)
      const base = d && Number.isFinite(d.value) && Number.isFinite(d.change) ? d.value / (1 + d.change / 100) : null;
      if (base) {
        const chg = (v / base - 1) * 100, tone = chg >= 0 ? 'up' : 'dn';
        if (changeEl) { changeEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`; changeEl.className = `qc-change ${tone}`; }
        if (badgeEl) { badgeEl.textContent = chg > 0 ? '▲' : chg < 0 ? '▼' : '▲'; badgeEl.className = `qc-badge ${tone}`; }
        card.classList.remove('up', 'dn'); card.classList.add(tone);
      }
      if (timeEl) timeEl.textContent = 'tempo real · ' + (l.src ? l.src + ' ' : '') + new Date(l.ts || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      card.classList.add('qc-rt');
      if (dir) flashCard(card, dir > 0 ? 'up' : 'dn');
    }
  }
  const todos = () => MARKET_SECTIONS.flatMap((sec) => sec.items.map((it) => it.symbol)).filter(Boolean);
  function sync() {
    const on = liveMode && panel.classList.contains('active') && !document.hidden && !window.__mmLoggingOut;
    fx?.setActive(on); cr?.setActive(on);
  }
  setInterval(sync, 1000);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { fx?.setActive(false); cr?.setActive(false); });
  // depois de cada consulta ao Yahoo, o card volta a mostrar o preço ao vivo
  const orig = updateMarketPanel;
  updateMarketPanel = async function (...a) { const r = await orig.apply(this, a); todos().forEach((s) => pinta(s)); return r; };
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); }, { once: true });
  // 26/11/2026: no celular a página fica aberta em segundo plano e não pegava a versão nova sem limpar o cache.
  // Ao voltar para o app, procura versão nova; quando ela assume, recarrega sozinho (se a pessoa não estiver digitando).
  const tinhaVersao = !!navigator.serviceWorker.controller;
  let ultBusca = Date.now(), recarregou = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || Date.now() - ultBusca < 60 * 1000) return;
    ultBusca = Date.now();
    navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaVersao || recarregou) return;
    const recarrega = () => { if (recarregou) return; recarregou = true; location.reload(); };
    const digitando = () => { const a = document.activeElement; return a && (a.matches('input, textarea, select') || a.isContentEditable); };
    if (!digitando()) return recarrega();
    const espera = setInterval(() => { if (!digitando()) { clearInterval(espera); recarrega(); } }, 3000);
  });
}
