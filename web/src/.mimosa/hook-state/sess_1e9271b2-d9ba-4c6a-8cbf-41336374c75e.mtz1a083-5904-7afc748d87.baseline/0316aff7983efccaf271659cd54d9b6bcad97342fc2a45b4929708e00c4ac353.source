import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HIRE } from '../lib/types'

const INK = '#241E14'
const MUTED = '#6F6350'
const FAINT = '#9A8D74'
const PAPER = '#EFE9DC'
const CARD = '#FBF9F4'
const LINE = '#D3C8AF'
const ACCENT = '#B65C2E'
const FOREST = '#3A5A40'
const CREAM = '#FFF8EF'
const GOLD = '#E8B04B'

export function LandingPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/app" replace />

  return (
    <div style={{ background: PAPER, color: INK, minHeight: '100vh', overflowX: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* NAV */}
      <header style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(14px)', background: 'rgba(247,243,233,.88)', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, letterSpacing: '-.02em', fontSize: '1.05rem', fontFamily: 'Fraunces, Georgia, serif' }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,${ACCENT} 0%,${FOREST} 100%)`, display: 'grid', placeItems: 'center', boxShadow: '0 8px 18px rgba(182,92,46,.35)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 5, background: CREAM }} />
          </div>
          InfluenceFlow <span style={{ fontWeight: 500, color: MUTED, fontFamily: 'Inter, sans-serif', fontSize: '.95rem' }}>CRM</span>
          <span style={{ marginLeft: 8, padding: '4px 10px', borderRadius: 999, background: 'rgba(182,92,46,.10)', border: `1px solid rgba(182,92,46,.25)`, fontSize: '.68rem', fontWeight: 800, letterSpacing: '.08em', color: ACCENT, fontFamily: 'Inter, sans-serif' }}>FOR AGENCIES</span>
        </div>
        <nav style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: '.88rem', fontWeight: 600 }}>
          <a href="#how" style={{ color: MUTED, textDecoration: 'none' }}>How it works</a>
          <a href="#features" style={{ color: MUTED, textDecoration: 'none' }}>Features</a>
          <a href="#faq" style={{ color: MUTED, textDecoration: 'none' }}>FAQ</a>
          <Link to="/login" style={{ padding: '10px 18px', borderRadius: 999, border: `1px solid ${LINE}`, color: INK, textDecoration: 'none', background: CARD }}>Log in</Link>
          <Link to="/signup" style={{ padding: '10px 20px', borderRadius: 999, background: ACCENT, color: CREAM, textDecoration: 'none', fontWeight: 800, boxShadow: '0 10px 22px rgba(182,92,46,.35)' }}>Start free →</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        {/* HERO */}
        <section style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 40, padding: '72px 0 48px', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '7px 14px', borderRadius: 999, background: 'rgba(182,92,46,.10)', border: '1px solid rgba(182,92,46,.28)', color: ACCENT, fontSize: '.76rem', fontWeight: 800, letterSpacing: '.1em' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT, boxShadow: '0 0 10px rgba(182,92,46,.6)' }} /> PRIVATE CRM · FOR AGENCIES
            </div>
            <h1 style={{ margin: '16px 0 14px', fontSize: 'clamp(2.6rem, 5.2vw, 4.2rem)', lineHeight: 1, letterSpacing: '-.02em', fontWeight: 600, fontFamily: 'Fraunces, Georgia, serif' }}>
              Run creators,
              <br />
              <span style={{ background: `linear-gradient(90deg,${ACCENT} 0%,${FOREST} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>brands & deals in one place.</span>
            </h1>
            <p style={{ color: MUTED, fontSize: '1.12rem', lineHeight: 1.65, maxWidth: 580, margin: 0 }}>
              Your private workspace for influencer work. <strong style={{ color: INK }}>Add creators, track pipeline, manage campaigns and calendar</strong> — no spreadsheets, no chaos.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <Link to="/signup" style={{ padding: '16px 26px', borderRadius: 14, background: ACCENT, color: CREAM, textDecoration: 'none', fontWeight: 800, fontSize: '1rem', boxShadow: '0 14px 28px rgba(182,92,46,.35)' }}>Create free account — 30s</Link>
              <a href="#how" style={{ padding: '16px 20px', borderRadius: 14, background: CARD, border: `1px solid ${LINE}`, color: INK, textDecoration: 'none', fontWeight: 700 }}>How it works ↓</a>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 18, color: FAINT, fontSize: '.82rem', flexWrap: 'wrap', alignItems: 'center', fontWeight: 600 }}>
              <span>No credit card</span><span>·</span><span>Export anytime</span><span>·</span><span>Private by default</span>
            </div>
          </div>

          <div style={{ position: 'relative', borderRadius: 26, padding: 2, background: `linear-gradient(135deg, ${ACCENT}, ${FOREST})`, boxShadow: '0 24px 60px rgba(80,55,25,.25)' }}>
            <div style={{ borderRadius: 24, background: CARD, padding: 20, border: `1px solid ${LINE}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 999, background: '#D96A4B' }} /><span style={{ width: 11, height: 11, borderRadius: 999, background: GOLD }} /><span style={{ width: 11, height: 11, borderRadius: 999, background: FOREST }} /></div>
                <span style={{ fontSize: '.76rem', color: FAINT, fontWeight: 800, letterSpacing: '.08em' }}>PIPELINE — TODAY</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                {[{ k: 'New', v: '47', c: ACCENT }, { k: 'Contacted', v: '12', c: FOREST }, { k: 'Roster', v: '8', c: '#9A6714' }].map((s) => (
                  <div key={s.k} style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.c, fontFamily: 'Fraunces, Georgia, serif' }}>{s.v}</div><div style={{ fontSize: '.78rem', color: MUTED, marginTop: 4, fontWeight: 600 }}>{s.k}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(182,92,46,.08)', border: '1px solid rgba(182,92,46,.22)', borderRadius: 16, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg,${ACCENT},${FOREST})`, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 800 }}>Creator added · Pipeline updated</div><div style={{ color: MUTED, fontSize: '.85rem' }}>Notes, status and campaign linked</div></div>
                <div style={{ marginLeft: 'auto', background: FOREST, color: CREAM, padding: '6px 12px', borderRadius: 999, fontSize: '.78rem', fontWeight: 800 }}>NEW</div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, color: FAINT, fontSize: '.82rem', flexWrap: 'wrap', fontWeight: 600 }}><span>Table + board</span><span>·</span><span>Bulk import</span><span>·</span><span>Campaigns + calendar</span></div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" style={{ padding: '32px 0 36px' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 28px' }}>
            <div style={{ display: 'inline-flex', padding: '6px 14px', borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, color: MUTED, fontSize: '.76rem', fontWeight: 800, letterSpacing: '.1em' }}>HOW IT WORKS — 4 STEPS, 3 MIN SETUP</div>
            <h2 style={{ margin: '14px 0 10px', fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-.02em', fontWeight: 600, fontFamily: 'Fraunces, Georgia, serif' }}>From contact to closed deal</h2>
            <p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>Add the people you already work with. Keep every status, note and deal in one private board.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { n: '01', t: 'Add creators', d: 'Manual add or bulk import (Name + email/link). Notes per person. Takes 2 min.', icon: '◍' },
              { n: '02', t: 'Add brands', d: 'Brands with their own people, titles and emails. Same pipeline, same privacy.', icon: '⬢' },
              { n: '03', t: 'Track pipeline', d: 'New → Contacted → Negotiating → Roster. Table or drag-and-drop board, bulk status, merge dupes.', icon: '▢' },
              { n: '04', t: 'Close & schedule', d: 'Campaigns with payouts + conflict checks. Calendar meetings with reminders. Nothing slips.', icon: '◆' },
            ].map((s) => (
              <div key={s.n} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 20, padding: 22, position: 'relative', boxShadow: '0 8px 22px rgba(80,55,25,.08)' }}>
                <div style={{ position: 'absolute', top: 14, right: 16, color: LINE, fontWeight: 800, fontSize: '1.6rem', fontFamily: 'Fraunces, Georgia, serif' }}>{s.n}</div>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(182,92,46,.12)', border: '1px solid rgba(182,92,46,.3)', display: 'grid', placeItems: 'center', color: ACCENT, fontWeight: 800 }}>{s.icon}</div>
                <h3 style={{ margin: '14px 0 6px', fontSize: '1.05rem', fontWeight: 800 }}>{s.t}</h3>
                <p style={{ margin: 0, color: MUTED, lineHeight: 1.6, fontSize: '.92rem' }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES BENTO */}
        <section id="features" style={{ padding: '12px 0 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.45fr .9fr .9fr', gap: 14 }}>
            <div style={{ background: `linear-gradient(135deg, #2A2114 0%, #1B160F 100%)`, borderRadius: 24, padding: 26, gridRow: 'span 2', color: CREAM, boxShadow: '0 18px 44px rgba(40,30,15,.28)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${ACCENT},${GOLD})`, display: 'grid', placeItems: 'center', color: CREAM, fontWeight: 800 }}>◍</div>
              <h3 style={{ margin: '14px 0 8px', fontSize: '1.35rem', fontWeight: 600, fontFamily: 'Fraunces, Georgia, serif' }}>Pipeline without chaos</h3>
              <p style={{ margin: 0, color: 'rgba(255,248,239,.72)', lineHeight: 1.65 }}>Creators and brands in one CRM with clear statuses, notes, and per-person history. No more juggling sheets and chats.</p>
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Table + board', 'Bulk import', 'Merge dupes', 'Notes', 'Archive', 'Search'].map((t) => (
                  <span key={t} style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(255,248,239,.09)', border: '1px solid rgba(255,248,239,.16)', fontSize: '.78rem', color: 'rgba(255,248,239,.85)', fontWeight: 600 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 24, padding: 24, boxShadow: '0 8px 22px rgba(80,55,25,.08)' }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Bulk that actually works</h3>
              <p style={{ margin: 0, color: MUTED, lineHeight: 1.6, fontSize: '.92rem' }}>Paste <code style={{ background: PAPER, padding: '1px 5px', borderRadius: 4, border: `1px solid ${LINE}` }}>Name, channelUrl</code> or attach CSV. Auto-detects links, dedupes by name + link.</p>
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 24, padding: 24, boxShadow: '0 8px 22px rgba(80,55,25,.08)' }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Campaigns + Calendar</h3>
              <p style={{ margin: 0, color: MUTED, lineHeight: 1.6, fontSize: '.92rem' }}>Campaign deals with conflict checks. Calendar meetings with browser reminders. No lost follow-ups.</p>
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 24, padding: 24, boxShadow: '0 8px 22px rgba(80,55,25,.08)' }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Creators + Brands</h3>
              <p style={{ margin: 0, color: MUTED, lineHeight: 1.6, fontSize: '.92rem' }}>Store people, titles, emails and pipeline side by side. Filter, export, stay organized.</p>
            </div>
            <div style={{ background: 'rgba(58,90,64,.09)', border: '1px solid rgba(58,90,64,.28)', borderRadius: 24, padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Private by design</h3>
              <p style={{ margin: 0, color: MUTED, lineHeight: 1.6, fontSize: '.92rem' }}>Isolated per account, no cross visibility. Export anytime. <a href="./privacy.html" style={{ color: INK, fontWeight: 700 }}>Privacy</a> · <a href="./terms.html" style={{ color: INK, fontWeight: 700 }}>Terms</a></p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ padding: '32px 0 24px', maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.9rem', fontWeight: 600, fontFamily: 'Fraunces, Georgia, serif', margin: '0 0 18px' }}>Questions, answered</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { q: 'How do I add creators?', a: 'Creators → Add creator, or Bulk import → paste “Name, channelUrl” or attach CSV. Duplicates are merged automatically.' },
              { q: 'How do campaigns work?', a: 'Create a campaign, link a brand + creators, set deliverables and payout. Conflict warnings stop double-booking the same creator + brand.' },
              { q: 'Is my data private?', a: 'Yes. Per-account isolation — other users cannot see your creators, brands, campaigns or notes. Export anytime.' },
              { q: 'Can I change the look?', a: 'Yes — open Themes in the sidebar and pick Agency, Light, Dark, Honey or Ocean. It applies instantly on all your devices.' },
              { q: 'Do I need to install anything?', a: 'No. It runs in your browser. Create an account and log straight in — no email confirmation waiting.' },
            ].map((f) => (
              <details key={f.q} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 18px', boxShadow: '0 4px 14px rgba(80,55,25,.06)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 800 }}>{f.q}</summary>
                <p style={{ margin: '10px 0 0', color: MUTED, lineHeight: 1.6, fontSize: '.92rem' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ background: `linear-gradient(135deg, #2A2114 0%, #3A2A16 60%, ${FOREST} 130%)`, borderRadius: 24, padding: 32, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', margin: '8px 0 28px', boxShadow: '0 18px 44px rgba(40,30,15,.3)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1.5rem', color: CREAM, fontFamily: 'Fraunces, Georgia, serif' }}>Free for agencies. Private by default.</div>
            <div style={{ color: 'rgba(255,248,239,.72)', marginTop: 6 }}>Create account → add creators & brands → track deals in one workspace.</div>
          </div>
          <Link to="/signup" style={{ padding: '14px 24px', borderRadius: 14, background: GOLD, color: '#2A1F0C', textDecoration: 'none', fontWeight: 800, boxShadow: '0 12px 24px rgba(0,0,0,.25)' }}>Start free now →</Link>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${LINE}`, padding: '20px 24px', display: 'flex', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap', color: MUTED, fontSize: '.85rem', maxWidth: 1280, margin: '0 auto' }}>
        <span>© {new Date().getFullYear()} InfluenceFlow CRM · Built free by {HIRE.name} · <a href={HIRE.portfolio} target="_blank" rel="noreferrer" style={{ color: INK }}>Portfolio</a> · <a href={HIRE.whatsapp} target="_blank" rel="noreferrer" style={{ color: INK }}>WhatsApp</a></span>
        <span style={{ display: 'flex', gap: 14 }}><a href="./privacy.html" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</a><a href="./terms.html" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</a><Link to="/help" style={{ color: 'inherit', textDecoration: 'none' }}>Help</Link></span>
      </footer>

      <style>{`@media(max-width: 980px){
        header nav a[href^="#"]{display:none}
        section{grid-template-columns:1fr !important}
        #how div{grid-template-columns:1fr 1fr !important}
      }
      @media(max-width: 560px){
        #how div{grid-template-columns:1fr !important}
      }`}</style>
    </div>
  )
}
