import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { ManufacturerOffence } from '../lib/types'

/** True when the database has not had the repeat-offender view created yet. */
function isMissingView(message?: string | null): boolean {
  return (
    !!message &&
    /(relation|table).*(does not exist)|could not find the table|schema cache/i.test(message)
  )
}

interface UseManufacturersResult {
  rows: ManufacturerOffence[]
  loading: boolean
  error: string | null
  /** The view is absent — supabase/schema.sql has not been re-run. */
  missingView: boolean
}

/**
 * Inspection history grouped by packer, worst first.
 *
 * Reads the manufacturer_offences view, which derives a firm's identity from
 * the printed name at query time. The view is declared security_invoker, so the
 * policies on "scans" still apply: an officer sees only their own inspections
 * here, an admin sees every officer's.
 */
export function useManufacturers(): UseManufacturersResult {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<ManufacturerOffence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingView, setMissingView] = useState(false)

  useEffect(() => {
    if (!user || !profile) return
    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)
      setMissingView(false)

      const { data, error: err } = await supabase
        .from('manufacturer_offences')
        .select('manufacturer_key, manufacturer_name, scan_count, flagged_count, first_seen, last_seen')
        .order('flagged_count', { ascending: false })
        .order('scan_count', { ascending: false })

      if (!active) return

      if (err) {
        if (isMissingView(err.message)) setMissingView(true)
        else setError(err.message)
        setRows([])
      } else {
        setRows((data ?? []) as unknown as ManufacturerOffence[])
      }
      setLoading(false)
    }

    void run()
    return () => {
      active = false
    }
  }, [user, profile])

  return { rows, loading, error, missingView }
}
