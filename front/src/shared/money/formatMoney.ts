// design D27: `es-AR`, dot thousands, no decimals -- except when centavos
// are non-zero, in which case they are rendered (`$ 180.000,50`), never
// dropped. Every value in the design happens to carry zero centavos, which
// is exactly why silently truncating fifty of them would go unnoticed --
// and being trusted about money is this app's entire job.
export function formatMoney(centavos: number): string {
  const pesos = Math.trunc(centavos / 100)
  const remainderCentavos = Math.abs(centavos % 100)

  const pesosFormatted = new Intl.NumberFormat('es-AR').format(pesos)

  if (remainderCentavos === 0) {
    return `$ ${pesosFormatted}`
  }

  const centavosFormatted = remainderCentavos.toString().padStart(2, '0')
  return `$ ${pesosFormatted},${centavosFormatted}`
}
