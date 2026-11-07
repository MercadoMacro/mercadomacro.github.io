/* =========================================================
   LEILÕES DO TESOURO DOS EUA NA ABA INDICADORES (área EUA, atalho "Juros e Fed"), 07/11/2026.
   Fonte: TreasuryDirect (Departamento do Tesouro dos EUA), API pública sem chave, lida pelo robô leiloes.yml
   do GitHub, que grava terminal/leiloes/leiloes.json. Só títulos de prazo longo (Notes, Bonds, TIPS e FRN);
   as letras curtas (Bills) ficam de fora. Cada leilão é comparado com a média dos 6 anteriores do mesmo prazo.
   Carregado pelo indicadores.js. Sem dado, mostra "—".
   ========================================================= */
(() => {
  if (window.__leiloesRender) return;
  const URL_DADOS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/leiloes/leiloes.json';
  const CACHE_KEY = 'leiloes_cache_v1', TTL = 30 * 60 * 1000, FILTRO_KEY = 'leiloes_filtro_v1';
  const PDF = (x) => `https://www.treasurydirect.gov/instit/annceresult/press/preanre/${x.d.slice(0, 4)}/${encodeURIComponent(x.pdf)}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const nf = (v, c) => (ok(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) : '—');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dia = (d) => (d ? `${+d.slice(8, 10)} ${MESES[+d.slice(5, 7) - 1]}` : '—');
  const diaAno = (d) => (d ? `${dia(d)} ${d.slice(0, 4)}` : '—');
  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const diaSem = (d) => { const t = new Date(d + 'T12:00:00Z'); return isNaN(t) ? '' : SEMANA[t.getUTCDay()]; };
  const bi = (v) => (ok(v) ? `US$ ${nf(v / 1e9, 0)} bi` : '—');

  // prazo do título: "9-Year 10-Month" vira série de 10 anos (reabertura), "2-Year" vira 2 anos
  const anos = (t) => { const m = /(\d+)-Year(?:\s+(\d+)-Month)?/.exec(t || ''); return m ? +m[1] + (m[2] ? 1 : 0) : null; };
  const serie = (x) => `${x.tipo}-${anos(x.orig) ?? anos(x.prazo) ?? x.orig}`;
  const NOME_TIPO = { Note: 'Note', Bond: 'Bond', TIPS: 'TIPS', FRN: 'FRN' };
  const titulo = (x) => { const a = anos(x.orig) ?? anos(x.prazo); return `${NOME_TIPO[x.tipo] || x.tipo} ${a ? a + (a > 1 ? ' anos' : ' ano') : esc(x.prazo)}`; };
  const prazoTxt = (t) => String(t || '').replace(/(\d+)-Year/, (_, n) => `${n} ${+n > 1 ? 'anos' : 'ano'}`).replace(/\s*(\d+)-Month/, (_, n) => ` e ${n} ${+n > 1 ? 'meses' : 'mês'}`);
  const taxaTxt = (x) => (!ok(x.taxa) ? '—' : x.kind === 'margem' ? `${nf(x.taxa * 100, 1)} bps` : `${nf(x.taxa, 3)}%`);

  const FILTROS = [['todos', 'Todos'], ['Note-2', '2 anos'], ['Note-3', '3 anos'], ['Note-5', '5 anos'], ['Note-7', '7 anos'], ['Note-10', '10 anos'], ['Bond-20', '20 anos'], ['Bond-30', '30 anos'], ['TIPS', 'TIPS'], ['FRN', 'FRN']];
  let filtro = 'todos';
  try { filtro = localStorage.getItem(FILTRO_KEY) || 'todos'; } catch (e) { /* sem armazenamento */ }
  if (!FILTROS.some(([k]) => k === filtro)) filtro = 'todos';

  let cache = null, busy = false, err = false, host = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }

  async function load(force) {
    if (busy || (!force && cache?.d && Date.now() - cache.ts < TTL)) return;
    busy = true; draw();
    try {
      const r = await fetchT(URL_DADOS + '?t=' + Math.floor(Date.now() / 600000), {}, 20000);
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.leiloes) || j.leiloes.length < 10) throw new Error('sem dados');
      cache = { ts: Date.now(), d: j }; err = false;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) { err = true; }
    finally { busy = false; draw(); }
  }

  // média dos 6 leilões anteriores do mesmo prazo (para dizer se a demanda veio acima ou abaixo do normal)
  function comparar(lista) {
    const porSerie = {};
    lista.forEach((x) => (porSerie[serie(x)] ||= []).push(x)); // a lista vem do mais novo para o mais antigo
    const media = (xs, k) => { const v = xs.map((y) => y[k]).filter(ok); return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    lista.forEach((x) => {
      const s = porSerie[serie(x)], i = s.indexOf(x), ant = s.slice(i + 1, i + 7);
      x._ant = s[i + 1] || null;
      x._m = { btc: media(ant, 'btc'), ind: media(ant, 'ind'), pd: media(ant, 'pd') };
    });
  }

  // seta e cor: para bid-to-cover e indiretos, acima da média é demanda forte; para dealers, acima da média é fraca
  function vsMedia(v, m, bomAlto, casas, suf = '') {
    if (!ok(v)) return '<td class="na">—</td>';
    const txt = `${nf(v, casas)}${suf}`;
    if (!ok(m)) return `<td>${txt}</td>`;
    const dif = v - m, tol = casas === 2 ? 0.05 : 2;
    const c = Math.abs(dif) < tol ? 'eq' : (dif > 0) === bomAlto ? 'up' : 'dn';
    return `<td class="${c}" title="Média dos 6 leilões anteriores deste prazo: ${nf(m, casas)}${suf}">${txt}<small>${nf(m, casas)}${suf}</small></td>`;
  }

  function linha(x) {
    const ant = x._ant, dTaxa = ok(x.taxa) && ok(ant?.taxa) ? (x.taxa - ant.taxa) * 100 : null;
    const dT = ok(dTaxa) ? `<small class="${Math.abs(dTaxa) < 0.5 ? 'eq' : dTaxa > 0 ? 'sobe' : 'cai'}" title="Diferença para o leilão anterior deste prazo (${esc(diaAno(ant.d))})">${dTaxa > 0 ? '+' : dTaxa < 0 ? '−' : ''}${nf(Math.abs(dTaxa), 1)} bps</small>` : '';
    const pdf = x.pdf ? `<a href="${PDF(x)}" target="_blank" rel="noopener" title="Resultado oficial (PDF)" aria-label="Resultado oficial em PDF"><i class="fas fa-file-pdf" aria-hidden="true"></i></a>` : '';
    return `<tr>
      <th><span class="lt-d">${esc(dia(x.d))}</span></th>
      <th class="lt-t">${titulo(x)}${x.reab ? ' <em title="Reabertura de um título já emitido">reab.</em>' : ''}</th>
      <td>${taxaTxt(x)}${x.kind === 'margem' ? '' : dT}</td>
      ${vsMedia(x.btc, x._m.btc, true, 2)}
      ${vsMedia(x.ind, x._m.ind, true, 1, '%')}
      <td class="${ok(x.dir) ? '' : 'na'}">${ok(x.dir) ? nf(x.dir, 1) + '%' : '—'}</td>
      ${vsMedia(x.pd, x._m.pd, false, 1, '%')}
      <td>${bi(x.oferta)}</td>
      <td class="lt-pdf">${pdf}</td>
    </tr>`;
  }

  function html(d) {
    const lista = d.leiloes.slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    comparar(lista);
    const hoje = new Date().toISOString().slice(0, 10);
    const prox = (d.proximos || []).filter((x) => x.d >= hoje);
    const sel = filtro === 'todos' ? lista : lista.filter((x) => (filtro.includes('-') ? serie(x) === filtro : x.tipo === filtro));
    const u = lista[0];
    const p0 = prox[0];
    const kpiUlt = u ? `<div><span>Último leilão · ${esc(dia(u.d))}</span><b>${titulo(u)}</b><small>taxa ${taxaTxt(u)} · bid-to-cover ${nf(u.btc, 2)}</small></div>` : '';
    const kpiProx = p0 ? `<div><span>Próximo leilão · ${esc(diaSem(p0.d))} ${esc(dia(p0.d))}</span><b>${titulo(p0)}</b><small>${p0.oferta ? bi(p0.oferta) : 'valor ainda não anunciado'}${p0.reab ? ' · reabertura' : ''}</small></div>` : '<div><span>Próximo leilão</span><b>—</b><small>agenda ainda não divulgada</small></div>';
    const cBtc = u && ok(u.btc) && ok(u._m.btc) ? (u.btc - u._m.btc >= 0.05 ? 'up' : u.btc - u._m.btc <= -0.05 ? 'dn' : 'eq') : 'na';
    const cInd = u && ok(u.ind) && ok(u._m.ind) ? (u.ind - u._m.ind >= 2 ? 'up' : u.ind - u._m.ind <= -2 ? 'dn' : 'eq') : 'na';
    const kpis = `${kpiProx}${kpiUlt}
      <div><span>Demanda (bid-to-cover)</span><b class="${cBtc}">${u ? nf(u.btc, 2) : '—'}</b><small>média dos 6 anteriores: ${u ? nf(u._m.btc, 2) : '—'}</small></div>
      <div><span>Indiretos (estrangeiros e fundos)</span><b class="${cInd}">${u && ok(u.ind) ? nf(u.ind, 1) + '%' : '—'}</b><small>média dos 6 anteriores: ${u && ok(u._m.ind) ? nf(u._m.ind, 1) + '%' : '—'}</small></div>`;
    const botoes = FILTROS.map(([k, t]) => `<button type="button" data-lf="${k}" class="${k === filtro ? 'on' : ''}" aria-pressed="${k === filtro}">${t}</button>`).join('');
    const corpo = sel.slice(0, filtro === 'todos' ? 15 : 12).map(linha).join('') || '<tr><td colspan="9" class="na">—</td></tr>';
    const agenda = prox.slice(0, 8).map((x) => `<tr><th><span class="lt-d">${esc(diaSem(x.d))} ${esc(dia(x.d))}</span></th><th class="lt-t">${titulo(x)}${x.reab ? ' <em>reab.</em>' : ''}</th><td>${esc(prazoTxt(x.prazo))}</td><td>${x.oferta ? bi(x.oferta) : '—'}</td></tr>`).join('');
    return `
      <div class="lt-top">${kpis}</div>
      <div class="lt-filtros" role="group" aria-label="Filtrar por prazo">${botoes}</div>
      <div class="lt-scroll"><table class="ib-tb lt-tb">
        <thead><tr><th>Data</th><th>Título</th><th>Taxa</th><th>Bid-to-cover</th><th>Indiretos</th><th>Diretos</th><th>Dealers</th><th>Oferta</th><th></th></tr></thead>
        <tbody>${corpo}</tbody></table></div>
      ${agenda ? `<h4 class="lt-sub">Próximos leilões</h4><div class="lt-scroll"><table class="ib-tb lt-tb lt-ag"><thead><tr><th>Data</th><th>Título</th><th>Prazo</th><th>Oferta</th></tr></thead><tbody>${agenda}</tbody></table></div>` : ''}
      <p class="ib-note">Bid-to-cover é quanto foi pedido para cada dólar oferecido: quanto maior, mais procura. Indiretos são compradores que entram por intermediários, como bancos centrais e fundos estrangeiros. Diretos compram por conta própria. Dealers são os bancos obrigados a comprar o que sobra, então uma fatia maior que a média indica procura fraca. O número pequeno embaixo é a média dos 6 leilões anteriores do mesmo prazo, e a variação ao lado da taxa é a diferença para o leilão anterior. TIPS pagam juro real (acima da inflação) e FRN mostram a margem sobre a letra de 3 meses. Datas no horário de Nova York; o resultado sai por volta das 13h de lá.</p>`;
  }

  function draw() {
    if (!host || !host.isConnected) return;
    const d = cache?.d, box = host.querySelector('.ib-in'), salvo = err && cache ? ' · último dado salvo' : '';
    if (d) { try { box.innerHTML = html(d); } catch (e) { box.innerHTML = '<div class="ib-msg">Não foi possível ler os leilões.</div>'; } }
    else box.innerHTML = `<div class="ib-msg">${busy ? 'Carregando os leilões do Tesouro…' : err ? 'Dados do Tesouro indisponíveis agora.' : '—'}</div>`;
    const ult = d?.leiloes?.[0]?.d;
    host.querySelector('.ib-meta').innerHTML = `<a href="https://www.treasurydirect.gov/auctions/auction-query/" target="_blank" rel="noopener">TreasuryDirect</a>${ult ? ` · até ${esc(diaAno(ult))}` : ''}${salvo}`;
  }

  // chamado pelo indicadores.js toda vez que a área EUA é desenhada
  window.__leiloesRender = (container, force = false) => {
    let sec = container.querySelector('#leiloes-sec');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'ind-sec'; sec.id = 'leiloes-sec'; sec.dataset.s = 'juros';
      sec.innerHTML = `<div class="market-section-head"><span class="sec-icon"><i class="fas fa-gavel"></i></span><h2>Leilões do Tesouro dos EUA</h2><span class="sec-count">Notes, Bonds, TIPS e FRN</span></div>
        <div class="ib-box"><div class="ib-h"><h3>Resultado e agenda dos leilões</h3><span class="ib-meta"></span></div><div class="ib-in"></div></div>`;
      sec.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lf]');
        if (!b) return;
        filtro = b.dataset.lf;
        try { localStorage.setItem(FILTRO_KEY, filtro); } catch (e2) { /* sem armazenamento */ }
        draw();
      });
      container.appendChild(sec);
    }
    host = sec; draw(); load(force);
  };

  const css = document.createElement('style');
  css.textContent = `
  #leiloes-sec .ib-box { border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; min-width:0; }
  #leiloes-sec .ib-h { display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--surface-2) 70%, transparent); }
  #leiloes-sec .ib-h h3 { margin:0; flex:1; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  #leiloes-sec .ib-meta { font-size:10.5px; color:var(--text-3); white-space:nowrap; }
  #leiloes-sec .ib-meta a { color:var(--text-3); text-decoration:none; } #leiloes-sec .ib-meta a:hover { color:var(--accent-ink); text-decoration:underline; }
  #leiloes-sec .ib-in { padding:12px; }
  #leiloes-sec .ib-msg { padding:36px 10px; text-align:center; font-size:12.5px; color:var(--text-3); }
  #leiloes-sec .ib-tb { width:100%; border-collapse:collapse; font-size:12px; }
  #leiloes-sec .ib-tb th, #leiloes-sec .ib-tb td { padding:6px 8px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; vertical-align:top; }
  #leiloes-sec .ib-tb td { font-family:'JetBrains Mono', monospace; font-size:11.5px; }
  #leiloes-sec .ib-tb tbody th { text-align:left; font-weight:500; color:var(--text-2); }
  #leiloes-sec .ib-tb thead th { font-size:10.5px; color:var(--text-3); font-weight:600; }
  #leiloes-sec .ib-tb thead th:nth-child(-n+2) { text-align:left; }
  #leiloes-sec .ib-tb tr:last-child th, #leiloes-sec .ib-tb tr:last-child td { border-bottom:0; }
  #leiloes-sec .ib-note { margin:10px 0 0; font-size:10.5px; color:var(--text-3); line-height:1.5; }
  #leiloes-sec .lt-t { color:var(--text) !important; font-weight:600 !important; }
  #leiloes-sec .lt-t em { font-style:normal; font-size:10px; font-weight:600; color:var(--text-3); border:1px solid var(--line); border-radius:4px; padding:0 4px; margin-left:4px; }
  #leiloes-sec .lt-d { font-family:'JetBrains Mono', monospace; font-size:11.5px; color:var(--text-2); }
  #leiloes-sec td small { display:block; font-size:10px; color:var(--text-3); margin-top:1px; }
  #leiloes-sec td.up { color:var(--pos-ink, var(--pos)); } #leiloes-sec td.dn { color:var(--neg); }
  #leiloes-sec td small.sobe { color:var(--neg); } #leiloes-sec td small.cai { color:var(--pos-ink, var(--pos)); }
  #leiloes-sec .na { color:var(--text-3); }
  #leiloes-sec .lt-pdf a { color:var(--text-3); } #leiloes-sec .lt-pdf a:hover { color:var(--accent-ink); }
  #leiloes-sec .lt-top { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; margin-bottom:14px; }
  #leiloes-sec .lt-top > div { display:flex; flex-direction:column; gap:2px; min-width:0; }
  #leiloes-sec .lt-top span { font-size:11.5px; color:var(--text-3); }
  #leiloes-sec .lt-top b { font:600 19px 'JetBrains Mono', monospace; color:var(--text); letter-spacing:-.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #leiloes-sec .lt-top b.up { color:var(--pos-ink, var(--pos)); } #leiloes-sec .lt-top b.dn { color:var(--neg); }
  #leiloes-sec .lt-top small { font-size:11px; color:var(--text-3); }
  #leiloes-sec .lt-filtros { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  #leiloes-sec .lt-filtros button { font:inherit; font-size:12px; padding:4px 10px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); cursor:pointer; }
  #leiloes-sec .lt-filtros button:hover { color:var(--text); border-color:var(--line-2, var(--line)); }
  #leiloes-sec .lt-filtros button.on { background:var(--accent); border-color:var(--accent); color:#17120a; font-weight:600; }
  #leiloes-sec .lt-scroll { overflow-x:auto; }
  #leiloes-sec .lt-sub { margin:16px 0 6px; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-2); }
  #leiloes-sec .lt-ag { max-width:620px; }
  @media (max-width: 900px) { #leiloes-sec .lt-top { grid-template-columns:repeat(2, minmax(0,1fr)); } #leiloes-sec .ib-h { flex-direction:column; align-items:flex-start; gap:4px; } }`;
  document.head.appendChild(css);
})();
