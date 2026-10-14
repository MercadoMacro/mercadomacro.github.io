/* =========================================================
   BALANÇOS DO BRASIL (aba Calendário, botão "Balanços Brasil")
   Quando cada empresa da B3 divulga o resultado do trimestre:
   - "Divulgado": a CVM recebeu o ITR ou a DFP nesse dia;
   - "Confirmada": a própria empresa anunciou a data num comunicado ao mercado;
   - "Provável": sem comunicado ainda, o mesmo dia da semana 52 semanas depois da entrega
     do mesmo trimestre no ano passado (só para quem entregou dentro do prazo).
   Fonte: balancos-br/agenda.json, gravado duas vezes por dia útil pelo robô do GitHub
   a partir da CVM Dados Abertos (ITR, DFP e IPE).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__bbrRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/balancos-br/agenda.json', 'balancos-br/agenda.json'];
  const CACHE_KEY = 'bbr_cache_v1';
  const PREF_KEY = 'bbr_prefs_v1';
  const TTL = 30 * 60 * 1000;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const PER = [['passadas', 'Últimos 14 dias'], ['semana', 'Esta semana'], ['proxima', 'Próxima semana'], ['mes', 'Próximos 30 dias']];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const ok = (v) => v != null && isFinite(v);
  const brl = (v) => {
    if (!ok(v)) return '—';
    const a = Math.abs(v), sg = v < 0 ? '−' : '';
    const f = (x, c) => x.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    if (a >= 1e9) return `${sg}R$ ${f(a / 1e9, a >= 1e11 ? 0 : 1)} bi`;
    if (a >= 1e6) return `${sg}R$ ${f(a / 1e6, 0)} mi`;
    return `${sg}R$ ${f(a / 1e3, 0)} mil`;
  };
  // variação contra o mesmo período do ano anterior; com prejuízo num dos lados a % não faz sentido
  const vari = (v, a) => {
    if (!ok(v) || !ok(a)) return '';
    if (a > 0 && v >= 0) { const p = (v / a - 1) * 100; return `<i class="${p >= 0 ? 'bb-up' : 'bb-dn'}">${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(p) < 10 ? 1 : 0 })}%</i>`; }
    if (a > 0 && v < 0) return '<i class="bb-dn">virou prejuízo</i>';
    if (a < 0 && v > 0) return '<i class="bb-up">saiu do prejuízo</i>';
    if (a < 0 && v < 0) return `<i class="${v > a ? 'bb-up' : 'bb-dn'}">${v > a ? 'prejuízo menor' : 'prejuízo maior'}</i>`;
    return '';
  };
  const MINUSC = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const nomeCurto = (s) => String(s || '').replace(/\s+(S\.?A\.?|S\/A)\.?$/i, '').replace(/\s+-\s+.*$/, '').trim().split(/\s+/).map((w, i) => {
    const l = w.toLocaleLowerCase('pt-BR');
    if (i && MINUSC.has(l)) return l;
    if ((w.length <= 3 || /\./.test(w)) && w === w.toLocaleUpperCase('pt-BR') && /[A-Z]/.test(w)) return w;
    return l.charAt(0).toLocaleUpperCase('pt-BR') + l.slice(1);
  }).join(' ');

  let prefs = { per: 'semana', q: '' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}), q: '' }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { const { q, ...p } = prefs; localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* cheio */ } };
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }
  let root = null, busy = false, erro = '';

  async function load(force = false) {
    if (!force && cache && Date.now() - cache.ts < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      let j = null;
      for (const u of URLS) {
        try { const r = await fetchT(u, {}, 20000); const x = await r.json().catch(() => null); if (r.ok && x && Array.isArray(x.proximos)) { j = x; break; } } catch (e) { /* próxima */ }
      }
      if (!j) throw new Error('sem dados');
      cache = { ts: Date.now(), d: j };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) {
      erro = 'Não foi possível buscar a agenda de balanços agora.';
    } finally { busy = false; draw(); }
  }

  function janela(k) {
    const h = hojeISO(), dow = new Date(h + 'T12:00:00Z').getUTCDay();
    const seg = addDays(h, -((dow + 6) % 7));
    if (k === 'passadas') return [addDays(h, -14), h];
    if (k === 'proxima') return [addDays(seg, 7), addDays(seg, 13)];
    if (k === 'mes') return [h, addDays(h, 30)];
    return [seg, addDays(seg, 6)];
  }

  function itens() {
    const d = cache.d, E = d.empresas || {}, h = hojeISO();
    const [a, b] = janela(prefs.per);
    const lista = [];
    (d.divulgados || []).forEach((x) => { if (x.data >= a && x.data <= b) lista.push({ ...x, st: 'feito' }); });
    (d.proximos || []).forEach((x) => { if (x.data >= a && x.data <= b) lista.push({ ...x, st: x.data < h ? 'atraso' : x.tipo }); });
    const q = prefs.q.trim().toLocaleLowerCase('pt-BR');
    return lista.filter((x) => {
      if (!q) return true;
      const e = E[x.cvm] || {};
      return `${e.nome} ${(e.tickers || []).join(' ')} ${e.setor}`.toLocaleLowerCase('pt-BR').includes(q);
    }).sort((x, y) => x.data.localeCompare(y.data) || (x.st === 'feito' ? 0 : 1) - (y.st === 'feito' ? 0 : 1) || String(E[x.cvm]?.nome).localeCompare(String(E[y.cvm]?.nome)));
  }

  function draw() {
    if (!root) return;
    if (!cache) { root.innerHTML = `<div class="bb-msg">${busy ? 'Carregando a agenda de balanços…' : esc(erro || 'Sem dados.')}</div>`; return; }
    const d = cache.d, E = d.empresas || {}, h = hojeISO();
    const lista = itens();
    const dias = [...new Set(lista.map((x) => x.data))];
    const fmtDia = (iso) => { const dt = new Date(iso + 'T12:00:00Z'); return `${DIAS[dt.getUTCDay()]}, ${+iso.slice(8, 10)} de ${MES[+iso.slice(5, 7) - 1]}${iso === h ? ' · hoje' : ''}`; };
    const tag = (x) => {
      if (x.st === 'feito') return `<a class="bb-tag bb-feito" href="${esc(x.link)}" target="_blank" rel="noopener" title="Ver o ${esc(x.doc)} na CVM">Divulgado</a>`;
      if (x.st === 'confirmada') return `<a class="bb-tag bb-conf" href="${esc(x.link)}" target="_blank" rel="noopener" title="Comunicado de ${dmy(x.comunicado)} na CVM">Confirmada</a>`;
      if (x.st === 'atraso') return `<span class="bb-tag bb-atr" title="${x.tipo === 'confirmada' ? 'Data anunciada pela empresa' : 'Data provável'}; a CVM ainda não recebeu o documento">Ainda não saiu</span>`;
      return `<span class="bb-tag bb-prov" title="No ano passado entregou em ${dmy(x.base)}; esta é a mesma data 52 semanas depois">Provável</span>`;
    };
    const linha = (x) => {
      const e = E[x.cvm] || {}, t = (e.tickers || [])[0];
      return `<div class="bb-row"${t ? ` data-t="${esc(t)}" data-n="${esc(nomeCurto(e.nome))}" tabindex="0" role="button" title="Ver gráfico de ${esc(t)}"` : ''}>
        <span class="bb-tk">${esc((e.tickers || []).join(' · ') || '—')}</span>
        <span class="bb-n"><b>${esc(nomeCurto(e.nome))}</b><span>${esc(e.setor || '')}</span></span>
        <span class="bb-tri">${esc(x.tri)}</span>
        ${x.res ? `<span class="bb-res" title="${x.res.per === 'ano' ? 'Ano inteiro' : 'Só o trimestre'}, contra o mesmo período do ano anterior">
          <span><small>Receita</small><b>${brl(x.res.rec)}</b>${vari(x.res.rec, x.res.rec_a)}</span>
          <span><small>Lucro${x.res.per === 'ano' ? ' no ano' : ''}</small><b class="${ok(x.res.luc) && x.res.luc < 0 ? 'bb-dn' : ''}">${brl(x.res.luc)}</b>${vari(x.res.luc, x.res.luc_a)}</span></span>` : x.st === 'feito' ? '<span class="bb-res" title="Receita e lucro não encontrados no documento"><span><small>Receita</small><b>—</b></span><span><small>Lucro</small><b>—</b></span></span>' : '<span class="bb-res"></span>'}
        ${tag(x)}
      </div>`;
    };
    const conf = (d.proximos || []).filter((x) => x.tipo === 'confirmada').length;
    root.innerHTML = `
      <div class="bb-bar">
        <div class="ecal-chips">${PER.map(([k, l]) => `<button class="ecal-chip${prefs.per === k ? ' active' : ''}" data-per="${k}">${l}</button>`).join('')}</div>
        <input class="bb-q" type="search" placeholder="Buscar empresa ou ticker" aria-label="Buscar empresa ou ticker" value="${esc(prefs.q)}">
        <span class="bb-st">${busy ? 'Atualizando…' : erro ? esc(erro) + ' Mostrando o último dado salvo.' : `Trimestre em aberto: ${esc(d.trimestre || '—')} · ${conf} datas confirmadas`}</span>
      </div>
      <div class="bb-list">${!lista.length ? `<div class="bb-msg">${prefs.q ? 'Nenhuma empresa encontrada neste período.' : 'Nenhum balanço neste período.'}</div>`
        : dias.map((dd) => `<div class="bb-day${dd === h ? ' today' : ''}">${esc(fmtDia(dd))} <small>${lista.filter((x) => x.data === dd).length}</small></div>${lista.filter((x) => x.data === dd).map(linha).join('')}`).join('')}</div>
      <div class="calendar-footer"><span><b>Divulgado</b>: a CVM recebeu o ITR ou a DFP nesse dia (abre o documento); receita e lucro (parte dos controladores) são do próprio documento, só do trimestre (no 4º trimestre, o ano inteiro) e comparados com o mesmo período do ano anterior. <b>Confirmada</b>: data anunciada pela empresa em comunicado ao mercado (abre o comunicado). <b>Provável</b>: a empresa ainda não anunciou; é o mesmo dia da semana em que entregou o mesmo trimestre no ano passado, então pode mudar.
        Empresas com ação na B3. Fonte: <a href="https://dados.cvm.gov.br" target="_blank" rel="noopener">CVM Dados Abertos</a> (ITR, DFP e IPE), atualizado duas vezes por dia útil.</span></div>`;
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const p = e.target.closest('[data-per]');
      if (p) { prefs.per = p.dataset.per; savePrefs(); draw(); return; }
      if (e.target.closest('a')) return;
      const r = e.target.closest('.bb-row[data-t]');
      if (r && window.openAssetChart) window.openAssetChart(r.dataset.t + '.SA', r.dataset.n);
    });
    el.addEventListener('keydown', (e) => {
      const r = e.target.closest?.('.bb-row[data-t]');
      if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); }
    });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('.bb-q')) return;
      prefs.q = e.target.value;
      const pos = e.target.selectionStart;
      draw();
      const q = root.querySelector('.bb-q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (err) { /* ok */ }
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  .bbr { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
  .bb-bar { display:flex; gap:10px 14px; align-items:center; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--line); }
  .bb-q { background:var(--surface-2); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:6px 10px; font:inherit; font-size:12.5px; width:200px; }
  .bb-st { margin-left:auto; font-size:11.5px; color:var(--text-3); }
  .bb-list { max-height:calc(100vh - 330px); min-height:420px; overflow:auto; }
  .bb-day { position:sticky; top:0; z-index:1; background:var(--surface-2); padding:7px 14px; font-size:11.5px; font-weight:600; color:var(--text-2); text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--line); }
  .bb-day small { color:var(--text-3); font-weight:500; margin-left:4px; }
  .bb-day.today { color:var(--accent); }
  .bb-row { display:grid; grid-template-columns:150px minmax(0,1fr) 54px 300px 118px; gap:12px; align-items:center; padding:9px 14px; border-bottom:1px solid var(--line); }
  .bb-row[data-t] { cursor:pointer; }
  .bb-row:hover { background:var(--surface-2); }
  .bb-tk { font:600 12.5px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bb-n { display:flex; flex-direction:column; min-width:0; }
  .bb-n b { font-weight:500; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bb-n span { font-size:11.5px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bb-res { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .bb-res > span { display:flex; flex-direction:column; min-width:0; }
  .bb-res small { font-size:10.5px; color:var(--text-3); }
  .bb-res b { font:600 12.5px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; }
  .bb-res i { font-style:normal; font-size:11px; font-family:'JetBrains Mono', monospace; white-space:nowrap; }
  .bb-up { color:var(--pos); } .bb-dn, .bb-res b.bb-dn { color:var(--neg); }
  body.light .bb-up { color:color-mix(in srgb, var(--pos) 72%, #000); }
  .bb-tri { font:12px 'JetBrains Mono', monospace; color:var(--text-2); }
  .bb-tag { justify-self:end; font-size:11px; font-weight:600; padding:3px 9px; border-radius:99px; border:1px solid var(--line); text-decoration:none; white-space:nowrap; }
  .bb-feito { color:var(--pos); border-color:color-mix(in srgb, var(--pos) 40%, transparent); }
  .bb-conf { color:var(--accent); border-color:color-mix(in srgb, var(--accent) 45%, transparent); }
  .bb-prov { color:var(--text-3); border-style:dashed; }
  .bb-atr { color:var(--neg); border-color:color-mix(in srgb, var(--neg) 40%, transparent); }
  body.light .bb-feito { color:color-mix(in srgb, var(--pos) 72%, #000); }
  a.bb-tag:hover { background:var(--surface-3); }
  .bb-msg { padding:40px; text-align:center; color:var(--text-3); font-size:13px; }
  .bbr .calendar-footer { border-top:1px solid var(--line); }
  @media (max-width: 640px) {
    .bb-bar .ecal-chips { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; max-width:100%; }
    .bb-bar .ecal-chip { flex:0 0 auto; }
    .bb-q { width:100%; }
    .bb-st { margin-left:0; }
    .bb-row { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"tk tag" "n tri" "res res"; gap:2px 10px; padding:9px 12px; }
    .bb-tk { grid-area:tk; } .bb-n { grid-area:n; } .bb-tri { grid-area:tri; justify-self:end; } .bb-tag { grid-area:tag; } .bb-res { grid-area:res; margin-top:4px; }
    .bb-res:empty { display:none; }
    .bb-list { max-height:none; min-height:0; }
  }`;
  document.head.appendChild(css);

  window.__bbrRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    el.querySelector('.bb-bar') || draw();
    load();
  };
})();
