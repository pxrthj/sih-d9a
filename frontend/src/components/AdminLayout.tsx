import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardList, House, Monitor, User, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { AppAvatar } from '@/components/app-avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo.png'

// The admin console is a desktop surface. Officers keep the mobile app
// (Layout.tsx) because they scan with a phone; admins supervise from a wide
// screen with room for the analytics that live here.
const NAV = [
  { to: '/', end: true, label: 'Dashboard', icon: House },
  { to: '/history', end: false, label: 'Inspections', icon: ClipboardList },
  { to: '/users', end: false, label: 'Users', icon: Users },
  { to: '/profile', end: false, label: 'Profile', icon: User },
] as const

function Sidebar() {
  const { googleName, avatarUrl } = useAuth()

  return (
    <aside className="bg-card fixed inset-y-0 left-0 flex w-60 flex-col border-r">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={logo} alt="" className="size-8 rounded" />
        <div className="min-w-0">
          <div className="text-sm leading-tight font-semibold">ParakhMitra</div>
          <div className="text-muted-foreground truncate text-xs">Legal Metrology</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <AppAvatar src={avatarUrl} name={googleName} className="size-8" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{googleName}</div>
            <div className="text-muted-foreground text-xs">Administrator</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default function AdminLayout() {
  return (
    <>
      {/* Below the desktop breakpoint the console is replaced by this gate —
          the admin views are built for width, not for a phone. */}
      <div className="grid min-h-screen place-items-center px-6 lg:hidden">
        <div className="max-w-sm text-center">
          <div className="bg-muted text-muted-foreground mx-auto grid size-12 place-items-center rounded-full">
            <Monitor className="size-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Open on a desktop</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            The ParakhMitra admin console is built for a larger screen. Open it on a desktop, or
            widen this window to continue.
          </p>
        </div>
      </div>

      <div className="hidden min-h-screen lg:block">
        <Sidebar />
        <div className="pl-60">
          <header className="bg-card/80 sticky top-0 z-20 flex h-14 items-center justify-end border-b px-8 backdrop-blur">
            <Badge variant="secondary">Admin</Badge>
          </header>
          <main className="mx-auto max-w-6xl px-8 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  )
}
