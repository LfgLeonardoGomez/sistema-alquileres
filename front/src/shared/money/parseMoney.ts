// design D27: the API serialises `Decimal` as a string (`"5000.00"`), which
// is the correct choice and must not be undone by the client. Parsed to
// integer centavos -- exact in `number` well past any plausible peso
// amount -- never to a float. No `parseFloat` anywhere in this function.
export function parseMoney(raw: string): number {
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw

  const [pesos = '0', centavosRaw = ''] = unsigned.split('.')
  const centavos = `${centavosRaw}00`.slice(0, 2)

  const amount = Number(pesos) * 100 + Number(centavos)
  return negative ? -amount : amount
}
