import { describe, expect, it } from 'vitest'
import { keys } from './keys'

// task 4.7: static regression guard, labelled [TEST] not [RED] -- this
// module is the only source of query-key arrays in the whole tree at the
// moment this guard is written, so it cannot fail yet. Scans for the
// literal shape a call site would use to bypass the factory
// (`queryKey: [...]`, the property TanStack Query's `useQuery`/
// `useMutation`/`invalidateQueries` all accept) anywhere under `src/app/`
// except this file's own module and test files.
const QUERY_KEY_LITERAL = /queryKey\s*:\s*\[/

const appModules = import.meta.glob('../../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function isExempt(path: string): boolean {
  const normalised = path.replace(/^\.\.\/\.\.\//, 'src/app/')
  return normalised.includes('.test.') || normalised.endsWith('src/app/api/queries/keys.ts')
}

// design D30: "One typed factory in app/api/queries/keys.ts. No key literal
// anywhere else." A query key is an array TanStack Query hashes for cache
// matching/invalidation -- "stable" here means value-stable across calls
// (the same logical key produces an equal array every time), not reference
// identity, since the cache compares by value.

describe('keys', () => {
  it('produces a stable key array for the same resource across calls', () => {
    expect(keys.reservations()).toEqual(keys.reservations())
    expect(keys.dashboard()).toEqual(keys.dashboard())
  })

  it('produces distinct key arrays for distinct resources', () => {
    expect(keys.reservations()).not.toEqual(keys.dashboard())
  })

  // [TRIANGULATE] a parameterised key (D30's invalidation rule names
  // "the affected reservation(id)" as its own invalidation target,
  // distinct from the bare `reservations` list key).
  it('produces a distinct, stable key per reservation id, and a different array than the bare list key', () => {
    expect(keys.reservation('a-id')).toEqual(keys.reservation('a-id'))
    expect(keys.reservation('a-id')).not.toEqual(keys.reservation('b-id'))
    expect(keys.reservation('a-id')).not.toEqual(keys.reservations())
  })
})

describe('query-key literal guard', () => {
  it('no module other than keys.ts constructs a query-key literal', () => {
    const offenders = Object.entries(appModules)
      .filter(([path]) => !isExempt(path))
      .filter(([, contents]) => QUERY_KEY_LITERAL.test(contents as string))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })

  // Not a tautology: proves the scan itself can see and flag a real
  // query-key literal, rather than passing only because its regex never
  // matches anything in this tree (the same proof pattern as 1.22/1.25/2.17).
  it('the regex used above does detect a query-key literal when one exists', () => {
    expect(QUERY_KEY_LITERAL.test("useQuery({ queryKey: ['cabins'], queryFn })")).toBe(true)
    expect(QUERY_KEY_LITERAL.test('useQuery({ queryKey: keys.cabins(), queryFn })')).toBe(false)
  })
})
