/* =========================================================
   AJUSTES DO PAINEL (engrenagem no topo, Alt+A)
   Tema (escuro, claro, automático, por horário), cor de destaque, papel de parede
   (padrões, aurora ou imagem própria), vidro, tamanho, densidade, cores de alta/baixa,
   animações, aba inicial, faixa do topo, tela cheia, limpeza de cache e atalhos.
   Os ajustes ficam em localStorage "trader_prefs_v1"; a imagem própria em "trader_wallpaper_img".
   O <head> do index.html aplica tudo antes da página aparecer; aqui fica o painel.
   ========================================================= */
(() => {
  if (window.__ajustesLoaded) return;
  window.__ajustesLoaded = true;

  const KEY = 'trader_prefs_v1', IMG_KEY = 'trader_wallpaper_img';
  // frasesTopo: faixa de frases no topo, desligada por padrão (a chave antiga "frases" era salva como 'on' para todos e fica ignorada)
  const DEF = {
    mode: 'manual', dayFrom: 7, dayTo: 19, accent: 'ambar', wp: 'grade', wpOp: 1, wpUrl: '', wpDim: 55, wpBlur: 0,
    mesaLayout: null, cardSource: false, cardTime: false, glass: false, density: 'normal', scale: 1, updown: 'padrao', motion: 'on', ticker: 'on', frasesTopo: 'off', startTab: ''
  };
  let P;
  try { P = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch (e) { P = { ...DEF }; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { toast('Sem espaço no navegador para salvar os ajustes.'); } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const H = document.documentElement;
  let deskApplied;
  const toast = (m) => { if (typeof window.toast === 'function') window.toast(m); };

  const ACCENTS = [
    ['ambar', 'Âmbar', '#f4b740'], ['azul', 'Azul', '#5b9dff'], ['verde', 'Verde', '#34d399'], ['ciano', 'Ciano', '#22d3ee'],
    ['roxo', 'Roxo', '#a78bfa'], ['rosa', 'Rosa', '#f472b6'], ['laranja', 'Laranja', '#fb923c'], ['prata', 'Prata', '#cbd5e1']
  ];
  const WPS = [
    ['grade', 'Grade'], ['pontos', 'Pontos'], ['aurora', 'Aurora'], ['candles', 'Candles'],
    ['ondas', 'Ondas'], ['hex', 'Colmeia'], ['diagonal', 'Diagonais'], ['nenhum', 'Liso'], ['imagem', 'Sua imagem']
  ];
  const MODES = [['dark', 'Escuro', 'fa-moon'], ['light', 'Claro', 'fa-sun'], ['auto', 'Automático', 'fa-desktop'], ['hour', 'Por horário', 'fa-clock']];

  /* ---------------- aplicar ---------------- */
  function applyAll() {
    const d = H.dataset;
    const set = (k, v) => { if (v == null) delete d[k]; else d[k] = v; };
    set('accent', P.accent !== 'ambar' ? P.accent : null);
    let wp = P.wp;
    if (wp === 'imagem') {
      const src = P.wpUrl || localStorage.getItem(IMG_KEY);
      if (src) H.style.setProperty('--wp-img', `url("${String(src).replace(/"/g, '%22')}")`); else wp = 'grade';
      H.style.setProperty('--wp-dim', P.wpDim + '%');
      H.style.setProperty('--wp-blur', P.wpBlur + 'px');
    }
    set('wp', wp !== 'grade' ? wp : null);
    H.style.setProperty('--wp-op', P.wpOp);
    set('glass', P.glass ? 'on' : null);
    set('density', P.density === 'compact' ? 'compact' : null);
    set('scale', P.scale !== 1 ? String(P.scale) : null);
    H.style.setProperty('--ui-zoom', P.scale);
    set('updown', P.updown !== 'padrao' ? P.updown : null);
    set('motion', P.motion === 'off' ? 'off' : null);
    set('ticker', P.ticker === 'off' ? 'off' : null);
    set('cardSource', P.cardSource === true ? 'on' : null);
    set('cardTime', P.cardTime === true ? 'on' : null);
    const deskValue = JSON.stringify(P.mesaLayout || null);
    if (deskValue !== deskApplied) { deskApplied = deskValue; window.dispatchEvent(new Event('mesa-layout-changed')); }
  }
  // tema: o painel principal guarda escuro/claro; aqui decidimos quando é automático
  const wantTheme = () => (P.mode === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : P.mode === 'hour' ? (() => { const h = new Date().getHours(); return h >= P.dayFrom && h < P.dayTo ? 'light' : 'dark'; })()
      : null);
  function syncTheme(force) {
    const t = force || wantTheme();
    if (!t) return;
    if (document.body.classList.contains('light') !== (t === 'light') && typeof window.applyTheme === 'function') window.applyTheme(t);
  }
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (P.mode === 'auto') syncTheme(); });
  setInterval(() => { if (P.mode === 'hour') syncTheme(); }, 60 * 1000);
  // o botão de lua/sol e o Alt+L voltam para o modo manual
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    if (P.mode === 'auto' || P.mode === 'hour') { P.mode = 'manual'; save(); }
    if (box && !box.hidden) setTimeout(render, 30);
  });
  const curMode = () => (P.mode === 'manual' ? (document.body.classList.contains('light') ? 'light' : 'dark') : P.mode);

  /* ---------------- painel ---------------- */
  let box = null, lastFocus = null, mesaDragging = null;
  function tabsList() {
    return [...document.querySelectorAll('.tab-btn[data-tab]')].map((b) => [b.dataset.tab, [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()]);
  }
  const seg = (name, opts, cur) => `<div class="aj-seg" role="radiogroup">${opts.map(([v, l, ic]) => `<button type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-set="${name}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${ic ? `<i class="fas ${ic}"></i>` : ''}${l}</button>`).join('')}</div>`;
  const sw = (name, on, label) => `<button type="button" class="aj-sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-toggle="${name}"><span class="aj-knob"></span><span class="aj-sw-l">${label}</span></button>`;
  function storageKB() {
    let n = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) { /* bloqueado */ }
    return Math.round(n / 1024);
  }
  function render() {
    if (!box) return;
    const hasImg = !!(P.wpUrl || localStorage.getItem(IMG_KEY));
    const live = document.getElementById('live-toggle');
    const liveOn = live ? live.classList.contains('on') : null;
    const scroll = box.querySelector('.aj-body')?.scrollTop || 0;
    const C = window.__conta;
    box.querySelector('.aj-body').innerHTML = `
      ${C && C.logado ? `<section class="aj-sec">
        <h3>Conta</h3>
        <p class="aj-conta"><b>${esc(C.nome)}</b><span>${esc(C.email)}</span>${C.expira ? `<span>Acesso até ${new Date(C.expira).toLocaleDateString('pt-BR')}</span>` : ''}</p>
        <div class="aj-btns">
          ${C.admin ? `<a class="btn-sm" href="/admin"><i class="fas fa-user-check"></i> Cadastros${C.pendentes ? ` <span class="aj-pend">${C.pendentes} aguardando</span>` : ''}</a>` : ''}
          <a class="btn-sm" href="/conta"><i class="fas fa-user-cog"></i> Minha conta</a>
          ${C.admin ? '' : `<a class="btn-sm" href="/assinar"><i class="fas fa-receipt"></i> Assinatura</a>`}
          <button type="button" class="btn-sm" data-act="sair"><i class="fas fa-sign-out-alt"></i> Sair</button>
        </div>
      </section>` : ''}
      <section class="aj-sec">
        <h3>Tema</h3>
        ${seg('mode', MODES, curMode())}
        <p class="aj-note">${P.mode === 'auto' ? 'Segue o tema do seu computador ou celular e troca sozinho.' : P.mode === 'hour'
          ? `Claro das <select data-num="dayFrom">${[...Array(24).keys()].map((h) => `<option ${h === P.dayFrom ? 'selected' : ''} value="${h}">${h}h</option>`).join('')}</select> às <select data-num="dayTo">${[...Array(24).keys()].map((h) => `<option ${h === P.dayTo ? 'selected' : ''} value="${h}">${h}h</option>`).join('')}</select>, escuro no resto do dia.`
          : 'A chave Aparência na barra lateral (ou Alt+L) também troca.'}</p>
      </section>
      <section class="aj-sec">
        <h3>Cor de destaque</h3>
        <div class="aj-swatches">${ACCENTS.map(([v, l, c]) => `<button type="button" data-set="accent" data-v="${v}" class="aj-swatch ${P.accent === v ? 'on' : ''}" style="--c:${c}" title="${l}" aria-label="${l}"><i></i><span>${l}</span></button>`).join('')}</div>
      </section>
      <section class="aj-sec">
        <h3>Papel de parede</h3>
        <div class="aj-wps">${WPS.map(([v, l]) => `<button type="button" data-set="wp" data-v="${v}" class="aj-wp ${P.wp === v ? 'on' : ''}"><span class="aj-wp-prev wp-${v}" ${v === 'imagem' && hasImg ? `style="background-image:var(--wp-img-prev)"` : ''}>${v === 'imagem' && !hasImg ? '<i class="fas fa-image"></i>' : ''}</span><span>${l}</span></button>`).join('')}</div>
        ${P.wp === 'imagem' ? `
          <div class="aj-img">
            <label class="btn-sm aj-file"><i class="fas fa-upload"></i> Escolher imagem<input type="file" accept="image/*" id="aj-file" hidden></label>
            <div class="aj-url"><input type="url" id="aj-url" placeholder="ou cole o link de uma imagem (https://...)" value="${esc(P.wpUrl)}"><button type="button" class="btn-sm" data-act="url">Usar</button></div>
            ${hasImg ? `<button type="button" class="aj-link" data-act="rmimg">Remover imagem</button>` : '<p class="aj-note">A imagem fica salva só neste navegador. Fotos grandes são reduzidas automaticamente.</p>'}
          </div>
          <label class="aj-range"><span>Escurecer <b>${P.wpDim}%</b></span><input type="range" min="0" max="90" step="5" value="${P.wpDim}" data-num="wpDim"></label>
          <label class="aj-range"><span>Desfoque <b>${P.wpBlur}px</b></span><input type="range" min="0" max="24" step="1" value="${P.wpBlur}" data-num="wpBlur"></label>`
          : P.wp !== 'nenhum' ? `<label class="aj-range"><span>Intensidade <b>${Math.round(P.wpOp * 100)}%</b></span><input type="range" min="0.2" max="1.6" step="0.1" value="${P.wpOp}" data-num="wpOp"></label>` : ''}
        ${sw('glass', P.glass, 'Cartões de vidro (deixam o fundo aparecer)')}
      </section>
      <section class="aj-sec">
        <h3>Leitura</h3>
        <div class="aj-row"><span>Tamanho</span>${seg('scale', [[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.2, '120%']], P.scale)}</div>
        <div class="aj-row"><span>Densidade</span>${seg('density', [['normal', 'Confortável'], ['compact', 'Compacta']], P.density)}</div>
        <div class="aj-row"><span>Alta e baixa</span>${seg('updown', [['padrao', 'Verde e vermelho'], ['cb', 'Azul e laranja'], ['asia', 'Invertido']], P.updown)}</div>
        <div class="aj-updown"><span class="up">+1,25%</span><span class="dn">−0,80%</span><em>${P.updown === 'cb' ? 'Mais fácil de distinguir para quem tem daltonismo.' : P.updown === 'asia' ? 'Padrão da China e do Japão: vermelho sobe, verde cai.' : 'Padrão brasileiro e americano.'}</em></div>
        ${sw('motion', P.motion !== 'off', 'Animações e transições')}
      </section>
      <section class="aj-sec">
        <h3>Exibição dos cards</h3>
        ${sw('cardSource', P.cardSource === true, 'Mostrar fonte')}
        ${sw('cardTime', P.cardTime === true, 'Mostrar data e horário')}
      </section>
      <section class="aj-sec">
        <h3>Painel</h3>
        <div class="aj-row"><span>Abrir sempre em</span><select data-str="startTab" aria-label="Abrir sempre em"><option value="">Última aba usada</option>${tabsList().map(([id, l]) => `<option value="${id}" ${P.startTab === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${sw('ticker', P.ticker !== 'off', 'Faixa de cotações no topo')}
        ${liveOn != null ? sw('live', liveOn, 'Atualização automática das cotações (5 min no pregão, 15 min fora)') : ''}
        <button type="button" class="btn-sm aj-wide" data-act="full"><i class="fas fa-${document.fullscreenElement ? 'compress' : 'expand'}"></i> ${document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia (bom para monitor extra)'}</button>
      </section>
      <section class="aj-sec">
        <h3>Minha Mesa</h3>
        ${window.MMDeskLayout ? window.MMDeskLayout.editor(P.mesaLayout) : '<p class="aj-note">Recarregue a página para personalizar a Mesa.</p>'}
      </section>
      <section class="aj-sec">
        <h3>Dados</h3>
        <p class="aj-note">Este navegador guarda ${storageKB()} KB do painel: cotações, histórico, indicadores, notícias, suas notas e estratégias.</p>
        <div class="aj-btns">
          <button type="button" class="btn-sm" data-act="cache"><i class="fas fa-broom"></i> Limpar cache de dados</button>
          <button type="button" class="btn-sm" data-act="backup"><i class="fas fa-database"></i> Backup</button>
          <button type="button" class="btn-sm" data-act="reset"><i class="fas fa-undo"></i> Restaurar ajustes</button>
        </div>
        <p class="aj-note">Limpar o cache baixa tudo de novo, sem apagar notas, compromissos, estratégias salvas nem estes ajustes.</p>
      </section>
      <section class="aj-sec">
        <h3>Atalhos de teclado</h3>
        <dl class="aj-keys">
          <dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Buscar ativo, aba ou ação</dd>
          <dt><kbd>Alt</kbd> <kbd>A</kbd></dt><dd>Abrir estes ajustes</dd>
          <dt><kbd>Alt</kbd> <kbd>L</kbd></dt><dd>Trocar tema claro e escuro</dd>
          <dt><kbd>Alt</kbd> <kbd>R</kbd></dt><dd>Atualizar cotações e notícias</dd>
          <dt><kbd>Alt</kbd> <kbd>M</kbd></dt><dd>Resumo para o cliente</dd>
          <dt><kbd>Esc</kbd></dt><dd>Fechar janelas</dd>
        </dl>
      </section>
      <section class="aj-sec aj-sobre">
        <h3>Sobre</h3>
        <div class="site-foot">${document.getElementById('site-foot')?.innerHTML || ''}</div>
        <p class="aj-note"><b>Aba Mercado:</b> cotações do Yahoo Finance pelo servidor do painel. Ponto verde: preço em tempo real (câmbio pela Deriv; dólar, VIX e futuros pela Capital.com em CFD; cripto pela Binance em USDT), com a Atualização automática ligada. Horários em Brasília. A situação do pregão considera os feriados da B3, da bolsa de Nova York, da Xetra (cartão Europa) e da bolsa de Tóquio (cartão Ásia); os futuros da CME fecham no Natal, no Ano-Novo e na Sexta-feira Santa e param às 13h de Nova York nos outros feriados americanos. O cartão Moedas segue o câmbio à vista, que negocia sem pausa de domingo a sexta, das 17h às 17h de Nova York.</p>
      </section>`;
    const img = P.wpUrl || localStorage.getItem(IMG_KEY);
    if (img) box.style.setProperty('--wp-img-prev', `url("${String(img).replace(/"/g, '%22')}")`);
    box.querySelector('.aj-body').scrollTop = scroll;
  }

  function build() {
    box = document.createElement('div');
    box.className = 'aj';
    box.hidden = true;
    box.innerHTML = `<div class="aj-scrim" data-act="close"></div>
      <aside class="aj-panel" role="dialog" aria-modal="true" aria-labelledby="aj-title">
        <header class="aj-head"><span class="aj-ic"><i class="fas fa-cog"></i></span><div><h2 id="aj-title">Ajustes</h2><p>Mudanças aplicadas na hora e salvas neste navegador</p></div>
          <button type="button" class="aj-x" data-act="close" aria-label="Fechar"><i class="fas fa-times"></i></button></header>
        <div class="aj-body"></div>
      </aside>`;
    document.body.appendChild(box);
    box.addEventListener('click', onClick);
    box.addEventListener('input', onInput);
    box.addEventListener('change', onChange);
    box.addEventListener('dragstart', e => {
      const handle = e.target.closest('.aj-mesa-grip');
      if (!handle) return;
      mesaDragging = handle.closest('[data-mesa-block]')?.dataset.mesaBlock;
      if (mesaDragging && e.dataTransfer) { e.dataTransfer.setData('text/plain', mesaDragging); e.dataTransfer.effectAllowed = 'move'; }
    });
    box.addEventListener('dragover', e => {
      const row = e.target.closest('[data-mesa-block]');
      if (!mesaDragging || !row) return;
      e.preventDefault();
      box.querySelectorAll('.aj-mesa-drop').forEach(n => n.classList.remove('aj-mesa-drop'));
      row.classList.add('aj-mesa-drop');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    box.addEventListener('drop', e => {
      const row = e.target.closest('[data-mesa-block]');
      if (!mesaDragging || !row || !window.MMDeskLayout) return;
      e.preventDefault();
      P.mesaLayout = window.MMDeskLayout.before(P.mesaLayout, mesaDragging, row.dataset.mesaBlock);
      mesaDragging = null; save(); applyAll(); render();
    });
    box.addEventListener('dragend', () => {
      mesaDragging = null;
      box.querySelectorAll('.aj-mesa-drop').forEach(n => n.classList.remove('aj-mesa-drop'));
    });
  }
  function open() {
    if (!box) build();
    lastFocus = document.activeElement;
    render();
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('on'));
    setTimeout(() => box.querySelector('.aj-x')?.focus(), 60);
  }
  function close() {
    if (!box || box.hidden) return;
    box.classList.remove('on');
    setTimeout(() => { box.hidden = true; }, 220);
    lastFocus?.focus?.();
  }
  window.openSettings = open;
  window.addEventListener('prefs-changed', () => { try { P.frasesTopo = (JSON.parse(localStorage.getItem(KEY) || '{}') || {}).frasesTopo === 'on' ? 'on' : 'off'; } catch (e) { /* nada */ } if (box && !box.hidden) render(); });

  /* ---------------- interação ---------------- */
  function onClick(e) {
    const b = e.target.closest('[data-act], [data-set], [data-toggle]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') return close();
    if (act && act.startsWith('mesa-') && window.MMDeskLayout) {
      const id = b.dataset.mesaId;
      if (act === 'mesa-reset') P.mesaLayout = null;
      else if (act === 'mesa-toggle') P.mesaLayout = window.MMDeskLayout.toggle(P.mesaLayout, id);
      else if (act === 'mesa-up' || act === 'mesa-down') P.mesaLayout = window.MMDeskLayout.move(P.mesaLayout, id, act === 'mesa-up' ? -1 : 1);
      else return;
      save(); applyAll(); render();
      const candidates = [...box.querySelectorAll('button[data-act]')];
      const focus = candidates.find(n => n.dataset.act === act && n.dataset.mesaId === id && !n.disabled)
        || candidates.find(n => n.dataset.act === 'mesa-toggle' && n.dataset.mesaId === id);
      focus?.focus(); return;
    }
    if (b.dataset.set) {
      const k = b.dataset.set, raw = b.dataset.v;
      if (k === 'mode') {
        if (raw === 'dark' || raw === 'light') { P.mode = 'manual'; save(); syncTheme(raw); }
        else { P.mode = raw; save(); syncTheme(); }
      } else {
        P[k] = k === 'scale' ? +raw : raw;
        if (k === 'wp' && raw === 'imagem' && !P.wpUrl && !localStorage.getItem(IMG_KEY)) { save(); render(); return; }
        if (k === 'wp' && raw === 'imagem' && !P.glassAsked) { P.glass = true; P.glassAsked = true; }
        save(); applyAll();
        if (k === 'scale' || k === 'density') window.dispatchEvent(new Event('resize'));
      }
      return render();
    }
    if (b.dataset.toggle) {
      const k = b.dataset.toggle;
      if (k === 'glass') P.glass = !P.glass;
      if (k === 'cardSource' || k === 'cardTime') P[k] = P[k] !== true;
      if (k === 'motion') P.motion = P.motion === 'off' ? 'on' : 'off';
      if (k === 'ticker') P.ticker = P.ticker === 'off' ? 'on' : 'off';
      if (k === 'frasesTopo') { P.frasesTopo = P.frasesTopo === 'on' ? 'off' : 'on'; save(); window.__frasesSync?.(); }
      if (k === 'live') document.getElementById('live-toggle')?.click();
      save(); applyAll();
      return setTimeout(render, k === 'live' ? 60 : 0);
    }
    if (act === 'url') {
      const v = box.querySelector('#aj-url').value.trim();
      if (v && !/^https:\/\//i.test(v)) { toast('Use um link que comece com https://'); return; }
      P.wpUrl = v; P.wp = 'imagem'; save(); applyAll(); return render();
    }
    if (act === 'rmimg') { try { localStorage.removeItem(IMG_KEY); } catch (e2) { /* nada */ } P.wpUrl = ''; P.wp = 'grade'; save(); applyAll(); return render(); }
    if (act === 'full') {
      const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
      Promise.resolve(p).catch(() => toast('O navegador não permitiu a tela cheia.')).finally(() => setTimeout(render, 150));
      return;
    }
    if (act === 'sair') {
      b.disabled = true;
      window.__mmLoggingOut = true;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10000);
      fetch('/api/auth/sair', { method: 'POST', credentials: 'same-origin', signal: ctrl.signal }).then(async (r) => {
        if (!r.ok || (await r.json()).ok !== true) throw new Error('Saída não confirmada');
        const limpa = [];
        try { if (window.caches) limpa.push(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))); } catch (e2) { /* nada */ }
        try { if (navigator.serviceWorker) limpa.push(navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister())))); } catch (e2) { /* nada */ }
        return Promise.all(limpa).catch(() => null);
      }).then(() => location.replace('/entrar')).catch(() => {
        window.__mmLoggingOut = false;
        b.disabled = false;
        toast('Não foi possível confirmar a saída. Verifique sua conexão e tente novamente.');
      }).finally(() => clearTimeout(timeout));
      return;
    }
    if (act === 'backup') { close(); setTimeout(() => document.getElementById('backup-btn')?.click(), 230); return; }
    if (act === 'cache') {
      if (!confirm('Limpar o cache de dados? As cotações, indicadores e notícias serão baixados de novo. Notas, compromissos, estratégias e ajustes ficam.')) return;
      const keep = new Set([KEY, IMG_KEY, 'trader_theme', 'trader_active_tab', 'trader_live_mode', 'trader_calendar_notes_v1', 'trader_heatmap_source',
        'opt_state_v1', 'opt_saved_v1', 'opt_quiz_v1', 'trader_watchlist_v1', 'trader_resumo_semanal_v1', 'calc_state_v1', 'ind_prefs_v1', 'assessor_analise', 'trader_read_articles']);
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!keep.has(k) && !/notes|compromisso|ecal_prefs|prefs/i.test(k)) drop.push(k); }
      drop.forEach((k) => localStorage.removeItem(k));
      toast(`Cache limpo (${drop.length} itens). Recarregando…`);
      setTimeout(() => location.reload(), 700);
      return;
    }
    if (act === 'reset') {
      if (!confirm('Voltar todos os ajustes ao padrão? (A imagem de fundo também é removida.)')) return;
      P = { ...DEF };
      try { localStorage.removeItem(KEY); localStorage.removeItem(IMG_KEY); } catch (e2) { /* nada */ }
      applyAll(); syncTheme('dark'); render();
      window.dispatchEvent(new Event('resize'));
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.num && t.type === 'range') {
      P[t.dataset.num] = +t.value;
      save(); applyAll();
      const b = t.closest('.aj-range')?.querySelector('b');
      if (b) b.textContent = t.dataset.num === 'wpOp' ? Math.round(P.wpOp * 100) + '%' : t.dataset.num === 'wpBlur' ? P.wpBlur + 'px' : P.wpDim + '%';
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'aj-file' && t.files && t.files[0]) return loadImage(t.files[0]);
    if (t.dataset.num && t.tagName === 'SELECT') { P[t.dataset.num] = +t.value; save(); syncTheme(); return; }
    if (t.dataset.str) { P[t.dataset.str] = t.value; save(); if (!t.value) toast('O painel vai abrir na última aba usada.'); }
  }
  // reduz a foto (no máximo 1920 px, JPEG) para caber no armazenamento do navegador
  function loadImage(file) {
    if (!/^image\//.test(file.type)) { toast('Escolha um arquivo de imagem.'); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1920 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/jpeg', 0.82);
      if (data.length > 1.6e6) data = c.toDataURL('image/jpeg', 0.6);
      try { localStorage.setItem(IMG_KEY, data); }
      catch (err) { toast('Imagem grande demais para guardar no navegador. Tente outra ou use um link.'); return; }
      P.wpUrl = ''; P.wp = 'imagem';
      if (!P.glassAsked) { P.glass = true; P.glassAsked = true; }
      save(); applyAll(); render();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Não foi possível abrir essa imagem.'); };
    img.src = url;
  }

  /* ---------------- conta (login do site) ---------------- */
  fetch('/api/auth/eu', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((c) => {
    if (!c || !c.logado) return;
    window.__conta = c;
    if (box && !box.hidden) render();
    // acesso perto de terminar: lembra uma vez por dia
    const falta = c.expira ? (Date.parse(c.expira) - Date.now()) / 864e5 : Infinity;
    if (falta <= 3) {
      // uma vez por visita: aparece de novo ao abrir o site numa aba nova
      let visto = false; const k = 'mm_venc_popup';
      try { visto = sessionStorage.getItem(k) === c.expira; sessionStorage.setItem(k, c.expira); } catch (e) { /* nada */ }
      if (!visto && !c.admin) setTimeout(() => avisoVencimento(c, falta), 1500);
    }
    if (c.admin && c.pendentes) {
      let avisado = false;
      try { avisado = sessionStorage.getItem('mm_pend_avisado') === String(c.pendentes); sessionStorage.setItem('mm_pend_avisado', String(c.pendentes)); } catch (e) { /* nada */ }
      if (!avisado) setTimeout(() => toast(`${c.pendentes} ${c.pendentes > 1 ? 'cadastros aguardam' : 'cadastro aguarda'} sua liberação. Veja em Ajustes > Conta.`), 2500);
    }
  }).catch(() => null);

  /* ---------------- aviso de vencimento com os planos ---------------- */
  function avisoVencimento(c, falta) {
    const ate = new Date(c.expira).toLocaleDateString('pt-BR');
    const reais = (v) => 'R$ ' + (v / 100).toFixed(2).replace('.', ',');
    fetch('/api/assinatura', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      const planos = (j && j.pix && j.planos) || [];
      const dias = Math.ceil(falta);
      const quando = falta <= 0 ? 'terminou' : dias <= 1 ? 'termina amanhã' : `termina em ${dias} dias`;
      const el = document.createElement('div');
      el.className = 'mm-venc';
      el.innerHTML = `<div class="mm-venc-scrim"></div>
        <div class="mm-venc-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mm-venc-t">
          <h2 id="mm-venc-t">Seu acesso ${quando}</h2>
          <p>Ele vale até <b>${ate}</b>. Escolha um plano para continuar usando o Mercado Macro sem interrupção. Se renovar agora, o novo período começa depois dessa data.</p>
          ${planos.length ? `<div class="mm-venc-pl">${planos.map((p) => `<a href="/assinar?plano=${encodeURIComponent(p.id)}"><b>${esc(p.nome)}</b><strong>${reais(p.valor)}</strong><span>${esc(p.periodo)}${p.id === 'trimestral' || p.id === 'semestral' ? ` · ${reais(Math.round(p.valor / (p.id === 'trimestral' ? 3 : 6)))} por mês` : ''}</span></a>`).join('')}</div>
          <p class="mm-venc-nota">Pagamento por Pix, sem renovação automática.</p>` : ''}
          <div class="mm-venc-ac"><button type="button" data-x>Agora não</button><a href="/assinar">Ver assinatura</a></div>
        </div>`;
      const fechar = () => { el.remove(); document.removeEventListener('keydown', esc_); };
      const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
      el.addEventListener('click', (e) => { if (e.target.closest('[data-x]') || e.target.classList.contains('mm-venc-scrim')) fechar(); });
      document.addEventListener('keydown', esc_);
      document.body.appendChild(el);
      el.querySelector('.mm-venc-box').focus();
    });
  }

  /* ---------------- pontos de entrada ---------------- */
  document.getElementById('settings-btn')?.addEventListener('click', open);
  // Ajustes fica só na engrenagem do topo (barra lateral v5)
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyA') { e.preventDefault(); box && !box.hidden ? close() : open(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); open(); return; }
    if (e.key === 'Escape' && box && !box.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  document.addEventListener('fullscreenchange', () => { if (box && !box.hidden) render(); });

  /* ---------------- estilos do painel ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  .mm-venc { position:fixed; inset:0; z-index:9500; display:flex; align-items:center; justify-content:center; padding:16px; }
  .mm-venc-scrim { position:absolute; inset:0; background:rgba(3,6,12,.6); }
  .mm-venc-box { position:relative; width:min(560px,100%); max-height:calc(100vh - 32px); overflow:auto; background:var(--surface); border:1px solid var(--line-2); border-radius:14px; box-shadow:var(--shadow-lg); padding:22px; color:var(--text); outline:none; }
  .mm-venc-box h2 { margin:0 0 8px; font-size:20px; }
  .mm-venc-box p { margin:0 0 14px; color:var(--text-2); font-size:14px; line-height:1.5; }
  .mm-venc-box p b { color:var(--text); }
  .mm-venc-pl { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin:0 0 10px; }
  .mm-venc-pl a { display:flex; flex-direction:column; gap:3px; padding:12px; border:1px solid var(--line-2); border-radius:10px; background:var(--surface-2); color:var(--text); text-decoration:none; }
  .mm-venc-pl a:hover, .mm-venc-pl a:focus-visible { border-color:var(--accent); outline:none; }
  .mm-venc-pl b { font-size:13px; } .mm-venc-pl strong { font-size:19px; } .mm-venc-pl span { font-size:11.5px; color:var(--text-3); }
  .mm-venc-box .mm-venc-nota { font-size:12px; color:var(--text-3); }
  .mm-venc-ac { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
  .mm-venc-ac button, .mm-venc-ac a { min-height:40px; padding:9px 16px; border-radius:8px; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; }
  .mm-venc-ac button { background:none; border:1px solid var(--line-2); color:var(--text-2); }
  .mm-venc-ac a { background:var(--accent); color:var(--on-accent); border:1px solid transparent; }
  .aj { position:fixed; inset:0; z-index:9000; }
  .aj-scrim { position:absolute; inset:0; background:rgba(3,6,12,.45); opacity:0; transition:opacity .2s; }
  .aj.on .aj-scrim { opacity:1; }
  .aj-panel { position:absolute; top:0; right:0; bottom:0; width:min(420px, 100%); display:flex; flex-direction:column; background:var(--surface); border-left:1px solid var(--line-2); box-shadow:var(--shadow-lg);
    transform:translateX(102%); transition:transform .24s var(--ease, ease); }
  .aj.on .aj-panel { transform:none; }
  .aj-head { display:flex; align-items:center; gap:12px; padding:18px 18px 14px; border-bottom:1px solid var(--line); }
  .aj-ic { width:34px; height:34px; border-radius:10px; display:grid; place-items:center; background:var(--accent-soft); border:1px solid var(--accent-line); color:var(--accent-ink); }
  .aj-head h2 { margin:0; font-size:16px; color:var(--text); letter-spacing:-.01em; }
  .aj-head p { margin:2px 0 0; font-size:11.5px; color:var(--text-3); }
  .aj-x { margin-left:auto; width:32px; height:32px; border-radius:9px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); cursor:pointer; }
  .aj-x:hover { color:var(--text); border-color:var(--line-2); }
  .aj-body { flex:1; overflow-y:auto; padding:6px 18px 30px; overscroll-behavior:contain; }
  .aj-sec { padding:16px 0; border-bottom:1px solid var(--line); }
  .aj-sec:last-child { border-bottom:0; }
  .aj-sec h3 { margin:0 0 11px; font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); }
  .aj-note { margin:9px 0 0; font-size:12px; color:var(--text-3); line-height:1.5; }
  .aj-note select { height:26px; padding:0 6px; font-size:12px; }
  .aj-seg { display:flex; flex-wrap:wrap; gap:4px; padding:3px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); }
  .aj-seg button { flex:1 1 auto; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:0; background:transparent; color:var(--text-3); font:inherit; font-size:12px; font-weight:600; padding:7px 9px; border-radius:8px; cursor:pointer; white-space:nowrap; }
  .aj-seg button:hover { color:var(--text); }
  .aj-seg button.on { background:var(--surface); color:var(--text); box-shadow:inset 0 0 0 1px var(--line-2), inset 0 -2px 0 var(--accent); }
  .aj-seg button i { font-size:11px; }
  .aj-swatches { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
  .aj-swatch { display:flex; flex-direction:column; align-items:center; gap:6px; padding:9px 4px 7px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--text-3); font:inherit; font-size:11px; cursor:pointer; }
  .aj-swatch i { width:22px; height:22px; border-radius:50%; background:var(--c); box-shadow:0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); }
  .aj-swatch.on { border-color:var(--c); color:var(--text); }
  .aj-wps { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
  .aj-wp { display:flex; flex-direction:column; gap:5px; padding:5px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--text-3); font:inherit; font-size:11px; cursor:pointer; text-align:center; }
  .aj-wp.on { border-color:var(--accent); color:var(--text); box-shadow:0 0 0 3px var(--accent-soft); }
  .aj-wp-prev { height:54px; border-radius:7px; background-color:var(--bg); border:1px solid var(--line); display:grid; place-items:center; color:var(--text-3); background-size:cover; background-position:center; position:relative; overflow:hidden; }
  .aj-wp-prev::before { content:''; position:absolute; inset:0; }
  .wp-grade::before { background-image:linear-gradient(to right, color-mix(in srgb, var(--text) 12%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--text) 12%, transparent) 1px, transparent 1px); background-size:11px 11px; }
  .wp-pontos::before { background-image:radial-gradient(color-mix(in srgb, var(--text) 30%, transparent) 1px, transparent 1.4px); background-size:9px 9px; }
  .wp-aurora::before { background:radial-gradient(60% 70% at 20% 25%, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%), radial-gradient(55% 65% at 85% 30%, color-mix(in srgb, var(--info) 45%, transparent), transparent 70%), radial-gradient(60% 70% at 50% 100%, color-mix(in srgb, var(--crypto) 40%, transparent), transparent 70%); filter:blur(6px); }
  .wp-candles::before, .wp-ondas::before, .wp-hex::before { background:color-mix(in srgb, var(--text) 22%, transparent); -webkit-mask-size:auto 70%; mask-size:auto 70%; }
  .wp-candles::before { -webkit-mask-image:var(--m-candles); mask-image:var(--m-candles); }
  .wp-ondas::before { -webkit-mask-image:var(--m-ondas); mask-image:var(--m-ondas); -webkit-mask-size:60px auto; mask-size:60px auto; }
  .wp-hex::before { -webkit-mask-image:var(--m-hex); mask-image:var(--m-hex); -webkit-mask-size:20px auto; mask-size:20px auto; }
  .wp-diagonal::before { background:repeating-linear-gradient(135deg, color-mix(in srgb, var(--text) 16%, transparent) 0 1px, transparent 1px 7px); }
  .wp-imagem { font-size:16px; }
  .aj-img { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
  .aj-file { align-self:flex-start; cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
  .aj-url { display:flex; gap:6px; }
  .aj input[type=url], .aj select { background:var(--surface-2); color:var(--text); border:1px solid var(--line-2); border-radius:8px; font-family:inherit; outline:none; }
  .aj input[type=url]:focus, .aj select:focus { border-color:var(--accent-line); }
  .aj-url input { flex:1; min-width:0; height:32px; padding:0 10px; font-size:12px; }
  .aj-conta { margin:0 0 12px; display:flex; flex-direction:column; gap:2px; }
  .aj-conta span { color:var(--text-2); font-size:12.5px; word-break:break-all; }
  .aj-btns a.btn-sm { text-decoration:none; }
  .aj-pend { background:var(--accent); color:#111; border-radius:9px; padding:0 7px; font-size:11px; font-weight:700; }
  .aj-link { align-self:flex-start; border:0; background:none; color:var(--neg); font:inherit; font-size:12px; cursor:pointer; padding:0; text-decoration:underline; }
  .aj-range { display:flex; flex-direction:column; gap:4px; margin-top:12px; font-size:12px; color:var(--text-3); }
  .aj-range b { color:var(--text); font-family:'JetBrains Mono', monospace; font-weight:600; }
  .aj-range input { width:100%; accent-color:var(--accent); }
  .aj-sw { display:flex; align-items:center; gap:10px; width:100%; margin-top:12px; padding:0; border:0; background:none; color:var(--text-2); font:inherit; font-size:12.5px; cursor:pointer; text-align:left; }
  .aj-sw .aj-knob { position:relative; flex:0 0 auto; width:34px; height:20px; border-radius:99px; background:var(--surface-3, var(--surface-2)); border:1px solid var(--line-2); transition:background .18s; }
  .aj-sw .aj-knob::after { content:''; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:var(--text-3); transition:transform .18s, background .18s; }
  .aj-sw.on .aj-knob { background:var(--accent-soft); border-color:var(--accent-line); }
  .aj-sw.on .aj-knob::after { transform:translateX(14px); background:var(--accent); }
  .aj-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px; }
  .aj-row:first-of-type { margin-top:0; }
  .aj-row > span { flex:0 0 100%; font-size:12px; color:var(--text-3); }
  .aj-row .aj-seg { flex:1; }
  .aj-row select { flex:1; height:34px; padding:0 10px; font-size:12.5px; }
  .aj-updown { display:flex; align-items:center; gap:10px; margin-top:8px; font-size:12px; font-family:'JetBrains Mono', monospace; }
  .aj-updown .up { color:var(--pos-ink); font-weight:600; } .aj-updown .dn { color:var(--neg); font-weight:600; }
  .aj-updown em { font-style:normal; font-family:'Inter', sans-serif; color:var(--text-3); font-size:11.5px; }
  .aj-wide { width:100%; margin-top:14px; justify-content:center; display:flex; align-items:center; gap:8px; }
  .aj-btns { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .aj-btns .btn-sm { display:inline-flex; align-items:center; gap:7px; }
  .aj-keys { display:grid; grid-template-columns:auto 1fr; gap:8px 14px; margin:0; font-size:12.5px; }
  .aj-keys dt { white-space:nowrap; } .aj-keys dd { margin:0; color:var(--text-2); }
  .aj-keys kbd { display:inline-block; min-width:22px; padding:2px 6px; border-radius:6px; border:1px solid var(--line-2); border-bottom-width:2px; background:var(--surface-2); color:var(--text); font-family:'JetBrains Mono', monospace; font-size:11px; text-align:center; }
  @media (max-width: 520px) {
    .aj-panel { width:100%; top:auto; height:88%; border-left:0; border-top:1px solid var(--line-2); border-radius:18px 18px 0 0; transform:translateY(102%); }
    .aj-wps { grid-template-columns:repeat(3, 1fr); }
  }
  `;
  // máscaras SVG das miniaturas (as mesmas do fundo)
  const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  css.textContent += `.aj { --m-candles:${svg("<svg xmlns='http://www.w3.org/2000/svg' width='132' height='96'><g stroke='black' stroke-width='3' fill='none'><path d='M14 14v56M44 28v52M74 8v50M104 34v48'/><rect x='70' y='18' width='8' height='26'/><rect x='100' y='46' width='8' height='22'/></g><g fill='black'><rect x='9' y='26' width='10' height='30'/><rect x='39' y='40' width='10' height='26'/></g></svg>")};
    --m-ondas:${svg("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='36'><path d='M0 18 Q20 2 40 18 T80 18 T120 18 T160 18' fill='none' stroke='black' stroke-width='3'/></svg>")};
    --m-hex:${svg("<svg xmlns='http://www.w3.org/2000/svg' width='56' height='100'><path d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='black' stroke-width='3'/></svg>")}; }`;
  document.head.appendChild(css);

  applyAll();
  syncTheme();
})();
