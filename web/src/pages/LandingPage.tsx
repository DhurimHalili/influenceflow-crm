import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HIRE } from '../lib/types'

export function LandingPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/app" replace />

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="brand-mark" />
          <span>InfluenceFlow CRM</span>
        </div>
        <div className="landing-nav-actions">
          <Link to="/login" className="btn btn-ghost">
            Log in
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Sign up free
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-kicker">Free influencer marketing CRM</p>
          <h1>Run creator outreach, brand deals, and campaigns in one private workspace.</h1>
          <p className="landing-lead">
            InfluenceFlow helps agencies and freelancers manage influencers and brands, track negotiations, schedule
            meetings, and send personalized Gmail outreach — with each user’s data kept private.
          </p>
          <div className="landing-cta">
            <Link to="/signup" className="btn btn-primary">
              Create free account
            </Link>
            <a className="btn" href="#purpose">
              What it does
            </a>
          </div>
        </section>

        <section className="landing-purpose" id="purpose">
          <h2>Purpose of this application</h2>
          <p>
            InfluenceFlow CRM is built for influencer marketing workflows. You add creators and brand contacts, organize
            pipeline status (new, contacted, negotiating, roster, and more), run campaigns, keep notes and decks, use a
            calendar for meetings, and optionally connect your own Gmail to send outreach and reach-backs from the CRM.
          </p>
          <div className="landing-grid">
            <article>
              <h3>Creators & brands</h3>
              <p>Store influencers and brand people (name, title, email), notes, and pipeline status — privately per account.</p>
            </article>
            <article>
              <h3>Outreach</h3>
              <p>Queue new or reach-back emails with templates and per-person personalization, sent via your connected Gmail.</p>
            </article>
            <article>
              <h3>Campaigns & calendar</h3>
              <p>Track deals, payments, and deliverables; schedule meetings on an interactive calendar.</p>
            </article>
          </div>
        </section>

        <section className="landing-privacy-note">
          <h2>Privacy & access</h2>
          <p>
            Signing up creates your own workspace. Other users cannot see your CRM data. Connecting Gmail is optional and
            only used to send messages you explicitly start in Outreach. Read our{' '}
            <a href="./privacy.html">Privacy Policy</a> and <a href="./terms.html">Terms of Service</a>.
          </p>
        </section>

        <section className="landing-builder">
          <h2>Built by {HIRE.name}</h2>
          <p>
            InfluenceFlow is free. Need a website for your agency or brand?{' '}
            <Link to="/hire">See concepts & contact</Link> ·{' '}
            <a href={HIRE.portfolio} target="_blank" rel="noreferrer">
              Portfolio
            </a>{' '}
            ·{' '}
            <a href={HIRE.whatsapp} target="_blank" rel="noreferrer">
              WhatsApp {HIRE.phoneDisplay}
            </a>
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <a href="./privacy.html">Privacy</a>
        <a href="./terms.html">Terms</a>
        <Link to="/help">Help</Link>
        <Link to="/login">Log in</Link>
      </footer>
    </div>
  )
}
