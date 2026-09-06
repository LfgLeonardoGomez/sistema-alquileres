// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 01 (Ingresar). The two field labels and the submit
// button (3.4-3.7), plus `expiredMessage` -- D29(c)'s approved copy
// (2026-09-05), task 3.15/3.16: contains none of "token", "sesión",
// "expiró", or "error", and renders above the form only on a 401-triggered
// redirect (see `LoginScreen.tsx`).

export const SESSION_COPY = {
  emailLabel: 'Tu correo',
  passwordLabel: 'Tu contraseña',
  submit: 'Entrar',
  expiredMessage: 'Entrá de nuevo para seguir.',
} as const
