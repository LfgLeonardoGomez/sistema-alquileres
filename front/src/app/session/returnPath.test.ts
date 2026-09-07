import { describe, expect, it } from 'vitest'
import { resolveReturnPath } from './returnPath'

// owner-session spec's "A Recorded Origin That Is Not An In-App Path Is
// Discarded" + 10.1(c)/(d)'s approved destination and open-redirect rules.
// A pure function, extracted rather than inlined in `LoginScreen`'s submit
// handler, on D36's own rule ("TDD where the subject is pure") -- the
// open-redirect rule is the one place in this phase a missed case is an
// attacker's redirect, not a cosmetic bug, so it gets its own bar.

describe('resolveReturnPath', () => {
  // 10.2 [RED]: the plain-visit case, nothing recorded an origin.
  it('returns /inicio when no state was recorded', () => {
    expect(resolveReturnPath(null)).toBe('/inicio')
  })

  // 10.4 [TRIANGULATE]
  it('returns the recorded in-app path when one was recorded', () => {
    expect(resolveReturnPath({ from: '/reserva/nueva/3' })).toBe('/reserva/nueva/3')
  })

  it('returns /inicio when the recorded origin is the sign-in screen itself', () => {
    expect(resolveReturnPath({ from: '/login' })).toBe('/inicio')
  })

  it('returns /inicio when the recorded origin is an empty string', () => {
    expect(resolveReturnPath({ from: '' })).toBe('/inicio')
  })

  // 10.5 [RED][TRAP]: every hostile `from` is discarded in favour of
  // `/inicio`. Prove the trap has teeth (8.7's precedent): temporarily make
  // `returnPath.ts` return `from` unconditionally, confirm these fail red,
  // then restore -- done and recorded in this task's Observed note, not
  // left as an assertion nobody ever watched fail.
  it.each([
    ['a protocol-relative origin', '//example.invalid/x'],
    ['an absolute https URL', 'https://example.invalid/x'],
    ['a scheme with a single slash', 'http:/example.invalid'],
    ['a javascript: scheme', 'javascript:alert(1)'],
    ['a backslash-prefixed origin', '\\\\example.invalid'],
  ])('discards %s rather than honouring it', (_label, hostileFrom) => {
    expect(resolveReturnPath({ from: hostileFrom })).toBe('/inicio')
  })

  it('discards a non-string from value', () => {
    expect(resolveReturnPath({ from: 42 })).toBe('/inicio')
  })
})
