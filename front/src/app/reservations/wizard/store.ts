import { create } from 'zustand'
import type { PlainDate } from '../../../shared/date/parsePlainDate'

// design D29/D30, task 5.2: the SECOND and LAST of the app's exactly two
// Zustand stores (`stores.test.ts`, 5.3, is the standing guard on that
// count). It qualifies on D30's own written criterion's second clause --
// "something must survive the tree unmounting" -- because the D29 401
// interceptor unmounts the whole wizard on its way to `/login`, and the
// draft must still be there when she signs back in (5.30/5.31).
//
// In-memory only, deliberately NEVER persisted (no `zustand/middleware`
// `persist`, no `localStorage`, no `sessionStorage` anywhere in this file):
// D29's own text is explicit that persisting this would write a guest's
// name, phone and a price to disk for a benefit ("surviving a full page
// reload") nothing in this change asks for. A reload or a closed tab loses
// an in-progress draft -- an accepted residual, not a bug.

export type WizardPriceMode = 'per_night' | 'total'

export type WizardCabin = {
  readonly id: string
  readonly name: string
}

export type WizardDates = {
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
}

export type WizardGuest = {
  readonly id: string
  readonly fullName: string
  readonly phone: string
}

// The draft's own shape -- task 5.1's literal RED assertion. `amount` is
// integer centavos (D27), never a float, and holds whichever figure she
// typed (a per-night rate or a stay total) depending on `priceMode`; which
// field that maps to at submission time is PriceStep's own concern
// (5.20/5.21), not this store's.
export type WizardDraft = {
  readonly cabin: WizardCabin | null
  readonly dates: WizardDates | null
  readonly guest: WizardGuest | null
  readonly priceMode: WizardPriceMode | null
  readonly amount: number | null
}

type WizardActions = {
  readonly setCabin: (cabin: WizardCabin) => void
  readonly setDates: (dates: WizardDates) => void
  readonly setGuest: (guest: WizardGuest) => void
  readonly setPrice: (priceMode: WizardPriceMode, amount: number) => void
  /** Task 5.27/5.2's own reset half: a successful save clears the draft. */
  readonly reset: () => void
}

const INITIAL_DRAFT: WizardDraft = {
  cabin: null,
  dates: null,
  guest: null,
  priceMode: null,
  amount: null,
}

export const useWizardDraftStore = create<WizardDraft & WizardActions>((set) => ({
  ...INITIAL_DRAFT,

  setCabin(cabin) {
    set({ cabin })
  },
  setDates(dates) {
    set({ dates })
  },
  setGuest(guest) {
    set({ guest })
  },
  setPrice(priceMode, amount) {
    set({ priceMode, amount })
  },
  reset() {
    set(INITIAL_DRAFT)
  },
}))
