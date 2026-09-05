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

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === 'string') {
    into.push(value)
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
