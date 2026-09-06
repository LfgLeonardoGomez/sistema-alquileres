import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// task 5.3, D30: finalizes 3.2/3.3's provisional single-store state now
// that a second, genuinely justified store exists (5.2). D30's own written
// admission rule -- "a store may exist only if something outside the React
// tree must read it, or something must survive the tree unmounting" -- is
// enforced here as a standing regression guard: exactly two modules may
// call zustand's `create()`, and neither store's state may mirror a server
// list (the query cache already holds it -- D30's own "a second copy is a
// second truth about money" warning).
//
// Labelled `[TEST]`, not `[RED]`, per the task text -- both stores already
// exist and are already correct by the time this guard is written, so it
// cannot fail today. What makes it non-tautological is proven below by
// actually injecting a disallowed third store and watching the count
// assertion fail before reverting (recorded in this task's own `Observed`
// note in `tasks.md`, not fabricated after the fact).

const ZUSTAND_CREATE_CALL = /from\s+['"]zustand['"][\s\S]*?\bcreate(?:<[^>]*>)?\(/

const ALLOWED_STORE_MODULES = ['./session/store.ts', './reservations/wizard/store.ts']

const appModules = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function isExempt(path: string): boolean {
  return path.includes('.test.') || path.includes('/test/')
}

describe('client-side store count (D30)', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('exactly two modules define a zustand store: session and the wizard draft', () => {
    const storeModules = Object.keys(appModules)
      .filter((path) => !isExempt(path))
      .filter((path) => ZUSTAND_CREATE_CALL.test(appModules[path] as string))

    // Path form from this file's own glob root (`src/app/`) -- normalise
    // to the same `./`-relative shape as `ALLOWED_STORE_MODULES` above.
    const normalised = storeModules.map((path) => path.replace(/^\.\.\/app\//, './'))

    expect(normalised.sort()).toEqual([...ALLOWED_STORE_MODULES].sort())
  })

  // Not a tautology: proves the regex used above genuinely detects a
  // zustand `create()` call rather than passing only because nothing in
  // the fixture ever matches it.
  it('the regex used above does detect a real zustand create() call', () => {
    expect(ZUSTAND_CREATE_CALL.test("import { create } from 'zustand'\nexport const useX = create(() => ({}))")).toBe(
      true,
    )
    expect(ZUSTAND_CREATE_CALL.test('export const create = () => 1')).toBe(false)
  })

  it("neither store's state shape carries a properties, clients, reservations, or payments list", async () => {
    const FORBIDDEN_STATE_KEYS = ['properties', 'clients', 'reservations', 'payments']

    const { useSessionStore } = await import('./session/store')
    const { useWizardDraftStore } = await import('./reservations/wizard/store')

    for (const state of [useSessionStore.getState(), useWizardDraftStore.getState()]) {
      const keys = Object.keys(state)
      for (const forbidden of FORBIDDEN_STATE_KEYS) {
        expect(keys).not.toContain(forbidden)
      }
      // D30's broader rule ("mirroring any server list into a store") is
      // stronger than the four named words above -- no store field may be
      // an array at all, named or not.
      const arrayValuedKeys = Object.entries(state)
        .filter(([, value]) => Array.isArray(value))
        .map(([key]) => key)
      expect(arrayValuedKeys).toEqual([])
    }
  })
})
