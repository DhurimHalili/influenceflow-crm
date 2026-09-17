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

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
