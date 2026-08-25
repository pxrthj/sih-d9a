import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Avatar, Spinner } from '../components/ui'
import { LogoutIcon, ShieldIcon } from '../components/Icons'

export default function Profile() {
  const { googleName, googleEmail, avatarUrl, profile, isAdmin, signOut } = useAuth()
  const [loading, setLoading] = useState(false)

  const roleLabel =
    profile?.role === 'admin' ? 'Administrator' : profile?.role === 'officer' ? 'Inspection Officer' : '—'

  return (
    <div className="stack">
      <h1 className="headline">Profile</h1>

      {/* Identity card */}
      <div className="card" style={{ textAlign: 'center', paddingTop: 26, paddingBottom: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <Avatar src={avatarUrl} name={googleName} size={84} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{googleName}</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>
          {googleEmail}
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <span className={`pill ${isAdmin ? 'pill--warning' : 'pill--success'}`}>
            <ShieldIcon size={13} /> {roleLabel}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="card">
        <div className="field">
          <div className="field__label">Full name</div>
          <div className="field__value">{profile?.full_name || googleName}</div>
        </div>
        <div className="field">
          <div className="field__label">Email</div>
          <div className="field__value">{googleEmail || '—'}</div>
        </div>
        <div className="field">
          <div className="field__label">Role</div>
          <div className="field__value">{roleLabel}</div>
        </div>
        <div className="field">
          <div className="field__label">Account status</div>
          <div className="field__value" style={{ textTransform: 'capitalize' }}>
            {profile?.status || '—'}
          </div>
        </div>
      </div>

      <button
        className="btn btn--danger btn--block"
        disabled={loading}
        onClick={async () => {
          setLoading(true)
          await signOut()
        }}
      >
        {loading ? <Spinner /> : <LogoutIcon size={18} />}
        Sign out
      </button>

      <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.5 }}>
        ParakhMitra · Legal Metrology Compliance
      </p>
    </div>
  )
}
