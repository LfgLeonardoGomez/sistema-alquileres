import { RESERVATION_DETAIL_COPY } from '../../../shared/copy/reservations'
import { formatDayMonth } from '../../../shared/date/format'
import { formatMoney } from '../../../shared/money/formatMoney'
import type { Payment, PaymentMethod } from '../usePayments'

// task 6.6, handoff screen 06: `Card list "Pagos": "12/8 · seña — $ 60.000",
// "3/9 · efectivo — $ 40.000" (payments accumulate; refunds appear as
// negative entries)`.
//
// ONE list, sign-only discrimination -- there is no refund branch, no
// second section and no `kind` field, because the API has none either. The
// only thing a refund does differently is carry a minus sign, and that is
// produced by the sign of the number itself rather than by a conditional
// on some derived "is this a refund" flag.
//
// The sort lives here rather than at the call site for the same reason it
// lives inside `WhoStays.tsx`: the API orders by `created_at` (D30), which
// is the order she TYPED them in, not the order they happened in.

const METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  cash: RESERVATION_DETAIL_COPY.methodCash,
  transfer: RESERVATION_DETAIL_COPY.methodTransfer,
  other: RESERVATION_DETAIL_COPY.methodOther,
}

/**
 * `$ 60.000` for a payment, `-$ 10.000` for a refund.
 *
 * The minus is written OUTSIDE `formatMoney`, not handed to it: passing a
 * negative straight through produces `"$ -20.000"` (the sign lands between
 * the symbol and the digits), which is not how anyone writes an amount.
 * The `Saldo` block on the detail screen strips the sign entirely and
 * carries the direction in a sentence instead; a payments row is the one
 * place a literal minus is the right presentation, because it is what
 * distinguishes the two kinds of entry.
 */
function formatSignedAmount(centavos: number): string {
  return centavos < 0 ? `-${formatMoney(Math.abs(centavos))}` : formatMoney(centavos)
}

/**
 * One row, as one string: `12/8 · seña — $ 60.000`.
 *
 * Composed in JS rather than as JSX children on purpose -- `eslint`'s
 * `react/jsx-no-literals` (D32) allows exactly one bare string in JSX,
 * `'·'`, and the em dash the handoff draws is not it. Building the whole
 * label here keeps the handoff's own row format intact instead of
 * quietly redesigning the row to satisfy a lint rule.
 */
function paymentRowLabel(payment: Payment): string {
  const what = payment.note ?? METHOD_LABEL[payment.method]
  return `${formatDayMonth(payment.paidOn)} · ${what} — ${formatSignedAmount(payment.amountCentavos)}`
}

type Props = {
  readonly payments: readonly Payment[]
}

export function PaymentsList({ payments }: Props) {
  const ordered = payments
    .slice()
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0))

  return (
    <section aria-label={RESERVATION_DETAIL_COPY.paymentsTitle} className="mb-[22px] flex flex-col gap-2.5">
      <h2 className="pl-1 text-[17px] font-extrabold text-muted">{RESERVATION_DETAIL_COPY.paymentsTitle}</h2>
      {ordered.length === 0 ? <p className="text-base text-muted-2">{RESERVATION_DETAIL_COPY.noPayments}</p> : null}
      <ul className="flex flex-col gap-2.5">
        {ordered.map((payment) => (
          <li key={payment.id} className="flex justify-between rounded-row border border-card-border bg-surface px-[18px] py-4 text-lg">
            {paymentRowLabel(payment)}
          </li>
        ))}
      </ul>
    </section>
  )
}
