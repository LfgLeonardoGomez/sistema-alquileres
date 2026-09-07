import { Navigate, Outlet, useLocation } from 'react-router'
import { useSessionStore } from './store'

// owner-session spec's "An Unauthenticated Visitor Never Renders An
// Authenticated Screen". 10.1(a), Note A (approved): a pathless PARENT
// route wrapping `appRoutes` minus `/login` (`routes.tsx`), rendering
// `<Outlet/>` when a session is held and `<Navigate to="/login" replace
// state={{from}}/>` when it is not. The same pathless shape `RootLayout`
// already uses (`routes.tsx`, 4.14) and the same `<Navigate ... replace/>`
// shape `Wizard.tsx` and `EditReservation.tsx` already use for their own
// guards -- no new pattern.
//
// Because the guard is the PARENT, a blocked child's `lazy()` chunk is
// never requested and its component never mounts -- what makes "no part of
// that screen renders" (the spec's own wording) literally true rather than
// approximately true, and the reason a route `loader` was considered and
// rejected at 10.1(a): `redirect()` cannot carry location `state`, which
// Note B's `from` field needs.
export function RequireSession() {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    // Note B (approved 10.1(b)): the attempted path rides in `state.from`,
    // read only by `LoginScreen` via `resolveReturnPath` (10.2-10.6) --
    // never a `?from=` query param, which D31 avoids for authenticated
    // URLs carrying nothing decorative.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
