import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import DatabaseBadge from './components/DatabaseBadge'
import { applyTheme, readThemePref } from './lib/theme'

// Before the first render, so an explicit dark choice never flashes light.
applyTheme(readThemePref())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
      {/* Mounted outside App so it shows on every screen, including the login
          and public verify pages. Renders nothing in a production build. */}
      <DatabaseBadge />
    </BrowserRouter>
  </StrictMode>,
)
