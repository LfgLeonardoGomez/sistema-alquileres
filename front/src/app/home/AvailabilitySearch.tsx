import { useState } from 'react'
import { Link } from 'react-router'
import { availabilityBookAction, availabilitySummary, HOME_COPY } from '../../shared/copy/home'
import { formatDateRange } from '../../shared/date/format'
import { parsePlainDate, type PlainDate } from '../../shared/date/parsePlainDate'
import { Card, fieldLabelClass } from '../../shared/ui'
import { useWizardDraftStore } from '../reservations/wizard/store'
import { useAvailabilitySearch } from './useAvailabilitySearch'

// Not `shared/ui/tokens.ts`'s own `inputClass`: a native `<input
// type="date">`'s browser-drawn control (icon + `dd/mm/aaaa`) has its own
// intrinsic minimum width, and `inputClass`'s `px-[18px]`/`text-[19px]`
// (sized for a single full-width text field, screens 01/05/09) left the
// second of two SIDE-BY-SIDE inputs clipped off the right edge of a 402px
// canvas -- confirmed empirically (Playwright at 402x874, the "Salida"
// control's calendar icon fell outside the viewport). Same height/border/
// radius/focus ring as `inputClass`, tighter padding and text size, and
// `min-w-0` so the flex-1 column is actually allowed to shrink below the
// control's own preferred width instead of overflowing its row.
const dateInputClass =
  'h-[58px] w-full min-w-0 rounded-field border border-input-border bg-surface px-2.5 text-base text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft-2'

// The owner calls this "imprescindible" and it is her single most frequent
// action -- placed above `UpcomingArrivals` on Home for that reason (the
// task brief's own ordering). Two native date inputs, no submit button:
// results update the moment both fields hold a value, matching "nos diga
// qué casas tienen estas fechas disponibles" as directly as the UI can --
// she should not need a second tap to get the answer.
//
// A native `<input type="date">`'s own `.value` is already a `YYYY-MM-DD`
// string or `''` -- there is no `Date` object anywhere on this path (D26).
function parseInputDate(value: string): PlainDate | null {
  if (value === '') return null
  try {
    return parsePlainDate(value)
  } catch {
    // An input mid-typing (e.g. a browser that allows a partial value)
    // reads as "not yet a date" rather than throwing through render.
    return null
  }
}

export function AvailabilitySearch() {
  const [checkIn, setCheckIn] = useState<PlainDate | null>(null)
  const [checkOut, setCheckOut] = useState<PlainDate | null>(null)
  const result = useAvailabilitySearch(checkIn, checkOut)
  // Selected individually, not the whole draft (`Wizard.tsx`'s own
  // `useWizardDraftStore()` call, which needs to READ every field to route
  // steps) -- this screen only ever WRITES, once, on tap, so it has no use
  // subscribing to `cabin`/`dates`/`guest`/`priceMode`/`amount` themselves.
  // Zustand action references are stable across renders (`store.ts`'s own
  // `create` factory builds them once), so this selector never triggers an
  // extra re-render this screen didn't already need.
  const setDraftCabin = useWizardDraftStore((state) => state.setCabin)
  const setDraftDates = useWizardDraftStore((state) => state.setDates)

  return (
    <Card className="flex flex-col gap-2.5">
      <h2 className="text-[17px] font-bold text-muted">{HOME_COPY.availabilityTitle}</h2>
      <div className="flex gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={fieldLabelClass}>{HOME_COPY.availabilityEntradaLabel}</span>
          <input
            type="date"
            className={dateInputClass}
            value={checkIn ?? ''}
            onChange={(event) => setCheckIn(parseInputDate(event.target.value))}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={fieldLabelClass}>{HOME_COPY.availabilitySalidaLabel}</span>
          <input
            type="date"
            className={dateInputClass}
            value={checkOut ?? ''}
            onChange={(event) => setCheckOut(parseInputDate(event.target.value))}
          />
        </label>
      </div>

      {result.kind === 'idle' ? <p className="text-base text-faint">{HOME_COPY.availabilityHint}</p> : null}

      {/* Task brief: "Invalid input ... must say so in the app's register,
          not silently return 'everything free'." A real alert, not a
          disabled control someone could route around. */}
      {result.kind === 'invalid-range' ? (
        <p role="alert" className="text-base font-bold text-warm">
          {HOME_COPY.availabilityInvalidRange}
        </p>
      ) : null}

      {result.kind === 'loading' ? <p className="text-base text-faint">{HOME_COPY.availabilityLoading}</p> : null}

      {/* `checkIn`/`checkOut !== null` is redundant with `result.kind ===
          'ready'` at runtime (`useAvailabilitySearch` only reaches "ready"
          once both are non-null) -- it exists so TypeScript, which cannot
          see that relationship across two independently-typed hooks,
          narrows both to `PlainDate` for the "Libre" row's own
          `setDraftDates`/`formatDateRange` calls below. */}
      {result.kind === 'ready' && checkIn !== null && checkOut !== null ? (
        <>
          <p className="text-base font-bold text-secondary">
            {availabilitySummary(result.rows.filter((row) => row.isFree).length, result.rows.length)}
          </p>
          {/* Every cabin the tenant has, not only the free ones -- the task
              brief's own requirement ("Casa Azul is free, Casa Dos Aguas is
              not", never a silently-omitted row). No money field anywhere in
              this list (home-summary spec "No Revenue Figure Is Ever
              Rendered"): `AvailabilityRow` structurally carries none. */}
          <ul className="flex flex-col">
            {result.rows.map((row, index) => {
              const rowClassName = `flex items-center justify-between ${index > 0 ? 'mt-1.5 border-t border-divider pt-1.5' : ''}`

              // "Ocupada" -- nothing to book, so it stays exactly what it
              // was: plain, non-interactive text (owner's own approval of
              // the row "as it shows"; only "Libre" is missing an action).
              if (!row.isFree) {
                return (
                  <li key={row.cabinId} className={rowClassName}>
                    <span className="text-base font-bold text-primary">{row.cabinName}</span>
                    <span className="text-base font-extrabold text-warm">{HOME_COPY.availabilityOccupied}</span>
                  </li>
                )
              }

              // Owner's own words (2026-09-07): "para no tener que
              // verificar, ver disponibilidad, confirmamos y después
              // empezamos de nuevo presionando anotar una reserva y volver a
              // cargar las fechas, casa, etc." -- a "Libre" row IS the start
              // of the reservation, not merely a fact about it.
              //
              // `setDraftCabin`/`setDraftDates` run inside this `Link`'s own
              // `onClick`, which `react-router`'s `Link` ALWAYS calls before
              // its internal navigate handler (`useLinkClickHandler`,
              // composed as `onClick(event); if (!defaultPrevented)
              // internalOnClick(event)`) -- both Zustand `set()` calls are
              // synchronous, so by the time `Wizard.tsx`'s step-3 guard
              // (`draft.cabin === null || draft.dates === null`) ever reads
              // the store, both fields are already committed. Reusing this
              // convention (a `<Link>` wrapping the row, `WhoStays.tsx`'s
              // own established shape for a tappable row that navigates to
              // another screen) makes that ordering structural, not
              // something a future edit could accidentally reverse by
              // reaching for `useNavigate()` instead.
              //
              // The exact `PlainDate`s the search already holds go straight
              // onto the draft -- never re-parsed, re-derived, or run
              // through a `Date` (design D26).
              return (
                <li key={row.cabinId} className={rowClassName}>
                  <Link
                    to="/reserva/nueva/3"
                    className="flex w-full items-center justify-between rounded-field focus:outline-none focus:ring-2 focus:ring-accent-soft-2"
                    aria-label={availabilityBookAction(row.cabinName, formatDateRange(checkIn, checkOut))}
                    onClick={() => {
                      setDraftCabin({ id: row.cabinId, name: row.cabinName })
                      setDraftDates({ checkIn, checkOut })
                    }}
                  >
                    <span className="text-base font-bold text-primary">{row.cabinName}</span>
                    <span className="text-base font-extrabold text-green-ink">{HOME_COPY.availabilityFree}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </Card>
  )
}
