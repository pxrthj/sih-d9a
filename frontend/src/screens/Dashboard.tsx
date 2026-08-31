import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Inbox, MapPin, ScanLine, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { useScans } from '@/hooks/useScans'
import { useRepeatOffenders } from '@/hooks/useRepeatOffenders'
import { AppAvatar } from '@/components/app-avatar'
import { EmptyState } from '@/components/empty-state'
import { InspectionMap } from '@/components/inspection-map'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fieldLabel, formatDateShort, scanTitle, topBreach, violationCount } from '@/lib/format'
import type { ScanRecord } from '@/lib/types'

/** Counts shared by both dashboards. */
function useTotals(scans: ScanRecord[]) {
  return useMemo(() => {
    const total = scans.length
    const compliant = scans.filter((s) => (s.status || '').toLowerCase() === 'compliant').length
    return { total, compliant, flagged: total - compliant }
  }, [scans])
}

/** A tappable summary of one inspection, used in the officer's recent list. */
function ScanRow({ scan }: { scan: ScanRecord }) {
  const count = violationCount(scan)
  return (
    <Link
      to={`/scan/${scan.id}`}
      className="hover:bg-muted/60 flex items-center gap-3 px-4 py-3 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{scanTitle(scan.extracted)}</div>
        <div className="text-muted-foreground truncate text-xs">
          {/* Date first: on a narrow row this line truncates, and a clipped
              category is far less costly than a clipped inspection date. */}
          {formatDateShort(scan.created_at)}
          {scan.category ? ` · ${scan.category}` : ''}
          {count > 0 ? ` · ${count} violation${count === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      <StatusBadge status={scan.status} />
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Officer — the field app
// ---------------------------------------------------------------------------

function OfficerDashboard() {
  const { googleName, avatarUrl } = useAuth()
  const navigate = useNavigate()
  const { scans, loading, error } = useScans()
  const { total, compliant, flagged } = useTotals(scans)
  const recent = scans.slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Welcome back,</p>
          <h1 className="text-2xl font-semibold tracking-tight">{googleName.split(' ')[0]}</h1>
        </div>
        <AppAvatar src={avatarUrl} name={googleName} className="size-11" />
      </div>

      <Button size="lg" className="w-full" onClick={() => navigate('/scan')}>
        <ScanLine />
        New compliance scan
      </Button>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Couldn’t load scans: {error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Your inspections" value={total} loading={loading} />
        <StatCard label="Compliant" value={compliant} tone="success" loading={loading} />
        <StatCard
          label="Flagged"
          value={flagged}
          tone="destructive"
          loading={loading}
          className="col-span-2"
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Recent scans</SectionLabel>
          {recent.length > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link to="/history">View all</Link>
            </Button>
          )}
        </div>

        <Card className="divide-y p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No scans yet"
              text="Run your first compliance scan to see inspection records here."
            />
          ) : (
            recent.map((s) => <ScanRow key={s.id} scan={s} />)
          )}
        </Card>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admin — the supervisory console
// ---------------------------------------------------------------------------

function RepeatOffenders() {
  const { offenders, loading, unavailable } = useRepeatOffenders(2)

  // The database has no repeat_offenders() function yet — say what to do about
  // it rather than showing an empty panel or a raw Postgres error.
  if (unavailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Repeat offenders</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Re-run <code className="text-foreground font-mono text-xs">supabase/schema.sql</code> to
            enable this panel.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repeat offenders</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="space-y-3 px-5">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : offenders.length === 0 ? (
          <p className="text-muted-foreground px-5 text-sm leading-relaxed">
            No packer has been found in breach more than once yet.
          </p>
        ) : (
          <ul className="divide-y">
            {offenders.slice(0, 6).map((o) => (
              <li key={o.manufacturer} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.manufacturer}</div>
                  <div className="text-muted-foreground text-xs">
                    {o.scans_flagged} of {o.scans_total} inspections flagged · last{' '}
                    {formatDateShort(o.last_seen)}
                  </div>
                </div>
                <Badge variant="destructive" className="tabular-nums">
                  {o.scans_flagged}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AdminDashboard() {
  const { scans, loading, error } = useScans()
  const { total, compliant, flagged } = useTotals(scans)
  const breach = useMemo(() => topBreach(scans), [scans])
  const located = useMemo(
    () => scans.filter((s) => s.latitude != null && s.longitude != null),
    [scans],
  )
  const recent = scans.slice(0, 8)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Compliance activity across every inspection officer."
      />

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Couldn’t load scans: {error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total inspections" value={total} loading={loading} />
        <StatCard label="Compliant" value={compliant} tone="success" loading={loading} />
        <StatCard label="Flagged" value={flagged} tone="destructive" loading={loading} />
        <StatCard
          label="Most-breached rule"
          size="sm"
          value={breach?.ruleRef ?? '—'}
          hint={
            breach
              ? `${fieldLabel(breach.field)} · ${breach.share}% of flagged packages`
              : 'No breaches recorded yet'
          }
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden p-0">
          <CardHeader className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <CardTitle>Where inspections happened</CardTitle>
            <span className="text-muted-foreground text-xs">
              {located.length} of {total} located
            </span>
          </CardHeader>
          {located.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No located inspections"
              text="Scans record the officer’s coordinates when location permission is granted."
            />
          ) : (
            <InspectionMap scans={located} className="h-[380px] w-full border-t" />
          )}
        </Card>

        <RepeatOffenders />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Recent activity · all officers</SectionLabel>
          <Button variant="link" size="sm" className="h-auto p-0" asChild>
            <Link to="/history">View all</Link>
          </Button>
        </div>

        <Card className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No inspections yet"
              text="Completed compliance scans will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Violations</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link to={`/scan/${s.id}`} className="hover:underline">
                        {scanTitle(s.extracted)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.category || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
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
          )}
        </Card>
      </section>
    </div>
  )
}

export default function Dashboard() {
  const { isAdmin } = useAuth()
  return isAdmin ? <AdminDashboard /> : <OfficerDashboard />
}
