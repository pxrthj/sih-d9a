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

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') || ''

/** Public URL for an evidence photo stored in the (public) evidence-photos bucket. */
export function evidenceUrl(path?: string | null): string | null {
  const clean = path?.trim()
  if (!clean || !SUPABASE_URL) return null
  return `${SUPABASE_URL}/storage/v1/object/public/evidence-photos/${encodeURIComponent(clean)}`
}

/**
 * Resolve the front/back evidence filenames for a scan. Prefers explicit
 * front_path/back_path if ever present; otherwise splits the combined
 * storage_path ("front.jpg | back.jpg"). Older single-image rows yield front only.
 */
export function evidencePaths(scan: ScanRecord): { front: string | null; back: string | null } {
  if (scan.front_path || scan.back_path) {
    return { front: scan.front_path ?? null, back: scan.back_path ?? null }
  }
  const sp = scan.storage_path?.trim()
  if (!sp) return { front: null, back: null }
  const parts = sp.split('|').map((s) => s.trim()).filter(Boolean)
  return { front: parts[0] ?? null, back: parts[1] ?? null }
}

/** Nicely spaced label for an extracted/violation field key. */
export function fieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bmrp\b/i, 'MRP')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
