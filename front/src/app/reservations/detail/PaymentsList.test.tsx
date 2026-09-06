import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parsePlainDate } from '../../../shared/date/parsePlainDate'
import type { Payment } from '../usePayments'
import { PaymentsList } from './PaymentsList'

// task 6.5/6.6, `reservation-ledger` spec's "Payments And Refunds Share One
// List, A Refund Signed Negative" -- "matching the API's sign-only
// discrimination (there is no separate `kind` field)".
//
// A pure props-in/DOM-out component test (D36: "TDD where the subject is
// pure"), matching `WhoStays.tsx`'s own shape -- the list owns its
// ordering and its sign presentation, and neither depends on a network
// round trip to be exercised.

const PAYMENT: Payment = {
  id: 'p-1',
  amountCentavos: 6_000_000, // $ 60.000
  method: 'cash',
  paidOn: parsePlainDate('2026-08-12'),
  note: 'seña',
}

const REFUND: Payment = {
  id: 'p-2',
  amountCentavos: -1_000_000, // -$ 10.000
  method: 'transfer',
  paidOn: parsePlainDate('2026-08-20'),
  note: null,
}

describe('PaymentsList', () => {
  it('shows a payment and a later refund in date order, the refund signed negative', () => {
    // Deliberately handed to the component in the WRONG order (the API
    // orders by `created_at`, D30, which is the order she typed them in,
    // not the order they happen in) -- so a component that merely echoes
    // its input fails this.
    render(<PaymentsList payments={[REFUND, PAYMENT]} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('12/8')
    expect(rows[1]?.textContent).toContain('20/8')

    expect(rows[0]?.textContent).toContain('$ 60.000')
    expect(rows[0]?.textContent).not.toContain('-$')

    // Sign-only discrimination: the refund is the same list, the same row
    // shape, distinguished by nothing but the minus in front of it.
    expect(rows[1]?.textContent).toContain('-$ 10.000')
  })
})
