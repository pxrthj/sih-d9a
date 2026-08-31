import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { HomeIcon, HistoryIcon, UsersIcon, ProfileIcon, MonitorIcon } from './Icons'
import { Avatar } from './ui'
import logo from '../assets/logo.png'

// The admin console is a desktop-only surface. Officers keep the mobile app
// (Layout.tsx) because they scan with a phone; admins supervise from a wide
// screen with room for the analytics that will grow here.
const NAV = [
  { to: '/', end: true, label: 'Dashboard', Icon: HomeIcon },
  { to: '/history', end: false, label: 'Inspections', Icon: HistoryIcon },
  { to: '/users', end: false, label: 'Users', Icon: UsersIcon },
  { to: '/profile', end: false, label: 'Profile', Icon: ProfileIcon },
] as const

function Sidebar() {
  const { googleName, avatarUrl } = useAuth()
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__brand">
        <img className="admin-sidebar__logo" src={logo} alt="" />
        <div>
          <div className="admin-sidebar__title">ParakhMitra</div>
          <div className="admin-sidebar__subtitle">Legal Metrology Compliance</div>
        </div>
      </div>

      <nav className="admin-nav">
        {NAV.map(({ to, end, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `admin-navitem ${isActive ? 'admin-navitem--active' : ''}`}
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar__footer">
        <span className="admin-sidebar__scope">Admin</span>
        <div className="admin-sidebar__user">
          <Avatar src={avatarUrl} name={googleName} size={36} />
          <div className="admin-sidebar__usermeta">
            <div className="admin-sidebar__username">{googleName}</div>
            <div className="admin-sidebar__userrole">Administrator</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default function AdminLayout() {
  return (
    <>
      {/* Below the desktop breakpoint the console is hidden (CSS) and this gate
          takes its place — the admin views are built for width, not a phone. */}
      <div className="admin-gate">
        <div className="admin-gate__card">
          <div className="admin-gate__icon">
            <MonitorIcon size={40} />
          </div>
          <h1 className="admin-gate__title">Open on a desktop</h1>
          <p className="admin-gate__text">
            The ParakhMitra admin console is built for a larger screen. Please open it on a desktop
            or widen your browser window to continue.
          </p>
        </div>
      </div>

      <div className="admin-shell">
        <Sidebar />
        <main className="admin-main">
          <div className="admin-content">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  )
}
