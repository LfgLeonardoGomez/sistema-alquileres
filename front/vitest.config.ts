import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Design D26: every date, calendar and formatting test must produce a
// byte-identical result regardless of the host machine's time zone, because
// the code path under test contains no `Date` at all. Three TZ-scoped
// projects assert that directly instead of picking one "safe" zone and
// hoping: UTC (the zone with no offset to hide behind), Argentina's own zone
// (UTC-3, where the bug this design exists to prevent would otherwise match
// production and look correct), and Kiritimati (UTC+14, so an error in the
// *opposite* direction is caught too).
//
// Any test whose outcome changes across these three projects is, by
// definition, a bug (design D26).
const TZ_PROJECTS = [
  { name: 'utc', tz: 'UTC' },
  { name: 'ar', tz: 'America/Argentina/Buenos_Aires' },
  { name: 'kiritimati', tz: 'Pacific/Kiritimati' },
] as const

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    projects: TZ_PROJECTS.map(({ name, tz }) => ({
      extends: true,
      test: {
        name,
        env: { TZ: tz },
      },
    })),
  },
})
