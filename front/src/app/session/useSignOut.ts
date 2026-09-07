import { useNavigate } from 'react-router'
import { useSessionStore } from './store'
import { useWizardDraftStore } from '../reservations/wizard/store'

// owner-session spec's "The Owner Can Sign Out From Inside The App" +
// "A Deliberate Sign-Out Is Not Presented As An Expired Session", Note
// C(iii) (approved 10.1(f)). 10.28 [TRIANGULATE]: generalises 10.27's
// clear-only fake into the real two-effect behaviour -- clearToken() runs
// BEFORE navigate(), the same ordering `client.ts`'s 401 branch already
// uses (3.14).
//
// The reason gate 10.1(f) gave for this ordering does NOT hold, and 10.29
// disproved it empirically rather than inheriting it: reversing the two
// statements does not bounce her back to /inicio. `clearToken()` is a
// synchronous zustand `set()` and `router.navigate()`'s transition is
// deferred past this handler's own synchronous return, so BOTH complete
// before React renders the new route, and 10.11's mount-time check reads
// an already-cleared store either way. The observable behaviour is
// identical in both orders today.
//
// The order is kept, and pinned by a call-order spy rather than a DOM
// assertion (10.29), for a narrower reason than the gate claimed: it
// matches 3.14, and it stays correct if `navigate()` ever becomes
// synchronous or if anything starts reading the store during the
// transition. Do not restate the bounce-to-/inicio rationale -- it is
// false in this codebase's async router model.
//
// No third navigation-state shape: omitting the second `navigate()`
// argument entirely is what keeps `location.state` `null`, exactly like a
// plain visit to /login -- neither `expired` nor `from`, since a
// deliberate exit is not an expired session (10.1(f)).
//
// 10.32: the wizard-draft discard, Note C(iii) (approved 10.1(f)) --
// `useWizardDraftStore.getState().reset()`, 5.27's existing action,
// reused rather than reimplemented. This is the one new
// `app/session/` -> `app/reservations/wizard/store` import edge this
// phase adds; legal under `import/no-restricted-paths`, which restricts
// only `src/public/** -> src/app/**` (confirmed by re-running 9.2's
// fixture check against the finished tree, unchanged by this edge).
export function useSignOut(): () => void {
  const navigate = useNavigate()

  return () => {
    useSessionStore.getState().clearToken()
    useWizardDraftStore.getState().reset()
    navigate('/login', { replace: true })
  }
}
