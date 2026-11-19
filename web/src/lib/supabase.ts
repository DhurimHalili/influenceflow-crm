import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — rebuild with web/.env')
}

// Live build: Supabase is required (no demo/local fallback anywhere in the UI).
// hasSupabase lets contexts gate cloud sync; the client below still exists so
// auth calls fail loudly instead of crashing on null.
export const hasSupabase = Boolean(url && anon)

// ---------------------------------------------------------------------------
// Email-link returns (password reset, magic link, email change).
//
// The app uses hash routing (#/login, #/app...). Supabase appends its tokens
// to the redirect URL as a fragment too, which yields URLs such as
//   .../influenceflow-crm/#access_token=...&type=recovery
//   .../influenceflow-crm/#/update-password#access_token=...
//   .../influenceflow-crm/#error=access_denied&error_code=otp_expired&...
// The router cannot route those and supabase-js cannot reliably parse the
// double-hash form, so reset links landed on a 404 or did nothing. We read
// the fragment ourselves before anything renders, clean the URL, and hand the
// tokens to AuthContext, which opens the session and routes to the right page.
// PKCE links (?code=...) are handled the same way.
// ---------------------------------------------------------------------------
export type AuthRedirect =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string }
  | { kind: 'code'; code: string; type: string }
  | { kind: 'error'; code: string; description: string }

const readAuthRedirect = (): AuthRedirect | null => {
  if (typeof window === 'undefined') return null
  const { hash, search, pathname } = window.location
  const fragment = hash.includes('access_token=') || hash.includes('error=') || hash.includes('error_code=')
    ? hash.slice(hash.lastIndexOf('#') + 1).replace(/^\/?[^?]*\?/, '')
    : ''
  const params = new URLSearchParams(fragment)
  const query = new URLSearchParams(search)
  const hashQuery = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1)) : new URLSearchParams()
  let result: AuthRedirect | null = null
  if (params.get('access_token') && params.get('refresh_token')) {
    result = { kind: 'session', accessToken: params.get('access_token')!, refreshToken: params.get('refresh_token')!, type: params.get('type') || '' }
  } else if (params.get('error') || params.get('error_code')) {
    result = { kind: 'error', code: params.get('error_code') || params.get('error') || 'error', description: (params.get('error_description') || '').replace(/\+/g, ' ') }
  } else if (query.get('code') || hashQuery.get('code')) {
    const code = query.get('code') || hashQuery.get('code')!
    const isReset = hash.startsWith('#/update-password') || query.get('type') === 'recovery'
    result = { kind: 'code', code, type: isReset ? 'recovery' : query.get('type') || '' }
  } else if (query.get('error_description')) {
    result = { kind: 'error', code: query.get('error_code') || 'error', description: query.get('error_description') || '' }
  }
  if (!result) return null
  // Clean the address bar so tokens never stay in history / screenshots and
  // the hash router sees a normal route.
  const route =
    result.kind === 'error'
      ? `#/forgot-password?error=${encodeURIComponent(result.code)}`
      : result.type === 'recovery'
        ? '#/update-password'
        : '#/app'
  window.history.replaceState(null, '', `${pathname}${route}`)
  return result
}

export const pendingAuthRedirect: AuthRedirect | null = readAuthRedirect()

// ---------------------------------------------------------------------------
// A session ended on the server (signed out on every device, revoked, deleted)
// while this tab still holds its token. Table reads keep working until the token
// runs out (the database only checks its signature), but every server function
// asks the auth server and answers 401 — the app looked signed in while every
// action said "Unauthorized". On a function 401 we ask the auth server once; if it
// says the session is gone, this device signs out and the login page says why.
// Offline / server errors never sign anyone out.
const SESSION_ENDED = 'if.session-ended'
let checkingSession: Promise<void> | null = null

function checkSessionAlive(): Promise<void> {
  if (checkingSession) return checkingSession
  checkingSession = (async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    // Ask the auth server straight (no library lock: getUser() can sit behind the lock while this burst holds it).
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${data.session.access_token}` } })
    // 401/403 = this session no longer exists on the server. Network trouble / 5xx never signs anyone out.
    const ended = res.status === 401 || res.status === 403
    if (!ended) return
    endedNote = null
    try { sessionStorage.setItem(SESSION_ENDED, '1') } catch { /* the login page just won't explain */ }
    await supabase.auth.signOut({ scope: 'local' })
  })().catch(() => undefined).finally(() => { checkingSession = null })
  return checkingSession
}

const watchedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  if (res.status === 401) {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (target.includes('/functions/v1/')) void checkSessionAlive()
  }
  return res
}

/** True on the first login page after this device was signed out because the session ended elsewhere. */
let endedNote: boolean | null = null
export function takeSessionEnded(): boolean {
  if (endedNote !== null) return endedNote  // the login page can mount more than once in one load
  try {
    endedNote = sessionStorage.getItem(SESSION_ENDED) === '1'
    sessionStorage.removeItem(SESSION_ENDED)
  } catch { endedNote = false }
  return endedNote
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Handled above (hash routing makes the built-in detection unreliable).
      detectSessionInUrl: false,
    },
    global: { fetch: watchedFetch },
  },
)

// Where password-reset emails send people back to. Kept identical to the URL
// already allow-listed in Supabase (Auth → URL Configuration); whatever form
// the returned fragment takes, readAuthRedirect() handles it.
export const authRedirectUrl = () => `${window.location.origin}${window.location.pathname}#/update-password`

