import type { ReactNode } from 'react'

// Design handoff: "Destructive actions ... always confirm in a sheet,
// never a browser dialog", "Guest row -> sheet (slide up from bottom,
// ~250ms ease-out)", sheet radius "30px top corners", scrim `#6C6E85`.
// Every `role="dialog"` in this app (cancel, deactivate, guest/cabin edit,
// add guest/cabin, payment) is visually this exact chrome -- a dimmed
// backdrop plus a white panel pinned to the bottom of the phone. The
// `role="dialog"`/`aria-label` stays on the caller's own element (every
// existing test queries by that), this component only wraps it with the
// scrim + panel presentation.

type Props = {
  readonly children: ReactNode
}

export function Sheet({ children }: Props) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-scrim/60">
      <div className="flex max-h-[90vh] flex-col gap-[18px] overflow-y-auto rounded-t-sheet bg-surface px-[22px] pt-3.5 pb-11">
        <div className="h-[5px] w-12 shrink-0 self-center rounded-pill bg-[#E0E0EA]" />
        {children}
      </div>
    </div>
  )
}
