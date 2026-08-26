import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { HomeIcon, HistoryIcon, ScanIcon, UsersIcon, ProfileIcon, ShieldIcon } from './Icons'

function AppBar() {
  const { isAdmin } = useAuth()
  return (
    <header className="appbar">
      <div className="appbar__brand">
        <div className="appbar__seal">
          <ShieldIcon size={20} />
        </div>
        <div>
          <div className="appbar__title">ParakhMitra</div>
          <div className="appbar__subtitle">Legal Metrology Compliance</div>
        </div>
      </div>
      <div className="appbar__spacer" />
      {isAdmin && <span className="appbar__scope">Admin</span>}
    </header>
  )
}

function BottomNav() {
  const { isAdmin } = useAuth()
  const location = useLocation()

  return (
    <nav className="bottomnav">
      <NavLink to="/" end className={({ isActive }) => `navitem ${isActive ? 'navitem--active' : ''}`}>
        <HomeIcon className="navitem__icon" size={22} />
        Home
      </NavLink>
      <NavLink
        to="/history"
        className={({ isActive }) => `navitem ${isActive ? 'navitem--active' : ''}`}
      >
        <HistoryIcon className="navitem__icon" size={22} />
        History
      </NavLink>

      {/* Center scan action — officers only. Admins are supervisors and do not scan. */}
      {!isAdmin && (
        <NavLink
          to="/scan"
          className={`navitem navitem--fab ${location.pathname === '/scan' ? 'navitem--active' : ''}`}
          aria-label="New scan"
        >
          <span className="navitem__fab">
            <ScanIcon size={24} />
          </span>
        </NavLink>
      )}

      {isAdmin && (
        <NavLink
          to="/users"
          className={({ isActive }) => `navitem ${isActive ? 'navitem--active' : ''}`}
        >
          <UsersIcon className="navitem__icon" size={22} />
          Users
        </NavLink>
      )}

      <NavLink
        to="/profile"
        className={({ isActive }) => `navitem ${isActive ? 'navitem--active' : ''}`}
      >
        <ProfileIcon className="navitem__icon" size={22} />
        Profile
      </NavLink>
    </nav>
  )
}

export default function Layout() {
  return (
    <div className="app-shell">
      <AppBar />
      <main className="app-scroll">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
