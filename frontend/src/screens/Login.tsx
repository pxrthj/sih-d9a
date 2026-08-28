import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Banner, Spinner } from '../components/ui'
import logo from '../assets/logo.png'

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6c-2.1 1.5-4.8 2.3-7.7 2.3-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.6 5.6C41.9 36 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  )
}

export default function Login() {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      // On success the browser is redirected to Google; nothing else to do here.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="app-shell" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.08)' }}>
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(160deg, #002045 0%, #1a365d 55%, #1960a3 100%)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 28px',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Decorative: the wordmark below already names the app. */}
          <img
            src={logo}
            alt=""
            style={{
              width: 96,
              height: 96,
              marginBottom: 24,
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.35))',
            }}
          />
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            ParakhMitra
          </h1>
          <p style={{ fontSize: 16, opacity: 0.8, marginTop: 12, lineHeight: 1.5, maxWidth: 320 }}>
            Field companion for Legal Metrology inspection officers — scan a package, get an
            instant compliance verdict backed by an immutable audit record.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <Banner kind="error">{error}</Banner>}
          <button
            className="btn btn--block"
            style={{ background: '#fff', color: '#1a365d', minHeight: 52 }}
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? <Spinner dark /> : <GoogleGlyph />}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>
          <p style={{ fontSize: 12, opacity: 0.7, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            Access is restricted to authorised inspection officers and administrators.
          </p>
        </div>
      </div>
    </div>
  )
}
