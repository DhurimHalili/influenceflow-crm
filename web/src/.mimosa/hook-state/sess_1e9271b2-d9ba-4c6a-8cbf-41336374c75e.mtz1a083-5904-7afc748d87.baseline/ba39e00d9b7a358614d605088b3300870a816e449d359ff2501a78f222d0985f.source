import { Link, useNavigate } from 'react-router-dom'
import { HIRE } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { useAuth } from '../context/AuthContext'

function BackButton() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <button type="button" className="btn btn-ghost" onClick={() => (user ? navigate('/app') : navigate('/'))} style={{ marginBottom: '1rem' }}>
      ← Back
    </button>
  )
}

export function HelpPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <BackButton />
      <PageHeader title="Help & Docs" subtitle="Everything you need to run InfluenceFlow like a pro" />

      <div style={{ display: 'grid', gap: '1rem' }}>
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>1 · Create your private workspace <span className="badge new">PRIVATE BY DEFAULT</span></h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Sign up with email + password (8+ characters) and log straight in. Every account is isolated with RLS — no one sees your creators, brands or campaigns. You are ready in 20 seconds.</p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>2 · Creators, brands & pipeline</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Add via Creators → Add or Bulk import (one per line: <code>Name, email, niche</code> or <code>Name, channelUrl</code>). On brand pages, add people with titles. Use pipeline statuses (<code>new → contacted → negotiating → roster/signed</code>) and personal notes per creator.</p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>3 · Campaigns, calendar & archiving</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Campaigns warn if a creator already has a brand deal. Calendar holds meetings with browser reminders (see Settings → Reminders). Archive instead of delete — restore from Deleted. Merge duplicate creators when flagged via normalized names.</p>
        </div>

        {/* Hidden but preserved: Discovery + Outreach docs. Re-enable via FEATURES flags.
            Discovery: automated influencer sourcing / YouTube API keys.
            Outreach: Gmail OAuth + queue New / Reach-back emails. */}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>4 · Themes, backup & privacy</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Pick <Link to="/app/themes">Agency, Light, Dark, Honey or Ocean</Link> — it applies instantly on all your devices. Export JSON anytime. Import supports legacy backups. Privacy: your workspace is private — other users cannot see your data. See <Link to="/privacy">Privacy</Link> & <Link to="/terms">Terms</Link>.</p>
        </div>

        <div className="card" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border-strong)' }}>
          <h3 style={{ marginTop: 0 }}>About</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            InfluenceFlow is <strong>free</strong>, built by {HIRE.name}. Need a site for your agency, brand or business? <Link to="/hire">Hire / Concepts →</Link> or reach out via WhatsApp / LinkedIn. Every page is crafted to feel like a high-end product, not a template.
          </p>
        </div>
      </div>
    </div>
  )
}

export function HirePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <button type="button" className="btn btn-ghost" onClick={() => (user ? navigate('/app') : navigate('/'))} style={{ marginBottom: '1rem' }}>
        ← Back to {user ? 'Dashboard' : 'Home'}
      </button>
      <PageHeader title="Hire Dhurim" subtitle="Websites for agencies, brands & businesses — from concept to shipped" />

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.2rem' }}>
        <div style={{ padding: '2rem', background: 'var(--text-strong)', color: 'var(--bg-elevated)' }}>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 999, background: 'var(--accent-soft)', border: '1px solid var(--border-strong)', color: 'var(--accent)', fontSize: '.78rem', fontWeight: 700, letterSpacing: '.08em' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} /> AVAILABLE FOR NEW PROJECTS
          </div>
          <h2 style={{ margin: '1rem 0 .6rem', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', lineHeight: 1, letterSpacing: '-.02em', fontFamily: 'var(--display)', fontWeight: 600 }}>
            I design and build sites that <em>feel expensive</em>
          </h2>
          <p style={{ opacity: 0.75, maxWidth: 640, lineHeight: 1.6, fontSize: '1.05rem' }}>
            I'm {HIRE.name}. I craft high-end, fast, conversion-aware websites for agencies, brands and businesses — plus custom tools like this CRM. No templates, no generic copy. Every concept is art-directed and built to ship.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: '1.2rem' }}>
            <a className="btn btn-primary" href={HIRE.portfolio} target="_blank" rel="noreferrer" style={{ padding: '12px 20px', borderRadius: 12, fontWeight: 700 }}>
              Open portfolio →
            </a>
            <a className="btn" href={HIRE.whatsapp} target="_blank" rel="noreferrer" style={{ padding: '12px 20px', borderRadius: 12 }}>
              WhatsApp {HIRE.phoneDisplay}
            </a>
            <a className="btn" href={HIRE.linkedin} target="_blank" rel="noreferrer" style={{ padding: '12px 20px', borderRadius: 12 }}>
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
          <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0 }}>Live concepts</h3>
            <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>Embedded preview · opens in new tab if blocked</span>
          </div>
          <iframe className="iframe-frame" title="Concepts portfolio" src={HIRE.portfolio} loading="lazy" style={{ width: '100%', height: 560, border: 0, display: 'block' }} />
        </div>
      </div>
    </div>
  )
}
