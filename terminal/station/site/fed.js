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

  let prefs = { sel: 0, graf: false };
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
  const tomMov = (s) => (s === 0 ? 'fw-man' : s > 0 ? 'fw-alta' : 'fw-corte');   // manter âmbar, corte verde, alta vermelho

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

    const ate = (x) => { const d = diasAte(x.data); return d === 0 ? 'Hoje' : d === 1 ? 'amanhã' : `${d} dias`; };
    const SEP = '<i class="fa-solid fa-chart-simple fw-sep" title="Inclui projeções econômicas (FOMC)" aria-label="com projeções econômicas"></i>';
    const chips = agora.map((x, i) => `<button class="${i === sel ? 'on' : ''}" data-r="${i}" aria-pressed="${i === sel}"><b>${curta(x.data)}${x.sep ? SEP : ''}</b><small>${ate(x)}</small></button>`).join('');
    // variação do preço com seta: subir o preço = taxa implícita menor
    const variaH = (a, b) => (ok(a) && ok(b) ? `<em class="${a - b > 0.0005 ? 'fw-up' : a - b < -0.0005 ? 'fw-dn' : ''}">${a - b > 0.0005 ? '▲' : a - b < -0.0005 ? '▼' : ''} ${varia(a, b)}</em>` : '<em>—</em>');
    const corEst = (st) => ({ 0: 'var(--accent)', '-1': '#22c55e', '-2': '#16a34a', '-3': '#15803d', 1: '#f97316', 2: '#ef4444', 3: '#b91c1c' }[st] || '#94a3b8');

    // barra empilhada: a divisão das chances numa linha só (aparece quando há mais de uma faixa possível)
    const vis = estados.filter((st) => R.dist[st] >= 0.5);
    const pilha = vis.length > 1 ? `<div class="fw-pilha" role="img" aria-label="${vis.map((st) => `${faixa(st)}: ${pct(R.dist[st])}`).join(', ')}">${vis.map((st) =>
      `<i style="flex:${R.dist[st].toFixed(2)};background:${corEst(st)}" title="${faixa(st)} · ${nomeMov(st)}: ${pct(R.dist[st])}">${R.dist[st] >= 30 ? `<span><em>${faixa(st)} · </em>${pct(R.dist[st])}</span>` : R.dist[st] >= 12 ? `<span>${pct(R.dist[st])}</span>` : ''}</i>`).join('')}</div>` : '';

    const barras = estados.filter((st) => R.dist[st] >= 0.05 || st === 0).map((st) => {
      const p = R.dist[st] || 0, po = ontem[sel]?.dist?.[st] ?? (ontem[sel] ? 0 : null), ps = semana[sel]?.dist?.[st] ?? (semana[sel] ? 0 : null);
      return `<div class="fw-bar${st === maisProv ? ' top' : ''}">
        <div class="fw-bl"><b>${faixa(st)}</b><span class="${tomMov(st)}">${st === 0 ? 'Manter (faixa atual)' : nomeMov(st)}</span></div>
        <div class="fw-bt"><i style="width:${Math.max(0.5, p).toFixed(1)}%;background:${corEst(st)}">${p >= 25 ? `<span>${pct(p)}</span>` : ''}</i></div>
        <div class="fw-bv">${pct(p)}</div>
        <div class="fw-bc">ontem ${pct(po)} <span>·</span> 1 semana ${pct(ps)}</div>
      </div>`;
    }).join('');

    // tabela: todas as reuniões x faixas, como mapa de calor (quanto maior a chance, mais forte a cor)
    const cols = [...new Set(agora.flatMap((x) => Object.keys(x.dist).filter((k) => x.dist[k] >= 0.5).map(Number)))].sort((a, b) => a - b);
    const tabela = `<table class="fw-tab"><thead><tr><th>Reunião</th>${cols.map((st) => `<th>${faixa(st)}</th>`).join('')}<th class="fw-ct">Contrato</th><th>Preço</th><th>Taxa esperada</th></tr></thead><tbody>${agora.map((x, i) => {
      const mx = Math.max(...Object.values(x.dist));
      return `<tr class="${i === sel ? 'sel' : ''}" data-r="${i}"><td>${dmy(x.data)}${x.sep ? SEP : ''}</td>${cols.map((st) => {
        const pp = x.dist[st];
        if (!ok(pp) || pp < 0.05) return '<td class="z">–</td>';
        return `<td class="${pp === mx ? 'mx' : ''}" style="--a:${Math.min(1, pp / 100).toFixed(3)}">${num(pp, 1)}%</td>`;
      }).join('')}<td class="fw-ct" title="Contrato de Fed Funds usado na conta">${esc(tick(x.usado))}</td><td class="fw-pr">${num(px.agora[x.usado], 3)}</td><td class="fw-tx">${num(x.fim)}%</td></tr>`;
    }).join('')}</tbody></table>`;

    const hora = px.hora ? new Date(px.hora * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const kpi = (ic, t, b, sm, cls = '') => `<div class="fw-kpi"><span class="fw-ki"><i class="fa-solid ${ic}" aria-hidden="true"></i></span><div><span>${t}</span><b class="${cls}">${b}</b><small>${sm}</small></div></div>`;
    root.innerHTML = `<div class="fw-card">
      <div class="fw-top">
        <button class="fw-nav" data-act="esq" aria-label="Reuniões anteriores"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="fw-chips" role="tablist" aria-label="Reuniões do Fed">${chips}</div>
        <button class="fw-nav" data-act="dir" aria-label="Próximas reuniões"><i class="fa-solid fa-chevron-right"></i></button>
        <div class="fw-upd"><span>Preços de</span><b>${esc(hora)}</b></div>
        <button class="fw-ib" data-act="reload" title="Atualizar" aria-label="Atualizar"${busy ? ' disabled' : ''}><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
      </div>
      <div class="fw-kpis">
        ${kpi('fa-calendar-days', 'Reunião do Fed', dmy(R.data), (faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`) + (R.sep ? ' · com projeções' : ''))}
        ${kpi('fa-bullseye', 'Faixa atual', faixa(0), `Fed Funds efetiva ${num(effr)}%${base.effr?.data ? ` (${dm(base.effr.data)})` : ''}`)}
        ${kpi('fa-chart-simple', 'Cenário mais provável', nomeMov(maisProv), `${pct(R.dist[maisProv])} de chance`, tomMov(maisProv))}
        ${kpi('fa-percent', 'Taxa esperada depois', `${num(R.fim)}%`, `${Math.abs(mudanca) < 0.05 ? '' : mudanca > 0 ? '+' : '−'}${num(Math.abs(mudanca), 1)} bp sobre a efetiva`)}
      </div>
      <div class="fw-blk">
        <div class="fw-sec fw-sec-b">Chance de cada faixa da taxa depois da reunião de ${dmy(R.data)}
          <button class="fw-tg" data-act="graf" aria-expanded="${prefs.graf ? 'true' : 'false'}"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> ${prefs.graf ? 'Esconder gráfico' : 'Mostrar gráfico'}</button></div>
        <div class="fw-ctr">
          <span class="fw-chip"><i class="fa-solid fa-file-contract"></i>Contrato <b>${esc(tick(R.usado))}</b> ${nomeMes(R.usado)}</span>
          <span class="fw-chip"><i class="fa-solid fa-tag"></i>Preço <b>${num(px.agora[R.usado], 3)}</b></span>
          <span class="fw-chip"><i class="fa-solid fa-percent"></i>Taxa implícita <b>${num(100 - px.agora[R.usado], 3)}%</b></span>
          <span class="fw-chip">Ontem <b>${num(px.ontem[R.usado], 3)}</b>${variaH(px.agora[R.usado], px.ontem[R.usado])}</span>
          <span class="fw-chip">1 semana <b>${num(px.semana[R.usado], 3)}</b>${variaH(px.agora[R.usado], px.semana[R.usado])}</span>
        </div>
        ${pilha}
        <div class="fw-bars">${barras}</div>
        ${prefs.graf ? `<div class="fw-sec">Como a chance mudou <small>(reunião de ${dmy(R.data)}, últimos pregões)</small></div><div class="fw-hleg"></div><div class="fw-hwrap"><div class="fw-hbox"></div></div>` : ''}
      </div>
      <div class="fw-blk">
        <div class="fw-sec fw-sec-b">Todas as reuniões <small>(chance da faixa da taxa depois de cada reunião)</small>
          <span class="fw-esc" aria-hidden="true">Cor mais forte = chance maior <b>0%</b><i></i><b>100%</b></span></div>
        <div class="fw-tabw">${tabela}</div>
      </div>
      <div class="fw-foot">
        <div><b><i class="fa-solid fa-gear"></i> Metodologia</b><p>Chances calculadas com o preço dos futuros de Fed Funds de 30 dias (CBOT), no mesmo método da ferramenta FedWatch da CME; os números podem diferir um pouco dos dela. O contrato usado é o do mês seguinte à reunião quando esse mês não tem reunião; senão, o do próprio mês. O gráfico refaz a conta com o fechamento de cada pregão. <i class="fa-solid fa-chart-simple fw-sep"></i> = reunião com projeções econômicas.</p></div>
        <div><b><i class="fa-solid fa-database"></i> Fontes</b><p>CME/CBOT via Yahoo, Federal Reserve (calendário do FOMC) e FRED (faixa e taxa efetiva). Preços de ${esc(hora)}${vivo ? '' : ' (do último registro do robô)'}.${erro ? ` <b>${esc(erro)}</b>` : ''}</p></div>
      </div>
    </div>`;
    // a reunião escolhida fica à vista na barra de datas; as setas e o degradê mostram que dá para rolar
    const fc = root.querySelector('.fw-chips');
    const bordas = () => { fc.classList.toggle('esq', fc.scrollLeft > 4); fc.classList.toggle('dir', fc.scrollLeft + fc.clientWidth < fc.scrollWidth - 4); fc.parentElement.classList.toggle('cabe', fc.scrollWidth <= fc.clientWidth + 4); };
    fc.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    fc.addEventListener('scroll', bordas, { passive: true });
    bordas();
    if (prefs.graf) {
      hist = historico(R.data, todas, R);
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
  #fed-root { min-width:0; max-width:100%; font-variant-numeric:tabular-nums; }
  #fed-root .fw-card { min-width:0; max-width:100%; display:flex; flex-direction:column; gap:14px; }
  #fed-root .fw-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  #fed-root .fw-top { display:flex; align-items:center; gap:8px; min-width:0; }
  #fed-root .fw-nav { flex:none; width:32px; height:44px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:10px; cursor:pointer; font-size:12px; }
  #fed-root .fw-top.cabe .fw-nav { display:none; }
  #fed-root .fw-pilha em { font-style:normal; }
  #fed-root .fw-nav:hover { color:var(--text); border-color:var(--line-2); }
  #fed-root .fw-chips { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; min-width:0; flex:1; scroll-behavior:smooth; }
  #fed-root .fw-chips::-webkit-scrollbar { display:none; }
  #fed-root .fw-chips.dir { -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent); }
  #fed-root .fw-chips.esq { -webkit-mask-image:linear-gradient(90deg,transparent,#000 40px); mask-image:linear-gradient(90deg,transparent,#000 40px); }
  #fed-root .fw-chips.esq.dir { -webkit-mask-image:linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent); }
  #fed-root .fw-chips button { flex:none; display:flex; flex-direction:column; align-items:center; gap:1px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; padding:6px 14px; border-radius:10px; cursor:pointer; white-space:nowrap; min-width:92px; }
  #fed-root .fw-chips button b { font-size:12.5px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:6px; }
  #fed-root .fw-chips button small { font-size:11px; color:var(--text-3); }
  #fed-root .fw-chips button:hover { border-color:var(--line-2); }
  #fed-root .fw-chips button.on { background:var(--accent-soft); border-color:var(--accent); }
  #fed-root .fw-chips button.on b, #fed-root .fw-chips button.on small { color:var(--accent-ink); }
  #fed-root .fw-sep { color:var(--accent-ink); font-size:10.5px; }
  #fed-root .fw-upd { flex:none; display:flex; flex-direction:column; align-items:flex-end; line-height:1.3; margin-left:6px; }
  #fed-root .fw-upd span { font-size:10.5px; color:var(--text-3); }
  #fed-root .fw-upd b { font-size:13px; color:var(--text); font-weight:600; }
  #fed-root .fw-ib { height:40px; min-width:40px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:10px; cursor:pointer; flex:none; }
  #fed-root .fw-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
  #fed-root .fw-kpi { display:flex; gap:14px; align-items:flex-start; padding:16px 18px; border:1px solid var(--line); border-radius:14px; background:var(--surface-2); box-shadow:0 1px 3px rgba(0,0,0,.08); min-width:0; }
  #fed-root .fw-kpi > div { display:flex; flex-direction:column; gap:3px; min-width:0; }
  #fed-root .fw-ki { flex:none; width:44px; height:44px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; background:var(--accent-soft); border:1px solid var(--accent-line, var(--line)); color:var(--accent-ink); font-size:17px; }
  #fed-root .fw-kpi span { font-size:12.5px; color:var(--text-2); font-weight:500; }
  #fed-root .fw-kpi b { font-size:24px; font-weight:700; color:var(--text); letter-spacing:-.01em; line-height:1.25; }
  #fed-root .fw-kpi small { font-size:12px; color:var(--text-3); }
  #fed-root .fw-man { color:var(--accent-ink) !important; }
  #fed-root .fw-alta { color:var(--neg) !important; }
  #fed-root .fw-corte { color:var(--pos-ink) !important; }
  #fed-root .fw-blk { border:1px solid var(--line); border-radius:14px; background:var(--surface-2); padding:4px 0 10px; min-width:0; }
  #fed-root .fw-sec { padding:14px 16px 8px; font-size:15px; font-weight:700; color:var(--text); }
  #fed-root .fw-sec small { font-weight:400; color:var(--text-3); font-size:12.5px; }
  #fed-root .fw-sec-b { display:flex; align-items:center; gap:8px 12px; flex-wrap:wrap; }
  #fed-root .fw-tg { margin-left:auto; display:inline-flex; align-items:center; gap:8px; border:1px solid var(--accent-line, var(--line-2)); background:transparent; color:var(--text); font:inherit; font-size:13px; font-weight:600; padding:7px 14px; border-radius:9px; cursor:pointer; }
  #fed-root .fw-tg i { color:var(--accent-ink); }
  #fed-root .fw-tg:hover { background:var(--accent-soft); }
  #fed-root .fw-ctr { display:flex; flex-wrap:wrap; gap:8px; padding:0 16px 12px; }
  #fed-root .fw-chip { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); border-radius:9px; background:var(--surface); padding:6px 11px; font-size:12px; color:var(--text-3); white-space:nowrap; }
  #fed-root .fw-chip > i { color:var(--text-3); font-size:11px; }
  #fed-root .fw-chip b { font-size:13px; color:var(--text); font-weight:700; }
  #fed-root .fw-chip em { font-style:normal; font-weight:600; color:var(--text-3); }
  #fed-root .fw-chip em.fw-up { color:var(--pos-ink); } #fed-root .fw-chip em.fw-dn { color:var(--neg); }
  #fed-root .fw-pilha { display:flex; gap:2px; height:26px; margin:0 16px 12px; border-radius:7px; overflow:hidden; }
  #fed-root .fw-pilha i, #fed-root .fw-bt i { font-style:normal; }
  #fed-root .fw-pilha i { display:flex; align-items:center; justify-content:center; min-width:3px; overflow:hidden; }
  #fed-root .fw-pilha span { font-size:11.5px; font-weight:700; color:#111; white-space:nowrap; padding:0 6px; }
  #fed-root .fw-bars { padding:2px 16px 6px; display:flex; flex-direction:column; gap:10px; }
  #fed-root .fw-bar { display:grid; grid-template-columns:180px minmax(0,1fr) 64px 190px; align-items:center; gap:12px; }
  #fed-root .fw-bl { display:flex; flex-direction:column; gap:1px; min-width:0; }
  #fed-root .fw-bl b { font-size:15px; font-weight:700; color:var(--text); }
  #fed-root .fw-bl span { font-size:12.5px; }
  #fed-root .fw-bt { height:20px; border-radius:6px; background:var(--surface); overflow:hidden; }
  #fed-root .fw-bt i { display:flex; align-items:center; justify-content:center; height:100%; border-radius:6px; opacity:.85; }
  #fed-root .fw-bar.top .fw-bt i { opacity:1; }
  #fed-root .fw-bt i span { font-size:12px; font-weight:700; color:#111; }
  #fed-root .fw-bv { font-size:15px; font-weight:700; text-align:right; color:var(--text); }
  #fed-root .fw-bc { font-size:11.5px; color:var(--text-3); white-space:nowrap; }
  #fed-root .fw-bc span { opacity:.6; }
  #fed-root .fw-esc { margin-left:auto; display:inline-flex; align-items:center; gap:8px; font-size:11.5px; font-weight:400; color:var(--text-3); }
  #fed-root .fw-esc b { font-weight:500; color:var(--text-3); }
  #fed-root .fw-esc i { width:110px; height:10px; border-radius:3px; background:linear-gradient(90deg, color-mix(in srgb, var(--info) 6%, transparent), var(--info)); }
  #fed-root .fw-tabw { overflow-x:auto; margin:0 16px; border:1px solid var(--line); border-radius:10px; }
  #fed-root .fw-tab { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
  #fed-root .fw-tab th { text-align:right; font-weight:600; color:var(--text-2); padding:9px 10px; border-bottom:1px solid var(--line); white-space:nowrap; font-size:12px; background:var(--surface); }
  #fed-root .fw-tab td { text-align:right; padding:8px 10px; border-bottom:1px solid var(--line); color:var(--text-2); white-space:nowrap;
    background:color-mix(in srgb, var(--info) calc(var(--a, 0) * 78%), transparent); }
  #fed-root .fw-tab tr:last-child td { border-bottom:0; }
  #fed-root .fw-tab th:first-child, #fed-root .fw-tab td:first-child { text-align:left; position:sticky; left:0; z-index:1; background:var(--surface); border-right:1px solid var(--line); }
  #fed-root .fw-tab td:first-child .fw-sep { margin-left:6px; }
  #fed-root .fw-tab td.z { color:var(--text-3); opacity:.25; background:none; }
  #fed-root .fw-tab td.mx { color:var(--text); font-weight:700; }
  #fed-root .fw-tab td[style] { color:var(--text); }
  #fed-root .fw-tab th.fw-ct, #fed-root .fw-tab td.fw-ct { text-align:left; padding-left:18px; }
  #fed-root .fw-tab td.fw-ct, #fed-root .fw-tab td.fw-pr { background:none; color:var(--text-2); }
  #fed-root .fw-tab td.fw-tx { color:var(--text); font-weight:700; background:none; }
  #fed-root .fw-tab tr { cursor:pointer; }
  #fed-root .fw-tab tr:hover td:first-child { color:var(--text); }
  #fed-root .fw-tab tr.sel td:first-child { color:var(--accent-ink); font-weight:700; box-shadow:inset 3px 0 0 var(--accent); }
  #fed-root .fw-foot { display:grid; grid-template-columns:1fr 1fr; gap:14px 28px; padding:14px 18px; border:1px solid var(--line); border-radius:14px; background:var(--surface-2); }
  #fed-root .fw-foot b { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text); }
  #fed-root .fw-foot b i { color:var(--accent-ink); }
  #fed-root .fw-foot p { margin:6px 0 0; font-size:12px; line-height:1.55; color:var(--text-3); }
  #fed-root .fw-foot p b { display:inline; color:var(--neg); }
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
  @container (max-width: 900px) {
    #fed-root .fw-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    #fed-root .fw-bar { grid-template-columns:minmax(0,1fr) 60px; grid-template-areas:"l v" "t t" "c c"; gap:4px 10px; }
    #fed-root .fw-bl { grid-area:l; } #fed-root .fw-bv { grid-area:v; } #fed-root .fw-bt { grid-area:t; } #fed-root .fw-bc { grid-area:c; }
    #fed-root .fw-upd, #fed-root .fw-nav { display:none; }
    #fed-root .fw-foot { grid-template-columns:1fr; }
    #fed-root .fw-esc { margin-left:0; }
  }
  @container (max-width: 560px) {
    #fed-root .fw-kpis { gap:8px; }
    #fed-root .fw-kpi { padding:12px; }
    #fed-root .fw-ki { display:none; }
    #fed-root .fw-kpi span { font-size:11.5px; }
    #fed-root .fw-kpi b { font-size:18px; }
    #fed-root .fw-kpi small { font-size:11px; }
    #fed-root .fw-ctr { gap:6px; }
    #fed-root .fw-chip { padding:5px 9px; font-size:11.5px; }
    #fed-root .fw-chip > i { display:none; }
    #fed-root .fw-pilha em { display:none; }
    #fed-root .fw-tg { margin-left:0; }
  }`;
  document.head.appendChild(css);

  window.__fedRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    draw();
    load(false);
  };
})();
