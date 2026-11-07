/* Mascote original em imagem transparente, com movimentos do personagem inteiro. */
(() => {
  const css = `
    /* A aba retrátil e o mascote usam a mesma divisão de tela. */
    @media (min-width:901px) {
      #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
      #ia-fab.ia-pet-on:hover { transform:none; }
      #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
      #ia-fab .ia-pet { display:block; position:relative; width:64px; height:64px; }
      #ia-fab .ia-pet-img { display:block; width:64px; height:64px; object-fit:contain; transform-origin:50% 85%; animation:ia-robo-flutua 3.6s ease-in-out infinite; filter:drop-shadow(0 3px 5px rgba(0,0,0,.3)); }
      #ia-fab:hover .ia-pet-img, #ia-fab:focus-visible .ia-pet-img { animation:ia-robo-saudacao 1.6s ease-in-out infinite; }
      #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 8px); top:8px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
        background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
        font-size:12.5px; font-weight:700; line-height:1.2; opacity:0; transform:translateX(6px); transition:opacity .2s,transform .2s; pointer-events:none; }
      #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); }
      #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala { opacity:1; transform:none; }
    }
    @media (max-width:900px) { #ia-fab .ia-pet { display:none; } }
    @media (prefers-reduced-motion:reduce) {
      #ia-fab .ia-pet-img { animation:none !important; transform:none !important; }
      #ia-fab .ia-pet-fala { transition:none; }
    }
    html[data-motion="off"] #ia-fab .ia-pet-img { animation:none !important; transform:none !important; }
    html[data-motion="off"] #ia-fab .ia-pet-fala { transition:none; }
    @keyframes ia-robo-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
    @keyframes ia-robo-saudacao { 0%,100% { transform:translateY(0) rotate(0); } 30% { transform:translateY(-2px) rotate(-4deg); } 65% { transform:translateY(-2px) rotate(3deg); } }
  `;

  function ligar(button) {
    if (button.querySelector('.ia-pet')) return;
    const image = new Image();
    image.className = 'ia-pet-img';
    image.alt = '';
    image.width = 64;
    image.height = 64;
    image.draggable = false;
    image.onload = () => {
      if (!button.isConnected || button.querySelector('.ia-pet')) return;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
      const mascot = document.createElement('span');
      mascot.className = 'ia-pet';
      mascot.setAttribute('aria-hidden', 'true');
      mascot.innerHTML = '<span class="ia-pet-fala">Assistente IA<small>Pergunte sobre o mercado</small></span>';
      mascot.append(image);
      button.prepend(mascot);
      button.classList.add('ia-pet-on');
    };
    image.src = 'mascote-robo-original.webp?v=1';
  }

  const button = document.getElementById('ia-fab');
  if (button) ligar(button);
  else {
    const observer = new MutationObserver(() => {
      const button = document.getElementById('ia-fab');
      if (button) { observer.disconnect(); ligar(button); }
    });
    observer.observe(document.body, { childList:true });
  }
})();
