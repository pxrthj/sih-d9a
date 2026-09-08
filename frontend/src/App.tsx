import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { FullScreenLoader } from './components/ui'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import Login from './screens/Login'
import AccessDenied from './screens/AccessDenied'
import Dashboard from './screens/Dashboard'
import NewScan from './screens/NewScan'
import Results from './screens/Results'
import History from './screens/History'
import ScanDetail from './screens/ScanDetail'
import Profile from './screens/Profile'
import Users from './screens/Users'
import RepeatOffenders from './screens/RepeatOffenders'
import ReviewExtraction from './screens/ReviewExtraction'
import Verify from './screens/Verify'

// Split out: the map pulls in Leaflet, ~45 kB gzipped, for a screen only the
// admin console links to. Officers work from a phone in the field and should
// not pay for it on every load.
const InspectionMap = lazy(() => import('./screens/InspectionMap'))

export default function App() {
  const { session, loading, accessDenied, isAdmin } = useAuth()
  const location = useLocation()

  // Public, and checked before anything else: the QR on a printed notice has to
  // work for whoever is holding the paper, signed in or not.
  if (location.pathname.startsWith('/verify/')) {
    return (
      <Routes>
        <Route path="/verify/:id" element={<Verify />} />
      </Routes>
    )
  }

  if (loading) {
    return <FullScreenLoader label="Loading ParakhMitra…" />
  }

  if (!session) {
    return <Login />
  }

  if (accessDenied) {
    return <AccessDenied />
  }

  return (
    <Routes>
      {/* Officers view a record as a standalone full-screen page. Admins view it
          inside the desktop console, so their /scan/:id route lives in the
          layout group below. */}
      {!isAdmin && <Route path="/scan/:id" element={<ScanDetail />} />}

      {/* Everything else shares a shell. Officers get the mobile app; admins get
          the desktop console. Both mount the same child routes. */}
      <Route element={isAdmin ? <AdminLayout /> : <Layout />}>
        <Route path="/" element={<Dashboard />} />
        {/* Scanning is officer-only. Admins are redirected to their dashboard,
            even on direct-URL access. */}
        <Route path="/scan" element={isAdmin ? <Navigate to="/" replace /> : <NewScan />} />
        <Route path="/results" element={isAdmin ? <Navigate to="/" replace /> : <Results />} />
        {/* Review sits between extraction and the saved record, so it is
            officer-only for the same reason scanning is. */}
        <Route path="/review" element={isAdmin ? <Navigate to="/" replace /> : <ReviewExtraction />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<Users />} />
        <Route path="/offenders" element={<RepeatOffenders />} />
        {/* Linked only from the admin console, but left reachable for officers:
            RLS scopes the rows either way, so an officer sees their own work. */}
        <Route
          path="/map"
          element={
            <Suspense fallback={<FullScreenLoader label="Loading map…" />}>
              <InspectionMap />
            </Suspense>
          }
        />
        {isAdmin && <Route path="/scan/:id" element={<ScanDetail />} />}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
