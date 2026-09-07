import { useState } from 'react'
import { CABIN_FORM_COPY } from '../../shared/copy/cabins'

// task 8.2 -- the single name field shared by add-cabin and rename, on
// `GuestForm.tsx`'s own precedent of one small input component reused by
// two call sites rather than two hand-written copies.
//
// task 8.5/8.6, `GuestForm.tsx`'s own guard (7.15/7.16) mirrored exactly:
// the guard is structural, not merely a `disabled` attribute a test could
// route around -- `handleSubmit` returns before calling `onSubmit` at all
// when the trimmed name is blank, so there is no code path in which a
// blank (or whitespace-only) submission reaches the caller's mutation.

type Props = {
  readonly initialName?: string
  readonly submitLabel: string
  readonly onSubmit: (values: { readonly name: string }) => void
}

export function CabinForm({ initialName = '', submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initialName)

  const canSubmit = name.trim() !== ''

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({ name: name.trim() })
  }

  return (
    <div>
      <label>
        {CABIN_FORM_COPY.nameLabel}
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="button" disabled={!canSubmit} onClick={handleSubmit}>
        {submitLabel}
      </button>
    </div>
  )
}
