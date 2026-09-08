import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface a clear error early rather than failing deep inside a request.
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local',
  )
}

/** The Supabase project this build points at, e.g. 'abcd1234'.
 *
 * Development and production are separate projects, chosen by a gitignored
 * .env.local. Vite bakes these values in at build time, so a stale file is
 * invisible once the app is running — this is what the dev-only badge shows. */
export const SUPABASE_PROJECT_REF = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0]
  } catch {
    return 'unknown'
  }
})()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const EVIDENCE_BUCKET = 'evidence-photos'
