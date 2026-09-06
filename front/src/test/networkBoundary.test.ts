import { describe, expect, it } from 'vitest'

// design D31, point 1: "the bearer-attaching client does not live in
// shared/. app/api/client.ts is the only module that reads the token and
// sets an Authorization header ... The header cannot be attached by
// mistake because the code that attaches it is unreachable." Standing
// regression guard (task 1.25); trivially green today because
// `app/api/client.ts` is the only network call site in the whole tree.
//
// CONTRADICTION FLAGGED, not silently resolved: task 1.25's own text
// claims this guard "stands as a regression guard through every later
// phase, not a cycle with its own red phase" -- but design D31 and task
// 2.19 both introduce a SECOND, equally legitimate call site by design:
// `src/public/api.ts`, "its own fetch; no token parameter exists in its
// signature at all." Once Phase 2 lands, a literal "no module other than
// client.ts" guard would fail on *designed*, not accidental, code. This is
// an explicit allowlist rather than one hardcoded path so Phase 2 can add
// its one designed exception without silently widening this guard's
// actual intent: any file NOT on this list gaining a `fetch` call is still
// a real regression, and any addition to the list must be a deliberate,
// reviewed edit here, not an incidental one elsewhere.
// Extended on purpose for task 2.19/2.30, not loosened: `src/public/api.ts`
// is the SECOND, equally legitimate call site design D31 predicted --
// public/'s own fetch, with no token parameter in its signature at all.
// Any file NOT on this list gaining a `fetch` call is still a real
// regression; adding to this list is deliberate and reviewed here, exactly
// as 1.25's own note anticipated.
const ALLOWED_FETCH_MODULES = ['src/app/api/client.ts', 'src/public/api.ts']

const DIRECT_NETWORK_CALL = /\bfetch\s*\(|\bnew\s+XMLHttpRequest\b/

const sourceModules = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function isExempt(path: string): boolean {
  const normalised = path.replace(/^\.\.\//, 'src/')
  return (
    normalised.includes('.test.') ||
    normalised.includes('/test/') ||
    ALLOWED_FETCH_MODULES.some((allowed) => normalised.endsWith(allowed))
  )
}

describe('network boundary', () => {
  it('calls fetch (or an XHR equivalent) only from the designated API client module(s)', () => {
    const offenders = Object.entries(sourceModules)
      .filter(([path]) => !isExempt(path))
      .filter(([, contents]) => DIRECT_NETWORK_CALL.test(contents as string))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })

  // Not a tautology: proves the scan itself can see and flag a real
  // network call, rather than passing only because its regex never
  // matches anything in this tree.
  it('the regex used above does detect a fetch call when one exists', () => {
    expect(DIRECT_NETWORK_CALL.test('export const x = () => fetch("/x")')).toBe(true)
    expect(DIRECT_NETWORK_CALL.test('export const x = new XMLHttpRequest()')).toBe(true)
    expect(DIRECT_NETWORK_CALL.test('export const prefetch = 1')).toBe(false)
  })
})
