import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { HIRE } from '../lib/types'
import { Field } from '../components/ui'

export function LoginPage() {
  const { user, loading } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/app" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) setError(err.message)
    else nav('/app')
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit} style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 1, background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.22), transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div className="brand-mark" style={{ width: 38, height: 38, borderRadius: 12 }} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '1.02rem', lineHeight: 1 }}>InfluenceFlow <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>CRM</span></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Creator OS · Private workspace</div>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(45,212,191,0.16)', padding: '4px 8px', borderRadius: 999 }}>Secure</span>
        </div>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your private workspace. Every record is isolated — yours only.</p>
        <Field label="Work email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@agency.com" style={{ borderRadius: 12 }} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" style={{ borderRadius: 12 }} />
        </Field>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%', minHeight: 44, borderRadius: 999, marginTop: 6, fontSize: '0.92rem' }} disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Log in →'}
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>No account?</span>
          <Link to="/signup" style={{ fontWeight: 700, color: 'var(--accent)' }}>Create one — 30s</Link>
          <span style={{ color: 'var(--border)', opacity: 0.8 }}>·</span>
          <Link to="/" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Back to site</Link>
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.02em' }}>
          <span>RLS isolated</span><span>·</span><span>No sharing</span><span>·</span><a href={HIRE.portfolio} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>By {HIRE.name}</a>
        </div>
      </form>
    </div>
  )
}

export function SignupPage() {
  const { user, loading } = useAuth()
  const nav = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/app" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setBusy(false)
      return
    }
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split('@')[0] } },
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    if (data.session) nav('/app')
    else setInfo('Check your email to confirm your account, then log in.')
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit} style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 1, background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.22), transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div className="brand-mark" style={{ width: 38, height: 38, borderRadius: 12 }} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '1.02rem', lineHeight: 1 }}>InfluenceFlow <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>CRM</span></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Free · Private · Gmail-ready</div>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', padding: '4px 8px', borderRadius: 999, boxShadow: '0 4px 12px rgba(45,212,191,0.22)' }}>New</span>
        </div>
        <h1>Create account</h1>
        <p className="sub">Free forever. Private workspace. Send from your own Gmail in 60 seconds.</p>
        <Field label="Your name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="Alex Rivera" style={{ borderRadius: 12 }} />
        </Field>
        <Field label="Work email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="alex@youragency.com" style={{ borderRadius: 12 }} />
        </Field>
        <Field label="Password · min 8 characters">
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" style={{ borderRadius: 12 }} />
        </Field>
        {error && <p className="error">{error}</p>}
        {info && <p className="success">{info}</p>}
        <button className="btn btn-primary" style={{ width: '100%', minHeight: 44, borderRadius: 999, marginTop: 6, fontSize: '0.92rem' }} disabled={busy} type="submit">
          {busy ? 'Creating…' : 'Create account →'}
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Have an account?</span>
          <Link to="/login" style={{ fontWeight: 700, color: 'var(--accent)' }}>Log in</Link>
          <span style={{ color: 'var(--border)' }}>·</span>
          <Link to="/" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Back to site</Link>
        </div>
        <div style={{ marginTop: 14, padding: '10px 10px', borderRadius: 12, background: 'var(--bg-soft)', border: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          <span style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--success)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: '0.66rem', fontWeight: 800, flexShrink: 0 }}>✓</span>
          No credit card · RLS isolated · Export JSON anytime
        </div>
        <p className="auth-credit">Built free by {HIRE.name} · <a href={HIRE.portfolio} target="_blank" rel="noreferrer">Portfolio</a> · <a href={HIRE.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a></p>
      </form>
    </div>
  )
}
