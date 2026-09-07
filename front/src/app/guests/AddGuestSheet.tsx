import { useState } from 'react'
import { GUEST_DIRECTORY_COPY, GUESTS_COPY, guestPhoneBelongsToAnotherMessage } from '../../shared/copy/guests'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { useFindOrCreateGuest } from './useFindOrCreateGuest'
import { GuestForm } from './GuestForm'

// task 7.3/7.4: the guest directory's own "second entry point" onto
// 5.17/5.19's find-or-create-or-reactivate call, reused rather than
// reimplemented. This wrapper owns exactly what `GuestStep.tsx` owns for
// the wizard -- the `useFindOrCreateGuest` mutation and the 200-vs-201
// conflict message -- so the underlying resolution behaviour cannot drift
// between the two mount points. `GuestForm` (7.15/7.16) supplies the
// inputs and the blank-field guard; this component supplies nothing new
// beyond wiring it to the guest directory's own mutation and closing the
// sheet once she confirms the resolved guest with "Seguir".

type Props = {
  readonly onClose: () => void
}

export function AddGuestSheet({ onClose }: Props) {
  const [resolved, setResolved] = useState<{ fullName: string; phone: string } | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const findOrCreateGuest = useFindOrCreateGuest()

  async function handleSubmit({ fullName, phone }: { fullName: string; phone: string }) {
    try {
      const result = await findOrCreateGuest.mutateAsync({ fullName, phone })
      setResolved({ fullName: result.client.full_name, phone: result.client.phone })
      setConflictMessage(result.client.full_name !== fullName ? guestPhoneBelongsToAnotherMessage(result.client.full_name) : null)
    } catch {
      // Surfaced below via `findOrCreateGuest.isError`/`.error`, the exact
      // shape `GuestStep.tsx` already uses.
    }
  }

  return (
    <div role="dialog" aria-label={GUEST_DIRECTORY_COPY.addGuest}>
      <h2>{GUEST_DIRECTORY_COPY.addGuest}</h2>
      <GuestForm submitLabel={GUESTS_COPY.search} onSubmit={(values) => void handleSubmit(values)} />

      {conflictMessage !== null ? <p role="alert">{conflictMessage}</p> : null}
      {findOrCreateGuest.isError ? <p role="alert">{resolveErrorCopy(findOrCreateGuest.error)}</p> : null}

      {resolved !== null ? (
        <section aria-label={GUEST_DIRECTORY_COPY.addGuest}>
          <p>{resolved.fullName}</p>
          <p>{resolved.phone}</p>
          <button type="button" onClick={onClose}>
            {GUESTS_COPY.seguir}
          </button>
        </section>
      ) : null}
    </div>
  )
}
