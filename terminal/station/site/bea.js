/* =========================================================
   PIB DOS EUA POR COMPONENTE NA ABA INDICADORES (área EUA), 25/10/2026.
   Fonte: BEA (U.S. Bureau of Economic Analysis), tabelas NIPA 1.1.1 e 1.1.2, lidas pelo robô bea.yml
   do GitHub (chave só no segredo BEA_API_KEY), que grava terminal/bea/bea.json.
   Mostra quanto consumo, investimento, governo e exportações líquidas somaram ao crescimento do PIB real
   em cada trimestre (p.p. na taxa anualizada). Carregado pelo indicadores.js. Sem dado, mostra "—".
   ========================================================= */
(() => {
  if (window.__beaRender) return;
  const URL_DADOS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/bea/bea.json';
  const CACHE_KEY = 'bea_cache_v2', TTL = 6 * 3600 * 1000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const r1 = (v) => (ok(v) ? Math.round(v * 10) / 10 || 0 : null); // arredonda antes do sinal: sem "−0,0"
  const n1 = (v) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (v) => { v = r1(v); return ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${n1(v)}%` : '—'; };
  const pp = (v) => { v = r1(v); return ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${n1(v)} p.p.` : '—'; };
  const cls = (v) => { v = r1(v); return !ok(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq'; };
  const tri = (q) => (/^\d{4}Q\d$/.test(q) ? `${q.slice(5)}º tri/${q.slice(0, 4)}` : q);
  const triCurto = (q) => (/^\d{4}Q\d$/.test(q) ? `${q.slice(5)}T${q.slice(2, 4)}` : q);
  // investimento junta o investimento fixo e a variação de estoques (a linha 7 da BEA já inclui os dois)
  const PARTES = [['consumo', 'Consumo das famílias', 'c1'], ['investimento', 'Investimento privado', 'c2'], ['governo', 'Governo', 'c3'], ['externo', 'Exportações líquidas', 'c4']];

  let cache = null, busy = false, err = false, host = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }

  async function load(force) {
    if (busy || (!force && cache?.d?.familias && Date.now() - cache.ts < TTL)) return;
    busy = true; draw();
    try {
      const r = await fetchT(URL_DADOS + '?t=' + Math.floor(Date.now() / 600000), {}, 20000);
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.trimestres) || j.trimestres.length < 4) throw new Error('sem dados');
      cache = { ts: Date.now(), d: j }; err = false;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) { err = true; }
    finally { busy = false; draw(); }
  }

  function html(d) {
    const ts = d.trimestres, u = ts[ts.length - 1], ant = ts[ts.length - 2];
    const ult8 = ts.slice(-8);
    // escala: maior soma positiva e maior soma negativa das barras, e o próprio PIB
    const pos = ult8.map((x) => PARTES.reduce((t, [k]) => t + Math.max(0, x[k] || 0), 0));
    const neg = ult8.map((x) => PARTES.reduce((t, [k]) => t + Math.min(0, x[k] || 0), 0));
    const hi = Math.max(0, ...pos, ...ult8.map((x) => x.pib || 0)), lo = Math.min(0, ...neg, ...ult8.map((x) => x.pib || 0)), amp = hi - lo || 1;
    const W = 480, H = 150, bw = W / ult8.length, y = (v) => 6 + (hi - v) / amp * (H - 12), z = y(0);
    const barras = ult8.map((x, i) => {
      let up = 0, dn = 0;
      const rects = PARTES.map(([k, , c]) => {
        const v = x[k]; if (!ok(v) || !v) return '';
        const a = v > 0 ? up : dn, b = a + v; if (v > 0) up = b; else dn = b;
        const y1 = y(Math.max(a, b)), h = Math.abs(y(a) - y(b));
        return `<rect x="${(i * bw + bw * 0.2).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" class="${c}"/>`;
      }).join('');
      const tip = `${tri(x.q)}: PIB ${pct(x.pib)}; ${PARTES.map(([k, n]) => `${n.toLowerCase()} ${pp(x[k])}`).join(', ')}`;
      const dot = ok(x.pib) ? `<circle cx="${(i * bw + bw / 2).toFixed(1)}" cy="${y(x.pib).toFixed(1)}" r="3.6" class="pib"/>` : '';
      return `<g><title>${esc(tip)}</title><rect x="${(i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"/>${rects}${dot}</g>`;
    }).join('');
    const rot = ult8.map((x, i) => `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 13}">${esc(triCurto(x.q))}</text>`).join('');
    const linhas = PARTES.map(([k, n, c]) => `<tr><th><i class="cx-sw ${c}"></i>${esc(n)}</th><td class="${cls(u[k])}">${pp(u[k])}</td><td class="${cls(ant?.[k])}">${pp(ant?.[k])}</td></tr>`).join('');
    return `<div class="be-par"><div class="be-col">
      <div class="be-top">
        <div><span>PIB real no ${esc(tri(u.q))}</span><b class="${cls(u.pib)}">${pct(u.pib)}</b><small>taxa anualizada${ant ? ` · ${esc(tri(ant.q))}: ${pct(ant.pib)}` : ''}</small></div>
        ${PARTES.map(([k, n]) => `<div><span>${esc(n)}</span><b class="${cls(u[k])}">${pp(u[k])}</b><small>contribuição</small></div>`).join('')}
      </div>
      <div class="cx-duas">
        <div><p class="cx-leg">Contribuição para o crescimento do PIB, últimos 8 trimestres (p.p.). O ponto é o PIB.</p>
          <svg class="cx-svg be-svg" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Contribuição de cada componente para o PIB dos EUA nos últimos 8 trimestres"><line x1="0" x2="${W}" y1="${z.toFixed(1)}" y2="${z.toFixed(1)}" class="z"/>${barras}${rot}</svg>
          <p class="be-leg">${PARTES.map(([, n, c]) => `<span><i class="cx-sw ${c}"></i>${esc(n)}</span>`).join('')}<span><i class="cx-sw pib"></i>PIB</span></p></div>
        <table class="ib-tb cx-tb"><thead><tr><th>Componente</th><th>${esc(triCurto(u.q))}</th><th>${ant ? esc(triCurto(ant.q)) : ''}</th></tr></thead><tbody>${linhas}
          <tr><th>PIB real</th><td class="${cls(u.pib)}">${pct(u.pib)}</td><td class="${cls(ant?.pib)}">${pct(ant?.pib)}</td></tr></tbody></table>
      </div>
      <p class="ib-note">Variação do PIB real na taxa anualizada e quanto cada parte somou a ela, em pontos percentuais. A soma das partes dá o PIB, com diferença de arredondamento. Investimento inclui a variação de estoques. A BEA divulga cada trimestre em três estimativas e revisa os números anteriores.</p>
      </div>${familias(d.familias)}</div>`;
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => `${MESES[+m.slice(5) - 1]}/${m.slice(0, 4)}`;
  // renda, consumo e poupança das famílias (BEA, tabelas 2.6 e 2.8.6, mensal)
  function familias(f) {
    if (!f || !Array.isArray(f.meses) || f.meses.length < 13) return '';
    const ms = f.meses, u = ms[ms.length - 1], a = ms[ms.length - 2], h = ms.find((x) => x.m === `${+u.m.slice(0, 4) - 1}${u.m.slice(4)}`);
    const vm = (x, y, k) => (x && y && ok(x[k]) && ok(y[k]) && y[k] ? (x[k] / y[k] - 1) * 100 : null);
    const prev = (x) => ms[ms.indexOf(x) - 1];
    const kpi = (t, v, sub, c = cls(v)) => `<div><span>${esc(t)}</span><b class="${c}">${v === null ? '—' : pct(v)}</b><small>${sub}</small></div>`;
    const top = [
      kpi('Renda pessoal', vm(u, a, 'renda'), `no mês · ${pct(vm(u, h, 'renda'))} em 12 meses`),
      kpi('Renda disponível real', vm(u, a, 'disponivel_real'), `no mês · ${pct(vm(u, h, 'disponivel_real'))} em 12 meses`),
      kpi('Consumo', vm(u, a, 'consumo'), `no mês · ${pct(vm(u, h, 'consumo'))} em 12 meses`),
      kpi('Consumo real', vm(u, a, 'consumo_real'), `no mês · ${pct(vm(u, h, 'consumo_real'))} em 12 meses`),
      `<div><span>Taxa de poupança</span><b>${ok(u.poupanca) ? n1(u.poupanca) + '%' : '—'}</b><small>da renda disponível${a && ok(a.poupanca) ? ` · ${esc(nomeMes(a.m))}: ${n1(a.poupanca)}%` : ''}</small></div>`,
    ].join('');
    // taxa de poupança mês a mês
    const pts = ms.filter((x) => ok(x.poupanca)), W = 480, H = 90;
    let svg = '';
    if (pts.length > 2) {
      const vs = pts.map((x) => x.poupanca), lo = Math.min(...vs), hi = Math.max(...vs), amp = hi - lo || 1;
      const X = (i) => 4 + i * (W - 8) / (pts.length - 1), Y = (v) => 8 + (hi - v) / amp * (H - 16);
      const path = pts.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.poupanca).toFixed(1)}`).join('');
      const marcas = pts.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.poupanca).toFixed(1)}" r="${i === pts.length - 1 ? 3.6 : 2}" class="pt"><title>${esc(nomeMes(x.m))}: ${n1(x.poupanca)}%</title></circle>`).join('');
      svg = `<p class="cx-leg">Taxa de poupança das famílias (% da renda disponível), de ${esc(nomeMes(pts[0].m))} a ${esc(nomeMes(pts[pts.length - 1].m))}. Mínimo ${n1(lo)}%, máximo ${n1(hi)}%.</p>
        <svg class="be-svg be-linha" viewBox="0 0 ${W} ${H}" role="img" aria-label="Taxa de poupança das famílias nos EUA"><path d="${path}"/>${marcas}</svg>`;
    }
    const tab = ms.slice(-6).reverse().map((x) => { const p = prev(x); return `<tr><th>${esc(nomeMes(x.m))}</th><td class="${cls(vm(x, p, 'renda'))}">${pct(vm(x, p, 'renda'))}</td><td class="${cls(vm(x, p, 'disponivel_real'))}">${pct(vm(x, p, 'disponivel_real'))}</td><td class="${cls(vm(x, p, 'consumo_real'))}">${pct(vm(x, p, 'consumo_real'))}</td><td>${ok(x.poupanca) ? n1(x.poupanca) + '%' : '—'}</td></tr>`; }).join('');
    return `<div class="be-col"><h4 class="be-sub">Renda e consumo das famílias em ${esc(nomeMes(u.m))}</h4>
      <div class="be-top">${top}</div>
      <div class="cx-duas">
        <div>${svg}</div>
        <table class="ib-tb cx-tb"><thead><tr><th>Mês</th><th>Renda</th><th>Renda disp. real</th><th>Consumo real</th><th>Poupança</th></tr></thead><tbody>${tab}</tbody></table>
      </div>
      <p class="ib-note">Variações de um mês para o outro, salvo indicação. "Real" desconta a inflação (índice de preços do consumo, PCE). A renda disponível é a renda depois dos impostos.</p></div>`;
  }

  function draw() {
    if (!host || !host.isConnected) return;
    const box = host.querySelector('.ib-in'), meta = host.querySelector('.ib-meta');
    if (cache?.d) { try { box.innerHTML = html(cache.d); } catch (e) { box.innerHTML = '<div class="ib-msg">Não foi possível ler os dados da BEA.</div>'; } }
    else box.innerHTML = `<div class="ib-msg">${busy ? 'Carregando o PIB dos EUA…' : err ? 'Dados da BEA indisponíveis agora.' : '—'}</div>`;
    meta.innerHTML = `<a href="https://www.bea.gov/data/gdp/gross-domestic-product" target="_blank" rel="noopener">BEA</a>${cache?.d?.ultimo ? ` · ${esc(tri(cache.d.ultimo))}` : ''}${err && cache ? ' · último dado salvo' : ''}`;
  }

  // chamado pelo indicadores.js toda vez que a área EUA é desenhada
  window.__beaRender = (container, force = false) => {
    let sec = container.querySelector('#bea-sec');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'ind-sec'; sec.id = 'bea-sec';
      sec.innerHTML = `<div class="market-section-head"><span class="sec-icon"><i class="fas fa-industry"></i></span><h2>PIB dos EUA por componente</h2><span class="sec-count">trimestral</span></div>
        <div class="ib-box"><div class="ib-h"><h3>O que puxou o crescimento</h3><span class="ib-meta"></span></div><div class="ib-in"></div></div>`;
      container.appendChild(sec);
    }
    host = sec; draw(); load(force);
  };

  const css = document.createElement('style');
  // estilos da caixa e da tabela (os mesmos do ibge.js, que só carrega na área Brasil; repetidos aqui para a área EUA aberta direto)
  css.textContent = `
  .ib-box { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; min-width:0; }
  .ib-h { display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--surface-2) 70%, transparent); }
  .ib-h h3 { margin:0; flex:1; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  .ib-meta { font-size:10.5px; color:var(--text-3); white-space:nowrap; }
  .ib-meta a { color:var(--text-3); text-decoration:none; } .ib-meta a:hover { color:var(--accent-ink); text-decoration:underline; }
  .ib-in { padding:12px; }
  .ib-msg { padding:36px 10px; text-align:center; font-size:12.5px; color:var(--text-3); }
  .ib-tb { width:100%; border-collapse:collapse; font-size:12px; }
  .ib-tb th, .ib-tb td { padding:6px 6px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .ib-tb td { font-family:'JetBrains Mono', monospace; font-size:11.5px; }
  .ib-tb tbody th { text-align:left; font-weight:500; color:var(--text-2); white-space:normal; }
  .ib-tb thead th { font-size:10.5px; color:var(--text-3); font-weight:600; }
  .ib-tb thead th:first-child { text-align:left; }
  .ib-tb tr:last-child th, .ib-tb tr:last-child td { border-bottom:0; }
  .ib-note { margin:8px 0 0; font-size:10.5px; color:var(--text-3); line-height:1.5; }
  .be-svg { max-height:260px; }
  .be-linha { max-height:150px; }
  .be-top { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:14px; margin-bottom:12px; }
  .be-top > div { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .be-top span { font-size:11.5px; color:var(--text-3); }
  .be-top b { font:600 19px 'JetBrains Mono', monospace; color:var(--text); letter-spacing:-.02em; white-space:nowrap; }
  .be-top small { font-size:11px; color:var(--text-3); }
  #bea-sec .up { color:var(--pos-ink, var(--pos)); } #bea-sec .dn { color:var(--neg); } #bea-sec .na, #bea-sec .eq { color:var(--text-3); }
  #bea-sec .cx-duas { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:18px; align-items:start; }
  #bea-sec .cx-leg { margin:0 0 6px; font-size:11.5px; color:var(--text-3); }
  .be-svg { display:block; width:100%; height:auto; }
  .be-svg .z { stroke:var(--text-3); opacity:.5; }
  .be-svg text { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); text-anchor:middle; }
  #bea-sec .c1 { fill:#3b82f6; background:#3b82f6; } #bea-sec .c2 { fill:#f59e0b; background:#f59e0b; }
  #bea-sec .c3 { fill:#8b5cf6; background:#8b5cf6; } #bea-sec .c4 { fill:#14b8a6; background:#14b8a6; }
  .be-svg .pib { fill:var(--text); stroke:var(--surface, #fff); stroke-width:1.5; }
  #bea-sec .cx-sw { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; vertical-align:baseline; }
  #bea-sec .cx-sw.pib { border-radius:50%; background:var(--text); }
  .be-sub { margin:22px 0 10px; font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-2); }
  .be-linha path { fill:none; stroke:#3b82f6; stroke-width:2; stroke-linejoin:round; }
  .be-linha .pt { fill:#3b82f6; }
  /* telas largas: PIB e renda das famílias lado a lado; dentro de cada um, gráfico em cima e tabela embaixo */
  @media (min-width: 1400px) {
    .be-par { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:28px; align-items:start; }
    .be-par > .be-col + .be-col { border-left:1px solid var(--line); padding-left:28px; }
    .be-par .be-sub { margin-top:0; }
    #bea-sec .be-par .cx-duas { grid-template-columns:minmax(0,1fr); gap:12px; }
    .be-par .be-top { grid-template-columns:repeat(3, minmax(0,1fr)); }
    .be-par .be-top b { font-size:17px; }
  }
  .be-leg { display:flex; flex-wrap:wrap; gap:4px 14px; margin:6px 0 0; font-size:11.5px; color:var(--text-2); }
  #bea-sec .cx-tb th:first-child { text-transform:none; }
  @media (max-width: 900px) { .be-top { grid-template-columns:repeat(2, minmax(0,1fr)); } #bea-sec .cx-duas { grid-template-columns:minmax(0,1fr); } #bea-sec .ib-h { flex-direction:column; align-items:flex-start; gap:4px; } }`;
  document.head.appendChild(css);
})();
