import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { FullScreenLoader } from './components/ui'
import Layout from './components/Layout'
import Login from './screens/Login'
import AccessDenied from './screens/AccessDenied'
import Dashboard from './screens/Dashboard'
import NewScan from './screens/NewScan'
import Results from './screens/Results'
import History from './screens/History'
import ScanDetail from './screens/ScanDetail'
import Profile from './screens/Profile'
import Users from './screens/Users'

export default function App() {
  const { session, loading, accessDenied } = useAuth()

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
      {/* Scan detail is full-screen (its own app bar) */}
      <Route path="/scan/:id" element={<ScanDetail />} />

      {/* Everything else shares the app shell + bottom nav */}
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scan" element={<NewScan />} />
        <Route path="/results" element={<Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
