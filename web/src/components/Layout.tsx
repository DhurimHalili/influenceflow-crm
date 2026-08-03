import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { HIRE } from '../lib/types'
import { stripHtml } from '../lib/utils'

const NAV = [
  { to: '/app', label: 'Dashboard', end: true, ico: '01' },
  { to: '/app/outreach', label: 'Outreach', ico: '02' },
  { to: '/app/creators', label: 'Creators', ico: '03' },
  { to: '/app/brands', label: 'Brands', ico: '04' },
  { to: '/app/campaigns', label: 'Campaigns', ico: '05' },
  { to: '/app/calendar', label: 'Calendar', ico: '06' },
  { to: '/app/help', label: 'Help', ico: '07' },
  { to: '/app/hire', label: 'Hire', ico: '08' },
  { to: '/app/settings', label: 'Settings', ico: '09' },
]

type SearchHit = { type: string; id: string; label: string; sub?: string; path: string }

export function AppLayout() {
  const { profile, setTheme, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const nav = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setQ('')
        setHits([])
        ;(e.target as HTMLElement)?.blur?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      return
    }
    const t = setTimeout(async () => {
      const term = `%${q.trim()}%`
      const [creators, brands, contacts, campaigns] = await Promise.all([
        supabase.from('creators').select('id,name,contact_email').is('archived_at', null).or(`name.ilike.${term},contact_email.ilike.${term}`).limit(5),
        supabase.from('brands').select('id,name,domain').is('archived_at', null).or(`name.ilike.${term},domain.ilike.${term}`).limit(5),
        supabase.from('brand_contacts').select('id,first_name,last_name,email,brand_id').is('archived_at', null).or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`).limit(5),
        supabase.from('campaigns').select('id,name').is('archived_at', null).ilike('name', term).limit(5),
      ])
      const next: SearchHit[] = []
      for (const c of creators.data || []) {
        next.push({ type: 'Creator', id: c.id, label: c.name, sub: c.contact_email || undefined, path: `/app/creators/${c.id}` })
      }
      for (const b of brands.data || []) {
        next.push({ type: 'Brand', id: b.id, label: b.name, sub: b.domain || undefined, path: `/app/brands/${b.id}` })
      }
      for (const p of contacts.data || []) {
        next.push({
          type: 'Person',
          id: p.id,
          label: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
          sub: p.email,
          path: `/app/brands/${p.brand_id}`,
        })
      }
      for (const c of campaigns.data || []) {
        next.push({ type: 'Campaign', id: c.id, label: c.name, path: `/app/campaigns` })
      }
      setHits(next)
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const theme = profile?.theme || 'dark'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" />
          InfluenceFlow
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-ico">{item.ico}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-ghost" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <Link to="/hire">Free · by Dhurim — Hire / See work</Link>
          <a href={HIRE.whatsapp} target="_blank" rel="noreferrer">
            WhatsApp {HIRE.phoneDisplay}
          </a>
          <button className="btn btn-ghost" type="button" onClick={() => signOut()}>
            Log out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn menu-btn" type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            Menu
          </button>
          <div className="topbar-search search-wrap">
            <input
              ref={searchRef}
              className="input"
              placeholder="Search creators, brands, people…  /"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQ('')
                  setHits([])
                }
                if (e.key === 'Enter' && hits[0]) {
                  e.preventDefault()
                  setQ('')
                  setHits([])
                  nav(hits[0].path)
                }
              }}
            />
            {hits.length > 0 && (
              <div className="search-results">
                {hits.map((h) => (
                  <button
                    key={`${h.type}-${h.id}`}
                    type="button"
                    onClick={() => {
                      setQ('')
                      setHits([])
                      nav(h.path)
                    }}
                  >
                    <strong>{h.type}</strong> · {h.label}
                    {h.sub ? <span style={{ color: 'var(--text-muted)' }}> — {h.sub}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={`badge ${profile?.gmail_connected ? 'replied' : ''}`}>
            {profile?.gmail_connected ? 'Gmail on' : 'Gmail off'}
          </span>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
      {open && (
        <div
          className="modal-backdrop"
          style={{ background: 'rgba(0,0,0,0.35)', zIndex: 15 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-page">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function useActivityLogger() {
  const { user } = useAuth()
  return useMemo(
    () => async (text: string) => {
      if (!user) return
      await supabase.from('activity').insert({ user_id: user.id, text: stripHtml(text) })
    },
    [user],
  )
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  )
}

export function OnboardingBanner() {
  const { profile, updateProfile } = useAuth()
  if (!profile || profile.onboarding_done) return null
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <strong>Welcome — quick setup</strong>
      <ol style={{ color: 'var(--text-muted)', margin: '0.5rem 0' }}>
        <li>
          <Link to="/app/settings">Connect Gmail</Link> so you can send from any device
        </li>
        <li>
          Add <Link to="/app/creators">creators</Link> or <Link to="/app/brands">brands</Link> (manual or CSV)
        </li>
        <li>
          Open <Link to="/app/outreach">Outreach</Link> to send personalized emails
        </li>
      </ol>
      <button className="btn" type="button" onClick={() => updateProfile({ onboarding_done: true })}>
        Dismiss
      </button>
    </div>
  )
}
