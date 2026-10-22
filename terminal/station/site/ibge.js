/* =========================================================
   IBGE NA ABA INDICADORES (área Brasil): IPCA por grupo, PIB trimestral e desemprego.
   Fonte: IBGE/SIDRA (tabelas 7060, 5932 e 6381), pelo worker (/sidra) e, se ele falhar,
   direto na API do IBGE. Carregado pelo indicadores.js quando a área Brasil é aberta.
   Regra do painel: se a fonte falhar, mostra o último dado salvo ou "—".
   ========================================================= */
(() => {
  if (window.__ibgeRender) return;
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const SIDRA = {
    ipca: '/t/7060/n1/all/v/63,66,2265/p/last%2013/c315/7169,7170,7445,7486,7558,7625,7660,7712,7766,7786',
    pib: '/t/5932/n1/all/v/6561,6564/p/last%2012/c11255/90707',
    desemp: '/t/6381/n1/all/v/4099/p/last%2025'
  };
  const LINK = {
    ipca: 'https://sidra.ibge.gov.br/tabela/7060',
    pib: 'https://sidra.ibge.gov.br/tabela/5932',
    desemp: 'https://sidra.ibge.gov.br/tabela/6381'
  };
  const CACHE_KEY = 'ibge_cache_v1';
  const TTL = 6 * 3600 * 1000;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const sg = (v, d = 2) => (ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), d)}` : '—');
  const cls = (v) => (!ok(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  const save = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ } };
  const st = { ipca: { busy: false, err: false }, pib: { busy: false, err: false }, desemp: { busy: false, err: false } };
  let host = null;

  async function getJSON(url) {
    const r = await fetchT(url, {}, 20000);
    const j = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(j) || j.length < 2) throw new Error(`HTTP ${r.status}`);
    return j;
  }

  // Resposta do SIDRA: linha 0 = nomes das colunas; as outras = valores.
  // Descobre sozinho qual dimensão é variável, período e classificação pelos nomes.
  function parse(raw) {
    const head = raw[0], dims = Object.keys(head).filter((k) => /^D\dN$/.test(k));
    const find = (re) => dims.find((k) => re.test(norm(head[k])));
    const kVar = find(/^variavel/), kPer = find(/^(mes|trimestre|trimestre movel)$/) || find(/mes|trimestre/);
    const kCls = dims.find((k) => k !== kVar && k !== kPer && !/^brasil$/.test(norm(head[k])));
    if (!kVar || !kPer) throw new Error('Formato inesperado do IBGE');
    return raw.slice(1).map((r) => {
      const v = parseFloat(String(r.V).replace(',', '.'));
      return {
        v: isFinite(v) ? v : null,
        varC: r[kVar.replace('N', 'C')], varN: r[kVar],
        perC: r[kPer.replace('N', 'C')], perN: r[kPer],
        clsC: kCls ? r[kCls.replace('N', 'C')] : '', clsN: kCls ? r[kCls] : ''
      };
    });
  }

  async function load(key, force) {
    const c = cache[key];
    if (!force && c && Date.now() - c.ts < TTL) return;
    if (st[key].busy) return;
    st[key].busy = true;
    draw(key);
    try {
      let raw;
      try { raw = await getJSON(`${PROXY}/sidra?q=${key}`); }
      catch (e1) { raw = await getJSON('https://apisidra.ibge.gov.br/values' + SIDRA[key]); }
      const rows = parse(raw);
      if (!rows.some((r) => ok(r.v))) throw new Error('sem valores');
      cache[key] = { ts: Date.now(), rows };
      st[key].err = false;
      save();
    } catch (e) { st[key].err = true; }
    finally { st[key].busy = false; draw(key); }
  }

  /* ---------------- IPCA por grupo ---------------- */
  function ipcaHTML(rows) {
    const per = [...new Set(rows.map((r) => r.perC))].sort();
    const last = per[per.length - 1];
    const at = rows.filter((r) => r.perC === last);
    const byVar = (re) => { const v = at.find((r) => re.test(norm(r.varN))); return v ? v.varC : null; };
    const vMes = byVar(/variacao mensal/), vPeso = byVar(/peso/), v12 = byVar(/12 meses/);
    if (!vMes) return '<div class="ib-msg">Formato inesperado do IBGE.</div>';
    const get = (cc, vc, p = last) => { const r = rows.find((x) => x.perC === p && x.clsC === cc && x.varC === vc); return r ? r.v : null; };
    const geralC = (at.find((r) => /indice geral/.test(norm(r.clsN))) || {}).clsC;
    const grupos = [...new Set(at.map((r) => r.clsC))].filter((c) => c !== geralC).map((c) => {
      const nome = (at.find((r) => r.clsC === c) || {}).clsN || c;
      const mes = get(c, vMes), peso = vPeso ? get(c, vPeso) : null;
      return { nome: nome.replace(/^\d+\./, ''), mes, peso, contr: ok(mes) && ok(peso) ? mes * peso / 100 : null, a12: v12 ? get(c, v12) : null };
    }).sort((a, b) => (ok(b.contr) ? b.contr : -99) - (ok(a.contr) ? a.contr : -99));
    const maxC = Math.max(0.01, ...grupos.map((g) => Math.abs(g.contr || 0)));
    const perN = (at[0] || {}).perN || '';
    const gMes = geralC ? get(geralC, vMes) : null, g12 = geralC && v12 ? get(geralC, v12) : null;
    // variação mensal do índice geral nos últimos meses (mini barras)
    const hist = geralC ? per.map((p) => ({ p, n: (rows.find((r) => r.perC === p) || {}).perN || p, v: get(geralC, vMes, p) })) : [];
    const hMax = Math.max(0.01, ...hist.map((h) => Math.abs(h.v || 0)));
    return `
      <div class="ib-top">
        <div><span>IPCA de ${esc(perN)}</span><b class="${cls(gMes)}">${sg(gMes)}%</b></div>
        <div><span>Em 12 meses</span><b>${nf(g12)}%</b></div>
        <div class="ib-spark" title="Variação mensal do IPCA">${hist.map((h) => `<i class="${cls(h.v)}" style="height:${ok(h.v) ? Math.max(2, Math.abs(h.v) / hMax * 100) : 0}%" title="${esc(h.n)}: ${sg(h.v)}%"></i>`).join('')}</div>
      </div>
      <table class="ib-tb">
        <thead><tr><th>Grupo</th><th>No mês</th><th class="hs">Peso</th><th>Contribuição</th><th class="hs">12 meses</th></tr></thead>
        <tbody>${grupos.map((g) => `<tr>
          <th>${esc(g.nome)}</th>
          <td class="${cls(g.mes)}">${sg(g.mes)}%</td>
          <td class="hs">${nf(g.peso, 1)}%</td>
          <td class="ib-cb"><div class="ib-cw"><span class="ib-bar"><i class="${cls(g.contr)}" style="width:${ok(g.contr) ? Math.abs(g.contr) / maxC * 50 : 0}%;${g.contr < 0 ? 'right:50%' : 'left:50%'}"></i></span><em class="${cls(g.contr)}">${sg(g.contr)} p.p.</em></div></td>
          <td class="hs">${nf(g.a12)}%</td></tr>`).join('')}</tbody>
      </table>
      <p class="ib-note">Contribuição = variação do grupo × peso no índice. A soma das contribuições dá o IPCA do mês (com arredondamento).</p>`;
  }

  /* ---------------- PIB trimestral ---------------- */
  const pibLabel = (n) => {
    const x = norm(n);
    if (/imediatamente anterior/.test(x)) return 'vs. trimestre anterior (com ajuste sazonal)';
    if (/mesmo periodo do ano anterior|mesmo trimestre/.test(x)) return 'vs. mesmo trimestre do ano anterior';
    if (/4 trimestres|quatro trimestres/.test(x)) return 'acumulado em 4 trimestres';
    return n;
  };
  function barsSVG(pts, fmt) {
    const W = 420, H = 150, T = 16, B = 26;
    const vs = pts.map((p) => p.v).filter(ok);
    const max = Math.max(0, ...vs), min = Math.min(0, ...vs), span = max - min || 1;
    const y = (v) => T + (max - v) / span * (H - T - B);
    const gw = W / pts.length, bw = Math.min(22, gw * 0.62);
    return `<svg class="ib-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">
      <line class="z" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
      ${pts.map((p, i) => {
        const x = gw * i + (gw - bw) / 2;
        if (!ok(p.v)) return '';
        const y1 = y(Math.max(p.v, 0)), y2 = y(Math.min(p.v, 0));
        const lastOne = i === pts.length - 1;
        return `<rect class="${cls(p.v)}${lastOne ? ' last' : ''}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="2"><title>${esc(p.n)}: ${fmt(p.v)}</title></rect>`
          + (lastOne || i % 2 === pts.length % 2 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}">${esc(p.s)}</text>` : '')
          + (lastOne ? `<text class="v" x="${(x + bw / 2).toFixed(1)}" y="${(p.v < 0 ? y2 + 11 : y1 - 4).toFixed(1)}">${fmt(p.v)}</text>` : '');
      }).join('')}</svg>`;
  }
  function pibHTML(rows) {
    const vars = [...new Set(rows.map((r) => r.varC))];
    const vYoY = vars.find((c) => /mesmo periodo|mesmo trimestre/.test(norm((rows.find((r) => r.varC === c) || {}).varN))) || vars[0];
    const vQoQ = vars.find((c) => c !== vYoY && /imediatamente anterior/.test(norm((rows.find((r) => r.varC === c) || {}).varN)));
    const serie = rows.filter((r) => r.varC === vYoY).sort((a, b) => a.perC.localeCompare(b.perC));
    const short = (r) => { const m = String(r.perC).match(/^(\d{4})(\d{2})$/); return m ? `${+m[2]}T${m[1].slice(2)}` : r.perN; };
    const last = serie[serie.length - 1];
    const qoq = vQoQ && last ? (rows.find((r) => r.varC === vQoQ && r.perC === last.perC) || {}).v : null;
    if (!last) return '<div class="ib-msg">Sem dados do PIB.</div>';
    return `
      <div class="ib-top">
        <div><span>PIB do ${esc(last.perN)}</span><b class="${cls(last.v)}">${sg(last.v, 1)}%</b><small>${esc(pibLabel(last.varN))}</small></div>
        ${vQoQ ? `<div><span>No trimestre</span><b class="${cls(qoq)}">${sg(qoq, 1)}%</b><small>vs. trimestre anterior, com ajuste sazonal</small></div>` : ''}
      </div>
      ${barsSVG(serie.map((r) => ({ v: r.v, n: r.perN, s: short(r) })), (v) => `${sg(v, 1)}%`)}
      <p class="ib-note">Barras: ${esc(pibLabel(last.varN))}, a preços de mercado.</p>`;
  }

  /* ---------------- desemprego ---------------- */
  function desempHTML(rows) {
    const serie = rows.filter((r) => /desocupa/.test(norm(r.varN))).sort((a, b) => a.perC.localeCompare(b.perC));
    if (!serie.length) return '<div class="ib-msg">Formato inesperado do IBGE.</div>';
    const last = serie[serie.length - 1], ano = serie.length > 12 ? serie[serie.length - 13] : null;
    const vs = serie.map((r) => r.v).filter(ok);
    const W = 420, H = 150, T = 18, B = 26, max = Math.max(...vs), min = Math.min(...vs), span = (max - min) || 1;
    const x = (i) => 8 + i * (W - 16) / Math.max(1, serie.length - 1);
    const y = (v) => T + (max - v) / span * (H - T - B);
    const pts = serie.map((r, i) => (ok(r.v) ? `${x(i).toFixed(1)},${y(r.v).toFixed(1)}` : null)).filter(Boolean);
    const lbl = (r) => { const m = String(r.perC).match(/^(\d{4})(\d{2})$/); return m ? `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m[2] - 1]}/${m[1].slice(2)}` : r.perN; };
    const tick = [0, Math.floor((serie.length - 1) / 2), serie.length - 1];
    const d = ano && ok(ano.v) && ok(last.v) ? last.v - ano.v : null;
    return `
      <div class="ib-top">
        <div><span>${/^trimestre/i.test(last.perN) ? '' : 'Trimestre '}${esc(last.perN)}</span><b>${nf(last.v, 1)}%</b><small>taxa de desocupação (PNAD Contínua)</small></div>
        <div><span>Em 1 ano</span><b class="${d == null ? 'na' : d < 0 ? 'up' : d > 0 ? 'dn' : 'eq'}">${sg(d, 1)} p.p.</b><small>${ano ? `vs. ${esc(ano.perN)}` : ''}</small></div>
      </div>
      <svg class="ib-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Taxa de desocupação">
        <polyline class="ln" points="${pts.join(' ')}"/>
        <circle class="pt" cx="${x(serie.length - 1).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3.5"/>
        <text class="v" x="${(x(serie.length - 1) - 4).toFixed(1)}" y="${(y(last.v) - 8).toFixed(1)}" style="text-anchor:end">${nf(last.v, 1)}%</text>
        <text class="v" x="${x(serie.findIndex((r) => r.v === max)).toFixed(1)}" y="${(y(max) - 6).toFixed(1)}">${nf(max, 1)}%</text>
        ${tick.map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" style="text-anchor:${i === 0 ? 'start' : i === serie.length - 1 ? 'end' : 'middle'}">${esc(lbl(serie[i]))}</text>`).join('')}
      </svg>
      <p class="ib-note">Trimestre móvel: cada ponto é a média de três meses, terminando no mês indicado.</p>`;
  }

  const DEF = {
    ipca: { t: 'IPCA por grupo', s: 'IBGE · tabela 7060', f: ipcaHTML },
    pib: { t: 'PIB trimestral', s: 'IBGE · tabela 5932', f: pibHTML },
    desemp: { t: 'Desemprego', s: 'IBGE/PNAD · tabela 6381', f: desempHTML }
  };
  function draw(key) {
    if (!host || !host.isConnected) return;
    const box = host.querySelector(`[data-ib="${key}"] .ib-in`);
    if (!box) return;
    const c = cache[key], s = st[key];
    let html;
    if (c && c.rows) { try { html = DEF[key].f(c.rows); } catch (e) { html = '<div class="ib-msg">Não foi possível ler os dados do IBGE.</div>'; } }
    else html = `<div class="ib-msg">${s.busy ? 'Carregando dados do IBGE…' : s.err ? 'IBGE fora do ar agora. Tente de novo em instantes.' : '—'}</div>`;
    box.innerHTML = html;
    const meta = host.querySelector(`[data-ib="${key}"] .ib-meta`);
    if (meta) meta.innerHTML = `<a href="${LINK[key]}" target="_blank" rel="noopener">${esc(DEF[key].s)}</a>${s.err && c ? ' · último dado salvo' : ''}${s.busy && c ? ' · atualizando…' : ''}`;
  }

  // chamado pelo indicadores.js toda vez que a área Brasil é desenhada
  window.__ibgeRender = (container, force = false) => {
    let sec = container.querySelector('#ibge-sec');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'ind-sec';
      sec.id = 'ibge-sec';
      sec.innerHTML = `<div class="market-section-head"><span class="sec-icon"><i class="fas fa-chart-bar"></i></span><h2>IBGE em detalhe</h2><span class="sec-count">3 painéis</span></div>
        <div class="ib-grid">${Object.entries(DEF).map(([k, d]) => `<div class="ib-box" data-ib="${k}"><div class="ib-h"><h3>${esc(d.t)}</h3><span class="ib-meta"></span></div><div class="ib-in"></div></div>`).join('')}</div>`;
      container.appendChild(sec);
    }
    host = sec;
    Object.keys(DEF).forEach((k) => { draw(k); load(k, force); });
  };

  const css = document.createElement('style');
  css.textContent = `
  .ib-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr); gap:12px; align-items:start; }
  .ib-box { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; min-width:0; }
  .ib-h { display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--surface-2) 70%, transparent); }
  .ib-h h3 { margin:0; flex:1; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  .ib-meta { font-size:10.5px; color:var(--text-3); white-space:nowrap; }
  .ib-meta a { color:var(--text-3); text-decoration:none; } .ib-meta a:hover { color:var(--accent-ink); text-decoration:underline; }
  .ib-in { padding:12px; }
  .ib-msg { padding:36px 10px; text-align:center; font-size:12.5px; color:var(--text-3); }
  .ib-top { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-end; margin-bottom:10px; }
  .ib-top > div { display:flex; flex-direction:column; gap:1px; min-width:0; }
  .ib-top span { font-size:11.5px; color:var(--text-3); }
  .ib-top b { font:600 20px 'JetBrains Mono', monospace; color:var(--text); letter-spacing:-.02em; }
  .ib-top small { font-size:10.5px; color:var(--text-3); }
  .ib-in .up { color:var(--neg); } .ib-in .dn { color:var(--pos-ink); } .ib-in .na, .ib-in .eq { color:var(--text-3); }
  [data-ib="pib"] .up, [data-ib="desemp"] .up { color:var(--pos-ink); } [data-ib="pib"] .dn, [data-ib="desemp"] .dn { color:var(--neg); }
  .ib-spark { flex:1; min-width:90px; height:34px; display:flex; align-items:flex-end; gap:3px; }
  .ib-spark i { flex:1; border-radius:2px 2px 0 0; background:var(--neg); opacity:.75; }
  .ib-spark i.dn { background:var(--pos); }
  .ib-spark i:last-child { opacity:1; }
  .ib-tb { width:100%; border-collapse:collapse; font-size:12px; }
  .ib-tb th, .ib-tb td { padding:6px 6px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .ib-tb td { font-family:'JetBrains Mono', monospace; font-size:11.5px; }
  .ib-tb tbody th { text-align:left; font-weight:500; color:var(--text-2); white-space:normal; }
  .ib-tb thead th { font-size:10.5px; color:var(--text-3); font-weight:600; }
  .ib-tb thead th:first-child { text-align:left; }
  .ib-tb tr:last-child th, .ib-tb tr:last-child td { border-bottom:0; }
  .ib-cb { width:36%; }
  .ib-cw { display:flex; align-items:center; gap:8px; justify-content:flex-end; }
  .ib-bar { position:relative; flex:1; min-width:50px; height:8px; }
  .ib-bar::before { content:''; position:absolute; left:50%; top:-3px; bottom:-3px; width:1px; background:var(--line-2); }
  .ib-bar i { position:absolute; top:0; bottom:0; border-radius:2px; background:var(--neg); }
  .ib-bar i.dn { background:var(--pos); }
  .ib-cb em { font-style:normal; min-width:70px; }
  .ib-note { margin:8px 0 0; font-size:10.5px; color:var(--text-3); line-height:1.5; }
  .ib-svg { display:block; width:100%; height:auto; }
  .ib-svg .z { stroke:var(--line-2); }
  .ib-svg rect.up { fill:var(--pos); opacity:.7; } .ib-svg rect.dn { fill:var(--neg); opacity:.7; } .ib-svg rect.last { opacity:1; }
  .ib-svg text { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); text-anchor:middle; }
  .ib-svg text.v { fill:var(--text); font-weight:600; font-size:11px; }
  .ib-svg .ln { fill:none; stroke:var(--info); stroke-width:2; stroke-linejoin:round; }
  .ib-svg .pt { fill:var(--info); }
  @media (max-width: 1400px) { .ib-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr); } .ib-grid > [data-ib="ipca"] { grid-column:1 / -1; } }
  @media (max-width: 760px) { .ib-grid { grid-template-columns:minmax(0,1fr); } .ib-tb .hs { display:none; } .ib-cb { width:auto; } }`;
  document.head.appendChild(css);
})();
