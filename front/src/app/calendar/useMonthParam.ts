import { useSearchParams } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import type { YearMonth } from '../../shared/calendar/monthGrid'
import { todayAR } from '../../shared/date/todayAR'

// design D31: "the selected cabin and the displayed month are URL search
// params (?cabana=, ?mes=), so reload and the browser back button keep
// working, and a shared link opens on the right month" (D30's own
// standing rule against mirroring URL state into a store). React Router
// was chosen over TanStack Router specifically because "the whole app has
// exactly two search params, both of which need a validating hook we
// would write regardless (a ?mes= of banana must not crash)" -- this is
// that hook.
//
// The regex gate runs *before* Temporal ever sees the string, the same
// discipline `parsePlainDate` (1.2) uses and for the same reason:
// `Temporal.PlainYearMonth.from('2026-09-03')` truncates a full date down
// to `2026-09` rather than throwing, which would silently accept a
// malformed value that merely happens to look plausible.
const YEAR_MONTH_SHAPE = /^\d{4}-\d{2}$/

const MONTH_PARAM_NAME = 'mes'

function currentYearMonth(): YearMonth {
  const today = Temporal.PlainDate.from(todayAR())
  return { year: today.year, month: today.month }
}

function parseYearMonthParam(raw: string | null): YearMonth | null {
  if (raw === null || !YEAR_MONTH_SHAPE.test(raw)) {
    return null
  }
  try {
    const parsed = Temporal.PlainYearMonth.from(raw, { overflow: 'reject' })
    return { year: parsed.year, month: parsed.month }
  } catch {
    return null
  }
}

function formatYearMonthParam({ year, month }: YearMonth): string {
  return Temporal.PlainYearMonth.from({ year, month }).toString()
}

/**
 * Reads/writes the displayed month as the `?mes=` URL search param,
 * `YYYY-MM`. An absent or malformed value falls back to the current AR
 * month (`todayAR()`) rather than crashing -- the URL is state, and a
 * value a stranger can type by hand is not an exceptional case.
 */
export function useMonthParam(): [YearMonth, (next: YearMonth) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const yearMonth = parseYearMonthParam(searchParams.get(MONTH_PARAM_NAME)) ?? currentYearMonth()

  function setMonth(next: YearMonth): void {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous)
      updated.set(MONTH_PARAM_NAME, formatYearMonthParam(next))
      return updated
    })
  }

  return [yearMonth, setMonth]
}
