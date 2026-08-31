import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Spinner } from '@/components/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import logo from '@/assets/logo.png'

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
    <div className="bg-primary text-primary-foreground flex min-h-screen flex-col">
      <div className="app-column flex flex-1 flex-col px-7 py-12">
        <div className="flex flex-1 flex-col justify-center">
          {/* Decorative — the wordmark below already names the app. */}
          <img src={logo} alt="" className="size-20 rounded-xl" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">ParakhMitra</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed opacity-80">
            Field companion for Legal Metrology inspection officers — scan a package, get an instant
            compliance verdict backed by an immutable audit record.
          </p>
        </div>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? <Spinner /> : <GoogleGlyph />}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </Button>
          <p className="text-center text-xs leading-relaxed opacity-70">
            Access is restricted to authorised inspection officers and administrators.
          </p>
        </div>
      </div>
    </div>
  )
}
