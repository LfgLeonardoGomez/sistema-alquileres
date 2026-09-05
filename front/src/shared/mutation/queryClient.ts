import { QueryClient } from '@tanstack/react-query'

// design D30's server-state conventions, applied once here rather than per
// call site: reads retry twice with backoff (she is on a phone in Mar del
// Tuyú); writes never retry -- a retried `POST /reservations` that
// actually succeeded the first time would produce a second stay, or a
// confusing `409` against itself. The frontend-foundation spec's "a write
// without connectivity fails visibly and is never queued" requirement is
// this object's `mutations.retry: false`.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      retry: false,
    },
  },
})
