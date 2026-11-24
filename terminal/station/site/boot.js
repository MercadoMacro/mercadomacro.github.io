/* Início da página (22/11/2026): saiu de dentro do index.html para arquivo, por causa da regra de scripts (CSP).
   Roda no <head>, antes de a página aparecer. */
/* Erros de JavaScript (24/11/2026): avisa o servidor (/api/erro-js) para aparecer no /admin. Só mensagem, arquivo, linha,
   aba e tipo de aparelho; no máximo 5 por página aberta, sem repetir o mesmo erro. */
(() => {
  let n = 0; const vistos = new Set();
  const ua = navigator.userAgent || '';
  const ap = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'celular' : 'computador';
  const manda = (m, a, l) => {
    try {
      if (!m || n >= 5) return;
      const k = m + '|' + a + '|' + l; if (vistos.has(k)) return; vistos.add(k); n++;
      const b = document.querySelector('.tab-btn.active');
      const corpo = JSON.stringify({ itens: [{ m: String(m).slice(0, 300), a: String(a || '').slice(0, 300), l: +l || 0, aba: (b && b.dataset.tab) || location.pathname, ap }] });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/erro-js', new Blob([corpo], { type: 'application/json' }));
      else fetch('/api/erro-js', { method: 'POST', body: corpo, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    } catch (e) { /* nunca atrapalha a página */ }
  };
  addEventListener('error', (e) => { if (e && e.message) manda(e.message, e.filename, e.lineno); });
  addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason, st = String((r && r.stack) || ''), loc = st.match(/(https?:\/\/[^\s)]+?):(\d+):\d+/);
    manda('(promessa) ' + ((r && r.message) || r), loc ? loc[1] : '', loc ? loc[2] : 0);
  });
})();
/* Ajustes salvos: aplicados antes da página aparecer (sem piscar) */
(() => {
  try {
    const p = JSON.parse(localStorage.getItem('trader_prefs_v1') || '{}') || {};
    const h = document.documentElement, d = h.dataset;
    if (p.accent && p.accent !== 'ambar') d.accent = p.accent;
    if (p.wp && p.wp !== 'grade') {
      d.wp = p.wp;
      if (p.wpOp != null) h.style.setProperty('--wp-op', p.wpOp);
      if (p.wp === 'imagem') {
        const src = p.wpUrl || localStorage.getItem('trader_wallpaper_img');
        if (src) h.style.setProperty('--wp-img', 'url("' + String(src).replace(/"/g, '%22') + '")'); else d.wp = 'grade';
        h.style.setProperty('--wp-dim', (p.wpDim ?? 55) + '%');
        h.style.setProperty('--wp-blur', (p.wpBlur ?? 0) + 'px');
      }
    }
    if (p.glass) d.glass = 'on';
    if (p.density === 'compact') d.density = 'compact';
    if (p.scale && p.scale !== 1) { d.scale = p.scale; h.style.setProperty('--ui-zoom', p.scale); }
    if (p.updown && p.updown !== 'padrao') d.updown = p.updown;
    if (p.motion === 'off') d.motion = 'off';
    if (p.ticker === 'off') d.ticker = 'off';
    if (p.mode === 'terminal') { d.term = 'on'; localStorage.setItem('trader_theme', p.termClaro ? 'light' : 'dark'); }
    if (p.cardSource === true) d.cardSource = 'on';
    if (p.cardTime === true) d.cardTime = 'on';
    // tema automático (sistema) ou por horário: decide antes do script principal ler o tema
    if (p.mode === 'auto') localStorage.setItem('trader_theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (p.mode === 'hour') { const hr = new Date().getHours(); localStorage.setItem('trader_theme', hr >= (p.dayFrom ?? 7) && hr < (p.dayTo ?? 19) ? 'light' : 'dark'); }
    if (p.startTab) localStorage.setItem('trader_active_tab', p.startTab);
  } catch (e) { /* sem ajustes salvos */ }
})();
// carregando: a página fica escondida até os scripts montarem barra lateral, tema e aba
(() => { const h = document.documentElement; h.classList.add('mm-boot'); try { if (localStorage.getItem('trader_theme') === 'light') h.classList.add('mm-boot-claro'); } catch (e) { /* sem armazenamento */ } setTimeout(() => h.classList.remove('mm-boot'), 5000); })();
