import { describe, expect, it } from 'vitest'
import { parsePlainDate } from '../date/parsePlainDate'
import { GREETING_PHRASES, greetingForDate } from './home'

// The owner's live-review rejection of the hardcoded 'Hola, Ana' greeting
// (design brief for this run): no owner-person name exists anywhere in the
// schema, so the greeting drops the name entirely and instead rotates
// across five nameless, time-neutral phrases -- selected as a PURE
// function of the calendar date (never random, never stateful), so the
// same phrase holds all day and only changes at midnight.

describe('greetingForDate', () => {
  it('is deterministic: the same date always yields the same phrase', () => {
    const date = parsePlainDate('2026-09-08')

    const first = greetingForDate(date)
    const second = greetingForDate(date)

    expect(first).toBe(second)
    expect(GREETING_PHRASES).toContain(first)
  })

  it('rotates across a run of consecutive days, wrapping back to the first phrase', () => {
    // GREETING_PHRASES has exactly 5 entries -- 6 consecutive days must
    // produce the same phrase on day 1 and day 6, proving the rotation
    // wraps rather than running out or repeating early.
    const dates = [
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ].map(parsePlainDate)

    const phrases = dates.map(greetingForDate)

    expect(phrases[0]).toBe(phrases[5])
    // And the run genuinely rotates -- not every day collapsing onto the
    // same phrase by accident.
    expect(new Set(phrases.slice(0, 5)).size).toBe(GREETING_PHRASES.length)
  })

  it('yields a different phrase on a date 5+ days later, following the same fixed rotation', () => {
    const dayOne = greetingForDate(parsePlainDate('2026-09-08'))
    const dayTwo = greetingForDate(parsePlainDate('2026-09-09'))

    expect(dayOne).not.toBe(dayTwo)
  })
})
