/* =========================================================
   BALANÇOS DOS EUA (aba Calendário, botão "Balanços EUA")
   Datas de divulgação de resultado das maiores empresas americanas e dos ADRs
   brasileiros, com lucro por ação (EPS) e receita: previsão x divulgado.
   Fonte: Finnhub (calendário de resultados), pelo worker (/finnhub/earnings; a chave fica lá).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__earnRender) return;
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const CACHE_KEY = 'earn_cache_v1';
  const PREF_KEY = 'earn_prefs_v1';
  const TTL = 30 * 60 * 1000;

  const NOMES = {
    AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', GOOGL: 'Alphabet (Google)', GOOG: 'Alphabet (Google) C', AMZN: 'Amazon', META: 'Meta', TSLA: 'Tesla',
    AVGO: 'Broadcom', 'BRK.B': 'Berkshire Hathaway', JPM: 'JPMorgan', V: 'Visa', MA: 'Mastercard', LLY: 'Eli Lilly', UNH: 'UnitedHealth', XOM: 'ExxonMobil',
    JNJ: 'Johnson & Johnson', WMT: 'Walmart', PG: 'Procter & Gamble', HD: 'Home Depot', COST: 'Costco', ORCL: 'Oracle', NFLX: 'Netflix', ABBV: 'AbbVie',
    BAC: 'Bank of America', KO: 'Coca-Cola', PEP: 'PepsiCo', CVX: 'Chevron', MRK: 'Merck', AMD: 'AMD', ADBE: 'Adobe', CRM: 'Salesforce', TMO: 'Thermo Fisher',
    ACN: 'Accenture', LIN: 'Linde', MCD: "McDonald's", CSCO: 'Cisco', ABT: 'Abbott', WFC: 'Wells Fargo', DIS: 'Disney', INTC: 'Intel', IBM: 'IBM',
    QCOM: 'Qualcomm', TXN: 'Texas Instruments', INTU: 'Intuit', AMAT: 'Applied Materials', MU: 'Micron', NOW: 'ServiceNow', ISRG: 'Intuitive Surgical',
    CAT: 'Caterpillar', GE: 'GE Aerospace', GS: 'Goldman Sachs', MS: 'Morgan Stanley', C: 'Citigroup', AXP: 'American Express', BLK: 'BlackRock',
    SCHW: 'Charles Schwab', PFE: 'Pfizer', AMGN: 'Amgen', GILD: 'Gilead', BMY: 'Bristol-Myers', T: 'AT&T', VZ: 'Verizon', CMCSA: 'Comcast', NKE: 'Nike',
    SBUX: 'Starbucks', BA: 'Boeing', LMT: 'Lockheed Martin', RTX: 'RTX', HON: 'Honeywell', UPS: 'UPS', UNP: 'Union Pacific', DE: 'Deere', MMM: '3M',
    PM: 'Philip Morris', MO: 'Altria', UBER: 'Uber', ABNB: 'Airbnb', PYPL: 'PayPal', SHOP: 'Shopify', PLTR: 'Palantir', SNOW: 'Snowflake',
    PANW: 'Palo Alto Networks', CRWD: 'CrowdStrike', ARM: 'Arm', SMCI: 'Super Micro', DELL: 'Dell', HPQ: 'HP', F: 'Ford', GM: 'General Motors',
    COP: 'ConocoPhillips', SLB: 'SLB', OXY: 'Occidental', FCX: 'Freeport-McMoRan', NEM: 'Newmont', BHP: 'BHP', RIO: 'Rio Tinto',
    PBR: 'Petrobras (ADR)', VALE: 'Vale (ADR)', ITUB: 'Itaú (ADR)', BBD: 'Bradesco (ADR)', NU: 'Nubank', XP: 'XP Inc.', STNE: 'StoneCo', PAGS: 'PagSeguro',
    MELI: 'Mercado Livre', ABEV: 'Ambev (ADR)', SBS: 'Sabesp (ADR)', GGB: 'Gerdau (ADR)', SID: 'CSN (ADR)', ERJ: 'Embraer (ADR)', CIG: 'Cemig (ADR)',
    BSBR: 'Santander Brasil (ADR)', UGP: 'Ultrapar (ADR)', TIMB: 'TIM Brasil (ADR)', BAK: 'Braskem (ADR)', EBR: 'Eletrobras (ADR)', VIV: 'Vivo (ADR)',
    SUZ: 'Suzano (ADR)', BRFS: 'BRF (ADR)'
  };
  const BR = new Set(['PBR', 'VALE', 'ITUB', 'BBD', 'NU', 'XP', 'STNE', 'PAGS', 'MELI', 'ABEV', 'SBS', 'GGB', 'SID', 'ERJ', 'CIG', 'BSBR', 'UGP', 'TIMB', 'BAK', 'EBR', 'VIV', 'SUZ', 'BRFS']);
  const HORA = { bmo: ['Antes da abertura', 'pre'], amc: ['Depois do fechamento', 'pos'], dmh: ['Durante o pregão', 'dur'] };
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, d = 2) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const usd = (v) => (!ok(v) ? '—' : Math.abs(v) >= 1e9 ? `US$ ${nf(v / 1e9, 1)} bi` : Math.abs(v) >= 1e6 ? `US$ ${nf(v / 1e6, 0)} mi` : `US$ ${nf(v, 0)}`);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const surpresa = (a, e) => (ok(a) && ok(e) && e !== 0 ? (a - e) / Math.abs(e) * 100 : null);

  let prefs = { per: 'semana', grupo: 'todas' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  let root = null, busy = false, erro = '';

  // períodos: semana atual (seg a dom), próxima semana, últimos 14 dias
  function periodo(k) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    if (k === 'proxima') { const a = new Date(seg); a.setDate(seg.getDate() + 7); const b = new Date(a); b.setDate(a.getDate() + 6); return [a, b]; }
    if (k === 'passadas') { const a = new Date(hoje); a.setDate(hoje.getDate() - 14); const b = new Date(hoje); b.setDate(hoje.getDate() - 1); return [a, b]; }
    const b = new Date(seg); b.setDate(seg.getDate() + 6); return [seg, b];
  }

  async function load(force = false) {
    const [a, b] = periodo(prefs.per), key = `${iso(a)}_${iso(b)}`;
    const c = cache[key];
    if (!force && c && Date.now() - c.ts < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      const r = await fetchT(`${PROXY}/finnhub/earnings?from=${iso(a)}&to=${iso(b)}`, {}, 20000);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !Array.isArray(j.lista)) throw new Error((j && j.error) || `HTTP ${r.status}`);
      cache = { [key]: { ts: Date.now(), lista: j.lista, fonte: j.fonte || 'finnhub' } };   // guarda só o período aberto
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) {
      const m = String(e && e.message || '');
      erro = /FINNHUB_API_KEY/.test(m) ? 'A chave do Finnhub não está no worker. Crie o secret FINNHUB_API_KEY e publique de novo.'
        : /url ausente/i.test(m) ? 'O worker publicado ainda é a versão antiga, sem a rota dos balanços. Publique o shrill-meadow-89c1.js novo.'
        : /Origem/i.test(m) ? 'O worker recusou o endereço deste site (trava de origem).'
        : /HTTP 40[13]/.test(m) ? 'O Finnhub recusou a chave. Confira se ela foi colada certa no secret FINNHUB_API_KEY.'
        : /HTTP 429/.test(m) ? 'Limite de consultas do Finnhub atingido. Tente de novo em um minuto.'
        : /Failed to fetch|NetworkError|aborted|Load failed/i.test(m) ? 'Sem resposta do worker. Verifique se ele está publicado.'
        : `Não foi possível buscar os balanços (${m.slice(0, 80)}).`;
      console.warn('[balanços]', m);
    } finally { busy = false; draw(); }
  }

  function draw() {
    if (!root) return;
    const [a, b] = periodo(prefs.per), key = `${iso(a)}_${iso(b)}`;
    const c = cache[key];
    let lista = c ? c.lista.slice() : [];
    if (prefs.grupo === 'br') lista = lista.filter((e) => BR.has(e.s));
    const ordemH = { bmo: 0, dmh: 1, amc: 2, '': 3 };
    lista.sort((x, y) => x.d.localeCompare(y.d) || (ordemH[x.h] ?? 3) - (ordemH[y.h] ?? 3) || x.s.localeCompare(y.s));
    const dias = [...new Set(lista.map((e) => e.d))];
    const hojeIso = iso(new Date());
    const chip = (k, v, l) => `<button class="ecal-chip${prefs[k] === v ? ' active' : ''}" data-k="${k}" data-v="${v}">${l}</button>`;
    const fmtDia = (d) => { const [y, m, dd] = d.split('-').map(Number); const dt = new Date(y, m - 1, dd); return `${DIAS[dt.getDay()]}, ${dd} de ${MES[m - 1]}${d === hojeIso ? ' · hoje' : ''}`; };
    const linha = (e) => {
      const h = HORA[e.h] || ['Horário não informado', 'na'];
      const sE = surpresa(e.ea, e.ee), sR = surpresa(e.ra, e.re);
      const cl = (v) => (!ok(v) ? '' : v > 0 ? 'up' : v < 0 ? 'dn' : '');
      return `<div class="er-row" data-sym="${esc(e.s)}" tabindex="0" role="button" title="Ver gráfico de ${esc(e.s)}">
        <span class="er-h ${h[1]}" title="${esc(h[0])}">${esc(h[0])}</span>
        <span class="er-n"><b>${esc(e.s)}</b><span>${esc(NOMES[e.s] || e.s)}</span>${ok(e.q) ? `<em>${e.q}º tri/${e.y}</em>` : ''}</span>
        <span class="er-v"><small>Lucro por ação</small>${ok(e.ea) ? `<b class="${cl(sE)}">${nf(e.ea)}</b><i>prev. ${nf(e.ee)}${ok(sE) ? ` · ${sE > 0 ? '+' : ''}${nf(sE, 1)}%` : ''}</i>` : `<b class="na">prev. ${nf(e.ee)}</b><i>ainda não saiu</i>`}</span>
        <span class="er-v"><small>Receita</small>${ok(e.ra) ? `<b class="${cl(sR)}">${usd(e.ra)}</b><i>prev. ${usd(e.re)}${ok(sR) ? ` · ${sR > 0 ? '+' : ''}${nf(sR, 1)}%` : ''}</i>` : `<b class="na">prev. ${usd(e.re)}</b><i>ainda não saiu</i>`}</span>
      </div>`;
    };
    root.innerHTML = `
      <div class="er-bar">
        <div class="ecal-chips">${chip('per', 'passadas', 'Últimos 14 dias')}${chip('per', 'semana', 'Esta semana')}${chip('per', 'proxima', 'Próxima semana')}</div>
        <div class="ecal-chips">${chip('grupo', 'todas', 'Todas')}${chip('grupo', 'br', 'Brasileiras (ADR)')}</div>
        <span class="er-st">${busy ? 'Atualizando…' : erro ? (c ? esc(erro) + ' Mostrando o último dado salvo.' : '') : c ? `Atualizado às ${new Date(c.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>
      <div class="er-list">${!c ? `<div class="er-msg">${busy ? 'Carregando balanços…' : esc(erro || '—')}</div>`
        : !lista.length ? '<div class="er-msg">Nenhuma das empresas acompanhadas divulga resultado neste período.</div>'
        : dias.map((d) => `<div class="er-day${d === hojeIso ? ' today' : ''}">${esc(fmtDia(d))}</div>${lista.filter((e) => e.d === d).map(linha).join('')}`).join('')}</div>
      <div class="calendar-footer"><span>Balanços fornecidos por </span>${c && c.fonte === 'fmp' ? '<a href="https://site.financialmodelingprep.com" target="_blank" rel="noopener">Financial Modeling Prep</a><span> (reserva, usada quando o Finnhub não responde; sem horário de divulgação)</span>' : '<a href="https://finnhub.io" target="_blank" rel="noopener">Finnhub</a>'}<span>. Mostra as maiores empresas dos EUA e os ADRs brasileiros. Horários de Nova York; valores em dólar.</span></div>`;
    root.querySelectorAll('.ecal-chip[data-k]').forEach((btn) => btn.addEventListener('click', () => {
      prefs[btn.dataset.k] = btn.dataset.v; savePrefs();
      if (btn.dataset.k === 'per') load(); else draw();
    }));
    const abrir = (el) => {
      const s = el.dataset.sym;
      if (typeof window.openAssetChart === 'function') window.openAssetChart(s, NOMES[s] || s, [...new Set(lista.map((e) => e.s))].map((x) => ({ s: x, n: NOMES[x] || x })));
    };
    root.querySelectorAll('.er-row').forEach((el) => {
      el.addEventListener('click', () => abrir(el));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(el); } });
    });
  }

  window.__earnRender = (el, force = false) => { root = el; load(force); };

  const css = document.createElement('style');
  css.textContent = `
  .earn { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
  .er-bar { display:flex; gap:10px 16px; align-items:center; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--line); }
  .er-st { margin-left:auto; font-size:11.5px; color:var(--text-3); }
  .er-list { max-height:calc(100vh - 330px); min-height:420px; overflow:auto; }
  .er-day { position:sticky; top:0; z-index:1; padding:7px 14px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-2); background:var(--surface-2); border-bottom:1px solid var(--line); }
  .er-day.today { color:var(--accent); }
  .er-row { display:grid; grid-template-columns:150px minmax(0,1fr) 170px 190px; gap:12px; align-items:center; padding:9px 14px; border-bottom:1px solid var(--line); cursor:pointer; }
  .er-row:hover { background:var(--surface-2); }
  .er-row:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
  .er-h { font-size:11px; color:var(--text-3); display:inline-flex; align-items:center; gap:6px; }
  .er-h::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--line-2); flex:0 0 7px; }
  .er-h.pre::before { background:var(--info); } .er-h.pos::before { background:var(--accent); } .er-h.dur::before { background:var(--pos); }
  .er-n { display:flex; align-items:baseline; gap:8px; min-width:0; }
  .er-n b { font:600 12.5px 'JetBrains Mono', monospace; color:var(--text); }
  .er-n span { color:var(--text-2); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .er-n em { font-style:normal; font-size:10.5px; color:var(--text-3); white-space:nowrap; }
  .er-v { display:flex; flex-direction:column; align-items:flex-end; min-width:0; }
  .er-v small { font-size:10px; color:var(--text-3); }
  .er-v b { font:600 13px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; }
  .er-v b.up { color:var(--pos); } .er-v b.dn { color:var(--neg); } .er-v b.na { color:var(--text-3); font-weight:500; }
  .er-v i { font-style:normal; font-size:10.5px; color:var(--text-3); white-space:nowrap; }
  .er-msg { padding:48px 16px; text-align:center; color:var(--text-3); font-size:13px; }
  .earn .calendar-footer { margin:0; border:0; border-top:1px solid var(--line); border-radius:0; }
  @media (max-width: 760px) {
    .er-list { max-height:none; min-height:0; }
    .er-row { grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; }
    .er-h { grid-column:1 / -1; }
    .er-n { flex-wrap:wrap; }
    .er-v:last-child { grid-column:2; }
    .er-st { margin-left:0; width:100%; }
  }`;
  document.head.appendChild(css);
})();
