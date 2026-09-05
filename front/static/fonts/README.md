# Self-hosted Nunito Sans

`nunito-sans-variable-latin.woff2` is the "latin" subset (`U+0000-00FF`,
sufficient for Spanish including `á é í ó ú ñ ü`) of Google's own Nunito Sans
v19 variable font, downloaded once and committed here so the app makes zero
runtime requests to a third-party origin (design D37, and the tripwire D29
names against any runtime third-party resource).

One physical file covers the whole 400-800 weight range the handoff's
screens use (`font-weight: 400 800` in `src/index.css`'s `@font-face`) --
Google Fonts itself now serves this family as a single variable-font file
under the hood; the four discrete per-weight `@font-face` blocks its own
CSS API returns all point at this same byte-identical file.

Source at time of download: `https://fonts.gstatic.com/s/nunitosans/v19/…`
(the "latin" subset URL from `https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800`).
Re-fetch and replace this file only if the app needs a different subset
(e.g. an accented character outside Latin-1) or a different weight range.
