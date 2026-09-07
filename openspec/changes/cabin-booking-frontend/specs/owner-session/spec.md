# Owner Session Specification

## Purpose

Sign-in for the single owner, where the tenant slug comes from and how it
reaches the login request without ever being typed, where the token lives
across app opens, and what happens to the owner's in-progress work when an
8-hour, non-renewable token expires mid-use. Registration and password reset
are out of scope — one account already exists, and reset is deferred.

## ADDED Requirements

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

A 401 occurring while the owner is on any step of the new-reservation wizard MUST NOT discard her in-progress draft. After signing back in, she MUST resume on the same wizard step with her prior selections intact.

#### Scenario: Signing back in resumes the wizard where it left off

- GIVEN the owner is on step 3 (huésped) of the new-reservation wizard, having already chosen a cabin and dates
- WHEN a request returns 401 and she is redirected to `/login`
- THEN after she signs in again, she MUST be returned to step 3 with the previously chosen cabin and dates still present

### Requirement: A Successful Sign-In Leaves The Sign-In Screen

On a successful sign-in the system MUST navigate the owner off `/login` to
an authenticated screen, and MUST replace the `/login` history entry rather
than push over it, so the browser's back button does not return her to a
form she has already completed. A sign-in the API rejects MUST NOT navigate
anywhere.

#### Scenario: A sign-in with no recorded origin lands on Inicio

- GIVEN the owner is on `/login` and the navigation that brought her there recorded no origin
- WHEN she submits credentials the API accepts
- THEN she MUST be taken to `/inicio`
- AND the sign-in form MUST no longer be rendered

#### Scenario: A sign-in with a recorded origin returns to that origin

- GIVEN the owner reached `/login` from `/reserva/nueva/3` and that path was recorded on the navigation
- WHEN she submits credentials the API accepts
- THEN she MUST be taken to `/reserva/nueva/3`, and MUST NOT be taken to `/inicio`

#### Scenario: The back button does not return her to the completed form

- GIVEN the owner has just signed in successfully and been taken to an authenticated screen
- WHEN she presses the browser's back button
- THEN she MUST NOT land on the sign-in form she just completed

#### Scenario: A rejected sign-in navigates nowhere

- GIVEN the owner is on `/login`
- WHEN she submits credentials the API rejects
- THEN she MUST remain on the sign-in form
- AND she MUST NOT be taken to `/inicio` or to any recorded origin

### Requirement: A Recorded Origin That Is Not An In-App Path Is Discarded

A recorded origin MUST be honoured only when it is a path inside this app.
Any other value MUST be discarded and `/inicio` used instead — including an
absolute URL, a protocol-relative or backslash-prefixed path, a value
carrying a scheme, an empty value, and `/login` itself.

#### Scenario: An off-origin recorded origin is discarded

- GIVEN the navigation to `/login` recorded an origin that points off this app, such as `//example.invalid/x`, `https://example.invalid/x`, or `javascript:alert(1)`
- WHEN the owner signs in successfully
- THEN she MUST be taken to `/inicio`, and the browser MUST NOT be sent to the recorded value

#### Scenario: A recorded origin of the sign-in screen itself is discarded

- GIVEN the navigation to `/login` recorded `/login` as its origin
- WHEN the owner signs in successfully
- THEN she MUST be taken to `/inicio`, and MUST NOT be returned to the sign-in form

### Requirement: An Unauthenticated Visitor Never Renders An Authenticated Screen

A visitor holding no session MUST be sent to `/login` on requesting any
route in the authenticated tree, without any part of the requested screen
being rendered, and the requested path MUST be recorded as the origin to
return to after signing in. The public availability page and the not-found
screen MUST NOT be guarded.

#### Scenario: Requesting an authenticated URL with no session renders none of that screen

- GIVEN no session is held
- WHEN `/inicio` is requested directly by URL
- THEN the visitor MUST end on `/login`
- AND no content belonging to the Inicio screen MUST be rendered at any point during that navigation

#### Scenario: Every authenticated route is guarded, not only the home screen

- GIVEN no session is held
- WHEN each of `/calendario`, `/huespedes`, `/cabanas`, `/reserva/nueva/1`, `/reserva/{id}` and `/reserva/{id}/editar` is requested directly by URL
- THEN each request MUST end on `/login` with none of the requested screen's content rendered

#### Scenario: The attempted path survives the round trip

- GIVEN no session is held and `/reserva/nueva/3` was requested directly by URL
- WHEN the visitor is sent to `/login` and then signs in successfully
- THEN she MUST be taken to `/reserva/nueva/3`, and MUST NOT be taken to `/inicio`

#### Scenario: The public availability page is never guarded

- GIVEN no session is held
- WHEN `/disponibilidad/{slug}` is requested
- THEN the public availability page MUST render, and the visitor MUST NOT be sent to `/login`

#### Scenario: The not-found screen is never guarded

- GIVEN no session is held
- WHEN a URL matching no route is requested
- THEN the not-found screen MUST render, and the visitor MUST NOT be sent to `/login`

#### Scenario: A stored, unexpired token is never treated as absent on first paint

- GIVEN a valid, unexpired token was stored from an earlier successful sign-in
- WHEN `/inicio` is opened directly, as a fresh app start
- THEN the Inicio screen MUST render
- AND the owner MUST NOT be sent to `/login` at any point during that first paint

### Requirement: An Authenticated Visitor Is Not Shown The Sign-In Screen

While a valid, unexpired token is held, requesting `/login` MUST take the
owner to `/inicio` without rendering the sign-in form. A session that has
been cleared MUST still reach the form, with its own message intact.

#### Scenario: Opening the sign-in URL with a stored, unexpired token lands on Inicio

- GIVEN a valid, unexpired token was stored from an earlier successful sign-in
- WHEN `/login` is opened — by bookmark, by typing it, or by the browser restoring the tab
- THEN the owner MUST be taken to `/inicio`
- AND the sign-in form MUST NOT be rendered at any point

#### Scenario: A session cleared by a 401 still reaches the form and its message

- GIVEN a 401 has just cleared the stored token and navigated to `/login`
- WHEN the login screen renders
- THEN the sign-in form MUST be present
- AND the message that she needs to enter again MUST still be shown above it

### Requirement: The Owner Can Sign Out From Inside The App

The authenticated shell MUST offer a sign-out affordance the owner can reach
without leaving the app, and using it MUST clear the stored token, discard
any in-progress reservation draft, and land her on `/login`. The affordance
MUST NOT displace or hide any action already promised on the screen that
carries it.

#### Scenario: The sign-out affordance is reachable from the home screen

- GIVEN the owner holds a valid session and is on the home screen
- WHEN the screen's actions are enumerated
- THEN a sign-out affordance MUST be present, without opening a menu, a drawer, or a further screen

#### Scenario: Signing out clears the stored token

- GIVEN the owner holds a valid session
- WHEN she signs out
- THEN the stored token MUST be cleared from both memory and storage
- AND reopening the app afterwards MUST show her the sign-in screen rather than silently re-authenticating her

#### Scenario: Signing out discards an in-progress reservation draft

- GIVEN the owner has a reservation draft in progress holding a cabin, dates, and a guest's name and phone
- WHEN she signs out
- THEN that draft MUST be discarded, and a later sign-in MUST NOT surface any part of it

#### Scenario: Signing out lands on the sign-in screen

- GIVEN the owner holds a valid session on any authenticated screen
- WHEN she signs out
- THEN she MUST end on `/login` with the sign-in form rendered

#### Scenario: The primary "Anotar una reserva" action is not displaced

- GIVEN the home screen carries the sign-out affordance
- WHEN screen 02 is rendered
- THEN "Anotar una reserva" MUST still be present and MUST still navigate to step 1 of the wizard

### Requirement: A Deliberate Sign-Out Is Not Presented As An Expired Session

Signing out MUST NOT show the owner the message reserved for a session that
expired underneath her, and MUST NOT record an origin to return to — she
left on purpose, from a screen she chose to leave. The session MUST be
cleared before the navigation, so the redirect that keeps an authenticated
visitor off the sign-in screen cannot send her back in.

#### Scenario: Signing out shows no expiry message

- GIVEN the owner signs out deliberately
- WHEN the sign-in screen renders
- THEN the message telling her to enter again MUST NOT be shown
- AND the sign-in form MUST be rendered on its own, exactly as on a plain visit to `/login`

#### Scenario: Signing out records no origin to return to

- GIVEN the owner signs out from `/reserva/42`
- WHEN she later signs in again successfully
- THEN she MUST land on `/inicio`, and MUST NOT be returned to `/reserva/42`

#### Scenario: The session is cleared before the navigation, not after

- GIVEN the owner holds a valid session and signs out
- WHEN the sign-in screen renders
- THEN she MUST remain on it
- AND the redirect that takes an authenticated visitor away from `/login` MUST NOT return her to an authenticated screen
