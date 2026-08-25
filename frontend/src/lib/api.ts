import { supabase, EVIDENCE_BUCKET } from './supabase'
import type { ScanResponse } from './types'

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

/**
 * Uploads a single image to the Supabase Storage "evidence-photos" bucket
 * under a random `${uuid}.jpg` key and returns the stored object path.
 */
export async function uploadEvidencePhoto(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    })
  if (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
  return path
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
}): Promise<ScanResponse> {
  const res = await fetch(`${API_BASE_URL}/api/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      front_path: params.frontPath,
      back_path: params.backPath,
      user_id: params.userId,
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
