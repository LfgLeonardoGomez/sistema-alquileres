import { NavLink } from 'react-router'
import { SHELL_COPY } from '../../shared/copy/shell'

// design handoff, "Interactions & Behavior": "Tab bar navigation between
// Inicio / Calendario / Huéspedes / Cabañas; everything daily is one tap
// away", "no hamburger anywhere" (screen 02). Task 3.23: the sticky bottom
// tab bar every authenticated screen composes -- Calendario/Huéspedes/
// Cabañas point at real routes today (real behavior lands in Phases 4/7/8;
// until then those routes render an instructive placeholder, never a dead
// link, see `PlaceholderScreens.tsx`).

const TABS = [
  { to: '/inicio', label: SHELL_COPY.tabInicio },
  { to: '/calendario', label: SHELL_COPY.tabCalendario },
  { to: '/huespedes', label: SHELL_COPY.tabHuespedes },
  { to: '/cabanas', label: SHELL_COPY.tabCabanas },
] as const

export function TabBar() {
  return (
    <nav aria-label={SHELL_COPY.tabBarLabel}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
