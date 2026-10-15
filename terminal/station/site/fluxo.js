/* =========================================================
   FLUXO DE INVESTIDORES NA B3 (aba Mercado, seção "Fluxo na B3")
   Compras menos vendas de estrangeiros, institucionais, pessoas físicas,
   instituições financeiras e demais, por dia, no mês e no ano.
   Fonte: fluxo/fluxo.json, gravado pelo robô do GitHub a partir do Boletim Diário
   do Mercado da B3 (tabela "Participação dos investidores"), com cerca de 2 pregões
   de atraso. Valores do arquivo em R$ mil.
   v2: aba Gráfico (barras do dia + linha do acumulado + média móvel, ou só a linha)
   e aba Comparação (acumulado dos 5 tipos de investidor no mesmo gráfico),
   período escolhido, eixos com escala, dica ao passar o mouse e "Baixar imagem".
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__fluxoRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fluxo/fluxo.json', 'fluxo/fluxo.json'];
  const CACHE_KEY = 'fluxo_cache_v1';
  const PREF_KEY = 'fluxo_prefs_v2';
  const TTL = 60 * 60 * 1000;
  const TIPOS = [
    ['estrangeiro', 'Estrangeiro', '#3b82f6'],
    ['institucional', 'Institucional', '#f0b90b'],
    ['pf', 'Pessoa física', '#a855f7'],
    ['if', 'Instituições financeiras', '#14b8a6'],
    ['outros', 'Outros', '#94a3b8'],
  ];
  const PERIODOS = [['1m', '1 mês'], ['3m', '3 meses'], ['6m', '6 meses'], ['ytd', 'Ano atual'], ['12m', '12 meses'], ['tudo', 'Tudo']];
  const MMS = [[0, 'Sem média'], [5, 'Média 5'], [10, 'Média 10'], [21, 'Média 21']];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const COR_ACUM = '#3b82f6', COR_MM = '#f0b90b';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
  const dmyy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  // R$ mil -> texto curto: "+R$ 1,09 bi" ou "−R$ 627 mi"
  const brl = (mil, sinal = true) => {
    if (!ok(mil)) return '—';
    const a = Math.abs(mil), s = sinal ? (mil > 0 ? '+' : mil < 0 ? '−' : '') : (mil < 0 ? '−' : '');
    if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`;
    return `${s}R$ ${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`;
  };
  // escala dos eixos (R$ mil -> "5 bi", "−500 mi")
  const eixo = (mil) => {
    const a = Math.abs(mil), s = mil < 0 ? '−' : '';
    if (a === 0) return '0';
    if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
    return `${s}${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`;
  };
  const tom = (v) => (!ok(v) || v === 0 ? '' : v > 0 ? 'fx-pos' : 'fx-neg');

  let prefs = { aba: 'graf', per: 'ytd', tipo: 'estrangeiro', modo: 'barras', mm: 21, ocultos: [] };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }
  let root = null, busy = false, erro = '', vista = null;

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
      for (const u of URLS) { try { j = await getJSON(u); if (Array.isArray(j.dias)) break; } catch (e) { j = null; } }
      if (!j) throw new Error('sem dados');
      cache = { ts: Date.now(), gerado: j.gerado, dias: j.dias || [], meses: j.meses || {} };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) {
      erro = 'Não foi possível buscar o fluxo da B3 agora.';
    } finally { busy = false; draw(); }
  }

  // saldo no ano: só soma se todos os meses do ano até agora estão no arquivo
  // e cada mês fechado termina perto do fim do mês (senão o total ficaria incompleto)
  function saldoAno(tipo) {
    const meses = cache?.meses || {};
    const ult = Object.keys(meses).sort().pop();
    if (!ult) return null;
    const ano = ult.slice(0, 4), mesAtual = +ult.slice(5, 7);
    let soma = 0;
    for (let m = 1; m <= mesAtual; m++) {
      const k = `${ano}-${String(m).padStart(2, '0')}`, x = meses[k];
      if (!x || !x.tipos?.[tipo]) return null;
      if (m < mesAtual && +x.ate.slice(8, 10) < 25) return null;
      soma += x.tipos[tipo].saldo;
    }
    return { v: soma, ano };
  }

  // data de corte do período escolhido (null = tudo)
  function corteDe(per, ult) {
    if (per === 'tudo' || !ult) return null;
    if (per === 'ytd') return `${ult.slice(0, 4)}-01-01`;
    const m = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[per] || 12;
    const d = new Date(`${ult}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - m);
    return d.toISOString().slice(0, 10);
  }
  // índice do primeiro pregão do período escolhido
  function inicioPeriodo(dias, per) {
    if (!dias.length) return 0;
    const corte = corteDe(per, dias[dias.length - 1].data);
    if (!corte) return 0;
    const i = dias.findIndex((d) => d.data > corte);
    return i < 0 ? dias.length : i;
  }

  // escala "bonita" para o eixo: passos de 1, 2, 2,5 ou 5 × potência de 10
  function escala(min, max, partes = 4) {
    if (min === max) { min -= 1; max += 1; }
    const bruto = (max - min) / partes, p = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto) || 10 * p;
    const lo = Math.floor(min / passo) * passo, hi = Math.ceil(max / passo) * passo;
    const ticks = [];
    for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(Math.round(v));
    return { lo, hi, ticks };
  }

  const corVar = (n, alt) => (getComputedStyle(document.body).getPropertyValue(n) || '').trim() || alt;

  // datas do eixo x: umas 6 marcas, sem encostar
  function marcasX(dias, xc, W) {
    const n = dias.length, passo = Math.max(1, Math.ceil(n / Math.max(2, Math.min(7, Math.floor(W / 95)))));
    const out = [];
    for (let i = 0; i < n; i += passo) if (n - 1 - i >= passo * 0.6 || i === 0) out.push(i);
    if (out[out.length - 1] !== n - 1) out.push(n - 1);
    return out.map((i) => `<text class="fx-tx" x="${xc(i).toFixed(1)}" y="0" text-anchor="${i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${dm(dias[i].data)}</text>`).join('');
  }

  // altura acompanha a largura para o gráfico não ficar achatado em tela larga
  const altura = (W) => Math.round(Math.min(440, Math.max(300, W * 0.34)));

  // gráfico do tipo escolhido: barras do saldo diário (eixo esquerdo) + linha do acumulado (eixo direito) + média móvel
  function svgGrafico(todos, i0, tipo, W) {
    const dias = todos.slice(i0);
    const n = dias.length;
    const H = altura(W), T = 14, B = 26, L = 58, R = prefs.modo === 'barras' ? 62 : 16;
    const pw = W - L - R, ph = H - T - B;
    const sal = dias.map((d) => d.tipos?.[tipo]?.saldo).map((v) => (ok(v) ? v : null));
    let acc = 0;
    const acum = sal.map((v) => (acc += v || 0));
    // média móvel usa os pregões anteriores ao período também (se houver no arquivo)
    const mmN = prefs.modo === 'barras' ? prefs.mm : 0;
    const mm = dias.map((_, i) => {
      if (!mmN) return null;
      const j = i0 + i;
      if (j + 1 < mmN) return null;
      let s = 0;
      for (let k = j - mmN + 1; k <= j; k++) { const v = todos[k].tipos?.[tipo]?.saldo; if (!ok(v)) return null; s += v; }
      return s / mmN;
    });
    const pos = corVar('--pos', '#16c784'), neg = corVar('--neg', '#ea3943');
    const bw = pw / Math.max(n, 1);
    const xc = (i) => L + (i + 0.5) * bw;
    let corpo = '', eixoD = '';
    if (prefs.modo === 'barras') {
      const vs = sal.filter(ok).concat(mm.filter(ok));
      const e = escala(Math.min(0, ...vs), Math.max(0, ...vs));
      const y = (v) => T + (e.hi - v) / (e.hi - e.lo) * ph;
      const ea = escala(Math.min(0, ...acum), Math.max(0, ...acum));
      const ya = (v) => T + (ea.hi - v) / (ea.hi - ea.lo) * ph;
      corpo += e.ticks.map((t) => `<line class="fx-grid${t === 0 ? ' z' : ''}" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="fx-ty" x="${L - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${eixo(t)}</text>`).join('');
      eixoD = ea.ticks.map((t) => `<text class="fx-ty fx-ta" x="${W - R + 8}" y="${(ya(t) + 3.5).toFixed(1)}">${eixo(t)}</text>`).join('');
      const w = Math.max(1, bw * 0.72);
      corpo += sal.map((v, i) => {
        if (!ok(v)) return '';
        const y1 = y(Math.max(v, 0)), y2 = y(Math.min(v, 0));
        return `<rect x="${(xc(i) - w / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" fill="${v >= 0 ? pos : neg}" opacity=".8"/>`;
      }).join('');
      const pts = mm.map((v, i) => (ok(v) ? `${xc(i).toFixed(1)},${y(v).toFixed(1)}` : null));
      const seg = []; let cur = [];
      pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { seg.push(cur); cur = []; } });
      if (cur.length) seg.push(cur);
      corpo += seg.filter((s) => s.length > 1).map((s) => `<polyline points="${s.join(' ')}" fill="none" stroke="${COR_MM}" stroke-width="1.6" stroke-dasharray="4 3"/>`).join('');
      corpo += `<polyline points="${acum.map((v, i) => `${xc(i).toFixed(1)},${ya(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${COR_ACUM}" stroke-width="2.2" stroke-linejoin="round"/>`;
      vista = { dias, n, L, R, W, bw, xc, linhas: [{ y: (i) => y(sal[i]) }], tip: (i) => {
        const d = dias[i], t = d.tipos?.[tipo];
        return `<b>${dmyy(d.data)}</b>
          <div><i style="background:${ok(sal[i]) && sal[i] < 0 ? neg : pos}"></i>Fluxo do dia <span class="${tom(sal[i])}">${brl(sal[i])}</span></div>
          <div><i style="background:${COR_ACUM}"></i>Acumulado no período <span class="${tom(acum[i])}">${brl(acum[i])}</span></div>
          ${mmN ? `<div><i style="background:${COR_MM}"></i>Média de ${mmN} pregões <span class="${tom(mm[i])}">${brl(mm[i])}</span></div>` : ''}
          ${t ? `<small>compras ${brl(t.c, false)} · vendas ${brl(t.v, false)}</small>` : ''}`;
      } };
    } else {
      const e = escala(Math.min(0, ...acum), Math.max(0, ...acum));
      const y = (v) => T + (e.hi - v) / (e.hi - e.lo) * ph;
      corpo += e.ticks.map((t) => `<line class="fx-grid${t === 0 ? ' z' : ''}" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="fx-ty" x="${L - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${eixo(t)}</text>`).join('');
      const pts = acum.map((v, i) => `${xc(i).toFixed(1)},${y(v).toFixed(1)}`);
      corpo += `<polygon points="${xc(0).toFixed(1)},${y(0).toFixed(1)} ${pts.join(' ')} ${xc(n - 1).toFixed(1)},${y(0).toFixed(1)}" fill="${COR_ACUM}" opacity=".14"/>`;
      corpo += `<polyline points="${pts.join(' ')}" fill="none" stroke="${COR_ACUM}" stroke-width="2.2" stroke-linejoin="round"/>`;
      vista = { dias, n, L, R, W, bw, xc, tip: (i) => `<b>${dmyy(dias[i].data)}</b>
          <div><i style="background:${COR_ACUM}"></i>Acumulado no período <span class="${tom(acum[i])}">${brl(acum[i])}</span></div>
          <div><i style="background:${ok(sal[i]) && sal[i] < 0 ? neg : pos}"></i>Fluxo do dia <span class="${tom(sal[i])}">${brl(sal[i])}</span></div>` };
    }
    return `<svg class="fx-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fluxo ${esc(TIPOS.find((t) => t[0] === tipo)[1])} na B3">
      ${corpo}${eixoD}<g transform="translate(0 ${H - 8})">${marcasX(dias, xc, W)}</g><line class="fx-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>`;
  }

  // comparação: acumulado de cada tipo de investidor no período
  function svgComparacao(todos, i0, W) {
    const dias = todos.slice(i0), n = dias.length;
    const H = altura(W), T = 14, B = 26, L = 58, R = 16, pw = W - L - R, ph = H - T - B;
    const vis = TIPOS.filter(([k]) => !prefs.ocultos.includes(k));
    const series = vis.map(([k, nome, cor]) => { let a = 0; return { k, nome, cor, v: dias.map((d) => (a += d.tipos?.[k]?.saldo || 0)) }; });
    const all = series.flatMap((s) => s.v);
    const e = escala(Math.min(0, ...all), Math.max(0, ...all));
    const y = (v) => T + (e.hi - v) / (e.hi - e.lo) * ph;
    const bw = pw / Math.max(n, 1), xc = (i) => L + (i + 0.5) * bw;
    let corpo = e.ticks.map((t) => `<line class="fx-grid${t === 0 ? ' z' : ''}" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="fx-ty" x="${L - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${eixo(t)}</text>`).join('');
    corpo += series.map((s) => `<polyline points="${s.v.map((v, i) => `${xc(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round"/>`).join('');
    vista = { dias, n, L, R, W, bw, xc, tip: (i) => `<b>${dmyy(dias[i].data)}</b>${series.slice().sort((a, b) => b.v[i] - a.v[i]).map((s) => `<div><i style="background:${s.cor}"></i>${esc(s.nome)} <span class="${tom(s.v[i])}">${brl(s.v[i])}</span></div>`).join('')}<small>acumulado no período</small>` };
    return `<svg class="fx-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparação do fluxo acumulado por investidor">
      ${corpo}<g transform="translate(0 ${H - 8})">${marcasX(dias, xc, W)}</g><line class="fx-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>`;
  }

  function draw() {
    if (!root) return;
    if (!cache) {
      root.innerHTML = `<div class="fx-msg">${busy ? 'Carregando o fluxo da B3…' : esc(erro || 'Sem dados do fluxo.')}</div>`;
      return;
    }
    const dias = cache.dias || [];
    const tipo = TIPOS.some(([k]) => k === prefs.tipo) ? prefs.tipo : 'estrangeiro';
    const nome = TIPOS.find(([k]) => k === tipo)[1];
    const per = PERIODOS.some(([k]) => k === prefs.per) ? prefs.per : 'ytd';
    const ult = dias[dias.length - 1];
    const meses = cache.meses || {};
    const mesK = Object.keys(meses).sort().pop();
    const mes = mesK ? meses[mesK] : null;
    const ano = saldoAno(tipo);
    const i0 = inicioPeriodo(dias, per);
    const janela = dias.slice(i0);
    const comp = prefs.aba === 'comp';
    const soma = (k) => janela.reduce((a, d) => a + (d.tipos?.[k]?.saldo || 0), 0);
    const kpi = (titulo, v, sub) => `<div><span>${titulo}</span><b class="${tom(v)}">${brl(v)}</b><small>${sub}</small></div>`;
    // o arquivo começa em dez/2025: avisa quando o período pedido vai além disso
    const primeiro = dias[0]?.data;
    const corte = corteDe(per, ult?.data);
    const curto = !!(corte && primeiro && primeiro > corte);
    const perTxt = janela.length ? `${dmyy(janela[0].data)} a ${dmyy(janela[janela.length - 1].data)}` : '—';

    const linhas = TIPOS.map(([k, n]) => {
      const d = ult?.tipos?.[k]?.saldo, m = mes?.tipos?.[k]?.saldo, a = saldoAno(k)?.v, p = soma(k);
      return `<tr class="${k === tipo ? 'on' : ''}" data-tipo="${k}"><th>${n}</th><td class="${tom(d)}">${brl(d)}</td><td class="${tom(m)}">${brl(m)}</td><td class="${tom(a)}">${brl(a)}</td><td class="${tom(p)}">${brl(p)}</td></tr>`;
    }).join('');

    const legenda = comp
      ? TIPOS.map(([k, n, c]) => `<button type="button" class="fx-lg ${prefs.ocultos.includes(k) ? 'off' : ''}" data-oculta="${k}" title="Mostrar ou esconder"><i style="background:${c}"></i>${n} <b class="${tom(soma(k))}">${brl(soma(k))}</b></button>`).join('')
      : `<span class="fx-lg"><i class="sq"></i>Fluxo diário</span><span class="fx-lg"><i style="background:${COR_ACUM}"></i>Fluxo acumulado</span>${prefs.modo === 'barras' && prefs.mm ? `<span class="fx-lg"><i class="dash" style="border-color:${COR_MM}"></i>Média de ${prefs.mm} pregões</span>` : ''}`;

    root.innerHTML = `
      <div class="fx-card">
        <div class="fx-top">
          <div class="fx-abas" role="tablist">
            <button type="button" role="tab" class="${comp ? '' : 'on'}" data-aba="graf" aria-selected="${!comp}">Gráfico</button>
            <button type="button" role="tab" class="${comp ? 'on' : ''}" data-aba="comp" aria-selected="${comp}">Comparação</button>
          </div>
          ${comp ? '' : `<select class="fx-sel" data-sel="tipo" aria-label="Tipo de investidor">${TIPOS.map(([k, n]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${n}</option>`).join('')}</select>`}
          <select class="fx-sel" data-sel="per" aria-label="Período">${PERIODOS.map(([k, n]) => `<option value="${k}" ${k === per ? 'selected' : ''}>${n}</option>`).join('')}</select>
          ${comp ? '' : `<div class="fx-seg" role="group" aria-label="Tipo de gráfico"><button type="button" data-modo="barras" class="${prefs.modo === 'barras' ? 'on' : ''}" title="Barras do dia e linha do acumulado"><i class="fas fa-chart-bar"></i> Barras</button><button type="button" data-modo="linha" class="${prefs.modo === 'linha' ? 'on' : ''}" title="Só a linha do acumulado"><i class="fas fa-chart-line"></i> Linha</button></div>
          ${prefs.modo === 'barras' ? `<select class="fx-sel" data-sel="mm" aria-label="Média móvel">${MMS.map(([k, n]) => `<option value="${k}" ${k === prefs.mm ? 'selected' : ''}>${n}</option>`).join('')}</select>` : ''}`}
          <span class="fx-sp"></span>
          <button type="button" class="fx-ib" data-png title="Baixar imagem do gráfico"><i class="fas fa-download"></i><span> Baixar imagem</span></button>
          <button type="button" class="fx-ib" data-rf title="Buscar de novo"><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
        </div>
        ${comp ? '' : `<div class="fx-kpis">
          ${kpi('Acumulado no período', soma(tipo), perTxt)}
          ${kpi('Último pregão', ult?.tipos?.[tipo]?.saldo, ult ? dmy(ult.data) : '—')}
          ${kpi('No mês', mes?.tipos?.[tipo]?.saldo, mes ? `${MES[+mesK.slice(5, 7) - 1]}/${mesK.slice(2, 4)} até ${dm(mes.ate)}` : '—')}
          ${kpi('No ano', ano?.v, ano ? `${ano.ano} até ${mes ? dm(mes.ate) : '—'}` : 'histórico incompleto')}
        </div>`}
        <div class="fx-gh">
          <div class="fx-gt"><b>${comp ? 'Fluxo acumulado por investidor' : `Fluxo na B3: ${esc(nome)}`}</b><span class="fx-mut">${perTxt}${curto ? ` (o histórico começa em ${dmyy(primeiro)})` : ''}</span></div>
          <div class="fx-lgs">${legenda}</div>
        </div>
        <div class="fx-graf">${janela.length ? '<div class="fx-svgbox"></div>' : '<div class="fx-msg">Sem pregões no período.</div>'}<div class="fx-tip" hidden></div></div>
        <div class="fx-tw"><table class="fx-tab">
          <thead><tr><th>Investidor</th><th>${ult ? 'Pregão ' + dm(ult.data) : 'Pregão'}</th><th>No mês</th><th>No ano</th><th>No período</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <div class="fx-foot">Compras menos vendas, por tipo de investidor, em reais. Fonte: B3, Boletim Diário do Mercado, com cerca de 2 pregões de atraso.
          Inclui todos os mercados de ações da B3 (à vista, termo, opções, exercícios e blocos), por isso pode diferir do número "à vista" citado na imprensa.
          ${erro ? `<span class="fx-err">${esc(erro)} Mostrando a última cópia salva.</span>` : ''}</div>
      </div>`;
    desenhaSvg();
  }

  // o SVG é desenhado na largura real da caixa (textos sem deformar); redesenha quando a largura muda
  let larg = 0;
  function desenhaSvg() {
    const box = root?.querySelector('.fx-svgbox');
    if (!box || !cache) return;
    const W = Math.max(320, Math.floor(box.clientWidth || 720));
    larg = W;
    const dias = cache.dias || [];
    const i0 = inicioPeriodo(dias, PERIODOS.some(([k]) => k === prefs.per) ? prefs.per : 'ytd');
    const tipo = TIPOS.some(([k]) => k === prefs.tipo) ? prefs.tipo : 'estrangeiro';
    box.innerHTML = prefs.aba === 'comp' ? svgComparacao(dias, i0, W) : svgGrafico(dias, i0, tipo, W);
    const svg = box.querySelector('svg'), cross = svg.querySelector('.fx-cross');
    const tip = root.querySelector('.fx-tip');
    const mostra = (ev) => {
      if (!vista || !vista.n) return;
      const r = svg.getBoundingClientRect();
      const x = (ev.clientX - r.left) * (vista.W / r.width);
      const i = Math.max(0, Math.min(vista.n - 1, Math.floor((x - vista.L) / vista.bw)));
      const cx = vista.xc(i);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      tip.innerHTML = vista.tip(i);
      tip.hidden = false;
      const gx = cx * (r.width / vista.W) + (r.left - root.querySelector('.fx-graf').getBoundingClientRect().left);
      const tw = tip.offsetWidth, gw = root.querySelector('.fx-graf').clientWidth;
      tip.style.left = `${Math.max(4, Math.min(gw - tw - 4, gx + 14 + tw > gw ? gx - tw - 14 : gx + 14))}px`;
    };
    svg.addEventListener('pointermove', mostra);
    svg.addEventListener('pointerdown', mostra);
    svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  }
  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { const b = root?.querySelector('.fx-svgbox'); if (b && Math.abs(b.clientWidth - larg) > 8) desenhaSvg(); }, 150);
  });

  // "Baixar imagem": o SVG com cores e fundo vira PNG (2x), com título e fonte
  async function baixar() {
    const svg = root?.querySelector('.fx-svg');
    if (!svg) return;
    const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
    const cs = getComputedStyle(document.body);
    const fundo = (cs.getPropertyValue('--surface') || '').trim() || '#11151c';
    const txt = (cs.getPropertyValue('--text-3') || '').trim() || '#8591a8';
    const txt1 = (cs.getPropertyValue('--text') || '').trim() || '#e8edf5';
    const linha = (cs.getPropertyValue('--line') || '').trim() || '#2a3140';
    const c = svg.cloneNode(true);
    c.querySelector('.fx-cross')?.remove();
    c.querySelectorAll('.fx-grid').forEach((l) => { l.setAttribute('stroke', linha); l.setAttribute('stroke-width', l.classList.contains('z') ? '1.2' : '1'); });
    c.querySelectorAll('text').forEach((t) => { t.setAttribute('fill', txt); t.setAttribute('font-size', '10'); t.setAttribute('font-family', 'monospace'); });
    const titulo = root.querySelector('.fx-gt b')?.textContent || 'Fluxo na B3';
    const sub = root.querySelector('.fx-gt .fx-mut')?.textContent || '';
    const TOP = 46, FOOT = 26;
    const cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = (H + TOP + FOOT) * 2;
    const g = cv.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = fundo; g.fillRect(0, 0, W, H + TOP + FOOT);
    g.fillStyle = txt1; g.font = '600 15px Inter, system-ui, sans-serif'; g.fillText(titulo, 16, 22);
    g.fillStyle = txt; g.font = '12px Inter, system-ui, sans-serif'; g.fillText(sub, 16, 38);
    g.fillText('Fonte: B3 (Boletim Diário). mercadomacro.com.br', 16, H + TOP + 16);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    g.drawImage(img, 0, TOP, W, H);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = `fluxo-b3-${prefs.aba === 'comp' ? 'comparacao' : prefs.tipo}-${prefs.per}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tipo],[data-aba],[data-modo],[data-oculta],[data-rf],[data-png]');
      if (!t) return;
      if (t.dataset.tipo) { prefs.tipo = t.dataset.tipo; prefs.aba = 'graf'; }
      else if (t.dataset.aba) prefs.aba = t.dataset.aba;
      else if (t.dataset.modo) prefs.modo = t.dataset.modo;
      else if (t.dataset.oculta) {
        const k = t.dataset.oculta, o = new Set(prefs.ocultos);
        if (o.has(k)) o.delete(k); else if (o.size < TIPOS.length - 1) o.add(k);
        prefs.ocultos = [...o];
      } else if (t.hasAttribute('data-rf')) { load(true); return; }
      else if (t.hasAttribute('data-png')) { baixar().catch(() => window.toast?.('Não foi possível gerar a imagem.', 'error')); return; }
      savePrefs(); draw();
    });
    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-sel]');
      if (!s) return;
      prefs[s.dataset.sel] = s.dataset.sel === 'mm' ? +s.value : s.value;
      savePrefs(); draw();
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  #fluxo-root .fx-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  #fluxo-root .fx-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 14px; border-bottom:1px solid var(--line); }
  #fluxo-root .fx-abas, #fluxo-root .fx-seg { display:inline-flex; padding:3px; gap:2px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); }
  #fluxo-root .fx-abas button, #fluxo-root .fx-seg button { border:0; background:none; color:var(--text-3); font:inherit; font-size:12.5px; padding:5px 12px; border-radius:7px; cursor:pointer; white-space:nowrap; }
  #fluxo-root .fx-abas button.on, #fluxo-root .fx-seg button.on { background:var(--surface); color:var(--text); box-shadow:var(--shadow-sm); font-weight:600; }
  #fluxo-root .fx-seg button i { font-size:11px; margin-right:3px; }
  #fluxo-root .fx-sel { height:32px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--text); font:inherit; font-size:12.5px; padding:0 8px; cursor:pointer; }
  #fluxo-root .fx-sp { flex:1; }
  #fluxo-root .fx-ib { height:32px; min-width:32px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:9px; cursor:pointer; font:inherit; font-size:12px; padding:0 9px; white-space:nowrap; }
  #fluxo-root .fx-ib:hover { color:var(--text); border-color:var(--line-2); }
  #fluxo-root .fx-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  #fluxo-root .fx-kpis > div { padding:10px 14px; display:flex; flex-direction:column; gap:2px; min-width:0; }
  #fluxo-root .fx-kpis > div + div { border-left:1px solid var(--line); }
  #fluxo-root .fx-kpis span { font-size:11.5px; color:var(--text-3); }
  #fluxo-root .fx-kpis b { font:700 19px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; }
  #fluxo-root .fx-kpis small { font-size:11px; color:var(--text-3); }
  #fluxo-root .fx-gh { display:flex; align-items:flex-end; justify-content:space-between; gap:8px 16px; flex-wrap:wrap; padding:12px 14px 2px; }
  #fluxo-root .fx-gt { display:flex; flex-direction:column; gap:2px; font-size:13px; }
  #fluxo-root .fx-gt b { color:var(--text); font-weight:600; font-size:14px; }
  #fluxo-root .fx-mut { color:var(--text-3); font-size:12px; }
  #fluxo-root .fx-lgs { display:flex; gap:6px 14px; flex-wrap:wrap; }
  #fluxo-root .fx-lg { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); border:0; background:none; padding:2px 0; font-family:inherit; }
  #fluxo-root button.fx-lg { cursor:pointer; }
  #fluxo-root .fx-lg.off { opacity:.4; }
  #fluxo-root .fx-lg b { font:600 11.5px 'JetBrains Mono', monospace; }
  #fluxo-root .fx-lg i { width:12px; height:3px; border-radius:2px; display:inline-block; }
  #fluxo-root .fx-lg i.sq { width:10px; height:10px; border-radius:2px; background:linear-gradient(90deg, var(--pos) 50%, var(--neg) 50%); }
  #fluxo-root .fx-lg i.dash { width:14px; height:0; border-top:2px dashed; background:none; }
  #fluxo-root .fx-graf { position:relative; padding:6px 6px 4px; }
  #fluxo-root .fx-svgbox { width:100%; }
  #fluxo-root .fx-svg { display:block; touch-action:pan-y; }
  #fluxo-root .fx-grid { stroke:var(--line); stroke-width:1; }
  #fluxo-root .fx-grid.z { stroke:var(--line-2); stroke-width:1.2; }
  #fluxo-root .fx-ty, #fluxo-root .fx-tx { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); }
  #fluxo-root .fx-ta { fill:${COR_ACUM}; }
  #fluxo-root .fx-cross { stroke:var(--text-3); stroke-width:1; stroke-dasharray:3 3; pointer-events:none; }
  #fluxo-root .fx-tip { position:absolute; top:10px; background:var(--surface-3); border:1px solid var(--line-2); border-radius:10px; padding:8px 10px; font-size:12px; color:var(--text-2); pointer-events:none; box-shadow:var(--shadow-lg); min-width:200px; z-index:2; }
  #fluxo-root .fx-tip b { color:var(--text); display:block; margin-bottom:4px; }
  #fluxo-root .fx-tip div { display:flex; align-items:center; gap:6px; white-space:nowrap; line-height:1.7; }
  #fluxo-root .fx-tip div span { margin-left:auto; padding-left:12px; font-family:'JetBrains Mono', monospace; }
  #fluxo-root .fx-tip i { width:8px; height:8px; border-radius:2px; flex:none; }
  #fluxo-root .fx-tip small { display:block; color:var(--text-3); margin-top:3px; }
  #fluxo-root .fx-tw { overflow-x:auto; border-top:1px solid var(--line); }
  #fluxo-root .fx-tab { width:100%; border-collapse:collapse; font-size:12.5px; }
  #fluxo-root .fx-tab th, #fluxo-root .fx-tab td { padding:8px 14px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
  #fluxo-root .fx-tab th:first-child { text-align:left; font-weight:500; color:var(--text-2); }
  #fluxo-root .fx-tab thead th { font-size:11px; color:var(--text-3); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  #fluxo-root .fx-tab td { font-family:'JetBrains Mono', monospace; }
  #fluxo-root .fx-tab tbody tr { cursor:pointer; }
  #fluxo-root .fx-tab tbody tr.on th { color:var(--text); font-weight:600; }
  #fluxo-root .fx-tab tbody tr:hover { background:var(--surface-2); }
  #fluxo-root .fx-pos, #fluxo-root .fx-kpis b.fx-pos { color:var(--pos); }
  #fluxo-root .fx-neg, #fluxo-root .fx-kpis b.fx-neg { color:var(--neg); }
  #fluxo-root .fx-foot { padding:10px 14px 12px; font-size:11.5px; color:var(--text-3); line-height:1.5; }
  body.light #fluxo-root .fx-pos, body.light #fluxo-root .fx-kpis b.fx-pos { color:color-mix(in srgb, var(--pos) 72%, #000); }
  body.light #fluxo-root .fx-neg, body.light #fluxo-root .fx-kpis b.fx-neg { color:color-mix(in srgb, var(--neg) 85%, #000); }
  #fluxo-root .fx-err { display:block; color:var(--neg); margin-top:4px; }
  #fluxo-root .fx-msg { padding:28px; text-align:center; color:var(--text-3); font-size:13px; }
  @media (max-width: 900px) { #fluxo-root .fx-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); } #fluxo-root .fx-kpis > div:nth-child(3) { border-left:0; } #fluxo-root .fx-kpis > div:nth-child(n+3) { border-top:1px solid var(--line); } }
  @media (max-width: 640px) {
    #fluxo-root .fx-top { padding:10px 12px; }
    #fluxo-root .fx-ib span { display:none; }
    #fluxo-root .fx-kpis b { font-size:16px; }
    #fluxo-root .fx-kpis > div { padding:8px 12px; }
    #fluxo-root .fx-tab th, #fluxo-root .fx-tab td { padding:8px 10px; }
    #fluxo-root .fx-tip { min-width:0; }
  }`;
  document.head.appendChild(css);

  window.__fluxoRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    el.querySelector('.fx-tab') || draw();
    load();
  };
})();
