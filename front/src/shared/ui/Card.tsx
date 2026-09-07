import type { ComponentProps } from 'react'

// Design handoff tokens: "Radii: cards 22px", surface `#FFFFFF`, border
// `#ECECF5`. The one card recipe every screen's white blocks share (the
// occupancy card on Inicio, the two info blocks on the reservation detail,
// the cabin/guest rows' outer list container, etc).

type Props = ComponentProps<'div'>

export function Card({ className = '', ...rest }: Props) {
  const classes = `rounded-card border border-card-border bg-surface p-[22px]${className ? ` ${className}` : ''}`
  return <div className={classes} {...rest} />
}
