import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useScan } from '../hooks/useScans'
import { fetchEvidenceUrls, fetchImprovementNotice } from '../lib/api'
import {
  VerdictBanner,
  ExtractedFields,
  ViolationList,
  AdvisoryList,
  EvidencePhotos,
} from '../components/ScanResult'
import { Banner, EmptyState, Spinner } from '../components/ui'
import { ChevronLeft, InboxIcon, DownloadIcon, MapPinIcon } from '../components/Icons'
import { formatDateTime, formatLocation, scanTitle, violationCount } from '../lib/format'

/**
 * Evidence photos for a record. The bucket is private, so the backend mints
 * short-lived signed URLs after checking that this user owns the scan (or is
 * an admin) — the same rule that guards the notice.
 */
function EvidenceSection({ scanId }: { scanId: string | number }) {
  const [urls, setUrls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setError(null)
    fetchEvidenceUrls(scanId)
      .then((signed) => {
        if (active) setUrls(signed)
      })
      .catch((e: unknown) => {
        if (!active) return
        const msg = e instanceof Error ? e.message : ''
        // A network-level failure means the API server isn't reachable. Evidence
        // photos are the one part of a record served by the backend (everything
        // else reads straight from the database), so say so plainly.
        setError(
          /failed to fetch|networkerror|load failed/i.test(msg)
            ? 'Evidence photos are served by the API server, which isn’t reachable. Start the backend and reload.'
            : msg || 'Could not load evidence photos.',
        )
      })
    return () => {
      active = false
    }
  }, [scanId])

  return (
    <div>
      <div className="section-label">Evidence photos</div>
      {error && <Banner kind="error">{error}</Banner>}
      <EvidencePhotos urls={urls} />
    </div>
  )
}

/** Read-only action: downloads the generated Improvement Notice PDF. */
function DownloadNoticeButton({ scanId }: { scanId: string | number }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    try {
      const { blob, filename } = await fetchImprovementNotice(scanId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
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
  const { isAdmin } = useAuth()
  const { scan, loading, error } = useScan(id)

  // Loading / error / not-found states, shared by both layouts.
  const statusView = loading ? (
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
  ) : null

  // The record's sections, defined once and arranged differently per layout.
  const header = scan && (
    <div>
      <h1 className="headline" style={{ fontSize: 21 }}>
        {scanTitle(scan.extracted)}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {scan.category && <span className="pill pill--neutral">{scan.category}</span>}
        <span className="muted" style={{ fontSize: 13 }}>
          {formatDateTime(scan.created_at)}
        </span>
      </div>
      {(() => {
        const loc = formatLocation(scan)
        if (!loc) return null
        return (
          <a
            href={loc.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="muted"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              marginTop: 8,
              textDecoration: 'none',
            }}
          >
            <MapPinIcon size={15} />
            {loc.text}
          </a>
        )
      })()}
    </div>
  )
  const verdict = scan && (
    <VerdictBanner status={scan.status} violationCount={violationCount(scan)} />
  )
  const evidence = scan && <EvidenceSection scanId={scan.id} />
  const violations = scan && (
    <div>
      <div className="section-label">Violations</div>
      <ViolationList violations={scan.violations} />
    </div>
  )
  const advisories = scan && <AdvisoryList advisories={scan.advisories} />
  const extracted = scan && (
    <div>
      <div className="section-label">Extracted declarations</div>
      <ExtractedFields extracted={scan.extracted} />
    </div>
  )
  const report = scan && (
    <div>
      <div className="section-label">Report</div>
      <DownloadNoticeButton scanId={scan.id} />
    </div>
  )
  const immutableNote = (
    <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
      Immutable record · cannot be edited or deleted.
    </p>
  )

  // ---- Admin: inside the desktop console, a two-column record view ----
  if (isAdmin) {
    return (
      <div className="stack">
        <button className="admin-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={18} /> Back
        </button>
        {statusView}
        {scan && (
          <>
            {header}
            {verdict}
            <div className="admin-detail__grid">
              <div className="admin-detail__main stack">
                {violations}
                {advisories}
                {extracted}
              </div>
              <aside className="admin-detail__side stack">
                {evidence}
                {report}
                {immutableNote}
              </aside>
            </div>
          </>
        )}
      </div>
    )
  }

  // ---- Officer: standalone full-screen mobile view ----
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
        {statusView}
        {scan && (
          <div className="stack">
            {header}
            {verdict}
            {evidence}
            {violations}
            {advisories}
            {extracted}
            {report}
            {immutableNote}
          </div>
        )}
      </main>
    </div>
  )
}
