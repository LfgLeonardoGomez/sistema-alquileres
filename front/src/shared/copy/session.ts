// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 01 (Ingresar). The two field labels and the submit
// button (3.4-3.7), plus `expiredMessage` -- D29(c)'s approved copy
// (2026-09-05), task 3.15/3.16: contains none of "token", "sesión",
// "expiró", or "error", and renders above the form only on a 401-triggered
// redirect (see `LoginScreen.tsx`).
//
// `signOut` -- the one new string this phase's sign-out block (10.26-
// 10.36) adds, originally drafted at 10.1(f) as "Salir". Changed to
// "Cerrar sesión" per the owner's live-review correction #2 (2026-09-07):
// "Salir" read as unclear ("salir de qué?"); "Cerrar sesión" names the
// action explicitly. `src/test/glossary.test.ts`'s forbidden list does not
// contain "sesión" -- the only rule naming that word is the requirement on
// THIS module's own `expiredMessage`, scoped to that string alone -- so
// this string is unaffected by the glossary guard (see `SignOutButton.tsx`).
export const SESSION_COPY = {
  // Screen 01's own literal heading, lifted verbatim during the
  // frontend-visual-design pass (openspec/changes/frontend-visual-design):
  // "title 'Alquileres AyA' 34px/800 + subtitle 'Casa Azul y Casa Dos
  // Aguas'". Purely presentational -- no test asserted their absence.
  title: 'Alquileres AyA',
  subtitle: 'Casa Azul y Casa Dos Aguas',
  emailLabel: 'Tu correo',
  passwordLabel: 'Tu contraseña',
  submit: 'Entrar',
  expiredMessage: 'Entrá de nuevo para seguir.',
  signOut: 'Cerrar sesión',
} as const
