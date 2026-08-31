import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { ScanRecord } from '../lib/types'

// Candidate column sets, widest first. Later revisions of supabase/schema.sql
// added optional columns (advisories, then latitude/longitude/location_accuracy);
// each fallback drops the columns a not-yet-migrated database may lack, so the
// app keeps working while a migration rolls out.
const COLUMN_SETS = [
  'id, created_at, storage_path, extracted, violations, advisories, status, user_id, category, latitude, longitude, location_accuracy',
  'id, created_at, storage_path, extracted, violations, advisories, status, user_id, category',
  'id, created_at, storage_path, extracted, violations, status, user_id, category',
]

function isMissingColumn(message?: string | null): boolean {
  return !!message && /column .* does not exist/i.test(message)
}

interface UseScansResult {
  scans: ScanRecord[]
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Loads real rows from the Supabase "scans" table, scoped by role:
 * officers see only their own scans (user_id === them); admins see all.
 * RLS enforces the same scoping server-side.
 */
export function useScans(limit?: number): UseScansResult {
  const { user, isAdmin, profile } = useAuth()
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!user || !profile) return
    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)

      const build = (columns: string) => {
        let q = supabase
          .from('scans')
          .select(columns)
          .order('created_at', { ascending: false })
        if (!isAdmin) q = q.eq('user_id', user.id)
        if (limit) q = q.limit(limit)
        return q
      }

      let data = null
      let err = null
      for (const columns of COLUMN_SETS) {
        ;({ data, error: err } = await build(columns))
        if (!err || !isMissingColumn(err.message)) break
      }
      if (!active) return
      if (err) {
        setError(err.message)
        setScans([])
      } else {
        setScans((data ?? []) as unknown as ScanRecord[])
      }
      setLoading(false)
    }

    void run()

    return () => {
      active = false
    }
  }, [user, profile, isAdmin, limit, nonce])

  return { scans, loading, error, reload }
}

/** Loads a single real scan row by id (role-scoped by RLS). */
export function useScan(id: string | undefined) {
  const [scan, setScan] = useState<ScanRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)
      const build = (columns: string) =>
        supabase.from('scans').select(columns).eq('id', id).maybeSingle()

      let data = null
      let err = null
      for (const columns of COLUMN_SETS) {
        ;({ data, error: err } = await build(columns))
        if (!err || !isMissingColumn(err.message)) break
      }
      if (!active) return
      if (err) setError(err.message)
      else setScan((data as unknown as ScanRecord) ?? null)
      setLoading(false)
    }

    void run()

    return () => {
      active = false
    }
  }, [id])

  return { scan, loading, error }
}
