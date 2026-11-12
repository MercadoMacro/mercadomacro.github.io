/* Notícias do site: lê os feeds RSS aqui mesmo (antes vinha só do worker news.cota-cotacao10, de outra conta).
   Feeds, notas de impacto e leitura do texto copiados de site/news.js. A tradução é feita no navegador (app.js),
   porque o Google recusa pedidos de tradução vindos de servidores. */
const FEEDS = [
  // ============ INTERNACIONAIS PREMIUM ============
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', source: 'Bloomberg', weight: 10 },
  { name: 'Financial Juice', url: 'https://www.financialjuice.com/feed.ashx?xy=rss', source: 'Financial Juice', weight: 9 },
  { name: 'ForexLive', url: 'https://www.forexlive.com/feed', source: 'ForexLive', weight: 9 },
  { name: 'Zero Hedge', url: 'https://cms.zerohedge.com/fullrss2.xml', source: 'Zero Hedge', weight: 8 },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet', weight: 7 },
  { name: 'FX Markets', url: 'https://www.fx-markets.com/feeds/rss', source: 'FX Markets', weight: 7 },
  { name: 'ING Think', url: 'https://rss.app/feeds/9lbwhwyNi8qv0X5h.xml', source: 'ING Think', weight: 7 },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', weight: 7 },
  // 09/11/2026, sugestões do Severino testadas: WSJ Markets e CoinDesk respondem; Proactive Investors, Nasdaq e
  // Seeking Alpha barram leitura automática (403 / "Just a moment...") e ficaram de fora
  { name: 'WSJ Markets', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', source: 'WSJ', weight: 9 },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss', source: 'CoinDesk', weight: 6 },
  // RTTNews (10/11/2026, achado do Severino): é quem escreve as notícias de mercado do Nasdaq.com e tem RSS aberto
  // (o feed do Nasdaq barra leitura automática). Últimas, economia e câmbio; mesma fonte "RTTNews" na lista
  { name: 'RTTNews Últimas', url: 'https://www.rttnews.com/RSS/breakingnews.xml', source: 'RTTNews', weight: 7 },
  { name: 'RTTNews Economia', url: 'https://www.rttnews.com/RSS/EconomicNews.xml', source: 'RTTNews', weight: 7 },
  { name: 'RTTNews Câmbio', url: 'https://www.rttnews.com/RSS/ForexTopStory.xml', source: 'RTTNews', weight: 6 },
  // Barchart (10/11/2026, sugestão do Severino): mercado financeiro e commodities (milho, soja, café, boi)
  { name: 'Barchart Financeiro', url: 'https://www.barchart.com/news/rss/financials', source: 'Barchart', weight: 6 },
  { name: 'Barchart Commodities', url: 'https://www.barchart.com/news/rss/commodities', source: 'Barchart', weight: 6 },
  // em teste (09/11/2026, pedido do Severino): do GitHub vieram barrados; lidos daqui com identificação honesta.
  // Se seguirem barrados, a fonte fica com 0 na lista e sai na próxima revisão (nada de driblar o bloqueio)
  { name: 'Proactive Investors', url: 'https://www.proactiveinvestors.com.au/rss.xml', source: 'Proactive Investors', weight: 5, honesto: true },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/tag/wall-st-breakfast.xml', source: 'Seeking Alpha', weight: 6, honesto: true },

  // ============ BRASIL ============
  { name: 'Valor', url: 'https://www.valor.com.br/rss', source: 'Valor Econômico', weight: 8 },
  { name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney', weight: 8 },
  // Folha Mercado (09/11/2026): o feed vem em ISO-8859-1; lerFeed() converte para os acentos saírem certos
  { name: 'Folha Mercado', url: 'https://feeds.folha.uol.com.br/mercado/rss091.xml', source: 'Folha', weight: 8 },
  { name: 'Investing BR', url: 'https://br.investing.com/rss/news.rss', source: 'Investing.com BR', weight: 7 },
  { name: 'ADVFN BR', url: 'https://br.advfn.com/common/news/feeds/paperbr/rss', source: 'ADVFN BR', weight: 6 },
  { name: 'Notícia Brasil', url: 'https://noticiabrasil.net.br/export/rss2/archive/index.xml', source: 'Notícia Brasil', weight: 5 },
  { name: 'BeInCrypto BR', url: 'https://br.beincrypto.com/feed/', source: 'BeInCrypto BR', weight: 5 },
  { name: 'Cointelegraph BR', url: 'https://cointelegraph.com.br/rss', source: 'Cointelegraph BR', weight: 5 },
  { name: 'Money Times', url: 'https://www.moneytimes.com.br/feed/', source: 'Money Times', weight: 7 },
  { name: 'InvestNews', url: 'https://investnews.com.br/feed/', source: 'InvestNews', weight: 6 },
  { name: 'Valor Investe', url: 'https://pox.globo.com/rss/valorinveste/', source: 'Valor Investe', weight: 6 },
  { name: 'Bloomberg Línea', url: 'https://www.bloomberglinea.com.br/arc/outboundfeeds/rss.xml', source: 'Bloomberg Línea', weight: 7 },
  { name: 'Suno', url: 'https://www.suno.com.br/noticias/feed/', source: 'Suno', weight: 6 },
  // Invezz em português (07/11/2026, sugestão do Severino): mercado internacional já em português
  { name: 'Invezz Economia', url: 'https://invezz.com/pt/noticias/economia/feed/', source: 'Invezz', weight: 5 },
  { name: 'Invezz Ações', url: 'https://invezz.com/pt/noticias/mercado-de-acoes/feed/', source: 'Invezz', weight: 5 },
  { name: 'Invezz Commodities', url: 'https://invezz.com/pt/noticias/commodities/feed/', source: 'Invezz', weight: 5 },
  // Notícias Agrícolas (07/11/2026, sugestão do Severino): o site não tem RSS aberto; lê o widget público
  // de notícias (o mesmo que eles oferecem para colar em sites) e converte as manchetes em itens (widget: 'na')
  { name: 'Notícias Agrícolas', url: 'https://www.noticiasagricolas.com.br/widgets/noticias?subsecao=163,14,80,84,32,213,218,164,117,118,214&qtd=30&output=js', source: 'Notícias Agrícolas', weight: 5, widget: 'na' },
  // ============ POLÍTICA (o site só mostra se a pessoa ligar "Política" nas Notícias) ============
  { name: 'O Antagonista', url: 'https://oantagonista.com.br/feed/', source: 'O Antagonista', weight: 4, so: /oantagonista\.com\.br\/(brasil|politica)\// }, // o feed traz muita variedade (ladooa, curiosidades em economia)
  { name: 'Poder360', url: 'https://www.poder360.com.br/feed/', source: 'Poder360', weight: 4 },
  { name: 'G1 Política', url: 'https://g1.globo.com/rss/g1/politica/', source: 'G1 Política', weight: 4 },
  { name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml', source: 'Agência Brasil', weight: 4 },
  { name: 'BMC News', url: 'https://bmcnews.com.br/feed/', source: 'BMC News', weight: 5 },

  // ============ GOOGLE NEWS (TERMOS DE IMPACTO) ============
  { name: 'Google Copom', url: 'https://news.google.com/rss/search?q=Copom+Selic+impacto+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Payroll', url: 'https://news.google.com/rss/search?q=Payroll+EUA+impacto+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Inflação', url: 'https://news.google.com/rss/search?q=inflação+EUA+bolsa+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Tarifas', url: 'https://news.google.com/rss/search?q=tarifas+Trump+mercado+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Brasil', url: 'https://news.google.com/rss/search?q=mercado+financeiro+brasil+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Cripto', url: 'https://news.google.com/rss/search?q=bitcoin+cripto+mercado+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 }
];

const DICIONARIO = {
  CRITICO: ['payroll', 'nfp', 'cpi', 'fomc', 'fed', 'copom', 'selic', 'pib', 'gdp', 'juros', 'inflação', 'decisão de juros', 'ata do copom', 'balanço', 'taxa de juros', 'reunião do copom', 'ipca', 'inpc'],
  ALTO: ['powell', 'lagarde', 'williams', 'tarifas', 'trump', 'guerra', 'brent', 'petróleo', 'hawkish', 'dovish', 'sanções', 'fusão', 'aquisição', 'petrobras', 'ibovespa', 'dólar', 'bitcoin', 'cripto', 'etf'],
  MEDIO: ['emprego', 'desemprego', 'varejo', 'pmi', 'confiança do consumidor', 'euro', 'bolsa', 'ações', 'commodities', 'minério', 'soja', 'boi', 'halving', 'altcoin']
};
// Termos em inglês (as fontes internacionais chegam em inglês e a nota é calculada antes da tradução)
DICIONARIO.CRITICO.push('rate decision', 'nonfarm', 'non-farm', 'payrolls', 'jobs report', 'inflation', 'rate cut', 'rate hike');
DICIONARIO.ALTO.push('tariff', 'tariffs', 'oil', 'crude', 'opec', 'war', 'sanctions', 'merger', 'acquisition', 'treasury', 'yields', 'gold', 'recession');
DICIONARIO.MEDIO.push('jobs', 'unemployment', 'retail sales', 'stocks', 'earnings', 'housing', 'consumer confidence');

// Casa a palavra inteira (com acentos): "fed" não pega "Federal", "euro" não pega "Europa", "boi" não pega "boicote"
const termRegex = (t) => new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
const DICT_RE = Object.fromEntries(Object.entries(DICIONARIO).map(([k, arr]) => [k, arr.map(termRegex)]));
const has = (lista, txt) => lista.some((re) => re.test(txt));
// "Vale" empresa: com maiúscula e sem ser "vale a pena", "vale-refeição", "Vale do Silício"...
const VALE_RE = /(?<![\p{L}])Vale(?![\p{L}-])(?! (a pena|do |dos |da |o |ressaltar|lembrar|destacar))/u;

// entidades com nome comuns em feeds WordPress (content:encoded)
const ENT = { rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', bull: '•', middot: '·', euro: '€', copy: '©', reg: '®', trade: '™', deg: '°' };
const cp = (n) => (n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ''); // código inválido não derruba o feed inteiro
function decodeEntities(t) {
  return t
    .replace(/&#(\d+);/g, (_, n) => cp(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => cp(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] || m)
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// ---- Texto da notícia (o que o próprio feed entrega: description / content:encoded) ----
const LIXO_RE = /^(the post .+ appeared first on|leia (mais|também)|continue (reading|lendo)|read more|saiba mais|veja (também|mais)|siga o|inscreva-se|assine|clique aqui|this article was originally|para ler a matéria|o post .+ apareceu primeiro)/i;
function htmlToText(html) {
  if (!html) return '';
  let t = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // alguns feeds mandam o HTML "escapado" (&lt;p&gt;)
  if (!/<[a-z]/i.test(t) && /&lt;[a-z]/i.test(t)) t = decodeEntities(t);
  t = t
    .replace(/<(script|style|figure|figcaption|iframe|noscript|table|form|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|section|article|ul|ol)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t).replace(/ /g, ' ');
  const paras = t.split(/\n\s*\n|\n/)
    .map((x) => x.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter((x) => x.length > 1 && !LIXO_RE.test(x) && !/^•\s*$/.test(x));
  // junta linhas soltas e limita o tamanho no fim de um parágrafo
  const out = [];
  let total = 0;
  for (const para of paras) {
    if (total + para.length > 6000) break;
    out.push(para);
    total += para.length;
  }
  return out.join('\n\n');
}
function extractBody(itemContent, titulo) {
  const pick = (re) => { const m = itemContent.match(re); return m ? htmlToText(m[1]) : ''; };
  const encoded = pick(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
  const desc = pick(/<description[^>]*>([\s\S]*?)<\/description>/i);
  const content = pick(/<content[^>]*>([\s\S]*?)<\/content>/i) || pick(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
  let body = [encoded, content, desc].sort((a, b) => b.length - a.length)[0] || '';
  const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // descarta texto que só repete a manchete (Google News manda só o link)
  if (!body || norm(body).startsWith(norm(titulo)) && body.length < titulo.length + 80) return '';
  return body;
}
function trechoDe(texto, max = 260) {
  if (!texto) return '';
  const p = texto.split('\n\n')[0];
  if (p.length <= max) return p;
  return p.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function extractImage(itemContent) {
  let m = itemContent.match(/<media:content[^>]*url="([^"]+)"/i);
  if (m) return m[1];
  m = itemContent.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
  if (m) return m[1];
  m = itemContent.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image[^"]*"/i);
  if (m) return m[1];
  m = itemContent.match(/<img[^>]*src="([^"]+)"/i);
  if (m) return m[1];
  return null;
}

// datas de RSS: CDATA, nomes em português ("Seg, 06 Out 2026") e fusos como BRT/BRST
const MES_PT = { jan: 'Jan', fev: 'Feb', mar: 'Mar', abr: 'Apr', mai: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', set: 'Sep', out: 'Oct', nov: 'Nov', dez: 'Dec' };
function parseDate(raw) {
  let t = String(raw).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
  let d = Date.parse(t);
  if (!isNaN(d)) return d;
  t = t.replace(/^[^\d,]+,\s*/, '') // dia da semana
    .replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?/i, (m, k) => MES_PT[k.toLowerCase()])
    .replace(/\b(BRT|BRST)\b/, (m) => (m === 'BRT' ? '-0300' : '-0200'));
  d = Date.parse(t);
  return isNaN(d) ? null : d;
}

// Widget do Notícias Agrícolas: document.write("<div class=na_dia>06/11/2026</div> <li> 18:38 | <a href=...> Título <i>(Reuters)</i></a></li>...")
// vira itens no formato RSS (horário de Brasília); o veículo entre parênteses vai em <category>
// As notícias do dia de hoje vêm SEM o cabeçalho de data (só os dias anteriores têm "na_dia", visto em 09/11/2026):
// antes do primeiro cabeçalho vale a data de hoje em Brasília; um horário mais de 10 min à frente do relógio é de ontem.
export function diaNaHoje(hh, mm, agora = Date.now()) {
  const brt = new Date(agora - 3 * 3600 * 1000);
  let d = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  if (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hh + 3, +mm) > agora + 10 * 60 * 1000) d = new Date(+d - 86400000);
  return d.toISOString().slice(0, 10);
}
export function widgetNaParaRss(js, agora = Date.now()) {
  const m = String(js).match(/document\.write\(("(?:[^"\\]|\\.)*")\)/);
  if (!m) return '';
  let h;
  try { h = JSON.parse(m[1]); } catch (e) { return ''; }
  let dia = null, out = '';
  const re = /<div class="na_dia">(\d{2})\/(\d{2})\/(\d{4})<\/div>|<li>\s*(\d{1,2}):(\d{2})\s*\|\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let x;
  while ((x = re.exec(h)) !== null) {
    if (x[1]) { dia = x[3] + '-' + x[2] + '-' + x[1]; continue; }
    const d = dia || diaNaHoje(x[4], x[5], agora);
    const link = x[6].replace(/\?utm_[^"]*$/, '').replace(/&/g, '&amp;');
    const veic = (x[7].match(/<i>\(([^)]{1,60})\)<\/i>/) || [])[1] || '';
    const titulo = x[7].replace(/<i>[\s\S]*?<\/i>/g, '').replace(/<[^>]+>/g, '').trim();
    out += `<item><title>${titulo}</title><link>${link}</link><pubDate>${d}T${x[4].padStart(2, '0')}:${x[5]}:00-03:00</pubDate>${veic ? `<category>${veic}</category>` : ''}</item>`;
  }
  return out;
}

// Feeds em ISO-8859-1/Windows-1252 (ex.: Folha) viram texto com os acentos certos; o resto segue em UTF-8
const CP1252 = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d,
  0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
export function decodificaFeed(bytes, contentType = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const cabeca = String.fromCharCode(...u8.subarray(0, 200));
  const cs = ((String(contentType).match(/charset=([\w-]+)/i) || cabeca.match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8').toLowerCase();
  if (!/^(iso-8859-1|latin1|windows-1252|cp1252)$/.test(cs)) return new TextDecoder('utf-8').decode(u8);
  let out = '';
  for (let i = 0; i < u8.length; i += 8192) out += String.fromCharCode(...Array.from(u8.subarray(i, i + 8192), (b) => CP1252[b] || b));
  return out;
}
async function lerFeed(response) {
  return decodificaFeed(new Uint8Array(await response.arrayBuffer()), response.headers.get('Content-Type') || '');
}

async function fetchOneFeed(feed, fresco) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(feed.url, {
      // feeds em teste (honesto): o site se identifica como Mercado Macro, sem se passar por navegador
      headers: { 'User-Agent': feed.honesto ? 'MercadoMacro/1.0 (+https://mercadomacro.com.br)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: controller.signal,
      // fresco: lê direto da fonte, sem a cópia de 90 s guardada na borda (notícias em tempo real, 07/11/2026)
      ...(fresco ? { cache: 'no-store' } : { cf: { cacheTtl: 90, cacheEverything: true } })
    });

    if (!response.ok) { clearTimeout(timeout); return []; }
    // o tempo limite também vale para o corpo: um feed travado não segura a resposta inteira
    const bruto = await lerFeed(response).finally(() => clearTimeout(timeout));
    const xmlText = feed.widget === 'na' ? widgetNaParaRss(bruto) : bruto;
    const noticias = [];
    const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[2];

      let titulo = '';
      const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      if (titleMatch) {
        titulo = decodeEntities(titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').replace(/<[^>]+>/g, ''))
          .replace(/\s+/g, ' ').trim();
      }

      let link = '';
      const linkMatch = itemContent.match(/<link[^>]*href="(.*?)"[^>]*>/) || itemContent.match(/<link>(.*?)<\/link>/);
      if (linkMatch) link = decodeEntities(linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim());
      if (!/^https?:\/\//i.test(link)) link = ''; // só http(s)

      let pubDate = null;
      const dateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || itemContent.match(/<published>([\s\S]*?)<\/published>/)
        || itemContent.match(/<updated>([\s\S]*?)<\/updated>/) || itemContent.match(/<dc:date>([\s\S]*?)<\/dc:date>/);
      if (dateMatch) pubDate = parseDate(dateMatch[1]);

      // sem data confiável, a notícia velha apareceria como "agora": descarta
      if (!titulo || !link || !pubDate || pubDate > Date.now() + 10 * 60 * 1000) continue;
      // feeds que misturam variedades: só ficam as seções que interessam (feed.so)
      if (feed.so && !feed.so.test(link)) continue;

      // Google News: "Manchete - Veículo" -> separa o veículo
      let veiculo = '';
      if (feed.source === 'Google News') {
        const gm = titulo.match(/^(.*\S)\s+[-–—]\s+([^-–—]{2,60})$/);
        if (gm) { titulo = gm[1]; veiculo = gm[2].trim(); }
      }
      if (feed.widget) veiculo = decodeEntities((itemContent.match(/<category>([^<]*)<\/category>/) || [])[1] || '');

      const img0 = extractImage(itemContent);
      const imagem = img0 && /^https?:\/\//i.test(img0) ? decodeEntities(img0) : null;
      const tituloLower = titulo.toLowerCase();
      let impactScore = 0;
      let nivel = 'NORMAL';

      if (has(DICT_RE.CRITICO, titulo)) { impactScore = 10; nivel = 'CRITICO'; }
      else if (has(DICT_RE.ALTO, titulo) || VALE_RE.test(titulo)) { impactScore = 7; nivel = 'ALTO'; }
      else if (has(DICT_RE.MEDIO, titulo)) { impactScore = 4; nivel = 'MEDIO'; }

      const finalScore = (impactScore * 10) + feed.weight;

      const tags = [];
      const tem = (...ts) => ts.some((t) => termRegex(t).test(titulo));
      if (tem('fed', 'fomc', 'payroll', 'powell', 'treasury', 'treasuries')) tags.push('EUA');
      if (tem('copom', 'selic', 'ipca', 'galípolo', 'haddad')) tags.push('Brasil');
      if (tem('petróleo', 'brent', 'opep', 'oil', 'crude', 'opec')) tags.push('Energia');
      if (tem('petrobras', 'ibovespa', 'b3') || VALE_RE.test(titulo)) tags.push('B3');
      if (tem('dólar', 'euro', 'câmbio', 'dollar')) tags.push('Moedas');
      if (tem('bitcoin', 'cripto', 'criptomoedas', 'ethereum', 'crypto')) tags.push('Cripto');

      const resumo = extractBody(itemContent, titulo);
      const palavras = resumo ? resumo.split(/\s+/).length : 0;

      noticias.push({
        id: idDe(link),
        titulo, link,
        resumo, palavras,
        trecho: trechoDe(resumo),
        fonte: feed.source,
        veiculo,
        data: pubDate,
        impactScore, finalScore, nivel,
        tags: [...new Set(tags)],
        imagem
      });
    }
    return noticias;
  } catch (err) {
    console.error(`Erro em ${feed.name}:`, err.message);
    return [];
  }
}

// id curto a partir do link inteiro (o começo do link é igual para todas as notícias do mesmo site)
function idDe(link) {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < link.length; i++) { const c = link.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 31) + c) | 0; }
  return 'n' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const MAX_IDADE = 48 * 3600 * 1000;
const POR_FONTE = 30;
const cacheFeed = new Map(); // última leitura boa de cada feed neste processo
const CHAVE_ULTIMOS = 'https://cache.local/feeds-ultimos-v1';

// Junta todos os feeds: tira repetidas e velhas, no máximo 30 por fonte (as mais novas), mais recentes primeiro.
// Antes eram as 250 de maior nota de todas as fontes juntas, e uma fonte inteira podia sumir da lista.
// Feed que falhar usa a última leitura boa (guardada num único item do cache, para não gastar pedidos).
// Financial Juice publica manchete por manchete: o NewsRelay lê este feed direto a cada rodada (15 s),
// sem esperar o servidor de notícias (que guarda cópias por até 2 a 3 minutos)
export async function noticiasRapidas() {
  const fj = FEEDS.find((f) => f.source === 'Financial Juice');
  return fj ? fetchOneFeed(fj, true) : [];
}

export async function coletarNoticias(ctx) {
  const res = await Promise.all(FEEDS.map((f) => fetchOneFeed(f)));
  const falharam = [];
  let ultimos = null;
  if (res.some((r) => !r.length)) {
    try { const r = await caches.default.match(new Request(CHAVE_ULTIMOS)); if (r) ultimos = await r.json(); } catch (e) { /* sem cache */ }
  }
  const guardar = {};
  FEEDS.forEach((f, i) => {
    if (res[i].length) { cacheFeed.set(f.url, res[i]); guardar[f.url] = res[i]; return; }
    falharam.push(f.name);
    res[i] = cacheFeed.get(f.url) || (ultimos && ultimos[f.url]) || [];
    if (res[i].length) guardar[f.url] = res[i];
  });
  if (ctx) ctx.waitUntil(caches.default.put(new Request(CHAVE_ULTIMOS), new Response(JSON.stringify(guardar), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=43200' } })).catch(() => {}));
  const agora = Date.now();
  const vistos = new Set(), porFonte = {};
  const todas = res.flat()
    .filter((n) => agora - n.data < MAX_IDADE && !vistos.has(n.link) && vistos.add(n.link))
    .sort((a, b) => b.data - a.data)
    .filter((n) => (porFonte[n.fonte] = (porFonte[n.fonte] || 0) + 1) <= POR_FONTE);
  return { todas, falharam };
}

const CHAVE_LISTA = 'https://cache.local/noticias-v1';
export async function noticiasSoCache() {
  try { const r = await caches.default.match(new Request(CHAVE_LISTA)); return r ? await r.json() : null; } catch (e) { return null; }
}
// Lista pronta para o navegador. Vale como fresca por 2 minutos.
// rapida (12/11/2026, só o /api/noticias usa): com a lista vencida, devolve na hora a que está guardada (até 6 h)
// e renova em segundo plano. Antes, com poucas visitas, quase todo acesso caía na lista vencida e esperava a
// leitura de todos os feeds; a Mesa ficava em "Carregando notícias…". Os outros usos (Jade, canal do Telegram,
// abertura, histórico) continuam esperando a lista fresca, e o relógio de 15 min mantém a guardada em dia.
const FRESCA_MS = 120000;
let renovando = null;
async function renovarLista(chave, ctx) {
  const { todas, falharam } = await coletarNoticias(ctx);
  if (todas.length) {
    await caches.default.put(chave, new Response(JSON.stringify(todas), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600', 'X-Gerado': String(Date.now()), 'X-Falharam': falharam.join(', ') } }));
  }
  return { lista: todas, cache: 'MISS', falharam: falharam.join(', ') };
}
export async function noticiasCache(ctx, { rapida = false } = {}) {
  const chave = new Request(CHAVE_LISTA);
  const hit = await caches.default.match(chave);
  if (hit) {
    const idade = Date.now() - (Number(hit.headers.get('X-Gerado')) || 0);
    if (idade < FRESCA_MS || rapida) {
      const lista = await hit.json(), falharam = hit.headers.get('X-Falharam') || '';
      if (idade < FRESCA_MS) return { lista, cache: 'HIT', falharam };
      if (!renovando) { renovando = renovarLista(chave, ctx).catch(() => null).finally(() => { renovando = null; }); ctx?.waitUntil?.(renovando); }
      return { lista, cache: 'STALE', falharam };
    }
  }
  return renovarLista(chave, ctx);
}
