import { Link } from 'react-router-dom'
import { HIRE } from '../lib/types'
import { PageHeader } from '../components/Layout'

const UPDATED = 'July 9, 2026'
const CONTACT_EMAIL = 'halilidhurim@gmail.com'

export function PrivacyPage() {
  return (
    <div className="legal-page">
      <PageHeader title="Privacy Policy" subtitle={`InfluenceFlow CRM · Last updated ${UPDATED}`} />
      <div className="card legal-card">
        <p>
          InfluenceFlow CRM (“the App”) is a free influencer marketing CRM built by {HIRE.name}. This policy explains what data we
          collect and how it is used.
        </p>

        <h3>1. Who we are</h3>
        <p>
          Operator: {HIRE.name}. Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · WhatsApp{' '}
          <a href={HIRE.whatsapp}>{HIRE.phoneDisplay}</a> · Portfolio{' '}
          <a href={HIRE.portfolio} target="_blank" rel="noreferrer">
            {HIRE.portfolio}
          </a>
          .
        </p>

        <h3>2. What data we collect</h3>
        <ul>
          <li>
            <strong>Account data:</strong> email address, display name, and authentication credentials managed by Supabase Auth.
          </li>
          <li>
            <strong>CRM data you enter:</strong> creators, brands, contacts, campaigns, notes, meetings, and activity
            logs — stored privately under your user account.
          </li>
          <li>
            <strong>Technical data:</strong> basic logs needed to operate authentication and backend functions (e.g. request errors).
          </li>
        </ul>

        <h3>3. How we use data</h3>
        <ul>
          <li>To provide the CRM features you request (store contacts, campaigns and calendar).</li>
          <li>To secure accounts and prevent abuse.</li>
        </ul>

        <h3>4. Data sharing</h3>
        <p>
          We do not sell your data. Data is processed by infrastructure providers required to run the App (currently Supabase for
          database/auth). Other users cannot see your CRM data (row-level security per
          account).
        </p>

        <h3>5. Data retention & deletion</h3>
        <p>
          Your CRM data remains until you delete it or request account deletion. You can export your data from Settings. To delete
          your account and associated data, contact {CONTACT_EMAIL}.
        </p>

        <h3>6. Security</h3>
        <p>
          We use industry-standard practices including encrypted transport (HTTPS), authenticated sessions, and database access
          policies. No method of transmission or storage is 100% secure.
        </p>

        <h3>7. Children’s privacy</h3>
        <p>The App is not directed to children under 16.</p>

        <h3>8. Changes</h3>
        <p>We may update this policy. The “Last updated” date above will change when we do.</p>

        <h3>9. Contact</h3>
        <p>
          Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <p>
          <Link to="/terms">Terms of Service</Link> · <Link to="/help">Help</Link> · <Link to="/hire">Hire / Concepts</Link>
        </p>
      </div>
    </div>
  )
}

export function TermsPage() {
  return (
    <div className="legal-page">
      <PageHeader title="Terms of Service" subtitle={`InfluenceFlow CRM · Last updated ${UPDATED}`} />
      <div className="card legal-card">
        <p>
          By using InfluenceFlow CRM (“the App”), you agree to these Terms. The App is provided free of charge by {HIRE.name}.
        </p>

        <h3>1. The service</h3>
        <p>
          InfluenceFlow is a CRM tool for managing creators, brands, campaigns, and related workflows. Features may change
          over time.
        </p>

        <h3>2. Accounts</h3>
        <p>
          You must provide accurate signup information and keep your password secure. You are responsible for activity under your
          account.
        </p>

        <h3>3. Acceptable use</h3>
        <ul>
          <li>Use the App only for lawful purposes.</li>
          <li>Do not harass or misuse the service in violation of applicable laws.</li>
          <li>Do not attempt to access other users’ data or disrupt the service.</li>
        </ul>

        <h3>4. Your content</h3>
        <p>
          You retain ownership of data you upload (contacts, notes, etc.). You grant us permission to store and process that data
          solely to operate the App for you.
        </p>

        <h3>5. Third-party services</h3>
        <p>
          The App uses third-party infrastructure (such as hosting and database providers). Your use of those services is also subject to their terms and policies.
        </p>

        <h3>6. No warranty</h3>
        <p>
          The App is provided “as is” without warranties of any kind. We do not guarantee uninterrupted availability or fitness for
          a particular purpose.
        </p>

        <h3>7. Limitation of liability</h3>
        <p>
          To the maximum extent permitted by law, {HIRE.name} is not liable for indirect, incidental, or consequential damages
          arising from use of the App, including lost business.
        </p>

        <h3>8. Termination</h3>
        <p>We may suspend access for abuse or security reasons. You may stop using the App at any time and request account deletion.</p>

        <h3>9. Contact</h3>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{' '}
          <a href={HIRE.whatsapp} target="_blank" rel="noreferrer">
            WhatsApp {HIRE.phoneDisplay}
          </a>
        </p>

        <p>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/help">Help</Link>
        </p>
      </div>
    </div>
  )
}
