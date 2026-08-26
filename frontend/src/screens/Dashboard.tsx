import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useScans } from '../hooks/useScans'
import { Avatar, Banner, EmptyState, Spinner, StatusPill } from '../components/ui'
import { ChevronRight, InboxIcon, ScanIcon } from '../components/Icons'
import { formatDateShort, scanTitle, violationCount } from '../lib/format'

export default function Dashboard() {
  const { googleName, avatarUrl, isAdmin } = useAuth()
  const navigate = useNavigate()
  const { scans, loading, error } = useScans()

  const firstName = googleName.split(' ')[0]
  const total = scans.length
  const compliant = scans.filter((s) => (s.status || '').toLowerCase() === 'compliant').length
  const flagged = total - compliant
  const recent = scans.slice(0, 5)

  return (
    <div className="stack">
      {/* Welcome */}
      <div className="flex-between">
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Welcome back,
          </div>
          <h1 className="headline">{firstName}</h1>
        </div>
        <Avatar src={avatarUrl} name={googleName} size={46} />
      </div>

      {isAdmin && (
        <Banner kind="info">
          <strong>System-wide view.</strong> You are viewing compliance activity across all
          officers.
        </Banner>
      )}

      {/* Primary action */}
      <button className="btn btn--primary btn--block" onClick={() => navigate('/scan')}>
        <ScanIcon size={20} /> New Compliance Scan
      </button>

      {error && <Banner kind="error">Couldn’t load scans: {error}</Banner>}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat stat--accent">
          <div className="stat__value">{loading ? '—' : total}</div>
          <div className="stat__label">{isAdmin ? 'Total inspections' : 'Your inspections'}</div>
        </div>
        <div className="stat stat--success">
          <div className="stat__value">{loading ? '—' : compliant}</div>
          <div className="stat__label">Compliant</div>
        </div>
        <div className="stat stat--error" style={{ gridColumn: '1 / -1' }}>
          <div className="stat__value">{loading ? '—' : flagged}</div>
          <div className="stat__label">Flagged for violations</div>
        </div>
      </div>

      {/* Recent */}
      <div>
        <div className="flex-between" style={{ marginBottom: 10 }}>
          <div className="section-label" style={{ margin: 0 }}>
            {isAdmin ? 'Recent activity · all officers' : 'Recent scans'}
          </div>
          {recent.length > 0 && (
            <button
              className="muted"
              style={{ fontSize: 12.5, fontWeight: 600 }}
              onClick={() => navigate('/history')}
            >
              View all
            </button>
          )}
        </div>

        {loading ? (
          <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
            <Spinner dark />
          </div>
        ) : recent.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<InboxIcon size={48} />}
              title="No scans yet"
              text="Run your first compliance scan to see inspection records here."
            />
          </div>
        ) : (
          <div className="card card--flush">
            <div className="rows">
              {recent.map((s) => {
                const vc = violationCount(s)
                return (
                  <button key={s.id} className="row" onClick={() => navigate(`/scan/${s.id}`)}>
                    <div className="row__body">
                      <div className="row__title">{scanTitle(s.extracted)}</div>
                      <div className="row__meta">
                        {s.category ? `${s.category} · ` : ''}
                        {formatDateShort(s.created_at)}
                        {vc > 0 ? ` · ${vc} violation${vc === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                    <StatusPill status={s.status} />
                    <ChevronRight className="row__chev" />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
