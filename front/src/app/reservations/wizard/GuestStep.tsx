import { useState } from 'react'
import { GUESTS_COPY, guestPhoneBelongsToAnotherMessage } from '../../../shared/copy/guests'
import { RESERVATION_WIZARD_COPY, wizardStepLabel } from '../../../shared/copy/reservations'
import { resolveErrorCopy } from '../../../shared/errors/resolve'
import { Button, fieldLabelClass, inputClass, navButtonClass } from '../../../shared/ui'
import { useFindOrCreateGuest } from '../../guests/useFindOrCreateGuest'
import type { WizardGuest } from './store'

// task 5.16-5.19, D33: "the interface must not swallow" the API's
// 200-vs-201 distinction. `POST /clients` is find-or-create-or-reactivate
// (D8) -- a matched OR reactivated existing guest and a brand-new one both
// resolve through the exact same call (`useFindOrCreateGuest`, 5.17), and
// this component's own job is purely presentational: show what came back,
// and say so plainly when the name she typed disagrees with the name the
// API returned, rather than silently proceeding as if she had just
// renamed someone.

type Props = {
  readonly initialGuest: WizardGuest | null
  readonly onContinue: (guest: WizardGuest) => void
  readonly onBack: () => void
}

export function GuestStep({ initialGuest, onContinue, onBack }: Props) {
  const [phone, setPhone] = useState(initialGuest?.phone ?? '')
  const [fullName, setFullName] = useState(initialGuest?.fullName ?? '')
  const [resolved, setResolved] = useState<WizardGuest | null>(initialGuest)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const findOrCreateGuest = useFindOrCreateGuest()

  async function handleSearch() {
    const typedName = fullName.trim()
    try {
      const result = await findOrCreateGuest.mutateAsync({ fullName: typedName, phone: phone.trim() })

      const guest: WizardGuest = { id: result.client.id, fullName: result.client.full_name, phone: result.client.phone }
      setResolved(guest)

      // D33's exact scenario: a 200 match whose stored name disagrees with
      // what she typed. A genuine 201 always echoes back the name she just
      // sent, so this can only ever fire on a match, never on a real
      // create -- no separate branch on `wasCreated` is needed to reach
      // that.
      setConflictMessage(result.client.full_name !== typedName ? guestPhoneBelongsToAnotherMessage(result.client.full_name) : null)
    } catch {
      // Surfaced below via `findOrCreateGuest.isError`/`.error` (e.g. a
      // 401 mid-wizard, task 5.30). Caught here only so a failed lookup is
      // a visible message instead of an unhandled promise rejection --
      // `mutateAsync` rethrows after already updating the mutation's own
      // state, and a 401 additionally already redirected via the router
      // (3.14) by the time this catch runs.
    }
  }

  const canSearch = phone.trim() !== '' && fullName.trim() !== ''

  return (
    <div className="flex min-h-screen flex-col gap-[18px] bg-page px-[18px] pt-16 pb-5">
      <div className="flex items-center gap-3.5">
        <button type="button" aria-label={RESERVATION_WIZARD_COPY.volver} className={navButtonClass} onClick={onBack}>
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </button>
        <div className="flex flex-col">
          <p className="text-[15px] font-extrabold text-faint-2">{wizardStepLabel(3)}</p>
          <h1 className="text-[22px] font-extrabold text-primary">{GUESTS_COPY.guestStepTitle}</h1>
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className={fieldLabelClass}>{GUESTS_COPY.phoneLabel}</span>
        <input
          className={inputClass}
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value)
            setResolved(null)
            setConflictMessage(null)
          }}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={fieldLabelClass}>{GUESTS_COPY.nameLabel}</span>
        <input
          className={inputClass}
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            setResolved(null)
            setConflictMessage(null)
          }}
        />
      </label>
      <Button variant="secondary" disabled={!canSearch} onClick={() => void handleSearch()}>
        {GUESTS_COPY.search}
      </Button>

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
        <section
          aria-label={GUESTS_COPY.guestStepTitle}
          className="flex flex-col gap-2 rounded-[20px] border border-card-border bg-surface p-5"
        >
          <p className="text-lg font-bold text-primary">{resolved.fullName}</p>
          <p className="text-base text-muted-2">{resolved.phone}</p>
          <Button variant="primary" onClick={() => onContinue(resolved)}>
            {GUESTS_COPY.seguir}
          </Button>
        </section>
      ) : null}
    </div>
  )
}
