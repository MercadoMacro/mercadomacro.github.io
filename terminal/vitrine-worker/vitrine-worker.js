// Worker da vitrine (página de entrada do mercadomacro.com.br), na segunda conta da Cloudflare
// (autumn-thunder-c98b.cota-cotacao10.workers.dev). Os visitantes sem login usam este worker,
// e assim não gastam o limite da conta principal (shrill-meadow-89c1).
//
// Só faz duas coisas, e só para o site:
//   /quotes?symbols=^BVSP,BRL=X,...   cotações do Yahoo em lote, guardadas por 1 minuto
//   /bcb?c=432&n=1                    últimos valores de uma série do Banco Central (SGS)
// Não é um proxy aberto: outros sites e outros endereços são recusados.
// Este arquivo é colado à mão no painel da Cloudflare (Workers > autumn-thunder-c98b > Edit code).

const ORIGENS = [
  /^https:\/\/(www\.)?mercadomacro\.com\.br$/,
  /^https:\/\/station\.danilo-nillo\.workers\.dev$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const SERIES_BCB = new Set(['432', '433', '13522', '4389', '1', '21619', '11', '189', '226']);
const UA = 'Mozilla/5.0 (compatible; MercadoMacro/1.0)';
const MAX_SIMBOLOS = 40;
const SIMBOLO = /^[A-Za-z0-9^.=\-]{1,20}$/;

const cors = (o) => ({ 'Access-Control-Allow-Origin': o, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' });
const json = (obj, status, h = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origem = request.headers.get('Origin') || '';
    if (!ORIGENS.some((re) => re.test(origem))) return json({ error: 'Origem não permitida' }, 403);
    const c = cors(origem);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });
    if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405, c);
    if (url.pathname === '/quotes') return cotacoes(url, ctx, c);
    if (url.pathname === '/bcb') return bcb(url, ctx, c);
    return json({ error: 'Não encontrado' }, 404, c);
  },
};

// Mesmo formato do /quotes da conta principal: { "<símbolo>": <JSON do Yahoo chart> | { error } }
async function cotacoes(url, ctx, c) {
  const simbolos = [...new Set((url.searchParams.get('symbols') || '').split(',').map((s) => s.trim()).filter(Boolean))].sort();
  if (!simbolos.length || simbolos.length > MAX_SIMBOLOS || !simbolos.every((s) => SIMBOLO.test(s))) return json({ error: 'Símbolos inválidos' }, 400, c);
  const cache = caches.default;
  const chave = new Request('https://cache.local/quotes?symbols=' + encodeURIComponent(simbolos.join(',')));
  const guardada = await cache.match(chave);
  if (guardada) return new Response(guardada.body, { status: 200, headers: { ...Object.fromEntries(guardada.headers), ...c, 'X-Cache': 'HIT' } });
  const itens = await Promise.all(simbolos.map(async (s) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=5m&range=1d`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 60, cacheEverything: true } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return [s, await r.json()];
    } catch (e) { return [s, { error: String(e.message || e) }]; }
  }));
  const ok = itens.filter(([, v]) => !v.error).length;
  const ttl = ok === itens.length ? 60 : 15;
  const corpo = JSON.stringify(Object.fromEntries(itens));
  if (ok) ctx.waitUntil(cache.put(chave, new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } })));
  return new Response(corpo, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}`, 'X-Cache': 'MISS', ...c } });
}

// Banco Central: guarda a última resposta boa por 14 dias e usa quando o SGS falha
async function bcb(url, ctx, c) {
  const serie = url.searchParams.get('c') || '';
  const n = Math.min(Math.max(parseInt(url.searchParams.get('n') || '1', 10) || 1, 1), 20);
  if (!SERIES_BCB.has(serie)) return json({ error: 'Série não liberada' }, 400, c);
  const cache = caches.default;
  const chave = new Request(`https://cache.local/bcb/${serie}/${n}`);
  try {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/${n}?formato=json`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000), cf: { cacheTtl: 1800, cacheEverything: true } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) throw new Error('sem dados');
    const corpo = JSON.stringify(d);
    ctx.waitUntil(cache.put(chave, new Response(corpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1209600' } })));
    return new Response(corpo, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900', ...c } });
  } catch (e) {
    const g = await cache.match(chave);
    if (g) return new Response(g.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120', 'X-Reserva': '1', ...c } });
    return json({ error: 'Banco Central falhou: ' + e.message }, 502, c);
  }
}
