import { useSearchParams } from 'react-router'

// design D31's second small validating hook, alongside `useMonthParam.ts`
// (see that module's own comment for the shared rationale). `?cabana=` is
// a cabin's id (a UUID, `back/app/schemas/property.py`'s `PropertyRead.id`).
// An absent or malformed value falls back to `null` -- "no cabin selected
// yet" -- rather than crashing; the caller (the calendar screen) is
// responsible for defaulting to a real cabin once `useCabins()`'s list is
// in hand, which this hook has no reason to know about.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CABIN_PARAM_NAME = 'cabana'

function parseCabinIdParam(raw: string | null): string | null {
  if (raw === null || !UUID_SHAPE.test(raw)) {
    return null
  }
  return raw
}

/**
 * Reads/writes the selected cabin as the `?cabana=` URL search param.
 */
export function useCabinParam(): [string | null, (cabinId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const cabinId = parseCabinIdParam(searchParams.get(CABIN_PARAM_NAME))

  function setCabin(next: string): void {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous)
      updated.set(CABIN_PARAM_NAME, next)
      return updated
    })
  }

  return [cabinId, setCabin]
}
