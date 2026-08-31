import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AlertIcon } from '../components/Icons'
import { Spinner } from '../components/ui'

export default function AccessDenied() {
  const { deniedReason, googleEmail, signOut } = useAuth()
  const [loading, setLoading] = useState(false)

  return (
    <div className="app-shell">
      <div className="center-screen" style={{ flexDirection: 'column', textAlign: 'center', gap: 4 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--error-bg)',
            color: 'var(--error)',
            display: 'grid',
            placeItems: 'center',
            marginBottom: 12,
          }}
        >
          <AlertIcon size={32} />
        </div>
        <h1 className="headline" style={{ fontSize: 22 }}>
          Access not authorised
        </h1>
        <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 320, marginTop: 6 }}>
          {deniedReason}
        </p>
        {googleEmail && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Signed in as {googleEmail}
          </p>
        )}
        <button
          className="btn btn--primary btn--block"
          style={{ marginTop: 24, maxWidth: 300 }}
          disabled={loading}
          onClick={async () => {
            setLoading(true)
            await signOut()
          }}
        >
          {loading ? <Spinner /> : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
