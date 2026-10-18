/* =========================================================
   FUNDAMENTOS (aba "Fundamentos"): balanços das empresas da B3.
   Os números vêm dos dados abertos da CVM (DFP, ITR e FCA, licença ODbL),
   transformados em JSON toda semana pelo cvm/gerar_fundamentos.py (GitHub Actions).
   A cotação (para P/L, P/VP, dividend yield etc.) vem do Yahoo pelo worker.
   Regra do painel: nada inventado; conta que não existe no balanço mostra "—".
   O arquivo só é baixado na primeira vez que a aba é aberta.
   ========================================================= */
(() => {
  if (window.__fundLoaded) return;
  window.__fundLoaded = true;
  const root = document.getElementById('fund-root');
  if (!root) return;

  // Onde estão os JSON: primeiro o repositório do GitHub (atualizado toda semana pelo job),
  // depois a pasta fundamentos/ publicada junto com o site.
  const FUND_SOURCES = [
    'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fundamentos/',
    'fundamentos/'
  ];
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const PREF_KEY = 'fund_prefs_v1';
  const IDX_KEY = 'fund_idx_v1';
  const IDX_TTL = 12 * 3600 * 1000;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pc = (v, d = 1) => (ok(v) ? `${nf(v, d)}%` : '—');
  const xx = (v, d = 1) => (ok(v) ? `${nf(v, d)}x` : '—');
  // R$ compacto: 1,23 bi / 456,7 mi
  const brl = (v) => {
    if (!ok(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e12) return `${s}R$ ${nf(a / 1e12, 2)} tri`;
    if (a >= 1e9) return `${s}R$ ${nf(a / 1e9, a >= 1e11 ? 0 : 1)} bi`;
    if (a >= 1e6) return `${s}R$ ${nf(a / 1e6, a >= 1e8 ? 0 : 1)} mi`;
    return `${s}R$ ${nf(a, 0)}`;
  };
  // a CVM separa "Emp. Adm. Part. - Bancos" (holdings) de "Bancos"; no site viram o mesmo setor
  const setorDe = (x) => String(x || '').replace(/^Emp\. Adm\. Part\. - /i, '').trim();
  const div = (a, b, k = 1) => (ok(a) && ok(b) && b !== 0 ? (a / b) * k : null);
  const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
  const triLabel = (iso) => {
    if (!iso) return '';
    const m = +iso.slice(5, 7), y = iso.slice(0, 4);
    return m === 12 ? `ano de ${y}` : `${Math.ceil(m / 3)}º tri/${y}`;
  };

  let prefs = { cvm: null, view: 'empresa', sort: 'receita', dir: -1, setor: '' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };

  let base = null;          // pasta que respondeu
  let idx = null;           // index.json
  const docs = new Map();   // cvm -> json da empresa
  const quotes = new Map(); // ticker -> { value, change, ts }
  let cur = null;           // empresa aberta

  async function getJSON(url, ms = 15000) {
    const r = await fetchT(url, { cache: 'no-cache' }, ms);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  async function loadIndex() {
    try {
      const c = JSON.parse(localStorage.getItem(IDX_KEY) || 'null');
      if (c && c.idx && Date.now() - c.t < IDX_TTL) { idx = c.idx; base = c.base; return true; }
    } catch (e) { /* sem cache */ }
    for (const b of FUND_SOURCES) {
      try {
        const j = await getJSON(b + 'index.json');
        if (j && Array.isArray(j.empresas) && j.empresas.length) {
          idx = j; base = b;
          try { localStorage.setItem(IDX_KEY, JSON.stringify({ t: Date.now(), base, idx })); } catch (e) { /* cheio */ }
          return true;
        }
      } catch (e) { /* tenta a próxima */ }
    }
    return false;
  }
  async function loadDoc(cvm) {
    if (docs.has(cvm)) return docs.get(cvm);
    const order = [base, ...FUND_SOURCES.filter((b) => b !== base)];
    for (const b of order) {
      try { const j = await getJSON(`${b}${cvm}.json`); docs.set(cvm, j); return j; } catch (e) { /* próxima */ }
    }
    throw new Error('Balanço não encontrado');
  }
  async function loadQuotes(tks) {
    const syms = tks.map((t) => `${t}.SA`);
    try {
      const j = await getJSON(`${PROXY}/quotes?symbols=${encodeURIComponent(syms.join(','))}`, 20000);
      tks.forEach((t) => {
        try { const q = parseYahooChart(j[`${t}.SA`]); if (ok(q.value) && q.value > 0) quotes.set(t, q); } catch (e) { /* sem cotação */ }
      });
    } catch (e) { /* sem cotação: indicadores de preço ficam "—" */ }
  }

  /* ---------------- valor de mercado ---------------- */
  // ON × preço da ON + PN × preço da PN. Se só uma classe tem cotação, usa ela para as duas (aproximado).
  function mercado(d) {
    const a = d.acoes;
    if (!a) return { mcap: null };
    const on = d.tickers.find((t) => /3$/.test(t) && quotes.has(t));
    const pn = d.tickers.find((t) => /[456]$/.test(t) && quotes.has(t));
    const unit = d.tickers.find((t) => /11$/.test(t) && quotes.has(t));
    const pOn = on ? quotes.get(on).value : null, pPn = pn ? quotes.get(pn).value : null;
    let mcap = null, aprox = false;
    if (pOn != null && (pPn != null || !a.pn)) mcap = a.on * pOn + (a.pn || 0) * (pPn || 0);
    else if (pPn != null && !a.on) mcap = a.pn * pPn;
    else if (pOn != null || pPn != null) { mcap = (a.on + a.pn) * (pOn ?? pPn); aprox = true; }
    else if (unit) aprox = true;
    return { mcap, aprox };
  }


  // Mesmos dados e contas da aba Fundamentos, expostos para a consulta integrada do ativo.
  const assetJobs = new Map();
  window.getAssetFundamentals = async symbol => {
    const ticker = String(symbol || '').toUpperCase().replace(/\.SA$/, '');
    if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) return null;
    if (assetJobs.has(ticker)) return assetJobs.get(ticker);
    const job = (async () => {
      if (!idx && !(await loadIndex())) throw new Error('Não foi possível carregar o índice de empresas.');
      const entry = idx.empresas.find(e => e.tickers.includes(ticker));
      if (!entry) return null;
      const d = await loadDoc(entry.cvm);
      // Uma falha de consulta não pode reaproveitar silenciosamente preços antigos para os múltiplos.
      d.tickers.forEach(t => quotes.delete(t));
      await loadQuotes(d.tickers);
      const { mcap, aprox } = mercado(d), t = d.ttm || {}, b = d.balanco || {};
      return { name: d.nome, reference: dmy(b.ref || t.ref), approx: !!aprox,
        metrics: [
          ['P/L', xx(div(mcap, t.lucro))],
          ['P/VP', xx(div(mcap, b.pl), 2)],
          ['ROE', pc(div(t.lucro, b.pl, 100), 1)],
          ['Dívida líquida / EBITDA', d.financeira ? 'Não se aplica' : xx(div(b.div_liq, t.ebitda), 2)],
          ['Margem líquida', pc(div(t.lucro, t.receita, 100), 1)],
          ['Dividend yield (12m)', pc(div(t.proventos, mcap, 100), 1)]
        ] };
    })();
    assetJobs.set(ticker, job);
    try { return await job; } finally { if (assetJobs.get(ticker) === job) assetJobs.delete(ticker); }
  };

  /* ---------------- desenho ---------------- */
  function shell() {
    root.innerHTML = `
      <div class="fd-wrap">
        <div class="fd-bar">
          <div class="fd-search">
            <i class="fas fa-search"></i>
            <input id="fd-q" type="search" placeholder="Buscar empresa ou ticker (ex.: PETR4, Itaú)" autocomplete="off" aria-label="Buscar empresa">
            <div class="fd-sug" id="fd-sug" role="listbox" hidden></div>
          </div>
          <div class="fd-views" role="tablist" aria-label="Modo">
            <button data-v="empresa" role="tab">Empresa</button>
            <button data-v="ranking" role="tab">Ranking</button>
            <button data-v="eua" role="tab">EUA</button>
          </div>
        </div>
        <div class="fd-pop" id="fd-pop"></div>
        <div id="fd-body"></div>
        <p class="fd-foot" id="fd-foot"></p>
      </div>`;
    root.querySelector('.fd-views').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      prefs.view = b.dataset.v; savePrefs(); render();
    });
    const q = root.querySelector('#fd-q'), sug = root.querySelector('#fd-sug');
    let hi = -1, list = [];
    const showSug = () => {
      const t = q.value.trim().toUpperCase();
      if (!idx || t.length < 2) { sug.hidden = true; return; }
      const n = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      const tn = n(t);
      list = idx.empresas.filter((e) => e.tickers.some((k) => k.startsWith(t)) || n(e.nome).includes(tn)).slice(0, 8);
      hi = list.length ? 0 : -1;
      sug.innerHTML = list.length ? list.map((e, i) => `<button role="option" data-cvm="${esc(e.cvm)}" class="${i === hi ? 'hi' : ''}"><b>${esc(e.tickers.join(' · '))}</b><span>${esc(e.nome)}</span></button>`).join('')
        : '<div class="fd-none">Nenhuma empresa encontrada</div>';
      sug.hidden = false;
    };
    const pick = (cvm) => { sug.hidden = true; q.value = ''; prefs.view = 'empresa'; open(cvm); };
    q.addEventListener('input', showSug);
    q.addEventListener('keydown', (e) => {
      if (sug.hidden || !list.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        sug.querySelectorAll('button').forEach((b, i) => b.classList.toggle('hi', i === hi));
      } else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(list[hi].cvm); }
      else if (e.key === 'Escape') sug.hidden = true;
    });
    sug.addEventListener('mousedown', (e) => { const b = e.target.closest('button[data-cvm]'); if (b) { e.preventDefault(); pick(b.dataset.cvm); } });
    q.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
    root.querySelector('#fd-pop').addEventListener('click', (e) => { const b = e.target.closest('button[data-cvm]'); if (b) pick(b.dataset.cvm); });
  }

  function footer() {
    const g = idx && idx.gerado ? new Date(idx.gerado).toLocaleDateString('pt-BR') : null;
    root.querySelector('#fd-foot').innerHTML = `Fonte: <a href="https://dados.cvm.gov.br" target="_blank" rel="noopener">CVM Dados Abertos</a> (DFP, ITR e FCA, licença ODbL)${g ? `, dados gerados em ${g}` : ''}. Cotação: Yahoo Finance, pode ter atraso.
      Os 12 meses somam o acumulado do ano no último ITR com o ano anterior completo, menos o mesmo período do ano anterior. Não é recomendação de investimento.`;
  }

  function popular() {
    const want = ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'WEGE3', 'ABEV3', 'BBDC4', 'B3SA3', 'SUZB3', 'ELET3'];
    const el = root.querySelector('#fd-pop');
    if (!idx) { el.innerHTML = ''; return; }
    el.innerHTML = want.map((t) => { const e = idx.empresas.find((x) => x.tickers.includes(t)); return e ? `<button data-cvm="${esc(e.cvm)}" class="${cur && cur.cvm === e.cvm && prefs.view === 'empresa' ? 'on' : ''}">${t}</button>` : ''; }).join('');
  }

  function render() {
    root.querySelectorAll('.fd-views button').forEach((b) => { b.classList.toggle('on', b.dataset.v === prefs.view); b.setAttribute('aria-selected', b.dataset.v === prefs.view); });
    root.querySelector('.fd-wrap').classList.toggle('eua', prefs.view === 'eua');
    if (prefs.view === 'eua') { renderEua(); return; }
    popular();
    footer();
    if (!idx) {
      if (idxFalhou) semIndice();
      else { root.querySelector('#fd-body').innerHTML = '<div class="fd-msg">Carregando a lista de empresas…</div>'; boot().then(() => { if (prefs.view !== 'eua') render(); }); }
      return;
    }
    if (prefs.view === 'ranking') renderRanking();
    else if (cur) renderEmpresa(cur);
    else {
      const first = (prefs.cvm && idx.empresas.find((e) => e.cvm === prefs.cvm)) || idx.empresas.find((e) => e.tickers.includes('PETR4')) || idx.empresas[0];
      if (first) open(first.cvm);
      else root.querySelector('#fd-body').innerHTML = '<div class="fd-msg">Escolha uma empresa na busca ou nos atalhos acima.</div>';
    }
  }

  // modo EUA: arquivo separado (fund-eua.js), baixado só quando o botão é usado
  function renderEua() {
    const body = root.querySelector('#fd-body');
    let el = body.querySelector('#fd-eua');
    if (!el) { body.innerHTML = '<div id="fd-eua"><div class="fd-msg">Carregando…</div></div>'; el = body.querySelector('#fd-eua'); }
    const foot = root.querySelector('#fd-foot');
    if (window.__fundEua) { window.__fundEua(el, foot); return; }
    if (document.querySelector('script[data-fund-eua]')) return;
    const sc = document.createElement('script');
    sc.src = 'fund-eua.js?v=2'; sc.dataset.fundEua = '1';
    sc.onload = () => { if (prefs.view === 'eua' && window.__fundEua) window.__fundEua(root.querySelector('#fd-eua') || el, foot); };
    sc.onerror = () => { el.innerHTML = '<div class="fd-msg">Não foi possível carregar o modo EUA.</div>'; sc.remove(); };
    document.head.appendChild(sc);
  }

  function renderEmpresa(d) {
    const body = root.querySelector('#fd-body');
    const t = d.ttm || {}, b = d.balanco || {};
    const { mcap, aprox } = mercado(d);
    const ev = ok(mcap) && ok(b.div_liq) ? mcap + b.div_liq : null;
    const tkq = d.tickers.filter((k) => quotes.has(k));
    const kp = [
      ['Valor de mercado', brl(mcap), aprox ? 'aproximado: uma classe de ação sem cotação' : (d.acoes ? `${nf((d.acoes.on + d.acoes.pn) / 1e6, 0)} mi de ações` : 'sem número de ações')],
      ['P/L', xx(div(mcap, t.lucro)), t.lucro != null && t.lucro < 0 ? 'prejuízo em 12 meses' : 'preço ÷ lucro de 12 meses'],
      ['P/VP', xx(div(mcap, b.pl), 2), 'preço ÷ patrimônio'],
      ['Dividend yield', pc(div(t.proventos, mcap, 100), 1), 'proventos pagos em 12 meses (caixa)'],
      ['ROE', pc(div(t.lucro, b.pl, 100), 1), 'lucro de 12 meses ÷ patrimônio'],
      ['Margem líquida', pc(div(t.lucro, t.receita, 100), 1), 'lucro ÷ receita']
    ];
    if (!d.financeira) {
      kp.push(['Margem EBITDA', pc(div(t.ebitda, t.receita, 100), 1), 'EBIT + depreciação ÷ receita']);
      kp.push(['EV/EBITDA', xx(div(ev, t.ebitda)), 'valor da firma ÷ EBITDA']);
      kp.push(['Dív. líq./EBITDA', xx(div(b.div_liq, t.ebitda), 2), b.div_liq != null && b.div_liq < 0 ? 'caixa maior que a dívida' : 'anos de geração para pagar a dívida']);
    }
    const anos = d.anos || [];
    const cols = [...anos.map((a) => ({ k: String(a.ano), r: a, sub: a.ref && a.ref.slice(5) !== '12-31' ? dmy(a.ref) : '' }))];
    if (d.ttm && (!anos.length || d.ttm.ref > anos[anos.length - 1].ref)) cols.push({ k: '12 meses', r: { ...d.ttm, ...d.balanco }, sub: `até ${dmy(d.ttm.ref)}`, ttm: true });
    const linhas = [
      ['Receita', (r) => brl(r.receita)],
      ...(d.financeira ? [] : [['EBITDA', (r) => brl(r.ebitda)]]),
      ['Lucro líquido', (r) => brl(r.lucro), (r) => (ok(r.lucro) ? (r.lucro < 0 ? 'dn' : '') : '')],
      ['Margem líquida', (r) => pc(div(r.lucro, r.receita, 100))],
      ['ROE', (r) => pc(div(r.lucro, r.pl, 100))],
      ['Patrimônio líquido', (r) => brl(r.pl)],
      ...(d.financeira ? [] : [['Dívida líquida', (r) => brl(r.div_liq)], ['Caixa das operações', (r) => brl(r.fco)]]),
      ['Proventos pagos', (r) => brl(r.proventos)]
    ];
    body.innerHTML = `
      <section class="fd-head">
        <div class="fd-id">
          <h2>${esc(d.nome)}</h2>
          <div class="fd-meta">${esc(setorDe(d.setor) || 'Setor não informado')}${d.segmento ? ` · ${esc(d.segmento)}` : ''} · código CVM ${esc(d.cvm)}</div>
        </div>
        <div class="fd-tks">${d.tickers.map((k) => {
          const q = quotes.get(k);
          return `<button class="fd-tk" data-sym="${esc(k)}" title="Ver gráfico de ${esc(k)}"><b>${esc(k)}</b><span>${q ? 'R$ ' + nf(q.value, 2) : '—'}</span>${q ? `<em class="${q.change > 0 ? 'up' : q.change < 0 ? 'dn' : 'eq'}">${q.change > 0 ? '+' : q.change < 0 ? '−' : ''}${nf(Math.abs(q.change), 2)}%</em>` : ''}</button>`;
        }).join('')}</div>
      </section>
      <div class="fd-ref">Últimos números: <b>${esc(triLabel(t.ref || b.ref))}</b> (balanço de ${dmy(b.ref || t.ref)})${d.financeira ? ' · empresa financeira: EBITDA e dívida não se aplicam' : ''}${!tkq.length ? ' · sem cotação agora: indicadores de preço ficam em branco' : ''}</div>
      <div class="fd-kpis">${kp.map(([n, v, s]) => `<div class="fd-kpi"><span>${esc(n)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join('')}</div>
      <div class="fd-grid">
        <section class="fd-box">
          <div class="fd-bh"><h3>Receita e lucro</h3><span class="fd-leg"><i class="r"></i>Receita <i class="l"></i>Lucro líquido</span></div>
          ${chart(cols)}
        </section>
        <section class="fd-box">
          <div class="fd-bh"><h3>Resultados por ano</h3></div>
          <div class="fd-tbl"><table>
            <thead><tr><th></th>${cols.map((c) => `<th class="${c.ttm ? 'ttm' : ''}">${esc(c.k)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(([n, f, cl]) => `<tr><th>${esc(n)}</th>${cols.map((c) => `<td class="${c.ttm ? 'ttm ' : ''}${cl ? cl(c.r) : ''}">${esc(f(c.r))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
        </section>
      </div>`;
    body.querySelectorAll('.fd-tk').forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.dataset.sym;
      if (typeof window.openAssetChart === 'function') window.openAssetChart(`${k}.SA`, `${d.nome} (${k})`, d.tickers.map((x) => [`${x}.SA`, x]), (s) => quotes.get(s.replace(/\.SA$/, '')));
    }));
  }

  // barras agrupadas: receita (cinza-azulado) e lucro (verde; vermelho se prejuízo), com eixo no zero
  function chart(cols) {
    const pts = cols.filter((c) => ok(c.r.receita) || ok(c.r.lucro));
    if (!pts.length) return '<div class="fd-msg">Sem números para o gráfico.</div>';
    const W = 560, H = 236, L = 8, R = 8, T = 22, B = 40;
    const vals = pts.flatMap((c) => [c.r.receita, c.r.lucro].filter(ok));
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    // rótulos só com o número (a unidade vai no canto do gráfico), para não encostarem nas barras vizinhas
    const [dv, un] = Math.max(...vals.map(Math.abs)) >= 1e9 ? [1e9, 'bi'] : [1e6, 'mi'];
    const rot = (v) => { const a = Math.abs(v) / dv; return (v < 0 ? '−' : '') + nf(a, a >= 100 ? 0 : 1); };
    const span = max - min || 1;
    const y = (v) => T + (max - v) / span * (H - T - B);
    const gw = (W - L - R) / pts.length, bw = Math.min(34, gw * 0.32);
    const bars = pts.map((c, i) => {
      const x0 = L + gw * i + gw / 2;
      const one = (v, dx, cls) => {
        if (!ok(v)) return '';
        const y1 = y(Math.max(v, 0)), y2 = y(Math.min(v, 0));
        return `<rect class="${cls}${v < 0 ? ' neg' : ''}" x="${(x0 + dx).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="3"><title>${esc(c.k)}: ${esc(brl(v))}</title></rect>`
          + `<text class="fd-cv" x="${(x0 + dx + bw / 2).toFixed(1)}" y="${(v < 0 ? y2 + 11 : y1 - 4).toFixed(1)}">${esc(rot(v))}</text>`;
      };
      return one(c.r.receita, -bw - 2, 'r') + one(c.r.lucro, 2, 'l')
        + `<text class="fd-cx${c.ttm ? ' ttm' : ''}" x="${x0.toFixed(1)}" y="${H - 8}">${esc(c.k)}</text>`;
    }).join('');
    return `<svg class="fd-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Receita e lucro por ano">
      <text class="fd-un" x="${L}" y="12">em R$ ${un}</text>
      <line class="fd-zero" x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>${bars}</svg>`;
  }

  function renderRanking() {
    const body = root.querySelector('#fd-body');
    const setores = [...new Set(idx.empresas.map((e) => setorDe(e.setor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const row = (e) => ({ ...e, margem: div(e.lucro, e.receita, 100), roe: div(e.lucro, e.pl, 100), alav: e.fin ? null : div(e.div_liq, e.pl) });
    let rows = idx.empresas.map((e) => ({ ...e, setor: setorDe(e.setor) })).filter((e) => !prefs.setor || e.setor === prefs.setor).map(row);
    const k = prefs.sort, dir = prefs.dir;
    rows.sort((a, b) => {
      const va = a[k], vb = b[k];
      if (k === 'nome' || k === 'setor') return dir * String(va || '').localeCompare(String(vb || ''), 'pt-BR');
      if (!ok(va) && !ok(vb)) return 0; if (!ok(va)) return 1; if (!ok(vb)) return -1;
      return dir * (va - vb);
    });
    const th = (key, label, cls = '') => `<th class="${cls} ${k === key ? 'on' : ''}" data-k="${key}" tabindex="0" aria-sort="${k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    body.innerHTML = `
      <div class="fd-rk-bar">
        <label>Setor <select id="fd-setor"><option value="">Todos (${idx.empresas.length})</option>${setores.map((s) => `<option ${s === prefs.setor ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <span>${rows.length} empresas · números dos últimos 12 meses · clique numa linha para abrir</span>
      </div>
      <div class="fd-box fd-rk"><table>
        <thead><tr>${th('nome', 'Empresa')}${th('setor', 'Setor', 'hide-s')}${th('receita', 'Receita', 'n')}${th('lucro', 'Lucro', 'n')}${th('margem', 'Margem', 'n')}${th('roe', 'ROE', 'n')}${th('alav', 'Dív. líq./PL', 'n hide-s')}</tr></thead>
        <tbody>${rows.slice(0, 400).map((e) => `<tr data-cvm="${esc(e.cvm)}" tabindex="0">
          <td><b>${esc(e.tickers[0] || '')}</b> <span>${esc(e.nome)}</span></td>
          <td class="hide-s">${esc(e.setor || '—')}</td>
          <td class="n">${esc(brl(e.receita))}</td>
          <td class="n ${ok(e.lucro) && e.lucro < 0 ? 'dn' : ''}">${esc(brl(e.lucro))}</td>
          <td class="n">${esc(pc(e.margem))}</td>
          <td class="n">${esc(pc(e.roe))}</td>
          <td class="n hide-s">${esc(e.fin ? 'n/a' : xx(e.alav, 2))}</td></tr>`).join('')}</tbody>
      </table></div>`;
    body.querySelector('#fd-setor').addEventListener('change', (e) => { prefs.setor = e.target.value; savePrefs(); renderRanking(); });
    const sortBy = (key) => { if (prefs.sort === key) prefs.dir = -prefs.dir; else { prefs.sort = key; prefs.dir = key === 'nome' || key === 'setor' ? 1 : -1; } savePrefs(); renderRanking(); };
    body.querySelectorAll('th[data-k]').forEach((h) => {
      h.addEventListener('click', () => sortBy(h.dataset.k));
      h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(h.dataset.k); } });
    });
    body.querySelectorAll('tr[data-cvm]').forEach((tr) => {
      const go = () => { prefs.view = 'empresa'; open(tr.dataset.cvm); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  }

  async function open(cvm) {
    prefs.cvm = cvm; savePrefs();
    const body = root.querySelector('#fd-body');
    body.innerHTML = '<div class="fd-msg">Carregando balanço…</div>';
    try {
      const d = await loadDoc(cvm);
      cur = d;
      render();
      await loadQuotes(d.tickers);
      if (cur === d && prefs.view === 'empresa') renderEmpresa(d);
    } catch (e) {
      body.innerHTML = '<div class="fd-msg">Não foi possível carregar o balanço desta empresa agora. Tente de novo em instantes.</div>';
    }
  }

  /* ---------------- estilo ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  .fd-wrap { padding:10px 18px 28px; display:flex; flex-direction:column; gap:12px; }
  #fd-body { display:flex; flex-direction:column; gap:12px; min-width:0; }
  #fd-body > .fd-ref { margin-top:-6px; }
  .fd-bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .fd-search { position:relative; flex:1 1 320px; max-width:560px; }
  .fd-search > i { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3); font-size:12px; pointer-events:none; }
  .fd-search input { width:100%; height:38px; padding:0 12px 0 34px; border-radius:10px; border:1px solid var(--line-2); background:var(--surface); color:var(--text); font:inherit; font-size:13.5px; }
  .fd-search input:focus { outline:2px solid var(--accent); outline-offset:-1px; }
  .fd-sug { position:absolute; left:0; right:0; top:42px; z-index:30; background:var(--surface); border:1px solid var(--line-2); border-radius:10px; box-shadow:var(--shadow-lg); overflow:hidden; }
  .fd-sug button { display:flex; gap:10px; align-items:baseline; width:100%; padding:9px 12px; border:0; background:none; color:var(--text-2); font:inherit; font-size:12.5px; text-align:left; cursor:pointer; }
  .fd-sug button b { font:600 12px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; }
  .fd-sug button span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .fd-sug button.hi, .fd-sug button:hover { background:var(--surface-2); }
  .fd-none { padding:10px 12px; color:var(--text-3); font-size:12.5px; }
  .fd-views { display:inline-flex; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .fd-views button { padding:8px 16px; border:0; background:var(--surface); color:var(--text-3); font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
  .fd-views button.on { background:var(--surface-2); color:var(--accent); }
  .fd-pop { display:flex; gap:6px; flex-wrap:wrap; }
  .fd-pop button { padding:5px 11px; border-radius:99px; border:1px solid var(--line); background:var(--surface); color:var(--text-2); font:600 11.5px 'JetBrains Mono', monospace; cursor:pointer; }
  .fd-pop button:hover { border-color:var(--line-2); }
  .fd-pop button.on { border-color:var(--accent); color:var(--accent); }
  .fd-msg { padding:48px 16px; text-align:center; color:var(--text-3); font-size:13px; line-height:1.6; }
  .fd-msg b { color:var(--text-2); }
  .fd-head { display:flex; gap:16px; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; }
  .fd-id h2 { margin:0; font-size:20px; font-weight:700; color:var(--text); letter-spacing:-.01em; }
  .fd-meta { font-size:12px; color:var(--text-3); margin-top:2px; }
  .fd-tks { display:flex; gap:8px; flex-wrap:wrap; }
  .fd-tk { display:inline-flex; align-items:baseline; gap:8px; padding:7px 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--text-2); font:inherit; cursor:pointer; }
  .fd-tk:hover { border-color:var(--line-2); }
  .fd-tk b { font:600 12.5px 'JetBrains Mono', monospace; color:var(--text); }
  .fd-tk span { font:600 13px 'JetBrains Mono', monospace; }
  .fd-tk em { font:normal 11.5px 'JetBrains Mono', monospace; }
  .fd-wrap .up { color:var(--pos); } .fd-wrap .dn { color:var(--neg); } .fd-wrap .eq { color:var(--text-3); }
  .fd-ref { font-size:12px; color:var(--text-3); }
  .fd-ref b { color:var(--text-2); }
  .fd-kpis { display:grid; grid-template-columns:repeat(auto-fill, minmax(165px, 1fr)); gap:10px; }
  .fd-kpi { display:flex; flex-direction:column; gap:3px; padding:11px 13px; border:1px solid var(--line); border-radius:12px; background:var(--surface); min-width:0; }
  .fd-kpi span { font-size:11.5px; color:var(--text-3); }
  .fd-kpi b { font:600 19px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-.02em; }
  .fd-kpi small { font-size:10.5px; color:var(--text-3); line-height:1.35; }
  .fd-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr); gap:12px; align-items:start; }
  .fd-box { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; min-width:0; }
  .fd-bh { display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--surface-2) 70%, transparent); }
  .fd-bh h3 { margin:0; flex:1; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  .fd-leg { font-size:11px; color:var(--text-3); display:inline-flex; align-items:center; gap:6px; }
  .fd-leg i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-left:6px; }
  .fd-leg i.r, .fd-chart rect.r { background:#5b7bb5; fill:#5b7bb5; }
  .fd-leg i.l, .fd-chart rect.l { background:var(--pos); fill:var(--pos); }
  .fd-chart rect.l.neg { fill:var(--neg); }
  .fd-chart { display:block; width:100%; height:auto; padding:6px 4px 0; }
  .fd-chart .fd-zero { stroke:var(--line-2); stroke-width:1; }
  .fd-chart text { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); text-anchor:middle; }
  .fd-chart text.fd-cx { font-size:11px; fill:var(--text-2); }
  .fd-chart text.fd-un { text-anchor:start; font-size:10px; }
  .fd-chart text.fd-cx.ttm { fill:var(--accent); font-weight:600; }
  .fd-tbl { overflow-x:auto; }
  .fd-tbl table, .fd-rk table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .fd-tbl th, .fd-tbl td { padding:8px 10px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .fd-tbl td { font-family:'JetBrains Mono', monospace; font-size:12px; color:var(--text); }
  .fd-tbl tbody th { text-align:left; font-weight:500; color:var(--text-2); position:sticky; left:0; background:var(--surface); }
  .fd-tbl thead th { font-size:11px; color:var(--text-3); font-weight:600; }
  .fd-tbl thead th small { display:block; font-weight:400; font-size:10px; }
  .fd-tbl .ttm { background:color-mix(in srgb, var(--accent) 7%, transparent); }
  .fd-tbl thead th.ttm { color:var(--accent); }
  .fd-tbl tr:last-child th, .fd-tbl tr:last-child td { border-bottom:0; }
  .fd-rk-bar { display:flex; gap:14px; align-items:center; flex-wrap:wrap; font-size:12px; color:var(--text-3); }
  .fd-rk-bar select { height:32px; margin-left:6px; padding:0 10px; border-radius:9px; background:var(--surface); color:var(--text); border:1px solid var(--line-2); font:inherit; font-size:12.5px; max-width:260px; }
  .fd-rk { overflow-x:auto; }
  .fd-rk th, .fd-rk td { padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
  .fd-rk th { font-size:11px; color:var(--text-3); font-weight:600; cursor:pointer; user-select:none; position:sticky; top:0; background:var(--surface); }
  .fd-rk th.on { color:var(--accent); }
  .fd-rk .n { text-align:right; font-family:'JetBrains Mono', monospace; font-size:12px; font-variant-numeric:tabular-nums; }
  .fd-rk td b { font:600 12px 'JetBrains Mono', monospace; color:var(--text); margin-right:6px; }
  .fd-rk td span { color:var(--text-2); }
  .fd-rk tbody tr { cursor:pointer; }
  .fd-rk tbody tr:hover { background:var(--surface-2); }
  .fd-rk tbody tr:focus-visible, .fd-tk:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
  .fd-rk td:first-child { max-width:340px; overflow:hidden; text-overflow:ellipsis; }
  .fd-wrap.eua > .fd-bar > .fd-search, .fd-wrap.eua > .fd-pop { display:none; }
  .fd-foot { margin:0; font-size:11px; color:var(--text-3); line-height:1.6; }
  .fd-foot a { color:var(--text-2); }
  @media (max-width: 1100px) { .fd-grid { grid-template-columns:minmax(0,1fr); } }
  @media (max-width: 640px) {
    .fd-wrap { padding:8px 4px 20px; }
    .fd-views { width:100%; } .fd-views button { flex:1; }
    .fd-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .fd-kpi b { font-size:16px; }
    .fd-rk .hide-s { display:none; }
    .fd-rk td:first-child { max-width:160px; }
    .fd-id h2 { font-size:17px; }
  }`;
  document.head.appendChild(css);

  /* ---------------- início ---------------- */
  let booting = null, idxFalhou = false;
  function semIndice() {
    root.querySelector('#fd-body').innerHTML = `<div class="fd-msg">Os balanços ainda não estão disponíveis.<br>
      Eles são gerados toda semana a partir dos dados abertos da CVM pelo arquivo <b>cvm/gerar_fundamentos.py</b>.
      Quando a pasta <b>fundamentos/</b> estiver publicada, esta aba mostra as empresas automaticamente.</div>`;
  }
  // baixa o index.json uma vez; quem chama decide o que desenhar depois
  function boot() {
    if (!booting) booting = loadIndex().then((okIdx) => { idxFalhou = !okIdx; });
    return booting;
  }
  shell();
  if (prefs.view === 'ranking') {
    // o ranking precisa de uma empresa aberta para o botão Empresa voltar a ela
    boot().then(() => { if (idx && !cur) { const f = (prefs.cvm && idx.empresas.find((e) => e.cvm === prefs.cvm)) || idx.empresas[0]; if (f) loadDoc(f.cvm).then((d) => { cur = d; }).catch(() => {}); } });
  }
  render();
})();
