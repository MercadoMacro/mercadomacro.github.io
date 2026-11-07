/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino: "transformar a IA assistente num pet com movimento")
   No computador, o botão flutuante do Assistente vira um mascote animado: flutua, pisca, as três barras
   douradas da marca na cabeça sobem e descem e os olhos seguem o mouse. Ao passar o mouse aparece o balão
   "Assistente IA"; o clique abre o painel como antes. No celular (aba na borda) e com "reduzir movimento"
   o botão continua parado. Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  // versão "Faria Lima" (pedido do Severino 07/11): camisa social, colete puffer e patinete
  const PET = `<svg class="pet" viewBox="0 0 96 100" aria-hidden="true">
    <defs>
      <linearGradient id="petOuro" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d99a1e"/><stop offset=".6" stop-color="#f2b92e"/><stop offset="1" stop-color="#ffd76a"/></linearGradient>
      <radialGradient id="petCorpo" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#2a3d63"/><stop offset=".6" stop-color="#16223a"/><stop offset="1" stop-color="#0c1424"/></radialGradient>
      <linearGradient id="petColete" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c2840"/><stop offset=".5" stop-color="#2c3d60"/><stop offset="1" stop-color="#1c2840"/></linearGradient>
    </defs>
    <ellipse class="pet-sombra" cx="49" cy="97" rx="32" ry="2.6"/>
    <g class="pet-vento" stroke="#8a97ad" stroke-width="1.6" stroke-linecap="round">
      <line x1="2" y1="58" x2="16" y2="58"/><line x1="6" y1="68" x2="22" y2="68"/><line x1="1" y1="78" x2="13" y2="78"/>
    </g>
    <g class="pet-corpo">
      <g class="pet-patinete">
        <line x1="72" y1="88" x2="68" y2="44" stroke="#9aa6ba" stroke-width="3" stroke-linecap="round"/>
        <line x1="62" y1="44" x2="74" y2="44" stroke="#1d2433" stroke-width="3.4" stroke-linecap="round"/>
        <rect x="20" y="83" width="54" height="5" rx="2.5" fill="#2a3242"/>
        <rect x="22" y="82" width="38" height="1.6" rx=".8" fill="url(#petOuro)"/>
        <g class="pet-roda"><circle cx="24" cy="90" r="6.5" fill="#11161f" stroke="#5c6779" stroke-width="2"/><path d="M24 85v10M19 90h10" stroke="#5c6779" stroke-width="1.2"/></g>
        <g class="pet-roda"><circle cx="73" cy="90" r="6.5" fill="#11161f" stroke="#5c6779" stroke-width="2"/><path d="M73 85v10M68 90h10" stroke="#5c6779" stroke-width="1.2"/></g>
      </g>
      <rect x="39" y="68" width="6.5" height="15" rx="2" fill="#2b303b"/><rect x="48.5" y="68" width="6.5" height="15" rx="2" fill="#2b303b"/>
      <ellipse cx="41" cy="82.6" rx="5" ry="1.9" fill="#6b3f1f"/><ellipse cx="52" cy="82.6" rx="5" ry="1.9" fill="#6b3f1f"/>
      <rect x="35" y="39" width="25" height="31" rx="7" fill="#f3f5f9"/>
      <path d="M42.5 39.5l4.5 6 1-6.2zM52.5 39.5l-4.5 6-1-6.2z" fill="#dfe4ec" stroke="#c4cad6" stroke-width=".6"/>
      <path d="M35 46q0-6.5 7-7l3.2 1.4 1.3 29.6H35z" fill="url(#petColete)"/>
      <path d="M60 46q0-6.5-7-7l-3.2 1.4-1.3 29.6H60z" fill="url(#petColete)"/>
      <path d="M35.4 51.5h11M35.2 58h11.3M35.2 64.5h11.3M48.6 51.5h11M48.6 58h11.3M48.6 64.5h11.3" stroke="#0e1729" stroke-width="1" opacity=".75"/>
      <circle cx="55" cy="47" r="1.3" fill="url(#petOuro)"/>
      <path d="M58 47q6 1 9.5-2.4" fill="none" stroke="#f3f5f9" stroke-width="4.2" stroke-linecap="round"/>
      <circle cx="67.6" cy="44.4" r="2.4" fill="#16223a" stroke="url(#petOuro)" stroke-width=".8"/>
      <g class="pet-cabeca" transform="translate(25.5 0) scale(.62)">
        <g class="pet-barras" fill="url(#petOuro)">
          <rect class="pb1" x="25" y="9" width="5" height="10" rx="1.6"/>
          <rect class="pb2" x="33.5" y="4" width="5" height="15" rx="1.6"/>
          <rect class="pb3" x="42" y="0" width="5" height="19" rx="1.6"/>
        </g>
        <rect x="9" y="17" width="54" height="48" rx="22" fill="url(#petCorpo)" stroke="url(#petOuro)" stroke-width="2.6"/>
        <rect x="16" y="27" width="40" height="24" rx="11" fill="#070c17" opacity=".85"/>
        <g class="pet-olhos">
          <g class="pet-olho"><rect x="23" y="33" width="8" height="11" rx="4" fill="#ffe08a"/><circle class="pet-pupila" cx="27" cy="38.5" r="2.1" fill="#0b1220"/></g>
          <g class="pet-olho"><rect x="41" y="33" width="8" height="11" rx="4" fill="#ffe08a"/><circle class="pet-pupila" cx="45" cy="38.5" r="2.1" fill="#0b1220"/></g>
        </g>
        <path class="pet-boca" d="M32 55.5q4 3 8 0" fill="none" stroke="#ffd76a" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="18.5" cy="50" r="2.4" fill="#f2b92e" opacity=".35"/><circle cx="53.5" cy="50" r="2.4" fill="#f2b92e" opacity=".35"/>
      </g>
    </g>
  </svg>`;

  const css = `
  @media (min-width:641px) {
    #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
    #ia-fab.ia-pet-on:hover { transform:none; }
    #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
    #ia-fab .ia-pet { display:block; position:relative; width:86px; height:90px; }
    #ia-fab .pet { width:86px; height:90px; overflow:visible; filter:drop-shadow(0 6px 14px rgba(0,0,0,.35)); }
    #ia-fab .pet-sombra { fill:rgba(0,0,0,.35); transform-box:fill-box; transform-origin:center; animation:pet-sombra 2.6s ease-in-out infinite; }
    #ia-fab .pet-corpo { animation:pet-flutua 2.6s ease-in-out infinite; }
    #ia-fab .pet-roda { transform-box:fill-box; transform-origin:center; animation:pet-gira .7s linear infinite; }
    #ia-fab .pet-vento line { stroke-dasharray:6 14; animation:pet-vento .9s linear infinite; opacity:.55; }
    #ia-fab .pet-vento line:nth-child(2) { animation-delay:.3s; } #ia-fab .pet-vento line:nth-child(3) { animation-delay:.6s; }
    #ia-fab .pet-barras rect { transform-box:fill-box; transform-origin:50% 100%; animation:pet-barra 1.3s ease-in-out infinite; }
    #ia-fab .pet-barras .pb2 { animation-delay:.18s; } #ia-fab .pet-barras .pb3 { animation-delay:.36s; }
    #ia-fab .pet-olho { transform-box:fill-box; transform-origin:center; animation:pet-pisca 5.2s infinite; }
    #ia-fab .pet-pupila { transform:translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px)); transition:transform .12s linear; }
    #ia-fab:hover .pet-corpo, #ia-fab:focus-visible .pet-corpo { animation:pet-pula .55s ease-out; }
    #ia-fab:hover .pet-boca { d:path("M31 54.5q5 5 10 0"); }
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 6px); top:12px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
  }
  @media (max-width:640px) { #ia-fab .ia-pet { display:none; } }
  @media (prefers-reduced-motion: reduce) { #ia-fab .pet-corpo, #ia-fab .pet-sombra, #ia-fab .pet-barras rect, #ia-fab .pet-olho, #ia-fab .pet-roda, #ia-fab .pet-vento line { animation:none !important; } }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-2px); } }
  @keyframes pet-gira { to { transform:rotate(360deg); } }
  @keyframes pet-vento { from { stroke-dashoffset:20; } to { stroke-dashoffset:0; } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.82); opacity:.7; } }
  @keyframes pet-barra { 0%,100% { transform:scaleY(1); } 50% { transform:scaleY(.62); } }
  @keyframes pet-pisca { 0%,93%,100% { transform:scaleY(1); } 95%,97% { transform:scaleY(.12); } }
  @keyframes pet-pula { 0% { transform:translateY(0); } 35% { transform:translateY(-10px) rotate(-5deg); } 70% { transform:translateY(1px) rotate(1deg); } 100% { transform:translateY(0); } }`;

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
        const k = Math.min(1, d / 220) * 3;
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
