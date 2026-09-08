import { useMemo, useState } from 'react'
import type { ScanRecord } from '../lib/types'

/**
 * Charts for the dashboard, drawn as inline SVG.
 *
 * No charting library: the frontend runs on four dependencies plus Leaflet, and
 * two small figures do not justify a fifth. Colour comes from the compliance
 * tokens rather than a chart palette — a verdict must look the same here as it
 * does on a record, and status colour is never reused to mean "series two".
 */

/* ---------------------------------------------------------------- helpers */

function isFlagged(scan: ScanRecord): boolean {
  return (scan.status || '').toLowerCase() !== 'compliant'
}

/** Local calendar day key, so buckets line up with the officer's day. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* -------------------------------------------------- compliance proportion */

/**
 * How the inspections split, as one bar rather than two numbers.
 *
 * Part-to-whole is what the reader actually wants here: "11 and 1" makes you do
 * the division yourself. The counts stay printed beside it, so the figure is
 * never carried by colour alone.
 */
export function ComplianceSplit({ scans }: { scans: ScanRecord[] }) {
  const total = scans.length
  const flagged = scans.filter(isFlagged).length
  const compliant = total - flagged

  if (total === 0) return null

  const pct = (n: number) => (n / total) * 100
  // Below this a segment renders as a sliver with no readable extent, so it is
  // floored — an inspection that exists should be visible on the bar.
  const floor = 1.5
  const cw = compliant === 0 ? 0 : Math.max(pct(compliant), floor)
  const fw = flagged === 0 ? 0 : Math.max(pct(flagged), floor)

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div className="chart-title">Compliance split</div>
        <div className="chart-note">{total} inspections</div>
      </div>

      <div className="splitbar" role="img"
        aria-label={`${compliant} of ${total} inspections compliant, ${flagged} flagged`}>
        {compliant > 0 && (
          <span className="splitbar__seg splitbar__seg--ok" style={{ width: `${cw}%` }} />
        )}
        {flagged > 0 && (
          <span className="splitbar__seg splitbar__seg--bad" style={{ width: `${fw}%` }} />
        )}
      </div>

      <div className="chart-legend">
        <span className="chart-legend__item">
          <span className="chart-legend__dot chart-legend__dot--ok" />
          Compliant <b>{compliant}</b>
          <span className="chart-legend__sep" aria-hidden="true">·</span>
          <span className="chart-legend__pct">{Math.round(pct(compliant))}%</span>
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__dot chart-legend__dot--bad" />
          Flagged <b>{flagged}</b>
          <span className="chart-legend__sep" aria-hidden="true">·</span>
          <span className="chart-legend__pct">{Math.round(pct(flagged))}%</span>
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------ activity over time */

const BAR_W = 14
const GAP = 8
const H = 92
const PAD_TOP = 10

/**
 * Inspections per day over a recent window.
 *
 * One series, so one hue and no legend — the title names it. Flagged
 * inspections are drawn as a darker foot on each column rather than a second
 * colour, which keeps the reading "how much work, and how much of it was bad"
 * in a single bar.
 */
export function ActivityChart({ scans, days = 14 }: { scans: ScanRecord[]; days?: number }) {
  const [hover, setHover] = useState<number | null>(null)

  const buckets = useMemo(() => {
    const today = new Date()
    const out: { key: string; label: string; total: number; flagged: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      out.push({
        key: dayKey(d.toISOString()),
        label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        total: 0,
        flagged: 0,
      })
    }
    const index = new Map(out.map((b, i) => [b.key, i]))
    for (const scan of scans) {
      if (!scan.created_at) continue
      const i = index.get(dayKey(scan.created_at))
      if (i === undefined) continue
      out[i].total += 1
      if (isFlagged(scan)) out[i].flagged += 1
    }
    return out
  }, [scans, days])

  const max = Math.max(...buckets.map((b) => b.total), 1)
  const active = buckets.filter((b) => b.total > 0).length

  // One column of activity is not a trend. Saying so is better than drawing a
  // chart that implies a pattern nobody measured.
  if (active < 2) {
    return (
      <div className="card chart-card">
        <div className="chart-head">
          <div className="chart-title">Inspection activity</div>
          <div className="chart-note">last {days} days</div>
        </div>
        <div className="chart-empty">
          Not enough activity yet to show a trend. Inspections appear here as they are recorded.
        </div>
      </div>
    )
  }

  const width = buckets.length * BAR_W + (buckets.length - 1) * GAP
  const shown = hover != null ? buckets[hover] : null

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div className="chart-title">Inspection activity</div>
        <div className="chart-note">
          {shown ? `${shown.label} · ${shown.total} inspection${shown.total === 1 ? '' : 's'}` : `last ${days} days`}
        </div>
      </div>

      <div className="chart-scroll">
        <svg
          className="activity"
          width="100%"
          viewBox={`0 0 ${width} ${H + 22}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Inspections per day over the last ${days} days`}
        >
          {/* Baseline only; a full grid would out-weigh 14 thin bars. */}
          <line x1="0" y1={H} x2={width} y2={H} className="activity__axis" />

          {buckets.map((b, i) => {
            const x = i * (BAR_W + GAP)
            const h = b.total === 0 ? 0 : Math.max(((H - PAD_TOP) * b.total) / max, 3)
            const fh = b.flagged === 0 ? 0 : Math.max(((H - PAD_TOP) * b.flagged) / max, 3)
            return (
              <g
                key={b.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* A full-height target, so a 3px bar is still hoverable. */}
                <rect x={x} y={0} width={BAR_W} height={H} fill="transparent" />
                {b.total > 0 && (
                  <>
                    <rect
                      className={`activity__bar ${hover === i ? 'is-hover' : ''}`}
                      x={x}
                      y={H - h}
                      width={BAR_W}
                      height={h}
                      rx="4"
                    />
                    {b.flagged > 0 && (
                      <rect
                        className="activity__bar--flagged"
                        x={x}
                        y={H - fh}
                        width={BAR_W}
                        height={fh}
                        rx="4"
                      />
                    )}
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Only the ends are labelled: a date under every column is noise. */}
      <div className="activity__axislabels">
        <span>{buckets[0].label}</span>
        <span>{buckets[buckets.length - 1].label}</span>
      </div>

      <div className="chart-legend">
        <span className="chart-legend__item">
          <span className="chart-legend__dot chart-legend__dot--brand" />
          Inspections
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__dot chart-legend__dot--bad" />
          Of which flagged
        </span>
      </div>
    </div>
  )
}
