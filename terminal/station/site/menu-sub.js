/* Sub-itens no menu (13/11/2026, pedido do Dante). Regras: no máximo dois níveis; sub-item só quando é uma página
   diferente (filtro fica dentro da página); só a aba aberta mostra os sub-itens no menu lateral, e eles se fecham ao
   sair dela. Abas com sub-itens: Macro e Fluxo (seções do ana-secoes.js), Calendário (agenda, balanços, proventos,
   Focus), Indicadores (Brasil, EUA, Europa) e Fundamentos (empresas e ranking). No celular, o menu "Todas" mostra os
   sub-itens da aba atual abertos e os das outras atrás de uma setinha. A barra de dentro de cada aba continua; as
   duas andam juntas (o menu observa qual botão está marcado na página). */
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = (ic) => `<i class="fa-solid ${ic}" aria-hidden="true"></i>`;
  const FLAG = {
    br: '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.2 10 15 17.8 2.8 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/></svg>',
    us: '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#b22234"/><g fill="#fff"><rect y="1.54" width="30" height="1.54"/><rect y="4.62" width="30" height="1.54"/><rect y="7.69" width="30" height="1.54"/><rect y="10.77" width="30" height="1.54"/><rect y="13.85" width="30" height="1.54"/><rect y="16.92" width="30" height="1.54"/></g><rect width="12" height="10.77" fill="#3c3b6e"/></svg>',
    eu: '<svg class="pj-flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#003399"/><g fill="#ffcc00">' + Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(15 + 6 * Math.cos(a)).toFixed(2)}" cy="${(10 + 6 * Math.sin(a)).toFixed(2)}" r="1"/>`; }).join('') + '</g></svg>',
  };
  const ativa = (aba) => !!document.getElementById(aba)?.classList.contains('active');
  // abas que carregam o conteúdo só quando abertas: espera o botão aparecer e clica nele
  function clicaQuando(sel, ms = 8000) {
    const t0 = Date.now();
    const tenta = () => { const b = document.querySelector(sel); if (b) { b.click(); return; } if (Date.now() - t0 < ms) setTimeout(tenta, 120); };
    tenta();
  }
  const ABAS = [
    {
      aba: 'analysis-panel', nome: 'Macro e Fluxo',
      lista: () => (window.MMAnaSecoes?.lista || []).map(({ k, t, icone }) => [k, t, icone]),
      atual: () => window.MMAnaSecoes?.atual(),
      ir: (k) => window.MMAnaSecoes?.ir(k),
    },
    {
      aba: 'calendar-panel', nome: 'Calendário',
      // o "Investing (original)" continua como botão dentro da Agenda, fora do menu
      lista: () => [['list', 'Agenda econômica', fa('fa-calendar-day')], ['bbr', 'Balanços B3', FLAG.br], ['earn', 'Balanços EUA', FLAG.us], ['prov', 'Proventos', fa('fa-hand-holding-dollar')], ['focus', 'Boletim Focus', fa('fa-chart-line')]],
      atual: () => { const v = document.querySelector('#calendar-panel .ecal-view-btn.active')?.dataset.view; return v === 'iframe' ? 'list' : v; },
      ir: (k) => clicaQuando(`#calendar-panel .ecal-view-btn[data-view="${k}"]`),
    },
    {
      aba: 'indicators-panel', nome: 'Indicadores',
      lista: () => [['br', 'Brasil', FLAG.br], ['us', 'Estados Unidos', FLAG.us], ['eu', 'Europa', FLAG.eu]],
      atual: () => document.querySelector('#ind-root .ind-area button.on')?.dataset.a,
      ir: (k) => clicaQuando(`#ind-root .ind-area button[data-a="${k}"]`),
    },
    {
      aba: 'fund-panel', nome: 'Fundamentos',
      // Brasil e EUA ficam como escolha dentro da página (empresa brasileira ou americana; ranking de cada bolsa)
      lista: () => [['empresa', 'Empresas', fa('fa-building')], ['ranking', 'Ranking', fa('fa-list-ol')]],
      atual: () => { const v = document.querySelector('#fund-root .fd-views button.on')?.dataset.v; return v === 'eua' ? 'empresa' : v; },
      ir: (k) => { if (k === 'empresa' && document.querySelector('#fund-root .fd-views button.on')?.dataset.v === 'eua') return; clicaQuando(`#fund-root .fd-views button[data-v="${k}"]`); },
    },
  ];
  const porAba = new Map(ABAS.map((a) => [a.aba, a]));
  const botoes = (A, cls) => A.lista().map(([k, t, ic]) => `<button type="button" class="${cls}" data-sub-aba="${A.aba}" data-sub-secao="${esc(k)}" title="${esc(t)}">${ic}<span>${esc(t)}</span></button>`).join('');
  function ir(aba, k) {
    const A = porAba.get(aba); if (!A) return;
    if (!ativa(aba)) window.switchTab?.(aba);
    A.ir(k);
    window.scrollTo?.(0, 0);
  }
  const CHEV = '<svg class="si-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  // ---- menu lateral (computador) ----
  const lateral = new Map();
  for (const A of ABAS) {
    const item = document.querySelector(`.side .side-item[data-tab="${A.aba}"]`);
    if (!item || !A.lista().length) continue;
    const id = 'side-sub-' + A.aba;
    item.insertAdjacentHTML('beforeend', CHEV);
    item.setAttribute('aria-expanded', 'false');
    item.setAttribute('aria-controls', id);
    const sub = document.createElement('div');
    sub.className = 'side-sub'; sub.id = id;
    sub.setAttribute('role', 'group');
    sub.setAttribute('aria-label', 'Seções de ' + A.nome);
    sub.innerHTML = botoes(A, 'side-subitem');
    item.after(sub);
    lateral.set(A.aba, { item, sub });
  }
  document.querySelector('.side')?.addEventListener('click', (e) => { const b = e.target.closest('.side-subitem[data-sub-secao]'); if (b) ir(b.dataset.subAba, b.dataset.subSecao); });

  // ---- menu "Todas" do celular ----
  let celularPronto = false;
  function noCelular() {
    const lista = document.getElementById('mobile-navigation-list');
    if (!lista) return false;
    if (celularPronto) return true;
    for (const A of ABAS) {
      const linha = lista.querySelector(`[data-mobile-tab="${A.aba}"]`)?.closest('.mn-row');
      if (!linha || !A.lista().length) continue;
      const d = document.createElement('div');
      d.className = 'mn-sub'; d.id = 'mn-sub-' + A.aba;
      d.setAttribute('role', 'group');
      d.setAttribute('aria-label', 'Seções de ' + A.nome);
      d.innerHTML = botoes(A, 'mn-subitem');
      const seta = document.createElement('button');
      seta.type = 'button'; seta.className = 'mn-abre'; seta.dataset.mnAbre = A.aba;
      seta.setAttribute('aria-controls', d.id);
      seta.setAttribute('aria-label', 'Mostrar as seções de ' + A.nome);
      seta.innerHTML = CHEV;
      linha.querySelector('.mn-pin')?.before(seta);
      linha.after(d);
    }
    lista.addEventListener('click', (e) => {
      const s = e.target.closest('[data-mn-abre]');
      if (s) { const d = document.getElementById('mn-sub-' + s.dataset.mnAbre); if (d) { d.classList.toggle('aberto'); if (d.classList.contains('aberto')) d.dataset.manual = '1'; else delete d.dataset.manual; s.setAttribute('aria-expanded', String(d.classList.contains('aberto'))); } return; }
      const b = e.target.closest('.mn-subitem[data-sub-secao]'); if (!b) return;
      lista.hidden = true;
      document.querySelector('#mobile-navigation .mn-all')?.setAttribute('aria-expanded', 'false');
      ir(b.dataset.subAba, b.dataset.subSecao);
    });
    celularPronto = true;
    sync();
    return true;
  }
  if (!noCelular()) { let n = 0; const t = setInterval(() => { if (noCelular() || ++n > 20) clearInterval(t); }, 500); }

  // ---- marcar a seção atual e abrir/fechar com a aba ----
  function sync() {
    for (const A of ABAS) {
      const aberta = ativa(A.aba), atual = aberta ? A.atual() : null;
      const l = lateral.get(A.aba);
      if (l) { l.sub.classList.toggle('aberto', aberta); l.item.setAttribute('aria-expanded', String(aberta)); }
      const m = document.getElementById('mn-sub-' + A.aba);
      if (m && aberta && !m.dataset.visto) { m.classList.add('aberto'); m.dataset.visto = '1'; }
      if (m && !aberta) delete m.dataset.visto;
      if (m && !aberta && m.classList.contains('aberto') && !m.dataset.manual) m.classList.remove('aberto');
      document.querySelector(`[data-mn-abre="${A.aba}"]`)?.setAttribute('aria-expanded', String(!!m?.classList.contains('aberto')));
      document.querySelectorAll(`[data-sub-aba="${A.aba}"]`).forEach((b) => {
        const on = aberta && b.dataset.subSecao === atual;
        b.classList.toggle('on', on);
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
  }
  let pedido = 0;
  const agenda = () => { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; sync(); }); };
  document.addEventListener('mm-ana-secao', agenda);
  for (const A of ABAS) {
    const p = document.getElementById(A.aba);
    // a aba abre/fecha (classe do painel) e o botão marcado lá dentro muda (classe dos botões)
    if (p) new MutationObserver(agenda).observe(p, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
  sync();

  const css = document.createElement('style');
  css.textContent = `
  .side-item .si-chev { flex:0 0 auto; opacity:.45; transition:transform .2s ease; }
  .side-item[aria-expanded="true"] .si-chev { transform:rotate(90deg); opacity:.8; }
  body.side-collapsed .side-item .si-chev { display:none; }
  .side-sub { margin:0 0 0 22px; border-left:1px solid var(--line); padding-left:6px; overflow:hidden; max-height:0; opacity:0; transition:max-height .22s ease, opacity .18s ease, margin .22s ease; }
  .side-sub.aberto { max-height:320px; opacity:1; margin-top:2px; margin-bottom:6px; }
  body.side-collapsed .side-sub { display:none; }
  .side-subitem { display:flex; align-items:center; gap:9px; width:100%; padding:6px 10px; margin:1px 0; border:0; border-radius:8px; background:none; color:var(--text-3); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
  .side-subitem:hover { background:var(--surface-2); color:var(--text); }
  .side-subitem.on { color:var(--accent-ink, var(--text)); background:var(--accent-soft); font-weight:600; }
  .side-subitem i, .mn-subitem i { width:16px; text-align:center; font-size:12px; opacity:.85; }
  .side-subitem .pj-flag, .mn-subitem .pj-flag { width:16px; height:11px; border-radius:2px; flex:none; }
  .side-subitem span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #mobile-navigation .mn-sub { display:none; flex-direction:column; margin:0 0 6px 30px; padding-left:8px; border-left:1px solid var(--line); }
  #mobile-navigation .mn-sub.aberto { display:flex; }
  #mobile-navigation .mn-sub .mn-subitem { display:flex; align-items:center; gap:10px; width:100%; min-height:38px; padding:6px 10px; font-size:13.5px; text-align:left; justify-content:flex-start; color:var(--text-2); }
  #mobile-navigation .mn-sub .mn-subitem.on { color:var(--accent); font-weight:600; }
  #mobile-navigation .mn-abre { flex:0 0 auto; width:40px; min-height:40px; display:inline-flex; align-items:center; justify-content:center; border:0; background:none; color:var(--text-3); cursor:pointer; padding:0; }
  #mobile-navigation .mn-abre .si-chev { transition:transform .2s ease; }
  #mobile-navigation .mn-abre[aria-expanded="true"] .si-chev { transform:rotate(90deg); color:var(--text); }
  `;
  document.head.appendChild(css);
})();
