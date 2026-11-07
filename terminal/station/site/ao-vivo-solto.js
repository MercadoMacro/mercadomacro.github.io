/* =========================================================
   AO VIVO DESTACADO (07/11/2026, pedido do Severino)
   Botão "Destacar" no Ao Vivo da aba Notícias: o fluxo sai da aba e vira um quadro flutuante,
   que se arrasta pela barra de título, muda de tamanho pelo canto e continua aberto em qualquer aba.
   No quadro, "Nova janela" leva o mesmo fluxo para uma janela separada do navegador
   (no Chrome e no Edge ela fica sempre por cima das outras; nos demais é uma janela comum).
   Fechar o quadro ou a janela devolve o fluxo para a aba Notícias.
   Posição e tamanho ficam em localStorage mm_aovivo_solto_v1.
   Para desfazer: tirar o <script> e o <link> ao-vivo-solto do index.html.
   ========================================================= */
(function aoVivoSolto() {
  'use strict';
  const corpo = document.getElementById('live-corpo');
  const view = document.getElementById('live-view');
  const botao = document.getElementById('live-destacar');
  if (!corpo || !view || !botao) return;

  const KEY = 'mm_aovivo_solto_v1';
  const ler = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const gravar = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...ler(), ...o })); } catch { /* sem armazenamento */ } };

  const estado = { on: false, onde: '' };
  window.MMLiveSolto = estado;

  // aviso que fica no lugar do fluxo enquanto ele está destacado
  const aviso = document.createElement('div');
  aviso.className = 'lvs-aviso';
  aviso.hidden = true;
  aviso.innerHTML = '<span class="lvs-aviso-txt"></span><button type="button" class="btn-sm">Trazer de volta</button>';
  view.append(aviso);
  aviso.querySelector('button').addEventListener('click', () => encaixar());

  let quadro = null, janela = null, vigiaJanela = 0;

  const redesenhar = () => {
    try { renderLiveView(); } catch { /* app.js ainda carregando */ }
    try { newsLiveTick(); } catch { /* idem */ }
  };

  function marcar(onde) {
    estado.on = !!onde; estado.onde = onde;
    aviso.hidden = !onde;
    aviso.querySelector('.lvs-aviso-txt').textContent = onde === 'janela'
      ? 'O Ao Vivo está aberto numa janela separada.'
      : 'O Ao Vivo está destacado num quadro que você pode arrastar.';
    botao.hidden = !!onde;
    redesenhar();
  }

  /* ---------- quadro flutuante ---------- */
  function montarQuadro() {
    quadro = document.createElement('section');
    quadro.className = 'lvs-quadro';
    quadro.setAttribute('aria-label', 'Ao vivo destacado');
    quadro.innerHTML = `<header class="lvs-topo" title="Arraste para mover">
        <span class="live-indicator" aria-hidden="true"></span><b>Ao vivo</b>
        <span class="lvs-esp"></span>
        <button type="button" class="lvs-b" data-a="janela" title="Abrir numa janela separada" aria-label="Abrir numa janela separada"><i class="fas fa-window-restore" aria-hidden="true"></i></button>
        <button type="button" class="lvs-b" data-a="fechar" title="Devolver para a aba Notícias" aria-label="Devolver para a aba Notícias"><i class="fas fa-xmark" aria-hidden="true"></i></button>
      </header><div class="lvs-miolo"></div>`;
    quadro.hidden = true;
    document.body.append(quadro);
    quadro.querySelector('[data-a="fechar"]').addEventListener('click', () => encaixar());
    quadro.querySelector('[data-a="janela"]').addEventListener('click', () => abrirJanela());

    const topo = quadro.querySelector('.lvs-topo');
    topo.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const r = quadro.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      topo.setPointerCapture(e.pointerId);
      quadro.classList.add('arrastando');
      const mover = (ev) => por(ev.clientX - dx, ev.clientY - dy);
      const soltar = () => {
        topo.removeEventListener('pointermove', mover);
        topo.removeEventListener('pointerup', soltar);
        topo.removeEventListener('pointercancel', soltar);
        quadro.classList.remove('arrastando');
        gravar({ x: quadro.offsetLeft, y: quadro.offsetTop });
      };
      topo.addEventListener('pointermove', mover);
      topo.addEventListener('pointerup', soltar);
      topo.addEventListener('pointercancel', soltar);
      e.preventDefault();
    });

    // tamanho mudado pelo canto: guarda depois que para de mexer
    let t = 0;
    new ResizeObserver(() => {
      if (quadro.hidden) return;
      clearTimeout(t);
      t = setTimeout(() => gravar({ w: quadro.offsetWidth, h: quadro.offsetHeight }), 300);
    }).observe(quadro);
    addEventListener('resize', () => { if (!quadro.hidden) por(quadro.offsetLeft, quadro.offsetTop); });
  }

  // mantém pelo menos a barra de título dentro da tela
  function por(x, y) {
    const w = quadro.offsetWidth;
    x = Math.max(Math.min(0, 120 - w), Math.min(innerWidth - 120, x));
    y = Math.max(0, Math.min(innerHeight - 44, y));
    quadro.style.left = Math.round(x) + 'px';
    quadro.style.top = Math.round(y) + 'px';
  }

  function destacar() {
    if (!quadro) montarQuadro();
    const s = ler();
    const w = Math.min(Math.max(280, s.w || 400), innerWidth - 16);
    const h = Math.min(Math.max(220, s.h || 560), innerHeight - 16);
    quadro.style.width = w + 'px';
    quadro.style.height = h + 'px';
    quadro.querySelector('.lvs-miolo').append(corpo);
    quadro.hidden = false;
    por(Number.isFinite(s.x) ? s.x : innerWidth - w - 24, Number.isFinite(s.y) ? s.y : 96);
    marcar('quadro');
  }

  function encaixar() {
    fecharJanela();
    view.insertBefore(corpo, aviso);
    if (quadro) quadro.hidden = true;
    marcar('');
  }

  /* ---------- janela separada ---------- */
  function fecharJanela() {
    clearInterval(vigiaJanela);
    const j = janela; janela = null;
    if (j && !j.closed) { try { j.close(); } catch { /* já fechada */ } }
  }

  // copia as regras de estilo já carregadas pelo site (folha de outro domínio, como fontes e ícones, vai como link)
  function copiarAparencia(d) {
    d.title = 'Ao vivo · Mercado Macro';
    for (const folha of document.styleSheets) {
      try {
        const st = d.createElement('style');
        st.textContent = [...folha.cssRules].map((r) => r.cssText).join('\n');
        d.head.append(st);
      } catch {
        if (!folha.href) continue;
        const l = d.createElement('link'); l.rel = 'stylesheet'; l.href = folha.href; d.head.append(l);
      }
    }
    for (const a of document.documentElement.attributes) d.documentElement.setAttribute(a.name, a.value);
    d.body.className = [...document.body.classList].filter((c) => c === 'light' || c === 'nw2').join(' ');
    d.body.classList.add('lvs-janela');
  }

  async function abrirJanela() {
    const s = ler();
    const W = Math.round(Math.max(320, s.w || 420)), H = Math.round(Math.max(320, s.h || 640));
    let w = null, pip = false;
    if (window.documentPictureInPicture) {
      try { w = await window.documentPictureInPicture.requestWindow({ width: W, height: H }); pip = true; } catch { w = null; }
    }
    if (!w) {
      w = window.open('', 'mm-aovivo', `popup=yes,width=${W},height=${H}`);
      if (!w) { alert('O navegador bloqueou a janela. Libere as janelas pop-up para este site e tente de novo.'); return; }
      w.document.open();
      w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
      w.document.close();
    }
    const d = w.document;
    copiarAparencia(d);
    const topo = d.createElement('header');
    topo.className = 'lvs-jtopo';
    topo.innerHTML = '<span class="live-indicator" aria-hidden="true"></span><b>Ao vivo</b><span class="lvs-esp"></span><button type="button" class="btn-sm">Devolver ao site</button>';
    d.body.append(topo);
    d.body.append(corpo); // o fluxo muda de documento; quem desenha guarda a referência (liveEl no app.js)
    if (quadro) quadro.hidden = true;
    janela = w;
    marcar('janela');
    topo.querySelector('button').addEventListener('click', () => encaixar());
    // fechou a janela pelo X: o fluxo volta para a aba Notícias
    const voltou = () => { if (janela === w) { janela = null; clearInterval(vigiaJanela); view.insertBefore(corpo, aviso); marcar(''); } };
    w.addEventListener('pagehide', voltou);
    if (!pip) vigiaJanela = setInterval(() => { if (w.closed) voltou(); }, 1000);
  }

  botao.addEventListener('click', destacar);
  // ao sair do site, a janela separada fecha junto (ela depende desta página)
  addEventListener('pagehide', fecharJanela);
})();
