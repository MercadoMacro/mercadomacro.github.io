/* Aba Notícias, 17/11/2026 (pedido do Dante: deixar a página "mais inteligente e agradável"):
   1) Notícia com preço: em cada assunto, quanto o ativo citado se mexeu desde a notícia ("USD/BRL +2,05% desde 14h30").
   2) Linha do tempo do assunto: no leitor, a sequência do dia das notícias sobre o mesmo ativo ou empresa.
   3) "Do seu interesse": os ativos da Watchlist puxam uma faixa no topo com os assuntos sobre eles.
   4) Modo lista: alterna Cards / Lista (lista é o padrão no celular), sem cartões com metade vazia.
   Tudo por cima do app.js (renderNewsView e o evento mm:leitor); para voltar, tirar este arquivo e o noticias4.css. */
(() => {
  const view = document.getElementById('news-view');
  if (!view || typeof renderNewsView !== 'function') return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- ativos citados nas manchetes ---------- */
  const EUA = [
    ['NVDA', 'Nvidia', /nvidia/i], ['AAPL', 'Apple', /\bapple\b/i], ['MSFT', 'Microsoft', /microsoft/i], ['TSLA', 'Tesla', /tesla/i],
    ['AMZN', 'Amazon', /amazon/i], ['GOOGL', 'Alphabet', /alphabet|\bgoogle\b/i], ['META', 'Meta', /Meta Platforms|Zuckerberg|\bFacebook\b/],
    ['NFLX', 'Netflix', /netflix/i], ['AMD', 'AMD', /\bAMD\b/], ['INTC', 'Intel', /\bintel\b/i], ['TSM', 'TSMC', /\bTSMC\b/i],
  ];
  const MACRO = [
    ['^BVSP', 'Ibovespa', /ibovespa|\bibov\b|bolsa brasileira/i],
    ['BRL=X', 'USD/BRL', /d[óo]lar.{0,40}(R\$|real|reais)|(R\$|real|reais).{0,40}d[óo]lar|d[óo]lar (sobe|cai|dispara|recua|fecha|abre|avança|opera)|c[âa]mbio/i, true],
    ['DX-Y.NYB', 'Dólar global (DXY)', /\bDXY\b|\bdollar\b|greenback/i],
    ['^IXIC', 'Nasdaq', /nasdaq/i],
    ['^GSPC', 'S&P 500', /S&P(?:\s?500)?(?![\w])(?! Global)|wall street|bolsas? (de|em) nova york/i],
    ['BZ=F', 'Petróleo Brent', /petr[óo]leo|\bbrent\b|\bwti\b|\bcrude\b|\boil\b|\bopep\b|\bopec\b/i],
    ['GC=F', 'Ouro', /\bouro\b|\bgold\b/i],
    ['BTC-USD', 'Bitcoin', /bitcoin|\bbtc\b|cripto|crypto/i],
    ['^TNX', 'Treasury 10 anos', /treasury (yields?|notes?|bonds?)|treasuries|t[íi]tulos do tesouro americano|\byields?\b|rendimento dos treasuries/i],
    ['EURUSD=X', 'EUR/USD', /\beuro\b|EUR\/USD/i],
  ];
  const b3 = () => (typeof STOCK_NAMES === 'object' ? Object.keys(STOCK_NAMES) : []);
  const textos = (n) => [n.titulo, n.tituloOriginal, ...(n.related || []).flatMap((r) => [r.titulo, r.tituloOriginal])].filter(Boolean).join(' \n ');
  // o ativo de um assunto: empresa da B3, empresa americana e, por último, o mercado (dólar, bolsa, petróleo...)
  // todos os ativos citados num texto, em ordem de prioridade
  function candidatos(n, t) {
    const out = [];
    for (const sym of b3()) { try { const re = stockNewsRegex(sym); if (re.test(t)) out.push({ sym: sym + '.SA', rot: sym, re }); } catch (e) { /* segue */ } }
    for (const [sym, rot, re] of EUA) if (re.test(t)) out.push({ sym, rot, re });
    for (const [sym, rot, re, br] of MACRO) {
      if (!re.test(t)) continue;
      if (sym === 'DX-Y.NYB' && /R\$|real|reais/i.test(t)) { out.push({ sym: 'BRL=X', rot: 'USD/BRL', re: MACRO[1][2] }); continue; }
      if (br && !n._br && !/R\$|real|reais/i.test(t)) continue;
      out.push({ sym, rot, re, bp: sym === '^TNX' });
    }
    return out;
  }
  // o ativo de um assunto: o que aparece primeiro na manchete principal ("Bitcoin cai com Nvidia" = Bitcoin);
  // sem nada na manchete, o primeiro citado pelas outras fontes (empresa antes do mercado)
  function ativoDe(n) {
    const tit = [n.titulo, n.tituloOriginal].filter(Boolean);
    const naManchete = candidatos(n, tit.join(' \n ')).map((a) => ({ a, i: Math.min(...tit.map((x) => { const m = x.match(a.re); return m ? m.index : 1e9; })) }));
    if (naManchete.length) return naManchete.sort((p, q) => p.i - q.i)[0].a;
    return candidatos(n, textos(n))[0] || null;
  }

  /* ---------- preços (Yahoo pelo worker de dados, de 15 em 15 min, 5 dias) ---------- */
  const series = new Map(); // sym -> { ts, p: Promise<{t:[], c:[], agora}> }
  function serie(sym) {
    const s = series.get(sym);
    if (s && Date.now() - s.ts < 5 * 60e3) return s.p;
    // 17/11/2026: com o pré e o pós-mercado, a notícia das 7h sobre a Nvidia já mostra o quanto a ação andou antes da abertura
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=15m&range=5d&includePrePost=true`;
    const p = fetchT(`${CORS_PROXY}/?url=${encodeURIComponent(url)}`, {}, 15000).then((r) => r.ok ? r.json() : null).then((j) => {
      const r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r || !r.timestamp) return null;
      const c = r.indicators?.quote?.[0]?.close || [], t = [], cl = [];
      r.timestamp.forEach((x, i) => { if (c[i] != null) { t.push(x * 1000); cl.push(c[i]); } });
      return t.length ? { t, c: cl, agora: cl[cl.length - 1] ?? r.meta?.regularMarketPrice } : null; // último negócio, inclusive fora do pregão
    }).catch(() => null);
    series.set(sym, { ts: Date.now(), p });
    return p;
  }
  const horaBR = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(':', 'h');
  const diaBR = (t) => new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
  // variação desde a hora da notícia; null quando não dá para medir (notícia mais velha que a série ou sem negócio depois)
  async function variacao(a, quando) {
    const s = await serie(a.sym);
    if (!s || quando < s.t[0] || quando > s.t[s.t.length - 1]) return null;
    let i = 0; while (i + 1 < s.t.length && s.t[i + 1] <= quando) i++;
    const p0 = s.c[i], p1 = s.agora;
    if (!p0 || !p1) return null;
    return a.bp ? { bp: Math.round((p1 - p0) * 100) } : { pct: (p1 / p0 - 1) * 100 };
  }
  function chip(a, v, quando) {
    const desde = (diaBR(quando) === diaBR(Date.now()) ? '' : diaBR(quando) === diaBR(Date.now() - 864e5) ? 'ontem ' : new Date(quando).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + horaBR(quando);
    let num, cls;
    if (v.bp != null) { num = (v.bp > 0 ? '+' : '') + v.bp + ' bp'; cls = v.bp > 0 ? 'up' : v.bp < 0 ? 'dn' : ''; }
    else {
      const x = Math.abs(v.pct) < 0.005 ? 0 : v.pct;
      num = (x > 0 ? '+' : '') + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
      cls = x > 0 ? 'up' : x < 0 ? 'dn' : '';
    }
    // 25/11/2026: "Ouro +1,00% desde 16h33" num título "O ouro cai…" parecia contradição; agora diz que é depois da
    // notícia, e sem movimento (0,00%, mercado fechado) o selo não aparece
    if (!cls) return '';
    return `<i class="fas fa-chart-line" aria-hidden="true"></i> ${esc(a.rot)} <b class="${cls}">${num}</b> após ${desde}`;
  }
  async function precos() {
    const leads = window.__newsLeads || [];
    const cards = [...view.querySelectorAll('.nc-card[data-id]')];
    await Promise.all(cards.map(async (card) => {
      const n = leads.find((x) => x.id === card.dataset.id);
      if (!n || card.querySelector('.nw4-px')) return;
      const a = ativoDe(n);
      if (!a) return;
      // a hora do assunto é a da primeira fonte que noticiou
      const quando = Math.min(n.data, ...(n.related || []).map((r) => r.data));
      const v = await variacao(a, quando);
      if (!v || !card.isConnected || card.querySelector('.nw4-px')) return;
      const html = chip(a, v, quando);
      if (!html) return;
      const el = document.createElement('div');
      el.className = 'nw4-px';
      el.title = 'Quanto o ativo citado se mexeu desde a primeira notícia sobre o assunto (cotação com atraso de até 15 min)';
      el.innerHTML = html;
      card.querySelector('.nc-title')?.after(el);
    }));
  }

  /* ---------- "Do seu interesse": ativos da Watchlist ---------- */
  function meusAtivos() {
    const out = new Set();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^trader_watchlists_v1:/.test(k)) continue;
        const d = JSON.parse(localStorage.getItem(k) || '{}');
        (d.lists || []).forEach((l) => (l.items || []).forEach((x) => x && x.s && out.add(String(x.s).toUpperCase().replace(/\.SA$/, ''))));
      }
    } catch (e) { /* sem lista */ }
    return [...out];
  }
  function regraDe(s) {
    if (/^[A-Z]{4}\d{1,2}$/.test(s)) return { rot: s, re: stockNewsRegex(s) };
    const e = EUA.find((x) => x[0] === s); if (e) return { rot: e[1], re: e[2] };
    if (/^BTC/.test(s)) return { rot: 'Bitcoin', re: /bitcoin|\bbtc\b/i };
    if (/^ETH/.test(s)) return { rot: 'Ethereum', re: /ethereum|\beth\b/i };
    if (/^[A-Z]{2,5}$/.test(s)) return { rot: s, re: new RegExp(`\\b${s}\\b`) };
    return null;
  }
  function faixa() {
    view.querySelector('.nw4-int')?.remove();
    const busca = document.getElementById('news-search')?.value.trim();
    if (busca || (typeof newsAsset !== 'undefined' && newsAsset !== 'all')) return;
    const regras = meusAtivos().map(regraDe).filter(Boolean);
    if (!regras.length) return;
    const leads = window.__newsLeads || [];
    const achados = [];
    for (const n of leads) {
      const t = textos(n);
      const r = regras.find((g) => g.re.test(t));
      if (r) achados.push({ n, r });
      if (achados.length >= 3) break;
    }
    if (!achados.length) return;
    const box = document.createElement('section');
    box.className = 'nw4-int';
    box.innerHTML = `<header><b><i class="fas fa-crosshairs" aria-hidden="true"></i> Do seu interesse</b><span>${achados.length} ${achados.length > 1 ? 'assuntos' : 'assunto'} sobre o que você acompanha na Watchlist</span></header>`
      + `<div class="nw4-int-l">${achados.map(({ n, r }) => `<button type="button" data-id="${esc(n.id)}"><span class="nw4-int-a">${esc(r.rot)}</span><span class="nw4-int-t">${esc(n.titulo)}</span><small>${esc(typeof timeAgoShort === 'function' ? timeAgoShort(n.data) : '')}</small></button>`).join('')}</div>`;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]'); if (!b) return;
      const card = view.querySelector(`.nc-card[data-id="${CSS.escape(b.dataset.id)}"]`);
      if (card) card.click();
    });
    view.prepend(box);
  }

  /* ---------- modo Cards / Lista ---------- */
  const CHAVE = 'mm_news_modo';
  let modo;
  try { modo = localStorage.getItem(CHAVE); } catch (e) { /* sem memória */ }
  if (modo !== 'lista' && modo !== 'cards') modo = window.matchMedia('(max-width: 700px)').matches ? 'lista' : 'cards';
  const barra = document.querySelector('#news-panel .news-toolbar');
  const sel = document.createElement('div');
  sel.className = 'nw4-modo'; sel.setAttribute('role', 'group'); sel.setAttribute('aria-label', 'Como mostrar as notícias');
  sel.innerHTML = '<button type="button" data-m="cards" title="Cartões"><i class="fas fa-th-large" aria-hidden="true"></i><span>Cards</span></button>'
    + '<button type="button" data-m="lista" title="Lista mais leve, boa para o celular"><i class="fas fa-list" aria-hidden="true"></i><span>Lista</span></button>';
  const aplica = () => {
    view.classList.toggle('nw4-lista', modo === 'lista');
    sel.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === modo)));
  };
  sel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-m]'); if (!b) return;
    modo = b.dataset.m; try { localStorage.setItem(CHAVE, modo); } catch (er) { /* segue */ }
    aplica();
  });
  const info = document.getElementById('news-info');
  if (info && barra && barra.contains(info)) info.after(sel); else if (barra) barra.append(sel);
  aplica();

  /* ---------- liga tudo depois de cada desenho da lista ---------- */
  const orig = renderNewsView;
  renderNewsView = function (...args) {
    const r = orig.apply(this, args);
    try { faixa(); } catch (e) { /* segue */ }
    precos().catch(() => {});
    return r;
  };

  /* ---------- leitor: preço e linha do tempo ---------- */
  window.addEventListener('mm:leitor', async (ev) => {
    const { n, art } = ev.detail || {};
    if (!n || !art) return;
    const a = ativoDe(n);
    if (!a) return;
    const todas = (Array.isArray(newsAll) ? newsAll : []).filter((x) => x && x.data > Date.now() - 30 * 3600e3 && a.re.test(textos(x)));
    // uma linha por fato: o mesmo grupo (ou a mesma manchete) aparece só uma vez, na primeira hora em que saiu
    const vistos = new Set(), linha = [];
    todas.sort((p, q) => p.data - q.data).forEach((x) => {
      const k = x.grupo || (typeof newsSoLetras === 'function' ? newsSoLetras(x.titulo).slice(0, 60) : x.titulo);
      if (vistos.has(k)) return; vistos.add(k); linha.push(x);
    });
    const tags = art.querySelector('.nr-tags');
    const quando = Math.min(n.data, ...(n.related || []).map((r) => r.data));
    if (linha.length >= 2) {
      const sec = document.createElement('section');
      sec.className = 'nr-sec nw4-tl';
      const ult = linha.slice(-10);
      sec.innerHTML = `<h3>Linha do tempo · ${esc(a.rot)}${linha.length > ult.length ? ` (últimos ${ult.length} de ${linha.length})` : ''}</h3><ol>${ult.map((x) => {
        const eu = x.id === n.id || (n.grupo && x.grupo === n.grupo);
        const src = typeof newsSourceLabel === 'function' ? newsSourceLabel(x) : x.fonte;
        return `<li class="${eu ? 'eu' : ''}"><time>${diaBR(x.data) === diaBR(Date.now()) ? '' : 'ontem '}${horaBR(x.data)}</time>${eu ? `<span>${esc(x.titulo)}</span>` : `<button type="button" class="nr-link" data-id="${esc(x.id)}"><span>${esc(x.titulo)}</span></button>`}<small>${esc(src)}</small></li>`;
      }).join('')}</ol>`;
      const rel = [...art.querySelectorAll('.nr-sec')][0];
      if (rel) rel.before(sec); else art.append(sec);
    }
    const v = await variacao(a, quando).catch(() => null);
    if (v && tags && tags.isConnected && !art.querySelector('.nw4-px')) {
      const el = document.createElement('div');
      const html = chip(a, v, quando);
      if (!html) return;
      el.className = 'nw4-px nw4-px-nr';
      el.innerHTML = html;
      tags.after(el);
    }
  });
})();
