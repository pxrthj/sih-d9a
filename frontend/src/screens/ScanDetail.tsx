import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download, Inbox, MapPin, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { useScan } from '@/hooks/useScans'
import { fetchEvidenceUrls, fetchImprovementNotice } from '@/lib/api'
import {
  AdvisoryList,
  EvidencePhotos,
  ExtractedFields,
  VerdictBanner,
  ViolationList,
} from '@/components/ScanResult'
import { AppBar } from '@/components/Layout'
import { EmptyState } from '@/components/empty-state'
import { SectionLabel, Spinner } from '@/components/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDateTime, formatLocation, scanTitle, violationCount } from '@/lib/format'

/**
 * Evidence photos for a record. The bucket is private, so the backend mints
 * short-lived signed URLs after checking that this user owns the scan (or is an
 * admin) — the same rule that guards the notice.
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
    <section className="space-y-2">
      <SectionLabel>Evidence photos</SectionLabel>
      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <EvidencePhotos urls={urls} />
    </section>
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
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button className="w-full" onClick={handleDownload} disabled={downloading}>
        {downloading ? <Spinner /> : <Download />}
        {downloading ? 'Generating notice…' : 'Download Improvement Notice'}
      </Button>
    </div>
  )
}

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { scan, loading, error } = useScan(id)

  // Loading / error / not-found, shared by both layouts.
  const statusView = loading ? (
    <div className="flex justify-center py-16">
      <Spinner className="text-muted-foreground size-6" />
    </div>
  ) : error ? (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertDescription>Couldn’t load record: {error}</AlertDescription>
    </Alert>
  ) : !scan ? (
    <Card>
      <EmptyState
        icon={Inbox}
        title="Record not found"
        text="This inspection record doesn’t exist or isn’t visible to your account."
      />
    </Card>
  ) : null

  // The record's sections, defined once and arranged differently per layout.
  const loc = scan ? formatLocation(scan) : null

  const header = scan && (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{scanTitle(scan.extracted)}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {scan.category && <Badge variant="secondary">{scan.category}</Badge>}
        <span className="text-muted-foreground text-sm">{formatDateTime(scan.created_at)}</span>
      </div>
      {loc && (
        <a
          href={loc.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <MapPin className="size-3.5" />
          {loc.text}
        </a>
      )}
    </div>
  )

  const verdict = scan && (
    <VerdictBanner status={scan.status} violationCount={violationCount(scan)} />
  )
  const evidence = scan && <EvidenceSection scanId={scan.id} />
  const violations = scan && (
    <section className="space-y-2">
      <SectionLabel>Violations</SectionLabel>
      <ViolationList violations={scan.violations} />
    </section>
  )
  const advisories = scan && <AdvisoryList advisories={scan.advisories} />
  const extracted = scan && (
    <section className="space-y-2">
      <SectionLabel>Extracted declarations</SectionLabel>
      <ExtractedFields extracted={scan.extracted} />
    </section>
  )
  const report = scan && (
    <section className="space-y-2">
      <SectionLabel>Report</SectionLabel>
      <DownloadNoticeButton scanId={scan.id} />
    </section>
  )
  const immutableNote = (
    <p className="text-muted-foreground text-center text-xs">
      Immutable record · cannot be edited or deleted.
    </p>
  )

  // ---- Admin: inside the desktop console, a two-column record view ----
  if (isAdmin) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
          <ChevronLeft />
          Back
        </Button>
        {statusView}
        {scan && (
          <>
            {header}
            {verdict}
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-6">
                {violations}
                {advisories}
                {extracted}
              </div>
              <aside className="space-y-6">
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

  // ---- Officer: a standalone full-screen mobile view ----
  return (
    <div className="bg-background min-h-screen">
      <AppBar subtitle="Inspection record · read-only" />
      <main className="app-column space-y-5 px-5 pt-5 pb-12">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
          <ChevronLeft />
          Back
        </Button>
        {statusView}
        {scan && (
          <>
            {header}
            {verdict}
            {evidence}
            {violations}
            {advisories}
            {extracted}
            {report}
            {immutableNote}
          </>
        )}
      </main>
    </div>
  )
}
