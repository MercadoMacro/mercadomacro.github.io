/* =========================================================
   BALANÇA COMERCIAL NA ABA INDICADORES (área Brasil), 24/10/2026.
   Fonte: Comex Stat (MDIC/SECEX), lido pelo robô comex.yml do GitHub, que grava
   terminal/comex/comex.json (exportações e importações do Brasil por mês, em US$ FOB).
   Carregado pelo indicadores.js quando a área Brasil é aberta. Sem dado, mostra "—".
   ========================================================= */
(() => {
  if (window.__comexRender) return;
  const URL_DADOS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/comex/comex.json';
  const CACHE_KEY = 'comex_cache_v2', TTL = 6 * 3600 * 1000;
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = (v) => v != null && isFinite(v);
  const bi = (v, d = 2) => (ok(v) ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const sgBi = (v) => (ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${bi(Math.abs(v))}` : '—');
  const pct = (v) => (ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—');
  const cls = (v) => (!ok(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'eq');
  const nomeMes = (m, longo) => { const [a, n] = m.split('-').map(Number); const t = MESES[n - 1]; return longo ? `${t}/${a}` : `${t}/${String(a).slice(2)}`; };

  let cache = null, busy = false, err = false, host = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }

  async function load(force) {
    // cópia sem commodities ou destinos é da primeira versão do arquivo: busca de novo
    if (busy || (!force && cache?.d?.produtos && cache?.d?.paises && Date.now() - cache.ts < TTL)) return;
    busy = true; draw();
    try {
      const r = await fetchT(URL_DADOS + '?t=' + Math.floor(Date.now() / 600000), {}, 20000);
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.meses) || j.meses.length < 13) throw new Error('sem dados');
      cache = { ts: Date.now(), d: j }; err = false;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cheio */ }
    } catch (e) { err = true; }
    finally { busy = false; draw(); }
  }

  function html(d) {
    const ms = d.meses.map((x) => ({ ...x, s: ok(x.exp) && ok(x.imp) ? x.exp - x.imp : null }));
    const ult = ms[ms.length - 1], [ano, mes] = ult.m.split('-').map(Number);
    const ha12 = ms.find((x) => x.m === `${ano - 1}-${String(mes).padStart(2, '0')}`);
    const var12 = (k) => (ha12 && ok(ha12[k]) && ha12[k] ? (ult[k] / ha12[k] - 1) * 100 : null);
    const soma = (a, k) => ms.filter((x) => x.m.startsWith(a + '-') && +x.m.slice(5) <= mes).reduce((t, x) => t + (ok(x[k]) ? x[k] : 0), 0);
    const ytd = soma(ano, 's'), ytdAnt = ms.some((x) => x.m.startsWith(ano - 1 + '-')) ? soma(ano - 1, 's') : null;
    const ult24 = ms.slice(-24), sv = ult24.map((x) => x.s || 0);
    // escala do menor ao maior saldo, sempre incluindo o zero (sem meia área vazia quando todos são positivos)
    const hi = Math.max(0, ...sv), lo = Math.min(0, ...sv), amp = hi - lo || 1;
    const W = 480, H = 110, bw = W / ult24.length, z = 4 + (hi / amp) * (H - 8);
    const barras = ult24.map((x, i) => {
      const h = ok(x.s) ? Math.abs(x.s) / amp * (H - 8) : 0, y = x.s >= 0 ? z - h : z;
      const tip = `${nomeMes(x.m, true)}\nSaldo: US$ ${sgBi(x.s)} bi\nExportações: US$ ${bi(x.exp)} bi\nImportações: US$ ${bi(x.imp)} bi`;
      return `<g data-tip="${esc(tip)}"><rect x="${(i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" class="hit"/><rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" class="${x.s >= 0 ? 'up' : 'dn'}${i === ult24.length - 1 ? ' last' : ''}"/></g>`;
    }).join('');
    const rotulos = [0, 12, ult24.length - 1].filter((i, k, a) => ult24[i] && a.indexOf(i) === k).map((i) => `<text x="${i === 0 ? 0 : i === ult24.length - 1 ? W : (i * bw + bw / 2).toFixed(1)}" y="${H + 12}" style="text-anchor:${i === 0 ? 'start' : i === ult24.length - 1 ? 'end' : 'middle'}">${esc(nomeMes(ult24[i].m))}</text>`).join('');
    const tab = ms.slice(-6).reverse().map((x) => `<tr><th>${esc(nomeMes(x.m, true))}</th><td>${bi(x.exp)}</td><td>${bi(x.imp)}</td><td class="${cls(x.s)}">${sgBi(x.s)}</td></tr>`).join('');
    return `
      <div class="cx-top">
        <div><span>Saldo de ${esc(nomeMes(ult.m, true))}</span><b class="${cls(ult.s)}">US$ ${sgBi(ult.s)} bi</b><small>${ha12 ? `${esc(nomeMes(ha12.m, true))}: US$ ${sgBi(ha12.s)} bi` : ''}</small></div>
        <div><span>Exportações</span><b>US$ ${bi(ult.exp)} bi</b><small class="${cls(var12('exp'))}">${pct(var12('exp'))} em 12 meses</small></div>
        <div><span>Importações</span><b>US$ ${bi(ult.imp)} bi</b><small>${pct(var12('imp'))} em 12 meses</small></div>
        <div><span>Saldo no ano (jan–${esc(MESES[mes - 1])})</span><b class="${cls(ytd)}">US$ ${sgBi(ytd)} bi</b><small>${ok(ytdAnt) ? `${ano - 1}: US$ ${sgBi(ytdAnt)} bi` : ''}</small></div>
      </div>
      <div class="cx-duas">
        <div><p class="cx-leg">Saldo mês a mês, últimos 24 meses (US$ bi)</p>
          <svg class="cx-svg" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Saldo da balança comercial nos últimos 24 meses"><line x1="0" x2="${W}" y1="${z}" y2="${z}" class="z"/>${barras}${rotulos}</svg></div>
        <table class="ib-tb cx-tb"><thead><tr><th>Mês</th><th>Exportações</th><th>Importações</th><th>Saldo</th></tr></thead><tbody>${tab}</tbody></table>
      </div>
      <p class="ib-note">Valores em bilhões de dólares (FOB). O MDIC divulga o mês fechado na primeira semana do mês seguinte.</p>`;
  }

  const vol = (kg) => (!ok(kg) ? '—' : kg >= 1e9 ? `${(kg / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi t` : `${Math.round(kg / 1e6).toLocaleString('pt-BR')} mil t`);
  const r1 = (v) => (ok(v) ? Math.round(v * 10) / 10 || 0 : null); // arredonda antes do sinal: sem "−0,0"
  const varr = (a, b) => (ok(a) && ok(b) && b ? r1((a / b - 1) * 100) : null);
  const pp = (v) => (ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.` : '—');
  const fat = (v) => (ok(v) ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—');

  // resumo de uma commodity no último mês: valor, volume, variação em 12 meses e acumulado do ano (usado também pela watchlist)
  function resumoProduto(p, ult) {
    const [ano, mes] = ult.split('-').map(Number), ant = `${ano - 1}-${String(mes).padStart(2, '0')}`;
    const em = (m) => p.meses.find((x) => x.m === m);
    const soma = (a, k) => p.meses.filter((x) => x.m.startsWith(a + '-') && +x.m.slice(5) <= mes).reduce((t, x) => t + (x[k] || 0), 0);
    const u = em(ult), h = em(ant);
    return { nome: p.nome, m: ult, fob: u?.fob, kg: u?.kg, vFob: varr(u?.fob, h?.fob), vKg: varr(u?.kg, h?.kg), ytd: soma(ano, 'fob'), vYtd: varr(soma(ano, 'fob'), soma(ano - 1, 'fob')) };
  }

  // quadros à parte: commodities exportadas e destinos das exportações ([título, conteúdo] de cada um)
  function extras(d) {
    const ms = d.meses.map((x) => ({ ...x, s: ok(x.exp) && ok(x.imp) ? x.exp - x.imp : null })), ult = ms[ms.length - 1], partes = [];
    if (Array.isArray(d.produtos) && d.produtos.length) {
      const [ano, mes] = ult.m.split('-').map(Number);
      const linhas = d.produtos.map((p) => resumoProduto(p, ult.m)).sort((a, b) => (b.fob || 0) - (a.fob || 0)).map((r) => `<tr><th>${esc(r.nome)}</th><td>${bi(r.fob)}</td><td class="${cls(r.vFob)}">${pct(r.vFob)}</td><td>${vol(r.kg)}</td><td class="${cls(r.vKg)}">${pct(r.vKg)}</td><td>${bi(r.ytd, 1)}</td><td class="${cls(r.vYtd)}">${pct(r.vYtd)}</td></tr>`).join('');
      partes.push([`Commodities exportadas em ${esc(nomeMes(ult.m, true))}`, `
        <div class="cx-scroll"><table class="ib-tb cx-tb cx-pr"><thead><tr><th>Produto</th><th>US$ bi</th><th>12 meses</th><th>Volume</th><th>12 meses</th><th>No ano</th><th>vs ${ano - 1}</th></tr></thead><tbody>${linhas}</tbody></table></div>
        <p class="ib-note">"12 meses" compara com ${esc(nomeMes(`${ano - 1}-${String(mes).padStart(2, '0')}`, true))}. "No ano" soma jan–${esc(MESES[mes - 1])} em US$ bi e compara com o mesmo período de ${ano - 1}. Volume em toneladas líquidas.</p>`]);
    }
    if (Array.isArray(d.paises) && d.paises.length) {
      const [ano, mes] = ult.m.split('-').map(Number);
      const noAno = (a, get) => ms.filter((x) => x.m.startsWith(a + '-') && +x.m.slice(5) <= mes).reduce((t, x) => t + (get(x) || 0), 0);
      const tot = noAno(ano, (x) => x.exp), totAnt = noAno(ano - 1, (x) => x.exp);
      const somaP = (p, a) => Object.entries(p.m).filter(([m]) => m.startsWith(a + '-') && +m.slice(5) <= mes).reduce((t, [, v]) => t + v, 0);
      const rows = d.paises.map((p) => { const v = somaP(p, ano), va = somaP(p, ano - 1); return { p: p.p, v, f: tot ? v / tot * 100 : null, fa: totAnt ? va / totAnt * 100 : null }; }).sort((a, b) => b.v - a.v).slice(0, 10);
      const maxF = Math.max(...rows.map((r) => r.f || 0)) || 1;
      const linhas = rows.map((r) => `<tr><th>${esc(r.p)}</th><td class="cx-barcel"><span class="cx-bar" style="width:${((r.f || 0) / maxF * 100).toFixed(1)}%"></span></td><td>${fat(r.f)}</td><td class="${cls(ok(r.f) && ok(r.fa) ? r1(r.f - r.fa) : null)}">${pp(ok(r.f) && ok(r.fa) ? r1(r.f - r.fa) : null)}</td><td>${bi(r.v, 1)}</td></tr>`).join('');
      partes.push([`Para onde o Brasil exporta (jan–${esc(MESES[mes - 1])}/${ano})`, `
        <div class="cx-scroll"><table class="ib-tb cx-tb cx-ds"><thead><tr><th>País</th><th></th><th>Fatia</th><th>vs ${ano - 1}</th><th>US$ bi</th></tr></thead><tbody>${linhas}</tbody></table></div>
        <p class="ib-note">Fatia de cada país nas exportações do Brasil no ano. "vs ${ano - 1}" é a mudança em pontos percentuais contra o mesmo período do ano passado.</p>`]);
    }
    return partes;
  }

  function draw() {
    if (!host || !host.isConnected) return;
    const box = host.querySelector('.ib-in'), meta = host.querySelector('.ib-meta');
    if (cache?.d) { try { box.innerHTML = html(cache.d); } catch (e) { box.innerHTML = '<div class="ib-msg">Não foi possível ler os dados do Comex Stat.</div>'; } }
    else box.innerHTML = `<div class="ib-msg">${busy ? 'Carregando a balança comercial…' : err ? 'Dados da balança comercial indisponíveis agora.' : '—'}</div>`;
    const at = cache?.d?.atualizado ? ` · divulgado em ${cache.d.atualizado.split('-').reverse().join('/')}` : '';
    meta.innerHTML = `<a href="https://comexstat.mdic.gov.br" target="_blank" rel="noopener">Comex Stat (MDIC)</a>${at}${err && cache ? ' · último dado salvo' : ''}`;
    let partes = [];
    try { partes = cache?.d ? extras(cache.d) : []; } catch (e) { partes = []; }
    if (window.__indJumpBadges) window.__indJumpBadges();
    host.querySelector('.cx-par').innerHTML = partes.map(([t, h]) => `<div class="ib-box"><div class="ib-h"><h3>${t}</h3><span class="ib-meta">Comex Stat (MDIC)</span></div><div class="ib-in">${h}</div></div>`).join('');
  }

  // dados para outros módulos (watchlist): resumo da commodity pela chave, usando o mesmo cache
  window.MMComex = { resumo: (k) => { const d = cache?.d, p = d?.produtos?.find((x) => x.k === k); return p ? resumoProduto(p, d.ultimo) : null; }, carregar: () => load(false), pronto: () => !!cache?.d,
    // saldo do último mês, para a etiqueta do atalho "Balança comercial" em Indicadores
    saldo: () => { const u = cache?.d?.meses?.[cache.d.meses.length - 1]; return u && ok(u.exp) && ok(u.imp) ? { s: u.exp - u.imp, txt: bi(Math.abs(u.exp - u.imp)), mes: nomeMes(u.m, true) } : null; } };

  // chamado pelo indicadores.js toda vez que a área Brasil é desenhada
  window.__comexRender = (container, force = false) => {
    let sec = container.querySelector('#comex-sec');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'ind-sec'; sec.id = 'comex-sec';
      sec.innerHTML = `<div class="market-section-head"><span class="sec-icon"><i class="fas fa-ship"></i></span><h2>Balança comercial</h2><span class="sec-count">mensal</span></div>
        <div class="ib-box"><div class="ib-h"><h3>Exportações e importações do Brasil</h3><span class="ib-meta"></span></div><div class="ib-in"></div></div>
        <div class="cx-par"></div>`;
      container.appendChild(sec);
    }
    host = sec; draw(); load(force);
  };

  const css = document.createElement('style');
  css.textContent = `
  .cx-top { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; margin-bottom:12px; }
  .cx-top > div { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .cx-top span { font-size:11.5px; color:var(--text-3); }
  .cx-top b { font:600 19px 'JetBrains Mono', monospace; color:var(--text); letter-spacing:-.02em; white-space:nowrap; }
  .cx-top small { font-size:11px; color:var(--text-3); }
  #comex-sec .up { color:var(--pos-ink, var(--pos)); } #comex-sec .dn { color:var(--neg); } #comex-sec .na, #comex-sec .eq { color:var(--text-3); }
  .cx-duas { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:18px; align-items:start; }
  .cx-leg { margin:0 0 6px; font-size:11.5px; color:var(--text-3); }
  .cx-svg { display:block; width:100%; height:auto; }
  .cx-svg .z { stroke:var(--line-2, var(--line)); }
  .cx-svg rect.up { fill:var(--pos); opacity:.65; } .cx-svg rect.dn { fill:var(--neg); opacity:.65; } .cx-svg rect.last { opacity:1; }
  .cx-svg .hit { fill:transparent; } .cx-svg g.on .hit { fill:var(--text); opacity:.07; } .cx-svg g.on rect.up, .cx-svg g.on rect.dn { opacity:1; }
  .cx-svg text { font:10px 'JetBrains Mono', monospace; fill:var(--text-3); text-anchor:middle; }
  .cx-tb th:first-child { text-transform:none; }
  .cx-sub { margin:18px 0 8px; font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-2); }
  .cx-scroll { overflow-x:auto; }
  /* telas largas: commodities e destinos lado a lado */
  .cx-par { display:flex; flex-direction:column; gap:12px; margin-top:12px; }
  .cx-par:empty { display:none; }
  @media (min-width: 1400px) { .cx-par { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); align-items:start; } }
  .cx-pr, .cx-ds { width:100%; }
  .cx-pr td, .cx-ds td { white-space:nowrap; }
  .cx-barcel { width:38%; }
  .cx-bar { display:block; height:8px; border-radius:4px; background:var(--accent, var(--pos)); opacity:.75; min-width:2px; }
  @media (max-width: 900px) { .cx-top { grid-template-columns:repeat(2, minmax(0,1fr)); } .cx-duas { grid-template-columns:minmax(0,1fr); } #comex-sec .ib-h { flex-direction:column; align-items:flex-start; gap:4px; } }`;
  document.head.appendChild(css);
})();
