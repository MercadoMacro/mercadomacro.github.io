/* Janelas soltas da Mesa (11/11/2026). No modo "Montar mesa" cada bloco vira uma janela: arrasta pela barra do
   topo, redimensiona pelo canto e encaixa numa grade de 12 colunas (linhas de 8 px). As outras janelas sobem para
   ocupar os vazios, como nos painéis do OpenBB e do Koyfin. Pelo teclado: foco na barra, setas movem e
   Shift + setas redimensionam.
   Posições guardadas neste navegador (mm_mesa_janelas_v1, separado de trader_prefs_v1 para os Ajustes não
   sobrescreverem) e na conta (/api/conta/dados?k=mesa), valendo a mais nova. Sem posições salvas, a Mesa segue
   a grade de antes. Com menos de 900 px de largura as posições não valem: as janelas empilham na mesma ordem.
   Enquanto monta, a Mesa não redesenha (mesa.js consulta editando()); ao concluir, volta a atualizar. */
globalThis.MMDeskWindows = (() => {
  const COLS = 12, ROW = 8, GAP = 12, MIN_W = 2, MIN_H = 8, MAX_H = 240, MAX_Y = 2000;
  const KEY = 'mm_mesa_janelas_v1';
  const ID = /^[a-z0-9]{2,12}$/;
  const int = (n, a, b) => Math.min(b, Math.max(a, Math.round(Number(n) || 0)));

  /* ---------- parte pura (tests/mesa-janelas.test.mjs) ---------- */
  const colide = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function limpa(v) {
    const itens = {};
    const src = v && typeof v === 'object' && v.itens && typeof v.itens === 'object' ? v.itens : {};
    for (const [id, p] of Object.entries(src).slice(0, 30)) {
      if (!ID.test(id) || !p || typeof p !== 'object') continue;
      const w = int(p.w, MIN_W, COLS);
      itens[id] = { x: int(p.x, 0, COLS - w), y: int(p.y, 0, MAX_Y), w, h: int(p.h, MIN_H, MAX_H) };
    }
    return { v: 1, itens };
  }
  // compacta para cima: cada janela vai para a linha mais alta livre; a janela "fixa" (a que está sendo
  // arrastada) fica onde a pessoa pôs e as outras se ajeitam em volta
  function arruma(itens, fixo) {
    const fixos = new Set([].concat(fixo || []));
    const lista = Object.entries(limpa({ itens }).itens).map(([id, p]) => ({ id, ...p }));
    lista.sort((a, b) => (fixos.has(b.id) - fixos.has(a.id)) || a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
    const postos = [];
    for (const it of lista) {
      if (!fixos.has(it.id)) { let y = 0; while (y < MAX_Y && postos.some((p) => colide({ ...it, y }, p))) y++; it.y = y; }
      postos.push(it);
    }
    return Object.fromEntries(postos.map(({ id, ...p }) => [id, p]));
  }
  function mover(itens, id, dx, dy) {
    const p = itens[id]; if (!p) return itens;
    return arruma({ ...itens, [id]: { ...p, x: int(p.x + dx, 0, COLS - p.w), y: int(p.y + dy, 0, MAX_Y) } }, id);
  }
  function redimensionar(itens, id, dw, dh) {
    const p = itens[id]; if (!p) return itens;
    const w = int(p.w + dw, MIN_W, COLS - p.x);
    return arruma({ ...itens, [id]: { ...p, w, h: int(p.h + dh, MIN_H, MAX_H) } }, id);
  }
  // ordem de leitura (para o celular e para quem usa leitor de tela)
  const ordem = (itens) => Object.entries(itens).sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id]) => id);

  if (typeof document === 'undefined') return { COLS, ROW, GAP, limpa, arruma, mover, redimensionar, ordem, colide };

  /* ---------- navegador ---------- */
  // Mesa 1 = a de sempre (padrão); Mesa 2 = a nova, com o gráfico vinculado por cor (11/11/2026).
  // Cada mesa tem a própria organização: neste navegador e na conta (k=mesa1 para a 1, k=mesa para a 2).
  const MODO_KEY = 'mm_mesa_modo_v1';
  const LOJA = { '1': { key: 'mm_mesa_janelas_m1_v1', k: 'mesa1' }, '2': { key: KEY, k: 'mesa' } };
  const lerLocal = (m) => { try { const j = JSON.parse(localStorage.getItem(LOJA[m].key) || 'null'); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } };
  let modo = (() => { try { return localStorage.getItem(MODO_KEY) === '2' ? '2' : '1'; } catch (e) { return '1'; } })();
  const estados = { '1': lerLocal('1'), '2': lerLocal('2') };
  let est = estados[modo];
  let editando = false, conta = null, timer = null, arraste = null, rootAtual = null;
  const carregou = { '1': false, '2': false };
  const salvas = () => { const l = limpa(est.dados).itens; return Object.keys(l).length ? l : null; };
  const guardar = (m = modo) => { try { localStorage.setItem(LOJA[m].key, JSON.stringify(estados[m])); } catch (e) { /* sem espaço */ } };
  const estreito = () => innerWidth < 900;
  const nomes = () => Object.fromEntries((globalThis.MMDeskLayout?.blocks || []).map(([id, n]) => [id, n]));

  async function carregar(m = modo) {
    if (carregou[m]) return; carregou[m] = true;
    try {
      const r = await fetch('/api/conta/dados?k=' + LOJA[m].k, { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!Number.isSafeInteger(j.usuario)) return;
      conta = j.usuario;
      let e = estados[m];
      if (e.conta && e.conta !== conta) e = estados[m] = {}; // outra conta já usou este navegador
      if (j.v && (j.ts || 0) > (e.ts || 0)) {
        estados[m] = { conta, ts: j.ts, dados: limpa(j.v) }; guardar(m);
        if (m === modo) { est = estados[m]; if (!editando) dispatchEvent(new Event('mesa-layout-changed')); }
      } else if (e.dados && (e.ts || 0) > (j.ts || 0)) { e.conta = conta; enviar(false, m); }
    } catch (e) { /* fora da conta: fica só neste navegador */ }
  }
  function agendar() { const m = modo; est.ts = Date.now(); est.conta = conta || est.conta; guardar(m); clearTimeout(timer); timer = setTimeout(() => enviar(false, m), 1500); }
  async function enviar(denovo, m = modo) {
    if (!conta) return;
    const e = estados[m];
    const ts = Math.max(Date.now(), (e.ts || 0) + 1);
    try {
      const r = await fetch('/api/conta/dados', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: conta, k: LOJA[m].k, v: limpa(e.dados), ts }) });
      if (r.ok) { e.ts = ts; guardar(m); return; }
      if (r.status === 409 && !denovo) { carregou[m] = false; await carregar(m); }
    } catch (err) { /* tenta na próxima mudança */ }
  }

  // posição atual de cada bloco na grade de antes, convertida para colunas e linhas
  function medir(layout, blocos) {
    const L = layout.getBoundingClientRect(), passo = (L.width - GAP * (COLS - 1)) / COLS + GAP, out = {};
    for (const b of blocos) {
      const r = b.getBoundingClientRect();
      const w = int((r.width + GAP) / passo, MIN_W, COLS);
      out[b.dataset.mesaBlock] = { x: int((r.left - L.left) / passo, 0, COLS - w), y: int((r.top - L.top) / ROW, 0, MAX_Y), w, h: int(Math.ceil((r.height + GAP) / ROW), MIN_H, MAX_H) };
    }
    return out;
  }
  function medirOriginal(root) {
    const grid = root.querySelector('.ms-grid'); if (!grid) return null;
    const G = grid.getBoundingClientRect(), passo = (G.width - GAP * (COLS - 1)) / COLS + GAP;
    const els = [['crypto', root.querySelector('.ms-crypto')], ['cards', root.querySelector('.ms-cards')],
      ...[...root.querySelectorAll('.ms-vbox[data-v]')].map((n) => [n.dataset.v, n]),
      ...[...root.querySelectorAll('.ms-tb[data-tb]')].map((n) => [n.dataset.tb, n]),
      ['curve', root.querySelector('.ms-curvebox')], ['news', root.querySelector('.ms-newsbox')]].filter(([, n]) => n && n.offsetParent);
    if (!els.length) return null;
    const topo = Math.min(...els.map(([, n]) => n.getBoundingClientRect().top)), out = {};
    for (const [id, n] of els) {
      const r = n.getBoundingClientRect();
      // dentro da grade de 4 colunas a posição vem da coluna (1 coluna = 3 da grade nova), sem arredondar pixels
      const col = n.closest('.ms-grid > .ms-col'), cols = col ? [...grid.children].filter((c) => c.classList.contains('ms-col')) : [];
      const i = col ? cols.indexOf(col) : -1, larg = cols.length ? Math.floor(COLS / cols.length) : COLS;
      const w = i >= 0 ? larg : int((r.width + GAP) / passo, MIN_W, COLS), x = i >= 0 ? i * larg : int((r.left - G.left) / passo, 0, COLS - w);
      out[id] = { x, y: int((r.top - topo) / ROW, 0, MAX_Y), w, h: int(Math.ceil((r.height + GAP) / ROW), MIN_H, MAX_H) };
    }
    return out;
  }
  function pintar(layout, itens) {
    for (const b of layout.children) {
      const p = itens[b.dataset.mesaBlock]; if (!p) continue;
      b.style.gridColumn = `${p.x + 1} / span ${p.w}`;
      b.style.gridRow = `${p.y + 1} / span ${p.h}`;
    }
    const seq = ordem(itens);
    for (const b of layout.children) { const i = seq.indexOf(b.dataset.mesaBlock); if (i >= 0) b.style.order = String(i); }
  }

  function aplicar(root) {
    rootAtual = root;
    carregar();
    // sem organização própria, a Mesa está na grade de sempre (4 colunas com as tabelas empilhadas): mede ali, antes
    // de converter, para o modo montar começar exatamente do que está na tela (antes a conversão embaralhava tudo)
    let antes = null;
    if (editando && !root.querySelector('.ms-custom-layout')) { antes = medirOriginal(root); globalThis.MMDeskLayout?.apply(root, {}); }
    const layout = root.querySelector('.ms-custom-layout'); if (!layout) return;
    rotulos();
    const blocos = [...layout.children].filter((n) => n.dataset.mesaBlock && !n.hidden);
    let itens = salvas();
    if (!itens && !editando) return;
    const faltam = blocos.filter((b) => !itens || !itens[b.dataset.mesaBlock]);
    if (faltam.length) {
      const med = antes ? { ...medir(layout, blocos), ...antes } : medir(layout, blocos);
      if (!itens) itens = med;
      else {
        // janela nova entra onde a grade de antes a punha (as do vínculo ficam logo abaixo dos Destaques) e empurra as outras
        const cards = itens.cards, novas = faltam.map((b) => b.dataset.mesaBlock);
        const VINC = { grafico: [0, 6, 50] }; // coluna, largura e altura iniciais
        for (const id of novas) { const m = med[id], v = VINC[id]; itens[id] = v ? { x: v[0], w: v[1], h: v[2], y: cards ? cards.y + cards.h : m.y } : m; }
        itens = arruma(itens, novas);
      }
      itens = arruma(itens, faltam.length ? faltam.map((b) => b.dataset.mesaBlock) : null);
      if (editando) est.dados = { v: 1, itens: { ...(salvas() || {}), ...itens } };
    }
    // só as janelas visíveis entram na grade; a posição das ocultas fica guardada
    const vis = Object.fromEntries(blocos.map((b) => [b.dataset.mesaBlock, itens[b.dataset.mesaBlock]]).filter(([, p]) => p));
    layout.classList.add('ms-janelas');
    layout.classList.toggle('mj-editando', editando);
    pintar(layout, estreito() ? {} : arruma(vis, null));
    if (estreito()) { const seq = ordem(vis); for (const b of blocos) b.style.order = String(seq.indexOf(b.dataset.mesaBlock)); }
    if (editando) { moldura(layout, blocos); ligarGrade(layout, blocos); }
  }

  /* ---------- arrastar e redimensionar: GridStack.js (MIT, gridstackjs.com), só no modo Montar mesa ----------
     O motor próprio de antes recalculava a grade inteira a cada movimento do mouse (a tela pulava, e com zoom
     quebrava). O GridStack mostra onde a janela vai cair, anima as outras e lida com zoom e toque.
     Fora do modo montar a Mesa continua na grade CSS de sempre (pintar), com as mesmas posições. */
  const GS_URL = 'https://cdn.jsdelivr.net/npm/gridstack@14.1.0/dist/';
  let gsCarregando = null, grade = null;
  function carregarGS() {
    // a v14 expõe a própria classe em window.GridStack (versões antigas: window.GridStack.GridStack)
    const achar = () => (typeof globalThis.GridStack === 'function' ? globalThis.GridStack : globalThis.GridStack?.GridStack) || null;
    if (achar()) return Promise.resolve(achar());
    if (!gsCarregando) gsCarregando = new Promise((ok, erro) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = GS_URL + 'gridstack.min.css'; document.head.append(l);
      const s = document.createElement('script'); s.src = GS_URL + 'gridstack-all.js'; s.async = true;
      const t = setTimeout(() => erro(new Error('tempo')), 12000);
      s.onload = () => { clearTimeout(t); achar() ? ok(achar()) : erro(new Error('sem GridStack')); };
      s.onerror = () => { clearTimeout(t); erro(new Error('não carregou')); };
      document.head.append(s);
    }).catch((e) => { gsCarregando = null; console.warn('GridStack:', e.message, '(usando o arraste simples)'); return null; });
    return gsCarregando;
  }
  async function ligarGrade(layout, blocos) {
    const GS = await carregarGS();
    if (!GS || !editando || !layout.isConnected || grade) return; // sem a biblioteca, fica o arraste simples
    const it = salvas() || {};
    layout.classList.add('grid-stack', 'mj-gs');
    for (const b of blocos) {
      const id = b.dataset.mesaBlock, p = it[id]; if (!p) continue;
      const item = document.createElement('div'), cont = document.createElement('div');
      item.className = 'grid-stack-item'; cont.className = 'grid-stack-item-content';
      Object.entries({ 'gs-id': id, 'gs-x': p.x, 'gs-y': p.y, 'gs-w': p.w, 'gs-h': p.h, 'gs-min-w': MIN_W, 'gs-min-h': MIN_H, 'gs-max-h': MAX_H }).forEach(([k, v]) => item.setAttribute(k, String(v)));
      b.style.gridColumn = b.style.gridRow = b.style.order = '';
      b.before(item); cont.append(b); item.append(cont);
    }
    grade = GS.init({
      column: COLS, cellHeight: ROW, marginTop: 0, marginBottom: GAP, marginLeft: GAP / 2, marginRight: GAP / 2,
      float: false, animate: true, handle: '.mj-barra', resizable: { handles: 'e,se,s,sw,w', autoHide: false },
    }, layout);
    grade.on('change dragstop resizestop', () => ler(layout));
    ler(layout);
  }
  function ler(layout) {
    if (!grade) return;
    const out = { ...(salvas() || {}) };
    for (const n of grade.engine.nodes) if (n.id) out[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
    est.dados = { v: 1, itens: limpa({ itens: out }).itens };
    tamanhos(layout); agendar();
  }
  function desligarGrade() {
    if (!grade) return;
    ler(grade.el);
    try { grade.destroy(false); } catch (e) { /* a Mesa vai redesenhar do zero */ }
    grade = null;
  }

  function moldura(layout, blocos) {
    const N = nomes();
    for (const b of blocos) {
      if (b.querySelector(':scope > .mj-barra')) continue;
      const id = b.dataset.mesaBlock, nome = N[id] || id;
      const barra = document.createElement('div');
      barra.className = 'mj-barra'; barra.tabIndex = 0; barra.setAttribute('role', 'button');
      barra.setAttribute('aria-label', `Mover ${nome}. Setas movem; Shift e setas mudam o tamanho.`);
      barra.innerHTML = '<span class="mj-grip" aria-hidden="true">⠿</span><span class="mj-nome"></span><span class="mj-tam" aria-hidden="true"></span>';
      barra.querySelector('.mj-nome').textContent = nome;
      const canto = document.createElement('div');
      canto.className = 'mj-canto'; canto.setAttribute('aria-hidden', 'true');
      b.append(barra, canto);
      // bolinha da cor do vínculo (mesa-vinculo.js); curva e notícias gerais não têm ativo para vincular
      if (!['curve', 'news'].includes(id)) globalThis.MMDeskLink?.decorar(barra, id);
      barra.addEventListener('pointerdown', (e) => iniciar(e, layout, id, 'mover'));
      canto.addEventListener('pointerdown', (e) => iniciar(e, layout, id, 'tamanho'));
      barra.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        const item = b.closest('.grid-stack-item');
        if (grade && item?.gridstackNode) {
          const n = item.gridstackNode;
          grade.update(item, e.shiftKey ? { w: Math.max(MIN_W, Math.min(COLS - n.x, n.w + d[0])), h: Math.max(MIN_H, n.h + d[1] * 4) } : { x: Math.max(0, Math.min(COLS - n.w, n.x + d[0])), y: Math.max(0, n.y + d[1] * 4) });
          ler(layout); return;
        }
        const it = salvas() || {};
        const novo = e.shiftKey ? redimensionar(it, id, d[0], d[1] * 4) : mover(it, id, d[0], d[1] * 4);
        est.dados = { v: 1, itens: arruma(novo, null) }; pintar(layout, est.dados.itens); tamanhos(layout); agendar();
      });
    }
    tamanhos(layout);
  }
  function tamanhos(layout) {
    const it = salvas() || {};
    layout.querySelectorAll('[data-mesa-block] > .mj-barra .mj-tam').forEach((t) => {
      const p = it[t.closest('[data-mesa-block]').dataset.mesaBlock]; t.textContent = p ? `${p.w} col` : '';
    });
  }
  function iniciar(e, layout, id, modo) {
    if (grade || e.button !== 0 || estreito()) return;
    e.preventDefault();
    const L = layout.getBoundingClientRect();
    arraste = { layout, id, modo, x0: e.clientX, y0: e.clientY, base: { ...(salvas() || {}) }, passo: (L.width - GAP * (COLS - 1)) / COLS + GAP };
    layout.querySelector(`:scope > [data-mesa-block="${id}"]`)?.classList.add('mj-ativa');
    e.target.setPointerCapture?.(e.pointerId);
  }
  addEventListener('pointermove', (e) => {
    if (!arraste) return;
    const dx = Math.round((e.clientX - arraste.x0) / arraste.passo), dy = Math.round((e.clientY - arraste.y0) / ROW);
    const novo = arraste.modo === 'mover' ? mover(arraste.base, arraste.id, dx, dy) : redimensionar(arraste.base, arraste.id, dx, dy);
    est.dados = { v: 1, itens: novo }; pintar(arraste.layout, novo); tamanhos(arraste.layout);
  });
  const soltar = () => {
    if (!arraste) return;
    const { layout, id } = arraste; arraste = null;
    est.dados = { v: 1, itens: arruma(salvas() || {}, null) };
    pintar(layout, est.dados.itens);
    layout.querySelector(`:scope > [data-mesa-block="${id}"]`)?.classList.remove('mj-ativa');
    agendar();
  };
  addEventListener('pointerup', soltar);
  addEventListener('pointercancel', soltar);

  // os botões existem em dois lugares: na barra da Mesa (celular/sem a faixa) e na faixa de frases do topo (computador)
  function rotulos() {
    document.querySelectorAll('[data-mj-montar]').forEach((b) => { b.textContent = editando ? 'Concluir' : 'Montar mesa'; b.classList.toggle('on', editando); });
    document.querySelectorAll('[data-mj-restaurar]').forEach((b) => { b.hidden = !editando; });
    document.querySelectorAll('[data-mj-modo]').forEach((b) => { const on = b.dataset.mjModo === modo; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function trocarModo(m) {
    if (m !== '1' && m !== '2') return;
    if (editando) { desligarGrade(); editando = false; rootAtual?.querySelectorAll('.mj-barra, .mj-canto').forEach((n) => n.remove()); if (salvas()) agendar(); }
    modo = m; est = estados[m]; try { localStorage.setItem(MODO_KEY, m); } catch (e) { /* sem espaço */ }
    rotulos();
    dispatchEvent(new Event('mesa-layout-changed'));
  }
  // no computador a barra da Mesa fica escondida e a faixa de frases ocupa o topo (como a Temperatura do mercado,
  // temperatura.js): os botões vão na ponta direita dela, só com a Mesa aberta e em tela larga
  function botoesNaFaixa() {
    const qb = document.querySelector('.qbanner');
    if (!qb) return;
    let g = qb.querySelector('.qb-mj');
    if (!g) {
      g = document.createElement('span'); g.className = 'qb-mj';
      g.innerHTML = '<button type="button" class="qb-mj-b qb-mj-n" data-mj-modo="1" title="Mesa 1: a de sempre" aria-label="Mesa 1, a de sempre">1</button><button type="button" class="qb-mj-b qb-mj-n" data-mj-modo="2" title="Mesa 2: a nova, com o gráfico vinculado por cor" aria-label="Mesa 2, a nova">2</button><button type="button" class="qb-mj-b" data-mj-restaurar hidden title="Volta as janelas para a organização padrão">Restaurar</button><button type="button" class="qb-mj-b" data-mj-montar title="Arrastar e redimensionar as janelas da Mesa">Montar mesa</button>';
      const temp = qb.querySelector('.qb-temp');
      if (temp) temp.after(g); else qb.append(g);
      rotulos();
    } else if (qb.querySelector('.qb-temp') && g.previousElementSibling !== qb.querySelector('.qb-temp')) qb.querySelector('.qb-temp').after(g);
    g.hidden = !document.getElementById('mesa-panel')?.classList.contains('active') || estreito();
  }
  setInterval(botoesNaFaixa, 1500);
  setTimeout(botoesNaFaixa, 300);
  const css = document.createElement('style');
  css.textContent = '.qb-mj{flex:0 0 auto;display:inline-flex;gap:6px;margin-left:6px}.qb-mj[hidden]{display:none}.qbanner .qb-temp+.qb-mj{margin-left:6px}.qbanner>.qb-mj:not(.qb-temp+.qb-mj){margin-left:auto}'
    + '.qb-mj-b{font:inherit;font-size:11.5px;color:var(--text-2);background:none;border:1px solid var(--line);border-radius:999px;padding:2px 10px;cursor:pointer;white-space:nowrap}'
    + '.qb-mj-b:hover{color:var(--text);border-color:var(--line-2)}.qb-mj-b[hidden]{display:none}.qb-mj-b.on{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}'
    + '.qb-mj-n{width:24px;height:24px;padding:0;display:inline-grid;place-items:center;font-weight:600;font-variant-numeric:tabular-nums}';
  document.head.append(css);

  function alternar() {
    if (estreito()) return;
    editando = !editando;
    rotulos();
    if (editando) { if (rootAtual) aplicar(rootAtual); }
    else {
      desligarGrade();
      rootAtual?.querySelectorAll('.mj-barra, .mj-canto').forEach((n) => n.remove());
      if (salvas()) agendar();
      dispatchEvent(new Event('mesa-layout-changed')); // volta a atualizar as cotações
    }
  }
  function restaurar() {
    if (grade) { try { grade.destroy(false); } catch (e) { /* redesenha */ } grade = null; }
    est = estados[modo] = { conta: est.conta, ts: Date.now(), dados: { v: 1, itens: {} } }; guardar(); enviar();
    editando = false; rotulos();
    dispatchEvent(new Event('mesa-layout-changed'));
  }
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mj-modo]');
    if (m) trocarModo(m.dataset.mjModo);
    else if (e.target.closest('[data-mj-montar]')) alternar();
    else if (e.target.closest('[data-mj-restaurar]')) restaurar();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && editando && !arraste && document.getElementById('mesa-panel')?.classList.contains('active')) alternar(); });

  return { COLS, ROW, GAP, limpa, arruma, mover, redimensionar, ordem, colide, aplicar, restaurar, editando: () => editando, temPosicoes: () => !!salvas(), modo: () => modo, trocarModo };
})();
