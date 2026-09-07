import { SESSION_COPY } from '../../shared/copy/session'
import { useSignOut } from './useSignOut'

// owner-session spec's "The Owner Can Sign Out From Inside The App", Note
// C(i) (approved 10.1(f)): a low-emphasis affordance OWNED by
// `app/session/` -- the capability that owns the session owns its exit --
// composed into `app/home/HomeScreen.tsx` (10.36), never into
// `app/shell/TabBar.tsx`, which no task in this phase touches. A plain
// button, not a link: signing out is an action with side effects (clear,
// discard, navigate), not a destination.
export function SignOutButton() {
  const signOut = useSignOut()
  return (
    <button type="button" className="text-center text-[17px] font-bold text-faint" onClick={signOut}>
      {SESSION_COPY.signOut}
    </button>
  )
}
