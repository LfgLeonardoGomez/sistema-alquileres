import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SHELL_COPY } from '../../shared/copy/shell'
import { CabinsPlaceholder, CalendarPlaceholder, GuestsPlaceholder } from './PlaceholderScreens'
import { TabBar } from './TabBar'

// Task 3.23: "Not independently TDD-able beyond a render smoke check; real
// behavior lands in Phases 4/7/8." Labelled honestly, per this run's own
// instructions -- no RED/GREEN cycle is manufactured here. This is a render
// assertion (all four tabs exist and point somewhere real) plus a proof
// that the three not-yet-built tabs render instructive copy rather than a
// blank screen, matching the handoff's "Empty states must instruct, not sit
// blank" and the task's own "never a dead link".

function renderAt(path: string) {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/inicio', Component: TabBar },
          { path: '/calendario', Component: CalendarPlaceholder },
          { path: '/huespedes', Component: GuestsPlaceholder },
          { path: '/cabanas', Component: CabinsPlaceholder },
        ],
        { initialEntries: [path] },
      )}
    />,
  )
}

describe('TabBar', () => {
  it('renders all four tabs, each linking to a real, distinct route', () => {
    renderAt('/inicio')

    expect(screen.getByRole('link', { name: SHELL_COPY.tabInicio })).toHaveAttribute('href', '/inicio')
    expect(screen.getByRole('link', { name: SHELL_COPY.tabCalendario })).toHaveAttribute('href', '/calendario')
    expect(screen.getByRole('link', { name: SHELL_COPY.tabHuespedes })).toHaveAttribute('href', '/huespedes')
    expect(screen.getByRole('link', { name: SHELL_COPY.tabCabanas })).toHaveAttribute('href', '/cabanas')
  })

  it('renders instructive copy on the not-yet-built Calendario tab, never a blank screen', () => {
    renderAt('/calendario')
    expect(screen.getByText(SHELL_COPY.calendarEmpty)).toBeInTheDocument()
  })

  it('renders instructive copy on the not-yet-built Huéspedes tab, never a blank screen', () => {
    renderAt('/huespedes')
    expect(screen.getByText(SHELL_COPY.guestsEmpty)).toBeInTheDocument()
  })

  it('renders instructive copy on the not-yet-built Cabañas tab, never a blank screen', () => {
    renderAt('/cabanas')
    expect(screen.getByText(SHELL_COPY.cabinsEmpty)).toBeInTheDocument()
  })
})
