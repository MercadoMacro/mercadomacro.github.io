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
  function calcula(reun, todas, px, effr) {
    const comReuniao = new Set(todas.map((r) => mes(r.data)));
    const r = (m) => (ok(px[m]) ? 100 - px[m] : null);
    const atual = mes(hojeNY());
    let antFim = effr, dist = new Map([[0, 1]]);
    const out = [];
    for (let i = 0; i < reun.length; i++) {
      const re = reun[i], M = mes(re.data), ant = somaMes(M, -1), prox = somaMes(M, 1);
      // começo do mês: o mês anterior sem reunião já dá a taxa; senão vale o fim da reunião anterior (ou a efetiva de hoje)
      let ini = antFim;
      if (!comReuniao.has(ant) && r(ant) != null && ant >= atual) ini = r(ant);
      let fim;
      if (!comReuniao.has(prox) && r(prox) != null) fim = r(prox);
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
      out.push({ data: re.data, sep: re.sep, fim, dist: d });
    }
    return out;
  }

  const faixa = (s) => {
    const a = base.alvo;
    return `${num(a.min + s * 0.25)}–${num(a.max + s * 0.25)}%`;
  };
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
    const tabela = `<table class="fw-tab"><thead><tr><th>Reunião</th>${cols.map((s) => `<th>${faixa(s)}</th>`).join('')}<th>Taxa esperada</th></tr></thead><tbody>${agora.map((x, i) => {
      const mx = Math.max(...Object.values(x.dist));
      return `<tr class="${i === sel ? 'sel' : ''}" data-r="${i}"><td>${dmy(x.data)}${x.sep ? ' *' : ''}</td>${cols.map((s) => {
        const p = x.dist[s];
        if (!ok(p) || p < 0.05) return '<td class="z">—</td>';
        return `<td class="${p === mx ? 'mx' : ''}" style="--a:${Math.min(1, p / 100).toFixed(3)}">${num(p, 1)}%</td>`;
      }).join('')}<td class="fw-tx">${num(x.fim)}%</td></tr>`;
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
      <div class="fw-bars">${barras}</div>
      <div class="fw-sec">Todas as reuniões <small>(chance da faixa da taxa depois de cada reunião)</small></div>
      <div class="fw-tabw">${tabela}</div>
      <div class="fw-foot">Preço dos contratos: ${esc(hora)}${vivo ? '' : ' (do último registro do robô)'}. * reunião com projeções econômicas.
        Conta feita aqui com o preço dos futuros de Fed Funds de 30 dias (CBOT), no mesmo método da ferramenta FedWatch da CME; os números podem diferir um pouco dos dela.
        Fontes: CME/CBOT via Yahoo, Federal Reserve (calendário) e FRED (faixa e taxa efetiva).${erro ? ` <b>${esc(erro)}</b>` : ''}</div>
    </div>`;
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
