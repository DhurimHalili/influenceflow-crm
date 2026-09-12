import { useAuth } from '../context/AuthContext'
import { THEMES } from '../lib/themes'
import { useToast } from '../components/ui'
import { PageHeader } from '../components/Layout'

export function ThemesPage() {
  const { profile, updateProfile } = useAuth()
  const { show, Toast } = useToast()
  const current = profile?.theme || 'agency'

  async function apply(id: (typeof THEMES)[number]['id']) {
    if (id === current) return
    document.documentElement.dataset.theme = id
    localStorage.setItem('if-theme', id)
    await updateProfile({ theme: id })
    show(`${THEMES.find((t) => t.id === id)?.name} theme applied`)
  }

  return (
    <div>
      {Toast}
      <PageHeader
        title="Themes"
        subtitle="Pick the mood for your workspace. Applies instantly, on every device."
      />
      <div className="theme-grid">
        {THEMES.map((t) => {
          const active = t.id === current
          return (
            <button
              key={t.id}
              type="button"
              className={`theme-card${active ? ' active' : ''}`}
              onClick={() => apply(t.id)}
              aria-pressed={active}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: t.dot,
                    boxShadow: `0 0 10px ${t.dot}`,
                    flexShrink: 0,
                  }}
                />
                <strong style={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>{t.name}</strong>
                {t.id === 'agency' && (
                  <span className="badge new" style={{ marginLeft: 'auto' }}>
                    Default
                  </span>
                )}
                {active && t.id !== 'agency' && (
                  <span className="badge badge-ok" style={{ marginLeft: 'auto' }}>
                    Active
                  </span>
                )}
              </div>
              <div className="theme-swatches" aria-hidden>
                {t.swatches.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.tagline}</div>
              <div style={{ marginTop: 10 }}>
                <span className={`btn btn-sm${active ? '' : ' btn-primary'}`} style={{ pointerEvents: 'none' }}>
                  {active ? '✓ Using this' : `Use ${t.name}`}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--display)', fontWeight: 600 }}>A note on comfort</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Every theme is tuned to stay readable for long sessions — soft backgrounds, warm ink, no harsh
          white and no neon glare. Agency is the recommended default.
        </p>
      </div>
    </div>
  )
}
