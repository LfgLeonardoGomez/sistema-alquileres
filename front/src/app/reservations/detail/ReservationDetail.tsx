import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { moneyStillHeldReminder, RESERVATION_DETAIL_COPY, RESERVATION_WIZARD_COPY } from '../../../shared/copy/reservations'
import { formatDayMonth } from '../../../shared/date/format'
import { nightsBetween } from '../../../shared/date/nightsBetween'
import { formatMoney } from '../../../shared/money/formatMoney'
import { Button, navButtonClass } from '../../../shared/ui'
import { balanceLine } from '../balanceLine'
import { displayBalance } from '../displayBalance'
import { useCabins } from '../useCabins'
import { useClients } from '../useClients'
import { usePayments } from '../usePayments'
import { useReservation } from '../useReservation'
import { CancelSheet } from './CancelSheet'
import { PaymentsList } from './PaymentsList'
import { PaymentSheet } from './PaymentSheet'

// tasks 6.2/6.15 -- handoff screen 06 ("La reserva (detalle)").
//
// `Total de la estadía` and `Pagado` are read STRAIGHT off the API's own
// `effective_total`/`paid_amount` -- neither is recomputed here, because a
// second arithmetic path for money is a second truth about money (D27).
// Only `Saldo` passes through a helper, and that helper is 4.17/4.18's
// `displayBalance()`, reused rather than reimplemented: it is the one
// place that knows a cancelled stay owes nothing regardless of what the
// API reports (6.3/6.4 hold entirely on that reuse).
//
// The guest's name and the cabin's name come from 4.9's `useClients()`/
// `useCabins()` -- the app's ONLY lookup call sites (D30, and a standing
// test guard in `lookups.test.ts`). Both fetch `include_inactive=true`, so
// a deactivated guest's stay still renders with her name on it rather than
// blank.

type OpenSheet = 'payment' | 'refund' | 'cancel' | null

export function ReservationDetail() {
  const { id = null } = useParams<{ id: string }>()
  // Owner's live-review deposit request (2026-09-07), the partial-failure
  // half: the wizard's `PriceStep.tsx` navigates here with this exact
  // shape when the reservation saved but its deposit call failed. Router
  // state, not a query param or a stored flag -- it is meant to survive
  // exactly one landing (a refresh or a later visit shows nothing), the
  // same "flash message" lifetime `location.state` already has everywhere
  // else in this app (`RequireSession`'s own `state.from`).
  const location = useLocation()
  const depositFailed = (location.state as { readonly depositFailed?: boolean } | null)?.depositFailed === true
  const reservation = useReservation(id)
  const payments = usePayments(id)
  const cabins = useCabins()
  const clients = useClients()
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null)

  if (reservation.data === undefined) return null

  const stay = reservation.data
  const cabinName = cabins.data?.find((cabin) => cabin.id === stay.propertyId)?.name ?? ''
  const guest = clients.data?.find((client) => client.id === stay.clientId)
  const nights = nightsBetween(stay.checkIn, stay.checkOut)

  const balanceCentavos = displayBalance({ status: stay.status, balance: stay.balanceCentavos })
  const direction = balanceLine(balanceCentavos)

  // D34, first of the two places: "A cancelled reservation offers no
  // editing -- in two places, because a hidden button is not a closed
  // route." The second is `/reserva/:id/editar`'s own guard, which is the
  // next commit's 6.30/6.31.
  const isCancelled = stay.status === 'cancelled'

  // Phase 6c (6.35), the owner's decision of 2026-09-06. Derived from
  // `paid_amount` and from NOTHING else -- no dismissal flag, no
  // `localStorage`, no server field. It needs none: a refund drives
  // `paid_amount` down, so a full one retires this on its own and a partial
  // one leaves it naming the remainder. A "ya lo hice" flag would be a
  // second, staler answer to a question the amount already answers.
  const holdsMoneyAfterCancelling = isCancelled && stay.paidAmountCentavos > 0

  return (
    <div className="flex min-h-screen flex-col bg-page px-[18px] pt-16 pb-[26px]">
      <div className="mb-5 flex items-center gap-3.5">
        <Link to="/calendario" aria-label={RESERVATION_DETAIL_COPY.volver} className={navButtonClass}>
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </Link>
        <h1 className="text-[22px] font-extrabold text-primary">{guest?.full_name ?? ''}</h1>
      </div>

      {depositFailed ? (
        // `role="alert"` + `text-warm`, matching `PriceStep.tsx`'s own
        // failed-save message -- this IS a failure (the deposit call), even
        // though the reservation itself saved fine; the sentence's own
        // wording is what keeps the two from reading as the same failure.
        <p role="alert" className="mb-4 rounded-2xl border border-card-border bg-surface px-[18px] py-3.5 text-base font-bold text-warm">
          {RESERVATION_DETAIL_COPY.depositNotRecorded}
        </p>
      ) : null}

      <section aria-label={RESERVATION_DETAIL_COPY.noches} className="mb-4 flex flex-col gap-4 rounded-card border border-card-border bg-surface p-[22px]">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-pill bg-accent-soft-2" />
          <p className="text-lg font-bold text-primary">{cabinName}</p>
        </div>
        <div className="flex gap-[26px]">
          <p className="flex flex-col gap-0.5">
            <span className="text-[15px] font-extrabold text-faint-2">{RESERVATION_DETAIL_COPY.entrada}</span>
            <span className="text-[22px] font-extrabold text-primary">{formatDayMonth(stay.checkIn)}</span>
          </p>
          <p className="flex flex-col gap-0.5">
            <span className="text-[15px] font-extrabold text-faint-2">{RESERVATION_DETAIL_COPY.salida}</span>
            <span className="text-[22px] font-extrabold text-primary">{formatDayMonth(stay.checkOut)}</span>
          </p>
          <p className="flex flex-col gap-0.5">
            <span className="text-[15px] font-extrabold text-faint-2">{RESERVATION_DETAIL_COPY.noches}</span>
            <span className="text-[22px] font-extrabold text-primary">{nights}</span>
          </p>
        </div>
        <p className="text-lg text-muted-2">{guest?.phone ?? ''}</p>
      </section>

      <section aria-label={RESERVATION_DETAIL_COPY.saldoLabel} className="mb-4 flex flex-col gap-3.5 rounded-card border border-card-border bg-surface p-[22px]">
        <p className="flex justify-between text-lg">
          <span className="text-muted">{RESERVATION_DETAIL_COPY.totalLabel}</span>
          <span className="font-bold text-primary">{formatMoney(stay.effectiveTotalCentavos)}</span>
        </p>
        <p className="flex justify-between text-lg">
          <span className="text-muted">{RESERVATION_DETAIL_COPY.paidLabel}</span>
          <span className="font-bold text-primary">{formatMoney(stay.paidAmountCentavos)}</span>
        </p>
        <div className="h-px bg-divider" />
        <p className="flex items-baseline justify-between">
          {/* The ABSOLUTE amount, with the direction carried by the
              sentence beside it -- never a literal `-$`, which reads as an
              error rather than as money she owes back (4.18's own rule). */}
          <span className="text-xl font-extrabold text-primary">{RESERVATION_DETAIL_COPY.saldoLabel}</span>
          <span className="text-[28px] font-extrabold text-warm">{formatMoney(Math.abs(balanceCentavos))}</span>
        </p>
        {direction !== null ? <p className="text-base text-muted-2">{direction}</p> : null}
      </section>

      {/* Outside the action block on purpose: a cancelled stay keeps every
          payment and refund it ever had (6.13, and screen 07's own promise
          that "los pagos anotados quedan guardados". */}
      <PaymentsList payments={payments.data ?? []} />

      {/* Phase 6c (6.38): 6.15's single `status !== 'cancelled'` gate, now
          two branches over that same one condition. The cancelled branch
          carries the reminder and the REFUND ONLY -- editing (6.15 here,
          6.30/6.31's route guard next door) and recording a NEW incoming
          payment stay hidden, because the owner asked for refunds
          specifically, not a general unlock. Cancelling again is gone for
          the obvious reason. */}
      {isCancelled ? (
        holdsMoneyAfterCancelling ? (
          <section aria-label={RESERVATION_DETAIL_COPY.refund} className="mt-6 flex flex-col gap-3.5">
            <p className="text-base text-muted-2">{moneyStillHeldReminder(formatMoney(stay.paidAmountCentavos))}</p>
            <Button variant="secondary" onClick={() => setOpenSheet('refund')}>
              {RESERVATION_DETAIL_COPY.refund}
            </Button>
          </section>
        ) : null
      ) : (
        <section aria-label={RESERVATION_DETAIL_COPY.recordPayment} className="mt-6 flex flex-col gap-3">
          <Button variant="primary" className="h-[66px]" onClick={() => setOpenSheet('payment')}>
            {RESERVATION_DETAIL_COPY.recordPayment}
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setOpenSheet('refund')}>
              {RESERVATION_DETAIL_COPY.refund}
            </Button>
            <Button variant="text-warm" onClick={() => setOpenSheet('cancel')}>
              {RESERVATION_DETAIL_COPY.cancel}
            </Button>
          </div>
          <Link to={`/reserva/${stay.id}/editar`} className="text-center text-[17px] font-bold text-accent-ink">
            {RESERVATION_DETAIL_COPY.editar}
          </Link>
        </section>
      )}

      {openSheet === 'payment' || openSheet === 'refund' ? (
        <PaymentSheet reservationId={stay.id} mode={openSheet} onClose={() => setOpenSheet(null)} />
      ) : null}

      {openSheet === 'cancel' ? (
        <CancelSheet
          reservationId={stay.id}
          checkIn={stay.checkIn}
          checkOut={stay.checkOut}
          cabinName={cabinName}
          onClose={() => setOpenSheet(null)}
        />
      ) : null}
    </div>
  )
}
