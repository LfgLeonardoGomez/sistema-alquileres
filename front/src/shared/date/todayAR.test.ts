import { Temporal } from 'temporal-polyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayAR } from './todayAR'

// design D26: `todayAR()` is the single source of "today" in this app,
// matching the server's own `today_ar()` (back/app/services/dates.py). At
// 2026-09-04T02:30:00Z it is already the 4th in UTC but still 23:30 on the
// 3rd in Buenos Aires (UTC-3) -- this is the exact moment that would read
// as the wrong day if the browser's local/UTC clock were trusted instead.

describe('todayAR', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves to the AR calendar date for a moment already past midnight UTC', () => {
    const fixedInstant = Temporal.Instant.from('2026-09-04T02:30:00Z')
    const plainDateISOSpy = vi
      .spyOn(Temporal.Now, 'plainDateISO')
      .mockImplementation((timeZone) => fixedInstant.toZonedDateTimeISO(timeZone ?? 'UTC').toPlainDate())

    expect(todayAR().toString()).toBe('2026-09-03')
    expect(plainDateISOSpy).toHaveBeenCalledWith('America/Argentina/Buenos_Aires')
  })
})
