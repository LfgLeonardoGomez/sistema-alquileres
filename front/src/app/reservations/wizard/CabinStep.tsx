import { useCabins } from '../useCabins'

// task 5.4/5.5, `reservation-recording` spec "Only Active Cabins Are
// Offered On The Cabin Step". `useCabins()` fetches `include_inactive=true`
// (D30) because a deactivated cabin's past stays must still resolve a
// name elsewhere -- filtering back down to `is_active` for a NEW
// reservation is THIS step's own responsibility, not the hook's.

type Props = {
  readonly onSelected: (cabin: { readonly id: string; readonly name: string }) => void
}

export function CabinStep({ onSelected }: Props) {
  const cabins = useCabins()
  const activeCabins = (cabins.data ?? []).filter((cabin) => cabin.is_active)

  return (
    <div>
      {activeCabins.map((cabin) => (
        <button key={cabin.id} type="button" onClick={() => onSelected({ id: cabin.id, name: cabin.name })}>
          {cabin.name}
        </button>
      ))}
    </div>
  )
}
