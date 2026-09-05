import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { handlers } from './msw/handlers'

// MSW mocks at the network boundary (design D36) so behaviour tests exercise
// the real query layer, the real decoder and the real error mapping rather
// than a stubbed hook. `handlers` is empty until Phase 1's first MSW test
// adds to it.
export const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
