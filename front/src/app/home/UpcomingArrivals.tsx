import { HOME_COPY, arrivalDateLabel } from '../../shared/copy/home'
import { daysUntil } from '../../shared/date/daysUntil'
import { formatDayMonth } from '../../shared/date/format'
import { todayAR } from '../../shared/date/todayAR'
import { Card } from '../../shared/ui'
import { useUpcomingArrivals } from './useUpcomingArrivals'

// Screen 02 replacement (owner's live-review decision, 2026-09-07) -- see
// `useUpcomingArrivals.ts`'s own header for the full "one row per cabin,
// next arrival only" rule. Structurally carries no money field (the same
// "no revenue figure" boundary `HomeScreen.tsx`'s own `DashboardOccupancy`
// type enforces): this card is not a replacement for that rule, only for
// the occupancy figure the owner rejected.
export function UpcomingArrivals() {
  const { rows } = useUpcomingArrivals()
  const today = todayAR()

  return (
    <Card className="flex flex-col gap-3.5">
      <h2 className="text-[17px] font-bold text-muted">{HOME_COPY.upcomingArrivalsTitle}</h2>
      <ul className="flex flex-col">
        {rows.map((row, index) => (
          <li key={row.cabinId} className={index > 0 ? 'mt-3.5 border-t border-divider pt-3.5' : ''}>
            <p className="text-base font-bold text-primary">{row.cabinName}</p>
            {row.guestName !== null && row.checkIn !== null ? (
              <p className="flex items-baseline justify-between text-base text-muted-2">
                <span>{row.guestName}</span>
                <span className="font-bold text-primary">
                  {arrivalDateLabel(daysUntil(today, row.checkIn), formatDayMonth(row.checkIn))}
                </span>
              </p>
            ) : (
              <p className="text-base text-faint">{HOME_COPY.noUpcomingArrival}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
