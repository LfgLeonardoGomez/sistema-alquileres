import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatMoney'

// design D27: `$ 180.000`, es-AR, dot thousands -- with one refinement the
// handoff does not cover: non-zero centavos are rendered, never dropped.
// Every value in the design has zero centavos, which is exactly why
// silently truncating fifty of them would never be caught by eyeballing a
// designed screen.

describe('formatMoney', () => {
  it('renders a round amount with no decimal digits', () => {
    expect(formatMoney(18000000)).toBe('$ 180.000')
  })

  it('[TRAP] renders non-zero centavos, never truncated', () => {
    expect(formatMoney(18000050)).toBe('$ 180.000,50')
  })

  it('renders a smaller round amount', () => {
    expect(formatMoney(500000)).toBe('$ 5.000')
  })
})
