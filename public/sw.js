/**
 * Offline fallback for the show floor.
 *
 * Network-first, always. The cache exists so the app opens with no signal at
 * the table — it is never allowed to become the source of truth, and it never
 * touches API or cross-origin traffic (auth and Firestore must never be served
 * a stale answer).
 */
const CACHE = 'showkardz-shell-v1';

/**
 * How long to wait for the network before serving the cached copy.
 *
 * Network-first only behaves well when the network fails FAST. A show hall is
 * the other case: one bar of signal, or a wifi login page that never answers,
 * where fetch can sit for thirty seconds or more before it rejects. That is the
 * exact situation this cache exists for, and waiting it out turned the app's
 * launch into a hang.
 *
 * Three seconds: long enough that a working connection always wins the race and
 * the dealer gets the current build, short enough that a dead one never costs
 * more than a beat.
 */
const NETWORK_TIMEOUT_MS = 3000;

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

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cached = await caches.match(request);

  // Never rejects: a failed fetch resolves to null so it can be raced without
  // an unhandled rejection landing after the cache has already been served.
  const network = fetch(request)
    .then((response) => {
      // Keep the latest good copy for the next dead-signal open.
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // The clock only applies when there is something to fall back TO. Whichever
    // arrives first wins; the network keeps going either way, so the cache is
    // still refreshed for next time even when the cached copy was served.
    const winner = await Promise.race([
      network,
      new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS)),
    ]);
    return winner ?? cached;
  }

  // Nothing cached for this URL: the network is the only answer, so wait it out.
  const response = await network;
  if (response) return response;

  // A navigation with nothing cached for that exact URL still has the shell.
  if (request.mode === 'navigate') {
    const shell = await caches.match(new URL('./', self.location.href).href);
    if (shell) return shell;
  }
  return Response.error();
}
