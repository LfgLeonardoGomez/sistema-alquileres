import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router'
import { queryClient } from './shared/mutation/queryClient'
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
const appRoutes: RouteObject[] = [
  {
    path: '/login',
    lazy: async () => {
      const { LoginScreen } = await import('./app/session/LoginScreen')
      return { Component: LoginScreen }
    },
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
  {
    path: '/huespedes',
    lazy: async () => {
      const { GuestsPlaceholder } = await import('./app/shell/PlaceholderScreens')
      return { Component: GuestsPlaceholder }
    },
  },
  {
    path: '/cabanas',
    lazy: async () => {
      const { CabinsPlaceholder } = await import('./app/shell/PlaceholderScreens')
      return { Component: CabinsPlaceholder }
    },
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
