/* =========================================================
   RADAR DE INSIDERS (aba Insiders, 13/11/2026, pedido do Dante)
   Compras e vendas de ações da própria empresa por controladores e administradores (conselhos e diretoria),
   mês a mês, desde jan/2021. Fonte: insiders/insiders.json, gravado toda semana pelo robô do GitHub a partir
   da base "Valores Mobiliários Negociados e Detidos" da CVM (Resolução CVM 44, licença ODbL). Valores em R$ mil.
   Só compra e venda à vista; a recompra da própria empresa (tesouraria) não está nessa base.
   Regra do painel: nada inventado; mês ainda chegando aparece marcado como parcial.
   ========================================================= */
(() => {
  if (window.__insidersRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/insiders/insiders.json', 'insiders/insiders.json'];
  const PREF_KEY = 'mm_insiders_v1';
  const QUEM = [['todos', 'Todos'], ['ctl', 'Controladores'], ['adm', 'Administração']];
  const PERIODOS = [['12', '1A'], ['24', '2A'], ['36', '3A'], ['60', '5A'], ['0', 'Máx']];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const COR_ACUM = '#3b82f6', COR_IBOV = '#f0b90b';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mesTxt = (m) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
  const mesLongo = (m) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
  // R$ mil -> "+R$ 1,09 bi", "−R$ 627 mi", "R$ 850 mil"
  const brl = (mil, sinal = true) => {
    if (!ok(mil)) return '—';
    const a = Math.abs(mil), s = sinal ? (mil > 0 ? '+' : mil < 0 ? '−' : '') : '';
    const f = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (a >= 1e6) return `${s}R$ ${f(a / 1e6, 2)} bi`;
    if (a >= 1e3) return `${s}R$ ${f(a / 1e3, a >= 1e5 ? 0 : 1)} mi`;
    return `${s}R$ ${f(a, 0)} mil`;
  };
  const eixo = (mil) => {
    const a = Math.abs(mil), s = mil < 0 ? '−' : '';
    if (!a) return '0';
    if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
    if (a >= 1e3) return `${s}${Math.round(a / 1e3)} mi`;
    return `${s}${Math.round(a)} mil`;
  };
  const tom = (v) => (!ok(v) || v === 0 ? '' : v > 0 ? 'up' : 'down');
  const corVar = (n, alt) => (getComputedStyle(document.body).getPropertyValue(n) || '').trim() || alt;

  let dados = null, erro = '', busy = false, root = null, vista = null;
  let prefs = { quem: 'todos', per: '60', setor: '', emp: -1, ibov: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* padrão */ }
  if (!QUEM.some((q) => q[0] === prefs.quem)) prefs.quem = 'todos';
  if (!PERIODOS.some((p) => p[0] === prefs.per)) prefs.per = '60';
  const salvar = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs, emp: -1 })); } catch (e) { /* cheio */ } };

  async function getJSON(url) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  async function load() {
    busy = true; erro = ''; draw();
    try {
      let j = null;
      for (const u of URLS) { try { j = await getJSON(u); if (Array.isArray(j.meses) && Array.isArray(j.emp)) break; j = null; } catch (e) { j = null; } }
      if (!j) throw new Error('sem dados');
      j.emp.forEach((e, i) => { e.i = i; e.busca = sem(e.n + ' ' + e.t.join(' ')); });
      dados = j;
    } catch (e) { erro = 'Não foi possível carregar o radar de insiders agora.'; }
    busy = false; draw();
  }

  // compras e vendas de uma empresa num mês, conforme o filtro "Quem"
  function cv(v) {
    if (!v) return [0, 0];
    if (prefs.quem === 'ctl') return [v[0], v[1]];
    if (prefs.quem === 'adm') return [v[2], v[3]];
    return [v[0] + v[2], v[1] + v[3]];
  }
  const filtroEmp = (e) => (prefs.emp >= 0 ? e.i === prefs.emp : !prefs.setor || dados.setores[e.s] === prefs.setor);
  function janela() {
    const n = dados.meses.length, per = +prefs.per;
    return per ? Math.max(0, n - per) : 0;
  }
  // série mensal do filtro atual
  function serie() {
    const n = dados.meses.length, c = new Array(n).fill(0), v = new Array(n).fill(0);
    const todasEmp = prefs.emp < 0 && !prefs.setor;
    if (todasEmp) {
      for (let i = 0; i < n; i++) {
        const a = dados.tot.ctl[i], b = dados.tot.adm[i];
        c[i] = prefs.quem === 'ctl' ? a[0] : prefs.quem === 'adm' ? b[0] : a[0] + b[0];
        v[i] = prefs.quem === 'ctl' ? a[1] : prefs.quem === 'adm' ? b[1] : a[1] + b[1];
      }
    } else {
      for (const e of dados.emp) {
        if (!filtroEmp(e)) continue;
        for (const [k, x] of Object.entries(e.m)) { const [cc, vv] = cv(x); c[+k] += cc; v[+k] += vv; }
      }
    }
    return { c, v, s: c.map((x, i) => x - v[i]) };
  }
  // saldo de cada empresa e de cada setor no período (para os rankings)
  function somas(i0) {
    const emp = [], set = new Map();
    for (const e of dados.emp) {
      let c = 0, v = 0;
      for (const [k, x] of Object.entries(e.m)) { if (+k < i0) continue; const [cc, vv] = cv(x); c += cc; v += vv; }
      if (!c && !v) continue;
      const s = dados.setores[e.s];
      const t = set.get(s) || { s, c: 0, v: 0 }; t.c += c; t.v += v; set.set(s, t);
      if (!prefs.setor || s === prefs.setor) emp.push({ e, c, v, l: c - v });
    }
    return { emp, set: [...set.values()].map((x) => ({ ...x, l: x.c - x.v })) };
  }

  function escala(min, max, partes = 4) {
    if (min === max) { min -= 1; max += 1; }
    const bruto = (max - min) / partes, p = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto) || 10 * p;
    const lo = Math.floor(min / passo) * passo, hi = Math.ceil(max / passo) * passo;
    const ticks = [];
    for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(v);
    return { lo, hi, ticks };
  }

  // barras do saldo do mês (eixo esquerdo) + linha do acumulado (eixo esquerdo, escala própria à direita) + Ibovespa
  function svgGrafico(W) {
    const i0 = janela(), M = dados.meses.slice(i0), n = M.length;
    const H = Math.round(Math.min(460, Math.max(300, W * 0.42))), T = 14, B = 26, L = 62, R = prefs.ibov ? 64 : 16;
    const pw = W - L - R, ph = H - T - B;
    const S = serie(), sal = S.s.slice(i0), com = S.c.slice(i0), ven = S.v.slice(i0);
    let acc = 0; const acum = sal.map((v) => (acc += v));
    const ib = dados.ibov.slice(i0);
    const pos = corVar('--pos', '#16c784'), neg = corVar('--neg', '#ea3943');
    const bw = pw / Math.max(n, 1), xc = (i) => L + (i + 0.5) * bw;
    const e = escala(Math.min(0, ...sal, ...acum), Math.max(0, ...sal, ...acum));
    const y = (v) => T + (e.hi - v) / (e.hi - e.lo) * ph;
    let corpo = e.ticks.map((t) => `<line class="in-grid${t === 0 ? ' z' : ''}" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="in-ty" x="${L - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${eixo(t)}</text>`).join('');
    const parc = new Set(dados.parciais || []);
    const w = Math.max(1, bw * 0.7);
    corpo += sal.map((v, i) => {
      if (!v) return '';
      const y1 = y(Math.max(v, 0)), y2 = y(Math.min(v, 0));
      return `<rect x="${(xc(i) - w / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" fill="${v >= 0 ? pos : neg}" opacity="${parc.has(M[i]) ? 0.35 : 0.85}"/>`;
    }).join('');
    corpo += `<polyline points="${acum.map((v, i) => `${xc(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${COR_ACUM}" stroke-width="2.2" stroke-linejoin="round"/>`;
    let eixoD = '';
    if (prefs.ibov && ib.some(ok)) {
      const vs = ib.filter(ok), ei = escala(Math.min(...vs), Math.max(...vs));
      const yi = (v) => T + (ei.hi - v) / (ei.hi - ei.lo) * ph;
      eixoD = ei.ticks.map((t) => `<text class="in-ty in-ti" x="${W - R + 8}" y="${(yi(t) + 3.5).toFixed(1)}">${Math.round(t / 1000)} mil</text>`).join('');
      const seg = []; let cur = [];
      ib.forEach((v, i) => { if (ok(v)) cur.push(`${xc(i).toFixed(1)},${yi(v).toFixed(1)}`); else if (cur.length) { seg.push(cur); cur = []; } });
      if (cur.length) seg.push(cur);
      corpo += seg.filter((s) => s.length > 1).map((s) => `<polyline points="${s.join(' ')}" fill="none" stroke="${COR_IBOV}" stroke-width="1.7" stroke-linejoin="round" opacity=".9"/>`).join('');
    }
    // umas 7 marcas de mês no eixo x
    const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.min(8, Math.floor(W / 85)))));
    const mx = [];
    for (let i = 0; i < n; i += passo) if (n - 1 - i >= passo * 0.6 || i === 0) mx.push(i);
    if (mx[mx.length - 1] !== n - 1) mx.push(n - 1);
    const marcas = mx.map((i) => `<text class="in-tx" x="${xc(i).toFixed(1)}" y="0" text-anchor="${i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${mesTxt(M[i])}</text>`).join('');
    vista = { n, L, R, W, bw, xc, tip: (i) => `<b>${mesLongo(M[i])}${parc.has(M[i]) ? ' <em>(ainda chegando)</em>' : ''}</b>
        <div><i style="background:${sal[i] < 0 ? neg : pos}"></i>Saldo do mês <span class="${tom(sal[i])}">${brl(sal[i])}</span></div>
        <div><i style="background:${COR_ACUM}"></i>Acumulado no período <span class="${tom(acum[i])}">${brl(acum[i])}</span></div>
        ${prefs.ibov && ok(ib[i]) ? `<div><i style="background:${COR_IBOV}"></i>Ibovespa no fim do mês <span>${ib[i].toLocaleString('pt-BR')}</span></div>` : ''}
        <small>compras ${brl(com[i], false)} · vendas ${brl(ven[i], false)}</small>` };
    return { acum: acum[n - 1] || 0, svg: `<svg class="in-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo mensal de compras e vendas de insiders">
      ${corpo}${eixoD}<g transform="translate(0 ${H - 8})">${marcas}</g><line class="in-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>` };
  }

  function quemTxt() { return prefs.quem === 'ctl' ? 'controladores' : prefs.quem === 'adm' ? 'conselhos e diretoria' : 'controladores, conselhos e diretoria'; }
  function alvoTxt() {
    if (prefs.emp >= 0) { const e = dados.emp[prefs.emp]; return `${esc(e.n)} <span class="in-mut">${esc(e.t.join(', '))}</span>`; }
    return prefs.setor ? esc(prefs.setor) : 'Todas as empresas';
  }

  function rankSetores(lista) {
    const comp = lista.filter((x) => x.l > 0).sort((a, b) => b.l - a.l).slice(0, 6), vend = lista.filter((x) => x.l < 0).sort((a, b) => a.l - b.l).slice(0, 6);
    const max = Math.max(1, ...comp.map((x) => x.l), ...vend.map((x) => -x.l));
    const col = (l, cls, tit) => `<div class="in-rk"><h4 class="${cls}">${tit}</h4>${l.length ? l.map((x, i) => `<button type="button" class="in-rki${prefs.setor === x.s ? ' on' : ''}" data-in-setor="${esc(x.s)}" title="Ver só ${esc(x.s)}"><span class="in-rkn">${i + 1}º ${esc(x.s)}</span><b class="${tom(x.l)}">${brl(x.l)}</b><i style="width:${(Math.abs(x.l) / max * 100).toFixed(1)}%"></i></button>`).join('') : '<p class="in-mut">Nenhum no período.</p>'}</div>`;
    return col(comp, 'up', 'Maiores compras') + col(vend, 'down', 'Maiores vendas');
  }
  function rankEmpresas(lista) {
    const comp = lista.filter((x) => x.l > 0).sort((a, b) => b.l - a.l).slice(0, 10), vend = lista.filter((x) => x.l < 0).sort((a, b) => a.l - b.l).slice(0, 10);
    const lin = (x) => `<tr data-in-emp="${x.e.i}" tabindex="0"><td><b>${esc(x.e.t[0])}</b> <span class="in-mut">${esc(x.e.n)}</span></td><td class="n ${tom(x.l)}">${brl(x.l)}</td></tr>`;
    const tab = (l, t, cls) => `<div><h4 class="${cls}">${t}</h4><table class="in-tb"><tbody>${l.length ? l.map(lin).join('') : '<tr><td class="in-mut">Nenhuma no período.</td></tr>'}</tbody></table></div>`;
    return tab(comp, 'Empresas com mais compras', 'up') + tab(vend, 'Empresas com mais vendas', 'down');
  }
  function tabelaOps() {
    const ops = (dados.ops || []).filter(([ei, cargo]) => {
      const e = dados.emp[ei];
      if (prefs.emp >= 0 ? ei !== prefs.emp : prefs.setor && dados.setores[e.s] !== prefs.setor) return false;
      if (prefs.quem === 'ctl') return cargo === 'Controlador';
      if (prefs.quem === 'adm') return cargo !== 'Controlador';
      return true;
    }).slice(0, 60);
    if (!ops.length) return '<p class="in-mut in-pad">Nenhuma operação acima de R$ 1 milhão nos últimos meses com esta seleção.</p>';
    return `<div class="in-tw"><table class="in-tb in-ops"><thead><tr><th>Data</th><th>Empresa</th><th>Quem</th><th>Operação</th><th class="n">Quantidade</th><th class="n">Preço</th><th class="n">Volume</th></tr></thead><tbody>${ops.map(([ei, cargo, op, dia, q, p, vol, classe]) => {
      const e = dados.emp[ei];
      return `<tr data-in-emp="${ei}" tabindex="0"><td>${dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}` : '—'}</td><td><b>${esc(e.t[0])}</b> <span class="in-mut">${esc(e.n)}</span></td><td>${esc(cargo)}</td><td class="${op === 'C' ? 'up' : 'down'}">${op === 'C' ? 'Compra' : 'Venda'}${classe ? ` <span class="in-mut">${esc(classe)}</span>` : ''}</td><td class="n">${q.toLocaleString('pt-BR')}</td><td class="n">R$ ${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="n">${brl(vol, false)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function draw() {
    if (!root) return;
    if (!dados) {
      root.innerHTML = `<div class="in-wrap"><div class="in-card in-pad">${busy ? 'Carregando o radar de insiders…' : esc(erro) + ' <button type="button" class="in-ib" data-in-rf>Tentar de novo</button>'}</div></div>`;
      return;
    }
    const i0 = janela(), M = dados.meses, ult = M[M.length - 1], parc = dados.parciais || [];
    const sm = somas(i0);
    const setores = [...new Set(dados.emp.map((e) => dados.setores[e.s]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const empSel = prefs.emp >= 0 ? dados.emp[prefs.emp] : null;
    root.innerHTML = `<div class="in-wrap">
      <header class="in-head"><div><h2>Radar de Insiders <span class="in-tag">CVM 44</span></h2>
        <p class="in-mut">Compras e vendas de ações da própria empresa por ${quemTxt()}, mês a mês. Dados entregues à CVM até o dia 10 do mês seguinte.</p></div></header>
      <div class="in-filtros in-card">
        <label class="in-busca"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-in-busca placeholder="Buscar empresa (ex.: PETR4, Vale, Itaú)" aria-label="Buscar empresa" autocomplete="off" value="${empSel ? esc(empSel.t[0] + ' · ' + empSel.n) : ''}"><div class="in-sug" hidden></div></label>
        <div class="in-seg" role="group" aria-label="Quem negociou">${QUEM.map(([k, t]) => `<button type="button" data-in-quem="${k}" class="${prefs.quem === k ? 'on' : ''}" aria-pressed="${prefs.quem === k}">${t}</button>`).join('')}</div>
        <select class="in-sel" data-in-setsel aria-label="Setor"><option value="">Todos os setores</option>${setores.map((s) => `<option${prefs.setor === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <div class="in-seg" role="group" aria-label="Período">${PERIODOS.map(([k, t]) => `<button type="button" data-in-per="${k}" class="${prefs.per === k ? 'on' : ''}" aria-pressed="${prefs.per === k}">${t}</button>`).join('')}</div>
        <label class="in-chk"><input type="checkbox" data-in-ibov${prefs.ibov ? ' checked' : ''}> Ibovespa</label>
        ${empSel || prefs.setor ? '<button type="button" class="in-ib" data-in-limpar>Limpar filtros</button>' : ''}
      </div>
      <div class="in-grade">
        <section class="in-card in-gcard" aria-label="Gráfico">
          <div class="in-gh"><div><b>${alvoTxt()}</b><span class="in-mut">${mesLongo(M[i0])} a ${mesLongo(ult)}${parc.length ? ` · ${parc.map(mesTxt).join(', ')} ainda chegando` : ''}</span></div>
            <div class="in-kpi"><span>Saldo no período</span><b data-in-acum></b></div></div>
          <div class="in-lgs"><span class="in-lg"><i class="sq"></i>Saldo do mês</span><span class="in-lg"><i style="background:${COR_ACUM}"></i>Acumulado</span>${prefs.ibov ? `<span class="in-lg"><i style="background:${COR_IBOV}"></i>Ibovespa (eixo à direita)</span>` : ''}</div>
          <div class="in-graf"><div class="in-svgbox"></div><div class="in-tip" hidden></div></div>
        </section>
        <aside class="in-card in-pad" aria-label="Ranking de setores"><h3>Setores no período</h3><p class="in-mut">Compras menos vendas. Clique para ver só o setor.</p><div class="in-rks">${rankSetores(sm.set)}</div></aside>
      </div>
      ${empSel ? '' : `<section class="in-card in-pad in-emps" aria-label="Empresas">${rankEmpresas(sm.emp)}</section>`}
      <section class="in-card" aria-label="Operações recentes"><div class="in-pad in-oph"><h3>Operações recentes acima de R$ 1 milhão</h3><span class="in-mut">Últimos 3 meses informados. Clique numa linha para ver a empresa.</span></div>${tabelaOps()}</section>
      <p class="in-nota">Fonte: CVM, Dados Abertos (Valores Mobiliários Negociados e Detidos, Resolução CVM 44, licença ODbL), atualizado em ${new Date(dados.gerado).toLocaleDateString('pt-BR')}. Conta só compra e venda à vista de ações e units da própria empresa; ficam de fora empréstimos, planos de remuneração, subscrições e a recompra feita pela própria empresa (tesouraria), que não está nessa base. Vendas grandes de controladores costumam ser ofertas públicas e privatizações. Não é recomendação de investimento.</p>
    </div>`;
    desenhaGrafico();
  }
  function desenhaGrafico() {
    const box = root?.querySelector('.in-svgbox'); if (!box) return;
    const W = Math.max(300, Math.floor(box.getBoundingClientRect().width || 800));
    const g = svgGrafico(W);
    box.innerHTML = g.svg;
    const k = root.querySelector('[data-in-acum]'); if (k) { k.textContent = brl(g.acum); k.className = tom(g.acum); }
    const svg = box.querySelector('svg'), tip = root.querySelector('.in-tip'), cross = svg.querySelector('.in-cross');
    const mostra = (ev) => {
      const r = svg.getBoundingClientRect(), x = ev.clientX - r.left;
      const i = Math.floor((x - vista.L) / vista.bw);
      if (i < 0 || i >= vista.n) { esconde(); return; }
      cross.setAttribute('x1', vista.xc(i)); cross.setAttribute('x2', vista.xc(i)); cross.setAttribute('visibility', 'visible');
      tip.innerHTML = vista.tip(i); tip.hidden = false;
      const tw = tip.offsetWidth, px = vista.xc(i);
      tip.style.left = (px + 14 + tw > vista.W ? Math.max(4, px - tw - 14) : px + 14) + 'px';
    };
    const esconde = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', mostra);
    svg.addEventListener('pointerleave', esconde);
  }

  function sugestoes(q) {
    const s = root.querySelector('.in-sug'); if (!s) return;
    const t = sem(q).trim();
    if (!t) { s.hidden = true; return; }
    const l = dados.emp.filter((e) => e.busca.includes(t)).sort((a, b) => (b.t.some((x) => sem(x).startsWith(t)) - a.t.some((x) => sem(x).startsWith(t))) || a.n.localeCompare(b.n)).slice(0, 8);
    s.innerHTML = l.length ? l.map((e) => `<button type="button" data-in-emp="${e.i}"><b>${esc(e.t[0])}</b> ${esc(e.n)}</button>`).join('') : '<p class="in-mut">Nenhuma empresa com negociação de insiders.</p>';
    s.hidden = false;
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-in-quem],[data-in-per],[data-in-setor],[data-in-emp],[data-in-limpar],[data-in-rf]');
      if (!t) { if (!e.target.closest('.in-busca')) { const s = el.querySelector('.in-sug'); if (s) s.hidden = true; } return; }
      if (t.hasAttribute('data-in-rf')) { load(); return; }
      if (t.dataset.inQuem) prefs.quem = t.dataset.inQuem;
      else if (t.dataset.inPer) prefs.per = t.dataset.inPer;
      else if (t.dataset.inSetor != null) { prefs.setor = prefs.setor === t.dataset.inSetor ? '' : t.dataset.inSetor; prefs.emp = -1; }
      else if (t.dataset.inEmp != null) { prefs.emp = +t.dataset.inEmp; el.querySelector('.in-wrap')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      else if (t.hasAttribute('data-in-limpar')) { prefs.setor = ''; prefs.emp = -1; }
      salvar(); draw();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tr = e.target.closest('tr[data-in-emp]');
      if (tr) { prefs.emp = +tr.dataset.inEmp; draw(); return; }
      if (e.target.matches('[data-in-busca]')) { const b = el.querySelector('.in-sug button'); if (b) b.click(); }
    });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-in-busca]')) return;
      if (!e.target.value && prefs.emp >= 0) { prefs.emp = -1; draw(); el.querySelector('[data-in-busca]')?.focus(); return; }
      sugestoes(e.target.value);
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-in-setsel]')) { prefs.setor = e.target.value; prefs.emp = -1; salvar(); draw(); }
      else if (e.target.matches('[data-in-ibov]')) { prefs.ibov = e.target.checked; salvar(); draw(); }
    });
    let rt = 0;
    new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (dados && root?.offsetParent) desenhaGrafico(); }, 120); }).observe(el);
  }

  const css = document.createElement('style');
  css.textContent = `
  #insiders-root .in-wrap { display:flex; flex-direction:column; gap:14px; }
  #insiders-root .in-head h2 { margin:0; font-size:20px; display:flex; align-items:center; gap:8px; }
  #insiders-root .in-tag { font:600 11px 'JetBrains Mono', monospace; color:var(--text-3); border:1px solid var(--line); border-radius:6px; padding:2px 6px; }
  #insiders-root .in-head p { margin:4px 0 0; }
  #insiders-root .in-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); }
  #insiders-root .in-pad { padding:14px; }
  #insiders-root .in-mut { color:var(--text-3); font-size:12px; font-weight:400; }
  #insiders-root h3 { margin:0 0 2px; font-size:14px; }
  #insiders-root h4 { margin:12px 0 6px; font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; }
  #insiders-root .up { color:var(--pos); } #insiders-root .down { color:var(--neg); }
  #insiders-root .in-filtros { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 12px; }
  #insiders-root .in-busca { position:relative; flex:1 1 260px; display:flex; align-items:center; gap:8px; height:34px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); padding:0 10px; color:var(--text-3); }
  #insiders-root .in-busca { box-sizing:border-box; min-width:0; }
  #insiders-root .in-busca input { flex:1; min-width:0; border:0 !important; background:none !important; box-shadow:none !important; padding:0 !important; height:auto; -webkit-appearance:none; appearance:none; color:var(--text); font:inherit; font-size:13px; outline:none; }
  #insiders-root .in-sug { position:absolute; left:0; right:0; top:38px; z-index:5; background:var(--surface-3); border:1px solid var(--line-2); border-radius:10px; box-shadow:var(--shadow-lg); padding:4px; max-height:300px; overflow:auto; }
  #insiders-root .in-sug button { display:block; width:100%; text-align:left; border:0; background:none; color:var(--text-2); font:inherit; font-size:12.5px; padding:7px 8px; border-radius:7px; cursor:pointer; }
  #insiders-root .in-sug button:hover, #insiders-root .in-sug button:focus-visible { background:var(--surface-2); color:var(--text); }
  #insiders-root .in-sug b { color:var(--text); margin-right:6px; font-family:'JetBrains Mono', monospace; }
  #insiders-root .in-sug p { margin:6px 8px; }
  #insiders-root .in-seg { display:inline-flex; padding:3px; gap:2px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); }
  #insiders-root .in-seg button { border:0; background:none; color:var(--text-3); font:inherit; font-size:12.5px; padding:5px 11px; border-radius:7px; cursor:pointer; white-space:nowrap; }
  #insiders-root .in-seg button.on { background:var(--surface); color:var(--text); box-shadow:var(--shadow-sm); font-weight:600; }
  #insiders-root .in-sel { height:34px; max-width:240px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--text); font:inherit; font-size:12.5px; padding:0 8px; cursor:pointer; }
  #insiders-root .in-chk { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-2); cursor:pointer; }
  #insiders-root .in-ib { height:32px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:9px; cursor:pointer; font:inherit; font-size:12px; padding:0 10px; }
  #insiders-root .in-ib:hover { color:var(--text); border-color:var(--line-2); }
  #insiders-root .in-grade { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:14px; align-items:start; }
  #insiders-root .in-gh { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; flex-wrap:wrap; padding:12px 14px 4px; }
  #insiders-root .in-gh > div:first-child { display:flex; flex-direction:column; gap:2px; font-size:14px; }
  #insiders-root .in-kpi { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
  #insiders-root .in-kpi span { font-size:11.5px; color:var(--text-3); }
  #insiders-root .in-kpi b { font:700 18px 'JetBrains Mono', monospace; white-space:nowrap; }
  #insiders-root .in-lgs { display:flex; gap:6px 14px; flex-wrap:wrap; padding:2px 14px; }
  #insiders-root .in-lg { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); }
  #insiders-root .in-lg i { width:12px; height:3px; border-radius:2px; display:inline-block; }
  #insiders-root .in-lg i.sq { width:10px; height:10px; background:linear-gradient(90deg, var(--pos) 50%, var(--neg) 50%); }
  #insiders-root .in-graf { position:relative; padding:6px 6px 4px; }
  #insiders-root .in-svg { display:block; touch-action:pan-y; }
  #insiders-root .in-grid { stroke:var(--line); stroke-width:1; }
  #insiders-root .in-grid.z { stroke:var(--line-2); stroke-width:1.2; }
  #insiders-root .in-ty, #insiders-root .in-tx { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); }
  #insiders-root .in-ti { fill:${COR_IBOV}; }
  #insiders-root .in-cross { stroke:var(--text-3); stroke-width:1; stroke-dasharray:3 3; pointer-events:none; }
  #insiders-root .in-tip { position:absolute; top:10px; background:var(--surface-3); border:1px solid var(--line-2); border-radius:10px; padding:8px 10px; font-size:12px; color:var(--text-2); pointer-events:none; box-shadow:var(--shadow-lg); min-width:230px; z-index:2; }
  #insiders-root .in-tip b { color:var(--text); display:block; margin-bottom:4px; }
  #insiders-root .in-tip em { font-weight:400; color:var(--text-3); font-style:normal; }
  #insiders-root .in-tip div { display:flex; align-items:center; gap:6px; white-space:nowrap; line-height:1.7; }
  #insiders-root .in-tip div span { margin-left:auto; padding-left:12px; font-family:'JetBrains Mono', monospace; }
  #insiders-root .in-tip i { width:8px; height:8px; border-radius:2px; flex:none; }
  #insiders-root .in-tip small { display:block; color:var(--text-3); margin-top:3px; }
  #insiders-root .in-rks { display:flex; flex-direction:column; }
  #insiders-root .in-rki { position:relative; display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; border:0; border-bottom:1px solid var(--line); background:none; color:var(--text-2); font:inherit; font-size:12.5px; padding:7px 2px 9px; cursor:pointer; text-align:left; }
  #insiders-root .in-rki:hover, #insiders-root .in-rki.on { color:var(--text); }
  #insiders-root .in-rki.on { background:var(--surface-2); }
  #insiders-root .in-rkn { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #insiders-root .in-rki b { font:600 12px 'JetBrains Mono', monospace; white-space:nowrap; }
  #insiders-root .in-rki i { position:absolute; left:2px; bottom:3px; height:3px; border-radius:2px; opacity:.7; }
  #insiders-root h4.up ~ .in-rki i { background:var(--pos); }
  #insiders-root h4.down ~ .in-rki i { background:var(--neg); }
  #insiders-root .in-emps { display:grid; grid-template-columns:1fr 1fr; gap:4px 20px; }
  #insiders-root .in-emps h4 { margin-top:0; }
  #insiders-root .in-tb { width:100%; border-collapse:collapse; font-size:12.5px; }
  #insiders-root .in-tb td, #insiders-root .in-tb th { padding:7px 8px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
  #insiders-root .in-tb .n { text-align:right; font-family:'JetBrains Mono', monospace; }
  #insiders-root .in-tb td:first-child { max-width:0; width:100%; overflow:hidden; text-overflow:ellipsis; }
  #insiders-root .in-tb tbody tr[data-in-emp] { cursor:pointer; }
  #insiders-root .in-tb tbody tr[data-in-emp]:hover { background:var(--surface-2); }
  #insiders-root .in-tb thead th { font-size:11px; color:var(--text-3); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  #insiders-root .in-ops td:first-child { max-width:none; width:auto; font-family:'JetBrains Mono', monospace; }
  #insiders-root .in-ops td:nth-child(2) { max-width:0; width:100%; overflow:hidden; text-overflow:ellipsis; }
  #insiders-root .in-tw { overflow-x:auto; }
  #insiders-root .in-oph { padding-bottom:6px; display:flex; flex-direction:column; gap:2px; }
  #insiders-root .in-nota { font-size:11.5px; color:var(--text-3); line-height:1.6; margin:0; }
  @media (max-width: 1100px) { #insiders-root .in-grade { grid-template-columns:minmax(0,1fr); } }
  @media (max-width: 700px) { #insiders-root .in-emps { grid-template-columns:minmax(0,1fr); } #insiders-root .in-sel { max-width:none; flex:1 1 100%; min-width:0; box-sizing:border-box; width:100%; } #insiders-root .in-busca { flex-basis:100%; } #insiders-root .in-tb td:first-child { white-space:normal; } }
  `;
  document.head.appendChild(css);

  window.__insidersRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    if (dados) draw(); else if (!busy) load();
  };
  const el = document.getElementById('insiders-root');
  if (el) window.__insidersRender(el);
})();
