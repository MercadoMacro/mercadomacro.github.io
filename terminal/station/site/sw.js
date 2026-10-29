/* Mercado Macro: service worker do aplicativo instalado.
   Arquivos do site: sempre tenta a rede primeiro (nunca prende numa versão velha)
   e usa a cópia guardada só quando está sem internet.
   Bibliotecas de CDN com versão fixa e fontes: usa a cópia guardada e atualiza por trás.
   Dados (worker, Banco Central, GitHub etc.) não passam por aqui: o site já guarda os últimos valores. */
const CACHE = 'mm-site-v172';
const CDN = 'mm-cdn-v1';
const BASE = ['./', 'index.html', 'passe.js?v=1', 'estilo.css?v=59', 'crypto-live.js?v=2', 'forex-live.js?v=7', 'crypto-live.css?v=2', 'feriados.js?v=2', 'app.js?v=117', 'ana-secoes.js?v=6', 'analise-avancada.js?v=1', 'ajustes.js?v=23', 'asset-history.js?v=4', 'asset-history.css?v=4', 'extras.js?v=23', 'asset-catalog.js?v=1', 'asset-search-core.js?v=2', 'asset-search.js?v=2', 'asset-search.css?v=2', 'cabecalho.js?v=2', 'noticias2.js?v=6', 'topo-acoes.js?v=1', 'navegacao-mobile.js?v=2', 'watchlists-core.js?v=1', 'watchlists-store.js?v=2', 'watchlists-ui.js?v=2', 'watchlists-ui.css?v=2', 'mesa-layout.js?v=2', 'mesa-layout.css?v=2', 'watchlist-table-core.js?v=2', 'watchlist-table.js?v=12', 'watchlist-table.css?v=8', 'conforto.css?v=2',
  'icone-mercado-macro.png', 'icone-192.png', 'logo-mercado-macro.png', 'logo-mercado-macro-claro.png'];
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
