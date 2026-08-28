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

/** Nicely spaced label for an extracted/violation field key. */
export function fieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bmrp\b/i, 'MRP')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
