import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMonthParam } from './useMonthParam'

// design D31: "selected cabin and month are URL search params (?cabana=,
// ?mes=)... search params are string | null and validated by hand -- two
// small hooks." A `?mes=` a stranger can type is not a crash: a malformed
// value falls back to the current AR month, the same "today" `todayAR()`
// (1.6) and `HomeScreen.tsx`'s own `currentYearMonth()` already establish.

function wrapperAt(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries: [initialPath] }, children)
  }
}

// Mocks `Temporal.Now.plainDateISO` the same way `todayAR.test.ts` (1.5)
// and `AvailabilityPage.test.tsx` (2.20) do -- a real Temporal zone
// conversion inside the mock, not a hand-rolled fake, and it asserts the
// AR zone is requested specifically.
function mockTodayAt(instant: string) {
  return vi.spyOn(Temporal.Now, 'plainDateISO').mockImplementation((timeZone) => {
    return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone as string).toPlainDate()
  })
}

describe('useMonthParam', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a malformed ?mes=banana does not crash and falls back to the current AR month', () => {
    mockTodayAt('2026-09-04T02:30:00Z') // 2026-09-03 in AR

    const { result } = renderHook(() => useMonthParam(), { wrapper: wrapperAt('/calendario?mes=banana') })

    const [yearMonth] = result.current
    expect(yearMonth).toEqual({ year: 2026, month: 9 })
  })

  it('a well-formed ?mes= is read from the URL, not the current month', () => {
    mockTodayAt('2026-09-04T02:30:00Z') // would be September if it fell back

    const { result } = renderHook(() => useMonthParam(), { wrapper: wrapperAt('/calendario?mes=2026-12') })

    const [yearMonth] = result.current
    expect(yearMonth).toEqual({ year: 2026, month: 12 })
  })

  // [TRIANGULATE] a value carrying a FULL date, not a year-month, must
  // also fall back safely rather than silently truncating (the same
  // truncation risk `parsePlainDate`'s own regex gate exists to prevent --
  // `Temporal.PlainYearMonth.from('2026-09-03')` truncates to `2026-09`
  // rather than throwing).
  it('[TRIANGULATE] a full date instead of a year-month falls back rather than silently truncating', () => {
    mockTodayAt('2026-05-01T12:00:00Z') // 2026-05-01 in AR

    const { result } = renderHook(() => useMonthParam(), { wrapper: wrapperAt('/calendario?mes=2026-09-03') })

    const [yearMonth] = result.current
    expect(yearMonth).toEqual({ year: 2026, month: 5 })
  })

  it('an absent ?mes= falls back to the current AR month, the same as a malformed one', () => {
    mockTodayAt('2026-01-15T12:00:00Z')

    const { result } = renderHook(() => useMonthParam(), { wrapper: wrapperAt('/calendario') })

    const [yearMonth] = result.current
    expect(yearMonth).toEqual({ year: 2026, month: 1 })
  })
})
