import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Spinner } from '@/components/page-header'
import { Button } from '@/components/ui/button'

export default function AccessDenied() {
  const { deniedReason, googleEmail, signOut } = useAuth()
  const [loading, setLoading] = useState(false)

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="bg-destructive-muted text-destructive mx-auto grid size-14 place-items-center rounded-full">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Access not authorised</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{deniedReason}</p>
        {googleEmail && (
          <p className="text-muted-foreground mt-3 text-xs">Signed in as {googleEmail}</p>
        )}
        <Button
          className="mt-6 w-full"
          disabled={loading}
          onClick={async () => {
            setLoading(true)
            await signOut()
          }}
        >
          {loading && <Spinner />}
          Sign out
        </Button>
      </div>
    </div>
  )
}
