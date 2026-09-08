import { useState } from 'react'
import { TENANT_SETTINGS_COPY } from '../../shared/copy/tenant'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, fieldLabelClass, inputClass, Sheet } from '../../shared/ui'
import { useTenant } from './useTenant'
import { useUpdateTenant } from './useUpdateTenant'

// Part A of this run's brief: a settings BOTTOM SHEET reached from Home
// beside the existing "Cerrar sesión" affordance (`HomeScreen.tsx`) --
// never a screen, never a fifth tab (the design handoff's own explicit
// "no settings screen"). Not drawn anywhere in the handoff -- this run's
// own minimal, same-register invention, `GuestSheet.tsx`/`CabinEditSheet.
// tsx`'s own precedent for an undrawn "tap to open" surface.
//
// `TenantUpdate.extra="forbid"` (`back/app/schemas/tenant.py`) makes
// `whatsapp` the ONLY writable field -- the business name is shown
// read-only (a plain paragraph, never inside a `<label>` wrapping an
// input) rather than an editable field this API would 422 on.

type Props = {
  readonly onClose: () => void
}

export function TenantSettingsSheet({ onClose }: Props) {
  const tenant = useTenant()
  const updateTenant = useUpdateTenant()
  const [whatsapp, setWhatsapp] = useState('')
  const [seededTenantId, setSeededTenantId] = useState<string | null>(null)

  // Seeds the editable field from the fetched tenant exactly ONCE per
  // tenant id -- `tenant.data` starts `undefined` while the GET is in
  // flight. Computed during RENDER (React's own "adjusting state when a
  // prop changes" pattern, not an effect: https://react.dev/learn/
  // you-might-not-need-an-effect) rather than a `useEffect`, so an
  // unrelated background refetch (`refetchOnWindowFocus`, or any other
  // observer sharing this query) can never clobber an in-progress edit
  // she has not saved yet -- and this component never renders the
  // momentarily-stale pre-effect frame a `useEffect` version would.
  if (tenant.data !== undefined && tenant.data.id !== seededTenantId) {
    setSeededTenantId(tenant.data.id)
    setWhatsapp(tenant.data.whatsapp ?? '')
  }

  const canSubmit = whatsapp.trim() !== ''

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      // Sent AS TYPED -- no client-side reimplementation of the backend's
      // `normalise_whatsapp` (this run's binding constraint: the API is
      // the one authority for the digits-only/8-15 shape).
      const updated = await updateTenant.mutateAsync({ whatsapp })
      // Reflects the SERVER's own normalised value straight from the
      // mutation response -- correct without a manual refresh, and never
      // racing a background `keys.tenant()` refetch the way reading
      // `tenant.data` again here would.
      setWhatsapp(updated.whatsapp ?? '')
    } catch {
      // Surfaced below via `.isError`/`.error`; the sheet stays open so
      // she can correct the input and try again, `CabinEditSheet.tsx`'s
      // own shape for a write that fails.
    }
  }

  return (
    <Sheet>
      <div role="dialog" aria-label={TENANT_SETTINGS_COPY.title} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold text-primary">{TENANT_SETTINGS_COPY.title}</h2>

        {tenant.data !== undefined ? (
          <div className="flex flex-col gap-2">
            <span className={fieldLabelClass}>{TENANT_SETTINGS_COPY.businessNameLabel}</span>
            <p className="text-lg text-primary">{tenant.data.name}</p>
          </div>
        ) : null}

        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{TENANT_SETTINGS_COPY.whatsappLabel}</span>
          <input className={inputClass} value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
        </label>
        {/* The gap this run's brief calls "the single most important
            product detail": states the required international shape
            concretely so a plausible LOCAL number (no country code) --
            which passes the backend's own 8-15-digit validator and saves
            -- does not silently produce a broken wa.me link. */}
        <p className="text-base text-faint">{TENANT_SETTINGS_COPY.whatsappHelp}</p>

        {updateTenant.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(updateTenant.error)}
          </p>
        ) : null}

        <Button variant="primary" disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {TENANT_SETTINGS_COPY.save}
        </Button>
        <button type="button" className="text-center text-[17px] font-bold text-faint" onClick={onClose}>
          {TENANT_SETTINGS_COPY.close}
        </button>
      </div>
    </Sheet>
  )
}
