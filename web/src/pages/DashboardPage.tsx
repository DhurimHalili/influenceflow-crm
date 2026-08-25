import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateTime, stripHtml } from '../lib/utils'
import type { Activity, Meeting, PipelineStatus } from '../lib/types'
import { CREATOR_STATUSES, STATUS_LABELS } from '../lib/types'
import { OnboardingBanner, PageHeader } from '../components/Layout'

export function DashboardPage() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState({ creators: 0, brands: 0, contacts: 0, campaigns: 0, dueReach: 0, sentToday: 0 })
  const [funnel, setFunnel] = useState<Record<string, number>>({})
  const [activity, setActivity] = useState<Activity[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    ;(async () => {
      const [c, b, p, camp, sent, act, meet, contacts, creatorStatuses] = await Promise.all([
        supabase.from('creators').select('id', { count: 'exact', head: true }).is('archived_at', null),
        supabase.from('brands').select('id', { count: 'exact', head: true }).is('archived_at', null),
        supabase.from('brand_contacts').select('id', { count: 'exact', head: true }).is('archived_at', null),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).is('archived_at', null).neq('status', 'cancelled'),
        supabase.from('outreach_events').select('id', { count: 'exact', head: true }).gte('sent_at', start.toISOString()),
        supabase.from('activity').select('*').order('at', { ascending: false }).limit(12),
        supabase.from('meetings').select('*').gte('starts_at', start.toISOString()).order('starts_at').limit(5),
        supabase.from('brand_contacts').select('id,last_sent_at,reach_back_count,pipeline_status').is('archived_at', null).not('last_sent_at', 'is', null),
        supabase.from('creators').select('pipeline_status').is('archived_at', null),
      ])
      if (c.error || b.error) setLoadError(c.error?.message || b.error?.message || 'Failed to load dashboard')
      else setLoadError(null)
      const days = profile?.reach_back_days ?? 3
      const maxRb = profile?.max_reach_backs ?? 3
      const due = (contacts.data || []).filter((row) => {
        if (!row.last_sent_at) return false
        if ((row.reach_back_count || 0) >= maxRb) return false
        return Date.now() - new Date(row.last_sent_at).getTime() >= days * 86400000
      }).length
      const counts: Record<string, number> = {}
      for (const s of CREATOR_STATUSES) counts[s] = 0
      for (const row of creatorStatuses.data || []) counts[row.pipeline_status as PipelineStatus] = (counts[row.pipeline_status as PipelineStatus] || 0) + 1
      setFunnel(counts)
      setStats({ creators: c.count || 0, brands: b.count || 0, contacts: p.count || 0, campaigns: camp.count || 0, dueReach: due, sentToday: sent.count || 0 })
      setActivity((act.data || []) as Activity[])
      setMeetings((meet.data || []) as Meeting[])
    })()
  }, [user, profile])

  const limit = profile?.daily_send_limit ?? 50
  const totalPipeline = Object.values(funnel).reduce((a, b) => a + b, 0)
  const pct = (n: number) => (totalPipeline ? Math.round((n / totalPipeline) * 100) : 0)

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Pipeline health, revenue signals and next actions — all live">
        <Link className="btn" to="/app/creators" style={{ borderRadius: 999 }}>
          View creators
        </Link>
        <Link className="btn btn-primary" to="/app/outreach">
          Open outreach →
        </Link>
      </PageHeader>

      <OnboardingBanner />
      {loadError && <p className="error">{loadError}</p>}

      {/* HERO BENTO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 0.85fr', gap: 12, marginBottom: 14 }} className="dashboard-hero-grid">
        <div
          className="card animate-entry"
          style={{
            padding: 0,
            overflow: 'hidden',
            background:
              'radial-gradient(520px 280px at 0% 0%, rgba(45,212,191,0.09), transparent 62%), radial-gradient(420px 240px at 96% 12%, rgba(56,189,248,0.07), transparent 60%), var(--bg-elevated)',
          }}
        >
          <div style={{ padding: '18px 20px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="card-eyebrow" style={{ marginBottom: 10 }}>
                <span className="card-eyebrow-dot" /> Pipeline overview
              </div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--text-strong)' }}>
                {totalPipeline} <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.92rem', letterSpacing: '-0.01em' }}>creators in flow</span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700, marginTop: 6 }}>
                {Math.round((stats.creators / Math.max(1, totalPipeline)) * 100) || 0}% roster-ready · auto-synced
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link to="/app/discovery" className="btn" style={{ fontSize: '0.78rem', padding: '7px 12px' }}>Discovery →</Link>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.66rem', color: 'var(--text-faint)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: '1px solid var(--border)', padding: '5px 8px', borderRadius: 999, background: 'var(--bg-soft)' }}>
                {stats.sentToday}/{limit} sent today
              </span>
            </div>
          </div>

          <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Creators', value: stats.creators, sub: `${pct(funnel['new'] || 0)}% new`, href: '/app/creators', accent: 'var(--accent)' },
              { label: 'Brands', value: stats.brands, sub: `${stats.contacts} people`, href: '/app/brands', accent: 'var(--accent-2)' },
              { label: 'Campaigns', value: stats.campaigns, sub: 'Active + negotiating', href: '/app/campaigns', accent: '#A78BFA' },
            ].map((s) => (
              <Link key={s.label} to={s.href} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'color-mix(in srgb, var(--bg-soft) 88%, transparent)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 12px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 2, background: `linear-gradient(90deg, ${s.accent}, transparent 80%)`, opacity: 0.9 }} />
                  <div style={{ fontFamily: 'var(--display)', fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--text-strong)' }}>{s.value}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '0.64rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-faint)', marginTop: 6 }}>{s.label}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 3 }}>{s.sub}</div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--border)', opacity: 0.9, margin: '0 16px' }} />

          <div style={{ display: 'flex', gap: 8, padding: '12px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Quick</span>
            <Link to="/app/creators" className="btn" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>＋ Add creator</Link>
            <Link to="/app/brands" className="btn" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>＋ Add brand</Link>
            <Link to="/app/calendar" className="btn" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>Schedule meet</Link>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text-faint)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
              {stats.dueReach} reach-backs due
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="card animate-entry animate-entry-1" style={{ padding: 16, background: 'linear-gradient(135deg, rgba(45,212,191,0.07) 0%, rgba(56,189,248,0.05) 100%), var(--bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.64rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-faint)' }}>Revenue flow</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4, color: 'var(--text-strong)' }}>Campaigns live</div>
              </div>
              <span className="badge replied" style={{ fontSize: '0.62rem' }}>{stats.campaigns} active</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{stats.campaigns}</span>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)', fontWeight: 600 }}>deals in motion</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-soft)', overflow: 'hidden', marginTop: 12, border: '1px solid var(--border)' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (stats.campaigns / Math.max(1, 8)) * 100)}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', borderRadius: 999, boxShadow: '0 0 10px rgba(45,212,191,0.24)' }} />
            </div>
            <Link to="/app/campaigns" className="btn btn-primary" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}>Manage campaigns</Link>
          </div>

          <div className="card animate-entry animate-entry-2" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.64rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-faint)' }}>Outreach today</span>
              <span className={`badge ${stats.dueReach ? 'warning' : 'new'}`}>{stats.dueReach} due</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{stats.sentToday}</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ {limit}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '0.68rem', fontWeight: 700, color: stats.sentToday >= limit ? 'var(--warning)' : 'var(--success)', background: stats.sentToday >= limit ? 'rgba(245,158,11,0.08)' : 'rgba(52,211,153,0.08)', border: `1px solid ${stats.sentToday >= limit ? 'rgba(245,158,11,0.18)' : 'rgba(52,211,153,0.18)'}`, padding: '3px 7px', borderRadius: 999 }}>
                {stats.sentToday >= limit ? 'Limit hit' : 'Slotted'}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-soft)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (stats.sentToday / Math.max(1, limit)) * 100)}%`, background: stats.sentToday >= limit ? 'linear-gradient(90deg, #F59E0B, #FBBF24)' : 'linear-gradient(90deg, var(--accent), var(--accent-2))', borderRadius: 999 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/app/outreach" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Outreach →</Link>
              <Link to="/app/calendar" className="btn" style={{ flex: 1, justifyContent: 'center' }}>Calendar</Link>
            </div>
          </div>
        </div>
      </div>

      {/* STAT GRID — refined */}
      <div className="stat-grid animate-entry animate-entry-2">
        <Link className="stat card-interactive" to="/app/creators">
          <div className="n">{stats.creators}<small>total</small></div>
          <div className="l">Creators in CRM</div>
        </Link>
        <Link className="stat card-interactive" to="/app/brands">
          <div className="n">{stats.brands}</div>
          <div className="l">Brands tracked</div>
        </Link>
        <Link className="stat card-interactive" to="/app/brands">
          <div className="n">{stats.contacts}</div>
          <div className="l">Brand contacts</div>
        </Link>
        <Link className="stat card-interactive" to="/app/campaigns">
          <div className="n">{stats.campaigns}</div>
          <div className="l">Campaigns</div>
        </Link>
        <Link className="stat card-interactive" to="/app/outreach">
          <div className="n" style={{ color: stats.dueReach ? 'var(--warning)' : undefined }}>{stats.dueReach}</div>
          <div className="l">Reach-backs due</div>
        </Link>
        <div className="stat">
          <div className="n">{stats.sentToday}<small>/ {limit}</small></div>
          <div className="l">Sent today</div>
        </div>
      </div>

      {/* PIPELINE FUNNEL — premium */}
      <div className="animate-entry animate-entry-3" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-strong)' }}>Creator pipeline</h3>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-faint)', background: 'var(--bg-soft)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 999 }}>
          {totalPipeline} total · click to filter
        </span>
      </div>
      <div className="funnel animate-entry animate-entry-3">
        {CREATOR_STATUSES.map((s) => (
          <Link key={s} className="funnel-step" to={`/app/creators`} state={{ status: s }}>
            <div className="n">{funnel[s] || 0}</div>
            <div className="l">{STATUS_LABELS[s]}</div>
            <div style={{ height: 3, borderRadius: 999, background: funnel[s] ? 'linear-gradient(90deg, var(--accent), var(--accent-2))' : 'var(--border)', opacity: funnel[s] ? 0.9 : 0.6, marginTop: 8 }} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--text-faint)', fontWeight: 700, marginTop: 4 }}>{pct(funnel[s] || 0)}%</div>
          </Link>
        ))}
      </div>

      {/* BENTO — Meetings + Activity */}
      <div className="grid-2 animate-entry animate-entry-4" style={{ gap: 12 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-soft) 72%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--accent-soft)', border: '1px solid rgba(45,212,191,0.14)', display: 'grid', placeItems: 'center', color: 'var(--accent)', fontSize: '0.78rem' }}>▦</span>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-strong)' }}>Today’s meetings</span>
              <span className="badge" style={{ fontSize: '0.62rem' }}>{meetings.length}</span>
            </div>
            <Link to="/app/calendar" className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              Open calendar →
            </Link>
          </div>
          <div style={{ padding: '6px 8px 8px' }}>
            {meetings.length === 0 && <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No upcoming meetings. <Link to="/app/calendar" style={{ fontWeight: 700 }}>Schedule one</Link></div>}
            {meetings.map((m) => (
              <div key={m.id} className="activity-item" style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 72%, transparent)', padding: '12px 8px', borderRadius: 10, marginBottom: 2 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'grid', placeItems: 'center', color: '#04201C', fontWeight: 800, fontSize: '0.72rem', flexShrink: 0 }}>{new Date(m.starts_at).getHours().toString().padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '0.92rem', letterSpacing: '-0.01em', color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--mono)', fontWeight: 500 }}>{formatDateTime(m.starts_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-soft) 72%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.14)', display: 'grid', placeItems: 'center', color: '#A78BFA', fontSize: '0.78rem' }}>◈</span>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-strong)' }}>Recent activity</span>
              <span className="badge" style={{ fontSize: '0.62rem' }}>{activity.length}</span>
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.64rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-faint)' }}>Live feed</span>
          </div>
          <div style={{ padding: '6px 8px 8px', maxHeight: 360, overflow: 'auto' }}>
            {activity.length === 0 && <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nothing yet — add a creator or brand to see activity.</div>}
            {activity.map((a) => (
              <div key={a.id} className="activity-item" style={{ padding: '10px 8px', borderBottom: '1px solid color-mix(in srgb, var(--border) 72%, transparent)', borderRadius: 10, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10 }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--bg-soft)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: '0.66rem', color: 'var(--text-faint)', fontWeight: 700, flexShrink: 0 }}>●</span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.875rem', lineHeight: 1.45, color: 'var(--text)', display: 'block' }}>{stripHtml(a.text)}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: '0.72rem', fontFamily: 'var(--mono)', fontWeight: 600 }}>{formatDateTime(a.at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media(max-width: 960px){ .dashboard-hero-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
