import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** true while the initial session + profile are being resolved */
  loading: boolean
  /** the profile row exists but role/status forbids access */
  accessDenied: boolean
  deniedReason: string | null
  googleName: string
  googleEmail: string
  avatarUrl: string | null
  isAdmin: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

function hasAccess(profile: Profile | null): boolean {
  if (!profile) return false
  if (profile.status !== 'active') return false
  return profile.role === 'admin' || profile.role === 'officer'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    setLoadingProfile(true)
    try {
      // The profile row is created by a DB trigger on first sign-in. Retry a
      // couple of times to absorb any replication lag right after sign-up.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, status, created_at')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('Failed to load profile:', error.message)
          break
        }
        if (data) {
          setProfile(data as Profile)
          setLoadingProfile(false)
          return
        }
        await new Promise((r) => setTimeout(r, 600))
      }
      setProfile(null)
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoadingSession(false)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoadingSession(false)
      if (newSession?.user) {
        void loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [session, loadProfile])

  const user = session?.user ?? null
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>

  const value = useMemo<AuthValue>(() => {
    const denied = !!session && !loadingProfile && !hasAccess(profile)
    let reason: string | null = null
    if (denied) {
      if (profile && profile.status === 'inactive') {
        reason = 'Your account has been deactivated by an administrator.'
      } else if (profile && profile.role === 'none') {
        reason =
          'This Google account is not authorised for ParakhMitra. Access is limited to registered inspection officers.'
      } else {
        reason =
          'No compliance profile is linked to this Google account. Please contact your administrator.'
      }
    }

    return {
      session,
      user,
      profile,
      loading: loadingSession || (!!session && loadingProfile && !profile),
      accessDenied: denied,
      deniedReason: reason,
      googleName:
        (meta.full_name as string) ||
        (meta.name as string) ||
        profile?.full_name ||
        user?.email ||
        'Officer',
      googleEmail: (user?.email as string) || (meta.email as string) || profile?.email || '',
      avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || null,
      isAdmin: profile?.role === 'admin' && profile?.status === 'active',
      signInWithGoogle,
      signOut,
      refreshProfile,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile, loadingSession, loadingProfile, signInWithGoogle, signOut, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
