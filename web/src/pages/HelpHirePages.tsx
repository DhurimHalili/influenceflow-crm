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
        <div className="card" style={{ borderLeft: '4px solid #7c3aed', background: 'linear-gradient(180deg, rgba(124,58,237,.08), transparent)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', gap: 10, alignItems: 'center' }}>1 · Create your private workspace <span style={{ fontSize: '.7rem', padding: '4px 8px', borderRadius: 999, background: '#7c3aed', color: '#fff' }}>PRIVATE BY DEFAULT</span></h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Sign up with email + password (8+ characters). Every account is isolated with RLS — no one sees your creators, brands or campaigns. Confirm email if prompted, then log in. You are ready in 20 seconds.</p>
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
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Dark is default; toggle in sidebar or Settings. Export JSON anytime. Import supports legacy backups. Privacy: your workspace is private — other users cannot see your data. See <Link to="/privacy">Privacy</Link> & <Link to="/terms">Terms</Link>.</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,.10), rgba(14,165,233,.08))', border: '1px solid rgba(124,58,237,.18)' }}>
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

      <div
        style={{
          borderRadius: 24,
          padding: 2,
          background: 'linear-gradient(135deg, #7c3aed, #ec4899, #0ea5e9)',
          boxShadow: '0 20px 60px rgba(124,58,237,.18)',
          marginBottom: '1.2rem',
        }}
      >
        <div style={{ borderRadius: 22, background: 'linear-gradient(180deg, rgba(18,18,22,.98), rgba(12,12,16,.98))', padding: '2rem', border: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 999, background: 'rgba(124,58,237,.14)', border: '1px solid rgba(124,58,237,.28)', color: '#c4b5fd', fontSize: '.78rem', fontWeight: 700, letterSpacing: '.08em' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#a78bfa', boxShadow: '0 0 10px #a78bfa' }} /> AVAILABLE FOR NEW PROJECTS
          </div>
          <h2 style={{ margin: '1rem 0 .6rem', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', lineHeight: 1, letterSpacing: '-.03em', color: '#fff' }}>
            I design and build sites that <span style={{ background: 'linear-gradient(90deg,#a78bfa,#f0abfc,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>feel expensive</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,.72)', maxWidth: 640, lineHeight: 1.6, fontSize: '1.05rem' }}>
            I'm {HIRE.name}. I craft high-end, fast, conversion-aware websites for agencies, brands and businesses — plus custom tools like this CRM. No templates, no generic copy. Every concept is art-directed and built to ship.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: '1.2rem' }}>
            <a className="btn btn-primary" href={HIRE.portfolio} target="_blank" rel="noreferrer" style={{ padding: '12px 20px', borderRadius: 12, fontWeight: 700 }}>
              Open portfolio →
            </a>
            <a className="btn" href={HIRE.whatsapp} target="_blank" rel="noreferrer" style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff' }}>
              WhatsApp {HIRE.phoneDisplay}
            </a>
            <a className="btn" href={HIRE.linkedin} target="_blank" rel="noreferrer" style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff' }}>
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
