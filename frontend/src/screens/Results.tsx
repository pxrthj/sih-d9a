import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { House, MapPin, ScanLine } from 'lucide-react'
import type { CaptureCoords, ScanResponse } from '@/lib/types'
import {
  AdvisoryList,
  ExtractedFields,
  VerdictBanner,
  ViolationList,
} from '@/components/ScanResult'
import { SectionLabel } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { formatLocation } from '@/lib/format'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { result?: ScanResponse; coords?: CaptureCoords | null } | null
  const result = state?.result

  // Direct navigation or a refresh loses the in-memory result — send back to scan.
  if (!result) return <Navigate to="/scan" replace />

  const violations = result.violations ?? []
  const loc = state?.coords
    ? formatLocation({
        latitude: state.coords.latitude,
        longitude: state.coords.longitude,
        location_accuracy: state.coords.accuracy,
      })
    : null

  return (
    <div className="space-y-5">
      <SectionLabel>Scan complete · read-only record</SectionLabel>

      <VerdictBanner status={result.status} violationCount={violations.length} />

      {loc && (
        <a
          href={loc.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <MapPin className="size-3.5" />
          Scanned at {loc.text}
        </a>
      )}

      <section className="space-y-2">
        <SectionLabel>Violations</SectionLabel>
        <ViolationList violations={violations} />
      </section>

      <AdvisoryList advisories={result.advisories} />

      <section className="space-y-2">
        <SectionLabel>Extracted declarations</SectionLabel>
        <ExtractedFields extracted={result.extracted} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => navigate('/')}>
          <House />
          Home
        </Button>
        <Button onClick={() => navigate('/scan')}>
          <ScanLine />
          New scan
        </Button>
      </div>

      <p className="text-muted-foreground text-center text-xs leading-relaxed">
        This inspection record has been saved and is immutable. The extracted data and the
        compliance verdict cannot be edited or deleted.
      </p>
    </div>
  )
}
