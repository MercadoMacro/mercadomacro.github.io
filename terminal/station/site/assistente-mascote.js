/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino: "transformar a IA assistente num pet com movimento")
   No computador, o botão flutuante do Assistente vira um mascote animado: flutua, pisca, as três barras
   douradas da marca na cabeça sobem e descem e os olhos seguem o mouse. Ao passar o mouse aparece o balão
   "Assistente IA"; o clique abre o painel como antes. No celular (aba na borda) e com "reduzir movimento"
   o botão continua parado. Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  const PET = `<svg class="pet" viewBox="0 0 72 76" aria-hidden="true">
    <defs>
      <linearGradient id="petOuro" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d99a1e"/><stop offset=".6" stop-color="#f2b92e"/><stop offset="1" stop-color="#ffd76a"/></linearGradient>
      <radialGradient id="petCorpo" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#2a3d63"/><stop offset=".6" stop-color="#16223a"/><stop offset="1" stop-color="#0c1424"/></radialGradient>
    </defs>
    <ellipse class="pet-sombra" cx="36" cy="72" rx="17" ry="3.2"/>
    <g class="pet-corpo">
      <g class="pet-barras" fill="url(#petOuro)">
        <rect class="pb1" x="25" y="9" width="5" height="10" rx="1.6"/>
        <rect class="pb2" x="33.5" y="4" width="5" height="15" rx="1.6"/>
        <rect class="pb3" x="42" y="0" width="5" height="19" rx="1.6"/>
      </g>
      <rect x="9" y="17" width="54" height="48" rx="22" fill="url(#petCorpo)" stroke="url(#petOuro)" stroke-width="2"/>
      <rect x="16" y="27" width="40" height="24" rx="11" fill="#070c17" opacity=".85"/>
      <g class="pet-olhos">
        <g class="pet-olho"><rect x="23" y="33" width="8" height="11" rx="4" fill="#ffe08a"/><circle class="pet-pupila" cx="27" cy="38.5" r="2.1" fill="#0b1220"/></g>
        <g class="pet-olho"><rect x="41" y="33" width="8" height="11" rx="4" fill="#ffe08a"/><circle class="pet-pupila" cx="45" cy="38.5" r="2.1" fill="#0b1220"/></g>
      </g>
      <path class="pet-boca" d="M32 55.5q4 3 8 0" fill="none" stroke="#ffd76a" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="18.5" cy="50" r="2.4" fill="#f2b92e" opacity=".35"/><circle cx="53.5" cy="50" r="2.4" fill="#f2b92e" opacity=".35"/>
    </g>
  </svg>`;

  const css = `
  @media (min-width:641px) {
    #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
    #ia-fab.ia-pet-on:hover { transform:none; }
    #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
    #ia-fab .ia-pet { display:block; position:relative; width:72px; height:76px; }
    #ia-fab .pet { width:72px; height:76px; overflow:visible; filter:drop-shadow(0 6px 14px rgba(0,0,0,.35)); }
    #ia-fab .pet-sombra { fill:rgba(0,0,0,.35); transform-box:fill-box; transform-origin:center; animation:pet-sombra 2.6s ease-in-out infinite; }
    #ia-fab .pet-corpo { animation:pet-flutua 2.6s ease-in-out infinite; }
    #ia-fab .pet-barras rect { transform-box:fill-box; transform-origin:50% 100%; animation:pet-barra 1.3s ease-in-out infinite; }
    #ia-fab .pet-barras .pb2 { animation-delay:.18s; } #ia-fab .pet-barras .pb3 { animation-delay:.36s; }
    #ia-fab .pet-olho { transform-box:fill-box; transform-origin:center; animation:pet-pisca 5.2s infinite; }
    #ia-fab .pet-pupila { transform:translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px)); transition:transform .12s linear; }
    #ia-fab:hover .pet-corpo, #ia-fab:focus-visible .pet-corpo { animation:pet-pula .55s ease-out; }
    #ia-fab:hover .pet-boca { d:path("M31 54.5q5 5 10 0"); }
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 6px); top:16px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
  }
  @media (max-width:640px) { #ia-fab .ia-pet { display:none; } }
  @media (prefers-reduced-motion: reduce) { #ia-fab .pet-corpo, #ia-fab .pet-sombra, #ia-fab .pet-barras rect, #ia-fab .pet-olho { animation:none !important; } }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.82); opacity:.7; } }
  @keyframes pet-barra { 0%,100% { transform:scaleY(1); } 50% { transform:scaleY(.62); } }
  @keyframes pet-pisca { 0%,93%,100% { transform:scaleY(1); } 95%,97% { transform:scaleY(.12); } }
  @keyframes pet-pula { 0% { transform:translateY(0); } 35% { transform:translateY(-9px) rotate(-4deg); } 70% { transform:translateY(1px) rotate(2deg); } 100% { transform:translateY(0); } }`;

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
    // os olhos seguem o mouse (no máximo 2 px para cada lado)
    let pend = false, mx = 0, my = 0;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (pend) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const r = s.getBoundingClientRect();
        if (!r.width) return;
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 220) * 2;
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
