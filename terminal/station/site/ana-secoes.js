/* Barra de seções da aba Análises, no mesmo estilo da barra dos Indicadores (pedido do Severino, 28/10/2026).
   Mostra uma parte da página por vez; a faixa de destaques fica sempre visível no topo. */
(() => {
  const wrap = document.querySelector('#analysis-panel .ana-wrap');
  const dq = document.getElementById('ana-destaques');
  if (!wrap || !dq) return;
  const SECOES = [
    ['fluxo', 'Fluxo na B3', 'fa-right-left'],
    ['fed', 'Fed', 'flag-us'],
    ['copom', 'Copom', 'flag-br'],
    ['cot', 'Especuladores', 'fa-scale-balanced'],
    ['f13', 'Grandes fundos', 'fa-briefcase'],
    ['mercado', 'Análise avançada', 'fa-chart-line']
  ];
  const ALVO = { 'ana-sec-fluxo': 'fluxo', 'ana-sec-fed': 'fed', 'ana-sec-cot': 'cot', 'ana-sec-13f': 'f13' };
  // Fed e Copom usam as bandeirinhas no lugar do ícone
  const BANDEIRA = { 'flag-us': '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#b22234"/><g fill="#fff"><rect y="1.54" width="30" height="1.54"/><rect y="4.62" width="30" height="1.54"/><rect y="7.69" width="30" height="1.54"/><rect y="10.77" width="30" height="1.54"/><rect y="13.85" width="30" height="1.54"/><rect y="16.92" width="30" height="1.54"/></g><rect width="12" height="10.77" fill="#3c3b6e"/></svg>', 'flag-br': '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.2 10 15 17.8 2.8 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.1c3-.8 6.2-.5 8.9.9" stroke="#fff" stroke-width=".8" fill="none"/></svg>' };
  const icone = (ic) => BANDEIRA[ic] || `<i class="fa-solid ${ic}" aria-hidden="true"></i>`;
  // título, descrição e o texto do botão "Como funciona?" do cabeçalho da seção de juros (30/10/2026)
  const TIT = {
    fed: ['Probabilidades do Fed', 'Acompanhe as projeções de juros do Federal Reserve calculadas com os preços dos futuros de Fed Funds.',
      'Os futuros de Fed Funds de 30 dias (código ZQ, na bolsa de Chicago) pagam a taxa média de juros do mês. Por isso, 100 menos o preço do contrato é a taxa que o mercado espera. Comparando essa taxa com a de hoje, mês a mês, sai a chance de o Fed manter, subir ou cortar os juros em cada reunião. É o mesmo método da ferramenta FedWatch da CME.'],
    copom: ['Probabilidades do Copom', 'Acompanhe as apostas para a Selic nas próximas reuniões do Copom calculadas com os preços das opções de Copom da B3.',
      'Na B3 existem opções que pagam se o Copom tomar uma decisão específica (manter, subir ou cortar a Selic em um certo tamanho). Como cada opção paga um valor fixo se acertar, o preço dela mostra a chance que o mercado dá para aquela decisão.'],
  };
  const como = document.getElementById('pj-como'), comoBox = document.getElementById('pj-como-box');
  function textoComo() {
    if (!comoBox || !TIT[secao]) return;
    comoBox.innerHTML = `<p>${TIT[secao][2]}</p><p>Os números mudam o tempo todo com os dados de inflação, emprego e atividade e com o que os diretores do banco central falam. Não são uma previsão nossa: mostram o que está no preço.</p>`
      + (window.MMEdu ? '<button type="button" data-licao="copom-e-fed"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>Abrir a lição: Copom, Fed e as probabilidades do mercado</button>' : '');
  }
  if (como && comoBox) {
    como.addEventListener('click', () => { const abre = comoBox.hidden; if (abre) textoComo(); comoBox.hidden = !abre; como.setAttribute('aria-expanded', abre); });
    comoBox.addEventListener('click', (e) => { const b = e.target.closest('[data-licao]'); if (b && window.MMEdu) window.MMEdu.abrir(b.dataset.licao); });
    // fecha ao clicar fora da explicação ou com Esc
    const fechaComo = () => { comoBox.hidden = true; como.setAttribute('aria-expanded', 'false'); };
    document.addEventListener('click', (e) => { if (!comoBox.hidden && !comoBox.contains(e.target) && !como.contains(e.target)) fechaComo(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !comoBox.hidden) fechaComo(); });
  }
  const CHAVE = 'ana_secao';
  // sem escolha salva, abre na primeira seção (Mercado ficou por último a pedido do Severino)
  let secao = SECOES[0][0];
  try { secao = localStorage.getItem(CHAVE) || secao; } catch (e) { /* sem armazenamento */ }
  if (secao === 'juros') secao = 'fed';   // a aba antiga "Fed e Copom" virou duas
  if (!SECOES.some(([k]) => k === secao)) secao = SECOES[0][0];

  const nav = document.createElement('nav');
  nav.className = 'ana-jump';
  nav.setAttribute('aria-label', 'Seções das Análises');
  nav.innerHTML = `<span class="aj-pill" aria-hidden="true"></span>${SECOES.map(([k, t, ic]) => `<button type="button" data-secao="${k}">${icone(ic)}<span>${t}</span></button>`).join('')}`;
  dq.after(nav);

  function pilula() {
    const on = nav.querySelector('button.on'), p = nav.querySelector('.aj-pill');
    if (!on || !p || !on.offsetWidth) return;
    p.style.width = on.offsetWidth + 'px';
    p.style.height = on.offsetHeight + 'px';
    p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }
  function mostra(k, salva = true) {
    secao = k;
    fechaCheia();
    wrap.dataset.secao = k;
    if (TIT[k]) {
      const t = document.getElementById('pj-tit'), f = document.getElementById('pj-desc');
      if (t) t.textContent = TIT[k][0];
      if (f) f.textContent = TIT[k][1];
      if (comoBox && !comoBox.hidden) textoComo();
    }
    nav.querySelectorAll('[data-secao]').forEach((b) => { const on = b.dataset.secao === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (salva) { try { localStorage.setItem(CHAVE, k); } catch (e) { /* sem armazenamento */ } }
    pilula();
    // gráficos desenhados com a largura real: avisa que a área mudou
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    if (k === 'mercado') window.__anaAbrir?.();   // a Análise avançada só busca dados quando aparece
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-secao]'); if (b) mostra(b.dataset.secao); });
  window.addEventListener('resize', pilula);
  // a pílula só tem medida quando a aba está visível
  new MutationObserver(() => requestAnimationFrame(pilula)).observe(document.getElementById('analysis-panel'), { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
  // botão de expandir em cada seção: abre a seção ocupando a tela inteira; Esc ou o mesmo botão fecha
  let cheia = null, marca = null;
  const fechaCheia = () => {
    if (!cheia) return;
    cheia.classList.remove('ana-cheia');
    delete cheia.dataset.ver;
    if (marca && marca.parentNode) marca.parentNode.replaceChild(cheia, marca);   // volta para o lugar
    marca = null;
    const b = cheia.querySelector('.ana-exp');
    if (b) { b.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>'; b.title = 'Expandir em tela cheia'; b.setAttribute('aria-label', b.title); }
    document.documentElement.classList.remove('ana-cheia-on');
    cheia = null;
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };
  const abreCheia = (sec) => {
    fechaCheia();
    cheia = sec;
    // vai para o <body> enquanto expandida: dentro da aba, um elemento pai com transform prenderia o position:fixed
    marca = document.createComment('secao-expandida');
    sec.parentNode.insertBefore(marca, sec);
    document.body.appendChild(sec);
    sec.dataset.ver = secao;
    sec.classList.add('ana-cheia');
    const b = sec.querySelector('.ana-exp');
    if (b) { b.innerHTML = '<i class="fa-solid fa-compress" aria-hidden="true"></i>'; b.title = 'Sair da tela cheia (Esc)'; b.setAttribute('aria-label', b.title); b.focus(); }
    document.documentElement.classList.add('ana-cheia-on');
    sec.scrollTop = 0;
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };
  wrap.querySelectorAll('.ana-extra > .market-section > .market-section-head').forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ana-exp';
    b.title = 'Expandir em tela cheia';
    b.setAttribute('aria-label', b.title);
    b.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
    b.addEventListener('click', () => { const sec = h.parentElement; if (cheia === sec) fechaCheia(); else abreCheia(sec); });
    h.appendChild(b);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cheia) fechaCheia(); });

  // os cartões de destaque levam à seção certa
  window.__anaSecao = (id) => { const k = ALVO[id] || (SECOES.some(([s]) => s === id) ? id : null); if (k) mostra(k); return !!k; };
  nav.classList.add('sem-anim');
  mostra(secao, false);
  requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.remove('sem-anim')));

  const css = document.createElement('style');
  css.textContent = `
  .ana-jump { flex-shrink:0; position:relative; display:flex; gap:4px; width:max-content; max-width:100%; overflow-x:auto; scrollbar-width:none; padding:5px; border:1px solid var(--line); border-radius:14px; background:var(--surface); box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .ana-jump::-webkit-scrollbar { display:none; }
  .ana-jump button { position:relative; z-index:1; display:flex; align-items:center; gap:8px; border:0; background:none; color:var(--text-2); font:inherit; font-size:13.5px; font-weight:500; padding:9px 16px; border-radius:10px; cursor:pointer; white-space:nowrap; transition:color .2s, background .2s, box-shadow .2s, transform .2s; }
  .ana-jump button i { font-size:13px; color:var(--accent-ink); transition:color .2s; }
  .ana-jump button:not(.on):hover { background:var(--surface-2); color:var(--text); box-shadow:0 2px 6px rgba(0,0,0,.1); transform:translateY(-1px); }
  .ana-jump button.on { color:#fff; font-weight:600; }
  .ana-jump button.on i { color:inherit; }
  .ana-jump .pj-flag { width:18px; height:12px; }
  .aj-pill { position:absolute; z-index:0; top:0; left:0; width:0; height:0; border-radius:10px; background:color-mix(in srgb, var(--accent) 72%, #000); box-shadow:0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent); transition:transform .3s var(--ease,ease), width .3s var(--ease,ease), height .3s var(--ease,ease); }
  body:not(.light) .aj-pill { background:var(--accent); }
  body:not(.light) .ana-jump button.on { color:#17120a; }
  .ana-jump.sem-anim .aj-pill { transition:none; }
  .ana-wrap[data-secao]:not([data-secao="mercado"]) > #ana-body,
  .ana-wrap[data-secao="mercado"] > #ana-destaques,
  .ana-wrap[data-secao="mercado"] > .ana-extra,
  .ana-wrap[data-secao="fluxo"] .ana-extra > .market-section:not(#ana-sec-fluxo),
  .ana-wrap[data-secao="fed"] .ana-extra > .market-section:not(#ana-sec-fed),
  .ana-wrap[data-secao="copom"] .ana-extra > .market-section:not(#ana-sec-fed),
  .ana-wrap[data-secao="fed"] #pj-col-br,
  .ana-wrap[data-secao="copom"] #pj-col-eua,
  .ana-wrap[data-secao="cot"] .ana-extra > .market-section:not(#ana-sec-cot),
  .ana-wrap[data-secao="f13"] .ana-extra > .market-section:not(#ana-sec-13f) { display:none !important; }
  /* seções no formato do Resumo semanal: cartão centralizado, título grande e margens fixas (28/10/2026) */
  #analysis-panel .ana-wrap { width:100%; max-width:1180px; margin-left:auto; margin-right:auto; }
  /* a Análise avançada é um painel com colunas lado a lado: usa mais largura */
  #analysis-panel .ana-wrap[data-secao="mercado"] { max-width:1520px; }
  .ana-extra > .market-section { padding:20px 24px 22px; border:1px solid var(--line); border-radius:16px; background:radial-gradient(120% 160% at 0% 0%, var(--accent-soft), transparent 50%), var(--surface); }
  .ana-extra > .market-section > .market-section-head { border-bottom:0; padding-bottom:0; margin-bottom:16px; gap:10px; flex-wrap:wrap; }
  .ana-extra > .market-section > .market-section-head .sec-icon { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:9px; background:var(--accent-soft); border:1px solid var(--accent-line, var(--line)); color:var(--accent-ink); font-size:13px; }
  .ana-extra > .market-section > .market-section-head h2 { font-size:20px; font-weight:700; letter-spacing:-.01em; text-transform:none; color:var(--text); line-height:1.3; }
  .ana-extra > .market-section > .market-section-head::after { background:none; }
  .ana-extra > .market-section > .market-section-head .sec-count { font:11px 'JetBrains Mono', monospace; color:var(--text-3); border:1px solid var(--line); border-radius:99px; padding:2px 8px; }
  /* cabeçalho da seção de juros: ícone grande, título com descrição e o botão "Como funciona?" (30/10/2026) */
  #ana-sec-fed > .pj-head { align-items:center; flex-wrap:nowrap; gap:14px; }
  #ana-sec-fed > .pj-head .sec-icon { width:46px !important; height:46px !important; border-radius:12px !important; font-size:19px !important; flex:none; }
  .pj-cab { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
  .pj-cab h2 { margin:0; font-size:22px !important; }
  .pj-cab p { margin:0; font-size:13px; line-height:1.45; color:var(--text-2); }
  .pj-como { order:4; flex:none; display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--text); font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
  .pj-como i { color:var(--accent-ink); }
  .pj-como:hover, .pj-como[aria-expanded="true"] { border-color:var(--accent-line, var(--line-2)); background:var(--accent-soft); }
  .pj-como-box { margin:-4px 0 16px; padding:14px 16px; border:1px solid var(--accent-line, var(--line)); border-radius:12px; background:var(--surface-2); font-size:13px; line-height:1.6; color:var(--text-2); }
  .pj-como-box p { margin:0 0 8px; }
  .pj-como-box button { display:inline-flex; align-items:center; gap:8px; margin-top:4px; padding:7px 12px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--text); font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
  .pj-como-box button i { color:var(--accent-ink); }
  #analysis-panel .ana-wrap[data-secao="fed"], #analysis-panel .ana-wrap[data-secao="copom"] { max-width:1440px; }
  @media (max-width: 640px) {
    #ana-sec-fed > .pj-head { flex-wrap:wrap; gap:10px 12px; }
    #ana-sec-fed > .pj-head .sec-icon { width:38px !important; height:38px !important; font-size:16px !important; }
    .pj-cab { flex-basis:calc(100% - 100px); }
    .pj-cab h2 { font-size:18px !important; }
  }
  .ana-exp { order:5; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--text-2); font-size:13px; cursor:pointer; transition:color .15s, border-color .15s, background .15s; }
  .ana-exp:hover { color:var(--accent-ink); border-color:var(--accent-line, var(--line-2)); }
  .market-section.ana-cheia { position:fixed; inset:0; z-index:9000; margin:0; border-radius:0; border:0; overflow:auto; overscroll-behavior:contain; --ana-px:max(24px, calc((100vw - 1500px) / 2)); padding:0 var(--ana-px) 40px; background:radial-gradient(80% 60% at 0% 0%, var(--accent-soft), transparent 50%), var(--bg); color:var(--text); }
  .market-section.ana-cheia > .market-section-head { position:sticky; top:0; z-index:3; display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 calc(-1 * var(--ana-px)) 18px; padding:16px var(--ana-px); background:color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter:blur(6px); border-bottom:1px solid var(--line); }
  .market-section.ana-cheia > .market-section-head::after { background:none; }
  .market-section.ana-cheia > .market-section-head .sec-icon { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:9px; background:var(--accent-soft); border:1px solid var(--accent-line, var(--line)); color:var(--accent-ink); font-size:13px; }
  .market-section.ana-cheia > .market-section-head h2 { font-size:20px; font-weight:700; letter-spacing:-.01em; text-transform:none; color:var(--text); }
  .market-section.ana-cheia > .market-section-head .sec-count { margin-left:auto; font:11px 'JetBrains Mono', monospace; color:var(--text-3); border:1px solid var(--line); border-radius:99px; padding:2px 8px; }
  .market-section.ana-cheia[data-ver="fed"] #pj-col-br, .market-section.ana-cheia[data-ver="copom"] #pj-col-eua { display:none; }
  html.ana-cheia-on, html.ana-cheia-on body { overflow:hidden; }
  @media (max-width: 640px) {
    .ana-extra > .market-section { padding:16px 14px 18px; border-radius:14px; }
    .ana-extra > .market-section > .market-section-head h2 { font-size:17px; }
  }
  @media (max-width: 640px) {
    .ana-jump { display:grid; grid-template-columns:1fr 1fr; width:100%; overflow:visible; }
    .ana-jump button { justify-content:center; padding:9px 8px; font-size:13px; white-space:normal; text-align:center; }
    .ana-jump button:not(.on):hover { transform:none; }
  }
  @media (prefers-reduced-motion: reduce) { .aj-pill, .ana-jump button { transition:none; } }
  `;
  document.head.appendChild(css);
})();
