// sw.js - Service Worker para notificações push
const CACHE_NAME = 'terminal-news-v2';
const NOTIFICATION_ICON = './favicon.ico';
const OFFLINE_PAGE = '/offline.html';

// Lista de arquivos para cache
const CACHE_FILES = [
  '/',
  '/index.html',
  './favicon.ico',
  './styles.css',
  './app.js',
  OFFLINE_PAGE
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Cache aberto');
        return cache.addAll(CACHE_FILES);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy com fallback para rede
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna do cache se encontrado
        if (response) {
          return response;
        }

        // Faz requisição para a rede
        return fetch(event.request)
          .then(response => {
            // Se a resposta é válida, adiciona ao cache
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Fallback para página offline se a requisição falhar
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_PAGE);
            }
          });
      })
  );
});

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push recebido:', event);

  if (!(self.Notification && self.Notification.permission === 'granted')) {
    return;
  }

  const data = event.data?.json();
  if (!data) {
    console.log('[Service Worker] Notificação sem dados válidos');
    return;
  }

  const { title, body, icon, url } = data;
  
  event.waitUntil(
    self.registration.showNotification(title || 'Terminal de Notícias', {
      body: body || 'Nova atualização disponível',
      icon: icon || NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      vibrate: [200, 100, 200],
      data: { url: url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notificação clicada:', event.notification);
  event.notification.close();

  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(clientList => {
      // Foca em uma janela existente se já estiver aberta
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }

      // Abre uma nova janela se não encontrou uma existente
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SEND_NOTIFICATION') {
    const { title, body, icon, data } = event.data.notification;
    event.waitUntil(
      self.registration.showNotification(title || 'Terminal de Notícias', {
        body: body || 'Nova atualização disponível',
        icon: icon || NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        data: data || { url: '/' }
      })
    );
  }
});

// Background Sync (opcional - para futuras implementações)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-news') {
    console.log('[Service Worker] Background Sync disparado');
    // Implementar lógica de sincronização aqui
  }
});