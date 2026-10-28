/* Aba "Análise avançada" das Análises, no layout do modelo do Severino (28/10/2026).
   O app.js desenha humor, amplitude, tabela de desempenho e comparador. Aqui ficam os cartões
   que vêm dos arquivos que os robôs publicam no GitHub: estrangeiro na B3, próxima decisão de juros,
   gráfico do fluxo estrangeiro e o resumo do posicionamento (CFTC e 13F). Sem dado, mostra "—". */
(() => {
  const wrap = document.querySelector('#analysis-panel .ana-wrap');
  if (!wrap || !document.getElementById('ana-body')) return;
  const RAW = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 1) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sinal = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const diaMes = (iso) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]}`;
  const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const ir = (k) => window.__anaSecao?.(k);

  async function json(caminho) {
    for (const u of [RAW + caminho, '../../' + caminho]) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(u, { signal: ctl.signal }).finally(() => clearTimeout(t));
        if (r.ok) return await r.json();
      } catch (e) { /* próxima */ }
    }
    return null;
  }

  let dados = null, buscando = false, largFx = 0;
  async function carrega() {
    if (dados || buscando) return;
    buscando = true;
    const [fluxo, fed, copom, cot, f13] = await Promise.all(['fluxo/fluxo.json', 'fed/fed.json', 'copom/copom.json', 'posicoes/cot.json', 'posicoes/13f.json'].map(json));
    dados = { fluxo, fed, copom, cot, f13 };
    buscando = false;
    desenha();
  }

  /* ---------- estrangeiro na B3 (mês) ---------- */
  function estrangeiro() {
    const el = document.getElementById('aa-estr'), f = dados.fluxo;
    const ks = Object.keys(f?.meses || {}).sort(), k = ks[ks.length - 1];
    const m = k && f.meses[k], e = m?.tipos?.estrangeiro;
    const topo = '<div class="aa-k-top"><span class="aa-k-lbl">Estrangeiro na B3</span></div>';
    if (!e) { el.innerHTML = `${topo}<div class="aa-k-row"><b class="aa-k-big">—</b></div>`; return; }
    const v = e.saldo / 1e6;
    const ano = ks.filter((x) => x.slice(0, 4) === k.slice(0, 4)).reduce((a, x) => a + (f.meses[x].tipos?.estrangeiro?.saldo || 0), 0) / 1e6;
    el.innerHTML = `${topo}
      <div class="aa-k-row"><b class="aa-k-big ${v >= 0 ? 'ana-up' : 'ana-dn'}">${v >= 0 ? '+' : '−'}R$ ${nf(Math.abs(v), 2)} bi</b></div>
      <div class="aa-k-sub">No mês · até ${ddmm(m.ate)}</div>
      <div class="aa-k-mini">No ano: <b class="${ano >= 0 ? 'ana-up' : 'ana-dn'}">${ano >= 0 ? '+' : '−'}R$ ${nf(Math.abs(ano), 1)} bi</b></div>`;
    el.classList.add('aa-clica');
    el.title = 'Ver o fluxo na B3';
    el.onclick = () => ir('fluxo');
  }

  /* ---------- próxima decisão de juros (Fed ou Copom, a que vem primeiro) ---------- */
  function decisao() {
    const el = document.getElementById('aa-decisao'), hoje = hojeISO();
    const prox = [];
    const fr = (dados.fed?.reunioes || []).find((r) => r.data >= hoje);
    if (fr) {
      const a = dados.fed.alvo;
      prox.push({ k: 'fed', nome: 'Fed', data: fr.data, txt: a ? `Faixa atual ${nf(a.min, 2)}–${nf(a.max, 2)}%` : '' });
    }
    const cr = (dados.copom?.reunioes || []).find((r) => r.data >= hoje);
    if (cr) prox.push({ k: 'copom', nome: 'Copom', data: cr.data, txt: Number.isFinite(dados.copom.selic) ? `Selic atual ${nf(dados.copom.selic, 2)}%` : '' });
    prox.sort((a, b) => a.data.localeCompare(b.data));
    const topo = '<div class="aa-k-top"><span class="aa-k-lbl">Próxima decisão</span></div>';
    if (!prox.length) { el.innerHTML = `${topo}<div class="aa-k-row"><b class="aa-k-big">—</b></div>`; el.onclick = null; return; }
    const p = prox[0], d = prox[1];
    el.innerHTML = `${topo}
      <div class="aa-k-row"><b class="aa-k-big">${p.nome} · ${diaMes(p.data)}</b>${p.data === hoje ? '<span class="aa-hoje">hoje</span>' : ''}</div>
      <div class="aa-k-sub">${esc(p.txt)}</div>
      ${d ? `<div class="aa-k-mini">Depois: ${d.nome} · ${diaMes(d.data)}</div>` : ''}`;
    el.title = `Ver as probabilidades do ${p.nome}`;
    el.onclick = () => ir(p.k);
  }

  /* ---------- gráfico do fluxo estrangeiro: barras diárias e linha acumulada ---------- */
  function fluxo() {
    const el = document.getElementById('aa-fluxo');
    const dias = (dados.fluxo?.dias || []).filter((d) => Number.isFinite(d.tipos?.estrangeiro?.saldo)).slice(-21);
    const topo = (sub) => `<div class="aa-card-head"><div><h3>Fluxo estrangeiro na B3</h3><p class="aa-sub">${sub}</p></div>
      <div class="aa-leg"><span><i class="q"></i>Diário</span><span><i class="l"></i>Acumulado</span><button type="button" class="aa-link" data-ir="fluxo">Ver análise <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></div>`;
    if (dias.length < 2) { el.innerHTML = topo('B3') + '<div class="ana-loading">Fluxo indisponível no momento.</div>'; return; }
    const v = dias.map((d) => d.tipos.estrangeiro.saldo / 1e6);
    let s = 0;
    const ac = v.map((x) => (s += x));
    el.innerHTML = topo(`B3 · até ${ddmm(dias[dias.length - 1].data)} · diário, em R$ bilhões`) + '<div class="aa-fx-chart"></div><div class="ana-tip" hidden></div>';
    const box = el.querySelector('.aa-fx-chart'), tip = el.querySelector('.ana-tip');
    const W = Math.max(280, Math.round(box.clientWidth || el.clientWidth - 36 || 600)), H = W < 520 ? 190 : 200, padL = 34, padR = 40, padT = 10, padB = 24;
    const escala = (lo, hi) => {
      lo = Math.min(lo, 0); hi = Math.max(hi, 0);
      const st = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((x) => (hi - lo) / x <= 5) || 200;
      const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
      const t = []; for (let x = a; x <= b + 1e-9; x += st) t.push(+x.toFixed(2));
      return { a, b, t };
    };
    const eb = escala(Math.min(...v), Math.max(...v)), el2 = escala(Math.min(...ac), Math.max(...ac));
    const n = v.length, bw = (W - padL - padR) / n;
    const X = (i) => padL + bw * (i + 0.5);
    const Yb = (x) => padT + (1 - (x - eb.a) / (eb.b - eb.a)) * (H - padT - padB);
    const Yl = (x) => padT + (1 - (x - el2.a) / (el2.b - el2.a)) * (H - padT - padB);
    const passo = Math.max(1, Math.ceil(n / 6));
    largFx = W;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo diário e acumulado do investidor estrangeiro na B3">
      ${eb.t.map((x) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Yb(x).toFixed(1)}" y2="${Yb(x).toFixed(1)}"/><text class="axis" x="${padL - 6}" y="${(Yb(x) + 4).toFixed(1)}" text-anchor="end">${nf(x, Math.abs(x) % 1 ? 1 : 0)}</text>`).join('')}
      ${el2.t.map((x) => `<text class="axis" x="${W - padR + 6}" y="${(Yl(x) + 4).toFixed(1)}">${nf(x, Math.abs(x) % 1 ? 1 : 0)}</text>`).join('')}
      ${v.map((x, i) => `<rect x="${(X(i) - bw * 0.3).toFixed(1)}" y="${Math.min(Yb(x), Yb(0)).toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${Math.max(1, Math.abs(Yb(x) - Yb(0))).toFixed(1)}" rx="1.5" fill="var(${x >= 0 ? '--pos' : '--neg'})" opacity=".85"/>`).join('')}
      <polyline points="${ac.map((x, i) => `${X(i).toFixed(1)},${Yl(x).toFixed(1)}`).join(' ')}" fill="none" stroke="#4f8df7" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(n - 1).toFixed(1)}" cy="${Yl(ac[n - 1]).toFixed(1)}" r="3.5" fill="#4f8df7"/>
      ${dias.map((d, i) => ((n - 1 - i) % passo ? '' : `<text class="axis" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${diaMes(d.data)}</text>`)).join('')}
      <line class="cursor" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/>
      <rect class="hit" x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="transparent"/>
    </svg>`;
    const svg = box.querySelector('svg'), cur = svg.querySelector('.cursor');
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.floor((x - padL) / bw)));
      cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('visibility', 'visible');
      const d = dias[i].data;
      tip.innerHTML = `<span class="d">${ddmm(d)}/${d.slice(0, 4)}</span><div><span>Diário</span><b class="${v[i] >= 0 ? 'ana-up' : 'ana-dn'}">${sinal(v[i])} bi</b></div><div><span>Acumulado</span><b>${sinal(ac[i])} bi</b></div>`;
      tip.hidden = false;
      const px = X(i) * r.width / W + (r.left - el.getBoundingClientRect().left), tw = tip.offsetWidth, lim = el.clientWidth - tw - 8;
      tip.style.left = `${Math.max(8, Math.min(lim, px + 12 > lim ? px - tw - 12 : px + 12))}px`;
      tip.style.top = `${box.offsetTop + 8}px`;
    };
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); });
  }

  /* ---------- posicionamento: atalhos para Especuladores e Grandes fundos ---------- */
  function posicao() {
    const el = document.getElementById('aa-pos');
    const linhaCot = (k) => {
      const m = (dados.cot?.mercados || []).find((x) => x.k === k);
      const u = (m?.semanas || []).filter((s) => Number.isFinite(s.el) && Number.isFinite(s.es)).pop();
      if (!u) return { txt: 'Posições líquidas dos especuladores', d: '' };
      const net = u.el - u.es;
      return { txt: `Especuladores ${net >= 0 ? 'comprados' : 'vendidos'} em ${nf(Math.abs(net) / 1000, 1)} mil contratos`, d: ddmm(u.d) };
    };
    const f = dados.f13?.fundos || [];
    const per = f.map((x) => x.periodo).filter(Boolean).sort().pop();
    const linhas = [
      { ico: 'fa-brazilian-real-sign', nome: 'Real brasileiro (CFTC)', ...linhaCot('brl'), freq: 'Semanal', ir: 'cot' },
      { ico: 'fa-chart-simple', nome: 'S&P 500 (CFTC)', ...linhaCot('spx'), freq: 'Semanal', ir: 'cot' },
      { ico: 'fa-users', nome: 'Grandes fundos (13F)', txt: f.length ? `${f.length} gestores, exposição por setor e por ação` : 'Exposição setorial e por ativos', d: per ? ddmm(per) + '/' + per.slice(2, 4) : '', freq: 'Trimestral', ir: 'f13' }
    ];
    el.innerHTML = `<div class="aa-card-head"><h3>Posicionamento dos investidores</h3></div>
      <div class="aa-pos-list">${linhas.map((l) => `<button type="button" class="aa-pos-row" data-ir="${l.ir}">
        <span class="aa-pos-ico"><i class="fa-solid ${l.ico}" aria-hidden="true"></i></span>
        <span class="aa-pos-txt"><b>${esc(l.nome)}</b><small>${esc(l.txt)}</small></span>
        <span class="aa-pos-freq">${l.freq}${l.d ? `<small>${l.d}</small>` : ''}</span>
        <span class="aa-link">Abrir <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></button>`).join('')}</div>`;
  }

  function desenha() {
    if (!dados) return;
    estrangeiro(); decisao(); fluxo(); posicao();
  }
  wrap.addEventListener('click', (e) => { const b = e.target.closest('#ana-body [data-ir]'); if (b) ir(b.dataset.ir); });

  const visivel = () => document.getElementById('analysis-panel')?.classList.contains('active') && wrap.dataset.secao === 'mercado';
  const confere = () => { if (visivel()) { if (dados) fluxo(); else carrega(); } };
  new MutationObserver(confere).observe(wrap, { attributes: true, attributeFilter: ['data-secao'] });
  new MutationObserver(confere).observe(document.getElementById('analysis-panel'), { attributes: true, attributeFilter: ['class'] });
  // o gráfico é desenhado na largura real: redesenha quando o cartão muda de tamanho
  if (window.ResizeObserver) new ResizeObserver(() => { const b = document.querySelector('#aa-fluxo .aa-fx-chart'); if (dados && b && b.clientWidth && Math.abs(b.clientWidth - largFx) > 4) fluxo(); }).observe(document.getElementById('aa-fluxo'));
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (dados && visivel()) fluxo(); }, 200); });
  confere();

  const css = document.createElement('style');
  css.textContent = `
  #ana-body { gap:16px; }
  .aa-head { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .aa-head h2 { margin:0; font-size:24px; font-weight:700; letter-spacing:-.01em; color:var(--text); }
  .aa-head p { margin:4px 0 0; color:var(--text-2); font-size:14px; }
  .aa-status { font-size:11.5px; color:var(--text-3); border:1px solid var(--line); border-radius:8px; padding:6px 10px; display:flex; align-items:center; gap:6px; }
  #ana-body .ana-card { border-radius:14px; padding:16px 18px; }
  .aa-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; }
  .aa-kpi { display:flex; flex-direction:column; gap:4px; min-height:118px; }
  .aa-clica { cursor:pointer; transition:border-color .15s; }
  .aa-clica:hover { border-color:var(--accent-line, var(--line-2)); }
  .aa-k-top { display:flex; justify-content:space-between; align-items:baseline; }
  .aa-k-lbl { font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--text-2); font-weight:600; }
  .aa-k-nota { font-size:12px; color:var(--text-3); }
  .aa-k-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
  .aa-k-big { font-size:24px; font-weight:700; color:var(--text); letter-spacing:-.01em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .aa-k-big.ana-up { color:var(--pos-ink); } .aa-k-big.ana-dn { color:var(--neg); }
  .aa-k-score { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }
  .aa-k-sub { font-size:13px; color:var(--text-2); }
  .aa-k-mini { font-size:12px; color:var(--text-3); margin-top:auto; }
  .aa-hoje { font-size:11px; font-weight:600; color:var(--accent-ink); background:var(--accent-soft); border-radius:99px; padding:2px 8px; align-self:center; }
  .aa-mood-bar { position:relative; height:6px; border-radius:99px; margin:10px 0 2px; background:linear-gradient(90deg, var(--neg), color-mix(in srgb, var(--neg) 60%, #8a94a6) 30%, #8a94a6 50%, color-mix(in srgb, var(--pos) 60%, #8a94a6) 70%, var(--pos)); }
  .aa-mood-bar span { position:absolute; top:50%; width:14px; height:14px; border-radius:50%; background:var(--surface); border:3px solid var(--aa-mood, #8a94a6); transform:translate(-50%,-50%); box-shadow:0 1px 4px rgba(0,0,0,.35); }
  .aa-mood-scale { display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-3); margin-top:4px; font-variant-numeric:tabular-nums; }
  .aa-br-bar { display:flex; gap:2px; height:8px; border-radius:99px; overflow:hidden; background:var(--surface-3); margin-top:8px; }
  .aa-br-bar i { display:block; height:100%; }
  .aa-row { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:14px; align-items:stretch; }
  .aa-card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .aa-card-head h3 { margin:0; font-size:18px; font-weight:700; color:var(--text); letter-spacing:-.01em; }
  .aa-sub { margin:2px 0 0; font-size:12.5px; color:var(--text-3); }
  .aa-tools { display:flex; gap:8px; flex-wrap:wrap; }
  .aa-busca { display:flex; align-items:center; gap:8px; border:1px solid var(--line); border-radius:9px; padding:0 10px; background:var(--surface-2); color:var(--text-3); font-size:13px; }
  .aa-busca input, .aa-busca input[type=search] { border:0 !important; background:none !important; box-shadow:none !important; outline:0; color:var(--text); font:inherit; font-size:13px; padding:8px 0 !important; width:170px; min-width:0; }
  .aa-busca:focus-within { border-color:var(--accent-line, var(--line-2)); }
  .aa-mais { display:flex; align-items:center; gap:8px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--text); font:inherit; font-size:13px; padding:8px 12px; cursor:pointer; }
  .aa-mais i { font-size:10px; transition:transform .2s; }
  .aa-mais[aria-pressed="true"] { border-color:var(--accent-line, var(--line-2)); color:var(--accent-ink); }
  .aa-mais[aria-pressed="true"] i { transform:rotate(180deg); }
  .aa-pills, .aa-seg { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  .aa-pills button { border:1px solid var(--line); border-radius:99px; background:none; color:var(--text-2); font:inherit; font-size:13px; padding:6px 16px; cursor:pointer; transition:background .15s, color .15s; }
  .aa-pills button:hover { color:var(--text); background:var(--surface-2); }
  .aa-pills button.on, .aa-seg button.on { background:color-mix(in srgb, var(--accent) 72%, #000); border-color:transparent; color:#fff; font-weight:600; }
  body:not(.light) .aa-pills button.on, body:not(.light) .aa-seg button.on { background:var(--accent); color:#17120a; }
  .aa-seg { gap:0; margin:0; border:1px solid var(--line); border-radius:9px; overflow:hidden; flex-wrap:nowrap; }
  .aa-seg button { border:0; border-left:1px solid var(--line); background:none; color:var(--text-2); font:inherit; font-size:13px; padding:7px 14px; cursor:pointer; }
  .aa-seg button:first-child { border-left:0; }
  .aa-perf .ana-table-wrap { max-height:452px; overflow:auto; overscroll-behavior:contain; }
  .aa-tab th { z-index:2; }
  .aa-tab { min-width:560px; font-size:13px; }
  .aa-tab.mais { min-width:940px; }
  .aa-tab th { background:var(--surface-2); text-transform:none; letter-spacing:0; font-size:12.5px; font-weight:500; color:var(--text-2); padding:9px 8px; }
  .aa-tab td { padding:6px 8px; font-family:inherit; font-variant-numeric:tabular-nums; }
  .aa-tab th.c, .aa-tab td.c { width:34px; text-align:center; padding-left:10px; padding-right:2px; }
  .aa-tab input[type=checkbox] { width:16px; height:16px; margin:0; accent-color:var(--accent); cursor:pointer; vertical-align:middle; }
  .aa-tab tbody tr.on td { background:color-mix(in srgb, var(--accent) 7%, transparent); }
  .aa-ativo { display:flex; align-items:center; gap:10px; }
  .aa-ativo b { display:block; font-weight:600; font-size:13.5px; color:var(--text); }
  .aa-ativo small { display:block; color:var(--text-3); font-size:11px; }
  .aa-flag { width:24px; height:16px; flex:0 0 24px; border-radius:3px; box-shadow:0 0 0 1px rgba(0,0,0,.12); }
  .aa-ico { width:22px; height:22px; flex:0 0 22px; margin:0 1px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; background:var(--surface-3); }
  .aa-trend { display:inline-flex; align-items:center; gap:10px; }
  .aa-trend .ana-spark { width:64px; height:22px; }
  .aa-t { font-size:12.5px; color:var(--text-2); min-width:44px; }
  .aa-t.up { color:var(--pos-ink); } .aa-t.dn { color:var(--neg); }
  .aa-perf-foot { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:13px; color:var(--text-2); }
  .aa-cmp-btn { display:inline-flex; align-items:center; gap:8px; border:0; border-radius:9px; background:var(--accent); color:#17120a; font:inherit; font-size:13.5px; font-weight:600; padding:8px 16px; cursor:pointer; }
  .aa-cmp-btn:disabled { opacity:.45; cursor:default; }
  .aa-note { margin-left:auto; font-size:12px; color:var(--text-3); }
  .aa-cmp-top { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
  .aa-chips { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .aa-chip { display:inline-flex; align-items:center; gap:8px; border:1px solid var(--line); border-radius:99px; padding:4px 6px 4px 12px; font-size:13px; color:var(--text); }
  .aa-chip > i { width:10px; height:10px; border-radius:50%; }
  .aa-chip button { border:0; background:none; color:var(--text-3); cursor:pointer; padding:2px 6px; font-size:12px; }
  .aa-chip button:hover { color:var(--text); }
  .aa-add { border:1px dashed var(--line-2, var(--line)); border-radius:99px; background:none; color:var(--text-2); font:inherit; font-size:13px; padding:5px 10px; cursor:pointer; max-width:150px; }
  .aa-cmp .aa-sub { margin:12px 0 4px; }
  .aa-cmp .ana-chart .grid.v { stroke-dasharray:2 4; opacity:.7; }
  .ana-chart .endtag { fill:#fff; font-size:11.5px; font-weight:700; font-family:inherit; }
  .aa-ret { width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
  .aa-ret th { text-align:left; font-weight:500; color:var(--text-2); background:var(--surface-2); padding:8px 10px; font-size:12.5px; }
  .aa-ret th + th, .aa-ret td + td { text-align:right; }
  .aa-ret td { padding:8px 10px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; color:var(--text); }
  .aa-ret tr:last-child td { border-bottom:0; }
  .aa-ret td i { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px; }
  .aa-ret small { color:var(--text-3); }
  .aa-pisca { animation:aaPisca 1s ease; }
  @keyframes aaPisca { 0%,100% { box-shadow:none; } 30% { box-shadow:0 0 0 3px var(--accent-soft), 0 0 0 1px var(--accent); } }
  .aa-fluxo { position:relative; }
  .aa-fx-chart svg { display:block; width:100%; height:auto; overflow:visible; }
  .aa-fx-chart .grid { stroke:var(--line); stroke-width:1; }
  .aa-fx-chart .axis { fill:var(--text-3); font-size:11px; font-family:'JetBrains Mono', monospace; }
  .aa-fx-chart .cursor { stroke:var(--text-2); stroke-width:1; }
  .aa-leg { display:flex; align-items:center; gap:14px; font-size:12.5px; color:var(--text-2); flex-wrap:wrap; }
  .aa-leg span { display:inline-flex; align-items:center; gap:6px; }
  .aa-leg i.q { width:10px; height:10px; border-radius:2px; background:var(--pos); }
  .aa-leg i.l { width:16px; height:2px; background:#4f8df7; border-radius:2px; }
  .aa-link { display:inline-flex; align-items:center; gap:6px; border:0; background:none; color:#4f8df7; font:inherit; font-size:13px; cursor:pointer; padding:0; }
  body.light .aa-link { color:#2563eb; }
  .aa-link i { font-size:11px; }
  .aa-pos-list { display:flex; flex-direction:column; }
  .aa-pos-row { display:grid; grid-template-columns:36px minmax(0,1fr) auto auto; align-items:center; gap:12px; width:100%; text-align:left; border:0; border-bottom:1px solid var(--line); background:none; color:inherit; font:inherit; padding:11px 4px; cursor:pointer; }
  .aa-pos-row:last-child { border-bottom:0; }
  .aa-pos-row:hover { background:var(--surface-2); }
  .aa-pos-ico { width:34px; height:34px; border-radius:50%; background:var(--surface-3); display:inline-flex; align-items:center; justify-content:center; color:var(--text-2); font-size:14px; }
  .aa-pos-txt b { display:block; font-size:13.5px; font-weight:600; color:var(--text); }
  .aa-pos-txt small { display:block; font-size:12px; color:var(--text-3); margin-top:2px; }
  .aa-pos-freq { font-size:12.5px; color:var(--text-2); text-align:right; min-width:76px; }
  .aa-pos-freq small { display:block; font-size:11px; color:var(--text-3); }
  @media (max-width: 1180px) { .aa-row { grid-template-columns:minmax(0,1fr); } }
  @media (max-width: 1000px) { .aa-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); } }
  @media (max-width: 560px) {
    .aa-kpis { grid-template-columns:minmax(0,1fr); }
    .aa-kpi { min-height:0; }
    .aa-busca input, .aa-busca input[type=search] { width:120px; }
    .aa-note { margin-left:0; }
    .aa-pos-row { grid-template-columns:34px minmax(0,1fr) auto; }
    .aa-pos-row .aa-pos-freq { display:none; }
  }`;
  document.head.appendChild(css);
})();
