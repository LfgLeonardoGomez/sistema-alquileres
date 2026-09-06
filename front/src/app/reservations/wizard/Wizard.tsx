import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { CabinStep } from './CabinStep'
import { DateStep } from './DateStep'
import { GuestStep } from './GuestStep'
import { PriceStep } from './PriceStep'
import { useWizardDraftStore } from './store'

// task 5.24-5.31: the four-step orchestrator. Each step component (built
// and tested in isolation, 5.4-5.23) is deliberately kept STATELESS about
// wizard progress -- this module is the one place that reads/writes 5.2's
// store and decides which step to render, matching 5.25's own literal
// wording ("wizard state reads/writes 5.2's store across steps").
//
// A step whose own prerequisite is missing (e.g. `/reserva/nueva/3` opened
// directly with no cabin chosen yet) redirects to step 1 rather than
// rendering with impossible props -- not itself named by any task's text,
// but a direct consequence of D30's store existing at all: without this
// guard, a bookmark or a stale tab could crash a later step on a `null`
// it was never designed to receive.

export function Wizard() {
  const { paso } = useParams<{ paso: string }>()
  const navigate = useNavigate()
  const draft = useWizardDraftStore()
  // A REAL race, caught by this task's own `Wizard.test.tsx`, not merely
  // anticipated: `/inicio` is a `lazy()` route (task 4.14's own reasoning
  // for why), so `navigate('/inicio')` cannot resolve synchronously --
  // this component stays mounted, still subscribed to the WHOLE draft
  // store, for the brief window while that chunk loads. Calling
  // `draft.reset()` (5.26/5.27's own required action) during that window
  // re-renders THIS component with `cabin`/`dates`/`guest` suddenly `null`
  // while still matched to step 4, which the guards below would otherwise
  // read as "opened step 4 directly with nothing chosen" and redirect to
  // step 1 -- stomping the in-flight `/inicio` navigation. This state is
  // the guards' own escape hatch for exactly that window: once a save has
  // actually happened, a transient "nothing chosen" render means "already
  // leaving", never "redirect home to step 1". A plain `useState`, not a
  // ref -- reading a ref's `.current` during render is itself now a lint
  // error (`react-hooks/refs`), and this value IS read during render.
  const [justSaved, setJustSaved] = useState(false)

  function goToStep(step: number): void {
    navigate(`/reserva/nueva/${step}`)
  }

  const step = Number(paso)

  if (step === 1) {
    return (
      <CabinStep
        onSelected={(cabin) => {
          draft.setCabin(cabin)
          goToStep(2)
        }}
      />
    )
  }

  if (step === 2) {
    if (draft.cabin === null) return <Navigate to="/reserva/nueva/1" replace />
    return (
      <DateStep
        cabin={draft.cabin}
        initialDates={draft.dates}
        onBack={() => goToStep(1)}
        onContinue={(dates) => {
          draft.setDates(dates)
          goToStep(3)
        }}
      />
    )
  }

  if (step === 3) {
    if (draft.cabin === null || draft.dates === null) return <Navigate to="/reserva/nueva/1" replace />
    return (
      <GuestStep
        initialGuest={draft.guest}
        onBack={() => goToStep(2)}
        onContinue={(guest) => {
          draft.setGuest(guest)
          goToStep(4)
        }}
      />
    )
  }

  if (step === 4) {
    if (draft.cabin === null || draft.dates === null || draft.guest === null) {
      // See `justSaved`'s own comment above: a save-in-progress renders
      // nothing here rather than redirecting, and lets the already-issued
      // `/inicio` navigation finish taking effect.
      return justSaved ? null : <Navigate to="/reserva/nueva/1" replace />
    }
    return (
      <PriceStep
        cabin={draft.cabin}
        dates={draft.dates}
        guest={draft.guest}
        initialPriceMode={draft.priceMode}
        initialAmount={draft.amount}
        onBack={() => goToStep(3)}
        onPriceChange={(priceMode, amount) => draft.setPrice(priceMode, amount)}
        onSaved={() => {
          // `reservation-recording` spec "Saving Clears The Draft And
          // Leaves The Wizard" (5.26/5.27): the ONLY place `reset()` is
          // called on a successful path. `setJustSaved(true)` batches with
          // `draft.reset()`'s own re-render (both fire synchronously here,
          // in the same tick), so the very next render this component
          // makes already knows a save just happened.
          setJustSaved(true)
          navigate('/inicio')
          draft.reset()
        }}
      />
    )
  }

  return <Navigate to="/reserva/nueva/1" replace />
}
