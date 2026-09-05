import { describe, expect, it } from 'vitest'
import { parseMoney } from './parseMoney'

// design D27: the API serialises `Decimal` as a string. It is parsed to
// integer centavos, never to a float -- `parseFloat` plus `+` is forbidden
// by the absence of any helper that does it.

describe('parseMoney', () => {
  it('parses the API decimal string into integer centavos', () => {
    expect(parseMoney('5000.00')).toBe(500000)
  })

  it('parses a value with non-zero centavos', () => {
    expect(parseMoney('180000.50')).toBe(18000050)
  })

  it('parses a value with no decimal point at all', () => {
    expect(parseMoney('45000')).toBe(4500000)
  })

  // A refund reaches the client as a negative amount -- the sign IS the
  // payment/refund discriminator on the server (backend D7), so this branch
  // is exercised by real data the first time a refund is displayed, not by
  // some hypothetical future case.
  it('parses a negative amount, as a refund arrives from the API', () => {
    expect(parseMoney('-20000.00')).toBe(-2000000)
  })

  it('parses a negative amount with non-zero centavos', () => {
    expect(parseMoney('-180000.50')).toBe(-18000050)
  })
})
