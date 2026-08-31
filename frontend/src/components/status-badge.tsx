import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * The compliance verdict, rendered from the backend's status string.
 *
 * The verdict is decided by the rule engine, never here — this only chooses how
 * to show it. An unrecognised status is shown as-is rather than guessed at.
 */
export function StatusBadge({ status }: { status?: string | null }) {
  const s = (status || '').toLowerCase()

  if (s === 'compliant') {
    return (
      <Badge variant="success">
        <CheckCircle2 />
        Compliant
      </Badge>
    )
  }
  if (s === 'flagged' || s === 'violation' || s === 'non-compliant') {
    return (
      <Badge variant="destructive">
        <TriangleAlert />
        Flagged
      </Badge>
    )
  }
  return <Badge variant="outline">{status || 'Unknown'}</Badge>
}
