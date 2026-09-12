// Service worker — installability only. It deliberately does NOT cache the app.
//
// Chrome's install criteria (and therefore Android's "Install app" / WebAPK
// flow) require a registered service worker with a `fetch` handler. iOS does
// not: "Add to Home Screen" works from the manifest alone. So this file exists
// for Android, and does the smallest thing that satisfies it.
//
// WHY IT CACHES NOTHING BUT THE FALLBACK PAGE:
// Vite emits content-hashed asset filenames, and `index.html` is the one file
// that maps hashes to URLs. A service worker that caches `index.html` serves a
// stale one after the next deploy, which then requests JS chunk names that no
// longer exist on the server — a white screen that survives a refresh and is
// only cleared by wiping site data. That failure mode is worth far more than
// the offline reading this app does not need: the owner administers cabins
// over wifi, not in the field.
//
// So: every navigation goes to the network. The ONLY cached entry is a
// standalone `offline.html` with no dependencies, shown when the network is
// genuinely unreachable. It can never go stale in a way that matters, because
// it references nothing that is versioned.

const CACHE = 'mio-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `reload` bypasses the HTTP cache so a redeployed fallback is actually
      // picked up instead of being re-stored from a stale browser cache entry.
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      // Take over open tabs immediately. Safe precisely because this worker
      // has no app-shell behaviour to swap out from under a running page.
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  // Only navigations are intercepted. Asset and API requests get no
  // `respondWith` at all, so the browser handles them exactly as it would
  // with no service worker installed.
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL)
      // If even the fallback is missing, let the browser show its own error
      // rather than resolving to `undefined`, which surfaces as a confusing
      // network failure in the page.
      return cached ?? Response.error()
    }),
  )
})
