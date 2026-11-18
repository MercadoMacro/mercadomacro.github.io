/* =========================================================
   CONGELAR A MESA (18/11/2026, pedido do Dante)
   Botão "Congelar" na barra da Mesa, ao lado da Temperatura do mercado: para apresentar a alguém sem os números
   mudarem. Mostra uma cópia parada da Mesa e da faixa de cotações do topo, com o selo "Congelado às HH:MM";
   por trás, a Mesa de verdade continua atualizando escondida, então ao descongelar já volta com os preços de agora.
   Enquanto congelada, clicar num ativo não abre nada (para não misturar dado ao vivo com a foto).
   Não fica guardado: ao recarregar a página, volta ao vivo.
   Para desfazer: tirar o <script> congelar.js do index.html e o botão data-mm-congelar do mesa.js.
   ========================================================= */
(function congelarMesa() {
  'use strict';
  let estado = null; // { vivo, copia, tkVivo, tkCopia, hora }

  const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  // copia o elemento com os gráficos (canvas não vem na cópia) e a posição de rolagem de cada parte
  function copiar(el) {
    const c = el.cloneNode(true);
    const a = [el, ...el.querySelectorAll('*')], b = [c, ...c.querySelectorAll('*')];
    a.forEach((o, i) => {
      const d = b[i]; if (!d) return;
      if (o.tagName === 'CANVAS') { try { d.width = o.width; d.height = o.height; d.getContext('2d').drawImage(o, 0, 0); } catch (e) { /* sem desenho */ } }
      if (o.scrollTop || o.scrollLeft) d.dataset.mmCgRolar = o.scrollTop + ',' + o.scrollLeft;
      // sem ids repetidos: as atualizações procuram por id e não podem cair na cópia
      if (d !== c && d.id) d.removeAttribute('id');
      d.removeAttribute('tabindex');
    });
    return c;
  }
  const rolar = (c) => c.querySelectorAll('[data-mm-cg-rolar]').forEach((d) => { const [t, l] = d.dataset.mmCgRolar.split(','); d.scrollTop = +t; d.scrollLeft = +l; });

  // na cópia nenhum clique passa adiante, só o do botão Descongelar
  function travar(c) {
    ['click', 'dblclick', 'pointerdown', 'mousedown', 'keydown', 'contextmenu'].forEach((t) => c.addEventListener(t, (e) => {
      if (e.target.closest('[data-mm-congelar]')) return;
      e.stopPropagation(); e.preventDefault();
    }, true));
  }

  function congelar() {
    const vivo = document.getElementById('mesa-root');
    if (!vivo || estado) return;
    const h = hora();
    const copia = copiar(vivo);
    copia.classList.add('mm-congelada');
    const btn = copia.querySelector('[data-mm-congelar]');
    if (btn) {
      btn.classList.add('ativo'); btn.setAttribute('aria-pressed', 'true');
      btn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i> Descongelar';
      btn.title = 'Voltar às cotações ao vivo';
      btn.insertAdjacentHTML('beforebegin', `<span class="mm-cg-selo" role="status"><i class="fas fa-snowflake" aria-hidden="true"></i> Congelado às ${h}</span>`);
    }
    travar(copia);
    // a Mesa de verdade troca de id e fica escondida (o mesa.js guarda a referência e segue atualizando)
    vivo.id = 'mesa-root-vivo';
    vivo.hidden = true;
    vivo.after(copia);
    rolar(copia);

    // faixa de cotações do topo
    let tkVivo = document.getElementById('ticker'), tkCopia = null;
    if (tkVivo) {
      tkCopia = copiar(tkVivo);
      tkCopia.removeAttribute('id');
      tkCopia.classList.add('mm-congelada');
      tkCopia.title = `Cotações congeladas às ${h}`;
      travar(tkCopia);
      tkVivo.style.display = 'none';
      tkVivo.after(tkCopia);
      rolar(tkCopia);
    }
    document.documentElement.classList.add('mm-cg-on');
    estado = { vivo, copia, tkVivo, tkCopia, hora: h };
    pintarFaixa();
  }

  function descongelar() {
    if (!estado) return;
    const { vivo, copia, tkVivo, tkCopia } = estado;
    copia.remove();
    vivo.id = 'mesa-root';
    vivo.hidden = false;
    if (tkCopia) tkCopia.remove();
    if (tkVivo) tkVivo.style.display = '';
    document.documentElement.classList.remove('mm-cg-on');
    estado = null;
    pintarFaixa();
    // a Mesa estava escondida: as janelas e gráficos refazem o tamanho
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mm-congelar]'); if (!b) return;
    e.preventDefault();
    if (estado) descongelar(); else congelar();
  });
  // no computador a barra da Mesa fica escondida e os botões vão na faixa de frases do topo (como a Temperatura):
  // o Congelar entra logo antes da Temperatura, só com a Mesa aberta
  function pintarFaixa() {
    const b = document.querySelector('.qbanner .qb-cg'); if (!b) return;
    b.classList.toggle('ativo', !!estado);
    b.setAttribute('aria-pressed', estado ? 'true' : 'false');
    b.innerHTML = estado
      ? `<i class="fas fa-snowflake" aria-hidden="true"></i> Congelado às ${estado.hora} <span class="qb-cg-sep">·</span> <b>Descongelar</b>`
      : '<i class="fas fa-snowflake" aria-hidden="true"></i> <span class="qb-cg-t">Congelar</span>';
    b.title = estado ? 'Voltar às cotações ao vivo' : 'Para as cotações na tela para apresentar a alguém; por trás continuam atualizando';
  }
  function botaoNaFaixa() {
    const qb = document.querySelector('.qbanner'); if (!qb) return;
    const temp = qb.querySelector('.qb-temp');
    let b = qb.querySelector('.qb-cg');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'qb-cg'; b.setAttribute('data-mm-congelar', '');
      (temp ? temp.before(b) : qb.append(b));
      pintarFaixa();
    } else if (temp && b.nextElementSibling !== temp) temp.before(b);
    b.hidden = !document.getElementById('mesa-panel')?.classList.contains('active');
  }
  setInterval(botaoNaFaixa, 1000);
  botaoNaFaixa();

  // sair da aba Mesa não descongela: ao voltar continua parada até clicar em Descongelar
  window.MMCongelar = { congelar, descongelar, ativo: () => !!estado };

  const css = document.createElement('style');
  css.textContent = `
  .mm-cg-btn i { margin-right:5px; font-size:11px; }
  .mm-cg-btn.ativo { color:#0b1220; background:#7dd3fc; border-color:#7dd3fc; font-weight:600; }
  .mm-cg-btn.ativo:hover { color:#0b1220; filter:brightness(1.05); }
  .mm-cg-selo { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#7dd3fc; background:color-mix(in srgb, #7dd3fc 14%, transparent); border:1px solid color-mix(in srgb, #7dd3fc 45%, transparent); border-radius:8px; padding:6px 10px; }
  body.light .mm-cg-selo { color:#075985; }
  .mm-congelada [role="button"], .mm-congelada [data-sym], .mm-congelada .item, .mm-congelada a { cursor:default !important; }
  .qbanner .qb-cg { margin-left:auto; flex:0 0 auto; font:inherit; font-size:11.5px; color:var(--text-2); background:none; border:1px solid var(--line); border-radius:999px; padding:2px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
  .qbanner .qb-cg:hover { color:var(--text); border-color:var(--line-2); }
  .qbanner .qb-cg[hidden] { display:none; }
  .qbanner .qb-cg i { font-size:10.5px; }
  .qbanner .qb-cg + .qb-temp { margin-left:6px; }
  .qbanner .qb-cg.ativo { color:#0b1220; background:#7dd3fc; border-color:#7dd3fc; font-weight:600; }
  .qbanner .qb-cg.ativo b { font-weight:700; text-decoration:underline; text-underline-offset:2px; }
  .qbanner .qb-cg.ativo .qb-cg-sep { opacity:.6; }
  @media (max-width:640px) { .qbanner .qb-cg:not(.ativo) .qb-cg-t { display:none; } }
  .ticker.mm-congelada { box-shadow: inset 0 -2px 0 #7dd3fc; }
  `;
  document.head.append(css);
})();
