// design D32: "Copy lives in src/shared/copy/, split per surface... so it
// stays colocated by feature while remaining auditable in one directory."
// This is the public availability page's own surface file, picked up
// automatically by the glossary scan (1.22/9.1) via its `shared/copy/**`
// glob -- no per-file registration to forget.
//
// Recorded tradeoff, not silently done: `MONTH_NAMES` duplicates the same
// twelve Spanish month names already private to `shared/date/format.ts`
// (`formatDateRange`'s internal `SPANISH_MONTHS`). That module is one of
// Phase 1's committed primitives and this run was instructed not to modify
// anything under `shared/` outside a new copy file, so the name is not
// exported from there for reuse. Duplicating twelve literal strings here is
// the smaller cost against touching a load-bearing file for an export it
// was never asked to expose.

export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

export const PUBLIC_COPY = {
  // Screen 11's own literal heading, lifted verbatim: "Alquileres AyA" +
  // "Mar del Tuyú · noches libres".
  title: 'Alquileres AyA',
  subtitle: 'Mar del Tuyú · noches libres',
  filterLabel: 'Elegí una cabaña',
  bothCabins: 'Las dos',
  previousMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  previousMonthGlyph: '‹',
  nextMonthGlyph: '›',
  legendFree: 'Libre',
  legendOccupied: 'Ocupado',
  whatsappButton: 'Escribinos por WhatsApp',
  loading: 'Cargando disponibilidad…',
  // Screen 11/12's own "Las casas" section heading. The tiles below it are
  // no longer named by fixed copy keys -- see `cabinPhotoLabel` below.
  housesTitle: 'Las casas',
  // Design D32's own drafted line (shared/copy/errors.ts) reads correctly
  // here too -- no public-page-specific override is needed for this run's
  // scope, so no separate sentence is invented.
} as const

/**
 * One photo tile's label per the tenant's own cabin. Generalises the
 * handoff's two literal labels ("foto casa azul", "foto dos aguas" -- one
 * tenant's own cabin names, frozen into copy) into a template every
 * tenant's own cabin list can share: this function has no idea which
 * tenant's `name` it was called with, or how many cabins that tenant has.
 * The tiles themselves stay striped placeholders per the handoff's one
 * documented fidelity exception (no photo asset ships with this change).
 */
export function cabinPhotoLabel(cabinName: string): string {
  return `foto ${cabinName.toLowerCase()}`
}
