import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * A single figure with its label.
 *
 * `tone` is limited to the compliance semantics — a number is green only when
 * it counts compliant packages, red only when it counts breaches.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  // Counts get the large numeral; a label-shaped value (a rule reference, say)
  // gets 'sm', because setting a citation at 30px reads as a headline rather
  // than as a figure and pushes its own hint into a second line.
  size = 'default',
  loading,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'success' | 'destructive'
  size?: 'default' | 'sm'
  loading?: boolean
  className?: string
}) {
  return (
    <Card className={cn('gap-0 p-4', className)}>
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <div
          className={cn(
            'mt-1 font-semibold tabular-nums',
            size === 'sm' ? 'text-xl' : 'text-3xl',
            tone === 'success' && 'text-success',
            tone === 'destructive' && 'text-destructive',
          )}
        >
          {value}
        </div>
      )}
      {hint && <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{hint}</p>}
    </Card>
  )
}
