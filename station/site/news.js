// Cloudflare Worker - Market Pulse v5

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
  { name: 'MarketWatch', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', source: 'MarketWatch', weight: 7 },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance', weight: 6 },

  // ============ BRASIL ============
  { name: 'Valor', url: 'https://www.valor.com.br/rss', source: 'Valor Econômico', weight: 8 },
  { name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney', weight: 8 },
  { name: 'Investing BR', url: 'https://br.investing.com/rss/news.rss', source: 'Investing.com BR', weight: 7 },
  { name: 'ADVFN BR', url: 'https://br.advfn.com/common/news/feeds/paperbr/rss', source: 'ADVFN BR', weight: 6 },
  { name: 'Notícia Brasil', url: 'https://noticiabrasil.net.br/export/rss2/archive/index.xml', source: 'Notícia Brasil', weight: 5 },
  { name: 'BeInCrypto BR', url: 'https://br.beincrypto.com/feed/', source: 'BeInCrypto BR', weight: 5 },
  { name: 'Cointelegraph BR', url: 'https://cointelegraph.com.br/rss', source: 'Cointelegraph BR', weight: 5 },

  // ============ GOOGLE NEWS (TERMOS DE IMPACTO) ============
  { name: 'Google Copom', url: 'https://news.google.com/rss/search?q=Copom+Selic+impacto&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Payroll', url: 'https://news.google.com/rss/search?q=Payroll+EUA+impacto&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Inflação', url: 'https://news.google.com/rss/search?q=inflação+EUA+bolsa&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Tarifas', url: 'https://news.google.com/rss/search?q=tarifas+Trump+mercado&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Brasil', url: 'https://news.google.com/rss/search?q=mercado+financeiro+brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 },
  { name: 'Google Cripto', url: 'https://news.google.com/rss/search?q=bitcoin+cripto+mercado&hl=pt-BR&gl=BR&ceid=BR:pt-419', source: 'Google News', weight: 5 }
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

// Tradução das manchetes internacionais (endpoint público do Google Tradutor; se falhar, fica o original)
const INT_SOURCES = new Set(['Bloomberg', 'Financial Juice', 'ForexLive', 'Zero Hedge', 'FXStreet', 'FX Markets', 'ING Think', 'CNBC', 'MarketWatch', 'Yahoo Finance']);
async function translateBatch(titles) {
  const q = titles.join('\n');
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  const out = (data[0] || []).map((seg) => seg[0]).join('').split('\n').map((s) => s.trim());
  if (out.length !== titles.length) throw new Error('tradução desalinhada');
  return out;
}
async function translateField(lista, campo, destino, maxLotes) {
  const lotes = [];
  let atual = [], tam = 0;
  for (const n of lista) {
    const len = n[campo].length + 1;
    if (tam + len > 1800 && atual.length) { lotes.push(atual); atual = []; tam = 0; }
    atual.push(n); tam += len;
  }
  if (atual.length) lotes.push(atual);
  await Promise.all(lotes.slice(0, maxLotes).map(async (lote) => {
    try {
      const trad = await translateBatch(lote.map((n) => n[campo].replace(/\n+/g, ' ')));
      lote.forEach((n, i) => { if (trad[i]) n[destino] = trad[i]; });
    } catch (e) { console.error('Tradução de ' + campo + ' falhou:', e.message); }
  }));
}
async function translateInternational(noticias, max = 80) {
  const alvo = noticias.filter((n) => INT_SOURCES.has(n.fonte)).slice(0, max);
  // trechos (prévia do texto) das 40 mais recentes: no máximo 7 lotes, para caber no limite de 50 subrequisições
  await translateField(alvo.filter((n) => n.trecho).slice(0, 40), 'trecho', 'trechoPt', 7);
  // lotes de até ~1800 caracteres (limite da URL)
  const lotes = [];
  let atual = [], tam = 0;
  for (const n of alvo) {
    if (tam + n.titulo.length > 1800 && atual.length) { lotes.push(atual); atual = []; tam = 0; }
    atual.push(n); tam += n.titulo.length + 1;
  }
  if (atual.length) lotes.push(atual);
  await Promise.all(lotes.slice(0, 6).map(async (lote) => {
    try {
      const trad = await translateBatch(lote.map((n) => n.titulo.replace(/\n/g, ' ')));
      lote.forEach((n, i) => { if (trad[i]) { n.tituloOriginal = n.titulo; n.titulo = trad[i]; n.traduzido = true; } });
    } catch (e) {
      console.error('Tradução falhou:', e.message);
    }
  }));
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

async function fetchAndProcessFeeds() {
  const resultados = await Promise.all(FEEDS.map(f => fetchOneFeed(f)));
  // o mesmo link pode vir de mais de um feed (os do Google News se sobrepõem)
  const vistos = new Set();
  const todas = resultados.flat().filter((n) => !vistos.has(n.link) && vistos.add(n.link));
  todas.sort((a, b) => b.finalScore - a.finalScore);
  const top = todas.slice(0, 250);
  // tradução não aumenta a nota: as palavras-chave já foram avaliadas no original
  await translateInternational(top.slice().sort((a, b) => b.data - a.data));
  return top;
}

// Tradução do texto completo, sob demanda (só de notícias que estão no cache do worker)
// POST evita o limite de tamanho da URL; se o Google recusar (429 nos IPs da Cloudflare), tenta um segundo endpoint
async function gtx(texto) {
  const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
    body: 'q=' + encodeURIComponent(texto)
  });
  if (!r.ok) throw new Error('gtx HTTP ' + r.status);
  const data = await r.json();
  const out = (data[0] || []).map((seg) => seg[0]).join('');
  if (!out) throw new Error('gtx vazio');
  return out;
}
async function dictChrome(texto) {
  const r = await fetch('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=pt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
    body: 'q=' + encodeURIComponent(texto)
  });
  if (!r.ok) throw new Error('dict HTTP ' + r.status);
  const data = await r.json();
  // formatos possíveis: [["texto","en"]], ["texto"] ou {sentences:[{trans}]}
  let out = '';
  if (Array.isArray(data)) out = Array.isArray(data[0]) ? data[0][0] : data[0];
  else if (data && data.sentences) out = data.sentences.map((x) => x.trans || '').join('');
  if (!out) throw new Error('dict vazio');
  return out;
}
async function translateChunk(texto) {
  try { return await gtx(texto); }
  catch (e1) {
    try { return await dictChrome(texto); }
    catch (e2) { throw new Error(e1.message + ' / ' + e2.message); }
  }
}
async function translateLong(texto) {
  const paras = texto.split('\n\n');
  const blocos = [];
  let atual = '';
  // parágrafo maior que 1200 caracteres é quebrado em frases, não cortado
  const partes = [];
  for (const p of paras) {
    if (p.length <= 1200) { partes.push(p); continue; }
    let buf = '';
    for (const f of p.match(/[^.!?]+[.!?]*\s*/g) || [p]) {
      if ((buf + f).length > 1200 && buf) { partes.push(buf.trim()); buf = ''; }
      buf += f.length > 1200 ? f.slice(0, 1200) : f;
    }
    if (buf.trim()) partes.push(buf.trim());
  }
  for (const parte of partes) {
    if ((atual + '\n' + parte).length > 1200 && atual) { blocos.push(atual); atual = ''; }
    atual = atual ? atual + '\n' + parte : parte;
  }
  if (atual) blocos.push(atual);
  // no máximo 8 blocos (até 2 chamadas cada = 16 subrequisições)
  const out = [];
  let ok = 0, ultimoErro = '';
  for (const b of blocos.slice(0, 8)) {
    try { out.push(await translateChunk(b)); ok++; }
    catch (e) { ultimoErro = e.message; out.push(b); } // bloco que falhou fica no original
  }
  if (!ok) throw new Error(ultimoErro || 'sem resposta');
  return {
    texto: out.join('\n').split('\n').map((x) => x.trim()).filter(Boolean).join('\n\n'),
    parcial: ok < blocos.length // mais de 8 blocos também conta como parcial
  };
}
async function handleTraduzir(reqUrl, cache, cacheKey, ctx, cors) {
  const link = reqUrl.searchParams.get('u') || '';
  // só a tradução bem-sucedida pode ficar em cache; erro nunca (senão o navegador guarda o 502 por um dia)
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, 'Cache-Control': status === 200 && !obj.parcial ? 'public, max-age=86400' : 'no-store' } });
  if (!link) return json({ error: 'Parâmetro u ausente' }, 400);
  const trKey = new Request('https://cache.local/tr3/' + idDe(link), { method: 'GET' });
  const hit = await cache.match(trKey);
  if (hit) return json(await hit.json());
  // a lista fica 60 s no cache; depois disso busca de novo (senão "Traduzir" falha minutos depois de abrir a página)
  const news = await cache.match(cacheKey);
  let lista;
  if (news) lista = await news.json();
  else {
    lista = await fetchAndProcessFeeds();
    if (lista.length) ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(lista), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } })));
  }
  const item = lista.find((n) => n.link === link);
  if (!item || !item.resumo) return json({ error: 'Notícia sem texto para traduzir' }, 404);
  try {
    const out = await translateLong(item.resumo);
    if (!out.parcial) ctx.waitUntil(cache.put(trKey, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })));
    return json(out);
  } catch (e) {
    // devolve o texto original para o navegador tentar traduzir por conta própria
    return json({ error: 'Tradução falhou: ' + e.message, original: item.resumo }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=60'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const cache = caches.default;
    const cacheKey = new Request('https://cache.local/news', { method: 'GET' });

    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === '/traduzir') return handleTraduzir(reqUrl, cache, cacheKey, ctx, corsHeaders);

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const headers = new Headers(cachedResponse.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Cache', 'HIT');
      return new Response(cachedResponse.body, { status: 200, headers });
    }

    try {
      const noticias = await fetchAndProcessFeeds();
      const response = new Response(JSON.stringify(noticias), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
      });
      if (noticias.length) ctx.waitUntil(cache.put(cacheKey, response.clone())); // lista vazia (todos os feeds falharam) não fica em cache
      const finalHeaders = new Headers(response.headers);
      finalHeaders.set('Access-Control-Allow-Origin', '*');
      finalHeaders.set('X-Cache', 'MISS');
      return new Response(response.body, { status: 200, headers: finalHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Falha ao buscar notícias' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'no-store' }
      });
    }
  }
};