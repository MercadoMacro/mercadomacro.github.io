/* Inteligência nas notícias (26/11/2026, pedido do Dante)
   1) "Esperado x saiu": notícia de IPCA, IPCA-15, PIB, payroll, CPI, PCE... mostra o que o mercado esperava, o que saiu
      e se veio acima ou abaixo. Os números vêm do calendário econômico do site (mesma fonte da aba Agenda); sem o
      evento no calendário, usa o que a própria manchete diz ("acima do esperado").
   2) "Quem tende a sentir": no leitor, os setores e ações que historicamente sentem o fato (petróleo, minério, dólar,
      juros). Texto de relação histórica, sem recomendação.
   3) "Especulação" e "Confirmado": manchete com "segundo fontes", "especulações", "cotado para"... ganha a etiqueta
      Especulação; a manchete que oficializa um assunto especulado nas últimas 72 horas ganha Confirmado.
   Tudo por cima do noticias.js / noticias4.js (renderNewsView e o evento mm:leitor). Para desfazer: tirar este
   <script> e o bloco "noticias6" do noticias5.css. */
(() => {
  const view = document.getElementById('news-view');
  if (!view || typeof renderNewsView !== 'function') return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leads = () => window.__newsLeads || [];
  const tit = (n) => [n.titulo, n.tituloOriginal].filter(Boolean).join(' \n ');
  // notícia sobre outro país (inflação da Austrália, PIB do Japão...): não é o dado americano nem o brasileiro
  const OUTRO_PAIS = /\b(austr[aá]lia|australian|aussie|jap[aã]o|japan|japanese|canad[aá]|canadian|nova zel[aâ]ndia|new zealand|reino unido|\buk\b|brit[aâ]nic|british|china|chinese|chin[eê]s|alemanha|germany|german|fran[çc]a|france|french|it[aá]lia|italy|espanha|spain|su[ií][çc]a|swiss|[ií]ndia|india|m[eé]xico|mexico|turquia|turkey|coreia|korea|zona do euro|eurozone|euro area)\b/i;

  /* ---------- 1) Esperado x saiu ---------- */
  // [manchete, país no calendário, título no calendário]
  const DADOS = [
    [/ipca-?\s?15/i, 'BRL', /IPCA-?\s?15/i],
    [/\bipca\b(?!-?\s?15)/i, 'BRL', /\bIPCA\b(?!-?\s?15)/i],
    [/\bpib\b(?!.*\b(eua|americano|estados unidos)\b)/i, 'BRL', /\bPIB\b/i],
    [/\b(taxa de )?desemprego\b.*\b(brasil|pnad|ibge)\b|\b(brasil|pnad|ibge)\b.*\bdesemprego\b/i, 'BRL', /desemprego/i],
    [/\bpayroll\b|non-?farm|cria[çc][aã]o de (vagas|empregos).*\b(eua|estados unidos|americana)\b/i, 'USD', /Non-?Farm|Payroll/i],
    [/\bcpi\b|infla[çc][aã]o (ao consumidor )?(americana|dos eua|nos eua|dos estados unidos)/i, 'USD', /\bCPI\b/i],
    [/\bpce\b/i, 'USD', /\bPCE\b/i],
    [/\bppi\b|pre[çc]os ao produtor.*\b(eua|americano)\b/i, 'USD', /\bPPI\b/i],
    [/\bgdp\b|\bpib\b.*\b(eua|americano|estados unidos)\b|\b(eua|americano|estados unidos)\b.*\bpib\b/i, 'USD', /\bGDP\b/i],
    [/jobless claims|pedidos de seguro-desemprego/i, 'USD', /Jobless Claims/i],
    [/\b(vendas no varejo|retail sales)\b.*\b(eua|us|americano)\b|\b(eua|us)\b.*\b(retail sales|vendas no varejo)\b/i, 'USD', /Retail Sales/i],
  ];
  const num = (s) => {
    let t = String(s || '').replace(/[^\d,.\-]/g, '');
    if (!t) return null;
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',')) t = t.replace(',', '.');
    const x = parseFloat(t);
    return Number.isFinite(x) ? x : null;
  };
  const SURP_ACIMA = /acima d[oa]s? (esperad|expectativ|estimativ|projeç|consenso|previs)|above (expectations|forecasts?|estimates|consensus)|beats? (expectations|forecasts?|estimates)|hotter[- ]than[- ]expected|mais (forte|quente|alt[oa]) (do )?que o esperado|stronger[- ]than[- ]expected|surpreende para cima/i;
  const SURP_ABAIXO = /abaixo d[oa]s? (esperad|expectativ|estimativ|projeç|consenso|previs)|below (expectations|forecasts?|estimates|consensus)|miss(es)? (expectations|forecasts?|estimates)|(cooler|softer|weaker)[- ]than[- ]expected|mais (fraco|fraca|baix[oa]) (do )?que o esperado|surpreende para baixo/i;
  const SURP_LINHA = /em linha com (o esperado|as expectativas|a expectativa|as estimativas|o consenso|as projeç)|in line with (expectations|forecasts?|estimates|consensus)|as expected\b/i;
  let cal = null, calTs = 0;
  async function calendario() {
    if (cal && Date.now() - calTs < 10 * 60e3) return cal;
    try { calTs = Date.now(); cal = typeof loadCalendarFeed === 'function' ? await loadCalendarFeed() : []; } catch (e) { cal = []; }
    return cal || [];
  }
  const nomeDado = (e) => (typeof calTitle === 'function' ? calTitle(e.country, e.title) : e.title);
  async function esperado(n) {
    const t = tit(n);
    const regra = DADOS.find(([re, pais]) => re.test(t) && !(pais !== 'BRL' && OUTRO_PAIS.test(t)) && !(pais === 'BRL' && OUTRO_PAIS.test(t) && !/brasil|ibge/i.test(t)));
    if (!regra) return null;
    const quando = Math.min(n.data, ...(n.related || []).map((r) => r.data));
    const feed = await calendario();
    const eventos = feed.filter((e) => e && e.country === regra[1] && regra[2].test(e.title || '') && e.actual && e.forecast
      && Math.abs(new Date(e.date).getTime() - quando) < 8 * 3600e3 && new Date(e.date).getTime() <= quando + 30 * 60e3);
    if (eventos.length) {
      // o evento cujo número aparece na manchete; senão, o de maior importância
      const nosTextos = (e) => { const a = String(e.actual).replace(/[%KMB]/gi, '').trim(); return a && (t.includes(a) || t.includes(a.replace('.', ','))) ? 1 : 0; };
      const imp = { High: 3, Medium: 2, Low: 1 };
      const e = eventos.sort((a, b) => nosTextos(b) - nosTextos(a) || (imp[b.impact] || 0) - (imp[a.impact] || 0))[0];
      const a = num(e.actual), f = num(e.forecast);
      if (a == null || f == null) return null;
      const lado = Math.abs(a - f) < 1e-9 ? 'linha' : a > f ? 'acima' : 'abaixo';
      return { nome: nomeDado(e), saiu: e.actual, esperado: e.forecast, anterior: e.previous || '', lado, fonte: 'calendário' };
    }
    // sem o evento no calendário: o que a manchete diz
    const tt = t + ' \n ' + (n.trechoPt || n.trecho || '');
    const lado = SURP_ACIMA.test(tt) ? 'acima' : SURP_ABAIXO.test(tt) ? 'abaixo' : SURP_LINHA.test(tt) ? 'linha' : null;
    return lado ? { lado, fonte: 'manchete' } : null;
  }
  const LADO = { acima: ['▲', 'acima do esperado'], abaixo: ['▼', 'abaixo do esperado'], linha: ['=', 'em linha com o esperado'] };
  function htmlEsperado(x, longo) {
    const [seta, txt] = LADO[x.lado];
    if (x.fonte === 'manchete') return `<span class="n6-tit">Esperado x saiu</span><b class="n6-${x.lado}">${seta} Veio ${txt}</b>${longo ? '<small>segundo a manchete</small>' : ''}`;
    return `<span class="n6-tit">${esc(x.nome)}</span>`
      + `<span>Saiu <b>${esc(x.saiu)}</b></span><span>Esperado <b>${esc(x.esperado)}</b></span>`
      + (longo && x.anterior ? `<span>Anterior ${esc(x.anterior)}</span>` : '')
      + `<b class="n6-${x.lado}">${seta} ${txt}</b>`;
  }

  /* ---------- 2) Quem tende a sentir ---------- */
  const SOBE = /\b(sobe|subiu|sobem|alta|altas|avan[çc]a|avan[çc]ou|dispara|disparou|salta|saltou|ganha|ganhou|valoriza|renova m[aá]xima|recorde|rises|rose|gains|jumps|surges|climbs|rall(y|ies)|soars|higher)\b/i;
  const DESCE = /\b(cai|caiu|caem|queda|quedas|recua|recuou|despenca|despencou|perde|perdeu|desvaloriza|tomba|tombou|m[ií]nima|falls|fell|drops|slides|slumps|tumbles|declines|sinks|plunges|lower)\b/i;
  const direcao = (t) => { const s = SOBE.test(t), d = DESCE.test(t); return s && !d ? 1 : d && !s ? -1 : 0; };
  // [assunto, como achar a direção, quando sobe: favorece / pressiona]
  const SENTEM = [
    { re: /petr[óo]leo|\bbrent\b|\bwti\b|\bcrude\b|\boil prices?\b/i, nome: 'Petróleo',
      sobe: ['Petroleiras (PETR4, PRIO3, RECV3)'], desce: ['Aéreas e transportadoras, pelo custo do combustível'] },
    { re: /min[ée]rio de ferro|iron ore/i, nome: 'Minério de ferro',
      sobe: ['Mineradoras e siderúrgicas (VALE3, CMIN3, GGBR4, CSNA3)'], desce: [] },
    { re: /\bcelulose\b|\bpulp\b/i, nome: 'Celulose', sobe: ['Papel e celulose (SUZB3, KLBN11)'], desce: [] },
    { re: /\b(soja|milho|soybeans?|corn)\b/i, nome: 'Grãos', sobe: ['Agronegócio (SLCE3)'], desce: [] },
    { br: true, re: /(^|[^\p{L}])d[oó]lar(?! (australiano|canadense|neozeland|de hong kong|de singapura))|\bc[aâ]mbio\b|\breal\b.*\b(dollar|d[oó]lar)\b/iu, nome: 'Dólar',
      sobe: ['Exportadoras (SUZB3, KLBN11, VALE3)'], desce: ['Empresas com dívida ou custos em dólar, como aéreas e varejo de importados'] },
    { br: true, re: /\b(selic|copom|juros futuros|\bdi\b|taxas? dos? dis?|curva de juros)\b/i, nome: 'Juros no Brasil', juros: true,
      alta: { fav: ['Renda fixa pós-fixada (o CDI rende mais)'], pre: ['Varejo e construtoras (MGLU3, CYRE3, MRVE3), que dependem de crédito'] },
      queda: { fav: ['Varejo e construtoras (MGLU3, CYRE3, MRVE3), que dependem de crédito'], pre: ['Renda fixa pós-fixada (o CDI rende menos)'] } },
    { re: /\btreasur(y|ies)\b|\byields?\b|juros (americanos|dos eua|nos eua)|rendimento dos t[ií]tulos americanos/i, nome: 'Juros nos EUA',
      sobe: ['Dólar frente ao real'], desce: ['Bolsa brasileira e moedas emergentes'] },
  ];
  function quemSente(n, esp) {
    const t = tit(n);
    if (OUTRO_PAIS.test(t) && !/brasil|brazil|petr[óo]leo|min[ée]rio|oil|iron ore/i.test(t)) return null;
    for (const r of SENTEM) {
      if (!r.re.test(t)) continue;
      if (r.br && OUTRO_PAIS.test(t) && !/brasil|brazil|\breal\b|R\$/i.test(t)) continue;
      let dir = 0;
      if (r.juros) dir = /\b(eleva|aumenta|sobe|alta|aperta|hawkish)\b/i.test(t) && !/\b(corta|reduz|queda|cai|recua|afrouxa)\b/i.test(t) ? 1
        : /\b(corta|reduz|queda|cai|recua|afrouxa)\b/i.test(t) && !/\b(eleva|aumenta|sobe)\b/i.test(t) ? -1 : 0;
      else dir = direcao(t);
      if (!dir) continue;
      if (r.juros) { const lado = dir > 0 ? r.alta : r.queda; return { nome: r.nome + (dir > 0 ? ' em alta' : ' em queda'), dir, fav: lado.fav, pre: lado.pre }; }
      return { nome: r.nome + (dir > 0 ? ' em alta' : ' em queda'), dir, fav: dir > 0 ? r.sobe : r.desce, pre: dir > 0 ? r.desce : r.sobe };
    }
    // inflação acima do esperado no Brasil: aposta de juros mais altos
    if (esp && esp.lado !== 'linha' && /\bipca\b/i.test(t)) {
      const r = SENTEM.find((x) => x.juros), dir = esp.lado === 'acima' ? 1 : -1, lado = dir > 0 ? r.alta : r.queda;
      return { nome: 'Inflação ' + (dir > 0 ? 'acima' : 'abaixo') + ' do esperado: aposta de juros ' + (dir > 0 ? 'mais altos' : 'mais baixos'), dir, fav: lado.fav, pre: lado.pre };
    }
    return null;
  }
  function htmlSente(q) {
    const linha = (cls, seta, rot, xs) => xs.length ? `<li class="${cls}"><b>${seta} ${rot}</b> ${xs.map(esc).join('; ')}</li>` : '';
    return `<b class="n6-h"><i class="fas fa-people-arrows" aria-hidden="true"></i> Quem tende a sentir · ${esc(q.nome)}</b>`
      + `<ul>${linha('n6-fav', '▲', 'Tende a favorecer:', q.fav)}${linha('n6-pre', '▼', 'Tende a pressionar:', q.pre)}</ul>`
      + '<small>Relação histórica entre esse tipo de fato e os setores. Não é recomendação de compra ou venda.</small>';
  }

  /* ---------- 3) Especulação x Confirmado ---------- */
  const ESPECULA = /\b(segundo (fontes|pessoas)|dizem? fontes?|diz(em)? fontes?|fontes (dizem|afirmam|ouvidas|pr[oó]ximas)|especula[çc][aã]o|especula[çc][õo]es|especula-se|rumor(es)?|boatos?|cotad[oa]s? para|favorit[oa]s? para|nome mais forte|deve ser (anunciad|nomead|indicad|escolhid)|estuda(m)? (a |o )?(possibilidade|venda|compra|fus[aã]o)|avalia(m)? (a )?possibilidade|em negocia[çc][aã]o|negocia(m)? (a )?(compra|venda|fus[aã]o)|pode (assumir|ser (nomead|indicad|anunciad|escolhid))|reportedly|sources (say|said|familiar)|:\s*sources?$|people familiar|according to (people|sources)|rumou?rs?|is said to|in talks|weighs|mulls|considering (a |an )?(sale|bid|deal|merger))\b/i;
  const CONFIRMA = /\b(oficializa|oficializou|confirma|confirmou|confirmad[oa]|anuncia|anunciou|é nomead[oa]|foi nomead[oa]|nomeia|nomeou|indica oficialmente|assina|assinou|fecha acordo|officially|confirms|confirmed|announces|announced|names|named|appoints|appointed|signs)\b/i;
  function etiqueta(n) {
    const t = tit(n);
    if (CONFIRMA.test(t) && typeof newsTokens === 'function') {
      const meus = new Set(newsTokens(n.titulo));
      const ini = n.data - 72 * 3600e3;
      const antes = (Array.isArray(newsAll) ? newsAll : []).some((x) => x && x.id !== n.id && x.data >= ini && x.data < n.data && ESPECULA.test(tit(x))
        && ((n.grupo && x.grupo === n.grupo) || newsTokens(x.titulo).filter((w) => meus.has(w)).length >= 3));
      if (antes) return { cls: 'confirmado', txt: 'Confirmado', dica: 'Assunto que vinha sendo especulado nas últimas 72 horas e agora foi oficializado' };
    }
    if (ESPECULA.test(t)) return { cls: 'especulacao', txt: 'Especulação', dica: 'A manchete fala de fontes, rumores ou possibilidades: ainda não é fato confirmado' };
    return null;
  }

  /* ---------- nos cartões ---------- */
  const espCache = new Map();
  async function esperadoDe(n) {
    if (!espCache.has(n.id)) espCache.set(n.id, esperado(n).catch(() => null));
    return espCache.get(n.id);
  }
  async function enfeitar() {
    const ls = leads();
    const cards = [...view.querySelectorAll('.nc-card[data-id]')];
    await Promise.all(cards.map(async (card) => {
      const n = ls.find((x) => x.id === card.dataset.id);
      if (!n) return;
      if (!card.querySelector('.n6-etq')) {
        const e = etiqueta(n);
        if (e) {
          const sp = document.createElement('span');
          sp.className = 'nc-tag n6-etq ' + e.cls; sp.textContent = e.txt; sp.title = e.dica;
          const f = card.querySelector('.nc-footer');
          const imp = f && f.querySelector('.nc-impact');
          if (imp) imp.after(sp); else f?.prepend(sp);
        }
      }
      if (card.querySelector('.n6-esp')) return;
      const x = await esperadoDe(n);
      if (!x || !card.isConnected || card.querySelector('.n6-esp')) return;
      const el = document.createElement('div');
      el.className = 'n6-esp';
      el.title = x.fonte === 'calendário' ? 'Número do calendário econômico (o mesmo da aba Agenda)' : 'O que a própria manchete diz sobre a expectativa';
      el.innerHTML = htmlEsperado(x, false);
      const ref = card.querySelector('.nw4-px') || card.querySelector('.nc-title');
      ref?.after(el);
    }));
  }
  const orig = renderNewsView;
  renderNewsView = function (...args) {
    const r = orig.apply(this, args);
    enfeitar().catch(() => {});
    return r;
  };
  // o preço (noticias4) chega depois: o "esperado" fica logo abaixo do título de qualquer forma
  enfeitar().catch(() => {});

  /* ---------- no leitor ---------- */
  window.addEventListener('mm:leitor', async (ev) => {
    const { n, art } = ev.detail || {};
    if (!n || !art) return;
    const tags = art.querySelector('.nr-tags');
    const e = etiqueta(n);
    if (e && tags && !tags.querySelector('.n6-etq')) {
      const sp = document.createElement('span');
      sp.className = 'nc-tag n6-etq ' + e.cls; sp.textContent = e.txt; sp.title = e.dica;
      tags.append(sp);
    }
    const x = await esperadoDe(n);
    // o leitor se redesenha (texto completo chega depois): procura os lugares de novo
    const tg = art.querySelector('.nr-tags');
    if (!tg) return;
    if (x && !art.querySelector('.n6-esp')) {
      const el = document.createElement('div');
      el.className = 'n6-esp n6-esp-nr';
      el.innerHTML = htmlEsperado(x, true);
      (art.querySelector('.nw4-px') || tg).after(el);
    }
    const depois = art.querySelector('.nr-porque') || art.querySelector('.n6-esp') || art.querySelector('.nw4-px') || tg;
    const q = quemSente(n, x);
    if (q && !art.querySelector('.n6-sente')) {
      const el = document.createElement('div');
      el.className = 'n6-sente';
      el.innerHTML = htmlSente(q);
      depois.after(el);
    }
  });
  window.__mmNoticias6 = { esperado, quemSente, etiqueta }; // para conferir no console
})();
