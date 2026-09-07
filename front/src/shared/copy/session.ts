// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 01 (Ingresar). The two field labels and the submit
// button (3.4-3.7), plus `expiredMessage` -- D29(c)'s approved copy
// (2026-09-05), task 3.15/3.16: contains none of "token", "sesión",
// "expiró", or "error", and renders above the form only on a 401-triggered
// redirect (see `LoginScreen.tsx`).
//
// `signOut` -- the one new string this phase's sign-out block (10.26-
// 10.36) adds, approved as drafted at 10.1(f): "Salir", shorter than
// "Cerrar sesión" and in the same register as the rest of the app.
// "Cerrar sesión" would NOT have failed the glossary guard either --
// `src/test/glossary.test.ts`'s forbidden list does not contain "sesión";
// the only rule naming that word is the requirement on THIS module's own
// `expiredMessage`, scoped to that string alone. This was a register call,
// not a constraint (see `SignOutButton.tsx`).
export const SESSION_COPY = {
  emailLabel: 'Tu correo',
  passwordLabel: 'Tu contraseña',
  submit: 'Entrar',
  expiredMessage: 'Entrá de nuevo para seguir.',
  signOut: 'Salir',
} as const
