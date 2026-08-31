import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { CaptureCoords, ScanResponse } from '../lib/types'
import { VerdictBanner, ExtractedFields, ViolationList, AdvisoryList } from '../components/ScanResult'
import { HomeIcon, MapPinIcon, ScanIcon } from '../components/Icons'
import { formatLocation } from '../lib/format'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { result?: ScanResponse; coords?: CaptureCoords | null } | null
  const result = state?.result

  // Direct navigation / refresh loses the in-memory result — send back to scan.
  if (!result) {
    return <Navigate to="/scan" replace />
  }

  const violations = result.violations ?? []
  const loc = state?.coords
    ? formatLocation({
        latitude: state.coords.latitude,
        longitude: state.coords.longitude,
        location_accuracy: state.coords.accuracy,
      })
    : null

  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em' }}>
        SCAN COMPLETE · READ-ONLY RECORD
      </div>

      <VerdictBanner status={result.status} violationCount={violations.length} />

      {loc && (
        <a
          href={loc.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="muted"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, textDecoration: 'none' }}
        >
          <MapPinIcon size={15} />
          Scanned at {loc.text}
        </a>
      )}

      <div>
        <div className="section-label">Violations</div>
        <ViolationList violations={violations} />
      </div>

      <AdvisoryList advisories={result.advisories} />

      <div>
        <div className="section-label">Extracted declarations</div>
        <ExtractedFields extracted={result.extracted} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button className="btn btn--ghost" onClick={() => navigate('/')}>
          <HomeIcon size={18} /> Home
        </button>
        <button className="btn btn--primary" onClick={() => navigate('/scan')}>
          <ScanIcon size={18} /> New Scan
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
        This inspection record has been saved and is immutable. Extracted data and the compliance
        verdict cannot be edited or deleted.
      </p>
    </div>
  )
}
