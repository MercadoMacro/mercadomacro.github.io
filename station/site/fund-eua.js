/* =========================================================
   FUNDAMENTOS EUA (aba "Fundamentos", botão "EUA")
   Empresas americanas e ADRs: perfil, indicadores e séries anuais do Finnhub,
   pelo worker (/finnhub/fund e /finnhub/search; a chave fica lá).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__fundEua) return;
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const PREF_KEY = 'fund_eua_v1';
  const CACHE_KEY = 'fund_eua_cache_v1';
  const TTL = 6 * 3600 * 1000;
  const POP = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'BRK.B', 'PBR', 'VALE', 'NU', 'MELI', 'ITUB'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && v !== '' && isFinite(v);
  const nf = (v, d = 2) => (ok(v) ? (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pc = (v, d = 1) => (ok(v) ? `${nf(v, d)}%` : '—');
  const xx = (v, d = 1) => (ok(v) ? `${nf(v, d)}x` : '—');
  // valores do Finnhub em milhões
  const mi = (v, cur = 'USD') => {
    if (!ok(v)) return '—';
    const sym = cur === 'USD' ? 'US$' : cur || '';
    const a = Math.abs(v) * 1e6, s = v < 0 ? '−' : '';
    if (a >= 1e12) return `${s}${sym} ${nf(a / 1e12, 2)} tri`;
    if (a >= 1e9) return `${s}${sym} ${nf(a / 1e9, a >= 1e11 ? 0 : 1)} bi`;
    return `${s}${sym} ${nf(a / 1e6, 0)} mi`;
  };
  const first = (m, ...ks) => { for (const k of ks) if (ok(m[k])) return +m[k]; return null; };

  let prefs = { s: 'AAPL' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  const saveCache = () => {
    const ks = Object.keys(cache).sort((a, b) => cache[b].ts - cache[a].ts).slice(0, 12);   // guarda as 12 últimas
    cache = Object.fromEntries(ks.map((k) => [k, cache[k]]));
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
  };

  let root = null, foot = null, seq = 0;

  async function getJSON(url, ms = 20000) {
    const r = await fetchT(url, {}, ms);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error((j && j.error) || `HTTP ${r.status}`);
    return j;
  }
  const msgErro = (m) => (/FINNHUB_API_KEY/.test(m) ? 'A chave do Finnhub não está no worker.'
    : /url ausente/i.test(m) ? 'O worker publicado ainda é a versão antiga. Publique o shrill-meadow-89c1.js novo.'
    : /não encontrado/i.test(m) ? 'O Finnhub não tem dados para esse ticker.'
    : /HTTP 429/.test(m) ? 'Limite de consultas do Finnhub atingido. Tente de novo em um minuto.'
    : /HTTP 40[13]/.test(m) ? 'O Finnhub recusou a chave ou este dado não é do plano gratuito.'
    : 'Não foi possível buscar os dados agora.');

  function shell() {
    root.innerHTML = `
      <div class="fe-bar">
        <div class="fd-search">
          <i class="fas fa-search"></i>
          <input id="fe-q" type="search" placeholder="Ticker ou nome nos EUA (ex.: AAPL, Microsoft, PBR)" autocomplete="off" aria-label="Buscar empresa americana">
          <div class="fd-sug" id="fe-sug" role="listbox" hidden></div>
        </div>
      </div>
      <div class="fd-pop" id="fe-pop"></div>
      <div id="fe-body"></div>`;
    const q = root.querySelector('#fe-q'), sug = root.querySelector('#fe-sug');
    let hi = -1, list = [], timer = null, qseq = 0;
    const paint = () => {
      sug.innerHTML = list.length ? list.map((e, i) => `<button role="option" data-s="${esc(e.s)}" class="${i === hi ? 'hi' : ''}"><b>${esc(e.s)}</b><span>${esc(e.n || '')}</span></button>`).join('')
        : '<div class="fd-none">Nenhuma empresa encontrada</div>';
      sug.hidden = false;
    };
    const search = async () => {
      const t = q.value.trim();
      if (t.length < 1) { sug.hidden = true; return; }
      const my = ++qseq;
      try {
        const j = await getJSON(`${PROXY}/finnhub/search?q=${encodeURIComponent(t)}`, 10000);
        if (my !== qseq) return;
        list = j.lista || []; hi = list.length ? 0 : -1; paint();
      } catch (e) {
        if (my !== qseq) return;
        list = []; sug.innerHTML = `<div class="fd-none">${esc(msgErro(e.message))}</div>`; sug.hidden = false;
      }
    };
    const pick = (s) => { sug.hidden = true; q.value = ''; open(s); };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 300); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!sug.hidden && hi >= 0 && list[hi]) pick(list[hi].s);
        else if (/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(q.value.trim())) pick(q.value.trim().toUpperCase());
        return;
      }
      if (sug.hidden || !list.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        sug.querySelectorAll('button').forEach((b, i) => b.classList.toggle('hi', i === hi));
      } else if (e.key === 'Escape') sug.hidden = true;
    });
    sug.addEventListener('mousedown', (e) => { const b = e.target.closest('button[data-s]'); if (b) { e.preventDefault(); pick(b.dataset.s); } });
    q.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 150));
    root.querySelector('#fe-pop').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (b) open(b.dataset.s); });
  }

  function pop() {
    root.querySelector('#fe-pop').innerHTML = POP.map((s) => `<button data-s="${s}" class="${prefs.s === s ? 'on' : ''}">${s}</button>`).join('');
  }

  function setFoot(fonte) {
    if (!foot) return;
    const fmp = fonte === 'fmp';
    const nome = fmp ? '<a href="https://site.financialmodelingprep.com" target="_blank" rel="noopener">Financial Modeling Prep</a> (reserva, usada quando o Finnhub não responde)'
      : '<a href="https://finnhub.io" target="_blank" rel="noopener">Finnhub</a>';
    foot.innerHTML = `Fonte: ${nome}: perfil, indicadores e séries anuais; cotação com atraso.
      Os indicadores são calculados pela fonte a partir dos balanços entregues à SEC; para ADRs podem vir na moeda do balanço original. Não é recomendação de investimento.`;
  }

  async function open(s) {
    prefs.s = s; savePrefs(); pop();
    const my = ++seq;
    const body = root.querySelector('#fe-body');
    const c = cache[s];
    if (c && Date.now() - c.ts < TTL) { draw(c.d); return; }
    body.innerHTML = '<div class="fd-msg">Carregando dados…</div>';
    try {
      const d = await getJSON(`${PROXY}/finnhub/fund?s=${encodeURIComponent(s)}`);
      cache[s] = { ts: Date.now(), d }; saveCache();
      if (my === seq) draw(d);
    } catch (e) {
      if (my !== seq) return;
      if (c) { draw(c.d, msgErro(e.message) + ' Mostrando o último dado salvo.'); return; }
      body.innerHTML = `<div class="fd-msg">${esc(msgErro(e.message))}</div>`;
    }
  }

  function draw(d, aviso = '') {
    const body = root.querySelector('#fe-body');
    const p = d.perfil || {}, m = d.m || {}, a = d.anual || {}, q = d.cot;
    const cur = p.currency || 'USD';
    setFoot(d.fonte);
    const mcap = first(m, 'marketCapitalization') ?? first(p, 'marketCapitalization');
    const kp = [
      ['Valor de mercado', mi(mcap, 'USD'), ok(p.shareOutstanding) ? `${nf(p.shareOutstanding, 0)} mi de ações` : ''],
      ['P/L', xx(first(m, 'peTTM', 'peBasicExclExtraTTM', 'peExclExtraTTM')), 'preço ÷ lucro de 12 meses'],
      ['P/VP', xx(first(m, 'pbQuarterly', 'pbAnnual'), 2), 'preço ÷ patrimônio'],
      ['P/Receita', xx(first(m, 'psTTM', 'psAnnual'), 2), 'preço ÷ receita de 12 meses'],
      ['Dividend yield', pc(first(m, 'currentDividendYieldTTM', 'dividendYieldIndicatedAnnual'), 2), 'dividendos ÷ preço'],
      ['ROE', pc(first(m, 'roeTTM', 'roeRfy')), 'lucro de 12 meses ÷ patrimônio'],
      ['Margem líquida', pc(first(m, 'netProfitMarginTTM', 'netProfitMarginAnnual')), 'lucro ÷ receita, 12 meses'],
      ['Margem operacional', pc(first(m, 'operatingMarginTTM', 'operatingMarginAnnual')), 'resultado operacional ÷ receita'],
      ['Receita: crescimento', pc(first(m, 'revenueGrowthTTMYoy')), '12 meses contra os 12 anteriores'],
      ['Lucro por ação: crescimento', pc(first(m, 'epsGrowthTTMYoy')), '12 meses contra os 12 anteriores'],
      ['Dívida/Patrimônio', xx(first(m, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual'), 2), 'dívida total ÷ patrimônio'],
      ['Beta', nf(first(m, 'beta'), 2), 'oscilação contra o S&P 500']
    ];
    const lo = first(m, '52WeekLow'), hiw = first(m, '52WeekHigh'), px = q ? q.c : null;
    const faixa = ok(lo) && ok(hiw) && ok(px) && hiw > lo ? Math.max(0, Math.min(100, (px - lo) / (hiw - lo) * 100)) : null;

    // séries anuais: junta por ano (período AAAA-MM-DD)
    const anos = [...new Set(Object.values(a).flat().map((x) => String(x.period || '').slice(0, 4)).filter(Boolean))].sort().slice(-6);
    const val = (k, y) => { const it = (a[k] || []).find((x) => String(x.period).startsWith(y)); return it ? it.v : null; };
    const pctv = (v) => (ok(v) ? pc(v * 100) : '—');   // nas séries anuais o Finnhub manda margem e ROE como fração (0,25)
    const linhas = [
      ['Lucro por ação', (y) => nf(val('eps', y)), (y) => (ok(val('eps', y)) && val('eps', y) < 0 ? 'dn' : '')],
      ['Receita por ação', (y) => nf(val('salesPerShare', y))],
      ['Margem bruta', (y) => pctv(val('grossMargin', y))],
      ['Margem operacional', (y) => pctv(val('operatingMargin', y))],
      ['Margem líquida', (y) => pctv(val('netMargin', y)), (y) => (ok(val('netMargin', y)) && val('netMargin', y) < 0 ? 'dn' : '')],
      ['ROE', (y) => pctv(val('roe', y))],
      ['Dívida/Patrimônio', (y) => xx(val('totalDebtToEquity', y), 2)],
      ['P/L no fim do ano', (y) => xx(val('pe', y))]
    ];
    body.innerHTML = `
      <section class="fd-head">
        <div class="fd-id">
          <h2>${esc(p.name || d.s)}</h2>
          <div class="fd-meta">${esc(p.finnhubIndustry || 'Setor não informado')}${p.exchange ? ` · ${esc(p.exchange)}` : ''}${p.country ? ` · ${esc(p.country)}` : ''}${p.ipo ? ` · na bolsa desde ${esc(String(p.ipo).slice(0, 4))}` : ''}</div>
        </div>
        <div class="fd-tks">
          <button class="fd-tk" data-sym="${esc(d.s)}" title="Ver gráfico de ${esc(d.s)}"><b>${esc(d.s)}</b><span>${q ? `${cur === 'USD' ? 'US$' : esc(cur)} ${nf(q.c, 2)}` : '—'}</span>${q && ok(q.dp) ? `<em class="${q.dp > 0 ? 'up' : q.dp < 0 ? 'dn' : 'eq'}">${q.dp > 0 ? '+' : q.dp < 0 ? '−' : ''}${nf(Math.abs(q.dp), 2)}%</em>` : ''}</button>
          ${p.weburl ? `<a class="fd-tk fe-site" href="${esc(p.weburl)}" target="_blank" rel="noopener">Site da empresa</a>` : ''}
        </div>
      </section>
      ${aviso ? `<div class="fd-ref">${esc(aviso)}</div>` : ''}
      ${faixa != null ? `<div class="fe-52"><span>52 semanas</span><b>${nf(lo)}</b><div class="fe-52b"><i style="left:${faixa.toFixed(1)}%"></i></div><b>${nf(hiw)}</b></div>` : ''}
      <div class="fd-kpis">${kp.map(([n, v, s]) => `<div class="fd-kpi"><span>${esc(n)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join('')}</div>
      <div class="fd-grid">
        <section class="fd-box">
          <div class="fd-bh"><h3>Lucro por ação por ano</h3><span class="fd-leg">${esc(cur === 'USD' ? 'US$' : cur)}</span></div>
          ${chart(anos.map((y) => [y, val('eps', y)]))}
        </section>
        <section class="fd-box">
          <div class="fd-bh"><h3>Indicadores por ano</h3></div>
          ${anos.length ? `<div class="fd-tbl"><table>
            <thead><tr><th></th>${anos.map((y) => `<th>${esc(y)}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(([n, f, cl]) => `<tr><th>${esc(n)}</th>${anos.map((y) => `<td class="${cl ? cl(y) : ''}">${esc(f(y))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>` : '<div class="fd-msg">Sem séries anuais para esta empresa.</div>'}
        </section>
      </div>`;
    body.querySelector('.fd-tk[data-sym]')?.addEventListener('click', () => {
      if (typeof window.openAssetChart === 'function') window.openAssetChart(d.s, p.name || d.s, [{ s: d.s, n: p.name || d.s }]);
    });
  }

  function chart(pts) {
    pts = pts.filter(([, v]) => ok(v));
    if (!pts.length) return '<div class="fd-msg">Sem lucro por ação anual.</div>';
    const vals = pts.map(([, v]) => v), max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1;
    const W = 560, H = 220, L = 8, R = 8, T = 18, B = min < 0 ? 46 : 30;   // ano negativo: rótulo do valor abaixo da barra sem cobrir o ano
    const y = (v) => T + (max - v) / span * (H - T - B);
    const gw = (W - L - R) / pts.length, bw = Math.min(46, gw * 0.5);
    return `<svg class="fd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lucro por ação por ano">
      <line class="fd-zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"></line>
      ${pts.map(([k, v], i) => {
        const cx = L + gw * i + gw / 2, top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
        return `<rect class="l${v < 0 ? ' neg' : ''}" x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"></rect>
          <text x="${cx.toFixed(1)}" y="${(v < 0 ? top + h + 11 : top - 5).toFixed(1)}">${nf(v)}</text>
          <text class="fd-cx" x="${cx.toFixed(1)}" y="${H - 8}">${esc(k)}</text>`;
      }).join('')}
    </svg>`;
  }

  window.__fundEua = (el, footEl) => {
    foot = footEl;
    setFoot();
    if (root !== el || !el.querySelector('#fe-body')) { root = el; shell(); }
    pop();
    open(prefs.s);
  };

  const css = document.createElement('style');
  css.textContent = `
  #fd-eua { display:flex; flex-direction:column; gap:12px; }
  .fe-bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  #fe-body { display:flex; flex-direction:column; gap:12px; }
  a.fe-site { text-decoration:none; font-size:12px; align-items:center; }
  .fe-52 { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--text-3); max-width:520px; }
  .fe-52 b { font:600 12px 'JetBrains Mono', monospace; color:var(--text-2); }
  .fe-52b { position:relative; flex:1; height:6px; border-radius:3px; background:linear-gradient(90deg, color-mix(in srgb, var(--neg) 55%, transparent), color-mix(in srgb, var(--pos) 55%, transparent)); }
  .fe-52b i { position:absolute; top:-4px; width:3px; height:14px; margin-left:-1.5px; border-radius:2px; background:var(--text); }`;
  document.head.appendChild(css);
})();
