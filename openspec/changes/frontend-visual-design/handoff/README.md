# Handoff: Alquileres AyA — app de reservas de cabañas

## Overview
Single-owner ledger app for two rental cabins in Mar del Tuyú (Argentina). One user (Ana) records reservations she already agreed over WhatsApp, tracks payments and outstanding balance, and shares a public availability page. There is no booking flow, no checkout, no multi-user.

All interface copy is **Spanish**, plain everyday register. Money in Argentine pesos (`$ 180.000`, dot thousands separator, no decimals). Dates day/month (`3/9`) or `3 al 7 de septiembre`. Never ISO, never American order.

## About the Design Files
`Alquileres AyA.dc.html` is a **design reference created in HTML** — a static prototype of every screen, laid out side by side inside drawn iPhone frames. It is not production code. Recreate these screens in the target codebase using its existing framework, component library and conventions (React Native, Flutter, React web, etc.). If no codebase exists yet, pick the framework — mobile-first is non-negotiable: the phone layout is the real design, not a narrowed desktop one.

`ios-frame.jsx` only draws the device bezel/status bar for presentation. **Do not port it.**

## Fidelity
**High fidelity.** Colors, type sizes, radii, spacing and copy are final and should be matched. The one exception is the two photo areas on the public page, which are striped placeholders awaiting real photos.

## Design Tokens

Colors
- Page background: `#F6F6FB` · Public page background: `#FFFFFF`
- Surface / card: `#FFFFFF` · Card border: `#ECECF5` · Input border: `#E4E4EF` · Divider: `#EFEFF7`
- Text primary: `#37384A` · secondary: `#6E7085` · muted: `#7C7F92` / `#83869A` · faint: `#9A9CB0` / `#A9ABBE`
- Primary accent (buttons, active tab): `#8A90E8` · accent text on white: `#6B72D6` · accent tint bg: `#EFF0FC` / `#E7E8FB` · accent soft (occupied bar, cabin A dot): `#DCDEF9` / `#A9AEEE`
- Green (paid, WhatsApp, cabin B): `#7FC59D` (button), `#9BD3B6` (dot), `#DDEFE6` (bar), `#E4F2EA` (tint), `#7FA98F` (text)
- Warm / owed / destructive: `#C87A48` (text), `#D9946B` (cancel button), `#FBE4D6` (bar), `#FDF3EC` (tint), `#F0B893` (dot)
- Neutral occupied (public + disabled dates): `#E4E5F0` / `#E6E6EE`
- Inactive tab icon: `#D8D9E6` · Modal scrim: `#6C6E85` with backdrop content at 30–35% opacity
- Progress track: `#EDEDF6`, fill `#A9AEEE`
- No pure black anywhere.

Typography — **Nunito Sans** (Google Fonts, weights 400/600/700/800)
- Screen title 30px/800 · sheet title 24–26px/800 · big number 42px/800 (letter-spacing −0.03em)
- Section header 17px/800 muted · body 17–19px · row title 18–19px/700 · caption 15–16px
- Button label 20–21px/800. Nothing below 14px, and 14px only for weekday initials.

Metrics
- Radii: cards 22px · sheets 30px top corners · inputs/rows 16–18px · buttons 18–20px · pills 999px
- Primary button height 64–68px; secondary 58px; inputs 58–78px; tab bar items ≥44px. Minimum tap target 44px.
- Screen padding 18–22px horizontal, 62–64px top (below status bar), 26–40px bottom
- Gaps 10–22px, flex/grid with `gap` everywhere
- Device canvas 402×874 (iPhone logical px)
- Shadows: none inside the app; only the browser window in the presentation uses one.

## Screens / Views

### 01 Ingresar
One account. Fields "Tu correo" and "Tu contraseña" (labels 16px/700 above 60px inputs), title "Alquileres AyA" 34px/800 + subtitle "Casa Azul y Casa Dos Aguas". Primary button "Entrar". Text link "Me olvidé la contraseña" centered, 17px muted.

### 02 Inicio
Deliberately empty. "Septiembre" (17px muted) + "Hola, Ana" (30px/800). One card: **Noches ocupadas** — `18` (42px) `de 60` (19px muted) and a 12px progress bar at 30%. Money collected was intentionally removed — do not add a revenue figure here. Bottom: primary button **"Anotar una reserva"**, the one action of the screen, always reachable in one tap. Sticky bottom tab bar (4 items: Inicio · Calendario · Huéspedes · Cabañas), no hamburger anywhere.

### 03 Calendario de reservas
Segmented control at top: `Casa Azul` / `Casa Dos Aguas` (52px tall, track `#E9E9F3`, active pill white). Month header `‹ Septiembre 2026 ›` with 44px square nav buttons. Month grid, week starts **Monday** (L M M J V S D), cells 50px tall.
- Occupied nights render as a horizontal bar behind the day number, inset 5px top/bottom: first night rounded on the left (`left:6px`), last night rounded on the right (`right:6px`), middle nights full-bleed so the range reads continuous across the week.
- **Adjacency**: when a checkout and a check-in fall on the same day (e.g. 15/9), that cell shows two half bars — left half in the outgoing stay's color closing, right half in the incoming stay's color opening. This must never read as a conflict.
- Each stay gets one of three pastels (`#DCDEF9`, `#DDEFE6`, `#FBE4D6`) so neighbouring stays are distinguishable.
- Below: "Quién se queda" list — colored dot, guest name, `3 al 7 de septiembre · 4 noches`, and right-aligned `Debe $ 80.000` (`#C87A48`) or `Pagado` (`#7FA98F`). This list scrolls; the tab bar stays sticky.

### 04 Nueva reserva · elegir fechas (paso 2 de 4)
Step flow: cabaña → fechas → huésped → precio. Back chevron + "Paso 2 de 4" / "¿Qué noches?". Tint banner: "Casa Azul · las noches en gris ya están ocupadas". Same month grid, taken nights `#E6E6EE` and **not selectable**; the chosen range is solid `#8A90E8` with white numbers, rounded at both ends. Availability is shown *before* dates are asked — never validate-then-reject. Past dates are fully selectable and never warned about. Summary card "Entrada 8/9 · Salida 12/9" + "4 noches", then "Seguir".
Note the sample selection ends 12/9 where the next stay begins — adjacency is legal.

### 05 Nueva reserva · el precio (paso 4 de 4)
"¿Cuánto le cobrás?" + context banner "Casa Azul · del 8 al 12 de septiembre · 4 noches". Segmented control **Por noche / Total de la estadía** — mutually exclusive, never both. Amount field 78px tall with `$` prefix (28px muted) and value 34px/800.
- *Por noche* selected: read-only card below shows "Total de la estadía $ 180.000" plus helper "Se calcula solo: 4 noches × $ 45.000. Si después estirás las fechas, se vuelve a calcular."
- *Total de la estadía* selected: the amount is the total; no per-night line, and extending dates leaves it untouched.
Primary button "Guardar la reserva".

### 06 La reserva (detalle)
Header: back + guest name. Card 1: cabin dot + name, then Entrada `3/9` / Salida `7/9` / Noches `4` as three 22px/800 figures with 15px/800 faint labels, then phone number. Card 2: `Total de la estadía` / `Pagado` rows, divider, **Saldo** `$ 80.000` in 28px `#C87A48` with the plain-language line "Le falta pagar". If the balance is negative the same block must read "Le tenés que devolver" — a normal state, never an error. Card list "Pagos": `12/8 · seña — $ 60.000`, `3/9 · efectivo — $ 40.000` (payments accumulate; refunds appear as negative entries). Actions: primary "Anotar un pago"; below it two half-width secondaries "Devolución" and "Cancelar" (`#C87A48` label).

### 07 Cancelar · confirmación
Bottom sheet over a dimmed screen. Title "¿Cancelás esta reserva?" 26px/800. Body: "Las noches del 3 al 7 de septiembre en Casa Azul quedan libres para otra persona. Los pagos anotados quedan guardados." Buttons: "Sí, cancelar" (`#D9946B`, white text) then "No, dejarla como está" (`#F2F2F8`, muted text). Cancelling frees the nights immediately.

### 08 Cabañas
"Mis cabañas" + two cards (dot, name 21px/800, "9 noches ocupadas este mes", "Editar" link). Dashed 62px "Agregar una cabaña". Footnote: "Si dejás de alquilar una, la desactivás y todo su historial queda guardado." Nothing is ever deleted — deactivate only. No search (two items).

### 09 Huéspedes
Title + search field "Buscar por nombre o teléfono". Rows: 44px circular initial avatar (tinted), name 19px/700, `11 2233 4455 · 3 estadías`, right-aligned `Debe $ 80.000` when owed. A deactivated guest renders with grey name and "Desactivado · 1 estadía" and stays visible. Primary "Agregar un huésped". Guests are keyed by **phone number** — typing an existing number opens that guest instead of creating a duplicate.

### 10 Un huésped (al tocarlo)
Bottom sheet over the list, 30px top radius, drag handle. 56px avatar + name 24px/800 + phone + "Editar". Warm `#FDF3EC` block with **Saldo $ 80.000**. "Sus estadías": bordered rows with cabin dot, `Casa Azul · 3 al 7 de septiembre`, `4 noches · $ 180.000`, and status on the right; tapping a row opens screen 06. Overflow rows collapse into "y 1 estadía más en febrero". Primary "Anotarle una reserva"; centered muted "Desactivar" at the bottom. Sheet must fit within the viewport without scrolling on a 874px phone.

### 11 Calendario público · celular  ·  12 Calendario público · computadora
Public shareable link — **privacy boundary**. Shows only cabin names and which date ranges are occupied. No guest names, no phones, no prices, no payments, no hint of who is staying.
- Filter: `Las dos` / `Casa Azul` / `Dos Aguas` (segmented on phone, pills on desktop).
- Month grid identical in geometry to the private one, but occupied nights are a single neutral `#E4E5F0` bar. Legend: `Libre` (white with border) / `Ocupado`.
- Desktop shows two months side by side (Septiembre + Octubre 2026); phone shows one with `‹ ›` nav.
- Green button **"Escribinos por WhatsApp"** (`#7FC59D`) — top right on desktop, pinned bottom on phone.
- "Las casas" photo section: 2 tiles on phone (110px), 3 on desktop (200px). Currently striped placeholders labelled `foto casa azul`, `foto dos aguas` — replace with real photos.
- White background distinguishes it from the app's `#F6F6FB`.

## Interactions & Behavior
- Tab bar navigation between Inicio / Calendario / Huéspedes / Cabañas; everything daily is one tap away.
- Reservation creation is a 4-step wizard with a back chevron per step; state persists across steps.
- Calendar: taken nights are inert; tapping a free night starts a range, a second tap closes it. A range may end on a day another stay starts.
- Guest row → sheet (slide up from bottom, ~250ms ease-out) → stay row → reservation detail.
- Destructive actions (cancel reservation, deactivate) always confirm in a sheet, never a browser dialog.
- Empty states must instruct, not sit blank: e.g. calendar with no stays → "Todavía no anotaste ninguna reserva en este mes" + the primary button; guests empty → "Acá van a aparecer las personas que se quedaron".
- No onboarding, no tour, no tooltips, no notifications, no badges, no settings screen.

## Copy rules (enforce in code review)
Cabaña · Huésped · Reserva · Entrada / Salida · Noches · Precio por noche · Total de la estadía · Pago · Devolución · Saldo · Desactivar · Noches ocupadas · Cobrado.
Never: Propiedad, Unidad, Cliente, Usuario, Booking, Check-in/Check-out, Tarifa, Transacción, Reembolso, Balance, Deuda, Eliminar, Borrar, Ingresos, Facturación — and no technical words at all (no "error", "conflicto", "409", "registro"). If dates collide, say the cabin is occupied those nights and show which are free.

## State Management
- `session` (single user), `cabañas[]` (id, nombre, activa), `huéspedes[]` (id, nombre, teléfono, activo), `reservas[]` (id, cabañaId, huéspedId, entrada, salida, precioPorNoche | totalEstadía, cancelada), `pagos[]` (id, reservaId, fecha, monto, tipo: pago|devolución).
- Derived: saldo = total − Σ pagos (may be negative); noches = salida − entrada (1–60); a stay is "finished" when its checkout date has passed — nobody marks it; occupancy per cabin per month for the home number and both calendars.
- Server enforces non-overlap per cabin; the UI's job is to make that impossible to hit.

## Assets
None shipped. Two/three cabin photos are needed for the public page. Fonts: Nunito Sans from Google Fonts. No icon set is used — the tab bar uses simple colored shapes and can be swapped for the codebase's icon library.

## Files
- `Alquileres AyA.dc.html` — all 12 screens (open in a browser; each screen is labelled 01–12)
- `ios-frame.jsx` — presentation-only device bezel, do not port
- `brief-original.md` — the original product brief with the full domain rules
