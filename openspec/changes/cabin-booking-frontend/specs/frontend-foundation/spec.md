# Frontend Foundation Specification

## Purpose

The app shell that every other frontend capability sits on: the structural
boundary between the public and authenticated route trees, the single API
client through which every request passes, the split between server state
(TanStack Query) and client state (Zustand), and the rule that a write
without connectivity fails rather than queues. This capability ships no
screen; it is the substrate the screens are built on.

## Requirements

### Requirement: An Enforced Import Boundary Separates The Two Route Trees

The system MUST structurally prevent any module under the public route tree
(`src/public/**`) from importing any module under the authenticated tree
(`src/app/**`). The build MUST fail when this is violated. Both trees MAY
import from `src/shared/**`.

#### Scenario: A public module importing an app module fails the build

- GIVEN a module under `src/public/**` that imports from a module under `src/app/**`
- WHEN the project is built or linted
- THEN the build MUST fail

#### Scenario: A public module importing a shared module succeeds

- GIVEN a module under `src/public/**` that imports from `src/shared/calendar/**`
- WHEN the project is built or linted
- THEN the build MUST succeed

### Requirement: One API Client Module Issues Every Request

The system MUST route every HTTP request to the backend through a single API
client module. No component, hook, or store outside that module MAY call the
network directly.

#### Scenario: No direct network calls outside the client module

- GIVEN the application's full source tree
- WHEN source files are scanned for direct network-request calls
- THEN every such call MUST originate from the single designated API client module

### Requirement: The API Client Parses The Backend's Error Shape Into A Structured Object

The system MUST parse every non-2xx response's `{detail, code}` body into a
structured error object exposing at least `code` before it reaches any
component. When a response carries no parseable `{detail, code}` body (for
example, a network failure or a malformed response), the client MUST still
produce a structured error object carrying a generic fallback code, never an
unstructured exception surfacing raw response text to component code.

#### Scenario: A shaped error response is parsed into a structured object

- GIVEN a response with status 409 and body `{"detail": "Dates are not available", "code": "dates_unavailable"}`
- WHEN the API client handles the response
- THEN it MUST produce a structured error object whose `code` is `"dates_unavailable"`

#### Scenario: An unshaped failure still produces a structured object

- GIVEN a request that fails with a network error carrying no response body
- WHEN the API client handles the failure
- THEN it MUST produce a structured error object with a generic fallback `code`, and MUST NOT let the raw network exception reach component code unhandled

### Requirement: Server State Lives Only In The Query Cache

Properties, clients, reservations, payments, dashboard data, and public
availability data MUST be read and cached exclusively through the query
layer. No client-side store MAY hold a second copy of any such list or
record.

#### Scenario: No store mirrors a server list

- GIVEN the full set of client-side store modules
- WHEN their state shape is inspected
- THEN none of them MUST contain a properties list, a clients list, a reservations list, or a payments list

### Requirement: Exactly Two Client-Side Stores Exist

The system MUST define exactly two client-side stores outside the query
layer: the session store (token and tenant slug) and the reservation wizard
draft store (cabin, dates, guest, price mode, amount). No other store MAY be
added without removing this requirement's scope.

#### Scenario: The store module count is exactly two

- GIVEN the application's store directory
- WHEN its exported stores are enumerated
- THEN exactly two stores MUST exist, and their state keys MUST match the session and wizard-draft shapes only

### Requirement: Selected Cabin And Displayed Month Are URL State

The reservation calendar's selected cabin and displayed month MUST be read
from and written to the URL's search parameters, never a client-side store.

#### Scenario: Reloading the page preserves cabin and month selection

- GIVEN the calendar is showing `Casa Azul` for September 2026, encoded in the URL's search parameters
- WHEN the page is reloaded
- THEN the calendar MUST still show `Casa Azul` for September 2026, without reading either value from a store

### Requirement: A Write Without Connectivity Fails Visibly And Is Never Queued

When a mutating request (creating or editing a reservation, recording a
payment or refund, cancelling a reservation, creating or editing a guest or
cabin) cannot reach the network, the system MUST show the owner a message
that the action could not be saved, in the project's plain Spanish register,
and MUST NOT queue the write for automatic retry once connectivity returns.

#### Scenario: A mutation attempted offline is not queued

- GIVEN the device has no network connectivity
- WHEN the owner submits a mutating request of any kind
- THEN the system MUST show a message that the action could not be saved, and MUST NOT create any queued write that would be sent automatically once connectivity is restored

#### Scenario: Connectivity returning does not resurrect a failed write

- GIVEN a mutation failed earlier due to no connectivity
- WHEN connectivity is restored without the owner repeating the action
- THEN no request for that earlier attempt MUST be sent
