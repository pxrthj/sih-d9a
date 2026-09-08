import { useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { commitScan } from '../lib/api'
import { Banner, Spinner } from '../components/ui'
import { AdvisoryList, VerdictBanner, ViolationList } from '../components/ScanResult'
import { CheckIcon, ChevronLeft } from '../components/Icons'
import type { CaptureCoords, ExtractResponse, ExtractedData } from '../lib/types'

interface ReviewState {
  result?: ExtractResponse
  imagePaths?: string[]
  category?: string
  coords?: CaptureCoords | null
}

/** The declarations an officer can correct. Ordered as they appear on a pack. */
const FIELDS = [
  { key: 'product_name', label: 'Product name', hint: 'Common name, not the brand' },
  { key: 'manufacturer_packer_importer', label: 'Manufacturer / packer / importer', long: true },
  { key: 'mfg_or_pack_date', label: 'Manufacture / packing date' },
  { key: 'use_by_date', label: 'Use by / best before' },
  { key: 'lot_batch_number', label: 'Lot / batch number' },
  { key: 'consumer_care', label: 'Consumer care', long: true },
] as const

type TextKey = (typeof FIELDS)[number]['key']

/** Blank input means the declaration is absent, which is what null records. */
function toStored(value: string): string | null {
  const v = value.trim()
  return v === '' ? null : v
}

/**
 * The officer's review of what the model read, before anything is written.
 *
 * This screen is the reason inspection records can stay immutable while still
 * being correctable: the correction happens here, and the record is written
 * once afterwards. Nothing on this screen exists in the database yet.
 */
export default function ReviewExtraction() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as ReviewState | null

  const original = state?.result?.extracted
  const [draft, setDraft] = useState<ExtractedData | null>(original ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which declarations differ from the model's reading, recomputed as they
  // type. The server decides this again on commit; this is just so the officer
  // can see what they are about to put their name to.
  const changed = useMemo(() => {
    if (!original || !draft) return []
    return Object.keys(draft).filter(
      (k) =>
        JSON.stringify(draft[k as keyof ExtractedData]) !==
        JSON.stringify(original[k as keyof ExtractedData]),
    )
  }, [original, draft])

  // A refresh loses the in-memory extraction, and nothing was saved — the only
  // honest move is to send the officer back to scan again.
  if (!state?.result || !state.imagePaths || !original || !draft) {
    return <Navigate to="/scan" replace />
  }

  const result = state.result

  function setText(key: TextKey, value: string) {
    setDraft((d) => (d ? { ...d, [key]: toStored(value) } : d))
  }

  async function handleCommit() {
    if (!draft || !state?.imagePaths) return
    setSaving(true)
    setError(null)
    try {
      const saved = await commitScan({
        imagePaths: state.imagePaths,
        category: state.category ?? 'General',
        extracted: draft,
        original: result.extracted,
        seal: result.seal,
        coords: state.coords ?? null,
      })
      navigate('/results', { state: { result: saved, coords: state.coords ?? null } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the record. Please try again.')
      setSaving(false)
    }
  }

  if (saving) {
    return (
      <div className="center-screen" style={{ flexDirection: 'column', gap: 16, minHeight: '50vh' }}>
        <Spinner dark />
        <div className="muted">Saving the inspection record…</div>
      </div>
    )
  }

  return (
    <div className="stack">
      <button className="linkback" onClick={() => navigate('/scan')}>
        <ChevronLeft size={18} /> Back to scan
      </button>

      <div>
        <h1 className="headline">Check the reading</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          Correct anything the scan misread, then save. Nothing has been recorded yet.
        </div>
      </div>

      <VerdictBanner status={result.status} violationCount={(result.violations ?? []).length} />

      <Banner kind="info">
        <strong>This verdict is provisional.</strong> It is recomputed from whatever you confirm
        below, and the record will name any declaration you change.
      </Banner>

      {error && <Banner kind="error">{error}</Banner>}

      <div>
        <div className="section-label">Declarations</div>
        <div className="card">
          <div className="stack" style={{ gap: 14 }}>
            {FIELDS.map(({ key, label, ...rest }) => {
              const edited = changed.includes(key)
              const hint = 'hint' in rest ? rest.hint : undefined
              return (
                <div key={key}>
                  <label className="label" htmlFor={`f-${key}`}>
                    {label}
                    {edited && <span className="edited-tag">changed</span>}
                  </label>
                  {'long' in rest && rest.long ? (
                    <textarea
                      id={`f-${key}`}
                      className={`input ${edited ? 'input--edited' : ''}`}
                      rows={2}
                      value={(draft[key] as string | null) ?? ''}
                      placeholder="Not on the package"
                      onChange={(e) => setText(key, e.target.value)}
                    />
                  ) : (
                    <input
                      id={`f-${key}`}
                      className={`input ${edited ? 'input--edited' : ''}`}
                      value={(draft[key] as string | null) ?? ''}
                      placeholder="Not on the package"
                      onChange={(e) => setText(key, e.target.value)}
                    />
                  )}
                  {hint && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {hint}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Net quantity is two fields: the rule engine judges the unit
                separately from the magnitude, so they are edited separately. */}
            <div>
              <label className="label" htmlFor="f-nq-value">
                Net quantity
                {changed.includes('net_quantity') && <span className="edited-tag">changed</span>}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  id="f-nq-value"
                  className={`input ${changed.includes('net_quantity') ? 'input--edited' : ''}`}
                  value={draft.net_quantity?.value ?? ''}
                  placeholder="100"
                  aria-label="Net quantity amount"
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            net_quantity: {
                              value: e.target.value,
                              unit: d.net_quantity?.unit ?? '',
                            },
                          }
                        : d,
                    )
                  }
                />
                <input
                  className={`input ${changed.includes('net_quantity') ? 'input--edited' : ''}`}
                  value={draft.net_quantity?.unit ?? ''}
                  placeholder="g"
                  aria-label="Net quantity unit"
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            net_quantity: {
                              value: d.net_quantity?.value ?? '',
                              unit: e.target.value,
                            },
                          }
                        : d,
                    )
                  }
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="f-mrp">
                Retail sale price (MRP)
                {changed.includes('mrp') && <span className="edited-tag">changed</span>}
              </label>
              <input
                id="f-mrp"
                className={`input ${changed.includes('mrp') ? 'input--edited' : ''}`}
                value={draft.mrp?.value ?? ''}
                placeholder="Rs 20.00"
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          mrp: {
                            value: e.target.value,
                            inclusive_of_taxes_stated: d.mrp?.inclusive_of_taxes_stated ?? false,
                          },
                        }
                      : d,
                  )
                }
              />
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={draft.mrp?.inclusive_of_taxes_stated ?? false}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            mrp: {
                              value: d.mrp?.value ?? '',
                              inclusive_of_taxes_stated: e.target.checked,
                            },
                          }
                        : d,
                    )
                  }
                />
                <span>
                  “Inclusive of all taxes” is printed on the pack
                  <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                    Tick only if those words actually appear — Rule 2(m) turns on the wording.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="section-label">Violations on the current reading</div>
        <ViolationList violations={result.violations ?? []} />
      </div>

      <AdvisoryList advisories={result.advisories} />

      {changed.length > 0 && (
        <Banner kind="warning">
          <strong>
            {changed.length} declaration{changed.length === 1 ? '' : 's'} changed.
          </strong>{' '}
          The record will keep the original reading alongside yours, and the notice will name what
          you amended.
        </Banner>
      )}

      <button className="btn btn--primary btn--block" onClick={handleCommit}>
        <CheckIcon size={18} /> Save inspection record
      </button>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
        Once saved, the record cannot be edited or deleted. Corrections must be made here.
      </p>
    </div>
  )
}
