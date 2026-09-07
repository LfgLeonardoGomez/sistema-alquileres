// Screen 09/10: "44px circular initial avatar (tinted)" / "56px avatar".
// Tint rotates through the same three pastels used elsewhere (calendar
// stays, cabin dots) so a guest's avatar colour is deterministic from her
// name without a server-side colour field.

const TINTS = [
  { bg: 'bg-accent-tint-2', fg: 'text-accent-ink' }, // #E7E8FB / #6B72D6
  { bg: 'bg-green-tint', fg: 'text-green-ink' }, // #E4F2EA / #7FA98F
  { bg: 'bg-warm-tint', fg: 'text-warm' }, // #FDF3EC / #C87A48
] as const

function hashIndex(seed: string): number {
  let sum = 0
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i)
  return sum % TINTS.length
}

type Props = {
  readonly name: string
  readonly size?: 44 | 56
  readonly muted?: boolean
}

export function Avatar({ name, size = 44, muted = false }: Props) {
  const initial = name.slice(0, 1).toUpperCase()
  const tint = TINTS[hashIndex(name)]!
  const dimension = size === 56 ? 'h-14 w-14 text-2xl' : 'h-11 w-11 text-lg'
  const colors = muted ? 'bg-[#F0F0F5] text-faint-2' : `${tint.bg} ${tint.fg}`
  return (
    <div className={`flex ${dimension} shrink-0 items-center justify-center rounded-pill font-extrabold ${colors}`} aria-hidden="true">
      {initial}
    </div>
  )
}
