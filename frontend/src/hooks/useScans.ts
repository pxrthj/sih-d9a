import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { ScanRecord } from '../lib/types'

// The `advisories` column is added by a later revision of supabase/schema.sql.
// Select it when it exists and fall back when it does not, so the app keeps
// working against a project whose schema has not been re-run yet.
const SCAN_COLUMNS =
  'id, created_at, storage_path, extracted, violations, advisories, status, user_id, category'
const SCAN_COLUMNS_LEGACY =
  'id, created_at, storage_path, extracted, violations, status, user_id, category'

function isMissingColumn(message?: string | null): boolean {
  return !!message && /column .*advisories.* does not exist/i.test(message)
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

      let { data, error: err } = await build(SCAN_COLUMNS)
      if (err && isMissingColumn(err.message)) {
        ;({ data, error: err } = await build(SCAN_COLUMNS_LEGACY))
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

      let { data, error: err } = await build(SCAN_COLUMNS)
      if (err && isMissingColumn(err.message)) {
        ;({ data, error: err } = await build(SCAN_COLUMNS_LEGACY))
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
