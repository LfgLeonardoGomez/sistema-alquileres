Design the screens for a cabin rental management app.

## Who this is for

ONE person per account: the owner of two rental cabins in Mar del Tuyú, on the
Argentine coast. She is not technical, she is not young, and she runs this from
her phone. She is not a hotel and she is not a business with staff — she is one
person keeping track of who is staying when, and who still owes her money.

Design for her, not for a booking platform. Every decision should be judged by
whether she could use it without being taught.

## The workflow that actually happens

Guests find her by word of mouth and message her on WhatsApp. She agrees the
dates and the price there, in conversation. Then she opens this app and writes
it down.

**This is a ledger, not a booking engine.** Nobody books through it. There is no
checkout, no payment processing, no confirmation emails. She is recording
decisions she already made, often days later, sometimes for stays that already
happened.

The one exception is a public availability calendar she can share as a link, so
people can see which dates are free before messaging her.

## Screens to design

1. **Sign in** — she has one account. Email and password.
2. **Home** — this month at a glance: how much she collected, how full the
   cabins were, and what is coming up. Plus the primary action, which is
   recording a new reservation.
3. **Reservation calendar** — a month view per cabin showing which nights are
   taken. This is likely the screen she opens most.
4. **New / edit reservation** — pick the cabin, the guest, the dates, the price.
5. **Reservation detail** — the stay, what has been paid, what is still owed,
   and the actions: record a payment, record a refund, cancel.
6. **Cabins** — her two properties. Add, rename, deactivate.
7. **Guests** — people who have stayed. Search, add, edit, see someone's history.
8. **Public availability calendar** — the shareable link. A different audience
   entirely: strangers deciding whether to message her.

## Domain rules that must shape the design

These are enforced by the backend. The interface should make them feel natural
rather than surface them as errors.

- **Two stays cannot overlap on the same cabin.** The server rejects it. So the
  interface must show her what is already taken *before* she picks dates — never
  let her fill in a form and then tell her no.
- **Adjacent stays are fine.** Someone checking in the same day someone else
  checks out is normal and allowed. The calendar should not make that look like
  a conflict.
- **A stay is between 1 and 60 nights.**
- **Dates in the past are allowed and normal.** She records stays after they
  happen. Never block a past date, never warn about one.
- **Price is entered one of two ways, never both**: a price per night, or a
  single total for the whole stay. The total is calculated when she enters a
  nightly rate. Extending the dates rescales a nightly price and leaves a
  stay-total price alone.
- **Payments arrive in pieces.** A deposit, then the balance, sometimes more.
  They accumulate. Money returned is recorded too. What she owes or is owed is
  the total minus what has been paid — and it can go negative if a guest
  overpaid, which must read as "she owes them money", not as an error.
- **Guests are identified by phone number.** Entering a number that already
  exists brings up that guest rather than creating a duplicate.
- **Nothing is ever deleted.** A cabin or a guest is deactivated. Their history
  stays intact and visible.
- **A stay is "finished" once its checkout date has passed.** Nobody marks it.
- **A cancelled stay frees its nights immediately** for someone else.

## The public calendar is a privacy boundary

It shows the cabin name and which date ranges are occupied. That is all.

No guest names, no phone numbers, no prices, no payment information, no hint of
who is staying. Someone opening that link learns only which nights are free.
Design it as a page a stranger sees, because that is what it is.

## What "simple" has to mean concretely

Do not interpret these as adjectives. They are constraints:

- **One primary action per screen.** Recording a reservation should be reachable
  in one tap from home.
- **Show availability before asking for dates**, not after rejecting them.
- **No technical language, ever.** Not "409", not "conflict", not "validation
  error", not "tenant", not "record". If dates are taken, the screen says the
  cabin is occupied those nights and shows which ones are free.
- **Money in Argentine pesos**, formatted the way she reads it. Dates as
  day/month. Never ISO format, never American ordering.
- **Large tap targets and genuinely readable type.** Assume reading glasses.
- **Nothing hidden behind a hamburger that she needs daily.**
- **No dashboard for its own sake.** Two numbers she cares about — money
  collected and how full the cabins are — not a wall of charts.
- **Empty states that tell her what to do**, not blank panels.

## Language

**All interface copy in Spanish**, in a plain, everyday register — the way a
person speaks, not the way software does. Use these exact terms:

| Concept | Use | Never |
|---|---|---|
| Property | Cabaña | Propiedad, Unidad |
| Client | Huésped | Cliente, Usuario |
| Reservation | Reserva | Booking |
| Check-in / check-out | Entrada / Salida | Check-in, Check-out |
| Nights | Noches | |
| Price per night | Precio por noche | Tarifa |
| Total for the stay | Total de la estadía | |
| Payment | Pago | Transacción |
| Refund | Devolución | Reembolso |
| Outstanding | Saldo | Balance, Deuda |
| Deactivate | Desactivar | Eliminar, Borrar |
| Occupied nights | Noches ocupadas | |
| Collected | Cobrado | Ingresos, Facturación |

## Format

Mobile-first: she uses her phone. It should still work on a laptop, but the
phone layout is the real design, not a narrowed-down desktop one.

The public calendar is the exception — design it for both, since guests will
open the link on anything.

## What not to do

- No onboarding flow, no tour, no tooltips explaining the obvious.
- No settings screen. There is nothing to configure.
- No notifications, no badges, no activity feed.
- No search where two cabins fit on one screen.
- No pricing rules, seasons, discounts, taxes or fees. She types a number.
- No multi-user anything: no roles, no permissions, no team, no invitations.
- No booking flow for guests. They message her. That is the product.
