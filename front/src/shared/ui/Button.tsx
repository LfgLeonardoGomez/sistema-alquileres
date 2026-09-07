import type { ComponentProps } from 'react'

// Design handoff metrics: "Primary button height 64-68px; secondary 58px...
// Button label 20-21px/800." Buttons across the app share exactly these few
// visual recipes (primary purple, secondary bordered white, destructive
// text, plain text link) -- this primitive is the one place that spelling
// lives, so every screen's "Guardar"/"Seguir"/"Cancelar" button matches the
// others pixel for pixel instead of drifting screen by screen.
//
// A thin wrapper around a native <button>, not a new abstraction: every
// prop (onClick, type, disabled, aria-pressed, data-testid...) passes
// through untouched, so no existing test query (role, name, disabled
// state) changes when a call site switches to this component.

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'text' | 'text-warm'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'flex h-16 w-full items-center justify-center rounded-btn bg-accent px-6 text-[20px] font-extrabold text-white disabled:opacity-50',
  secondary:
    'flex h-[58px] w-full items-center justify-center rounded-btn-sm border border-input-border bg-surface px-6 text-[17px] font-bold text-secondary disabled:opacity-50',
  destructive:
    'flex h-16 w-full items-center justify-center rounded-btn bg-warm-cancel px-6 text-[20px] font-extrabold text-white disabled:opacity-50',
  text: 'text-[17px] font-bold text-faint',
  'text-warm':
    'flex h-[58px] w-full items-center justify-center rounded-btn-sm border border-input-border bg-surface px-6 text-[17px] font-bold text-warm disabled:opacity-50',
}

type Props = ComponentProps<'button'> & {
  readonly variant?: ButtonVariant
}

export function Button({ variant = 'primary', className = '', ...rest }: Props) {
  const classes = `${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`
  return <button className={classes} {...rest} />
}
