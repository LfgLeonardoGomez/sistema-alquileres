import { describe, expect, it } from 'vitest'

// design D25/D28 + the month-calendar-rendering spec's own closing
// requirement: `shared/calendar/` must import no reservation, client,
// guest, cabin, or auth type from either route tree -- that is the
// structural precondition that makes it legal to import from both `app/`
// (authenticated) and `public/` (no auth) without crossing D25's privacy
// boundary. Labelled [TEST], not [RED] (task 2.17): the module has been
// built domain-free from 2.2 onward, so this cannot fail unless a domain
// import is added later.

const FORBIDDEN_IMPORT_WORDS = ['reservation', 'client', 'guest', 'cabin', 'auth']

const IMPORT_SPECIFIER = /import\s+(?:type\s+)?(?:[^'";]+from\s+)?['"]([^'"]+)['"]/g

const calendarModules = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1]
    if (specifier !== undefined) {
      specifiers.push(specifier)
    }
  }
  return specifiers
}

describe('shared/calendar domain-import scan', () => {
  it('imports nothing naming a reservation, client, guest, cabin, or auth concept', () => {
    const offenders = Object.entries(calendarModules).flatMap(([path, contents]) => {
      if (path.includes('.test.')) {
        return []
      }
      return importSpecifiers(contents as string)
        .filter((specifier) => FORBIDDEN_IMPORT_WORDS.some((word) => specifier.toLowerCase().includes(word)))
        .map((specifier) => ({ path, specifier }))
    })

    expect(offenders).toEqual([])
  })

  // Not a tautology: proves the scan itself can see and flag a real
  // domain import, rather than passing only because its regex never
  // matches anything in this tree (the same proof pattern as 1.22/1.25).
  it('the scan does detect a forbidden import when one exists', () => {
    expect(importSpecifiers(`import type { Reservation } from '../../app/reservations/types'`)).toEqual([
      '../../app/reservations/types',
    ])
    expect(importSpecifiers(`import { apiRequest } from '../../app/api/client'`)).toEqual(['../../app/api/client'])

    // A legitimate shared-to-shared import is extracted too, but must not
    // be flagged by the forbidden-word filter the main test applies.
    const legitimateImport = importSpecifiers(`import { parsePlainDate } from '../date/parsePlainDate'`)
    expect(legitimateImport).toEqual(['../date/parsePlainDate'])
    expect(legitimateImport.some((specifier) => FORBIDDEN_IMPORT_WORDS.some((word) => specifier.toLowerCase().includes(word)))).toBe(
      false,
    )
  })
})
