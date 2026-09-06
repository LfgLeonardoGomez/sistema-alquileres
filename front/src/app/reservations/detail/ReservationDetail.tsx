import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { moneyStillHeldReminder, RESERVATION_DETAIL_COPY } from '../../../shared/copy/reservations'
import { formatDayMonth } from '../../../shared/date/format'
import { nightsBetween } from '../../../shared/date/nightsBetween'
import { formatMoney } from '../../../shared/money/formatMoney'
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

function balanceLine(balanceCentavos: number): string | null {
  if (balanceCentavos > 0) return RESERVATION_DETAIL_COPY.owes
  if (balanceCentavos < 0) return RESERVATION_DETAIL_COPY.refundOwed
  // Zero -- nothing is owed in either direction, so no directional line is
  // rendered at all. This is also the whole of 6.3/6.4: `displayBalance()`
  // reports `0` for a cancelled stay, so a cancelled reservation reaches
  // this branch and prints none of the three phrases the spec forbids it.
  return null
}

export function ReservationDetail() {
  const { id = null } = useParams<{ id: string }>()
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
    <div>
      <Link to="/calendario">{RESERVATION_DETAIL_COPY.volver}</Link>
      <h1>{guest?.full_name ?? ''}</h1>

      <section aria-label={RESERVATION_DETAIL_COPY.noches}>
        <p>{cabinName}</p>
        <p>
          <span>{RESERVATION_DETAIL_COPY.entrada}</span> <span>{formatDayMonth(stay.checkIn)}</span>
        </p>
        <p>
          <span>{RESERVATION_DETAIL_COPY.salida}</span> <span>{formatDayMonth(stay.checkOut)}</span>
        </p>
        <p>
          <span>{RESERVATION_DETAIL_COPY.noches}</span> <span>{nights}</span>
        </p>
        <p>{guest?.phone ?? ''}</p>
      </section>

      <section aria-label={RESERVATION_DETAIL_COPY.saldoLabel}>
        <p>
          <span>{RESERVATION_DETAIL_COPY.totalLabel}</span> <span>{formatMoney(stay.effectiveTotalCentavos)}</span>
        </p>
        <p>
          <span>{RESERVATION_DETAIL_COPY.paidLabel}</span> <span>{formatMoney(stay.paidAmountCentavos)}</span>
        </p>
        <p>
          {/* The ABSOLUTE amount, with the direction carried by the
              sentence beside it -- never a literal `-$`, which reads as an
              error rather than as money she owes back (4.18's own rule). */}
          <span>{RESERVATION_DETAIL_COPY.saldoLabel}</span> <span>{formatMoney(Math.abs(balanceCentavos))}</span>
        </p>
        {direction !== null ? <p>{direction}</p> : null}
      </section>

      {/* Outside the action block on purpose: a cancelled stay keeps every
          payment and refund it ever had (6.13, and screen 07's own promise
          that "los pagos anotados quedan guardados"). */}
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
          <section aria-label={RESERVATION_DETAIL_COPY.refund}>
            <p>{moneyStillHeldReminder(formatMoney(stay.paidAmountCentavos))}</p>
            <button type="button" onClick={() => setOpenSheet('refund')}>
              {RESERVATION_DETAIL_COPY.refund}
            </button>
          </section>
        ) : null
      ) : (
        <section aria-label={RESERVATION_DETAIL_COPY.recordPayment}>
          <button type="button" onClick={() => setOpenSheet('payment')}>
            {RESERVATION_DETAIL_COPY.recordPayment}
          </button>
          <button type="button" onClick={() => setOpenSheet('refund')}>
            {RESERVATION_DETAIL_COPY.refund}
          </button>
          <button type="button" onClick={() => setOpenSheet('cancel')}>
            {RESERVATION_DETAIL_COPY.cancel}
          </button>
          <Link to={`/reserva/${stay.id}/editar`}>{RESERVATION_DETAIL_COPY.editar}</Link>
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
