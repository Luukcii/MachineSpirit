// Machine Spirit (locked copy): serves the unlocked app from this phone's cache, so it opens offline.
// The unlocked files are put in the cache by the lock screen after the passcode is entered.
const STATIC = 'ms-static';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  const inApp = u.pathname.startsWith(scope.pathname + 'app/');
  e.respondWith(
    (async () => {
      if (inApp) {
        // the app page itself: app/ and app/index.html
        const key = u.pathname.endsWith('/') ? new URL('index.html', u).href : u.href.split('#')[0].split('?')[0];
        const hit = await caches.match(key);
        if (hit) return hit;
      }
      try {
        const r = await fetch(e.request);
        // keep the text / barcode readers and icons for offline use
        if (r.ok && inApp && /\/app\/(ocr\/|icon|apple-touch)/.test(u.pathname)) (await caches.open(STATIC)).put(e.request, r.clone());
        if (r.ok && !inApp) (await caches.open(STATIC)).put(e.request, r.clone());
        return r;
      } catch (err) {
        // no signal: the lock screen (/ or /index.html) and everything else from the phone's cache
        const hit = (await caches.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' && !inApp ? await caches.match(new URL('./', self.registration.scope).href) : null);
        if (hit) return hit;
        throw err;
      }
    })()
  );
});
