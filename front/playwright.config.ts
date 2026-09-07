import { defineConfig, devices } from '@playwright/test'

// Task 9.5, design D36's own deferral ("not before slice 6, when there is
// a path to smoke"). The first and only E2E test in this change -- one
// path, one browser, no CI wiring here (that belongs to a CI change, the
// same D35 gap this Phase records rather than closes).
//
// Deliberately outside `vitest.config.ts`'s three-TZ-project setup: this
// suite exercises a REAL clock, a REAL backend and a REAL browser, none of
// which the TZ-fixture strategy (design D26) applies to. Kept as its own
// `npx playwright test` invocation (`package.json`'s `test:e2e` script) so
// it can never slow down or destabilise `npm test`'s 645-test unit run.
//
// Requires, and does not start on its own:
//   - the backend reachable at PLAYWRIGHT_API_BASE_URL (default
//     http://localhost:8000), migrated, with REGISTRATION_TOKEN set to the
//     same value as PLAYWRIGHT_REGISTRATION_TOKEN below;
//   - `npm run dev` (Vite) reachable at PLAYWRIGHT_BASE_URL (default
//     http://localhost:5173) -- started automatically by `webServer` below
//     if nothing is already listening there.
// See `e2e/smoke.spec.ts`'s own top comment for the full run recipe.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
const devServerPort = new URL(baseURL).port || '5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Starts the app's own dev server if PLAYWRIGHT_BASE_URL isn't already
  // serving something -- it does NOT start the backend (docker-compose's
  // job, see the recipe above). `reuseExistingServer` lets a developer who
  // already has `npm run dev` open avoid a second instance.
  webServer: {
    command: `npm run dev -- --port ${devServerPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
