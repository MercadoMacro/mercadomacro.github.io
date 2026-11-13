/* Mesa 2 (12/11/2026): painel no desenho que o Dante mandou. Gráfico limpo do ativo escolhido, seletor de ativos em
   abas (Índices, Commodities, Juros, Moedas, Cripto: as mesmas listas da Mesa 1), Pulso global em vidro, Juros Brasil
   e EUA, Notícias do ativo, Radar do Copom, Próximo evento e Estrangeiro na B3. A Mesa 1 continua a de sempre.
   Dados: os mesmos da Mesa (mesa.js passa tudo em "api"), a agenda do Calendário (app.js), fluxo/fluxo.json (aba
   Fluxo) e copom/copom.json (aba Análises, robôs do GitHub). Nada aqui chama a Jade nem a IA. Sem dado, mostra "—". */
globalThis.MMMesa2 = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const lado = (v) => (!ok(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq');
  const seta = (v) => (!ok(v) ? '' : v > 0 ? '▲' : v < 0 ? '▼' : '•');
  const SEL_KEY = 'mm_m2_sel_v1', ABA_KEY = 'mm_m2_aba_v1';
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço */ } };
  let api = null, root = null;
  let sel = ler(SEL_KEY, { s: '^BVSP', n: 'Ibovespa' });
  if (!sel || typeof sel.s !== 'string' || !/^[\w^.=\-]{1,24}$/.test(sel.s)) sel = { s: '^BVSP', n: 'Ibovespa' };
  let aba = ler(ABA_KEY, 'ind');
  // ordem da lista (13/11/2026, pedido do Dante): clicar no título da coluna ordena do maior para o menor, de novo do
  // menor para o maior e, na terceira vez, volta à ordem da lista. Vale para todas as abas e fica guardada no navegador.
  const ORD_KEY = 'mm_m2_ordem_v1', COLS = ['pct', 'abs', 'px', 'nome'];
  let ordem = ler(ORD_KEY, null);
  if (!ordem || !COLS.includes(ordem.k) || (ordem.d !== 1 && ordem.d !== -1)) ordem = null;

  /* ---------- listas ---------- */
  // abas do seletor: as tabelas da Mesa 1 juntas por assunto (sem os metais "à vista", que só existem ao vivo na Mesa 1)
  // listas padrão de cada aba: as tabelas da Mesa 1 juntas por assunto (sem os metais "à vista", que só existem ao vivo
  // na Mesa 1); a pessoa pode reordenar, tirar e pôr ativos (lista própria, guardada na conta: chave mesa2sel)
  const ABAS = [['ind', 'Índices', ['am', 'eu', 'as']], ['com', 'Commodities', ['co']], ['jur', 'Juros', ['ou']], ['moe', 'Moedas', ['dx', 'em']], ['cri', 'Cripto', ['cr']],
    ['acoes', 'Ações EUA', ['eua-acao']], ['etfs', 'ETFs EUA', ['eua-etf']]];
  /* ---------- ações e ETFs americanos (13/11/2026): catálogo e cotações pelo servidor de dados (/eua/*, FXOpen com o
     Yahoo de reserva); o catálogo fica 1 dia neste navegador. Preços da corretora (CFD), não os oficiais da bolsa. ---------- */
  const PADRAO_EUA = {
    acoes: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'JPM', 'V', 'MA', 'NFLX', 'AMD', 'COST', 'WMT', 'XOM', 'UNH', 'LLY', 'ORCL', 'BAC'],
    etfs: ['SPY', 'QQQ', 'DIA', 'IWM', 'EWZ', 'EEM', 'EFA', 'GLD', 'SLV', 'TLT', 'IEF', 'HYG', 'LQD', 'XLE', 'XLF', 'XLK', 'ARKK', 'VNQ', 'USO', 'TQQQ'],
  };
  const NOME_EUA = { AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', AMZN: 'Amazon', GOOGL: 'Alphabet (Google)', META: 'Meta', TSLA: 'Tesla', SPY: 'S&P 500 (SPY)', QQQ: 'Nasdaq 100 (QQQ)', EWZ: 'Brasil (EWZ)', GLD: 'Ouro (GLD)', TLT: 'Treasuries 20+ (TLT)' };
  const EUA_CAT = 'mm_eua_cat_v1';
  let euaCat = (() => { const c = ler(EUA_CAT, null); return c && Array.isArray(c.l) && Date.now() - (c.ts || 0) < 864e5 ? c.l : null; })();
  let euaPedido = false;
  function carregarEuaCat() {
    if (euaCat || euaPedido || !api) return; euaPedido = true;
    api.getJSON(`${api.PROXY}/eua/catalogo`, 20000).then((l) => {
      if (Array.isArray(l) && l.length) { euaCat = l.filter((x) => x && typeof x.s === 'string' && /^[A-Z0-9.\-]{1,12}$/.test(x.s)); gravar(EUA_CAT, { ts: Date.now(), l: euaCat }); atualizar('seletor'); }
    }).catch(() => {}).finally(() => { setTimeout(() => { euaPedido = false; }, 60000); });
  }
  const curto = (n) => String(n || '').replace(/,?\s+(Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?|plc|Holdings?|Class [A-C]|N\.V\.|S\.A\.|Company)\b\.?/gi, '').replace(/[\s,&]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  function itensEua() {
    const L = euaCat || [...PADRAO_EUA.acoes.map((s) => ({ s, n: NOME_EUA[s] || s, t: 'acao' })), ...PADRAO_EUA.etfs.map((s) => ({ s, n: NOME_EUA[s] || s, t: s === 'TQQQ' ? 'etfa' : 'etf' }))];
    return L.map((x) => ({ s: x.s, n: NOME_EUA[x.s] || curto(x.n) || x.s, cc: 'US', d: 2, tid: x.t === 'acao' ? 'eua-acao' : 'eua-etf', grupo: x.t === 'acao' ? 'Ações EUA' : x.t === 'etfa' ? 'ETFs alavancados EUA' : 'ETFs EUA', eua: true, sub: x.t === 'acao' ? 'Ação · EUA' : x.t === 'etfa' ? 'ETF alavancado · EUA' : 'ETF · EUA', nomeLongo: x.n }));
  }
  let euaSetMemo = null, euaSetRef;
  const EUA_SET = () => { if (!euaSetMemo || euaSetRef !== euaCat) { euaSetRef = euaCat; euaSetMemo = new Set(itensEua().map((x) => x.s)); } return euaSetMemo; };
  let QE = {}, euaTs = 0, euaBusca = null;
  // cotação: a da Mesa (Yahoo, câmbio e cripto ao vivo) ou, para ações e ETFs americanos, a do /eua/cotacoes
  const cot = (s) => { const a = api.q(s); return a && ok(a.v) ? a : QE[s] || a; };
  function buscarEua() {
    if (!api || !root?.isConnected || document.hidden || euaBusca) return;
    const E = EUA_SET(), syms = [...new Set(abas().flatMap((x) => x.l).map((r) => r.s).concat(sel.s).filter((s) => E.has(s)))].slice(0, 120);
    if (!syms.length) return;
    euaBusca = api.getJSON(`${api.PROXY}/eua/cotacoes?s=${encodeURIComponent(syms.join(','))}`, 15000).then((j) => {
      if (!j || j.error) return;
      for (const [s, q] of Object.entries(j)) if (q && ok(q.v)) QE[s] = { v: q.v, c: q.c, ts: q.ts, live: true, eua: q.f };
      euaTs = Date.now();
    }).catch(() => {}).finally(() => { euaBusca = null; });
  }
  setInterval(buscarEua, 15000);
  // o catálogo inteiro (cerca de 900 ativos) só é montado de novo quando chega o catálogo dos EUA
  let catMemo = null, catRef;
  function catalogo() {
    if (catMemo && catRef === euaCat) return catMemo;
    catRef = euaCat;
    const L = [];
    for (const t of api.TABLES) for (const r of t.rows) if (!r[0].startsWith('__x')) L.push({ s: r[0], n: r[1], cc: r[2], d: r[3], tid: t.id, grupo: t.t });
    for (const r of api.CRIPTO_TB) L.push({ s: r[0], n: r[1], cc: '', d: 2, tid: 'cr', grupo: 'Cripto' });
    L.push(...itensEua());
    const vistos = new Set(); return (catMemo = L.filter((x) => !vistos.has(x.s) && vistos.add(x.s)));
  }
  function abas() {
    carregarEuaCat();
    const C = catalogo(), por = new Map(C.map((x) => [x.s, x])), P = minhas.dados?.abas || {};
    return ABAS.map(([id, t, tids]) => {
      const padrao = PADRAO_EUA[id] ? PADRAO_EUA[id].map((s) => por.get(s)).filter(Boolean) : C.filter((x) => tids.includes(x.tid));
      const propria = Array.isArray(P[id]) ? P[id].map((s) => por.get(s)).filter(Boolean) : null;
      return { id, t, l: propria || padrao, padrao, propria: !!propria };
    });
  }

  /* ---------- lista própria do seletor: neste navegador e na conta (/api/conta/dados?k=mesa2sel), valendo a mais nova ---------- */
  const LISTA_KEY = 'mm_m2_lista_v1', SYM = /^[\w^.=\-]{1,24}$/;
  const limpaLista = (v) => {
    const abasOk = {}; const src = v && v.v === 1 && v.abas && typeof v.abas === 'object' ? v.abas : {};
    for (const [id] of ABAS) if (Array.isArray(src[id])) abasOk[id] = [...new Set(src[id].filter((s) => typeof s === 'string' && SYM.test(s)))].slice(0, 60);
    return { v: 1, abas: abasOk };
  };
  let minhas = (() => { const e = ler(LISTA_KEY, null); return e && typeof e === 'object' ? { conta: e.conta || null, ts: +e.ts || 0, dados: limpaLista(e.dados) } : { conta: null, ts: 0, dados: null }; })();
  let conta = null, listaCarregada = false, listaTimer = null;
  async function carregarLista() {
    if (listaCarregada) return; listaCarregada = true;
    try {
      const r = await fetch('/api/conta/dados?k=mesa2sel', { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(); if (!Number.isSafeInteger(j.usuario)) return;
      conta = j.usuario;
      if (minhas.conta && minhas.conta !== conta) minhas = { conta, ts: 0, dados: null }; // outra conta já usou este navegador
      if (j.v && (j.ts || 0) > (minhas.ts || 0)) { minhas = { conta, ts: j.ts, dados: limpaLista(j.v) }; gravar(LISTA_KEY, minhas); if (!editando) atualizar('seletor'); }
      else if (minhas.dados && (minhas.ts || 0) > (j.ts || 0)) { minhas.conta = conta; enviarLista(); }
    } catch (e) { /* fora da conta: fica só neste navegador */ }
  }
  async function enviarLista(denovo) {
    if (!conta || !minhas.dados) return;
    const ts = Math.max(Date.now(), (minhas.ts || 0) + 1);
    try {
      const r = await fetch('/api/conta/dados', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: conta, k: 'mesa2sel', v: minhas.dados, ts }) });
      if (r.ok) { minhas.ts = ts; gravar(LISTA_KEY, minhas); return; }
      if (r.status === 409 && !denovo) { listaCarregada = false; await carregarLista(); }
    } catch (e) { /* tenta na próxima mudança */ }
  }
  function salvarAba(id, syms) {
    const d = limpaLista(minhas.dados || { v: 1, abas: {} }); d.abas[id] = syms; d.v = 1;
    minhas = { conta: conta || minhas.conta, ts: Date.now(), dados: limpaLista(d) }; gravar(LISTA_KEY, minhas);
    clearTimeout(listaTimer); listaTimer = setTimeout(() => enviarLista(), 1200);
  }
  function restaurarAba(id) {
    const d = limpaLista(minhas.dados || { v: 1, abas: {} }); delete d.abas[id];
    minhas = { conta: conta || minhas.conta, ts: Date.now(), dados: d }; gravar(LISTA_KEY, minhas);
    clearTimeout(listaTimer); listaTimer = setTimeout(() => enviarLista(), 1200);
  }

  // [símbolo, nome, marca: país, par de moedas ou tabela (ícone)]
  const PULSO = [['^BVSP', 'Ibovespa', 'BR'], ['^GSPC', 'S&P 500', 'US'], ['^IXIC', 'Nasdaq', 'US'], ['^DJI', 'Dow Jones', 'US'], ['BRL=X', 'Dólar', 'USD/BRL'],
    ['BZ=F', 'Brent', 'co'], ['GC=F', 'Ouro', 'co'], ['BTC-USD', 'Bitcoin', 'cr'], ['^TNX', 'Treasury 10a', 'US']];
  const marcaPulso = (s, n, m) => (m === 'cr' ? api.marca(s, n, '', 'cr') : m === 'co' ? api.marca(s, n, '', 'co') : m.includes('/') ? api.marca(s, m, '', 'em') : api.marca(s, n, m, 'am'));
  // unidade mostrada ao lado do preço grande do gráfico
  function unidade(s, n) {
    if (euaSim(s)) return 'US$ · preço da corretora';
    if (s === 'BTC-BRL' || /=X$/.test(s) && /BRL/.test(s)) return 'R$';
    if (/^\^(IRX|FVX|TNX|TYX)$/.test(s) || s === '__cds') return s === '__cds' ? 'pontos-base' : '% ao ano';
    if (/^\^BVSP$/.test(s) || s === 'EWZ') return s === 'EWZ' ? 'US$' : 'B3 · pontos';
    if (/^\^/.test(s) || /=F$/.test(s) && /^(ES|NQ|YM|RTY)=F$/.test(s)) return 'pontos';
    if (/=F$/.test(s) || /-USD$/.test(s) || s === '__dce') return 'US$';
    if (/=X$/.test(s)) return (n.split('/')[1] || '').trim();
    return '';
  }
  const euaSim = (s) => !!api && EUA_SET().has(s) && !api.q(s)?.v;
  const prefixo = (s) => (euaSim(s) ? 'US$ ' : s === 'BTC-BRL' || s === 'BRL=X' || s === 'EURBRL=X' ? 'R$ ' : /-USD$/.test(s) || /^(BZ|CL|GC|SI|HG|NG)=F$/.test(s) || s === '__dce' || s === 'TIO=F' ? 'US$ ' : '');
  function preco(s, q, d) {
    if (!q || !ok(q.v)) return '—';
    // índices grandes sem centavos (Ibovespa 171.324, como nas telas de cotação); o resto como na Mesa 1
    const casas = Math.abs(q.v) >= 10000 && !/-USD$|BRL$/.test(s) ? 0 : d != null ? d : api.dec(q.v);
    return prefixo(s) + api.nf(q.v, casas) + (/^\^(IRX|FVX|TNX|TYX)$/.test(s) ? '%' : '');
  }

  // variação absoluta do dia (último menos o fechamento anterior), como nas listas do TradingView
  function absVar(s, q, d) {
    if (!q || !ok(q.v) || !ok(q.c) || q.c <= -100) return '—';
    const a = q.v - q.v / (1 + q.c / 100), casas = Math.abs(q.v) >= 10000 && !/-USD$|BRL$/.test(s) ? 2 : d != null ? d : api.dec(q.v);
    return `${a > 0 ? '+' : a < 0 ? '−' : ''}${api.nf(Math.abs(a), casas)}`;
  }

  const COR_EUA = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#db2777', '#4f46e5', '#0d9488'];
  function marcaItem(r) {
    if (!r.eua) return api.marca(r.s, r.n, r.cc, r.tid);
    let h = 0; for (const ch of r.s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const cor = r.tid === 'eua-etf' ? '#475569' : COR_EUA[h % COR_EUA.length], l = r.s.replace(/[^A-Z]/g, '').slice(0, 1) || r.s[0];
    return `<span class="ms-mk" aria-hidden="true"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="${cor}"/><text x="8" y="${l.length > 1 ? 10.6 : 11.6}" text-anchor="middle" font-size="${l.length > 2 ? 5.2 : l.length > 1 ? 6.6 : 9.6}" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${esc(l)}</text></svg></span>`;
  }

  /* ---------- pedaços ---------- */
  const cab = (t, cor, extra = '') => `<div class="m2-head"><span class="m2-dot ${cor || ''}" aria-hidden="true"></span><h3>${t}</h3><span class="sp"></span>${extra}</div>`;
  function spark(sp, c) {
    const v = (sp || []).filter(ok); if (v.length < 2) return '<svg class="m2-spark" viewBox="0 0 72 22" aria-hidden="true"></svg>';
    const mn = Math.min(...v), mx = Math.max(...v), d = mx - mn || 1;
    const pts = v.map((y, i) => `${(i / (v.length - 1) * 72).toFixed(1)},${(19 - (y - mn) / d * 16).toFixed(1)}`).join(' ');
    return `<svg class="m2-spark ${lado(c)}" viewBox="0 0 72 22" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }

  // gráfico: preço grande + gráfico diário limpo (asset-history.js no modo sutil)
  // períodos do gráfico: o servidor de dados devolve 1 dia (5 min), 5 dias (30 min), 1 mês e 1 ano (diários)
  // (13/11/2026, como o gráfico do MSN) 3M, desde o começo do ano, 3 e 5 anos e todo o histórico; YTD conta os dias do ano
  const diasAno = () => Math.ceil((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 864e5) + 1;
  const PERIODOS = [['1D', '1d', true, 2], ['5D', '5d', true, 8], ['1M', '1mo', false, 31], ['3M', '3mo', false, 93], ['YTD', 'ytd', false, 0],
    ['1A', '1y', false, 366], ['3A', '5y', false, 1096], ['5A', '5y', false, 1827], ['Máx', 'max', false, 100000]];
  const NOME_PER = { '1D': 'hoje', '5D': 'em 5 dias', '1M': 'em 1 mês', '3M': 'em 3 meses', YTD: 'no ano', '1A': 'em 1 ano', '3A': 'em 3 anos', '5A': 'em 5 anos', 'Máx': 'em todo o histórico' };
  const PER_KEY = 'mm_m2_per_v1';
  let per = ler(PER_KEY, '5D'); if (!PERIODOS.some((p) => p[0] === per)) per = '5D';
  const viewers = {};
  let grafNo = null, grafSym = null;
  function graficoHTML() {
    const q = cot(sel.s);
    return `${cab(`Gráfico · <span class="m2-gnome">${esc(sel.n)}</span>`, 'ouro', '<button type="button" class="m2-ic" data-m2-cheio aria-label="Abrir em tela cheia" title="Abrir em tela cheia"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>')}
      <div class="m2-preco"><b class="num" data-m2-px="${esc(sel.s)}">${preco(sel.s, q).replace(/^(R\$|US\$) /, '')}</b><span class="m2-var ${lado(q?.c)}" data-m2-ch="${esc(sel.s)}">${seta(q?.c)} ${api.pct(q?.c)}</span><small>${esc(unidade(sel.s, sel.n))}</small>
        <span class="m2-pervar" data-m2-pervar></span></div>
      <div class="m2-per-linha"><span class="m2-per" role="group" aria-label="Período do gráfico">${PERIODOS.map(([r]) => `<button type="button" data-m2-per="${r}" aria-pressed="${r === per}">${r}</button>`).join('')}</span><span class="m2-hover num" data-m2-hover aria-live="off"></span></div>
      <div class="m2-graf-slot"></div>`;
  }
  function montarGrafico(box) {
    const slot = box.querySelector('.m2-graf-slot'); if (!slot) return;
    if (!grafNo) { grafNo = document.createElement('div'); grafNo.className = 'm2-graf mv-graf'; }
    slot.replaceWith(grafNo);
    const chave = sel.s + '|' + per;
    if (grafSym === chave && grafNo.querySelector('.wlh, .wlh-error')) return;
    grafSym = chave;
    const [, r, intraday, dias] = PERIODOS.find((p) => p[0] === per);
    if (!viewers[r] && window.MMAssetHistory) viewers[r] = new window.MMAssetHistory.Viewer((s) => api.getJSON(`${api.PROXY}/history?symbols=${encodeURIComponent(s)}&r=${r}`, 20000));
    if (!viewers[r]) return;
    Object.entries(viewers).forEach(([k, v]) => { if (k !== r) v.destroy(); });
    const claro = document.documentElement.dataset.theme === 'light' || document.body.classList.contains('light');
    const box2 = () => root?.querySelector('[data-m2="grafico"]');
    // variação do período ao lado do preço; ao passar o mouse, a data e o valor do ponto (e quanto mudou desde o começo)
    const aoPeriodo = (p) => { const el = box2()?.querySelector('[data-m2-pervar]'); if (el) { el.className = 'm2-pervar ' + lado(p.variacao); el.textContent = `${api.pct(p.variacao)} ${NOME_PER[per]}`; } };
    const aoMover = (p) => { const el = box2()?.querySelector('[data-m2-hover]'); if (el) el.textContent = p ? `${p.data} · ${api.nf(p.valor, Math.abs(p.valor) >= 10000 ? 0 : api.dec(p.valor))} · ${api.pct(p.desde)} desde o início` : ''; };
    viewers[r].show(grafNo, sel.s, sel.n, claro, { sutil: true, intraday, dias: dias || diasAno(), aoPeriodo, aoMover }).catch(() => {});
  }


  let editando = false, adicionando = false, busca = '';
  const lapis = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  function seletorHTML() {
    carregarLista();
    const A = abas(), atual = A.find((x) => x.id === aba) || A[0];
    const tabs = `<div class="m2-tabs" role="tablist" aria-label="Grupos de ativos">${A.map((x) => `<button type="button" role="tab" data-m2-aba="${x.id}" aria-selected="${x.id === atual.id}">${x.t}</button>`).join('')}<span class="sp"></span>
      <button type="button" class="m2-editar${editando ? ' on' : ''}" data-m2-editar aria-pressed="${editando}" title="${editando ? 'Concluir a edição da lista' : 'Organizar esta lista: arrastar, tirar e pôr ativos'}">${editando ? 'Concluir' : lapis + '<span>Editar</span>'}</button></div>`;
    const linhas = ordenar(atual.l).map((r) => {
      const q = cot(r.s), sub = r.eua ? `${r.sub} · ${r.nomeLongo || r.n} (${r.s})` : r.tid === 'cr' ? (r.s === 'BTC-BRL' ? 'em reais' : 'em US$') : api.subtitulo(r.s, r.n, r.cc);
      return `<tr data-m2-sym="${esc(r.s)}" data-name="${esc(r.n)}" class="${r.s === sel.s && !editando ? 'on' : ''}${q && ok(q.v) && !q.live ? ' old' : ''}" tabindex="${editando ? -1 : 0}">
          <td title="${esc(sub ? r.n + ' · ' + sub : r.n)}"><span class="m2-at">${editando ? `<button type="button" class="m2-alca" data-m2-alca aria-label="Mover ${esc(r.n)} (setas para cima e para baixo)" title="Arraste para mudar a ordem">⠿</button>` : ''}${marcaItem(r)}<b>${esc(r.n)}</b></span></td>
          ${editando ? `<td class="n"></td>
          <td class="n num" data-m2-px="${esc(r.s)}">${preco(r.s, q, r.d)}</td>
          <td class="n"><button type="button" class="m2-tirar" data-m2-tirar="${esc(r.s)}" aria-label="Tirar ${esc(r.n)} da lista" title="Tirar da lista">✕</button></td></tr>` : `<td class="n num ${lado(q?.c)}" data-m2-ch="${esc(r.s)}">${api.pct(q?.c)}</td>
          <td class="n num ${lado(q?.c)}" data-m2-abs="${esc(r.s)}">${absVar(r.s, q, r.d)}</td>
          <td class="n num" data-m2-px="${esc(r.s)}">${preco(r.s, q, r.d)}</td></tr>`}`;
    }).join('');
    const vazia = !atual.l.length ? `<tr class="m2-vaziar"><td colspan="4">Lista vazia. ${editando ? 'Use "Adicionar ativo" abaixo.' : 'Clique em Editar para pôr ativos.'}</td></tr>` : '';
    let rodape = '';
    if (editando) {
      const ja = new Set(atual.l.map((r) => r.s)), q = busca.trim().toLowerCase();
      const sem = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const opc = catalogo().filter((x) => !ja.has(x.s) && (q ? sem(x.n + ' ' + x.s + ' ' + x.grupo + ' ' + (x.nomeLongo || '')).includes(sem(q)) : !x.eua || PADRAO_EUA.acoes.includes(x.s) || PADRAO_EUA.etfs.includes(x.s))).slice(0, 200);
      const grupos = [...new Set(opc.map((x) => x.grupo))];
      rodape = `<div class="m2-ed">${adicionando ? `<div class="m2-add"><input type="search" class="m2-busca" data-m2-busca placeholder="Buscar (ex.: DAX, ouro, Apple, NVDA, SPY)" value="${esc(busca)}" aria-label="Buscar ativo para adicionar" autocomplete="off">
          <div class="m2-opc">${grupos.length ? grupos.map((g) => `<div class="m2-grp">${esc(g)}</div>${opc.filter((x) => x.grupo === g).map((x) => `<button type="button" data-m2-por="${esc(x.s)}">${marcaItem(x)}<span>${esc(x.n)}${x.eua ? ` <small>${esc(x.s)}</small>` : ''}</span><em>+</em></button>`).join('')}`).join('') : '<p class="m2-vazio">Nada encontrado.</p>'}</div></div>` : ''}
        <div class="m2-ed-acoes"><button type="button" class="m2-btn" data-m2-adicionar aria-expanded="${adicionando}">${adicionando ? 'Fechar a lista' : '+ Adicionar ativo'}</button>${atual.propria ? '<button type="button" class="m2-link" data-m2-restaurar>Restaurar a lista padrão</button>' : ''}</div></div>`;
    }
    return `${tabs}<div class="m2-lista${editando ? ' editando' : ''}"><table class="m2-tb"><thead><tr>${editando ? '<th>Ativo</th><th class="n"></th><th class="n">Último</th><th class="n"></th>' : cabCol('nome', 'Ativo', '') + cabCol('pct', 'Var. %', 'n') + cabCol('abs', 'Var.', 'n') + cabCol('px', 'Último', 'n')}</tr></thead><tbody>${linhas}${vazia}</tbody></table>${rodape}</div>`;
  }
  // título de coluna que ordena (botão dentro do th; aria-sort diz a ordem atual)
  function cabCol(k, rot, cls) {
    const on = !editando && ordem && ordem.k === k, dir = on ? (ordem.d < 0 ? 'descending' : 'ascending') : 'none';
    const prox = !on ? (k === 'nome' ? 'de A a Z' : 'do maior para o menor') : ordem.d === (k === 'nome' ? 1 : -1) ? (k === 'nome' ? 'de Z a A' : 'do menor para o maior') : 'na ordem da lista';
    return `<th class="${cls}" aria-sort="${dir}"><button type="button" class="m2-ord${on ? ' on' : ''}" data-m2-ord="${k}" title="Ordenar ${prox}">${rot}<span class="m2-seta" aria-hidden="true">${on ? (ordem.d < 0 ? '▼' : '▲') : '↕'}</span></button></th>`;
  }
  // ordena uma cópia (a lista guardada não muda); sem cotação vai para o fim; editando, sempre a ordem da lista
  function ordenar(l) {
    if (!ordem || editando) return l;
    const val = (r) => {
      if (ordem.k === 'nome') return r.n;
      const q = cot(r.s); if (!q || !ok(q.v)) return null;
      if (ordem.k === 'px') return q.v;
      if (!ok(q.c) || q.c <= -100) return null;
      return ordem.k === 'pct' ? q.c : q.v - q.v / (1 + q.c / 100);
    };
    return l.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1;
      const c = ordem.k === 'nome' ? String(a.v).localeCompare(String(b.v), 'pt-BR') : a.v - b.v;
      return c ? c * ordem.d : a.i - b.i;
    }).map((x) => x.r);
  }
  // ordem atual das linhas na tela (depois de arrastar)
  const ordemTela = () => [...(root?.querySelectorAll('[data-m2="seletor"] tbody tr[data-m2-sym]') || [])].map((tr) => tr.dataset.m2Sym);
  function mudouLista(syms) { salvarAba(aba, syms); trocar('seletor', seletorHTML()); }
  // arrastar pela alça: a linha segue o ponteiro e troca de lugar com as vizinhas
  let arrasto = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest?.('[data-m2-alca]'); if (!h || !root?.contains(h)) return;
    e.preventDefault();
    const tr = h.closest('tr'); arrasto = { tr, id: e.pointerId }; tr.classList.add('arrastando');
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const corpo = arrasto.tr.parentElement, irmas = [...corpo.querySelectorAll('tr[data-m2-sym]')].filter((x) => x !== arrasto.tr);
    const depois = irmas.find((x) => { const b = x.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (depois) { if (arrasto.tr.nextElementSibling !== depois) corpo.insertBefore(arrasto.tr, depois); } else if (corpo.lastElementChild !== arrasto.tr) corpo.appendChild(arrasto.tr);
    const lista = corpo.closest('.m2-lista'), b = lista.getBoundingClientRect();
    if (e.clientY < b.top + 30) lista.scrollTop -= 8; else if (e.clientY > b.bottom - 30) lista.scrollTop += 8;
  });
  const soltar = (e) => { if (!arrasto || (e && e.pointerId !== arrasto.id)) return; arrasto.tr.classList.remove('arrastando'); arrasto = null; salvarAba(aba, ordemTela()); };
  document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);


  // Pulso global: vidro fosco sobre um fundo de luzes; o brilho de cada quadro cresce com o tamanho do movimento
  // Pulso global (13/11/2026): verde e vermelho do site, fundo levemente tingido conforme o tamanho do movimento,
  // bandeira ou ícone ao lado do nome
  function pulsoHTML() {
    return `${cab('Pulso global', 'vazio', '<span class="m2-hint">variação do dia</span>')}<div class="m2-pulso">${PULSO.map(([s, n, m]) => {
      const q = cot(s), tnx = s === '^TNX', c = q?.c, f = ok(c) ? Math.min(1, Math.abs(c) / (tnx ? 3 : 2)) : 0;
      const valor = tnx ? (q && ok(q.v) ? api.nf(q.v, 2) + '%' : '—') : api.pct(c);
      return `<button type="button" class="m2-vidro ${lado(c)}" style="--f:${f.toFixed(2)}" data-m2-sym="${esc(s)}" data-name="${esc(n)}" title="Ver ${esc(n)} no gráfico">
        <span class="m2-vn">${marcaPulso(s, n, m)}${esc(n)}</span><b class="num" ${tnx ? `data-m2-pxt="${esc(s)}"` : `data-m2-pc="${esc(s)}"`}>${valor}</b>${tnx ? `<small class="${lado(c)}">${ok(c) ? api.pct(c) + ' no dia' : '&nbsp;'}</small>` : ''}</button>`;
    }).join('')}</div>`;
  }


  // Juros (13/11/2026): a mesma curva da Mesa 1 (DI, Real, Pré e IPCA+, comparação, inclinação e tabela dos
  // contratos); os cliques e os dados seguem pelo mesa.js, que acha a caixa pela classe ms-curvebox
  function jurosHTML() { return api.curveHTML(); }

  // Notícias do ativo escolhido (manchetes do terminal que citam o ativo); sem nenhuma, as últimas do terminal
  function noticiasHTML() {
    const todas = typeof newsAll !== 'undefined' && Array.isArray(newsAll) ? newsAll : [];
    const termos = (window.MMRadar?.termos(sel.s) || []).concat(sel.n.split(' (')[0]).filter((x, i, a) => x && a.indexOf(x) === i);
    let lista = todas.filter((n) => n && n.titulo && window.MMRadar?.cita(n.titulo, termos)).sort((a, b) => b.data - a.data).slice(0, 6), geral = false;
    if (!lista.length) { lista = [...todas].sort((a, b) => b.data - a.data).slice(0, 6); geral = true; }
    const hora = (ms) => { const d = new Date(ms), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
    const fonte = (n) => (n.fonte === 'Google News' ? n.veiculo || n.fonte : n.fonte || '');
    return `${cab(`Notícias · ${esc(sel.n.split(' (')[0])}`, 'ouro', '<button type="button" class="m2-link" data-go="news-panel">Ver todas</button>')}
      <div class="m2-news">${geral && todas.length ? `<p class="m2-aviso">Sem manchetes recentes sobre ${esc(sel.n.split(' (')[0])}. Últimas do terminal:</p>` : ''}${lista.length ? lista.map((n, i) => `<a href="${esc(n.link || '#')}" target="_blank" rel="noopener" class="${i === 0 && !geral ? 'top' : ''}">
        <b>${esc(n.titulo)}</b><small><span class="num">${hora(n.data)}</span> · ${esc(fonte(n))}</small></a>`).join('') : '<p class="m2-vazio">Carregando notícias…</p>'}</div>`;
  }

  /* ---------- Radar do Copom (copom/copom.json): o que as opções de Copom da B3 precificam para a próxima reunião ---------- */
  let copom = null, copomTs = 0, copomBusca = null;
  function buscarCopom() {
    if (copomBusca || Date.now() - copomTs < 30 * 60000) return;
    copomBusca = (async () => {
      for (const u of ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/copom/copom.json', 'copom/copom.json']) {
        try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue; copom = await r.json(); copomTs = Date.now(); trocar('radar', radarHTML()); return; } catch (e) { /* próxima */ }
      }
    })().finally(() => { copomBusca = null; });
  }
  function radarHTML() {
    buscarCopom();
    const t = 'Radar do Copom';
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const r = copom && (copom.reunioes || []).find((x) => x.data >= hoje && x.hist && x.hist.length);
    if (!r) return cab(t, 'ouro') + `<div class="m2-body"><p class="m2-vazio">${copom ? 'Sem reunião com preços na B3 agora.' : 'Carregando as opções de Copom da B3…'}</p></div>`;
    const ult = r.hist[r.hist.length - 1], p = ult.p || {};
    const cen = Object.entries(p).map(([k, v]) => ({ bps: +k, p: +v })).filter((x) => ok(x.bps) && ok(x.p));
    const soma = cen.reduce((s, x) => s + x.p, 0) || 1;
    const top = [...cen].sort((a, b) => b.p - a.p).slice(0, 4).sort((a, b) => a.bps - b.bps);
    const nome = (b) => (b === 0 ? 'Manutenção' : `${b < 0 ? 'Corte' : 'Alta'} de ${api.nf(Math.abs(b) / 100, 2)} pp`);
    const esperada = ok(copom.selic) ? copom.selic + cen.reduce((s, x) => s + x.bps / 100 * x.p / soma, 0) : null;
    const corte = r.hist.slice(-20).map((h) => Object.entries(h.p || {}).reduce((s, [k, v]) => s + (+k < 0 ? +v : 0), 0));
    const dias = Math.max(0, Math.round((Date.parse(r.data + 'T12:00:00Z') - Date.now()) / 864e5));
    const mxp = Math.max(...top.map((x) => x.p), 1);
    return cab(t, 'ouro', `<span class="m2-hint">${esc(r.data.split('-').reverse().slice(0, 2).join('/'))} · em ${dias} dia${dias === 1 ? '' : 's'}</span>`) + `<div class="m2-body m2-radar">
      <div class="m2-radar-top"><div><small>Selic hoje</small><b class="num">${ok(copom.selic) ? api.nf(copom.selic, 2) + '%' : '—'}</b></div><div><small>Selic esperada</small><b class="num ouro">${ok(esperada) ? api.nf(esperada, 2) + '%' : '—'}</b></div>
        <div class="m2-radar-sp"><small>Chance de corte, 20 pregões</small>${spark(corte, corte.length > 1 ? corte[corte.length - 1] - corte[0] : 0)}</div></div>
      ${top.map((x) => `<div class="m2-cen"><span>${nome(x.bps)}</span><div class="m2-bar"><i class="${x.bps < 0 ? 'dn' : x.bps > 0 ? 'up' : 'eq'}" style="width:${Math.max(2, x.p / mxp * 100).toFixed(0)}%"></i></div><b class="num">${api.nf(x.p / soma * 100, 0)}%</b></div>`).join('')}
      <small class="m2-fonte">Opções de Copom da B3 · ${esc(ult.d.split('-').reverse().join('/'))}</small><button type="button" class="m2-link" data-go="analysis-panel">Copom e Fed completos</button></div>`;
  }

  /* ---------- próximo evento da agenda (mesmo feed do Calendário, app.js) ---------- */
  const PAIS = { USD: ['us', 'EUA'], EUR: ['eu', 'Zona do euro'], CNY: ['cn', 'China'], GBP: ['gb', 'Reino Unido'], BRL: ['br', 'Brasil'], JPY: ['jp', 'Japão'] };
  let agendaPedida = false;
  function agenda() {
    const f = window.__calFeed || [];
    if (!f.length && !agendaPedida && typeof loadCalendarFeed === 'function') {
      agendaPedida = true;
      // eslint-disable-next-line no-undef
      loadCalendarFeed().then((d) => { if (Array.isArray(d) && d.length) window.__calFeed = d; else if (typeof calFeed !== 'undefined' && calFeed) window.__calFeed = calFeed; trocar('evento', eventoHTML()); }).catch(() => {});
    }
    const agora = Date.now();
    return f.filter((e) => e && e.date && !/T00:00:00-/.test(e.date) && PAIS[e.country] && (e.impact === 'High' || e.impact === 'Medium' && e.country === 'BRL'))
      .map((e) => ({ ...e, t: Date.parse(e.date) })).filter((e) => isFinite(e.t) && e.t > agora).sort((a, b) => a.t - b.t);
  }
  const relogio = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); return (d ? d + 'd ' : '') + [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
  function eventoHTML() {
    const L = agenda(), e = L[0];
    if (!e) return cab('Próximo evento', 'vazio') + '<div class="m2-body m2-ev"><p class="m2-vazio">Carregando a agenda…</p><button type="button" class="m2-link" data-go="calendar-panel">Abrir o Calendário</button></div>';
    const quando = (t) => new Date(t).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const imp = e.impact === 'High' ? 3 : 2, [pf, pn] = PAIS[e.country];
    const janela = 24 * 3600000, prog = Math.max(0.02, Math.min(1, 1 - (e.t - Date.now()) / janela));
    return cab('Próximo evento', 'vazio', `<span class="m2-imp" title="Impacto ${imp === 3 ? 'alto' : 'médio'}">${'<i></i>'.repeat(imp)}${'<i class="off"></i>'.repeat(3 - imp)}</span>`) + `<div class="m2-body m2-ev">
      <span class="m2-relogio num" data-m2-t="${e.t}">${relogio(e.t - Date.now())}</span>
      <b class="m2-ev-t"><img src="bandeiras/${pf}.webp" width="14" height="14" alt="">${esc(pn)}: ${esc(e.title)}</b>
      <small>${esc(quando(e.t))}${e.forecast ? ` · previsão <b>${esc(e.forecast)}</b>` : ''}${e.previous ? ` · anterior ${esc(e.previous)}` : ''}</small>
      <div class="m2-prog" aria-hidden="true"><i style="width:${(prog * 100).toFixed(0)}%" data-m2-prog="${e.t}"></i></div>
      ${L.slice(1, 3).map((x) => `<div class="m2-ev-prox"><span class="num">${esc(new Date(x.t).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }))}</span>${esc(PAIS[x.country][1])}: ${esc(x.title)}</div>`).join('')}
      <button type="button" class="m2-link" data-go="calendar-panel">Abrir o Calendário</button></div>`;
  }

  /* ---------- estrangeiro na B3 (fluxo/fluxo.json, a mesma base da aba Fluxo) ---------- */
  let fluxo = null, fluxoTs = 0, fluxoBusca = null;
  function buscarFluxo() {
    if (fluxoBusca || Date.now() - fluxoTs < 30 * 60000) return;
    fluxoBusca = (async () => {
      for (const u of ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fluxo/fluxo.json', 'fluxo/fluxo.json']) {
        try {
          const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue;
          const j = await r.json(), dias = j.dias || [], ult = dias[dias.length - 1];
          const meses = Object.entries(j.meses || {}).sort(([a], [b]) => a.localeCompare(b)), mes = meses[meses.length - 1];
          const ano = ult ? ult.data.slice(0, 4) : '', saldo = (t) => t?.estrangeiro?.saldo;
          fluxo = { data: ult?.data, dia: saldo(ult?.tipos), mes: saldo(mes?.[1]?.tipos), ano: meses.filter(([m]) => m.startsWith(ano)).reduce((s, [, m]) => s + (saldo(m.tipos) || 0), 0),
            serie: dias.slice(-20).map((d) => ({ d: d.data, v: saldo(d.tipos) })).filter((x) => ok(x.v)) };
          fluxoTs = Date.now(); trocar('fluxo', fluxoHTML()); return;
        } catch (e) { /* próxima */ }
      }
    })().finally(() => { fluxoBusca = null; });
  }
  const bi = (mil) => (ok(mil) ? `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${api.nf(Math.abs(mil / 1e6), 2)} bi` : '—');
  function fluxoHTML() {
    buscarFluxo();
    if (!fluxo) return cab('Estrangeiro na B3', 'vazio') + '<div class="m2-body"><p class="m2-vazio">Carregando o boletim da B3…</p></div>';
    const linhas = [[`Dia ${fluxo.data ? fluxo.data.slice(8, 10) + '/' + fluxo.data.slice(5, 7) : ''}`, fluxo.dia], ['No mês', fluxo.mes], ['No ano', fluxo.ano]];
    const mx = Math.max(1, ...linhas.map(([, v]) => Math.abs(v || 0))), S = fluxo.serie, smx = Math.max(1, ...S.map((x) => Math.abs(x.v)));
    // colunas do saldo diário: para cima compra, para baixo venda, a partir da linha do meio
    const bw = 200 / Math.max(S.length, 1);
    const colunas = S.length ? `<svg class="m2-colunas" viewBox="0 0 200 56" preserveAspectRatio="none" role="img" aria-label="Saldo diário do investidor estrangeiro nos últimos ${S.length} pregões"><line x1="0" x2="200" y1="28" y2="28"/>${S.map((x, k) => { const h = Math.max(1.5, Math.abs(x.v) / smx * 26); return `<rect class="${lado(x.v)}" x="${(k * bw + bw * 0.18).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" y="${(x.v >= 0 ? 28 - h : 28).toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(x.d.split('-').reverse().join('/'))}: ${esc(bi(x.v))}</title></rect>`; }).join('')}</svg>` : '';
    return cab('Estrangeiro na B3', 'vazio', '<span class="m2-hint">ações à vista</span>') + `<div class="m2-body m2-fluxo">${linhas.map(([r, v]) => `<div class="m2-fl"><span>${esc(r)}</span><div class="m2-bar"><i class="${lado(v)}" style="width:${Math.max(2, Math.abs(v || 0) / mx * 100).toFixed(0)}%"></i></div><b class="num ${lado(v)}">${bi(v)}</b></div>`).join('')}
      ${colunas}<small class="m2-fonte">Saldo diário dos últimos ${S.length} pregões · a B3 divulga com cerca de 2 pregões de atraso.</small></div>`;
  }

  /* ---------- a Mesa 2 inteira ---------- */
  const caixa = (id, cls, conteudo, rotulo) => `<section class="m2-box ${cls}" data-m2="${id}" aria-label="${rotulo}">${conteudo}</section>`;
  function html(a) {
    api = a;
    return `<div class="m2">
      ${caixa('grafico', 'm2-c-graf', graficoHTML(), 'Gráfico do ativo escolhido')}
      ${caixa('seletor', 'm2-c-sel', seletorHTML(), 'Seletor de ativos')}
      ${caixa('pulso', 'm2-c-pulso', pulsoHTML(), 'Pulso global')}
      ${caixa('juros', 'm2-c-juros ms-curvebox', jurosHTML(), 'Curva de juros')}
      ${caixa('noticias', 'm2-c-news', noticiasHTML(), 'Notícias do ativo escolhido')}
      ${caixa('radar', 'm2-c-radar', radarHTML(), 'Radar do Copom')}
      ${caixa('evento', 'm2-c-ev', eventoHTML(), 'Próximo evento')}
      ${caixa('fluxo', 'm2-c-fluxo', fluxoHTML(), 'Estrangeiro na B3')}
    </div>`;
  }
  function trocar(id, conteudo) {
    const b = root && root.querySelector(`[data-m2="${id}"]`); if (!b) return;
    if (id === 'seletor') { const l = b.querySelector('.m2-lista'), st = l ? l.scrollTop : 0; b.innerHTML = conteudo; const n = b.querySelector('.m2-lista'); if (n) n.scrollTop = st; return; }
    b.innerHTML = conteudo;
    if (id === 'grafico') montarGrafico(b);
    if (id === 'juros') requestAnimationFrame(() => api.drawCurve());
  }
  // chamado pelo mesa.js logo depois de pôr html() na página
  function depois(r) {
    root = r;
    const g = root.querySelector('[data-m2="grafico"]'); if (g) montarGrafico(g);
    if (Date.now() - euaTs > 15000) setTimeout(() => { buscarEua(); setTimeout(() => atualizar('seletor'), 1500); }, 0);
    requestAnimationFrame(() => api.drawCurve());
    root.querySelector('.m2-lista tr.on')?.scrollIntoView({ block: 'nearest' });
  }
  function escolher(s, n) {
    if (!s) return;
    sel = { s, n: String(n || s).slice(0, 60) }; gravar(SEL_KEY, sel);
    trocar('grafico', graficoHTML()); trocar('noticias', noticiasHTML());
    root?.querySelectorAll('[data-m2-sym]').forEach((el) => el.classList.toggle('on', el.dataset.m2Sym === s));
  }
  document.addEventListener('click', (e) => {
    if (!root || !root.contains(e.target)) return;
    const pb = e.target.closest('[data-m2-per]');
    if (pb) { per = pb.dataset.m2Per; gravar(PER_KEY, per); root.querySelectorAll('[data-m2-per]').forEach((b) => b.setAttribute('aria-pressed', String(b === pb))); const g = root.querySelector('[data-m2="grafico"]'); if (g) { g.querySelector('.m2-graf')?.replaceWith(Object.assign(document.createElement('div'), { className: 'm2-graf-slot' })); montarGrafico(g); } return; }
    const t = e.target.closest('[data-m2-aba]');
    if (t) { aba = t.dataset.m2Aba; gravar(ABA_KEY, aba); setTimeout(() => { buscarEua(); setTimeout(() => atualizar('seletor'), 1200); }, 0); adicionando = false; busca = ''; trocar('seletor', seletorHTML()); root.querySelector('[data-m2="seletor"] .m2-lista')?.scrollTo(0, 0); return; }
    const ob = e.target.closest('[data-m2-ord]');
    if (ob) {
      // 1º clique: maior → menor (nome: A → Z); 2º: o contrário; 3º: ordem da lista
      const k = ob.dataset.m2Ord, ini = k === 'nome' ? 1 : -1;
      ordem = !ordem || ordem.k !== k ? { k, d: ini } : ordem.d === ini ? { k, d: -ini } : null;
      gravar(ORD_KEY, ordem); trocar('seletor', seletorHTML());
      root.querySelector(`[data-m2-ord="${k}"]`)?.focus(); return;
    }
    if (e.target.closest('[data-m2-editar]')) { editando = !editando; adicionando = false; busca = ''; trocar('seletor', seletorHTML()); return; }
    const tirar = e.target.closest('[data-m2-tirar]');
    if (tirar) { mudouLista(ordemTela().filter((s) => s !== tirar.dataset.m2Tirar)); return; }
    const por = e.target.closest('[data-m2-por]');
    if (por) { mudouLista([...ordemTela(), por.dataset.m2Por]); const l = root.querySelector('[data-m2="seletor"] tbody'); l?.lastElementChild?.scrollIntoView({ block: 'nearest' }); root.querySelector('[data-m2-busca]')?.focus(); return; }
    if (e.target.closest('[data-m2-adicionar]')) {
      adicionando = !adicionando; busca = ''; trocar('seletor', seletorHTML());
      if (adicionando) { const lst = root.querySelector('[data-m2="seletor"] .m2-lista'); if (lst) lst.scrollTop = lst.scrollHeight; root.querySelector('[data-m2-busca]')?.focus({ preventScroll: true }); }
      return;
    }
    if (e.target.closest('[data-m2-restaurar]')) { restaurarAba(aba); trocar('seletor', seletorHTML()); return; }
    if (editando && e.target.closest('[data-m2="seletor"] tr')) return; // editando: clicar na linha não troca o gráfico
    const linha = e.target.closest('[data-m2-sym]');
    if (linha) { escolher(linha.dataset.m2Sym, linha.dataset.name); return; }
    if (e.target.closest('[data-m2-cheio]')) window.openAssetChart?.(sel.s, sel.n, [{ s: sel.s, n: sel.n }], null, 'mesa');
  });
  // busca do "Adicionar ativo": redesenha só a lista de opções
  document.addEventListener('input', (e) => {
    const b = e.target.closest?.('[data-m2-busca]'); if (!b || !root?.contains(b)) return;
    busca = b.value; const pos = b.selectionStart; trocar('seletor', seletorHTML());
    const lst = root.querySelector('[data-m2="seletor"] .m2-lista'); if (lst) lst.scrollTop = lst.scrollHeight; // resultados à vista
    const n = root.querySelector('[data-m2-busca]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* ok */ } }
  });
  document.addEventListener('keydown', (e) => {
    // alça com o teclado: setas para cima e para baixo mudam a ordem
    const h = e.target.closest?.('[data-m2-alca]');
    if (h && root?.contains(h) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault(); const L = ordemTela(), s = h.closest('tr').dataset.m2Sym, i = L.indexOf(s), j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; mudouLista(L);
      root.querySelector(`[data-m2="seletor"] tr[data-m2-sym="${CSS.escape(s)}"] [data-m2-alca]`)?.focus(); return;
    }
    if (!root || (e.key !== 'Enter' && e.key !== ' ')) return;
    const linha = e.target.closest?.('tr[data-m2-sym]'); if (!linha || !root.contains(linha) || editando || e.target.closest('input, button')) return;
    e.preventDefault(); escolher(linha.dataset.m2Sym, linha.dataset.name);
  });
  // a cada 2 s: preços e variações ao vivo (câmbio, cripto) sem redesenhar; relógio e barra do próximo evento
  setInterval(() => {
    if (!root || !root.isConnected || document.hidden || !api) return;
    root.querySelectorAll('[data-m2-px]').forEach((el) => {
      const s = el.dataset.m2Px, q = cot(s); if (!q || !ok(q.v)) return;
      const grande = el.closest('.m2-preco'), txt = grande ? preco(s, q).replace(/^(R\$|US\$) /, '') : null;
      const novo = txt ?? preco(s, q, abas().flatMap((x) => x.l).find((r) => r.s === s)?.d);
      if (el.textContent !== novo) { el.textContent = novo; el.classList.remove('m2-pisca'); void el.offsetWidth; el.classList.add('m2-pisca'); }
    });
    root.querySelectorAll('[data-m2-abs]').forEach((el) => {
      const s = el.dataset.m2Abs, q = cot(s); if (!q || !ok(q.c) || editando) return;
      const r = abas().flatMap((x) => x.l).find((x) => x.s === s);
      el.textContent = absVar(s, q, r?.d); el.classList.remove('up', 'dn', 'eq', 'na'); el.classList.add(lado(q.c));
    });
    root.querySelectorAll('[data-m2-ch]').forEach((el) => {
      const q = cot(el.dataset.m2Ch); if (!q || !ok(q.c) || el.querySelector('button')) return; // editando: ali fica o ✕
      el.textContent = el.closest('.m2-tb') ? api.pct(q.c) : `${seta(q.c)} ${api.pct(q.c)}`; el.classList.remove('up', 'dn', 'eq', 'na'); el.classList.add(lado(q.c));
    });
    root.querySelectorAll('[data-m2-pc]').forEach((el) => {
      const q = cot(el.dataset.m2Pc); if (!q || !ok(q.c)) return;
      el.textContent = api.pct(q.c); const b = el.closest('.m2-vidro'); b.classList.remove('up', 'dn', 'eq', 'na'); b.classList.add(lado(q.c)); b.style.setProperty('--f', Math.min(1, Math.abs(q.c) / 2).toFixed(2));
    });
    root.querySelectorAll('[data-m2-pxt]').forEach((el) => { const q = cot(el.dataset.m2Pxt); if (q && ok(q.v)) el.textContent = api.nf(q.v, 2) + '%'; });
    root.querySelectorAll('[data-m2-t]').forEach((el) => { el.textContent = relogio(+el.dataset.m2T - Date.now()); });
    root.querySelectorAll('[data-m2-prog]').forEach((el) => { el.style.width = (Math.max(0.02, Math.min(1, 1 - (+el.dataset.m2Prog - Date.now()) / 864e5)) * 100).toFixed(1) + '%'; });
  }, 2000);
  // notícias novas chegam sem redesenhar a Mesa
  window.addEventListener('mm-news-ok', () => { if (root?.isConnected) trocar('noticias', noticiasHTML()); });

  const PAINEIS = { grafico: graficoHTML, seletor: seletorHTML, pulso: pulsoHTML, juros: jurosHTML, noticias: noticiasHTML, radar: radarHTML, evento: eventoHTML, fluxo: fluxoHTML };
  function atualizar(id) { if (root?.isConnected && api && PAINEIS[id]) trocar(id, PAINEIS[id]()); }
  // editando a lista: a Mesa não redesenha a cada 2 minutos (o mesa.js pergunta antes)
  const ocupado = () => !!(editando && root?.isConnected && !document.hidden);
  return { html, depois, escolher, atualizar, ocupado, limpaLista, PULSO, abas: () => (api ? abas() : []) };
})();
