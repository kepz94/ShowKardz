/**
 * Offline fallback for the show floor.
 *
 * Network-first, always. The cache exists so the app opens with no signal at
 * the table — it is never allowed to become the source of truth, and it never
 * touches API or cross-origin traffic (auth and Firestore must never be served
 * a stale answer).
 */
const CACHE = 'showkardz-shell-v1';

self.addEventListener('install', (event) => {
  // A new build should take over without the dealer knowing there was one.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GETs for the app shell itself.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep the latest good copy for the next dead-signal open.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation with nothing cached for that exact URL still has the shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match(new URL('./', self.location.href).href);
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
