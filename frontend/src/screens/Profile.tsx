import { useState } from 'react'
import { LogOut, Shield } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { AppAvatar } from '@/components/app-avatar'
import { Field } from '@/components/ScanResult'
import { PageHeader, Spinner } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function Profile() {
  const { googleName, googleEmail, avatarUrl, profile, isAdmin, signOut } = useAuth()
  const [loading, setLoading] = useState(false)

  const roleLabel =
    profile?.role === 'admin'
      ? 'Administrator'
      : profile?.role === 'officer'
        ? 'Inspection Officer'
        : '—'

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" />

      <Card className="items-center px-5 py-8 text-center">
        <AppAvatar src={avatarUrl} name={googleName} className="size-20" />
        <div className="mt-4 text-lg font-semibold">{googleName}</div>
        <div className="text-muted-foreground text-sm">{googleEmail}</div>
        <Badge variant={isAdmin ? 'warning' : 'secondary'} className="mt-3">
          <Shield />
          {roleLabel}
        </Badge>
      </Card>

      <Card>
        <dl>
          <Field label="Full name" value={profile?.full_name || googleName} />
          <Field label="Email" value={googleEmail || '—'} />
          <Field label="Role" value={roleLabel} />
          <Field label="Account status">
            <span className="capitalize">{profile?.status || '—'}</span>
          </Field>
        </dl>
      </Card>

      <Button
        variant="outline"
        className="text-destructive hover:text-destructive w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true)
          await signOut()
        }}
      >
        {loading ? <Spinner /> : <LogOut />}
        Sign out
      </Button>

      <p className="text-muted-foreground text-center text-xs">
        ParakhMitra · Legal Metrology Compliance
      </p>
    </div>
  )
}
