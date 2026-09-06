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
// Empty for now, on purpose. Phase 3's session/login work (`/login`,
// `/inicio`, ...) is gated behind task 3.1's still-unapproved BLOCKING
// human-approval slice (D29, CRITICAL domain) -- no route that could reach
// it is wired ahead of that approval.
const appRoutes: RouteObject[] = []

function NotFoundScreen() {
  return <p>{ROUTING_COPY.notFound}</p>
}

export const routeConfig: RouteObject[] = [
  ...publicRoutes,
  ...appRoutes,
  { path: '*', Component: NotFoundScreen },
]

// The one router instance the app renders. Also the future home of task
// 3.14's `router.navigate('/login')` on a 401 -- a router method call,
// never `window.location`, because a location assignment reloads the
// document and destroys the owner's in-progress wizard draft (D29, 5.31).
export const router = createBrowserRouter(routeConfig)
