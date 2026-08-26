import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { ScanRecord } from '../lib/types'

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

      let query = supabase
        .from('scans')
        .select('id, created_at, storage_path, extracted, violations, status, user_id, category')
        .order('created_at', { ascending: false })

      if (!isAdmin) {
        query = query.eq('user_id', user.id)
      }
      if (limit) {
        query = query.limit(limit)
      }

      const { data, error: err } = await query
      if (!active) return
      if (err) {
        setError(err.message)
        setScans([])
      } else {
        setScans((data ?? []) as ScanRecord[])
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
      const { data, error: err } = await supabase
        .from('scans')
        .select('id, created_at, storage_path, extracted, violations, status, user_id, category')
        .eq('id', id)
        .maybeSingle()
      if (!active) return
      if (err) setError(err.message)
      else setScan((data as ScanRecord) ?? null)
      setLoading(false)
    }

    void run()

    return () => {
      active = false
    }
  }, [id])

  return { scan, loading, error }
}
