// Service worker registration.
//
// Guarded on `import.meta.env.PROD` for two separate reasons, not one:
//   - In `vite dev`, a service worker sits in front of the dev server and
//     competes with HMR; the classic symptom is an edit that "doesn't apply"
//     until site data is cleared.
//   - Under vitest, `navigator.serviceWorker` does not exist in jsdom, and a
//     worker registered by a test run would outlive it in a real browser.
//
// Registration is deferred to `load` so it never competes with the app's own
// first paint for bandwidth. Nothing in the app depends on the worker being
// ready — it caches only an offline fallback page (see `static/sw.js`) — so
// there is nothing to await and nothing to report on failure beyond a log.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // A failed registration costs the install prompt on Android, nothing
      // more: every route still works, because the worker never served them.
      console.error('Service worker registration failed', error)
    })
  })
}
