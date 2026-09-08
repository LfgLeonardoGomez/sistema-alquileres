import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsDesktop } from './useIsDesktop'

// design decision (frontend-visual-design desktop pass): the public
// availability page needs one JS-observable boolean to (a) widen its fetch
// window to cover two months and (b) render exactly one of its mobile/
// desktop variants for controls whose accessible name would otherwise
// collide (the filter buttons, the WhatsApp link) -- see AvailabilityPage's
// own header comment. This hook is the single source of truth for that
// boolean, matching Tailwind's own `lg:` breakpoint (min-width: 1024px)
// exactly so the CSS-only reflow (photo tiles, month-panel layout) and the
// JS-gated seam never disagree about where the line is.

type MediaQueryListenerMap = Map<string, EventListenerOrEventListenerObject>

function invokeListener(listener: EventListenerOrEventListenerObject, event: { matches: boolean }): void {
  const fakeEvent = event as unknown as Event
  if (typeof listener === 'function') {
    listener(fakeEvent)
  } else {
    listener.handleEvent(fakeEvent)
  }
}

function stubMatchMedia(initialMatches: boolean): {
  readonly setMatches: (matches: boolean) => void
} {
  const listeners: MediaQueryListenerMap = new Map()
  let matches = initialMatches

  const mql: Partial<MediaQueryList> = {
    get matches() {
      return matches
    },
    media: '(min-width: 1024px)',
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
    },
  }

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(mql as MediaQueryList),
  )

  return {
    setMatches: (next: boolean) => {
      matches = next
      const listener = listeners.get('change')
      if (listener !== undefined) invokeListener(listener, { matches: next })
    },
  }
}

describe('useIsDesktop', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when matchMedia reports no match', () => {
    stubMatchMedia(false)

    const { result } = renderHook(() => useIsDesktop())

    expect(result.current).toBe(false)
  })

  it('returns true when matchMedia already matches on mount', () => {
    stubMatchMedia(true)

    const { result } = renderHook(() => useIsDesktop())

    expect(result.current).toBe(true)
  })

  it('updates when the media query change event fires', () => {
    const { setMatches } = stubMatchMedia(false)

    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)

    act(() => {
      setMatches(true)
    })

    expect(result.current).toBe(true)
  })

  // [TRAP] jsdom ships no `matchMedia` implementation at all -- this proves
  // the hook degrades to the mobile-first default (`false`) rather than
  // throwing, which is exactly what keeps every existing AvailabilityPage
  // test (written before this hook existed, none of them stub matchMedia)
  // green without modification.
  it('returns false without throwing when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)

    const { result } = renderHook(() => useIsDesktop())

    expect(result.current).toBe(false)
  })
})
