import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'
import type { Activity, Meeting } from '../lib/types'
import { OnboardingBanner, PageHeader } from '../components/Layout'

export function DashboardPage() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState({
    creators: 0,
    brands: 0,
    contacts: 0,
    campaigns: 0,
    dueReach: 0,
    sentToday: 0,
  })
  const [activity, setActivity] = useState<Activity[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])

  useEffect(() => {
    if (!user) return
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    ;(async () => {
      const [c, b, p, camp, sent, act, meet, contacts] = await Promise.all([
        supabase.from('creators').select('id', { count: 'exact', head: true }).is('archived_at', null),
        supabase.from('brands').select('id', { count: 'exact', head: true }).is('archived_at', null),
        supabase.from('brand_contacts').select('id', { count: 'exact', head: true }).is('archived_at', null),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).is('archived_at', null).neq('status', 'cancelled'),
        supabase.from('outreach_events').select('id', { count: 'exact', head: true }).gte('sent_at', start.toISOString()),
        supabase.from('activity').select('*').order('at', { ascending: false }).limit(12),
        supabase.from('meetings').select('*').gte('starts_at', start.toISOString()).order('starts_at').limit(5),
        supabase
          .from('brand_contacts')
          .select('id,last_sent_at,reach_back_count,pipeline_status')
          .is('archived_at', null)
          .not('last_sent_at', 'is', null),
      ])
      const days = profile?.reach_back_days ?? 3
      const maxRb = profile?.max_reach_backs ?? 3
      const due = (contacts.data || []).filter((row) => {
        if (!row.last_sent_at) return false
        if ((row.reach_back_count || 0) >= maxRb) return false
        const last = new Date(row.last_sent_at).getTime()
        return Date.now() - last >= days * 86400000
      }).length
      setStats({
        creators: c.count || 0,
        brands: b.count || 0,
        contacts: p.count || 0,
        campaigns: camp.count || 0,
        dueReach: due,
        sentToday: sent.count || 0,
      })
      setActivity((act.data || []) as Activity[])
      setMeetings((meet.data || []) as Meeting[])
    })()
  }, [user, profile])

  const limit = profile?.daily_send_limit ?? 50

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your private CRM workspace">
        <Link className="btn btn-primary" to="/app/outreach">
          Open Outreach
        </Link>
      </PageHeader>
      <OnboardingBanner />
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{stats.creators}</div>
          <div className="l">Creators</div>
        </div>
        <div className="stat">
          <div className="n">{stats.brands}</div>
          <div className="l">Brands</div>
        </div>
        <div className="stat">
          <div className="n">{stats.contacts}</div>
          <div className="l">Brand people</div>
        </div>
        <div className="stat">
          <div className="n">{stats.campaigns}</div>
          <div className="l">Campaigns</div>
        </div>
        <div className="stat">
          <div className="n">{stats.dueReach}</div>
          <div className="l">Reach-backs due</div>
        </div>
        <div className="stat">
          <div className="n">
            {stats.sentToday}/{limit}
          </div>
          <div className="l">Sent today</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Today’s meetings</h3>
          {meetings.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No upcoming meetings.</p>}
          {meetings.map((m) => (
            <div key={m.id} style={{ marginBottom: '0.55rem' }}>
              <strong>{m.title}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{formatDateTime(m.starts_at)}</div>
            </div>
          ))}
          <Link to="/app/calendar">Open calendar →</Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent activity</h3>
          {activity.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nothing yet — add a creator or brand.</p>}
          {activity.map((a) => (
            <div key={a.id} style={{ marginBottom: '0.45rem', fontSize: '0.9rem' }}>
              <span dangerouslySetInnerHTML={{ __html: a.text }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatDateTime(a.at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
