import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { Profile, Role, ProfileStatus } from '../lib/types'
import { Avatar, Banner, EmptyState, Spinner } from '../components/ui'
import { UsersIcon } from '../components/Icons'
import { formatDateShort } from '../lib/format'

function EditSheet({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile
  onClose: () => void
  onSaved: (p: Profile) => void
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [role, setRole] = useState<Role>(profile.role)
  const [status, setStatus] = useState<ProfileStatus>(profile.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const changed =
    fullName !== (profile.full_name ?? '') || role !== profile.role || status !== profile.status

  async function save() {
    setSaving(true)
    setError(null)
    // NOTE: only profile fields — never any scan/inspection data — are writable.
    const { data, error: err } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null, role, status })
      .eq('id', profile.id)
      .select('id, email, full_name, role, status, created_at')
      .maybeSingle()

    if (err) {
      setError(err.message)
      setSaving(false)
      setConfirming(false)
      return
    }
    onSaved((data as Profile) ?? { ...profile, full_name: fullName, role, status })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 6 }}>
          <h2 className="title-lg">Manage user</h2>
          <button className="muted" style={{ fontSize: 14, fontWeight: 600 }} onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {profile.email}
        </p>

        {error && (
          <div style={{ marginBottom: 14 }}>
            <Banner kind="error">{error}</Banner>
          </div>
        )}

        <div className="stack-sm">
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="label">Role</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="officer">Inspection Officer</option>
              <option value="admin">Administrator</option>
              {profile.role === 'none' && <option value="none">No access</option>}
            </select>
          </div>

          <div>
            <label className="label">Account status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['active', 'inactive'] as ProfileStatus[]).map((s) => (
                <button
                  key={s}
                  className={`tab ${status === s ? 'tab--active' : ''}`}
                  style={{ flex: 1, textTransform: 'capitalize' }}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {status === 'inactive' && (
              <p className="help">Inactive users are denied access at login.</p>
            )}
          </div>
        </div>

        {confirming ? (
          <div style={{ marginTop: 20 }}>
            <Banner kind="info">
              Apply these changes to <strong>{profile.email}</strong>?
            </Banner>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <button className="btn btn--subtle" disabled={saving} onClick={() => setConfirming(false)}>
                Back
              </button>
              <button className="btn btn--primary" disabled={saving} onClick={save}>
                {saving ? <Spinner /> : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn--primary btn--block"
            style={{ marginTop: 20 }}
            disabled={!changed}
            onClick={() => setConfirming(true)}
          >
            Save changes
          </button>
        )}
      </div>
    </div>
  )
}

export default function Users() {
  const { isAdmin, user } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, status, created_at')
        .order('created_at', { ascending: false })
      if (!active) return
      if (err) setError(err.message)
      else setProfiles((data ?? []) as Profile[])
      setLoading(false)
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  // Officers must never reach this screen.
  if (!isAdmin) return <Navigate to="/" replace />

  function handleSaved(updated: Profile) {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setEditing(null)
    setToast(`Updated ${updated.email ?? 'user'}`)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="stack">
      <div>
        <h1 className="headline">Users</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Manage officer and administrator access. Inspection records are immutable and cannot be
          altered here.
        </p>
      </div>

      {toast && <Banner kind="success">{toast}</Banner>}
      {error && <Banner kind="error">Couldn’t load users: {error}</Banner>}

      {loading ? (
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <Spinner dark />
        </div>
      ) : profiles.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<UsersIcon size={48} />}
            title="No users yet"
            text="Registered users will appear here after their first sign-in."
          />
        </div>
      ) : (
        <div className="card card--flush">
          <div className="rows">
            {profiles.map((p) => (
              <button key={p.id} className="row" onClick={() => setEditing(p)}>
                <Avatar name={p.full_name || p.email} size={40} />
                <div className="row__body">
                  <div className="row__title">
                    {p.full_name || p.email || 'Unknown'}
                    {p.id === user?.id && (
                      <span className="chip-tax" style={{ marginLeft: 8 }}>
                        You
                      </span>
                    )}
                  </div>
                  <div className="row__meta">
                    {p.email} · joined {formatDateShort(p.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <span className={`pill ${p.role === 'admin' ? 'pill--warning' : p.role === 'officer' ? 'pill--success' : 'pill--neutral'}`}>
                    {p.role === 'admin' ? 'Admin' : p.role === 'officer' ? 'Officer' : 'No access'}
                  </span>
                  {p.status === 'inactive' && <span className="pill pill--error">Inactive</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <EditSheet profile={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
