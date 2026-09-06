// design D30: "One typed factory in app/api/queries/keys.ts. No key literal
// anywhere else." Query keys are the array TanStack Query hashes for cache
// storage, matching, and invalidation -- one shared source keeps a typo in
// a key literal from silently creating a second, un-invalidated cache
// entry for the same resource.
//
// `reservations()`/`dashboard()`/`reservation(id)` are the invalidation
// targets D30's own table names explicitly ("Any reservation or payment
// mutation invalidates `reservations`, `dashboard`, and the affected
// `reservation(id)`"). `cabins()`/`clients()` back the lookup hooks
// (task 4.9) -- every consumer of a cabin or client list goes through
// `useCabins()`/`useClients()`, which call these, never a literal array.
//
// `reservationsByCabin(cabinId)` (task 4.14's own incidental plumbing --
// the reservation calendar screen needs the property's COMPLETE per-cabin
// stay list, D28's own requirement, filtered server-side by `property_id`)
// is namespaced UNDER the bare `reservations()` key -- `['reservations',
// 'cabin', cabinId]` -- rather than a sibling literal, so a later phase's
// `queryClient.invalidateQueries({ queryKey: keys.reservations() })` (D30's
// invalidation table) still matches every per-cabin cache entry by prefix,
// exactly as TanStack Query's own partial-key matching is designed to work.
export const keys = {
  reservations: () => ['reservations'] as const,
  reservationsByCabin: (cabinId: string) => ['reservations', 'cabin', cabinId] as const,
  reservation: (id: string) => ['reservation', id] as const,
  dashboard: () => ['dashboard'] as const,
  cabins: () => ['cabins'] as const,
  clients: () => ['clients'] as const,
}
