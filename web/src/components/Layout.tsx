import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { HIRE } from '../lib/types'
import { stripHtml } from '../lib/utils'

type NavItem = { to: string; label: string; end?: boolean; ico: string; desc?: string }

const NAV_MAIN: NavItem[] = [
  { to: '/app', label: 'Dashboard', end: true, ico: '◈', desc: 'Overview' },
  { to: '/app/outreach', label: 'Outreach', ico: '✉', desc: 'Queue' },
  { to: '/app/creators', label: 'Creators', ico: '◎', desc: 'CRM' },
  { to: '/app/brands', label: 'Brands', ico: '⬢', desc: 'CRM' },
  { to: '/app/campaigns', label: 'Campaigns', ico: '⬣', desc: 'Deals' },
  { to: '/app/calendar', label: 'Calendar', ico: '▦', desc: 'Meetings' },
]

const NAV_GROWTH: NavItem[] = [
  { to: '/app/discovery', label: 'Discovery', ico: '◐', desc: 'YouTube' },
  { to: '/app/deleted', label: 'Archive', ico: '◑', desc: 'Trash' },
]

const NAV_SYSTEM: NavItem[] = [
  { to: '/app/settings', label: 'Settings', ico: '⬔', desc: 'Workspace' },
  { to: '/app/help', label: 'Help', ico: '?', desc: 'Docs' },
]

type SearchHit = { type: string; id: string; label: string; sub?: string; path: string }

export function AppLayout() {
  const { profile, setTheme, signOut, user } = useAuth()
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

  const [noHit, setNoHit] = useState(false)
  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      setNoHit(false)
      return
    }
    const t = setTimeout(async () => {
      const term = `%${q.trim()}%`
      const { data, error } = await supabase
        .from('creators')
        .select('id,name,contact_email')
        .is('archived_at', null)
        .or(`name.ilike.${term},contact_email.ilike.${term}`)
        .limit(8)
      if (error) {
        setHits([])
        setNoHit(true)
        return
      }
      const next: SearchHit[] = []
      for (const c of data || []) {
        next.push({ type: 'Creator', id: c.id, label: c.name, sub: c.contact_email || undefined, path: `/app/creators/${c.id}` })
      }
      setHits(next)
      setNoHit(next.length === 0)
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const theme = profile?.theme || 'dark'
  const initials = (profile?.display_name || user?.email || 'I').slice(0, 2).toUpperCase()

  function handleNavMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    e.currentTarget.style.setProperty('--mx', `${x}%`)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              InfluenceFlow <small>CRM</small>
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>
              Creator OS · Private
            </span>
          </div>
        </div>

        <nav className="nav" onClick={() => setOpen(false)}>
          <div className="nav-section-label">Workspace</div>
          {NAV_MAIN.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')} onMouseMove={handleNavMouseMove}>
              <span className="nav-ico">{item.ico}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <span>{item.label}</span>
                <span style={{ fontSize: '0.66rem', fontFamily: 'var(--mono)', letterSpacing: '0.04em', color: 'var(--text-faint)', fontWeight: 500, textTransform: 'uppercase' }}>{item.desc}</span>
              </span>
            </NavLink>
          ))}

          <div className="nav-section-label">Growth</div>
          {NAV_GROWTH.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')} onMouseMove={handleNavMouseMove}>
              <span className="nav-ico">{item.ico}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <span>{item.label}</span>
                <span style={{ fontSize: '0.66rem', fontFamily: 'var(--mono)', letterSpacing: '0.04em', color: 'var(--text-faint)', fontWeight: 500, textTransform: 'uppercase' }}>{item.desc}</span>
              </span>
            </NavLink>
          ))}

          <div className="nav-section-label">System</div>
          {NAV_SYSTEM.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')} onMouseMove={handleNavMouseMove}>
              <span className="nav-ico">{item.ico}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <span>{item.label}</span>
                <span style={{ fontSize: '0.66rem', fontFamily: 'var(--mono)', letterSpacing: '0.04em', color: 'var(--text-faint)', fontWeight: 500, textTransform: 'uppercase' }}>{item.desc}</span>
              </span>
            </NavLink>
          ))}

          <Link
            to="/app/hire"
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 11px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(56,189,248,0.05))',
              border: '1px solid rgba(45,212,191,0.12)',
              color: 'var(--text)',
              textDecoration: 'none',
            }}
          >
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'grid', placeItems: 'center', fontSize: '0.78rem', fontWeight: 800, color: '#04201C', flexShrink: 0 }}>↗</span>
            <span style={{ flex: 1, lineHeight: 1.2 }}>
              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Hire studio</span>
              <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>By Dhurim — see work</span>
            </span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials.slice(0, 1)}</div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.display_name || user?.email?.split('@')[0] || 'Workspace'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.66rem', color: 'var(--text-faint)', letterSpacing: '0.04em', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.gmail_connected ? '● Gmail live' : '○ Gmail off'} · {theme}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{ minHeight: 30, padding: '4px 9px', fontSize: '0.72rem', borderRadius: 999, border: '1px solid var(--border)', flexShrink: 0 }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <a
              href={HIRE.whatsapp}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '7px 8px',
                borderRadius: 999,
                background: 'var(--bg-soft)',
                border: '1px solid var(--border)',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
              }}
            >
              WhatsApp
            </a>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => signOut()}
              style={{ flex: 1, minHeight: 34, fontSize: '0.76rem', border: '1px solid var(--border)', background: 'var(--bg-soft)' }}
            >
              Log out
            </button>
          </div>

          <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, paddingTop: 2 }}>
            Obsidian Flow · v2.0
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn menu-btn" type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu" style={{ borderRadius: 12, minHeight: 38, padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <span style={{ width: 18, height: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={{ height: 2, borderRadius: 999, background: 'var(--text)', opacity: 0.9 }} />
              <span style={{ height: 2, borderRadius: 999, background: 'var(--text)', opacity: 0.9 }} />
              <span style={{ height: 2, borderRadius: 999, background: 'var(--text)', opacity: 0.9 }} />
            </span>
            Menu
          </button>

          <div className="topbar-search search-wrap">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.9rem', pointerEvents: 'none' }}>⌕</span>
              <input
                ref={searchRef}
                className="input"
                placeholder="Search creators, brands, campaigns…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQ('')
                    setHits([])
                    setNoHit(false)
                  }
                  if (e.key === 'Enter' && hits[0]) {
                    e.preventDefault()
                    setQ('')
                    setHits([])
                    setNoHit(false)
                    nav(hits[0].path)
                  }
                }}
                style={{ paddingLeft: 36, paddingRight: 72, borderRadius: 999, background: 'var(--bg-elevated)', minHeight: 40, fontSize: '0.875rem' }}
              />
              <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="kbd" style={{ fontSize: '0.64rem', padding: '3px 6px' }}>/</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.64rem', color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'none' }} className="hide-mobile">Fast</span>
              </span>
            </div>
            {hits.length > 0 && (
              <div className="search-results">
                {hits.map((h) => (
                  <button
                    key={`${h.type}-${h.id}`}
                    type="button"
                    onClick={() => {
                      setQ('')
                      setHits([])
                      setNoHit(false)
                      nav(h.path)
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid rgba(45,212,191,0.14)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: '0.66rem', fontWeight: 700, color: 'var(--accent)' }}>{h.type[0]}</span>
                      <span>
                        <strong style={{ fontWeight: 700 }}>{h.label}</strong>
                        {h.sub ? <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {h.sub}</span> : null}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {q.trim() && noHit && hits.length === 0 && (
              <div className="search-results">
                <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  No creators for “{q.trim()}” — try another name or <Link to="/app/discovery">Discovery → Find creators</Link>.
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span
              className={`badge ${profile?.gmail_connected ? 'replied' : ''}`}
              style={{ padding: '6px 10px', fontSize: '0.66rem', background: profile?.gmail_connected ? 'rgba(52,211,153,0.09)' : 'var(--bg-soft)', borderRadius: 999 }}
            >
              {profile?.gmail_connected ? '● Gmail live' : '○ Gmail off'}
            </span>
            <Link to="/app/settings" className="btn btn-ghost hide-mobile" style={{ minHeight: 38, borderRadius: 999, padding: '8px 14px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'none' }}>
              Settings
            </Link>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>

      {open && <div className="modal-backdrop" style={{ background: 'rgba(3,6,12,0.42)', backdropFilter: 'blur(6px)', zIndex: 15 }} onClick={() => setOpen(false)} />}
    </div>
  )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-page" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><div className="card" style={{ padding: '24px 28px', textAlign: 'center' }}><div className="shimmer" style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--bg-soft)', margin: '0 auto 10px' }} />Loading workspace…</div></div>
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
    <div className="page-header animate-entry">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1>{title}</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'var(--accent-soft)', border: '1px solid rgba(45,212,191,0.14)', fontFamily: 'var(--mono)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }} />
            Live
          </span>
        </div>
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
    <div className="card animate-entry animate-entry-1" style={{ marginBottom: 16, border: '1px solid rgba(45,212,191,0.16)', background: 'linear-gradient(135deg, rgba(45,212,191,0.07) 0%, rgba(56,189,248,0.04) 100%), var(--bg-elevated)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 2, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', opacity: 0.9 }} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'grid', placeItems: 'center', color: '#04201C', fontWeight: 800, flexShrink: 0, boxShadow: '0 6px 16px rgba(45,212,191,0.28)' }}>✦</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '0.98rem', color: 'var(--text-strong)' }}>Welcome — quick setup</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginTop: 4 }}>Get your workspace live in 60 seconds. Private, isolated, yours.</div>
          <ol style={{ color: 'var(--text-muted)', margin: '10px 0 0', paddingLeft: 18, fontSize: '0.875rem', lineHeight: 1.7 }}>
            <li>
              <Link to="/app/settings" style={{ fontWeight: 700, color: 'var(--accent)' }}>Connect Gmail</Link> to send from any device
            </li>
            <li>
              Add <Link to="/app/creators" style={{ fontWeight: 700 }}>creators</Link> or <Link to="/app/brands" style={{ fontWeight: 700 }}>brands</Link> — manual or CSV bulk
            </li>
            <li>
              Open <Link to="/app/outreach" style={{ fontWeight: 700 }}>Outreach</Link> to send personalized emails
            </li>
          </ol>
        </div>
        <button className="btn" type="button" onClick={() => updateProfile({ onboarding_done: true })} style={{ flexShrink: 0 }}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
