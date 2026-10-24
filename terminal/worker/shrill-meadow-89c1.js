import { limitarConsumo } from './rate-limit.js';
// cors-proxy-worker.js  (v5: + /ind/bundle, /history)
// Proxy com endpoint em LOTE (/quotes), cache de borda, endpoints dedicados (FRED, RSS)
// e TRAVA DE ORIGEM: só o seu painel na Netlify (e localhost, para testes) pode usar.
//
// As buscas ao Yahoo feitas de dentro do Worker são "subrequests" e NÃO contam
// como solicitações do Worker no limite de 100 mil/dia do plano gratuito.

// ---- Origens permitidas ----------------------------------------------------
// Inclui o site principal, os deploy previews da Netlify (xxxx--terminal-trade.netlify.app)
// e localhost/127.0.0.1 (teste local). Se um dia usar domínio próprio, adicione aqui.
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+--)?terminal-trade\.netlify\.app$/,
  /^https:\/\/([a-z0-9-]+--)?news-terminal\.netlify\.app$/,   // endereço temporário
  /^https:\/\/([a-z0-9-]+-)?station\.danilo-nillo\.workers\.dev$/, // site hospedado na Cloudflare (Workers)
  /^https:\/\/(www\.)?mercadomacro\.com\.br$/,                       // domínio próprio (quando apontar para o worker station)
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];
const originAllowed = (o) => !!o && ALLOWED_ORIGINS.some((re) => re.test(o));

function corsFor(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Retry-After, X-Cache, X-Reserva'
  };
}

const UA = 'Mozilla/5.0 (compatible; TraderDashboard/1.0)';

const QUOTES_TTL = 60;          // segundos em cache quando todos os símbolos deram certo
const QUOTES_TTL_PARTIAL = 15;  // segundos quando algum símbolo falhou
const MAX_SYMBOLS = 45;         // plano gratuito permite 50 subrequests por chamada
const SYMBOL_RE = /^[A-Za-z0-9^.=\-]{1,20}$/;

// Séries do FRED liberadas em /fred/series (aba Indicadores)
const FRED_SERIES = new Set(['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE', 'FEDFUNDS', 'DFEDTARU', 'DFEDTARL', 'DGS2', 'DGS10', 'DGS30',
  'T5YIE', 'T10Y2Y', 'GDPC1', 'GDP', 'UNRATE', 'PAYEMS', 'INDPRO', 'UMCSENT']);

// Hosts liberados no proxy genérico (?url=...)
const ALLOWED_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com'
];

function json(obj, status = 200, cors = {}, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra }
  });
}

// =========================================================
// /quotes?symbols=^BVSP,PETR4.SA,BTC-USD,...
// Devolve { "<símbolo>": <JSON do Yahoo chart> | { error } }
// =========================================================
async function handleQuotes(url, ctx, cors) {
  const requested = (url.searchParams.get('symbols') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const symbols = [...new Set(requested)].sort();

  if (symbols.length === 0) return json({ error: 'Parâmetro symbols ausente' }, 400, cors);
  if (symbols.length > MAX_SYMBOLS) return json({ error: `Máximo de ${MAX_SYMBOLS} símbolos por chamada` }, 400, cors);
  if (!symbols.every((s) => SYMBOL_RE.test(s))) return json({ error: 'Símbolo inválido' }, 400, cors);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/quotes?symbols=' + encodeURIComponent(symbols.join(',')));

  const hit = await cache.match(cacheKey);
  if (hit) {
    const h = new Headers(hit.headers);
    Object.entries(cors).forEach(([k, v]) => h.set(k, v));
    h.set('X-Cache', 'HIT');
    return new Response(hit.body, { status: 200, headers: h });
  }

  const entries = await Promise.all(symbols.map(async (sym) => {
    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=1d`;
      const r = await fetch(yahooUrl, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        cf: { cacheTtl: QUOTES_TTL, cacheEverything: true }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return [sym, await r.json()];
    } catch (err) {
      return [sym, { error: String(err.message || err) }];
    }
  }));

  const okCount = entries.filter(([, v]) => !v.error).length;
  const ttl = okCount === entries.length ? QUOTES_TTL : QUOTES_TTL_PARTIAL;
  const body = JSON.stringify(Object.fromEntries(entries));

  // a cópia guardada em cache não leva cabeçalhos CORS (eles são colocados a cada resposta)
  const toCache = new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` }
  });
  if (okCount > 0) ctx.waitUntil(cache.put(cacheKey, toCache.clone()));

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache': 'MISS',
      ...cors
    }
  });
}

// =========================================================
// /calendar  — devolve [{ title, country (moeda), date (ISO), impact, forecast, previous }]
// Fonte 1: Investing (o mesmo widget do painel, em português). Fonte 2: TradingView. Fonte 3: ForexFactory.
// A última resposta boa fica guardada por 7 dias e é usada se as duas fontes falharem.
// =========================================================
const CAL_FRESH_KEY = 'https://cache.local/calendar-v4';
const CAL_STALE_KEY = 'https://cache.local/calendar-v4-stale';
const TV_COUNTRY = { US: 'USD', EU: 'EUR', CN: 'CNY', GB: 'GBP', JP: 'JPY', BR: 'BRL' };
const TV_IMPACT = { '1': 'High', '0': 'Medium', '-1': 'Low' };
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const snippet = (t) => String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

// Mesmo endereço do iframe da aba Calendário (semana atual, horário de Brasília, português)
const INVESTING_URL = 'https://sslecal2.investing.com/?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&countries=110,17,29,25,32,6,37,26,5,22,39,14,48,10,35,7,43,38,4,36,12,72&calType=week&timeZone=12&lang=12';
const htmlText = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

async function fetchInvesting() {
  const r = await fetch(INVESTING_URL, {
    signal: AbortSignal.timeout(CAL_SRC_MS),
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9', 'Referer': 'https://terminal-trade.netlify.app/' }
  });
  const html = await r.text();
  if (!r.ok) throw new Error('Investing HTTP ' + r.status + ': ' + snippet(html));
  const events = [];
  // cada evento: <tr id="eventRowId_..." event_timestamp="AAAA-MM-DD HH:MM:SS" (UTC)>
  const rowRe = /<tr id="eventRowId_\d+"[^>]*event_timestamp="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const [, ts, row] = m;
    const cell = (re) => htmlText((row.match(re) || [])[1]);
    const country = (row.match(/class="flagCur"[^>]*>[\s\S]*?<\/span>\s*([A-Z]{3})/) || [])[1];
    const title = cell(/<td class="left event"[^>]*>([\s\S]*?)<\/td>/);
    if (!country || !title) continue;
    const bulls = (row.match(/grayFullBullishIcon/g) || []).length;
    // Investing pinta o resultado: verde = melhor que o esperado, vermelho = pior
    const actTag = (row.match(/<td class="bold act([^"]*)"[^>]*>/) || [])[1] || '';
    const surprise = /greenFont/.test(actTag) ? 'better' : /redFont/.test(actTag) ? 'worse' : '';
    events.push({
      title,
      country,
      date: ts.replace(' ', 'T') + 'Z',
      impact: bulls >= 3 ? 'High' : bulls === 2 ? 'Medium' : 'Low',
      actual: cell(/<td class="bold act[^"]*"[^>]*>([\s\S]*?)<\/td>/),
      forecast: cell(/<td class="fore"[^>]*>([\s\S]*?)<\/td>/),
      previous: cell(/<td class="prev[^"]*"[^>]*>([\s\S]*?)<\/td>/),
      surprise
    });
  }
  if (!events.length) throw new Error('Investing: nenhum evento na página (' + snippet(html) + ')');
  return events;
}

async function fetchTradingView() {
  const from = new Date(Date.now() - 2 * 864e5).toISOString();
  const to = new Date(Date.now() + 9 * 864e5).toISOString();
  const url = `https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=${Object.keys(TV_COUNTRY).join(',')}`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(CAL_SRC_MS),
    headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/', 'User-Agent': BROWSER_UA, 'Accept': 'application/json' }
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('TradingView HTTP ' + r.status + ': ' + snippet(txt));
  const data = JSON.parse(txt);
  const list = Array.isArray(data) ? data : data.result;
  if (!Array.isArray(list)) throw new Error('TradingView: formato inesperado');
  return list
    .filter((e) => e && e.title && e.date && TV_COUNTRY[e.country])
    .map((e) => ({
      title: e.title,
      country: TV_COUNTRY[e.country],
      date: e.date,
      impact: TV_IMPACT[String(e.importance)] || 'Low',
      forecast: e.forecast ?? '',
      previous: e.previous ?? ''
    }));
}

async function fetchForexFactory() {
  const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
    signal: AbortSignal.timeout(CAL_SRC_MS),
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' }
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('ForexFactory HTTP ' + r.status + ': ' + snippet(txt));
  const data = JSON.parse(txt);
  if (!Array.isArray(data)) throw new Error('ForexFactory: formato inesperado');
  return data;
}

// cada fonte tem no máximo 7 s; as três são consultadas ao mesmo tempo e vale a primeira da lista que der certo
const CAL_SRC_MS = 7000;
async function buildCalendar(ctx) {
  const cache = caches.default;
  const srcs = [['inv', fetchInvesting], ['tv', fetchTradingView], ['ff', fetchForexFactory]];
  const res = await Promise.allSettled(srcs.map(([, fn]) => fn()));
  const errors = [];
  for (let i = 0; i < srcs.length; i++) {
    const r = res[i], name = srcs[i][0];
    if (r.status === 'fulfilled' && r.value.length) {
      const body = JSON.stringify(r.value);
      const put = (key, ttl) => cache.put(new Request(key), new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` }
      }));
      ctx.waitUntil(Promise.all([put(CAL_FRESH_KEY, 1800), put(CAL_STALE_KEY, 7 * 86400)]));
      return { events: r.value, name };
    }
    errors.push(name + ': ' + (r.status === 'rejected' ? (r.reason?.name === 'TimeoutError' ? 'tempo esgotado' : String(r.reason?.message || r.reason)) : 'lista vazia'));
  }
  throw new Error(errors.join(' | '));
}
// uma atualização em segundo plano por vez (por colo): marca a vez por alguns minutos para não repetir
// a busca nas fontes a cada pedido quando elas estão fora do ar
async function suaVez(nome, seg) {
  const k = new Request('https://trava.mercadomacro/' + nome);
  if (await caches.default.match(k).catch(() => null)) return false;
  await caches.default.put(k, new Response('1', { headers: { 'Cache-Control': 'public, max-age=' + seg } })).catch(() => {});
  return true;
}
async function handleCalendar(ctx, cors) {
  const cache = caches.default;
  const fresh = await cache.match(new Request(CAL_FRESH_KEY));
  if (fresh) return json(await fresh.json(), 200, cors, { 'X-Cache': 'HIT' });
  // passou de 30 min: entrega a última lista boa na hora e atualiza em segundo plano
  const stale = await cache.match(new Request(CAL_STALE_KEY));
  if (stale) {
    if (await suaVez('calendar', 300)) ctx.waitUntil(buildCalendar(ctx).catch(() => {}));
    return json(await stale.json(), 200, cors, { 'X-Cache': 'STALE' });
  }
  try {
    const { events, name } = await buildCalendar(ctx);
    return json(events, 200, cors, { 'X-Cache': 'MISS', 'X-Source': name });
  } catch (err) {
    return json({ error: 'Calendário falhou: ' + err.message }, 502, cors);
  }
}

// =========================================================
// /ind/bundle?g=br|us|mo  — tudo que a aba Indicadores precisa, numa resposta só
// O navegador faz 1 chamada em vez de ~15. A resposta fica no cache da borda:
// até 1 h é servida direto; de 1 h a 24 h é servida na hora e atualizada em segundo plano.
// Chaves iguais às do indicadores.js (bcb:CÓDIGO:DIAS, bcbfrom:CÓDIGO:AAAA-MM-DD, fred:ID:UNITS:FREQ:LIMIT).
// =========================================================
const IND_FRESH = 3600, IND_STALE = 24 * 3600, IND_VER = 'v2';
const DAYMS = 86400000;
const brDate = (d) => { const b = new Date(d.getTime() - 3 * 3600000); return `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}/${b.getUTCFullYear()}`; };
const stepsOf = (s) => s.filter((p, i) => i === 0 || i === s.length - 1 || p[1] !== s[i - 1][1]);
const yAgo = (n) => `${new Date(Date.now() - 3 * 3600000).getUTCFullYear() - n}-01-01`;
function indSpecs(g) {
  const B = (code, days, opt = {}) => ({ k: `bcb:${code}:${days || 0}`, t: 'bcb', code, days, ...opt });
  const BF = (code, ini, opt = {}) => ({ k: `bcbfrom:${code}:${ini}`, t: 'bcbfrom', code, ini, ...opt });
  const F = (id, units = 'lin', freq = '', limit = 1000, opt = {}) => ({ k: `fred:${id}:${units}:${freq}:${limit}`, t: 'fred', id, units, freq, limit, ...opt });
  if (g === 'br') return [
    ...[433, 7478, 188, 189, 190].map((c) => B(c, 11 * 366)),
    B(432, 3650, { steps: true }), B(12, 1830), B(195, 1830), B(10813, 1830), B(1, 15), B(21620, 1830), B(21619, 15),
    B(24369, 11 * 366), B(7326), B(1208)
  ];
  if (g === 'us') return [
    F('T10Y2Y', 'lin', '', 1100), F('T5YIE', 'lin', '', 1100),
    ...['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE'].map((id) => F(id, 'lin', 'm', 420)),
    F('DFEDTARU', 'lin', '', 2500, { steps: true }), F('DFEDTARL', 'lin', '', 2500, { steps: true }), F('FEDFUNDS', 'lin', '', 420),
    F('DGS2', 'lin', '', 1100), F('DGS10', 'lin', '', 1100), F('DGS30', 'lin', '', 1100),
    F('GDPC1', 'lin', '', 220), F('GDP', 'lin', '', 8), F('UNRATE', 'lin', '', 420), F('PAYEMS', 'chg', '', 420),
    F('INDPRO', 'pc1', '', 420), F('UMCSENT', 'lin', '', 420)
  ];
  if (g === 'mo') return [
    B(4189, 23 * 366), B(432, 3650, { steps: true }), B(433, 23 * 366), F('FEDFUNDS', 'lin', '', 264), F('DFEDTARU', 'lin', '', 10), F('DFEDTARL', 'lin', '', 10),
    F('T10Y2Y', 'lin', 'm', 264), F('T10Y2Y', 'lin', '', 10)
  ];
  return null;
}
async function indFetchJSON(url, ms = 25000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms), cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const bcbRows = (j) => (Array.isArray(j) ? j : []).map((o) => { const [d, m, y] = String(o.data).split('/').map(Number); return [Math.round(Date.UTC(y, m - 1, d) / DAYMS), parseFloat(o.valor)]; }).filter((p) => isFinite(p[1]) && isFinite(p[0]));
async function indOne(sp, env) {
  let out;
  if (sp.t === 'bcb') {
    let u = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${sp.code}/dados?formato=json`;
    if (sp.days) { const end = new Date(); u += `&dataInicial=${brDate(new Date(end.getTime() - sp.days * DAYMS))}&dataFinal=${brDate(end)}`; }
    out = bcbRows(await indFetchJSON(u));
  } else if (sp.t === 'bcbfrom') {
    const wins = []; let ini = new Date(sp.ini + 'T12:00:00Z'); const fim = new Date();
    while (ini < fim) { const ate = new Date(Math.min(fim.getTime(), ini.getTime() + 3600 * DAYMS)); wins.push([ini, ate]); ini = new Date(ate.getTime() + DAYMS); }
    const parts = await Promise.all(wins.map(([a, b]) => indFetchJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${sp.code}/dados?formato=json&dataInicial=${brDate(a)}&dataFinal=${brDate(b)}`)));
    const seen = new Set();
    out = parts.flatMap(bcbRows).filter((p) => !seen.has(p[0]) && seen.add(p[0])).sort((a, b) => a[0] - b[0]);
  } else {
    if (!env.FRED_API_KEY) throw new Error('FRED_API_KEY não configurada');
    const j = await indFetchJSON(`https://api.stlouisfed.org/fred/series/observations?series_id=${sp.id}&api_key=${env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=${sp.limit}&units=${sp.units}${sp.freq ? '&frequency=' + sp.freq : ''}`);
    out = (j.observations || []).filter((o) => o.value !== '.').map((o) => { const [y, m, d] = o.date.split('-').map(Number); return [Math.round(Date.UTC(y, m - 1, d) / DAYMS), +o.value]; }).reverse();
  }
  if (!out.length) throw new Error('vazio');
  return sp.steps ? stepsOf(out) : out;
}
async function indBuild(g, env) {
  const specs = indSpecs(g);
  const res = await Promise.allSettled(specs.map((sp) => indOne(sp, env)));
  const data = {}, errors = {};
  res.forEach((r, i) => { if (r.status === 'fulfilled') data[specs[i].k] = r.value; else errors[specs[i].k] = String(r.reason?.message || r.reason); });
  return { g, ts: Date.now(), data, errors };
}
// última versão boa de cada série: cópia longa no cache e, se não houver, o arquivo que o robô
// historico.yml grava no GitHub. Usada quando a fonte (FRED, Banco Central) sai do ar.
const IND_BOM = 45 * 86400;
async function indReserva(g, cache) {
  try {
    const hit = await cache.match(new Request(`https://ind-bundle.cache/${IND_VER}/${g}/bom`));
    if (hit) return await hit.json();
  } catch (e) { /* tenta o GitHub */ }
  try {
    const r = await fetch(`https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/historico/ind-${g}.json`, { signal: AbortSignal.timeout(8000), cf: { cacheTtl: 600 } });
    if (r.ok) return await r.json();
  } catch (e) { /* sem reserva */ }
  return null;
}
async function handleIndBundle(url, env, ctx, cors) {
  const g = url.searchParams.get('g') || '';
  if (!indSpecs(g)) return json({ error: 'Grupo inválido' }, 400, cors);
  const cache = caches.default;
  const key = new Request(`https://ind-bundle.cache/${IND_VER}/${g}`);
  const keyBom = new Request(`https://ind-bundle.cache/${IND_VER}/${g}/bom`);
  const guarda = (k, b, ttl) => cache.put(k, new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } }));
  const refresh = async () => {
    const b = await indBuild(g, env);
    // série que falhou: usa a última versão boa (marcada em "antigos", com a data em que foi buscada)
    if (Object.keys(b.errors).length) {
      const r = await indReserva(g, cache);
      if (r && r.data) {
        for (const k of Object.keys(b.errors)) {
          if (Array.isArray(r.data[k]) && r.data[k].length) { b.data[k] = r.data[k]; (b.antigos = b.antigos || {})[k] = r.ts || null; }
        }
      }
    }
    // só guarda se veio a maior parte; senão mantém o que já havia
    if (Object.keys(b.data).length >= Math.ceil(indSpecs(g).length * 0.7)) {
      await guarda(key, b, IND_STALE);
      // a cópia longa só é trocada quando tudo veio novo da fonte
      if (!b.antigos && !Object.keys(b.errors).length) await guarda(keyBom, { g, ts: b.ts, data: b.data }, IND_BOM);
    }
    return b;
  };
  const hit = await cache.match(key);
  if (hit) {
    const b = await hit.json();
    const age = (Date.now() - b.ts) / 1000;
    if (age < IND_STALE) {
      if (age > IND_FRESH && await suaVez('ind-' + g, 300)) ctx.waitUntil(refresh().catch(() => {}));
      return json(b, 200, cors, { 'Cache-Control': 'public, max-age=300' });
    }
  }
  try {
    const b = await refresh();
    if (!Object.keys(b.data).length) return json({ error: 'Fontes indisponíveis', errors: b.errors }, 502, cors);
    return json(b, 200, cors, { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return json({ error: 'Pacote falhou: ' + err.message }, 502, cors);
  }
}

// =========================================================
// /history?symbols=^BVSP,PETR4.SA,...  — fechamentos diários dos últimos 3 meses (mini gráfico "3M" dos cards)
// &r=1d (pregão do dia, de 5 em 5 min) ou &r=5d (5 dias, de 30 em 30 min): gráfico da Mesa.
// &r=1mo e &r=1y (fechamentos diários): painel do ativo na Watchlist.
// Devolve { "<símbolo>": { t: [segundos], c: [fechamentos], off } | { error } }. Cache de borda de 6 h (1d: 2 min, 5d: 15 min).
// =========================================================
const HIST_TTL = 6 * 3600;
const HIST_FAIXAS = { '3mo': { iv: '1d', ttl: HIST_TTL }, '1d': { iv: '5m', ttl: 120 }, '5d': { iv: '30m', ttl: 900 }, '1mo': { iv: '1d', ttl: 3600 }, '1y': { iv: '1d', ttl: HIST_TTL } };
async function handleHistory(url, ctx, cors) {
  const faixa = HIST_FAIXAS[url.searchParams.get('r')] ? url.searchParams.get('r') : '3mo';
  const { iv, ttl: faixaTtl } = HIST_FAIXAS[faixa];
  const symbols = [...new Set((url.searchParams.get('symbols') || '').split(',').map((s) => s.trim()).filter(Boolean))].sort();
  if (!symbols.length) return json({ error: 'Parâmetro symbols ausente' }, 400, cors);
  if (symbols.length > MAX_SYMBOLS) return json({ error: `Máximo de ${MAX_SYMBOLS} símbolos por chamada` }, 400, cors);
  if (!symbols.every((s) => SYMBOL_RE.test(s))) return json({ error: 'Símbolo inválido' }, 400, cors);
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/history-v1?symbols=' + encodeURIComponent(symbols.join(',')) + (faixa === '3mo' ? '' : '&r=' + faixa));
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${Math.min(1800, faixaTtl)}`, 'X-Cache': 'HIT', ...cors } });
  const entries = await Promise.all(symbols.map(async (sym) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${iv}&range=${faixa}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: faixaTtl, cacheEverything: true }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const res = (await r.json())?.chart?.result?.[0];
      const ts = res?.timestamp || [], cl = res?.indicators?.quote?.[0]?.close || [];
      const t = [], c = [];
      for (let i = 0; i < ts.length; i++) if (cl[i] != null && isFinite(cl[i])) { t.push(ts[i]); c.push(+cl[i].toPrecision(7)); }
      if (c.length < 2) throw new Error('sem histórico');
      return [sym, { t, c, off: res.meta?.gmtoffset || 0 }];
    } catch (err) {
      return [sym, { error: String(err.message || err) }];
    }
  }));
  const ok = entries.filter(([, v]) => !v.error).length;
  const body = JSON.stringify(Object.fromEntries(entries));
  if (ok >= Math.ceil(entries.length * 0.7)) {
    // com algum símbolo faltando, guarda só por 15 min para ele voltar logo
    const ttl = ok === entries.length ? faixaTtl : Math.min(900, faixaTtl);
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } })));
  }
  return new Response(body, { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${Math.min(900, faixaTtl)}`, 'X-Cache': 'MISS', ...cors } });
}

// Empresas dos EUA cujos balanços aparecem no Calendário (as maiores do S&P 500 + ADRs brasileiros e da América Latina)
const EARN_WATCH = new Set(('AAPL MSFT NVDA GOOGL GOOG AMZN META TSLA AVGO BRK.B JPM V MA LLY UNH XOM JNJ WMT PG HD COST ORCL NFLX ' +
  'ABBV BAC KO PEP CVX MRK AMD ADBE CRM TMO ACN LIN MCD CSCO ABT WFC DIS INTC IBM QCOM TXN INTU AMAT MU NOW ISRG CAT GE ' +
  'GS MS C AXP BLK SCHW PFE AMGN GILD BMY T VZ CMCSA NKE SBUX BA LMT RTX HON UPS UNP DE MMM PM MO UBER ABNB PYPL SHOP ' +
  'PLTR SNOW PANW CRWD ARM SMCI DELL HPQ F GM COP SLB OXY FCX NEM BHP RIO ' +
  'PBR VALE ITUB BBD NU XP STNE PAGS MELI ABEV SBS GGB SID ERJ CIG BSBR UGP TIMB BAK EBR VIV SUZ BRFS').split(' '));

// ---- Empresas dos EUA: Finnhub (principal) e FMP (reserva) devolvem o mesmo formato ----
const US_SYM = /^[A-Z][A-Z0-9.-]{0,9}$/;
const US_SERIES = ['eps', 'salesPerShare', 'grossMargin', 'operatingMargin', 'netMargin', 'roe', 'roa', 'totalDebtToEquity', 'currentRatio', 'pe', 'pb', 'fcfMargin', 'bookValue'];
const numOrNull = (v) => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);
async function finnhubGet(ep, key, ttl) {
  const r = await fetch(`https://finnhub.io/api/v1/${ep}&token=${key}`, { cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) throw new Error('Finnhub HTTP ' + r.status);
  return r.json();
}
// FMP: API "stable". Erros de plano/limite voltam como HTTP 4xx ou como { "Error Message": ... }
async function fmpGet(ep, key, ttl) {
  const r = await fetch(`https://financialmodelingprep.com/stable/${ep}&apikey=${key}`, { cf: { cacheTtl: ttl, cacheEverything: true } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || (!Array.isArray(j) && (j['Error Message'] || j.error))) throw new Error('FMP HTTP ' + r.status + (j && (j['Error Message'] || j.error) ? ': ' + String(j['Error Message'] || j.error).slice(0, 80) : ''));
  return j;
}
const US_FINNHUB = {
  async earnings({ from, to }, key) {
    const data = await finnhubGet(`calendar/earnings?from=${from}&to=${to}`, key, 1800);
    if (!data || !Array.isArray(data.earningsCalendar)) throw new Error('Finnhub: formato inesperado');
    const lista = data.earningsCalendar.filter((e) => EARN_WATCH.has(e.symbol)).map((e) => ({
      s: e.symbol, d: e.date, h: e.hour || '', q: e.quarter, y: e.year,
      ee: e.epsEstimate ?? null, ea: e.epsActual ?? null, re: e.revenueEstimate ?? null, ra: e.revenueActual ?? null
    }));
    return { from, to, total: data.earningsCalendar.length, lista };
  },
  async fund({ s }, key) {
    const sym = encodeURIComponent(s);
    const [perfil, met, cot] = await Promise.all([
      finnhubGet(`stock/profile2?symbol=${sym}`, key, 86400),
      finnhubGet(`stock/metric?symbol=${sym}&metric=all`, key, 21600),
      finnhubGet(`quote?symbol=${sym}`, key, 60).catch(() => null)
    ]);
    if ((!perfil || !perfil.name) && (!met || !met.metric || !Object.keys(met.metric).length)) return { naoAchou: true };
    // só as séries anuais usadas no site, últimos 10 anos
    const anual = {}, src = (met && met.series && met.series.annual) || {};
    US_SERIES.forEach((k) => { if (Array.isArray(src[k])) anual[k] = src[k].slice(0, 10); });
    return { s, perfil: perfil || {}, m: (met && met.metric) || {}, anual, cot: cot && cot.c ? cot : null };
  },
  async search({ q }, key) {
    const j = await finnhubGet(`search?q=${encodeURIComponent(q)}&exchange=US`, key, 86400);
    const lista = (j.result || []).filter((e) => e && US_SYM.test(e.symbol) && !/\.(?!B$)/.test(e.symbol))
      .slice(0, 10).map((e) => ({ s: e.symbol, n: e.description, t: e.type }));
    return { lista };
  }
};
// Reserva FMP, traduzida para os mesmos campos do Finnhub (margens/ROE/DY em %, valores em milhões)
const US_FMP = {
  async earnings({ from, to }, key) {
    const data = await fmpGet(`earnings-calendar?from=${from}&to=${to}`, key, 1800);
    if (!Array.isArray(data)) throw new Error('FMP: formato inesperado');
    const lista = data.filter((e) => e && EARN_WATCH.has(e.symbol)).map((e) => ({
      s: e.symbol, d: String(e.date || '').slice(0, 10), h: '', q: null, y: null,
      ee: numOrNull(e.epsEstimated), ea: numOrNull(e.epsActual), re: numOrNull(e.revenueEstimated), ra: numOrNull(e.revenueActual)
    })).filter((e) => e.d);
    return { from, to, total: data.length, lista };
  },
  async fund({ s }, key) {
    const sym = encodeURIComponent(s.replace('.', '-'));   // FMP escreve BRK-B
    const [prof, rat, km, hist] = await Promise.all([
      fmpGet(`profile?symbol=${sym}`, key, 86400),
      fmpGet(`ratios-ttm?symbol=${sym}`, key, 21600).catch(() => []),
      fmpGet(`key-metrics-ttm?symbol=${sym}`, key, 21600).catch(() => []),
      fmpGet(`ratios?symbol=${sym}&period=annual&limit=6`, key, 86400).catch(() => [])
    ]);
    const p = Array.isArray(prof) ? prof[0] : null;
    if (!p) return { naoAchou: true };
    const r = (Array.isArray(rat) && rat[0]) || {}, k = (Array.isArray(km) && km[0]) || {};
    const pct = (v) => (numOrNull(v) == null ? null : +v * 100);
    const mcap = numOrNull(p.marketCap ?? k.marketCap);
    const [lo, hi] = String(p.range || '').split('-').map((x) => numOrNull(x));
    const m = {
      marketCapitalization: mcap == null ? null : mcap / 1e6,
      peTTM: numOrNull(r.priceToEarningsRatioTTM), pbQuarterly: numOrNull(r.priceToBookRatioTTM), psTTM: numOrNull(r.priceToSalesRatioTTM),
      currentDividendYieldTTM: pct(r.dividendYieldTTM), roeTTM: pct(k.returnOnEquityTTM),
      netProfitMarginTTM: pct(r.netProfitMarginTTM), operatingMarginTTM: pct(r.operatingProfitMarginTTM),
      'totalDebt/totalEquityQuarterly': numOrNull(r.debtToEquityRatioTTM), beta: numOrNull(p.beta),
      '52WeekLow': lo, '52WeekHigh': hi
    };
    const anual = {};
    const put = (key2, field) => {
      const pts = (Array.isArray(hist) ? hist : []).filter((x) => x && x.date && numOrNull(x[field]) != null).map((x) => ({ period: x.date, v: +x[field] }));
      if (pts.length) anual[key2] = pts;
    };
    put('grossMargin', 'grossProfitMargin'); put('operatingMargin', 'operatingProfitMargin'); put('netMargin', 'netProfitMargin');
    put('totalDebtToEquity', 'debtToEquityRatio'); put('pe', 'priceToEarningsRatio');
    const price = numOrNull(p.price);
    return {
      s,
      perfil: { name: p.companyName, ticker: s, exchange: p.exchange || p.exchangeFullName, finnhubIndustry: p.industry || p.sector, country: p.country,
        currency: p.currency, ipo: p.ipoDate, weburl: p.website, marketCapitalization: m.marketCapitalization,
        shareOutstanding: mcap != null && price ? mcap / price / 1e6 : null },
      m, anual,
      cot: price ? { c: price, dp: numOrNull(p.changePercentage) } : null
    };
  },
  async search({ q }, key) {
    const [a, b] = await Promise.all([
      fmpGet(`search-symbol?query=${encodeURIComponent(q)}`, key, 86400).catch(() => []),
      fmpGet(`search-name?query=${encodeURIComponent(q)}`, key, 86400).catch(() => [])
    ]);
    const seen = new Set();
    const lista = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
      .filter((e) => e && /NASDAQ|NYSE|AMEX/i.test(e.exchange || e.exchangeShortName || '') && US_SYM.test(String(e.symbol).replace('-', '.')))
      .map((e) => ({ s: String(e.symbol).replace(/-(?=[A-Z]$)/, '.'), n: e.name }))
      .filter((e) => !seen.has(e.s) && seen.add(e.s)).slice(0, 10);
    if (!lista.length) throw new Error('FMP: busca vazia');
    return { lista };
  }
};

// ---------------------------------------------------------------------------
// Reserva: o Banco Central (SGS e Olinda) e o Tesouro às vezes recusam ou derrubam os pedidos vindos da Cloudflare.
// Toda resposta boa dessas rotas fica guardada por 14 dias; se a fonte falhar, o site recebe a última resposta boa
// (com o cabeçalho X-Reserva: 1) em vez de ficar sem o número.
const RESERVA = new Set(['/bcb', '/focus', '/tesouro']);
function chaveReserva(url) {
  const sp = url.searchParams;
  let k = url.pathname;
  if (url.pathname === '/bcb') {
    // janela que termina hoje (dataFinal muda todo dia): a chave usa a série e o tamanho do período em meses;
    // período fechado no passado (calculadoras): a chave usa as datas exatas, para nunca servir outro período
    const q = sp.get('q') || '';
    const ult = q.match(/\/ultimos\/(\d{1,2})/);
    const di = q.match(/dataInicial=(\d{2})\/(\d{2})\/(\d{4})/), df = q.match(/dataFinal=(\d{2})\/(\d{2})\/(\d{4})/);
    const d = (m) => (m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : Date.now());
    const recente = Date.now() - d(df) < 7 * 864e5;
    k += '/' + (sp.get('c') || '') + '/' + (ult ? 'u' + ult[1] : !di ? 'tudo'
      : recente ? 'm' + Math.round((d(df) - d(di)) / (30.4375 * 864e5)) : di.slice(1).join('') + '-' + (df ? df.slice(1).join('') : ''));
  } else if (url.pathname === '/focus') k += sp.get('full') === '1' ? '/full' : '/curto';
  return 'https://reserva.mercadomacro' + k;
}
async function comReserva(request, resp, ctx) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !RESERVA.has(url.pathname)) return resp;
  const cache = caches.default, chave = chaveReserva(url);
  if (resp.status === 200) {
    const corpo = await resp.clone().text();
    ctx.waitUntil(cache.put(chave, new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1209600' } })).catch(() => {}));
    return resp;
  }
  if (resp.status < 500) return resp;
  const guardada = await cache.match(chave).catch(() => null);
  if (!guardada) return resp;
  const h = new Headers(resp.headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'public, max-age=120');
  h.set('X-Reserva', '1');
  return new Response(guardada.body, { status: 200, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    return comReserva(request, await rotas(request, env, ctx), ctx);
  },
};

const rotas = async (request, env, ctx) => {
  {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin');

    // ---- Trava de origem: navegador de outro site (ou chamada sem Origin) é recusado
    if (!originAllowed(origin)) {
      return json({ error: 'Origem não permitida' }, 403);
    }
    const cors = corsFor(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Método não permitido' }, 405, cors, { Allow: 'GET, HEAD, OPTIONS' });
    }
    const limitado = await limitarConsumo(request, env, cors);
    if (limitado) return limitado;

    // =========================================================
    // ENDPOINT: /quotes  (lote, com cache)
    // =========================================================
    if (path === '/quotes') {
      return handleQuotes(url, ctx, cors);
    }

    // =========================================================
    // ENDPOINT: /calendar  (agenda econômica: TradingView, com ForexFactory de reserva)
    // =========================================================
    if (path === '/calendar') {
      return handleCalendar(ctx, cors);
    }

    // =========================================================
    // ENDPOINT: /history  (3 meses de fechamentos em lote: mini gráfico dos cards da aba Mercado)
    // =========================================================
    if (path === '/history') {
      return handleHistory(url, ctx, cors);
    }

    // =========================================================
    // ENDPOINT: /ind/bundle?g=br|us|mo  (aba Indicadores: tudo numa chamada, com cache de borda)
    // =========================================================
    if (path === '/ind/bundle') {
      return handleIndBundle(url, env, ctx, cors);
    }

    // =========================================================
    // ENDPOINT: /fred/treasury20y
    // =========================================================
    if (path === '/fred/treasury20y') {
      if (!env.FRED_API_KEY) return json({ error: 'FRED_API_KEY não configurada' }, 500, cors);
      const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS20&api_key=${env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;

      try {
        // dado diário: cache de borda de 15 min
        const response = await fetch(fredUrl, { cf: { cacheTtl: 900, cacheEverything: true } });
        if (!response.ok) return json({ error: 'FRED HTTP ' + response.status }, 502, cors);
        const data = await response.json();
        return json(data, 200, cors, { 'Cache-Control': 'public, max-age=300' });
      } catch (err) {
        return json({ error: 'FRED falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // ENDPOINT: /fred/series?id=CPIAUCSL&units=lin&frequency=m&limit=1000
    // Aba Indicadores. Só séries da lista; a chave do FRED fica no Worker.
    // =========================================================
    if (path === '/fred/series') {
      if (!env.FRED_API_KEY) return json({ error: 'FRED_API_KEY não configurada' }, 500, cors);
      const id = url.searchParams.get('id') || '';
      if (!FRED_SERIES.has(id)) return json({ error: 'Série não liberada' }, 400, cors);
      const units = url.searchParams.get('units') || 'lin';
      const frequency = url.searchParams.get('frequency') || '';
      const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '1000', 10) || 1000));
      if (!/^(lin|chg|ch1|pch|pc1|pca|cch|cca|log)$/.test(units) || !/^(|d|w|m|q|a)$/.test(frequency)) {
        return json({ error: 'Parâmetro inválido' }, 400, cors);
      }
      const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}&units=${units}${frequency ? '&frequency=' + frequency : ''}`;
      try {
        const response = await fetch(fredUrl, { cf: { cacheTtl: 3600, cacheEverything: true } });
        const data = await response.json();
        if (!response.ok || data.error_message) return json({ error: data.error_message || 'HTTP ' + response.status }, 502, cors);
        // só data e valor (o resto do JSON do FRED não é usado)
        const obs = (data.observations || []).filter((o) => o.value !== '.').map((o) => [o.date, +o.value]);
        return json({ id, obs }, 200, cors, { 'Cache-Control': 'public, max-age=1800' });
      } catch (err) {
        return json({ error: 'FRED falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // ENDPOINT: /tesouro  (CSV oficial do Tesouro Direto: taxa e preço de cada título)
    // =========================================================
    if (path === '/tesouro') {
      try {
        const r = await fetch('https://www.tesourodireto.com.br/documents/d/guest/rendimento-investir-csv?download=true', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          cf: { cacheTtl: 900, cacheEverything: true }
        });
        if (!r.ok) return json({ error: 'Tesouro HTTP ' + r.status }, 502, cors);
        const buf = await r.arrayBuffer();
        // o CSV costuma vir em Latin-1; se tiver BOM/UTF-8 válido, usa UTF-8
        let csv;
        try { csv = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { csv = new TextDecoder('latin1').decode(buf); }
        const num = (t) => { const m = String(t || '').match(/-?[\d.]*,?\d+/); return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : null; };
        // colunas pelo cabeçalho: em out/2026 o Tesouro incluiu "Investimento mínimo" antes do preço unitário,
        // o que empurrou o vencimento para a 5ª coluna. Sem cabeçalho reconhecível, usa a ordem antiga.
        const linhas = csv.split(/\r?\n/).map((l) => l.split(';').map((x) => x.replace(/^\uFEFF/, '').trim()));
        const cab = linhas.find((c) => c.some((x) => /vencimento/i.test(x))) || [];
        const col = (re, padrao) => { const i = cab.findIndex((x) => re.test(x)); return i >= 0 ? i : padrao; };
        const iTaxa = col(/rendimento|taxa/i, 1), iPU = col(/pre[çc]o unit/i, 2), iMin = col(/m[ií]nimo/i, -1), iVenc = col(/vencimento/i, 3);
        const DATA = /^\d{2}\/\d{2}\/\d{4}$/;
        const titulos = linhas
          .filter((c) => c.length >= 4 && /^tesouro/i.test(c[0]))
          .map((c) => ({ nome: c[0], taxa: num(c[iTaxa]), pu: num(c[iPU]), minimo: iMin >= 0 ? num(c[iMin]) : null,
            vencimento: DATA.test(c[iVenc] || '') ? c[iVenc] : (c.find((x) => DATA.test(x)) || null) }))
          .filter((t) => t.taxa !== null && !isNaN(t.taxa));
        if (!titulos.length) return json({ error: 'CSV do Tesouro sem títulos' }, 502, cors);
        return json({ titulos, ts: Date.now() }, 200, cors, { 'Cache-Control': 'public, max-age=600' });
      } catch (err) {
        return json({ error: 'Tesouro falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // ENDPOINT: /focus  (Boletim Focus do Banco Central: expectativas do mercado)
    // anuais de IPCA, PIB, câmbio e Selic + Selic por reunião do Copom, últimos 40 dias
    // =========================================================
    if (path === '/focus') {
      try {
        const desde = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
        const base = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/';
        const q = (ep, filtro, campos) => `${base}${ep}?$top=1500&$format=json&$orderby=Data%20desc&$select=${campos}&$filter=${encodeURIComponent(filtro)}`;
        const get = async (url) => {
          const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 1800, cacheEverything: true } });
          if (!r.ok) throw new Error('BCB Olinda HTTP ' + r.status);
          return (await r.json()).value || [];
        };
        // ?full=1 (aba Calendário > Boletim Focus): todos os indicadores da tabela do relatório, ano atual até +3
        const full = url.searchParams.get('full') === '1';
        const IND = ['IPCA', 'PIB Total', 'Câmbio', 'Selic'].concat(full ? ['IGP-M', 'IPCA Administrados', 'Conta corrente', 'Balança comercial',
          'Investimento direto no país', 'Dívida líquida do setor público', 'Resultado primário', 'Resultado nominal'] : []);
        const ano = new Date().getUTCFullYear();
        const filtroInd = '(' + IND.map((x) => `Indicador eq '${x}'`).join(' or ') + ')' + (full ? ` and (DataReferencia eq '${ano}' or DataReferencia eq '${ano + 1}' or DataReferencia eq '${ano + 2}' or DataReferencia eq '${ano + 3}')` : '');
        const qa = q('ExpectativasMercadoAnuais', `${filtroInd} and baseCalculo eq 0 and Data ge '${desde}'`, 'Indicador,Data,DataReferencia,Mediana,numeroRespondentes').replace('$top=1500', full ? '$top=6000' : '$top=1500');
        const [anuais, copom] = await Promise.all([
          get(qa),
          get(q('ExpectativasMercadoSelic', `baseCalculo eq 0 and Data ge '${desde}'`, 'Data,Reuniao,Mediana')).catch(() => [])
        ]);
        if (!anuais.length) return json({ error: 'Focus sem dados' }, 502, cors);
        return json({ anuais, copom, ts: Date.now() }, 200, cors, { 'Cache-Control': 'public, max-age=1800' });
      } catch (err) {
        return json({ error: 'Focus falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // ENDPOINT: /minerio  (minério de ferro: o Yahoo (TIO=F) costuma vir parado ou do contrato errado)
    // Fonte 1: Investing, futuro de minério 62% Fe CFR China (SGX), em US$/t.
    // Fonte 2: Sina Finance, contrato contínuo da bolsa de Dalian (DCE), em yuan/t.
    // =========================================================
    if (path === '/minerio') {
      const erros = [];
      try {
        const r = await fetch('https://br.investing.com/commodities/iron-ore-62-cfr-futures', {
          headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
          signal: AbortSignal.timeout(8000), cf: { cacheTtl: 300, cacheEverything: true }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const html = await r.text();
        const pick = (re) => { const m = html.match(re); return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null; };
        const valor = pick(/data-test="instrument-price-last"[^>]*>([\d.,]+)</);
        const variacao = pick(/data-test="instrument-price-change-percent"[^>]*>[^\d-+]*([-+]?[\d.,]+)/);
        if (valor === null || !(valor > 20 && valor < 1000)) throw new Error('preço não encontrado na página');
        return json({ valor, variacao, moeda: 'USD', unidade: 't', mercado: 'SGX', fonte: 'Investing', ts: Date.now() }, 200, cors, { 'Cache-Control': 'public, max-age=120' });
      } catch (err) { erros.push('Investing: ' + err.message); }
      try {
        const r = await fetch('https://hq.sinajs.cn/list=nf_I0', {
          headers: { 'User-Agent': BROWSER_UA, 'Referer': 'https://finance.sina.com.cn/' },
          signal: AbortSignal.timeout(8000), cf: { cacheTtl: 60, cacheEverything: true }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        // texto em GBK; só os números interessam, então latin1 basta
        const txt = new TextDecoder('latin1').decode(await r.arrayBuffer());
        const f = ((txt.match(/="([^"]*)"/) || [])[1] || '').split(',');
        // campos do Sina para futuros chineses: 8 = último preço, 10 = ajuste anterior, 17 = data
        const ultimo = parseFloat(f[8]), ajusteAnt = parseFloat(f[10]);
        if (!(ultimo > 100 && ultimo < 5000)) throw new Error('resposta sem preço');
        const variacao = ajusteAnt > 0 ? +((ultimo / ajusteAnt - 1) * 100).toFixed(2) : null;
        return json({ valor: ultimo, variacao, moeda: 'CNY', unidade: 't', mercado: 'DCE', fonte: 'Sina', data: f[17] || null, ts: Date.now() }, 200, cors, { 'Cache-Control': 'public, max-age=60' });
      } catch (err) { erros.push('Sina: ' + err.message); }
      return json({ error: 'Minério falhou: ' + erros.join(' | ') }, 502, cors);
    }

    // =========================================================
    // ENDPOINT: /cds  (CDS Brasil 5 anos, da página do Investing)
    // =========================================================
    if (path === '/cds') {
      try {
        const r = await fetch('https://br.investing.com/rates-bonds/brazil-cds-5-years-usd', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' },
          cf: { cacheTtl: 1800, cacheEverything: true }
        });
        if (!r.ok) return json({ error: 'Investing HTTP ' + r.status }, 502, cors);
        const html = await r.text();
        const pick = (re) => { const m = html.match(re); return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null; };
        const valor = pick(/data-test="instrument-price-last"[^>]*>([\d.,]+)</);
        const variacao = pick(/data-test="instrument-price-change-percent"[^>]*>[^\d-+]*([-+]?[\d.,]+)/);
        if (valor === null) return json({ error: 'Valor do CDS não encontrado na página' }, 502, cors);
        return json({ valor, variacao, ts: Date.now() }, 200, cors, { 'Cache-Control': 'public, max-age=900' });
      } catch (err) {
        return json({ error: 'CDS falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // Dados de empresas dos EUA (aba Calendário > Balanços EUA e aba Fundamentos > EUA)
    // Fonte principal: Finnhub (segredo FINNHUB_API_KEY). Reserva: Financial Modeling Prep (segredo FMP_API_KEY),
    // usada quando o Finnhub falha, bate o limite ou não tem chave. A resposta diz qual respondeu em "fonte".
    // ENDPOINT: /finnhub/earnings?from=AAAA-MM-DD&to=AAAA-MM-DD
    // ENDPOINT: /finnhub/fund?s=AAPL
    // ENDPOINT: /finnhub/search?q=apple
    // =========================================================
    if (path === '/finnhub/earnings' || path === '/finnhub/fund' || path === '/finnhub/search') {
      if (!env.FINNHUB_API_KEY && !env.FMP_API_KEY) return json({ error: 'FINNHUB_API_KEY não configurada no Worker' }, 500, cors);
      let args;
      if (path === '/finnhub/earnings') {
        const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
        const re = /^\d{4}-\d{2}-\d{2}$/;
        if (!re.test(from) || !re.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to)) || Date.parse(to) - Date.parse(from) > 45 * 86400000 || Date.parse(to) < Date.parse(from)) {
          return json({ error: 'Período inválido (máximo 45 dias)' }, 400, cors);
        }
        args = { from, to };
      } else if (path === '/finnhub/fund') {
        const s = (url.searchParams.get('s') || '').toUpperCase();
        if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)) return json({ error: 'Ticker inválido' }, 400, cors);
        args = { s };
      } else {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
        if (!q) return json({ error: 'Parâmetro q ausente' }, 400, cors);
        args = { q };
      }
      const kind = path.split('/').pop();
      const erros = [];
      for (const [nome, fn] of [['finnhub', US_FINNHUB[kind]], ['fmp', US_FMP[kind]]]) {
        const key = nome === 'finnhub' ? env.FINNHUB_API_KEY : env.FMP_API_KEY;
        if (!key) continue;
        try {
          const out = await fn(args, key);
          if (out && out.naoAchou) { erros.push(nome + ': não encontrado'); continue; }
          return json({ ...out, fonte: nome, ts: Date.now() }, 200, cors, { 'Cache-Control': kind === 'search' ? 'public, max-age=3600' : 'public, max-age=300' });
        } catch (err) {
          erros.push(nome + ': ' + String(err.message || err));
        }
      }
      const naoAchou = erros.length && erros.every((e) => /não encontrado/.test(e));
      return json({ error: naoAchou ? 'Ticker não encontrado' : 'Fontes falharam: ' + erros.join(' | ') }, naoAchou ? 404 : 502, cors);
    }

    // =========================================================
    // ENDPOINT: /sidra?q=ipca|pib|desemp  (IBGE/SIDRA para a aba Indicadores; só as consultas da lista)
    // =========================================================
    // =========================================================
    // ENDPOINT: /bcb?c=432&q=/ultimos/1  (séries do SGS do Banco Central, com cache)
    // q aceita /ultimos/N e dataInicial/dataFinal (dd/mm/aaaa); o resto é ignorado
    // =========================================================
    if (path === '/bcb') {
      const c = url.searchParams.get('c') || '';
      const q = url.searchParams.get('q') || '';
      if (!/^\d{1,6}$/.test(c)) return json({ error: 'Série inválida' }, 400, cors);
      const ult = q.match(/\/ultimos\/(\d{1,2})\b/);
      const di = q.match(/dataInicial=(\d{2}\/\d{2}\/\d{4})/), df = q.match(/dataFinal=(\d{2}\/\d{2}\/\d{4})/);
      let u = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${c}/dados${ult ? '/ultimos/' + Math.min(+ult[1], 20) : ''}?formato=json`;
      if (!ult && di) u += `&dataInicial=${di[1]}`;
      if (!ult && df) u += `&dataFinal=${df[1]}`;
      try {
        const d = await indFetchJSON(u, 25000);
        if (!Array.isArray(d)) return json({ error: 'BCB sem dados' }, 502, cors);
        return json(d, 200, cors, { 'Cache-Control': 'public, max-age=900' });
      } catch (err) {
        return json({ error: 'BCB falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // ENDPOINT: /td?s=USD/BRL,EUR/BRL  (Twelve Data: só reserva do dólar e do euro,
    // usada quando a AwesomeAPI falha; chave no segredo TWELVEDATA_API_KEY; cache de 2 min
    // para gastar pouco do limite gratuito de 800 créditos por dia)
    // =========================================================
    if (path === '/td') {
      const PARES = ['USD/BRL', 'EUR/BRL'];
      const pedidos = (url.searchParams.get('s') || '').toUpperCase().split(',').map((x) => x.trim()).filter((x) => PARES.includes(x));
      if (!pedidos.length) return json({ error: 'Par não liberado' }, 400, cors);
      if (!env.TWELVEDATA_API_KEY) return json({ error: 'Falta o segredo TWELVEDATA_API_KEY' }, 503, cors);
      const lista = [...new Set(pedidos)].sort().join(',');
      const cache = caches.default;
      const ck = new Request('https://td.cache/quote/' + encodeURIComponent(lista));
      const hit = await cache.match(ck);
      if (hit) return json(await hit.json(), 200, cors, { 'Cache-Control': 'public, max-age=60' });
      try {
        const r = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(lista)}&apikey=${env.TWELVEDATA_API_KEY}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || d.status === 'error') return json({ error: 'Twelve Data: ' + (d?.message || 'HTTP ' + r.status) }, 502, cors);
        // um par vem como objeto direto; vários vêm separados pelo símbolo
        const porPar = lista.includes(',') ? d : { [lista]: d };
        const out = {};
        for (const [par, q] of Object.entries(porPar)) {
          const v = parseFloat(q?.close), c = parseFloat(q?.percent_change);
          if (q && q.status !== 'error' && isFinite(v)) out[par] = { valor: v, variacao: isFinite(c) ? c : null, ts: q.timestamp ? q.timestamp * 1000 : Date.now() };
        }
        if (!Object.keys(out).length) return json({ error: 'Twelve Data sem cotação' }, 502, cors);
        const body = { fonte: 'twelvedata', cotacoes: out };
        ctx.waitUntil(cache.put(ck, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } })));
        return json(body, 200, cors, { 'Cache-Control': 'public, max-age=60' });
      } catch (err) {
        return json({ error: 'Twelve Data falhou: ' + err.message }, 502, cors);
      }
    }

    if (path === '/sidra') {
      const q = url.searchParams.get('q') || '';
      const SIDRA = {
        ipca: '/t/7060/n1/all/v/63,66,2265/p/last%2013/c315/7169,7170,7445,7486,7558,7625,7660,7712,7766,7786',
        pib: '/t/5932/n1/all/v/6561,6564/p/last%2012/c11255/90707',
        desemp: '/t/6381/n1/all/v/4099/p/last%2025',
        ipca12: '/t/1737/n1/all/v/63,2265/p/last%2024'   // card IPCA da aba Mercado (reserva do BCB)
      };
      if (!SIDRA[q]) return json({ error: 'Consulta não liberada' }, 400, cors);
      try {
        const r = await fetch('https://apisidra.ibge.gov.br/values' + SIDRA[q], { cf: { cacheTtl: 21600, cacheEverything: true } });
        const data = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(data)) return json({ error: 'IBGE HTTP ' + r.status }, 502, cors);
        return json(data, 200, cors, { 'Cache-Control': 'public, max-age=3600' });
      } catch (err) {
        return json({ error: 'IBGE falhou: ' + err.message }, 502, cors);
      }
    }

    // =========================================================
    // ENDPOINT: /rss/finance (FX Spider / Dukascopy)
    // =========================================================
    if (path === '/rss/finance') {
      const rssUrl = 'https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance';

      try {
        const response = await fetch(rssUrl, {
          headers: {
            'User-Agent': UA,
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          },
          cf: { cacheTtl: 300, cacheEverything: true }
        });
        const xml = await response.text();
        return new Response(xml, {
          status: response.ok ? 200 : 502,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            ...cors
          }
        });
      } catch (err) {
        return new Response(`<?xml version="1.0"?><error>${err.message}</error>`, {
          status: 502,
          headers: { 'Content-Type': 'application/xml', ...cors }
        });
      }
    }

    // =========================================================
    // PROXY GENÉRICO (?url=...) — só hosts da lista ALLOWED_HOSTS, só GET
    // =========================================================
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) return json({ error: 'Parâmetro url ausente' }, 400, cors);

    let target;
    try {
      target = new URL(targetUrl); // searchParams.get já decodifica; decodificar de novo estraga %26, %23 e %
    } catch {
      return json({ error: 'Formato de url inválido' }, 400, cors);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Método não permitido' }, 405, cors);
    }
    if (!ALLOWED_HOSTS.includes(target.hostname)) {
      return json({ error: `Host não permitido: ${target.hostname}. Adicione em ALLOWED_HOSTS se for legítimo.` }, 403, cors);
    }

    try {
      const response = await fetch(target.toString(), {
        method: request.method,
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        redirect: 'follow',
        cf: { cacheTtl: 60, cacheEverything: true }
      });
      const h = new Headers(response.headers);
      Object.entries(cors).forEach(([k, v]) => h.set(k, v));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: h
      });
    } catch (err) {
      return json({ error: 'Requisição de proxy falhou: ' + err.message }, 502, cors);
    }
  }
};
