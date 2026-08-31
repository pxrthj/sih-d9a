import type { ExtractedData, ScanRecord } from './types'

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** A human title for a scan derived only from its real extracted data. */
export function scanTitle(extracted?: ExtractedData | null): string {
  if (!extracted) return 'Package scan'
  // The generic commodity name (Rule 6(1)(b)) is the most recognisable title;
  // fall back to the packer, then the net quantity.
  const name = extracted.product_name
  if (name && name.trim()) return name.trim()
  const mfr = extracted.manufacturer_packer_importer
  if (mfr && mfr.trim()) {
    // First line / first ~40 chars of the manufacturer string.
    const firstLine = mfr.split(/[,\n]/)[0].trim()
    return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine
  }
  if (extracted.net_quantity?.value) {
    return `Package · ${extracted.net_quantity.value}${extracted.net_quantity.unit || ''}`
  }
  return 'Package scan'
}

export function netQuantityText(extracted?: ExtractedData | null): string | null {
  const nq = extracted?.net_quantity
  if (!nq || !nq.value) return null
  return `${nq.value}${nq.unit ? ` ${nq.unit}` : ''}`.trim()
}

export function mrpText(extracted?: ExtractedData | null): string | null {
  const mrp = extracted?.mrp
  if (!mrp || !mrp.value) return null
  return mrp.value
}

export function violationCount(scan: ScanRecord): number {
  return Array.isArray(scan.violations) ? scan.violations.length : 0
}

/**
 * Capture location for display, or null if the scan has no coordinates (the
 * officer denied permission, the device had no fix, or the DB predates the
 * location columns). `0,0` is a valid coordinate and is kept.
 */
export function formatLocation(
  scan: Pick<ScanRecord, 'latitude' | 'longitude' | 'location_accuracy'>,
): { text: string; mapsUrl: string } | null {
  const { latitude: lat, longitude: lng, location_accuracy: acc } = scan
  if (lat == null || lng == null) return null
  const accuracy = acc != null ? ` · ±${Math.round(acc)} m` : ''
  return {
    text: `${lat.toFixed(6)}, ${lng.toFixed(6)}${accuracy}`,
    mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
  }
}

/** The rule breached most often across a set of scans. */
export interface TopBreach {
  ruleRef: string
  field: string
  /** How many scans breached it. */
  count: number
  /** That count as a percentage of the scans carrying any violation. */
  share: number
}

/**
 * Finds the single most-breached rule across the given scans.
 *
 * Each of the eight rules can fire at most once per scan, so a rule's count is
 * also the number of packages that breached it. The share is measured against
 * scans that had any violation at all — compliant packages would only dilute it.
 *
 * Returns null when there is nothing to report, so the caller can hide the tile
 * rather than render an empty one.
 */
export function topBreach(scans: ScanRecord[]): TopBreach | null {
  const counts = new Map<string, { field: string; count: number }>()
  let flagged = 0

  for (const scan of scans) {
    const violations = Array.isArray(scan.violations) ? scan.violations : []
    if (violations.length === 0) continue
    flagged++
    for (const v of violations) {
      const entry = counts.get(v.rule_ref) ?? { field: v.field, count: 0 }
      entry.count++
      counts.set(v.rule_ref, entry)
    }
  }

  if (flagged === 0) return null

  // Highest count wins; ties break on the rule reference so the tile doesn't
  // flicker between equals as new scans arrive.
  const [ruleRef, top] = [...counts.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
  )[0]

  return {
    ruleRef,
    field: top.field,
    count: top.count,
    share: Math.round((top.count / flagged) * 100),
  }
}

/** Nicely spaced label for an extracted/violation field key. */
export function fieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bmrp\b/i, 'MRP')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
