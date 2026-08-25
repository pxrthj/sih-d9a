import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { ScanResponse } from '../lib/types'
import { VerdictBanner, ExtractedFields, ViolationList } from '../components/ScanResult'
import { HomeIcon, ScanIcon } from '../components/Icons'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const result = (location.state as { result?: ScanResponse } | null)?.result

  // Direct navigation / refresh loses the in-memory result — send back to scan.
  if (!result) {
    return <Navigate to="/scan" replace />
  }

  const violations = result.violations ?? []

  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em' }}>
        SCAN COMPLETE · READ-ONLY RECORD
      </div>

      <VerdictBanner status={result.status} violationCount={violations.length} />

      <div>
        <div className="section-label">Violations</div>
        <ViolationList violations={violations} />
      </div>

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
