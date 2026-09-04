# Request Logging Specification

## Purpose

Makes production failures diagnosable without exposing secrets, credentials,
or client personal data in log output. Every request is traceable end-to-end
through a single correlation identifier, and a hard redaction boundary
applies regardless of what the underlying error or database driver would
otherwise surface.

## Requirements

### Requirement: Structured Log Output

The system MUST emit log output in a structured, machine-parseable form for
each handled request.

#### Scenario: A request produces a structured log entry

- GIVEN the API is running
- WHEN a request is handled
- THEN at least one structured log entry MUST be emitted describing that
  request's handling

### Requirement: Correlation Identifier Propagates Across A Request's Lifetime

Every request MUST be associated with a correlation identifier — reused from
an inbound correlation header when present, generated otherwise — and that
identifier MUST appear on every log line emitted while handling the request
and MUST be echoed back to the caller in the response.

#### Scenario: Correlation id links every log line for one request

- GIVEN a request that triggers multiple log lines (for example, an error
  path)
- WHEN the log output for that request is inspected
- THEN every line MUST carry the same correlation identifier

#### Scenario: Correlation id is echoed to the caller

- GIVEN a request without an inbound correlation header
- WHEN the response is returned
- THEN the response MUST carry a correlation identifier
- AND that identifier MUST match the one on the request's log lines

### Requirement: Secrets And Credentials Are Never Logged

The system MUST NOT emit a log line containing `JWT_SECRET`,
`REGISTRATION_TOKEN`, the `Authorization` header value, the
`X-Registration-Token` header value, a plaintext password, a `password_hash`
value, or a full request or response body.

#### Scenario: A login attempt does not leak the submitted password

- GIVEN a `POST /auth/login` request carrying a known password value
- WHEN the request is handled, regardless of outcome
- THEN no emitted log line MUST contain that password value

#### Scenario: A registration attempt does not leak the registration token

- GIVEN a `POST /auth/register` request carrying a known
  `X-Registration-Token` value
- WHEN the request is handled, regardless of outcome
- THEN no emitted log line MUST contain that token value

### Requirement: Database Diagnostics Exclude Driver Detail Text

When a database constraint violation is handled, the system MUST log only
the SQLSTATE code and the violated constraint's name. The system MUST NOT
log the database driver's raw error detail text, because that text can embed
the offending row's data.

#### Scenario: A duplicate-phone violation does not log the phone number

- GIVEN a request that violates the `clients_tenant_phone_uq` constraint with
  a known phone number
- WHEN the resulting integrity error is handled
- THEN an emitted log line MUST record the SQLSTATE and the constraint name
- AND no emitted log line MUST contain the conflicting phone number or any
  other driver-supplied key/value detail text
