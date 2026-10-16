/* =========================================================
   CURVA DE JUROS (aba Análises): a curva DI x pré da B3 de hoje,
   comparada com o pregão anterior, 1 semana e 1 mês atrás.
   Base: curva/curva.json, gravado pelo robô do GitHub (curva.yml) à noite,
   do arquivo de Taxas de Swap da B3 (a curva que marca os contratos de DI futuro).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__curvaRender) return;
  const URL_J = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/curva/curva.json';
  const CACHE_KEY = 'curva_cache_v1';
  const PREF_KEY = 'curva_prefs_v1';
  const TTL = 60 * 60 * 1000;
  const SERIES = [
    ['hoje', 'Último pregão', '#f5b83d'],
    ['ontem', 'Pregão anterior', '#94a3b8'],
    ['semana', '1 semana', '#60a5fa'],
    ['mes', '1 mês', '#34d399'],
  ];
  const PRAZOS = [[63, '3 meses'], [126, '6 meses'], [252, '1 ano'], [504, '2 anos'], [756, '3 anos'], [1260, '5 anos'], [2520, '10 anos']];
  const ANOS = [[2, '2 anos'], [5, '5 anos'], [10, '10 anos']];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const num = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const bp = (v) => (ok(v) ? `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 0)}` : '—');

  let prefs = { ver: { hoje: true, ontem: false, semana: true, mes: true }, ate: 10 };
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; prefs = { ...prefs, ...p, ver: { ...prefs.ver, ...(p.ver || {}) } }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let base = null;
  try { base = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { base = null; }
  let root = null, busy = false, erro = '';

  async function load(force = false) {
    if (!force && base && Date.now() - (base.ts || 0) < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      const r = await fetchT(force ? `${URL_J}?t=${Date.now()}` : URL_J, {}, 15000);
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.curvas) {
        base = { ...j, ts: Date.now() };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(base)); } catch (e) { /* cheio */ }
      }
      if (!base) throw new Error('sem dados');
    } catch (e) {
      erro = 'Não foi possível buscar a curva agora.';
    } finally { busy = false; draw(); }
  }

  // taxa num prazo (dias úteis), interpolando em linha reta entre os vértices da B3
  function taxa(c, du) {
    const v = c?.v;
    if (!v || !v.length || du < v[0][0] || du > v[v.length - 1][0]) return null;
    for (let i = 1; i < v.length; i++) {
      if (v[i][0] >= du) {
        const [a, , ta] = v[i - 1], [b, , tb] = v[i];
        return b === a ? tb : ta + (tb - ta) * (du - a) / (b - a);
      }
    }
    return v[v.length - 1][2];
  }

  let geo = null;
  function desenha() {
    const box = root?.querySelector('.cv-box');
    if (!box || !base) return;
    const C = base.curvas, ate = prefs.ate * 252;
    const vis = SERIES.filter(([k]) => prefs.ver[k] && C[k]);
    const W = Math.max(300, Math.floor(box.clientWidth || 700)), H = Math.round(Math.max(240, Math.min(380, W * 0.36))), L = 46, R = 14, T = 12, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const pts = vis.map(([k]) => C[k].v.filter((x) => x[0] <= ate));
    const all = pts.flat().map((x) => x[2]);
    if (!all.length) { box.innerHTML = '<div class="fw-msg">Marque ao menos uma curva.</div>'; return; }
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = Math.max(0.1, (hi - lo) * 0.08); lo -= pad; hi += pad;
    const passoY = [0.1, 0.25, 0.5, 1, 2].find((p) => (hi - lo) / p <= 7) || 2;
    const xs = (du) => L + (du / ate) * pw, ys = (t) => T + ph - ((t - lo) / (hi - lo)) * ph;
    let grade = '';
    for (let y = Math.ceil(lo / passoY) * passoY; y <= hi; y += passoY) grade += `<line x1="${L}" x2="${W - R}" y1="${ys(y).toFixed(1)}" y2="${ys(y).toFixed(1)}" class="g"/><text x="${L - 6}" y="${(ys(y) + 3.5).toFixed(1)}" text-anchor="end">${num(y, passoY < 0.25 ? 2 : passoY < 1 ? 2 : 0)}%</text>`;
    const marcas = prefs.ate <= 3 ? [0.25, 0.5, 1, 1.5, 2, 2.5, 3] : prefs.ate <= 5 ? [0.5, 1, 2, 3, 4, 5] : [1, 2, 3, 5, 7, 10];
    const rot = marcas.filter((a) => a <= prefs.ate).map((a) => `<line x1="${xs(a * 252).toFixed(1)}" x2="${xs(a * 252).toFixed(1)}" y1="${T}" y2="${T + ph}" class="g gv"/><text x="${xs(a * 252).toFixed(1)}" y="${H - 7}" text-anchor="middle">${a < 1 ? `${Math.round(a * 12)}m` : `${a}a`}</text>`).join('');
    const linhas = vis.map(([k, , cor], i) => `<polyline fill="none" stroke="${cor}" stroke-width="${k === 'hoje' ? 2.4 : 1.6}"${k === 'hoje' ? '' : ' stroke-dasharray="5 3"'} stroke-linejoin="round" points="${pts[i].map((x) => `${xs(x[0]).toFixed(1)},${ys(x[2]).toFixed(1)}`).join(' ')}"/>`).join('');
    box.innerHTML = `<svg class="fw-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de juros DI x pré">${grade}${rot}${linhas}<line class="fw-cx" x1="0" x2="0" y1="${T}" y2="${T + ph}" style="display:none"/></svg><div class="fw-tip" hidden></div>`;
    geo = { W, L, pw, ate, vis };
    const svg = box.querySelector('svg'), tip = box.querySelector('.fw-tip'), cx = box.querySelector('.fw-cx');
    const mover = (clientX) => {
      const r = svg.getBoundingClientRect(), x = clientX - r.left;
      const du = Math.max(1, Math.min(ate, Math.round(((x - L) / pw) * ate)));
      cx.setAttribute('x1', xs(du)); cx.setAttribute('x2', xs(du)); cx.style.display = '';
      const anos = du / 252;
      tip.innerHTML = `<b>${anos < 1 ? `${Math.round(anos * 12)} meses` : `${num(anos, 1)} anos`} <small>(${du} dias úteis)</small></b>` + vis.map(([k, nome, cor]) => `<div><i style="background:${cor}"></i>${esc(nome)}<span>${num(taxa(C[k], du))}%</span></div>`).join('');
      tip.hidden = false;
      const tw = tip.offsetWidth, px = xs(du);
      tip.style.left = `${Math.max(0, Math.min(W - tw, px + 12 > W - tw ? px - tw - 12 : px + 12))}px`;
    };
    svg.addEventListener('mousemove', (e) => mover(e.clientX));
    svg.addEventListener('touchmove', (e) => { if (e.touches[0]) mover(e.touches[0].clientX); }, { passive: true });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; cx.style.display = 'none'; });
  }
  let rzT = null, larg = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { const b = root?.querySelector('.cv-box'); if (b && Math.abs(b.clientWidth - larg) > 8) { larg = b.clientWidth; desenha(); } }, 150);
  });

  function draw() {
    if (!root) return;
    if (!base) {
      root.innerHTML = `<div class="fw-msg">${busy ? 'Carregando a curva de juros...' : esc(erro || 'Sem dados.')}</div>`;
      return;
    }
    const C = base.curvas;
    if (!C.hoje) { root.innerHTML = '<div class="fw-msg">Sem curva no arquivo do robô.</div>'; return; }
    const t = (k, du) => taxa(C[k], du);
    const kpis = ANOS.map(([a, nome]) => {
      const v = t('hoje', a * 252);
      return `<div><span>DI ${nome}</span><b>${ok(v) ? `${num(v)}%` : '—'}</b><small>dia ${bp((v - t('ontem', a * 252)) * 100)} · mês ${bp((v - t('mes', a * 252)) * 100)} bp</small></div>`;
    }).join('');
    const incl = (k) => { const a = t(k, 2520), b = t(k, 504); return ok(a) && ok(b) ? (a - b) * 100 : null; };
    const ih = incl('hoje'), im = incl('mes');
    const legenda = SERIES.map(([k, nome, cor]) => C[k] ? `<label class="cv-lg"><input type="checkbox" data-k="${k}"${prefs.ver[k] ? ' checked' : ''}><i style="background:${cor}"></i>${esc(nome)} <small>${dmy(C[k].d)}</small></label>` : '').join('');
    const linhas = PRAZOS.map(([du, nome]) => {
      const h = t('hoje', du);
      const d = (k) => (ok(h) && ok(t(k, du)) ? (h - t(k, du)) * 100 : null);
      const cel = (v) => `<td class="${ok(v) && Math.abs(v) >= 0.5 ? (v > 0 ? 'cv-up' : 'cv-dn') : ''}">${bp(v)}</td>`;
      return `<tr><td>${nome}</td><td class="fw-tx">${ok(h) ? `${num(h)}%` : '—'}</td>${cel(d('ontem'))}${cel(d('semana'))}${cel(d('mes'))}</tr>`;
    }).join('');
    root.innerHTML = `<div class="fw-card">
      <div class="fw-kpis">${kpis}<div><span>Inclinação 2 a 10 anos</span><b>${ok(ih) ? `${bp(ih)} bp` : '—'}</b><small>há 1 mês ${ok(im) ? `${bp(im)} bp` : '—'}</small></div></div>
      <div class="cv-top">
        <div class="cv-lgs">${legenda}</div>
        <div class="fw-chips cv-ate">${[3, 5, 10].map((a) => `<button class="${prefs.ate === a ? 'on' : ''}" data-ate="${a}">${a} anos</button>`).join('')}</div>
        <button class="fw-ib" data-act="reload" title="Atualizar"${busy ? ' disabled' : ''}><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
      </div>
      <div class="fw-hwrap"><div class="fw-hbox cv-box"></div></div>
      <div class="fw-sec">Taxa por prazo <small>(variação em pontos-base)</small></div>
      <div class="fw-tabw"><table class="fw-tab"><thead><tr><th>Prazo</th><th>Taxa</th><th>Dia</th><th>1 semana</th><th>1 mês</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <div class="fw-foot">Curva DI x pré do fechamento de ${dmy(C.hoje.d)}: a taxa ao ano (base 252 dias úteis) que o mercado de DI futuro cobra para cada prazo. Taxa subindo indica mercado esperando juros mais altos; caindo, juros mais baixos.
        A B3 publica a curva depois do pregão, então ela atualiza à noite. Entre os vértices da B3 a taxa é ligada em linha reta. Fonte: B3, Taxas de Swap.${erro ? ` <b>${esc(erro)}</b>` : ''}</div>
    </div>`;
    larg = root.querySelector('.cv-box')?.clientWidth || 0;
    desenha();
  }

  function bind(el) {
    el.addEventListener('change', (e) => {
      const c = e.target.closest('input[data-k]');
      if (c) { prefs.ver[c.dataset.k] = c.checked; savePrefs(); desenha(); }
    });
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-ate]');
      if (a) { prefs.ate = +a.dataset.ate; savePrefs(); draw(); return; }
      if (e.target.closest('[data-act="reload"]') && !busy) load(true);
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  #curva-root { min-width:0; max-width:100%; }
  #curva-root .fw-card { min-width:0; max-width:100%; }
  #curva-root .fw-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  #curva-root .fw-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  #curva-root .fw-top { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--line); }
  #curva-root .fw-chips { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; min-width:0; }
  #curva-root .fw-chips button { flex:none; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; padding:6px 12px; border-radius:99px; cursor:pointer; white-space:nowrap; }
  #curva-root .fw-chips button i { font-style:normal; color:var(--accent); margin-left:2px; }
  #curva-root .fw-chips button.on { background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent); font-weight:600; }
  #curva-root .fw-sp { flex:1; }
  #curva-root .fw-ib { height:32px; min-width:32px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:9px; cursor:pointer; flex:none; }
  #curva-root .fw-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  #curva-root .fw-kpis > div { padding:12px 14px; display:flex; flex-direction:column; gap:3px; min-width:0; }
  #curva-root .fw-kpis > div + div { border-left:1px solid var(--line); }
  #curva-root .fw-kpis span { font-size:11.5px; color:var(--text-3); }
  #curva-root .fw-kpis b { font:600 18px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #curva-root .fw-kpis small { font-size:11px; color:var(--text-3); }
  #curva-root .fw-man { color:var(--info) !important; }
  #curva-root .fw-alta { color:var(--neg) !important; }
  #curva-root .fw-corte { color:var(--pos) !important; }
  #curva-root .fw-sec { padding:14px 14px 6px; font-size:12.5px; font-weight:600; color:var(--text); }
  #curva-root .fw-sec small { font-weight:400; color:var(--text-3); }
  #curva-root .fw-bars { padding:4px 14px 10px; display:flex; flex-direction:column; gap:8px; }
  #curva-root .fw-bar { display:grid; grid-template-columns:190px minmax(0,1fr) 64px 190px; align-items:center; gap:12px; }
  #curva-root .fw-bl { display:flex; flex-direction:column; gap:1px; min-width:0; }
  #curva-root .fw-bl b { font:600 13px 'JetBrains Mono', monospace; color:var(--text); }
  #curva-root .fw-bl span { font-size:11px; }
  #curva-root .fw-bt { height:14px; border-radius:4px; background:var(--surface-2); overflow:hidden; }
  #curva-root .fw-bt i { display:block; height:100%; background:color-mix(in srgb, var(--info) 70%, transparent); border-radius:4px; }
  #curva-root .fw-bar.top .fw-bt i { background:var(--accent); }
  #curva-root .fw-bv { font:600 14px 'JetBrains Mono', monospace; text-align:right; color:var(--text); }
  #curva-root .fw-bc { font-size:11px; color:var(--text-3); white-space:nowrap; }
  #curva-root .fw-bc span { opacity:.6; }
  #curva-root .fw-tabw { overflow-x:auto; padding:0 14px 6px; }
  #curva-root .fw-tab { width:100%; border-collapse:collapse; font-size:12px; }
  #curva-root .fw-tab th { text-align:right; font-weight:600; color:var(--text-3); padding:7px 8px; border-bottom:1px solid var(--line); white-space:nowrap; font-family:'JetBrains Mono', monospace; font-size:11px; }
  #curva-root .fw-tab th:first-child, #curva-root .fw-tab td:first-child { text-align:left; font-family:inherit; }
  #curva-root .fw-tab td { text-align:right; padding:7px 8px; border-bottom:1px solid var(--line); font-family:'JetBrains Mono', monospace; color:var(--text-2); white-space:nowrap;
    background:color-mix(in srgb, var(--info) calc(var(--a, 0) * 34%), transparent); }
  #curva-root .fw-tab td.z { color:var(--text-3); opacity:.5; }
  #curva-root .fw-tab td.mx { color:var(--text); font-weight:700; box-shadow:inset 0 -2px 0 var(--accent); }
  #curva-root .fw-tab td.fw-tx { color:var(--text); background:none; }
  #curva-root .fw-tab tr { cursor:pointer; }
  #curva-root .fw-tab tr:hover td:first-child, #curva-root .fw-tab tr.sel td:first-child { color:var(--accent); font-weight:600; }
  #curva-root .fw-foot { padding:10px 14px 12px; font-size:11.5px; color:var(--text-3); line-height:1.5; border-top:1px solid var(--line); margin-top:8px; }
  #curva-root .fw-ctr { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 14px; margin:2px 14px 8px; padding:9px 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); font-size:11.5px; color:var(--text-3); }
  #curva-root .fw-ctr b { font:700 13px 'JetBrains Mono', monospace; color:var(--text); margin-right:-8px; }
  #curva-root .fw-ctr-t { text-transform:uppercase; letter-spacing:.06em; font-size:10px; font-weight:700; }
  #curva-root .fw-ctr-p { font:600 13px 'JetBrains Mono', monospace; color:var(--accent); }
  #curva-root .fw-tab td.fw-ct { background:none; color:var(--text-3); font-size:11px; }
  #curva-root .fw-tab td.fw-ct b { color:var(--text-2); font-weight:600; }
  #curva-root .fw-sec-b { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  #curva-root .fw-tg { margin-left:auto; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; font-weight:500; padding:5px 12px; border-radius:8px; cursor:pointer; }
  #curva-root .fw-tg:hover { color:var(--text); border-color:var(--line-2); }
  #curva-root .fw-hleg { display:flex; flex-wrap:wrap; gap:4px 14px; padding:0 14px 4px; font-size:11.5px; color:var(--text-2); }
  #curva-root .fw-hleg span { display:inline-flex; align-items:center; gap:6px; font-family:'JetBrains Mono', monospace; }
  #curva-root .fw-hleg i, #curva-root .fw-tip i { width:10px; height:3px; border-radius:2px; display:inline-block; }
  #curva-root .fw-hwrap { padding:0 14px 8px; }
  #curva-root .fw-hbox { position:relative; width:100%; min-height:220px; }
  #curva-root .fw-svg { display:block; }
  #curva-root .fw-svg text { fill:var(--text-3); font:10px 'JetBrains Mono', monospace; }
  #curva-root .fw-svg .g { stroke:var(--line); stroke-width:1; }
  #curva-root .fw-svg .fw-cx { stroke:var(--text-3); stroke-dasharray:3 3; }
  #curva-root .fw-tip { position:absolute; top:6px; z-index:2; pointer-events:none; background:var(--surface); border:1px solid var(--line-2); border-radius:9px; box-shadow:var(--shadow-lg); padding:8px 10px; font-size:11.5px; color:var(--text-2); min-width:170px; }
  #curva-root .fw-tip b { display:block; color:var(--text); margin-bottom:4px; }
  #curva-root .fw-tip div { display:flex; align-items:center; gap:7px; line-height:1.7; font-family:'JetBrains Mono', monospace; }
  #curva-root .fw-tip span { margin-left:auto; padding-left:10px; color:var(--text); font-weight:600; }

  #curva-root .cv-top { display:flex; align-items:center; gap:10px 14px; flex-wrap:wrap; padding:12px 14px 6px; }
  #curva-root .cv-lgs { display:flex; flex-wrap:wrap; gap:6px 14px; flex:1; min-width:0; }
  #curva-root .cv-lg { white-space:nowrap; display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); cursor:pointer; user-select:none; }
  #curva-root .cv-lg input { accent-color:var(--accent); margin:0; }
  #curva-root .cv-lg i { width:14px; height:3px; border-radius:2px; display:inline-block; }
  #curva-root .cv-lg small { color:var(--text-3); font-size:11px; }
  #curva-root .fw-svg .gv { stroke-dasharray:2 4; opacity:.6; }
  #curva-root .fw-tip b small { font-weight:400; color:var(--text-3); }
  #curva-root .fw-tab td.cv-up { color:var(--neg); }
  #curva-root .fw-tab td.cv-dn { color:var(--pos); }
  #curva-root .fw-tab td { background:none; }
  #curva-root .fw-kpis b { font-size:17px; }
  @media (max-width: 700px) { #curva-root .cv-lgs { flex:1 1 100%; } #curva-root .cv-lg small { display:none; } }
  @media (max-width: 900px) {
    #curva-root .fw-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    #curva-root .fw-kpis > div:nth-child(3) { border-left:0; }
    #curva-root .fw-kpis > div:nth-child(n+3) { border-top:1px solid var(--line); }
    #curva-root .fw-bar { grid-template-columns:minmax(0,1fr) 60px; grid-template-areas:"l v" "t t" "c c"; gap:4px 10px; }
    #curva-root .fw-bl { grid-area:l; } #curva-root .fw-bv { grid-area:v; } #curva-root .fw-bt { grid-area:t; } #curva-root .fw-bc { grid-area:c; }
    #curva-root .fw-kpis b { font-size:15px; }
  }`;
  document.head.appendChild(css);

  window.__curvaRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    draw();
    load(false);
  };
})();
