import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Temporal } from 'temporal-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../test/setup'
import { RESERVATION_WIZARD_COPY, nightsCountLabel } from '../../../shared/copy/reservations'
import { formatDayMonth } from '../../../shared/date/format'

// tasks 5.8-5.15, `reservation-recording` spec + design D28's own named
// "single most confusable rule in the change". Reservation dates below
// deliberately mirror `CalendarScreen.test.tsx`'s own established fixture
// shape (`2026-09-08` → `2026-09-12`) so a reviewer can cross-reference the
// same numbers this codebase already uses elsewhere for the identical
// adjacency scenario.

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DateStepUnderTest: any

function reservationsHandler(stays: readonly { id: string; check_in: string; check_out: string; status?: string }[]) {
  return http.get('http://localhost:8000/reservations', () =>
    HttpResponse.json(
      stays.map((stay) => ({
        id: stay.id,
        client_id: 'guest-1',
        check_in: stay.check_in,
        check_out: stay.check_out,
        status: stay.status ?? 'confirmed',
        balance: '0.00',
      })),
    ),
  )
}

function renderDateStep(props: { onContinue?: (dates: unknown) => void; onBack?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onContinue = props.onContinue ?? (() => {})
  const onBack = props.onBack ?? (() => {})
  return render(
    <QueryClientProvider client={queryClient}>
      <DateStepUnderTest cabin={{ id: CASA_AZUL, name: 'Casa Azul' }} initialDates={null} onContinue={onContinue} onBack={onBack} />
    </QueryClientProvider>,
  )
}

async function tapDay(date: string) {
  const cell = await screen.findByTestId(`day-${date}`)
  await userEvent.click(cell)
}

describe('DateStep', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./DateStep')
    DateStepUnderTest = mod.DateStep
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    vi.restoreAllMocks()
  })

  // task 5.8 [TRAP]
  it('[TRAP] tapping an occupied night begins no selection -- the first free day tapped afterward becomes entrada, not a doomed second tap', async () => {
    server.use(reservationsHandler([{ id: 'r-existing', check_in: '2026-09-08', check_out: '2026-09-12' }]))

    renderDateStep()

    // 09-09 is occupied by the existing stay -- must be inert as a first tap.
    await tapDay('2026-09-09')
    // If that tap had wrongly registered as entrada, tapping a later free
    // day next would be interpreted as an already-doomed SECOND tap
    // spanning the occupied nights above, and no summary would ever
    // appear below. It appearing, with the correct entrada, is the proof.
    await tapDay('2026-09-20')
    await tapDay('2026-09-25')

    const summary = await screen.findByRole('region', { name: RESERVATION_WIZARD_COPY.resumenLabel })
    expect(summary).toHaveTextContent(`${RESERVATION_WIZARD_COPY.entradaLabel} ${formatDayMonth('2026-09-20' as never)}`)
    expect(summary).toHaveTextContent(`${RESERVATION_WIZARD_COPY.salidaLabel} ${formatDayMonth('2026-09-25' as never)}`)
    expect(summary).toHaveTextContent(nightsCountLabel(5))
  })

  // task 5.10 [TRAP -- the handoff's own apparent contradiction]
  it('[TRAP] a range ending on the day another stay begins is a legal second tap, matching the handoff\'s own 8/9→12/9 sample', async () => {
    server.use(reservationsHandler([{ id: 'r-next-stay', check_in: '2026-09-12', check_out: '2026-09-16' }]))

    renderDateStep()

    await tapDay('2026-09-08')
    await tapDay('2026-09-12')

    const summary = await screen.findByRole('region', { name: RESERVATION_WIZARD_COPY.resumenLabel })
    expect(summary).toHaveTextContent(`${RESERVATION_WIZARD_COPY.entradaLabel} ${formatDayMonth('2026-09-08' as never)}`)
    expect(summary).toHaveTextContent(`${RESERVATION_WIZARD_COPY.salidaLabel} ${formatDayMonth('2026-09-12' as never)}`)
    expect(summary).toHaveTextContent(nightsCountLabel(4))
  })

  // task 5.12/5.13: no date-vs-today branch anywhere.
  it('a range entirely in the past proceeds to the summary identically to a future range, with no warning', async () => {
    vi.spyOn(Temporal.Now, 'plainDateISO').mockReturnValue(Temporal.PlainDate.from('2026-09-04'))
    server.use(reservationsHandler([]))

    renderDateStep()

    await screen.findByRole('button', { name: RESERVATION_WIZARD_COPY.previousMonth })
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.previousMonth }))

    await tapDay('2026-08-01')
    await tapDay('2026-08-05')

    const summary = await screen.findByRole('region', { name: RESERVATION_WIZARD_COPY.resumenLabel })
    expect(summary).toHaveTextContent(`${RESERVATION_WIZARD_COPY.entradaLabel} ${formatDayMonth('2026-08-01' as never)}`)
    expect(summary).toHaveTextContent(`${RESERVATION_WIZARD_COPY.salidaLabel} ${formatDayMonth('2026-08-05' as never)}`)
    expect(summary).toHaveTextContent(nightsCountLabel(4))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // task 5.14/5.15: zero nights.
  it('refuses a zero-night selection (salida === entrada) with a sentence, before any request', async () => {
    server.use(reservationsHandler([]))

    renderDateStep()

    await tapDay('2026-09-20')
    await tapDay('2026-09-20')

    expect(await screen.findByRole('alert')).toHaveTextContent(RESERVATION_WIZARD_COPY.zeroNightsGuard)
    expect(screen.queryByRole('region', { name: RESERVATION_WIZARD_COPY.resumenLabel })).not.toBeInTheDocument()
  })

  // task 5.14/5.15 [TRIANGULATE]: over 60 nights.
  it('refuses a range over 60 nights with a sentence, before any request', async () => {
    server.use(reservationsHandler([]))

    renderDateStep()

    await tapDay('2026-09-01')
    await userEvent.click(await screen.findByRole('button', { name: RESERVATION_WIZARD_COPY.nextMonth }))
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.nextMonth }))
    // 2026-09-01 -> 2026-11-05 is 65 nights, safely over the 60-night bound.
    await tapDay('2026-11-05')

    expect(await screen.findByRole('alert')).toHaveTextContent(RESERVATION_WIZARD_COPY.tooManyNightsGuard)
    expect(screen.queryByRole('region', { name: RESERVATION_WIZARD_COPY.resumenLabel })).not.toBeInTheDocument()
  })
})
