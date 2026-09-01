/*
 * Offline shell.
 *
 * Hashed build assets are immutable, so they are safe to serve from cache
 * forever. The HTML shell is NOT: serving it from cache first would pin every
 * judge to whatever version they first opened, and a fix pushed on the morning
 * of the hackathon would never reach them. So navigations go to the network
 * first and fall back to the cache only when offline.
 */
const CACHE = 'flyai-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Supabase traffic must always hit the network — never serve stale scores.
  if (url.origin !== self.location.origin) return
  // The sealed idea list may be re-issued when the access code is rotated.
  if (url.pathname.endsWith('ideas.sealed.json')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        })
        .catch(async () => (await caches.match(request)) ?? Response.error()),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        }),
    ),
  )
})
