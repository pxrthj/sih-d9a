import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useScan } from '../hooks/useScans'
import { fetchImprovementNotice } from '../lib/api'
import { VerdictBanner, ExtractedFields, ViolationList, EvidencePhotos } from '../components/ScanResult'
import { Banner, EmptyState, Spinner } from '../components/ui'
import { ChevronLeft, InboxIcon, DownloadIcon } from '../components/Icons'
import { evidencePaths, evidenceUrl, formatDateTime, scanTitle, violationCount } from '../lib/format'

/** Read-only action: downloads the generated Improvement Notice PDF. */
function DownloadNoticeButton({ scanId }: { scanId: string | number }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    try {
      const blob = await fetchImprovementNotice(scanId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `improvement-notice-${String(scanId).slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download the notice.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="stack-sm">
      {error && <Banner kind="error">{error}</Banner>}
      <button className="btn btn--primary btn--block" onClick={handleDownload} disabled={downloading}>
        {downloading ? <Spinner /> : <DownloadIcon size={18} />}
        {downloading ? 'Generating notice…' : 'Download Improvement Notice'}
      </button>
    </div>
  )
}

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

            {(() => {
              const paths = evidencePaths(scan)
              return (
                <div>
                  <div className="section-label">Evidence photos</div>
                  <EvidencePhotos front={evidenceUrl(paths.front)} back={evidenceUrl(paths.back)} />
                </div>
              )
            })()}

            <div>
              <div className="section-label">Violations</div>
              <ViolationList violations={scan.violations} />
            </div>

            <div>
              <div className="section-label">Extracted declarations</div>
              <ExtractedFields extracted={scan.extracted} />
            </div>

            <div>
              <div className="section-label">Report</div>
              <DownloadNoticeButton scanId={scan.id} />
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
