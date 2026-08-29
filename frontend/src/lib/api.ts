import { supabase, EVIDENCE_BUCKET } from './supabase'
import type { CaptureCoords, ScanResponse, Verification } from './types'

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

/** Bearer header carrying the current Supabase session token, if signed in. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** File extension for the image types a phone camera can hand us. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/**
 * Uploads a single image to the Supabase Storage "evidence-photos" bucket
 * under a random `${uuid}.${ext}` key and returns the stored object path.
 *
 * The extension and content type follow the real file: the backend guesses the
 * MIME type from the stored filename before handing the bytes to Gemini, so
 * naming a PNG ".jpg" would send it up mislabelled.
 */
export async function uploadEvidencePhoto(file: File): Promise<string> {
  const mime = (file.type || '').toLowerCase()
  const ext = EXT_BY_MIME[mime] ?? 'jpg'
  const contentType = EXT_BY_MIME[mime] ? mime : 'image/jpeg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, {
      contentType,
      upsert: false,
    })
  if (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
  return path
}

/**
 * Short-lived signed URLs for a scan's evidence photos, in capture order.
 *
 * The bucket is private and has no client read policy, so the URLs are minted
 * by the backend with its service-role key after it checks the same
 * owner-or-admin rule as the notice.
 */
export async function fetchEvidenceUrls(scanId: string | number): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/evidence`, {
    headers: await authHeaders(),
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // not JSON; keep the status code
    }
    throw new Error(`Could not load evidence photos (${detail})`)
  }
  const body = (await res.json()) as {
    images?: { path?: string; url?: string | null }[]
    // tolerated so a newer frontend still works against an older backend
    front?: string | null
    back?: string | null
  }
  if (Array.isArray(body.images)) {
    return body.images.map((i) => i.url).filter((u): u is string => !!u)
  }
  return [body.front, body.back].filter((u): u is string => !!u)
}

/**
 * Calls the backend scan pipeline. The backend fetches every image from
 * storage, runs Gemini extraction + the rule engine, persists the record
 * (owned by user_id), and returns the extraction, violations and advisories.
 */
export async function createScan(params: {
  imagePaths: string[]
  userId: string
  category: string
  /** Capture location, when the device provided one. Omitted otherwise. */
  coords?: CaptureCoords | null
}): Promise<ScanResponse> {
  const res = await fetch(`${API_BASE_URL}/api/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      image_paths: params.imagePaths,
      user_id: params.userId,
      category: params.category,
      // Only sent when a fix was obtained; the backend treats all three as optional.
      ...(params.coords && {
        latitude: params.coords.latitude,
        longitude: params.coords.longitude,
        location_accuracy: params.coords.accuracy ?? undefined,
      }),
    }),
  })

  if (!res.ok) {
    let detail = `Scan failed (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // response body was not JSON; keep the generic message
    }
    throw new Error(detail)
  }

  return (await res.json()) as ScanResponse
}

/**
 * Fetches the generated Improvement Notice PDF for a scan.
 * Read-only — the backend generates the document from the immutable record.
 *
 * The filename comes from the server so the downloaded file matches the
 * reference printed on the notice itself.
 */
export async function fetchImprovementNotice(
  scanId: string | number,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/notice`, {
    headers: await authHeaders(),
  })
  if (!res.ok) {
    let detail = `Could not generate the notice (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // not JSON; keep generic message
    }
    throw new Error(detail)
  }
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/.exec(disposition)
  return {
    blob: await res.blob(),
    filename: match?.[1] ?? `improvement-notice-${String(scanId).slice(0, 8)}.pdf`,
  }
}

/**
 * Public verification of a notice — no sign-in, because whoever holds the
 * printed document needs to be able to check it. The backend returns only what
 * is already printed there.
 */
export async function fetchVerification(scanId: string): Promise<Verification> {
  const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/verify`)
  if (!res.ok) {
    let detail =
      res.status === 404
        ? 'No inspection record matches this reference.'
        : `Verification is unavailable right now (HTTP ${res.status}).`
    try {
      const body = await res.json()
      if (body?.detail && typeof body.detail === 'string') detail = body.detail
    } catch {
      // not JSON; keep the message above
    }
    throw new Error(detail)
  }
  return (await res.json()) as Verification
}
