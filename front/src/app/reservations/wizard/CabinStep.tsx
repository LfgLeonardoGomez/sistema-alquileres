import { RESERVATION_WIZARD_COPY, wizardStepLabel } from '../../../shared/copy/reservations'
import { navButtonClass } from '../../../shared/ui'
import { useCabins } from '../useCabins'

// task 5.4/5.5, `reservation-recording` spec "Only Active Cabins Are
// Offered On The Cabin Step". `useCabins()` fetches `include_inactive=true`
// (D30) because a deactivated cabin's past stays must still resolve a
// name elsewhere -- filtering back down to `is_active` for a NEW
// reservation is THIS step's own responsibility, not the hook's.
//
// Owner's live-review correction #3 (2026-09-07): "veo una pantalla
// limpia, sin nada más que dos botones largos, no me gusta". Fixed with a
// heading (matching the other three steps' "Paso X de 4" + title
// treatment) and two side-by-side cards, sized off the handoff's own card
// recipe (22px radius, `#FFFFFF` surface, `#ECECF5` border) rather than
// the full-width bars this replaces. Selection behaviour is unchanged --
// `onSelected` fires the same way it always did.
//
// Owner's live-review correction #1 (2026-09-07): "desde la vista '¿para
// qué casa querés reservar?' no puedo volver atrás, se pierde el footer y
// no hay ningún botón para volver o cancelar" -- step 1's earlier "no back
// chevron here, since step 1 has no previous step" reasoning was correct
// about STEPS but forgot the wizard as a whole is also a flow she needs a
// way out of, and it renders no `TabBar` (a deliberate full-screen
// choice), so with neither a back chevron nor a tab bar step 1 was a dead
// end. The handoff draws no step-1 screen at all (this module's other
// header comment), so there is no drawn close/cancel affordance to defer
// to -- fixed instead by reusing the exact chevron button steps 2-4
// already carry in this same header position (`navButtonClass`,
// `previousMonthGlyph`, the `volver` label), rather than inventing a new
// control. `onCancel` is optional so `CabinStep` stays renderable with
// nothing wired to it (its own established discipline of staying
// STATELESS about wizard progress -- `Wizard.tsx` owns navigation and the
// draft store, this component only calls what it's given).

type Props = {
  readonly onSelected: (cabin: { readonly id: string; readonly name: string }) => void
  readonly onCancel?: () => void
}

export function CabinStep({ onSelected, onCancel }: Props) {
  const cabins = useCabins()
  const activeCabins = (cabins.data ?? []).filter((cabin) => cabin.is_active)

  return (
    <div className="flex min-h-screen flex-col gap-8 bg-page px-[18px] pt-16 pb-5">
      <div className="flex items-center gap-3.5">
        {onCancel !== undefined ? (
          <button type="button" aria-label={RESERVATION_WIZARD_COPY.volver} className={navButtonClass} onClick={onCancel}>
            {RESERVATION_WIZARD_COPY.previousMonthGlyph}
          </button>
        ) : null}
        <div className="flex flex-col">
          <p className="text-[15px] font-extrabold text-faint-2">{wizardStepLabel(1)}</p>
          <h1 className="text-[22px] font-extrabold text-primary">{RESERVATION_WIZARD_COPY.cabinStepTitle}</h1>
        </div>
      </div>
      <div className="flex gap-3">
        {activeCabins.map((cabin) => (
          <button
            key={cabin.id}
            type="button"
            className="flex min-h-[160px] flex-1 items-center justify-center rounded-card border border-card-border bg-surface p-[22px] text-center text-lg font-bold text-primary"
            onClick={() => onSelected({ id: cabin.id, name: cabin.name })}
          >
            {cabin.name}
          </button>
        ))}
      </div>
    </div>
  )
}
