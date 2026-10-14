/* =========================================================
   POSIÇÕES DOS GRANDES INVESTIDORES (aba Análises, duas seções)
   1) "Posição dos especuladores": CFTC Commitments of Traders (relatório Legacy, só futuros).
      Contratos comprados menos vendidos dos "não comerciais" (fundos e gestores) e dos
      "comerciais" (quem usa o futuro para proteção). Sai toda sexta com dados da terça.
   2) "Carteiras dos grandes fundos": formulário 13F da SEC, entregue até 45 dias depois
      do fim de cada trimestre. Só ações e opções listadas nos EUA; não mostra vendas a descoberto.
   Fonte: posicoes/cot.json e posicoes/13f.json, gravados pelo robô do GitHub (posicoes.yml).
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__posicoesRender) return;
  const RAW = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/posicoes/';
  const TTL = 60 * 60 * 1000;
  const PREF_KEY = 'posicoes_prefs_v1';
  const GRUPOS = ['Moedas', 'Bolsas e juros', 'Commodities'];
  const LISTAS = [['maiores', 'Maiores posições'], ['novas', 'Novas'], ['aumentou', 'Aumentou'], ['diminuiu', 'Diminuiu'], ['zeradas', 'Zeradas']];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
  const trimestre = (iso) => (iso ? `${Math.ceil(+iso.slice(5, 7) / 3)}º tri/${iso.slice(0, 4)}` : '—');
  const int = (v, sinal = false) => (!ok(v) ? '—' : `${sinal && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('pt-BR')}`);
  const pct = (v, casas = 1, sinal = false) => (!ok(v) ? '—' : `${sinal && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
  const usd = (v) => {
    if (!ok(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return `${s}US$ ${(a / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bi`;
    if (a >= 1e6) return `${s}US$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`;
    return `${s}US$ ${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  };
  const tom = (v) => (!ok(v) || v === 0 ? '' : v > 0 ? 'ps-pos' : 'ps-neg');
  // "AMAZON COM INC" -> "Amazon Com Inc"; nomes já em caixa mista ficam como vieram
  const nomeEmpresa = (n) => (n && n === n.toUpperCase()
    ? n.toLowerCase().replace(/(^|[\s\-/&.(])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Etf|Spdr|Adr|Ads|Plc|Nv|Sa|Ag|Se|Lp|Llc)\b/g, (w) => w.toUpperCase())
    : n || '—');

  let prefs = { grupo: 'Moedas', cot: 'brl', fundo: 1067983, lista: 'maiores' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };

  // cada arquivo tem seu próprio cache e estado
  const fonte = (arq, chave, valido) => {
    const f = { arq, chave, valido, dados: null, ts: 0, busy: false, erro: '' };
    try { const c = JSON.parse(localStorage.getItem(chave) || 'null'); if (c && valido(c.dados)) { f.dados = c.dados; f.ts = c.ts; } } catch (e) { /* sem cache */ }
    return f;
  };
  const COT = fonte('cot.json', 'posicoes_cot_v1', (d) => Array.isArray(d?.mercados));
  const F13 = fonte('13f.json', 'posicoes_13f_v1', (d) => Array.isArray(d?.fundos));

  async function carrega(f, desenha, force = false) {
    if (!force && f.dados && Date.now() - f.ts < TTL) { desenha(); return; }
    f.busy = true; f.erro = ''; desenha();
    try {
      let j = null;
      for (const u of [RAW + f.arq, 'posicoes/' + f.arq]) {
        try { const r = await fetchT(u, {}, 20000); const x = await r.json().catch(() => null); if (r.ok && f.valido(x)) { j = x; break; } } catch (e) { /* próxima */ }
      }
      if (!j) throw new Error('sem dados');
      f.dados = j; f.ts = Date.now();
      try { localStorage.setItem(f.chave, JSON.stringify({ ts: f.ts, dados: j })); } catch (e) { /* cheio */ }
    } catch (e) {
      f.erro = 'Não foi possível buscar os dados agora.';
    } finally { f.busy = false; desenha(); }
  }

  /* ---------------- CFTC ---------------- */
  let cotRoot = null;
  const liq = (s, q) => (q === 'e' ? (ok(s?.el) && ok(s?.es) ? s.el - s.es : null) : (ok(s?.cl) && ok(s?.cs) ? s.cl - s.cs : null));
  function resumo(m) {
    const ss = m.semanas || [], u = ss[ss.length - 1], a = ss[ss.length - 2];
    const net = liq(u, 'e'), ant = liq(a, 'e');
    const nets = ss.map((s) => liq(s, 'e')).filter(ok);
    const min = Math.min(...nets), max = Math.max(...nets);
    const indice = nets.length > 20 && max > min && ok(net) ? (net - min) / (max - min) * 100 : null;
    return { u, net, var: ok(net) && ok(ant) ? net - ant : null, oi: ok(net) && u?.oi ? net / u.oi * 100 : null, indice, anos: ss.length ? (Date.parse(u.d) - Date.parse(ss[0].d)) / 3.156e10 : 0 };
  }
  function graficoCot(m) {
    const ss = m.semanas || [];
    if (ss.length < 2) return '<div class="ps-msg">Histórico curto demais para o gráfico.</div>';
    const W = 720, H = 180, T = 10, B = 10;
    const e = ss.map((s) => liq(s, 'e')), c = ss.map((s) => liq(s, 'c'));
    const max = Math.max(1, ...e.concat(c).filter(ok).map(Math.abs));
    const y = (v) => T + (H - T - B) / 2 - v / max * (H - T - B) / 2, x = (i) => i / (ss.length - 1) * W;
    const linha = (vs) => vs.map((v, i) => (ok(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(' ');
    const passo = Math.ceil(ss.length / (innerWidth < 640 ? 4 : 6));
    const datas = ss.map((s, i) => ((i % passo === 0 && ss.length - 1 - i >= passo) || i === ss.length - 1)
      ? `<span style="left:${(i / (ss.length - 1) * 100).toFixed(2)}%">${MES[+s.d.slice(5, 7) - 1]}/${s.d.slice(2, 4)}</span>` : '').join('');
    return `<div class="ps-plot"><span class="ps-ys ps-ys-t">${int(max, true)}</span><span class="ps-ys ps-ys-b">${int(-max)}</span>
      <svg class="ps-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Posição líquida por semana">
      <line class="ps-zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" vector-effect="non-scaling-stroke"/>
      <polyline class="ps-lc" points="${linha(c)}" vector-effect="non-scaling-stroke"/>
      <polyline class="ps-le" points="${linha(e)}" vector-effect="non-scaling-stroke"/>
      <line class="ps-cur" x1="0" x2="0" y1="0" y2="${H}" vector-effect="non-scaling-stroke" hidden/></svg></div>
      <div class="ps-xl">${datas}</div>`;
  }
  function drawCot() {
    const root = cotRoot;
    if (!root) return;
    const d = COT.dados;
    if (!d) { root.innerHTML = `<div class="ps-msg">${COT.busy ? 'Carregando a posição dos especuladores…' : esc(COT.erro || 'Sem dados da CFTC.')}</div>`; return; }
    const ms = d.mercados;
    const grupo = GRUPOS.includes(prefs.grupo) ? prefs.grupo : 'Moedas';
    const lista = ms.filter((m) => m.grupo === grupo);
    const sel = ms.find((m) => m.k === prefs.cot) || lista[0] || ms[0];
    const r = resumo(sel);
    const ultData = ms.map((m) => m.semanas?.[m.semanas.length - 1]?.d).filter(Boolean).sort().pop();
    const barra = (v) => (ok(v) ? `<span class="ps-idx" title="${Math.round(v)} de 100"><i style="left:${v.toFixed(1)}%"></i></span><span class="ps-idxn">${Math.round(v)}</span>` : '—');
    const linhas = lista.map((m) => {
      const x = resumo(m);
      return `<tr class="${m.k === sel.k ? 'on' : ''}" data-cot="${m.k}"><th>${esc(m.nome)}</th>
        <td class="${tom(x.net)}">${int(x.net, true)}</td><td class="${tom(x.var)}">${int(x.var, true)}</td>
        <td class="${tom(x.oi)}">${pct(x.oi, 0, true)}</td><td class="ps-tdi">${barra(x.indice)}</td></tr>`;
    }).join('');
    const ladoTxt = !ok(r.net) ? '—' : r.net > 0 ? 'comprados' : r.net < 0 ? 'vendidos' : 'neutros';
    root.innerHTML = `
      <div class="ps-card">
        <div class="ps-top">
          <div class="ps-chips" role="tablist" aria-label="Grupo de mercados">${GRUPOS.map((g) => `<button type="button" class="ecal-chip ${g === grupo ? 'active' : ''}" data-grupo="${esc(g)}" role="tab" aria-selected="${g === grupo}">${g}</button>`).join('')}</div>
          <span class="ps-data">Posição de ${dmy(ultData)}</span>
          <button type="button" class="ps-rf" data-rf="cot" title="Buscar de novo"><i class="fas fa-sync-alt${COT.busy ? ' fa-spin' : ''}"></i></button>
        </div>
        <div class="ps-tw"><table class="ps-tab">
          <thead><tr><th>Mercado</th><th>Especuladores</th><th>Na semana</th><th>% do total</th><th>Em ${Math.max(1, Math.round(r.anos))} anos</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <div class="ps-gh"><div class="ps-gt"><b>${esc(sel.nome)}</b> <span class="${tom(r.net)}">especuladores ${ladoTxt} em ${int(Math.abs(r.net ?? NaN))} contratos</span>
          <span class="ps-mut">· comerciais ${int(liq(r.u, 'c'), true)}</span></div>
          <div class="ps-leg"><span><i class="ps-sw ps-swe"></i>Especuladores</span><span><i class="ps-sw ps-swc"></i>Comerciais</span></div></div>
        <div class="ps-graf">${graficoCot(sel)}<div class="ps-tip" hidden></div></div>
        <div class="ps-foot">Contratos futuros comprados menos vendidos, por semana. <b>Especuladores</b> são os "não comerciais" da CFTC (fundos e gestores que apostam na direção do preço); <b>comerciais</b> são produtores, exportadores e bancos que usam o futuro para proteção.
          "% do total" compara a posição líquida com todos os contratos em aberto. A barra mostra onde a posição está entre a mais vendida (0) e a mais comprada (100) do período.
          Nos contratos de moeda, comprado em real ou euro é apostar na alta dessa moeda contra o dólar.
          Fonte: CFTC, Commitments of Traders (Legacy, só futuros), publicado às sextas com a posição da terça. Nome oficial: ${esc(String(sel.oficial || '—').replace(/\.+$/, ''))}.
          ${COT.erro ? `<span class="ps-err">${esc(COT.erro)} Mostrando a última cópia salva.</span>` : ''}</div>
      </div>`;
    const graf = root.querySelector('.ps-graf'), svg = graf.querySelector('.ps-svg'), tip = graf.querySelector('.ps-tip'), cur = graf.querySelector('.ps-cur');
    if (!svg) return;
    const ss = sel.semanas;
    const mostra = (ev) => {
      const b = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - b.left) / b.width;
      const i = Math.max(0, Math.min(ss.length - 1, Math.round(px * (ss.length - 1))));
      const s = ss[i];
      cur.setAttribute('x1', i / (ss.length - 1) * 720); cur.setAttribute('x2', i / (ss.length - 1) * 720); cur.hidden = false;
      tip.innerHTML = `<b>${dmy(s.d)}</b><br><span class="${tom(liq(s, 'e'))}">especuladores ${int(liq(s, 'e'), true)}</span><br><small>comerciais ${int(liq(s, 'c'), true)} · em aberto ${int(s.oi)}</small>`;
      tip.hidden = false;
      const gb = graf.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(b.left - gb.left + px * b.width, 90), gb.width - 90)}px`;
    };
    svg.addEventListener('mousemove', mostra);
    svg.addEventListener('touchstart', mostra, { passive: true });
    graf.addEventListener('mouseleave', () => { tip.hidden = true; cur.hidden = true; });
  }

  /* ---------------- SEC 13F ---------------- */
  let f13Root = null;
  function drawF13() {
    const root = f13Root;
    if (!root) return;
    const d = F13.dados;
    if (!d) { root.innerHTML = `<div class="ps-msg">${F13.busy ? 'Carregando as carteiras dos fundos…' : esc(F13.erro || 'Sem dados da SEC.')}</div>`; return; }
    const f = d.fundos.find((x) => x.cik === +prefs.fundo) || d.fundos[0];
    const listaK = LISTAS.some(([k]) => k === prefs.lista) ? prefs.lista : 'maiores';
    const temAnt = !!f.periodo_ant;
    const itens = f[listaK] || [];
    const nTot = { maiores: f.n, novas: f.n_novas, aumentou: f.n_aumentou, diminuiu: f.n_diminuiu, zeradas: f.n_zeradas };
    const nome = (p) => `${esc(nomeEmpresa(p.nome))}<small>${esc(p.classe || '')}${p.pc ? ` · opção de ${p.pc === 'Put' ? 'venda (put)' : 'compra (call)'}` : ''}</small>`;
    const varQ = (p) => (ok(p.q) && ok(p.qa) && p.qa > 0 ? (p.q / p.qa - 1) * 100 : null);
    let cab, linhas;
    if (listaK === 'zeradas') {
      cab = `<th>Empresa</th><th>Valor antes</th><th>% da carteira antes</th><th>Ações vendidas</th>`;
      linhas = itens.map((p) => `<tr><th>${nome(p)}</th><td>${usd(p.va)}</td><td>${pct(p.pcta)}</td><td class="ps-neg">${int(-p.qa)}</td></tr>`).join('');
    } else {
      cab = `<th>Empresa</th><th>% da carteira</th><th>Valor</th><th>Ações</th><th>No trimestre</th>`;
      linhas = itens.map((p) => {
        const v = varQ(p);
        const tri = listaK === 'novas' || (listaK === 'maiores' && temAnt && !ok(p.qa)) ? '<span class="ps-novo">nova</span>' : ok(v) ? (Math.abs(v) < 0.5 ? '<span class="ps-mut">igual</span>' : `<span class="${tom(v)}">${pct(v, 0, true)}</span>`) : '—';
        return `<tr><th>${nome(p)}</th><td>${ok(p.pct) && p.v > 0 && p.pct < 0.05 ? '&lt;0,1%' : pct(p.pct)}</td><td>${usd(p.v)}</td><td>${int(p.q)}</td><td>${tri}</td></tr>`;
      }).join('');
    }
    const kpi = (t, v, s) => `<div><span>${t}</span><b>${v}</b><small>${s}</small></div>`;
    const varTot = ok(f.total) && ok(f.total_ant) && f.total_ant > 0 ? (f.total / f.total_ant - 1) * 100 : null;
    root.innerHTML = `
      <div class="ps-card">
        <div class="ps-top">
          <label class="ps-sel"><span class="sr-only">Fundo</span><select data-fundo aria-label="Fundo">${d.fundos.map((x) => `<option value="${x.cik}" ${x.cik === f.cik ? 'selected' : ''}>${esc(x.apelido)} · ${esc(x.gestor)}</option>`).join('')}</select></label>
          <button type="button" class="ps-rf" data-rf="f13" title="Buscar de novo"><i class="fas fa-sync-alt${F13.busy ? ' fa-spin' : ''}"></i></button>
        </div>
        <div class="ps-kpis">
          ${kpi('Carteira declarada', usd(f.total), ok(varTot) ? `<span class="${tom(varTot)}">${pct(varTot, 1, true)}</span> sobre o trimestre anterior` : '—')}
          ${kpi('Posições', int(f.n), temAnt ? `${int(f.n_novas)} ${f.n_novas === 1 ? 'nova' : 'novas'} · ${int(f.n_zeradas)} ${f.n_zeradas === 1 ? 'zerada' : 'zeradas'}` : '—')}
          ${kpi('Trimestre', trimestre(f.periodo), `entregue à SEC em ${dmy(f.entregue)}`)}
        </div>
        <div class="ps-gh"><div class="ps-chips" role="tablist" aria-label="Lista">${LISTAS.map(([k, n]) => `<button type="button" class="ecal-chip ${k === listaK ? 'active' : ''}" data-lista="${k}" role="tab" aria-selected="${k === listaK}" ${k !== 'maiores' && !temAnt ? 'disabled' : ''}>${n}${k !== 'maiores' && temAnt ? ` <small>${int(nTot[k])}</small>` : ''}</button>`).join('')}</div></div>
        <div class="ps-tw"><table class="ps-tab ps-tab13">
          <thead><tr>${cab}</tr></thead>
          <tbody>${linhas || `<tr><td colspan="5" class="ps-vazio">${temAnt ? 'Nada nesta lista no trimestre.' : 'Sem o trimestre anterior para comparar.'}</td></tr>`}</tbody>
        </table></div>
        ${itens.length && nTot[listaK] > itens.length ? `<div class="ps-mais">Mostrando as ${itens.length} maiores de ${int(nTot[listaK])}, pelo valor.</div>` : ''}
        <div class="ps-foot">O que o fundo declarou à SEC no formulário 13F, com a carteira do último dia do trimestre: só ações, ETFs e opções listadas nos EUA, sem vendas a descoberto, caixa ou ativos fora dos EUA. Sai até 45 dias depois do fim do trimestre, então mostra o passado, não a carteira de hoje.
          "No trimestre" compara a quantidade de ações com o 13F anterior${temAnt ? ` (${trimestre(f.periodo_ant)})` : ''}.
          Fonte: SEC EDGAR, ${esc(f.oficial)} (CIK ${f.cik}). <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=${f.cik}&amp;type=13F-HR" target="_blank" rel="noopener">Ver na SEC</a>
          ${F13.erro ? `<span class="ps-err">${esc(F13.erro)} Mostrando a última cópia salva.</span>` : ''}</div>
      </div>`;
  }

  /* ---------------- "Quem tem essa ação?" (índice por ação do 13F, baixado só ao buscar) ---------------- */
  let acoes = null, acoesBusy = false, acoesErro = '', buscaQ = '';
  async function carregaAcoes() {
    if (acoes || acoesBusy) return;
    acoesBusy = true; acoesErro = ''; drawBusca();
    try {
      for (const u of [RAW + '13f-acoes.json', 'posicoes/13f-acoes.json']) {
        try { const r = await fetchT(u, {}, 25000); const x = await r.json().catch(() => null); if (r.ok && Array.isArray(x?.acoes)) { acoes = x; break; } } catch (e) { /* próxima */ }
      }
      if (!acoes) acoesErro = 'Não foi possível buscar o índice de ações agora.';
    } finally { acoesBusy = false; drawBusca(); }
  }
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  function achar(q) {
    const Q = semAcento(q).trim();
    if (Q.length < 2) return [];
    const porTicker = acoes.acoes.filter((a) => a.t && a.t.split(' ').includes(Q));
    if (porTicker.length) return porTicker.slice(0, 6);
    return acoes.acoes.filter((a) => semAcento(a.n).includes(Q)).slice(0, 6);
  }
  function drawBusca() {
    const box = buscaRes;
    if (!box) return;
    if (!buscaQ.trim()) { box.innerHTML = ''; return; }
    if (!acoes) { box.innerHTML = `<div class="ps-msg">${acoesBusy ? 'Carregando o índice das carteiras…' : esc(acoesErro || '')}</div>`; return; }
    const res = achar(buscaQ);
    if (!res.length) { box.innerHTML = `<div class="ps-msg">Nenhum dos ${acoes.fundos.length} fundos declarou essa ação no último 13F. Tente o nome em inglês (ex.: Apple) ou o ticker (ex.: AAPL).</div>`; return; }
    box.innerHTML = res.map((a) => {
      const tem = a.h.filter((h) => h[2] > 0);
      const comprou = a.h.filter((h) => h[3] != null && h[2] > h[3] * 1.005).length;
      const vendeu = a.h.filter((h) => h[3] != null && h[2] < h[3] * 0.995).length;
      const linhas = a.h.map(([fi, v, q, qa, pc]) => {
        let tri = '—';
        if (q === 0) tri = '<span class="ps-neg">zerou</span>';
        else if (qa === 0) tri = '<span class="ps-novo">nova</span>';
        else if (ok(qa) && qa > 0) { const x = (q / qa - 1) * 100; tri = Math.abs(x) < 0.5 ? '<span class="ps-mut">igual</span>' : `<span class="${tom(x)}">${pct(x, 0, true)}</span>`; }
        return `<tr><th>${esc(acoes.fundos[fi] || '—')}</th><td>${q === 0 ? '—' : ok(pc) && pc < 0.05 ? '&lt;0,1%' : pct(pc)}</td><td>${q === 0 ? '—' : usd(v)}</td><td>${q === 0 ? '—' : int(q)}</td><td>${tri}</td></tr>`;
      }).join('');
      return `<div class="ps-bres">
        <div class="ps-bh"><b>${esc(nomeEmpresa(a.n))}</b>${a.t ? ` <span class="ps-btk">${esc(a.t.split(' ').join(' · '))}</span>` : ''}
          <small>${esc(a.cl || '')}${a.pc ? ` · opção de ${a.pc === 'Put' ? 'venda (put)' : 'compra (call)'}` : ''}</small>
          <span class="ps-bsum">${tem.length} de ${acoes.fundos.length} fundos têm · ${comprou} ${comprou === 1 ? 'comprou' : 'compraram'} mais · ${vendeu} ${vendeu === 1 ? 'vendeu' : 'venderam'}</span></div>
        <div class="ps-tw"><table class="ps-tab ps-tab13"><thead><tr><th>Fundo</th><th>% da carteira</th><th>Valor</th><th>Ações</th><th>No trimestre</th></tr></thead><tbody>${linhas}</tbody></table></div>
      </div>`;
    }).join('');
  }
  let buscaRes = null, buscaT = null;

  function bind(el) {
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-grupo],[data-cot],[data-lista],[data-rf]');
      if (!t || t.disabled) return;
      if (t.dataset.grupo) {
        prefs.grupo = t.dataset.grupo;
        const m = COT.dados?.mercados.find((x) => x.grupo === prefs.grupo);
        if (m) prefs.cot = m.k;
        savePrefs(); drawCot();
      } else if (t.dataset.cot) { prefs.cot = t.dataset.cot; savePrefs(); drawCot(); }
      else if (t.dataset.lista) { prefs.lista = t.dataset.lista; savePrefs(); drawF13(); }
      else if (t.dataset.rf === 'cot') carrega(COT, drawCot, true);
      else if (t.dataset.rf === 'f13') carrega(F13, drawF13, true);
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-fundo]')) { prefs.fundo = +e.target.value; savePrefs(); drawF13(); }
    });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('.ps-bq input')) return;
      buscaQ = e.target.value;
      clearTimeout(buscaT);
      buscaT = setTimeout(() => { if (buscaQ.trim().length >= 2 && !acoes) carregaAcoes(); drawBusca(); }, 200);
    });
  }

  const css = document.createElement('style');
  const R = '.ps-root';
  css.textContent = `
  ${R} .ps-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  ${R} .ps-top { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line); }
  ${R} .ps-chips { display:flex; gap:6px; flex-wrap:wrap; min-width:0; }
  ${R} .ps-chips .ecal-chip small { color:var(--text-3); font-size:10.5px; margin-left:2px; }
  ${R} .ps-chips .ecal-chip:disabled { opacity:.45; cursor:default; }
  ${R} .ps-data { font-size:12px; color:var(--text-3); margin-left:auto; white-space:nowrap; }
  ${R} .ps-rf { border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:8px; width:32px; height:32px; cursor:pointer; flex:0 0 auto; }
  ${R} .ps-sel { flex:1 1 0; min-width:0; margin-right:auto; }
  ${R} .ps-sel select { width:100%; max-width:420px; background:var(--surface-2); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:7px 10px; font:inherit; font-size:13px; }
  ${R} .ps-kpis { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  ${R} .ps-kpis > div { padding:10px 14px; display:flex; flex-direction:column; gap:2px; min-width:0; }
  ${R} .ps-kpis > div + div { border-left:1px solid var(--line); }
  ${R} .ps-kpis > div > span { font-size:11.5px; color:var(--text-3); }
  ${R} .ps-kpis b { font:700 19px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; }
  ${R} .ps-kpis small { font-size:11px; color:var(--text-3); }
  ${R} .ps-kpis small span { font-size:inherit; }
  ${R} .ps-gh { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 14px 6px; }
  ${R} .ps-gt { font-size:13px; color:var(--text-2); }
  ${R} .ps-gt b { color:var(--text); font-weight:600; }
  ${R} .ps-mut { color:var(--text-3); font-size:12px; }
  ${R} .ps-leg { display:flex; gap:12px; font-size:11.5px; color:var(--text-3); }
  ${R} .ps-sw { display:inline-block; width:14px; height:3px; border-radius:2px; vertical-align:middle; margin-right:5px; }
  ${R} .ps-swe { background:var(--accent); } ${R} .ps-swc { background:var(--text-3); }
  ${R} .ps-graf { position:relative; padding:4px 14px 8px; }
  ${R} .ps-plot { position:relative; }
  ${R} .ps-svg { width:100%; height:180px; display:block; cursor:crosshair; }
  ${R} .ps-ys { position:absolute; left:0; font:10px 'JetBrains Mono', monospace; color:var(--text-3); pointer-events:none; }
  ${R} .ps-ys-t { top:0; } ${R} .ps-ys-b { bottom:0; }
  ${R} .ps-xl { position:relative; height:16px; margin-top:4px; }
  ${R} .ps-xl span { position:absolute; transform:translateX(-50%); font:10px 'JetBrains Mono', monospace; color:var(--text-3); white-space:nowrap; }
  ${R} .ps-xl span:first-child { transform:none; } ${R} .ps-xl span:last-child { transform:translateX(-100%); }
  ${R} .ps-zero { stroke:var(--line-2); stroke-width:1; }
  ${R} .ps-le { fill:none; stroke:var(--accent); stroke-width:2; }
  ${R} .ps-lc { fill:none; stroke:var(--text-3); stroke-width:1.5; opacity:.8; }
  ${R} .ps-cur { stroke:var(--text-3); stroke-width:1; stroke-dasharray:3 3; }
  ${R} .ps-tip { position:absolute; top:0; transform:translateX(-50%); background:var(--surface-3); border:1px solid var(--line-2); border-radius:8px; padding:6px 9px; font-size:12px; color:var(--text); white-space:nowrap; pointer-events:none; box-shadow:var(--shadow-lg); line-height:1.45; }
  ${R} .ps-tip small { color:var(--text-3); }
  ${R} .ps-tw { overflow-x:auto; }
  ${R} .ps-tab { width:100%; border-collapse:collapse; font-size:12.5px; }
  ${R} .ps-tab th, ${R} .ps-tab td { padding:8px 14px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
  ${R} .ps-tab th:first-child { text-align:left; font-weight:500; color:var(--text-2); }
  ${R} .ps-tab thead th { font-size:11px; color:var(--text-3); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  ${R} .ps-tab td { font-family:'JetBrains Mono', monospace; }
  ${R} .ps-tab tbody tr[data-cot] { cursor:pointer; }
  ${R} .ps-tab tbody tr.on th { color:var(--text); font-weight:600; }
  ${R} .ps-tab tbody tr:hover { background:var(--surface-2); }
  ${R} .ps-tab13 tbody th { white-space:normal; min-width:180px; }
  ${R} .ps-tab13 tbody th small { display:block; font-size:10.5px; color:var(--text-3); font-weight:400; }
  ${R} .ps-tdi { width:150px; }
  ${R} .ps-idx { display:inline-block; position:relative; width:90px; height:6px; border-radius:3px; vertical-align:middle; background:linear-gradient(90deg, color-mix(in srgb, var(--neg) 55%, transparent), var(--surface-3) 50%, color-mix(in srgb, var(--pos) 55%, transparent)); }
  ${R} .ps-idx i { position:absolute; top:-3px; width:3px; height:12px; margin-left:-1.5px; border-radius:2px; background:var(--text); }
  ${R} .ps-idxn { display:inline-block; width:28px; margin-left:6px; color:var(--text-2); }
  ${R} .ps-novo { font:600 10.5px var(--font, inherit); color:var(--accent); text-transform:uppercase; letter-spacing:.04em; }
  ${R} .ps-vazio { text-align:center !important; color:var(--text-3); font-family:inherit !important; padding:20px !important; }
  ${R} .ps-mais { padding:8px 14px 0; font-size:11.5px; color:var(--text-3); }
  ${R} .ps-pos { color:var(--pos); } ${R} .ps-neg { color:var(--neg); }
  body.light ${R} .ps-pos { color:color-mix(in srgb, var(--pos) 72%, #000); }
  body.light ${R} .ps-neg { color:color-mix(in srgb, var(--neg) 85%, #000); }
  ${R} .ps-foot { padding:10px 14px 12px; font-size:11.5px; color:var(--text-3); line-height:1.5; }
  ${R} .ps-foot a { color:var(--text-2); }
  ${R} .ps-err { display:block; color:var(--neg); margin-top:4px; }
  ${R} .ps-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  ${R} .ps-bq { margin-bottom:12px; }
  ${R} .ps-bq label { display:flex; align-items:center; gap:10px; padding:10px 14px; color:var(--text-3); }
  ${R} .ps-bq input { flex:1; min-width:0; background:var(--surface-2); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 11px; font:inherit; font-size:13px; }
  ${R} .ps-bout:empty { display:none; }
  ${R} .ps-bres { border-top:1px solid var(--line); }
  ${R} .ps-bh { padding:10px 14px 6px; display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 10px; }
  ${R} .ps-bh b { font-size:14px; color:var(--text); font-weight:600; }
  ${R} .ps-bh small { font-size:11px; color:var(--text-3); }
  ${R} .ps-btk { font:600 12px 'JetBrains Mono', monospace; color:var(--accent); }
  ${R} .ps-bsum { flex-basis:100%; font-size:12px; color:var(--text-2); }
  ${R} .ps-bout .ps-msg { border-top:1px solid var(--line); padding:18px; }
  ${R} .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  @media (max-width: 640px) {
    ${R} .ps-top:has(.ps-chips) { flex-wrap:wrap; }
    ${R} .ps-chips { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; }
    ${R} .ps-chips .ecal-chip { flex:0 0 auto; }
    ${R} .ps-kpis { grid-template-columns:1fr; }
    ${R} .ps-kpis > div { display:grid; grid-template-columns:1fr auto; grid-template-areas:"t v" "s v"; align-items:center; padding:8px 12px; }
    ${R} .ps-kpis > div + div { border-left:0; border-top:1px solid var(--line); }
    ${R} .ps-kpis > div > span { grid-area:t; } ${R} .ps-kpis small { grid-area:s; } ${R} .ps-kpis b { grid-area:v; font-size:16px; }
    ${R} .ps-svg { height:160px; }
    ${R} .ps-tab th, ${R} .ps-tab td { padding:8px 10px; }
    ${R} .ps-tdi { width:auto; } ${R} .ps-idx { width:56px; }
    ${R} .ps-tab13 tbody th { min-width:150px; }
  }`;
  document.head.appendChild(css);

  window.__posicoesRender = (qual, el) => {
    el.classList.add('ps-root');
    if (qual === 'cot') {
      if (cotRoot !== el) { cotRoot = el; bind(el); }
      el.querySelector('.ps-card') || drawCot();
      carrega(COT, drawCot);
    } else {
      if (!el.querySelector('.ps-f13')) {
        el.innerHTML = `<div class="ps-bq ps-card"><label><i class="fas fa-search" aria-hidden="true"></i><span class="sr-only">Quem tem essa ação?</span>
            <input type="search" placeholder="Quem tem essa ação? Digite o ticker ou o nome (ex.: NVDA, Apple)" autocomplete="off"></label>
            <div class="ps-bout"></div></div><div class="ps-f13"></div>`;
        bind(el);
      }
      buscaRes = el.querySelector('.ps-bout');
      f13Root = el.querySelector('.ps-f13');
      f13Root.querySelector('.ps-card') || drawF13();
      carrega(F13, drawF13);
    }
  };
})();
