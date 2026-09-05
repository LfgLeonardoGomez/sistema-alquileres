# Delta for Client Management

## MODIFIED Requirements

### Requirement: Active Filter on Search, Not on Historical Reads

Client list and search endpoints MUST exclude inactive clients by default. Endpoints that resolve a client through a historical reservation MUST NOT apply the active filter. Resolving an inactive client's name and contact fields from a reservation MUST happen through a separate, explicit `GET /clients/{id}` call — which does not apply the active filter — never through client fields embedded in the reservation response itself, which carries only `client_id`.

(Previously: the scenario below stated that "the client's name and contact fields MUST still be returned" without naming the mechanism, which read ambiguously as either the reservation response embedding those fields, or `GET /clients/{id}` simply not filtering on active status. The wording now names the second, matching what the code implements.)

#### Scenario: Inactive client excluded from listing

- GIVEN a soft-deleted client
- WHEN the owner lists or searches clients
- THEN the inactive client MUST NOT appear in the results

#### Scenario: Inactive client still resolves through a direct lookup, not through the reservation response

- GIVEN a soft-deleted client with a past reservation
- WHEN the owner reads that reservation and then calls `GET /clients/{id}` for the client id it carries
- THEN the reservation response MUST carry only the client's `id`, and the client's name and contact fields MUST come from the `GET /clients/{id}` response, which MUST return them despite the client being inactive
