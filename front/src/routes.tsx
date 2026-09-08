import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router'
import { queryClient } from './shared/mutation/queryClient'
import { RequireSession } from './app/session/RequireSession'
import { ROUTING_COPY } from './shared/copy/routing'

// design D31 + the Phase 2 addendum (gap 1). React Router v7, declarative,
// one explicit `routes.tsx` -- the two trees are literally two arrays in
// this one readable file, not an implicit file-based tree. This module
// lives at `src/`, OUTSIDE `src/public/`, so it is the one place allowed
// to reference both trees without weakening 0.5's `import/no-restricted-
// paths` rule (which forbids `src/public/**` -> `src/app/**`, not the
// reverse, and not this file, which sits in neither zone).
//
// `disponibilidad` is the reserved public prefix (D31): the word in the
// handoff's register, and what the owner pastes into WhatsApp. The tenant
// slug enters the app only here, at the URL -- never at login for an
// authenticated route (D31's own point, out of this task list's scope).
//
// **Defect fixed here, task 4.14.** `shared/mutation/queryClient.ts` has
// existed since Phase 1 (1.26/1.27), its retry policy is tested (D30), and
// it was never actually provided to the React tree -- `main.tsx` mounted
// bare `<RouterProvider>`. Nothing before `CalendarScreen` (task 4.14) ever
// called `useQuery` inside a mounted component (`HomeScreen.tsx` uses a
// bare `useEffect` + `apiRequest`), so the gap went unnoticed through three
// phases, the same "built, verified, never wired" shape as the
// `import/no-restricted-paths` resolver gap (0.5/1.28) and the missing
// `/login` route (3.14) before it.
//
// Fixed at THIS module's root, not in `main.tsx` -- a `<RootLayout>` with
// no `path`, wrapping every route (both trees) in `<Outlet/>` inside
// `<QueryClientProvider>`. This is the one place that guarantees every
// consumer of `routeConfig`/`router` gets the provider, not just
// `main.tsx`'s own render call: every test in this file (and
// `CalendarScreen.test.tsx`'s own real-router test) builds its router
// straight from `routeConfig` via `createMemoryRouter`, bypassing
// `main.tsx` entirely -- wrapping only `main.tsx` would have left every one
// of those tests (and any future one built the same way) exactly as
// exposed as production was.
function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}

// --- Public tree: no auth, ever. --------------------------------------
//
// `lazy()` per D31 -- the public route is its own chunk, so an
// authenticated module leaking in would also show up in the build
// manifest (parsing that manifest is not automated in this change, the
// same honesty as D19's image-inspection gap). Uses the route object's own
// `lazy` loader (not `React.lazy`) so `createBrowserRouter` handles the
// code-splitting itself, with no `<Suspense>` boundary to remember here.
// `AvailabilityPage` reads its own slug via `useParams()` (task 2.34) --
// this route wires no prop and cannot, since the component's signature no
// longer has one.
const publicRoutes: RouteObject[] = [
  {
    path: '/disponibilidad/:slug',
    lazy: async () => {
      const { AvailabilityPage } = await import('./public/AvailabilityPage')
      return { Component: AvailabilityPage }
    },
  },
]

// --- Authenticated tree: bearer, D31. -----------------------------------
//
// `/login`, plus the four tab-bar destinations as of tasks 3.17-3.23:
// `/inicio` is the real, built Inicio screen (`app/home/HomeScreen.tsx`);
// `/calendario`, `/huespedes`, `/cabanas` are instructive placeholders
// (`app/shell/PlaceholderScreens.tsx`) until Phases 4/7/8 build the real
// screens -- wired now so `TabBar`'s own links resolve to real, mounted
// content rather than the catch-all `NotFoundScreen` (task 3.23's "never a
// dead link"). The rest of D31's authenticated table (`/reserva/:id`,
// `/reserva/nueva/:paso`, etc.) still doesn't exist -- those remain
// forward references, the same status `/login` had here until 3.14.
//
// `lazy()` here for the same reason as the public tree above, plus one
// more: `LoginScreen` -> `client.ts` -> `router` (this module) would be a
// static circular import if `LoginScreen` were imported at the top of this
// file. A dynamic import inside `lazy` is not evaluated at module-load
// time, so the cycle this file's other half creates never actually forms --
// `client.ts`'s own top-level `import { router } from '../../routes'`
// (task 3.14) stays exactly as approved, calling `router.navigate('/login')`
// through the router, never `window.location`. `HomeScreen` transitively
// imports `client.ts` too (its own dashboard fetch), so it needs the same
// `lazy()` treatment for the same reason; the three placeholders don't, but
// are lazy-loaded anyway for consistency with every other route in this
// file.
// owner-session spec's "An Unauthenticated Visitor Never Renders An
// Authenticated Screen". 10.1(a), Note A (approved): everything below
// `/login` is wrapped in ONE pathless `RequireSession` parent -- the same
// pathless shape `RootLayout` above already uses, one level deeper.
// `RequireSession` is imported eagerly, not `lazy()`: it must decide
// before any of its children's own `lazy()` chunks are even requested, and
// it is small enough that lazy-loading it would only delay the guard
// itself. `/login` sits OUTSIDE it -- guarding the sign-in screen would be
// its own bug, not a stricter guard.
const authenticatedRoutes: RouteObject[] = [
  // The app's own front door. With no dedicated `/` screen, an unguarded
  // catch-all would render `NotFoundScreen` for the bare origin -- this
  // redirects straight to `/inicio` instead, INSIDE `RequireSession` so the
  // existing guard does the rest, no second guard built: no session ->
  // `/login`, recording `/` itself as `state.from` (`RequireSession` reads
  // the REQUESTED path, before this nested redirect ever gets to run) --
  // `returnPath.ts`'s `isSafeInAppPath` already accepts a bare `/` as a
  // safe in-app path, so completing sign-in lands back on `/`, which by
  // then IS authenticated and falls through this same rule to `/inicio`,
  // the same net destination as every other route's own return trip
  // (10.18/10.19). A held session skips `/login` entirely and reaches
  // `/inicio` directly. `replace` so this redirect never becomes its own
  // back-button stop. Verified against the real running app (browser,
  // both cases) -- see this task's own apply-progress note.
  {
    path: '/',
    element: <Navigate to="/inicio" replace />,
  },
  {
    path: '/inicio',
    lazy: async () => {
      const { HomeScreen } = await import('./app/home/HomeScreen')
      return { Component: HomeScreen }
    },
  },
  {
    path: '/calendario',
    lazy: async () => {
      const { CalendarScreen } = await import('./app/calendar/CalendarScreen')
      return { Component: CalendarScreen }
    },
  },
  // Phase 7, `guest-directory`. Screen 09/10. Replaces the placeholder --
  // `GuestsPlaceholder` itself stays, still exercised by `TabBar.test.tsx`
  // directly (the same precedent `/calendario`'s own now-unused
  // `CalendarPlaceholder` set at task 4.14: never deleted, kept alive by
  // that one test file's own router fixture).
  {
    path: '/huespedes',
    lazy: async () => {
      const { GuestDirectory } = await import('./app/guests/GuestDirectory')
      return { Component: GuestDirectory }
    },
  },
  // Phase 8, `cabin-directory`. Screen 08. Replaces the placeholder --
  // `CabinsPlaceholder` itself stays, still exercised by `TabBar.test.tsx`'s
  // own router fixture, the exact precedent `/huespedes`'s own comment
  // records for `GuestsPlaceholder`.
  {
    path: '/cabanas',
    lazy: async () => {
      const { CabinDirectory } = await import('./app/cabins/CabinDirectory')
      return { Component: CabinDirectory }
    },
  },
  // Phase 5, D31's own routing table: the four-step reservation wizard.
  // `HomeScreen.tsx`'s "Anotar una reserva" link (task 3.21/3.22) already
  // points at `/reserva/nueva/1` -- this is that forward reference's real
  // destination, not merely its future one (the same shape `/login` had
  // here until 3.14, `routes.test.tsx`'s own established pattern).
  {
    path: '/reserva/nueva/:paso',
    lazy: async () => {
      const { Wizard } = await import('./app/reservations/wizard/Wizard')
      return { Component: Wizard }
    },
  },
  // Phase 6, D31's routing table. A forward reference in this file since
  // 3.22 -- and left unwired it would be the fourth instance of this
  // module's own recurring "built, verified, never wired" defect, with the
  // detail screen reachable by nothing. It is also a hard prerequisite for
  // 6.30/6.31, where `/reserva/:id/editar` must REDIRECT here on a
  // cancelled stay.
  {
    path: '/reserva/:id',
    lazy: async () => {
      const { ReservationDetail } = await import('./app/reservations/detail/ReservationDetail')
      return { Component: ReservationDetail }
    },
  },
  // Phase 6b, task 6.17 -- the last forward reference in D31's routing
  // table, and the destination the detail screen's "Editar la reserva" link
  // has been pointing at since 6.15 (it landed on the catch-all until now,
  // the same temporary and deliberate gap `/login` carried until 3.14).
  //
  // A full screen with its own route, never a modal over the detail (D34):
  // an editor carrying a month grid does not fit a bottom sheet on an 874px
  // phone. Being a real route is also what makes 6.30/6.31's guard
  // necessary -- a bookmark, a back button or a stale tab can reach this URL
  // for a stay that has since been cancelled, which no hidden button can
  // prevent.
  {
    path: '/reserva/:id/editar',
    lazy: async () => {
      const { EditReservation } = await import('./app/reservations/edit/EditReservation')
      return { Component: EditReservation }
    },
  },
]

const appRoutes: RouteObject[] = [
  {
    path: '/login',
    lazy: async () => {
      const { LoginScreen } = await import('./app/session/LoginScreen')
      return { Component: LoginScreen }
    },
  },
  // tenant-from-url change (owner-approved plan, 2026-09-08): the canonical
  // owner entry point. Same `LoginScreen`, same lazy chunk, one more path
  // pointing at it -- `LoginScreen` itself reads the slug via `useParams()`
  // (task 2.34's own precedent for `AvailabilityPage`), so this route wires
  // no prop. Deliberately NOT extended to any route under
  // `authenticatedRoutes` below: the JWT already carries `tenant_id`
  // (`back/app/api/routers/auth.py`), so a slug in an authenticated URL
  // would be a second, potentially disagreeing source of truth for the
  // same fact -- one authority per fact, matching D31's original framing
  // for why the public tree carries the slug and the authenticated tree
  // never has.
  {
    path: '/login/:slug',
    lazy: async () => {
      const { LoginScreen } = await import('./app/session/LoginScreen')
      return { Component: LoginScreen }
    },
  },
  {
    Component: RequireSession,
    children: authenticatedRoutes,
  },
]

function NotFoundScreen() {
  return <p>{ROUTING_COPY.notFound}</p>
}

export const routeConfig: RouteObject[] = [
  {
    Component: RootLayout,
    children: [...publicRoutes, ...appRoutes, { path: '*', Component: NotFoundScreen }],
  },
]

// The one router instance the app renders. Task 3.14's `client.ts` already
// calls `router.navigate('/login')` on a 401 -- a router method call, never
// `window.location`, because a location assignment reloads the document and
// destroys the owner's in-progress wizard draft (D29, 5.31). `/login` above
// is that call's actual destination, not merely its future one.
export const router = createBrowserRouter(routeConfig)
