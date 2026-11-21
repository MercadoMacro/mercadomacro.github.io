(() => {
  const end = Date.parse('2026-12-05T00:00:00-03:00');
  if (Date.now() >= end) return;
  const news = document.getElementById('news-panel');
  const actions = news?.querySelector('.nw3-acoes') || news?.querySelector('.news-toolbar');
  const panel = document.getElementById('schwab-tv-panel');
  if (!actions || !panel) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-sm';
  button.textContent = 'TV ao vivo · EN';
  button.setAttribute('aria-controls', panel.id);
  button.setAttribute('aria-expanded', 'false');
  actions.prepend(button);

  function count(aba) {
    let nova = 0;
    try {
      const day = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Sao_Paulo'});
      const key = 'mm_uso_' + aba;
      nova = Number(localStorage.getItem(key) !== day);
      localStorage.setItem(key, day);
    } catch {}
    fetch('/api/uso', {method: 'POST', keepalive: true, headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({aba, nova})}).catch(() => {});
  }

  let api;
  function loadApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!api) api = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        resolve(window.YT);
        previous?.();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { api = null; script.remove(); reject(new Error('API indisponível')); };
      document.head.append(script);
    });
    return api;
  }

  let player;
  function close() {
    player?.destroy();
    player = null;
    panel.replaceChildren();
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'TV ao vivo · EN';
  }

  button.addEventListener('click', () => {
    if (!panel.hidden) return close();
    if (Date.now() >= end) { button.remove(); return; }
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'Fechar TV';
    const frame = document.createElement('iframe');
    frame.title = 'Schwab Network ao vivo em inglês';
    frame.src = 'https://www.youtube.com/embed/Sj1NLE3MRI8?autoplay=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.cssText = 'display:block;width:100%;max-width:760px;aspect-ratio:16/9;height:auto;border:0';
    const link = document.createElement('a');
    link.href = 'https://www.youtube.com/@SchwabNetwork/live';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Schwab Network · assistir no canal oficial ↗';
    panel.append(frame, link);
    count('schwab-open');
    let counted = false;
    loadApi().then(YT => {
      if (!frame.isConnected) return;
      function observeState(state) {
        if (frame.isConnected && !counted && state === YT.PlayerState.PLAYING) {
          counted = true;
          count('schwab-play');
        }
      }
      player = new YT.Player(frame, {events: {
        onReady: event => observeState(event.target.getPlayerState()),
        onStateChange: event => observeState(event.data)
      }});
    }).catch(() => {});
  });

  new MutationObserver(() => {
    if (!panel.hidden && news.getAttribute('aria-hidden') === 'true') close();
  }).observe(news, {attributes: true, attributeFilter: ['aria-hidden']});
})();
