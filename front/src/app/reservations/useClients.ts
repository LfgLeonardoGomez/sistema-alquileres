import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'

// design D30: the guest-side twin of `useCabins.ts` -- see that module's
// own comment for the shared reasoning (include_inactive=true, one call
// site, narrow hand-written type). This is the ONE call site for
// `/clients` (task 4.10's standing regression guard).
export type Client = {
  readonly id: string
  readonly full_name: string
  readonly phone: string
  readonly email: string | null
  readonly national_id: string | null
  readonly is_active: boolean
}

export function useClients() {
  return useQuery({
    queryKey: keys.clients(),
    queryFn: () => apiRequest<Client[]>('/clients?include_inactive=true'),
  })
}
