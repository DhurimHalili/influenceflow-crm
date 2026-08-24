import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HIRE } from '../lib/types'

export function LandingPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/app" replace />

  return (
    <div style={{ background: '#0a0a0f', color: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* NAV */}
      <header style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(12px)', background: 'rgba(10,10,15,.72)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, letterSpacing: '-.02em' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed 0%,#ec4899 100%)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px rgba(124,58,237,.35)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: '#fff', opacity: .92 }} />
          </div>
          InfluenceFlow
          <span style={{ fontWeight: 500, color: 'rgba(255,255,255,.55)', fontSize: '.9rem' }}>CRM</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/login" style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '.9rem', background: 'rgba(255,255,255,.06)' }}>
            Log in
          </Link>
          <Link to="/signup" style={{ padding: '10px 18px', borderRadius: 999, background: '#fff', color: '#111', textDecoration: 'none', fontWeight: 800, fontSize: '.9rem', boxShadow: '0 10px 24px rgba(0,0,0,.2)' }}>
            Start free
          </Link>
        </div>
      </header>

      {/* HERO */}
      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '0 20px' }}>
        <section style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 32, padding: '56px 0 36px', alignItems: 'center', minHeight: 'min(78vh, 720px)' }}>
          <div>
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderRadius: 999, background: 'rgba(124,58,237,.12)', border: '1px solid rgba(124,58,237,.22)', color: '#c4b5fd', fontSize: '.78rem', fontWeight: 700, letterSpacing: '.08em' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#a78bfa', boxShadow: '0 0 10px #a78bfa' }} /> FREE FOR AGENCIES · PRIVATE BY DEFAULT
            </div>
            <h1 style={{ margin: '14px 0 14px', fontSize: 'clamp(2.4rem, 5vw, 3.8rem)', lineHeight: .95, letterSpacing: '-.04em', fontWeight: 900 }}>
              The private workspace
              <br />
              <span style={{ background: 'linear-gradient(90deg,#a78bfa 0%,#f0abfc 50%,#38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>where creators become revenue</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,.68)', fontSize: '1.08rem', lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
              Discovery finds desk-setup YouTubers nightly. You close. Pipeline, campaigns and calendar keep every deal tight.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
              <Link to="/signup" style={{ padding: '14px 22px', borderRadius: 14, background: '#fff', color: '#111', textDecoration: 'none', fontWeight: 800, boxShadow: '0 14px 30px rgba(0,0,0,.18)' }}>
                Create free account
              </Link>
              <a href="#system" style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                See the system
              </a>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 18, color: 'rgba(255,255,255,.5)', fontSize: '.85rem', flexWrap: 'wrap' }}>
              <span>520 keywords · 50 nightly</span>
              <span>·</span>
              <span>Own API keys · own quota</span>
              <span>·</span>
              <span>7 day dedup</span>
            </div>
          </div>

          <div style={{ position: 'relative', borderRadius: 24, padding: 2, background: 'linear-gradient(135deg, rgba(124,58,237,.9), rgba(236,72,153,.7), rgba(14,165,233,.7))', boxShadow: '0 24px 70px rgba(124,58,237,.25)' }}>
            <div style={{ borderRadius: 22, background: 'linear-gradient(180deg, #18181b 0%, #0f0f12 100%)', padding: 18, border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ef4444', display: 'block' }} />
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#f59e0b', display: 'block' }} />
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#22c55e', display: 'block' }} />
                </div>
                <span style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)', fontWeight: 700, letterSpacing: '.06em' }}>LIVE PIPELINE</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { k: 'New', v: '47' },
                  { k: 'Negotiating', v: '12' },
                  { k: 'Roster', v: '8' },
                ].map((s) => (
                  <div key={s.k} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)', marginTop: 4 }}>{s.k}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(124,58,237,.14)', border: '1px solid rgba(124,58,237,.22)', borderRadius: 14, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#38bdf8)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.95rem' }}>desk setup tour added · 247K subs</div>
                  <div style={{ color: 'rgba(255,255,255,.62)', fontSize: '.85rem' }}>Avg 84K views · 3.2% engagement · verified</div>
                </div>
                <div style={{ marginLeft: 'auto', background: '#22c55e', color: '#fff', padding: '6px 10px', borderRadius: 999, fontSize: '.78rem', fontWeight: 800 }}>NEW</div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, color: 'rgba(255,255,255,.55)', fontSize: '.82rem' }}>
                <span>Discovery 08:00</span>
                <span>·</span>
                <span>10 keywords tonight</span>
                <span>·</span>
                <span>cooldown 7d</span>
              </div>
            </div>
          </div>
        </section>

        <section id="system" style={{ padding: '18px 0 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .9fr .9fr', gap: 14 }}>
            <div style={{ background: 'linear-gradient(135deg, #1a1a1f 0%, #111113 100%)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 22 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,.18)', border: '1px solid rgba(124,58,237,.28)', display: 'grid', placeItems: 'center', color: '#a78bfa', fontWeight: 900 }}>◐</div>
              <h3 style={{ margin: '12px 0 6px', fontSize: '1.1rem', letterSpacing: '-.02em' }}>Discovery that respects quota</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.65)', lineHeight: 1.6, fontSize: '.95rem' }}>520 desk-setup terms, 40 negatives, bio boost. 10 per night, 52 day rotation, 7 day channel dedup. Bring 1 to 5 of your own YouTube keys.</p>
            </div>
            <div style={{ background: '#141418', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 22 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(236,72,153,.14)', border: '1px solid rgba(236,72,153,.22)', display: 'grid', placeItems: 'center', color: '#f0abfc', fontWeight: 900 }}>◇</div>
              <h3 style={{ margin: '12px 0 6px', fontSize: '1.1rem', letterSpacing: '-.02em' }}>Pipeline without chaos</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.65)', lineHeight: 1.6, fontSize: '.95rem' }}>New to roster in one board. Notes, personalization, bulk import, merge duplicates, archive not delete.</p>
            </div>
            <div style={{ background: '#141418', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 22 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(14,165,233,.14)', border: '1px solid rgba(14,165,233,.22)', display: 'grid', placeItems: 'center', color: '#7dd3fc', fontWeight: 900 }}>▢</div>
              <h3 style={{ margin: '12px 0 6px', fontSize: '1.1rem', letterSpacing: '-.02em' }}>Campaigns and calendar</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.65)', lineHeight: 1.6, fontSize: '.95rem' }}>Deals with conflict checks. Meetings with browser reminders. No more lost follow ups.</p>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '0 0 28px' }}>
          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 22 }}>
            <h3 style={{ margin: '0 0 8px' }}>Private by design</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,.68)', lineHeight: 1.6 }}>Your workspace is yours. RLS isolation, per user API keys, no cross account visibility. Export JSON anytime. Read <a href="./privacy.html" style={{ color: '#a78bfa' }}>Privacy</a> and <a href="./terms.html" style={{ color: '#a78bfa' }}>Terms</a>.</p>
          </div>
          <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,.14), rgba(236,72,153,.10))', border: '1px solid rgba(124,58,237,.18)', borderRadius: 20, padding: 22, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fff', display: 'grid', placeItems: 'center', color: '#7c3aed', fontWeight: 900, flexShrink: 0 }}>DH</div>
            <div>
              <div style={{ fontWeight: 800 }}>Built by {HIRE.name}</div>
              <div style={{ color: 'rgba(255,255,255,.68)', fontSize: '.92rem', lineHeight: 1.5 }}>Free to use. Need a site for your agency or brand? <Link to="/hire" style={{ color: '#fff', fontWeight: 700 }}>Hire and concepts</Link> · <a href={HIRE.portfolio} target="_blank" rel="noreferrer" style={{ color: '#c4b5fd' }}>Portfolio</a> · <a href={HIRE.whatsapp} target="_blank" rel="noreferrer" style={{ color: '#c4b5fd' }}>WhatsApp</a></div>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '18px 20px', display: 'flex', gap: 16, justifyContent: 'center', color: 'rgba(255,255,255,.55)', fontSize: '.9rem', flexWrap: 'wrap' }}>
        <a href="./privacy.html" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</a>
        <a href="./terms.html" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</a>
        <Link to="/help" style={{ color: 'inherit', textDecoration: 'none' }}>Help</Link>
        <Link to="/login" style={{ color: 'inherit', textDecoration: 'none' }}>Log in</Link>
      </footer>

      <style>{`@media(max-width: 900px){ section{grid-template-columns:1fr !important} }`}</style>
    </div>
  )
}
