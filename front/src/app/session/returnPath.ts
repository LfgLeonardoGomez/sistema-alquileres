// design D31/D36, owner-session spec's "A Successful Sign-In Leaves The
// Sign-In Screen" + "A Recorded Origin That Is Not An In-App Path Is
// Discarded". Extracted from `LoginScreen`'s submit handler on D36's own
// rule ("TDD where the subject is pure") -- 10.1(d)'s approved open-
// redirect rule is the one place in this phase a missed case is an
// attacker's redirect, not a cosmetic bug, and a rule that matters gets a
// unit with its own bar rather than a conditional buried in a handler.
//
// Accepted only when `from` is a string beginning with EXACTLY one `/`,
// whose second character is neither `/` nor `\` (rules out a protocol-
// relative origin and a backslash-prefixed one in the same check that
// already rejects any absolute URL or scheme, since those never start with
// `/` at all), and which is not `/login` itself (returning her to the form
// she just completed is a loop, not a return). Everything else -- an
// absolute URL, a non-string value, an empty string, `/login` -- falls back
// to `/inicio`.

const FALLBACK_PATH = '/inicio'
const LOGIN_PATH = '/login'

type RecordedOriginState = { readonly from?: unknown }

function hasRecordedOrigin(state: unknown): state is RecordedOriginState {
  return state !== null && typeof state === 'object' && 'from' in state
}

function isSafeInAppPath(from: unknown): from is string {
  if (typeof from !== 'string') return false
  if (from[0] !== '/') return false
  if (from[1] === '/' || from[1] === '\\') return false
  if (from === LOGIN_PATH) return false
  return true
}

export function resolveReturnPath(state: unknown): string {
  if (hasRecordedOrigin(state) && isSafeInAppPath(state.from)) {
    return state.from
  }
  return FALLBACK_PATH
}
