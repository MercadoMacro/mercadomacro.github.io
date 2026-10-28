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
    'Access-Control-Expose-Headers': 'Retry-After, X-Cache, X-Reserva, X-Passe'
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

// =========================================================
// PASSE (26/10/2026): o site manda em cada pedido um passe assinado pelo servidor do site (station),
// que só quem está logado recebe (mmp=<corpo>.<assinatura>, ECDSA P-256, vale 10 min).
// A chave pública vem de mercadomacro.com.br/api/publico/passe-chave.
// PASSE_MODO: 'registrar' (padrão: só anota quem chega sem passe válido, na tabela passe_registro do D1)
// ou 'bloquear' (recusa com 401). A vitrine pública marca os pedidos com mmp=vitrine e os robôs do GitHub
// com o cabeçalho X-MM-Robo; no modo registrar eles só aparecem no registro com esse nome.
// O registro não guarda IP nem o passe: só dia, rota, motivo e de onde veio (site/navegador ou script).
// =========================================================
const CHAVE_PASSE_URL = 'https://mercadomacro.com.br/api/publico/passe-chave';
let chavePasse = null, chavePasseEm = 0;
const passeDoPedido = new WeakMap(); // pedido -> motivo, devolvido no cabeçalho X-Passe
async function pegaChavePasse(env) {
  if (chavePasse && Date.now() - chavePasseEm < 3600000) return chavePasse;
  try {
    const r = await fetch(env.PASSE_CHAVE_URL || CHAVE_PASSE_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const jwk = await r.json();
    chavePasse = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    chavePasseEm = Date.now();
  } catch (e) {
    // sem a chave agora: usa a anterior, se houver
  }
  return chavePasse;
}
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
// devolve 'ok' ou o motivo da recusa
async function conferePasse(url, env) {
  const p = url.searchParams.get('mmp') || '';
  if (!p) return 'faltou';
  if (p === 'vitrine') return 'vitrine';
  const [corpo, ass] = p.split('.');
  if (!corpo || !ass || p.length > 400) return 'invalido';
  const chave = await pegaChavePasse(env);
  if (!chave) return 'sem-chave';
  try {
    const okAss = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave, deB64u(ass), new TextEncoder().encode(corpo));
    if (!okAss) return 'invalido';
    const dados = JSON.parse(new TextDecoder().decode(deB64u(corpo)));
    return dados.exp * 1000 > Date.now() ? 'ok' : 'vencido';
  } catch (e) {
    return 'invalido';
  }
}
let tabelaPasse = false;
function registraPasse(env, ctx, request, url, motivo) {
  if (!env.LOG) return;
  const robo = (request.headers.get('X-MM-Robo') || '').replace(/[^\w-]/g, '').slice(0, 20);
  const origem = (request.headers.get('Origin') || 'sem-origem').replace(/^https?:\/\//, '').slice(0, 60);
  // navegador manda Sec-Fetch-Mode; curl, Python e afins não
  const quem = robo ? 'robo:' + robo : origem + (request.headers.get('Sec-Fetch-Mode') ? ' navegador' : ' script');
  const rota = url.pathname + (url.searchParams.has('url') ? ' ' + (() => { try { return new URL(url.searchParams.get('url')).hostname; } catch (e) { return '?'; } })() : '');
  const dia = new Date().toISOString().slice(0, 10);
  ctx.waitUntil((async () => {
    try {
      if (!tabelaPasse) {
        await env.LOG.prepare('CREATE TABLE IF NOT EXISTS passe_registro (dia TEXT, rota TEXT, motivo TEXT, quem TEXT, n INTEGER, PRIMARY KEY (dia, rota, motivo, quem))').run();
        tabelaPasse = true;
      }
      await env.LOG.prepare('INSERT INTO passe_registro (dia, rota, motivo, quem, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (dia, rota, motivo, quem) DO UPDATE SET n = n + 1')
        .bind(dia, rota.slice(0, 80), motivo, quem.slice(0, 80)).run();
    } catch (e) { /* registro é só informativo */ }
  })());
}

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
  const serie = async (sym, range) => {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${iv}&range=${range}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: faixaTtl, cacheEverything: true }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const res = (await r.json())?.chart?.result?.[0];
    const ts = res?.timestamp || [], cl = res?.indicators?.quote?.[0]?.close || [];
    const t = [], c = [];
    for (let i = 0; i < ts.length; i++) if (cl[i] != null && isFinite(cl[i])) { t.push(ts[i]); c.push(+cl[i].toPrecision(7)); }
    return { t, c, off: res?.meta?.gmtoffset || 0 };
  };
  const entries = await Promise.all(symbols.map(async (sym) => {
    try {
      let s = await serie(sym, faixa);
      // 1D com o mercado fechado (fim de semana, feriado, antes da abertura): o Yahoo devolve o dia vazio.
      // Busca 5 dias de 5 em 5 min e fica só com o último pregão, no fuso da bolsa.
      if (faixa === '1d' && s.c.length < 2) {
        const w = await serie(sym, '5d');
        if (w.c.length >= 2) {
          const dia = (x) => Math.floor((x + w.off) / 86400), ult = dia(w.t[w.t.length - 1]);
          const i0 = w.t.findIndex((x) => dia(x) === ult);
          s = { t: w.t.slice(i0), c: w.c.slice(i0), off: w.off };
        }
      }
      const { t, c, off } = s;
      if (c.length < 2) throw new Error('sem histórico');
      return [sym, { t, c, off }];
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

// =========================================================
// /perps: QQQ, SPY e EWZ em contratos perpétuos de corretoras cripto (negociam 24/7, inclusive no fim de semana).
// Caixa "Fora do horário" da aba Mercado. APIs públicas, sem chave. Não é preço oficial:
// devolve o preço de cada corretora e o último preço oficial do ETF (Yahoo); a mediana e a faixa são feitas no site.
// Devolve { ts, ativos: { QQQ: { oficial: { v, t } | null, venues: [{ n, v, t }] }, ... } }. Cache de borda de 60 s.
// =========================================================
const PERPS = {
  QQQ: { bitget: 'QQQUSDT', okx: 'QQQ-USDT-SWAP', gate: 'QQQ_USDT', mexc: 'QQQSTOCK_USDT' },
  SPY: { bitget: 'SPYUSDT', okx: 'SPY-USDT-SWAP', gate: 'SPY_USDT', mexc: 'SPY_USDT' },
  EWZ: { bitget: 'EWZUSDT', okx: 'EWZ-USDT-SWAP', gate: 'EWZ_USDT', mexc: 'EWZ_USDT', hl: 'xyz:EWZ' }
};
async function handlePerps(ctx, cors) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/perps-v1');
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Cache': 'HIT', ...cors } });
  const pega = async (u, init = {}) => {
    const r = await fetch(u, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };
  const num = (x) => (x != null && x !== '' && isFinite(+x) && +x > 0 ? +x : null);
  const venue = async (n, f) => { try { const r = await f(); return r && r.v ? { n, ...r } : null; } catch (e) { return null; } };
  // Hyperliquid: um pedido traz todos os ativos do mercado "xyz" (só o EWZ é um ETF; os índices de lá não entram)
  const hl = pega('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":"metaAndAssetCtxs","dex":"xyz"}' }).catch(() => null);
  const ativos = {};
  await Promise.all(Object.entries(PERPS).map(async ([a, m]) => {
    const vs = await Promise.all([
      venue('Bitget', async () => { const d = (await pega(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${m.bitget}&productType=USDT-FUTURES`)).data?.[0]; return { v: num(d?.lastPr), t: +d?.ts || null }; }),
      venue('OKX', async () => { const d = (await pega(`https://www.okx.com/api/v5/market/ticker?instId=${m.okx}`)).data?.[0]; return { v: num(d?.last), t: +d?.ts || null }; }),
      venue('Gate', async () => { const d = (await pega(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${m.gate}`))?.[0]; return { v: num(d?.last), t: null }; }),
      venue('MEXC', async () => { let d = (await pega(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${m.mexc}`)).data; if (Array.isArray(d)) d = d[0]; return { v: num(d?.lastPrice), t: +d?.timestamp || null }; }),
      m.hl ? venue('Hyperliquid', async () => {
        const r = await hl; const i = r?.[0]?.universe?.findIndex((u) => u.name === m.hl);
        return i >= 0 ? { v: num(r[1]?.[i]?.markPx), t: null } : null;
      }) : null
    ]);
    // preço parado há mais de 15 min não entra
    const venues = vs.filter((x) => x && (!x.t || Date.now() - x.t < 900000));
    let oficial = null;
    try {
      const meta = (await pega(`https://query1.finance.yahoo.com/v8/finance/chart/${a}?interval=1d&range=1d`)).chart?.result?.[0]?.meta;
      if (num(meta?.regularMarketPrice)) oficial = { v: +meta.regularMarketPrice, t: meta.regularMarketTime || null };
    } catch (e) { /* sem o oficial: o site mostra "—" na variação */ }
    ativos[a] = { oficial, venues };
  }));
  const ok = Object.values(ativos).some((x) => x.venues.length);
  const body = JSON.stringify({ ts: Date.now(), ativos });
  if (ok) ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } })));
  return new Response(body, { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Cache': 'MISS', ...cors } });
}

// =========================================================
// /cripto: Panorama cripto da CoinMarketCap (dominância de BTC e ETH, valor total do mercado e índice Fear & Greed).
// A chave fica só no segredo CMC_API_KEY do Worker. O plano grátis tem 10 mil créditos por mês:
// cache de borda de 15 min (2 chamadas a cada 15 min, cerca de 6 mil por mês).
// Devolve { ts, global: { btc, eth, cap, capVar, vol } | null, fg: { v, txt, t } | null }.
// =========================================================
async function handleCripto(env, ctx, cors) {
  if (!env.CMC_API_KEY) return json({ error: 'CMC_API_KEY não configurada' }, 500, cors);
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/cripto-v1');
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT', ...cors } });
  const cmc = async (p) => {
    const r = await fetch('https://pro-api.coinmarketcap.com' + p, { headers: { 'X-CMC_PRO_API_KEY': env.CMC_API_KEY, Accept: 'application/json' } });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j?.status?.error_message) || 'HTTP ' + r.status);
    return j?.data;
  };
  const num = (x) => (x != null && isFinite(+x) ? +x : null);
  const [g, f] = await Promise.allSettled([cmc('/v1/global-metrics/quotes/latest'), cmc('/v3/fear-and-greed/latest')]);
  let global = null, fg = null;
  if (g.status === 'fulfilled' && g.value) {
    const q = g.value.quote?.USD || {};
    global = { btc: num(g.value.btc_dominance), eth: num(g.value.eth_dominance), cap: num(q.total_market_cap), capVar: num(q.total_market_cap_yesterday_percentage_change), vol: num(q.total_volume_24h) };
  }
  if (f.status === 'fulfilled' && f.value && num(f.value.value) != null) fg = { v: num(f.value.value), txt: f.value.value_classification || '', t: f.value.update_time || null };
  const erros = [g, f].filter((x) => x.status === 'rejected').map((x) => String(x.reason?.message || x.reason));
  const body = JSON.stringify({ ts: Date.now(), global, fg, ...(erros.length ? { erros } : {}) });
  const ok = global || fg;
  if (ok) ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${erros.length ? 300 : 900}` } })));
  return new Response(body, { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS', ...cors } });
}

// Derivativos da B3 pelo site público de cotações (atraso de cerca de 15 minutos).
// Pela rede da Cloudflare o https da B3 às vezes volta 526 (certificado); tenta também por http.
async function b3Derivativo(ativo) {
  const erros = [];
  for (const base of ['https://cotacao.b3.com.br', 'http://cotacao.b3.com.br']) {
    try {
      const r = await fetch(base + '/mds/api/v1/DerivativeQuotation/' + ativo, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json', Referer: 'https://www.b3.com.br/' },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) { erros.push(base.slice(0, 5) + ' HTTP ' + r.status); continue; }
      return await r.json();
    } catch (e) { erros.push(base.slice(0, 5) + ' ' + e.message); }
  }
  throw new Error('B3 ' + ativo + ': ' + erros.join('; '));
}
const b3Num = (x) => (x != null && isFinite(+x) ? +x : null);
// contratos futuros de um ativo: t = último negócio de hoje (null se não negociou), aj = ajuste do pregão anterior,
// oi = contratos em aberto, neg = contratos negociados hoje
function b3Futuros(j, ativo) {
  const re = new RegExp('^' + ativo + '[FGHJKMNQUVXZ]\\d\\d$');
  return (j?.Scty || []).filter((x) => x?.mkt?.cd === 'FUT' && re.test(x.symb || '')).map((x) => ({
    s: x.symb, venc: x.asset?.AsstSummry?.mtrtyCode || null,
    t: b3Num(x.SctyQtn?.curPrc), aj: b3Num(x.SctyQtn?.prvsDayAdjstmntPric),
    oi: b3Num(x.asset?.AsstSummry?.opnCtrcts) || 0, neg: b3Num(x.asset?.AsstSummry?.traddCtrctsQty) || 0,
  })).filter((x) => x.venc && (x.t != null || x.aj != null)).sort((a, b) => (a.venc < b.venc ? -1 : 1));
}
const jsonCache = (body, cors, hit) => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Cache': hit ? 'HIT' : 'MISS', ...cors } });

// curva completa de um ativo de juros: DI1 (DI x pré) ou DAP (cupom de IPCA, juro real)
async function handleDI(ctx, cors, ativo = 'DI1') {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/' + (ativo === 'DI1' ? 'di-v1' : ativo.toLowerCase() + '-v1'));
  const hit = await cache.match(cacheKey);
  if (hit) return jsonCache(hit.body, cors, true);
  let j;
  try { j = await b3Derivativo(ativo); } catch (e) { return json({ error: e.message }, 502, cors); }
  const c = b3Futuros(j, ativo);
  if (!c.length) return json({ error: 'B3 sem contratos' }, 502, cors);
  const body = JSON.stringify({ ts: Date.now(), b3: j?.Msg?.dtTm || null, c });
  ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } })));
  return jsonCache(body, cors, false);
}

// Futuros da B3 na Mesa: um contrato por ativo, o mais negociado hoje (sem negócios, o de mais contratos em aberto)
const FUT_B3 = [
  ['WDO', 'Dólar futuro', 1], ['WIN', 'Ibovespa futuro', 0], ['ISP', 'S&P 500 futuro', 2], ['BIT', 'Bitcoin futuro (R$)', 0],
  ['BGI', 'Boi gordo (R$/@)', 2], ['CCM', 'Milho (R$/saca)', 2], ['SJC', 'Soja (US$/saca)', 2], ['ICF', 'Café arábica (US$/saca)', 2], ['ETH', 'Etanol (R$/m³)', 1],
];
async function handleFutB3(ctx, cors) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/futb3-v1');
  const hit = await cache.match(cacheKey);
  if (hit) return jsonCache(hit.body, cors, true);
  let b3 = null;
  const res = await Promise.allSettled(FUT_B3.map(async ([a, nome, d]) => {
    const j = await b3Derivativo(a);
    if (!b3 && j?.Msg?.dtTm) b3 = j.Msg.dtTm;
    const c = b3Futuros(j, a);
    if (!c.length) throw new Error('sem contratos');
    const ref = c.reduce((m, x) => (x.neg > m.neg || (x.neg === m.neg && x.oi > m.oi) ? x : m), c[0]);
    return { a, nome, d, ...ref };
  }));
  const f = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!f.length) return json({ error: 'B3 sem resposta' }, 502, cors);
  const body = JSON.stringify({ ts: Date.now(), b3, f });
  ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } })));
  return jsonCache(body, cors, false);
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
    const resp = await comReserva(request, await rotas(request, env, ctx), ctx);
    const motivo = passeDoPedido.get(request);
    if (!motivo) return resp;
    // diz ao site se o passe foi aceito (ajuda a conferir a troca antes de ligar o bloqueio)
    const h = new Headers(resp.headers);
    h.set('X-Passe', motivo);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
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

    // ---- Passe de quem está logado (ver conferePasse): por enquanto só registra quem chega sem
    if (request.method === 'GET') {
      const motivo = await conferePasse(url, env);
      passeDoPedido.set(request, motivo);
      if (motivo !== 'ok') {
        registraPasse(env, ctx, request, url, motivo);
        if (env.PASSE_MODO === 'bloquear' && motivo !== 'vitrine' && motivo !== 'sem-chave') {
          return json({ error: 'Faça login no Mercado Macro para usar estes dados.' }, 401, cors);
        }
      }
    }

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
    // ENDPOINT: /perps  (QQQ, SPY e EWZ em perpétuos de corretoras cripto: caixa "Fora do horário")
    // =========================================================
    if (path === '/perps') {
      return handlePerps(ctx, cors);
    }

    // =========================================================
    // ENDPOINT: /cripto  (Panorama cripto da CoinMarketCap: dominância, valor total e Fear & Greed)
    // =========================================================
    if (path === '/cripto') {
      return handleCripto(env, ctx, cors);
    }

    // ENDPOINT: /di  (DI futuro da B3 para a curva da aba Mesa)
    if (path === '/di') {
      return handleDI(ctx, cors);
    }
    // ENDPOINT: /dap (cupom de IPCA, juro real, botão Real da curva) e /futb3 (bloco Futuros B3 da Mesa)
    if (path === '/dap') return handleDI(ctx, cors, 'DAP');
    if (path === '/futb3') return handleFutB3(ctx, cors);

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
      // Cópia nova vale 30 min; a última boa fica 7 dias e cobre quando o FRED falha
      // (antes o erro do FRED ficava 1 h no cache da borda e o card do Fed sumia).
      const chave = `${id}|${units}|${frequency}|${limit}`;
      const kNova = `https://cache.local/fred-v2/${chave}`, kUlt = `https://cache.local/fred-ult/${chave}`;
      const responder = (txt, extra) => new Response(txt, { headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800', ...extra } });
      const nova = await caches.default.match(kNova).catch(() => null);
      if (nova) return responder(await nova.text());
      let erro = '';
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          const response = await fetch(fredUrl, { signal: AbortSignal.timeout(10000), cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true } });
          const data = await response.json();
          if (!response.ok || data.error_message) { erro = data.error_message || 'HTTP ' + response.status; continue; }
          // só data e valor (o resto do JSON do FRED não é usado)
          const obs = (data.observations || []).filter((o) => o.value !== '.').map((o) => [o.date, +o.value]);
          const txt = JSON.stringify({ id, obs });
          ctx.waitUntil(Promise.all([
            caches.default.put(kNova, new Response(txt, { headers: { 'Cache-Control': 'public, max-age=1800' } })),
            caches.default.put(kUlt, new Response(txt, { headers: { 'Cache-Control': 'public, max-age=604800' } }))
          ]).catch(() => {}));
          return responder(txt);
        } catch (err) {
          erro = err.message;
        }
      }
      const ult = await caches.default.match(kUlt).catch(() => null);
      if (ult) return responder(await ult.text(), { 'Cache-Control': 'public, max-age=300', 'X-Antigo': '1' });
      // último recurso: o CSV público do gráfico do FRED (sem chave), só para a série crua
      if (units === 'lin' && !frequency) {
        try {
          const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(10000), cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true } });
          if (r.ok) {
            const obs = (await r.text()).trim().split('\n').slice(1).map((l) => l.split(','))
              .filter(([d, v]) => /^\d{4}-\d\d-\d\d$/.test(d) && v !== '.' && v !== '' && isFinite(+v))
              .map(([d, v]) => [d, +v]).reverse().slice(0, limit);
            if (obs.length) return responder(JSON.stringify({ id, obs }), { 'Cache-Control': 'public, max-age=600', 'X-Antigo': 'csv' });
          }
        } catch (err) { /* segue para o erro */ }
      }
      return json({ error: 'FRED falhou: ' + erro }, 502, cors);
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
