/* =========================================================
   PROBABILIDADES DO FED (aba Análises, no estilo do FedWatch da CME)
   Chance de cada decisão do Fed nas próximas reuniões, tirada do preço dos
   futuros de Fed Funds de 30 dias (CBOT, código ZQ), um contrato por mês.
   Base: fed/fed.json, gravado pelo robô do GitHub (fed.yml): calendário do FOMC
   (site do Federal Reserve), faixa da taxa e Fed Funds efetiva (FRED) e os
   fechamentos dos contratos. O preço ao vivo vem do proxy de cotações.
   Conta (a mesma ideia da CME): a taxa média do mês é 100 menos o preço do contrato;
   com a taxa do começo do mês e o dia da reunião, sai a taxa esperada depois da
   reunião; a mudança esperada vira chance entre os dois degraus de 0,25 ponto
   mais próximos, e as reuniões seguintes se somam numa árvore.
   Pode diferir um pouco da CME (ela usa a média da Fed Funds e seus próprios preços).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__fedRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fed/fed.json'];
  const CACHE_KEY = 'fed_cache_v1';
  const PREF_KEY = 'fed_prefs_v1';
  const TTL = 30 * 60 * 1000;
  const VIVO_TTL = 5 * 60 * 1000;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const num = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pct = (v) => (ok(v) ? `${num(v, 1)}%` : '—');
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const curta = (iso) => `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`;
  const mes = (iso) => iso.slice(0, 7);
  const somaMes = (m, k) => {
    let [y, mm] = m.split('-').map(Number);
    mm += k;
    while (mm > 12) { mm -= 12; y++; }
    while (mm < 1) { mm += 12; y--; }
    return `${y}-${String(mm).padStart(2, '0')}`;
  };
  // data de hoje em Nova York (a reunião vale até o fim do dia dela)
  const hojeNY = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
  const diasAte = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(hojeNY() + 'T12:00:00Z')) / 86400000);

  let prefs = { sel: 0 };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let base = null;
  try { base = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { base = null; }
  let vivo = null, vivoTs = 0, root = null, busy = false, erro = '';

  async function getJSON(url, ms = 15000) {
    const r = await fetchT(url, {}, ms);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`HTTP ${r.status}`);
    return j;
  }
  async function load(force = false) {
    busy = true; erro = ''; draw();
    try {
      if (force || !base || Date.now() - (base.ts || 0) > TTL) {
        let j = null;
        for (const u of URLS) { try { j = await getJSON(u); if (j && j.contratos) break; } catch (e) { j = null; } }
        if (j && j.contratos) {
          base = { ...j, ts: Date.now() };
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(base)); } catch (e) { /* cheio */ }
        }
      }
      if (!base) throw new Error('sem dados');
      if (force || !vivo || Date.now() - vivoTs > VIVO_TTL) await precoVivo();
    } catch (e) {
      erro = 'Não foi possível buscar os dados do Fed agora.';
    } finally { busy = false; draw(); }
  }
  // preço ao vivo dos contratos pelo proxy de cotações (o mesmo das outras abas)
  async function precoVivo() {
    try {
      const syms = Object.values(base.contratos).map((c) => c.s);
      const j = await getJSON(`${CORS_PROXY}/quotes?symbols=${encodeURIComponent(syms.join(','))}`, 15000);
      const out = {};
      for (const [m, c] of Object.entries(base.contratos)) {
        const meta = j?.[c.s]?.chart?.result?.[0]?.meta;
        if (meta && ok(meta.regularMarketPrice)) out[m] = { p: meta.regularMarketPrice, pa: ok(meta.chartPreviousClose) ? meta.chartPreviousClose : null, t: meta.regularMarketTime };
      }
      if (Object.keys(out).length) { vivo = out; vivoTs = Date.now(); }
    } catch (e) { /* fica com o preço do robô */ }
  }

  // preços de cada mês: agora, ontem e 1 semana atrás
  function precos() {
    const agora = {}, ontem = {}, semana = {};
    const ref = new Date(Date.parse(hojeNY() + 'T12:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
    let hora = null;
    for (const [m, c] of Object.entries(base.contratos || {})) {
      const f = c.fech || [];
      const v = vivo?.[m];
      agora[m] = v ? v.p : c.p;
      if (v?.t) hora = Math.max(hora || 0, v.t); else if (c.t) hora = Math.max(hora || 0, c.t);
      const ult = f.length ? f[f.length - 1][0] : null;
      const antes = f.filter((x) => x[0] < (ult || '9999'));
      ontem[m] = v && ok(v.pa) ? v.pa : (antes.length ? antes[antes.length - 1][1] : null);
      const s = f.filter((x) => x[0] <= ref);
      semana[m] = s.length ? s[s.length - 1][1] : null;
    }
    return { agora, ontem, semana, hora };
  }

  // a conta: taxa esperada depois de cada reunião e a árvore de probabilidades
  function calcula(reun, todas, px, effr, ref = hojeNY()) {
    const comReuniao = new Set(todas.map((r) => mes(r.data)));
    const r = (m) => (ok(px[m]) ? 100 - px[m] : null);
    const atual = mes(ref);
    let antFim = effr, dist = new Map([[0, 1]]);
    const out = [];
    for (let i = 0; i < reun.length; i++) {
      const re = reun[i], M = mes(re.data), ant = somaMes(M, -1), prox = somaMes(M, 1);
      // começo do mês: o mês anterior sem reunião já dá a taxa; senão vale o fim da reunião anterior (ou a efetiva de hoje)
      let ini = antFim;
      if (!comReuniao.has(ant) && r(ant) != null && ant >= atual) ini = r(ant);
      let fim, usado = M;
      if (!comReuniao.has(prox) && r(prox) != null) { fim = r(prox); usado = prox; }
      else {
        if (r(M) == null) break;
        const [y, mm, dd] = re.data.split('-').map(Number);
        const N = new Date(Date.UTC(y, mm, 0)).getUTCDate();
        if (N - dd < 1) break;
        fim = (r(M) - (dd / N) * ini) / ((N - dd) / N);
      }
      if (!ok(fim)) break;
      const passos = (fim - ini) / 0.25, f = Math.floor(passos), fr = passos - f;
      const nd = new Map();
      for (const [s, p] of dist) {
        nd.set(s + f, (nd.get(s + f) || 0) + p * (1 - fr));
        nd.set(s + f + 1, (nd.get(s + f + 1) || 0) + p * fr);
      }
      dist = nd; antFim = fim;
      const d = {};
      for (const [s, p] of dist) if (p > 0.0004) d[s] = p * 100;
      out.push({ data: re.data, sep: re.sep, fim, dist: d, usado });
    }
    return out;
  }

  const faixa = (s) => {
    const a = base.alvo;
    return `${num(a.min + s * 0.25)}–${num(a.max + s * 0.25)}%`;
  };
  const tick = (m) => (base.contratos?.[m]?.s || '').replace('.CBT', '');
  const nomeMes = (m) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
  const varia = (a, b) => (ok(a) && ok(b) ? `${a - b >= 0 ? '+' : '−'}${num(Math.abs(a - b), 3)}` : '—');
  const corDe = (k) => {
    const s = Math.round((+k - base.alvo.min) / 0.25);
    return { 0: '#60a5fa', 1: '#f87171', 2: '#fb923c', 3: '#facc15', 4: '#e879f9', '-1': '#34d399', '-2': '#2dd4bf', '-3': '#a3e635', '-4': '#22d3ee' }[s] || '#94a3b8';
  };
  const faixaAbs = (k) => `${num(+k)}–${num(+k + 0.25)}%`;
  const at = (arr, d) => { let v = null; for (const x of arr || []) { if (x[0] <= d) v = x[1]; else break; } return v; };

  // chance de cada faixa da reunião escolhida em cada um dos últimos pregões (e agora)
  function historico(selData, todas, R) {
    const hoje = hojeNY();
    // começa depois da última reunião que já passou (antes dela a faixa era outra)
    const ultima = todas.map((r) => r.data).filter((d) => d < hoje).sort().pop() || '';
    const datas = [...new Set(Object.values(base.contratos || {}).flatMap((c) => (c.fech || []).map((x) => x[0])))].sort()
      .filter((d) => d < hoje && d < selData && d > ultima).slice(-30);
    const pts = [];
    for (const d of datas) {
      const px = {};
      for (const [m, c] of Object.entries(base.contratos)) { const v = at(c.fech, d); if (ok(v)) px[m] = v; }
      const effr = at(base.effr_hist, d) ?? base.effr.v;
      const lo = at(base.alvo_min_hist, d) ?? base.alvo.min;
      // a decisão do próprio dia d já sai antes do fechamento
      const res = calcula(todas.filter((r) => r.data > d), todas, px, effr, d).find((x) => x.data === selData);
      if (!res) continue;
      const abs = {};
      for (const [st, p] of Object.entries(res.dist)) abs[(lo + st * 0.25).toFixed(2)] = p;
      pts.push({ d, abs });
    }
    const abs = {};
    for (const [st, p] of Object.entries(R.dist)) abs[(base.alvo.min + st * 0.25).toFixed(2)] = p;
    pts.push({ d: 'agora', abs });
    return pts;
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
      ? `<text x="${xs(i)}" y="${H - 6}" text-anchor="${i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${p.d === 'agora' ? 'agora' : dm(p.d)}</text>` : '').join('');
    const linhas = chaves.map((k) => `<polyline fill="none" stroke="${corDe(k)}" stroke-width="2" stroke-linejoin="round" points="${hist.map((p, i) => `${xs(i).toFixed(1)},${ys(p.abs[k] || 0).toFixed(1)}`).join(' ')}"/>`).join('');
    box.innerHTML = `<svg class="fw-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico das probabilidades">${grade}${rot}${linhas}<line class="fw-cx" x1="0" x2="0" y1="${T}" y2="${T + ph}" style="display:none"/></svg><div class="fw-tip" hidden></div>`;
    root.querySelector('.fw-hleg').innerHTML = chaves.map((k) => `<span><i style="background:${corDe(k)}"></i>${faixaAbs(k)}</span>`).join('');
    const svg = box.querySelector('svg'), tip = box.querySelector('.fw-tip'), cx = box.querySelector('.fw-cx');
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect(), x = e.clientX - r.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - L) / pw) * (n - 1))));
      const p = hist[i];
      cx.setAttribute('x1', xs(i)); cx.setAttribute('x2', xs(i)); cx.style.display = '';
      tip.innerHTML = `<b>${p.d === 'agora' ? 'Agora' : dmy(p.d)}</b>` + chaves.map((k) => `<div><i style="background:${corDe(k)}"></i>${faixaAbs(k)}<span>${pct(p.abs[k] || 0)}</span></div>`).join('');
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

  const nomeMov = (s) => (s === 0 ? 'Manter' : s > 0 ? `Alta de ${s * 25} bp` : `Corte de ${-s * 25} bp`);
  const tomMov = (s) => (s === 0 ? 'fw-man' : s > 0 ? 'fw-alta' : 'fw-corte');

  function draw() {
    if (!root) return;
    if (!base) {
      root.innerHTML = `<div class="fw-msg">${busy ? 'Carregando as probabilidades do Fed...' : esc(erro || 'Sem dados.')}</div>`;
      return;
    }
    const hoje = hojeNY();
    const reun = (base.reunioes || []).filter((r) => r.data >= hoje);
    const todas = [...(base.passadas || []), ...(base.reunioes || [])];
    const effr = base.effr?.v;
    if (!reun.length || !ok(effr) || !base.alvo) {
      root.innerHTML = '<div class="fw-msg">Sem reuniões ou taxas no arquivo do robô.</div>';
      return;
    }
    const px = precos();
    const agora = calcula(reun, todas, px.agora, effr);
    const ontem = calcula(reun, todas, px.ontem, effr);
    const semana = calcula(reun, todas, px.semana, effr);
    if (!agora.length) {
      root.innerHTML = '<div class="fw-msg">Faltam preços dos contratos de Fed Funds para fazer a conta.</div>';
      return;
    }
    const sel = Math.min(Math.max(0, prefs.sel | 0), agora.length - 1);
    const R = agora[sel];
    const estados = Object.keys(R.dist).map(Number).sort((a, b) => a - b);
    const maisProv = estados.reduce((m, s) => (R.dist[s] > (R.dist[m] ?? -1) ? s : m), estados[0]);
    const mudanca = (R.fim - effr) * 100;
    const faltam = diasAte(R.data);

    const chips = agora.map((x, i) => `<button class="${i === sel ? 'on' : ''}" data-r="${i}">${curta(x.data)}${x.sep ? '<i title="Reunião com projeções econômicas">*</i>' : ''}</button>`).join('');

    const barras = estados.map((s) => {
      const p = R.dist[s], po = ontem[sel]?.dist?.[s] ?? (ontem[sel] ? 0 : null), ps = semana[sel]?.dist?.[s] ?? (semana[sel] ? 0 : null);
      return `<div class="fw-bar${s === maisProv ? ' top' : ''}">
        <div class="fw-bl"><b>${faixa(s)}</b><span class="${tomMov(s)}">${s === 0 ? 'Manter (faixa atual)' : nomeMov(s)}</span></div>
        <div class="fw-bt"><i style="width:${Math.max(0.5, p).toFixed(1)}%"></i></div>
        <div class="fw-bv">${pct(p)}</div>
        <div class="fw-bc">ontem ${pct(po)} <span>·</span> 1 semana ${pct(ps)}</div>
      </div>`;
    }).join('');

    // tabela: todas as reuniões x faixas
    const cols = [...new Set(agora.flatMap((x) => Object.keys(x.dist).filter((k) => x.dist[k] >= 0.5).map(Number)))].sort((a, b) => a - b);
    const tabela = `<table class="fw-tab"><thead><tr><th>Reunião</th>${cols.map((s) => `<th>${faixa(s)}</th>`).join('')}<th>Contrato</th><th>Taxa esperada</th></tr></thead><tbody>${agora.map((x, i) => {
      const mx = Math.max(...Object.values(x.dist));
      return `<tr class="${i === sel ? 'sel' : ''}" data-r="${i}"><td>${dmy(x.data)}${x.sep ? ' *' : ''}</td>${cols.map((s) => {
        const p = x.dist[s];
        if (!ok(p) || p < 0.05) return '<td class="z">—</td>';
        return `<td class="${p === mx ? 'mx' : ''}" style="--a:${Math.min(1, p / 100).toFixed(3)}">${num(p, 1)}%</td>`;
      }).join('')}<td class="fw-ct" title="Contrato de Fed Funds usado na conta">${esc(tick(x.usado))} <b>${num(px.agora[x.usado], 3)}</b></td><td class="fw-tx">${num(x.fim)}%</td></tr>`;
    }).join('')}</tbody></table>`;

    const hora = px.hora ? new Date(px.hora * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    root.innerHTML = `<div class="fw-card">
      <div class="fw-top">
        <div class="fw-chips" role="tablist" aria-label="Reuniões do Fed">${chips}</div>
        <span class="fw-sp"></span>
        <button class="fw-ib" data-act="reload" title="Atualizar"${busy ? ' disabled' : ''}><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
      </div>
      <div class="fw-kpis">
        <div><span>Reunião</span><b>${dmy(R.data)}</b><small>${faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`}${R.sep ? ' · com projeções' : ''}</small></div>
        <div><span>Faixa atual</span><b>${faixa(0)}</b><small>Fed Funds efetiva ${num(effr)}%${base.effr?.data ? ` (${dm(base.effr.data)})` : ''}</small></div>
        <div><span>Mais provável</span><b class="${tomMov(maisProv)}">${nomeMov(maisProv)}</b><small>${pct(R.dist[maisProv])} de chance</small></div>
        <div><span>Taxa esperada depois</span><b>${num(R.fim)}%</b><small>${mudanca >= 0 ? '+' : '−'}${num(Math.abs(mudanca), 1)} bp sobre a efetiva</small></div>
      </div>
      <div class="fw-sec">Chance de cada faixa da taxa depois da reunião de ${dmy(R.data)}</div>
      <div class="fw-ctr">
        <span class="fw-ctr-t">Contrato usado</span>
        <b>${esc(tick(R.usado))}</b><span>${nomeMes(R.usado)}</span>
        <span class="fw-ctr-p">${num(px.agora[R.usado], 3)}</span>
        <span>taxa implícita ${num(100 - px.agora[R.usado], 3)}%</span>
        <span>ontem ${num(px.ontem[R.usado], 3)} (${varia(px.agora[R.usado], px.ontem[R.usado])})</span>
        <span>1 semana ${num(px.semana[R.usado], 3)} (${varia(px.agora[R.usado], px.semana[R.usado])})</span>
      </div>
      <div class="fw-bars">${barras}</div>
      <div class="fw-sec">Como a chance mudou <small>(reunião de ${dmy(R.data)}, últimos pregões)</small></div>
      <div class="fw-hleg"></div>
      <div class="fw-hwrap"><div class="fw-hbox"></div></div>
      <div class="fw-sec">Todas as reuniões <small>(chance da faixa da taxa depois de cada reunião)</small></div>
      <div class="fw-tabw">${tabela}</div>
      <div class="fw-foot">Preço dos contratos: ${esc(hora)}${vivo ? '' : ' (do último registro do robô)'}. * reunião com projeções econômicas.
        Conta feita aqui com o preço dos futuros de Fed Funds de 30 dias (CBOT), no mesmo método da ferramenta FedWatch da CME; os números podem diferir um pouco dos dela.
        O contrato usado é o do mês seguinte à reunião quando esse mês não tem reunião; senão, o do próprio mês. O gráfico refaz a conta com o fechamento de cada pregão.
        Fontes: CME/CBOT via Yahoo, Federal Reserve (calendário) e FRED (faixa e taxa efetiva).${erro ? ` <b>${esc(erro)}</b>` : ''}</div>
    </div>`;
    hist = historico(R.data, todas, R);
    larg = root.querySelector('.fw-hbox')?.clientWidth || 0;
    desenhaHist();
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) { prefs.sel = +b.dataset.r; savePrefs(); draw(); return; }
      if (e.target.closest('[data-act="reload"]') && !busy) load(true);
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  #fed-root { min-width:0; max-width:100%; }
  #fed-root .fw-card { min-width:0; max-width:100%; }
  #fed-root .fw-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  #fed-root .fw-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  #fed-root .fw-top { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--line); }
  #fed-root .fw-chips { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; min-width:0; }
  #fed-root .fw-chips button { flex:none; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; padding:6px 12px; border-radius:99px; cursor:pointer; white-space:nowrap; }
  #fed-root .fw-chips button i { font-style:normal; color:var(--accent); margin-left:2px; }
  #fed-root .fw-chips button.on { background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent); font-weight:600; }
  #fed-root .fw-sp { flex:1; }
  #fed-root .fw-ib { height:32px; min-width:32px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:9px; cursor:pointer; flex:none; }
  #fed-root .fw-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  #fed-root .fw-kpis > div { padding:12px 14px; display:flex; flex-direction:column; gap:3px; min-width:0; }
  #fed-root .fw-kpis > div + div { border-left:1px solid var(--line); }
  #fed-root .fw-kpis span { font-size:11.5px; color:var(--text-3); }
  #fed-root .fw-kpis b { font:600 18px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #fed-root .fw-kpis small { font-size:11px; color:var(--text-3); }
  #fed-root .fw-man { color:var(--info) !important; }
  #fed-root .fw-alta { color:var(--neg) !important; }
  #fed-root .fw-corte { color:var(--pos) !important; }
  #fed-root .fw-sec { padding:14px 14px 6px; font-size:12.5px; font-weight:600; color:var(--text); }
  #fed-root .fw-sec small { font-weight:400; color:var(--text-3); }
  #fed-root .fw-bars { padding:4px 14px 10px; display:flex; flex-direction:column; gap:8px; }
  #fed-root .fw-bar { display:grid; grid-template-columns:190px minmax(0,1fr) 64px 190px; align-items:center; gap:12px; }
  #fed-root .fw-bl { display:flex; flex-direction:column; gap:1px; min-width:0; }
  #fed-root .fw-bl b { font:600 13px 'JetBrains Mono', monospace; color:var(--text); }
  #fed-root .fw-bl span { font-size:11px; }
  #fed-root .fw-bt { height:14px; border-radius:4px; background:var(--surface-2); overflow:hidden; }
  #fed-root .fw-bt i { display:block; height:100%; background:color-mix(in srgb, var(--info) 70%, transparent); border-radius:4px; }
  #fed-root .fw-bar.top .fw-bt i { background:var(--accent); }
  #fed-root .fw-bv { font:600 14px 'JetBrains Mono', monospace; text-align:right; color:var(--text); }
  #fed-root .fw-bc { font-size:11px; color:var(--text-3); white-space:nowrap; }
  #fed-root .fw-bc span { opacity:.6; }
  #fed-root .fw-tabw { overflow-x:auto; padding:0 14px 6px; }
  #fed-root .fw-tab { width:100%; border-collapse:collapse; font-size:12px; }
  #fed-root .fw-tab th { text-align:right; font-weight:600; color:var(--text-3); padding:7px 8px; border-bottom:1px solid var(--line); white-space:nowrap; font-family:'JetBrains Mono', monospace; font-size:11px; }
  #fed-root .fw-tab th:first-child, #fed-root .fw-tab td:first-child { text-align:left; font-family:inherit; }
  #fed-root .fw-tab td { text-align:right; padding:7px 8px; border-bottom:1px solid var(--line); font-family:'JetBrains Mono', monospace; color:var(--text-2); white-space:nowrap;
    background:color-mix(in srgb, var(--info) calc(var(--a, 0) * 34%), transparent); }
  #fed-root .fw-tab td.z { color:var(--text-3); opacity:.5; }
  #fed-root .fw-tab td.mx { color:var(--text); font-weight:700; box-shadow:inset 0 -2px 0 var(--accent); }
  #fed-root .fw-tab td.fw-tx { color:var(--text); background:none; }
  #fed-root .fw-tab tr { cursor:pointer; }
  #fed-root .fw-tab tr:hover td:first-child, #fed-root .fw-tab tr.sel td:first-child { color:var(--accent); font-weight:600; }
  #fed-root .fw-foot { padding:10px 14px 12px; font-size:11.5px; color:var(--text-3); line-height:1.5; border-top:1px solid var(--line); margin-top:8px; }
  #fed-root .fw-ctr { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 14px; margin:2px 14px 8px; padding:9px 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); font-size:11.5px; color:var(--text-3); }
  #fed-root .fw-ctr b { font:700 13px 'JetBrains Mono', monospace; color:var(--text); margin-right:-8px; }
  #fed-root .fw-ctr-t { text-transform:uppercase; letter-spacing:.06em; font-size:10px; font-weight:700; }
  #fed-root .fw-ctr-p { font:600 13px 'JetBrains Mono', monospace; color:var(--accent); }
  #fed-root .fw-tab td.fw-ct { background:none; color:var(--text-3); font-size:11px; }
  #fed-root .fw-tab td.fw-ct b { color:var(--text-2); font-weight:600; }
  #fed-root .fw-hleg { display:flex; flex-wrap:wrap; gap:4px 14px; padding:0 14px 4px; font-size:11.5px; color:var(--text-2); }
  #fed-root .fw-hleg span { display:inline-flex; align-items:center; gap:6px; font-family:'JetBrains Mono', monospace; }
  #fed-root .fw-hleg i, #fed-root .fw-tip i { width:10px; height:3px; border-radius:2px; display:inline-block; }
  #fed-root .fw-hwrap { padding:0 14px 8px; }
  #fed-root .fw-hbox { position:relative; width:100%; min-height:220px; }
  #fed-root .fw-svg { display:block; }
  #fed-root .fw-svg text { fill:var(--text-3); font:10px 'JetBrains Mono', monospace; }
  #fed-root .fw-svg .g { stroke:var(--line); stroke-width:1; }
  #fed-root .fw-svg .fw-cx { stroke:var(--text-3); stroke-dasharray:3 3; }
  #fed-root .fw-tip { position:absolute; top:6px; z-index:2; pointer-events:none; background:var(--surface); border:1px solid var(--line-2); border-radius:9px; box-shadow:var(--shadow-lg); padding:8px 10px; font-size:11.5px; color:var(--text-2); min-width:170px; }
  #fed-root .fw-tip b { display:block; color:var(--text); margin-bottom:4px; }
  #fed-root .fw-tip div { display:flex; align-items:center; gap:7px; line-height:1.7; font-family:'JetBrains Mono', monospace; }
  #fed-root .fw-tip span { margin-left:auto; padding-left:10px; color:var(--text); font-weight:600; }
  @media (max-width: 900px) {
    #fed-root .fw-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    #fed-root .fw-kpis > div:nth-child(3) { border-left:0; }
    #fed-root .fw-kpis > div:nth-child(n+3) { border-top:1px solid var(--line); }
    #fed-root .fw-bar { grid-template-columns:minmax(0,1fr) 60px; grid-template-areas:"l v" "t t" "c c"; gap:4px 10px; }
    #fed-root .fw-bl { grid-area:l; } #fed-root .fw-bv { grid-area:v; } #fed-root .fw-bt { grid-area:t; } #fed-root .fw-bc { grid-area:c; }
    #fed-root .fw-kpis b { font-size:15px; }
  }`;
  document.head.appendChild(css);

  window.__fedRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    draw();
    load(false);
  };
})();
