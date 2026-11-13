// Ações e ETFs americanos (13/11/2026): catálogo e cotações ao vivo pela API pública da FXOpen (TickTrader, sem chave),
// com o Yahoo de reserva. Preços da corretora (CFD), não os oficiais da bolsa.
// Para trocar de vez para o Yahoo (por exemplo, se os termos de uso da FXOpen não permitirem exibir), mude FONTE_EUA.
export const FONTE_EUA = 'fxopen'; // 'fxopen' | 'yahoo'
const FX = 'https://ttlivewebapi.fxopen.net/api/v2/public';
const SIMBOLO = /^[A-Z0-9.\-]{1,12}$/;
export const MAX_EUA = 120;
const ETF = /\b(ETF|ETN|Fund|Trust|iShares|SPDR|Vanguard|Invesco|ProShares|Direxion|ARK |Global X|VanEck|Schwab|WisdomTree|Select Sector)\b/i;
const UA = 'Mozilla/5.0 (compatible; TraderDashboard/1.0)';

const resposta = (obj, cors, ttl, extra = {}) => new Response(JSON.stringify(obj), {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}`, ...cors, ...extra },
});
async function doCache(chave, ttl, gerar) {
  const cache = caches.default, req = new Request('https://cache.local/' + chave);
  const hit = await cache.match(req);
  if (hit) return hit.json();
  const v = await gerar();
  if (v != null) await cache.put(req, new Response(JSON.stringify(v), { headers: { 'Cache-Control': `public, max-age=${ttl}` } }));
  return v;
}

// tipo pelo grupo e pela descrição: 'etfa' (ETF alavancado), 'etf' ou 'acao'
export function catalogoDe(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((x) => x && x.StatusGroupId === 'US Stocks' && typeof x.Symbol === 'string' && !x.Symbol.endsWith('_L') && SIMBOLO.test(x.Symbol) && x.IsTradeAllowed !== false)
    .map((x) => {
      const desc = String(x.Description || ''), nome = String(x.ExtendedName || desc.replace(/\s*\([^)]*\)\s*$/, '') || x.Symbol).slice(0, 80);
      const t = x.SecurityName === 'Leveraged ETFs' ? 'etfa' : ETF.test(desc + ' ' + nome) ? 'etf' : 'acao';
      return { s: x.Symbol, n: nome, t };
    })
    .sort((a, b) => a.s.localeCompare(b.s));
}

// /eua/catalogo: [{ s, n, t }] (guardado por 24 horas)
export async function handleEuaCatalogo(cors) {
  try {
    const l = await doCache('eua-catalogo-v1', 86400, async () => {
      const r = await fetch(FX + '/symbol', { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const c = catalogoDe(await r.json());
      return c.length ? c : null;
    });
    if (!l) throw new Error('catálogo vazio');
    return resposta(l, cors, 3600);
  } catch (e) {
    return resposta({ error: 'Catálogo indisponível: ' + e.message }, cors, 60, {});
  }
}

// fechamento anterior pelo gráfico diário (barra de hoje, se existir, fica de fora); guardado por 6 horas
async function anterior(sym) {
  const hoje = new Date().toISOString().slice(0, 10);
  return doCache(`eua-ant-v1-${sym}-${hoje}`, 21600, async () => {
    const r = await fetch(`${FX}/quotehistory/${encodeURIComponent(sym)}/D1/bars/bid?timestamp=${Date.now()}&count=-3`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!r.ok) return null;
    const b = ((await r.json()).Bars || []).filter((x) => x && Number.isFinite(x.Close)).sort((a, c) => a.Timestamp - c.Timestamp);
    if (!b.length) return null;
    const ult = b[b.length - 1], deHoje = new Date(ult.Timestamp).toISOString().slice(0, 10) === hoje;
    const ref = deHoje ? b[b.length - 2] : ult;
    return ref ? { c: ref.Close } : null;
  });
}

async function viaFxopen(syms) {
  const r = await fetch(`${FX}/tick/${syms.map(encodeURIComponent).join('%20')}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!r.ok) throw new Error('FXOpen HTTP ' + r.status);
  const ticks = await r.json(), out = {};
  const ants = await Promise.all(syms.map((s) => anterior(s).catch(() => null)));
  const antDe = Object.fromEntries(syms.map((s, i) => [s, ants[i]]));
  for (const t of Array.isArray(ticks) ? ticks : []) {
    const bid = t?.BestBid?.Price, ask = t?.BestAsk?.Price;
    if (!Number.isFinite(bid) && !Number.isFinite(ask)) continue;
    const v = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : (bid ?? ask), a = antDe[t.Symbol]?.c;
    out[t.Symbol] = { v: +v.toFixed(4), c: Number.isFinite(a) && a > 0 ? +((v / a - 1) * 100).toFixed(3) : null, ts: t.Timestamp || Date.now(), bid, ask, f: 'fxopen', ind: t.TickType !== 'Normal' };
  }
  return out;
}
async function viaYahoo(syms) {
  const out = {};
  await Promise.all(syms.map(async (s) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=5d`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 30, cacheEverything: true } });
      const m = (await r.json())?.chart?.result?.[0]?.meta; if (!m || !Number.isFinite(m.regularMarketPrice)) return;
      const a = m.chartPreviousClose ?? m.previousClose;
      out[s] = { v: m.regularMarketPrice, c: Number.isFinite(a) && a > 0 ? +((m.regularMarketPrice / a - 1) * 100).toFixed(3) : null, ts: (m.regularMarketTime || 0) * 1000 || Date.now(), f: 'yahoo' };
    } catch (e) { /* fica sem esse */ }
  }));
  return out;
}

// /eua/cotacoes?s=AAPL,MSFT,...  →  { AAPL: { v, c, ts, bid, ask, f }, ... }  (guardado por 5 segundos)
export async function handleEuaCotacoes(url, ctx, cors) {
  const syms = [...new Set((url.searchParams.get('s') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].sort();
  if (!syms.length) return resposta({ error: 'Parâmetro s ausente' }, cors, 0);
  if (syms.length > MAX_EUA) return resposta({ error: `Máximo de ${MAX_EUA} símbolos` }, cors, 0);
  if (!syms.every((s) => SIMBOLO.test(s))) return resposta({ error: 'Símbolo inválido' }, cors, 0);
  const chave = new Request('https://cache.local/eua-cot-v1?s=' + syms.join(','));
  const hit = await caches.default.match(chave);
  if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors, 'X-Cache': 'HIT' } });
  let out = {};
  if (FONTE_EUA === 'fxopen') { try { out = await viaFxopen(syms); } catch (e) { out = {}; } }
  const faltam = syms.filter((s) => !out[s]);
  if (faltam.length) Object.assign(out, await viaYahoo(faltam));
  const body = JSON.stringify(out);
  if (Object.keys(out).length) ctx.waitUntil(caches.default.put(chave, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=5' } })));
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=5', ...cors, 'X-Cache': 'MISS' } });
}
