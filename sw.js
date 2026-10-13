// O site antigo saiu daqui. Este service worker apaga o cache antigo, se desliga
// e recarrega as abas abertas, para quem visitou antes ir para mercadomacro.com.br.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('https://mercadomacro.com.br/');
  })());
});
