/* LOGO VIVO (protótipo, 17/11/2026, ideia B escolhida pelo Dante para teste):
   o símbolo do Mercado Macro é o gráfico do Ibovespa do dia, verde quando sobe e vermelho quando cai,
   com a variação embaixo do nome ("IBOV −1,83% · 14h32"). Linha tracejada = fechamento do dia anterior.
   Pregão aberto: o ponto da ponta pulsa e o gráfico se atualiza a cada minuto. Pregão fechado: mostra o último dia.
   Sem dados (rede, Yahoo fora): aparece o símbolo fixo (barras + M + seta), como antes. */
(() => {
  const SIMBOLO = '<svg class="lv-fixo" viewBox="0 0 198 150" aria-hidden="true"><defs><linearGradient id="lvB" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="var(--lv-b1)"/><stop offset=".55" stop-color="var(--lv-b2)"/><stop offset="1" stop-color="var(--lv-b3)"/></linearGradient><linearGradient id="lvG" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="var(--lv-b1)"/><stop offset=".45" stop-color="var(--lv-b2)"/><stop offset=".86" stop-color="#e5a043"/><stop offset="1" stop-color="#f8ac39"/></linearGradient></defs>'
    + '<path fill="url(#lvB)" d="M5 142L47 103L47 142Z"/><path fill="url(#lvB)" d="M56 142L56 94L78 74L78 142Z"/><path fill="url(#lvB)" d="M89 142L89 83L110 105Q115 110 121 104L174 49L174 142L148 142L148 101L120 135Q115 142 107 142Z"/>'
    + '<path fill="url(#lvG)" d="M5 101L70 45Q76 39 82 45L109 71L165 13L155 7L193 0L186 42L174 30L116 92Q108 101 100 93L76 70Q74 67 70 71L5 129Z"/></svg>';
  const HTML = `<span class="lv" role="img" aria-label="Mercado Macro">
    <span class="lv-sim">${SIMBOLO}<svg class="lv-graf" viewBox="0 0 48 32" aria-hidden="true"></svg></span>
    <span class="lv-txt"><span class="lv-nome"><em>mercado</em><strong>macro</strong></span><small class="lv-ibov"></small></span></span>`;
  const css = document.createElement('style');
  css.textContent = `
  .lv { --lv-b1:#22457a; --lv-b2:#3270a6; --lv-b3:#4f95c6; display:inline-flex; align-items:center; gap:9px; line-height:1; min-width:0; }
  body.light .lv { --lv-b1:#14214a; --lv-b2:#204f72; --lv-b3:#30749a; }
  .lv-sim { position:relative; width:44px; height:30px; flex:0 0 44px; }
  .lv-sim svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
  .lv-graf { opacity:0; transition:opacity .5s; } .lv.on .lv-graf { opacity:1; } .lv.on .lv-fixo { opacity:0; }
  .lv-fixo { transition:opacity .5s; }
  .lv-txt { display:flex; flex-direction:column; min-width:0; }
  .lv-nome { font-size:18px; letter-spacing:-.015em; white-space:nowrap; }
  .lv-nome em { font-style:normal; font-weight:500; color:var(--text-2); }
  .lv-nome strong { font-weight:800; color:var(--text); }
  .lv-ibov { font-size:10.5px; font-weight:600; letter-spacing:.02em; color:var(--text-3); margin-top:4px; white-space:nowrap; font-variant-numeric:tabular-nums; min-height:12px; }
  .lv-ibov .lv-pct { font-weight:700; font-size:inherit; } .lv-ibov .up { color:var(--pos); } .lv-ibov .dn { color:var(--neg); }
  html body .side-brand .lv-nome strong { font-size:inherit; line-height:1; }
  .lv-dot { animation:lvPulso 2s ease-out infinite; transform-box:fill-box; transform-origin:center; }
  @keyframes lvPulso { 0% { opacity:.6; transform:scale(1); } 80%,100% { opacity:0; transform:scale(3); } }
  @media (prefers-reduced-motion: reduce) { .lv-dot { animation:none; opacity:0; } }
  body.has-side.side-collapsed .side-brand .lv-txt { display:none; }
  body.has-side.side-collapsed .side-brand .lv-sim { width:40px; height:28px; flex-basis:40px; }
  body.has-side .side-brand .lv ~ * , body.has-side .side-brand > :not(.lv) { display:none !important; }
  .topbar .mm-logo .lv { display:none; }
  @media (max-width: 900px) {
    html body .topbar.topbar .mm-logo > :not(.lv) { display:none !important; }
    html body .topbar.topbar .mm-logo .lv { display:inline-flex; gap:7px; }
    html body .topbar.topbar .mm-logo .lv-nome { font-size:16px; }
    html body .topbar.topbar .mm-logo .lv-sim { width:38px; height:26px; flex-basis:38px; }
  }`;
  document.head.appendChild(css);
  const poe = () => {
    let ok = false;
    const sb = document.querySelector('.side-brand');
    if (sb && !sb.querySelector('.lv')) { sb.insertAdjacentHTML('afterbegin', HTML); ok = true; }
    const tb = document.querySelector('.topbar .mm-logo');
    if (tb && !tb.querySelector('.lv')) { tb.insertAdjacentHTML('beforeend', HTML); ok = true; }
    return ok;
  };
  const fmt = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(':', 'h');
  let ultimo = null;
  async function busca() {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=5m&range=1d';
    const r = await fetch(`${window.CORS_PROXY || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev'}/?url=${encodeURIComponent(url)}`, { cache: 'no-store' });
    const j = await r.json(); const x = j.chart.result[0];
    const ts = [], c = [];
    x.timestamp.forEach((t, i) => { const v = x.indicators.quote[0].close[i]; if (v != null) { ts.push(t * 1000); c.push(v); } });
    const ant = x.meta.chartPreviousClose ?? x.meta.previousClose;
    const per = x.meta.currentTradingPeriod?.regular;
    const aberto = per ? Date.now() / 1000 >= per.start && Date.now() / 1000 <= per.end : false;
    // eixo do tempo: o pregão inteiro quando está aberto (a linha vai crescendo); fechado, só o que houve de negócio
    return { ts, c, ant, agora: x.meta.regularMarketPrice ?? c.at(-1), aberto, ini: ts[0], fim: aberto && per ? Math.max(per.end * 1000, ts.at(-1)) : ts.at(-1) };
  }
  function desenha(d) {
    if (!d || d.c.length < 2) return;
    const pct = (d.agora / d.ant - 1) * 100, sobe = pct >= 0, cor = sobe ? 'var(--pos)' : 'var(--neg)';
    const min = Math.min(d.ant, ...d.c), max = Math.max(d.ant, ...d.c), pad = (max - min) * 0.08 || 1;
    const X = (t) => 2 + (t - d.ini) / Math.max(1, d.fim - d.ini) * 44, Y = (v) => 30 - (v - (min - pad)) / ((max + pad) - (min - pad)) * 28;
    const pts = d.c.map((v, i) => `${X(d.ts[i]).toFixed(2)} ${Y(v).toFixed(2)}`);
    const linha = 'M' + pts.join(' L'), xf = X(d.ts.at(-1)), yf = Y(d.c.at(-1)), yb = Y(d.ant);
    const id = 'lvA' + (sobe ? 'u' : 'd');
    const svg = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".32"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
      <line x1="2" x2="46" y1="${yb.toFixed(2)}" y2="${yb.toFixed(2)}" stroke="var(--text-3)" stroke-width=".8" stroke-dasharray="1.6 2.4" opacity=".8"/>
      <path d="${linha} L${xf.toFixed(2)} 31 L${X(d.ts[0]).toFixed(2)} 31 Z" fill="url(#${id})"/>
      <path d="${linha}" fill="none" stroke="${cor}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>
      ${d.aberto ? `<circle class="lv-dot" cx="${xf.toFixed(2)}" cy="${yf.toFixed(2)}" r="2.4" fill="${cor}"/>` : ''}
      <circle cx="${xf.toFixed(2)}" cy="${yf.toFixed(2)}" r="2.4" fill="${cor}"/>`;
    const txt = `IBOV <span class="lv-pct ${sobe ? 'up' : 'dn'}">${fmt(pct)}</span> · ${d.aberto ? hora(d.ts.at(-1)) : 'fechado'}`;
    document.querySelectorAll('.lv').forEach((el) => {
      el.querySelector('.lv-graf').innerHTML = svg;
      el.querySelector('.lv-ibov').innerHTML = txt;
      el.classList.add('on');
      el.setAttribute('aria-label', `Mercado Macro. Ibovespa ${fmt(pct)} ${d.aberto ? 'agora' : 'no fechamento'}`);
    });
  }
  async function ciclo() {
    poe();
    if (document.visibilityState !== 'visible' && ultimo) return;
    try { ultimo = await busca(); desenha(ultimo); } catch (e) { /* fica o símbolo fixo */ }
  }
  ciclo();
  setInterval(() => { poe(); if (!ultimo || ultimo.aberto) ciclo(); }, 60000);
  new MutationObserver(() => { if (poe() && ultimo) desenha(ultimo); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(); });
})();
