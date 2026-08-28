import { supabase, EVIDENCE_BUCKET } from './supabase'
import type { ScanResponse } from './types'

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
 * Short-lived signed URLs for a scan's two evidence photos.
 *
 * The bucket is private, so there is no public URL to link to — a signed URL is
 * minted per view and expires. Returns null for a path that is missing or that
 * the signed-in user is not allowed to read.
 */
export async function evidenceSignedUrls(
  front: string | null,
  back: string | null,
  expiresInSeconds = 3600,
): Promise<{ front: string | null; back: string | null }> {
  const sign = async (path: string | null): Promise<string | null> => {
    const clean = path?.trim()
    if (!clean) return null
    const { data, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(clean, expiresInSeconds)
    if (error) {
      console.warn(`Could not sign evidence photo "${clean}": ${error.message}`)
      return null
    }
    return data?.signedUrl ?? null
  }

  const [frontUrl, backUrl] = await Promise.all([sign(front), sign(back)])
  return { front: frontUrl, back: backUrl }
}

/**
 * Calls the backend scan pipeline. The backend fetches both images from
 * storage, runs Gemini extraction + the rule engine, persists the record
 * (owned by user_id), and returns the extraction + violations + status.
 */
export async function createScan(params: {
  frontPath: string
  backPath: string
  userId: string
  category: string
}): Promise<ScanResponse> {
  const res = await fetch(`${API_BASE_URL}/api/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      front_path: params.frontPath,
      back_path: params.backPath,
      user_id: params.userId,
      category: params.category,
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
 * Fetches the generated Improvement Notice PDF for a scan as a Blob.
 * Read-only — the backend generates the document from the immutable record.
 */
export async function fetchImprovementNotice(scanId: string | number): Promise<Blob> {
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
  return res.blob()
}
