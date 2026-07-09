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
          Go to <strong>Settings → Connect Gmail</strong>. You’ll authorize InfluenceFlow to send mail as you. Only connect{' '}
          <em>your</em> Gmail. Never share passwords.
        </p>
        <p>
          <strong>If Google says “app is in testing” / only test users can connect:</strong> that is Google Cloud OAuth, not the CRM
          signup. CRM accounts (email/password) are open to everyone. Gmail connect is limited until you publish the OAuth app:
        </p>
        <ol>
          <li>
            Open <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">Google Cloud → OAuth consent screen</a>
          </li>
          <li>
            Click <strong>Publish app</strong> (move from Testing → In production)
          </li>
          <li>
            Google may show “unverified app” until you complete verification for sensitive scopes (Gmail send). Users can still click{' '}
            <strong>Advanced → Go to InfluenceFlow (unsafe)</strong> while unverified, or you submit for verification later.
          </li>
        </ol>
        <p>You do <strong>not</strong> need to add every CRM user as a test user after publishing.</p>
      </div>

      <div className="card help-section">
        <h3>3. Add creators & brands</h3>
        <p>Use Add or Bulk import (Name, email, niche/domain). On a brand page, add people with titles and emails. Use personalization snippets for {'{{personal_note}}'}.</p>
      </div>

      <div className="card help-section">
        <h3>4. Personalize & send</h3>
        <ul>
          <li>
            Choose <strong>Influencers</strong> or <strong>Brands (people)</strong> — they are not mixed unless you switch tabs
          </li>
          <li>
            Brand rows show <strong>brand · first · last · job title · email</strong>
          </li>
          <li>
            Already emailed someone outside the CRM? Select them → <strong>Mark already contacted</strong> (keeps the record, removes from New)
          </li>
          <li>
            <strong>Template / Review / Custom</strong> for personalization before send
          </li>
        </ul>
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
