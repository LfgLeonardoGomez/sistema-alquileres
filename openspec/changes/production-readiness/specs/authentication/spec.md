# Delta for Authentication

## ADDED Requirements

### Requirement: Rate Limiting On Login And Registration

The system MUST limit the rate of requests to `POST /auth/login` and
`POST /auth/register` per caller. When a caller exceeds the configured
attempt budget, the system MUST reject further attempts with HTTP 429 and a
`Retry-After` header, until the budget resets. The rate-limiting response
MUST depend only on request volume from the caller — it MUST NOT depend on
whether the submitted account exists. A limiter that responds differently
for an existing account than for a non-existent one reintroduces the
enumeration oracle that the existing single-generic-401 requirement was
built to remove, and is therefore a violation of this requirement, not a
tradeoff of it.

#### Scenario: Exceeding the login attempt budget returns 429

- GIVEN a caller has exhausted the configured login attempt budget
- WHEN the caller submits another `POST /auth/login` request
- THEN the system MUST respond with HTTP 429
- AND the response MUST include a `Retry-After` header

#### Scenario: Exceeding the registration attempt budget returns 429

- GIVEN a caller has exhausted the configured registration attempt budget
- WHEN the caller submits another `POST /auth/register` request
- THEN the system MUST respond with HTTP 429
- AND the response MUST include a `Retry-After` header

#### Scenario: The 429 response is not an account-existence oracle

- GIVEN two callers who have each exhausted the login attempt budget — one
  submitting credentials for an existing account, the other submitting a
  tenant slug/email combination that does not exist
- WHEN each submits another `POST /auth/login` request
- THEN both MUST receive an identical HTTP 429 response, indistinguishable
  by status, body, or headers as to whether the account exists

#### Scenario: A caller below the budget still receives the existing generic 401

- GIVEN a caller has not exceeded the attempt budget
- WHEN the caller submits incorrect credentials to `POST /auth/login`
- THEN the system MUST continue to respond with the existing single generic
  HTTP 401, unchanged by the presence of rate limiting
