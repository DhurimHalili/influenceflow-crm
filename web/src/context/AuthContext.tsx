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
import type { Profile, Theme } from '../lib/types'
import { DEFAULT_THEME, isTheme } from '../lib/themes'

function normalizeTheme(v: unknown): Theme {
  if (isTheme(v)) return v
  // legacy values map to closest: dark stays dark, everything else → agency default
  if (v === 'dark') return 'dark'
  if (v === 'light') return 'light'
  return DEFAULT_THEME
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (data) {
      // Explicit choice on this device (localStorage) always wins — it reflects
      // the last theme the user actually picked. DB value is only a fallback
      // for new devices, then mirrored locally so later reloads stay stable
      // (this stops the "flips to another theme seconds after load" bug).
      const local = localStorage.getItem('if-theme')
      const theme = local && isTheme(local) ? local : normalizeTheme((data as Profile).theme)
      if (!local || !isTheme(local)) localStorage.setItem('if-theme', theme)
      setProfile({ ...(data as Profile), theme })
      document.documentElement.dataset.theme = theme
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await loadProfile(session.user.id)
  }, [loadProfile, session?.user?.id])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) loadProfile(data.session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next?.user) loadProfile(next.user.id)
      else setProfile(null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!session?.user?.id) return
      const { data, error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', session.user.id)
        .select('*')
        .single()
      if (!error && data) {
        setProfile(data as Profile)
        if (patch.theme) document.documentElement.dataset.theme = patch.theme
      }
    },
    [session?.user?.id],
  )

  const setTheme = useCallback(
    async (theme: Theme) => {
      document.documentElement.dataset.theme = theme
      localStorage.setItem('if-theme', theme)
      await updateProfile({ theme })
    },
    [updateProfile],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    // Drop the device-level choice so the next login starts from that
    // account's saved theme (or the default) instead of inheriting this one.
    localStorage.removeItem('if-theme')
    document.documentElement.dataset.theme = DEFAULT_THEME
    setProfile(null)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('if-theme')
    if (saved && !profile && isTheme(saved)) document.documentElement.dataset.theme = saved
    else if (!saved && !profile) document.documentElement.dataset.theme = DEFAULT_THEME
  }, [profile])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      updateProfile,
      setTheme,
      signOut,
    }),
    [session, profile, loading, refreshProfile, updateProfile, setTheme, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
