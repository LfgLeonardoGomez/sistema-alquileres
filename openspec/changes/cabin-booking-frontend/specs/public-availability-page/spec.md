# Public Availability Page Specification

## Purpose

Screens 11 and 12: the unauthenticated, shareable calendar built on the
same shared geometry as the private one, enforcing the same privacy
boundary the backend enforces (`public-availability-calendar`) a second
time, in the client, on a route tree that cannot import an authenticated
module and never sends an `Authorization` header.

## Requirements

### Requirement: No Request From This Page Ever Carries An Authorization Header

Every request issued from a page under `/disponibilidad/{slug}`, including
the availability fetch, MUST carry no `Authorization` header — even when a
valid token exists in storage from a concurrent authenticated session in the
same browser.

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

Because `GET /public/{slug}/availability` has no default `from`/`to`, the
page MUST always compute and send an explicit window matching what it is
about to render, both on initial load and on every month navigation.

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

### Requirement: The WhatsApp Button Renders Only When A Number Is Configured

The system MUST render "Escribinos por WhatsApp" only when a WhatsApp number
is configured at build time. When unset, the button MUST NOT render at all.

#### Scenario: No configured number means no button

- GIVEN no WhatsApp number is configured at build time
- WHEN the public page is rendered
- THEN "Escribinos por WhatsApp" MUST NOT be present anywhere on the page

#### Scenario: A configured number produces a working link

- GIVEN a WhatsApp number is configured at build time
- WHEN the public page is rendered
- THEN the button MUST link to that number's `wa.me` address

### Requirement: Occupied Ranges Render With No Per-Stay Identity Or Color Distinction

The public calendar MUST render every occupied range with the same neutral
treatment, carrying no stay identity, guest identity, or per-stay color
slot — unlike the private calendar's rotating pastels.

#### Scenario: Two separate occupied ranges render identically

- GIVEN two non-adjacent occupied ranges for the same cabin in the displayed window
- WHEN the public calendar is rendered
- THEN both ranges MUST render with the same neutral fill, with neither distinguishable by color from the other
