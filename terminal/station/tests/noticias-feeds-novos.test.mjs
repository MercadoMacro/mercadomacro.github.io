import test from 'node:test';
import assert from 'node:assert/strict';
import { decodificaFeed, coletarNoticias } from '../src/noticias.js';

const latin1 = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

test('feed em ISO-8859-1 sai com os acentos certos; UTF-8 segue igual', () => {
  const xml = '<?xml version="1.0" encoding="ISO-8859-1" ?><title>Governo Lula vai prorrogar desoneração; Itaú lucra \x93mais\x94</title>';
  assert.match(decodificaFeed(latin1(xml), 'text/xml'), /desoneração; Itaú lucra “mais”/);
  const utf = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><title>Ação sobe</title>');
  assert.match(decodificaFeed(utf, 'application/xml; charset=utf-8'), /Ação sobe/);
});

test('Folha, WSJ e CoinDesk entram na lista com fonte, data e título', async () => {
  const agora = Date.now(), rfc = (ms) => new Date(agora - ms).toUTCString();
  const brt = new Date(agora - 3 * 3600e3 - 600e3);
  const p2 = (n) => String(n).padStart(2, '0');
  const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const folhaData = `${p2(brt.getUTCDate())} ${meses[brt.getUTCMonth()]} ${brt.getUTCFullYear()} ${p2(brt.getUTCHours())}:${p2(brt.getUTCMinutes())}:00 -0300`;
  const corpos = {
    'feeds.folha.uol.com.br': [latin1(`<?xml version="1.0" encoding="ISO-8859-1" ?><rss version="0.91"><channel><title>Folha</title><item><title>Lucro do Magazine Luiza cai 34,6% no 3º trimestre</title><link>https://www1.folha.uol.com.br/mercado/2026/11/lucro.shtml</link><pubDate>${folhaData}</pubDate><description>Resultado veio abaixo do esperado.</description></item></channel></rss>`), 'text/xml'],
    'feeds.content.dowjones.io': [new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><rss><channel><item><title>Investors Brush Off Nvidia&#x2019;s Spy Scandal</title><link>https://www.wsj.com/finance/stocks/x</link><pubDate>${rfc(1800e3)}</pubDate></item></channel></rss>`), 'application/xml; charset=utf-8'],
    'www.coindesk.com': [new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><rss><channel><item><title><![CDATA[Bitcoin holds $90K as traders eye Fed]]></title><link>https://www.coindesk.com/markets/2026/11/09/x</link><pubDate>${rfc(3600e3)}</pubDate></item></channel></rss>`), 'application/xml'],
  };
  const fetchOrig = globalThis.fetch, cachesOrig = globalThis.caches;
  globalThis.fetch = async (url) => {
    const c = corpos[new URL(String(url)).host];
    return c ? new Response(c[0], { headers: { 'Content-Type': c[1] } }) : new Response('', { status: 404 });
  };
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  try {
    const r = await coletarNoticias({ waitUntil() {} });
    const lista = r.todas || r.lista || r;
    const por = (f) => lista.filter((n) => n.fonte === f);
    assert.equal(por('Folha')[0]?.titulo, 'Lucro do Magazine Luiza cai 34,6% no 3º trimestre');
    assert.ok(Math.abs(por('Folha')[0].data - (agora - 600e3)) < 61e3);
    assert.equal(por('WSJ')[0]?.titulo, 'Investors Brush Off Nvidia’s Spy Scandal');
    assert.equal(por('CoinDesk')[0]?.titulo, 'Bitcoin holds $90K as traders eye Fed');
  } finally { globalThis.fetch = fetchOrig; globalThis.caches = cachesOrig; }
});
