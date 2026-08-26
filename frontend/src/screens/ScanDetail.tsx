import { useNavigate, useParams } from 'react-router-dom'
import { useScan } from '../hooks/useScans'
import { VerdictBanner, ExtractedFields, ViolationList } from '../components/ScanResult'
import { Banner, EmptyState, Spinner } from '../components/ui'
import { ChevronLeft, InboxIcon } from '../components/Icons'
import { formatDateTime, scanTitle, violationCount } from '../lib/format'

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { scan, loading, error } = useScan(id)

  return (
    <div className="app-shell">
      <header className="appbar appbar--back">
        <button className="appbar__backbtn" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <div>
          <div className="appbar__title" style={{ fontSize: 15 }}>
            Inspection record
          </div>
          <div className="appbar__subtitle">Read-only</div>
        </div>
      </header>

      <main className="app-scroll" style={{ paddingBottom: 40 }}>
        {loading ? (
          <div className="center-screen">
            <Spinner dark />
          </div>
        ) : error ? (
          <Banner kind="error">Couldn’t load record: {error}</Banner>
        ) : !scan ? (
          <div className="card">
            <EmptyState
              icon={<InboxIcon size={48} />}
              title="Record not found"
              text="This inspection record doesn’t exist or isn’t visible to your account."
            />
          </div>
        ) : (
          <div className="stack">
            <div>
              <h1 className="headline" style={{ fontSize: 21 }}>
                {scanTitle(scan.extracted)}
              </h1>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}
              >
                {scan.category && <span className="pill pill--neutral">{scan.category}</span>}
                <span className="muted" style={{ fontSize: 13 }}>
                  {formatDateTime(scan.created_at)}
                </span>
              </div>
            </div>

            <VerdictBanner status={scan.status} violationCount={violationCount(scan)} />

            <div>
              <div className="section-label">Violations</div>
              <ViolationList violations={scan.violations} />
            </div>

            <div>
              <div className="section-label">Extracted declarations</div>
              <ExtractedFields extracted={scan.extracted} />
            </div>

            <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
              Immutable record · cannot be edited or deleted.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
