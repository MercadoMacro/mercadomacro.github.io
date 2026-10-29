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

    const ate = (x) => { const d = diasAte(x.data); return d === 0 ? 'Hoje' : d === 1 ? 'amanhã' : `${d} dias`; };
    const chips = reun.map((x, i) => `<button class="${i === sel ? 'on' : ''}" data-r="${i}" aria-pressed="${i === sel}"><b>${curta(x.data)}</b><small>${ate(x)}</small></button>`).join('');
    // manter âmbar, cortes em verdes, altas em vermelhos
    const corMov = (m) => ({ 0: 'var(--accent)', '-25': '#22c55e', '-50': '#16a34a', '-75': '#15803d', '-100': '#166534', 25: '#f97316', 50: '#ef4444', 75: '#dc2626', 100: '#b91c1c' }[m] || '#94a3b8');
    const rotMov = (m) => (m === 0 ? 'Manter' : `${m > 0 ? '+' : '−'}${num(Math.abs(m) / 100)}`);

    // barra empilhada: a divisão das chances numa linha só (aparece quando há mais de um cenário)
    const vis = movs.filter((m) => (P[m] || 0) >= 0.5);
    const pilha = vis.length > 1 ? `<div class="fw-pilha" role="img" aria-label="${vis.map((m) => `${nomeMov(m)}: ${pct(P[m])}`).join(', ')}">${vis.map((m) =>
      `<i style="flex:${P[m].toFixed(2)};background:${corMov(m)}" title="${nomeMov(m)}: ${pct(P[m])}">${P[m] >= 30 ? `<span><em>${nomeMov(m)} · </em>${pct(P[m])}</span>` : P[m] >= 12 ? `<span>${pct(P[m])}</span>` : ''}</i>`).join('')}</div>` : '';

    const barras = movs.map((m) => {
      const p = P[m], v = R.vivo?.[m];
      const hoje = vivoHoje && v && (v.t || '').slice(0, 10) === hojeBR() ? ` <span>·</span> hoje ${pct(v.p)} (${hhmm(v.t)})` : '';
      return `<div class="fw-bar${m === maisProv ? ' top' : ''}">
        <div class="fw-bl">${sel === 0 ? `<b>${ok(selic) ? `${num(selic + m / 100)}%` : '—'}</b><span class="${tomMov(m)}">${m === 0 ? 'Manter (Selic atual)' : nomeMov(m)}</span>` : `<b class="${tomMov(m)}">${nomeMov(m)}</b><span>${m === 0 ? 'sem mudança nesta reunião' : 'nesta reunião'}</span>`}</div>
        <div class="fw-bt"><i style="width:${Math.max(0.5, Math.min(100, p || 0)).toFixed(1)}%;background:${corMov(m)}">${(p || 0) >= 25 ? `<span>${pct(p)}</span>` : ''}</i></div>
        <div class="fw-bv">${pct(p)}</div>
        <div class="fw-bc">ontem ${pct(o?.p?.[m])} <span>·</span> 1 semana ${pct(s?.p?.[m])}${hoje}</div>
      </div>`;
    }).join('');

    // tabela: todas as reuniões x cenários (cada reunião sozinha: a decisão daquela reunião), como mapa de calor
    const cols = [...new Set(reun.flatMap((x) => { const p = ultimos(x).u.p; return Object.keys(p).filter((k) => p[k] >= 1).map(Number); }))].sort((a, b) => a - b);
    const tabela = `<table class="fw-tab"><thead><tr><th>Reunião</th>${cols.map((m) => `<th>${rotMov(m)}</th>`).join('')}<th>Contratos em aberto</th><th>Pregão</th></tr></thead><tbody>${reun.map((x, i) => {
      const ux = ultimos(x).u, p = ux.p;
      const mx = Math.max(...Object.values(p));
      const oi = Object.values(ux.oi || {}).reduce((t, v) => t + v, 0);
      return `<tr class="${i === sel ? 'sel' : ''}" data-r="${i}"><td>${dmy(x.data)}</td>${cols.map((m) => {
        const v = p[m];
        if (!ok(v) || v < 0.5) return '<td class="z">–</td>';
        return `<td class="${v === mx ? 'mx' : ''}" style="--a:${Math.min(1, v / 100).toFixed(3)}">${num(v, 1)}%</td>`;
      }).join('')}<td class="fw-pr">${int(oi)}</td><td class="fw-pr">${dm(ux.d)}</td></tr>`;
    }).join('')}</tbody></table>`;

    const bp = (v) => (ok(v) ? `${Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '−'}${num(Math.abs(v), 1)} bp` : '—');
    const oiTot = Object.values(u.oi || {}).reduce((t, v) => t + v, 0), negTot = Object.values(u.n || {}).reduce((t, v) => t + v, 0);
    const kpi = (ic, t, b, sm, cls = '') => `<div class="fw-kpi"><span class="fw-ki"><i class="fa-solid ${ic}" aria-hidden="true"></i></span><div><span>${t}</span><b class="${cls}">${b}</b><small>${sm}</small></div></div>`;
    root.innerHTML = `<div class="fw-card">
      <div class="fw-top">
        <button class="fw-nav" data-act="esq" aria-label="Reuniões anteriores"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="fw-chips" role="tablist" aria-label="Reuniões do Copom">${chips}</div>
        <button class="fw-nav" data-act="dir" aria-label="Próximas reuniões"><i class="fa-solid fa-chevron-right"></i></button>
        <div class="fw-upd"><span>Pregão de</span><b>${dmy(u.d)}</b></div>
        <button class="fw-ib" data-act="reload" title="Atualizar" aria-label="Atualizar"${busy ? ' disabled' : ''}><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
      </div>
      <div class="fw-kpis">
        ${kpi('fa-calendar-days', 'Reunião do Copom', dmy(R.data), faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`)}
        ${kpi('fa-bullseye', 'Selic atual', ok(selic) ? `${num(selic)}%` : '—', 'meta do Copom')}
        ${kpi('fa-chart-simple', 'Cenário mais provável', nomeMov(maisProv), `${pct(P[maisProv])} de chance`, tomMov(maisProv))}
        ${kpi('fa-percent', 'Decisão média esperada', bp(esperado), sel === 0 ? `Selic de ${ok(selic) && ok(esperado) ? `${num(selic + esperado / 100)}%` : '—'} depois` : 'nesta reunião')}
      </div>
      <div class="fw-blk">
        <div class="fw-sec fw-sec-b">Chance de cada decisão na reunião de ${dmy(R.data)} ${sel === 0 ? '<small>(e a Selic depois dela)</small>' : '<small>(mudança nesta reunião, além do que for decidido antes)</small>'}
          <button class="fw-tg" data-act="graf" aria-expanded="${prefs.graf ? 'true' : 'false'}"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> ${prefs.graf ? 'Esconder gráfico' : 'Mostrar gráfico'}</button></div>
        <div class="fw-ctr">
          <span class="fw-chip"><i class="fa-solid fa-file-contract"></i>Opções de Copom <b>B3</b></span>
          <span class="fw-chip"><i class="fa-solid fa-calendar-day"></i>Pregão <b>${dmy(u.d)}</b></span>
          <span class="fw-chip"><i class="fa-solid fa-layer-group"></i>Contratos em aberto <b>${int(oiTot)}</b></span>
          <span class="fw-chip"><i class="fa-solid fa-right-left"></i>Negociados no dia <b>${int(negTot)}</b></span>
          <span class="fw-chip"><i class="fa-solid fa-equals"></i>Soma das chances <b>${pct(soma)}</b></span>
        </div>
        ${pilha}
        <div class="fw-bars">${barras}</div>
        ${prefs.graf ? `<div class="fw-sec">Como a chance mudou <small>(reunião de ${dmy(R.data)}, últimos pregões)</small></div><div class="fw-hleg"></div><div class="fw-hwrap"><div class="fw-hbox"></div></div>` : ''}
      </div>
      <div class="fw-blk">
        <div class="fw-sec fw-sec-b">Todas as reuniões <small>(chance de cada decisão, reunião por reunião)</small>
          <span class="fw-esc" aria-hidden="true">Cor mais forte = chance maior <b>0%</b><i></i><b>100%</b></span></div>
        <div class="fw-tabw">${tabela}</div>
      </div>
      <div class="fw-foot">
        <div><b><i class="fa-solid fa-gear"></i> Metodologia</b><p>Cada opção de Copom paga se o Copom decidir exatamente aquele cenário, então o preço (de 0 a 100) é a chance que o mercado dá a ele; por isso a soma pode passar ou ficar abaixo de 100%. Cada reunião tem as suas opções: a chance é da decisão daquela reunião. Reuniões sem opções negociadas não aparecem.</p></div>
        <div><b><i class="fa-solid fa-database"></i> Fontes</b><p>B3, painel público de opções de Copom. Preço de referência do pregão de ${dmy(u.d)}${vivoHoje ? '; "hoje" é o último negócio do dia' : ''}.${erro ? ` <b>${esc(erro)}</b>` : ''}</p></div>
      </div>
    </div>`;
    // a reunião escolhida fica à vista na barra de datas; as setas e o degradê mostram que dá para rolar
    const fc = root.querySelector('.fw-chips');
    const bordas = () => { fc.classList.toggle('esq', fc.scrollLeft > 4); fc.classList.toggle('dir', fc.scrollLeft + fc.clientWidth < fc.scrollWidth - 4); fc.parentElement.classList.toggle('cabe', fc.scrollWidth <= fc.clientWidth + 4); };
    fc.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    fc.addEventListener('scroll', bordas, { passive: true });
    bordas();
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
      const nv = e.target.closest('[data-act="esq"],[data-act="dir"]');
      if (nv) { const fc = el.querySelector('.fw-chips'); fc.scrollBy({ left: (nv.dataset.act === 'dir' ? 1 : -1) * fc.clientWidth * 0.7, behavior: 'smooth' }); }
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  #copom-root { min-width:0; max-width:100%; font-variant-numeric:tabular-nums; }
  #copom-root .fw-card { min-width:0; max-width:100%; display:flex; flex-direction:column; gap:14px; }
  #copom-root .fw-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  #copom-root .fw-top { display:flex; align-items:center; gap:8px; min-width:0; }
  #copom-root .fw-nav { flex:none; width:32px; height:44px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:10px; cursor:pointer; font-size:12px; }
  #copom-root .fw-top.cabe .fw-nav { display:none; }
  #copom-root .fw-pilha em { font-style:normal; }
  #copom-root .fw-nav:hover { color:var(--text); border-color:var(--line-2); }
  #copom-root .fw-chips { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; min-width:0; flex:1; scroll-behavior:smooth; }
  #copom-root .fw-chips::-webkit-scrollbar { display:none; }
  #copom-root .fw-chips.dir { -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent); }
  #copom-root .fw-chips.esq { -webkit-mask-image:linear-gradient(90deg,transparent,#000 40px); mask-image:linear-gradient(90deg,transparent,#000 40px); }
  #copom-root .fw-chips.esq.dir { -webkit-mask-image:linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent); }
  #copom-root .fw-chips button { flex:none; display:flex; flex-direction:column; align-items:center; gap:1px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; padding:6px 14px; border-radius:10px; cursor:pointer; white-space:nowrap; min-width:92px; }
  #copom-root .fw-chips button b { font-size:12.5px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:6px; }
  #copom-root .fw-chips button small { font-size:11px; color:var(--text-3); }
  #copom-root .fw-chips button:hover { border-color:var(--line-2); }
  #copom-root .fw-chips button.on { background:var(--accent-soft); border-color:var(--accent); }
  #copom-root .fw-chips button.on b, #copom-root .fw-chips button.on small { color:var(--accent-ink); }
  #copom-root .fw-sep { color:var(--accent-ink); font-size:10.5px; }
  #copom-root .fw-upd { flex:none; display:flex; flex-direction:column; align-items:flex-end; line-height:1.3; margin-left:6px; }
  #copom-root .fw-upd span { font-size:10.5px; color:var(--text-3); }
  #copom-root .fw-upd b { font-size:13px; color:var(--text); font-weight:600; }
  #copom-root .fw-ib { height:40px; min-width:40px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:10px; cursor:pointer; flex:none; }
  #copom-root .fw-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
  #copom-root .fw-kpi { display:flex; gap:14px; align-items:flex-start; padding:16px 18px; border:1px solid var(--line); border-radius:14px; background:var(--surface-2); box-shadow:0 1px 3px rgba(0,0,0,.08); min-width:0; }
  #copom-root .fw-kpi > div { display:flex; flex-direction:column; gap:3px; min-width:0; }
  #copom-root .fw-ki { flex:none; width:44px; height:44px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; background:var(--accent-soft); border:1px solid var(--accent-line, var(--line)); color:var(--accent-ink); font-size:17px; }
  #copom-root .fw-kpi span { font-size:12.5px; color:var(--text-2); font-weight:500; }
  #copom-root .fw-kpi b { font-size:24px; font-weight:700; color:var(--text); letter-spacing:-.01em; line-height:1.25; }
  #copom-root .fw-kpi small { font-size:12px; color:var(--text-3); }
  #copom-root .fw-man { color:var(--accent-ink) !important; }
  #copom-root .fw-alta { color:var(--neg) !important; }
  #copom-root .fw-corte { color:var(--pos-ink) !important; }
  #copom-root .fw-blk { border:1px solid var(--line); border-radius:14px; background:var(--surface-2); padding:4px 0 10px; min-width:0; }
  #copom-root .fw-sec { padding:14px 16px 8px; font-size:15px; font-weight:700; color:var(--text); }
  #copom-root .fw-sec small { font-weight:400; color:var(--text-3); font-size:12.5px; }
  #copom-root .fw-sec-b { display:flex; align-items:center; gap:8px 12px; flex-wrap:wrap; }
  #copom-root .fw-tg { margin-left:auto; display:inline-flex; align-items:center; gap:8px; border:1px solid var(--accent-line, var(--line-2)); background:transparent; color:var(--text); font:inherit; font-size:13px; font-weight:600; padding:7px 14px; border-radius:9px; cursor:pointer; }
  #copom-root .fw-tg i { color:var(--accent-ink); }
  #copom-root .fw-tg:hover { background:var(--accent-soft); }
  #copom-root .fw-ctr { display:flex; flex-wrap:wrap; gap:8px; padding:0 16px 12px; }
  #copom-root .fw-chip { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); border-radius:9px; background:var(--surface); padding:6px 11px; font-size:12px; color:var(--text-3); white-space:nowrap; }
  #copom-root .fw-chip > i { color:var(--text-3); font-size:11px; }
  #copom-root .fw-chip b { font-size:13px; color:var(--text); font-weight:700; }
  #copom-root .fw-chip em { font-style:normal; font-weight:600; color:var(--text-3); }
  #copom-root .fw-chip em.fw-up { color:var(--pos-ink); } #copom-root .fw-chip em.fw-dn { color:var(--neg); }
  #copom-root .fw-pilha { display:flex; gap:2px; height:26px; margin:0 16px 12px; border-radius:7px; overflow:hidden; }
  #copom-root .fw-pilha i, #copom-root .fw-bt i { font-style:normal; }
  #copom-root .fw-pilha i { display:flex; align-items:center; justify-content:center; min-width:3px; overflow:hidden; }
  #copom-root .fw-pilha span { font-size:11.5px; font-weight:700; color:#111; white-space:nowrap; padding:0 6px; }
  #copom-root .fw-bars { padding:2px 16px 6px; display:flex; flex-direction:column; gap:10px; }
  #copom-root .fw-bar { display:grid; grid-template-columns:180px minmax(0,1fr) 64px 190px; align-items:center; gap:12px; }
  #copom-root .fw-bl { display:flex; flex-direction:column; gap:1px; min-width:0; }
  #copom-root .fw-bl b { font-size:15px; font-weight:700; color:var(--text); }
  #copom-root .fw-bl span { font-size:12.5px; }
  #copom-root .fw-bt { height:20px; border-radius:6px; background:var(--surface); overflow:hidden; }
  #copom-root .fw-bt i { display:flex; align-items:center; justify-content:center; height:100%; border-radius:6px; opacity:.85; }
  #copom-root .fw-bar.top .fw-bt i { opacity:1; }
  #copom-root .fw-bt i span { font-size:12px; font-weight:700; color:#111; }
  #copom-root .fw-bv { font-size:15px; font-weight:700; text-align:right; color:var(--text); }
  #copom-root .fw-bc { font-size:11.5px; color:var(--text-3); white-space:nowrap; }
  #copom-root .fw-bc span { opacity:.6; }
  #copom-root .fw-esc { margin-left:auto; display:inline-flex; align-items:center; gap:8px; font-size:11.5px; font-weight:400; color:var(--text-3); }
  #copom-root .fw-esc b { font-weight:500; color:var(--text-3); }
  #copom-root .fw-esc i { width:110px; height:10px; border-radius:3px; background:linear-gradient(90deg, color-mix(in srgb, var(--info) 6%, transparent), var(--info)); }
  #copom-root .fw-tabw { overflow-x:auto; margin:0 16px; border:1px solid var(--line); border-radius:10px; }
  #copom-root .fw-tab { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
  #copom-root .fw-tab th { text-align:right; font-weight:600; color:var(--text-2); padding:9px 10px; border-bottom:1px solid var(--line); white-space:nowrap; font-size:12px; background:var(--surface); }
  #copom-root .fw-tab td { text-align:right; padding:8px 10px; border-bottom:1px solid var(--line); color:var(--text-2); white-space:nowrap;
    background:color-mix(in srgb, var(--info) calc(var(--a, 0) * 78%), transparent); }
  #copom-root .fw-tab tr:last-child td { border-bottom:0; }
  #copom-root .fw-tab th:first-child, #copom-root .fw-tab td:first-child { text-align:left; position:sticky; left:0; z-index:1; background:var(--surface); border-right:1px solid var(--line); }
  #copom-root .fw-tab td:first-child .fw-sep { margin-left:6px; }
  #copom-root .fw-tab td.z { color:var(--text-3); opacity:.25; background:none; }
  #copom-root .fw-tab td.mx { color:var(--text); font-weight:700; }
  #copom-root .fw-tab td[style] { color:var(--text); }
  #copom-root .fw-tab th.fw-ct, #copom-root .fw-tab td.fw-ct { text-align:left; padding-left:18px; }
  #copom-root .fw-tab td.fw-ct, #copom-root .fw-tab td.fw-pr { background:none; color:var(--text-2); }
  #copom-root .fw-tab td.fw-tx { color:var(--text); font-weight:700; background:none; }
  #copom-root .fw-tab tr { cursor:pointer; }
  #copom-root .fw-tab tr:hover td:first-child { color:var(--text); }
  #copom-root .fw-tab tr.sel td:first-child { color:var(--accent-ink); font-weight:700; box-shadow:inset 3px 0 0 var(--accent); }
  #copom-root .fw-foot { display:grid; grid-template-columns:1fr 1fr; gap:14px 28px; padding:14px 18px; border:1px solid var(--line); border-radius:14px; background:var(--surface-2); }
  #copom-root .fw-foot b { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text); }
  #copom-root .fw-foot b i { color:var(--accent-ink); }
  #copom-root .fw-foot p { margin:6px 0 0; font-size:12px; line-height:1.55; color:var(--text-3); }
  #copom-root .fw-foot p b { display:inline; color:var(--neg); }
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
  @container (max-width: 900px) {
    #copom-root .fw-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    #copom-root .fw-bar { grid-template-columns:minmax(0,1fr) 60px; grid-template-areas:"l v" "t t" "c c"; gap:4px 10px; }
    #copom-root .fw-bl { grid-area:l; } #copom-root .fw-bv { grid-area:v; } #copom-root .fw-bt { grid-area:t; } #copom-root .fw-bc { grid-area:c; }
    #copom-root .fw-upd, #copom-root .fw-nav { display:none; }
    #copom-root .fw-foot { grid-template-columns:1fr; }
    #copom-root .fw-esc { margin-left:0; }
  }
  @container (max-width: 560px) {
    #copom-root .fw-kpis { gap:8px; }
    #copom-root .fw-kpi { padding:12px; }
    #copom-root .fw-ki { display:none; }
    #copom-root .fw-kpi span { font-size:11.5px; }
    #copom-root .fw-kpi b { font-size:18px; }
    #copom-root .fw-kpi small { font-size:11px; }
    #copom-root .fw-ctr { gap:6px; }
    #copom-root .fw-chip { padding:5px 9px; font-size:11.5px; }
    #copom-root .fw-chip > i { display:none; }
    #copom-root .fw-pilha em { display:none; }
    #copom-root .fw-tg { margin-left:0; }
  }`;
  document.head.appendChild(css);

  window.__copomRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    draw();
    load(false);
  };
})();
