/* =========================================================
   MERCADO NOVO (24/10/2026, no ar para todos): aba Mercado em cartões por região.
   Cada cartão tem bandeira, situação do pregão, um gráfico (1D, 5D, 3M) do ativo escolhido,
   uma frase calculada dos números e 4 linhas; clicar numa linha troca o gráfico.
   Ordem fixa: Ásia, Europa, EUA, Brasil, Juros, Moedas, Commodities e Cripto.
   Única visão da aba Mercado; o modo clássico selecionável saiu em 24/10/2026 (backup no ramo git backup-mercado-classico).
   A aba Mercado de sempre continua por baixo, escondida: ela traz os preços ao vivo, Selic, IPCA, Treasury 20 anos e minério.
   Fontes: lote /quotes e /history do worker (Yahoo). Sem dado, mostra "—"; a frase só aparece com números.
   ========================================================= */
(() => {
  if (window.__mercadoNovo) return;
  window.__mercadoNovo = true;
  const panel = document.getElementById('market-panel');
  if (!panel) return;
  const root = document.createElement('div');
  root.className = 'market-wrap mn-root';
  panel.prepend(root);
  panel.classList.add('mn-on');

  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = async (url, ms = 20000) => {
    const r = await fetchT(url, {}, ms);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pct = (v, d = 2) => { if (!ok(v)) return '—'; const r = +v.toFixed(d); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d).replace('.', ',')}%`; };
  const pb = (v) => { if (!ok(v)) return '—'; const r = Math.round(v); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} p.b.`; };
  const cls = (v) => (!ok(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq');

  /* ---------------- regiões ---------------- */
  // linhas: [símbolo Yahoo, nome, casas, prefixo]; mais: aparecem ao abrir o cartão (›)
  // sessão: fuso da bolsa e horário local de abertura e fechamento (sem feriados neste protótipo)
  // a B3 fecha às 17h enquanto vale o horário de verão nos EUA e às 18h no resto do ano
  const veraoEUA = (d = new Date()) => {
    const h = (tz) => +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d);
    return ((h('UTC') - h('America/New_York') + 24) % 24) === 4;
  };
  const ICON = {
    br: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#1f9e57"/><path d="M10 3.6 17 10l-7 6.4L3 10Z" fill="#f7d117"/><circle cx="10" cy="10" r="3.6" fill="#1d3f8f"/><path d="M6.6 9.3c2.3-.6 4.7-.3 6.8.9" stroke="#fff" stroke-width=".8" fill="none"/></svg>',
    us: '<svg viewBox="0 0 20 20"><clipPath id="mn-us"><circle cx="10" cy="10" r="10"/></clipPath><g clip-path="url(#mn-us)"><rect width="20" height="20" fill="#fff"/><path d="M0 0h20v1.54H0Zm0 3.08h20v1.54H0Zm0 3.08h20V7.7H0Zm0 3.08h20v1.54H0Zm0 3.08h20v1.54H0Zm0 3.08h20v1.54H0Zm0 3.08h20V20H0Z" fill="#c8323a"/><rect width="10" height="10.8" fill="#26387a"/></g></svg>',
    eu: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#1f3f99"/>' + Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(10 + 5.6 * Math.cos(a)).toFixed(2)}" cy="${(10 + 5.6 * Math.sin(a)).toFixed(2)}" r=".85" fill="#ffcc00"/>`; }).join('') + '</svg>',
    as: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#f3f3f3"/><circle cx="10" cy="10" r="4.6" fill="#d22f3c"/></svg>',
    ju: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#5b6cff"/><path d="M6.5 13.5 13.5 6.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="7" cy="7" r="1.6" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="13" cy="13" r="1.6" fill="none" stroke="#fff" stroke-width="1.4"/></svg>',
    co: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#b7791f"/><path d="M10 4.5c2.6 3 4 5 4 6.8a4 4 0 0 1-8 0c0-1.8 1.4-3.8 4-6.8Z" fill="#fff"/></svg>',
    mo: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#0f9a68"/><text x="10" y="14.4" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Arial, sans-serif">$</text></svg>',
    cr: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#f7931a"/><text x="10" y="14.2" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Arial, sans-serif">₿</text></svg>'
  };
  // os mesmos ativos da aba Mercado de sempre (MARKET_SECTIONS no app.js), agrupados por região.
  // linhas com @ vêm de fontes próprias da aba (BCB, FRED, rota do minério) e não têm gráfico
  const REGIOES = [
    { id: 'br', t: 'Brasil', tz: 'America/Sao_Paulo', ab: '10:00', fe: () => (veraoEUA() ? '17:00' : '18:00'), linhas: [['^BVSP', 'Ibovespa', 0], ['BRL=X', 'Dólar (USD/BRL)', 4, 'R$ '], ['IFIX.SA', 'IFIX', 0], ['PETR4.SA', 'Petrobras PN', 2, 'R$ ']],
      mais: [['VALE3.SA', 'Vale', 2, 'R$ '], ['ITUB4.SA', 'Itaú PN', 2, 'R$ '], ['BBAS3.SA', 'Banco do Brasil', 2, 'R$ '], ['@selic', 'Selic', 2], ['@ipca', 'IPCA (12 meses)', 2]] },
    { id: 'us', t: 'Estados Unidos', tz: 'America/New_York', ab: '09:30', fe: '16:00', linhas: [['^GSPC', 'S&P 500', 2], ['^IXIC', 'Nasdaq', 2], ['^DJI', 'Dow Jones', 2], ['^VIX', 'VIX (volatilidade)', 2]],
      mais: [['^NDX', 'Nasdaq 100', 2], ['^RUT', 'Russell 2000', 2]] },
    { id: 'mo', t: 'Moedas', tz: 'America/New_York', cme: true, linhas: [['DX-Y.NYB', 'Dólar Index (DXY)', 2], ['BRL=X', 'Dólar (USD/BRL)', 4, 'R$ '], ['EURUSD=X', 'Euro (EUR/USD)', 4, 'US$ '], ['GBPUSD=X', 'Libra (GBP/USD)', 4, 'US$ ']],
      mais: [['JPY=X', 'Iene (USD/JPY)', 2], ['EURBRL=X', 'Euro (EUR/BRL)', 4, 'R$ '], ['GBPBRL=X', 'Libra (GBP/BRL)', 4, 'R$ ']] },
    { id: 'eu', t: 'Europa', tz: 'Europe/Berlin', ab: '09:00', fe: '17:30', linhas: [['^STOXX50E', 'Euro Stoxx 50', 2], ['^GDAXI', 'DAX', 2], ['^FTSE', 'FTSE 100', 2], ['^FCHI', 'CAC 40', 2]], mais: [] },
    { id: 'as', t: 'Ásia', tz: 'Asia/Tokyo', ab: '09:00', fe: '15:30', linhas: [['^N225', 'Nikkei 225', 2], ['^HSI', 'Hang Seng', 2], ['000001.SS', 'Shanghai Composite', 2], ['^KS11', 'KOSPI', 2]], mais: [] },
    { id: 'ju', t: 'Juros dos EUA', tz: 'America/New_York', cme: true, juros: true, linhas: [['^IRX', 'Treasury 13 semanas', 3], ['^TNX', 'Treasury 10 anos', 3], ['@fred', 'Treasury 20 anos', 2], ['^TYX', 'Treasury 30 anos', 3]], mais: [] },
    { id: 'co', t: 'Commodities', tz: 'America/New_York', cme: true, linhas: [['BZ=F', 'Petróleo (Brent)', 2, 'US$ '], ['CL=F', 'Petróleo (WTI)', 2, 'US$ '], ['GC=F', 'Ouro', 2, 'US$ '], ['@minerio', 'Minério de ferro', 2]],
      mais: [['SI=F', 'Prata', 3, 'US$ '], ['KC=F', 'Café (US¢/lb)', 2], ['ZS=F', 'Soja (US¢/bushel)', 2]] },
    { id: 'cr', t: 'Criptomoedas', tz: 'UTC', h24: true, linhas: [['BTC-USD', 'Bitcoin', 0, 'US$ '], ['ETH-USD', 'Ethereum', 2, 'US$ '], ['SOL-USD', 'Solana', 2, 'US$ '], ['XRP-USD', 'Ripple', 4, 'US$ ']],
      mais: [['ADA-USD', 'Cardano', 4, 'US$ '], ['DOGE-USD', 'Dogecoin', 4, 'US$ ']] }
  ];
  // chave de cada linha @ no cache da aba Mercado de sempre (marketDataCache, app.js)
  const ESPECIAL = { '@selic': 'selic', '@ipca': 'ipca', '@fred': 'fred', '@minerio': 'TIO=F' };
  const esp = (s) => { try { const d = marketDataCache[ESPECIAL[s]]; return d && ok(d.value) ? d : null; } catch (e) { return null; } };
  const SYMS = [...new Set(REGIOES.flatMap((r) => [...r.linhas, ...r.mais].map((l) => l[0])))].filter((s) => !s.startsWith('@'));
  const INFO = Object.fromEntries(REGIOES.flatMap((r) => [...r.linhas, ...r.mais].map((l) => [l[0], { n: l[1], d: l[2], pre: l[3] || '', juros: !!r.juros }])));

  /* ---------------- horário ---------------- */
  // minutos desde meia-noite e dia da semana (0 = domingo) no fuso da bolsa
  const agoraEm = (tz, d = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
    return { min: (+p.hour) * 60 + (+p.minute), dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  };
  const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  // momento exato em que o relógio da bolsa marca alvoMin, perto de agora + falta minutos (acerta horário de verão)
  const alvo = (tz, falta, alvoMin) => {
    const d = new Date(Date.now() + falta * 60000);
    let dif = alvoMin - agoraEm(tz, d).min;
    if (dif > 720) dif -= 1440; if (dif < -720) dif += 1440;
    return new Date(d.getTime() + dif * 60000);
  };
  const BR = { timeZone: 'America/Sao_Paulo' };
  const quando = (d) => {
    const hora = d.toLocaleTimeString('pt-BR', { ...BR, hour: '2-digit', minute: '2-digit' }).replace(':00', 'h').replace(':', 'h');
    const dia = d.toLocaleDateString('pt-BR', BR);
    if (dia === new Date().toLocaleDateString('pt-BR', BR)) return hora;
    if (dia === new Date(Date.now() + 86400000).toLocaleDateString('pt-BR', BR)) return `amanhã ${hora}`;
    return `${d.toLocaleDateString('pt-BR', { ...BR, weekday: 'short' }).replace('.', '')} ${hora}`;
  };
  // { aberto, txt, falta } com horários em Brasília
  function situacao(r) {
    if (r.h24) return { aberto: true, txt: '24 horas' };
    const { min, dia } = agoraEm(r.tz);
    if (r.cme) {
      // futuros na CME: domingo 18h até sexta 17h (Nova York), pausa diária das 17h às 18h
      const fechado = dia === 6 || (dia === 0 && min < 1080) || (dia === 5 && min >= 1020) || (min >= 1020 && min < 1080);
      if (!fechado) return { aberto: true, txt: 'quase 24h' };
      let falta = 1080 - min; if (falta <= 0) falta += 1440;
      if (dia === 5 && min >= 1020) falta += 2 * 1440; else if (dia === 6) falta += 1440;
      return { aberto: false, txt: `abre ${quando(alvo(r.tz, falta, 1080))}`, falta };
    }
    const a = hm(r.ab), f = hm(typeof r.fe === 'function' ? r.fe() : r.fe), util = dia >= 1 && dia <= 5;
    if (util && min >= a && min < f) return { aberto: true, txt: `fecha ${quando(alvo(r.tz, f - min, f))}`, falta: 0 };
    let falta = a - min, d = dia;
    if (!(util && min < a)) { falta += 1440; d = (dia + 1) % 7; }
    while (d === 0 || d === 6) { falta += 1440; d = (d + 1) % 7; }
    return { aberto: false, txt: `abre ${quando(alvo(r.tz, falta, a))}`, falta };
  }
  // ordem fixa escolhida pelo Severino (24/10/2026): segue o dia do mercado, da Ásia ao Brasil
  const ORDEM = ['as', 'eu', 'us', 'br', 'ju', 'mo', 'co', 'cr'];
  const ordem = () => ORDEM.map((id) => REGIOES.find((r) => r.id === id));

  /* ---------------- dados ---------------- */
  const PREF = 'mercado_novo_v1';
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (e) { pref = {}; }
  const salvaPref = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { /* sem armazenamento */ } };
  const escolha = (r) => (pref[r.id]?.s && INFO[pref[r.id].s] ? pref[r.id].s : r.linhas[0][0]);
  const faixa = (r) => (['1d', '5d', '3mo'].includes(pref[r.id]?.f) ? pref[r.id].f : '1d');

  let Q = {}, H3 = {}, lastTs = 0, busy = false, errMsg = '';
  const G = {}; // gráficos: `${faixa}|${sym}` -> { t, c, ts }
  const abertos = new Set();

  async function loadQuotes() {
    const parts = [];
    for (let i = 0; i < SYMS.length; i += 45) parts.push(SYMS.slice(i, i + 45));
    let n = 0;
    const res = await Promise.allSettled(parts.map((p) => getJSON(`${PROXY}/quotes?symbols=${encodeURIComponent(p.join(','))}`)));
    res.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      Object.entries(r.value || {}).forEach(([sym, chart]) => {
        try {
          const v = parseYahooChart(chart);
          if (!ok(v.value)) return;
          Q[sym] = { v: v.value, c: v.change, ts: v.ts };
          n++;
        } catch (e) { /* sem dado: fica "—" */ }
      });
    });
    return n;
  }
  async function loadHist(syms, f) {
    const falta = syms.filter((s) => { const g = G[`${f}|${s}`]; return !g || Date.now() - g.ts > (f === '1d' ? 120000 : 900000); });
    for (let i = 0; i < falta.length; i += 45) {
      const j = await getJSON(`${PROXY}/history?symbols=${encodeURIComponent(falta.slice(i, i + 45).join(','))}${f === '3mo' ? '' : '&r=' + f}`).catch(() => null);
      Object.entries(j || {}).forEach(([s, v]) => { if (v && Array.isArray(v.c) && v.c.length > 1) G[`${f}|${s}`] = { t: v.t, c: v.c, ts: Date.now() }; });
    }
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    root.querySelector('.mn-refresh')?.classList.add('busy');
    try {
      const [n] = await Promise.all([loadQuotes(), loadHist(SYMS, '3mo')]);
      errMsg = n ? '' : 'Sem conexão com o servidor de cotações agora.';
      if (n) lastTs = Date.now();
      // gráfico de cada cartão na faixa escolhida (um lote por faixa)
      const porFaixa = {};
      REGIOES.forEach((r) => { (porFaixa[faixa(r)] ||= []).push(escolha(r)); });
      await Promise.all(Object.entries(porFaixa).map(([f, ss]) => (f === '3mo' ? null : loadHist(ss, f))));
    } catch (e) {
      errMsg = 'Não foi possível atualizar agora.';
    } finally {
      busy = false;
      render();
    }
  }

  /* ---------------- tempo real ----------------
     A aba Mercado de sempre já recebe preços ao vivo (Deriv, Capital.com e Binance) e avisa por window.__onMercadoVivo.
     O preço ao vivo vale por 60 s; a variação do dia usa o fechamento anterior do Yahoo. */
  const LV = {};
  const vivo = (s) => { const l = LV[s]; return l && Date.now() - l.em < 60000 ? l : null; };
  const SRC = { 'Deriv': 'Deriv', 'Capital.com': 'Capital.com (CFD)', 'Binance (USDT)': 'Binance (USDT)' };
  function atual(s) {
    const q = Q[s], l = vivo(s);
    if (!q || !ok(q.v)) return l ? { v: l.v, c: null, src: l.src } : null;
    if (!l) return { v: q.v, c: q.c };
    const base = ok(q.c) ? q.v / (1 + q.c / 100) : null;
    return { v: l.v, c: base ? (l.v / base - 1) * 100 : null, src: l.src };
  }
  window.__onMercadoVivo = (s, l, dir) => {
    if (!INFO[s] || !l || !ok(l.v)) return;
    LV[s] = { v: l.v, src: l.src, em: Date.now() };
    const a = atual(s);
    root.querySelectorAll(`.mn-row[data-s="${CSS.escape(s)}"]`).forEach((row) => {
      row.querySelector('.mn-v').textContent = valor(s);
      const c = row.querySelector('.mn-c'); c.textContent = pct(a?.c); c.className = `mn-c ${cls(a?.c)}`;
      row.classList.add('rt'); row.title = `Tempo real pela ${SRC[l.src] || l.src}; variação sobre o fechamento anterior do Yahoo`;
      if (dir) { row.classList.remove('fl-up', 'fl-dn'); void row.offsetWidth; row.classList.add(dir > 0 ? 'fl-up' : 'fl-dn'); }
    });
  };

  /* ---------------- frase do cartão (só com números) ---------------- */
  const verbo = (c) => (c > 0 ? 'sobe' : 'cai');
  function bp(sym) { // variação em pontos-base para juros (o Yahoo dá o rendimento em %)
    const q = Q[sym]; if (!q || !ok(q.c) || !ok(q.v)) return null;
    const prev = q.v / (1 + q.c / 100); return (q.v - prev) * 100;
  }
  function frase(r) {
    const vivos = r.linhas.filter((l) => !l[0].startsWith('@')).map((l) => ({ s: l[0], n: l[1], c: atual(l[0])?.c })).filter((x) => ok(x.c));
    if (vivos.length < 2) return '';
    const m = vivos.reduce((a, b) => (Math.abs(b.c) > Math.abs(a.c) ? b : a));
    if (Math.abs(m.c) < 0.005) return '';
    if (r.juros) {
      const v = bp(m.s); if (!ok(v) || Math.abs(v) < 0.5) return '';
      const iguais = vivos.every((x) => Math.sign(x.c) === Math.sign(m.c));
      return `${m.n} ${verbo(v)} ${Math.abs(Math.round(v))} p.b.${iguais ? `; ${vivos.length} de ${vivos.length} prazos ${v > 0 ? 'em alta' : 'em queda'}` : ''}`;
    }
    const h = G[`3mo|${m.s}`]?.c;
    if (h && h.length > 20) {
      const rets = []; for (let i = 1; i < h.length - 1; i++) rets.push((h[i] / h[i - 1] - 1) * 100);
      if (m.c < 0 && m.c < Math.min(...rets)) return `${m.n} cai ${pct(Math.abs(m.c)).slice(1)}, maior queda em 3 meses`;
      if (m.c > 0 && m.c > Math.max(...rets)) return `${m.n} sobe ${pct(m.c).slice(1)}, maior alta em 3 meses`;
    }
    const alta = vivos.filter((x) => x.c > 0).length, queda = vivos.filter((x) => x.c < 0).length;
    if (alta === vivos.length) return `${alta} de ${vivos.length} em alta; destaque para ${m.n} (${pct(m.c)})`;
    if (queda === vivos.length) return `${queda} de ${vivos.length} em queda; destaque para ${m.n} (${pct(m.c)})`;
    return `Dia dividido: ${alta} em alta, ${queda} em queda; ${m.n} ${verbo(m.c)} ${pct(Math.abs(m.c)).slice(1)}`;
  }

  /* ---------------- gráfico ---------------- */
  const W = 400, H = 96;
  function grafico(r) {
    const s = escolha(r), f = faixa(r), g = G[`${f}|${s}`];
    if (!g || g.c.length < 2) return `<div class="mn-chart-vazio">${busy ? 'Carregando gráfico…' : 'Gráfico indisponível agora'}</div>`;
    const c = g.c, q = Q[s];
    // no 1D a linha de base é o fechamento anterior (mesma conta da variação do dia)
    const base = f === '1d' && q && ok(q.v) && ok(q.c) ? q.v / (1 + q.c / 100) : c[0];
    const ag = atual(s);
    const vals = f === '1d' && ag?.src && ok(ag.v) ? [...c.slice(0, -1), ag.v] : c;
    const lo = Math.min(...vals, base), hi = Math.max(...vals, base), span = hi - lo || 1;
    const x = (i) => (i / (vals.length - 1)) * W, y = (v) => 6 + (1 - (v - lo) / span) * (H - 12);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const sobe = vals[vals.length - 1] >= base;
    const id = `mn-g-${r.id}`;
    return `<svg class="mn-svg ${sobe ? 'up' : 'dn'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" class="mn-base"/>
      <path d="M${pts.join('L')}L${W},${H}L0,${H}Z" fill="url(#${id})" stroke="none"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg><div class="mn-tip" hidden></div>`;
  }
  function varFaixa(r) {
    const s = escolha(r), f = faixa(r), q = Q[s];
    if (f === '1d') return INFO[s]?.juros ? pb(bp(s)) : pct(atual(s)?.c);
    const g = G[`${f}|${s}`]; if (!g) return '—';
    const ult = q && ok(q.v) ? q.v : g.c[g.c.length - 1];
    if (INFO[s]?.juros) return pb((ult - g.c[0]) * 100);
    return pct((ult / g.c[0] - 1) * 100);
  }

  /* ---------------- tela ---------------- */
  const valor = (s) => { const i = INFO[s], q = atual(s); return q && ok(q.v) ? `${i.pre}${nf(q.v, i.d)}${i.juros ? '%' : ''}` : '—'; };
  const linhaEsp = (r, l) => {
    const d = esp(l[0]), pctUnid = l[0] !== '@minerio';
    const pre = !d || pctUnid ? '' : /yuan/i.test(d.note || '') ? '¥ ' : 'US$ ';
    const v = d ? `${pre}${nf(d.value, l[2])}${pctUnid ? '%' : ''}` : '—';
    // Treasury 20 anos (FRED): variação em p.b., como as outras linhas de juros
    const pbFred = l[0] === '@fred' && d && ok(d.change) ? (d.value - d.value / (1 + d.change / 100)) * 100 : null;
    const ch = d ? (d.chgText || (l[0] === '@fred' ? pb(pbFred) : pctUnid ? '—' : pct(d.change))) : '—';
    const tom = d && ok(d.change) ? cls(d.change) : 'na';
    const dica = l[0] === '@fred' && d?.date ? `FRED, dado de ${d.date.split('-').reverse().join('/')} (sai com 1 dia de atraso)` : d?.note || 'Sem gráfico nesta visão';
    return `<div class="mn-row mn-row-esp" title="${esc(dica)}">
      <span class="mn-n">${esc(l[1])}</span><span class="mn-v">${v}</span><span class="mn-c ${tom}">${esc(ch)}</span></div>`;
  };
  const linha = (r, l) => {
    if (l[0].startsWith('@')) return linhaEsp(r, l);
    const s = l[0], q = atual(s), j = INFO[s].juros, ch = j ? bp(s) : q?.c;
    const rt = q?.src ? ` rt" title="Tempo real pela ${esc(SRC[q.src] || q.src)}; variação sobre o fechamento anterior do Yahoo` : `" title="Ver ${esc(l[1])} no gráfico`;
    return `<button type="button" class="mn-row${escolha(r) === s ? ' on' : ''}${rt}" data-r="${r.id}" data-s="${esc(s)}">
      <span class="mn-n">${esc(l[1])}</span><span class="mn-v">${valor(s)}</span><span class="mn-c ${cls(ch)}">${j ? pb(ch) : pct(ch)}</span></button>`;
  };
  function cartao(r) {
    const st = situacao(r), s = escolha(r), f = faixa(r), fr = frase(r), aberto = abertos.has(r.id);
    const vf = varFaixa(r);
    return `<article class="mn-card" data-r="${r.id}">
      <header class="mn-head">
        <span class="mn-flag">${ICON[r.id]}</span>
        <h3>${esc(r.t)}</h3>
        <span class="mn-st ${st.aberto ? 'on' : ''}"><i></i>${st.aberto ? `Aberto · ${esc(st.txt)}` : esc(st.txt[0].toUpperCase() + st.txt.slice(1))}</span>
        ${r.mais.length ? `<button type="button" class="mn-mais" data-mais="${r.id}" aria-expanded="${aberto}" title="${aberto ? 'Mostrar menos' : 'Mostrar mais ativos'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>` : ''}
      </header>
      <div class="mn-chart-top">
        <span class="mn-sel">${esc(INFO[s].n)} <b class="${cls(vf.startsWith('−') ? -1 : vf.startsWith('+') ? 1 : vf === '—' ? null : 0)}">${vf}</b></span>
        <span class="mn-faixas" role="group" aria-label="Período do gráfico">${[['1d', '1D'], ['5d', '5D'], ['3mo', '3M']].map(([k, t]) => `<button type="button" data-f="${k}" data-r="${r.id}" class="${f === k ? 'on' : ''}" aria-pressed="${f === k}">${t}</button>`).join('')}</span>
      </div>
      <div class="mn-chart" data-r="${r.id}">${grafico(r)}</div>
      ${fr ? `<p class="mn-frase">${esc(fr)}</p>` : ''}
      <div class="mn-rows">${r.linhas.map((l) => linha(r, l)).join('')}${aberto ? r.mais.map((l) => linha(r, l)).join('') : ''}</div>
    </article>`;
  }
  function render() {
    const hora = lastTs ? new Date(lastTs).toLocaleTimeString('pt-BR', { ...BR, hour: '2-digit', minute: '2-digit' }) : '—';
    root.innerHTML = `<div class="mn">
      <div class="mn-bar">
        <div><h2>Mercado</h2><span class="mn-sub">${errMsg ? `<span class="mn-err">${esc(errMsg)}</span>` : `Atualizado às ${hora}`}</span></div>
        <div class="mn-acts"><button type="button" class="mn-btn mn-refresh">Atualizar</button></div>
      </div>
      <div class="mn-grid">${ordem().map(cartao).join('')}</div>
    </div>`;
  }

  /* ---------------- interação ---------------- */
  root.addEventListener('click', async (e) => {
    const row = e.target.closest('.mn-row[data-s]');
    const fb = e.target.closest('.mn-faixas button');
    const mais = e.target.closest('[data-mais]');
    if (e.target.closest('.mn-refresh')) { refresh(); return; }
    if (mais) { const id = mais.dataset.mais; abertos.has(id) ? abertos.delete(id) : abertos.add(id); render(); return; }
    if (!row && !fb) return;
    const r = REGIOES.find((x) => x.id === (row || fb).dataset.r);
    if (row) {
      if (escolha(r) === row.dataset.s && typeof window.openAssetChart === 'function') {
        // segundo clique na mesma linha abre o gráfico completo
        window.openAssetChart(row.dataset.s, INFO[row.dataset.s].n, [...r.linhas, ...r.mais].filter((l) => !l[0].startsWith('@')).map((l) => ({ s: l[0], n: l[1] })));
        return;
      }
      pref[r.id] = { ...(pref[r.id] || {}), s: row.dataset.s };
    } else pref[r.id] = { ...(pref[r.id] || {}), f: fb.dataset.f };
    salvaPref();
    render();
    const f = faixa(r);
    if (f !== '3mo' || !G[`3mo|${escolha(r)}`]) { await loadHist([escolha(r)], f); render(); }
  });
  // valor e horário sob o mouse
  root.addEventListener('mousemove', (e) => {
    const box = e.target.closest('.mn-chart');
    if (!box) return;
    const r = REGIOES.find((x) => x.id === box.dataset.r), g = G[`${faixa(r)}|${escolha(r)}`], tip = box.querySelector('.mn-tip');
    if (!g || !tip) return;
    const rc = box.getBoundingClientRect(), k = Math.max(0, Math.min(g.c.length - 1, Math.round(((e.clientX - rc.left) / rc.width) * (g.c.length - 1))));
    const i = INFO[escolha(r)], d = new Date(g.t[k] * 1000);
    const quandoTxt = faixa(r) === '3mo' ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    tip.hidden = false;
    tip.textContent = `${i.pre}${nf(g.c[k], i.d)}${i.juros ? '%' : ''} · ${quandoTxt}`;
    tip.style.left = `${Math.min(rc.width - 120, Math.max(0, e.clientX - rc.left - 60))}px`;
  });
  root.addEventListener('mouseout', (e) => { const box = e.target.closest('.mn-chart'); if (box && !box.contains(e.relatedTarget)) box.querySelector('.mn-tip')?.setAttribute('hidden', ''); });

  /* ---------------- estilos ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  #market-panel.mn-on > .market-wrap:not(.mn-root) { display:none; }
  .mn { display:flex; flex-direction:column; gap:16px; }
  .mn-bar { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .mn-bar h2 { margin:0; font-size:20px; color:var(--text); }
  .mn-sub { font-size:12.5px; color:var(--text-3); }
  .mn-err { color:var(--neg); }
  .mn-acts { display:flex; gap:8px; align-items:center; }
  .mn-btn { font:inherit; font-size:12.5px; color:var(--text-2); background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:6px 10px; cursor:pointer; }
  .mn-btn:hover { color:var(--text); }
  .mn-refresh.busy { opacity:.6; pointer-events:none; }
  .mn-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(330px, 1fr)); gap:14px; align-items:start; }
  .mn-card { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 14px 8px; display:flex; flex-direction:column; gap:8px; min-width:0; }
  .mn-head { display:flex; align-items:center; gap:10px; min-width:0; }
  .mn-flag svg { width:30px; height:30px; display:block; border-radius:50%; box-shadow:0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent); }
  .mn-head h3 { margin:0; font-size:16px; font-weight:600; color:var(--text); white-space:nowrap; }
  .mn-st { margin-left:auto; display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .mn-st i { width:7px; height:7px; border-radius:50%; background:var(--text-3); flex:0 0 7px; }
  .mn-st.on { color:var(--text-2); }
  .mn-st.on i { background:var(--pos); box-shadow:0 0 0 3px color-mix(in srgb, var(--pos) 22%, transparent); }
  .mn-mais { flex:0 0 auto; width:28px; height:28px; border-radius:8px; border:0; background:none; color:var(--text-3); cursor:pointer; display:grid; place-items:center; }
  .mn-mais svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; transition:transform .2s; }
  .mn-mais[aria-expanded="true"] svg { transform:rotate(90deg); }
  .mn-mais:hover { color:var(--text); background:color-mix(in srgb, var(--text) 6%, transparent); }
  .mn-chart-top { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12.5px; color:var(--text-2); }
  .mn-sel b { font-weight:600; margin-left:4px; }
  .mn-faixas { display:inline-flex; gap:2px; background:color-mix(in srgb, var(--text) 5%, transparent); border-radius:7px; padding:2px; }
  .mn-faixas button { font:inherit; font-size:11px; font-weight:600; border:0; background:none; color:var(--text-3); padding:3px 8px; border-radius:5px; cursor:pointer; }
  .mn-faixas button.on { background:var(--surface); color:var(--text); box-shadow:0 1px 2px rgba(0,0,0,.2); }
  .mn-chart { position:relative; height:96px; }
  .mn-svg { width:100%; height:96px; display:block; overflow:visible; }
  .mn-svg.up { color:var(--pos); } .mn-svg.dn { color:var(--neg); }
  .mn-base { stroke:var(--text-3); stroke-width:1; stroke-dasharray:3 4; opacity:.55; vector-effect:non-scaling-stroke; }
  .mn-chart-vazio { height:96px; display:grid; place-items:center; font-size:12px; color:var(--text-3); border:1px dashed var(--line); border-radius:10px; }
  .mn-tip { position:absolute; top:-4px; width:120px; text-align:center; font-size:11px; color:var(--text); background:var(--surface-2, var(--surface)); border:1px solid var(--line); border-radius:6px; padding:2px 4px; pointer-events:none; white-space:nowrap; }
  .mn-frase { margin:0; font-size:12.5px; color:var(--text-2); line-height:1.4; border-left:2px solid var(--accent); padding-left:8px; }
  .mn-rows { display:flex; flex-direction:column; }
  .mn-row { display:grid; grid-template-columns:minmax(0,1fr) auto 76px; gap:10px; align-items:center; font:inherit; font-size:13px; text-align:left; background:none; border:0; border-top:1px solid var(--line); padding:8px 4px; color:var(--text-2); cursor:pointer; border-radius:0; }
  .mn-row-esp { cursor:default; }
  .mn-row.rt .mn-n::after { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--pos); margin-left:6px; vertical-align:middle; }
  .mn-row.fl-up .mn-v { animation:mn-fl-up .8s; } .mn-row.fl-dn .mn-v { animation:mn-fl-dn .8s; }
  @keyframes mn-fl-up { from { background:color-mix(in srgb, var(--pos) 25%, transparent); } }
  @keyframes mn-fl-dn { from { background:color-mix(in srgb, var(--neg) 25%, transparent); } }
  .mn-row:hover { background:color-mix(in srgb, var(--text) 4%, transparent); }
  .mn-row.on { color:var(--text); box-shadow:inset 2px 0 0 var(--accent); background:color-mix(in srgb, var(--accent) 7%, transparent); }
  .mn-n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:uppercase; font-size:12.5px; letter-spacing:.02em; }
  .mn-v { font-variant-numeric:tabular-nums; color:var(--text); text-align:right; }
  .mn-c { font-variant-numeric:tabular-nums; text-align:right; }
  .mn .up { color:var(--pos-ink, var(--pos)); } .mn .dn { color:var(--neg); } .mn .na, .mn .eq { color:var(--text-3); }
  @media (max-width: 640px) { .mn-grid { grid-template-columns:1fr; } .mn-st { display:none; } .mn-mais { margin-left:auto; } }
  `;
  document.head.appendChild(css);

  render();
  refresh();
  // Selic, IPCA, Treasury 20 anos e minério chegam pela aba Mercado de sempre, que roda por baixo
  [5000, 15000].forEach((ms) => setTimeout(() => { if (!busy) render(); }, ms));
  let timer = setInterval(() => { if (!document.hidden && panel.classList.contains('active')) refresh(); }, 120000);
  // situação dos pregões muda com o relógio: redesenha a cada minuto
  setInterval(() => { if (!document.hidden && panel.classList.contains('active') && !busy) render(); }, 60000);
  new MutationObserver(() => { if (panel.classList.contains('active') && Date.now() - lastTs > 60000) refresh(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  void timer;
})();
