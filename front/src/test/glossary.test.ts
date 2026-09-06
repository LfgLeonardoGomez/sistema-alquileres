import { describe, expect, it } from 'vitest'

// design D32 / the handoff's Copy rules: this is a standing regression
// guard, not a RED/GREEN cycle (task 1.22 labels it [TEST] on purpose --
// 1.21's copy is already clean by the time this scan is written, so it
// cannot fail here). Re-run over the whole tree's copy in Phase 9 (9.1)
// once reservation/guest/cabin copy exists too.

const FORBIDDEN_WORDS = [
  // The handoff's glossary -- domain words this app must never use in its
  // own voice, even though some are Pydantic/SQL identifiers elsewhere.
  'Propiedad',
  'Unidad',
  'Cliente',
  'Usuario',
  'Booking',
  'Check-in',
  'Check-out',
  'Tarifa',
  'Transacción',
  'Reembolso',
  'Balance',
  'Deuda',
  'Eliminar',
  'Borrar',
  'Ingresos',
  'Facturación',
  // Technical / status words -- none of these read as a plain Spanish
  // sentence to a non-technical owner.
  'error',
  'conflicto',
  '409',
  'registro',
]

// Vite's eager glob -- every `.ts`/`.tsx` module under `shared/copy/**`,
// picked up automatically as later phases add `copy/reservations.ts`,
// `copy/guests.ts`, etc. (design D32), with no per-file registration to
// forget.
const copyModules = import.meta.glob('../shared/copy/**/*.{ts,tsx}', { eager: true })

// **Gap found and closed on 2026-09-06, during Phase 6b.** The original
// `collectStrings` walked strings, arrays and objects -- and therefore
// skipped every FUNCTION export, because `typeof fn` is `'function'`,
// neither `'object'` nor `'string'`. More than half of this app's copy is
// written as a template function (`cancelConfirmationBody`,
// `rescaleHelper`, `moneyStillHeldReminder`, ...), so the guard had been
// blind to all of it since 1.22 -- and task 6.44's own note claiming 6.33's
// reminder was "covered with nothing to register" was, in fact, wrong.
//
// Proved rather than assumed before fixing: injecting the literal words
// "error conflicto 409" into `moneyStillHeldReminder`'s template left this
// test GREEN. The same injection into `GENERIC_ERROR_COPY` (a plain string
// export) fails it, exactly as 1.22 demonstrated -- which is why the hole
// stayed invisible.
//
// The fix invokes each exported function with a small set of argument
// shapes and scans whatever strings come back. A function whose signature
// matches none of them simply throws and is skipped, so this can never
// break on an unusual copy helper -- and the `reachesTemplateFunctions`
// assertion below is what stops that tolerance from quietly degrading back
// into scanning nothing.
const SAMPLE_ARGUMENTS: readonly (readonly unknown[])[] = [
  [],
  ['1'],
  [1],
  ['1', '1'],
  [1, '1'],
  ['1', '1', 1],
  [['1', '1']],
  ['1', null],
]

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === 'string') {
    into.push(value)
    return
  }
  if (typeof value === 'function') {
    for (const args of SAMPLE_ARGUMENTS) {
      try {
        const produced: unknown = (value as (...callArgs: readonly unknown[]) => unknown)(...args)
        if (typeof produced === 'string') into.push(produced)
      } catch {
        // Wrong argument shape for this particular copy function -- another
        // tuple in the list will fit it. Nothing to report.
      }
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) collectStrings(entry, into)
  }
}

describe('copy glossary', () => {
  it('contains no forbidden or technical word anywhere in shared/copy exports', () => {
    const strings: string[] = []
    for (const mod of Object.values(copyModules)) {
      collectStrings(mod, strings)
    }

    // Not a tautology: this scan exercises real exported copy (1.21's error
    // table), and fails the moment any string in `shared/copy/**` regresses.
    expect(strings.length).toBeGreaterThan(0)

    // And it genuinely reaches TEMPLATE-FUNCTION copy, not only the plain
    // string constants it saw before Phase 6b. Pinned against a real
    // sentence fragment rather than a count, so the fix above cannot rot
    // back into a silent no-op if a future refactor breaks the invocation.
    const reachesTemplateFunctions = strings.some((copy) => copy.includes('Se calcula solo:'))
    expect(reachesTemplateFunctions).toBe(true)

    const offenders = strings.flatMap((copy) => {
      const lower = copy.toLowerCase()
      return FORBIDDEN_WORDS.filter((word) => lower.includes(word.toLowerCase())).map((word) => ({
        word,
        copy,
      }))
    })

    expect(offenders).toEqual([])
  })
})
