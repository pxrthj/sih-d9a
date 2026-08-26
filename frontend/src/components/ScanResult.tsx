import { useState } from 'react'
import type { ExtractedData, Violation } from '../lib/types'
import { fieldLabel, mrpText, netQuantityText } from '../lib/format'
import { CheckIcon, AlertIcon, CameraIcon } from './Icons'

function EvidenceTile({ label, url }: { label: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  const showImage = !!url && !failed
  return (
    <div className={`capture ${showImage ? 'capture--filled' : ''}`}>
      <span className="capture__badge">{label}</span>
      {showImage ? (
        <img
          className="capture__preview"
          src={url!}
          alt={label}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="capture__hint">
          <CameraIcon size={24} />
          {url ? 'Image unavailable' : 'No photo'}
        </span>
      )}
    </div>
  )
}

/** Front + back evidence photos, shown read-only in the scan detail view. */
export function EvidencePhotos({ front, back }: { front: string | null; back: string | null }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <EvidenceTile label="Front of Package" url={front} />
      <EvidenceTile label="Back of Package" url={back} />
    </div>
  )
}

export function VerdictBanner({
  status,
  violationCount,
}: {
  status?: string | null
  violationCount: number
}) {
  const compliant = (status || '').toLowerCase() === 'compliant'
  return (
    <div className={`verdict ${compliant ? 'verdict--compliant' : 'verdict--flagged'}`}>
      <div className="flex-between">
        <div>
          <div className="verdict__label">Compliance verdict</div>
          <div className="verdict__status">{status || 'Unknown'}</div>
        </div>
        <div style={{ opacity: 0.9 }}>
          {compliant ? <CheckIcon size={40} /> : <AlertIcon size={40} />}
        </div>
      </div>
      <div className="verdict__sub">
        {compliant
          ? 'All mandatory Legal Metrology declarations were detected.'
          : `${violationCount} mandatory ${violationCount === 1 ? 'declaration' : 'declarations'} missing or non-compliant.`}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = value === null || value === undefined || value.trim?.() === ''
  return (
    <div className="field">
      <div className="field__label">{label}</div>
      <div className={`field__value ${empty ? 'field__value--empty' : ''}`}>
        {empty ? 'Not detected on label' : value}
      </div>
    </div>
  )
}

export function ExtractedFields({ extracted }: { extracted: ExtractedData | null }) {
  if (!extracted) {
    return <div className="muted" style={{ fontSize: 14 }}>No extracted data available.</div>
  }

  const nq = netQuantityText(extracted)
  const mrp = mrpText(extracted)
  const taxStated = extracted.mrp?.inclusive_of_taxes_stated

  return (
    <div className="card">
      <Field label="Manufacturer / Packer / Importer" value={extracted.manufacturer_packer_importer} />
      <Field label="Net Quantity" value={nq} />
      <div className="field">
        <div className="field__label">Maximum Retail Price (MRP)</div>
        <div className={`field__value ${!mrp ? 'field__value--empty' : ''}`}>
          {mrp ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {mrp}
              {extracted.mrp && (
                <span className="chip-tax">
                  {taxStated ? 'Incl. of all taxes stated' : 'Tax-inclusive not stated'}
                </span>
              )}
            </span>
          ) : (
            'Not detected on label'
          )}
        </div>
      </div>
      <Field label="Mfg / Pack Date" value={extracted.mfg_or_pack_date} />
      <Field label="Consumer Care" value={extracted.consumer_care} />
      <div className="field">
        <div className="field__label">Declarations Present</div>
        <div className="field__value">
          {extracted.declarations_present && extracted.declarations_present.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {extracted.declarations_present.map((d, i) => (
                <span key={`${d}-${i}`} className="chip-tax">
                  {fieldLabel(d)}
                </span>
              ))}
            </div>
          ) : (
            <span className="field__value--empty">None identified</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ViolationList({ violations }: { violations: Violation[] | null }) {
  if (!violations || violations.length === 0) {
    return (
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="pill pill--success">
          <CheckIcon size={13} /> No violations
        </span>
        <span className="muted" style={{ fontSize: 13.5 }}>
          The package meets all checked Legal Metrology rules.
        </span>
      </div>
    )
  }

  return (
    <div>
      {violations.map((v, i) => (
        <div className="violation" key={`${v.field}-${i}`}>
          <div className="violation__field">{fieldLabel(v.field)}</div>
          <div className="violation__issue">
            {v.issue === 'missing'
              ? 'Mandatory declaration is missing from the package.'
              : v.issue}
          </div>
          <span className="violation__ref">{v.rule_ref}</span>
        </div>
      ))}
    </div>
  )
}
