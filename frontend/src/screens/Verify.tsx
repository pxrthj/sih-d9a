import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchVerification } from '../lib/api'
import type { Verification } from '../lib/types'
import { Spinner, EmptyState } from '../components/ui'
import { CheckIcon, AlertIcon, InboxIcon, InfoIcon } from '../components/Icons'
import { fieldLabel } from '../lib/format'
import logo from '../assets/logo.png'

/**
 * Public verification of an issued Improvement Notice.
 *
 * Reached by scanning the QR printed on the notice, with no sign-in. It shows
 * the verdict held in the inspection record so that a printed document can be
 * checked against the source — records cannot be altered after creation, so a
 * discrepancy means the paper was modified.
 */
export default function Verify() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Verification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchVerification(id)
      .then((v) => active && setData(v))
      .catch((e: unknown) =>
        active && setError(e instanceof Error ? e.message : 'Could not verify this notice.'),
      )
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  const compliant = (data?.status || '').toLowerCase() === 'compliant'

  return (
    <div className="app-shell">
      <header className="appbar">
        <div className="appbar__brand">
          <img className="appbar__logo" src={logo} alt="" />
          <div>
            <div className="appbar__title">ParakhMitra</div>
            <div className="appbar__subtitle">Notice verification</div>
          </div>
        </div>
      </header>

      <main className="app-scroll" style={{ paddingBottom: 40 }}>
        {loading ? (
          <div className="center-screen">
            <Spinner dark />
          </div>
        ) : error || !data ? (
          <div className="card">
            <EmptyState
              icon={<InboxIcon size={48} />}
              title="No matching record"
              text={
                error ??
                'No inspection record matches this reference. If this code came from a printed notice, that notice may not be genuine.'
              }
            />
          </div>
        ) : (
          <div className="stack">
            <div>
              <div className="section-label" style={{ margin: 0 }}>
                Notice reference
              </div>
              <h1 className="headline" style={{ fontSize: 22, marginTop: 4 }}>
                {data.notice_ref}
              </h1>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Inspected {data.inspection_date} by {data.officer_name}
              </p>
            </div>

            <div className={`verdict ${compliant ? 'verdict--compliant' : 'verdict--flagged'}`}>
              <div className="flex-between">
                <div>
                  <div className="verdict__label">Verified compliance verdict</div>
                  <div className="verdict__status">{data.status || 'Unknown'}</div>
                </div>
                <div style={{ opacity: 0.9 }}>
                  {compliant ? <CheckIcon size={40} /> : <AlertIcon size={40} />}
                </div>
              </div>
              <div className="verdict__sub">
                This is the verdict held in the inspection record. If the printed notice says
                anything different, the printed notice has been altered.
              </div>
            </div>

            <div className="card">
              <div className="field">
                <div className="field__label">Commodity</div>
                <div className={`field__value ${!data.product_name ? 'field__value--empty' : ''}`}>
                  {data.product_name || 'Not declared on package'}
                </div>
              </div>
              <div className="field">
                <div className="field__label">Manufacturer / Packer / Importer</div>
                <div className={`field__value ${!data.manufacturer ? 'field__value--empty' : ''}`}>
                  {data.manufacturer || 'Not declared on package'}
                </div>
              </div>
              <div className="field">
                <div className="field__label">Category</div>
                <div className="field__value">{data.category}</div>
              </div>
            </div>

            <div>
              <div className="section-label">Declared contraventions</div>
              {data.violations.length === 0 ? (
                <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className="pill pill--success">
                    <CheckIcon size={13} /> None recorded
                  </span>
                </div>
              ) : (
                data.violations.map((v, i) => (
                  <div className="violation" key={`${v.rule_ref}-${i}`}>
                    <div className="violation__field">{fieldLabel(v.field)}</div>
                    <div className="violation__issue">{v.issue}</div>
                    <span className="violation__ref">{v.rule_ref}</span>
                  </div>
                ))
              )}
            </div>

            {data.advisories.length > 0 && (
              <div>
                <div className="section-label">Observations for verification</div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {data.advisories.map((a, i) => (
                    <div
                      key={`${a.rule_ref}-${i}`}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '14px 16px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--outline-variant)',
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--compliance-warning, #B45309)',
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        <InfoIcon size={18} />
                      </span>
                      <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{a.issue}</div>
                    </div>
                  ))}
                </div>
                <p className="help">Not contraventions — matters requiring physical verification.</p>
              </div>
            )}

            <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
              Inspection records are immutable — they cannot be edited or deleted once created.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
