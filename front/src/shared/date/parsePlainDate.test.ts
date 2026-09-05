import { describe, expect, it } from 'vitest'
import { parsePlainDate } from './parsePlainDate'

// design D26: an API date string is exactly `YYYY-MM-DD` -- no time, no
// zone. `parsePlainDate` regex-gates the shape before handing the string to
// Temporal, so a datetime string is rejected before Temporal could truncate
// it into a plain date (which would silently launder an instant).

describe('parsePlainDate', () => {
  it('rejects a string carrying a time component', () => {
    expect(() => parsePlainDate('2026-09-03T00:00:00Z')).toThrow()
  })

  it('rejects an invalid calendar day', () => {
    expect(() => parsePlainDate('2026-02-30')).toThrow()
  })

  it('parses a valid plain date and round-trips via toString()', () => {
    expect(parsePlainDate('2026-09-03').toString()).toBe('2026-09-03')
  })

  it('parses a leap day', () => {
    expect(parsePlainDate('2028-02-29').toString()).toBe('2028-02-29')
  })

  it('rejects a day that does not exist in a short month', () => {
    expect(() => parsePlainDate('2026-04-31')).toThrow()
  })
})
