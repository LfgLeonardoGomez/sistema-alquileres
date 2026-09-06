// design D32: "Copy lives in src/shared/copy/, split per surface... so it
// stays colocated by feature while remaining auditable in one directory."
// `routes.tsx` (the Phase 2 addendum's gap 1, task 2.32) is the one module
// allowed to reference both the public and authenticated trees, but it
// still owes the glossary scan (1.22/9.1) the same discipline as every
// other screen: no bare Spanish sentence in JSX, only a lookup from here.

export const ROUTING_COPY = {
  notFound: 'No encontramos esa página.',
} as const
