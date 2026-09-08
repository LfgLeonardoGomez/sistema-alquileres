# Palettes — pending change (not built)

Material delivered by the owner on 2026-09-07. **Nothing here is implemented yet.**

## Files
- `especificaciones-ui-paletas.md` — full token spec for both palettes (HEX + Tailwind), component specs (bottom nav, cards, calendar matrix, inputs).
- `palette-costa-screens.png` — "Costa & Océano" (navy + mint) across Inicio, Calendario Host, Huéspedes, Vista Pública WhatsApp.
- `palette-blush-screens.png` — "Blush & Frambuesa" (raspberry + lilac) across the same four screens.

## Requested scope
The user must be able to **switch between both palettes at runtime** — not a one-time theme pick at build time.

## Open questions to resolve before proposing
1. Where does the choice live? Per-device (localStorage) or per-tenant (persisted server-side)? The product is multi-tenant SaaS, so a tenant-level brand choice is the likelier fit.
2. Current styling is Tailwind utilities applied directly in components. Switching palettes at runtime needs a token indirection layer (CSS custom properties driving Tailwind theme colors), which is a refactor of every hardcoded color utility already shipped.
3. The screens in the mockups are not one-to-one with the built screens (e.g. the public WhatsApp availability view, "Quién se queda" card). Decide whether this change is palette-only or also absorbs those layout deltas.
