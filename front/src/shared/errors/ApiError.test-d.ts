import type { ApiError } from './ApiError'

// design D32: the structural move is subtraction. `detail` is English prose
// written for API consumers and must never reach a screen -- it is parsed,
// logged for a developer, and discarded before an `ApiError` is built, so
// there is no field on the type for it to hide in. This is a type-level
// test (D36's Types layer): checked by `tsc -b`, not by `vitest run` --
// Vitest does not execute `*.test-d.ts` files unless run with `--typecheck`.

declare const error: ApiError

// @ts-expect-error -- `detail` does not exist on `ApiError`, structurally.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- the bare property access IS the assertion `@ts-expect-error` targets.
error.detail

// Sanity check the fields that DO exist, so a future refactor that widens
// `ApiError` in an unrelated way (and happens to also add `detail`) still
// trips the `@ts-expect-error` above rather than this file silently
// type-checking for the wrong reason.
const _status: number = error.status
const _code: string | null = error.code
void _status
void _code
