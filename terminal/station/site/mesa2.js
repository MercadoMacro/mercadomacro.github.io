/* Mesa 2 no desenho "Mesa Viva" (11/11/2026): Gráfico vinculado + Watchlist, Pulso global, Juros (a curva de
   sempre), Notícias do ativo, Jade, Próximo evento e Estrangeiro na B3. As tabelas completas ficam na Mesa 1.
   Cotações: as mesmas da Mesa (Q do mesa.js, lote /quotes do worker). Agenda: window.__calFeed (Calendário).
   Fluxo: fluxo/fluxo.json (robô do GitHub, Boletim Diário da B3), o mesmo da aba Fluxo.
   A Jade aqui não chama a IA sozinha: o cartão é montado com a cotação e a manchete do terminal, e o Gemini só
   entra quando a pessoa clica numa pergunta (mesa-vinculo.js). Sem dado, mostra "—". */
globalThis.MMMesa2 = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // posição padrão (12 colunas, linhas de 8 px), como no desenho
  const DEF = {
    grafico: { x: 0, y: 0, w: 7, h: 52 }, wl: { x: 7, y: 0, w: 5, h: 52 },
    pulso: { x: 0, y: 52, w: 4, h: 46 }, curve: { x: 4, y: 52, w: 4, h: 46 }, nativo: { x: 8, y: 52, w: 4, h: 46 },
    jade: { x: 0, y: 98, w: 5, h: 30 }, evento: { x: 5, y: 98, w: 3, h: 30 }, fluxo: { x: 8, y: 98, w: 4, h: 30 },
  };
  const NOMES = { grafico: 'Gráfico', wl: 'Watchlist', pulso: 'Pulso global', curve: 'Juros', nativo: 'Notícias do ativo', jade: 'Jade', evento: 'Próximo evento', fluxo: 'Estrangeiro na B3' };
  const WL = [['^BVSP', 'Ibovespa', 'IBOV'], ['BRL=X', 'Dólar', 'USDBRL'], ['^GSPC', 'S&P 500', 'SPX'], ['^IXIC', 'Nasdaq', 'NDX'],
    ['BZ=F', 'Petróleo Brent', 'BRENT'], ['GC=F', 'Ouro', 'OURO'], ['BTC-USD', 'Bitcoin', 'BTC'], ['EURBRL=X', 'Euro', 'EURBRL']];
  const PULSO = [['^BVSP', 'Ibovespa'], ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq'], ['^DJI', 'Dow Jones'], ['^GDAXI', 'DAX'],
    ['^STOXX50E', 'Euro Stoxx 50'], ['^N225', 'Nikkei'], ['^HSI', 'Hang Seng'], ['^VIX', 'VIX']];
  const MOEDA = { 'BRL=X': 'R$ ', 'EURBRL=X': 'R$ ', 'BZ=F': 'US$ ', 'GC=F': 'US$ ', 'BTC-USD': 'US$ ' };
  const SIMBOLOS = [...new Set([...WL.map((x) => x[0]), ...PULSO.map((x) => x[0])])];

  const ok = (v) => v != null && isFinite(v);
  const casas = (v) => (Math.abs(v) >= 10000 ? 0 : Math.abs(v) >= 10 ? 2 : 4);
  const preco = (s, v) => (ok(v) ? (MOEDA[s] || '') + v.toLocaleString('pt-BR', { minimumFractionDigits: casas(v), maximumFractionDigits: casas(v) }) : '—');
  const pct = (v) => { if (!ok(v)) return '—'; const r = +v.toFixed(2); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2).replace('.', ',')}%`; };
  const lado = (v) => (!ok(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq');
  const seta = (v) => (!ok(v) ? '' : v > 0 ? '▲ ' : v < 0 ? '▼ ' : '');
  const grip = '<span class="m2-dot" aria-hidden="true"></span>';
  const cab = (t, extra = '') => `<div class="m2-head">${grip}<h3>${esc(t)}</h3><span class="sp"></span>${extra}</div>`;

  function spark(sp) {
    const v = (sp || []).filter(ok); if (v.length < 2) return '';
    const mn = Math.min(...v), mx = Math.max(...v), d = mx - mn || 1;
    const pts = v.map((y, i) => `${(i / (v.length - 1) * 72).toFixed(1)} ${(21 - (y - mn) / d * 18).toFixed(1)}`);
    return `<svg viewBox="0 0 72 24" width="72" height="24" aria-hidden="true"><path d="M${pts.join(' L')}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  }
  function watchlist(Q) {
    return cab('Watchlist', '<span class="m2-hint">clique para vincular</span>') + `<table class="m2-wl"><thead><tr><th>Ativo</th><th class="n">Último</th><th class="sk">Dia</th><th class="n">Var.</th></tr></thead><tbody>${WL.map(([s, n, sig]) => {
      const q = Q[s] || {};
      return `<tr data-sym="${esc(s)}" data-tb="wl" role="button" tabindex="0" title="Vincular ${esc(n)}"><td><span class="nm"><b>${esc(sig)}</b><small>${esc(n)}</small></span></td><td class="n num">${preco(s, q.v)}</td><td class="sk ${lado(q.c)}">${spark(q.sp)}</td><td class="n num ${lado(q.c)}">${seta(q.c)}${pct(q.c)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function pulso(Q) {
    return cab('Pulso global') + `<div class="m2-pulso">${PULSO.map(([s, n]) => {
      const q = Q[s] || {}, c = q.c, f = !ok(c) ? 0 : Math.min(1, Math.abs(c) / 2);
      const fundo = s === '^VIX' || !ok(c) ? '' : ` style="--m2-a:${(0.08 + f * 0.22).toFixed(2)}"`;
      return `<button type="button" class="m2-tile ${s === '^VIX' ? 'neutro' : lado(c)}"${fundo} data-sym="${esc(s)}" data-name="${esc(n)}" title="Vincular ${esc(n)}"><span>${esc(n)}</span><b class="num">${pct(c)}</b></button>`;
    }).join('')}</div>`;
  }

  /* ---- próximo evento da agenda (mesmo feed do Calendário) ---- */
  const PAIS = { USD: 'EUA', EUR: 'Zona do euro', CNY: 'China', GBP: 'Reino Unido', BRL: 'Brasil', JPY: 'Japão' };
  function proximo() {
    const agora = Date.now();
    return (window.__calFeed || []).filter((e) => e && e.date && !/T00:00:00-/.test(e.date) && (e.impact === 'High' && PAIS[e.country] || e.impact === 'Medium' && e.country === 'BRL'))
      .map((e) => ({ ...e, t: Date.parse(e.date) })).filter((e) => isFinite(e.t) && e.t > agora).sort((a, b) => a.t - b.t)[0] || null;
  }
  const relogio = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
  function evento() {
    const e = proximo();
    if (!e) return cab('Próximo evento') + '<div class="m2-body m2-ev"><p class="m2-vazio">Sem evento de alto impacto na agenda carregada.</p><button type="button" class="mv-link" data-go="calendar-panel">Abrir o Calendário</button></div>';
    const hora = new Date(e.t).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    return cab('Próximo evento') + `<div class="m2-body m2-ev"><span class="m2-relogio num" data-m2-t="${e.t}">${relogio(e.t - Date.now())}</span>
      <b class="m2-ev-t">${esc(PAIS[e.country] || e.country)}: ${esc(e.title)}</b><small>${esc(hora)}${e.forecast ? ' · previsão ' + esc(e.forecast) : ''}${e.previous ? ' · anterior ' + esc(e.previous) : ''}</small>
      <button type="button" class="mv-link" data-go="calendar-panel">Abrir o Calendário</button></div>`;
  }
  setInterval(() => { document.querySelectorAll('[data-m2-t]').forEach((el) => { el.textContent = relogio(+el.dataset.m2T - Date.now()); }); }, 1000);

  /* ---- estrangeiro na B3 (fluxo/fluxo.json) ---- */
  const FLUXO_URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fluxo/fluxo.json', 'fluxo/fluxo.json'];
  let fluxo = null, fluxoTs = 0, fluxoBusca = null;
  function buscarFluxo() {
    if (fluxoBusca || Date.now() - fluxoTs < 30 * 60000) return;
    fluxoBusca = (async () => {
      for (const u of FLUXO_URLS) {
        try {
          const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue;
          const j = await r.json(), dias = j.dias || [], ult = dias[dias.length - 1];
          const meses = Object.entries(j.meses || {}).sort(([a], [b]) => a.localeCompare(b)), mes = meses[meses.length - 1];
          const ano = ult ? ult.data.slice(0, 4) : '';
          const saldo = (t) => t?.estrangeiro?.saldo;
          fluxo = { data: ult?.data, dia: saldo(ult?.tipos), mes: saldo(mes?.[1]?.tipos), ano: meses.filter(([m]) => m.startsWith(ano)).reduce((s, [, m]) => s + (saldo(m.tipos) || 0), 0) };
          fluxoTs = Date.now();
          document.querySelectorAll('[data-mesa-block="fluxo"]').forEach((el) => { el.innerHTML = fluxoHTML(); });
          return;
        } catch (e) { /* tenta a próxima fonte */ }
      }
    })().finally(() => { fluxoBusca = null; });
  }
  const bi = (mil) => (ok(mil) ? `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${Math.abs(mil / 1e6).toFixed(2).replace('.', ',')} bi` : '—');
  function fluxoHTML() {
    buscarFluxo();
    if (!fluxo) return cab('Estrangeiro na B3') + '<div class="m2-body"><p class="m2-vazio">Carregando o boletim da B3…</p></div>';
    const linhas = [[`Dia ${fluxo.data ? fluxo.data.slice(8, 10) + '/' + fluxo.data.slice(5, 7) : ''}`, fluxo.dia], ['No mês', fluxo.mes], ['No ano', fluxo.ano]];
    const mx = Math.max(1, ...linhas.map(([, v]) => Math.abs(v || 0)));
    return cab('Estrangeiro na B3') + `<div class="m2-body m2-fluxo">${linhas.map(([r, v]) => `<div class="m2-fl"><span>${esc(r)}</span><div class="m2-bar"><i class="${lado(v)}" style="width:${Math.max(2, Math.abs(v || 0) / mx * 100).toFixed(0)}%"></i></div><b class="num ${lado(v)}">${bi(v)}</b></div>`).join('')}
      <small>A B3 divulga com cerca de 2 pregões de atraso.</small><button type="button" class="mv-link" data-go="analysis-panel">Ver o fluxo completo</button></div>`;
  }

  // a Mesa 2 inteira: as janelas que seguem o vínculo (gráfico, notícias, Jade) são preenchidas pelo mesa-vinculo.js
  function html(Q, curveHTML) {
    return `<div class="ms-custom-layout ms-m2">
      <section class="ms-box ms-vbox" data-v="grafico" data-mesa-block="grafico" aria-label="Gráfico do ativo vinculado"></section>
      <section class="ms-box m2-box" data-mesa-block="wl" aria-label="Watchlist">${watchlist(Q)}</section>
      <section class="ms-box m2-box" data-mesa-block="pulso" aria-label="Pulso global">${pulso(Q)}</section>
      <section class="ms-box ms-curvebox" data-mesa-block="curve">${curveHTML()}</section>
      <section class="ms-box ms-vbox" data-v="nativo" data-mesa-block="nativo" aria-label="Notícias do ativo vinculado"></section>
      <section class="ms-box ms-vbox" data-v="jade" data-mesa-block="jade" aria-label="Jade sobre o ativo vinculado"></section>
      <section class="ms-box m2-box" data-mesa-block="evento" aria-label="Próximo evento">${evento()}</section>
      <section class="ms-box m2-box" data-mesa-block="fluxo" aria-label="Estrangeiro na B3">${fluxoHTML()}</section>
    </div>`;
  }
  return { DEF, NOMES, SIMBOLOS, html, preco, pct, lado };
})();
