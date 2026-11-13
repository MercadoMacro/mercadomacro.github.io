/* Mercado Macro: service worker do aplicativo instalado.
   Arquivos do site: sempre tenta a rede primeiro (nunca prende numa versão velha)
   e usa a cópia guardada só quando está sem internet.
   Bibliotecas de CDN com versão fixa e fontes: usa a cópia guardada e atualiza por trás.
   Dados (worker, Banco Central, GitHub etc.) não passam por aqui: o site já guarda os últimos valores. */
const CACHE = 'mm-site-v307';
const CDN = 'mm-cdn-v1';
const BASE = ['./', 'index.html', 'passe.js?v=3', 'estilo.css?v=82', 'crypto-live.js?v=2', 'forex-live.js?v=15', 'crypto-live.css?v=2', 'feriados.js?v=2', 'news-stream.js?v=1', 'app.js?v=179', 'ana-secoes.js?v=10', 'analise-avancada.js?v=1', 'ajustes.js?v=47', 'asset-history.js?v=4', 'asset-history.css?v=4', 'extras.js?v=29', 'asset-catalog.js?v=1', 'asset-search-core.js?v=2', 'asset-search.js?v=2', 'asset-search.css?v=2', 'cabecalho.js?v=2', 'noticias2.js?v=7', 'noticias3.js?v=1', 'noticias3.css?v=2', 'navegacao-mobile.js?v=3', 'watchlists-core.js?v=4', 'watchlists-store.js?v=4', 'watchlists-ui.js?v=5', 'watchlists-ui.css?v=3', 'mesa-layout.js?v=2', 'mesa-layout.css?v=2', 'watchlist-table-core.js?v=4', 'watchlist-table.js?v=21', 'watchlist-table.css?v=11', 'conforto.css?v=2', 'terminal.css?v=3', '/vitrine/ajuda-conteudo.js?v=2', 'educacao-conteudo.js?v=6', 'educacao.js?v=6', 'plano-livre.js?v=3', 'abas-borda.js?v=6', 'assistente.js?v=16', 'assistente-mascote.js?v=22', 'robo-extras.js?v=6', 'robo-colete-integrado.webp?v=1', 'robo-cabeca.webp?v=1', 'robo-corpo.webp?v=1', 'robo-braco.webp?v=1', 'resumo-ia.js?v=1', 'temperatura.js?v=4', 'ao-vivo-solto.js?v=3', 'ao-vivo-solto.css?v=4',
  'icone-mercado-macro.png', 'icone-192.png'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== CDN).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // login, cadastro e administração nunca passam pelo cache
    if (/^\/(api\/|entrar|admin|conta|assinar)/.test(url.pathname)) return;
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(CDN).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});

// Avisos com o site fechado (alarmes de preço da Jade, 11/11/2026). O push chega vazio:
// o texto vem de /api/push/pendentes, com o login do site. Todo push precisa mostrar um aviso.
self.addEventListener('push', (e) => {
  e.waitUntil(fetch('/api/push/pendentes', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { avisos: [] }))
    .catch(() => ({ avisos: [] }))
    .then((j) => {
      const avisos = (j && Array.isArray(j.avisos) ? j.avisos : []).slice(0, 3);
      if (!avisos.length) avisos.push({ id: 'x', titulo: 'Mercado Macro', texto: 'Um alarme de preço da Jade disparou. Abra o terminal para ver.' });
      return Promise.all(avisos.map((a) => self.registration.showNotification(a.titulo || 'Mercado Macro', {
        body: a.texto || '', tag: 'mm-aviso-' + a.id, icon: 'icone-192.png', badge: 'icone-192.png', data: { url: '/' },
      })));
    }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => new URL(c.url).origin === self.location.origin);
    return w ? w.focus() : self.clients.openWindow('/');
  }));
});
