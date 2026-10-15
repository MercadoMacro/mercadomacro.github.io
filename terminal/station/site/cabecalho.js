/* Cabeçalho em duas faixas (computador, a partir de 1101 px):
   1) logo, frase (com botão "Nova frase") e, à direita, Ao vivo, busca e ajustes;
   2) uma barra só: relógio de Brasília, data e B3/NYSE à esquerda, cotações correndo no meio, atualizar à direita.
   Os elementos são só mudados de lugar (mesmos ids); abaixo de 1101 px voltam para onde estavam. */
(() => {
  const mq = window.matchMedia('(min-width: 1101px)');
  const $ = (s) => document.querySelector(s);
  const ticker = $('#ticker'), right = $('.topbar-right');
  if (!ticker || !right) return;

  // bloco fixo à esquerda da barra
  const st = document.createElement('div');
  st.className = 'tk-status';
  st.innerHTML = '<span class="tks-dot" aria-hidden="true"></span><span class="tks-clock" id="tks-clock" title="Horário de Brasília"></span><span class="tks-sep">·</span>';
  const relogio = () => {
    const el = $('#tks-clock');
    if (el) el.textContent = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  // muda de lugar e lembra a origem (um marcador vazio) para poder voltar
  const marcas = new Map();
  const mover = (el, onde) => {
    if (!el) return;
    if (!marcas.has(el)) { const m = document.createComment('cab'); el.before(m); marcas.set(el, m); }
    onde(el);
  };
  const voltar = () => marcas.forEach((m, el) => m.after(el));

  let timer = null;
  function aplicar() {
    const on = mq.matches;
    document.body.classList.toggle('hdr2', on);
    if (on) {
      ticker.prepend(st);
      mover($('#current-date'), (el) => st.append(el));
      mover($('#market-status'), (el) => st.append(el));
      mover($('#live-toggle'), (el) => right.prepend(el));
      relogio();
      clearInterval(timer);
      timer = setInterval(() => { if (!document.hidden) relogio(); }, 1000);
    } else {
      clearInterval(timer);
      voltar();
      st.remove();
    }
  }
  aplicar();
  mq.addEventListener?.('change', aplicar);

  // frase: botão "Nova frase" sempre visível (a faixa é criada depois, pelo extras.js)
  const poeBotao = () => {
    const qb = $('.qbanner');
    if (!qb || qb.querySelector('.qb-new')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qb-new';
    b.title = 'Mostrar outra frase';
    b.innerHTML = '<i class="fas fa-sync-alt" aria-hidden="true"></i><span>Nova frase</span>';
    b.addEventListener('click', () => qb.querySelector('[data-q="next"]')?.click());
    qb.querySelector('[data-q="off"]')?.before(b);
  };
  new MutationObserver(poeBotao).observe($('.topbar'), { childList: true });
  poeBotao();
})();
