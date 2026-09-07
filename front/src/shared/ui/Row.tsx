import type { ComponentProps } from 'react'

// The bordered, 18px-radius list-row recipe the handoff repeats across
// screens 03 ("Quién se queda"), 06 (Pagos), 08 (Cabañas), 09 (Huéspedes)
// and 10 (Sus estadías): white surface, `#ECECF5` border, 14-18px padding,
// items in a row with a gap. One primitive so all of them match.

// Exported as a plain class string too -- some rows in this app are the
// interactive element itself (a `<button>` wrapping a guest row, an `<li>`
// wrapping a cabin row) rather than a `<div>` this component could wrap,
// and forcing every call site through one polymorphic component is not
// worth the complexity for a handful of exceptions.
export const rowClass = 'flex items-center gap-3.5 rounded-row border border-card-border bg-surface px-[18px] py-4'

type Props = ComponentProps<'div'>

export function Row({ className = '', ...rest }: Props) {
  const classes = `${rowClass}${className ? ` ${className}` : ''}`
  return <div className={classes} {...rest} />
}
