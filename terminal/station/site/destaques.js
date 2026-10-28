/* Faixa de destaques no topo da aba Análises (pedido do Severino, 28/10/2026).
   Quatro cartões com dados que o site já publica no GitHub: fluxo estrangeiro na B3 no mês,
   próximo balanço das maiores empresas, especuladores no S&P 500 (CFTC) e Focus de IPCA e Selic.
   Sem dado, o cartão mostra "—". */
(() => {
  const RAW = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/';
  const CACHE = 'destaques_cache_v1', TTL = 60 * 60 * 1000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 1) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sinal = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d);
  const dataBR = (iso, ano = false) => { const [y, m, d] = String(iso).split('-'); return ano ? `${d}/${m}/${y}` : `${d}/${m}`; };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  async function json(caminho) {
    for (const u of [RAW + caminho, caminho]) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(u, { signal: ctl.signal }).finally(() => clearTimeout(t));
        if (r.ok) return await r.json();
      } catch (e) { /* próxima */ }
    }
    return null;
  }

  /* ---------- cada cartão vira um resumo pequeno, guardado em cache ---------- */
  function fluxo(f) {
    const ks = Object.keys(f?.meses || {}).sort(), k = ks[ks.length - 1];
    const m = k && f.meses[k], e = m?.tipos?.estrangeiro;
    if (!e) return null;
    const ano = ks.filter((x) => x.slice(0, 4) === k.slice(0, 4)).reduce((a, x) => a + (f.meses[x].tipos?.estrangeiro?.saldo || 0), 0);
    return { v: e.saldo / 1e6, ate: m.ate, mes: `${MESES[+k.slice(5) - 1]}/${k.slice(0, 4)}`, ano: ano / 1e6, a: k.slice(0, 4) };
  }
  function balanco(ag, idx) {
    if (!ag?.proximos || !idx?.empresas) return null;
    const receita = new Map(idx.empresas.map((e) => [String(e.cvm), e.receita || 0]));
    const hoje = hojeISO();
    // entre as 30 maiores por receita, a que divulga primeiro a partir de hoje
    const grandes = new Set([...receita.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([c]) => c));
    const p = ag.proximos.filter((x) => x.data >= hoje && grandes.has(String(x.cvm))).sort((a, b) => a.data.localeCompare(b.data) || (receita.get(String(b.cvm)) - receita.get(String(a.cvm))))[0];
    if (!p) return null;
    const emp = ag.empresas?.[String(p.cvm)] || {};
    const mesmoDia = ag.proximos.filter((x) => x.data === p.data && grandes.has(String(x.cvm))).length;
    return { tk: (emp.tickers || [])[0] || '', nome: emp.nome || '', data: p.data, tri: p.tri, tipo: p.tipo, outros: mesmoDia - 1 };
  }
  function cot(c) {
    const m = (c?.mercados || []).find((x) => x.k === 'spx');
    const ss = (m?.semanas || []).filter((s) => Number.isFinite(s.el) && Number.isFinite(s.es));
    if (ss.length < 2) return null;
    const net = (s) => s.el - s.es, u = ss[ss.length - 1], a = ss[ss.length - 2];
    const nets = ss.map(net), min = Math.min(...nets), max = Math.max(...nets);
    return { net: net(u), dif: net(u) - net(a), d: u.d, pos: max > min ? Math.round((net(u) - min) / (max - min) * 100) : null };
  }
  function focus(fo) {
    const a = hojeISO().slice(0, 4), ind = fo?.ind || {};
    const um = (nome) => {
      const s = ind[nome]?.[a];
      if (!s?.length) return null;
      const u = s[s.length - 1], t = Date.parse(u[0]) - 28 * 864e5;
      const ant = [...s].reverse().find((p) => Date.parse(p[0]) <= t);
      return { v: u[1], d: u[0], dif: ant ? u[1] - ant[1] : null };
    };
    const ipca = um('IPCA'), selic = um('Selic');
    return ipca || selic ? { a, ipca, selic } : null;
  }

  let dados = null;
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && Date.now() - c.ts < TTL) dados = c; } catch (e) { /* sem cache */ }

  async function busca() {
    const [f, ag, idx, c, fo] = await Promise.all([json('fluxo/fluxo.json'), json('balancos-br/agenda.json'), json('fundamentos/index.json'), json('posicoes/cot.json'), json('historico/focus.json')]);
    const novo = { ts: Date.now(), fluxo: fluxo(f), balanco: balanco(ag, idx), cot: cot(c), focus: focus(fo) };
    // mantém o que já tinha quando uma fonte falha
    if (dados) ['fluxo', 'balanco', 'cot', 'focus'].forEach((k) => { if (!novo[k] && dados[k]) novo[k] = dados[k]; });
    dados = novo;
    try { localStorage.setItem(CACHE, JSON.stringify(dados)); } catch (e) { /* cheio */ }
  }

  /* ---------- desenho ---------- */
  const card = (ic, rot, corpo, alvo, titulo) => `<${alvo ? `button type="button" data-alvo="${alvo}" title="${esc(titulo)}"` : 'div'} class="dq-card">
      <span class="dq-rot"><i class="fa-solid ${ic}" aria-hidden="true"></i>${rot}</span>${corpo}</${alvo ? 'button' : 'div'}>`;
  const vazio = '<strong class="dq-v">—</strong><span class="dq-s">sem dado no momento</span>';
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

  function desenha(root) {
    const d = dados || {};
    const fx = d.fluxo, b = d.balanco, c = d.cot, fo = d.focus;
    const linhaFocus = (rot, x) => x ? `<span class="dq-par"><em>${rot}</em><b>${nf(x.v, 2)}%</b>${x.dif != null && Math.abs(x.dif) >= 0.005 ? `<small class="${cls(x.dif)}">${sinal(x.dif, 2)}</small>` : ''}</span>` : `<span class="dq-par"><em>${rot}</em><b>—</b></span>`;
    let dia = '';
    if (b) { const dt = new Date(b.data + 'T12:00:00'); dia = `${DIAS[dt.getDay()]}, ${dataBR(b.data)}`; }
    root.innerHTML = `<div class="dq-strip">
      ${card('fa-earth-americas', 'Estrangeiro na B3', fx ? `<strong class="dq-v ${cls(fx.v)}">${fx.v >= 0 ? '+' : '−'}R$ ${nf(Math.abs(fx.v), 2)} bi</strong>
        <span class="dq-s">saldo em ${esc(fx.mes)}, até ${dataBR(fx.ate)} · no ano ${fx.ano >= 0 ? '+' : '−'}R$ ${nf(Math.abs(fx.ano), 1)} bi</span>` : vazio, 'ana-sec-fluxo', 'Ver o fluxo na B3')}
      ${card('fa-file-invoice-dollar', 'Próximo balanço', b ? `<strong class="dq-v">${esc(b.tk || b.nome)}</strong>
        <span class="dq-s">${esc(b.tri)} · ${esc(dia)} · ${b.tipo === 'confirmada' ? 'data confirmada' : 'data provável'}${b.outros > 0 ? ` · +${b.outros} grande${b.outros > 1 ? 's' : ''} no dia` : ''}</span>` : '<strong class="dq-v">—</strong><span class="dq-s">nenhuma data prevista entre as maiores</span>', null)}
      ${card('fa-scale-unbalanced', 'Especuladores no S&P 500', c ? `<strong class="dq-v ${cls(c.net)}">${c.net >= 0 ? 'Comprados' : 'Vendidos'} ${nf(Math.abs(c.net) / 1000, 1)} mil</strong>
        <span class="dq-s">contratos líquidos em ${dataBR(c.d)} · ${sinal(c.dif / 1000, 1)} mil na semana${c.pos != null ? ` · ${c.pos}% da faixa de 3 anos` : ''}</span>` : vazio, 'ana-sec-cot', 'Ver a posição dos especuladores (CFTC)')}
      ${card('fa-bullseye', `Focus para ${fo ? fo.a : 'o ano'}`, fo ? `<span class="dq-pares">${linhaFocus('IPCA', fo.ipca)}${linhaFocus('Selic', fo.selic)}</span>
        <span class="dq-s">mediana do mercado${fo.ipca ? ` em ${dataBR(fo.ipca.d)}` : ''} · variação em 4 semanas</span>` : vazio, null)}
    </div>`;
  }

  window.__destaquesRender = async (root) => {
    if (!root.__dq) {
      root.__dq = true;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-alvo]');
        const alvo = b && document.getElementById(b.dataset.alvo);
        if (!alvo) return;
        // com a barra de seções, troca para a seção do cartão antes de rolar
        if (window.__anaSecao) window.__anaSecao(b.dataset.alvo);
        requestAnimationFrame(() => alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      });
    }
    desenha(root);
    if (!dados || Date.now() - dados.ts > TTL) { await busca(); desenha(root); }
  };

  const css = document.createElement('style');
  css.textContent = `
  .dq-strip { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin:4px 0 16px; }
  .dq-card { display:flex; flex-direction:column; gap:6px; min-width:0; text-align:left; font:inherit; color:var(--text); background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:13px 15px 12px; }
  button.dq-card { cursor:pointer; transition:border-color .15s, box-shadow .15s, transform .15s; }
  button.dq-card:hover { border-color:var(--accent-line, var(--line-2)); box-shadow:0 4px 14px rgba(0,0,0,.08); transform:translateY(-1px); }
  button.dq-card:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .dq-rot { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--text-3); }
  .dq-rot i { color:var(--accent-ink, var(--accent)); font-size:12px; }
  .dq-v { font-size:21px; font-weight:700; line-height:1.15; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .dq-v.up, .dq-par small.up { color:var(--pos-ink, var(--pos)); }
  .dq-v.dn, .dq-par small.dn { color:var(--neg); }
  .dq-s { font-size:12px; color:var(--text-3); line-height:1.4; }
  .dq-pares { display:flex; gap:2px 16px; flex-wrap:wrap; }
  .dq-par { display:flex; align-items:baseline; gap:6px; font-variant-numeric:tabular-nums; }
  .dq-par em { font-style:normal; font-size:12px; color:var(--text-2, var(--text-3)); }
  .dq-par b { font-size:19px; font-weight:700; line-height:1.15; }
  .dq-par small { font-size:12px; font-weight:600; }
  @media (max-width: 1100px) { .dq-strip { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 520px) { .dq-strip { grid-template-columns:1fr; } .dq-v, .dq-par b { font-size:19px; } }
  `;
  document.head.appendChild(css);
})();
