import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CheckCircle2, TriangleAlert, Users as UsersIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import type { Profile, ProfileStatus, Role } from '@/lib/types'
import { AppAvatar } from '@/components/app-avatar'
import { EmptyState } from '@/components/empty-state'
import { PageHeader, Spinner } from '@/components/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateShort } from '@/lib/format'

function RoleBadge({ role }: { role: Role }) {
  if (role === 'admin') return <Badge variant="warning">Admin</Badge>
  if (role === 'officer') return <Badge variant="secondary">Officer</Badge>
  return <Badge variant="outline">No access</Badge>
}

function EditDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile
  onClose: () => void
  onSaved: (p: Profile) => void
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [role, setRole] = useState<Role>(profile.role)
  const [status, setStatus] = useState<ProfileStatus>(profile.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const changed =
    fullName !== (profile.full_name ?? '') || role !== profile.role || status !== profile.status

  async function save() {
    setSaving(true)
    setError(null)
    // NOTE: only profile fields — never any scan or inspection data — are writable.
    const { data, error: err } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null, role, status })
      .eq('id', profile.id)
      .select('id, email, full_name, role, status, created_at')
      .maybeSingle()

    if (err) {
      setError(err.message)
      setSaving(false)
      setConfirming(false)
      return
    }
    onSaved((data as Profile) ?? { ...profile, full_name: fullName, role, status })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage user</DialogTitle>
          <DialogDescription>{profile.email}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="officer">Inspection officer</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                {profile.role === 'none' && <SelectItem value="none">No access</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Account status</Label>
            <Tabs value={status} onValueChange={(v) => setStatus(v as ProfileStatus)}>
              <TabsList className="w-full">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="inactive">Inactive</TabsTrigger>
              </TabsList>
            </Tabs>
            {status === 'inactive' && (
              <p className="text-muted-foreground text-xs">
                Inactive users are denied access at login.
              </p>
            )}
          </div>
        </div>

        {confirming && (
          <Alert variant="info">
            <AlertDescription>
              Apply these changes to <strong>{profile.email}</strong>?
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving && <Spinner />}
                Confirm
              </Button>
            </>
          ) : (
            <Button disabled={!changed} onClick={() => setConfirming(true)}>
              Save changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Users() {
  const { isAdmin, user } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, status, created_at')
        .order('created_at', { ascending: false })
      if (!active) return
      if (err) setError(err.message)
      else setProfiles((data ?? []) as Profile[])
      setLoading(false)
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  // Officers must never reach this screen.
  if (!isAdmin) return <Navigate to="/" replace />

  function handleSaved(updated: Profile) {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setEditing(null)
    setToast(`Updated ${updated.email ?? 'user'}`)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage officer and administrator access. Inspection records are immutable and cannot be altered here."
      />

      {toast && (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertDescription>{toast}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Couldn’t load users: {error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </Card>
      ) : profiles.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersIcon}
            title="No users yet"
            text="Registered users will appear here after their first sign-in."
          />
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <AppAvatar name={p.full_name || p.email} className="size-8" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="truncate">{p.full_name || p.email || 'Unknown'}</span>
                          {p.id === user?.id && <Badge variant="outline">You</Badge>}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">{p.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateShort(p.created_at)}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={p.role} />
                  </TableCell>
                  <TableCell>
                    {p.status === 'inactive' ? (
                      <Badge variant="destructive">Inactive</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Active</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editing && (
        <EditDialog profile={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
