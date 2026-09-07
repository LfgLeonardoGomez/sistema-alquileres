import { useState } from 'react'
import { GUEST_DIRECTORY_COPY, GUESTS_COPY, guestPhoneBelongsToAnotherMessage } from '../../shared/copy/guests'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, Sheet } from '../../shared/ui'
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
    <Sheet>
      <div role="dialog" aria-label={GUEST_DIRECTORY_COPY.addGuest} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold text-primary">{GUEST_DIRECTORY_COPY.addGuest}</h2>
        <GuestForm submitLabel={GUESTS_COPY.search} onSubmit={(values) => void handleSubmit(values)} />

        {conflictMessage !== null ? (
          <p role="alert" className="text-base font-bold text-warm">
            {conflictMessage}
          </p>
        ) : null}
        {findOrCreateGuest.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(findOrCreateGuest.error)}
          </p>
        ) : null}

        {resolved !== null ? (
          <section aria-label={GUEST_DIRECTORY_COPY.addGuest} className="flex flex-col gap-2 rounded-[20px] border border-card-border bg-surface p-5">
            <p className="text-lg font-bold text-primary">{resolved.fullName}</p>
            <p className="text-base text-muted-2">{resolved.phone}</p>
            <Button variant="primary" onClick={onClose}>
              {GUESTS_COPY.seguir}
            </Button>
          </section>
        ) : null}
      </div>
    </Sheet>
  )
}
