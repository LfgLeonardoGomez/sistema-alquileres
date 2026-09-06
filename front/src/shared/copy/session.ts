// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 01 (Ingresar). Only the two field labels and the submit
// button this run's tasks (3.4-3.7) actually need -- the title/subtitle and
// the approved expiry message ("Entrá de nuevo para seguir.", D29(c)) are
// task 3.15/3.16's own scope, not this one's.

export const SESSION_COPY = {
  emailLabel: 'Tu correo',
  passwordLabel: 'Tu contraseña',
  submit: 'Entrar',
} as const
