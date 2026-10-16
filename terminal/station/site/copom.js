/* =========================================================
   PROBABILIDADES DO COPOM (aba Análises)
   Chance de cada decisão do Copom nas próximas reuniões, pelas opções de Copom da B3
   (as mesmas do painel público da B3). Cada opção paga se o Copom decidir exatamente
   aquele cenário, então o preço dela (de 0 a 100) é a chance que o mercado dá a ele.
   Base: copom/copom.json, gravado pelo robô do GitHub (copom.yml) algumas vezes por dia:
   preço de referência de cada opção nos últimos pregões e os negócios do dia.
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__copomRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/copom/copom.json'];
  const CACHE_KEY = 'copom_cache_v2';
  const PREF_KEY = 'copom_prefs_v1';
  const TTL = 20 * 60 * 1000;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const num = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pct = (v) => (ok(v) ? `${num(v, 1)}%` : '—');
  const int = (v) => (ok(v) ? Math.round(v).toLocaleString('pt-BR') : '—');
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const curta = (iso) => `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`;
  const hojeBR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const diasAte = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(hojeBR() + 'T12:00:00Z')) / 86400000);

  let prefs = { sel: 0, graf: false };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let base = null;
  try { base = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { base = null; }
  let root = null, busy = false, erro = '';

  async function getJSON(url, ms = 15000) {
    const r = await fetchT(url, {}, ms);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`HTTP ${r.status}`);
    return j;
  }
  async function load(force = false) {
    if (!force && base && Date.now() - (base.ts || 0) < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      let j = null;
      for (const u of URLS) { try { j = await getJSON(force ? `${u}?t=${Date.now()}` : u); if (j && j.reunioes) break; } catch (e) { j = null; } }
      if (j && j.reunioes) {
        base = { ...j, ts: Date.now() };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(base)); } catch (e) { /* cheio */ }
      }
      if (!base) throw new Error('sem dados');
    } catch (e) {
      erro = 'Não foi possível buscar os dados do Copom agora.';
    } finally { busy = false; draw(); }
  }

  const nomeMov = (m) => (m === 0 ? 'Manter' : m > 0 ? `Alta de ${num(m / 100)}` : `Corte de ${num(-m / 100)}`);
  const tomMov = (m) => (m === 0 ? 'fw-man' : m > 0 ? 'fw-alta' : 'fw-corte');
  const corDe = (k) => ({ 0: '#60a5fa', 25: '#f87171', 50: '#fb923c', 75: '#facc15', 100: '#e879f9', '-25': '#34d399', '-50': '#a78bfa', '-75': '#a3e635', '-100': '#22d3ee' }[+k] || '#94a3b8');
  const faixaAbs = (k) => nomeMov(+k);
  // pregões de referência de uma reunião: o mais novo, o anterior e o de cerca de 1 semana antes
  const ultimos = (r) => {
    const h = r.hist || [], u = h[h.length - 1] || null, o = h[h.length - 2] || null;
    let s = null;
    if (u) {
      const ref = new Date(Date.parse(u.d + 'T12:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
      for (const x of h) if (x.d <= ref) s = x;
    }
    return { u, o, s };
  };
  const hhmm = (t) => (t && t.length >= 16 ? t.slice(11, 16) : '');
  function historico(r) {
    return (r.hist || []).map((h) => ({ d: h.d, abs: h.p }));
  }
  let hist = null;
  function desenhaHist() {
    const box = root?.querySelector('.fw-hbox');
    if (!box || !hist || hist.length < 2) { if (box) box.innerHTML = '<div class="fw-msg">Ainda sem histórico suficiente.</div>'; return; }
    const W = Math.max(300, Math.floor(box.clientWidth || 700)), H = 220, L = 40, Rm = 12, T = 10, B = 24;
    const pw = W - L - Rm, ph = H - T - B, n = hist.length;
    const xs = (i) => L + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
    const ys = (v) => T + ph - (v / 100) * ph;
    const chaves = [...new Set(hist.flatMap((p) => Object.keys(p.abs)))].filter((k) => Math.max(...hist.map((p) => p.abs[k] || 0)) >= 3).sort((a, b) => a - b);
    const grade = [0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - Rm}" y1="${ys(v)}" y2="${ys(v)}" class="g"/><text x="${L - 6}" y="${ys(v) + 3.5}" text-anchor="end">${v}%</text>`).join('');
    const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 70))));
    const rot = hist.map((p, i) => (i % passo === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < passo * 0.6)
      ? `<text x="${xs(i)}" y="${H - 6}" text-anchor="${i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${dm(p.d)}</text>` : '').join('');
    const linhas = chaves.map((k) => `<polyline fill="none" stroke="${corDe(k)}" stroke-width="2" stroke-linejoin="round" points="${hist.map((p, i) => `${xs(i).toFixed(1)},${ys(p.abs[k] || 0).toFixed(1)}`).join(' ')}"/>`).join('');
    box.innerHTML = `<svg class="fw-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico das probabilidades">${grade}${rot}${linhas}<line class="fw-cx" x1="0" x2="0" y1="${T}" y2="${T + ph}" style="display:none"/></svg><div class="fw-tip" hidden></div>`;
    root.querySelector('.fw-hleg').innerHTML = chaves.map((k) => `<span><i style="background:${corDe(k)}"></i>${faixaAbs(k)}</span>`).join('');
    const svg = box.querySelector('svg'), tip = box.querySelector('.fw-tip'), cx = box.querySelector('.fw-cx');
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect(), x = e.clientX - r.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - L) / pw) * (n - 1))));
      const p = hist[i];
      cx.setAttribute('x1', xs(i)); cx.setAttribute('x2', xs(i)); cx.style.display = '';
      tip.innerHTML = `<b>${dmy(p.d)}</b>` + chaves.map((k) => `<div><i style="background:${corDe(k)}"></i>${faixaAbs(k)}<span>${pct(p.abs[k] || 0)}</span></div>`).join('');
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(W - tw, xs(i) + 12 > W - tw ? xs(i) - tw - 12 : xs(i) + 12))}px`;
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; cx.style.display = 'none'; });
  }
  let rzT = null, larg = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { const b = root?.querySelector('.fw-hbox'); if (b && Math.abs(b.clientWidth - larg) > 8) { larg = b.clientWidth; desenhaHist(); } }, 150);
  });


  function draw() {
    if (!root) return;
    if (!base) {
      root.innerHTML = `<div class="fw-msg">${busy ? 'Carregando as probabilidades do Copom...' : esc(erro || 'Sem dados.')}</div>`;
      return;
    }
    const selic = base.selic;
    const reun = (base.reunioes || []).filter((r) => r.data >= hojeBR() && (r.hist || []).length);
    if (!reun.length) {
      root.innerHTML = '<div class="fw-msg">Sem preços das opções de Copom no arquivo do robô.</div>';
      return;
    }
    const sel = Math.min(Math.max(0, prefs.sel | 0), reun.length - 1);
    const R = reun[sel];
    const { u, o, s } = ultimos(R);
    const P = u.p;
    const movs = Object.keys(R.cenarios || P).map(Number)
      .filter((m) => Math.max(P[m] || 0, o?.p?.[m] || 0, s?.p?.[m] || 0, R.vivo?.[m]?.p || 0) >= 1 || (u.oi?.[m] || 0) > 0 && (P[m] || 0) > 0.05)
      .sort((a, b) => a - b);
    const soma = Object.values(P).reduce((t, v) => t + v, 0);
    const maisProv = movs.reduce((m, k) => ((P[k] || 0) > (P[m] ?? -1) ? k : m), movs[0]);
    const esperado = soma > 0 ? Object.entries(P).reduce((t, [k, v]) => t + (+k) * v, 0) / soma : null;
    const faltam = diasAte(R.data);
    const vivoHoje = Object.values(R.vivo || {}).some((v) => (v.t || '').slice(0, 10) === hojeBR());

    const chips = reun.map((x, i) => `<button class="${i === sel ? 'on' : ''}" data-r="${i}">${curta(x.data)}</button>`).join('');

    const barras = movs.map((m) => {
      const p = P[m], v = R.vivo?.[m];
      const hoje = vivoHoje && v && (v.t || '').slice(0, 10) === hojeBR() ? ` <span>·</span> hoje ${pct(v.p)} (${hhmm(v.t)})` : '';
      return `<div class="fw-bar${m === maisProv ? ' top' : ''}">
        <div class="fw-bl">${sel === 0 ? `<b>${ok(selic) ? `${num(selic + m / 100)}%` : '—'}</b><span class="${tomMov(m)}">${m === 0 ? 'Manter (Selic atual)' : nomeMov(m)}</span>` : `<b class="${tomMov(m)}">${nomeMov(m)}</b><span>${m === 0 ? 'sem mudança nesta reunião' : 'nesta reunião'}</span>`}</div>
        <div class="fw-bt"><i style="width:${Math.max(0.5, Math.min(100, p || 0)).toFixed(1)}%"></i></div>
        <div class="fw-bv">${pct(p)}</div>
        <div class="fw-bc">ontem ${pct(o?.p?.[m])} <span>·</span> 1 semana ${pct(s?.p?.[m])}${hoje}</div>
      </div>`;
    }).join('');

    // tabela: todas as reuniões x cenários (cada reunião sozinha: a decisão daquela reunião)
    const cols = [...new Set(reun.flatMap((x) => { const p = ultimos(x).u.p; return Object.keys(p).filter((k) => p[k] >= 1).map(Number); }))].sort((a, b) => a - b);
    const tabela = `<table class="fw-tab"><thead><tr><th>Reunião</th>${cols.map((m) => `<th>${m === 0 ? 'Manter' : `${m > 0 ? '+' : '−'}${num(Math.abs(m) / 100)}`}</th>`).join('')}<th>Contratos em aberto</th><th>Pregão</th></tr></thead><tbody>${reun.map((x, i) => {
      const ux = ultimos(x).u, p = ux.p;
      const mx = Math.max(...Object.values(p));
      const oi = Object.values(ux.oi || {}).reduce((t, v) => t + v, 0);
      return `<tr class="${i === sel ? 'sel' : ''}" data-r="${i}"><td>${dmy(x.data)}</td>${cols.map((m) => {
        const v = p[m];
        if (!ok(v) || v < 0.5) return '<td class="z">—</td>';
        return `<td class="${v === mx ? 'mx' : ''}" style="--a:${Math.min(1, v / 100).toFixed(3)}">${num(v, 1)}%</td>`;
      }).join('')}<td class="fw-ct">${int(oi)}</td><td class="fw-ct">${dm(ux.d)}</td></tr>`;
    }).join('')}</tbody></table>`;

    const bp = (v) => (ok(v) ? `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 1)} bp` : '—');
    const oiTot = Object.values(u.oi || {}).reduce((t, v) => t + v, 0), negTot = Object.values(u.n || {}).reduce((t, v) => t + v, 0);
    root.innerHTML = `<div class="fw-card">
      <div class="fw-top">
        <div class="fw-chips" role="tablist" aria-label="Reuniões do Copom">${chips}</div>
        <span class="fw-sp"></span>
        <button class="fw-ib" data-act="reload" title="Atualizar"${busy ? ' disabled' : ''}><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
      </div>
      <div class="fw-kpis">
        <div><span>Reunião</span><b>${dmy(R.data)}</b><small>${faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`}</small></div>
        <div><span>Selic atual</span><b>${ok(selic) ? `${num(selic)}%` : '—'}</b><small>meta do Copom</small></div>
        <div><span>Mais provável</span><b class="${tomMov(maisProv)}">${nomeMov(maisProv)}</b><small>${pct(P[maisProv])} de chance</small></div>
        <div><span>Decisão média esperada</span><b>${bp(esperado)}</b><small>${sel === 0 ? `Selic de ${ok(selic) && ok(esperado) ? `${num(selic + esperado / 100)}%` : '—'} depois` : 'nesta reunião'}</small></div>
      </div>
      <div class="fw-sec">Chance de cada decisão na reunião de ${dmy(R.data)} ${sel === 0 ? '<small>(e a Selic depois dela)</small>' : '<small>(mudança nesta reunião, além do que for decidido antes)</small>'}</div>
      <div class="fw-ctr">
        <span class="fw-ctr-t">Opções de Copom</span>
        <span>pregão</span><b>${dmy(u.d)}</b>
        <span>contratos em aberto</span><b>${int(oiTot)}</b>
        <span>negociados no dia</span><b>${int(negTot)}</b>
        <span>soma das chances</span><b>${pct(soma)}</b>
      </div>
      <div class="fw-bars">${barras}</div>
      <div class="fw-sec fw-sec-b">Como a chance mudou <small>(reunião de ${dmy(R.data)}, últimos pregões)</small>
        <button class="fw-tg" data-act="graf" aria-expanded="${prefs.graf ? 'true' : 'false'}">${prefs.graf ? 'Esconder gráfico' : 'Mostrar gráfico'}</button></div>
      ${prefs.graf ? '<div class="fw-hleg"></div><div class="fw-hwrap"><div class="fw-hbox"></div></div>' : ''}
      <div class="fw-sec">Todas as reuniões <small>(chance de cada decisão, reunião por reunião)</small></div>
      <div class="fw-tabw">${tabela}</div>
      <div class="fw-foot">Preço de referência das opções de Copom da B3 no pregão de ${dmy(u.d)}${vivoHoje ? '; "hoje" é o último negócio do dia' : ''}.
        Cada opção paga se o Copom decidir exatamente aquele cenário, então o preço (de 0 a 100) é a chance que o mercado dá a ele; por isso a soma pode passar ou ficar abaixo de 100%.
        Cada reunião tem as suas opções: a chance é da decisão daquela reunião. Reuniões sem opções negociadas não aparecem.
        Fonte: B3, painel público de opções de Copom.${erro ? ` <b>${esc(erro)}</b>` : ''}</div>
    </div>`;
    if (prefs.graf) {
      hist = historico(R);
      larg = root.querySelector('.fw-hbox')?.clientWidth || 0;
      desenhaHist();
    }
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) { prefs.sel = +b.dataset.r; savePrefs(); draw(); return; }
      if (e.target.closest('[data-act="graf"]')) { prefs.graf = !prefs.graf; savePrefs(); draw(); return; }
      if (e.target.closest('[data-act="reload"]') && !busy) load(true);
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  #copom-root { min-width:0; max-width:100%; }
  #copom-root .fw-card { min-width:0; max-width:100%; }
  #copom-root .fw-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  #copom-root .fw-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  #copom-root .fw-top { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--line); }
  #copom-root .fw-chips { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; min-width:0; }
  #copom-root .fw-chips button { flex:none; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; padding:6px 12px; border-radius:99px; cursor:pointer; white-space:nowrap; }
  #copom-root .fw-chips button i { font-style:normal; color:var(--accent); margin-left:2px; }
  #copom-root .fw-chips button.on { background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent); font-weight:600; }
  #copom-root .fw-sp { flex:1; }
  #copom-root .fw-ib { height:32px; min-width:32px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:9px; cursor:pointer; flex:none; }
  #copom-root .fw-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  #copom-root .fw-kpis > div { padding:12px 14px; display:flex; flex-direction:column; gap:3px; min-width:0; }
  #copom-root .fw-kpis > div + div { border-left:1px solid var(--line); }
  #copom-root .fw-kpis span { font-size:11.5px; color:var(--text-3); }
  #copom-root .fw-kpis b { font:600 18px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #copom-root .fw-kpis small { font-size:11px; color:var(--text-3); }
  #copom-root .fw-man { color:var(--info) !important; }
  #copom-root .fw-alta { color:var(--neg) !important; }
  #copom-root .fw-corte { color:var(--pos) !important; }
  #copom-root .fw-sec { padding:14px 14px 6px; font-size:12.5px; font-weight:600; color:var(--text); }
  #copom-root .fw-sec small { font-weight:400; color:var(--text-3); }
  #copom-root .fw-bars { padding:4px 14px 10px; display:flex; flex-direction:column; gap:8px; }
  #copom-root .fw-bar { display:grid; grid-template-columns:190px minmax(0,1fr) 64px 190px; align-items:center; gap:12px; }
  #copom-root .fw-bl { display:flex; flex-direction:column; gap:1px; min-width:0; }
  #copom-root .fw-bl b { font:600 13px 'JetBrains Mono', monospace; color:var(--text); }
  #copom-root .fw-bl span { font-size:11px; }
  #copom-root .fw-bt { height:14px; border-radius:4px; background:var(--surface-2); overflow:hidden; }
  #copom-root .fw-bt i { display:block; height:100%; background:color-mix(in srgb, var(--info) 70%, transparent); border-radius:4px; }
  #copom-root .fw-bar.top .fw-bt i { background:var(--accent); }
  #copom-root .fw-bv { font:600 14px 'JetBrains Mono', monospace; text-align:right; color:var(--text); }
  #copom-root .fw-bc { font-size:11px; color:var(--text-3); white-space:nowrap; }
  #copom-root .fw-bc span { opacity:.6; }
  #copom-root .fw-tabw { overflow-x:auto; padding:0 14px 6px; }
  #copom-root .fw-tab { width:100%; border-collapse:collapse; font-size:12px; }
  #copom-root .fw-tab th { text-align:right; font-weight:600; color:var(--text-3); padding:7px 8px; border-bottom:1px solid var(--line); white-space:nowrap; font-family:'JetBrains Mono', monospace; font-size:11px; }
  #copom-root .fw-tab th:first-child, #copom-root .fw-tab td:first-child { text-align:left; font-family:inherit; }
  #copom-root .fw-tab td { text-align:right; padding:7px 8px; border-bottom:1px solid var(--line); font-family:'JetBrains Mono', monospace; color:var(--text-2); white-space:nowrap;
    background:color-mix(in srgb, var(--info) calc(var(--a, 0) * 34%), transparent); }
  #copom-root .fw-tab td.z { color:var(--text-3); opacity:.5; }
  #copom-root .fw-tab td.mx { color:var(--text); font-weight:700; box-shadow:inset 0 -2px 0 var(--accent); }
  #copom-root .fw-tab td.fw-tx { color:var(--text); background:none; }
  #copom-root .fw-tab tr { cursor:pointer; }
  #copom-root .fw-tab tr:hover td:first-child, #copom-root .fw-tab tr.sel td:first-child { color:var(--accent); font-weight:600; }
  #copom-root .fw-foot { padding:10px 14px 12px; font-size:11.5px; color:var(--text-3); line-height:1.5; border-top:1px solid var(--line); margin-top:8px; }
  #copom-root .fw-ctr { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 14px; margin:2px 14px 8px; padding:9px 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); font-size:11.5px; color:var(--text-3); }
  #copom-root .fw-ctr b { font:700 13px 'JetBrains Mono', monospace; color:var(--text); margin-right:-8px; }
  #copom-root .fw-ctr-t { text-transform:uppercase; letter-spacing:.06em; font-size:10px; font-weight:700; }
  #copom-root .fw-ctr-p { font:600 13px 'JetBrains Mono', monospace; color:var(--accent); }
  #copom-root .fw-tab td.fw-ct { background:none; color:var(--text-3); font-size:11px; }
  #copom-root .fw-tab td.fw-ct b { color:var(--text-2); font-weight:600; }
  #copom-root .fw-sec-b { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  #copom-root .fw-tg { margin-left:auto; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; font-weight:500; padding:5px 12px; border-radius:8px; cursor:pointer; }
  #copom-root .fw-tg:hover { color:var(--text); border-color:var(--line-2); }
  #copom-root .fw-hleg { display:flex; flex-wrap:wrap; gap:4px 14px; padding:0 14px 4px; font-size:11.5px; color:var(--text-2); }
  #copom-root .fw-hleg span { display:inline-flex; align-items:center; gap:6px; font-family:'JetBrains Mono', monospace; }
  #copom-root .fw-hleg i, #copom-root .fw-tip i { width:10px; height:3px; border-radius:2px; display:inline-block; }
  #copom-root .fw-hwrap { padding:0 14px 8px; }
  #copom-root .fw-hbox { position:relative; width:100%; min-height:220px; }
  #copom-root .fw-svg { display:block; }
  #copom-root .fw-svg text { fill:var(--text-3); font:10px 'JetBrains Mono', monospace; }
  #copom-root .fw-svg .g { stroke:var(--line); stroke-width:1; }
  #copom-root .fw-svg .fw-cx { stroke:var(--text-3); stroke-dasharray:3 3; }
  #copom-root .fw-tip { position:absolute; top:6px; z-index:2; pointer-events:none; background:var(--surface); border:1px solid var(--line-2); border-radius:9px; box-shadow:var(--shadow-lg); padding:8px 10px; font-size:11.5px; color:var(--text-2); min-width:170px; }
  #copom-root .fw-tip b { display:block; color:var(--text); margin-bottom:4px; }
  #copom-root .fw-tip div { display:flex; align-items:center; gap:7px; line-height:1.7; font-family:'JetBrains Mono', monospace; }
  #copom-root .fw-tip span { margin-left:auto; padding-left:10px; color:var(--text); font-weight:600; }
  @media (max-width: 900px) {
    #copom-root .fw-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    #copom-root .fw-kpis > div:nth-child(3) { border-left:0; }
    #copom-root .fw-kpis > div:nth-child(n+3) { border-top:1px solid var(--line); }
    #copom-root .fw-bar { grid-template-columns:minmax(0,1fr) 60px; grid-template-areas:"l v" "t t" "c c"; gap:4px 10px; }
    #copom-root .fw-bl { grid-area:l; } #copom-root .fw-bv { grid-area:v; } #copom-root .fw-bt { grid-area:t; } #copom-root .fw-bc { grid-area:c; }
    #copom-root .fw-kpis b { font-size:15px; }
  }`;
  document.head.appendChild(css);

  window.__copomRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    draw();
    load(false);
  };
})();
