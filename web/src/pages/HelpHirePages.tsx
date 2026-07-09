import { HIRE } from '../lib/types'
import { PageHeader } from '../components/Layout'

export function HelpPage() {
  return (
    <div>
      <PageHeader title="Help" subtitle="How to set up and use InfluenceFlow CRM" />

      <div className="card help-section">
        <h3>1. Create your account</h3>
        <p>Sign up with email + password (min 8 characters). Confirm your email if prompted, then log in. Your data is private — other users cannot see it.</p>
      </div>

      <div className="card help-section">
        <h3>2. Connect Gmail (required to send)</h3>
        <p>
          Go to <strong>Settings → Connect Gmail</strong>. You’ll authorize InfluenceFlow to send mail as you. Google may show an “unverified app” warning until the project is verified — that’s normal for early access. Only connect <em>your</em> Gmail. Never share passwords.
        </p>
        <p>Admin setup (one-time for the site owner): create a Google Cloud OAuth client with Gmail send scope, add redirect URL to the Supabase Edge Function callback, set secrets <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>.</p>
      </div>

      <div className="card help-section">
        <h3>3. Add creators & brands</h3>
        <p>Use Add or Bulk import (Name, email, niche/domain). On a brand page, add people with titles and emails. Use personalization snippets for {'{{personal_note}}'}.</p>
      </div>

      <div className="card help-section">
        <h3>4. Personalize & send</h3>
        <ul>
          <li>
            <strong>Template (bulk)</strong> — merge fields fill automatically
          </li>
          <li>
            <strong>Review & customize</strong> — edit any recipient before send
          </li>
          <li>
            <strong>Write custom</strong> — your own subject/body base
          </li>
        </ul>
        <p>Confirm shows count, ETA, and daily quota. Statuses update to contacted / reach-back automatically when sends complete.</p>
      </div>

      <div className="card help-section">
        <h3>5. Campaigns, calendar, archive, merge</h3>
        <p>Track deals under Campaigns (conflict warnings if a creator already sponsors that brand). Calendar holds meetings with browser reminders. Archive instead of deleting. Merge duplicates from Creators when flagged.</p>
      </div>

      <div className="card help-section">
        <h3>6. Themes & backup</h3>
        <p>Dark is default; switch in the sidebar or Settings. Export JSON anytime. Import supports the old InfluenceFlow backup format.</p>
      </div>

      <div className="card help-section">
        <h3>About</h3>
        <p>
          InfluenceFlow CRM is <strong>free</strong>, built by {HIRE.name}. Need a website for your agency, brand, or business?{' '}
          <a href="/hire">See Hire / Concepts</a> or contact via WhatsApp / LinkedIn.
        </p>
      </div>
    </div>
  )
}

export function HirePage() {
  return (
    <div>
      <PageHeader title="Hire / Concepts" subtitle="Websites for agencies, brands & businesses" />
      <div className="hire-hero">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Need a website?</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
            I’m {HIRE.name}. I design and build sites for agencies, brands, and businesses — plus custom tools like this CRM. Browse my concepts, then reach out if you want something built.
          </p>
          <div className="hire-actions">
            <a className="btn btn-primary" href={HIRE.portfolio} target="_blank" rel="noreferrer">
              Open portfolio
            </a>
            <a className="btn" href={HIRE.whatsapp} target="_blank" rel="noreferrer">
              WhatsApp {HIRE.phoneDisplay}
            </a>
            <a className="btn" href={HIRE.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Examples preview</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Live portfolio embedded below (opens in new tab if blocked).</p>
          <iframe className="iframe-frame" title="Concepts portfolio" src={HIRE.portfolio} loading="lazy" />
        </div>
      </div>
    </div>
  )
}
