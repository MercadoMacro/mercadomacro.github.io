/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino)
   v2: robô de grafite e ouro, redesenhado em vetor a partir da imagem que o Severino mandou
   ("Robô financeiro de grafite e ouro"): visor com aro dourado, fones laterais, olhos e sorriso
   acesos, gola dourada, as três barras da marca no peito, mão acenando.
   No computador o botão flutuante do Assistente vira o robô: flutua, inclina a cabeça, pisca,
   os olhos seguem o mouse e de tempos em tempos ele acena; ao passar o mouse ele acena rápido e
   aparece o balão "Assistente IA". O clique abre o painel como antes. No celular (aba na borda)
   o botão antigo continua; com "reduzir movimento" o robô fica parado.
   Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  const PET = `<svg class="pet" viewBox="0 0 130 124" aria-hidden="true">
    <defs>
      <linearGradient id="petOuro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d58a"/><stop offset=".5" stop-color="#c99a3c"/><stop offset="1" stop-color="#e9c46e"/></linearGradient>
      <radialGradient id="petGraf" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#4a4a4e"/><stop offset=".55" stop-color="#2c2c2f"/><stop offset="1" stop-color="#18181a"/></radialGradient>
      <linearGradient id="petGrafV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c3c40"/><stop offset="1" stop-color="#1b1b1d"/></linearGradient>
      <radialGradient id="petVisor" cx=".45" cy=".35" r=".8"><stop offset="0" stop-color="#1c1c1e"/><stop offset="1" stop-color="#080809"/></radialGradient>
      <filter id="petBrilho" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse class="pet-sombra" cx="66" cy="121" rx="34" ry="3"/>
    <g class="pet-corpo">
      <!-- tronco -->
      <path d="M32 124V96q0-17 20-19h28q20 2 20 19v28z" fill="url(#petGrafV)"/>
      <path d="M52 80q-2 22 4 44M80 80q2 22-4 44" fill="none" stroke="#111" stroke-width=".7" opacity=".55"/>
      <g fill="url(#petOuro)"><rect x="72" y="88" width="2.6" height="3.4" rx=".5"/><rect x="76" y="86" width="2.6" height="5.4" rx=".5"/><rect x="80" y="83.5" width="2.6" height="7.9" rx=".5"/></g>
      <!-- braço direito apoiado -->
      <path d="M99 92q4 12 0 22" fill="none" stroke="url(#petGrafV)" stroke-width="12" stroke-linecap="round"/>
      <ellipse cx="95" cy="112" rx="3.4" ry="6.6" transform="rotate(-25 95 112)" fill="#2b2b2e" stroke="url(#petOuro)" stroke-width="1.6"/>
      <ellipse cx="86" cy="115" rx="8.5" ry="6.4" fill="url(#petGraf)"/>
      <!-- pescoço -->
      <rect x="54" y="70" width="24" height="9" rx="3" fill="#18181a"/>
      <ellipse cx="66" cy="78" rx="15" ry="3.6" fill="#1f1f22"/><path d="M51 78a15 3.6 0 0 0 30 0" fill="none" stroke="url(#petOuro)" stroke-width="1.7"/>
      <!-- braço que acena -->
      <g class="pet-braco">
        <path d="M37 93q-8 6-8 16" fill="none" stroke="url(#petGrafV)" stroke-width="12" stroke-linecap="round"/>
        <path class="pet-antebraco" d="M29 110q-5-10-5-22" fill="none" stroke="#2a2a2d" stroke-width="10" stroke-linecap="round"/>
        <ellipse cx="24.3" cy="88" rx="6.4" ry="2.3" fill="#2a2a2d" stroke="url(#petOuro)" stroke-width="1.7"/>
        <g class="pet-mao" fill="url(#petGraf)">
          <rect x="16" y="73" width="16" height="14" rx="6"/>
          <rect x="15.5" y="64" width="4.4" height="13" rx="2.2" transform="rotate(-14 17.7 70)"/>
          <rect x="20.4" y="62.5" width="4.4" height="13" rx="2.2" transform="rotate(-4 22.6 69)"/>
          <rect x="25.2" y="63.5" width="4.4" height="12" rx="2.2" transform="rotate(8 27.4 69)"/>
          <rect x="29.5" y="72" width="4.2" height="10" rx="2.1" transform="rotate(48 31.6 77)"/>
        </g>
      </g>
      <!-- cabeça -->
      <g class="pet-cabeca">
        <rect x="18" y="3" width="94" height="68" rx="33" fill="url(#petGraf)"/>
        <g fill="#1d1d20" stroke="url(#petOuro)" stroke-width="1.6"><rect x="12" y="29" width="10" height="23" rx="5"/><rect x="108" y="29" width="10" height="23" rx="5"/></g>
        <g fill="#111113"><rect x="15" y="33" width="4" height="15" rx="2"/><rect x="111" y="33" width="4" height="15" rx="2"/></g>
        <rect x="26" y="15" width="78" height="52" rx="21" fill="url(#petVisor)" stroke="url(#petOuro)" stroke-width="2.3"/>
        <g class="pet-rosto" filter="url(#petBrilho)">
          <g class="pet-olhos">
            <rect class="pet-olho" x="43" y="34" width="7.5" height="15" rx="3.75" fill="#ffd66b"/>
            <rect class="pet-olho" x="79.5" y="34" width="7.5" height="15" rx="3.75" fill="#ffd66b"/>
          </g>
          <path class="pet-boca" d="M59.5 52.5q5.5 4 11 0" fill="none" stroke="#ffd66b" stroke-width="2" stroke-linecap="round"/>
        </g>
      </g>
    </g>
  </svg>`;

  const css = `
  @media (min-width:641px) {
    #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
    #ia-fab.ia-pet-on:hover { transform:none; }
    #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
    #ia-fab .ia-pet { display:block; position:relative; width:88px; height:84px; }
    #ia-fab .pet { width:88px; height:84px; overflow:visible; filter:drop-shadow(0 6px 14px rgba(0,0,0,.4)); }
    #ia-fab .pet-sombra { fill:rgba(0,0,0,.38); transform-box:fill-box; transform-origin:center; animation:pet-sombra 3s ease-in-out infinite; }
    #ia-fab .pet-corpo { animation:pet-flutua 3s ease-in-out infinite; }
    #ia-fab .pet-cabeca { transform-box:view-box; transform-origin:66px 76px; animation:pet-cabeca 6s ease-in-out infinite; }
    #ia-fab .pet-braco { transform-box:view-box; transform-origin:37px 95px; animation:pet-acena 7s ease-in-out infinite 1s; }
    #ia-fab .pet-olhos { transform:translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px)); transition:transform .12s linear; }
    #ia-fab .pet-olho { transform-box:fill-box; transform-origin:center; animation:pet-pisca 4.6s infinite; }
    #ia-fab .pet-rosto { animation:pet-luz 3s ease-in-out infinite; }
    #ia-fab .pet-boca { transition:d .2s; }
    #ia-fab:hover .pet-braco, #ia-fab:focus-visible .pet-braco { animation:pet-acena-rapido .9s ease-in-out infinite; }
    #ia-fab:hover .pet-boca, #ia-fab:focus-visible .pet-boca { d:path("M57.5 51.5q7.5 6.5 15 0"); }
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 4px); top:10px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
  }
  @media (max-width:640px) { #ia-fab .ia-pet { display:none; } }
  @media (prefers-reduced-motion: reduce) {
    #ia-fab .pet-corpo, #ia-fab .pet-sombra, #ia-fab .pet-cabeca, #ia-fab .pet-braco, #ia-fab .pet-olho, #ia-fab .pet-rosto { animation:none !important; }
  }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.86); opacity:.7; } }
  @keyframes pet-cabeca { 0%,100% { transform:rotate(0); } 20% { transform:rotate(-3deg); } 45% { transform:rotate(0); } 70% { transform:rotate(2.5deg); } }
  @keyframes pet-acena { 0%,58%,100% { transform:rotate(0); } 64% { transform:rotate(-14deg); } 70% { transform:rotate(6deg); } 76% { transform:rotate(-14deg); } 82% { transform:rotate(6deg); } 88% { transform:rotate(0); } }
  @keyframes pet-acena-rapido { 0%,100% { transform:rotate(-12deg); } 50% { transform:rotate(7deg); } }
  @keyframes pet-pisca { 0%,92%,100% { transform:scaleY(1); } 94%,96% { transform:scaleY(.1); } }
  @keyframes pet-luz { 0%,100% { opacity:1; } 50% { opacity:.82; } }`;

  function ligar(b) {
    if (b.querySelector('.ia-pet')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const s = document.createElement('span');
    s.className = 'ia-pet';
    s.innerHTML = '<span class="ia-pet-fala">Assistente IA<small>Pergunte sobre o mercado</small></span>' + PET;
    b.prepend(s);
    b.classList.add('ia-pet-on');
    b.title = 'Assistente IA';
    // ao aparecer, o balão se apresenta por alguns segundos
    b.classList.add('ia-pet-oi'); setTimeout(() => b.classList.remove('ia-pet-oi'), 5000);
    // os olhos seguem o mouse (no máximo ~3 unidades do desenho)
    let pend = false, mx = 0, my = 0;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (pend) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const r = s.getBoundingClientRect();
        if (!r.width) return;
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 3), d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 220) * 3.5;
        s.style.setProperty('--ex', (dx / d * k).toFixed(2));
        s.style.setProperty('--ey', (dy / d * k).toFixed(2));
      });
    }, { passive: true });
  }

  // o botão é criado pelo assistente.js depois que a conta responde; espera ele aparecer
  const ja = document.getElementById('ia-fab');
  if (ja) ligar(ja);
  else {
    const ob = new MutationObserver(() => { const b = document.getElementById('ia-fab'); if (b) { ob.disconnect(); ligar(b); } });
    ob.observe(document.body, { childList: true });
  }
})();
