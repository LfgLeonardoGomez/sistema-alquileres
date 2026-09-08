import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'
import type { Tenant } from './useTenant'

// `PATCH /tenant` (design D38/D39). `whatsapp` is the ONLY writable field
// on `TenantUpdate` (`extra="forbid"` -- the backend 422s an attempt to
// smuggle any other field in, `name` included), so this mutation's input
// carries nothing else. Sends the value AS TYPED -- no client-side
// reimplementation of the backend's `normalise_whatsapp` (digits-only,
// 8-15, country code required in practice though not by that validator
// alone) -- the API is the one authority for that shape.
//
// Invalidates ONLY `keys.tenant()`, `useRenameCabin.ts`'s own precedent:
// a WhatsApp number change touches no reservation, cabin, or client data,
// so there is no other cache entry this write could leave stale.
export type UpdateTenantInput = {
  readonly whatsapp: string
}

export function useUpdateTenant() {
  const queryClient = useQueryClient()

  return useMutation<Tenant, ApiError, UpdateTenantInput>({
    mutationFn: ({ whatsapp }) =>
      apiRequest<Tenant>('/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.tenant() })
    },
  })
}
