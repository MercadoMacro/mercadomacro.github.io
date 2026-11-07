/* =========================================================
   TEMPERATURA DO MERCADO (07/11/2026, pedido do Severino)
   Botão na barra da Mesa: termômetro de 0 a 100 de risk-off (aversão a risco) a risk-on (apetite a risco),
   feito só com cotações (Yahoo pelo worker), sem IA.
   Cada ativo entra pela variação do dia dividida pela oscilação diária normal dele (desvio-padrão dos
   retornos dos últimos 3 meses): 1% no VIX não pesa o mesmo que 1% no S&P. O sinal diz se a alta do
   ativo costuma vir com apetite (+) ou com aversão a risco (-). A média vai para 0-100 (50 = neutro).
   Também mostra a mesma conta para os últimos pregões, a partir dos fechamentos.
   Para desfazer: tirar o <script> temperatura.js do index.html e o botão data-mm-temp do mesa.js.
   ========================================================= */
(function temperaturaMercado() {
  'use strict';
  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  // [símbolo, nome, sinal, explicação curta]
  const ATIVOS = [
    ['^GSPC', 'S&P 500', 1, 'Bolsa americana'],
    ['^IXIC', 'Nasdaq', 1, 'Tecnologia, mais sensível a risco'],
    ['^RUT', 'Russell 2000', 1, 'Empresas menores dos EUA'],
    ['HYG', 'Crédito high yield (HYG)', 1, 'Títulos de empresas de maior risco'],
    ['EEM', 'Emergentes (EEM)', 1, 'Bolsas de países emergentes'],
    ['^BVSP', 'Ibovespa', 1, 'Bolsa brasileira'],
    ['HG=F', 'Cobre', 1, 'Termômetro da atividade global'],
    ['AUDJPY=X', 'AUD/JPY', 1, 'Moeda de risco contra moeda de proteção'],
    ['BTC-USD', 'Bitcoin', 1, 'Ativo de risco'],
    ['^VIX', 'VIX', -1, 'Medo na bolsa americana'],
    ['GC=F', 'Ouro', -1, 'Proteção'],
    ['TLT', 'Treasuries longos (TLT)', -1, 'Títulos do governo americano, proteção'],
    ['DX-Y.NYB', 'Dólar (DXY)', -1, 'Dólar contra moedas fortes'],
    ['JPY=X', 'USD/JPY', 1, 'Alta = iene mais fraco (menos busca por proteção)'],
    ['CHF=X', 'USD/CHF', 1, 'Alta = franco suíço mais fraco (menos busca por proteção)'],
    ['BRL=X', 'Dólar/real', -1, 'Alta = real mais fraco'],
  ];
  const SYMS = ATIVOS.map((a) => a[0]);
  const MIN_ATIVOS = 8; // com menos que isso o termômetro mostra "—"
  const HIST_KEY = 'mm_temp_hist_v1';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pct = (v) => (Number.isFinite(v) ? (v > 0 ? '+' : '') + num(v) + '%' : '—');
  const hoje = () => new Date().toISOString().slice(0, 10);

  // 0-100 a partir da média dos "z" com sinal; ±1,5 desvio médio já leva para perto das pontas
  const escala = (z) => Math.round(50 + 50 * Math.tanh(z / 1.5));
  function faixa(t) {
    if (!Number.isFinite(t)) return { nome: '—', cls: 'neu' };
    if (t < 20) return { nome: 'Forte risk-off', cls: 'off2' };
    if (t < 40) return { nome: 'Risk-off', cls: 'off' };
    if (t <= 60) return { nome: 'Neutro', cls: 'neu' };
    if (t <= 80) return { nome: 'Risk-on', cls: 'on' };
    return { nome: 'Forte risk-on', cls: 'on2' };
  }

  async function getJSON(url) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok && r.status !== 502) throw Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }

  // histórico de 3 meses (fechamentos diários): uma vez por dia no navegador
  async function historico() {
    try { const c = JSON.parse(localStorage.getItem(HIST_KEY) || 'null'); if (c && c.dia === hoje() && c.data) return c.data; } catch { /* sem cache */ }
    const j = await getJSON(`${PROXY}/history?symbols=${encodeURIComponent(SYMS.join(','))}`);
    const data = {};
    for (const [k, v] of Object.entries(j || {})) if (v && Array.isArray(v.c) && v.c.length > 20) data[k] = { t: v.t, c: v.c, off: v.off || 0 };
    if (Object.keys(data).length) { try { localStorage.setItem(HIST_KEY, JSON.stringify({ dia: hoje(), data })); } catch { /* cheio */ } }
    return data;
  }

  // variação do dia (preço agora contra o fechamento anterior), lote /quotes
  async function cotacoes() {
    const j = await getJSON(`${PROXY}/quotes?symbols=${encodeURIComponent(SYMS.join(','))}`);
    const out = {};
    for (const [k, chart] of Object.entries(j || {})) {
      try {
        const m = chart?.chart?.result?.[0]?.meta;
        const p = m?.regularMarketPrice, prev = m?.chartPreviousClose ?? m?.previousClose;
        if (Number.isFinite(p) && Number.isFinite(prev) && prev) out[k] = { v: p, chg: (p / prev - 1) * 100, ts: (m.regularMarketTime || 0) * 1000 };
      } catch { /* fica sem */ }
    }
    return out;
  }

  // retornos diários (%) por dia (data local da bolsa)
  function retornos(h) {
    const out = [];
    for (let i = 1; i < h.c.length; i++) {
      if (!(h.c[i - 1] > 0)) continue;
      out.push({ dia: new Date((h.t[i] + (h.off || 0)) * 1000).toISOString().slice(0, 10), r: (h.c[i] / h.c[i - 1] - 1) * 100 });
    }
    return out;
  }
  const desvio = (xs) => {
    if (xs.length < 15) return NaN;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  };
  const corta = (z) => Math.max(-3, Math.min(3, z)); // um dia fora da curva num ativo não decide sozinho

  // conta principal; exportada para o teste
  function calcular(hist, cot) {
    const linhas = ATIVOS.map(([sym, nome, sinal, nota]) => {
      const h = hist[sym], q = cot[sym];
      const rs = h ? retornos(h) : [];
      const sd = desvio(rs.slice(-60).map((x) => x.r));
      const chg = q ? q.chg : NaN;
      const z = Number.isFinite(chg) && sd > 0 ? corta(chg / sd) : NaN;
      return { sym, nome, sinal, nota, chg, sd, z, contrib: Number.isFinite(z) ? sinal * z : NaN, ts: q?.ts || 0 };
    });
    const ok = linhas.filter((l) => Number.isFinite(l.contrib));
    const media = ok.length >= MIN_ATIVOS ? ok.reduce((a, l) => a + l.contrib, 0) / ok.length : NaN;
    // últimos pregões dos EUA: mesma conta com os fechamentos de cada dia
    const ref = hist['^GSPC'] ? retornos(hist['^GSPC']).slice(-20).map((x) => x.dia) : [];
    const porAtivo = Object.fromEntries(ATIVOS.map(([sym, , sinal]) => {
      const rs = hist[sym] ? retornos(hist[sym]) : [];
      const sd = desvio(rs.slice(-60).map((x) => x.r));
      return [sym, { sinal, sd, mapa: new Map(rs.map((x) => [x.dia, x.r])) }];
    }));
    const dias = ref.map((dia) => {
      const zs = Object.values(porAtivo).filter((a) => a.sd > 0 && a.mapa.has(dia)).map((a) => a.sinal * corta(a.mapa.get(dia) / a.sd));
      return { dia, t: zs.length >= MIN_ATIVOS ? escala(zs.reduce((a, b) => a + b, 0) / zs.length) : NaN };
    });
    return { linhas, usados: ok.length, temp: Number.isFinite(media) ? escala(media) : NaN, dias };
  }

  let ultimo = null, buscando = null;
  async function atualizar() {
    if (buscando) return buscando;
    buscando = (async () => {
      const [h, q] = await Promise.allSettled([historico(), cotacoes()]);
      if (h.status !== 'fulfilled' && q.status !== 'fulfilled') throw Error('sem dados');
      ultimo = { ...calcular(h.value || {}, q.value || {}), quando: Date.now() };
      pintarBotao();
      return ultimo;
    })().finally(() => { buscando = null; });
    return buscando;
  }

  function badge() {
    if (!ultimo || !Number.isFinite(ultimo.temp)) return '';
    const f = faixa(ultimo.temp);
    return `<b class="tm-chip tm-${f.cls}">${ultimo.temp}</b>`;
  }
  function pintarBotao() { document.querySelectorAll('[data-mm-temp-v]').forEach((el) => { el.innerHTML = badge(); }); }
  window.MMTemp = { badge, calcular, faixa, escala };

  /* ---------- painel ---------- */
  const CSS = `
  .ms-temp-btn{display:inline-flex;align-items:center;gap:8px}
  .qb-temp{margin-left:auto;flex:0 0 auto;font:inherit;font-size:11.5px;color:var(--text-2);background:none;border:1px solid var(--line);border-radius:999px;padding:2px 6px 2px 10px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
  .qb-temp:hover{color:var(--text);border-color:var(--line-2)}
  .qb-temp[hidden]{display:none}
  @media (max-width:640px){.qb-temp-t{display:none}.qb-temp{padding:2px 6px}}
  .tm-chip{display:inline-block;min-width:26px;padding:1px 7px;border-radius:999px;font:700 11px/1.5 'JetBrains Mono',monospace;text-align:center;color:#fff}
  .tm-off2{background:#b91c1c}.tm-off{background:#ef4444}.tm-neu{background:#64748b}.tm-on{background:#16a34a}.tm-on2{background:#15803d}
  #temp-modal .modal-content{max-width:820px;width:min(820px,calc(100vw - 32px));max-height:min(88vh,980px);overflow:auto}
  .tm-sub{font-size:12px;color:var(--text-3);margin:-4px 0 16px}
  .tm-topo{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:10px}
  .tm-num{font:700 44px/1 'JetBrains Mono',monospace;color:var(--text)}
  .tm-nome{font-size:18px;font-weight:700;padding-bottom:4px}
  .tm-nome.off2,.tm-nome.off{color:var(--neg)}.tm-nome.on,.tm-nome.on2{color:var(--pos)}.tm-nome.neu{color:var(--text-2)}
  .tm-barra{position:relative;height:12px;border-radius:999px;background:linear-gradient(90deg,#b91c1c 0%,#ef4444 25%,#64748b 50%,#22c55e 75%,#15803d 100%);margin:6px 0 4px}
  .tm-marca{position:absolute;top:-5px;width:4px;height:22px;margin-left:-2px;border-radius:2px;background:var(--text);box-shadow:0 0 0 2px var(--surface)}
  .tm-esc i{font-style:normal}
  .tm-esc{display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-3);font-family:'JetBrains Mono',monospace}
  .tm-h{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-2);margin:20px 0 8px;font-weight:700}
  .tm-dias{display:flex;align-items:flex-end;gap:3px;height:64px;border-bottom:1px solid var(--line);position:relative}
  .tm-dias::after{content:'';position:absolute;left:0;right:0;bottom:32px;border-top:1px dashed var(--line-2)}
  .tm-dia{flex:1;min-width:6px;border-radius:2px 2px 0 0;opacity:.9}
  .tm-dias-leg{display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-3);margin-top:4px;font-family:'JetBrains Mono',monospace}
  .tm-tab{width:100%;border-collapse:collapse;font-size:13px}
  .tm-tab th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
  .tm-tab td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
  .tm-tab td.n{text-align:right;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
  .tm-tab th.n{text-align:right}
  .tm-tab small{display:block;color:var(--text-3);font-size:11px}
  .tm-puxa{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
  .tm-puxa.on{color:var(--pos);background:color-mix(in srgb,var(--pos) 14%,transparent)}
  .tm-puxa.off{color:var(--neg);background:color-mix(in srgb,var(--neg) 14%,transparent)}
  .tm-puxa.neu{color:var(--text-3);background:color-mix(in srgb,var(--text-3) 12%,transparent)}
  .tm-grupo td{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-2);font-weight:700;background:color-mix(in srgb,var(--surface-2,var(--bg-2)) 60%,transparent)}
  .tm-como{font-size:12px;line-height:1.55;color:var(--text-3);border-top:1px solid var(--line);margin-top:16px;padding-top:12px}
  .tm-carregando{color:var(--text-2);padding:24px 0}
  @media (max-width:640px){.tm-esc i{display:none}.tm-tab .tm-x{display:none}.tm-num{font-size:36px}}
  `;
  let modal = null;
  function montar() {
    modal = document.createElement('div');
    modal.id = 'temp-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tm-titulo');
    modal.innerHTML = `<div class="modal-content"><button class="modal-close" type="button" aria-label="Fechar">&times;</button>
      <h2 id="tm-titulo">Temperatura do mercado</h2><div id="tm-corpo"></div></div>`;
    document.body.append(modal);
    modal.querySelector('.modal-close').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
  }
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  function fechar() { modal.classList.remove('visible'); document.removeEventListener('keydown', tecla); }

  const puxou = (l) => (!Number.isFinite(l.contrib) ? { t: '—', c: 'neu' } : l.contrib >= 0.25 ? { t: 'Risk-on', c: 'on' } : l.contrib <= -0.25 ? { t: 'Risk-off', c: 'off' } : { t: 'Neutro', c: 'neu' });
  const diaCurto = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const corDia = (t) => (t < 20 ? '#b91c1c' : t < 40 ? '#ef4444' : t <= 60 ? '#64748b' : t <= 80 ? '#22c55e' : '#15803d');

  function html(r) {
    const f = faixa(r.temp);
    const linha = (l) => {
      const p = puxou(l);
      return `<tr><td>${esc(l.nome)}<small class="tm-x">${esc(l.nota)}</small></td>
        <td class="n">${pct(l.chg)}</td>
        <td class="n" title="Variação do dia dividida pela oscilação diária normal do ativo (últimos 3 meses)">${Number.isFinite(l.z) ? num(Math.abs(l.z), 1) + 'x' : '—'}</td>
        <td><span class="tm-puxa ${p.c}">${p.t}</span></td></tr>`;
    };
    const on = r.linhas.filter((l) => l.sinal > 0), off = r.linhas.filter((l) => l.sinal < 0);
    const dias = r.dias.filter((d) => Number.isFinite(d.t));
    const hora = new Date(r.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<p class="tm-sub">Atualizado às ${hora} com ${r.usados} de ${r.linhas.length} ativos. Cotações do Yahoo Finance (podem ter atraso de até 15 minutos).</p>
      <div class="tm-topo"><span class="tm-num">${Number.isFinite(r.temp) ? r.temp : '—'}</span><span class="tm-nome ${f.cls}">${f.nome}</span></div>
      <div class="tm-barra">${Number.isFinite(r.temp) ? `<span class="tm-marca" style="left:${r.temp}%"></span>` : ''}</div>
      <div class="tm-esc"><span>0<i> · forte risk-off</i></span><span>50<i> · neutro</i></span><span><i>forte risk-on · </i>100</span></div>
      ${dias.length > 2 ? `<p class="tm-h">Últimos pregões (fechamento)</p>
        <div class="tm-dias">${dias.map((d) => `<span class="tm-dia" style="height:${Math.max(4, d.t * 0.64)}px;background:${corDia(d.t)}" title="${diaCurto(d.dia)}: ${d.t} (${faixa(d.t).nome})"></span>`).join('')}</div>
        <div class="tm-dias-leg"><span>${diaCurto(dias[0].dia)}</span><span>${diaCurto(dias[dias.length - 1].dia)}</span></div>` : ''}
      <p class="tm-h">O que entrou na conta</p>
      <table class="tm-tab"><thead><tr><th>Ativo</th><th class="n">Dia</th><th class="n">Força</th><th>Puxou para</th></tr></thead><tbody>
        <tr class="tm-grupo"><td colspan="4">Sobem com apetite a risco</td></tr>${on.map(linha).join('')}
        <tr class="tm-grupo"><td colspan="4">Sobem com aversão a risco</td></tr>${off.map(linha).join('')}
      </tbody></table>
      <p class="tm-como">Como é calculado: a variação do dia de cada ativo é dividida pela oscilação diária normal dele nos últimos 3 meses (a coluna Força). Assim, 1% no VIX não pesa o mesmo que 1% no S&P 500. Alta de um ativo de apetite a risco puxa para risk-on; alta de um ativo de proteção puxa para risk-off. A média vira uma nota de 0 a 100, em que 50 é neutro. Com menos de ${MIN_ATIVOS} ativos com dados, a nota fica em branco. É uma leitura do humor do mercado no dia, não uma recomendação de investimento.</p>`;
  }

  async function abrir() {
    if (!modal) montar();
    const corpo = modal.querySelector('#tm-corpo');
    if (!ultimo) corpo.innerHTML = '<p class="tm-carregando" role="status">Calculando com as cotações de agora…</p>';
    else corpo.innerHTML = html(ultimo);
    modal.classList.add('visible');
    document.addEventListener('keydown', tecla);
    modal.querySelector('.modal-close').focus();
    if (!ultimo || Date.now() - ultimo.quando > 60000) {
      try { const r = await atualizar(); if (modal.classList.contains('visible')) corpo.innerHTML = html(r); }
      catch { if (!ultimo) corpo.innerHTML = '<p class="tm-carregando">Não foi possível buscar as cotações agora. Tente de novo em instantes.</p>'; }
    }
  }

  { const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-mm-temp]')) abrir();
    else if (e.target.closest('.tab-btn, [data-tab]')) setTimeout(botaoNaFaixa, 60);
  });
  setTimeout(botaoNaFaixa, 300);
  // no computador a barra da Mesa fica escondida e a faixa de frases ocupa o topo: o botão vai na ponta direita dela,
  // só com a Mesa aberta
  function botaoNaFaixa() {
    const qb = document.querySelector('.qbanner');
    if (!qb) return;
    let b = qb.querySelector('.qb-temp');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'qb-temp'; b.setAttribute('data-mm-temp', '');
      b.title = 'Risk-on ou risk-off: termômetro do apetite a risco com as cotações do dia';
      b.innerHTML = '<span class="qb-temp-t">Temperatura do mercado</span> <span data-mm-temp-v></span>';
      qb.append(b);
      pintarBotao();
    }
    b.hidden = !document.getElementById('mesa-panel')?.classList.contains('active');
  }
  // nota no botão: calcula uma vez quando a Mesa abre e depois a cada 2 minutos com a Mesa à vista
  setInterval(() => {
    botaoNaFaixa();
    if (document.hidden || !document.querySelector('[data-mm-temp]')?.offsetParent) return;
    if (!ultimo || Date.now() - ultimo.quando > 120000) atualizar().catch(() => {});
  }, 5000);
})();
