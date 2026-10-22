/* =========================================================
   CALCULADORAS (aba Calculadora)
   Arquivo separado do index.html: só é baixado quando a aba é aberta.
   Tudo recalcula enquanto você digita (sem botão "Calcular").
   Dados reais: CDI, Selic e IPCA 12 meses do Banco Central (SGS), taxas do Tesouro Direto
   pelo worker, índices de inflação mês a mês do BCB, câmbio do currency-api (jsDelivr)
   e preço de ações do Yahoo pelo worker. Se uma fonte falha, o campo mostra "—" e aceita
   o valor digitado; nada é inventado.
   ========================================================= */
(() => {
  if (window.__calcLoaded) return;
  window.__calcLoaded = true;

  const root = document.getElementById('calc-root');
  if (!root) return;

  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const BCB = (code, q) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados${q}`;
  // Banco Central: primeiro pelo worker, depois direto
  const bcbW = (u) => { const m = String(u).match(/bcdata\.sgs\.(\d+)\/dados(.*)$/); return m ? `${PROXY}/bcb?c=${m[1]}&q=${encodeURIComponent(m[2])}` : u; };
  const KEY = 'calc_state_v1';

  /* ---------------- utilidades ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, d = 2) => !ok(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (v, d = 2) => !ok(v) ? '—' : (v < -0.004 ? '−R$ ' : 'R$ ') + nf(Math.abs(v), d);
  const sbrl = (v) => !ok(v) ? '—' : (Math.abs(v) < 0.005 ? 'R$ 0,00' : (v > 0 ? '+R$ ' : '−R$ ') + nf(Math.abs(v)));
  const pct = (v, d = 2) => !ok(v) ? '—' : nf(v * 100, d) + '%';
  const spct = (v, d = 2) => !ok(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), d) + '%';
  const short = (v) => {
    if (!ok(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return `${s}R$ ${nf(a / 1e9, 1)} bi`;
    if (a >= 1e6) return `${s}R$ ${nf(a / 1e6, a >= 1e7 ? 1 : 2)} mi`;
    if (a >= 1e4) return `${s}R$ ${nf(a / 1e3, 0)} mil`;
    return `${s}R$ ${nf(a, 0)}`;
  };
  // aceita "1.234,56", "1234.56", "10.000", "R$ 5 mil" não
  function numBR(s) {
    if (s == null) return NaN;
    let t = String(s).replace(/[R$%\s]/g, '').replace(/−/g, '-');
    if (!t) return NaN;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const x = parseFloat(t);
    return isFinite(x) ? x : NaN;
  }
  const fmtIn = (v, d = 2) => ok(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: d }) : '';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const $c = (s, el = root) => el.querySelector(s);
  const $$c = (s, el = root) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 8);
  const toast = (m, t) => { if (typeof window.toast === 'function') window.toast(m, t); };
  async function getJ(url, ms = 15000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); const j = await r.json().catch(() => null); if (!r.ok || j == null) throw new Error(`HTTP ${r.status}`); return j; }
    finally { clearTimeout(t); }
  }
  const errMsg = (e) => e && e.name === 'AbortError' ? 'tempo esgotado' : /fetch|network|Failed/i.test(e?.message || '') ? 'sem conexão com a fonte' : (e?.message || 'erro');
  const mesesBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ---------------- estado (salvo neste navegador) ---------------- */
  const DEF = {
    sub: 'rf',
    rf: {
      valor: '10.000', prazo: '2', unid: 'anos', cdi: '', ipca: '', selic: '', cust: '0,20',
      lines: [
        { id: 'a', tipo: 'pos', taxa: '110', isento: false, nome: 'CDB' },
        { id: 'b', tipo: 'pos', taxa: '92', isento: true, nome: 'LCI / LCA' },
        { id: 'c', tipo: 'tselic', taxa: '0,10', isento: false, nome: 'Tesouro Selic' },
        { id: 'd', tipo: 'poup', taxa: '', isento: true, nome: 'Poupança' }
      ]
    },
    jc: { modo: 'proj', ini: '5.000', aporte: '1.000', taxa: '10', base: 'aa', anos: '15', cresc: '0', infl: '', meta: '1.000.000' },
    ap: { idade: '30', alvo: '60', pat: '50.000', aporte: '1.500', taxa: '11', infl: '4,5', renda: '10.000', modo: 'perp', anosRec: '25' },
    fin: { imovel: '500.000', entrada: '100.000', taxa: '11,5', anos: '30', custos: '15.000', extra: '0', tab: 'sac', tabela: false },
    pm: { tk: '', atual: '', alvoPM: '', compraA: '', ops: [{ id: 'o1', t: 'C', q: '100', p: '30,00', c: '' }, { id: 'o2', t: 'C', q: '200', p: '26,50', c: '' }] },
    inf: { valor: '1.000', ini: '2020-01', fim: '', idx: 'ipca' },
    fx: { valor: '1.000', de: 'usd', para: 'brl' },
    risk: { capital: '50.000', risco: '1', entrada: '30,00', stop: '28,50', alvo: '34,00', lote: '100', custo: '0', acerto: '45' }
  };
  let S;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    S = {};
    Object.keys(DEF).forEach((k) => { S[k] = typeof DEF[k] === 'object' ? { ...DEF[k], ...(j[k] || {}) } : (j[k] ?? DEF[k]); });
  } catch (e) { S = JSON.parse(JSON.stringify(DEF)); }
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* cheio */ } }, 250); };
  const getP = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
  const setP = (path, v) => { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((a, k) => a[k], S); o[last] = v; };
  const lineById = (id) => S.rf.lines.find((l) => l.id === id);

  /* ---------------- dados de mercado ---------------- */
  const M = { cdi: null, cdiSrc: '', selic: null, selicSrc: '', ipca: null, ipcaSrc: '', tesouro: null, tesErr: '', fx: null, fxDate: '', fxErr: '' };
  const lastBCB = async (code) => {
    const u = BCB(code, '/ultimos/1?formato=json');
    const j = await getJ(bcbW(u), 12000).catch(() => getJ(u, 12000));
    const o = Array.isArray(j) ? j[j.length - 1] : null, v = parseFloat(o?.valor);
    if (!isFinite(v)) throw new Error('sem valor');
    return { v, d: o.data };
  };
  async function loadMarket() {
    const jobs = [
      lastBCB(4389).then((r) => { M.cdi = r.v / 100; M.cdiSrc = `BCB ${r.d}`; })
        .catch(() => lastBCB(12).then((r) => { M.cdi = (1 + r.v / 100) ** 252 - 1; M.cdiSrc = `BCB ${r.d}`; }))
        .catch(() => { M.cdiSrc = 'indisponível'; }),
      lastBCB(432).then((r) => { M.selic = r.v / 100; M.selicSrc = `BCB ${r.d}`; }).catch(() => { M.selicSrc = 'indisponível'; }),
      lastBCB(13522).then((r) => { M.ipca = r.v / 100; M.ipcaSrc = `IPCA 12 meses até ${r.d.slice(3)}`; }).catch(() => { M.ipcaSrc = 'indisponível'; }),
      getJ(`${PROXY}/tesouro`, 15000).then((j) => { M.tesouro = (j.titulos || []).filter((t) => isFinite(t.taxa)); }).catch((e) => { M.tesErr = errMsg(e); })
    ];
    await Promise.all(jobs.map((p) => p.then(() => refresh())));
  }
  async function loadFx() {
    const urls = ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/brl.json', 'https://latest.currency-api.pages.dev/v1/currencies/brl.json'];
    for (const u of urls) {
      try { const j = await getJ(u, 12000); if (j && j.brl) { M.fx = j.brl; M.fx.brl = 1; M.fxDate = j.date || ''; M.fxErr = ''; refresh(); return; } } catch (e) { M.fxErr = errMsg(e); }
    }
    refresh();
  }
  let refreshT = 0;
  function refresh() { cancelAnimationFrame(refreshT); refreshT = requestAnimationFrame(() => { renderStrip(); if (S.sub === 'rf') renderSub(true); else calc(); }); }

  /* ---------------- campos ---------------- */
  // campo de texto (aceita vírgula) com régua opcional
  function fld(k, label, o = {}) {
    const v = getP(k) ?? '';
    const rv = numBR(v);
    return `<label class="cl-f ${o.cls || ''}"><span>${label}${o.tip ? ` <i class="cl-q" title="${esc(o.tip)}">?</i>` : ''}</span>
      <div class="cl-inp">${o.pre ? `<em>${o.pre}</em>` : ''}<input data-k="${k}" value="${esc(v)}" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(o.ph ?? '')}"${o.type ? ` type="${o.type}"` : ''}>${o.suf ? `<em>${o.suf}</em>` : ''}</div>
      ${o.rng ? `<input type="range" class="cl-rng" data-r="${k}" min="${o.rng[0]}" max="${o.rng[1]}" step="${o.rng[2]}" value="${ok(rv) ? clamp(rv, o.rng[0], o.rng[1]) : o.rng[0]}" data-d="${o.rng[3] ?? 0}" aria-label="${esc(label)}">` : ''}
    </label>`;
  }
  const seg = (k, opts) => `<div class="cl-seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" data-seg="${k}" data-v="${v}" class="${String(getP(k)) === String(v) ? 'on' : ''}" aria-checked="${String(getP(k)) === String(v)}">${l}</button>`).join('')}</div>`;
  const kpi = (label, val, o = {}) => `<div class="cl-kpi ${o.big ? 'big' : ''} ${o.cls || ''}"><span>${label}</span><b>${val}</b>${o.sub ? `<em>${o.sub}</em>` : ''}</div>`;
  const insight = (arr) => arr.filter(Boolean).length ? `<ul class="cl-ins">${arr.filter(Boolean).map((t) => `<li><i class="fas fa-lightbulb"></i><span>${t}</span></li>`).join('')}</ul>` : '';
  const V = (k) => numBR(getP(k));

  /* ---------------- gráfico de linhas (SVG, com leitura ao passar o mouse) ---------------- */
  function lineChart(host, cfg) {
    if (!host) return;
    const W = Math.max(280, host.clientWidth || 600), H = cfg.h || 240, L = 64, R = 14, T = 14, B = 26;
    const all = cfg.series.flatMap((s) => s.d.filter(ok));
    if (!all.length) { host.innerHTML = '<div class="cl-empty">Sem dados para desenhar.</div>'; return; }
    let lo = Math.min(cfg.zero === false ? Infinity : 0, ...all), hi = Math.max(...all);
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.06; hi += pad; if (lo !== 0) lo -= pad;
    const n = cfg.x.length, X = (i) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R)), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const fy = cfg.fy || short;
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="cl-grid"/><text x="${L - 8}" y="${y + 4}" class="cl-ax" text-anchor="end">${esc(fy(v))}</text>`; }
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L) / 70))));
    for (let i = 0; i < n; i += step) g += `<text x="${X(i)}" y="${H - 7}" class="cl-ax" text-anchor="middle">${esc(cfg.x[i])}</text>`;
    let p = '';
    cfg.series.forEach((s) => {
      const pts = s.d.map((v, i) => ok(v) ? `${X(i).toFixed(1)},${Y(v).toFixed(1)}` : null).filter(Boolean);
      if (!pts.length) return;
      if (s.area) p += `<polygon points="${X(s.d.findIndex(ok))},${Y(Math.max(lo, 0))} ${pts.join(' ')} ${X(s.d.length - 1 - [...s.d].reverse().findIndex(ok))},${Y(Math.max(lo, 0))}" style="fill:${s.c};opacity:${s.op ?? 0.14}"/>`;
      p += `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${s.c}" stroke-width="${s.w || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    (cfg.marks || []).forEach((m) => {
      if (m.i == null || m.i < 0 || m.i >= n) return;
      const x = X(m.i);
      p += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" class="cl-mark"/><text x="${Math.min(x + 5, W - R - 4)}" y="${T + 11}" class="cl-mark-t" text-anchor="${x > W - 140 ? 'end' : 'start'}">${esc(m.t)}</text>`;
    });
    if (cfg.hline != null && ok(cfg.hline.v)) { const y = Y(cfg.hline.v); p += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="cl-mark"/><text x="${W - R - 4}" y="${y - 5}" class="cl-mark-t" text-anchor="end">${esc(cfg.hline.t)}</text>`; }
    host.innerHTML = `<div class="cl-chart"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${g}${p}<line class="cl-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/><rect class="cl-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="cl-tipbox" hidden></div></div>
      <div class="cl-legend">${cfg.series.filter((s) => !s.noLeg).map((s) => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`;
    const svg = host.querySelector('svg'), cross = host.querySelector('.cl-cross'), tip = host.querySelector('.cl-tipbox');
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width;
      const i = clamp(Math.round((sx - L) / (W - L - R) * (n - 1)), 0, n - 1), x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.style.display = '';
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(cfg.xl ? cfg.xl(i) : cfg.x[i])}</b>${cfg.series.filter((s) => !s.noTip).map((s) => `<span><i style="background:${s.c}"></i>${esc(s.n)}<em>${esc((s.f || cfg.ft || brl)(s.d[i]))}</em></span>`).join('')}`;
      const px = x * r.width / W;
      tip.style.left = (px > r.width / 2 ? px - tip.offsetWidth - 12 : px + 12) + 'px';
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.hidden = true; });
  }
  const PAL = ['var(--accent)', 'var(--info)', 'var(--pos)', 'var(--crypto)', '#fb923c', '#22d3ee', '#f472b6', 'var(--text-3)'];

  /* =========================================================
     1. RENDA FIXA: comparador lado a lado, líquido de IR/IOF/custódia
     ========================================================= */
  const IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
  const iofPct = (dc) => dc >= 30 ? 0 : IOF[Math.max(1, Math.floor(dc)) - 1] / 100;
  const irPct = (dc) => dc <= 180 ? 0.225 : dc <= 360 ? 0.20 : dc <= 720 ? 0.175 : 0.15;
  const TIPOS = [['pos', 'Pós (% do CDI)'], ['pre', 'Prefixado'], ['ipca', 'IPCA +'], ['tselic', 'Tesouro Selic'], ['poup', 'Poupança']];
  function rfMarket() {
    const cdi = ok(V('rf.cdi')) ? V('rf.cdi') / 100 : M.cdi;
    const ipca = ok(V('rf.ipca')) ? V('rf.ipca') / 100 : M.ipca;
    const selic = ok(V('rf.selic')) ? V('rf.selic') / 100 : M.selic;
    const cust = ok(V('rf.cust')) ? V('rf.cust') / 100 : 0;
    return { cdi, ipca, selic, cust };
  }
  const rfDays = () => { const p = V('rf.prazo'), u = S.rf.unid; return !ok(p) || p <= 0 ? NaN : Math.round(u === 'dias' ? p : u === 'meses' ? p * 30.4375 : p * 365.25); };
  // devolve o resultado de uma linha para P reais em dc dias corridos
  function rfLine(l, P, dc, mk) {
    const du = dc * 252 / 365, t = numBR(l.taxa) / 100;
    let f = NaN, need = '';
    if (l.tipo === 'pos') { if (!ok(mk.cdi)) need = 'CDI'; else if (ok(t)) f = (1 + ((1 + mk.cdi) ** (1 / 252) - 1) * t) ** du; }
    else if (l.tipo === 'pre') { if (ok(t)) f = (1 + t) ** (du / 252); }
    else if (l.tipo === 'ipca') { if (!ok(mk.ipca)) need = 'IPCA'; else if (ok(t)) f = ((1 + mk.ipca) * (1 + t)) ** (du / 252); }
    else if (l.tipo === 'tselic') { if (!ok(mk.cdi)) need = 'CDI'; else f = ((1 + mk.cdi) * (1 + (ok(t) ? t : 0))) ** (du / 252); }
    else if (l.tipo === 'poup') {
      if (!ok(mk.selic)) need = 'Selic';
      else { const m = mk.selic > 0.085 ? 0.005 : (1 + mk.selic * 0.7) ** (1 / 12) - 1; f = (1 + m) ** Math.floor(dc / 30.4375 + 0.05); }
    }
    if (!ok(f)) return { need };
    const taxed = !(l.isento || l.tipo === 'poup');
    const bruto = P * (f - 1);
    const iof = taxed ? Math.max(0, bruto) * iofPct(dc) : 0;
    const ir = taxed ? Math.max(0, bruto - iof) * irPct(dc) : 0;
    const custo = (l.tipo === 'tselic' || l.tes) ? P * f * (1 - (1 - mk.cust) ** (dc / 365)) : 0;
    const liq = P + bruto - iof - ir - custo;
    const aa = (liq / P) ** (365 / dc) - 1;
    const cdiD = ok(mk.cdi) ? (1 + mk.cdi) ** (1 / 252) - 1 : NaN;
    const pctCdiLiq = ok(cdiD) ? ((liq / P) ** (1 / du) - 1) / cdiD : NaN;
    // se é isento, quanto um CDB tributado precisaria pagar para empatar (só faz sentido com CDI)
    let grossUp = NaN;
    if (!taxed && ok(cdiD) && dc >= 30) { const need2 = (liq - P) / (1 - irPct(dc)); grossUp = ((1 + need2 / P) ** (1 / du) - 1) / cdiD; }
    return { f, bruto, iof, ir, custo, liq, aa, pctCdiLiq, grossUp, taxed, aliq: taxed ? irPct(dc) : 0 };
  }
  const tipoLabel = (l) => {
    const t = numBR(l.taxa);
    if (l.tipo === 'pos') return `${ok(t) ? nf(t, t % 1 ? 1 : 0) : '—'}% do CDI`;
    if (l.tipo === 'pre') return `${ok(t) ? nf(t) : '—'}% a.a.`;
    if (l.tipo === 'ipca') return `IPCA + ${ok(t) ? nf(t) : '—'}%`;
    if (l.tipo === 'tselic') return `Selic + ${ok(t) ? nf(t, 4).replace(/0+$/, '').replace(/,$/, ',0') : '0'}%`;
    return 'regra da poupança';
  };
  function viewRF() {
    const mk = rfMarket();
    const tes = M.tesouro;
    const chips = tes ? tes.filter((t) => !/renda\+|educa\+/i.test(t.nome)).slice(0, 14).map((t, i) => `<button type="button" class="cl-chip" data-tes="${i}" title="Adicionar ao comparador">${esc(t.nome.replace(/^Tesouro\s*/i, ''))}<b>${/selic/i.test(t.nome) ? '+' + nf(t.taxa, 4).replace(/0+$/, '') : nf(t.taxa)}%</b></button>`).join('')
      : M.tesErr ? `<span class="cl-mut">Taxas do Tesouro indisponíveis agora (${esc(M.tesErr)}).</span>` : '<span class="cl-mut">buscando taxas do Tesouro Direto…</span>';
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Quanto e por quanto tempo</h3></div>
        <div class="cl-fields">
          ${fld('rf.valor', 'Valor aplicado', { pre: 'R$', rng: [1000, 1000000, 1000] })}
          <div class="cl-f"><span>Prazo</span><div class="cl-inp"><input data-k="rf.prazo" value="${esc(S.rf.prazo)}" inputmode="decimal" autocomplete="off"><select data-k="rf.unid" class="cl-unit">${['dias', 'meses', 'anos'].map((u) => `<option ${S.rf.unid === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
            <div class="cl-quick">${[['6', 'meses', '6m'], ['1', 'anos', '1a'], ['2', 'anos', '2a'], ['3', 'anos', '3a'], ['5', 'anos', '5a']].map(([p, u, l]) => `<button type="button" data-prazo="${p}|${u}" class="${S.rf.prazo === p && S.rf.unid === u ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        </div>
        <div class="cl-h cl-h2"><h3>Cenário</h3><span>vazio = dado oficial mais recente</span></div>
        <div class="cl-fields cl-f4">
          ${fld('rf.cdi', 'CDI', { suf: '% a.a.', ph: ok(M.cdi) ? fmtIn(M.cdi * 100) : '—', tip: `CDI anualizado (${M.cdiSrc || 'buscando…'})` })}
          ${fld('rf.selic', 'Selic meta', { suf: '% a.a.', ph: ok(M.selic) ? fmtIn(M.selic * 100) : '—', tip: `Selic meta do Copom (${M.selicSrc || 'buscando…'}). Define a regra da poupança.` })}
          ${fld('rf.ipca', 'IPCA projetado', { suf: '% a.a.', ph: ok(M.ipca) ? fmtIn(M.ipca * 100) : '—', tip: `Vazio usa o ${M.ipcaSrc || 'IPCA 12 meses'}. Coloque sua projeção para o prazo.` })}
          ${fld('rf.cust', 'Custódia Tesouro', { suf: '% a.a.', tip: 'Taxa da B3 sobre títulos do Tesouro Direto. Ajuste ou zere se não se aplicar.' })}
        </div>
        <div class="cl-h cl-h2"><h3>Tesouro Direto hoje</h3><span>clique para comparar</span></div>
        <div class="cl-chips">${chips}</div>
      </section>
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Investimentos comparados</h3><span class="sp"></span>${S.rf.lines.length < 8 ? '<button type="button" class="btn-sm" data-act="rf-add"><i class="fas fa-plus"></i> Adicionar</button>' : ''}</div>
        <div class="cl-lines">${S.rf.lines.map((l, i) => `
          <div class="cl-line" style="--lc:${PAL[i % PAL.length]}">
            <i class="cl-dot"></i>
            <input class="cl-name" data-l="${l.id}" data-lk="nome" value="${esc(l.nome)}" aria-label="Nome">
            <select data-l="${l.id}" data-lk="tipo" aria-label="Tipo">${TIPOS.map(([v, t]) => `<option value="${v}" ${l.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
            ${l.tipo === 'poup' ? '<span class="cl-mut cl-lrate" title="Com Selic acima de 8,5%: 0,5% ao mês + TR. Abaixo: 70% da Selic + TR. A TR não entra na conta.">0,5% a.m. ou 70% da Selic (sem TR)</span>' : `<div class="cl-inp cl-lrate">${l.tipo === 'ipca' ? '<em>IPCA +</em>' : l.tipo === 'tselic' ? '<em>Selic +</em>' : ''}<input data-l="${l.id}" data-lk="taxa" value="${esc(l.taxa)}" inputmode="decimal" aria-label="Taxa"><em>${l.tipo === 'pos' ? '% CDI' : '% a.a.'}</em></div>`}
            ${l.tipo === 'poup' || l.tipo === 'tselic' ? '<span></span>' : `<label class="cl-chk" title="LCI, LCA, CRI, CRA e debêntures incentivadas são isentas de IR para pessoa física"><input type="checkbox" data-l="${l.id}" data-lk="isento" ${l.isento ? 'checked' : ''}> isento</label>`}
            <button type="button" class="cl-x" data-rm="${l.id}" aria-label="Remover"><i class="fas fa-times"></i></button>
          </div>`).join('')}</div>
      </section>
    </div>
    <div id="cl-out"></div>`;
  }
  function calcRF() {
    const out = $c('#cl-out'); if (!out) return;
    const P = V('rf.valor'), dc = rfDays(), mk = rfMarket();
    if (!(P > 0) || !(dc > 0)) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Informe o valor e o prazo.</div></section>'; return; }
    const rows = S.rf.lines.map((l, i) => ({ l, i, r: rfLine(l, P, dc, mk) }));
    const okRows = rows.filter((x) => ok(x.r.liq)).sort((a, b) => b.r.liq - a.r.liq);
    const best = okRows[0], worst = okRows[okRows.length - 1];
    const maxG = Math.max(1, ...okRows.map((x) => x.r.liq - P));
    const prazoTxt = S.rf.unid === 'dias' ? `${dc} dias` : `${S.rf.prazo} ${S.rf.unid}`;
    const ranking = rows.slice().sort((a, b) => (b.r.liq ?? -1) - (a.r.liq ?? -1)).map((x) => {
      const r = x.r, c = PAL[x.i % PAL.length];
      if (!ok(r.liq)) return `<div class="cl-rank na" style="--lc:${c}"><div class="cl-rank-h"><i class="cl-dot"></i><b>${esc(x.l.nome || 'Sem nome')}</b><span>${esc(tipoLabel(x.l))}</span></div><div class="cl-mut">${r.need ? `Sem ${r.need} oficial agora: digite no cenário.` : 'Informe a taxa.'}</div></div>`;
      const ganho = r.liq - P, w = clamp(ganho / maxG * 100, 2, 100);
      return `<div class="cl-rank ${x === best ? 'win' : ''}" style="--lc:${c}">
        <div class="cl-rank-h"><i class="cl-dot"></i><b>${esc(x.l.nome || 'Sem nome')}</b><span>${esc(tipoLabel(x.l))}${r.taxed ? '' : ' · isento'}</span>${x === best && okRows.length > 1 ? '<em class="cl-badge">melhor</em>' : ''}<span class="sp"></span><strong>${brl(r.liq)}</strong></div>
        <div class="cl-bar"><i style="width:${w}%"></i></div>
        <div class="cl-rank-d"><span>Bruto <b>${sbrl(r.bruto)}</b></span>${r.iof > 0.004 ? `<span>IOF <b>${brl(r.iof)}</b></span>` : ''}<span>IR ${r.taxed ? `(${nf(r.aliq * 100, 1)}%)` : ''} <b>${r.taxed ? brl(r.ir) : 'isento'}</b></span>${r.custo > 0.004 ? `<span>Custódia <b>${brl(r.custo)}</b></span>` : ''}<span>Líquido <b class="pos">${sbrl(ganho)}</b></span><span>${pct(r.aa)} a.a. líq.</span>${ok(r.pctCdiLiq) ? `<span>${nf(r.pctCdiLiq * 100, 1)}% do CDI líq.</span>` : ''}</div>
      </div>`;
    }).join('');
    const ins = [];
    if (best && worst && best !== worst) ins.push(`Em ${prazoTxt}, <b>${esc(best.l.nome)}</b> entrega <b>${brl(best.r.liq - worst.r.liq)}</b> a mais que <b>${esc(worst.l.nome)}</b>.`);
    okRows.filter((x) => !x.r.taxed && ok(x.r.grossUp)).slice(0, 2).forEach((x) => ins.push(`<b>${esc(x.l.nome)}</b> (isento) equivale a um CDB de <b>${nf(x.r.grossUp * 100, 1)}% do CDI</b> nesse prazo.`));
    if (dc < 30) ins.push('Resgate antes de 30 dias paga IOF regressivo sobre o rendimento (já descontado acima).');
    else ins.push(`Prazo de ${dc} dias: IR de ${nf(irPct(dc) * 100, 1)}% sobre o rendimento dos tributados${dc <= 720 ? `; a alíquota cai para ${nf(irPct(dc <= 180 ? 181 : dc <= 360 ? 361 : 721) * 100, 1)}% depois de ${dc <= 180 ? 180 : dc <= 360 ? 360 : 720} dias` : ', a menor da tabela'}.`);
    if (ok(mk.ipca) && best) { const real = (1 + best.r.aa) / (1 + mk.ipca) - 1; ins.push(`Descontando IPCA de ${pct(mk.ipca)} a.a., o ganho real do melhor fica em <b>${pct(real)} a.a.</b>`); }
    out.innerHTML = `
      <div class="cl-grid2 cl-gridw">
        <section class="ana-card cl-card"><div class="cl-h"><h3>Resultado líquido</h3><span>${brl(P)} por ${esc(prazoTxt)}</span><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>${ranking}${insight(ins)}</section>
        <section class="ana-card cl-card"><div class="cl-h"><h3>Evolução do valor líquido</h3><span>se resgatasse em cada data</span></div><div id="cl-ch"></div></section>
      </div>`;
    // curva: valor líquido se resgatado em cada ponto (IR/IOF da época)
    const N = clamp(Math.round(dc / 15), 8, 60), xs = [], xl = [];
    for (let k = 1; k <= N; k++) { const d = Math.round(dc * k / N); xs.push(d); }
    const lab = (d) => d < 365 ? `${Math.round(d / 30.4)}m` : `${nf(d / 365.25, d % 365 ? 1 : 0)}a`;
    xs.forEach((d) => xl.push(lab(d)));
    lineChart($c('#cl-ch'), {
      x: xl, xl: (i) => `${xs[i]} dias`, zero: false,
      series: rows.map((x) => ({ n: x.l.nome || 'Sem nome', c: PAL[x.i % PAL.length], d: xs.map((d) => rfLine(x.l, P, d, mk).liq) })).filter((s) => s.d.some(ok)),
      hline: { v: P, t: 'valor aplicado' }
    });
    S.lastTxt = `Comparação de renda fixa: ${brl(P)} por ${prazoTxt}\n` + okRows.map((x, k) => `${k + 1}. ${x.l.nome} (${tipoLabel(x.l)}${x.r.taxed ? '' : ', isento'}): ${brl(x.r.liq)} líquido (${sbrl(x.r.liq - P)}; ${pct(x.r.aa)} a.a.)`).join('\n') +
      `\nCenário: CDI ${pct(mk.cdi)}, Selic ${pct(mk.selic)}, IPCA ${pct(mk.ipca)} a.a. Simulação; rentabilidade passada ou projetada não é garantia.`;
  }

  /* =========================================================
     2. JUROS COMPOSTOS: projeção ou meta (quanto aportar / quanto tempo)
     ========================================================= */
  function jcSim(ini, aporte, im, meses, cresc) {
    let b = ini, ap = ini, a = aporte, virada = -1;
    const tot = [b], inv = [ap];
    for (let m = 1; m <= meses; m++) {
      const j = b * im;
      if (virada < 0 && a > 0 && j >= a) virada = m;
      b = b + j + a; ap += a;
      if (m % 12 === 0 && cresc) a *= 1 + cresc;
      tot.push(b); inv.push(ap);
    }
    return { b, ap, tot, inv, virada };
  }
  const jcRate = () => { const t = V('jc.taxa') / 100; return !ok(t) ? NaN : S.jc.base === 'am' ? t : (1 + t) ** (1 / 12) - 1; };
  function viewJC() {
    const meta = S.jc.modo === 'meta';
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Juros compostos</h3><span class="sp"></span>${seg('jc.modo', [['proj', 'Projetar'], ['meta', 'Chegar numa meta']])}</div>
        <div class="cl-fields">
          ${meta ? fld('jc.meta', 'Quero juntar', { pre: 'R$', rng: [10000, 5000000, 10000] }) : ''}
          ${fld('jc.ini', 'Valor inicial', { pre: 'R$', rng: [0, 500000, 1000] })}
          ${fld('jc.aporte', meta ? 'Aporte mensal (para a conta do tempo)' : 'Aporte mensal', { pre: 'R$', rng: [0, 20000, 100] })}
          <div class="cl-f"><span>Taxa de juros</span><div class="cl-inp"><input data-k="jc.taxa" value="${esc(S.jc.taxa)}" inputmode="decimal" autocomplete="off"><select data-k="jc.base" class="cl-unit"><option value="aa" ${S.jc.base === 'aa' ? 'selected' : ''}>% a.a.</option><option value="am" ${S.jc.base === 'am' ? 'selected' : ''}>% a.m.</option></select></div>
            <input type="range" class="cl-rng" data-r="jc.taxa" min="0" max="${S.jc.base === 'am' ? 3 : 30}" step="${S.jc.base === 'am' ? 0.05 : 0.25}" data-d="2" value="${clamp(V('jc.taxa') || 0, 0, S.jc.base === 'am' ? 3 : 30)}"></div>
          ${fld('jc.anos', meta ? 'Em quantos anos' : 'Período', { suf: 'anos', rng: [1, 50, 1] })}
          ${fld('jc.cresc', 'Aumentar o aporte todo ano', { suf: '% a.a.', tip: 'Ex.: reajuste o aporte pela inflação ou pelo seu aumento salarial' })}
          ${fld('jc.infl', 'Inflação média (opcional)', { suf: '% a.a.', ph: ok(M.ipca) ? 'ex.: ' + fmtIn(M.ipca * 100, 1) : '', tip: 'Mostra o resultado em dinheiro de hoje' })}
        </div>
      </section>
      <div id="cl-out" class="cl-col"></div>
    </div>`;
  }
  function calcJC() {
    const out = $c('#cl-out'); if (!out) return;
    const ini = V('jc.ini') || 0, aporte = V('jc.aporte') || 0, im = jcRate(), anos = V('jc.anos'), cresc = (V('jc.cresc') || 0) / 100, infl = V('jc.infl') / 100;
    if (!ok(im) || !(anos > 0)) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Informe a taxa e o período.</div></section>'; return; }
    const meses = Math.round(anos * 12);
    const meta = S.jc.modo === 'meta', alvo = V('jc.meta');
    let r = jcSim(ini, aporte, im, meses, cresc), extra = '';
    const ins = [];
    if (meta && alvo > 0) {
      // aporte necessário (busca binária) e tempo necessário com o aporte atual
      let lo = 0, hi = Math.max(alvo, 1);
      if (jcSim(ini, 0, im, meses, cresc).b >= alvo) hi = 0;
      for (let k = 0; k < 60 && hi > 0; k++) { const mid = (lo + hi) / 2; if (jcSim(ini, mid, im, meses, cresc).b >= alvo) hi = mid; else lo = mid; }
      const apNec = hi;
      let mT = -1; { let b = ini, a = aporte; for (let m = 1; m <= 1200; m++) { b = b * (1 + im) + a; if (m % 12 === 0 && cresc) a *= 1 + cresc; if (b >= alvo) { mT = m; break; } } }
      if (ini >= alvo) mT = 0;
      r = jcSim(ini, apNec, im, meses, cresc);
      extra = `<section class="ana-card cl-card cl-hero">
        <div class="cl-kpis">
          ${kpi(`Aporte para ter ${short(alvo)} em ${nf(anos, 0)} anos`, apNec <= 0 ? 'nenhum' : brl(apNec) + '/mês', { big: true, cls: 'acc', sub: apNec <= 0 ? 'o valor inicial já chega lá sozinho' : cresc ? `começando assim e subindo ${nf(cresc * 100, 1)}% ao ano` : 'todo mês, sem falhar' })}
          ${kpi(`Com ${brl(aporte)}/mês você chega em`, mT < 0 ? 'mais de 100 anos' : mT === 0 ? 'já chegou' : `${Math.floor(mT / 12)} anos${mT % 12 ? ` e ${mT % 12} meses` : ''}`, { big: true })}
        </div></section>`;
      S.lastTxt = `Meta: ${brl(alvo)} em ${nf(anos, 0)} anos a ${nf(V('jc.taxa'))}% ${S.jc.base === 'am' ? 'a.m.' : 'a.a.'}, começando com ${brl(ini)}.\nAporte necessário: ${apNec <= 0 ? 'nenhum' : brl(apNec) + ' por mês'}.\nCom ${brl(aporte)}/mês: ${mT < 0 ? 'mais de 100 anos' : `${Math.floor(mT / 12)} anos e ${mT % 12} meses`}.`;
    }
    const juros = r.b - r.ap, real = ok(infl) && infl > -1 ? r.b / (1 + infl) ** anos : NaN;
    const dobra = im > 0 ? Math.log(2) / Math.log(1 + im) / 12 : NaN;
    if (r.virada > 0) ins.push(`Ponto de virada no <b>${Math.ceil(r.virada / 12)}º ano</b>: a partir daí os juros de um mês passam a render mais que o próprio aporte.`);
    if (ok(dobra)) ins.push(`Nessa taxa o dinheiro dobra a cada <b>${nf(dobra, 1)} anos</b>.`);
    if (meses > 60) { const tarde = jcSim(ini, meta ? r.inv[1] - r.inv[0] : aporte, im, meses - 60, cresc).b; ins.push(`Começar 5 anos depois (mesma data final) deixaria <b>${short(r.b - tarde)}</b> na mesa (${nf((1 - tarde / r.b) * 100, 0)}% a menos).`); }
    if (ok(real)) ins.push(`Em dinheiro de hoje (inflação de ${nf(infl * 100, 1)}% a.a.), o total vale <b>${brl(real)}</b>.`);
    const xs = [], tot = [], inv = [];
    const stepM = meses > 240 ? 12 : meses > 60 ? 6 : 1;
    for (let m = 0; m <= meses; m += stepM) { xs.push(m); tot.push(r.tot[m]); inv.push(r.inv[m]); }
    if (xs[xs.length - 1] !== meses) { xs.push(meses); tot.push(r.tot[meses]); inv.push(r.inv[meses]); }
    out.innerHTML = `${extra}
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>${meta ? 'Com o aporte necessário' : 'Resultado'}</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
        <div class="cl-kpis">
          ${kpi('Valor final', brl(r.b), { big: true, cls: 'acc', sub: ok(real) ? `${brl(real)} em dinheiro de hoje` : `em ${nf(anos, anos % 1 ? 1 : 0)} anos` })}
          ${kpi('Você colocou', brl(r.ap))}
          ${kpi('Os juros fizeram', brl(juros), { cls: 'pos', sub: r.b > 0 ? `${nf(juros / r.b * 100, 0)}% do total` : '' })}
          ${kpi('Renda mensal dos juros no fim', brl(r.b * im), { sub: 'sem mexer no principal' })}
        </div>
        <div class="cl-split"><i style="width:${r.b > 0 ? clamp(r.ap / r.b * 100, 0, 100) : 0}%"></i><span>aportes ${r.b > 0 ? nf(r.ap / r.b * 100, 0) : 0}%</span><span>juros ${r.b > 0 ? nf(juros / r.b * 100, 0) : 0}%</span></div>
        <div id="cl-ch"></div>
        ${insight(ins)}
      </section>`;
    lineChart($c('#cl-ch'), {
      x: xs.map((m) => m % 12 === 0 ? `${m / 12}a` : `${nf(m / 12, 1)}a`), xl: (i) => `Mês ${xs[i]} (ano ${nf(xs[i] / 12, 1)})`,
      series: [{ n: 'Total acumulado', c: 'var(--accent)', d: tot, area: true }, { n: 'Dinheiro colocado', c: 'var(--info)', d: inv, area: true, op: 0.1 }],
      marks: r.virada > 0 ? [{ i: xs.findIndex((m) => m >= r.virada), t: 'juros > aporte' }] : []
    });
    if (!meta) S.lastTxt = `Juros compostos: ${brl(ini)} iniciais + ${brl(aporte)}/mês a ${nf(V('jc.taxa'))}% ${S.jc.base === 'am' ? 'a.m.' : 'a.a.'} por ${nf(anos, 0)} anos.\nValor final: ${brl(r.b)} (aportes ${brl(r.ap)}, juros ${brl(juros)}).${ok(real) ? `\nEm dinheiro de hoje: ${brl(real)}.` : ''}`;
  }

  /* =========================================================
     3. LIBERDADE FINANCEIRA (aposentadoria)
     ========================================================= */
  function apCore(o) {
    const rm = (1 + o.real) ** (1 / 12) - 1, m = Math.max(0, Math.round((o.alvo - o.idade) * 12));
    const np = Math.round(o.anosRec * 12);
    const fv = (aporte) => { let b = o.pat; for (let k = 0; k < m; k++) b = b * (1 + rm) + aporte; return b; };
    const W = fv(o.aporte);
    const need = o.modo === 'perp' ? (rm > 0 ? o.renda / rm : Infinity) : (rm !== 0 ? o.renda * (1 - (1 + rm) ** -np) / rm : o.renda * np);
    // idade em que o patrimônio alcança o número (continuando a aportar)
    let liv = -1; { let b = o.pat; for (let k = 0; k <= 1200; k++) { if (b >= need) { liv = k; break; } b = b * (1 + rm) + o.aporte; } }
    // aporte necessário para ter "need" na idade alvo
    let apNec = NaN;
    if (isFinite(need) && m > 0) { const g = (1 + rm) ** m; apNec = rm !== 0 ? (need - o.pat * g) * rm / (g - 1) : (need - o.pat) / m; apNec = Math.max(0, apNec); }
    const rendaPerp = W * rm, rendaCons = rm !== 0 ? W * rm / (1 - (1 + rm) ** -np) : W / np;
    // trajetória até os 100 anos: aporta até a idade alvo, depois saca a renda desejada
    const path = [], ages = []; let b = o.pat, acaba = -1;
    const tot = Math.max(m + 12, Math.round((100 - o.idade) * 12));
    for (let k = 0; k <= tot; k++) {
      if (k % 12 === 0) { path.push(Math.max(0, b)); ages.push(o.idade + k / 12); }
      if (k < m) b = b * (1 + rm) + o.aporte; else { b = b * (1 + rm) - o.renda; if (b <= 0 && acaba < 0) { acaba = o.idade + (k + 1) / 12; b = 0; } }
    }
    return { rm, m, W, need, liv, apNec, rendaPerp, rendaCons, path, ages, acaba };
  }
  function viewAP() {
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Liberdade financeira</h3><span>tudo em dinheiro de hoje</span></div>
        <div class="cl-fields">
          ${fld('ap.idade', 'Idade atual', { suf: 'anos', rng: [16, 80, 1] })}
          ${fld('ap.alvo', 'Quero parar com', { suf: 'anos', rng: [30, 90, 1] })}
          ${fld('ap.pat', 'Patrimônio hoje', { pre: 'R$', rng: [0, 2000000, 5000] })}
          ${fld('ap.aporte', 'Aporte mensal', { pre: 'R$', rng: [0, 30000, 100] })}
          ${fld('ap.taxa', 'Rentabilidade', { suf: '% a.a.', rng: [0, 20, 0.25, 2] })}
          ${fld('ap.infl', 'Inflação', { suf: '% a.a.', ph: ok(M.ipca) ? fmtIn(M.ipca * 100, 1) : '', tip: 'Usada para tirar o efeito da inflação: os valores ficam em poder de compra de hoje' })}
          ${fld('ap.renda', 'Renda mensal desejada', { pre: 'R$', rng: [1000, 100000, 500] })}
          <div class="cl-f"><span>Depois de parar</span>${seg('ap.modo', [['perp', 'Viver só dos juros'], ['cons', 'Consumir o patrimônio']])}</div>
          ${S.ap.modo === 'cons' ? fld('ap.anosRec', 'Por quantos anos', { suf: 'anos', rng: [5, 50, 1] }) : ''}
        </div>
      </section>
      <div id="cl-out" class="cl-col"></div>
    </div>`;
  }
  function calcAP() {
    const out = $c('#cl-out'); if (!out) return;
    const o = { idade: V('ap.idade'), alvo: V('ap.alvo'), pat: V('ap.pat') || 0, aporte: V('ap.aporte') || 0, renda: V('ap.renda'), modo: S.ap.modo, anosRec: V('ap.anosRec') || 25 };
    const tx = V('ap.taxa') / 100, inf = ok(V('ap.infl')) ? V('ap.infl') / 100 : 0;
    if (!ok(o.idade) || !ok(o.alvo) || !ok(tx) || !(o.renda > 0)) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Preencha idade, rentabilidade e a renda desejada.</div></section>'; return; }
    if (o.alvo <= o.idade) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">A idade para parar precisa ser maior que a idade atual.</div></section>'; return; }
    o.real = (1 + tx) / (1 + inf) - 1;
    const r = apCore(o);
    const idadeLiv = r.liv >= 0 ? o.idade + r.liv / 12 : NaN;
    const falta = r.need - r.W;
    const prog = isFinite(r.need) ? clamp(o.pat / r.need, 0, 1) : 0;
    const sens = [];
    const alt = (d) => { const x = apCore({ ...o, ...d }); return x.liv >= 0 ? o.idade + x.liv / 12 : NaN; };
    if (ok(idadeLiv)) {
      const a1 = alt({ aporte: o.aporte + 500 }), a2 = alt({ real: (1 + tx + 0.01) / (1 + inf) - 1 }), a3 = alt({ renda: o.renda * 0.8 });
      if (ok(a1)) sens.push(['+R$ 500 por mês', idadeLiv - a1]);
      if (ok(a2)) sens.push(['+1 ponto de rentabilidade', idadeLiv - a2]);
      if (ok(a3)) sens.push(['20% menos de renda', idadeLiv - a3]);
    }
    const ins = [];
    ins.push(`Rentabilidade real (acima da inflação): <b>${pct(o.real)} a.a.</b>${o.real <= 0 ? ' Com juro real zero ou negativo, só viver dos juros não funciona.' : ''}`);
    if (o.modo === 'perp' && isFinite(r.need)) ins.push(`Seu número da liberdade é <b>${brl(r.need, 0)}</b>: com ele, ${brl(o.renda, 0)}/mês saem só dos juros reais, sem nunca acabar.`);
    if (r.acaba > 0) ins.push(`Sacando ${brl(o.renda, 0)}/mês a partir dos ${nf(o.alvo, 0)} anos, o dinheiro <b>acaba aos ${nf(r.acaba, 0)} anos</b>.`);
    else ins.push(`Sacando ${brl(o.renda, 0)}/mês a partir dos ${nf(o.alvo, 0)} anos, o dinheiro <b>dura além dos 100 anos</b>.`);
    out.innerHTML = `
      <section class="ana-card cl-card cl-hero">
        <div class="cl-kpis">
          ${kpi('Você fica livre aos', ok(idadeLiv) ? `${Math.floor(idadeLiv)} anos${Math.round((idadeLiv % 1) * 12) ? ` e ${Math.round((idadeLiv % 1) * 12)} meses` : ''}` : 'não chega lá', { big: true, cls: ok(idadeLiv) && idadeLiv <= o.alvo ? 'pos' : 'acc', sub: ok(idadeLiv) ? (idadeLiv <= o.alvo ? `${nf(o.alvo - idadeLiv, 1)} anos antes do plano` : `${nf(idadeLiv - o.alvo, 1)} anos depois do plano`) : 'com esse aporte e essa taxa' })}
          ${kpi(`Aporte para parar aos ${nf(o.alvo, 0)}`, ok(r.apNec) ? brl(r.apNec, 0) + '/mês' : '—', { big: true, sub: ok(r.apNec) ? (r.apNec <= o.aporte ? 'você já aporta o suficiente' : `faltam ${brl(r.apNec - o.aporte, 0)}/mês`) : '' })}
        </div>
        <div class="cl-prog"><div><span>Caminho até o número</span><b>${nf(prog * 100, 1)}%</b></div><i><b style="width:${prog * 100}%"></b></i><div><span>${brl(o.pat, 0)} hoje</span><span>${isFinite(r.need) ? brl(r.need, 0) : '—'}</span></div></div>
      </section>
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Aos ${nf(o.alvo, 0)} anos</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
        <div class="cl-kpis">
          ${kpi('Patrimônio', brl(r.W, 0), { cls: 'acc' })}
          ${kpi('Renda vivendo dos juros', brl(r.rendaPerp, 0) + '/mês')}
          ${kpi(`Renda consumindo em ${nf(o.anosRec, 0)} anos`, brl(r.rendaCons, 0) + '/mês')}
          ${kpi(falta > 0 ? 'Falta para o número' : 'Sobra sobre o número', brl(Math.abs(falta), 0), { cls: falta > 0 ? 'neg' : 'pos' })}
        </div>
        <div id="cl-ch"></div>
        ${sens.length ? `<div class="cl-sens"><span>O que adianta sua liberdade</span>${sens.map(([t, d]) => `<div><b>${esc(t)}</b><em class="${d > 0.05 ? 'pos' : ''}">${d > 0.05 ? `${nf(d, 1)} anos antes` : 'quase nada'}</em></div>`).join('')}</div>` : ''}
        ${insight(ins)}
      </section>`;
    lineChart($c('#cl-ch'), {
      x: r.ages.map((a) => String(Math.round(a))), xl: (i) => `${Math.round(r.ages[i])} anos`,
      series: [{ n: 'Patrimônio (dinheiro de hoje)', c: 'var(--accent)', d: r.path, area: true }],
      marks: [{ i: r.ages.findIndex((a) => a >= o.alvo), t: `para aos ${nf(o.alvo, 0)}` }].concat(r.acaba > 0 ? [{ i: r.ages.findIndex((a) => a >= r.acaba), t: 'acaba' }] : []),
      hline: isFinite(r.need) && o.modo === 'perp' ? { v: r.need, t: 'número da liberdade' } : null
    });
    S.lastTxt = `Liberdade financeira (valores de hoje, juro real ${pct(o.real)} a.a.)\nHoje: ${o.idade} anos, ${brl(o.pat, 0)} e ${brl(o.aporte, 0)}/mês. Meta: ${brl(o.renda, 0)}/mês a partir dos ${o.alvo}.\n` +
      `Patrimônio aos ${o.alvo}: ${brl(r.W, 0)}. ${ok(idadeLiv) ? `Livre aos ${nf(idadeLiv, 1)} anos.` : 'Não atinge a meta com esses números.'} Aporte necessário para parar aos ${o.alvo}: ${ok(r.apNec) ? brl(r.apNec, 0) + '/mês' : '—'}.`;
  }

  /* =========================================================
     4. FINANCIAMENTO: SAC e PRICE lado a lado, com amortização extra
     ========================================================= */
  function finSim(tipo, P, i, n, extra) {
    let b = P, juros = 0, pago = 0, k = 0;
    const pmt = i > 0 ? P * i / (1 - (1 + i) ** -n) : P / n, A = P / n;
    const rows = [];
    while (b > 0.005 && k < n) {
      k++;
      const j = b * i;
      let am = tipo === 'price' ? pmt - j : A;
      let parc = am + j;
      let ex = Math.min(extra, Math.max(0, b - am));
      if (am > b) { am = b; parc = am + j; ex = 0; }
      b -= am + ex; juros += j; pago += parc + ex;
      rows.push({ k, parc, j, am, ex, b: Math.max(0, b) });
    }
    return { rows, juros, pago, meses: k, p1: rows[0]?.parc, pN: rows[rows.length - 1]?.parc };
  }
  function viewFIN() {
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Financiamento</h3><span>SAC e PRICE ao mesmo tempo</span></div>
        <div class="cl-fields">
          ${fld('fin.imovel', 'Valor do bem', { pre: 'R$', rng: [50000, 3000000, 5000] })}
          ${fld('fin.entrada', 'Entrada', { pre: 'R$', rng: [0, 1500000, 5000] })}
          ${fld('fin.taxa', 'Juros', { suf: '% a.a.', rng: [4, 30, 0.1, 2] })}
          ${fld('fin.anos', 'Prazo', { suf: 'anos', rng: [1, 35, 1] })}
          ${fld('fin.custos', 'Custos à vista (ITBI, cartório, taxas)', { pre: 'R$' })}
          ${fld('fin.extra', 'Amortização extra por mês', { pre: 'R$', rng: [0, 10000, 100], tip: 'Pagamento a mais todo mês, abatendo o prazo' })}
        </div>
      </section>
      <div id="cl-out" class="cl-col"></div>
    </div>`;
  }
  function calcFIN() {
    const out = $c('#cl-out'); if (!out) return;
    const P = (V('fin.imovel') || 0) - (V('fin.entrada') || 0), a = V('fin.taxa') / 100, anos = V('fin.anos'), custos = V('fin.custos') || 0, extra = V('fin.extra') || 0;
    if (!(P > 0) || !ok(a) || !(anos > 0)) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Informe valor, entrada (menor que o valor), juros e prazo.</div></section>'; return; }
    const i = (1 + a) ** (1 / 12) - 1, n = Math.round(anos * 12);
    const sac = finSim('sac', P, i, n, 0), pri = finSim('price', P, i, n, 0);
    const sacX = extra > 0 ? finSim('sac', P, i, n, extra) : null, priX = extra > 0 ? finSim('price', P, i, n, extra) : null;
    const col = (t, r, x, c) => `<div class="cl-fincol" style="--lc:${c}">
      <div class="cl-fin-h"><i class="cl-dot"></i><b>${t}</b>${r.juros <= Math.min(sac.juros, pri.juros) + 1 ? '<em class="cl-badge">menos juros</em>' : ''}</div>
      ${kpi('1ª parcela', brl(r.p1), { big: true })}
      <div class="cl-mini"><span>Última parcela <b>${brl(r.pN)}</b></span><span>Total de juros <b class="neg">${brl(r.juros, 0)}</b></span><span>Total pago <b>${brl(r.pago + custos, 0)}</b></span><span>Renda mínima (30%) <b>${brl(r.p1 / 0.3, 0)}</b></span></div>
      ${x ? `<div class="cl-extra"><i class="fas fa-bolt"></i> Com ${brl(extra, 0)}/mês a mais: termina em <b>${Math.floor(x.meses / 12)}a ${x.meses % 12}m</b> (${n - x.meses} meses antes) e economiza <b class="pos">${brl(r.juros - x.juros, 0)}</b> de juros.</div>` : ''}
    </div>`;
    const tab = S.fin.tab === 'price' ? (priX || pri) : (sacX || sac);
    const anual = [];
    for (let y = 0; y * 12 < tab.rows.length; y++) {
      const rs = tab.rows.slice(y * 12, y * 12 + 12);
      anual.push({ y: y + 1, parc: rs.reduce((s, r) => s + r.parc, 0), j: rs.reduce((s, r) => s + r.j, 0), am: rs.reduce((s, r) => s + r.am + r.ex, 0), b: rs[rs.length - 1].b });
    }
    const ins = [
      `No SAC a parcela começa ${brl(sac.p1 - pri.p1, 0)} mais alta, mas cai todo mês; o total de juros fica ${brl(pri.juros - sac.juros, 0)} menor que no PRICE.`,
      `PRICE vira mais barato que SAC (parcela menor) a partir da parcela <b>${(sac.rows.findIndex((r, k) => r.parc < pri.rows[k]?.parc) + 1) || '—'}</b>.`,
      `Juros efetivos de ${nf(i * 100, 3)}% ao mês. Seguros obrigatórios (MIP e DFI) e TR não entram na conta; peça o CET ao banco.`
    ];
    out.innerHTML = `
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Financiando ${brl(P, 0)} em ${n} meses</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
        <div class="cl-fin">${col('SAC', sac, sacX, 'var(--info)')}${col('PRICE', pri, priX, 'var(--accent)')}</div>
        <div id="cl-ch"></div>
        ${insight(ins)}
      </section>
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Tabela ano a ano</h3>${seg('fin.tab', [['sac', 'SAC'], ['price', 'PRICE']])}${extra > 0 ? '<span>com amortização extra</span>' : ''}</div>
        <div class="cl-tablewrap"><table class="cl-table"><thead><tr><th>Ano</th><th>Parcelas</th><th>Juros</th><th>Amortização</th><th>Saldo devedor</th></tr></thead><tbody>
        ${anual.map((r) => `<tr><td>${r.y}</td><td>${brl(r.parc, 0)}</td><td>${brl(r.j, 0)}</td><td>${brl(r.am, 0)}</td><td>${brl(r.b, 0)}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
    const step = n > 120 ? 6 : 1, xs = [];
    for (let k = 0; k < n; k += step) xs.push(k);
    lineChart($c('#cl-ch'), {
      x: xs.map((k) => `${Math.floor(k / 12) + 1}a`), xl: (j) => `Parcela ${xs[j] + 1}`, zero: false,
      series: [{ n: 'Parcela SAC', c: 'var(--info)', d: xs.map((k) => sac.rows[k]?.parc) }, { n: 'Parcela PRICE', c: 'var(--accent)', d: xs.map((k) => pri.rows[k]?.parc) }]
    });
    S.lastTxt = `Financiamento de ${brl(P, 0)} a ${nf(a * 100)}% a.a. em ${n} meses\nSAC: 1ª ${brl(sac.p1)}, última ${brl(sac.pN)}, juros ${brl(sac.juros, 0)}\nPRICE: parcela ${brl(pri.p1)}, juros ${brl(pri.juros, 0)}` +
      (extra > 0 ? `\nCom ${brl(extra, 0)}/mês extra: SAC termina em ${sacX.meses} meses, PRICE em ${priX.meses} meses.` : '') + '\nNão inclui seguros obrigatórios nem TR.';
  }

  /* =========================================================
     5. PREÇO MÉDIO: compras e vendas, resultado e "quanto comprar para baixar o PM"
     ========================================================= */
  function pmCalc() {
    let q = 0, custo = 0, realiz = 0, vendas = 0;
    const steps = [];
    for (const o of S.pm.ops) {
      const qq = numBR(o.q), p = numBR(o.p), c = numBR(o.c) || 0;
      if (!(qq > 0) || !(p > 0)) continue;
      if (o.t === 'C') { custo += qq * p + c; q += qq; }
      else {
        const pm = q > 0 ? custo / q : 0, vq = Math.min(qq, q);
        realiz += (p - pm) * vq - c; vendas += vq * p;
        custo -= pm * vq; q -= vq;
      }
      steps.push({ t: o.t, p, pm: q > 0 ? custo / q : NaN });
    }
    return { q, custo, pm: q > 0 ? custo / q : NaN, realiz, vendas, steps };
  }
  let pmFetching = false;
  async function pmFetch() {
    const tk = String(S.pm.tk || '').trim().toUpperCase();
    if (!tk || pmFetching) return;
    const ys = /[.^=-]/.test(tk) ? tk : /^[A-Z]{4}\d{1,2}$/.test(tk) ? tk + '.SA' : tk;
    pmFetching = true; const st = $c('#pm-st'); if (st) { st.textContent = `buscando ${ys}…`; st.classList.remove('neg'); }
    try {
      const y = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?interval=1d&range=5d`;
      const j = await getJ(`${PROXY}/?url=${encodeURIComponent(y)}`);
      const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (!isFinite(p)) throw new Error('ativo não encontrado');
      S.pm.atual = fmtIn(p); save();
      const inp = $c('[data-k="pm.atual"]'); if (inp) inp.value = S.pm.atual;
      if (st) st.textContent = `${ys} · Yahoo · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      calc();
    } catch (e) { if (st) { st.textContent = `não foi possível buscar ${ys} (${errMsg(e)}). Digite o preço.`; st.classList.add('neg'); } }
    finally { pmFetching = false; }
  }
  function viewPM() {
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Preço médio</h3><span>compras e vendas na ordem em que aconteceram</span></div>
        <div class="cl-fields">
          <div class="cl-f"><span>Ativo (opcional)</span><div class="cl-inp"><input data-k="pm.tk" value="${esc(S.pm.tk)}" placeholder="PETR4, BOVA11, AAPL…" autocomplete="off" spellcheck="false" style="text-transform:uppercase"><button type="button" class="cl-go" data-act="pm-fetch" title="Buscar preço atual"><i class="fas fa-search"></i></button></div><small id="pm-st" class="cl-mut"></small></div>
          ${fld('pm.atual', 'Preço atual', { pre: 'R$', tip: 'Para calcular o resultado em aberto. Busque pelo código ou digite.' })}
        </div>
        <div class="cl-ops">
          <div class="cl-op cl-op-h"><span>Operação</span><span>Quantidade</span><span>Preço</span><span>Custos</span><span></span></div>
          ${S.pm.ops.map((o) => `<div class="cl-op">
            <button type="button" class="cl-cv ${o.t === 'C' ? 'c' : 'v'}" data-cv="${o.id}">${o.t === 'C' ? 'Compra' : 'Venda'}</button>
            <div class="cl-inp"><input data-o="${o.id}" data-ok="q" value="${esc(o.q)}" inputmode="decimal" placeholder="100" aria-label="Quantidade"></div>
            <div class="cl-inp"><em>R$</em><input data-o="${o.id}" data-ok="p" value="${esc(o.p)}" inputmode="decimal" placeholder="0,00" aria-label="Preço"></div>
            <div class="cl-inp"><em>R$</em><input data-o="${o.id}" data-ok="c" value="${esc(o.c)}" inputmode="decimal" placeholder="0" aria-label="Custos"></div>
            <button type="button" class="cl-x" data-rmop="${o.id}" aria-label="Remover"><i class="fas fa-times"></i></button>
          </div>`).join('')}
        </div>
        <div class="cl-btnrow"><button type="button" class="btn-sm" data-act="pm-add" data-t="C"><i class="fas fa-plus"></i> Compra</button><button type="button" class="btn-sm" data-act="pm-add" data-t="V"><i class="fas fa-minus"></i> Venda</button><button type="button" class="btn-sm" data-act="pm-clear"><i class="fas fa-eraser"></i> Limpar</button></div>
      </section>
      <div id="cl-out" class="cl-col"></div>
    </div>`;
  }
  function calcPM() {
    const out = $c('#cl-out'); if (!out) return;
    const r = pmCalc(), atual = V('pm.atual');
    if (!(r.q > 0) && !r.vendas) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Adicione as operações para ver o preço médio.</div></section>'; return; }
    const mkt = ok(atual) ? r.q * atual : NaN, aberto = mkt - r.custo, abertoP = r.custo > 0 ? aberto / r.custo : NaN;
    const alvo = V('pm.alvoPM'), compra = ok(V('pm.compraA')) ? V('pm.compraA') : atual;
    let goal = '';
    if (r.q > 0) {
      let msg = '<span class="cl-mut">Diga o preço médio que quer ter e o preço da nova compra.</span>';
      if (ok(alvo) && ok(compra)) {
        if (!(compra < alvo && alvo < r.pm)) msg = `<span class="cl-mut">Só dá para baixar o PM para ${brl(alvo)} comprando abaixo disso${ok(r.pm) ? ` e com alvo abaixo do PM atual (${brl(r.pm)})` : ''}.</span>`;
        else { const nq = Math.ceil(r.q * (r.pm - alvo) / (alvo - compra)); msg = `Compre <b>${nf(nq, 0)}</b> a ${brl(compra)} (${brl(nq * compra, 0)}) e o preço médio vai para <b>${brl((r.custo + nq * compra) / (r.q + nq))}</b>.`; }
      }
      goal = `<section class="ana-card cl-card"><div class="cl-h"><h3>Quanto comprar para baixar o preço médio</h3></div>
        <div class="cl-fields">${fld('pm.alvoPM', 'Preço médio desejado', { pre: 'R$' })}${fld('pm.compraA', 'Preço da nova compra', { pre: 'R$', ph: ok(atual) ? fmtIn(atual) : '' })}</div>
        <div class="cl-goal" id="pm-goal">${msg}</div></section>`;
    }
    // régua: compras, vendas, PM e preço atual
    const pts = r.steps.map((s) => s.p).concat([r.pm, atual].filter(ok));
    let ruler = '';
    if (pts.length) {
      let lo = Math.min(...pts), hi = Math.max(...pts); if (hi === lo) { hi *= 1.05; lo *= 0.95; }
      const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
      const X = (v) => ((v - lo) / (hi - lo) * 100).toFixed(2) + '%';
      ruler = `<div class="cl-ruler"><div class="cl-ruler-l"></div>
        ${r.steps.map((s) => `<i class="cl-rp ${s.t === 'C' ? 'c' : 'v'}" style="left:${X(s.p)}" title="${s.t === 'C' ? 'Compra' : 'Venda'} a ${brl(s.p)}"></i>`).join('')}
        ${ok(r.pm) ? `<span class="cl-rm pm" style="left:${X(r.pm)}"><b>PM ${brl(r.pm)}</b></span>` : ''}
        ${ok(atual) ? `<span class="cl-rm at ${atual >= r.pm ? 'pos' : 'neg'}" style="left:${X(atual)}"><b>Atual ${brl(atual)}</b></span>` : ''}
      </div><div class="cl-legend"><span><i style="background:var(--pos)"></i>compras</span><span><i style="background:var(--neg)"></i>vendas</span></div>`;
    }
    out.innerHTML = `
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Sua posição</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
        <div class="cl-kpis">
          ${kpi('Preço médio', ok(r.pm) ? brl(r.pm, r.pm < 1 ? 4 : 2) : '—', { big: true, cls: 'acc', sub: 'custos incluídos' })}
          ${kpi('Quantidade', nf(r.q, r.q % 1 ? 4 : 0))}
          ${kpi('Custo da posição', brl(r.custo))}
          ${kpi('Valor de mercado', brl(mkt))}
          ${kpi('Resultado em aberto', ok(aberto) ? `${sbrl(aberto)}` : '—', { cls: ok(aberto) ? (aberto >= 0 ? 'pos' : 'neg') : '', sub: ok(abertoP) ? spct(abertoP) : 'informe o preço atual' })}
          ${kpi('Resultado realizado', r.vendas ? sbrl(r.realiz) : '—', { cls: r.realiz >= 0 ? 'pos' : 'neg', sub: r.vendas ? `vendas de ${brl(r.vendas, 0)}` : 'sem vendas' })}
        </div>
        ${ruler}
        ${insight([r.vendas ? 'Venda não muda o preço médio; ela realiza lucro ou prejuízo sobre ele.' : '', r.vendas && r.realiz > 0 ? 'Ações no swing trade: vendas de até R$ 20 mil no mês são isentas de IR; acima disso, 15% sobre o lucro (DARF até o último dia útil do mês seguinte).' : ''])}
      </section>${goal}`;
    S.lastTxt = `Posição${S.pm.tk ? ' em ' + S.pm.tk.toUpperCase() : ''}: ${nf(r.q, 0)} unidades, preço médio ${brl(r.pm)}, custo ${brl(r.custo)}.` +
      (ok(aberto) ? `\nPreço atual ${brl(atual)}: resultado em aberto ${sbrl(aberto)} (${spct(abertoP)}).` : '') + (r.vendas ? `\nResultado realizado: ${sbrl(r.realiz)}.` : '');
  }

  /* =========================================================
     6. INFLAÇÃO: correção por IPCA/INPC/IGP-M e comparação com o CDI
     ========================================================= */
  const IDX = { ipca: [433, 'IPCA'], inpc: [188, 'INPC'], igpm: [189, 'IGP-M'] };
  const infCache = new Map();
  let infTok = 0;
  const ym = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };
  const curYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  async function serieMensal(code, ini, fim) {
    const k = `${code}|${ini}|${fim}`;
    if (infCache.has(k)) return infCache.get(k);
    const [y0, m0] = ym(ini), [y1, m1] = ym(fim);
    const u = BCB(code, `?formato=json&dataInicial=01/${String(m0).padStart(2, '0')}/${y0}&dataFinal=01/${String(m1).padStart(2, '0')}/${y1}`);
    const p = getJ(bcbW(u), 20000).catch(() => getJ(u, 20000))
      .then((j) => { if (!Array.isArray(j)) throw new Error('resposta inválida do BCB'); return j.map((o) => ({ d: o.data.slice(3), v: parseFloat(o.valor) / 100 })).filter((o) => isFinite(o.v)); });
    infCache.set(k, p);
    p.catch(() => infCache.delete(k));
    return p;
  }
  function viewINF() {
    const fim = S.inf.fim || curYM();
    const pre = [['1994-07', 'Plano Real'], [`${new Date().getFullYear() - 10}-01`, '10 anos'], [`${new Date().getFullYear() - 5}-01`, '5 anos'], [`${new Date().getFullYear() - 1}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, '12 meses'], ['2020-03', 'Pandemia']];
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Máquina do tempo da inflação</h3></div>
        <div class="cl-fields">
          ${fld('inf.valor', 'Valor', { pre: 'R$' })}
          <div class="cl-f"><span>Índice</span>${seg('inf.idx', Object.entries(IDX).map(([k, v]) => [k, v[1]]))}</div>
          <label class="cl-f"><span>De</span><div class="cl-inp"><input type="month" data-k="inf.ini" value="${esc(S.inf.ini)}" min="1994-07" max="${curYM()}"></div></label>
          <label class="cl-f"><span>Até</span><div class="cl-inp"><input type="month" data-k="inf.fim" value="${esc(fim)}" min="1994-07" max="${curYM()}"></div></label>
        </div>
        <div class="cl-quick cl-quick2">${pre.map(([v, l]) => `<button type="button" data-infini="${v}" class="${S.inf.ini === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="cl-mut cl-note">Fonte: Banco Central (SGS), índice mês a mês, do mês inicial ao último mês divulgado no período. A comparação usa o CDI acumulado de cada mês.</p>
      </section>
      <div id="cl-out" class="cl-col"></div>
    </div>`;
  }
  async function calcINF() {
    const out = $c('#cl-out'); if (!out) return;
    const val = V('inf.valor'), ini = S.inf.ini, fim = S.inf.fim || curYM();
    if (!(val > 0) || !ym(ini) || !ym(fim) || ini > fim) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Informe o valor e um período válido.</div></section>'; return; }
    const tok = ++infTok;
    if (!out.querySelector('.cl-card')) out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Buscando os índices no Banco Central…</div></section>';
    const [code, nome] = IDX[S.inf.idx] || IDX.ipca;
    let idx, cdi;
    try { [idx, cdi] = await Promise.all([serieMensal(code, ini, fim), serieMensal(4391, ini, fim).catch(() => null)]); }
    catch (e) { if (tok === infTok) out.innerHTML = `<section class="ana-card cl-card"><div class="cl-empty">Não foi possível buscar o ${nome} no Banco Central (${esc(errMsg(e))}). Tente de novo em instantes.</div></section>`; return; }
    if (tok !== infTok) return;
    if (!idx.length) { out.innerHTML = `<section class="ana-card cl-card"><div class="cl-empty">O ${nome} ainda não tem dado para esse período.</div></section>`; return; }
    const cdiMap = new Map((cdi || []).map((o) => [o.d, o.v]));
    let f = 1, fc = 1, cdiOk = !!cdi && cdi.length > 0;
    const xs = [], vi = [], vc = [];
    idx.forEach((o) => { f *= 1 + o.v; const c = cdiMap.get(o.d); if (c == null) cdiOk = false; else fc *= 1 + c; xs.push(o.d); vi.push(val * f); vc.push(cdiOk ? val * fc : null); });
    const corr = val * f, acum = f - 1, poder = 1 / f;
    const meses = idx.length, ult = idx[idx.length - 1].d;
    const [ly, lm] = [+ult.slice(3), +ult.slice(0, 2)];
    const ins = [
      `${brl(val)} de ${mesesBR[ym(ini)[1] - 1]}/${ym(ini)[0]} equivalem a <b>${brl(corr)}</b> em ${mesesBR[lm - 1]}/${ly} pelo ${nome}.`,
      `O dinheiro parado perdeu <b>${nf((1 - poder) * 100, 1)}%</b> do poder de compra: R$ 100 de então compram hoje o que custava ${brl(100 * poder)}.`,
      meses > 12 ? `Média de <b>${pct(f ** (12 / meses) - 1)} ao ano</b> em ${nf(meses / 12, 1)} anos.` : '',
      cdiOk ? `No CDI, o mesmo valor teria virado <b>${brl(val * fc)}</b>: ganho real de <b>${spct(fc / f - 1)}</b> acima do ${nome}.` : 'CDI do período indisponível agora; a comparação ficou de fora.'
    ];
    out.innerHTML = `
      <section class="ana-card cl-card cl-hero">
        <div class="cl-kpis">
          ${kpi('Valor corrigido', brl(corr), { big: true, cls: 'acc', sub: `${nome} de ${ini.split('-').reverse().join('/')} a ${ult}` })}
          ${kpi(`${nome} acumulado`, pct(acum), { big: true, sub: `${meses} ${meses === 1 ? 'mês' : 'meses'}` })}
        </div>
      </section>
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Corrigido x aplicado no CDI</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
        <div id="cl-ch"></div>
        ${insight(ins)}
      </section>`;
    const step = Math.max(1, Math.floor(xs.length / 80)), keep = xs.map((_, k) => k).filter((k) => k % step === 0 || k === xs.length - 1);
    lineChart($c('#cl-ch'), {
      x: keep.map((k) => xs[k].slice(3)), xl: (j) => xs[keep[j]], zero: false,
      series: [{ n: `Corrigido pelo ${nome}`, c: 'var(--neg)', d: keep.map((k) => vi[k]) }].concat(cdiOk ? [{ n: 'Aplicado no CDI', c: 'var(--pos)', d: keep.map((k) => vc[k]) }] : []),
      hline: { v: val, t: 'valor original' }
    });
    S.lastTxt = `${brl(val)} de ${ini.split('-').reverse().join('/')} corrigidos pelo ${nome} até ${ult}: ${brl(corr)} (${pct(acum)} no período).` + (cdiOk ? `\nNo CDI teria virado ${brl(val * fc)} (${spct(fc / f - 1)} real).` : '') + '\nFonte: Banco Central (SGS).';
  }

  /* =========================================================
     7. MOEDAS: conversão ao vivo e quadro com todas as moedas
     ========================================================= */
  const MOEDAS = [['brl', 'Real', 'R$'], ['usd', 'Dólar americano', 'US$'], ['eur', 'Euro', '€'], ['gbp', 'Libra', '£'], ['jpy', 'Iene', '¥'], ['chf', 'Franco suíço', 'CHF'], ['cad', 'Dólar canadense', 'C$'], ['aud', 'Dólar australiano', 'A$'], ['cny', 'Yuan', 'CN¥'], ['ars', 'Peso argentino', 'AR$'], ['clp', 'Peso chileno', 'CLP'], ['mxn', 'Peso mexicano', 'MX$'], ['btc', 'Bitcoin', '₿'], ['eth', 'Ethereum', 'Ξ']];
  const mName = (c) => (MOEDAS.find((m) => m[0] === c) || [c, c.toUpperCase()])[1];
  const fxConv = (v, a, b) => (M.fx && M.fx[a] && M.fx[b]) ? v / M.fx[a] * M.fx[b] : NaN;
  const fxFmt = (v, c) => !ok(v) ? '—' : nf(v, c === 'btc' || c === 'eth' ? 8 : Math.abs(v) < 1 ? 4 : 2);
  function viewFX() {
    const opts = (sel) => MOEDAS.map(([c, n]) => `<option value="${c}" ${sel === c ? 'selected' : ''}>${c.toUpperCase()} · ${n}</option>`).join('');
    return `
    <section class="ana-card cl-card cl-fx">
      <div class="cl-fxrow">
        <label class="cl-f"><span>Valor</span><div class="cl-inp cl-inp-xl"><input data-k="fx.valor" value="${esc(S.fx.valor)}" inputmode="decimal" autocomplete="off"></div></label>
        <label class="cl-f"><span>De</span><div class="cl-inp cl-inp-xl"><select data-k="fx.de">${opts(S.fx.de)}</select></div></label>
        <button type="button" class="cl-swap" data-act="fx-swap" title="Inverter" aria-label="Inverter moedas"><i class="fas fa-exchange-alt"></i></button>
        <label class="cl-f"><span>Para</span><div class="cl-inp cl-inp-xl"><select data-k="fx.para">${opts(S.fx.para)}</select></div></label>
      </div>
      <div id="cl-out"></div>
    </section>`;
  }
  function calcFX() {
    const out = $c('#cl-out'); if (!out) return;
    const v = V('fx.valor'), a = S.fx.de, b = S.fx.para;
    if (!M.fx) { out.innerHTML = `<div class="cl-empty">${M.fxErr ? `Cotações indisponíveis agora (${esc(M.fxErr)}).` : 'Buscando cotações…'}</div>`; return; }
    const r = fxConv(v, a, b), unit = fxConv(1, a, b), inv = fxConv(1, b, a);
    out.innerHTML = `
      <div class="cl-fxres"><span>${esc(fxFmt(v, a))} ${a.toUpperCase()} =</span><b>${esc(fxFmt(r, b))} <small>${b.toUpperCase()}</small></b>
        <em>1 ${a.toUpperCase()} = ${esc(fxFmt(unit, b))} ${b.toUpperCase()} · 1 ${b.toUpperCase()} = ${esc(fxFmt(inv, a))} ${a.toUpperCase()}</em></div>
      <div class="cl-h cl-h2"><h3>${esc(fxFmt(v, a))} ${esc(mName(a))} em outras moedas</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
      <div class="cl-board">${MOEDAS.filter(([c]) => c !== a).map(([c, n, s]) => `<button type="button" class="cl-cur ${c === b ? 'on' : ''}" data-para="${c}"><span>${esc(s)}</span><b>${esc(fxFmt(fxConv(v, a, c), c))}</b><em>${esc(n)}</em></button>`).join('')}</div>
      <p class="cl-mut cl-note">Cotação de referência do currency-api${M.fxDate ? ` de ${M.fxDate.split('-').reverse().join('/')}` : ''}, atualizada uma vez por dia. Não inclui IOF nem spread de banco ou casa de câmbio (IOF de 3,5% em cartão e compra de moeda em espécie de 1,1%).</p>`;
    S.lastTxt = `${fxFmt(v, a)} ${a.toUpperCase()} = ${fxFmt(r, b)} ${b.toUpperCase()} (1 ${a.toUpperCase()} = ${fxFmt(unit, b)} ${b.toUpperCase()}, referência ${M.fxDate || 'do dia'}).`;
  }

  /* =========================================================
     8. RISCO E POSIÇÃO: quanto comprar para arriscar só X% do capital
     ========================================================= */
  function viewRISK() {
    return `
    <div class="cl-grid2">
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Tamanho da posição</h3><span>quantas ações comprar para perder no máximo X% no stop</span></div>
        <div class="cl-fields">
          ${fld('risk.capital', 'Capital da conta', { pre: 'R$', rng: [1000, 1000000, 1000] })}
          ${fld('risk.risco', 'Risco por operação', { suf: '% do capital', rng: [0.25, 5, 0.25, 2] })}
          ${fld('risk.entrada', 'Entrada', { pre: 'R$' })}
          ${fld('risk.stop', 'Stop', { pre: 'R$' })}
          ${fld('risk.alvo', 'Alvo', { pre: 'R$' })}
          <div class="cl-f"><span>Lote</span>${seg('risk.lote', [['1', 'Fracionário (1)'], ['100', 'Padrão (100)']])}</div>
          ${fld('risk.custo', 'Custo por ordem', { pre: 'R$', tip: 'Corretagem e emolumentos de cada ordem (entrada e saída)' })}
          ${fld('risk.acerto', 'Sua taxa de acerto', { suf: '%', rng: [5, 95, 1], tip: 'Para estimar a expectativa por operação' })}
        </div>
      </section>
      <div id="cl-out" class="cl-col"></div>
    </div>`;
  }
  function calcRISK() {
    const out = $c('#cl-out'); if (!out) return;
    const cap = V('risk.capital'), rp = V('risk.risco') / 100, e = V('risk.entrada'), s = V('risk.stop'), a = V('risk.alvo'), lote = +S.risk.lote || 1, cu = V('risk.custo') || 0, w = V('risk.acerto') / 100;
    if (!(cap > 0) || !(rp > 0) || !(e > 0) || !(s > 0)) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Informe capital, risco, entrada e stop.</div></section>'; return; }
    if (s === e) { out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">O stop precisa ser diferente da entrada.</div></section>'; return; }
    const venda = s > e, dist = Math.abs(e - s), riscoR = cap * rp;
    let q = Math.floor((riscoR - 2 * cu) / dist / lote) * lote, limit = false;
    const qMax = Math.floor(cap / e / lote) * lote;
    if (q > qMax) { q = qMax; limit = true; }
    q = Math.max(0, q);
    const alvoOk = ok(a) && (venda ? a < e : a > e);
    const perda = q * dist + 2 * cu, ganho = alvoOk ? q * Math.abs(a - e) - 2 * cu : NaN, rr = alvoOk ? Math.abs(a - e) / dist : NaN;
    const be = ok(rr) ? 1 / (1 + rr) : NaN, expc = ok(ganho) && ok(w) ? w * ganho - (1 - w) * perda : NaN;
    const ins = [];
    if (limit) ins.push('A quantidade foi limitada pelo capital disponível (sem alavancagem).');
    if (q === 0) ins.push(`Com esse stop, nem ${lote === 100 ? 'um lote de 100' : 'uma ação'} cabe no risco escolhido. Aproxime o stop, aumente o risco ou use o fracionário.`);
    if (ok(be)) ins.push(`Com relação ganho/risco de <b>${nf(rr, 2)} para 1</b>, você empata acertando <b>${nf(be * 100, 0)}%</b> das operações.`);
    if (ok(expc)) ins.push(`Com ${nf(w * 100, 0)}% de acerto, a expectativa é de <b class="${expc >= 0 ? 'pos' : 'neg'}">${sbrl(expc)}</b> por operação (${expc >= 0 ? 'sistema positivo' : 'sistema perde dinheiro no longo prazo'}).`);
    ins.push(`Arriscando ${nf(rp * 100, 2)}% por vez, 5 stops seguidos levam ${nf((1 - (1 - rp) ** 5) * 100, 1)}% da conta e 10 stops, ${nf((1 - (1 - rp) ** 10) * 100, 1)}%.`);
    // régua vertical de preços
    const ps = [e, s].concat(alvoOk ? [a] : []);
    let lo = Math.min(...ps), hi = Math.max(...ps); const pd = (hi - lo) * 0.18; lo -= pd; hi += pd;
    const Y = (v) => (1 - (v - lo) / (hi - lo)) * 100;
    const zona = (p1, p2, cls) => `<div class="cl-z ${cls}" style="top:${Math.min(Y(p1), Y(p2))}%;height:${Math.abs(Y(p1) - Y(p2))}%"></div>`;
    const tag = (v, t, cls) => `<div class="cl-zt ${cls}" style="top:${Y(v)}%"><span>${t}</span><b>${brl(v)}</b></div>`;
    out.innerHTML = `
      <section class="ana-card cl-card cl-hero">
        <div class="cl-kpis">
          ${kpi(venda ? 'Vender (operação vendida)' : 'Comprar', `${nf(q, 0)} ${lote === 100 ? 'ações' : 'unidades'}`, { big: true, cls: 'acc', sub: `${brl(q * e, 0)} na posição · ${nf(q * e / cap * 100, 1)}% do capital` })}
          ${kpi('Perda se bater o stop', brl(perda), { big: true, cls: 'neg', sub: `${nf(perda / cap * 100, 2)}% do capital` })}
        </div>
      </section>
      <section class="ana-card cl-card">
        <div class="cl-h"><h3>Plano da operação</h3><span class="sp"></span><button type="button" class="cl-copy" data-copy><i class="fas fa-copy"></i> Copiar resumo</button></div>
        <div class="cl-riskgrid">
          <div class="cl-zone">${alvoOk ? zona(e, a, 'g') : ''}${zona(e, s, 'r')}${alvoOk ? tag(a, 'Alvo', 'g') : ''}${tag(e, 'Entrada', 'e')}${tag(s, 'Stop', 'r')}</div>
          <div class="cl-kpis cl-kpis1">
            ${kpi('Ganho no alvo', alvoOk ? sbrl(ganho) : '—', { cls: 'pos', sub: alvoOk ? `${spct((a - e) / e * (venda ? -1 : 1))} no preço` : 'alvo do lado errado da entrada' })}
            ${kpi('Ganho / risco', ok(rr) ? `${nf(rr, 2)} : 1` : '—')}
            ${kpi('Acerto para empatar', ok(be) ? `${nf(be * 100, 0)}%` : '—')}
            ${kpi('Distância do stop', `${brl(dist)} (${nf(dist / e * 100, 2)}%)`)}
          </div>
        </div>
        ${insight(ins)}
      </section>`;
    S.lastTxt = `Plano: ${venda ? 'vender' : 'comprar'} ${nf(q, 0)} a ${brl(e)}, stop ${brl(s)}${alvoOk ? `, alvo ${brl(a)}` : ''}.\nRisco ${brl(perda)} (${nf(perda / cap * 100, 2)}% do capital)${alvoOk ? `; ganho ${sbrl(ganho)}; ganho/risco ${nf(rr, 2)}:1` : ''}.`;
  }

  /* ---------------- estrutura da página ---------------- */
  const SUBS = [
    ['rf', 'fa-piggy-bank', 'Renda fixa', viewRF, calcRF],
    ['jc', 'fa-chart-area', 'Juros compostos', viewJC, calcJC],
    ['ap', 'fa-umbrella-beach', 'Liberdade financeira', viewAP, calcAP],
    ['fin', 'fa-house-user', 'Financiamento', viewFIN, calcFIN],
    ['pm', 'fa-layer-group', 'Preço médio', viewPM, calcPM],
    ['risk', 'fa-crosshairs', 'Risco e posição', viewRISK, calcRISK],
    ['inf', 'fa-balance-scale', 'Inflação', viewINF, calcINF],
    ['fx', 'fa-exchange-alt', 'Moedas', viewFX, calcFX]
  ];
  if (!SUBS.some((s) => s[0] === S.sub)) S.sub = 'rf';
  // acessibilidade: campo sem rótulo ligado ganha o nome do título do bloco (leitor de tela)
  const rotula = () => root.querySelectorAll('input, select').forEach((el) => {
    if (el.labels?.length || el.getAttribute('aria-label') || el.type === 'hidden') return;
    const t = el.closest('.cl-f')?.querySelector(':scope > span')?.textContent?.trim();
    if (t) el.setAttribute('aria-label', el.tagName === 'SELECT' ? t + ' (unidade)' : t);
  });
  new MutationObserver(rotula).observe(root, { childList: true, subtree: true });
  root.innerHTML = `
    <div class="cl-head">
      <div class="cl-title"><h2>Calculadoras</h2><p>Resultado na hora, enquanto você digita</p></div>
      <div class="cl-subs" role="tablist">${SUBS.map(([id, ic, l]) => `<button data-sub="${id}" role="tab"><i class="fas ${ic}"></i><span>${l}</span></button>`).join('')}<span class="cl-subs-bar" aria-hidden="true"></span></div>
    </div>
    <div class="cl-strip" id="cl-strip"></div>
    <div id="cl-body"></div>`;
  const body = $c('#cl-body');
  function renderStrip() {
    const it = (l, v, src) => `<span title="${esc(src)}">${l} <b>${v}</b></span>`;
    $c('#cl-strip').innerHTML = it('CDI', ok(M.cdi) ? pct(M.cdi) : (M.cdiSrc ? '—' : '…'), M.cdiSrc) + it('Selic', ok(M.selic) ? pct(M.selic) : (M.selicSrc ? '—' : '…'), M.selicSrc) +
      it('IPCA 12m', ok(M.ipca) ? pct(M.ipca) : (M.ipcaSrc ? '—' : '…'), M.ipcaSrc) +
      (ok(M.cdi) && ok(M.ipca) ? it('Juro real', pct((1 + M.cdi) / (1 + M.ipca) - 1), 'CDI descontado o IPCA 12 meses') : '') +
      `<em>Banco Central${M.cdiSrc && M.cdiSrc !== 'indisponível' ? ' · ' + esc(M.cdiSrc.replace('BCB ', '')) : ''}</em>` +
      '<button type="button" class="cl-hp" data-act="hp" title="Calculadora HP 12C"><span>HP</span>12C</button>';
  }
  function moveBar() {
    const btn = $c(`.cl-subs [data-sub="${S.sub}"]`), bar = $c('.cl-subs-bar');
    if (!btn || !bar) return;
    // as abas quebram linha em tela estreita: a marca acompanha a linha do botão
    bar.style.width = btn.offsetWidth + 'px'; bar.style.height = btn.offsetHeight + 'px'; bar.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
  }
  function renderSub(keepScroll) {
    const sub = SUBS.find((s) => s[0] === S.sub);
    $$c('.cl-subs [data-sub]').forEach((b) => { const on = b.dataset.sub === S.sub; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    moveBar();
    // preserva foco e cursor ao redesenhar
    const a = document.activeElement, key = a && root.contains(a) ? (a.dataset.k ? `[data-k="${a.dataset.k}"]` : a.dataset.l ? `[data-l="${a.dataset.l}"][data-lk="${a.dataset.lk}"]` : a.dataset.o ? `[data-o="${a.dataset.o}"][data-ok="${a.dataset.ok}"]` : null) : null;
    const sel = key && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    body.innerHTML = sub[3]();
    if (key) { const n = $c(key); if (n && n.type !== 'range') { n.focus({ preventScroll: true }); if (sel && n.setSelectionRange) try { n.setSelectionRange(...sel); } catch (e) { /* type sem seleção */ } } }
    calc();
    if (!keepScroll) save();
  }
  let calcT = 0;
  function calc() {
    cancelAnimationFrame(calcT);
    calcT = requestAnimationFrame(() => {
      const sub = SUBS.find((s) => s[0] === S.sub);
      try { const p = sub[4](); if (p && p.catch) p.catch(() => {}); } catch (e) { console.error(e); const out = $c('#cl-out'); if (out) out.innerHTML = '<section class="ana-card cl-card"><div class="cl-empty">Não foi possível calcular com esses valores.</div></section>'; }
    });
  }
  let infT = 0;
  const calcSoon = () => { if (S.sub === 'inf') { clearTimeout(infT); infT = setTimeout(calc, 450); } else calc(); };

  /* ---------------- eventos ---------------- */
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-tes]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.sub) { S.sub = t.dataset.sub; S.lastTxt = ''; renderSub(); return; }
    if (t.dataset.seg) { setP(t.dataset.seg, t.dataset.v); save(); renderSub(true); return; }
    if (t.dataset.prazo) { const [p, u] = t.dataset.prazo.split('|'); S.rf.prazo = p; S.rf.unid = u; save(); renderSub(true); return; }
    if (t.dataset.infini) { S.inf.ini = t.dataset.infini; S.inf.fim = ''; save(); renderSub(true); return; }
    if (t.dataset.para) { S.fx.para = t.dataset.para; save(); renderSub(true); return; }
    if (t.dataset.rm) { S.rf.lines = S.rf.lines.filter((l) => l.id !== t.dataset.rm); save(); renderSub(true); return; }
    if (t.dataset.rmop) { S.pm.ops = S.pm.ops.filter((o) => o.id !== t.dataset.rmop); save(); renderSub(true); return; }
    if (t.dataset.cv) { const o = S.pm.ops.find((x) => x.id === t.dataset.cv); if (o) o.t = o.t === 'C' ? 'V' : 'C'; save(); renderSub(true); return; }
    if (t.dataset.tes != null) {
      const ti = (M.tesouro || []).filter((x) => !/renda\+|educa\+/i.test(x.nome))[+t.dataset.tes];
      if (!ti) return;
      const tipo = /selic/i.test(ti.nome) ? 'tselic' : /ipca/i.test(ti.nome) ? 'ipca' : 'pre';
      if (S.rf.lines.length >= 8) S.rf.lines.pop();
      S.rf.lines.push({ id: uid(), tipo, taxa: fmtIn(ti.taxa, 4), isento: false, nome: ti.nome + (ti.vencimento ? '' : ''), tes: true });
      save(); renderSub(true); toast(`${ti.nome} adicionado ao comparador`, 'success'); return;
    }
    if (t.hasAttribute('data-copy')) {
      const txt = S.lastTxt || '';
      if (!txt) return;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Resumo copiado', 'success'), () => toast('Não foi possível copiar', 'error'));
      return;
    }
    const act = t.dataset.act;
    if (act === 'rf-add') { S.rf.lines.push({ id: uid(), tipo: 'pos', taxa: '100', isento: false, nome: 'Outro' }); save(); renderSub(true); }
    else if (act === 'pm-add') { S.pm.ops.push({ id: uid(), t: t.dataset.t, q: '', p: '', c: '' }); save(); renderSub(true); setTimeout(() => $c(`[data-o="${S.pm.ops[S.pm.ops.length - 1].id}"][data-ok="q"]`)?.focus(), 30); }
    else if (act === 'pm-clear') { S.pm.ops = [{ id: uid(), t: 'C', q: '', p: '', c: '' }]; S.pm.alvoPM = ''; S.pm.compraA = ''; save(); renderSub(true); }
    else if (act === 'pm-fetch') pmFetch();
    else if (act === 'fx-swap') { [S.fx.de, S.fx.para] = [S.fx.para, S.fx.de]; save(); renderSub(true); }
    else if (act === 'hp') openHP();
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.r) {
      // régua mexeu: escreve no campo de texto
      const d = +t.dataset.d || 0, v = +t.value;
      setP(t.dataset.r, fmtIn(v, d));
      const inp = $c(`input[data-k="${t.dataset.r}"]`); if (inp) inp.value = getP(t.dataset.r);
      save(); calcSoon(); return;
    }
    if (t.dataset.k && t.tagName === 'INPUT') {
      setP(t.dataset.k, t.value);
      const r = $c(`input[data-r="${t.dataset.k}"]`); if (r) { const v = numBR(t.value); if (ok(v)) r.value = v; }
      save(); calcSoon(); return;
    }
    if (t.dataset.l && t.type !== 'checkbox' && t.tagName === 'INPUT') { const l = lineById(t.dataset.l); if (l) { l[t.dataset.lk] = t.value; save(); calc(); } return; }
    if (t.dataset.o) { const o = S.pm.ops.find((x) => x.id === t.dataset.o); if (o) { o[t.dataset.ok] = t.value; save(); calc(); } }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.k && t.tagName === 'SELECT') { setP(t.dataset.k, t.value); save(); renderSub(true); return; }
    if (t.dataset.k && t.type === 'month') { setP(t.dataset.k, t.value); save(); calc(); return; }
    if (t.dataset.l) { const l = lineById(t.dataset.l); if (!l) return; l[t.dataset.lk] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.lk === 'tipo') { if (t.value === 'pos') l.taxa = '100'; else if (t.value === 'tselic') l.taxa = '0,10'; else if (t.value === 'poup') l.taxa = ''; } save(); renderSub(true); }
    if (t.dataset.k === 'pm.tk' && t.value.trim()) pmFetch();
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.k === 'pm.tk') { e.preventDefault(); pmFetch(); } });
  window.addEventListener('resize', () => { moveBar(); if (document.getElementById('calculator-panel')?.classList.contains('active')) { clearTimeout(window.__clRs); window.__clRs = setTimeout(calc, 150); } });
  // ao voltar para a aba, refaz o gráfico (largura podia ser zero com a aba escondida)
  const panel = document.getElementById('calculator-panel');
  if (panel) new MutationObserver(() => { if (panel.classList.contains('active')) { moveBar(); calc(); } }).observe(panel, { attributes: true, attributeFilter: ['class'] });

  /* ---------------- HP 12C (a mesma da página antiga) ---------------- */
  let hp = null;
  function openHP() {
    if (!hp) {
      hp = document.createElement('div');
      hp.className = 'cl-hpm';
      hp.innerHTML = `<div class="cl-hpm-box" role="dialog" aria-label="Calculadora HP12C"><div class="cl-hpm-h"><b>Calculadora HP12C</b><button type="button" class="cl-hpm-x" aria-label="Fechar calculadora">&times;</button></div><div class="cl-hpm-frame"><iframe scrolling="no" src="https://hp12c.professorlucassilva.com.br/" title="Calculadora HP12C Virtual"></iframe></div></div>`;
      document.body.appendChild(hp);
      hp.addEventListener('click', (e) => { if (e.target === hp || e.target.closest('.cl-hpm-x')) hp.hidden = true; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hp && !hp.hidden) hp.hidden = true; });
    }
    hp.hidden = false;
    fitHP();
  }
  // a calculadora tem tamanho fixo (465 x 295); em tela estreita ela é reduzida inteira
  function fitHP() {
    if (!hp || hp.hidden) return;
    const k = Math.min(1, (window.innerWidth - 32) / 467);
    hp.style.setProperty('--hpk', k.toFixed(3));
  }
  window.addEventListener('resize', fitHP);

  /* ---------------- estilos ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  #calc-root { --mono:'JetBrains Mono',monospace; }
  #calc-root .pos { color:var(--pos-ink); } #calc-root .neg { color:var(--neg); }
  .cl-mut { color:var(--text-3); font-size:12px; }
  .cl-head { display:flex; align-items:center; gap:12px 16px; flex-wrap:wrap; margin:4px 0 12px; }
  .cl-title { flex:1 1 320px; min-width:0; }
  .cl-title h2 { margin:0; font-size:20px; letter-spacing:-.015em; color:var(--text); }
  .cl-title p { margin:4px 0 0; font-size:12px; color:var(--text-3); font-family:var(--mono); }
  .cl-hp { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 12px; border-radius:10px; border:1px solid var(--line-2); background:linear-gradient(180deg, #2b2b2b, #161616); color:#e9e3d2; font:600 12px var(--mono); cursor:pointer; letter-spacing:.04em; }
  .cl-hp span { color:#f5a623; font-weight:800; }
  .cl-hp:hover { border-color:#f5a623; }
  .cl-subs { position:relative; display:flex; flex-wrap:wrap; padding:3px; border:1px solid var(--line); border-radius:12px; background:var(--surface); max-width:100%; }
  .cl-subs::-webkit-scrollbar { display:none; }
  .cl-subs button { position:relative; z-index:1; flex:0 0 auto; border:0; background:transparent; color:var(--text-3); font:inherit; font-size:12.5px; font-weight:600; padding:7px 12px; border-radius:9px; cursor:pointer; transition:color .18s; display:flex; align-items:center; gap:7px; white-space:nowrap; }
  .cl-subs button i { font-size:11px; opacity:.8; }
  .cl-subs button.on { color:var(--text); } .cl-subs button.on i { color:var(--accent-ink); opacity:1; }
  .cl-subs-bar { position:absolute; top:0; left:0; width:0; height:0; border-radius:9px; background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--line-2), inset 0 -2px 0 var(--accent); transition:transform .3s var(--ease,ease), width .3s var(--ease,ease); }
  .cl-strip { display:flex; flex-wrap:wrap; align-items:center; gap:6px 18px; margin:0 0 14px; padding:8px 12px; border:1px dashed var(--line-2); border-radius:10px; font:12px var(--mono); color:var(--text-3); }
  .cl-strip b { color:var(--text); font-weight:600; } .cl-strip em { margin-left:auto; font-style:normal; font-size:11px; }
  #calc-root .ana-card { margin-bottom:14px; }
  .cl-card { padding:16px; min-width:0; }
  .cl-grid2 { display:grid; grid-template-columns:minmax(0, 0.95fr) minmax(0, 1.35fr); gap:14px; align-items:start; }
  .cl-gridw { grid-template-columns:minmax(0, 1.1fr) minmax(0, 1fr); }
  .cl-col { min-width:0; display:flex; flex-direction:column; }
  .cl-h { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-bottom:12px; }
  .cl-h2 { margin-top:16px; }
  .cl-h h3 { margin:0; font-size:14.5px; font-weight:600; color:var(--text); }
  .cl-h > span:not(.sp) { font-size:11.5px; color:var(--text-3); font-family:var(--mono); }
  .cl-h .sp { flex:1; }
  .cl-fields { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:12px 14px; }
  .cl-f4 { grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); }
  .cl-f { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .cl-f > span { font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); display:flex; align-items:center; gap:5px; }
  .cl-q { display:inline-grid; place-items:center; width:14px; height:14px; border-radius:50%; border:1px solid var(--line-2); font:600 9px var(--mono); font-style:normal; cursor:help; color:var(--text-3); text-transform:none; }
  .cl-inp { display:flex; align-items:center; gap:6px; height:38px; padding:0 10px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); transition:border-color .16s, box-shadow .16s; min-width:0; }
  .cl-inp:focus-within { border-color:var(--accent-line); box-shadow:0 0 0 3px var(--accent-soft); }
  .cl-inp em { font-style:normal; font-size:11px; color:var(--text-3); font-family:var(--mono); white-space:nowrap; }
  #calc-root .cl-inp input, #calc-root .cl-inp select { flex:1; min-width:0; width:100%; height:100%; border:0 !important; background:transparent !important; box-shadow:none !important; color:var(--text); font-family:var(--mono); font-size:14px; outline:none; padding:0; border-radius:0 !important; }
  #calc-root .cl-inp select { font-family:inherit; font-size:13px; cursor:pointer; }
  #calc-root .cl-inp select option { background:var(--surface); color:var(--text); }
  #calc-root .cl-inp .cl-unit { flex:0 0 auto; width:auto; color:var(--text-3); font-size:12px; }
  #calc-root input[type=month] { color-scheme:dark; } body.light #calc-root input[type=month] { color-scheme:light; }
  .cl-rng { width:100%; height:16px; margin:2px 0 0; accent-color:var(--accent); cursor:pointer; }
  .cl-seg { display:flex; flex-wrap:wrap; gap:3px; padding:3px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); }
  .cl-seg button { flex:1 1 auto; border:0; background:transparent; color:var(--text-3); font:inherit; font-size:12px; font-weight:600; padding:6px 10px; border-radius:7px; cursor:pointer; white-space:nowrap; }
  .cl-seg button.on { background:var(--surface); color:var(--text); box-shadow:inset 0 0 0 1px var(--line-2), inset 0 -2px 0 var(--accent); }
  .cl-quick { display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
  .cl-quick button { border:1px solid var(--line); background:transparent; color:var(--text-3); font:600 11px var(--mono); padding:3px 8px; border-radius:99px; cursor:pointer; }
  .cl-quick button.on, .cl-quick button:hover { color:var(--accent-ink); border-color:var(--accent-line); background:var(--accent-soft); }
  .cl-quick2 { margin-top:14px; }
  .cl-note { margin:12px 0 0; line-height:1.5; font-size:11.5px; }
  .cl-chips { display:flex; flex-wrap:wrap; gap:6px; }
  .cl-chip { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:11.5px; padding:5px 9px; border-radius:99px; cursor:pointer; }
  .cl-chip b { font:600 11px var(--mono); color:var(--accent-ink); }
  .cl-chip:hover { border-color:var(--accent-line); color:var(--text); }
  .cl-lines { display:flex; flex-direction:column; gap:8px; }
  .cl-line { display:grid; grid-template-columns:10px minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1.2fr) 66px 30px; gap:8px; align-items:center; padding:8px; border:1px solid var(--line); border-left:3px solid var(--lc); border-radius:10px; background:var(--surface-2); }
  .cl-dot { width:9px; height:9px; border-radius:50%; background:var(--lc); display:inline-block; flex:0 0 auto; }
  #calc-root .cl-line > input.cl-name, #calc-root .cl-line > select { height:34px; min-width:0; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--text); font:inherit; font-size:12.5px; padding:0 8px; outline:none; }
  #calc-root .cl-line > input.cl-name { font-weight:600; }
  .cl-line .cl-inp { height:34px; background:var(--surface); }
  .cl-lrate { min-width:0; }
  .cl-chk { display:flex; align-items:center; gap:5px; font-size:11.5px; color:var(--text-3); cursor:pointer; white-space:nowrap; }
  .cl-chk input { accent-color:var(--accent); }
  .cl-x { width:30px; height:30px; border-radius:8px; border:1px solid transparent; background:transparent; color:var(--text-3); cursor:pointer; }
  .cl-x:hover { color:var(--neg); border-color:var(--line); }
  .cl-rank { padding:10px 0; border-bottom:1px solid var(--line); }
  .cl-rank:last-of-type { border-bottom:0; }
  .cl-rank-h { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .cl-rank-h b { color:var(--text); font-size:13.5px; } .cl-rank-h > span:not(.sp) { font:11.5px var(--mono); color:var(--text-3); } .cl-rank-h .sp { flex:1; }
  .cl-rank-h strong { font:600 15px var(--mono); color:var(--text); }
  .cl-rank.win .cl-rank-h strong { color:var(--accent-ink); }
  .cl-badge { font-style:normal; font:700 9.5px var(--mono); letter-spacing:.06em; text-transform:uppercase; color:var(--accent-ink); border:1px solid var(--accent-line); background:var(--accent-soft); padding:2px 6px; border-radius:5px; }
  .cl-bar { height:6px; margin:8px 0 7px; border-radius:99px; background:var(--surface-2); overflow:hidden; }
  .cl-bar i { display:block; height:100%; border-radius:inherit; background:var(--lc); transition:width .35s var(--ease,ease); }
  .cl-rank-d { display:flex; flex-wrap:wrap; gap:4px 14px; font:11.5px var(--mono); color:var(--text-3); }
  .cl-rank-d b { color:var(--text-2); font-weight:600; }
  .cl-rank.na { opacity:.7; }
  .cl-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:14px; }
  .cl-kpis1 { grid-template-columns:1fr 1fr; margin:0; align-content:start; }
  .cl-kpi { padding:10px 12px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); min-width:0; }
  .cl-kpi span { display:block; font-size:10.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--text-3); }
  .cl-kpi b { display:block; margin-top:4px; font:600 16px var(--mono); color:var(--text); overflow-wrap:anywhere; }
  .cl-kpi em { display:block; margin-top:3px; font-style:normal; font-size:11.5px; color:var(--text-3); }
  .cl-kpi.big b { font-size:24px; letter-spacing:-.02em; }
  .cl-kpi.acc b { color:var(--accent-ink); } .cl-kpi.pos b { color:var(--pos-ink); } .cl-kpi.neg b { color:var(--neg); }
  .cl-hero { background:radial-gradient(120% 140% at 0% 0%, var(--accent-soft), transparent 55%), var(--surface); }
  .cl-hero .cl-kpis { margin:0; } .cl-hero .cl-kpi { background:transparent; border-color:var(--line-2); }
  .cl-split { position:relative; display:flex; justify-content:space-between; height:24px; margin:-2px 0 14px; border-radius:7px; overflow:hidden; background:color-mix(in srgb, var(--accent) 30%, transparent); font:600 11px var(--mono); }
  .cl-split i { position:absolute; inset:0 auto 0 0; background:color-mix(in srgb, var(--info) 55%, transparent); }
  .cl-split span { position:relative; padding:0 9px; line-height:24px; color:var(--text); }
  .cl-chart { position:relative; }
  .cl-chart svg { display:block; overflow:visible; touch-action:pan-y; }
  .cl-grid { stroke:var(--line); stroke-width:1; }
  .cl-ax { fill:var(--text-3); font:10.5px var(--mono); }
  .cl-mark { stroke:var(--text-3); stroke-dasharray:3 4; stroke-width:1; }
  .cl-mark-t { fill:var(--text-2); font:600 10.5px var(--mono); }
  .cl-cross { stroke:var(--text-2); stroke-width:1; }
  .cl-tipbox { position:absolute; top:8px; z-index:3; min-width:170px; padding:8px 10px; border:1px solid var(--line-2); border-radius:9px; background:var(--surface); box-shadow:var(--shadow-lg); font:11.5px var(--mono); color:var(--text-2); pointer-events:none; }
  .cl-tipbox b { display:block; margin-bottom:5px; color:var(--text); }
  .cl-tipbox span { display:flex; align-items:center; gap:6px; margin-top:3px; white-space:nowrap; }
  .cl-tipbox span i, .cl-legend i { width:8px; height:8px; border-radius:2px; display:inline-block; flex:0 0 auto; }
  .cl-tipbox em { margin-left:auto; padding-left:12px; font-style:normal; color:var(--text); font-weight:600; }
  .cl-legend { display:flex; flex-wrap:wrap; gap:4px 14px; margin-top:8px; font-size:11.5px; color:var(--text-3); }
  .cl-legend span { display:inline-flex; align-items:center; gap:6px; }
  .cl-ins { list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:7px; }
  .cl-ins li { display:flex; gap:9px; align-items:flex-start; font-size:12.5px; line-height:1.5; color:var(--text-2); padding:8px 10px; border-radius:9px; background:var(--surface-2); }
  .cl-ins li i { color:var(--accent-ink); font-size:11px; margin-top:4px; }
  .cl-ins b { color:var(--text); }
  .cl-copy { border:1px solid var(--line); background:transparent; color:var(--text-3); font:inherit; font-size:11.5px; padding:5px 9px; border-radius:8px; cursor:pointer; display:inline-flex; gap:6px; align-items:center; }
  .cl-copy:hover { color:var(--text); border-color:var(--line-2); }
  .cl-empty { padding:26px 10px; text-align:center; color:var(--text-3); font-size:13px; }
  .cl-prog { margin-top:14px; }
  .cl-prog > div { display:flex; justify-content:space-between; font:11.5px var(--mono); color:var(--text-3); }
  .cl-prog > div b { color:var(--text); }
  .cl-prog > i { display:block; height:8px; margin:6px 0; border-radius:99px; background:var(--surface-2); overflow:hidden; }
  .cl-prog > i b { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg, var(--info), var(--accent)); }
  .cl-sens { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; margin-top:14px; }
  .cl-sens > span { grid-column:1 / -1; font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); }
  .cl-sens > div { padding:9px 11px; border:1px dashed var(--line-2); border-radius:10px; }
  .cl-sens b { display:block; font-size:12px; color:var(--text-2); font-weight:600; }
  .cl-sens em { display:block; margin-top:3px; font:600 14px var(--mono); font-style:normal; color:var(--text-3); }
  .cl-fin { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
  .cl-fincol { padding:12px; border:1px solid var(--line); border-top:3px solid var(--lc); border-radius:11px; display:flex; flex-direction:column; gap:10px; min-width:0; }
  .cl-fin-h { display:flex; align-items:center; gap:8px; } .cl-fin-h b { color:var(--text); }
  .cl-fincol .cl-kpi { background:transparent; border:0; padding:0; }
  .cl-mini { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-3); }
  .cl-mini span { display:flex; justify-content:space-between; gap:8px; } .cl-mini b { font:600 12px var(--mono); color:var(--text-2); }
  .cl-extra { font-size:12px; line-height:1.5; color:var(--text-2); padding:8px 10px; border-radius:9px; background:var(--accent-soft); }
  .cl-extra i { color:var(--accent-ink); }
  .cl-tablewrap { max-height:360px; overflow:auto; border:1px solid var(--line); border-radius:10px; }
  .cl-table { width:100%; border-collapse:collapse; font:12px var(--mono); }
  .cl-table th { position:sticky; top:0; background:var(--surface-2); color:var(--text-3); font-weight:600; text-align:right; padding:8px 10px; font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; }
  .cl-table td { text-align:right; padding:7px 10px; border-top:1px solid var(--line); color:var(--text-2); white-space:nowrap; }
  .cl-table th:first-child, .cl-table td:first-child { text-align:left; }
  .cl-go { border:0; background:var(--accent-soft); color:var(--accent-ink); width:28px; height:26px; border-radius:7px; cursor:pointer; flex:0 0 auto; margin-right:-4px; }
  .cl-ops { margin-top:16px; display:flex; flex-direction:column; gap:6px; }
  .cl-op { display:grid; grid-template-columns:86px minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) 30px; gap:6px; align-items:center; }
  .cl-op .cl-inp { height:34px; }
  .cl-op-h span { font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); }
  .cl-cv { height:34px; border-radius:8px; border:1px solid; font:600 11.5px inherit; cursor:pointer; background:transparent; font-family:inherit; }
  .cl-cv.c { color:var(--pos-ink); border-color:color-mix(in srgb, var(--pos) 40%, transparent); background:color-mix(in srgb, var(--pos) 10%, transparent); }
  .cl-cv.v { color:var(--neg); border-color:color-mix(in srgb, var(--neg) 40%, transparent); background:color-mix(in srgb, var(--neg) 10%, transparent); }
  .cl-btnrow { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  .cl-btnrow .btn-sm, .cl-h .btn-sm { display:inline-flex; align-items:center; gap:6px; }
  .cl-goal { margin-top:12px; padding:10px 12px; border-radius:10px; background:var(--surface-2); font-size:13px; line-height:1.5; color:var(--text-2); }
  .cl-goal b { color:var(--accent-ink); font-family:var(--mono); }
  .cl-ruler { position:relative; height:64px; margin:10px 8px 0; }
  .cl-ruler-l { position:absolute; left:0; right:0; top:40px; height:2px; background:var(--line-2); border-radius:2px; }
  .cl-rp { position:absolute; top:35px; width:12px; height:12px; margin-left:-6px; border-radius:50%; border:2px solid var(--surface); }
  .cl-rp.c { background:var(--pos); } .cl-rp.v { background:var(--neg); }
  .cl-rm { position:absolute; top:0; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; font:600 11px var(--mono); white-space:nowrap; }
  .cl-rm::after { content:''; width:2px; height:20px; margin-top:3px; background:currentColor; }
  .cl-rm.pm { color:var(--accent-ink); } .cl-rm.at { top:46px; flex-direction:column-reverse; } .cl-rm.at::after { margin:0 0 2px; height:8px; }
  .cl-rm.at.pos { color:var(--pos-ink); } .cl-rm.at.neg { color:var(--neg); }
  .cl-ruler { margin-bottom:22px; }
  .cl-riskgrid { display:grid; grid-template-columns:minmax(150px, 0.8fr) minmax(0, 1.2fr); gap:14px; }
  .cl-zone { position:relative; min-height:230px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); overflow:hidden; }
  .cl-z { position:absolute; left:0; right:0; }
  .cl-z.g { background:color-mix(in srgb, var(--pos) 18%, transparent); } .cl-z.r { background:color-mix(in srgb, var(--neg) 18%, transparent); }
  .cl-zt { position:absolute; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:0 10px; transform:translateY(-50%); font:600 11.5px var(--mono); border-top:2px solid; height:0; }
  .cl-zt span, .cl-zt b { transform:translateY(-10px); }
  .cl-zt.g { color:var(--pos-ink); } .cl-zt.r { color:var(--neg); } .cl-zt.e { color:var(--text); border-top-style:dashed; }
  .cl-fx { padding:18px; }
  .cl-fxrow { display:grid; grid-template-columns:minmax(0, 1.2fr) minmax(0, 1fr) 44px minmax(0, 1fr); gap:10px; align-items:end; }
  .cl-inp-xl { height:46px; } #calc-root .cl-inp-xl input { font-size:18px; font-weight:600; }
  .cl-swap { height:46px; border-radius:11px; border:1px solid var(--line-2); background:var(--surface-2); color:var(--accent-ink); cursor:pointer; }
  .cl-swap:hover { background:var(--accent-soft); }
  .cl-fxres { margin:18px 0 6px; padding:16px; border-radius:12px; background:radial-gradient(120% 140% at 0% 0%, var(--accent-soft), transparent 60%), var(--surface-2); }
  .cl-fxres span { font:13px var(--mono); color:var(--text-3); }
  .cl-fxres b { display:block; margin:4px 0; font:700 32px var(--mono); letter-spacing:-.02em; color:var(--accent-ink); overflow-wrap:anywhere; }
  .cl-fxres b small { font-size:16px; color:var(--text-3); }
  .cl-fxres em { font-style:normal; font:12px var(--mono); color:var(--text-3); }
  .cl-board { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:8px; }
  .cl-cur { text-align:left; padding:9px 11px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); cursor:pointer; font:inherit; color:var(--text-2); min-width:0; }
  .cl-cur span { font:600 11px var(--mono); color:var(--text-3); } .cl-cur b { display:block; margin:3px 0 1px; font:600 14px var(--mono); color:var(--text); overflow-wrap:anywhere; } .cl-cur em { font-style:normal; font-size:11px; color:var(--text-3); }
  .cl-cur.on, .cl-cur:hover { border-color:var(--accent-line); }
  .cl-hpm { position:fixed; inset:0; z-index:8000; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(3,6,12,.35); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); --hpk:1; }
  .cl-hpm[hidden] { display:none; }
  .cl-hpm-box { flex-shrink:0; background:var(--surface); border:1px solid var(--line-2); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,.6); overflow:hidden; }
  .cl-hpm-h { display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid var(--line); }
  .cl-hpm-h b { color:var(--accent-ink); font-size:15px; }
  .cl-hpm-x { width:32px; height:32px; border-radius:50%; border:0; background:color-mix(in srgb, var(--text) 10%, transparent); color:var(--text-2); font-size:20px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
  .cl-hpm-x:hover { background:var(--accent); color:var(--bg); }
  .cl-hpm-frame { width:calc(465px * var(--hpk)); height:calc(295px * var(--hpk)); overflow:hidden; }
  .cl-hpm-frame iframe { display:block; width:465px; height:295px; border:0; transform:scale(var(--hpk)); transform-origin:0 0; }
  @media (max-width: 1100px) { .cl-grid2, .cl-gridw { grid-template-columns:minmax(0, 1fr); } }
  @media (max-width: 640px) {
    .cl-subs { width:100%; }
    .cl-strip em { margin-left:0; width:100%; }
    .cl-line { grid-template-columns:10px minmax(0, 1fr) 30px; }
    .cl-line > select, .cl-line .cl-lrate, .cl-line .cl-chk, .cl-line > span:not(.cl-lrate) { grid-column:2 / 4; }
    .cl-line > .cl-x { grid-column:3; grid-row:1; }
    .cl-fin, .cl-riskgrid { grid-template-columns:1fr; }
    .cl-zone { min-height:190px; }
    .cl-op { grid-template-columns:72px minmax(0, 1fr) minmax(0, 1fr) 30px; }
    .cl-op > .cl-inp:nth-of-type(3) { display:none; }
    .cl-op-h span:nth-child(4) { display:none; }
    .cl-fxrow { grid-template-columns:1fr 44px 1fr; }
    .cl-fxrow > .cl-f:first-child { grid-column:1 / -1; }
    .cl-kpi.big b { font-size:20px; }
    .cl-fxres b { font-size:26px; }
  }
  `;
  document.head.appendChild(css);

  renderStrip();
  renderSub(true);
  loadMarket();
  loadFx();
})();
