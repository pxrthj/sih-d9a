import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { FullScreenLoader } from '@/components/page-header'
import Layout from '@/components/Layout'
import AdminLayout from '@/components/AdminLayout'
import Login from '@/screens/Login'
import AccessDenied from '@/screens/AccessDenied'
import Dashboard from '@/screens/Dashboard'
import NewScan from '@/screens/NewScan'
import Results from '@/screens/Results'
import History from '@/screens/History'
import ScanDetail from '@/screens/ScanDetail'
import Profile from '@/screens/Profile'
import Users from '@/screens/Users'
import Verify from '@/screens/Verify'

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
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<Users />} />
        {isAdmin && <Route path="/scan/:id" element={<ScanDetail />} />}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
