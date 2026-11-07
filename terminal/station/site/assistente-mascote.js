/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino)
   v4 "robô vivo": a imagem 3D de grafite e ouro do Severino separada em três camadas
   (robo-cabeca.webp, robo-corpo.webp, robo-braco.webp, visor já sem olhos) e os olhos e o
   sorriso desenhados por cima, para poderem se mexer.
   v5 "telas no visor": de tempos em tempos o visor vira uma telinha:
   - cotação de verdade (Ibovespa, S&P 500, Nasdaq, Dólar) com a variação e o minigráfico do dia,
     lidos do que o terminal já carregou (yahooMemo do app.js; nada de rede a mais). Sem dado, não
     mostra. O balão diz o ativo, a variação e a hora do dado. Subiu: ele balança a cabeça
     concordando e sorri; caiu: faz cara preocupada e balança a cabeça.
   - olhos de cifrão ($ $), e um gráfico subindo (desenho, sem números).
   Mais "humano": segue o mouse com os olhos e a cabeça, olha em volta, pisca/piscadela, acena,
   respira; leva um susto quando o mouse chega; parado muito tempo, cochila (z z) e acorda
   assustado quando o mouse mexe. Tudo em SVG/CSS, pausa com a aba escondida.
   No celular (aba na borda) o botão antigo continua; com "reduzir movimento" fica parado.
   Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  const V = '?v=1';
  const ATIVOS = [['^BVSP', 'IBOV', 'Ibovespa'], ['^GSPC', 'S&P 500', 'S&P 500'], ['^IXIC', 'NASDAQ', 'Nasdaq'], ['BRL=X', 'DÓLAR', 'Dólar']];
  // coordenadas no espaço das camadas (326 x 302); visor interno ~ x 78-248, y 54-162
  const PET = `<svg class="pet" viewBox="0 0 326 302" aria-hidden="true">
    <defs>
      <filter id="petLuz" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="petOlho" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffd86e"/><stop offset="1" stop-color="#f5b93c"/></linearGradient>
      <clipPath id="petVisor"><rect x="80" y="56" width="166" height="104" rx="32"/></clipPath>
    </defs>
    <g class="pet-tudo">
      <image class="pet-corpo" href="robo-corpo.webp${V}" width="326" height="302"/>
      <g class="pet-braco"><image href="robo-braco.webp${V}" width="326" height="302"/></g>
      <g class="pet-cabeca"><g class="pet-cabeca-in">
        <image href="robo-cabeca.webp${V}" width="326" height="302"/>
        <g class="pet-rosto" filter="url(#petLuz)" clip-path="url(#petVisor)">
          <g class="pet-face">
            <g class="pet-olhos">
              <g class="pet-olho po1">
                <rect class="aberto" x="107.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="url(#petOlho)"/>
                <path class="feliz" d="M105.5 110q10.7-13 21.5 0" fill="none" stroke="#ffd86e" stroke-width="5.5" stroke-linecap="round"/>
                <text class="cifrao" x="116.2" y="121" text-anchor="middle">$</text>
              </g>
              <g class="pet-olho po2">
                <rect class="aberto" x="199.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="url(#petOlho)"/>
                <path class="feliz" d="M197.5 110q10.7-13 21.5 0" fill="none" stroke="#ffd86e" stroke-width="5.5" stroke-linecap="round"/>
                <text class="cifrao" x="208.2" y="121" text-anchor="middle">$</text>
              </g>
            </g>
            <path class="pet-boca" d="M149 131q13.5 9 27 0" fill="none" stroke="#ffd86e" stroke-width="5" stroke-linecap="round"/>
            <g class="pet-pensa" fill="#ffd86e"><circle cx="150" cy="135" r="3.6"/><circle cx="163" cy="135" r="3.6"/><circle cx="176" cy="135" r="3.6"/></g>
          </g>
          <g class="pet-tela pet-cot">
            <text class="cot-nome" x="163" y="83" text-anchor="middle"></text>
            <text class="cot-var" x="163" y="114" text-anchor="middle"></text>
            <path class="cot-linha" d="" fill="none" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
          </g>
          <g class="pet-tela pet-graf" fill="none" stroke="#ffd86e" stroke-linecap="round" stroke-linejoin="round">
            <path class="graf-eixo" d="M96 148H232" stroke-width="2" opacity=".45"/>
            <path class="graf-linha" d="M100 140L124 126L144 133L170 108L192 116L222 80" stroke-width="5"/>
            <path class="graf-seta" d="M207 80H222V95" stroke-width="5"/>
          </g>
        </g>
        <g class="pet-zz" fill="#ffd86e"><text x="236" y="58">z</text><text x="250" y="40">z</text></g>
      </g></g>
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
    #ia-fab .pet-cabeca-in { transform-box:view-box; transform-origin:163px 186px; animation:pet-balanca 6.4s ease-in-out infinite; }
    #ia-fab .ia-pet.concorda .pet-cabeca-in { animation:pet-sim .5s ease-in-out 3; }
    #ia-fab .ia-pet.nega .pet-cabeca-in { animation:pet-nao .5s ease-in-out 3; }
    #ia-fab .ia-pet.susto .pet-tudo { animation:pet-susto .45s ease-out; }
    #ia-fab .pet-braco { transform-box:view-box; transform-origin:62px 246px; }
    #ia-fab .pet-braco.acena { animation:pet-acena .55s ease-in-out 4; }
    #ia-fab:hover .pet-braco { animation:pet-acena .55s ease-in-out infinite; }
    #ia-fab .pet-olhos { transform:translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px)); transition:transform .18s ease-out; }
    #ia-fab .pet-olho { transform-box:fill-box; transform-origin:center; transition:transform .07s; }
    #ia-fab .pet-olho .feliz, #ia-fab .pet-olho .cifrao, #ia-fab .pet-pensa, #ia-fab .pet-tela, #ia-fab .pet-zz text { opacity:0; }
    #ia-fab .pet-olho .cifrao { fill:url(#petOlho); font:800 46px/1 system-ui, sans-serif; }
    #ia-fab .pet-face, #ia-fab .pet-tela { transition:opacity .35s; }
    #ia-fab .ia-pet.pisca .pet-olho, #ia-fab .ia-pet.pisca1 .po2 { transform:scaleY(.08); }
    #ia-fab .ia-pet.pisca1 .po1 { transform:none; }
    #ia-fab .ia-pet.feliz .aberto, #ia-fab:hover .aberto { opacity:0; }
    #ia-fab .ia-pet.feliz .feliz, #ia-fab:hover .feliz { opacity:1; }
    #ia-fab .ia-pet.feliz .pet-olho, #ia-fab:hover .pet-olho { transform:none; }
    #ia-fab .pet-boca { transition:d .25s; }
    #ia-fab:hover .pet-boca, #ia-fab .ia-pet.feliz .pet-boca, #ia-fab .ia-pet.m-cifrao .pet-boca { d:path("M144 129q18.5 15 37 0"); }
    /* olhos de cifrão */
    #ia-fab .ia-pet.m-cifrao .aberto, #ia-fab .ia-pet.m-cifrao .feliz { opacity:0 !important; }
    #ia-fab .ia-pet.m-cifrao .cifrao { opacity:1; animation:pet-pulsa .6s ease-in-out infinite alternate; transform-box:fill-box; transform-origin:center; }
    /* telas (cotação e gráfico) no lugar do rosto */
    #ia-fab .ia-pet.m-cot .pet-face, #ia-fab .ia-pet.m-graf .pet-face { opacity:0; }
    #ia-fab .ia-pet.m-cot .pet-cot, #ia-fab .ia-pet.m-graf .pet-graf { opacity:1; }
    #ia-fab .cot-nome { fill:#ffd86e; font:700 19px/1 system-ui, sans-serif; letter-spacing:1.5px; }
    #ia-fab .cot-var { font:800 28px/1 system-ui, sans-serif; }
    #ia-fab .pet-cot.sobe .cot-var { fill:#3ee08f; } #ia-fab .pet-cot.sobe .cot-linha { stroke:#3ee08f; }
    #ia-fab .pet-cot.cai .cot-var { fill:#ff6b6b; } #ia-fab .pet-cot.cai .cot-linha { stroke:#ff6b6b; }
    #ia-fab .ia-pet.m-cot .cot-linha, #ia-fab .ia-pet.m-graf .graf-linha { stroke-dasharray:400; animation:pet-desenha 1.4s ease-out both; }
    #ia-fab .ia-pet.m-graf .graf-seta { animation:pet-aparece .3s 1.2s both; }
    /* cara preocupada, susto, pensando, cochilo */
    #ia-fab .ia-pet.pensa .pet-pensa { opacity:1; } #ia-fab .ia-pet.pensa .pet-boca { opacity:0; }
    #ia-fab .pet-pensa circle { animation:pet-ponto 1s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
    #ia-fab .pet-pensa circle:nth-child(2) { animation-delay:.15s; } #ia-fab .pet-pensa circle:nth-child(3) { animation-delay:.3s; }
    #ia-fab .ia-pet.triste .pet-boca { d:path("M150 137q13 -8 26 0"); }
    #ia-fab .ia-pet.triste .po1 { transform:rotate(12deg) scaleY(.8); } #ia-fab .ia-pet.triste .po2 { transform:rotate(-12deg) scaleY(.8); }
    #ia-fab .ia-pet.surpreso .pet-olho { transform:scale(1.22); }
    #ia-fab .ia-pet.surpreso .pet-boca { d:path("M156 135a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"); }
    #ia-fab .ia-pet.m-sono .pet-olho { transform:scaleY(.1); }
    #ia-fab .ia-pet.m-sono .pet-boca { d:path("M155 134q8 3 16 0"); }
    #ia-fab .ia-pet.m-sono .pet-cabeca-in { animation:pet-cochila 4s ease-in-out infinite; }
    #ia-fab .ia-pet.m-sono .pet-zz text { animation:pet-zz 2.4s ease-out infinite; font:800 22px/1 system-ui, sans-serif; }
    #ia-fab .ia-pet.m-sono .pet-zz text + text { animation-delay:1.2s; }
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 2px); top:14px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
    #ia-fab .ia-pet-fala .sobe { color:var(--pos,#16c784); } #ia-fab .ia-pet-fala .cai { color:var(--neg,#ea3943); }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
  }
  @media (max-width:640px) { #ia-fab .ia-pet { display:none; } }
  @media (prefers-reduced-motion: reduce) {
    #ia-fab .pet-tudo, #ia-fab .pet-corpo, #ia-fab .ia-pet-sombra, #ia-fab .pet-cabeca-in, #ia-fab .pet-braco { animation:none !important; }
    #ia-fab .pet-cabeca, #ia-fab .pet-olhos { transition:none; }
  }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.82); opacity:.65; } }
  @keyframes pet-respira { 0%,100% { transform:scale(1,1); } 50% { transform:scale(1.012,.985); } }
  @keyframes pet-balanca { 0%,100% { transform:rotate(0); } 25% { transform:rotate(-2.2deg); } 50% { transform:rotate(0); } 75% { transform:rotate(1.8deg); } }
  @keyframes pet-acena { 0%,100% { transform:rotate(0); } 30% { transform:rotate(-13deg); } 70% { transform:rotate(9deg); } }
  @keyframes pet-sim { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(5px) rotate(1deg); } }
  @keyframes pet-nao { 0%,100% { transform:rotate(0); } 30% { transform:rotate(-5deg); } 70% { transform:rotate(5deg); } }
  @keyframes pet-susto { 0% { transform:translateY(0); } 40% { transform:translateY(-9px) scale(1.03); } 100% { transform:translateY(0); } }
  @keyframes pet-cochila { 0%,100% { transform:rotate(-4deg) translateY(2px); } 50% { transform:rotate(-7deg) translateY(5px); } }
  @keyframes pet-zz { 0% { opacity:0; transform:translate(0,0); } 30% { opacity:1; } 100% { opacity:0; transform:translate(10px,-18px); } }
  @keyframes pet-pulsa { from { transform:scale(1); } to { transform:scale(1.14); } }
  @keyframes pet-desenha { from { stroke-dashoffset:400; } to { stroke-dashoffset:0; } }
  @keyframes pet-ponto { 0%,100% { transform:translateY(0); opacity:.5; } 50% { transform:translateY(-5px); opacity:1; } }
  @keyframes pet-aparece { from { opacity:0; } to { opacity:1; } }`;

  const parado = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sorte = (a, b) => a + Math.random() * (b - a);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v) => (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

  // cotação já carregada pelo terminal (app.js); sem dado válido, devolve null
  function cotacao(sym) {
    try {
      const memo = (typeof yahooMemo !== 'undefined' && yahooMemo) || null;
      const d = memo && memo[sym];
      if (!d || !isFinite(d.change) || !isFinite(d.value)) return null;
      return d;
    } catch (e) { return null; }
  }

  function ligar(b) {
    if (b.querySelector('.ia-pet')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const s = document.createElement('span');
    s.className = 'ia-pet';
    const FALA = 'Assistente IA<small>Pergunte sobre o mercado</small>';
    s.innerHTML = '<span class="ia-pet-fala">' + FALA + '</span><span class="ia-pet-sombra"></span>' + PET;
    b.prepend(s);
    b.classList.add('ia-pet-on');
    b.title = 'Assistente IA';
    const fala = s.querySelector('.ia-pet-fala');
    const braco = s.querySelector('.pet-braco');
    const cot = s.querySelector('.pet-cot');
    const vivo = () => !parado() && !document.hidden && s.offsetParent !== null;
    const emCima = () => b.matches(':hover');
    const classe = (c, ms) => { s.classList.add(c); setTimeout(() => s.classList.remove(c), ms); };
    let ocupado = false; // uma "cena" por vez

    // olhar: para o mouse, ou para um ponto ao acaso quando o mouse fica parado
    const olhar = (dx, dy) => {
      s.style.setProperty('--ex', (dx * 9).toFixed(2));
      s.style.setProperty('--ey', (dy * 6).toFixed(2));
      s.style.setProperty('--hr', (dx * 3.5).toFixed(2) + 'deg');
      s.style.setProperty('--hx', (dx * 2).toFixed(2) + 'px');
    };
    let ultimoMouse = Date.now(), pend = false, mx = 0, my = 0, longe = true;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY; ultimoMouse = Date.now();
      if (s.classList.contains('m-sono')) acordar();
      if (pend || parado()) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const r = s.getBoundingClientRect();
        if (!r.width) return;
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height * .35), d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 260);
        olhar(dx / d * k, dy / d * k);
        // susto quando o mouse chega perto de repente
        if (d < 130 && longe && !ocupado && vivo()) { classe('surpreso', 650); classe('susto', 460); }
        longe = d > 220;
      });
    }, { passive: true });
    (function passeia() {
      setTimeout(() => {
        if (vivo() && Date.now() - ultimoMouse > 2500 && !emCima() && !s.classList.contains('m-sono')) {
          const alvos = [[0, 0], [-1, 0], [1, 0], [-.7, -.6], [.7, -.6], [0, .5], [-.4, .3]];
          const [x, y] = alvos[Math.floor(Math.random() * alvos.length)];
          olhar(x, y);
        }
        passeia();
      }, sorte(1400, 3200));
    })();

    // piscar: normal, duplo ou piscadela
    const fecha = (c, ms) => new Promise((ok) => { s.classList.add(c); setTimeout(() => { s.classList.remove(c); setTimeout(ok, 90); }, ms); });
    (function pisca() {
      setTimeout(async () => {
        if (vivo() && !emCima() && !ocupado && !s.classList.contains('m-sono')) {
          const t = Math.random();
          if (t < .15) await fecha('pisca1', 260);
          else { await fecha('pisca', 110); if (t > .75) await fecha('pisca', 110); }
        }
        pisca();
      }, sorte(2200, 5200));
    })();

    // balão com texto próprio por alguns segundos
    const dizer = (html, ms) => {
      fala.innerHTML = html; b.classList.add('ia-pet-oi');
      setTimeout(() => { b.classList.remove('ia-pet-oi'); setTimeout(() => { if (!b.classList.contains('ia-pet-oi')) fala.innerHTML = FALA; }, 250); }, ms);
    };

    // ---- cenas ----
    const acenar = () => { braco.classList.remove('acena'); void braco.getBoundingClientRect(); braco.classList.add('acena'); };
    braco.addEventListener('animationend', () => braco.classList.remove('acena'));
    const cena = (fn, ms) => { ocupado = true; fn(); setTimeout(() => { ocupado = false; }, ms); };

    let vezAtivo = 0;
    function mostraCotacao() {
      for (let i = 0; i < ATIVOS.length; i++) {
        const [sym, curto, nome] = ATIVOS[(vezAtivo + i) % ATIVOS.length];
        const d = cotacao(sym);
        if (!d) continue;
        vezAtivo += i + 1;
        const sobe = d.change >= 0;
        // para o dólar, alta do dólar não é "boa notícia" para a bolsa: a cara segue o sinal da bolsa só nos índices
        const indice = sym !== 'BRL=X';
        cot.querySelector('.cot-nome').textContent = curto;
        cot.querySelector('.cot-var').textContent = (sobe ? '▲ ' : '▼ ') + pct(Math.abs(d.change)).replace('+', '');
        cot.classList.toggle('sobe', sobe); cot.classList.toggle('cai', !sobe);
        const sp = (d.sparkline || []).filter(isFinite);
        let path = '';
        if (sp.length > 3) {
          const mn = Math.min(...sp), mxv = Math.max(...sp), amp = (mxv - mn) || 1;
          path = sp.map((v, j) => (j ? 'L' : 'M') + (96 + j * 134 / (sp.length - 1)).toFixed(1) + ' ' + (150 - (v - mn) / amp * 26).toFixed(1)).join('');
        }
        cot.querySelector('.cot-linha').setAttribute('d', path);
        cena(() => {
          s.classList.add('m-cot');
          dizer('<b>' + esc(nome) + '</b> <span class="' + (sobe ? 'sobe' : 'cai') + '">' + esc(pct(d.change)) + '</span>' +
            (d.date ? '<small>Dado de ' + esc(d.date) + '</small>' : ''), 4200);
          setTimeout(() => {
            s.classList.remove('m-cot');
            if (indice) { if (sobe) { classe('feliz', 1600); classe('concorda', 1600); } else { classe('triste', 1800); classe('nega', 1600); } }
          }, 4200);
        }, 6200);
        return true;
      }
      return false;
    }
    const cenas = {
      cotacao: mostraCotacao,
      cifrao: () => { cena(() => { s.classList.add('m-cifrao'); setTimeout(() => s.classList.remove('m-cifrao'), 2600); }, 2800); return true; },
      grafico: () => { cena(() => { s.classList.add('m-graf'); setTimeout(() => { s.classList.remove('m-graf'); classe('feliz', 1200); }, 3000); }, 4300); return true; },
      aceno: () => { cena(acenar, 2300); return true; },
      feliz: () => { cena(() => classe('feliz', 1600), 1700); return true; },
      pensa: () => { cena(() => { s.classList.add('pensa'); olhar(.6, -.9); setTimeout(() => s.classList.remove('pensa'), 2200); }, 2300); return true; },
    };
    const SORTEIO = [['cotacao', 38], ['cifrao', 16], ['grafico', 14], ['aceno', 14], ['feliz', 10], ['pensa', 8]];
    (function roteiro() {
      setTimeout(() => {
        if (vivo() && !emCima() && !ocupado && !s.classList.contains('m-sono')) {
          let r = Math.random() * 100, nome = 'aceno';
          for (const [n, p] of SORTEIO) { if ((r -= p) < 0) { nome = n; break; } }
          if (!cenas[nome]()) cenas.aceno();
        }
        roteiro();
      }, sorte(7000, 11000));
    })();

    // cochilo: muito tempo sem mexer o mouse
    function acordar() { s.classList.remove('m-sono'); classe('surpreso', 700); classe('susto', 460); }
    setInterval(() => {
      if (vivo() && !ocupado && !emCima() && Date.now() - ultimoMouse > 60000) { s.classList.add('m-sono'); olhar(0, .4); }
    }, 5000);

    b.addEventListener('mouseenter', () => { s.classList.remove('m-sono'); });

    // ao aparecer: acena e o balão se apresenta por alguns segundos
    b.classList.add('ia-pet-oi'); setTimeout(() => b.classList.remove('ia-pet-oi'), 5000);
    setTimeout(acenar, 700);

    // para conferir as cenas à mão no console: MMPet.cena('cotacao' | 'cifrao' | 'grafico' | ...)
    window.MMPet = { cena: (n) => (n === 'sono' ? (s.classList.add('m-sono'), true) : cenas[n] && cenas[n]()) };
  }

  // o botão é criado pelo assistente.js depois que a conta responde; espera ele aparecer
  const ja = document.getElementById('ia-fab');
  if (ja) ligar(ja);
  else {
    const ob = new MutationObserver(() => { const b = document.getElementById('ia-fab'); if (b) { ob.disconnect(); ligar(b); } });
    ob.observe(document.body, { childList: true });
  }
})();
