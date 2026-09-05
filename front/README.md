# front

Cabin booking frontend (`Alquileres AyA`) -- React + Vite + TypeScript,
standalone (no monorepo tooling, design D37). See
`openspec/changes/cabin-booking-frontend/design.md` for the architecture
decisions this project is built against.

## Setup

```sh
npm install
cp .env.example .env   # fill in VITE_API_BASE_URL / VITE_TENANT_SLUG -- no defaults (D37)
npm run dev
```

## Testing

```sh
npm test          # vitest run -- three TZ-scoped projects (UTC, America/Argentina/Buenos_Aires, Pacific/Kiritimati), design D26
npm run test:watch
npm run lint
```

Any date/calendar/formatting test whose result differs across the three TZ
projects is, by definition, a bug (design D26) -- the code path under test
must contain no `Date` at all.

## API types

```sh
npm run api:types   # openapi-typescript against a running backend at VITE_API_BASE_URL's host
```

`src/app/api/schema.gen.ts` is committed (design D35): the OpenAPI-generated
type layer is the only artifact crossing `back/` \<-\> `front/`, so a
contract change shows up as a reviewable diff instead of a silent `undefined`
at runtime.

**Stated gap, not claimed as solved (D35):** this generated file is only as
fresh as the last time `npm run api:types` was run against a live backend.
Nothing in this repository's CI asserts that freshness automatically --
the same honesty as `production-readiness`'s un-automated image-inspection
gap (D19). Re-run the script and commit the diff whenever the backend's
OpenAPI contract changes.
