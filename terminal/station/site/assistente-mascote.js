/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino)
   v4 "robô vivo": a imagem 3D de grafite e ouro do Severino separada em três camadas
   (robo-cabeca.webp, robo-corpo.webp, robo-braco.webp, visor já sem olhos) e os olhos e o
   sorriso desenhados por cima, para poderem se mexer.
   Movimentos: respira e flutua; a cabeça balança e se inclina para o lado do mouse; os olhos
   seguem o mouse e, parado, ele olha em volta; pisca (às vezes duas vezes, às vezes uma
   piscadela); acena de tempos em tempos. Com o mouse em cima: olhos felizes (^ ^), sorriso
   maior, aceno sem parar e o balão "Assistente IA". O clique abre o painel como antes.
   No celular (aba na borda) o botão antigo continua; com "reduzir movimento" fica parado.
   Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  const V = '?v=1';
  // coordenadas no espaço das camadas (326 x 302)
  const PET = `<svg class="pet" viewBox="0 0 326 302" aria-hidden="true">
    <defs>
      <filter id="petLuz" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="petOlho" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffd86e"/><stop offset="1" stop-color="#f5b93c"/></linearGradient>
    </defs>
    <g class="pet-tudo">
      <image class="pet-corpo" href="robo-corpo.webp${V}" width="326" height="302"/>
      <g class="pet-braco"><image href="robo-braco.webp${V}" width="326" height="302"/></g>
      <g class="pet-cabeca">
        <image href="robo-cabeca.webp${V}" width="326" height="302"/>
        <g class="pet-rosto" filter="url(#petLuz)">
          <g class="pet-olhos">
            <g class="pet-olho po1">
              <rect class="aberto" x="107.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="url(#petOlho)"/>
              <path class="feliz" d="M105.5 110q10.7-13 21.5 0" fill="none" stroke="#ffd86e" stroke-width="5.5" stroke-linecap="round"/>
            </g>
            <g class="pet-olho po2">
              <rect class="aberto" x="199.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="url(#petOlho)"/>
              <path class="feliz" d="M197.5 110q10.7-13 21.5 0" fill="none" stroke="#ffd86e" stroke-width="5.5" stroke-linecap="round"/>
            </g>
          </g>
          <path class="pet-boca" d="M149 131q13.5 9 27 0" fill="none" stroke="#ffd86e" stroke-width="5" stroke-linecap="round"/>
        </g>
      </g>
    </g>
  </svg>`;

  const css = `
  @media (min-width:641px) {
    #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
    #ia-fab.ia-pet-on:hover { transform:none; }
    #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
    #ia-fab .ia-pet { display:block; position:relative; width:100px; height:100px; }
    #ia-fab .pet { position:absolute; left:0; top:0; width:100px; height:93px; overflow:visible; filter:drop-shadow(0 8px 14px rgba(0,0,0,.45)); }
    #ia-fab .ia-pet-sombra { position:absolute; left:24px; bottom:0; width:54px; height:6px; border-radius:50%; background:rgba(0,0,0,.4); filter:blur(2px); animation:pet-sombra 3.2s ease-in-out infinite; }
    #ia-fab .pet-tudo { animation:pet-flutua 3.2s ease-in-out infinite; }
    #ia-fab .pet-corpo { transform-box:view-box; transform-origin:163px 300px; animation:pet-respira 3.2s ease-in-out infinite; }
    #ia-fab .pet-cabeca { transform-box:view-box; transform-origin:163px 186px; transform:rotate(var(--hr,0deg)) translate(var(--hx,0px),0); transition:transform .5s cubic-bezier(.3,1.4,.5,1); }
    #ia-fab .pet-cabeca > image, #ia-fab .pet-rosto { animation:pet-balanca 6.4s ease-in-out infinite; transform-box:view-box; transform-origin:163px 186px; }
    #ia-fab .pet-braco { transform-box:view-box; transform-origin:62px 246px; }
    #ia-fab .pet-braco.acena { animation:pet-acena .55s ease-in-out 4; }
    #ia-fab:hover .pet-braco { animation:pet-acena .55s ease-in-out infinite; }
    #ia-fab .pet-olhos { transform:translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px)); transition:transform .18s ease-out; }
    #ia-fab .pet-olho { transform-box:fill-box; transform-origin:center; transition:transform .07s; }
    #ia-fab .pet-olho .feliz { opacity:0; }
    #ia-fab .ia-pet.pisca .pet-olho, #ia-fab .ia-pet.pisca1 .po2 { transform:scaleY(.08); }
    #ia-fab .ia-pet.pisca1 .po1 { transform:none; }
    #ia-fab .ia-pet.feliz .aberto, #ia-fab:hover .aberto { opacity:0; }
    #ia-fab .ia-pet.feliz .feliz, #ia-fab:hover .feliz { opacity:1; }
    #ia-fab .ia-pet.feliz .pet-olho, #ia-fab:hover .pet-olho { transform:none; }
    #ia-fab .pet-boca { transition:d .25s; }
    #ia-fab:hover .pet-boca, #ia-fab .ia-pet.feliz .pet-boca { d:path("M144 129q18.5 15 37 0"); }
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 2px); top:14px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
  }
  @media (max-width:640px) { #ia-fab .ia-pet { display:none; } }
  @media (prefers-reduced-motion: reduce) {
    #ia-fab .pet-tudo, #ia-fab .pet-corpo, #ia-fab .ia-pet-sombra, #ia-fab .pet-cabeca > image, #ia-fab .pet-rosto, #ia-fab .pet-braco { animation:none !important; }
    #ia-fab .pet-cabeca, #ia-fab .pet-olhos { transition:none; }
  }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.82); opacity:.65; } }
  @keyframes pet-respira { 0%,100% { transform:scale(1,1); } 50% { transform:scale(1.012,.985); } }
  @keyframes pet-balanca { 0%,100% { transform:rotate(0); } 25% { transform:rotate(-2.2deg); } 50% { transform:rotate(0); } 75% { transform:rotate(1.8deg); } }
  @keyframes pet-acena { 0%,100% { transform:rotate(0); } 30% { transform:rotate(-13deg); } 70% { transform:rotate(9deg); } }`;

  const parado = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sorte = (a, b) => a + Math.random() * (b - a);

  function ligar(b) {
    if (b.querySelector('.ia-pet')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const s = document.createElement('span');
    s.className = 'ia-pet';
    s.innerHTML = '<span class="ia-pet-fala">Assistente IA<small>Pergunte sobre o mercado</small></span><span class="ia-pet-sombra"></span>' + PET;
    b.prepend(s);
    b.classList.add('ia-pet-on');
    b.title = 'Assistente IA';
    const braco = s.querySelector('.pet-braco');
    const vivo = () => !parado() && !document.hidden && s.offsetParent !== null;

    // olhar: para o mouse, ou para um ponto ao acaso quando o mouse fica parado
    const olhar = (dx, dy) => {
      s.style.setProperty('--ex', (dx * 9).toFixed(2));
      s.style.setProperty('--ey', (dy * 6).toFixed(2));
      s.style.setProperty('--hr', (dx * 3.5).toFixed(2) + 'deg');
      s.style.setProperty('--hx', (dx * 2).toFixed(2) + 'px');
    };
    let ultimoMouse = 0, pend = false, mx = 0, my = 0;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY; ultimoMouse = Date.now();
      if (pend || parado()) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const r = s.getBoundingClientRect();
        if (!r.width) return;
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height * .35), d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 260);
        olhar(dx / d * k, dy / d * k);
      });
    }, { passive: true });
    (function passeia() {
      setTimeout(() => {
        if (vivo() && Date.now() - ultimoMouse > 2500 && !b.matches(':hover')) {
          const alvos = [[0, 0], [-1, 0], [1, 0], [-.7, -.6], [.7, -.6], [0, .5], [-.4, .3]];
          const [x, y] = alvos[Math.floor(Math.random() * alvos.length)];
          olhar(x, y);
        }
        passeia();
      }, sorte(1400, 3200));
    })();

    // piscar: normal, duplo ou piscadela
    const fecha = (cls, ms) => new Promise((ok) => { s.classList.add(cls); setTimeout(() => { s.classList.remove(cls); setTimeout(ok, 90); }, ms); });
    (function pisca() {
      setTimeout(async () => {
        if (vivo() && !b.matches(':hover')) {
          const t = Math.random();
          if (t < .15) await fecha('pisca1', 260);
          else { await fecha('pisca', 110); if (t > .75) await fecha('pisca', 110); }
        }
        pisca();
      }, sorte(2200, 5200));
    })();

    // aceno e "sorriso feliz" de tempos em tempos
    const acenar = () => { if (!vivo()) return; braco.classList.remove('acena'); void braco.getBoundingClientRect(); braco.classList.add('acena'); };
    braco.addEventListener('animationend', () => braco.classList.remove('acena'));
    let vez = 0;
    setInterval(() => {
      if (!vivo() || b.matches(':hover')) return;
      if (vez++ % 2 === 0) acenar();
      else { s.classList.add('feliz'); setTimeout(() => s.classList.remove('feliz'), 1600); }
    }, 7000);

    // ao aparecer: acena e o balão se apresenta por alguns segundos
    b.classList.add('ia-pet-oi'); setTimeout(() => b.classList.remove('ia-pet-oi'), 5000);
    setTimeout(acenar, 700);
  }

  // o botão é criado pelo assistente.js depois que a conta responde; espera ele aparecer
  const ja = document.getElementById('ia-fab');
  if (ja) ligar(ja);
  else {
    const ob = new MutationObserver(() => { const b = document.getElementById('ia-fab'); if (b) { ob.disconnect(); ligar(b); } });
    ob.observe(document.body, { childList: true });
  }
})();
