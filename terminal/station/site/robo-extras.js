/* Robô do Assistente, parte 2 (07/11/2026, pedido do Severino "1a8"):
   1. janela flutuante fora do navegador (Document Picture-in-Picture; senão, janela pop-up)
   2. "Explicar esta tela" (botão no robô; o assistente.js manda o texto da aba ao Gemini)
   3. alarme de preço por conversa ("me avisa se o dólar passar de 5,50")
   4. bom dia do robô (uma vez por dia, de manhã, com os dados que o painel já tem)
   5. decisão do Copom e do Fed ao vivo, com o que o mercado esperava
   6. pergunta do dia (das lições da aba Educação) com acertos seguidos
   7. comandos de voz (reconhecimento de fala do navegador)
   8. aviso do sistema (notificação) quando o terminal está em segundo plano
   Usa só dados que o painel já carrega (yahooMemo, newsAll, calFeed, copom.json do GitHub) e não inventa número:
   sem dado, não fala. Preferências em trader_prefs_v1 (Ajustes > Meu painel > Assistente). */
(() => {
  if (window.MMRoboExtras) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const corta = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  const prefs = () => { try { return JSON.parse(localStorage.getItem('trader_prefs_v1') || '{}') || {}; } catch (e) { return {}; } };
  const aviso = (m, tipo) => { try { if (typeof toast === 'function') toast(m, tipo || 'info'); } catch (e) { /* sem toast */ } };
  const pet = () => (window.MMPet && window.MMPet.api) || null;
  const petVisivel = () => { const p = pet(); return !!(p && p.vivo()); };
  const falar = (t) => { try { window.MMPet && window.MMPet.falar && window.MMPet.falar(t); } catch (e) { /* sem voz */ } };

  // ---- datas no fuso de São Paulo / Nova York ----
  const partes = (t, tz) => {
    const o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(new Date(t)).forEach((p) => { o[p.type] = p.value; });
    return { dia: `${o.year}-${o.month}-${o.day}`, min: +o.hour * 60 + +o.minute, sem: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute };
  };
  const sp = (t = Date.now()) => partes(t, 'America/Sao_Paulo');
  // horário de um dia num fuso -> instante (ms)
  function emFuso(dia, hhmm, tz) {
    const [y, mo, d] = dia.split('-').map(Number), [h, m] = hhmm.split(':').map(Number);
    const alvo = Date.UTC(y, mo - 1, d, h, m);
    let t = alvo;
    for (let i = 0; i < 3; i++) { const p = partes(t, tz); t -= Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - alvo; }
    return t;
  }
  const ddmm = (dia) => (dia ? dia.slice(8, 10) + '/' + dia.slice(5, 7) : '');

  // ---- memória (o que já foi mostrado) ----
  const MEM_KEY = 'mm_robo2_v1';
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem(MEM_KEY) || '{}') || {}; } catch (e) { mem = {}; }
  mem.foi = mem.foi || {};
  const tres = Date.now() - 3 * 86400000;
  Object.keys(mem.foi).forEach((k) => { if (mem.foi[k] < tres) delete mem.foi[k]; });
  const memSalva = () => { try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { /* sem armazenamento */ } };
  const jaFoi = (k) => !!mem.foi[k];
  const marca = (k) => { mem.foi[k] = Date.now(); memSalva(); };

  // ---- cotações (as mesmas do app.js) ----
  function cot(sym) {
    try {
      const d = typeof yahooMemo !== 'undefined' && yahooMemo && yahooMemo[sym];
      return d && isFinite(d.value) ? d : null;
    } catch (e) { return null; }
  }
  async function buscaCot(sym) {
    const d = cot(sym);
    if (d && Date.now() - (window.__roboCotTs?.[sym] || 0) < 60000) return d;
    try {
      if (typeof fetchYahooChart === 'function') {
        const r = await fetchYahooChart(sym);
        (window.__roboCotTs = window.__roboCotTs || {})[sym] = Date.now();
        if (r && isFinite(r.value)) return r;
      }
    } catch (e) { /* sem dado */ }
    return d;
  }
  const noticias = () => { try { return (typeof newsAll !== 'undefined' && Array.isArray(newsAll)) ? newsAll : []; } catch (e) { return []; } };
  const agenda = () => { try { return (typeof calFeed !== 'undefined' && Array.isArray(calFeed)) ? calFeed : []; } catch (e) { return []; } };
  const casasDe = (sym) => (/BRL=X$/.test(sym) ? 4 : /^\^(BVSP)$/.test(sym) ? 0 : 2);
  const num = (v, c) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  // o número que a pessoa escreveu, sem zeros sobrando (5,50 e não 5,5000)
  const numAlvo = (v, c) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Math.min(2, c), maximumFractionDigits: c });
  const pct = (v) => (v >= 0 ? '+' : '') + num(v, 2) + '%';

  // ===== aviso central: robô na tela, janela flutuante, notificação do sistema ou toast =====
  function notificar(titulo, corpo, acao, chave) {
    if (prefs().roboNotif !== true || !('Notification' in window) || Notification.permission !== 'granted') return false;
    if (chave) { if (jaFoi('nt:' + chave)) return true; marca('nt:' + chave); }
    try {
      const n = new Notification(titulo, { body: corpo, tag: chave || undefined, icon: '/favicon.ico' });
      n.onclick = () => { try { window.focus(); } catch (e) { /* ok */ } n.close(); if (acao) acao(); };
      return true;
    } catch (e) { return false; }
  }
  function avisar(o) {
    // o = { chave, pri, visor: [l1, l2, cls], tela, html, texto, titulo, ms, acao, voz }
    if (o.chave && jaFoi(o.chave)) return;
    janelaAviso(o);
    if (document.hidden && !janelaAberta()) notificar(o.titulo || 'Mercado Macro', o.texto, o.acao, o.chave);
    const P = pet();
    if (P && (P.vivo() || document.hidden) && P.el.offsetParent !== null) {
      // na fila do robô; se a página estiver escondida, aparece quando você voltar
      P.pedir(o.pri || 7, () => {
        if (o.chave) { if (jaFoi(o.chave)) return; marca(o.chave); }
        const ms = o.ms || 9000;
        if (o.visor) P.txt(o.visor[0], o.visor[1], o.visor[2]);
        P.cena(() => {
          P.tela(o.tela || (o.visor ? 'txt' : '')); P.el.classList.add('mao-alto'); P.classe('surpreso', 800);
          P.dizer(o.html, ms, o.acao || null, true);
          setTimeout(() => { P.tela(''); P.el.classList.remove('mao-alto'); }, Math.min(6500, ms));
        }, ms + 200);
        if (o.voz) falar(o.voz);
      }, o.chave);
      return;
    }
    if (o.chave) marca(o.chave);
    if (!document.hidden) aviso(o.texto, o.tipo || 'info');
    if (o.voz) falar(o.voz);
  }

  // =====================================================================
  // 1. Janela flutuante (por cima de outros programas)
  // =====================================================================
  let jan = null, janTimer = 0, janBusca = 0;
  const janelaAberta = () => !!(jan && !jan.closed);
  const ATIVOS = [['^BVSP', 'Ibovespa'], ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq'], ['BRL=X', 'Dólar']];
  const JAN_CSS = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0f1115; color: #e8e6e3; font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; overflow: hidden; }
    .j { display: flex; flex-direction: column; height: 100vh; padding: 10px 12px; gap: 8px; }
    .j-topo { display: flex; align-items: flex-end; gap: 10px; }
    .j-robo { flex: 0 0 96px; height: 90px; position: relative; cursor: pointer; }
    .j-robo svg { width: 96px; height: 90px; overflow: visible; filter: drop-shadow(0 6px 10px rgba(0,0,0,.45)); }
    .j-robo .pet-cabeca { transform-box: view-box; transform-origin: 163px 200px; animation: jb 3.4s ease-in-out infinite; }
    @keyframes jb { 50% { transform: translateY(-4px) rotate(-1.5deg); } }
    .j-robo .pet-olhos { transform-box: fill-box; transform-origin: center; animation: jp 5s infinite; }
    @keyframes jp { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
    .j-robo .feliz, .j-robo .cifrao, .j-robo .pet-pensa, .j-robo .pet-tela, .j-robo .pet-suor, .j-robo .pet-zz { opacity: 0; }
    .j-robo.alerta .pet-alerta { opacity: 1; } .j-robo.alerta .pet-face { opacity: 0; }
    .j-fala { flex: 1; min-height: 60px; background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 12px 12px 12px 4px; padding: 8px 10px; font-size: 12.5px; }
    .j-fala b { color: #f2b92e; } .j-fala small { display: block; color: #9aa0aa; margin-top: 3px; font-size: 11px; }
    .j-fala.urg { border-color: #ea3943; cursor: pointer; } .j-fala.urg b { color: #ff8a8a; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; overflow: auto; }
    li { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 6px 8px; border-radius: 8px; background: #161920; }
    li span { color: #c9ccd1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    li b { font-variant-numeric: tabular-nums; font-weight: 600; } li i { font-style: normal; font-variant-numeric: tabular-nums; min-width: 62px; text-align: right; }
    .sobe { color: #16c784; } .cai { color: #ea3943; }
    .j-sep { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: #8a909a; margin: 4px 2px 0; }
    .j-pe { margin-top: auto; font-size: 10.5px; color: #6f7580; text-align: center; }`;
  function janelaHtml() {
    const linha = (sym, nome) => {
      const d = cot(sym);
      if (!d) return `<li><span>${esc(nome)}</span><b>—</b><i>—</i></li>`;
      const c = isFinite(d.change) ? d.change : null;
      return `<li title="${esc(d.date ? 'Dado de ' + d.date : '')}"><span>${esc(nome)}</span><b>${num(d.value, casasDe(sym))}</b><i class="${c == null ? '' : c >= 0 ? 'sobe' : 'cai'}">${c == null ? '—' : pct(c)}</i></li>`;
    };
    let h = ATIVOS.map(([s, n]) => linha(s, n)).join('');
    const W = window.MMWatchRobo;
    if (W) {
      const itens = W.itens().slice(0, 5);
      if (itens.length) h += '<li class="j-sep" style="background:none;padding:0">Sua watchlist</li>' + itens.map((s) => {
        const d = W.cot(s);
        if (!d || !isFinite(d.value)) return `<li><span>${esc(W.nome(s))}</span><b>—</b><i>—</i></li>`;
        return `<li><span>${esc(W.nome(s))}</span><b>${num(d.value, 2)}</b><i class="${d.change >= 0 ? 'sobe' : 'cai'}">${isFinite(d.change) ? pct(d.change) : '—'}</i></li>`;
      }).join('');
    }
    return h;
  }
  function janelaAtualiza() {
    if (!janelaAberta()) return;
    const ul = jan.document.querySelector('ul');
    if (ul) ul.innerHTML = janelaHtml();
    // com o terminal minimizado o app.js não atualiza as cotações: a janela pede, no máximo uma vez por minuto
    if (document.hidden && Date.now() - janBusca > 60000) {
      janBusca = Date.now();
      try { if (typeof ensureYahooBatch === 'function') ensureYahooBatch(true).catch(() => {}); } catch (e) { /* sem cotações */ }
      try { const W = window.MMWatchRobo; if (W && Date.now() - W.ultimo() > 5 * 60000) W.atualizar(); } catch (e) { /* sem watchlist */ }
    }
  }
  function janelaAviso(o) {
    if (!janelaAberta()) return;
    const f = jan.document.querySelector('.j-fala'), r = jan.document.querySelector('.j-robo');
    if (!f) return;
    f.innerHTML = '<b>' + esc(o.titulo || 'Aviso') + '</b><small>' + esc(corta(o.texto, 180)) + '</small>';
    f.classList.add('urg'); r.classList.add('alerta');
    f.onclick = () => { try { window.focus(); } catch (e) { /* ok */ } if (o.acao) o.acao(); };
    clearTimeout(janelaAviso.t);
    janelaAviso.t = setTimeout(() => { if (!janelaAberta()) return; r.classList.remove('alerta'); f.classList.remove('urg'); f.onclick = null; f.innerHTML = '<b>Estou de olho no mercado</b><small>Avisos urgentes, alarmes e decisões aparecem aqui.</small>'; }, 60000);
  }
  async function abrirJanela() {
    if (janelaAberta()) { try { jan.focus(); } catch (e) { /* ok */ } return true; }
    let w = null;
    try { if (window.documentPictureInPicture) w = await window.documentPictureInPicture.requestWindow({ width: 290, height: 400 }); } catch (e) { w = null; }
    if (!w) {
      w = window.open('', 'mm-robo', 'popup,width=300,height=430');
      if (!w) { aviso('O navegador bloqueou a janela. Libere as janelas pop-up para este site.', 'warning'); return false; }
    }
    jan = w;
    const d = w.document;
    d.title = 'Robô · Mercado Macro';
    const st = d.createElement('style'); st.textContent = JAN_CSS; d.head.append(st);
    // o mesmo desenho do robô da página (camadas + olhos), com os endereços das imagens completos
    const svg = pet()?.el.querySelector('svg.pet');
    let robo = svg ? svg.outerHTML : '';
    robo = robo.replace(/href="(robo-[^"]+)"/g, (m, f) => 'href="' + new URL(f, location.href).href + '"');
    d.body.innerHTML = `<div class="j"><div class="j-topo"><div class="j-robo" title="Voltar ao terminal">${robo}</div>
      <div class="j-fala"><b>Estou de olho no mercado</b><small>Avisos urgentes, alarmes e decisões aparecem aqui.</small></div></div>
      <ul></ul><p class="j-pe">Mercado Macro · cotações com atraso, não é recomendação</p></div>`;
    d.querySelector('.j-robo').onclick = () => { try { window.focus(); } catch (e) { /* ok */ } };
    janelaAtualiza();
    clearInterval(janTimer);
    janTimer = setInterval(() => { if (!janelaAberta()) { clearInterval(janTimer); jan = null; return; } janelaAtualiza(); }, 15000);
    w.addEventListener('pagehide', () => { clearInterval(janTimer); jan = null; });
    return true;
  }

  // =====================================================================
  // 3. Alarmes de preço
  // =====================================================================
  const AL_KEY = 'mm_robo_alarmes_v1';
  const ATIVO_NOMES = [
    [/\b(dolar|usd|usdbrl)\b/, 'BRL=X', 'Dólar'], [/\beuro\b/, 'EURBRL=X', 'Euro'], [/\b(ibov|ibovespa)\b/, '^BVSP', 'Ibovespa'],
    [/\b(s ?& ?p|s ?e ?p|sp ?500|s&p ?500)\b/, '^GSPC', 'S&P 500'], [/\bnasdaq\b/, '^IXIC', 'Nasdaq'], [/\bdow( jones)?\b/, '^DJI', 'Dow Jones'],
    [/\b(bitcoin|btc)\b/, 'BTC-USD', 'Bitcoin'], [/\b(ethereum|eth)\b/, 'ETH-USD', 'Ethereum'], [/\b(petroleo|brent)\b/, 'BZ=F', 'Petróleo Brent'],
    [/\bwti\b/, 'CL=F', 'Petróleo WTI'], [/\bouro\b/, 'GC=F', 'Ouro'], [/\bprata\b/, 'SI=F', 'Prata'],
  ];
  const lerAlarmes = () => { try { const a = JSON.parse(localStorage.getItem(AL_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const gravaAlarmes = (a) => { try { localStorage.setItem(AL_KEY, JSON.stringify(a.slice(0, 12))); } catch (e) { /* sem armazenamento */ } window.dispatchEvent(new Event('mm-robo-alarmes')); };
  const ehPedido = (t) => {
    const n = norm(t);
    return /\b(meus|apag\w*|cancel\w*|remov\w*|limp\w*|list\w*)\b.*\balarmes?\b/.test(n) ||
      (/\b(avis\w*|alert\w*|alarm\w*|lembr\w*|notifi\w*)\b/.test(n) && /\d/.test(n) && /\b(passar|passe|subir|suba|cair|caia|chegar|chegue|bater|bata|romper|rompa|acima|abaixo|ultrapass\w*|perder|perca|furar|fure|ficar|fique)\b/.test(n));
  };
  function leNumero(n) {
    // "5,50" "5.50" "150.000" "150 mil" "150k"
    const m = n.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(mil\b|k\b)?/);
    if (!m) return null;
    let s = m[1];
    if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    let v = parseFloat(s);
    if (m[2]) v *= 1000;
    return isFinite(v) && v > 0 ? v : null;
  }
  function qualAtivo(t) {
    const n = norm(t);
    for (const [re, sym, nome] of ATIVO_NOMES) if (re.test(n)) return { sym, nome };
    const tk = String(t).toUpperCase().match(/\b([A-Z]{4}(?:3|4|5|6|11|34))\b/);
    if (tk) return { sym: tk[1] + '.SA', nome: tk[1] };
    const W = window.MMWatchRobo;
    if (W) for (const s of W.itens()) { const nm = norm(W.nome(s)); if (nm.length > 2 && n.includes(nm)) return { sym: s, nome: W.nome(s) }; }
    return null;
  }
  async function doTexto(t) {
    const n = norm(t);
    let lista = lerAlarmes();
    if (/\b(apag\w*|cancel\w*|remov\w*|limp\w*)\b/.test(n) && /alarmes?/.test(n)) {
      gravaAlarmes([]);
      return { r: lista.length ? `Pronto. Apaguei ${lista.length === 1 ? 'o alarme' : 'os ' + lista.length + ' alarmes'}.` : 'Você não tinha alarmes.' };
    }
    if (/\b(meus|list\w*|quais)\b/.test(n) && /alarmes?/.test(n) && !/\d/.test(n)) {
      if (!lista.length) return { r: 'Você não tem alarmes. Para criar, escreva por exemplo: me avisa se o dólar passar de 5,50.' };
      return { r: '**Seus alarmes**\n' + lista.map((a) => `- ${a.nome} ${a.dir === 'acima' ? 'acima de' : 'abaixo de'} ${numAlvo(a.alvo, casasDe(a.sym))}`).join('\n') + '\n\nPara apagar todos, escreva: apagar alarmes.' };
    }
    const at = qualAtivo(t);
    if (!at) return { e: 'Não entendi qual ativo. Exemplos: dólar, Ibovespa, S&P 500, bitcoin, ouro ou um código da B3 como PETR4.' };
    const sem = norm(t).replace(/\b[a-z]{4}(3|4|5|6|11|34)\b/g, ' ').replace(/s ?& ?p ?500|sp ?500/g, ' ');
    const alvo = leNumero(sem);
    if (!alvo) return { e: 'Não achei o preço do alarme. Exemplo: me avisa se o dólar passar de 5,50.' };
    const d = await buscaCot(at.sym);
    if (!d) return { e: `Não consegui a cotação de ${at.nome} agora, então não criei o alarme. Confira o código e tente de novo.` };
    let dir;
    if (/\b(cair|caia|abaixo|perder|perca|furar|fure|menos)\b/.test(n)) dir = 'abaixo';
    else if (/\b(subir|suba|acima|ultrapass\w*|mais)\b/.test(n)) dir = 'acima';
    else dir = alvo >= d.value ? 'acima' : 'abaixo';
    const c = casasDe(at.sym);
    if ((dir === 'acima' && d.value >= alvo) || (dir === 'abaixo' && d.value <= alvo)) return { r: `${at.nome} já está ${dir === 'acima' ? 'acima' : 'abaixo'} de ${num(alvo, c)} (agora em ${num(d.value, c)}). Não criei o alarme.` };
    if (alvo > d.value * 3 || alvo < d.value / 3) return { e: `${num(alvo, c)} está muito longe do preço de agora de ${at.nome} (${num(d.value, c)}). Confira o número.` };
    lista = lista.filter((a) => !(a.sym === at.sym && a.dir === dir));
    lista.unshift({ id: Date.now().toString(36), sym: at.sym, nome: at.nome, alvo, dir, criado: Date.now() });
    if (lista.length > 12) lista = lista.slice(0, 12);
    gravaAlarmes(lista);
    return { r: `Combinado. Vou avisar quando **${at.nome}** ${dir === 'acima' ? 'passar de' : 'cair abaixo de'} **${numAlvo(alvo, c)}**. Agora está em ${num(d.value, c)}.\n\nO alarme funciona enquanto o terminal estiver aberto neste navegador. Você vê e apaga os alarmes em Ajustes > Meu painel > Assistente (robô).` };
  }
  let alRodando = false;
  async function checaAlarmes() {
    const lista = lerAlarmes();
    if (!lista.length || alRodando) return;
    alRodando = true;
    try {
      const ficam = [];
      for (const a of lista) {
        const d = await buscaCot(a.sym);
        const bateu = d && isFinite(d.value) && (a.dir === 'acima' ? d.value >= a.alvo : d.value <= a.alvo);
        if (!bateu) { ficam.push(a); continue; }
        const c = casasDe(a.sym), alvo = numAlvo(a.alvo, c), agora = num(d.value, c);
        const frase = `${a.nome} ${a.dir === 'acima' ? 'passou de' : 'caiu abaixo de'} ${alvo}`;
        avisar({ chave: 'al:' + a.id, pri: 9, visor: ['ALARME', corta(a.nome.toUpperCase(), 7), a.dir === 'acima' ? 'sobe' : 'cai'],
          html: '<span class="urg">Alarme</span><b>' + esc(frase) + '</b><small>Agora: ' + esc(agora) + (d.date ? ' · dado de ' + esc(d.date) : '') + '</small>',
          titulo: 'Alarme de preço', texto: frase + '. Agora: ' + agora + '.', voz: 'Alarme. ' + frase.replace(/\./g, ''), ms: 11000 });
      }
      if (ficam.length !== lista.length) gravaAlarmes(ficam);
    } finally { alRodando = false; }
  }
  setInterval(() => { if (!document.hidden || prefs().roboNotif === true || janelaAberta()) checaAlarmes(); }, 60000);
  setTimeout(checaAlarmes, 20000);

  // =====================================================================
  // 4. Bom dia do robô
  // =====================================================================
  function eventosHoje() {
    const hoje = sp().dia, PAIS = { USD: 'EUA', EUR: 'Zona do euro', CNY: 'China', GBP: 'Reino Unido', BRL: 'Brasil' };
    const out = [];
    agenda().forEach((e) => {
      if (!e || !e.date || /T00:00:00-/.test(e.date) || /CFTC|Sondas|GDPNow/i.test(e.title || '')) return;
      if (!((e.impact === 'High' && PAIS[e.country]) || (e.impact === 'Medium' && e.country === 'BRL'))) return;
      const t = Date.parse(e.date); if (!isFinite(t) || sp(t).dia !== hoje) return;
      let nome = e.title;
      try { if (typeof calTitle === 'function') nome = calTitle(e.country, e.title); } catch (x) { /* fica o original */ }
      out.push({ t, nome, pais: PAIS[e.country] || e.country });
    });
    return out.sort((a, b) => a.t - b.t);
  }
  function bomDia(forcar) {
    const agora = sp();
    if (!forcar) {
      if (prefs().roboBomDia === false || agora.sem < 1 || agora.sem > 5 || agora.min < 360 || agora.min >= 720) return false;
      if (mem.bomDia === agora.dia || !petVisivel()) return false;
      try { const f = window.MMFeriados && window.MMFeriados.b3(agora.dia); if (f && !f.abre) return false; } catch (e) { /* sem feriados */ }
    }
    const linhas = [];
    const es = cot('ES=F'), ib = cot('^BVSP'), dl = cot('BRL=X');
    if (es && isFinite(es.change)) linhas.push('Futuro do S&P 500: <span class="' + (es.change >= 0 ? 'sobe' : 'cai') + '">' + esc(pct(es.change)) + '</span>');
    if (ib && isFinite(ib.change)) linhas.push('Ibovespa' + (ib.date ? ' (' + esc(ib.date) + ')' : '') + ': ' + esc(num(ib.value, 0)) + ' <span class="' + (ib.change >= 0 ? 'sobe' : 'cai') + '">' + esc(pct(ib.change)) + '</span>');
    if (dl && isFinite(dl.value)) linhas.push('Dólar: R$ ' + esc(num(dl.value, 4)) + (isFinite(dl.change) ? ' <span class="' + (dl.change >= 0 ? 'sobe' : 'cai') + '">' + esc(pct(dl.change)) + '</span>' : ''));
    const ev = eventosHoje();
    if (ev.length) {
      const h = new Date(ev[0].t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      linhas.push(ev.length + (ev.length === 1 ? ' evento importante' : ' eventos importantes') + ' hoje. O primeiro: ' + esc(h) + ', ' + esc(corta(ev[0].pais + ': ' + ev[0].nome, 60)));
    }
    if (!linhas.length) { if (forcar) aviso('Ainda não tenho os dados de hoje. Tente daqui a pouco.'); return false; }
    mem.bomDia = agora.dia; memSalva();
    const sem = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][agora.sem];
    const abreCal = () => { const t = document.querySelector('[data-tab="calendar-panel"]'); if (t) t.click(); };
    const P = pet();
    const html = '<b>Bom dia!</b><small>' + linhas.join('<br>') + '</small>' + (ev.length ? '<span class="acao">Ver a agenda de hoje</span>' : '');
    const voz = 'Bom dia! ' + (ev.length ? 'Hoje tem ' + ev.length + (ev.length === 1 ? ' evento importante' : ' eventos importantes') + ' na agenda.' : 'Os números da manhã estão no meu balão.');
    if (P && P.vivo()) {
      P.pedir(forcar ? 9 : 5, () => {
        P.txt('BOM DIA', sem);
        P.cena(() => { P.tela('txt'); P.acenar(); P.classe('feliz', 1600); P.dizer(html, 12000, ev.length ? abreCal : null, true); setTimeout(() => P.tela(''), 5000); }, 12200);
        falar(voz);
      }, 'bomdia');
    } else aviso('Bom dia! ' + linhas.map((l) => l.replace(/<[^>]+>/g, '')).join(' · '));
    return true;
  }
  // espera as cotações chegarem (até uns 2 min depois de abrir)
  let tentaBomDia = 0;
  const bomDiaTimer = setInterval(() => {
    if (++tentaBomDia > 24 || mem.bomDia === sp().dia) return clearInterval(bomDiaTimer);
    if (!document.hidden && (cot('^BVSP') || cot('ES=F'))) { if (bomDia(false)) clearInterval(bomDiaTimer); }
  }, 5000);

  // =====================================================================
  // 5. Decisão do Copom e do Fed ao vivo
  // =====================================================================
  const JUROS_KEY = 'mm_robo_juros_v1';
  let juros = null;
  try { juros = JSON.parse(localStorage.getItem(JUROS_KEY) || 'null'); } catch (e) { juros = null; }
  async function carregaJuros() {
    if (juros && Date.now() - juros.quando < 6 * 3600000) return juros;
    const base = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/';
    const pega = (u) => fetch(base + u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [c, f] = await Promise.all([pega('copom/copom.json'), pega('fed/fed.json')]);
    if (!c && !f) return juros;
    const j = { quando: Date.now(), copom: [], fed: [], selic: c && isFinite(c.selic) ? c.selic : null, alvo: f && f.alvo ? f.alvo : null };
    if (c && Array.isArray(c.reunioes)) j.copom = c.reunioes.slice(0, 3).map((r) => {
      const h = Array.isArray(r.hist) && r.hist.length ? r.hist[r.hist.length - 1] : null;
      let top = null;
      if (h && h.p) for (const [k, v] of Object.entries(h.p)) if (isFinite(v) && (!top || v > top.p)) top = { k, p: v };
      return { data: r.data, top: top ? { nome: r.cenarios?.[top.k]?.nome || top.k, p: top.p } : null, pregao: h ? h.d : null };
    });
    if (f && Array.isArray(f.reunioes)) j.fed = f.reunioes.slice(0, 3).map((r) => ({ data: r.data }));
    juros = j;
    try { localStorage.setItem(JUROS_KEY, JSON.stringify(j)); } catch (e) { /* sem armazenamento */ }
    return j;
  }
  function esperavaFed(dia) {
    try {
      const x = JSON.parse(localStorage.getItem('mm_fed_exp_v1') || 'null');
      if (!x || Date.now() - x.quando > 4 * 86400000) return null;
      const r = (x.reunioes || []).find((y) => y.data === dia);
      if (!r || !r.dist) return null;
      let top = null;
      for (const [k, v] of Object.entries(r.dist)) if (isFinite(v) && (!top || v > top.p)) top = { s: +k, p: v };
      if (!top) return null;
      const nome = top.s === 0 ? 'manutenção' : top.s < 0 ? 'corte de ' + (-top.s * 25) + ' pontos' : 'alta de ' + (top.s * 25) + ' pontos';
      return { nome, p: top.p, quando: x.quando };
    } catch (e) { return null; }
  }
  const RE_COPOM = /copom|selic/i, RE_FED = /\bfed\b|fomc|powell|federal reserve|fed funds|juros (nos|dos) eua/i;
  const RE_DECISAO = /decis|decid|mant[eé]m|mantid|manten|corta|corte|reduz|eleva|sobe|subiu|aument|alta de|queda de|hold|holds|cut|cuts|rais|keeps|leaves|unchanged|bps|basis point|pontos-base|p\.?b\.?/i;
  function olhaDecisoes() {
    if (!juros) return;
    const now = Date.now(), hoje = sp().dia;
    const lista = [];
    (juros.copom || []).forEach((r) => { if (r.data === hoje) lista.push({ qual: 'copom', t: emFuso(r.data, '18:30', 'America/Sao_Paulo'), r }); });
    (juros.fed || []).forEach((r) => { if (r.data === hoje) lista.push({ qual: 'fed', t: emFuso(r.data, '14:00', 'America/New_York'), r }); });
    lista.forEach(({ qual, t, r }) => {
      if (now < t - 60000 || now > t + 45 * 60000) return;
      const nomeBanco = qual === 'copom' ? 'Copom' : 'Fed';
      const k = 'dec:' + qual + ':' + r.data;
      if (jaFoi(k)) return;
      // a manchete da decisão: notícia do assunto publicada a partir do horário, com palavra de decisão
      const re = qual === 'copom' ? RE_COPOM : RE_FED;
      const n = noticias().filter((x) => x && x.data >= t - 120000 && re.test(x.titulo || '') && RE_DECISAO.test(x.titulo || '')).sort((a, b) => a.data - b.data)[0];
      let esperava = '';
      if (qual === 'copom' && r.top) esperava = 'Antes, as opções de Copom da B3 davam ' + r.top.nome.toLowerCase() + ' com ' + num(r.top.p, 0) + '% de chance' + (r.pregao ? ' (pregão de ' + ddmm(r.pregao) + ')' : '') + '.';
      if (qual === 'fed') { const e = esperavaFed(r.data); if (e) esperava = 'Antes, os futuros de Fed Funds davam ' + e.nome + ' com ' + num(e.p, 0) + '% de chance.'; }
      if (!n) {
        // na hora marcada, avisa que está de olho (uma vez)
        const k0 = 'dec0:' + qual + ':' + r.data;
        if (now >= t && !jaFoi(k0)) avisar({ chave: k0, pri: 8, visor: ['DECISÃO', nomeBanco.toUpperCase()], html: '<b>Hora da decisão do ' + nomeBanco + '</b><small>Estou de olho nas notícias e aviso assim que sair.' + (esperava ? '<br>' + esc(esperava) : '') + '</small>', titulo: 'Decisão do ' + nomeBanco, texto: 'Hora da decisão do ' + nomeBanco + '. ' + esperava, ms: 9000 });
        return;
      }
      const abre = () => { if (typeof window.openNewsReader === 'function') window.openNewsReader(n.id); else if (n.link) window.open(n.link, '_blank', 'noopener'); };
      avisar({ chave: k, pri: 10, visor: ['DECISÃO', nomeBanco.toUpperCase()], tela: 'txt',
        html: '<span class="urg">' + esc(nomeBanco) + '</span><b>' + esc(corta(n.titulo, 150)) + '</b><small>' + esc(n.fonte || '') + (esperava ? '<br>' + esc(esperava) : '') + '</small><span class="acao">Ler a notícia</span>',
        titulo: 'Decisão do ' + nomeBanco, texto: n.titulo + (esperava ? ' ' + esperava : ''), acao: abre, voz: 'Saiu a decisão do ' + nomeBanco + '. ' + n.titulo, ms: 14000 });
    });
  }
  carregaJuros().then(olhaDecisoes).catch(() => {});
  setInterval(() => { carregaJuros().then(olhaDecisoes).catch(() => {}); }, 30000);

  // =====================================================================
  // 6. Pergunta do dia
  // =====================================================================
  function perguntas() {
    const out = [];
    try {
      (window.MMEduConteudo?.trilhas || []).forEach((tr) => (tr.licoes || []).forEach((l) => (l.quiz || []).forEach((q, i) => {
        if (q && q.p && Array.isArray(q.o) && isFinite(q.c)) out.push({ q, licao: l.id, titulo: l.titulo, trilha: tr.titulo, id: l.id + ':' + i });
      })));
    } catch (e) { /* sem lições */ }
    return out;
  }
  function daVez(dia) {
    const lista = perguntas(); if (!lista.length) return null;
    let h = 0; for (const ch of dia) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return lista[h % lista.length];
  }
  const QZ_CSS = `
    .rq { position: fixed; z-index: 1190; right: 18px; bottom: 130px; width: min(340px, calc(100vw - 32px)); background: var(--surface, #1a1d24); color: var(--text, #e8e6e3);
      border: 1px solid var(--line-2, #2a2f3a); border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,.35); padding: 14px 14px 12px; font-size: 13.5px; }
    .rq h4 { margin: 0 0 2px; font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--accent, #f2b92e); display: flex; justify-content: space-between; gap: 8px; }
    .rq h4 span { color: var(--text-3, #8a909a); text-transform: none; letter-spacing: 0; font-weight: 500; }
    .rq p.rq-p { margin: 6px 0 10px; font-weight: 600; line-height: 1.4; }
    .rq button.rq-o { display: block; width: 100%; text-align: left; margin: 0 0 6px; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--line-2, #2a2f3a); background: var(--surface-2, #161920); color: inherit; font: inherit; cursor: pointer; }
    .rq button.rq-o:hover:not(:disabled) { border-color: var(--accent, #f2b92e); }
    .rq button.rq-o.certa { border-color: var(--pos, #16c784); background: color-mix(in srgb, var(--pos, #16c784) 14%, transparent); }
    .rq button.rq-o.errada { border-color: var(--neg, #ea3943); background: color-mix(in srgb, var(--neg, #ea3943) 14%, transparent); }
    .rq .rq-e { margin: 8px 0 0; font-size: 12.5px; color: var(--text-2, #c9ccd1); line-height: 1.45; }
    .rq .rq-pe { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; flex-wrap: wrap; }
    .rq .rq-pe button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line-2, #2a2f3a); background: transparent; color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; }
    .rq .rq-pe button.pri { background: var(--accent, #f2b92e); border-color: var(--accent, #f2b92e); color: #111; }
    @media (max-width: 900px) { .rq { right: 16px; bottom: 90px; } }`;
  let qzEstilo = false;
  function abrirQuiz() {
    const dia = sp().dia, item = daVez(dia);
    if (!item) { aviso('As lições da aba Educação ainda não carregaram.'); return false; }
    if (!qzEstilo) { const st = document.createElement('style'); st.textContent = QZ_CSS; document.head.append(st); qzEstilo = true; }
    document.querySelector('.rq')?.remove();
    mem.quiz = mem.quiz || { seq: 0 };
    const Q = mem.quiz, feito = Q.dia === dia;
    const box = document.createElement('div');
    box.className = 'rq'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Pergunta do dia');
    const seqTxt = () => (Q.seq > 0 ? Q.seq + (Q.seq === 1 ? ' acerto seguido' : ' acertos seguidos') : '');
    box.innerHTML = `<h4>Pergunta do dia <span>${esc(seqTxt())}</span></h4><p class="rq-p">${esc(item.q.p)}</p>
      ${item.q.o.map((o, i) => `<button type="button" class="rq-o" data-i="${i}">${esc(o)}</button>`).join('')}
      <p class="rq-e" hidden></p><div class="rq-pe"><button type="button" data-a="fecha">${feito ? 'Fechar' : 'Agora não'}</button></div>`;
    document.body.append(box);
    const mostra = (escolha) => {
      const certo = escolha === item.q.c;
      box.querySelectorAll('.rq-o').forEach((b) => { b.disabled = true; const i = +b.dataset.i; if (i === item.q.c) b.classList.add('certa'); else if (i === escolha) b.classList.add('errada'); });
      const e = box.querySelector('.rq-e'); e.hidden = false;
      e.innerHTML = '<b>' + (certo ? 'Certo!' : 'Não foi dessa vez.') + '</b> ' + esc(item.q.e || '');
      box.querySelector('h4 span').textContent = seqTxt();
      const pe = box.querySelector('.rq-pe');
      pe.innerHTML = (window.MMEdu ? '<button type="button" data-a="licao">Ver a lição</button>' : '') + '<button type="button" class="pri" data-a="fecha">Fechar</button>';
    };
    if (feito && isFinite(Q.escolha)) mostra(Q.escolha);
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'fecha') { box.remove(); return; }
      if (b.dataset.a === 'licao') { box.remove(); window.MMEdu?.abrir(item.licao); return; }
      if (b.classList.contains('rq-o') && Q.dia !== dia) {
        const i = +b.dataset.i, certo = i === item.q.c;
        const ontem = sp(Date.now() - 86400000).dia;
        // seguidos = dias com resposta certa, sem pular dia em que a pergunta apareceu
        Q.seq = certo ? (Q.ultimoCerto === ontem || Q.ultimoCerto === Q.dia ? Q.seq + 1 : 1) : 0;
        if (certo) Q.ultimoCerto = dia;
        Q.dia = dia; Q.escolha = i; memSalva();
        mostra(i);
        const P = pet(); if (P) { if (certo) { P.classe('feliz', 1800); P.acenar(); } else P.classe('triste', 1800); }
      }
    });
    box.querySelector('.rq-o, button')?.focus({ preventScroll: true });
    return true;
  }
  // aparece uma vez por dia, depois de uns minutos com o terminal aberto e o robô parado
  let qzMin = 0;
  setInterval(() => {
    if (document.hidden) return;
    qzMin++;
    const dia = sp().dia;
    if (qzMin < 4 || prefs().roboQuiz === false || mem.quizOferta === dia || (mem.quiz && mem.quiz.dia === dia) || !petVisivel() || pet().ocupado()) return;
    if (!daVez(dia)) return;
    mem.quizOferta = dia; memSalva();
    const P = pet();
    P.pedir(3, () => {
      P.txt('PERGUNTA', '?');
      P.cena(() => { P.tela('txt'); P.classe('pensa', 1500); P.dizer('<b>Pergunta do dia</b><small>Uma pergunta rápida das lições da aba Educação.' + (mem.quiz?.seq ? ' Você está com ' + mem.quiz.seq + (mem.quiz.seq === 1 ? ' acerto seguido.' : ' acertos seguidos.') : '') + '</small><span class="acao">Responder</span>', 10000, abrirQuiz, true); setTimeout(() => P.tela(''), 4500); }, 10200);
    }, 'quiz');
  }, 60000);

  // =====================================================================
  // 7. Comandos de voz
  // =====================================================================
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ABAS = [
    [/calendario|agenda/, 'calendar-panel'], [/noticia/, 'news-panel'], [/mapa( de)? calor/, 'heatmap-panel'], [/watch ?list|lista/, 'watch-panel'],
    [/\bmesa\b/, 'mesa-panel'], [/resumo semanal|resumo da semana/, 'weekly-panel'], [/analise/, 'analysis-panel'], [/fundamento|balanco/, 'fund-panel'],
    [/indicador/, 'indicators-panel'], [/calculadora/, 'calculator-panel'], [/opco|opcao/, 'options-panel'], [/educacao|lic(ao|oes)|aula/, 'edu-panel'], [/mercado/, 'market-panel'],
  ];
  function abreAba(id) { const t = document.querySelector('.tab-btn[data-tab="' + id + '"]'); if (!t) return false; window.MMAssistente?.fechar(); t.click(); return true; }
  function executar(texto) {
    const n = norm(texto);
    if (!n) return false;
    if (/\b(explica|explique|explicar)\b.*\btela\b/.test(n)) { window.MMAssistente?.explicarTela(); return true; }
    if (/\bpergunta do dia\b|\bquiz\b/.test(n)) { window.MMAssistente?.fechar(); abrirQuiz(); return true; }
    if (/^bom dia\b/.test(n)) { window.MMAssistente?.fechar(); bomDia(true); return true; }
    if (/\b(janela|flutuante)\b/.test(n) && /\b(robo|abr|abre)/.test(n)) { aviso('Por segurança, a janela flutuante abre com um clique: use o botão no robô ou em Ajustes.'); return true; }
    if (/^(fecha|fechar|feche)\b/.test(n) && /assistente|painel|chat/.test(n)) { window.MMAssistente?.fechar(); return true; }
    const abrir = n.match(/^(abr\w*|mostr\w*|vai (para|pra)|ir (para|pra)|quero ver|ver)\s+(a |o |as |os |na |no |pra |para )?(aba )?(.+)$/);
    if (abrir) {
      const alvo = abrir[6];
      for (const [re, id] of ABAS) if (re.test(alvo) && abreAba(id)) return true;
      // pelo nome escrito na barra de abas
      for (const b of document.querySelectorAll('.tab-btn[data-tab]')) { const l = norm(b.textContent); if (l && (alvo.includes(l) || l.includes(alvo))) { window.MMAssistente?.fechar(); b.click(); return true; } }
    }
    const pedeCot = n.match(/\b(cotacao|quanto (esta|ta)|como (esta|ta))\b/);
    if (pedeCot) {
      const at = qualAtivo(texto);
      if (at) {
        buscaCot(at.sym).then((d) => {
          if (!d) { aviso('Não consegui a cotação de ' + at.nome + ' agora.'); return; }
          const P = pet();
          if (P && P.vivo() && isFinite(d.change)) { window.MMAssistente?.fechar(); P.mostraAtivo(corta(at.nome.toUpperCase(), 9), at.nome, d, false); }
          else aviso(at.nome + ': ' + num(d.value, casasDe(at.sym)) + (isFinite(d.change) ? ' (' + pct(d.change) + ')' : ''));
          falar(at.nome + ' em ' + num(d.value, casasDe(at.sym)).replace(/\./g, ''));
        });
        return true;
      }
    }
    return false;
  }
  let reco = null;
  function escutar(btn) {
    if (!SR) { aviso('Este navegador não reconhece voz. Use o Chrome ou o Edge.', 'warning'); return; }
    if (reco) { try { reco.stop(); } catch (e) { /* ok */ } return; }
    if (!mem.vozAviso) { mem.vozAviso = 1; memSalva(); aviso('O reconhecimento de voz é feito pelo serviço do navegador. Fale depois do sinal vermelho.'); }
    const r = new SR();
    r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
    reco = r;
    const P = pet();
    const marcaBtn = (on) => { document.querySelectorAll('[data-ia="mic"]').forEach((b) => b.classList.toggle('ouvindo', on)); if (btn) btn.classList.toggle('ouvindo', on); };
    marcaBtn(true);
    if (P && P.vivo()) P.dizer('<b>Estou ouvindo…</b><small>Ex.: "abre o calendário", "cotação do dólar", "explica a tela"</small>', 7000, null, true);
    r.onresult = (ev) => {
      const t = ev.results?.[0]?.[0]?.transcript || '';
      if (!t) return;
      if (P) P.calar();
      if (!executar(t)) window.MMAssistente?.perguntarTexto(t);
    };
    r.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') aviso('O navegador não liberou o microfone para este site.', 'warning'); else if (ev.error === 'no-speech') aviso('Não ouvi nada. Tente de novo.'); };
    r.onend = () => { reco = null; marcaBtn(false); };
    try { r.start(); } catch (e) { reco = null; marcaBtn(false); }
  }
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'v' || e.key === 'V') && SR && window.MMAssistente) { e.preventDefault(); escutar(null); }
  });

  // =====================================================================
  // 8. Avisos do sistema com o terminal em segundo plano
  // =====================================================================
  const vistas = new Set();
  let semeado = false, ultimaBusca = 0;
  function olhaUrgentes() {
    const lista = noticias();
    if (!semeado) { lista.forEach((n) => n && vistas.add(n.id)); semeado = lista.length > 0; return; }
    lista.filter((n) => n && n.id != null && !vistas.has(n.id)).forEach((n) => {
      vistas.add(n.id);
      if (n.nivel !== 'CRITICO' || Date.now() - n.data > 15 * 60000) return;
      // com a página à vista, o robô do assistente-mascote.js já mostra; aqui só a janela flutuante e o aviso do sistema
      if (!document.hidden && !janelaAberta()) return;
      const abre = () => { if (typeof window.openNewsReader === 'function') window.openNewsReader(n.id); else if (n.link) window.open(n.link, '_blank', 'noopener'); };
      janelaAviso({ titulo: 'Urgente', texto: n.titulo + (n.fonte ? ' · ' + n.fonte : ''), acao: abre });
      // os "Avisos ligados" do app.js já mandam a notificação; não repete
      if (document.hidden && !window.__alertsOn && !janelaAberta()) notificar('Notícia urgente', n.titulo + (n.fonte ? ' · ' + n.fonte : ''), abre, 'n:' + n.id);
    });
  }
  setInterval(() => {
    const quer = (document.hidden && prefs().roboNotif === true) || janelaAberta();
    // com a página escondida o app.js não busca notícias; aqui busca a cada 2 min, só com o aviso ligado ou a janela aberta
    if (quer && document.hidden && Date.now() - ultimaBusca > 120000) {
      ultimaBusca = Date.now();
      try { if (typeof fetchNewsOnce === 'function') fetchNewsOnce(true).then(olhaUrgentes).catch(() => {}); } catch (e) { /* sem notícias */ }
    }
    olhaUrgentes();
  }, 20000);
  async function pedirNotif() {
    if (!('Notification' in window)) { aviso('Este navegador não mostra avisos do sistema.', 'warning'); return false; }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') { aviso('Os avisos estão bloqueados para este site. Libere no cadeado ao lado do endereço.', 'warning'); return false; }
    try { return (await Notification.requestPermission()) === 'granted'; } catch (e) { return false; }
  }

  // =====================================================================
  // botões no robô (computador): janela flutuante e explicar a tela
  // =====================================================================
  const BT_CSS = `
    @media (min-width:901px) {
      #ia-fab .rx-bts { position:absolute; left:-12px; top:-4px; display:flex; flex-direction:column; gap:5px; opacity:0; transform:translateX(4px); transition:opacity .15s, transform .15s; pointer-events:none; z-index:2; }
      #ia-fab:hover .rx-bts, #ia-fab:focus-within .rx-bts { opacity:1; transform:none; pointer-events:auto; }
      #ia-fab.ia-pet-arrastando .rx-bts { opacity:0 !important; }
      #ia-fab.ia-pet-esq .rx-bts { left:auto; right:-12px; }
      #ia-fab .rx-bt { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--surface,#1a1d24); border:1px solid var(--line-2,#2a2f3a); color:var(--accent,#f2b92e); box-shadow:0 4px 10px rgba(0,0,0,.3); cursor:pointer; }
      #ia-fab .rx-bt:hover { border-color:var(--accent,#f2b92e); transform:scale(1.08); }
      #ia-fab .rx-bt svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    }
    @media (max-width:900px) { #ia-fab .rx-bts { display:none; } }`;
  function botoes() {
    const P = pet(); if (!P || P.el.querySelector('.rx-bts')) return;
    const st = document.createElement('style'); st.textContent = BT_CSS; document.head.append(st);
    const w = document.createElement('span');
    w.className = 'rx-bts';
    const gem = () => window.MMAssistente && window.MMAssistente.gemini && window.MMAssistente.gemini();
    w.innerHTML = '<span class="rx-bt" role="button" tabindex="0" data-rx="janela" title="Abrir o robô numa janela flutuante, por cima de outros programas"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="11" y="10" width="8" height="6" rx="1" fill="currentColor"/></svg></span>'
      + '<span class="rx-bt" role="button" tabindex="0" data-rx="tela" title="Explicar esta tela com o Google Gemini (o texto da aba vai junto)"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6V14"/><path d="M12 17.2v.1"/></svg></span>';
    P.el.append(w);
    if (!gem()) setTimeout(() => { if (!gem()) w.querySelector('[data-rx="tela"]').style.display = 'none'; }, 3000);
    const acao = (e) => {
      const b = e.target.closest('[data-rx]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.rx === 'janela') abrirJanela();
      else window.MMAssistente?.explicarTela();
    };
    w.addEventListener('pointerdown', (e) => e.stopPropagation());
    w.addEventListener('click', acao);
    w.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') acao(e); });
  }
  if (pet()) botoes(); else window.addEventListener('mm-pet-pronto', botoes, { once: true });

  window.MMRoboAlarmes = { ehPedido, doTexto, lista: lerAlarmes, apagar: (id) => gravaAlarmes(lerAlarmes().filter((a) => a.id !== id)), checar: checaAlarmes, nomeNum: (a) => numAlvo(a.alvo, casasDe(a.sym)) };
  window.MMRoboComando = { tem: () => !!SR, escutar, executar };
  window.MMRoboExtras = { abrirJanela, janelaAberta, bomDia: () => bomDia(true), quiz: abrirQuiz, decisoes: olhaDecisoes, juros: () => juros, pedirNotif, avisar,
    // para conferir à mão (testes): troca os dados de reuniões e roda a checagem
    _setJuros: (j) => { juros = j; } };
})();
