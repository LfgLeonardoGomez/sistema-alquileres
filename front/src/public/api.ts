import { env } from '../env'
import { parsePlainDate, type PlainDate } from '../shared/date/parsePlainDate'
import { NETWORK_FAILURE_STATUS, normalise } from '../shared/errors/normalise'

// design D25/D31 point 1: this is the public route tree's OWN fetch,
// structurally separate from `app/api/client.ts` (1.24) -- and that is the
// whole point. Its signature below has NO parameter that could carry a
// token, anywhere: not an options bag, not an optional field, nothing. A
// parameter that could carry a token is a parameter someone eventually
// passes one to; the header cannot be attached by mistake because the code
// that knows how to attach it (`app/api/client.ts`) is unreachable from
// `src/public/**` (`import/no-restricted-paths`, 0.5/1.28, extended by 2.30
// for this real file). This is also the network boundary's (1.25) second,
// DELIBERATE call site -- `src/test/networkBoundary.test.ts`'s allowlist is
// extended for exactly this file, on purpose, not loosened.
//
// design D32: "shared/errors/ ... the public tree needs its own failure
// copy" -- read as reusing the shared normaliser/resolver, not writing a
// second one. No `detail` ever reaches this module's return value or a
// caller, the same structural subtraction as `app/api/client.ts`.

export type PublicOccupiedRange = { readonly checkIn: PlainDate; readonly checkOut: PlainDate }

export type PublicAvailability = {
  readonly propertyId: string
  readonly name: string
  readonly occupied: readonly PublicOccupiedRange[]
}

type RawOccupiedRange = { readonly check_in: string; readonly check_out: string }
type RawPublicAvailability = { readonly property_id: string; readonly name: string; readonly occupied: readonly RawOccupiedRange[] }

function decode(raw: RawPublicAvailability): PublicAvailability {
  return {
    propertyId: raw.property_id,
    name: raw.name,
    occupied: raw.occupied.map((range) => ({
      checkIn: parsePlainDate(range.check_in),
      checkOut: parsePlainDate(range.check_out),
    })),
  }
}

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/**
 * Fetches `GET /public/{slug}/availability` for an explicit window (the
 * endpoint has no default `from`/`to` -- see `back/app/api/routers/public.py`
 * and task 2.20/2.21). Every non-2xx response and every thrown network
 * failure routes through `normalise()` and is thrown, matching
 * `app/api/client.ts`'s own contract -- never a raw `Response`, never an
 * unhandled rejection.
 */
export async function getPublicAvailability(
  slug: string,
  window: { readonly from: PlainDate; readonly to: PlainDate },
): Promise<PublicAvailability[]> {
  const params = new URLSearchParams({ from: window.from, to: window.to })

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}/public/${slug}/availability?${params.toString()}`)
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw normalise(NETWORK_FAILURE_STATUS, undefined)
    }
    throw cause
  }

  if (!response.ok) {
    throw normalise(response.status, await parseJsonBody(response))
  }

  const body = (await response.json()) as RawPublicAvailability[]
  return body.map(decode)
}

// design D37 (corrected) + the Phase 2 addendum's gap 2: the WhatsApp
// number is per-tenant and comes from the API, never a build-time global
// (one build serves every slug, so a build-time number would be the same
// number on every tenant's page). Same shape as `getPublicAvailability`
// above: its own fetch, no token parameter anywhere in its signature, and
// every failure routes through the shared `normalise()`.
export type PublicContact = {
  readonly name: string
  readonly whatsapp: string | null
}

/**
 * Fetches `GET /public/{slug}/contact` (`back/app/schemas/public.py`'s
 * `PublicContact`). The raw body already matches this module's own
 * `PublicContact` shape field-for-field -- no date/money brand to decode,
 * unlike `getPublicAvailability` -- so it is returned as-is once its shape
 * is asserted at the type boundary.
 */
export async function getPublicContact(slug: string): Promise<PublicContact> {
  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}/public/${slug}/contact`)
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw normalise(NETWORK_FAILURE_STATUS, undefined)
    }
    throw cause
  }

  if (!response.ok) {
    throw normalise(response.status, await parseJsonBody(response))
  }

  return (await response.json()) as PublicContact
}
