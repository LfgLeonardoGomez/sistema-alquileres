import { createBrowserRouter, type RouteObject } from 'react-router'
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
      const { CalendarPlaceholder } = await import('./app/shell/PlaceholderScreens')
      return { Component: CalendarPlaceholder }
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
  ...publicRoutes,
  ...appRoutes,
  { path: '*', Component: NotFoundScreen },
]

// The one router instance the app renders. Task 3.14's `client.ts` already
// calls `router.navigate('/login')` on a 401 -- a router method call, never
// `window.location`, because a location assignment reloads the document and
// destroys the owner's in-progress wizard draft (D29, 5.31). `/login` above
// is that call's actual destination, not merely its future one.
export const router = createBrowserRouter(routeConfig)
