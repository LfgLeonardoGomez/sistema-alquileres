# CORS Policy Specification

## Purpose

Controls which browser origins may call the API. Origins are explicit,
server-side configuration, never inferred and never wildcarded — a wildcard
origin on a route reachable from a browser would let any website script
requests against it.

## Requirements

### Requirement: Allowed Origins Are Explicit Configuration

The system MUST determine which browser origins may access owner-scoped
routes from an explicit, server-side configured allow-list. The system MUST
NOT accept a wildcard (`*`) as a configured origin for those routes.

#### Scenario: Request from a configured origin succeeds

- GIVEN an origin is present in the configured allow-list
- WHEN a browser sends a CORS preflight and request from that origin to an
  owner-scoped route
- THEN the response MUST include CORS headers permitting that origin

#### Scenario: Request from an unconfigured origin is refused

- GIVEN an origin is absent from the configured allow-list
- WHEN a browser sends a CORS preflight from that origin to an owner-scoped
  route
- THEN the response MUST NOT grant that origin access

#### Scenario: Wildcard configuration cannot grant access

- GIVEN an operator configures the allowed-origins setting to `*` or an
  otherwise unbounded value
- WHEN a browser request from any origin is evaluated against owner-scoped
  routes
- THEN the system MUST NOT treat this as "allow any origin"

### Requirement: Required Request Headers Survive Preflight

The system's CORS configuration MUST permit the custom headers the API
consumes on cross-origin requests — at minimum the registration token header
and the request-correlation header — so a browser-originated call using them
is not blocked purely by CORS header rejection.

#### Scenario: Registration header allowed cross-origin

- GIVEN a configured origin
- WHEN a browser preflights a `POST /auth/register` request that will carry
  `X-Registration-Token`
- THEN the preflight response MUST allow that header

### Requirement: Public Availability Endpoint May Use An Independent Origin Policy

The public availability endpoint's CORS origin policy MAY be configured
independently from the owner-scoped routes' policy, since it is read-only
and unauthenticated. Both policies MUST still be explicit configuration and
MUST NOT use a wildcard.

#### Scenario: Public endpoint origin policy differs from the owner-scoped policy

- GIVEN the public availability endpoint's origin allow-list is configured
  more broadly than the owner-scoped routes' allow-list
- WHEN a browser from an origin present in the public list, but not in the
  owner-scoped list, calls the public availability endpoint
- THEN the call MUST succeed
- AND the same origin calling an owner-scoped route MUST still be refused if
  it is absent from that route's allow-list
