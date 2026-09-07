// Design handoff, screen 03: "Occupied nights render as a horizontal bar
// behind the day number, inset 5px top/bottom: first night rounded on the
// left, last night rounded on the right, middle nights full-bleed... when a
// checkout and a check-in fall on the same day, that cell shows two half
// bars." This is the GEOMETRY half of that rule only -- no colour. Legal in
// both route trees (`shared/ui`, not `shared/calendar`): it consumes
// `shared/calendar/segments.ts`'s own `SegmentKind` vocabulary but adds no
// domain meaning, the same "knows no colour" boundary D28 draws for the
// segmentation core itself.

export type DayBarKind = 'start' | 'middle' | 'end' | 'single' | 'closingHalf' | 'openingHalf'

const BASE = 'absolute inset-y-[5px]'

export function dayBarClass(kind: DayBarKind): string {
  switch (kind) {
    case 'start':
      return `${BASE} left-1.5 right-0 rounded-l-pill`
    case 'end':
      return `${BASE} left-0 right-1.5 rounded-r-pill`
    case 'single':
      return `${BASE} left-1.5 right-1.5 rounded-pill`
    case 'closingHalf':
      return `${BASE} left-0 right-1/2 rounded-r-pill`
    case 'openingHalf':
      return `${BASE} left-1/2 right-0`
    case 'middle':
    default:
      return `${BASE} left-0 right-0`
  }
}

export function dayNumberClass(onBar: boolean, white = false): string {
  const weight = onBar ? 'font-extrabold' : 'font-semibold'
  const color = white ? 'text-white' : onBar ? 'text-[#4A4B60]' : 'text-primary'
  return `relative text-lg ${weight} ${color}`
}
