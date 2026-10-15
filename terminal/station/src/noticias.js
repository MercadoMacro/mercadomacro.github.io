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
  { name: 'Dukascopy', url: 'https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance/', source: 'Dukascopy', weight: 6 },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', weight: 7 },

  // ============ BRASIL ============
  { name: 'Valor', url: 'https://www.valor.com.br/rss', source: 'Valor Econômico', weight: 8 },
  { name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney', weight: 8 },
  { name: 'Investing BR', url: 'https://br.investing.com/rss/news.rss', source: 'Investing.com BR', weight: 7 },
  { name: 'ADVFN BR', url: 'https://br.advfn.com/common/news/feeds/paperbr/rss', source: 'ADVFN BR', weight: 6 },
  { name: 'Notícia Brasil', url: 'https://noticiabrasil.net.br/export/rss2/archive/index.xml', source: 'Notícia Brasil', weight: 5 },
  { name: 'BeInCrypto BR', url: 'https://br.beincrypto.com/feed/', source: 'BeInCrypto BR', weight: 5 },
  { name: 'Cointelegraph BR', url: 'https://cointelegraph.com.br/rss', source: 'Cointelegraph BR', weight: 5 },

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

async function fetchOneFeed(feed) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: controller.signal,
      cf: { cacheTtl: 90, cacheEverything: true }
    });

    if (!response.ok) { clearTimeout(timeout); return []; }
    // o tempo limite também vale para o corpo: um feed travado não segura a resposta inteira
    const xmlText = await response.text().finally(() => clearTimeout(timeout));
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

      // Google News: "Manchete - Veículo" -> separa o veículo
      let veiculo = '';
      if (feed.source === 'Google News') {
        const gm = titulo.match(/^(.*\S)\s+[-–—]\s+([^-–—]{2,60})$/);
        if (gm) { titulo = gm[1]; veiculo = gm[2].trim(); }
      }

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
// Lista pronta para o navegador, guardada 2 minutos no cache da Cloudflare
export async function noticiasCache(ctx) {
  const chave = new Request(CHAVE_LISTA);
  const hit = await caches.default.match(chave);
  if (hit) return { lista: await hit.json(), cache: 'HIT', falharam: hit.headers.get('X-Falharam') || '' };
  const { todas, falharam } = await coletarNoticias(ctx);
  if (todas.length) {
    const r = new Response(JSON.stringify(todas), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120', 'X-Falharam': falharam.join(', ') } });
    ctx.waitUntil(caches.default.put(chave, r));
  }
  return { lista: todas, cache: 'MISS', falharam: falharam.join(', ') };
}
