import { expect, request, test } from '@playwright/test'

// Task 9.5: the one and only E2E path in this change -- login, record a
// stay, record a payment, see the balance. Deliberately not a suite: every
// other behaviour in this app is already covered at the unit/behaviour
// layer (design D36); this file exists only to prove the seams between
// screens, the real backend and a real browser actually connect.
//
// --- What this test needs to run (do not skip this section) ---------
//
// 1. A live backend, migrated, reachable at PLAYWRIGHT_API_BASE_URL
//    (default http://localhost:8000):
//      docker compose up -d db
//      docker compose run --rm migrate
//      docker compose up -d api
//    (`api`'s REGISTRATION_TOKEN must match PLAYWRIGHT_REGISTRATION_TOKEN
//    below -- both read from the same `.env` in a normal dev checkout.)
//
// 2. Two required environment variables for THIS test run, no defaults,
//    the same "the app refuses to boot without it" convention env.ts and
//    config.py already use:
//      PLAYWRIGHT_REGISTRATION_TOKEN   -- must equal the backend's own
//                                          REGISTRATION_TOKEN
//      (PLAYWRIGHT_API_BASE_URL and PLAYWRIGHT_BASE_URL both have dev-
//       friendly defaults -- localhost:8000 and localhost:5173 -- since
//       unlike the token, a wrong default here fails loudly and immediately
//       rather than silently, the same tradeoff env.ts's own note doesn't
//       extend to every variable, only to the ones a wrong guess could
//       point at someone else's server)
//
// 3. Run it with the app's own dev server pointed at that backend:
//      VITE_API_BASE_URL=http://localhost:8000 VITE_TENANT_SLUG=any-value \
//      PLAYWRIGHT_REGISTRATION_TOKEN=<same as backend REGISTRATION_TOKEN> \
//      npm run test:e2e
//    (`playwright.config.ts`'s `webServer` starts `npm run dev` for you if
//    nothing is already listening at PLAYWRIGHT_BASE_URL -- but Vite needs
//    VITE_API_BASE_URL/VITE_TENANT_SLUG set in its own environment or a
//    `front/.env` regardless, per `env.ts`'s no-default rule; VITE_TENANT_SLUG's
//    value is irrelevant here since every screen this test visits reaches
//    it through `?tenant=`, never the build-time default.)
//
// No seed data is required beyond that: this test registers its OWN fresh
// tenant and owner account via `POST /auth/register` before every run (a
// real backend write, not a fixture), so it is safely re-runnable against
// the same database with no cleanup step -- the same reasoning
// `scripts/seed.py`'s `ON CONFLICT DO NOTHING` uses, adapted to an endpoint
// that has no such conflict to begin with (a fresh UUID tenant every call).
//
// --- Phase 10 closed the client-side auth-guard gap ------------------
//
// This test used to drive `page.goto('/inicio')` by hand after login,
// because `LoginScreen.tsx` had no in-app redirect on success. Phase 10
// (`owner-session`, tasks 10.7-10.11) built that redirect -- a successful
// sign-in now calls `navigate(resolveReturnPath(location.state), {
// replace: true })`, landing on `/inicio` for a plain login with no
// recorded origin. Task 10.23 removed the workaround below in favour of
// waiting on that real redirect.
const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:8000'
const REGISTRATION_TOKEN = process.env.PLAYWRIGHT_REGISTRATION_TOKEN
if (REGISTRATION_TOKEN === undefined || REGISTRATION_TOKEN === '') {
  throw new Error(
    'PLAYWRIGHT_REGISTRATION_TOKEN is not set. This test registers its own tenant against a live backend ' +
      "and needs the backend's own REGISTRATION_TOKEN value to do it -- see this file's top comment.",
  )
}

type Seed = {
  readonly tenantSlug: string
  readonly email: string
  readonly password: string
  readonly cabinName: string
}

async function seedTenantOwnerAndCabin(): Promise<Seed> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const seed: Seed = {
    tenantSlug: `pw-smoke-${unique}`,
    email: `pw-smoke-${unique}@example.com`,
    password: 'playwright-smoke-password-123',
    cabinName: 'Casa Playwright',
  }

  const api = await request.newContext({ baseURL: API_BASE_URL })
  try {
    const registerResponse = await api.post('/auth/register', {
      headers: { 'X-Registration-Token': REGISTRATION_TOKEN },
      data: {
        tenant_slug: seed.tenantSlug,
        name: 'Playwright Smoke Tenant',
        email: seed.email,
        password: seed.password,
      },
    })
    if (!registerResponse.ok()) {
      throw new Error(
        `Seed registration failed: ${registerResponse.status()} ${await registerResponse.text()} -- ` +
          'is PLAYWRIGHT_REGISTRATION_TOKEN set to the backend\'s own REGISTRATION_TOKEN?',
      )
    }
    const { access_token: accessToken } = (await registerResponse.json()) as { access_token: string }

    const propertyResponse = await api.post('/properties', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: seed.cabinName },
    })
    if (!propertyResponse.ok()) {
      throw new Error(`Seed cabin creation failed: ${propertyResponse.status()} ${await propertyResponse.text()}`)
    }
  } finally {
    await api.dispose()
  }

  return seed
}

// Small, dependency-free date helpers -- this file is Node-side test
// orchestration, not app code, so design D26's `Date` ban (a rule about
// `front/src/**`'s OWN production code, enforced by `eslint.config.js`'s
// `ignores`, which excludes `e2e/**`) does not apply here.
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setDate(copy.getDate() + days)
  return copy
}

test('login, record a stay, record a payment, see the balance', async ({ page }) => {
  const seed = await seedTenantOwnerAndCabin()

  // --- Login -----------------------------------------------------------
  await page.goto(`/login?tenant=${seed.tenantSlug}`)
  await page.getByLabel('Tu correo').fill(seed.email)
  await page.getByLabel('Tu contraseña').fill(seed.password)

  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Entrar' }).click()
  const login = await loginResponse
  expect(login.ok()).toBe(true)

  // Task 10.23: wait on the real post-login redirect (10.8-10.11) instead
  // of driving the navigation by hand. `toHaveURL` polls, the same as
  // every other in-app navigation assertion in this file below.
  await expect(page).toHaveURL(/\/inicio$/)
  await expect(page.getByRole('link', { name: 'Anotar una reserva' })).toBeVisible()

  // --- Record a stay (the four-step wizard) -----------------------------
  await page.getByRole('link', { name: 'Anotar una reserva' }).click()
  await expect(page).toHaveURL(/\/reserva\/nueva\/1$/)

  await page.getByRole('button', { name: seed.cabinName }).click()
  await expect(page).toHaveURL(/\/reserva\/nueva\/2$/)

  const checkIn = addDays(new Date(), 10)
  const checkOut = addDays(new Date(), 13)
  const today = new Date()
  const monthsAhead = (checkIn.getFullYear() - today.getFullYear()) * 12 + (checkIn.getMonth() - today.getMonth())
  for (let step = 0; step < monthsAhead; step += 1) {
    await page.getByRole('button', { name: 'Mes siguiente' }).click()
  }
  await page.getByTestId(`day-${isoDate(checkIn)}`).click()
  await page.getByTestId(`day-${isoDate(checkOut)}`).click()
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(page).toHaveURL(/\/reserva\/nueva\/3$/)

  await page.getByLabel('Teléfono').fill('+54 9 11 5555-5555')
  await page.getByLabel('Nombre').fill('Huésped Playwright')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('button', { name: 'Seguir' })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(page).toHaveURL(/\/reserva\/nueva\/4$/)

  await page.getByRole('button', { name: 'Total de la estadía', exact: true }).click()
  await page.getByLabel('Monto').fill('30000')

  const createReservationResponse = page.waitForResponse(
    (response) => response.url().endsWith('/reservations') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Guardar la reserva' }).click()
  const created = await createReservationResponse
  expect(created.ok()).toBe(true)
  const { id: reservationId } = (await created.json()) as { id: string }

  // --- Record a payment --------------------------------------------------
  // Rows are `<p><span>Label</span> <span>Value</span></p>` (`ReservationDetail.tsx`);
  // scoping on the owning `<p>` avoids ambiguity against the OTHER row that
  // happens to carry the same peso figure -- with no payment recorded yet,
  // "Saldo" and "Total de la estadía" show the exact same amount.
  await page.goto(`/reserva/${reservationId}`)
  await expect(page.locator('p', { hasText: 'Total de la estadía' })).toContainText('$ 30.000')

  await page.getByRole('button', { name: 'Anotar un pago' }).click()
  await expect(page.getByRole('dialog', { name: 'Anotar un pago' })).toBeVisible()
  await page.getByLabel('Monto').fill('10000')

  const createPaymentResponse = page.waitForResponse(
    (response) => response.url().includes('/payments') && response.request().method() === 'POST',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  expect((await createPaymentResponse).ok()).toBe(true)

  // --- See the balance -----------------------------------------------
  await expect(page.locator('p', { hasText: 'Pagado' })).toContainText('$ 10.000')
  await expect(page.locator('p', { hasText: 'Saldo' })).toContainText('$ 20.000')
})
