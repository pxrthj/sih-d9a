import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Inbox, Search, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { useScans } from '@/hooks/useScans'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateShort, scanTitle, violationCount } from '@/lib/format'
import type { ScanRecord } from '@/lib/types'

type Filter = 'all' | 'compliant' | 'violations'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'compliant', label: 'Compliant' },
  { value: 'violations', label: 'Violations' },
]

export default function History() {
  const { isAdmin } = useAuth()
  const { scans, loading, error } = useScans()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scans.filter((s) => {
      const status = (s.status || '').toLowerCase()
      if (filter === 'compliant' && status !== 'compliant') return false
      if (filter === 'violations' && violationCount(s) === 0) return false
      if (q) {
        const haystack = [
          scanTitle(s.extracted),
          s.extracted?.manufacturer_packer_importer,
          s.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [scans, filter, query])

  const empty = (
    <EmptyState
      icon={Inbox}
      title={scans.length === 0 ? 'No inspections yet' : 'No matching records'}
      text={
        scans.length === 0
          ? 'Completed compliance scans will appear here.'
          : 'Try a different filter or search term.'
      }
    />
  )

  return (
    <div className={isAdmin ? 'space-y-6' : 'space-y-5'}>
      <PageHeader
        title="Inspections"
        description={
          isAdmin
            ? 'System-wide inspection history across all officers.'
            : 'Your inspection history.'
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search by manufacturer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="w-full sm:w-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Couldn’t load scans: {error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/5" />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>{empty}</Card>
      ) : isAdmin ? (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commodity</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Violations</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link to={`/scan/${s.id}`} className="hover:underline">
                      {scanTitle(s.extracted)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[18rem] truncate">
                    {s.extracted?.manufacturer_packer_importer?.split(',')[0] || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.category || '—'}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateShort(s.created_at)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{violationCount(s)}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={s.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {filtered.map((s: ScanRecord) => {
            const count = violationCount(s)
            return (
              <Link
                key={s.id}
                to={`/scan/${s.id}`}
                className="hover:bg-muted/60 flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{scanTitle(s.extracted)}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {/* Date first — see the note in Dashboard's ScanRow. */}
                    {formatDateShort(s.created_at)}
                    {s.category ? ` · ${s.category}` : ''}
                    {count > 0 ? ` · ${count} violation${count === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <StatusBadge status={s.status} />
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            )
          })}
        </Card>
      )}
    </div>
  )
}
