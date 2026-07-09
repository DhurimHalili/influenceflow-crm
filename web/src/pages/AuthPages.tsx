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
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand" style={{ padding: 0, marginBottom: '0.5rem' }}>
          <div className="brand-mark" />
          InfluenceFlow CRM
        </div>
        <h1>Log in</h1>
        <p className="sub">Your private workspace for creators, brands, and outreach.</p>
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Log in'}
        </button>
        <p style={{ marginTop: '0.9rem', fontSize: '0.9rem' }}>
          No account? <Link to="/signup">Sign up free</Link>
        </p>
        <p className="auth-credit">
          Free CRM by {HIRE.name} · <a href={HIRE.portfolio} target="_blank" rel="noreferrer">See my work</a>
        </p>
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
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand" style={{ padding: 0, marginBottom: '0.5rem' }}>
          <div className="brand-mark" />
          InfluenceFlow CRM
        </div>
        <h1>Create account</h1>
        <p className="sub">Free · private data · send from your own Gmail.</p>
        <Field label="Your name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password (min 8)">
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <p className="error">{error}</p>}
        {info && <p className="success">{info}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
          {busy ? 'Creating…' : 'Sign up'}
        </button>
        <p style={{ marginTop: '0.9rem', fontSize: '0.9rem' }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
        <p className="auth-credit">
          Built free by {HIRE.name} · <a href={HIRE.portfolio} target="_blank" rel="noreferrer">Portfolio</a>
        </p>
      </form>
    </div>
  )
}
