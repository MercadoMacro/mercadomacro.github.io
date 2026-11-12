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
  const SEGUEM = ['grafico', 'nativo', 'jade']; // janelas que seguem o ativo do grupo (Mesa 2, desenho Mesa Viva)
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
    const d = nos[id]; if (!d) return;
    if (id === 'nativo' || id === 'jade') return desenharOutra(id, d);
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
    const fx = body.querySelector('.mv-faixa');
    if (visivel(nos.nativo)) { if (fx) fx.hidden = true; } else { if (fx) fx.hidden = false; faixa(alvo, fx); }
  }
  const manchetes = (alvo, n) => {
    const termos = (window.MMRadar?.termos(alvo.s) || []).concat(alvo.n.split(' (')[0]).filter((x, i, a) => x && a.indexOf(x) === i);
    return (typeof newsAll !== 'undefined' && Array.isArray(newsAll) ? newsAll : [])
      .filter((x) => x && x.titulo && window.MMRadar?.cita(x.titulo, termos)).sort((a, b) => b.data - a.data).slice(0, n);
  };
  const hora = (ms) => { const d = new Date(ms), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  const fonteDe = (n) => (n.fonte === 'Google News' ? (n.veiculo || n.fonte) : n.fonte || '');
  // Notícias do ativo e Jade (Mesa 2). A Jade não chama a IA aqui: o texto sai da cotação e da manchete do terminal;
  // o Gemini só entra quando a pessoa clica numa pergunta.
  function desenharOutra(id, d) {
    const cor = corDe(est, id), alvo = cor === 'nenhum' ? est.sim.ouro : est.sim[cor];
    d.dataset.mv = cor;
    d.querySelector('.mv-t').textContent = (id === 'jade' ? 'Jade · ' : 'Notícias · ') + alvo.n;
    d.querySelector('.mv-cheio')?.remove();
    const body = d.querySelector('.mv-body');
    if (id === 'nativo') {
      const lista = manchetes(alvo, 6), chave = alvo.s + ':' + lista.map((n) => n.link).join('|');
      if (mostrado.nativo === chave) return; mostrado.nativo = chave;
      body.innerHTML = lista.length
        ? '<ul class="ms-news">' + lista.map((n) => `<li><a href="${esc(n.link || '#')}" target="_blank" rel="noopener"><span class="tt">${esc(n.titulo)}</span><span class="src">${esc(fonteDe(n))}</span><span class="hr">${hora(n.data)}</span></a></li>`).join('') + '</ul>'
        : `<p class="mv-vazio">Nenhuma manchete recente do terminal cita ${esc(alvo.n)}.</p>`;
      return;
    }
    const q = ctx?.quote?.(alvo.s), m = manchetes(alvo, 1)[0];
    const chave = alvo.s + ':' + (q ? q.v + '/' + q.c : '-') + ':' + (m ? m.link : '');
    if (mostrado.jade === chave) return; mostrado.jade = chave;
    const M = globalThis.MMMesa2, valor = q && M ? M.preco(alvo.s, q.v) : '—', varp = q && M ? M.pct(q.c) : '';
    const quando = q?.ts ? ' às ' + new Date(q.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
    const mov = !q || q.c == null ? '' : q.c > 0 ? 'sobe' : q.c < 0 ? 'cai' : 'fica estável';
    const frase = q ? `${esc(alvo.n)} ${mov} ${esc(varp)}, a ${esc(valor)}${esc(quando)}.` : `Sem cotação de ${esc(alvo.n)} agora.`;
    const contexto = m ? ` Manchete mais recente: <a href="${esc(m.link || '#')}" target="_blank" rel="noopener">${esc(m.titulo)}</a> <span class="mv-src">(${esc(fonteDe(m))}, ${hora(m.data)})</span>.` : ' Nenhuma manchete do terminal cita o ativo agora.';
    const nome = esc(alvo.n);
    body.innerHTML = `<div class="mv-jade"><span class="mv-jade-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M9 12v1.5M15 12v1.5M12 3v4"/></svg></span>
      <div><p class="mv-jade-t">${frase}${contexto}</p>
      <div class="mv-perg"><button type="button" class="mv-chip" data-mv-pergunta="Por que ${nome} se mexeu hoje? Use as manchetes de agora.">Por que mexeu hoje?</button>
      <button type="button" class="mv-chip" data-mv-pergunta="O que saiu nas notícias sobre ${nome} na última semana?">O que saiu na semana</button>
      <button type="button" class="mv-chip" data-mv-pergunta="Explique de forma simples o que é ${nome} e o que costuma mexer com ele.">O que é e o que mexe</button></div>
      <p class="mv-nota">Texto montado com a cotação e as manchetes do terminal. A Jade só responde quando você clica numa pergunta.</p></div></div>`;
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
    const p = e.target.closest('[data-mv-pergunta]');
    if (p) { window.MMAssistente?.perguntarTexto ? window.MMAssistente.perguntarTexto(p.dataset.mvPergunta) : window.MMAssistente?.abrir?.(); return; }
    const ch = e.target.closest('[data-mv-cheio]');
    if (ch) { const cor = corDe(est, 'grafico'), a = cor === 'nenhum' ? est.sim.ouro : est.sim[cor]; window.openAssetChart?.(a.s, a.n, [{ s: a.s, n: a.n }], null, 'mesa'); }
  });
  // notícias novas chegam sem redesenhar a Mesa
  setInterval(() => { if (rootAtual?.isConnected && !document.hidden) SEGUEM.forEach(desenhar); }, 60000);

  return { limpa, corDe, proxima, CORES, montar, pintar, clicou, decorar, trocarCor };
})();
