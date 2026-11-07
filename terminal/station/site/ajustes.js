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
  const MODES = [['dark', 'Escuro', 'fa-moon'], ['light', 'Claro', 'fa-sun'], ['auto', 'Automático', 'fa-desktop'], ['hour', 'Por horário', 'fa-clock'], ['terminal', 'Terminal', 'fa-terminal']];

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
    set('term', P.mode === 'terminal' ? 'on' : null);
    set('cardSource', P.cardSource === true ? 'on' : null);
    set('cardTime', P.cardTime === true ? 'on' : null);
    const deskValue = JSON.stringify(P.mesaLayout || null);
    if (deskValue !== deskApplied) { deskApplied = deskValue; window.dispatchEvent(new Event('mesa-layout-changed')); }
  }
  // tema: o painel principal guarda escuro/claro; aqui decidimos quando é automático
  const wantTheme = () => (P.mode === 'terminal' ? (P.termClaro ? 'light' : 'dark') : P.mode === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
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
  // No Terminal, a chave Aparência (ou Alt+L) alterna entre Terminal escuro e Terminal claro (P.termClaro, pedido do Severino, 07/11/2026).
  // voltaTerminal é de uma versão anterior (saía do Terminal para o Claro comum): quem ficou com ela volta ao Terminal no próximo clique.
  // A classe mm-troca desliga as transições de cor por um instante, para não piscar âmbar no tema claro.
  const semTransicao = () => { const h = document.documentElement; h.classList.add('mm-troca'); requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('mm-troca'))); };
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const claro = document.body.classList.contains('light');
    if (P.mode === 'terminal') { semTransicao(); P.termClaro = claro; save(); applyAll(); }
    else if (P.mode === 'manual' && P.voltaTerminal && !claro) { semTransicao(); P.mode = 'terminal'; P.termClaro = false; delete P.voltaTerminal; save(); applyAll(); }
    else if (P.mode === 'auto' || P.mode === 'hour') { P.mode = 'manual'; save(); applyAll(); }
    if (box && !box.hidden) setTimeout(render, 30);
  });
  const curMode = () => (P.mode === 'manual' ? (document.body.classList.contains('light') ? 'light' : 'dark') : P.mode);

  /* ---------------- painel ---------------- */
  let box = null, lastFocus = null, mesaDragging = null, selectedGroup = 'appearance';
  const desktopSettings = matchMedia('(min-width:901px)');
  desktopSettings.addEventListener('change', () => { if (box && !box.hidden) render(); });
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
    const groupState = Object.fromEntries([...box.querySelectorAll('.aj-group')].map(g => [g.dataset.group, g.open]));
    const C = window.__conta;
    box.querySelector('.aj-body').innerHTML = `
      <div class="aj-conta-topo">${planoCard(C)}</div>
      <div class="aj-busca aj-busca-cel">${buscaInput('aj-q-cel')}</div>
      <div class="aj-rapido" aria-label="Atalhos rápidos">
        <div><span>Tema</span>${seg('mode', MODES.slice(0, 2), curMode())}</div>
        <div><span>Tamanho da letra</span>${seg('scale', [[0.9, 'A−'], [1, 'A'], [1.1, 'A+'], [1.2, 'A++']], P.scale)}</div>
        ${liveOn != null ? `<div><span>Cotações</span>${sw('live', liveOn, 'Auto-atualizar')}</div>` : ''}
      </div>
      <p class="aj-busca-vazio" hidden>Nada encontrado. Tente outra palavra, como tema, senha ou cache.</p>
      ${C && C.logado ? `<section class="aj-sec">
        <h3>Celular</h3>
        <form class="aj-form" data-form="celular" novalidate>
          <label for="aj-cel">Celular com DDD, para avisos sobre seu acesso pelo WhatsApp (opcional)</label>
          <div class="aj-url"><input id="aj-cel" name="cel" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 91234-5678" maxlength="20" value="${esc(celularFmt(celular))}"><button type="submit" class="btn-sm">Salvar</button></div>
          <p class="aj-msg" role="status" aria-live="polite"></p>
          <p class="aj-note">Usado só para avisar sobre o vencimento e a renovação do acesso. Deixe em branco e salve para apagar.</p>
        </form>
      </section>
      <section class="aj-sec">
        <h3>Trocar senha</h3>
        <form class="aj-form" data-form="senha" novalidate>
          <label for="aj-s1">Senha atual</label><input id="aj-s1" name="atual" type="password" autocomplete="current-password">
          <label for="aj-s2">Senha nova (mínimo 8 caracteres)</label><input id="aj-s2" name="nova" type="password" autocomplete="new-password" minlength="8">
          <label for="aj-s3">Repita a senha nova</label><input id="aj-s3" name="nova2" type="password" autocomplete="new-password" minlength="8">
          <button type="submit" class="btn-sm aj-form-bt">Salvar senha nova</button>
          <p class="aj-msg" role="status" aria-live="polite"></p>
          <p class="aj-note">Ao trocar, os outros aparelhos onde você estava conectado saem da conta. Este continua conectado.</p>
        </form>
      </section>
      <section class="aj-sec">
        <h3>Aparelhos conectados</h3>
        <div class="aj-aparelhos">${aparelhosHtml()}</div>
        <p class="aj-note">A conta fica aberta em até 2 aparelhos. Ao entrar num terceiro, o mais antigo sai sozinho.</p>
      </section>
      <section class="aj-sec">
        <h3>Excluir minha conta</h3>
        <form class="aj-form" data-form="excluir" novalidate>
          <p class="aj-note">Apaga de vez seu nome, e-mail e senha do Mercado Macro e desconecta todos os aparelhos. Não dá para desfazer. Veja a <a href="/privacidade">política de privacidade</a>.</p>
          <label for="aj-sx">Digite sua senha para confirmar</label><input id="aj-sx" name="senha" type="password" autocomplete="current-password">
          <button type="submit" class="btn-sm aj-form-bt aj-del">Excluir minha conta</button>
          <p class="aj-msg" role="status" aria-live="polite"></p>
        </form>
      </section>` : ''}
      <section class="aj-sec">
        <h3>Tema</h3>
        ${seg('mode', MODES, curMode())}
        <p class="aj-note">${P.mode === 'terminal' ? 'Letras âmbar, cantos retos e fonte de terminal, no estilo das plataformas profissionais. A chave Aparência (ou Alt+L) alterna entre o Terminal escuro e o Terminal claro.' : P.mode === 'auto' ? 'Segue o tema do seu computador ou celular e troca sozinho.' : P.mode === 'hour'
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
        <h3>Assistente (robô)</h3>
        ${sw('roboVoz', P.roboVoz === true, 'Ler em voz alta as notícias urgentes')}
        ${(() => { const V = window.MMRoboVoz; const vs = V ? V.vozes() : []; const cur = P.roboVozNome || (V ? V.atual() : '');
          return vs.length ? `<div class="aj-row"><span>Voz</span><select data-str="roboVozNome" aria-label="Voz do robô">${vs.map((n) => `<option value="${esc(n)}" ${n === cur ? 'selected' : ''}>${esc(n.replace(/^Microsoft |^Google /, '').replace(/ - .*$/, ''))}</option>`).join('')}</select></div>
          <button type="button" class="btn-sm" data-act="roboTestar"><i class="fas fa-volume-up"></i> Testar a voz</button>` : ''; })()}
        <p class="aj-note">Usa as vozes do seu navegador, que variam de um computador para outro. As marcadas como Natural ou Online costumam soar melhor. Só funciona com o terminal aberto. Vem desligado.</p>
        <button type="button" class="btn-sm aj-wide" data-act="roboCanto"><i class="fas fa-undo"></i> Voltar o robô para o canto</button>
        <p class="aj-note">No computador, você pode arrastar o robô para qualquer lugar da tela. Ele lembra onde ficou.</p>
        <div class="aj-row" style="margin-top:12px"><span>Respostas do Assistente</span><select data-str="iaNivel" aria-label="Nível das respostas do Assistente">${[['iniciante', 'Para iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']].map(([v, l]) => `<option value="${v}" ${(P.iaNivel || 'intermediario') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <p class="aj-note">O Assistente ajusta a linguagem a este nível, relaciona as respostas com a sua watchlist e lembra os assuntos que você mais pergunta (guardados só neste navegador).</p>
        <button type="button" class="btn-sm aj-wide" data-act="iaEsquecer"><i class="fas fa-eraser"></i> Esquecer os assuntos que pergunto</button>
        ${sw('roboRadar', P.roboRadar !== false, 'Radar da watchlist (o robô avisa notícia importante sobre os seus ativos)')}
        ${sw('roboBomDia', P.roboBomDia !== false, 'Bom dia do robô (resumo da manhã, nos dias de pregão)')}
        ${sw('roboQuiz', P.roboQuiz !== false, 'Pergunta do dia (das lições da aba Educação)')}
        ${sw('roboNotif', P.roboNotif === true, 'Avisar no sistema quando o terminal estiver em segundo plano')}
        <p class="aj-note">Notícias urgentes, alarmes de preço e decisões do Copom e do Fed aparecem como aviso do Windows (ou do Mac) enquanto você usa outro programa. O terminal precisa ficar aberto numa aba.</p>
        ${window.MMRoboExtras ? '<button type="button" class="btn-sm aj-wide" data-act="roboJanela"><i class="far fa-window-restore"></i> Abrir o robô numa janela flutuante</button><p class="aj-note">A janela fica por cima de outros programas, com cotações, a sua watchlist e os avisos.</p>' : ''}
        ${(() => { const A = window.MMRoboAlarmes; if (!A) return ''; const l = A.lista();
          return `<p class="aj-note" style="margin-top:12px"><b>Alarmes de preço</b></p>${l.length ? l.map((a) => `<div class="aj-row"><span>${esc(a.nome)} ${a.dir === 'acima' ? 'acima de' : 'abaixo de'} ${esc(A.nomeNum(a))}</span><button type="button" class="btn-sm" data-act="roboAlarmeApaga" data-id="${esc(a.id)}">Apagar</button></div>`).join('') : ''}
          <p class="aj-note">${l.length ? '' : 'Nenhum alarme. '}Para criar, escreva no Assistente, por exemplo: "me avisa se o dólar passar de 5,50".</p>`; })()}
        ${window.MMRoboComando && window.MMRoboComando.tem() ? '<p class="aj-note">Comandos de voz: toque no microfone do Assistente ou use Alt+V e fale, por exemplo, "abre o calendário", "cotação do dólar" ou "explica a tela". A voz é reconhecida pelo serviço do navegador.</p>' : ''}
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
          <button type="button" class="btn-sm" data-act="backup"><i class="fas fa-database"></i> Backup e restauração</button>
          <button type="button" class="btn-sm" data-act="summary"><i class="fas fa-clipboard-list"></i> Resumo para cliente</button>
          <button type="button" class="btn-sm" data-act="refresh"><i class="fas fa-sync-alt"></i> Atualizar cotações</button>
          <button type="button" class="btn-sm" data-act="reset"><i class="fas fa-undo"></i> Restaurar ajustes</button>
        </div>
        <p class="aj-note">Limpar o cache baixa tudo de novo, sem apagar notas, compromissos, estratégias salvas nem estes ajustes.</p>
      </section>
      <section class="aj-sec">
        <h3>Contato</h3>
        <div class="aj-ajuda">
          <a class="aj-ajuda-it" href="mailto:contato@mercadomacro.com.br"><i class="fas fa-envelope" aria-hidden="true"></i><span><b>Fale com a gente</b><em>contato@mercadomacro.com.br</em></span></a>
          <a class="aj-ajuda-it" href="/privacidade"><i class="fas fa-shield-alt" aria-hidden="true"></i><span><b>Privacidade</b><em>Como seus dados são usados</em></span></a>
          <a class="aj-ajuda-it" href="https://open.spotify.com/show/4qRUZmmORVnr9dSowJXhIs" target="_blank" rel="noopener"><i class="fab fa-spotify" aria-hidden="true"></i><span><b>Podcast Radar Macro</b><em>Ouça no Spotify</em></span></a>
        </div>
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
        <p class="aj-note"><b>Aba Mercado:</b> cotações do Yahoo Finance pelo servidor do painel. Ponto verde: preço em tempo real (câmbio pela Deriv; dólar, VIX, futuros e índices de bolsa pela Capital.com em CFD, marcados com "CFD": contratos que acompanham o ativo e negociam quase 24 horas, por isso podem diferir um pouco do valor oficial; cripto pela Binance em USDT), com a Atualização automática ligada. Horários em Brasília. A situação do pregão considera os feriados da B3, da bolsa de Nova York, da Xetra (cartão Europa) e da bolsa de Tóquio (cartão Ásia); os futuros da CME fecham no Natal, no Ano-Novo e na Sexta-feira Santa e param às 13h de Nova York nos outros feriados americanos. O cartão Moedas segue o câmbio à vista, que negocia sem pausa de domingo a sexta, das 17h às 17h de Nova York.</p>
      </section>`;
    const body = box.querySelector('.aj-body');
    const sections = [...body.querySelectorAll(':scope > .aj-sec')];
    const groups = [
      ...(C && C.logado ? [['account', 'Minha conta', ['Celular', 'Trocar senha', 'Aparelhos conectados', 'Excluir minha conta']]] : []),
      ['appearance', 'Aparência', ['Tema', 'Cor de destaque', 'Papel de parede', 'Leitura']],
      ['panel', 'Meu painel', ['Exibição dos cards', 'Painel', 'Assistente (robô)', 'Minha Mesa']],
      ['data', 'Dados', ['Dados']],
      ['help', 'Ajuda', ['Contato', 'Atalhos de teclado']],
      ['about', 'Sobre', ['Sobre']]
    ];
    for (const [id, name, titles] of groups) {
      const group = document.createElement('details'); group.className = 'aj-group'; group.dataset.group = id;
      group.open = desktopSettings.matches || (groupState[id] ?? id === 'appearance');
      group.classList.toggle('aj-selected', id === selectedGroup);
      const summary = document.createElement('summary'); summary.textContent = name; if (desktopSettings.matches) summary.tabIndex = -1; group.append(summary);
      for (const section of sections) if (titles.includes(section.querySelector('h3')?.textContent)) group.append(section);
      body.append(group);
    }
    // Sair fica por último (no computador ele está no pé da barra de categorias)
    if (C && C.logado) { const fim = document.createElement('div'); fim.className = 'aj-sair-fim'; fim.innerHTML = '<button type="button" class="btn-sm" data-act="sair"><i class="fas fa-sign-out-alt"></i> Sair</button>'; body.append(fim); }
    box.classList.toggle('aj-em-aparencia', selectedGroup === 'appearance');
    renderNav(C);
    lerCelular();
    lerAparelhos();
    aplicarBusca();
    const img = P.wpUrl || localStorage.getItem(IMG_KEY);
    if (img) box.style.setProperty('--wp-img-prev', `url("${String(img).replace(/"/g, '%22')}")`);
    box.querySelector('.aj-body').scrollTop = scroll;
  }

  // Minha conta dentro dos Ajustes (03/11/2026): mesmas rotas da página /conta, que continua para quem está com o acesso vencido
  let celular = null, celularLido = false;
  function celularFmt(c) { const d = String(c || '').slice(2); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : ''; }
  function postConta(url, corpo) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw j; return j; }));
  }
  function lerCelular() {
    if (celularLido || !(window.__conta && window.__conta.logado)) return;
    celularLido = true;
    postConta('/api/auth/celular', { ler: 1 }).then(j => { celular = j.celular || null; const i = box && box.querySelector('#aj-cel'); if (i && !i.value) i.value = celularFmt(celular); }).catch(() => { celularLido = false; });
  }
  function onSubmit(e) {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const m = f.querySelector('.aj-msg'), b = f.querySelector('button[type=submit]');
    const diz = (ok, t) => { m.className = 'aj-msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; };
    const erro = (j) => diz(false, (j && j.erro) || 'Não foi possível. Tente de novo.');
    const tipo = f.dataset.form;
    if (tipo === 'celular') {
      b.disabled = true; diz(true, '');
      postConta('/api/auth/celular', { celular: f.cel.value }).then(j => { celular = j.celular || null; f.cel.value = celularFmt(celular); diz(true, celular ? 'Celular salvo.' : 'Celular apagado.'); }, erro).then(() => { b.disabled = false; });
    } else if (tipo === 'senha') {
      if (!f.atual.value) return diz(false, 'Digite a senha atual.');
      if (f.nova.value.length < 8) return diz(false, 'A senha nova precisa ter pelo menos 8 caracteres.');
      if (f.nova.value !== f.nova2.value) return diz(false, 'As duas senhas novas não são iguais.');
      b.disabled = true; diz(true, '');
      postConta('/api/auth/senha', { atual: f.atual.value, nova: f.nova.value }).then(() => { f.reset(); diz(true, 'Senha trocada. Use a nova senha da próxima vez que entrar.'); }, erro).then(() => { b.disabled = false; });
    } else if (tipo === 'excluir') {
      if (!f.senha.value) return diz(false, 'Digite sua senha.');
      if (!confirm('Excluir sua conta de vez? Não dá para desfazer.')) return;
      b.disabled = true; diz(true, '');
      postConta('/api/auth/excluir', { senha: f.senha.value }).then(() => { location.href = '/'; }, (j) => { erro(j); b.disabled = false; });
    }
  }

  // barra de categorias do computador: a conta no topo (Minha conta, Assinatura), depois as categorias e o Sair no pé
  function renderNav(C) {
    const nav = box.querySelector('.aj-categories'); if (!nav) return;
    const logado = !!(C && C.logado);
    const cat = (id, ic, nome) => `<button type="button" data-aj-category="${id}"${id === selectedGroup && !busca ? ' aria-current="true"' : ''}><i class="fas fa-${ic}" aria-hidden="true"></i> ${nome}</button>`;
    const q = nav.querySelector('#aj-q-pc'), foco = q && document.activeElement === q;
    nav.innerHTML = planoCard(C)
      + `<div class="aj-busca">${buscaInput('aj-q-pc')}</div>`
      + (logado ? cat('account', 'user-cog', 'Minha conta') : `<a class="aj-nav-link" href="/conta"><i class="fas fa-user-cog" aria-hidden="true"></i> Minha conta</a>`)
      + (logado && C.admin ? `<a class="aj-nav-link" href="/admin"><i class="fas fa-user-check" aria-hidden="true"></i> Cadastros${C.pendentes ? ` <span class="aj-pend">${C.pendentes}</span>` : ''}</a>`
        : `<a class="aj-nav-link" href="/assinar"><i class="fas fa-receipt" aria-hidden="true"></i> Assinatura</a>`)
      + '<hr class="aj-nav-sep">'
      + cat('appearance', 'palette', 'Aparência') + cat('panel', 'columns', 'Meu painel') + cat('data', 'database', 'Dados') + cat('help', 'life-ring', 'Ajuda') + cat('about', 'info-circle', 'Sobre')
      + (logado ? '<button type="button" class="aj-nav-sair" data-act="sair"><i class="fas fa-sign-out-alt" aria-hidden="true"></i> Sair</button>' : '');
    if (foco) { const n = nav.querySelector('#aj-q-pc'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  }

  // cartão do plano no topo (04/11/2026): plano, dias que faltam com barra, botão para renovar ou assinar
  function planoCard(C) {
    if (!C || !C.logado) return `<div class="aj-plano"><b class="aj-plano-nome">Você não está conectado</b><a class="aj-plano-bt" href="/entrar">Entrar</a></div>`;
    const topo = `<div class="aj-plano-quem"><span class="aj-plano-av" aria-hidden="true">${esc((C.nome || '?').trim().charAt(0).toUpperCase())}</span><span><b class="aj-plano-nome">${esc(C.nome)}</b><span class="aj-plano-mail">${esc(C.email)}</span></span></div>`;
    if (C.admin) return `<div class="aj-plano">${topo}<span class="aj-selo">Administrador</span></div>`;
    const fim = C.expira ? Date.parse(C.expira) : NaN, falta = (fim - Date.now()) / 864e5;
    const ok = Number.isFinite(falta), dias = ok ? Math.max(0, Math.ceil(falta)) : 0;
    const pct = ok && C.planoDias ? Math.max(3, Math.min(100, falta / C.planoDias * 100)) : null;
    const perto = ok && falta <= 3;
    const quando = !ok ? '—' : falta <= 0 ? 'Acesso terminou' : falta < 1 ? `Falta${Math.ceil(falta * 24) > 1 ? 'm' : ''} ${Math.ceil(falta * 24)} h` : `Falta${dias > 1 ? 'm' : ''} ${dias} ${dias > 1 ? 'dias' : 'dia'}`;
    const data = ok ? new Date(fim).toLocaleDateString('pt-BR') : '';
    const bt = C.renova ? ['Gerenciar assinatura', ''] : C.gratis ? ['Assinar', ' forte'] : perto ? ['Renovar agora', ' forte'] : ['Renovar', ''];
    return `<div class="aj-plano${perto ? ' perto' : ''}">${topo}
      <div class="aj-plano-linha"><span class="aj-selo">${esc(C.plano || '—')}</span><span class="aj-plano-falta">${quando}</span></div>
      ${pct != null ? `<div class="aj-plano-barra" role="progressbar" aria-label="Tempo de acesso restante" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
      <span class="aj-plano-ate">${C.renova ? `Renova sozinho no cartão em ${data}` : data ? `Acesso até ${data}` : ''}</span>
      <a class="aj-plano-bt${bt[1]}" href="/assinar">${bt[0]}</a></div>`;
  }

  // busca dentro dos Ajustes: filtra as seções sem redesenhar (o campo não perde o foco)
  let busca = '';
  const buscaInput = (id) => `<label class="aj-busca-in" for="${id}"><i class="fas fa-search" aria-hidden="true"></i><input id="${id}" type="search" data-busca placeholder="Buscar nos ajustes" autocomplete="off" value="${esc(busca)}" aria-label="Buscar nos ajustes"></label>`;
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function aplicarBusca() {
    if (!box) return;
    const q = norm(busca.trim());
    box.classList.toggle('aj-buscando', !!q);
    let algum = false;
    box.querySelectorAll('.aj-body > .aj-group').forEach((g) => {
      const nomeBate = q && norm(g.querySelector('summary')?.textContent).includes(q);
      let tem = false;
      g.querySelectorAll(':scope > .aj-sec').forEach((sec) => { const hit = !q || nomeBate || norm(sec.textContent).includes(q); sec.hidden = !hit; tem = tem || hit; });
      g.hidden = !!q && !tem;
      if (q && tem && !desktopSettings.matches) g.open = true;
      algum = algum || tem;
    });
    const vazio = box.querySelector('.aj-busca-vazio'); if (vazio) vazio.hidden = !q || algum;
    box.querySelectorAll('.aj-categories [data-aj-category]').forEach((b) => { if (q) b.removeAttribute('aria-current'); else if (b.dataset.ajCategory === selectedGroup) b.setAttribute('aria-current', 'true'); });
  }

  // aparelhos conectados: usa a rota que já existe (conta os outros e encerra todos menos este)
  let aparelhos = null, aparelhosLido = false;
  const esteAparelho = () => /iPhone|Android.*Mobile|Mobile/i.test(navigator.userAgent) ? ['mobile-alt', 'Este celular'] : /iPad|Tablet|Android/i.test(navigator.userAgent) ? ['tablet-alt', 'Este tablet'] : ['desktop', 'Este computador'];
  function aparelhosHtml() {
    const [ic, nome] = esteAparelho();
    const este = `<div class="aj-ap"><i class="fas fa-${ic}" aria-hidden="true"></i><span><b>${nome}</b><em>Você está aqui</em></span><span class="aj-ap-on">Conectado</span></div>`;
    if (aparelhos == null) return este + '<p class="aj-note">Verificando outros aparelhos…</p>';
    if (aparelhos === 'erro') return este + '<p class="aj-note">Não foi possível ver os outros aparelhos agora.</p>';
    if (!aparelhos) return este + '<p class="aj-note">Nenhum outro aparelho conectado.</p>';
    return este + `<div class="aj-ap"><i class="fas fa-laptop" aria-hidden="true"></i><span><b>${aparelhos === 1 ? 'Outro aparelho' : aparelhos + ' outros aparelhos'}</b><em>Conectado${aparelhos > 1 ? 's' : ''} com a sua conta</em></span><button type="button" class="btn-sm" data-act="ap-sair">Desconectar</button></div>`;
  }
  function lerAparelhos() {
    if (aparelhosLido || !(window.__conta && window.__conta.logado)) return;
    aparelhosLido = true;
    postConta('/api/auth/aparelhos', { ler: 1 }).then((j) => { aparelhos = +j.outros || 0; }, () => { aparelhos = 'erro'; aparelhosLido = false; })
      .then(() => { const el = box && box.querySelector('.aj-aparelhos'); if (el) el.innerHTML = aparelhosHtml(); });
  }

  function build() {
    box = document.createElement('div');
    box.className = 'aj';
    box.hidden = true;
    box.innerHTML = `<div class="aj-scrim" data-act="close"></div>
      <aside class="aj-panel" role="dialog" aria-modal="true" aria-labelledby="aj-title">
        <header class="aj-head"><span class="aj-ic"><i class="fas fa-cog"></i></span><div><h2 id="aj-title">Ajustes</h2><p>Mudanças aplicadas na hora e salvas neste navegador</p></div>
          <button type="button" class="aj-x" data-act="close" aria-label="Fechar"><i class="fas fa-times"></i></button></header>
        <div class="aj-content"><nav class="aj-categories" aria-label="Categorias de configurações"></nav><div class="aj-body"></div></div>
      </aside>`;
    document.body.appendChild(box);
    box.addEventListener('click', onClick);
    box.addEventListener('submit', onSubmit);
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
    aparelhosLido = false; busca = '';
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
    const category = e.target.closest('[data-aj-category]');
    if (category) { selectedGroup = category.dataset.ajCategory; render(); box.querySelector('.aj-body').scrollTop = 0; return; }
    if (desktopSettings.matches && e.target.closest('.aj-group > summary')) { e.preventDefault(); return; }
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
        if (P.mode === 'terminal' || raw === 'terminal') semTransicao();
        delete P.voltaTerminal;
        if (raw === 'dark' || raw === 'light') { P.mode = 'manual'; save(); applyAll(); syncTheme(raw); }
        else { P.mode = raw; save(); applyAll(); syncTheme(); }
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
      if (k === 'roboBomDia' || k === 'roboQuiz' || k === 'roboRadar') P[k] = P[k] === false;
      if (k === 'roboNotif') {
        if (P.roboNotif === true) P.roboNotif = false;
        else { window.MMRoboExtras?.pedirNotif().then((ok) => { if (!ok) return; P.roboNotif = true; save(); render(); toast('Pronto. Aviso no sistema quando o terminal estiver em segundo plano.'); }); return; }
      }
      if (k === 'roboVoz') { P.roboVoz = P.roboVoz !== true; if (P.roboVoz) window.MMRoboVoz?.falar('Pronto. Vou ler as notícias urgentes em voz alta.'); else try { speechSynthesis.cancel(); } catch (e2) { /* sem voz */ } }
      save(); applyAll();
      return setTimeout(render, k === 'live' ? 60 : 0);
    }
    if (act === 'roboTestar') { if (!window.MMRoboVoz?.falar('Olá! Esta é a voz que vou usar para as notícias urgentes.')) toast('Este navegador não tem voz disponível.'); return; }
    if (act === 'iaEsquecer') { try { localStorage.removeItem('mm_ia_temas_v1'); } catch (e2) { /* nada */ } toast('Pronto. O Assistente esqueceu os assuntos que você pergunta.'); return; }
    if (act === 'roboJanela') { window.MMRoboExtras?.abrirJanela(); return; }
    if (act === 'roboAlarmeApaga') { window.MMRoboAlarmes?.apagar(b.dataset.id); toast('Alarme apagado.'); return render(); }
    if (act === 'roboCanto') { window.MMPet?.canto?.(); toast('O robô voltou para o canto.'); return; }
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
    if (act === 'ap-sair') {
      if (!confirm('Desconectar os outros aparelhos? Eles vão precisar entrar de novo com a senha.')) return;
      b.disabled = true;
      postConta('/api/auth/aparelhos', { sair: 1 }).then(() => { aparelhos = 0; toast('Os outros aparelhos foram desconectados.'); }, () => { toast('Não foi possível desconectar agora. Tente de novo.'); })
        .then(() => { const el = box.querySelector('.aj-aparelhos'); if (el) el.innerHTML = aparelhosHtml(); });
      return;
    }
    if (act === 'backup') { close(); setTimeout(() => document.getElementById('backup-btn')?.click(), 230); return; }
    const actionTargets = { summary: 'summary-btn', refresh: 'refresh-ticker' };
    if (Object.prototype.hasOwnProperty.call(actionTargets, act)) {
      close();
      setTimeout(() => document.getElementById(actionTargets[act])?.click(), 230);
      return;
    }
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
    if (t.matches('[data-busca]')) { busca = t.value; box.querySelectorAll('[data-busca]').forEach((n) => { if (n !== t) n.value = t.value; }); aplicarBusca(); return; }
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
    if (t.dataset.str) { P[t.dataset.str] = t.value; save(); if (t.dataset.str === 'roboVozNome') window.MMRoboVoz?.falar('Olá! Vou usar esta voz.'); else if (t.dataset.str === 'iaNivel') toast('O Assistente vai responder no nível ' + t.selectedOptions[0].textContent.toLowerCase().replace('para ', '') + '.'); else if (!t.value) toast('O painel vai abrir na última aba usada.'); }
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
    window.dispatchEvent(new Event('mm-conta'));
    if (box && !box.hidden) render();
    // acesso perto de terminar: lembra uma vez por dia
    const falta = c.expira ? (Date.parse(c.expira) - Date.now()) / 864e5 : Infinity;
    // plano grátis (48 horas): só avisa no último dia, para não abrir o aviso logo depois do cadastro
    if (falta <= (c.gratis ? 1 : 3)) {
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
    const reais = (v) => 'R$\u00a0' + (v / 100).toFixed(2).replace('.', ',');
    fetch('/api/assinatura', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      // degustação e grátis não aparecem aqui (a degustação saiu da página /assinar em 03/11/2026)
      const planos = ((j && j.pix && j.planos) || []).filter((p) => p.id !== 'degustacao' && p.id !== 'gratis');
      const cartao = !!(j && j.cartao);
      const dias = Math.ceil(falta);
      const quando = falta <= 0 ? 'terminou' : dias <= 1 ? 'termina amanhã' : `termina em ${dias} dias`;
      const el = document.createElement('div');
      el.className = 'mm-venc';
      el.innerHTML = `<div class="mm-venc-scrim"></div>
        <div class="mm-venc-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mm-venc-t">
          <h2 id="mm-venc-t">Seu acesso ${quando}</h2>
          <p>Ele vale até <b>${ate}</b>. Escolha um plano para continuar usando o Mercado Macro sem interrupção. Se renovar agora, o novo período começa depois dessa data.</p>
          ${planos.length ? `<div class="mm-venc-pl">${planos.map((p) => {
            // 12 meses é só no cartão: mostra o preço do cartão, não o valor interno do Pix
            const v = p.soCartao ? p.valorCartao : p.valor;
            const mes = p.meses > 1 ? ` · ${reais(Math.round(v / p.meses))} por mês` : '';
            const sub = p.soCartao ? `${esc(p.periodo)} · só no cartão` : `${esc(p.periodo)}${mes}`;
            const cart = cartao && !p.soCartao && p.valorCartao ? `<em>No cartão: ${reais(p.valorCartao)}</em>` : '';
            return `<a href="/assinar?plano=${encodeURIComponent(p.id)}"><b>${esc(p.nome)}</b><strong>${reais(v)}</strong><span>${sub}</span>${cart}</a>`;
          }).join('')}</div>
          <p class="mm-venc-nota">${cartao ? 'No Pix, pagamento único, sem renovação automática. No cartão, renova sozinho até você cancelar.' : 'Pagamento por Pix, sem renovação automática.'}</p>` : ''}
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
  .mm-venc-pl strong { white-space:nowrap; } .mm-venc-pl em { font-style:normal; font-size:11.5px; color:var(--accent); margin-top:2px; }
  @media (max-width:560px) { .mm-venc-pl a:last-child:nth-child(odd) { grid-column:1 / -1; } }
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
