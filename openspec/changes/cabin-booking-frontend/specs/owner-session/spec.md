# Owner Session Specification

## Purpose

Sign-in for the single owner, where the tenant slug comes from and how it
reaches the login request without ever being typed, where the token lives
across app opens, and what happens to the owner's in-progress work when an
8-hour, non-renewable token expires mid-use. Registration and password reset
are out of scope — one account already exists, and reset is deferred.

## Requirements

### Requirement: Login Requires Only Email And Password

The login screen MUST present exactly two input fields — email and password
— and MUST NOT present a tenant or slug field of any kind.

#### Scenario: The login form has no tenant field

- GIVEN the login screen is rendered
- WHEN its input fields are enumerated
- THEN exactly two fields MUST be present (email and password), and none MUST represent a tenant, slug, or workspace

### Requirement: The Tenant Slug Enters Only Through The URL, Never A Form Field

The system MUST resolve the tenant slug from the `tenant` query parameter on
the login URL when present, and MUST otherwise fall back to a build-time
default. The resolved slug MUST be sent as `tenant_slug` on the login
request without the owner ever entering or seeing it in a form.

#### Scenario: An explicit query parameter overrides the build-time default

- GIVEN the login page is opened at `/login?tenant=mar-del-tuyu-cabins`
- WHEN the owner submits correct credentials
- THEN the login request MUST carry `tenant_slug: "mar-del-tuyu-cabins"`

#### Scenario: No query parameter falls back to the build-time slug

- GIVEN the login page is opened at `/login` with no `tenant` parameter, and a build-time default slug is configured
- WHEN the owner submits correct credentials
- THEN the login request MUST carry the build-time default as `tenant_slug`

### Requirement: The Token Persists Across App Opens

On successful login, the system MUST persist the access token so that
reopening the app later, without an intervening explicit sign-out, does not
require the owner to sign in again before the token's expiry.

#### Scenario: Reopening the app with a stored, unexpired token skips login

- GIVEN a valid token was stored from an earlier successful login
- WHEN the app is opened again before the token expires
- THEN the owner MUST land on the authenticated shell directly, without seeing the login screen

### Requirement: No Password-Reset Affordance Is Rendered

The login screen MUST NOT render a "Me olvidé la contraseña" link or any
other password-reset affordance.

#### Scenario: The reset link is entirely absent, not merely disabled

- GIVEN the login screen is rendered
- WHEN its elements are enumerated
- THEN no element offering password reset MUST be present, whether enabled, disabled, or hidden-but-mounted

### Requirement: An Expired Or Invalid Token Clears The Session And Returns To Ingresar

When any authenticated request receives HTTP 401, the system MUST clear the
stored token and navigate the owner to the login screen. The message shown
MUST NOT contain the words "token", "sesión", or "expiró", or any other
technical wording — it MUST tell her, in the plain register, that she needs
to enter again.

#### Scenario: A 401 mid-use clears the stored token

- GIVEN the owner is on an authenticated screen with a token that has just expired
- WHEN a request from that screen receives HTTP 401
- THEN the system MUST clear the stored token and navigate to `/login`
- AND a subsequent page reload MUST NOT silently re-authenticate her

#### Scenario: The expiry message uses no technical wording

- GIVEN a 401 has just triggered the redirect to `/login`
- WHEN the message shown to the owner is inspected
- THEN it MUST NOT contain "token", "sesión", or "expiró"

### Requirement: The Reservation Wizard Draft Survives A 401 Mid-Wizard

A 401 occurring while the owner is on any step of the new-reservation wizard
MUST NOT discard her in-progress draft. After signing back in, she MUST
resume on the same wizard step with her prior selections intact.

#### Scenario: Signing back in resumes the wizard where it left off

- GIVEN the owner is on step 3 (huésped) of the new-reservation wizard, having already chosen a cabin and dates
- WHEN a request returns 401 and she is redirected to `/login`
- THEN after she signs in again, she MUST be returned to step 3 with the previously chosen cabin and dates still present
