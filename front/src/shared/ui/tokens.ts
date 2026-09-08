// Small, non-componentizable style recipes shared by several screens: the
// segmented-control track/pill pair (screens 03/05/11/12), the 44px round
// month-nav chevron button (screens 03/04/11), and the text input recipe
// (screens 01/05/09 and every sheet's form). Plain class strings rather
// than components -- each call site's element (button vs input, group
// role vs plain div) differs enough that a shared component would need
// more polymorphism than the repetition it saves.

export const segmentedTrackClass = 'flex gap-1.5 rounded-2xl bg-track p-[5px]'

export function segmentedButtonClass(active: boolean, height = 'h-12'): string {
  return active
    ? `flex ${height} flex-1 items-center justify-center rounded-xl bg-surface text-[17px] font-extrabold text-primary`
    : `flex ${height} flex-1 items-center justify-center rounded-xl text-[17px] font-bold text-muted-2`
}

// Screen 12's own desktop filter recipe -- the handoff's "segmented on
// phone, pills on desktop" (README: screens 11/12). A free-standing pair
// rather than a variant of `segmentedTrackClass`/`segmentedButtonClass`
// above: the desktop pill has no shared track background (each pill is its
// own rounded-full chip), so reusing the segmented recipe would need more
// conditional branches than writing its own small recipe.
export const pillRowClass = 'flex flex-wrap gap-2.5'

export function pillButtonClass(active: boolean): string {
  return active
    ? 'flex h-11 items-center rounded-pill bg-primary px-[22px] text-base font-bold text-white'
    : 'flex h-11 items-center rounded-pill bg-track-2 px-[22px] text-base font-bold text-secondary'
}

export const navButtonClass =
  'flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#E9E9F2] bg-surface text-xl text-muted'

export const inputClass =
  'h-[58px] rounded-field border border-input-border bg-surface px-[18px] text-[19px] text-primary placeholder:text-faint-2 focus:outline-none focus:ring-2 focus:ring-accent-soft-2'

export const fieldLabelClass = 'text-base font-bold text-secondary'

export const weekdayHeaderClass = 'text-center text-sm font-extrabold text-faint-2'
