/* =========================================================
   FLUXO DE INVESTIDORES NA B3 (aba Mercado, seção "Fluxo na B3")
   Compras menos vendas de estrangeiros, institucionais, pessoas físicas,
   instituições financeiras e demais, por dia, no mês e no ano.
   Fonte: fluxo/fluxo.json, gravado pelo robô do GitHub a partir do Boletim Diário
   do Mercado da B3 (tabela "Participação dos investidores"), com cerca de 2 pregões
   de atraso. Valores do arquivo em R$ mil.
   Regra do painel: nada inventado; o que a fonte não traz aparece como "—".
   ========================================================= */
(() => {
  if (window.__fluxoRender) return;
  const URLS = ['https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fluxo/fluxo.json', 'fluxo/fluxo.json'];
  const CACHE_KEY = 'fluxo_cache_v1';
  const PREF_KEY = 'fluxo_prefs_v1';
  const TTL = 60 * 60 * 1000;
  const TIPOS = [
    ['estrangeiro', 'Estrangeiro'],
    ['institucional', 'Institucional'],
    ['pf', 'Pessoa física'],
    ['if', 'Instituições financeiras'],
    ['outros', 'Outros'],
  ];
  const PER = [[20, '20 pregões'], [60, '60 pregões'], [120, '120 pregões'], [250, '1 ano']];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
  // R$ mil -> texto curto: "+R$ 1,09 bi" ou "−R$ 627 mi"
  const brl = (mil, sinal = true) => {
    if (!ok(mil)) return '—';
    const a = Math.abs(mil), s = sinal ? (mil > 0 ? '+' : mil < 0 ? '−' : '') : (mil < 0 ? '−' : '');
    if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`;
    return `${s}R$ ${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`;
  };
  const tom = (v) => (!ok(v) || v === 0 ? '' : v > 0 ? 'fx-pos' : 'fx-neg');

  let prefs = { per: 60, tipo: 'estrangeiro' };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* cheio */ } };
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

  function grafico(dias, tipo) {
    // o SVG estica na largura; textos (datas e escala) ficam em HTML para não deformar
    const W = 720, H = 170, T = 8, B = 8, L = 0, R = 0;
    const vals = dias.map((d) => d.tipos?.[tipo]?.saldo).map((v) => (ok(v) ? v : null));
    const max = Math.max(1, ...vals.filter(ok).map(Math.abs));
    const n = dias.length, bw = (W - L - R) / Math.max(n, 1);
    const y0 = T + (H - T - B) / 2, k = (H - T - B) / 2 / max;
    const barras = dias.map((d, i) => {
      const v = vals[i];
      if (!ok(v)) return '';
      const h = Math.max(1, Math.abs(v) * k), x = L + i * bw + bw * 0.12, w = Math.max(1, bw * 0.76);
      return `<rect class="${v >= 0 ? 'fx-bp' : 'fx-bn'}" x="${x.toFixed(1)}" y="${(v >= 0 ? y0 - h : y0).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" data-i="${i}"/>`;
    }).join('');
    const passo = Math.ceil(n / 6);
    const datas = dias.map((d, i) => ((i % passo === 0 && n - 1 - i >= passo) || i === n - 1)
      ? `<span style="left:${((i + 0.5) / n * 100).toFixed(2)}%">${dm(d.data)}</span>` : '').join('');
    return `<div class="fx-plot"><span class="fx-ys fx-ys-t">${brl(max)}</span><span class="fx-ys fx-ys-b">${brl(-max)}</span>
      <svg class="fx-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Saldo diário por pregão">
      <line class="fx-zero" x1="0" x2="${W}" y1="${y0}" y2="${y0}" vector-effect="non-scaling-stroke"/>${barras}</svg></div>
      <div class="fx-xl">${datas}</div>`;
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
    const ult = dias[dias.length - 1];
    const meses = cache.meses || {};
    const mesK = Object.keys(meses).sort().pop();
    const mes = mesK ? meses[mesK] : null;
    const ano = saldoAno(tipo);
    const janela = dias.slice(-prefs.per);
    const somaJan = janela.reduce((a, d) => a + (d.tipos?.[tipo]?.saldo || 0), 0);
    const kpi = (titulo, v, sub) => `<div><span>${titulo}</span><b class="${tom(v)}">${brl(v)}</b><small>${sub}</small></div>`;

    const linhas = TIPOS.map(([k, n]) => {
      const d = ult?.tipos?.[k]?.saldo, m = mes?.tipos?.[k]?.saldo, a = saldoAno(k)?.v;
      return `<tr class="${k === tipo ? 'on' : ''}" data-tipo="${k}"><th>${n}</th><td class="${tom(d)}">${brl(d)}</td><td class="${tom(m)}">${brl(m)}</td><td class="${tom(a)}">${brl(a)}</td></tr>`;
    }).join('');

    root.innerHTML = `
      <div class="fx-card">
        <div class="fx-top">
          <div class="fx-tipos" role="tablist" aria-label="Tipo de investidor">${TIPOS.map(([k, n]) => `<button type="button" class="ecal-chip ${k === tipo ? 'active' : ''}" data-tipo="${k}" role="tab" aria-selected="${k === tipo}">${n}</button>`).join('')}</div>
          <button type="button" class="fx-rf" data-rf title="Buscar de novo"><i class="fas fa-sync-alt${busy ? ' fa-spin' : ''}"></i></button>
        </div>
        <div class="fx-kpis">
          ${kpi('Último pregão', ult?.tipos?.[tipo]?.saldo, ult ? dmy(ult.data) : '—')}
          ${kpi('No mês', mes?.tipos?.[tipo]?.saldo, mes ? `${MES[+mesK.slice(5, 7) - 1]}/${mesK.slice(2, 4)} até ${dm(mes.ate)}` : '—')}
          ${kpi('No ano', ano?.v, ano ? `${ano.ano} até ${mes ? dm(mes.ate) : '—'}` : 'histórico incompleto')}
        </div>
        <div class="fx-gh">
          <div class="fx-gt"><b>${esc(nome)}: saldo por pregão</b> <span class="${tom(somaJan)}">${brl(somaJan)}</span> <span class="fx-mut">nos últimos ${janela.length} pregões</span></div>
          <div class="fx-per">${PER.map(([n, l]) => `<button type="button" class="ecal-chip ${n === prefs.per ? 'active' : ''}" data-per="${n}">${l}</button>`).join('')}</div>
        </div>
        <div class="fx-graf">${janela.length ? grafico(janela, tipo) : '<div class="fx-msg">Sem pregões no período.</div>'}<div class="fx-tip" hidden></div></div>
        <div class="fx-tw"><table class="fx-tab">
          <thead><tr><th>Investidor</th><th>${ult ? 'Pregão ' + dm(ult.data) : 'Pregão'}</th><th>No mês</th><th>No ano</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <div class="fx-foot">Compras menos vendas, por tipo de investidor. Fonte: B3, Boletim Diário do Mercado, com cerca de 2 pregões de atraso.
          Inclui todos os mercados de ações da B3 (à vista, termo, opções, exercícios e blocos), por isso pode diferir do número "à vista" citado na imprensa.
          ${erro ? `<span class="fx-err">${esc(erro)} Mostrando a última cópia salva.</span>` : ''}</div>
      </div>`;

    const tip = root.querySelector('.fx-tip'), graf = root.querySelector('.fx-graf');
    root.querySelectorAll('.fx-svg rect').forEach((r) => {
      const mostra = () => {
        const d = janela[+r.dataset.i]; if (!d) return;
        const gb = graf.getBoundingClientRect(), rb = r.getBoundingClientRect();
        tip.innerHTML = `<b>${dmy(d.data)}</b> <span class="${tom(d.tipos[tipo].saldo)}">${brl(d.tipos[tipo].saldo)}</span><br><small>compras ${brl(d.tipos[tipo].c, false)} · vendas ${brl(d.tipos[tipo].v, false)}</small>`;
        tip.hidden = false;
        const x = Math.min(Math.max(rb.left - gb.left + rb.width / 2, 80), gb.width - 80);
        tip.style.left = `${x}px`;
      };
      r.addEventListener('mouseenter', mostra);
      r.addEventListener('click', mostra);
    });
    graf.addEventListener('mouseleave', () => { tip.hidden = true; });
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tipo],[data-per],[data-rf]');
      if (!t) return;
      if (t.dataset.tipo) { prefs.tipo = t.dataset.tipo; savePrefs(); draw(); }
      else if (t.dataset.per) { prefs.per = +t.dataset.per; savePrefs(); draw(); }
      else if (t.hasAttribute('data-rf')) load(true);
    });
  }

  const css = document.createElement('style');
  css.textContent = `
  #fluxo-root .fx-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  #fluxo-root .fx-top { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line); }
  #fluxo-root .fx-tipos, #fluxo-root .fx-per { display:flex; gap:6px; flex-wrap:wrap; min-width:0; }
  #fluxo-root .fx-rf { margin-left:auto; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); border-radius:8px; width:32px; height:32px; cursor:pointer; flex:0 0 auto; }
  #fluxo-root .fx-kpis { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); border-bottom:1px solid var(--line); }
  #fluxo-root .fx-kpis > div { padding:10px 14px; display:flex; flex-direction:column; gap:2px; min-width:0; }
  #fluxo-root .fx-kpis > div + div { border-left:1px solid var(--line); }
  #fluxo-root .fx-kpis span { font-size:11.5px; color:var(--text-3); }
  #fluxo-root .fx-kpis b { font:700 19px 'JetBrains Mono', monospace; color:var(--text); white-space:nowrap; }
  #fluxo-root .fx-kpis small { font-size:11px; color:var(--text-3); }
  #fluxo-root .fx-gh { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 14px 4px; }
  #fluxo-root .fx-gt { font-size:13px; color:var(--text-2); }
  #fluxo-root .fx-gt b { color:var(--text); font-weight:600; }
  #fluxo-root .fx-mut { color:var(--text-3); font-size:12px; }
  #fluxo-root .fx-graf { position:relative; padding:4px 14px 8px; }
  #fluxo-root .fx-plot { position:relative; }
  #fluxo-root .fx-svg { width:100%; height:170px; display:block; }
  #fluxo-root .fx-ys { position:absolute; left:0; font:10px 'JetBrains Mono', monospace; color:var(--text-3); pointer-events:none; }
  #fluxo-root .fx-ys-t { top:0; } #fluxo-root .fx-ys-b { bottom:0; }
  #fluxo-root .fx-xl { position:relative; height:16px; margin-top:4px; }
  #fluxo-root .fx-xl span { position:absolute; transform:translateX(-50%); font:10px 'JetBrains Mono', monospace; color:var(--text-3); white-space:nowrap; }
  #fluxo-root .fx-xl span:last-child { transform:translateX(-100%); }
  #fluxo-root .fx-zero { stroke:var(--line-2); stroke-width:1; }
  #fluxo-root .fx-bp { fill:var(--pos); opacity:.85; cursor:pointer; }
  #fluxo-root .fx-bn { fill:var(--neg); opacity:.85; cursor:pointer; }
  #fluxo-root .fx-svg rect:hover { opacity:1; }
  #fluxo-root .fx-tip { position:absolute; top:0; transform:translateX(-50%); background:var(--surface-3); border:1px solid var(--line-2); border-radius:8px; padding:6px 9px; font-size:12px; color:var(--text); white-space:nowrap; pointer-events:none; box-shadow:var(--shadow-lg); }
  #fluxo-root .fx-tip small { color:var(--text-3); }
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
  @media (max-width: 640px) {
    #fluxo-root .fx-kpis { grid-template-columns:1fr; }
    #fluxo-root .fx-kpis > div { display:grid; grid-template-columns:1fr auto; grid-template-areas:"t v" "s v"; align-items:center; padding:8px 12px; }
    #fluxo-root .fx-kpis > div + div { border-left:0; border-top:1px solid var(--line); }
    #fluxo-root .fx-kpis span { grid-area:t; } #fluxo-root .fx-kpis small { grid-area:s; } #fluxo-root .fx-kpis b { grid-area:v; font-size:16px; }
    #fluxo-root .fx-tipos, #fluxo-root .fx-per { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; }
    #fluxo-root .fx-tipos .ecal-chip, #fluxo-root .fx-per .ecal-chip { flex:0 0 auto; }
    #fluxo-root .fx-svg { height:150px; }
    #fluxo-root .fx-tab th, #fluxo-root .fx-tab td { padding:8px 10px; }
  }`;
  document.head.appendChild(css);

  window.__fluxoRender = (el) => {
    if (root !== el) { root = el; bind(el); }
    el.querySelector('.fx-tab') || draw();
    load();
  };
})();
