/* =========================================================
   BOLETIM FOCUS (aba Calendário, botão "Boletim Focus")
   Medianas das expectativas do mercado coletadas pelo Banco Central (sistema Expectativas),
   no formato do relatório: hoje, há 1 semana, há 4 semanas e o comportamento semanal.
   Fonte: BCB Olinda, pelo worker (/focus?full=1) e, se ele falhar, direto na API do BCB.
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__focusRender) return;
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const CACHE_KEY = 'focus_cache_v1';
  const PREF_KEY = 'focus_prefs_v1';
  const TTL = 60 * 60 * 1000;
  const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/';
  // histórico semanal de 2 anos gravado todo dia pelo robô do GitHub (historico/focus.json)
  const HIST_URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/historico/focus.json', 'historico/focus.json'];

  // nome no BCB, nome no site, unidade, casas decimais
  const IND = [
    ['IPCA', 'IPCA', '%', 2],
    ['PIB Total', 'PIB', '%', 2],
    ['Câmbio', 'Câmbio (R$/US$)', 'R$', 2],
    ['Selic', 'Selic', '%', 2],
    ['IGP-M', 'IGP-M', '%', 2],
    ['IPCA Administrados', 'IPCA administrados', '%', 2],
    ['Conta corrente', 'Conta corrente', 'US$ bi', 2],
    ['Balança comercial', 'Balança comercial', 'US$ bi', 2],
    ['Investimento direto no país', 'Investimento direto no país', 'US$ bi', 2],
    ['Dívida líquida do setor público', 'Dívida líquida do setor público', '% do PIB', 2],
    ['Resultado primário', 'Resultado primário', '% do PIB', 2],
    ['Resultado nominal', 'Resultado nominal', '% do PIB', 2]
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, d = 2) => (ok(v) ? (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const ano = new Date().getFullYear();
  let prefs = { par: 'todos', per: 'sem' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }
  let root = null, busy = false, erro = '';
  let hist = null, histEstado = '';   // '', 'carregando', 'ok', 'falhou'
  async function carregaHist() {
    if (hist || histEstado === 'carregando') return;
    histEstado = 'carregando';
    for (const u of HIST_URLS) {
      try { const j = await getJSON(u, 20000); if (j && j.ind) { hist = j; histEstado = 'ok'; draw(); return; } } catch (e) { /* tenta a próxima */ }
    }
    histEstado = 'falhou'; draw();
  }

  async function getJSON(url, ms = 25000) {
    const r = await fetchT(url, {}, ms);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error((j && j.error) || `HTTP ${r.status}`);
    return j;
  }
  async function direto() {
    const desde = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    const q = (ep, filtro, campos, top) => `${OLINDA}${ep}?$top=${top}&$format=json&$orderby=Data%20desc&$select=${campos}&$filter=${encodeURIComponent(filtro)}`;
    const inds = '(' + IND.map(([k]) => `Indicador eq '${k}'`).join(' or ') + ')';
    const anos = '(' + [0, 1, 2, 3].map((i) => `DataReferencia eq '${ano + i}'`).join(' or ') + ')';
    const [a, c] = await Promise.all([
      getJSON(q('ExpectativasMercadoAnuais', `${inds} and ${anos} and baseCalculo eq 0 and Data ge '${desde}'`, 'Indicador,Data,DataReferencia,Mediana,numeroRespondentes', 6000)),
      getJSON(q('ExpectativasMercadoSelic', `baseCalculo eq 0 and Data ge '${desde}'`, 'Data,Reuniao,Mediana', 1500)).catch(() => ({ value: [] }))
    ]);
    return { anuais: a.value || [], copom: c.value || [] };
  }

  async function load(force = false) {
    if (!force && cache && Date.now() - cache.ts < TTL) { draw(); return; }
    busy = true; erro = ''; draw();
    try {
      let j;
      // atualizar à mão vai direto ao Banco Central (o servidor guarda o Focus por 30 min); se falhar, usa o servidor
      const servidor = async () => { const x = await getJSON(`${PROXY}/focus?full=1`); if (!Array.isArray(x.anuais) || !x.anuais.length) throw new Error('vazio'); return x; };
      const bcb = async () => { const x = await direto(); if (!x.anuais.length) throw new Error('vazio'); return x; };
      j = force ? await bcb().catch(servidor) : await servidor().catch(bcb);
      if (!j.anuais.length) throw new Error('sem dados');
      cache = { ts: Date.now(), anuais: j.anuais, copom: j.copom || [] };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) {
      erro = 'Não foi possível buscar o Focus no Banco Central agora.';
    } finally { busy = false; draw(); }
  }

  // o relatório sai na segunda seguinte à última data da pesquisa (a de sexta)
  const relatorio = (d) => { let r = addDays(d, 1); while (new Date(r + 'T12:00:00').getDay() !== 1) r = addDays(r, 1); return r; };
  // valor da série na data mais recente <= alvo
  const ate = (pts, alvo) => { for (const p of pts) if (p[0] <= alvo) return p; return null; };
  // linhas que fecham um grupo no relatório do BCB (separador mais forte depois delas)
  const FIM_GRUPO = new Set(['Selic', 'IPCA Administrados', 'Investimento direto no país']);
  let aberto = null;   // indicador com o gráfico aberto

  const serieDe = (ind, y) => cache.anuais.filter((r) => r.Indicador === ind && String(r.DataReferencia) === String(y) && ok(r.Mediana))
    .sort((a, b) => b.Data.localeCompare(a.Data)).map((r) => [r.Data, +r.Mediana, r.numeroRespondentes]);

  // comportamento semanal: direção da última semana e há quantas semanas seguidas ela se repete (como no relatório)
  function comportamento(pts, d0) {
    const sem = [0, 1, 2, 3, 4, 5].map((i) => ate(pts, addDays(d0, -7 * i))).map((x) => (x ? x[1] : null));
    if (!ok(sem[0]) || !ok(sem[1])) return { dir: null, n: 0 };
    const sinal = (a, b) => Math.sign(+(a - b).toFixed(4));
    const dir = sinal(sem[0], sem[1]);
    let n = 1;
    for (let i = 1; i < sem.length - 1 && ok(sem[i + 1]); i++) { if (sinal(sem[i], sem[i + 1]) === dir) n++; else break; }
    return { dir, n };
  }

  function draw() {
    if (!root) return;
    const chip = (v, l) => `<button class="ecal-chip${String(prefs.par) === String(v) ? ' active' : ''}" data-par="${v}">${l}</button>`;
    const anos = prefs.par === 0 ? [ano, ano + 1] : prefs.par === 1 ? [ano + 2, ano + 3] : [ano, ano + 1, ano + 2, ano + 3];
    const cor = (y) => `fy${(y - ano) % 4}`;
    let corpo = '';
    const comResp = anos.length <= 2;   // com os 4 anos a coluna de respondentes sai para a tabela caber
    const porAno = comResp ? 5 : 4;
    if (cache && cache.anuais.length) {
      const d0 = cache.anuais.reduce((m, r) => (r.Data > m ? r.Data : m), '');
      const celulas = (ind, y, dec) => {
        const pts = serieDe(ind, y);
        const hoje = ate(pts, d0), s1 = ate(pts, addDays(d0, -7)), s4 = ate(pts, addDays(d0, -28));
        const { dir, n } = comportamento(pts, d0);
        const comp = dir == null ? '<span class="fo-c">—</span>'
          : dir > 0 ? `<span class="fo-c up" title="Aumento há ${n} semana(s) seguida(s)">▲ <i>(${n})</i></span>`
          : dir < 0 ? `<span class="fo-c dn" title="Diminuição há ${n} semana(s) seguida(s)">▼ <i>(${n})</i></span>`
          : `<span class="fo-c eq" title="Estável há ${n} semana(s)">= <i>(${n})</i></span>`;
        return `<td class="n ${cor(y)} first">${nf(s4 && s4[1], dec)}</td><td class="n ${cor(y)}">${nf(s1 && s1[1], dec)}</td><td class="n hoje ${cor(y)}">${nf(hoje && hoje[1], dec)}</td><td class="c">${comp}</td>${comResp ? `<td class="n resp">${hoje && ok(hoje[2]) ? hoje[2] : '—'}</td>` : ''}`;
      };
      const ncol = 1 + anos.length * porAno;
      const linhas = IND.filter(([k]) => cache.anuais.some((r) => r.Indicador === k)).map(([k, nome, un, dec]) =>
        `<tr class="fo-row${FIM_GRUPO.has(k) ? ' fim' : ''}${aberto === k ? ' on' : ''}" data-ind="${esc(k)}" tabindex="0" role="button" aria-expanded="${aberto === k}" title="Ver o gráfico de ${esc(nome)}">
          <th><span class="fo-nm">${esc(nome)}</span><small>${esc(un)}</small></th>${anos.map((y) => celulas(k, y, dec)).join('')}</tr>
         ${aberto === k ? `<tr class="fo-det"><td colspan="${ncol}">${grafico(k, nome, un, dec)}</td></tr>` : ''}`).join('');
      const head2 = anos.map((y) => `<th class="${cor(y)} first">Há 4<br>sem.</th><th class="${cor(y)}">Há 1<br>sem.</th><th class="hoje ${cor(y)}">Hoje</th><th class="c">Semana</th>${comResp ? '<th class="resp">Resp.</th>' : ''}`).join('');
      // Selic por reunião do Copom
      const cop = (cache.copom || []).filter((r) => ok(r.Mediana));
      let copom = '';
      if (cop.length) {
        const dc = cop.reduce((m, r) => (r.Data > m ? r.Data : m), '');
        const reun = [...new Set(cop.filter((r) => r.Data === dc).map((r) => r.Reuniao))]
          .sort((a, b) => { const [ra, ya] = a.slice(1).split('/').map(Number), [rb, yb] = b.slice(1).split('/').map(Number); return ya - yb || ra - rb; }).slice(0, 8);
        const val = (re, alvo) => { const x = cop.filter((r) => r.Reuniao === re && r.Data <= alvo).sort((a, b) => b.Data.localeCompare(a.Data))[0]; return x ? +x.Mediana : null; };
        const seta = (a, b) => (!ok(a) || !ok(b) ? '' : a > b ? '<span class="fo-c up">▲</span>' : a < b ? '<span class="fo-c dn">▼</span>' : '<span class="fo-c eq">=</span>');
        copom = `<section class="fo-box fo-copbox"><div class="fo-bh"><h3>Selic por reunião do Copom</h3><span>mediana, % ao ano</span></div>
          <div class="fo-tbl"><table class="fo-cop"><thead><tr><th>Reunião</th><th>Há 4 sem.</th><th>Há 1 sem.</th><th class="hoje">Hoje</th><th class="c">Semana</th></tr></thead>
          <tbody>${reun.map((re) => { const [rn, ry] = re.slice(1).split('/'); const h = val(re, dc), w = val(re, addDays(dc, -7));
            return `<tr class="${cor(+ry)}"><th><b class="fo-dot"></b>${esc(rn)}ª reunião de ${esc(ry)}</th><td class="n">${nf(val(re, addDays(dc, -28)))}</td><td class="n">${nf(w)}</td><td class="n hoje">${nf(h)}</td><td class="c">${seta(h, w)}</td></tr>`; }).join('')}</tbody></table></div></section>`;
      }
      corpo = `
        <section class="fo-box">
          <div class="fo-bh"><h3>Mediana das expectativas</h3><span>relatório de ${dm(relatorio(d0))} (dados até ${dm(d0)}) · clique numa linha para ver o gráfico</span></div>
          <div class="fo-tbl"><table class="fo-main">
            <thead><tr><th rowspan="2" class="corner"></th>${anos.map((y) => `<th colspan="${porAno}" class="yr ${cor(y)}">${y}</th>`).join('')}</tr><tr>${head2}</tr></thead>
            <tbody>${linhas}</tbody>
          </table></div>
        </section>
        ${copom}`;
    }
    // próximo relatório: toda segunda-feira, 8h25 (Brasília)
    const prox = (() => { const n = new Date(); const d = new Date(n); d.setHours(8, 25, 0, 0); let add = (8 - d.getDay()) % 7; if (add === 0 && n > d) add = 7; d.setDate(d.getDate() + add); return d; })();
    root.innerHTML = `
      <div class="er-bar">
        <div class="ecal-chips">${chip('todos', 'Todos os anos')}${chip(0, `${ano} e ${ano + 1}`)}${chip(1, `${ano + 2} e ${ano + 3}`)}</div>
        <span class="fo-leg"><span class="fo-c up">▲ Aumento</span><span class="fo-c dn">▼ Diminuição</span><span class="fo-c eq">= Estabilidade</span></span>
        <span class="fo-next">Próximo relatório: segunda, ${prox.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, 8h25</span>
        <span class="er-st">${busy ? 'Atualizando…' : erro ? (cache ? esc(erro) + ' Mostrando o último dado salvo.' : '') : cache ? `Atualizado às ${new Date(cache.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}</span>
        <button type="button" class="btn-sm fo-atu" ${busy ? 'disabled' : ''} title="Buscar o Focus de novo no Banco Central"><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}" aria-hidden="true"></i> Atualizar</button>
      </div>
      <div class="fo-body">${corpo || `<div class="er-msg">${busy ? 'Carregando o Focus…' : esc(erro || '—')}</div>`}</div>
      <div class="calendar-footer"><span>Fonte: </span><a href="https://www.bcb.gov.br/publicacoes/focus" target="_blank" rel="noopener">Banco Central do Brasil, Relatório Focus</a><span> (sistema Expectativas de Mercado). "Semana" compara com a semana anterior; o número entre parênteses é há quantas semanas seguidas o movimento se repete. "Resp." (ao ver dois anos) é o número de instituições que responderam.</span></div>`;
    root.querySelector('.fo-atu')?.addEventListener('click', () => load(true));
    root.querySelectorAll('.ecal-chip[data-par]').forEach((b) => b.addEventListener('click', () => { prefs.par = b.dataset.par === 'todos' ? 'todos' : +b.dataset.par; savePrefs(); draw(); }));
    root.querySelectorAll('.fo-row').forEach((tr) => {
      const go = () => { aberto = aberto === tr.dataset.ind ? null : tr.dataset.ind; draw(); root.querySelector(`.fo-row[data-ind="${CSS.escape(tr.dataset.ind)}"]`)?.focus({ preventScroll: true }); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    root.querySelectorAll('.fo-per button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); prefs.per = b.dataset.per; savePrefs(); if (prefs.per !== 'sem') carregaHist(); draw();
    }));
    const g = root.querySelector('.fo-graf');
    if (g) ligaGrafico(g);
  }

  // gráfico da mediana diária nas últimas semanas, uma linha por ano (cores do relatório)
  let graf = null;
  const PER = { sem: ['Semanas', 0], a1: ['1 ano', 365], a2: ['2 anos', 730] };
  const mesAno = (iso) => `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
  // série do gráfico: as últimas semanas (diária, do Focus de agora) ou 1 a 2 anos (semanal, do histórico + dias recentes)
  function serieGraf(ind, y) {
    const rec = serieDe(ind, y).slice().reverse().map((p) => [p[0], p[1]]);
    const dias = (PER[prefs.per] || PER.sem)[1];
    if (!dias || !hist) return rec;
    const corte = addDays(new Date().toISOString().slice(0, 10), -dias);
    const h = ((hist.ind[ind] || {})[String(y)] || []).filter((p) => p[0] >= corte && ok(p[1]));
    const fim = h.length ? h[h.length - 1][0] : '';
    // depois do último ponto do histórico, uma amostra semanal dos dados recentes
    const extra = [];
    rec.filter((p) => p[0] > fim).forEach((p) => { const u = extra[extra.length - 1]; if (u && addDays(u[0], 6) >= p[0]) extra[extra.length - 1] = p; else extra.push(p); });
    return h.concat(extra);
  }
  function grafico(ind, nome, un, dec) {
    const anosG = [ano, ano + 1, ano + 2, ano + 3];
    const longo = prefs.per !== 'sem' && !!hist;
    const chipsP = `<span class="fo-per" role="group" aria-label="Período do gráfico">${Object.entries(PER).map(([k, [l]]) => `<button type="button" data-per="${k}" class="${(prefs.per || 'sem') === k ? 'on' : ''}">${l}</button>`).join('')}</span>`;
    const series = anosG.map((y) => ({ y, pts: serieGraf(ind, y) })).filter((s) => s.pts.length > 1);
    const aviso = prefs.per !== 'sem' && !hist ? (histEstado === 'falhou' ? 'Histórico longo indisponível agora; mostrando as últimas semanas.' : 'Carregando o histórico…') : '';
    if (!series.length) { graf = null; return `<div class="fo-graf"><div class="fo-gh"><b>${esc(nome)}</b>${chipsP}</div><div class="er-msg">Sem histórico para o gráfico.</div></div>`; }
    const datas = [...new Set(series.flatMap((s) => s.pts.map((p) => p[0])))].sort();
    const vals = series.flatMap((s) => s.pts.map((p) => p[1]));
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1e-9) { mn -= 0.5; mx += 0.5; }
    const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
    const W = 760, H = 210, L = 46, R = 14, T = 12, B = 26;
    const x = (d) => L + (datas.length === 1 ? 0 : datas.indexOf(d) / (datas.length - 1)) * (W - L - R);
    const y = (v) => T + (mx - v) / (mx - mn) * (H - T - B);
    const ticks = [0, 0.5, 1].map((f) => mn + (mx - mn) * f);
    const xt = longo ? [0, Math.floor((datas.length - 1) / 3), Math.floor((datas.length - 1) * 2 / 3), datas.length - 1] : [0, Math.floor((datas.length - 1) / 2), datas.length - 1];
    const fx = longo ? mesAno : dm;
    graf = { datas, series, x, y, W, H, L, R, T, B, dec, un, longo };
    return `<div class="fo-graf">
      <div class="fo-gh"><b>${esc(nome)}</b><span>${esc(un)} · ${longo ? 'mediana semanal' : 'mediana diária das últimas semanas'}${aviso ? ' · ' + esc(aviso) : ''}</span>
        ${chipsP}<span class="fo-gl">${series.map((s) => `<span class="fy${(s.y - ano) % 4}"><i></i>${s.y}</span>`).join('')}</span></div>
      <div class="fo-gw">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Mediana de ${esc(nome)} por ano">
          ${ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="ya" x="${L - 6}" y="${(y(t) + 3).toFixed(1)}">${nf(t, dec)}</text>`).join('')}
          ${xt.map((i) => `<text class="xa" x="${x(datas[i]).toFixed(1)}" y="${H - 8}">${fx(datas[i])}</text>`).join('')}
          ${series.map((s) => `<polyline class="ln fy${(s.y - ano) % 4}" points="${s.pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('')}
          ${series.map((s) => { const p = s.pts[s.pts.length - 1]; return `<circle class="pt fy${(s.y - ano) % 4}" cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="3"/>`; }).join('')}
          <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
          <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
        </svg>
        <div class="fo-tip" hidden></div>
      </div></div>`;
  }
  function ligaGrafico(el) {
    if (!graf) return;
    // a tabela rola de lado no celular: o gráfico fica do tamanho da área visível e preso à esquerda
    const sc = el.closest('.fo-tbl');
    if (sc) el.style.width = `${Math.min(900, sc.clientWidth - 26)}px`;
    const svg = el.querySelector('svg'), hit = el.querySelector('.hit'), cross = el.querySelector('.cross'), tip = el.querySelector('.fo-tip');
    const mostra = (cx) => {
      const r = svg.getBoundingClientRect();
      const vx = (cx - r.left) / r.width * graf.W;
      let best = 0, bd = Infinity;
      graf.datas.forEach((d, i) => { const dd = Math.abs(graf.x(d) - vx); if (dd < bd) { bd = dd; best = i; } });
      const d = graf.datas[best], px = graf.x(d);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${graf.longo ? d.split('-').reverse().join('/') : dm(d)}</b>${graf.series.map((s) => { const p = s.pts.find((q) => q[0] === d); return `<span class="fy${(s.y - ano) % 4}"><i></i>${s.y}: ${p ? nf(p[1], graf.dec) : '—'}</span>`; }).join('')}`;
      tip.hidden = false;
      const left = px / graf.W * r.width;
      tip.style.left = `${Math.min(Math.max(left + 12, 0), r.width - tip.offsetWidth - 4)}px`;
    };
    const esconde = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    hit.addEventListener('mousemove', (e) => mostra(e.clientX));
    hit.addEventListener('touchstart', (e) => mostra(e.touches[0].clientX), { passive: true });
    hit.addEventListener('touchmove', (e) => mostra(e.touches[0].clientX), { passive: true });
    hit.addEventListener('mouseleave', esconde);
  }

  window.__focusRender = (el, force = false) => { root = el; load(force); if (prefs.per && prefs.per !== 'sem') carregaHist(); };

  const css = document.createElement('style');
  css.textContent = `
  .focus { --fy0:#2f6fe4; --fy1:#a8323e; --fy2:#e08a00; --fy3:var(--text); --fup:#2f6fe4; --fdn:#d93a3a;
    border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
  body:not(.light) .focus { --fy0:#5b93ff; --fy1:#f06a78; --fy2:#ffad33; --fup:#5b93ff; --fdn:#ff5a5a; }
  .focus .er-bar { display:flex; gap:10px 16px; align-items:center; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--line); }
  .focus .er-st { margin-left:auto; font-size:11.5px; color:var(--text-3); }
  .focus .er-msg { padding:48px 16px; text-align:center; color:var(--text-3); font-size:13px; }
  .fo-next { font-size:11.5px; color:var(--text-2); }
  .fo-leg { display:inline-flex; gap:12px; font-size:11.5px; }
  .fo-body { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; padding:12px; align-items:start; }
  .fo-box { border:1px solid var(--line); border-radius:10px; overflow:hidden; min-width:0; }
  .fo-bh { display:flex; align-items:baseline; gap:10px; padding:8px 12px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--surface-2) 70%, transparent); flex-wrap:wrap; }
  .fo-bh h3 { margin:0; flex:1; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  .fo-bh span { font-size:11px; color:var(--text-3); }
  .fo-tbl { overflow-x:auto; }
  .fo-tbl table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .fo-tbl th, .fo-tbl td { padding:6px 7px; border-bottom:1px solid var(--line); white-space:nowrap; }
  .fo-tbl thead th { font-size:10.5px; font-weight:600; color:var(--text-3); text-align:right; line-height:1.2; vertical-align:bottom; }
  .fo-tbl thead th.yr { text-align:left; font-size:14px; font-weight:800; padding:8px 8px 6px; border-left:1px solid var(--line); border-top:3px solid currentColor; }
  .fo-tbl tbody th { text-align:left; font-weight:500; color:var(--text); position:sticky; left:0; z-index:1; background:var(--surface); }
  .fo-main tbody th { white-space:normal; min-width:120px; max-width:165px; line-height:1.3; }
  .fo-tbl tbody th small { display:block; font-size:10px; color:var(--text-3); font-weight:400; }
  .fo-tbl td.n { text-align:right; font-family:'JetBrains Mono', monospace; font-size:12px; font-variant-numeric:tabular-nums; }
  .fo-tbl .first { border-left:1px solid var(--line); }
  .fo-tbl .fy0 { color:var(--fy0); } .fo-tbl .fy1 { color:var(--fy1); } .fo-tbl .fy2 { color:var(--fy2); } .fo-tbl .fy3 { color:var(--fy3); }
  .fo-tbl td.n:not(.hoje) { opacity:.82; }
  .fo-tbl td.hoje { font-weight:700; opacity:1; }
  .fo-main td.hoje.fy0 { background:color-mix(in srgb, var(--fy0) 9%, transparent); } .fo-main td.hoje.fy1 { background:color-mix(in srgb, var(--fy1) 9%, transparent); }
  .fo-main td.hoje.fy2 { background:color-mix(in srgb, var(--fy2) 10%, transparent); } .fo-main td.hoje.fy3 { background:color-mix(in srgb, var(--text) 7%, transparent); }
  .fo-tbl td.c, .fo-tbl th.c { text-align:center; }
  .fo-tbl td.resp, .fo-tbl th.resp { color:var(--text-3); font-size:11px; }
  .fo-c { font:700 12px 'JetBrains Mono', monospace; color:var(--text-3); white-space:nowrap; }
  .fo-c i { font-style:normal; font-weight:500; font-size:11px; }
  .fo-c.up { color:var(--fup); } .fo-c.dn { color:var(--fdn); } .fo-c.eq { color:var(--text-3); }
  .fo-row { cursor:pointer; transition:background .12s; }
  .fo-row:hover, .fo-row.on { background:color-mix(in srgb, var(--accent) 6%, transparent); }
  .fo-row:hover th, .fo-row.on th { background:color-mix(in srgb, var(--accent) 6%, var(--surface)); }
  .fo-row th .fo-nm::before { content:'▸'; display:inline-block; width:12px; color:var(--text-3); transition:transform .15s; }
  .fo-row.on th .fo-nm::before { transform:rotate(90deg); color:var(--accent-ink); }
  .fo-row th small { padding-left:12px; }
  .fo-row:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
  .fo-row.fim th, .fo-row.fim td { border-bottom:2px solid var(--line-2); }
  .fo-det > td { padding:10px 12px 14px; background:color-mix(in srgb, var(--surface-2) 55%, transparent); white-space:normal; }
  .fo-graf { max-width:900px; position:sticky; left:12px; }
  .fo-gh { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:6px; font-size:12px; color:var(--text-3); }
  .fo-gh b { color:var(--text); font-size:13px; }
  .fo-gl { margin-left:auto; display:inline-flex; gap:12px; }
  .fo-per { display:inline-flex; border:1px solid var(--line); border-radius:7px; overflow:hidden; }
  .fo-per button { border:0; background:transparent; color:var(--text-2); font-family:inherit; font-size:11px; font-weight:600; padding:3px 9px; cursor:pointer; }
  .fo-per button + button { border-left:1px solid var(--line); }
  .fo-per button.on { background:color-mix(in srgb, var(--accent) 14%, transparent); color:var(--text); }
  .fo-gl span, .fo-tip span { display:inline-flex; align-items:center; gap:5px; font:600 11.5px 'JetBrains Mono', monospace; }
  .fo-gl i, .fo-tip i { width:14px; height:3px; border-radius:2px; background:currentColor; display:inline-block; }
  .fo-graf .fy0 { color:var(--fy0); } .fo-graf .fy1 { color:var(--fy1); } .fo-graf .fy2 { color:var(--fy2); } .fo-graf .fy3 { color:var(--fy3); }
  .fo-gw { position:relative; }
  .fo-gw svg { display:block; width:100%; height:210px; }
  .fo-gw .gl { stroke:var(--line); stroke-width:1; vector-effect:non-scaling-stroke; }
  .fo-gw text { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); }
  .fo-gw .ya { text-anchor:end; } .fo-gw .xa { text-anchor:middle; }
  .fo-gw .ln { fill:none; stroke:currentColor; stroke-width:2; vector-effect:non-scaling-stroke; stroke-linejoin:round; }
  .fo-gw .pt { fill:currentColor; }
  .fo-gw .cross { stroke:var(--text-3); stroke-dasharray:3 3; vector-effect:non-scaling-stroke; }
  .fo-gw .hit { fill:transparent; cursor:crosshair; }
  .fo-tip { position:absolute; top:8px; z-index:3; display:flex; flex-direction:column; gap:3px; padding:7px 9px; border-radius:8px; background:var(--surface); border:1px solid var(--line-2); box-shadow:var(--shadow-lg); pointer-events:none; }
  .fo-tip b { font-size:11px; color:var(--text-2); }
  .fo-copbox { max-width:620px; }
  .fo-cop tbody tr.fy0 th .fo-dot { background:var(--fy0); } .fo-cop tbody tr.fy1 th .fo-dot { background:var(--fy1); } .fo-cop tbody tr.fy2 th .fo-dot { background:var(--fy2); } .fo-cop tbody tr.fy3 th .fo-dot { background:var(--fy3); }
  .fo-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:middle; }
  .fo-cop td.n { color:var(--text-2); } .fo-cop td.hoje, .fo-cop th.hoje { color:var(--text); background:color-mix(in srgb, var(--accent) 7%, transparent); }
  .fo-cop tbody tr:hover { background:color-mix(in srgb, var(--accent) 5%, transparent); }
  .fo-tbl tr:last-child th, .fo-tbl tr:last-child td { border-bottom:0; }
  .focus .calendar-footer { margin:0; border:0; border-top:1px solid var(--line); border-radius:0; }
  @media (max-width: 760px) { .fo-body { padding:8px; } .focus .er-st { margin-left:0; width:100%; } .fo-gl { margin-left:0; } .fo-gw svg { height:180px; } }`;
  document.head.appendChild(css);
})();
