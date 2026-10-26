/* Mercado Macro: vitrine da tela de login.
   Cotações reais pelo worker (/quotes), Selic e IPCA do Banco Central, fluxo da B3 e número de empresas
   pelos arquivos do robô no GitHub. Sem dado, mostra "—". Fotos do painel: /vitrine/fotos (robô vitrine.yml). */
(function () {
  'use strict';
  // de onde a pessoa chegou (só o site de origem), guardado na primeira página da visita; vai junto no pedido de acesso
  try { if (!sessionStorage.getItem('mm_origem')) { var qs = new URLSearchParams(location.search); sessionStorage.setItem('mm_origem', JSON.stringify({ ref: document.referrer, utm: qs.get('utm_source') || qs.get('origem') || '' })); } } catch (e) { /* sem armazenamento */ }
  var API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  // visitantes sem login usam o worker da segunda conta da Cloudflare (terminal/vitrine-worker);
  // se ele falhar, cai no worker principal
  var VT = 'https://mercadomacro-vitrine.cota-cotacao10.workers.dev';
  var okJson = function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  var RAW = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/';
  var reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------------- acesso (entrar / pedir acesso) ---------------- */
  var tE = $('t-entrar'), tC = $('t-cad'), fE = $('f-entrar'), fC = $('f-cad');
  function aba(cad, foco) {
    tE.setAttribute('aria-selected', !cad); tC.setAttribute('aria-selected', cad);
    $('p-entrar').hidden = cad; $('p-cad').hidden = !cad;
    $('auth-t').textContent = cad ? 'Peça seu acesso' : 'Entre no painel';
    $('auth-s').textContent = cad ? 'Leva menos de um minuto. A liberação é feita pelo administrador.' : 'Acesso exclusivo para usuários liberados.';
    if (foco) (cad ? fC : fE).querySelector('input').focus({ preventScroll: true });
  }
  tE.onclick = function () { aba(false, true); };
  tC.onclick = function () { aba(true, true); };
  if (location.hash === '#cadastrar') { aba(true); setTimeout(function () { $('acesso').scrollIntoView({ block: 'start' }); }, 50); }
  document.querySelectorAll('[data-ir]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('pronto').hidden = true; $('forms').hidden = false;
      aba(b.dataset.ir === 'cadastrar', false);
      var card = $('acesso');
      card.scrollIntoView({ behavior: reduz ? 'auto' : 'smooth', block: 'center' });
      setTimeout(function () { (b.dataset.ir === 'cadastrar' ? fC : fE).querySelector('input').focus({ preventScroll: true }); }, reduz ? 0 : 450);
    });
  });
  function enviar(form, rota, ok) {
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var msg = form.querySelector('.vt-msg'), bt = form.querySelector('.vt-enviar');
      var dados = {}; new FormData(form).forEach(function (v, k) { dados[k] = v; });
      if (rota === 'cadastrar') try { var o = JSON.parse(sessionStorage.getItem('mm_origem') || '{}'); dados.ref = o.ref || ''; dados.utm = o.utm || ''; } catch (e) { /* sem origem */ }
      msg.className = 'vt-msg'; msg.textContent = ''; bt.disabled = true;
      fetch('/api/auth/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados), credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
        .then(function (x) { if (x.r.ok) ok(x.j); else { msg.className = 'vt-msg erro'; msg.textContent = x.j.erro || 'Não foi possível. Tente de novo.'; } })
        .catch(function () { msg.className = 'vt-msg erro'; msg.textContent = 'Sem conexão. Tente de novo.'; })
        .then(function () { bt.disabled = false; });
    };
  }
  enviar(fE, 'entrar', function () {
    var v = new URLSearchParams(location.search).get('volta') || '/';
    location.replace(/^\/(?!\/)/.test(v) ? v : '/');
  });
  enviar(fC, 'cadastrar', function (j) {
    if (j.confirmar) { $('pronto-tit').textContent = 'Confirme seu e-mail'; $('pronto-txt').textContent = j.msg; }
    $('forms').hidden = true; $('pronto').hidden = false; fC.reset(); conviteCanal(); });
  // convite para o canal do Telegram, com o último fechamento gravado como amostra (sem dado, só o convite)
  function conviteCanal() {
    fetch('/api/publico/canal').then(okJson).then(function (j) {
      if (!j.canal) return;
      var f = j.fech, m = $('pronto-tg-msg');
      if (f && f.itens && f.itens.length) {
        var casasDe = function (n) { return /lar|Euro/.test(n) ? 4 : 2; };
        m.innerHTML = '<b>Fechamento de ' + esc(f.dia.slice(8, 10) + '/' + f.dia.slice(5, 7)) + ' no canal</b>' + f.itens.map(function (x) {
          var ch = typeof x.ch === 'number' && isFinite(x.ch) ? x.ch : null;
          return '<div><span>' + esc(x.nome) + '</span><span>' + num(x.v, casasDe(x.nome)) + ' <span class="' + (ch == null ? '' : tom(ch)) + '">' + (ch == null ? '—' : pct(ch)) + '</span></span></div>';
        }).join('');
        m.hidden = false;
      }
      $('pronto-tg').hidden = false;
    }).catch(function () { /* sem convite */ });
  }
  $('voltar').onclick = function () { $('pronto').hidden = true; $('forms').hidden = false; aba(false, true); };

  /* ---------------- formatação ---------------- */
  function num(v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function casas(v) { return Math.abs(v) >= 10000 ? 0 : Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 2 : 4; }
  function pct(v) { return isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 2) + '%' : '—'; }
  function tom(v) { return !isFinite(v) || v === 0 ? 'neu' : v > 0 ? 'pos' : 'neg'; }
  function spark(c, up, w, h) {
    if (!c || c.length < 2) return '<svg viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"></svg>';
    var mn = Math.min.apply(null, c), mx = Math.max.apply(null, c), r = mx - mn || 1;
    var pts = c.map(function (v, i) { return (i / (c.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - mn) / r * (h - 4)).toFixed(1); });
    var cor = up ? '#19d38f' : '#ff5c67', id = 'g' + Math.random().toString(36).slice(2, 8);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + cor + '" stop-opacity=".28"/><stop offset="1" stop-color="' + cor + '" stop-opacity="0"/></linearGradient></defs>'
      + '<path d="M0,' + h + ' L' + pts.join(' L') + ' L' + w + ',' + h + ' Z" fill="url(#' + id + ')"/>'
      + '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + cor + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }

  /* ---------------- cotações ---------------- */
  // [símbolo, nome, rótulo curto, prefixo]
  var BR = [['^BVSP', 'Ibovespa', 'IBOV'], ['PETR4.SA', 'Petrobras', 'PETR4', 'R$ '], ['VALE3.SA', 'Vale', 'VALE3', 'R$ '], ['ITUB4.SA', 'Itaú Unibanco', 'ITUB4', 'R$ '], ['BBAS3.SA', 'Banco do Brasil', 'BBAS3', 'R$ '], ['IFIX.SA', 'IFIX', 'Fundos imobiliários']];
  var MUNDO = [['^GSPC', 'S&P 500', 'EUA'], ['^IXIC', 'Nasdaq', 'EUA'], ['^DJI', 'Dow Jones', 'EUA'], ['^STOXX50E', 'Euro Stoxx 50', 'Europa'], ['^N225', 'Nikkei 225', 'Japão'], ['^VIX', 'VIX', 'Medo nos EUA']];
  var MC = [['BRL=X', 'Dólar', 'USD/BRL', 'R$ '], ['EURBRL=X', 'Euro', 'EUR/BRL', 'R$ '], ['DX-Y.NYB', 'DXY', 'Dólar no mundo'], ['BZ=F', 'Petróleo Brent', 'US$/barril', 'US$ '], ['GC=F', 'Ouro', 'US$/onça', 'US$ '], ['BTC-USD', 'Bitcoin', 'BTC', 'US$ '], ['ETH-USD', 'Ethereum', 'ETH', 'US$ ']];
  var PULSO = ['^BVSP', 'BRL=X', '^GSPC', 'BTC-USD', 'BZ=F', 'GC=F'];
  var TODOS = BR.concat(MUNDO, MC);
  var INFO = {}; TODOS.forEach(function (a) { INFO[a[0]] = a; });
  var Q = {}, ultima = 0;

  function parse(ch) {
    var r = ch && ch.chart && ch.chart.result && ch.chart.result[0];
    if (!r || !r.meta || !isFinite(r.meta.regularMarketPrice)) return null;
    var p = r.meta.regularMarketPrice, prev = r.meta.chartPreviousClose != null ? r.meta.chartPreviousClose : r.meta.previousClose;
    var cl = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter(function (v) { return v != null; });
    if (cl.length > 60) { var s = cl.length / 60, o = []; for (var i = 0; i < 60; i++) o.push(cl[Math.floor(i * s)]); o.push(cl[cl.length - 1]); cl = o; }
    return { v: p, ch: prev ? (p - prev) / prev * 100 : NaN, c: cl, t: r.meta.regularMarketTime ? r.meta.regularMarketTime * 1000 : 0 };
  }
  function fmtV(sym, q) {
    var a = INFO[sym], pre = (a && a[3]) || '';
    return q ? pre + num(q.v, sym === 'BRL=X' || sym === 'EURBRL=X' ? 4 : casas(q.v)) : '—';
  }
  // gráfico do dia parado (poucos pontos ou todos iguais, como o dólar à noite): usa o de 5 dias
  var S5 = {}, S5pedido = {};
  function parado(c) { if (!c || c.length < 8) return true; var mn = Math.min.apply(null, c), mx = Math.max.apply(null, c); return mx - mn < Math.abs(mx) * 1e-4; }
  // 5 dias: tira o trecho parado do fim (madrugada sem negócio) e tira a média de cada bloco, para a linha não ficar serrilhada
  function suave(c) {
    c = (c || []).slice();
    while (c.length > 2 && c[c.length - 1] === c[c.length - 2]) c.pop();
    var n = 48, out = [];
    if (c.length <= n) return c;
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * c.length / n), z = Math.floor((i + 1) * c.length / n), t = 0;
      for (var k = a; k < z; k++) t += c[k];
      out.push(t / (z - a));
    }
    out.push(c[c.length - 1]); // termina no último preço de verdade
    return out;
  }
  function completarParados() {
    PULSO.forEach(function (s) {
      if (!Q[s] || !parado(Q[s].c) || S5pedido[s]) return;
      S5pedido[s] = 1;
      fetch('/api/publico/serie?s=' + encodeURIComponent(s)).then(okJson).then(function (d) { var c = suave(d.c); if (c.length > 1 && !parado(c)) { S5[s] = c; desenhar([]); } }).catch(function () {});
    });
  }
  function carregarCotacoes() {
    var lista = encodeURIComponent(TODOS.map(function (a) { return a[0]; }).join(','));
    return fetch(VT + '/quotes?symbols=' + lista).then(okJson)
      .catch(function () { return fetch(API + '/quotes?mmp=vitrine&symbols=' + lista).then(okJson); })
      .then(function (d) {
        var novo = {};
        Object.keys(d).forEach(function (k) { var q = parse(d[k]); if (q) novo[k] = q; });
        if (!Object.keys(novo).length) throw new Error('sem dados');
        var mudou = [];
        Object.keys(novo).forEach(function (k) { if (Q[k] && Q[k].v !== novo[k].v) mudou.push(k); });
        Q = novo; ultima = Date.now();
        // o dia voltou a ter movimento: volta para o gráfico do dia
        Object.keys(S5).forEach(function (s) { if (Q[s] && !parado(Q[s].c)) { delete S5[s]; delete S5pedido[s]; } });
        desenhar(mudou); completarParados();
      })
      .catch(function () { if (!ultima) desenhar([]); });
  }
  function desenhar(mudou) {
    // fita
    var itens = TODOS.filter(function (a) { return Q[a[0]]; }).map(function (a) {
      var q = Q[a[0]];
      return '<span class="tk"><b>' + esc(a[1]) + '</b><span class="v">' + fmtV(a[0], q) + '</span><span class="' + tom(q.ch) + '">' + pct(q.ch) + '</span></span>';
    }).join('');
    var tape = $('tape');
    if (itens) { tape.innerHTML = itens + itens.replace(/class="tk"/g, 'class="tk" aria-hidden="true"'); tape.classList.toggle('run', !reduz); }
    else tape.innerHTML = '<span class="vt-tape-msg">Cotações indisponíveis no momento.</span>';
    // pulso do topo
    $('pulse').innerHTML = PULSO.map(function (s) {
      var a = INFO[s], q = Q[s];
      return '<div class="pc' + (mudou.indexOf(s) >= 0 ? ' flash' : '') + '"><div class="pc-n"><span>' + esc(a[1]) + '</span><span class="' + (q ? tom(q.ch) : 'neu') + '">' + (q ? pct(q.ch) : '—') + '</span></div>'
        + '<div class="pc-v">' + fmtV(s, q) + '</div>' + (S5[s] ? '<div title="Sem negócios agora: gráfico dos últimos 5 dias">' + spark(S5[s], q && q.ch >= 0, 200, 34) + '</div>' : spark(q && q.c, q && q.ch >= 0, 200, 34)) + '</div>';
    }).join('');
    // quadro
    [['col-br', BR], ['col-mundo', MUNDO], ['col-mc', MC]].forEach(function (x) {
      $(x[0]).innerHTML = x[1].map(function (a) {
        var q = Q[a[0]];
        return '<div class="rw"><div class="nm">' + esc(a[1]) + '<small>' + esc(a[2]) + '</small></div>' + spark(q && q.c, q && q.ch >= 0, 74, 26)
          + '<div class="px">' + fmtV(a[0], q) + '<span class="' + (q ? tom(q.ch) : 'neu') + '">' + (q ? pct(q.ch) : '—') + '</span></div></div>';
      }).join('');
    });
    var ts = Object.keys(Q).map(function (k) { return Q[k].t; }).filter(Boolean);
    $('hora-dados').textContent = ultima
      ? 'Cotações do Yahoo Finance, consultadas às ' + new Date(ultima).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. Cada ativo mostra o último preço do seu mercado; os fechados mostram o fechamento.'
      : 'Não foi possível buscar as cotações agora.';
  }
  // esqueleto enquanto carrega
  $('pulse').innerHTML = PULSO.map(function (s) { return '<div class="pc"><div class="pc-n"><span>' + esc(INFO[s][1]) + '</span></div><div class="pc-v"><span class="sk">000.000</span></div><svg viewBox="0 0 200 34"></svg></div>'; }).join('');
  carregarCotacoes();
  setInterval(function () { if (!document.hidden) carregarCotacoes(); }, 120000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - ultima > 120000) carregarCotacoes(); });

  /* ---------------- indicadores (Banco Central e B3) ---------------- */
  function bcb(c, n) {
    var direto = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + c + '/dados/ultimos/' + n + '?formato=json';
    var ok = function (r) { if (!r.ok) throw new Error(); return r.json(); };
    return fetch(VT + '/bcb?c=' + c + '&n=' + n).then(ok)
      .catch(function () { return fetch(API + '/bcb?mmp=vitrine&c=' + c + '&q=' + encodeURIComponent('/ultimos/' + n)).then(ok); })
      .catch(function () { return fetch(direto).then(ok); })
      .then(function (d) { if (!Array.isArray(d) || !d.length) throw new Error(); return d; });
  }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var macro = { selic: null, ipca: null, fluxoMes: null, fluxoAno: null };
  function bi(mil) { return (mil > 0 ? '+' : mil < 0 ? '−' : '') + 'R$ ' + num(Math.abs(mil) / 1e6, 1) + ' bi'; }
  function desenharMacro() {
    var m = macro;
    var c = [
      ['Selic', m.selic ? num(m.selic.v, 2) + '%' : '—', m.selic ? 'Meta ao ano, Banco Central' : 'Banco Central'],
      ['IPCA 12 meses', m.ipca ? num(m.ipca.v, 2) + '%' : '—', m.ipca ? 'Até ' + m.ipca.ref + ', IBGE' : 'IBGE'],
      ['Estrangeiro na B3 no mês', m.fluxoMes ? bi(m.fluxoMes.v) : '—', m.fluxoMes ? 'Saldo até ' + m.fluxoMes.ate + ', todos os mercados' : 'Boletim Diário da B3'],
      ['Estrangeiro na B3 no ano', m.fluxoAno ? bi(m.fluxoAno.v) : '—', m.fluxoAno ? 'Saldo de ' + m.fluxoAno.ano + ' até ' + m.fluxoAno.ate : 'Boletim Diário da B3']
    ];
    $('macro').innerHTML = c.map(function (x, i) {
      var cls = i >= 2 && x[1] !== '—' ? (x[1].charAt(0) === '+' ? ' pos' : ' neg') : '';
      return '<div class="mc"><div class="t">' + x[0] + '</div><div class="v' + cls + '">' + x[1] + '</div><div class="s">' + esc(x[2]) + '</div></div>';
    }).join('');
  }
  desenharMacro();
  bcb(432, 1).then(function (d) { macro.selic = { v: parseFloat(d[d.length - 1].valor) }; desenharMacro(); }).catch(function () {});
  bcb(13522, 1).then(function (d) {
    var x = d[d.length - 1], p = x.data.split('/');
    macro.ipca = { v: parseFloat(x.valor), ref: MESES[+p[1] - 1] + '/' + p[2] }; desenharMacro();
  }).catch(function () {});
  fetch(RAW + 'fluxo/fluxo.json').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
    var ks = Object.keys(d.meses || {}).sort(); if (!ks.length) return;
    var ult = ks[ks.length - 1], mes = d.meses[ult], e = mes && mes.tipos && mes.tipos.estrangeiro;
    var br = function (iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; };
    if (e && isFinite(e.saldo)) macro.fluxoMes = { v: e.saldo, ate: br(mes.ate) };
    var ano = ult.slice(0, 4), n = +ult.slice(5), soma = 0, ok = true;
    for (var i = 1; i <= n; i++) {
      var k = ano + '-' + (i < 10 ? '0' : '') + i, mm = d.meses[k];
      if (!mm || !mm.tipos || !mm.tipos.estrangeiro || !isFinite(mm.tipos.estrangeiro.saldo)) { ok = false; break; }
      soma += mm.tipos.estrangeiro.saldo;
    }
    if (ok) macro.fluxoAno = { v: soma, ano: ano, ate: br(mes.ate) };
    desenharMacro();
  }).catch(function () {});

  /* ---------------- por dentro do painel ---------------- */
  var TOUR = [
    ['mercado', 'fa-chart-bar', 'Mercado', 'O panorama completo em cartões: índices do mundo todo, Brasil, moedas, cripto, juros e commodities.',
      ['Gráfico do dia em cada cartão e histórico de 3 meses', 'Selic e IPCA com a próxima reunião do Copom', 'Clique em qualquer cartão para abrir o gráfico completo']],
    ['mesa', 'fa-th-large', 'Mesa', 'Uma tela só, densa como a de uma mesa de operações, para bater o olho e entender o dia.',
      ['Tabelas de índices, moedas e commodities lado a lado', 'Curva de juros do Tesouro, prefixada e IPCA+, com comparação de datas', 'Juros do Fed e Selic, risco-país (CDS) e as últimas notícias']],
    ['mapa', 'fa-th', 'Mapa de calor', 'Veja de uma vez quem sobe e quem cai, do Ibovespa ao Nasdaq e às criptomoedas.',
      ['Ibovespa, S&P 500, Nasdaq 100, Dow Jones e cripto', 'Períodos do dia ao ano, agrupado por setor', 'Tela cheia para acompanhar no monitor extra']],
    ['indicadores', 'fa-percentage', 'Indicadores', 'Economia do Brasil e dos EUA com séries oficiais e leitura do momento.',
      ['Juro real, Selic contra Fed, inflação contra a meta e curva dos EUA', 'Comparação com 20 anos de história', 'Projeções do Boletim Focus e detalhes do IBGE']],
    ['fundamentos', 'fa-building', 'Fundamentos', 'Balanços das empresas da B3, direto da CVM, e das empresas americanas.',
      ['Receita, lucro, margens, dívida e indicadores de valor', 'Séries anuais para ver a evolução da empresa', 'Busca de ações dos EUA']],
    ['calendario', 'fa-calendar-alt', 'Calendário', 'A agenda que move o mercado, com o que já saiu e o que vem por aí.',
      ['Agenda econômica do Brasil e do mundo, com o que saiu acima ou abaixo do esperado', 'Datas de balanço das empresas da B3 e dos EUA, e proventos', 'Boletim Focus semana a semana']],
    ['analises', 'fa-chart-line', 'Análises', 'O que os grandes investidores estão fazendo, com dados oficiais.',
      ['Posição dos especuladores em dólar, bolsas, juros e commodities (CFTC)', 'Carteiras dos grandes fundos dos EUA e quem tem cada ação (SEC 13F)', 'Fluxo do investidor estrangeiro na B3 e análise avançada dos ativos']],
    ['calculadora', 'fa-calculator', 'Calculadoras', 'Simuladores que recalculam na hora, enquanto você digita.',
      ['Renda fixa líquida de IR, com taxas do Tesouro Direto', 'Juros compostos, aposentadoria e financiamento SAC ou Price', 'Preço médio, risco por operação e inflação acumulada']],
    ['opcoes', 'fa-bullseye', 'Opções', 'Um laboratório completo para montar e entender estratégias com opções.',
      ['21 estratégias prontas para montar com um clique', 'Gráfico de resultado, gregas, cenários e chance de lucro', 'Volatilidade, cadeia teórica e trilha de estudo']],
    ['noticias', 'fa-newspaper', 'Notícias', 'As notícias que importam, de fontes do Brasil e do mundo, num só lugar.',
      ['Destaque para o que tem mais impacto no mercado', 'Resumo da semana para não perder nada', 'Clique e leia a notícia completa na fonte']]
  ];
  var tabs = $('tour-tabs'), img = $('tour-img'), txt = $('tour-txt'), prog = $('tour-prog'), atual = -1, timer = null, t0 = 0, DUR = 7000, pausado = false, visivel = false;
  tabs.innerHTML = TOUR.map(function (t, i) { return '<button type="button" role="tab" aria-selected="false" data-i="' + i + '"><i class="fas ' + t[1] + '" aria-hidden="true"></i>' + t[2] + '</button>'; }).join('');
  img.innerHTML = TOUR.map(function (t, i) { return '<img alt="Tela ' + esc(t[2]) + ' do Mercado Macro" data-src="/vitrine/fotos/' + t[0] + '.jpg" data-srcset="/vitrine/fotos/' + t[0] + '-720.webp 720w, /vitrine/fotos/' + t[0] + '.jpg 1440w" sizes="(max-width: 900px) 100vw, 860px" data-i="' + i + '" width="1440" height="900">'; }).join('') + '<div class="vazio" hidden>Imagem desta tela em preparação.</div>';
  img.querySelectorAll('img').forEach(function (im) { im.onerror = function () { im.dataset.erro = '1'; im.hidden = true; if (+im.dataset.i === atual) mostraVazio(true); }; });
  function mostraVazio(s) { img.querySelector('.vazio').hidden = !s; }
  // as fotos só baixam quando o tour chega perto da tela (a versão menor em webp vai para celulares)
  var perto = false;
  function carregaImg(i) {
    var im = img.querySelector('img[data-i="' + i + '"]');
    if (im && perto && !im.src) { im.srcset = im.dataset.srcset; im.src = im.dataset.src; }
    return im;
  }
  function ir(i) {
    atual = (i + TOUR.length) % TOUR.length;
    var t = TOUR[atual];
    tabs.querySelectorAll('button').forEach(function (b, k) { b.setAttribute('aria-selected', k === atual); });
    img.querySelectorAll('img').forEach(function (im) { im.classList.remove('on'); });
    var im = carregaImg(atual); im.classList.add('on'); mostraVazio(im.dataset.erro === '1');
    carregaImg(atual + 1 < TOUR.length ? atual + 1 : 0);
    $('tour-url').textContent = 'mercado macro · ' + t[2].toLowerCase();
    txt.innerHTML = '<div><h3>' + esc(t[2]) + '</h3><p>' + esc(t[3]) + '</p></div><ul>' + t[4].map(function (x) { return '<li><i class="fas fa-check" aria-hidden="true"></i>' + esc(x) + '</li>'; }).join('') + '</ul>';
    t0 = performance.now();
  }
  tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; ir(+b.dataset.i); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  var tour = document.querySelector('.vt-tour');
  tour.addEventListener('mouseenter', function () { pausado = true; });
  tour.addEventListener('mouseleave', function () { pausado = false; t0 = performance.now() - (parseFloat(prog.style.width) || 0) / 100 * DUR; });
  tour.addEventListener('focusin', function () { pausado = true; });
  function passo(agora) {
    if (!reduz && visivel && !pausado && !document.hidden) {
      var f = (agora - t0) / DUR;
      if (f >= 1) { ir(atual + 1); f = 0; }
      prog.style.width = (f * 100).toFixed(2) + '%';
    } else if (!visivel || document.hidden) t0 = agora - (parseFloat(prog.style.width) || 0) / 100 * DUR;
    timer = requestAnimationFrame(passo);
  }
  ir(0);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visivel = es[0].isIntersecting; }, { threshold: .35 }).observe(tour);
    var obPerto = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      perto = true; obPerto.disconnect(); carregaImg(atual); carregaImg(atual + 1 < TOUR.length ? atual + 1 : 0);
    }, { rootMargin: '600px 0px' });
    obPerto.observe(tour);
  } else { visivel = true; perto = true; carregaImg(atual); }
  timer = requestAnimationFrame(passo);

  /* ---------------- ferramentas ---------------- */
  var FEATS = [
    ['fa-chart-bar', 'Mercado', 'Índices, ações, moedas, cripto, juros e commodities com gráfico em cada cartão.'],
    ['fa-th-large', 'Mesa', 'Visão de mesa de operações: tabelas, curva de juros, risco-país e notícias.'],
    ['fa-star', 'Watchlist', 'Seus ativos favoritos reunidos, com gráfico de 3 meses.'],
    ['fa-th', 'Mapa de calor', 'Ibovespa, bolsas americanas e cripto coloridos por desempenho.'],
    ['fa-newspaper', 'Notícias', 'Fontes do Brasil e do mundo, com destaque para o que move preço.'],
    ['fa-book-open', 'Resumo semanal', 'O que aconteceu na semana, contado de forma direta.'],
    ['fa-calendar-alt', 'Calendário', 'Agenda econômica, datas de balanço do Brasil e dos EUA, proventos e Boletim Focus.'],
    ['fa-chart-line', 'Análises', 'Humor do mercado, comparador, fluxo na B3, posição dos especuladores e carteiras dos grandes fundos.'],
    ['fa-building', 'Fundamentos', 'Balanços da B3 pela CVM e das empresas americanas.'],
    ['fa-percentage', 'Indicadores', 'Brasil e EUA com séries oficiais e 20 anos de comparação.'],
    ['fa-calculator', 'Calculadoras', 'Renda fixa, juros compostos, aposentadoria, financiamento e mais.'],
    ['fa-bullseye', 'Opções', 'Montador de estratégias com gráfico de resultado, gregas e cenários.']
  ];
  $('feats').innerHTML = FEATS.map(function (f) { return '<div class="ft rv"><div class="ft-ic"><i class="fas ' + f[0] + '" aria-hidden="true"></i></div><h3>' + f[1] + '</h3><p>' + f[2] + '</p></div>'; }).join('');

  /* ---------------- celular ---------------- */
  var cel = new Image();
  cel.onload = function () { $('phone').style.backgroundImage = 'url(/vitrine/fotos/celular.jpg)'; };
  // só baixa a foto do celular quando ela chega perto da tela
  if ('IntersectionObserver' in window) {
    var obCel = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { obCel.disconnect(); cel.src = '/vitrine/fotos/celular.jpg'; } }, { rootMargin: '600px 0px' });
    obCel.observe($('phone'));
  } else cel.src = '/vitrine/fotos/celular.jpg';

  // quantas empresas têm balanço no painel (some se o dado não vier)
  fetch(RAW + 'fundamentos/index.json').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
    var n = Array.isArray(d.empresas) ? d.empresas.length : (d.empresas ? Object.keys(d.empresas).length : 0);
    if (n) { $('n-empresas').textContent = num(n, 0); $('li-empresas').hidden = false; }
  }).catch(function () {});

  /* ---------------- entrada suave das seções ---------------- */
  var alvos = document.querySelectorAll('.vt-sec-head, .vt-board, .vt-macro, .vt-tour, .ft, .vt-duo-txt, .vt-phone, .vt-fontes, .vt-cta');
  if (!reduz && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    alvos.forEach(function (el, i) { el.classList.add('rv'); if (el.classList.contains('ft')) el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
  }
})();
