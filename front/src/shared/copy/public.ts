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
  // Design D32's own drafted line (shared/copy/errors.ts) reads correctly
  // here too -- no public-page-specific override is needed for this run's
  // scope, so no separate sentence is invented.
} as const
