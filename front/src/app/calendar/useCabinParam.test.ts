import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useCabinParam } from './useCabinParam'

// design D31's second small validating hook, alongside `useMonthParam`:
// "search params are string | null and validated by hand." `?cabana=` is a
// cabin's id (a UUID, `back/app/schemas/property.py`'s `PropertyRead.id`);
// task 4.11's own file only exercises the month hook, so this file is an
// addition beyond the task's literal text -- genuine TDD requires a
// failing test before writing this hook too, not merely bundling it into
// 4.12's GREEN unexercised.

function wrapperAt(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries: [initialPath] }, children)
  }
}

const VALID_CABIN_ID = 'a1111111-1111-1111-1111-111111111111'

describe('useCabinParam', () => {
  it('a well-formed ?cabana= UUID is read from the URL', () => {
    const { result } = renderHook(() => useCabinParam(), {
      wrapper: wrapperAt(`/calendario?cabana=${VALID_CABIN_ID}`),
    })

    const [cabinId] = result.current
    expect(cabinId).toBe(VALID_CABIN_ID)
  })

  it('a malformed ?cabana= does not crash and falls back to no selection', () => {
    const { result } = renderHook(() => useCabinParam(), { wrapper: wrapperAt('/calendario?cabana=not-a-uuid') })

    const [cabinId] = result.current
    expect(cabinId).toBeNull()
  })

  it('[TRIANGULATE] an absent ?cabana= also falls back to no selection, the same as a malformed one', () => {
    const { result } = renderHook(() => useCabinParam(), { wrapper: wrapperAt('/calendario') })

    const [cabinId] = result.current
    expect(cabinId).toBeNull()
  })
})
