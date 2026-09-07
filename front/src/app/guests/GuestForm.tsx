import { useState } from 'react'
import { GUESTS_COPY } from '../../shared/copy/guests'
import { Button, fieldLabelClass, inputClass } from '../../shared/ui'

// tasks 7.4/7.15/7.16 -- the phone/name pair and its required-field guard,
// extracted so a SECOND entry point (the guest directory's "Agregar un
// huésped" button) can reuse the exact input shape and guard 5.16-5.19's
// `GuestStep.tsx` already built, rather than a second hand-written copy of
// two labelled inputs and a disabled-button rule. `GuestForm` owns none of
// the resolution logic and no mutation of its own -- it only decides WHEN
// `onSubmit` may fire, never what happens after. The caller wires that:
// `GuestStep` calls `useFindOrCreateGuest` for the wizard's own step 3, and
// the guest directory's add-guest sheet calls the exact same hook through
// this exact same component (task 7.3/7.4's "reused rather than
// reimplemented").
//
// The guard itself is structural, not merely a disabled attribute a test
// could route around: `handleSubmit` returns before calling `onSubmit` at
// all when either field is blank, so there is no code path in which a
// blank submission reaches the caller's mutation.

type Props = {
  readonly initialFullName?: string
  readonly initialPhone?: string
  readonly submitLabel: string
  readonly onSubmit: (values: { readonly fullName: string; readonly phone: string }) => void
}

export function GuestForm({ initialFullName = '', initialPhone = '', submitLabel, onSubmit }: Props) {
  const [fullName, setFullName] = useState(initialFullName)
  const [phone, setPhone] = useState(initialPhone)

  const canSubmit = fullName.trim() !== '' && phone.trim() !== ''

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({ fullName: fullName.trim(), phone: phone.trim() })
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className={fieldLabelClass}>{GUESTS_COPY.phoneLabel}</span>
        <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className={fieldLabelClass}>{GUESTS_COPY.nameLabel}</span>
        <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </label>
      <Button variant="primary" disabled={!canSubmit} onClick={handleSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
