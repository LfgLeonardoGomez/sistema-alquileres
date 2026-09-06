import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from './test/setup'

// design D31 + the Phase 2 addendum (gap 1): "one explicit routes.tsx",
// both trees visibly separate, public tree lazy(). This is the module that
// wires `/disponibilidad/:slug` to `AvailabilityPage` -- until this task,
// nothing built the router at all, even though task 3.14 already depends
// on `router.navigate` existing.
//
// The assertion strategy: the availability fetch itself carries the slug
// in its path (`GET /public/{slug}/availability`), so capturing the
// requested URL is a direct, non-tautological proof that the slug reached
// the page from the URL, not from a hardcoded default.

function availabilityHandler(onRequest: (slug: string) => void) {
  return http.get('http://localhost:8000/public/:slug/availability', ({ params }) => {
    onRequest(params.slug as string)
    return HttpResponse.json([])
  })
}

function contactHandler() {
  return http.get('http://localhost:8000/public/:slug/contact', () =>
    HttpResponse.json({ name: 'Tenant', whatsapp: null }),
  )
}

describe('routes', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('mounts the availability page with the slug taken from the URL', async () => {
    const requestedSlugs: string[] = []
    server.use(availabilityHandler((slug) => requestedSlugs.push(slug)), contactHandler())

    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/disponibilidad/casa-aya'] })
    render(<RouterProvider router={router} />)

    await waitFor(() => expect(requestedSlugs).toHaveLength(1))
    expect(requestedSlugs[0]).toBe('casa-aya')
  })

  it('reaches the page as a different slug when the URL carries a different slug', async () => {
    const requestedSlugs: string[] = []
    server.use(availabilityHandler((slug) => requestedSlugs.push(slug)), contactHandler())

    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, {
      initialEntries: ['/disponibilidad/mar-del-tuyu-cabins'],
    })
    render(<RouterProvider router={router} />)

    await waitFor(() => expect(requestedSlugs).toHaveLength(1))
    expect(requestedSlugs[0]).toBe('mar-del-tuyu-cabins')
  })

  // [TEST] task 2.35, route configuration rather than a behaviour with its
  // own red phase: 2.32's GREEN already landed the catch-all route as part
  // of building a usable router, so this confirms that configuration
  // rather than introducing new production code. Distinct from D37's
  // SPA-hosting requirement (recorded in the observation below), which is
  // a deployment concern this in-memory router cannot exercise: a hard
  // load of an unknown path is a hosting decision, not client-side routing.
  it('renders the app’s own not-found surface for a path with no matching route', async () => {
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/esto-no-existe'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('No encontramos esa página.')).toBeInTheDocument()
  })
})
