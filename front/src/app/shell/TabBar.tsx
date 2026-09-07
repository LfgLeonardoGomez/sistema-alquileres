import { NavLink } from 'react-router'
import { SHELL_COPY } from '../../shared/copy/shell'

// design handoff, "Interactions & Behavior": "Tab bar navigation between
// Inicio / Calendario / Huéspedes / Cabañas; everything daily is one tap
// away", "no hamburger anywhere" (screen 02). Task 3.23: the sticky bottom
// tab bar every authenticated screen composes -- Calendario/Huéspedes/
// Cabañas point at real routes today (real behavior lands in Phases 4/7/8;
// until then those routes render an instructive placeholder, never a dead
// link, see `PlaceholderScreens.tsx`).
//
// Screens 02/03/08/09: "sticky bottom" 4-item bar, active item in
// `#8A90E8`/`#6B72D6`, inactive icon `#D8D9E6`. The handoff's icons are
// "simple colored shapes... can be swapped for the codebase's icon
// library" (README, Assets) -- no icon set exists here yet, so each tab
// keeps the exact shape (rounded square / circle) the mock draws.

const TABS = [
  { to: '/inicio', label: SHELL_COPY.tabInicio, shape: 'rounded-lg' },
  { to: '/calendario', label: SHELL_COPY.tabCalendario, shape: 'rounded-lg' },
  { to: '/huespedes', label: SHELL_COPY.tabHuespedes, shape: 'rounded-pill' },
  { to: '/cabanas', label: SHELL_COPY.tabCabanas, shape: 'rounded-md' },
] as const

export function TabBar() {
  return (
    <nav
      aria-label={SHELL_COPY.tabBarLabel}
      className="sticky bottom-0 z-10 mt-auto grid grid-cols-4 gap-1 border-t border-[#E9E9F2] bg-white/94 px-3 pt-3 pb-[34px] backdrop-blur-md"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1.5 px-0 py-2 text-[15px] ${isActive ? 'font-extrabold text-accent-ink' : 'font-bold text-faint'}`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`h-[22px] w-[22px] ${tab.shape} ${isActive ? 'bg-accent' : 'bg-tab-inactive'}`} />
              {tab.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
