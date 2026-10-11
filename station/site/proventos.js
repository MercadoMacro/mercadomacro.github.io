/* =========================================================
   AGENDA DE PROVENTOS (aba Calendário, botão "Proventos")
   Dividendos, JCP e rendimentos das empresas da B3: data com, pagamento e valor por ação,
   com o aviso aos acionistas da CVM quando houver.
   Fonte: proventos/agenda.json, gravado duas vezes por dia útil pelo robô do GitHub
   (B3: proventos em dinheiro de cada empresa; CVM: dados abertos IPE).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—" ou "a definir".
   ========================================================= */
(() => {
  if (window.__provRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/proventos/agenda.json', 'proventos/agenda.json'];
  const CACHE_KEY = 'prov_cache_v1';
  const PREF_KEY = 'prov_prefs_v1';
  const TTL = 30 * 60 * 1000;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  // valor por ação: até 8 casas como a B3 informa, sem zeros sobrando
  const valor = (v) => (ok(v) ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : '—');
  const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diaLongo = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${DIAS[d.getUTCDay()]}, ${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}`; };
  const MINUSC = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const nomeCurto = (s) => String(s || '').replace(/\s+(S\.?A\.?|S\/A)\.?$/i, '').trim().split(/\s+/).map((w, i) => {
    const l = w.toLocaleLowerCase('pt-BR');
    if (i && MINUSC.has(l)) return l;
    if ((w.length <= 3 || /\./.test(w)) && w === w.toLocaleUpperCase('pt-BR') && /[A-Z]/.test(w)) return w;   // siglas
    return l.charAt(0).toLocaleUpperCase('pt-BR') + l.slice(1);
  }).join(' ');

  let prefs = { modo: 'prox', tipo: 'todos', ordem: 'pag', wl: false, q: '' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}), q: '' }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { const { q, ...p } = prefs; localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* cheio */ } };
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }
  let root = null, busy = false, erro = '';

  async function getJSON(url, ms = 20000) {
    const r = await fetchT(url, {}, ms);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`HTTP ${r.status}`);
    return j;
  }
  async function load(force = false) {
    if (!force && cache && Date.now() - cache.ts < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      let j = null;
      for (const u of URLS) { try { j = await getJSON(u); if (Array.isArray(j.eventos)) break; } catch (e) { j = null; } }
      if (!j) throw new Error('sem dados');
      cache = { ts: Date.now(), gerado: j.gerado, eventos: j.eventos || [], avisos: j.avisos || [] };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio: segue sem cache */ }
    } catch (e) {
      erro = 'Não foi possível buscar a agenda de proventos agora.';
    } finally { busy = false; draw(); }
  }

  function watchSet() {
    try { return new Set((JSON.parse(localStorage.getItem('trader_watchlist_v1') || '[]') || []).map((x) => String(x.s || '').replace(/\.SA$/i, '').toUpperCase())); } catch (e) { return new Set(); }
  }
  // aviso da CVM da mesma empresa, entregue perto da aprovação do provento
  function avisoDe(ev) {
    const ref = ev.aprov || ev.com || ev.pag;
    if (!ref || !cache.avisos) return null;
    let best = null, bd = Infinity;
    cache.avisos.forEach((a) => {
      if (a.cvm !== ev.cvm || !a.link) return;
      const d = Math.abs(Date.parse(a.data) - Date.parse(ref)) / 86400000;
      if (d <= 10 && d < bd) { bd = d; best = a; }
    });
    return best;
  }

  function filtrados() {
    const hoje = hojeISO();
    const wl = prefs.wl ? watchSet() : null;
    const q = prefs.q.trim().toUpperCase();
    return cache.eventos.filter((e) => {
      if (prefs.tipo === 'div' && e.tipo !== 'Dividendo') return false;
      if (prefs.tipo === 'jcp' && e.tipo !== 'JCP') return false;
      if (wl && !wl.has(e.tk)) return false;
      if (q && !e.tk.includes(q) && !String(e.emp || '').toUpperCase().includes(q)) return false;
      const ch = prefs.ordem === 'pag' ? e.pag : e.com;
      if (prefs.modo === 'prox') return prefs.ordem === 'pag' ? (!e.pag ? (e.com || '') >= addDays(hoje, -60) : e.pag >= hoje) : (e.com || '') >= hoje;
      return ch && ch < hoje && ch >= addDays(hoje, -120);
    }).sort((a, b) => {
      const ka = (prefs.ordem === 'pag' ? a.pag : a.com) || '9999', kb = (prefs.ordem === 'pag' ? b.pag : b.com) || '9999';
      return (prefs.modo === 'prox' ? ka.localeCompare(kb) : kb.localeCompare(ka)) || a.tk.localeCompare(b.tk);
    });
  }

  function draw() {
    if (!root) return;
    const chip = (grupo, v, l, t = '') => `<button class="ecal-chip${String(prefs[grupo]) === String(v) ? ' active' : ''}" data-g="${grupo}" data-v="${v}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`;
    const hoje = hojeISO();
    let corpo = '', resumo = '';
    if (cache && cache.eventos) {
      const evs = filtrados();
      const em7 = new Set(cache.eventos.filter((e) => e.com && e.com >= hoje && e.com <= addDays(hoje, 7)).map((e) => e.tk));
      const pag7 = new Set(cache.eventos.filter((e) => e.pag && e.pag >= hoje && e.pag <= addDays(hoje, 7)).map((e) => e.tk));
      resumo = `<div class="pv-kpis">
        <div><b>${em7.size}</b><span>ativos com data com nos próximos 7 dias</span></div>
        <div><b>${pag7.size}</b><span>ativos pagando nos próximos 7 dias</span></div>
        <div><b>${cache.eventos.filter((e) => (e.pag || '') >= hoje).length}</b><span>proventos anunciados ainda a pagar</span></div></div>`;
      if (!evs.length) {
        corpo = `<div class="er-msg">${prefs.wl ? 'Nenhum provento para os ativos da sua watchlist neste filtro.' : 'Nenhum provento neste filtro.'}</div>`;
      } else {
        // agrupa por dia da coluna escolhida (data com ou pagamento)
        const grupos = [];
        evs.forEach((e) => { const k = (prefs.ordem === 'pag' ? e.pag : e.com) || ''; const g = grupos[grupos.length - 1]; if (g && g.k === k) g.l.push(e); else grupos.push({ k, l: [e] }); });
        const linhas = grupos.map((g) => `<tr class="pv-dia"><th colspan="6">${g.k ? `${diaLongo(g.k)}${g.k === hoje ? ' <em>hoje</em>' : ''}` : 'Pagamento a definir'}<span>${g.l.length} ${g.l.length === 1 ? 'provento' : 'proventos'}</span></th></tr>` + g.l.map((e) => {
          const av = avisoDe(e);
          const pag = e.pag ? `${dmy(e.pag)}${e.pag === hoje ? ' <em>hoje</em>' : ''}` : '<span class="pv-tbd">a definir</span>';
          return `<tr class="pv-ev">
            <td class="pv-at"><button class="pv-tk" data-tk="${esc(e.tk)}" data-nm="${esc(nomeCurto(e.emp))}" title="Ver o gráfico de ${esc(e.tk)}">${esc(e.tk)}</button><small>${esc(nomeCurto(e.emp))}</small></td>
            <td class="pv-ti"><span class="pv-tp ${e.tipo === 'JCP' ? 'jcp' : e.tipo === 'Dividendo' ? 'div' : 'out'}">${esc(e.tipo)}</span></td>
            <td class="n pv-vl">${valor(e.valor)}</td>
            <td class="n pv-cm${prefs.ordem === 'com' ? ' k' : ''}" data-l="Data com">${e.com ? dmy(e.com) : '—'}</td>
            <td class="n pv-pg${prefs.ordem === 'pag' ? ' k' : ''}" data-l="Pagamento">${pag}</td>
            <td class="pv-av">${av ? `<a href="${esc(av.link)}" target="_blank" rel="noopener" title="${esc(av.cat)}: ${esc(av.assunto)}, ${dmy(av.data)}">CVM</a>` : '<span class="pv-tbd">—</span>'}</td></tr>`;
        }).join('')).join('');
        corpo = `<div class="pv-tbl"><table>
          <thead><tr><th>Ativo</th><th>Tipo</th><th class="n">Valor por ação</th><th class="n">Data com</th><th class="n">Pagamento</th><th>Aviso</th></tr></thead>
          <tbody>${linhas}</tbody></table></div>`;
      }
    }
    const gerado = cache && cache.gerado ? new Date(cache.gerado) : null;
    root.innerHTML = `
      <div class="er-bar">
        <div class="ecal-chips">${chip('modo', 'prox', 'Próximos')}${chip('modo', 'rec', 'Últimos 4 meses')}</div>
        <div class="ecal-chips">${chip('tipo', 'todos', 'Todos')}${chip('tipo', 'div', 'Dividendos')}${chip('tipo', 'jcp', 'JCP')}</div>
        <div class="ecal-chips">${chip('ordem', 'pag', 'Por pagamento')}${chip('ordem', 'com', 'Por data com', 'Último dia para comprar a ação e ter direito ao provento')}</div>
        <button class="ecal-chip${prefs.wl ? ' active' : ''}" data-wl="1" title="Só os ativos da sua watchlist">Minha watchlist</button>
        <input class="pv-busca" type="search" placeholder="Buscar ticker ou empresa" value="${esc(prefs.q)}" aria-label="Buscar ticker ou empresa">
        <span class="er-st">${busy ? 'Atualizando…' : erro ? (cache ? esc(erro) + ' Mostrando o último dado salvo.' : '') : gerado ? `Agenda gerada em ${gerado.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>
      ${resumo}
      <div class="pv-body">${corpo || `<div class="er-msg">${busy ? 'Carregando a agenda de proventos…' : esc(erro || '—')}</div>`}</div>
      <div class="calendar-footer"><span>Fontes: </span><a href="https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/empresas-listadas.htm" target="_blank" rel="noopener">B3, empresas listadas</a><span> (proventos em dinheiro) e </span><a href="https://dados.cvm.gov.br/dataset/cia_aberta-doc-ipe" target="_blank" rel="noopener">CVM, dados abertos</a><span> (avisos aos acionistas). Valores brutos por ação, como informados pela B3. Quem tem a ação no fim do pregão da data com recebe o provento. Empresas da aba Fundamentos; atualizado às 7h e às 19h dos dias úteis.</span></div>`;
    root.querySelectorAll('.ecal-chip[data-g]').forEach((b) => b.addEventListener('click', () => { prefs[b.dataset.g] = b.dataset.v; savePrefs(); draw(); }));
    root.querySelector('.ecal-chip[data-wl]')?.addEventListener('click', () => { prefs.wl = !prefs.wl; savePrefs(); draw(); });
    const busca = root.querySelector('.pv-busca');
    let t = null;
    busca?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { prefs.q = busca.value; draw(); const nb = root.querySelector('.pv-busca'); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); }, 200); });
    root.querySelectorAll('.pv-tk').forEach((b) => b.addEventListener('click', () => {
      if (typeof window.openAssetChart !== 'function') return;
      const lista = [...new Map([...root.querySelectorAll('.pv-tk')].map((x) => [x.dataset.tk, { s: x.dataset.tk + '.SA', n: x.dataset.nm }])).values()];
      window.openAssetChart(b.dataset.tk + '.SA', b.dataset.nm, lista);
    }));
  }

  window.__provRender = (el, force = false) => { root = el; load(force); };

  const css = document.createElement('style');
  css.textContent = `
  .prov { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
  .prov .er-bar { display:flex; gap:8px 14px; align-items:center; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--line); }
  .prov .er-st { margin-left:auto; font-size:11.5px; color:var(--text-3); }
  .prov .er-msg { padding:48px 16px; text-align:center; color:var(--text-3); font-size:13px; }
  .pv-busca { min-width:180px; flex:0 1 220px; padding:6px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font:inherit; font-size:12.5px; }
  .pv-kpis { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  .pv-kpis > div { padding:10px 14px; display:flex; flex-direction:column; gap:2px; }
  .pv-kpis > div + div { border-left:1px solid var(--line); }
  .pv-kpis b { font:700 20px 'JetBrains Mono', monospace; color:var(--text); }
  .pv-kpis span { font-size:11.5px; color:var(--text-3); }
  .pv-tbl { overflow-x:auto; max-height:70vh; overflow-y:auto; }
  .pv-tbl table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .pv-tbl th, .pv-tbl td { padding:7px 10px; border-bottom:1px solid var(--line); white-space:nowrap; text-align:left; }
  .pv-tbl thead th { position:sticky; top:0; z-index:2; background:var(--surface); font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); }
  .pv-tbl .n { text-align:right; font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
  .pv-tbl td.k { color:var(--text); font-weight:700; }
  .pv-tbl td.n:not(.k) { color:var(--text-2); }
  .pv-dia th { background:color-mix(in srgb, var(--surface-2) 75%, transparent); font-size:11.5px; font-weight:700; color:var(--text-2); text-transform:capitalize; }
  .pv-dia th span { float:right; font-weight:500; color:var(--text-3); text-transform:none; }
  .pv-tbl em { font-style:normal; font-size:10px; font-weight:700; text-transform:uppercase; color:var(--accent); margin-left:6px; letter-spacing:.05em; }
  .pv-ev:hover { background:color-mix(in srgb, var(--accent) 5%, transparent); }
  .pv-at small { display:block; font-size:10.5px; color:var(--text-3); max-width:220px; overflow:hidden; text-overflow:ellipsis; }
  .pv-tk { border:0; background:none; padding:0; font:700 12.5px 'JetBrains Mono', monospace; color:var(--accent); cursor:pointer; }
  .pv-tk:hover { text-decoration:underline; }
  .pv-tp { display:inline-block; padding:2px 7px; border-radius:6px; font-size:11px; font-weight:600; }
  .pv-tp.div { background:color-mix(in srgb, var(--pos) 14%, transparent); color:var(--pos); }
  .pv-tp.jcp { background:color-mix(in srgb, var(--accent) 14%, transparent); color:var(--accent); }
  .pv-tp.out { background:color-mix(in srgb, var(--text-3) 14%, transparent); color:var(--text-2); }
  .pv-tbd { color:var(--text-3); font-family:inherit; }
  .pv-av a { font-size:11.5px; font-weight:600; color:var(--accent); text-decoration:none; border:1px solid var(--line); border-radius:6px; padding:2px 7px; }
  .pv-av a:hover { border-color:var(--accent); }
  .prov .calendar-footer { margin:0; border:0; border-top:1px solid var(--line); border-radius:0; }
  @media (max-width: 760px) {
    .prov .er-st { margin-left:0; width:100%; }
    .pv-busca { flex:1 1 100%; }
    .pv-kpis b { font-size:17px; } .pv-kpis > div { padding:8px 10px; }
    .pv-tbl th, .pv-tbl td { padding:7px 8px; }
    .pv-at small { max-width:130px; }
    .pv-tbl { max-height:none; overflow-x:visible; }
    .pv-tbl thead { display:none; }
    .pv-tbl table, .pv-tbl tbody { display:block; }
    .pv-dia { display:block; } .pv-dia th { display:block; }
    .pv-ev { display:grid; grid-template-columns:minmax(0,1fr) auto auto; grid-template-areas:"a v v" "t c p" "av c p"; gap:2px 12px; padding:8px 10px; border-bottom:1px solid var(--line); }
    .pv-ev td { border:0; padding:0; }
    .pv-at { grid-area:a; } .pv-vl { grid-area:v; align-self:center; } .pv-ti { grid-area:t; } .pv-av { grid-area:av; }
    .pv-cm { grid-area:c; } .pv-pg { grid-area:p; }
    .pv-cm, .pv-pg { display:flex; flex-direction:column; align-items:flex-end; justify-content:center; }
    .pv-cm::before, .pv-pg::before { content:attr(data-l); font-size:10px; font-weight:500; font-family:inherit; color:var(--text-3); text-transform:uppercase; letter-spacing:.04em; }
    .pv-at small { max-width:200px; }
  }`;
  document.head.appendChild(css);
})();
