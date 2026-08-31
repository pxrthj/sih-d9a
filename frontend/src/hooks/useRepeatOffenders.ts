import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'

/** One packer found in breach across more than one inspection. */
export interface RepeatOffender {
  manufacturer: string
  scans_total: number
  scans_flagged: number
  last_seen: string | null
}

interface UseRepeatOffendersResult {
  offenders: RepeatOffender[]
  loading: boolean
  /** True when the database has no repeat_offenders() function yet. */
  unavailable: boolean
}

/**
 * Packers with repeated non-compliant inspections, grouped in Postgres.
 *
 * The grouping runs server-side (supabase/schema.sql) so it covers every
 * inspection rather than the rows this client happens to have loaded. The
 * function is SECURITY INVOKER, so row level security still scopes the result:
 * an officer sees their own inspections, an admin sees all of them.
 *
 * `unavailable` is returned rather than an error string because a project whose
 * schema.sql has not been re-run simply lacks the function — the caller hides
 * the panel instead of showing the officer a database error they cannot act on.
 */
export function useRepeatOffenders(minFlagged = 2): UseRepeatOffendersResult {
  const { user, profile } = useAuth()
  const [offenders, setOffenders] = useState<RepeatOffender[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!user || !profile) return
    let active = true

    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('repeat_offenders', {
        min_flagged: minFlagged,
      })
      if (!active) return

      if (error) {
        // PGRST202 = no such function in the schema cache.
        setUnavailable(error.code === 'PGRST202' || /function .* does not exist/i.test(error.message))
        setOffenders([])
      } else {
        setUnavailable(false)
        setOffenders((data ?? []) as RepeatOffender[])
      }
      setLoading(false)
    }

    void run()

    return () => {
      active = false
    }
  }, [user, profile, minFlagged])

  return { offenders, loading, unavailable }
}
