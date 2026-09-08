import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'

// The tenant settings sheet's own `GET /tenant` (design D38/D39,
// `back/app/schemas/tenant.py::TenantRead`). The first frontend call site
// for this endpoint -- nothing else in this tree reads `/tenant` today.
// Narrow, hand-written response type per D35's decode-boundary convention
// (`useCabins.ts`'s own precedent), declaring only the fields this tree
// actually reads.
export type Tenant = {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly whatsapp: string | null
}

export function useTenant() {
  return useQuery({
    queryKey: keys.tenant(),
    queryFn: () => apiRequest<Tenant>('/tenant'),
  })
}
