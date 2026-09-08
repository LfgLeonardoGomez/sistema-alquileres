import { useEffect, useState } from 'react'

// design decision (frontend-visual-design desktop pass, screen 12): the
// project's one and only `lg:` breakpoint threshold, matched exactly to
// Tailwind's own `lg:` (min-width: 1024px, `front/src/index.css` has no
// config file to look this up in otherwise) so this hook's boolean and the
// CSS classes that reflow layout never disagree about where the line is.
const DESKTOP_QUERY = '(min-width: 1024px)'

function matchesDesktop(): boolean {
  // jsdom (this project's test environment) ships no `matchMedia`
  // implementation at all -- calling it unguarded throws. Treating "cannot
  // ask" the same as "no match" is also the correct mobile-first default:
  // every existing behaviour test (written before this hook existed) keeps
  // exercising the phone layout unless a test deliberately stubs
  // `window.matchMedia` to say otherwise.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * The single JS-observable signal for "is the `lg:` breakpoint active".
 * `AvailabilityPage` uses it for two different reasons, both explained at
 * its own call sites: widening the fetch window to cover two months, and
 * rendering exactly one of a mobile/desktop control pair whose accessible
 * name would otherwise collide if both were mounted at once.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(matchesDesktop)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mediaQueryList = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent | { matches: boolean }) => setIsDesktop(event.matches)
    mediaQueryList.addEventListener('change', onChange as EventListener)
    return () => mediaQueryList.removeEventListener('change', onChange as EventListener)
  }, [])

  return isDesktop
}
