import { MutationObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '../errors/ApiError'
import { NETWORK_FAILURE_STATUS } from '../errors/normalise'
import { resolveErrorCopy } from '../errors/resolve'
import { queryClient } from './queryClient'

// design D30 / the frontend-foundation spec: "a write without connectivity
// fails visibly and is never queued". `client.ts`'s network-failure branch
// (1.24) throws the same `{status: 0, code: null}` shape a mutationFn would
// throw for a genuine offline attempt -- this test exercises that shape
// through the shared `queryClient`'s mutation defaults directly, so it
// proves the *mechanism* (no retry, a resolvable could-not-save message)
// rather than any one screen's wiring.

function runMutation(mutationFn: () => Promise<unknown>) {
  return new Promise<ReturnType<MutationObserver['getCurrentResult']>>((resolve) => {
    const observer = new MutationObserver(queryClient, { mutationFn })
    const unsubscribe = observer.subscribe((result) => {
      if (result.isError) {
        unsubscribe()
        resolve(result)
      }
    })
    observer.mutate(undefined).catch(() => undefined)
  })
}

describe('offline mutation guard', () => {
  it('does not schedule an automatic retry for a mutation that fails from no connectivity', async () => {
    const mutationFn = vi.fn().mockRejectedValue({ status: NETWORK_FAILURE_STATUS, code: null })

    const result = await runMutation(mutationFn)

    expect(mutationFn).toHaveBeenCalledTimes(1)
    expect(result.failureCount).toBe(1)
  })

  it("resolves the failed mutation's error to the could-not-save copy, in the project's plain Spanish register", async () => {
    const mutationFn = vi.fn().mockRejectedValue({ status: NETWORK_FAILURE_STATUS, code: null })

    const result = await runMutation(mutationFn)

    expect(resolveErrorCopy(result.error as unknown as ApiError)).toBe(
      'No pudimos conectar. Fijate si tenés internet y probá de nuevo.',
    )
  })

  // Triangulates against the OTHER half of D30's rule with a different
  // input entirely (the config object, not a mutation run): reads retry
  // twice with backoff, so "writes never retry" is a deliberate split, not
  // an accidental blanket `retry: false`.
  it("applies D30's split defaults: reads retry twice, writes never retry", () => {
    const defaults = queryClient.getDefaultOptions()

    expect(defaults.queries?.retry).toBe(2)
    expect(defaults.mutations?.retry).toBe(false)
  })
})
