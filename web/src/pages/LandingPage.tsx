import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HIRE } from '../lib/types'

export function LandingPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/app" replace />

  return (
    <div style={{ background: '#0a0a0f', color: '#fff', minHeight: '100vh', overflowX: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* NAV */}
      <header style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(16px)', background: 'rgba(10,10,15,.74)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 900, letterSpacing: '-.03em', fontSize: '1.05rem' }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed 0%,#ec4899 100%)', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(124,58,237,.35)' }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: '#fff' }} />
          </div>
          InfluenceFlow <span style={{ fontWeight: 500, color: 'rgba(255,255,255,.55)' }}>CRM</span>
          <span style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.1)', fontSize: '.72rem', fontWeight: 800, letterSpacing: '.08em', color: 'rgba(255,255,255,.7)' }}>FOR AGENCIES</span>
        </div>
        <nav style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: '.88rem', fontWeight: 600 }}>
          <a href="#how" style={{ color: 'rgba(255,255,255,.65)', textDecoration: 'none' }}>How it works</a>
          <a href="#features" style={{ color: 'rgba(255,255,255,.65)', textDecoration: 'none' }}>Features</a>
          <a href="#faq" style={{ color: 'rgba(255,255,255,.65)', textDecoration: 'none' }}>FAQ</a>
          <Link to="/login" style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', color: '#fff', textDecoration: 'none', background: 'rgba(255,255,255,.06)' }}>Log in</Link>
          <Link to="/signup" style={{ padding: '10px 20px', borderRadius: 999, background: '#fff', color: '#111', textDecoration: 'none', fontWeight: 900, boxShadow: '0 10px 24px rgba(0,0,0,.22)' }}>Start free →</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        {/* HERO */}
        <section style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 40, padding: '72px 0 48px', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '7px 12px', borderRadius: 999, background: 'rgba(124,58,237,.14)', border: '1px solid rgba(124,58,237,.26)', color: '#c4b5fd', fontSize: '.78rem', fontWeight: 800, letterSpacing: '.1em' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#a78bfa', boxShadow: '0 0 10px #a78bfa' }} /> LIVE DISCOVERY · 520 KEYWORDS · 5 KEYS
            </div>
            <h1 style={{ margin: '16px 0 14px', fontSize: 'clamp(2.6rem, 5.2vw, 4.2rem)', lineHeight: .92, letterSpacing: '-.05em', fontWeight: 900 }}>
              Find desk-setup
              <br />
              <span style={{ background: 'linear-gradient(90deg,#a78bfa 0%,#f0abfc 45%,#38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>YouTubers on autopilot.</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,.68)', fontSize: '1.12rem', lineHeight: 1.65, maxWidth: 580, margin: 0 }}>
              Nightly YouTube discovery → your private CRM. <strong style={{ color: '#fff' }}>10 keywords/night, 52-day rotation, 7-day dedup</strong> with your own API keys. No more manual hunting — just review, pitch, close.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <Link to="/signup" style={{ padding: '16px 26px', borderRadius: 16, background: '#fff', color: '#111', textDecoration: 'none', fontWeight: 900, fontSize: '1rem', boxShadow: '0 16px 32px rgba(0,0,0,.22)' }}>Create free account — 30s</Link>
              <a href="#how" style={{ padding: '16px 20px', borderRadius: 16, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>How it works ↓</a>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 18, color: 'rgba(255,255,255,.5)', fontSize: '.82rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: '#22c55e' }}>●</span> Berlin 08:00 default</span>
              <span>·</span><span>No credit card</span><span>·</span><span>Export JSON anytime</span><span>·</span><span>RLS isolated</span>
            </div>
          </div>

          <div style={{ position: 'relative', borderRadius: 26, padding: 2, background: 'linear-gradient(135deg, rgba(124,58,237,.9), rgba(236,72,153,.7), rgba(14,165,233,.7))', boxShadow: '0 28px 80px rgba(124,58,237,.28)' }}>
            <div style={{ borderRadius: 24, background: 'linear-gradient(180deg, #1a1a1f 0%, #0f0f12 100%)', padding: 20, border: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 999, background: '#ef4444' }} /><span style={{ width: 11, height: 11, borderRadius: 999, background: '#f59e0b' }} /><span style={{ width: 11, height: 11, borderRadius: 999, background: '#22c55e' }} /></div>
                <span style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)', fontWeight: 800, letterSpacing: '.08em' }}>LIVE PIPELINE — TODAY 08:00</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                {[{ k: 'New', v: '47', c: '#a78bfa' }, { k: 'Contacted', v: '12', c: '#f0abfc' }, { k: 'Roster', v: '8', c: '#38bdf8' }].map((s) => (
                  <div key={s.k} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '14px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)', marginTop: 4 }}>{s.k}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(124,58,237,.14)', border: '1px solid rgba(124,58,237,.24)', borderRadius: 16, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#38bdf8)' }} />
                <div><div style={{ fontWeight: 900 }}>desk setup tour added · 247K subs</div><div style={{ color: 'rgba(255,255,255,.62)', fontSize: '.85rem' }}>84K avg views · 3.2% eng · 4d ago · bio: battlestation ✓</div></div>
                <div style={{ marginLeft: 'auto', background: '#22c55e', color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: '.78rem', fontWeight: 900 }}>NEW</div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, color: 'rgba(255,255,255,.55)', fontSize: '.82rem', flexWrap: 'wrap' }}><span>10 keywords tonight</span><span>·</span><span>7d dedup</span><span>·</span><span>1.2K channels checked</span></div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" style={{ padding: '32px 0 36px' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 28px' }}>
            <div style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.7)', fontSize: '.78rem', fontWeight: 800, letterSpacing: '.1em' }}>HOW IT WORKS — 4 STEPS, 3 MIN SETUP</div>
            <h2 style={{ margin: '14px 0 10px', fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-.03em', fontWeight: 900 }}>From keyword to closed deal</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', lineHeight: 1.6 }}>Agencies add keywords once. The system hunts nightly and drops ready-to-pitch creators into a private board.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { n: '01', t: 'Add keywords', d: 'Paste 500 search terms + 40 negatives + 17 bio boost terms. Or use 520 desk-setup defaults. One per line. Takes 2 min.', icon: '◐' },
              { n: '02', t: 'Add your YouTube keys', d: 'Bring 1–5 keys from Google Cloud. Your quota stays yours — owner’s 5 keys are private. No sharing.', icon: '◇' },
              { n: '03', t: 'Discovery runs nightly', d: '10 keywords/night at 08:00 Berlin (changeable). 52-day rotation, 7-day channel dedup, 100/results × bio boost ranking.', icon: '▢' },
              { n: '04', t: 'Review & close', d: 'New → Contacted → Negotiating → Roster. Bulk import, merge dupes, campaigns + calendar, Gmail outreach (soon).', icon: '◆' },
            ].map((s) => (
              <div key={s.n} style={{ background: 'linear-gradient(180deg, #1c1c22 0%, #131318 100%)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 22, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 14, right: 16, color: 'rgba(255,255,255,.12)', fontWeight: 900, fontSize: '1.6rem' }}>{s.n}</div>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(124,58,237,.16)', border: '1px solid rgba(124,58,237,.28)', display: 'grid', placeItems: 'center', color: '#a78bfa', fontWeight: 900 }}>{s.icon}</div>
                <h3 style={{ margin: '14px 0 6px', fontSize: '1.05rem', fontWeight: 800 }}>{s.t}</h3>
                <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', lineHeight: 1.6, fontSize: '.92rem' }}>{s.d}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', color: 'rgba(255,255,255,.62)', fontSize: '.85rem' }}>
            <span style={{ background: '#fff', color: '#111', padding: '4px 8px', borderRadius: 999, fontWeight: 800, fontSize: '.72rem' }}>PRO TIP</span>
            Don’t have 500 terms? In Discovery → <strong style={{ color: '#fff' }}>How to get keywords with AI</strong> copy the 3 prompts (500 / 40 / 17) into ChatGPT, paste back, Save — done in 30s.
          </div>
        </section>

        {/* FEATURES BENTO */}
        <section id="features" style={{ padding: '12px 0 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.45fr .9fr .9fr', gap: 14 }}>
            <div style={{ background: 'linear-gradient(135deg, #1e1e24 0%, #111113 100%)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 24, padding: 26, gridRow: 'span 2' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#38bdf8)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900 }}>◎</div>
              <h3 style={{ margin: '14px 0 8px', fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-.02em' }}>Discovery that respects quota</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.65)', lineHeight: 1.65 }}>Strict filters when needed — <code style={{ background: 'rgba(255,255,255,.08)', padding: '2px 6px', borderRadius: 6, color: '#fff' }}>50K subs / 50K avg / 1% eng / 21d</code> + 3 longform + on-topic + bio boost. Auto-loosens to 30K/0.7% if a batch is thin, so you still hit 50 without wasting keys.</p>
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['520 keywords', '40 negatives', '17 bio', '10/night', '52d rotation', '7d dedup'].map((t) => (
                  <span key={t} style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', fontSize: '.78rem', color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ background: '#15151a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 24, padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Pipeline without chaos</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', lineHeight: 1.6, fontSize: '.92rem' }}>New → Contacted → Negotiating → Roster. Drag, bulk status, merge duplicates, trash → forever delete on reset.</p>
              <div style={{ marginTop: 14, height: 4, borderRadius: 999, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
            </div>
            <div style={{ background: '#15151a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 24, padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Bulk that actually works</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', lineHeight: 1.6, fontSize: '.92rem' }}>Paste <code style={{ background: 'rgba(255,255,255,.08)', padding: '1px 5px', borderRadius: 4 }}>Name, channelUrl</code> or attach <code style={{ background: 'rgba(255,255,255,.08)', padding: '1px 5px', borderRadius: 4 }}>influencer_creators_ready.csv</code> (7-col). Auto-detects URLs, dedupes by link.</p>
            </div>
            <div style={{ background: '#15151a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 24, padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Campaigns + Calendar</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', lineHeight: 1.6, fontSize: '.92rem' }}>Campaign deals with conflict checks. Calendar meetings with browser reminders. No lost follow-ups.</p>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,.16), rgba(236,72,153,.12))', border: '1px solid rgba(124,58,237,.2)', borderRadius: 24, padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Private by design</h3>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, fontSize: '.92rem' }}>RLS isolated per agency, per-user keys, no cross visibility. Export JSON anytime. <a href="./privacy.html" style={{ color: '#fff', fontWeight: 700 }}>Privacy</a> · <a href="./terms.html" style={{ color: '#fff', fontWeight: 700 }}>Terms</a></p>
            </div>
          </div>
        </section>

        {/* STRUGGLING */}
        <section style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 24, padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontWeight: 900 }}>Not hitting 50? Make it looser in 10s</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', lineHeight: 1.6, fontSize: '.92rem' }}>Discovery already auto-loosens, but you can lock a looser preset: <strong style={{ color: '#fff' }}>Min avg views 50K→30K→20K</strong> is the biggest lever, then <strong style={{ color: '#fff' }}>engagement 1%→0.7%</strong>, then <strong style={{ color: '#fff' }}>21d→30d</strong>. Tweak one, Save, Run now.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ padding: '8px 12px', borderRadius: 999, background: '#fff', color: '#111', fontWeight: 800, fontSize: '.82rem' }}>30K / 0.7% — balanced</span>
            <span style={{ padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', fontWeight: 700, fontSize: '.82rem' }}>20K / 0.5% / 30d — loose</span>
            <span style={{ padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', fontWeight: 700, fontSize: '.82rem' }}>15K / 0.3% — very loose</span>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ padding: '32px 0 24px', maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-.02em', margin: '0 0 18px' }}>FAQ — the boring but important bits</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { q: 'How do I get 500 keywords?', a: 'Discovery → “How to get keywords with AI” has 3 copy-paste prompts. Paste into ChatGPT/Claude with your niche, get 500 / 40 / 17 back in 30s, paste into CRM, Save. You start with 520 desk-setup defaults.' },
              { q: 'What are niche bio keywords?', a: 'Not a filter — a ranking boost. If a channel’s About contains any bio term (e.g. “desk setup”, “battlestation”), it ranks higher after passing subs/views/engagement. Leave as-is for desk setups or regenerate for your niche.' },
              { q: 'Do I need to bring API keys?', a: 'Yes — 1 to 5 YouTube Data v3 keys from Google Cloud. Your quota stays yours. Owner’s 5 keys are private, not shared. Add in Discovery → Your YouTube API keys (blurred, 1 per line).' },
              { q: 'What if a new agency signs up?', a: 'New accounts auto-create with 520/40/17 + Berlin 08:00 (changeable) + empty pipeline. No dummy data, no confusion.' },
              { q: 'Can I attach my influencer sheet?', a: 'Yes — Creators → Bulk import → Attach CSV file or paste “Name, channelUrl”. Supports the ready influencer_creators_ready.csv (7-col) with header and auto-dedupes.' },
            ].map((f) => (
              <details key={f.q} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '14px 16px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 800 }}>{f.q}</summary>
                <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,.62)', lineHeight: 1.6, fontSize: '.92rem' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 45%, #38bdf8 100%)', borderRadius: 24, padding: 28, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', margin: '8px 0 28px' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff' }}>Free for agencies. Private by default.</div>
            <div style={{ color: 'rgba(255,255,255,.9)', marginTop: 4 }}>Create account → paste keys → wake up to 25-35 new creators. Tweak looser if you need 50.</div>
          </div>
          <Link to="/signup" style={{ padding: '14px 22px', borderRadius: 14, background: '#fff', color: '#111', textDecoration: 'none', fontWeight: 900, boxShadow: '0 12px 24px rgba(0,0,0,.18)' }}>Start free now →</Link>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '20px 24px', display: 'flex', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap', color: 'rgba(255,255,255,.5)', fontSize: '.85rem', maxWidth: 1280, margin: '0 auto' }}>
        <span>© {new Date().getFullYear()} InfluenceFlow CRM · Built free by {HIRE.name} · <a href={HIRE.portfolio} target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,.7)' }}>Portfolio</a> · <a href={HIRE.whatsapp} target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,.7)' }}>WhatsApp</a></span>
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
