/* =========================================================
   IPOs DOS EUA (aba Calendário, botão "IPOs EUA"), 17/11/2026, pedido do Dante.
   Estreias previstas e recentes nas bolsas americanas: data, empresa, bolsa, faixa de preço,
   quantidade de ações e tamanho da oferta.
   Fonte: Finnhub (calendário de IPOs, plano gratuito), pelo worker (/finnhub/ipo; a chave fica lá),
   guardado 6 horas no worker. Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__ipoRender) return;
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const CACHE_KEY = 'ipo_cache_v1', PREF_KEY = 'ipo_prefs_v1', TTL = 60 * 60 * 1000;
  const MES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  // situação da oferta, como o Finnhub informa
  const ST = { expected: ['Prevista', 'prev'], priced: ['Estreou', 'ok'], filed: ['Pedido registrado', 'reg'], withdrawn: ['Cancelada', 'canc'] };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => typeof v === 'number' && isFinite(v);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const usd = (v) => (!ok(v) ? '—' : v >= 1e9 ? `US$ ${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi` : `US$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: v >= 1e8 ? 0 : 1 })} mi`);
  const acoes = (v) => (!ok(v) ? '—' : v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi de ações` : `${v.toLocaleString('pt-BR')} ações`);
  const faixa = (p) => { const t = String(p || '').trim(); if (!t) return '—'; const n = t.split('-').map((x) => Number(x)); return n.every((x) => isFinite(x) && x > 0) ? 'US$ ' + n.map((x) => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(' a ') : esc(t); };

  let prefs = { per: 'proximos', tam: 'todos' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  let root = null, busy = false, erro = '';

  function periodo(per) {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    const a = new Date(h), b = new Date(h);
    if (per === 'passados') a.setDate(a.getDate() - 30); else b.setDate(b.getDate() + 30);
    return [a, b];
  }

  async function load(force = false) {
    const [a, b] = periodo(prefs.per), key = `${iso(a)}_${iso(b)}`;
    const c = cache[key];
    if (!force && c && Date.now() - c.ts < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      const r = await fetchT(`${PROXY}/finnhub/ipo?from=${iso(a)}&to=${iso(b)}`, {}, 20000);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !Array.isArray(j.lista)) throw new Error((j && j.error) || `HTTP ${r.status}`);
      cache = { [key]: { ts: Date.now(), lista: j.lista } };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) {
      const m = String(e && e.message || '');
      erro = /HTTP 429/.test(m) ? 'Limite de consultas do Finnhub atingido. Tente de novo em um minuto.'
        : /Failed to fetch|NetworkError|aborted|Load failed/i.test(m) ? 'Sem resposta do servidor de dados.'
        : `Não foi possível buscar os IPOs (${m.slice(0, 80)}).`;
      console.warn('[IPOs]', m);
    } finally { busy = false; draw(); }
  }

  function draw() {
    if (!root) return;
    const [a, b] = periodo(prefs.per), key = `${iso(a)}_${iso(b)}`;
    const c = cache[key];
    let lista = c ? c.lista.slice() : [];
    if (prefs.tam === 'grandes') lista = lista.filter((e) => ok(e.v) && e.v >= 1e8);
    lista.sort((x, y) => (prefs.per === 'passados' ? y.d.localeCompare(x.d) : x.d.localeCompare(y.d)) || (y.v || 0) - (x.v || 0));
    const dias = [...new Set(lista.map((e) => e.d))];
    const hojeIso = iso(new Date());
    const chip = (k, v, l) => `<button class="ecal-chip${prefs[k] === v ? ' active' : ''}" data-k="${k}" data-v="${v}">${l}</button>`;
    const fmtDia = (d) => { const [y, m, dd] = d.split('-').map(Number); const dt = new Date(y, m - 1, dd); return `${DIAS[dt.getDay()]}, ${dd} de ${MES[m - 1]}${d === hojeIso ? ' · hoje' : ''}`; };
    const linha = (e) => {
      const st = ST[e.st] || [e.st || '—', 'reg'];
      return `<div class="ip-row${e.s ? '' : ' sem'}"${e.s ? ` data-sym="${esc(e.s)}" data-nome="${esc(e.n)}" tabindex="0" role="button" title="Ver gráfico de ${esc(e.s)}"` : ''}>
        <span class="ip-st ${st[1]}">${esc(st[0])}</span>
        <span class="ip-n"><b>${esc(e.s || '—')}</b><span>${esc(e.n)}</span>${e.b ? `<em>${esc(e.b)}</em>` : ''}</span>
        <span class="ip-v"><small>Preço por ação</small><b>${faixa(e.p)}</b>${ok(e.q) ? `<i>${esc(acoes(e.q))}</i>` : ''}</span>
        <span class="ip-v"><small>Tamanho da oferta</small><b>${esc(usd(e.v))}</b></span>
      </div>`;
    };
    const total = c ? c.lista.length : 0;
    root.innerHTML = `
      <div class="ip-bar">
        <div class="ecal-chips">${chip('per', 'proximos', 'Próximos 30 dias')}${chip('per', 'passados', 'Últimos 30 dias')}</div>
        <div class="ecal-chips">${chip('tam', 'todos', 'Todos')}${chip('tam', 'grandes', 'Acima de US$ 100 mi')}</div>
        <span class="ip-stt">${busy ? 'Atualizando…' : erro ? (c ? esc(erro) + ' Mostrando o último dado salvo.' : '') : c ? `${total} ${total === 1 ? 'oferta' : 'ofertas'} no período` : ''}</span>
      </div>
      <div class="ip-list">${!c ? `<div class="ip-msg">${busy ? 'Carregando IPOs…' : esc(erro || '—')}</div>`
        : !lista.length ? `<div class="ip-msg">${prefs.tam === 'grandes' ? 'Nenhuma oferta acima de US$ 100 milhões neste período.' : 'Nenhum IPO neste período.'}</div>`
        : dias.map((d) => `<div class="ip-day${d === hojeIso ? ' today' : ''}">${esc(fmtDia(d))}</div>${lista.filter((e) => e.d === d).map(linha).join('')}`).join('')}</div>
      <div class="calendar-footer"><span>IPOs fornecidos por </span><a href="https://finnhub.io" target="_blank" rel="noopener">Finnhub</a><span>. Bolsas americanas. "Prevista": data esperada, ainda pode mudar; "Estreou": ação já precificada; "Pedido registrado": a empresa pediu o registro, ainda sem data firme. Tamanho da oferta = ações × preço informado.</span></div>`;
    root.querySelectorAll('.ecal-chip[data-k]').forEach((btn) => btn.addEventListener('click', () => {
      prefs[btn.dataset.k] = btn.dataset.v; savePrefs();
      if (btn.dataset.k === 'per') load(); else draw();
    }));
    const abrir = (el) => { if (typeof window.openAssetChart === 'function') window.openAssetChart(el.dataset.sym, el.dataset.nome || el.dataset.sym, [{ s: el.dataset.sym, n: el.dataset.nome || el.dataset.sym }]); };
    root.querySelectorAll('.ip-row[data-sym]').forEach((el) => {
      el.addEventListener('click', () => abrir(el));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(el); } });
    });
  }

  window.__ipoRender = (el, force = false) => { root = el; load(force); };

  const css = document.createElement('style');
  css.textContent = `
  .ipos { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
  .ip-bar { display:flex; gap:10px 16px; align-items:center; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--line); }
  .ip-stt { margin-left:auto; font-size:11.5px; color:var(--text-3); }
  .ip-list { max-height:calc(100vh - 330px); min-height:420px; overflow:auto; }
  .ip-day { position:sticky; top:0; z-index:1; padding:7px 14px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-2); background:var(--surface-2); border-bottom:1px solid var(--line); }
  .ip-day.today { color:var(--accent); }
  .ip-row { display:grid; grid-template-columns:128px minmax(0,1.6fr) minmax(0,1fr) minmax(0,.8fr); gap:14px; align-items:center; padding:10px 14px; border-bottom:1px solid var(--line); cursor:pointer; }
  .ip-row.sem { cursor:default; }
  .ip-row[data-sym]:hover, .ip-row[data-sym]:focus-visible { background:var(--surface-2); outline:none; }
  .ip-st { justify-self:start; font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; border:1px solid var(--line-2); color:var(--text-2); white-space:nowrap; }
  .ip-st.prev { color:var(--accent); border-color:color-mix(in srgb, var(--accent) 45%, transparent); }
  .ip-st.ok { color:var(--pos); border-color:color-mix(in srgb, var(--pos) 45%, transparent); }
  .ip-st.canc { color:var(--neg); border-color:color-mix(in srgb, var(--neg) 45%, transparent); }
  .ip-n { display:flex; flex-direction:column; min-width:0; gap:2px; }
  .ip-n b { font:600 13px 'JetBrains Mono', monospace; color:var(--text); }
  .ip-n span { font-size:13px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ip-n em { font-style:normal; font-size:11px; color:var(--text-3); }
  .ip-v { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .ip-v small { font-size:10.5px; color:var(--text-3); text-transform:uppercase; letter-spacing:.04em; }
  .ip-v b { font:600 13px 'JetBrains Mono', monospace; color:var(--text); }
  .ip-v i { font-style:normal; font-size:11px; color:var(--text-3); }
  .ip-msg { padding:40px; text-align:center; color:var(--text-3); }
  @media (max-width:760px) { .ip-row { grid-template-columns:1fr 1fr; } .ip-st { grid-column:1 / -1; } .ip-n { grid-column:1 / -1; } }`;
  document.head.appendChild(css);
})();
