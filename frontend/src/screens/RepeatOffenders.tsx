import { useMemo } from 'react'
import { useManufacturers } from '../hooks/useManufacturers'
import { Banner, EmptyState, Spinner } from '../components/ui'
import { InboxIcon } from '../components/Icons'
import { formatDateShort } from '../lib/format'

/** Flagged share, as a whole percentage. */
function flaggedShare(flagged: number, total: number): number {
  return total === 0 ? 0 : Math.round((flagged / total) * 100)
}

/**
 * Packers ranked by how often their packages have been flagged.
 *
 * The grouping is derived from the name printed on the pack, which is the only
 * identifier a photograph reliably yields. That is a real limitation and it is
 * stated on the page rather than hidden: an officer acting on this needs to
 * know it is a lead, not a finding.
 */
export default function RepeatOffenders() {
  const { rows, loading, error, missingView } = useManufacturers()

  // A firm seen once is not a repeat of anything; the page is about patterns.
  const repeat = useMemo(() => rows.filter((r) => r.scan_count > 1), [rows])
  const singles = rows.length - repeat.length

  return (
    <div className="stack">
      <div>
        <h1 className="headline">Repeat offenders</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          Packers ranked by how often their packages were flagged
        </div>
      </div>

      {missingView && (
        <Banner kind="error">
          <strong>The manufacturer view does not exist yet.</strong> Re-run{' '}
          <code>supabase/schema.sql</code> in the Supabase SQL editor — it is idempotent, so running
          the whole file again is safe.
        </Banner>
      )}

      {error && <Banner kind="error">Couldn’t load manufacturers: {error}</Banner>}

      {!loading && !missingView && rows.length > 0 && (
        <Banner kind="info">
          <strong>Grouped by the name printed on the pack.</strong> That is the only identifier a
          photograph reliably gives, so a firm can still appear twice under spellings the grouping
          has not been taught, and two unrelated firms sharing a trading name will merge. Treat a
          row as a lead to verify, not a proven record.
        </Banner>
      )}

      {loading ? (
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner dark />
        </div>
      ) : repeat.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<InboxIcon size={48} />}
            title="No repeat packers yet"
            text={
              rows.length > 0
                ? `${rows.length} packer${rows.length === 1 ? ' has' : 's have'} been inspected once each. A packer appears here after a second inspection.`
                : 'Once inspections record a manufacturer name, packers appear here.'
            }
          />
        </div>
      ) : (
        <>
          <div className="card card--flush">
            <div className="mfr-table" role="table" aria-label="Packers by flagged inspections">
              <div className="mfr-row mfr-row--head" role="row">
                <span role="columnheader">Packer</span>
                <span role="columnheader">Flagged</span>
                <span role="columnheader">Inspections</span>
                <span role="columnheader">Share</span>
                <span role="columnheader">Last seen</span>
              </div>

              {repeat.map((r) => {
                const share = flaggedShare(r.flagged_count, r.scan_count)
                return (
                  <div className="mfr-row" role="row" key={r.manufacturer_key}>
                    <span className="mfr-name" role="cell" title={r.manufacturer_name ?? undefined}>
                      {r.manufacturer_name || r.manufacturer_key}
                    </span>
                    <span className="mfr-num mfr-num--flagged" role="cell">
                      {r.flagged_count}
                    </span>
                    <span className="mfr-num" role="cell">
                      {r.scan_count}
                    </span>
                    <span role="cell">
                      <span className="mfr-bar" aria-hidden="true">
                        <span className="mfr-bar__fill" style={{ width: `${share}%` }} />
                      </span>
                      <span className="mfr-share">{share}%</span>
                    </span>
                    <span className="mfr-num" role="cell">
                      {r.last_seen ? formatDateShort(r.last_seen) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {singles > 0 && (
            <div className="muted" style={{ fontSize: 12.5 }}>
              {singles} packer{singles === 1 ? '' : 's'} inspected only once {singles === 1 ? 'is' : 'are'} not
              listed.
            </div>
          )}
        </>
      )}
    </div>
  )
}
