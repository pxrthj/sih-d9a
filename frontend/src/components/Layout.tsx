import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { History, House, ScanLine, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo.png'

/** The officer-facing shell: a phone app running in a browser tab. */
export function AppBar({ subtitle = 'Legal Metrology Compliance' }: { subtitle?: string }) {
  return (
    <header className="bg-card sticky top-0 z-30 border-b">
      <div className="app-column flex items-center gap-3 px-5 py-3">
        <img src={logo} alt="" className="size-8 rounded" />
        <div className="min-w-0">
          <div className="text-sm leading-tight font-semibold">ParakhMitra</div>
          <div className="text-muted-foreground truncate text-xs">{subtitle}</div>
        </div>
      </div>
    </header>
  )
}

function NavItem({ to, end, label, icon: Icon }: { to: string; end?: boolean; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      <Icon className="size-5" />
      {label}
    </NavLink>
  )
}

function BottomNav() {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const scanning = location.pathname === '/scan'

  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-30 border-t">
      <div className="app-column flex items-stretch px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <NavItem to="/" end label="Home" icon={House} />
        <NavItem to="/history" label="History" icon={History} />

        {/* Scanning is the officer's whole job, so it gets the centre position.
            Admins supervise and never scan, so they get Users instead. */}
        {isAdmin ? (
          <NavItem to="/users" label="Users" icon={Users} />
        ) : (
          <NavLink to="/scan" aria-label="New scan" className="flex flex-1 items-center justify-center">
            <span
              className={cn(
                'grid size-12 place-items-center rounded-full transition-colors',
                scanning ? 'bg-primary/90' : 'bg-primary',
                'text-primary-foreground shadow-sm',
              )}
            >
              <ScanLine className="size-5" />
            </span>
          </NavLink>
        )}

        <NavItem to="/profile" label="Profile" icon={User} />
      </div>
    </nav>
  )
}

export default function Layout() {
  return (
    <div className="bg-background min-h-screen">
      <AppBar />
      <main className="app-column px-5 pt-5 pb-28">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
