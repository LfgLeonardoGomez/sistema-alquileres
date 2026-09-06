# Public Availability Page Specification

## Purpose

Screens 11 and 12: the unauthenticated, shareable calendar built on the
same shared geometry as the private one, enforcing the same privacy
boundary the backend enforces (`public-availability-calendar`) a second
time, in the client, on a route tree that cannot import an authenticated
module and never sends an `Authorization` header.

## ADDED Requirements

### Requirement: No Request From This Page Ever Carries An Authorization Header

Every request issued from a page under `/disponibilidad/{slug}`, including the availability fetch, MUST carry no `Authorization` header — even when a valid token exists in storage from a concurrent authenticated session in the same browser.

#### Scenario: A logged-in owner's token is not attached to the public fetch

- GIVEN a valid token is present in storage from an active authenticated session
- WHEN the owner (or anyone) opens `/disponibilidad/mar-del-tuyu-cabins`
- THEN the availability request MUST NOT carry an `Authorization` header

### Requirement: The Rendered DOM Contains No Private Data

The rendered public page MUST contain no guest name, phone number, price, or
payment amount anywhere in its DOM, including attributes and comments, even
when such data exists for the tenant behind the requested slug.

#### Scenario: Seeded private data never appears in the rendered output

- GIVEN a reservation behind the requested slug carries a distinctive guest name, phone number, and price, seeded via a mocked response
- WHEN the public page is rendered
- THEN none of those distinctive strings MUST appear anywhere in the rendered DOM

### Requirement: The Availability Request Always Supplies An Explicit Window

Because `GET /public/{slug}/availability` has no default `from`/`to`, the page MUST always compute and send an explicit window matching what it is about to render, both on initial load and on every month navigation.

#### Scenario: Initial load always includes both window parameters

- WHEN the public page is opened for the first time
- THEN its first request to the availability endpoint MUST include both `from` and `to`

#### Scenario: Navigating months issues a request for the new window

- GIVEN the public page is showing September 2026
- WHEN the owner (or a prospect) navigates to October 2026
- THEN a new request MUST be sent with `from`/`to` matching October 2026

### Requirement: The Cabin Filter Narrows The Display Without An Extra Request

Selecting `Casa Azul`, `Dos Aguas`, or `Las dos` MUST change which
already-fetched cabin(s) are displayed and MUST NOT trigger a new network
request, since the endpoint already returns all active properties for the
requested window in one call.

#### Scenario: Selecting a single cabin issues no new request

- GIVEN the availability response for the current window has already been fetched
- WHEN the owner selects `Casa Azul` from the filter
- THEN no new request MUST be sent, and only Casa Azul's calendar MUST be shown

### Requirement: The WhatsApp Button Renders Only When That Tenant Has Set A Number

The system MUST render "Escribinos por WhatsApp" only when the tenant whose slug the page was opened with has a contact number set, and MUST take that number from `GET /public/{slug}/contact`. When the tenant has none set, the button MUST NOT render at all.

The number MUST NOT come from a build-time value. One build serves every tenant slug, so a build-time number is the same number on every tenant's page: the first tenant to onboard without their own number would publish somebody else's, and a prospect would write to a stranger about a cabin that stranger does not own. For the same reason there MUST be no build-time fallback for a tenant whose number is unset — falling back reintroduces exactly that failure on the path where it is least likely to be noticed. An unset number MUST produce no button, which is a correct and complete answer.

#### Scenario: A tenant with no number set shows no button

- GIVEN the contact endpoint reports `whatsapp: null` for the requested slug
- WHEN the public page is rendered
- THEN "Escribinos por WhatsApp" MUST NOT be present anywhere on the page

#### Scenario: A tenant's own number produces a working link

- GIVEN the contact endpoint reports a number for the requested slug
- WHEN the public page is rendered
- THEN the button MUST link to that number's `wa.me` address

#### Scenario: Two tenants do not share a number

- GIVEN two slugs whose contact endpoints report different numbers
- WHEN each tenant's public page is rendered from the same build
- THEN each page MUST show its own tenant's number, and neither MUST show the other's

### Requirement: Occupied Ranges Render With No Per-Stay Identity Or Color Distinction

The public calendar MUST render every occupied range with the same neutral
treatment, carrying no stay identity, guest identity, or per-stay color
slot — unlike the private calendar's rotating pastels.

#### Scenario: Two separate occupied ranges render identically

- GIVEN two non-adjacent occupied ranges for the same cabin in the displayed window
- WHEN the public calendar is rendered
- THEN both ranges MUST render with the same neutral fill, with neither distinguishable by color from the other
