/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino)
   v3: o robô 3D de grafite e ouro que o Severino mandou ("Robô grafite e dourado acenando"),
   em 6 quadros recortados num só arquivo (robo-acenando.webp, 6 quadros de 180x180).
   No computador o botão flutuante do Assistente vira o robô: fica flutuando, de tempos em tempos
   acena e pisca (quadro 3, olhos fechados sorrindo). Com o mouse em cima ele acena sem parar e
   aparece o balão "Assistente IA". O clique abre o painel como antes. No celular (aba na borda)
   o botão antigo continua; com "reduzir movimento" o robô fica parado no primeiro quadro.
   Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  const IMG = 'robo-acenando.webp?v=1';
  const ACENO = [0, 1, 3, 4, 5, 4, 3, 1, 0, 1, 3, 4, 5, 4, 3, 1, 0];
  const PISCA = [2, 2, 2, 0];
  const PASSO = 110; // ms por quadro

  const css = `
  @media (min-width:641px) {
    #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
    #ia-fab.ia-pet-on:hover { transform:none; }
    #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
    #ia-fab .ia-pet { display:block; position:relative; width:92px; height:96px; }
    #ia-fab .ia-pet-robo { position:absolute; left:0; top:0; width:92px; height:92px; background:url(${IMG}) 0 0 / 600% 100% no-repeat;
      filter:drop-shadow(0 8px 14px rgba(0,0,0,.45)); animation:pet-flutua 3s ease-in-out infinite; }
    #ia-fab .ia-pet-sombra { position:absolute; left:22px; bottom:0; width:48px; height:6px; border-radius:50%; background:rgba(0,0,0,.4);
      filter:blur(2px); animation:pet-sombra 3s ease-in-out infinite; }
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 2px); top:12px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
  }
  @media (max-width:640px) { #ia-fab .ia-pet { display:none; } }
  @media (prefers-reduced-motion: reduce) { #ia-fab .ia-pet-robo, #ia-fab .ia-pet-sombra { animation:none !important; } }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.82); opacity:.65; } }`;

  const parado = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ligar(b) {
    if (b.querySelector('.ia-pet')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const s = document.createElement('span');
    s.className = 'ia-pet';
    s.innerHTML = '<span class="ia-pet-fala">Assistente IA<small>Pergunte sobre o mercado</small></span><span class="ia-pet-sombra"></span><span class="ia-pet-robo"></span>';
    b.prepend(s);
    b.classList.add('ia-pet-on');
    b.title = 'Assistente IA';
    const robo = s.querySelector('.ia-pet-robo');
    const quadro = (i) => { robo.style.backgroundPosition = (i * 20) + '% 0'; };

    // toca uma sequência de quadros; com o mouse em cima, repete o aceno
    let fila = [], tic = 0, emCima = false;
    function tocar(seq) {
      if (parado()) return;
      fila = seq.slice();
      if (!tic) tic = setInterval(() => {
        if (!fila.length) {
          if (emCima) fila = ACENO.slice(1);
          else { clearInterval(tic); tic = 0; quadro(0); return; }
        }
        quadro(fila.shift());
      }, PASSO);
    }
    b.addEventListener('mouseenter', () => { emCima = true; tocar(ACENO); });
    b.addEventListener('mouseleave', () => { emCima = false; });

    // de tempos em tempos: acena ou pisca (só com a aba visível)
    let vez = 0;
    setInterval(() => {
      if (document.hidden || emCima || tic) return;
      tocar(vez++ % 2 ? PISCA : ACENO);
    }, 6000);

    // ao aparecer: acena e o balão se apresenta por alguns segundos
    b.classList.add('ia-pet-oi'); setTimeout(() => b.classList.remove('ia-pet-oi'), 5000);
    setTimeout(() => tocar(ACENO), 600);
  }

  // o botão é criado pelo assistente.js depois que a conta responde; espera ele aparecer
  const ja = document.getElementById('ia-fab');
  if (ja) ligar(ja);
  else {
    const ob = new MutationObserver(() => { const b = document.getElementById('ia-fab'); if (b) { ob.disconnect(); ligar(b); } });
    ob.observe(document.body, { childList: true });
  }
})();
