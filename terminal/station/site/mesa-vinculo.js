/* Vínculo por cor na Mesa (11/11/2026), como os grupos de cor do TC2000 e do NinjaTrader e os grupos de sincronia
   do TradingView. Na Mesa 2 a janela Gráfico segue o ativo do grupo: só o gráfico diário (asset-history.js, sem os textos
   da tela cheia) e, embaixo, até 3 manchetes do terminal que citam o ativo. Sem janela da Jade (11/11: chamadas demais). Clicar numa linha ou card de uma janela dourada troca as janelas
   douradas; uma janela azul troca as azuis; "sem vínculo" abre o gráfico em tela cheia, como antes.
   Grupos padrão: tudo dourado. A cor de cada janela muda no modo Montar mesa (bolinha na barra do topo).
   Guardado neste navegador (mm_mesa_vinculo_v1): cor de cada janela e o último ativo de cada cor. */
globalThis.MMDeskLink = (() => {
  const KEY = 'mm_mesa_vinculo_v1';
  const CORES = ['ouro', 'azul', 'nenhum'];
  const NOME_COR = { ouro: 'dourado', azul: 'azul', nenhum: 'sem vínculo' };
  const SEGUEM = ['grafico']; // janela que segue o ativo do grupo (notícias do ativo vão dentro dela)
  const PADRAO = { ouro: { s: '^BVSP', n: 'Ibovespa' }, azul: { s: 'BRL=X', n: 'Dólar (USD/BRL)' } };
  const ID = /^[a-z0-9]{2,12}$/, SYM = /^[\w^.=\-]{1,24}$/;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function limpa(v) {
    const o = v && typeof v === 'object' ? v : {}, grupos = {}, sim = {};
    for (const [id, c] of Object.entries(o.grupos || {})) if (ID.test(id) && CORES.includes(c)) grupos[id] = c;
    for (const c of ['ouro', 'azul']) { const x = o.sim?.[c]; sim[c] = x && SYM.test(x.s) ? { s: x.s, n: String(x.n || x.s).slice(0, 60) } : PADRAO[c]; }
    return { grupos, sim };
  }
  const corDe = (est, id) => est.grupos[id] || 'ouro';
  const proxima = (c) => CORES[(CORES.indexOf(c) + 1) % CORES.length];

  if (typeof document === 'undefined') return { limpa, corDe, proxima, CORES };

  let est = (() => { try { return limpa(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return limpa(null); } })();
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(est)); } catch (e) { /* sem espaço */ } };
  let ctx = null, rootAtual = null, viewer = null;
  const nos = {}; // janelas que seguem: o mesmo elemento volta a cada redesenho da Mesa (o gráfico não recarrega)
  const mostrado = {}; // ativo já desenhado em cada janela

  // o bloco ao qual um elemento pertence (com ou sem a grade personalizada)
  function blocoDe(el) {
    const b = el.closest('[data-mesa-block]'); if (b) return b.dataset.mesaBlock;
    if (el.dataset.tb) return el.dataset.tb;
    const s = el.closest('[data-tb]'); if (s) return s.dataset.tb;
    if (el.closest('.ms-cards')) return 'cards';
    if (el.closest('.ms-crypto')) return 'crypto';
    return null;
  }
  const visivel = (n) => !!(n && n.isConnected && n.offsetParent !== null && !n.closest('[hidden]'));
  const seguidoras = (cor) => SEGUEM.filter((id) => corDe(est, id) === cor && visivel(nos[id]));

  function no(id) {
    if (nos[id]) return nos[id];
    const d = document.createElement('div'); d.className = 'mv-in mv-' + id;
    d.innerHTML = '<div class="mv-head"><span class="mv-dot" aria-hidden="true"></span><h3 class="mv-t"></h3><span class="sp"></span>'
      + '<button type="button" class="mv-cheio" data-mv-cheio aria-label="Abrir em tela cheia" title="Abrir em tela cheia"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div><div class="mv-body"></div>';
    nos[id] = d;
    return d;
  }

  // chamado pelo mesa.js logo depois de redesenhar a Mesa
  const mesa1 = () => globalThis.MMDeskWindows?.modo?.() === '1'; // Mesa 1: nada de vínculo, clique abre a tela cheia
  function montar(root, c) {
    rootAtual = root; ctx = c;
    if (mesa1()) return;
    root.querySelectorAll('.ms-vbox[data-v]').forEach((sec) => {
      const d = no(sec.dataset.v);
      if (d.parentNode !== sec) sec.replaceChildren(d);
    });
    pintar();
  }
  function pintar() {
    if (!rootAtual || mesa1()) return;
    // cor de cada bloco (bolinha no canto) e seleção nas linhas
    // curva e notícias gerais não têm ativo: ficam sem bolinha
    const marca = (el, id) => { if (el && id && id !== 'curve' && id !== 'news') el.dataset.mv = corDe(est, id); };
    rootAtual.querySelectorAll('[data-mesa-block]').forEach((b) => marca(b, b.dataset.mesaBlock));
    rootAtual.querySelectorAll('.ms-tb[data-tb]').forEach((b) => marca(b, b.dataset.tb));
    marca(rootAtual.querySelector('.ms-cards'), 'cards'); marca(rootAtual.querySelector('.ms-crypto'), 'crypto');
    rootAtual.querySelectorAll('.ms-vbox[data-v]').forEach((b) => marca(b, b.dataset.v));
    rootAtual.querySelectorAll('.mv-sel').forEach((n) => n.classList.remove('mv-sel'));
    rootAtual.querySelectorAll('tr[data-sym], .ms-card[data-sym], .ms-cr[data-sym]').forEach((el) => {
      const cor = corDe(est, blocoDe(el) || '');
      if (cor !== 'nenhum' && est.sim[cor]?.s === el.dataset.sym && seguidoras(cor).length) el.classList.add('mv-sel');
    });
    for (const id of SEGUEM) desenhar(id);
  }

  function desenhar(id) {
    const d = nos[id]; if (!d || id !== 'grafico') return;
    const cor = corDe(est, id), alvo = cor === 'nenhum' ? est.sim.ouro : est.sim[cor];
    d.dataset.mv = cor;
    d.querySelector('.mv-t').textContent = alvo.n;
    const body = d.querySelector('.mv-body');
    if (mostrado.grafico !== alvo.s || !body.querySelector('.mv-graf')) {
      mostrado.grafico = alvo.s; delete mostrado.faixa;
      body.innerHTML = '<div class="mv-graf"></div><div class="mv-faixa" role="list" aria-label="Notícias do ativo"></div>';
      if (!viewer && window.MMAssetHistory && ctx) viewer = new window.MMAssetHistory.Viewer((s) => ctx.getJSON(`${ctx.PROXY}/history?symbols=${encodeURIComponent(s)}`, 20000));
      if (viewer) viewer.show(body.querySelector('.mv-graf'), alvo.s, alvo.n, document.documentElement.dataset.theme === 'light' || document.body.classList.contains('light')).then(() => {
        // os botões de período vão para a barra do título (por cima do gráfico cobriam a escala de preço)
        const head = d.querySelector('.mv-head'), r = body.querySelector('.mv-graf .wlh-range');
        head.querySelector(':scope > .wlh-range')?.remove();
        if (r) head.insertBefore(r, head.querySelector('.mv-cheio'));
      }).catch(() => {});
    }
    faixa(alvo, body.querySelector('.mv-faixa'));
  }
  // notícias do ativo, discretas, embaixo do gráfico: até 3 manchetes do terminal que citam o ativo (sem chamar a Jade)
  function faixa(alvo, el) {
    if (!el) return;
    const termos = (window.MMRadar?.termos(alvo.s) || []).concat(alvo.n.split(' (')[0]).filter((x, i, a) => x && a.indexOf(x) === i);
    const lista = (typeof newsAll !== 'undefined' && Array.isArray(newsAll) ? newsAll : [])
      .filter((n) => n && n.titulo && window.MMRadar?.cita(n.titulo, termos)).sort((a, b) => b.data - a.data).slice(0, 3);
    const chave = alvo.s + ':' + lista.map((n) => n.link).join('|');
    if (mostrado.faixa === chave) return;
    mostrado.faixa = chave;
    const hora = (ms) => { const d = new Date(ms), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
    el.innerHTML = lista.length
      ? lista.map((n) => `<a role="listitem" href="${esc(n.link || '#')}" target="_blank" rel="noopener"><span class="hr">${hora(n.data)}</span><span class="tt">${esc(n.titulo)}</span><span class="src">${esc(n.fonte === 'Google News' ? (n.veiculo || n.fonte) : n.fonte || '')}</span></a>`).join('')
      : `<span class="mv-vazio">Sem manchetes recentes sobre ${esc(alvo.n)}.</span>`;
  }

  // clique numa linha ou card (mesa.js chama antes de abrir o gráfico em tela cheia); true = tratado aqui
  function clicou(el) {
    if (mesa1()) return false;
    const id = blocoDe(el); if (!id) return false;
    const cor = corDe(est, id);
    if (cor === 'nenhum' || !seguidoras(cor).length) return false;
    const n = (el.querySelector('.nm')?.lastChild?.textContent || el.dataset.name || el.dataset.sym).trim();
    est.sim[cor] = { s: el.dataset.sym, n: n.slice(0, 60) }; guardar();
    pintar();
    return true;
  }
  function trocarCor(id) {
    est.grupos[id] = proxima(corDe(est, id)); guardar();
    for (const k of SEGUEM) delete mostrado[k];
    pintar();
    return est.grupos[id];
  }
  // bolinha de cor na barra do modo Montar mesa (mesa-janelas.js chama ao criar a barra)
  function decorar(barra, id) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mj-cor';
    const atual = () => { const c = corDe(est, id); b.dataset.mv = c; b.setAttribute('aria-label', 'Cor do vínculo: ' + NOME_COR[c] + '. Clique para trocar.'); b.title = 'Vínculo: ' + NOME_COR[c]; };
    atual();
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); trocarCor(id); atual(); });
    barra.insertBefore(b, barra.querySelector('.mj-nome'));
  }

  document.addEventListener('click', (e) => {
    const ch = e.target.closest('[data-mv-cheio]');
    if (ch) { const cor = corDe(est, 'grafico'), a = cor === 'nenhum' ? est.sim.ouro : est.sim[cor]; window.openAssetChart?.(a.s, a.n, [{ s: a.s, n: a.n }], null, 'mesa'); }
  });
  // notícias novas chegam sem redesenhar a Mesa
  setInterval(() => { if (rootAtual?.isConnected && !document.hidden) desenhar('grafico'); }, 60000);

  return { limpa, corDe, proxima, CORES, montar, pintar, clicou, decorar, trocarCor };
})();
