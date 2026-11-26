/* Ícone de cada fonte de notícia (25/11/2026, lista de fontes do Dante): o servidor busca o favicon no serviço do
   Google uma vez e guarda 30 dias. O navegador de quem lê só fala com o mercadomacro.com.br (nada vai ao Google
   a partir dele) e a regra de scripts (CSP) não muda. Só os domínios da lista abaixo são atendidos. */
export const DOMINIOS_FONTE = new Set(['bloomberg.com', 'financialjuice.com', 'forexlive.com', 'zerohedge.com', 'fxstreet.com', 'fx-markets.com',
  'think.ing.com', 'cnbc.com', 'wsj.com', 'coindesk.com', 'proactiveinvestors.com', 'reuters.com', 'rttnews.com', 'barchart.com', 'seekingalpha.com',
  'valor.globo.com', 'infomoney.com.br', 'investing.com', 'br.advfn.com', 'br.beincrypto.com', 'moneytimes.com.br', 'investnews.com.br',
  'valorinveste.globo.com', 'bloomberglinea.com.br', 'suno.com.br', 'bmcnews.com.br', 'noticiasagricolas.com.br', 'folha.uol.com.br',
  'news.google.com', 'invezz.com', 'br.cointelegraph.com', 'oantagonista.com.br', 'poder360.com.br', 'g1.globo.com', 'agenciabrasil.ebc.com.br']);

export async function iconeFonte(req, ctx, p) {
  const dominio = decodeURIComponent(p.slice('/fonte-icone/'.length)).replace(/\.png$/, '').toLowerCase();
  if (!DOMINIOS_FONTE.has(dominio)) return new Response('Fonte desconhecida.', { status: 404 });
  const chave = new Request('https://cache.mercadomacro.com.br/fonte-icone/' + dominio);
  const hit = await caches.default.match(chave);
  if (hit) return hit;
  let r;
  try { r = await fetch('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dominio) + '&sz=64', { cf: { cacheTtl: 2592000 } }); } catch (e) { r = null; }
  if (!r || !r.ok) return new Response('Ícone indisponível.', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const corpo = await r.arrayBuffer();
  const out = new Response(corpo, { headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/png', 'Cache-Control': 'public, max-age=2592000, immutable' } });
  ctx.waitUntil(caches.default.put(chave, out.clone()));
  return out;
}
