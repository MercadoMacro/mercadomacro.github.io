import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetNaParaRss } from '../src/noticias.js';

const html = '<style>x</style><div id="na_main"><ul> <div class="na_dia">06/11/2026</div> <li> 18:38 | <a href="https://www.noticiasagricolas.com.br/noticias/politica-economia/1-a.html?utm_source=widgets&utm_medium=widget_noticias" target="_blank"> Dólar fecha em alta &amp; juros <i>(Reuters)</i> </a> </li> <div class="na_dia">05/11/2026</div> <li> 9:05 | <a href="https://www.noticiasagricolas.com.br/videos/tempo/2-b.html?utm_source=widgets" target="_blank"> Frente fria </a> </li></ul></div>';
const js = 'document.write(' + JSON.stringify(html) + ');';

test('widget do Notícias Agrícolas vira itens com data de Brasília, sem utm e com o veículo', () => {
  const x = widgetNaParaRss(js);
  const itens = x.match(/<item>[\s\S]*?<\/item>/g);
  assert.equal(itens.length, 2);
  assert.match(itens[0], /<title>Dólar fecha em alta &amp; juros<\/title>/);
  assert.match(itens[0], /<link>https:\/\/www\.noticiasagricolas\.com\.br\/noticias\/politica-economia\/1-a\.html<\/link>/);
  assert.match(itens[0], /<pubDate>2026-11-06T18:38:00-03:00<\/pubDate><category>Reuters<\/category>/);
  assert.match(itens[1], /<pubDate>2026-11-05T09:05:00-03:00<\/pubDate><\/item>/);
  assert.equal(Date.parse('2026-11-06T18:38:00-03:00'), Date.UTC(2026, 10, 6, 21, 38));
});

test('resposta fora do formato não inventa notícia', () => {
  assert.equal(widgetNaParaRss('<html>erro</html>'), '');
});

test('notícias de hoje vêm sem cabeçalho de data e ficam com a data de Brasília', () => {
  const agora = Date.UTC(2026, 10, 9, 22, 30); // 19:30 em Brasília, 09/11
  const hoje = 'document.write(' + JSON.stringify('<ul> <li> 18:48 | <a href="https://www.noticiasagricolas.com.br/noticias/a.html?utm_source=widgets" target="_blank"> Hoje <i>(Reuters)</i> </a> </li> <li> 21:00 | <a href="https://www.noticiasagricolas.com.br/noticias/b.html"> Ontem à noite </a> </li> <div class="na_dia">06/11/2026</div> <li> 18:38 | <a href="https://www.noticiasagricolas.com.br/noticias/c.html"> Sexta </a> </li></ul>') + ');';
  const it = widgetNaParaRss(hoje, agora).match(/<pubDate>[^<]*<\/pubDate>/g);
  assert.deepEqual(it, ['<pubDate>2026-11-09T18:48:00-03:00</pubDate>', '<pubDate>2026-11-08T21:00:00-03:00</pubDate>', '<pubDate>2026-11-06T18:38:00-03:00</pubDate>']);
  // logo depois da meia-noite em Brasília, o das 21:00 ainda é de ontem
  assert.match(widgetNaParaRss(hoje, Date.UTC(2026, 10, 10, 3, 5)), /2026-11-09T21:00:00-03:00/);
});
