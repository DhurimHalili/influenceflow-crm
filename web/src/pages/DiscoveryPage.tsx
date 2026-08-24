import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Field, useToast } from '../components/ui'
import { PageHeader } from '../components/Layout'

type DiscoverySettings = {
  id?: number
  user_id: string
  niche: string
  platform: string
  enabled: boolean
  schedule_time: string
  schedule_timezone: string
  max_keywords_per_run: number
  cooldown_days: number
  keywords: string[]
  negative_kw: string[]
  niche_bio_kw: string[]
  youtube_api_keys: string[]
  subscriber_min: number
  subscriber_max: number
  min_avg_views: number
  min_engagement_pct: number
  max_days_since_upload: number
  target_count: number
  last_scheduled_run_date: string | null
}

type RunRow = {
  id: number
  trigger: string
  ran_at: string
  keywords_searched: number | null
  keyword_pool_total: number | null
  channels_found: number | null
  channels_skipped_cooldown: number | null
  channels_considered: number | null
  shortlisted: number | null
  fresh: number | null
  inserted: number | null
  api_keys_used: number | null
  quota_exhausted: boolean
  error: string | null
}

const TIMEZONES = [
  'Etc/UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland', 'Africa/Johannesburg',
]

export function DiscoveryPage() {
  const { user } = useAuth()
  const { show, Toast } = useToast()
  const [settings, setSettings] = useState<DiscoverySettings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [busy, setBusy] = useState(false) // saving
  const [running, setRunning] = useState(false) // manual run
  const [result, setResult] = useState<string | null>(null)

  // Form fields (arrays edited as newline-separated text)
  const [keywords, setKeywords] = useState('')
  const [negativeKw, setNegativeKw] = useState('')
  const [nicheBioKw, setNicheBioKw] = useState('')
  const [youtubeKeys, setYoutubeKeys] = useState('')
  const [showKeys, setShowKeys] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: s } = await supabase.from('creator_discovery_settings').select('*').eq('user_id', user.id).maybeSingle()
      if (s) {
        setSettings(s as DiscoverySettings)
        setKeywords((s.keywords || []).join('\n'))
        setNegativeKw((s.negative_kw || []).join('\n'))
        setNicheBioKw((s.niche_bio_kw || []).join('\n'))
        setYoutubeKeys(((s as any).youtube_api_keys || []).join('\n'))
      }
      setLoaded(true)
    })()
  }, [user])

  useEffect(() => {
    if (!user) return
    supabase
      .from('discovery_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('ran_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setRuns((data || []) as RunRow[]))
  }, [user])

  const runCounts = useMemo(() => {
    let found = 0,
      inserted = 0,
      skipped = 0
    for (const r of runs) {
      found += r.channels_found || 0
      inserted += r.inserted || 0
      skipped += r.channels_skipped_cooldown || 0
    }
    return { found, inserted, skipped }
  }, [runs])

  const nextRun = useMemo(() => {
    if (!settings) return null
    return `${settings.schedule_time} (${settings.schedule_timezone})`
  }, [settings])

  function patch(p: Partial<DiscoverySettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev))
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user || !settings) return
    setBusy(true)
    const payload: any = {
      ...settings,
      keywords: keywords.split('\n').map((k) => k.trim()).filter(Boolean),
      negative_kw: negativeKw.split('\n').map((k) => k.trim()).filter(Boolean),
      niche_bio_kw: nicheBioKw.split('\n').map((k) => k.trim()).filter(Boolean),
      youtube_api_keys: youtubeKeys.split('\n').map((k) => k.trim()).filter(Boolean),
      niche: settings.niche,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('creator_discovery_settings').upsert(payload)
    setBusy(false)
    if (error) show(error.message)
    else show('Discovery settings saved — next auto-run will use the new keys/keywords immediately')
  }

  async function createDefault() {
    if (!user) return
    setBusy(true)
    const base: any = {
      user_id: user.id,
      niche: 'Desk Setups & Battlestations',
      platform: 'youtube',
      enabled: true,
      schedule_time: '08:00',
      schedule_timezone: 'Etc/UTC',
      max_keywords_per_run: 10,
      cooldown_days: 7,
      keywords: keywords.split('\n').map((k) => k.trim()).filter(Boolean),
      negative_kw: negativeKw.split('\n').map((k) => k.trim()).filter(Boolean),
      niche_bio_kw: nicheBioKw.split('\n').map((k) => k.trim()).filter(Boolean),
      youtube_api_keys: youtubeKeys.split('\n').map((k) => k.trim()).filter(Boolean),
      subscriber_min: 50000,
      subscriber_max: 1000000,
      min_avg_views: 50000,
      min_engagement_pct: 1,
      max_days_since_upload: 21,
      target_count: 50,
    }
    const { data, error } = await supabase.from('creator_discovery_settings').upsert(base).select('*').single()
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    setSettings(data as DiscoverySettings)
    setKeywords((data.keywords || []).join('\n'))
    setNegativeKw((data.negative_kw || []).join('\n'))
    setNicheBioKw((data.niche_bio_kw || []).join('\n'))
    setYoutubeKeys(((data as any).youtube_api_keys || []).join('\n'))
    show('Discovery enabled — save settings to tune the search')
  }

  async function runNow() {
    if (!user) return
    setRunning(true)
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('discover-creators', { body: {} })
      if (error) {
        setResult(`Error: ${error.message || JSON.stringify(error)}`)
      } else if (data?.error) {
        setResult(`Error: ${data.error}`)
      } else {
        setResult(
          `Done — found ${data.channels_found ?? 0}, shortlisted ${data.shortlisted ?? 0}, inserted ${data.inserted ?? 0} (${data.channels_skipped_cooldown ?? 0} skipped from cooldown).`,
        )
        // refresh the run log
        const { data: rr } = await supabase
          .from('discovery_runs')
          .select('*')
          .eq('user_id', user.id)
          .order('ran_at', { ascending: false })
          .limit(10)
        if (rr) setRuns(rr as RunRow[])
      }
    } catch (err) {
      setResult(`Error: ${String(err)}`)
    } finally {
      setRunning(false)
    }
  }
if (!loaded) return <div className="empty">Loading…</div>

  return (
    <div>
      {Toast}
      <PageHeader title="Creator Discovery" subtitle="Automated YouTube influencer search straight into your CRM">
        {settings && (
          <button className={`btn ${settings.enabled ? 'btn-primary' : ''}`} type="button" onClick={runNow} disabled={running}>
            {running ? 'Searching…' : 'Run now'}
          </button>
        )}
      </PageHeader>

      {result && <div className="card" style={{ marginBottom: '1rem' }}>{result}</div>}

      {!settings && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Set up automated discovery</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Paste your search keywords (one per line), then save. Negative keywords keep results on-topic. You can turn
            auto-run on/off and pick a time + timezone below.
          </p>
          <form onSubmit={createDefault}>
            <Field label="Niche (shown on each creator)">
              <input className="input" value={'Desk Setups & Battlestations'} readOnly />
            </Field>
            <Field label="Search keywords — one per line">
              <textarea className="textarea" style={{ minHeight: 160 }} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </Field>
            <Field label="Negative keywords — one per line (terms to exclude)">
              <textarea className="textarea" style={{ minHeight: 120 }} value={negativeKw} onChange={(e) => setNegativeKw(e.target.value)} />
            </Field>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Enable discovery
              </button>
            </div>
          </form>
        </div>
      )}

      {settings && (
        <form onSubmit={save}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Schedule</h3>
            <div className="grid-2">
              <div className="field">
                <label className="label">Enabled (auto-run)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                  />
                  {settings.enabled ? 'Scheduled discovery is ON' : 'Scheduled discovery is OFF (manual still available)'}
                </label>
              </div>
              <div className="field">
                <label className="label">Next scheduled run</label>
                <div style={{ color: 'var(--text)' }}>{nextRun}</div>
              </div>
              <Field label="Run time (HH:MM)">
                <input
                  className="input"
                  type="time"
                  value={settings.schedule_time}
                  onChange={(e) => patch({ schedule_time: e.target.value })}
                />
              </Field>
              <Field label="Timezone">
                <select
                  className="input"
                  value={settings.schedule_timezone}
                  onChange={(e) => patch({ schedule_timezone: e.target.value })}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Keywords searched per run">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={settings.max_keywords_per_run}
                  onChange={(e) => patch({ max_keywords_per_run: Number(e.target.value) })}
                />
              </Field>
              <Field label="Cooldown days (re-check a channel after)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={settings.cooldown_days}
                  onChange={(e) => patch({ cooldown_days: Number(e.target.value) })}
                />
              </Field>
              <Field label="Target creators per run">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={settings.target_count}
                  onChange={(e) => patch({ target_count: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </div>
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Search content</h3>
            <Field label={`Search keywords (${keywords.split('\n').filter((k) => k.trim()).length} in pool) — one per line`}>
              <textarea className="textarea" style={{ minHeight: 200 }} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="One keyword per line — e.g. desk setup tour, battlestation, etc. Next auto-run will use the new list immediately." />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                Add as many as you want (you have 520). Each run searches <strong>{settings.max_keywords_per_run}</strong> of them, rotating daily — 520 ÷ 10 = 52-day cycle. More keywords = more variety without extra quota per run.
              </div>
            </Field>
            <Field label={`Negative keywords (${negativeKw.split('\n').filter((k) => k.trim()).length} in pool) — one per line`}>
              <textarea className="textarea" style={{ minHeight: 140 }} value={negativeKw} onChange={(e) => setNegativeKw(e.target.value)} placeholder="One term per line — excluded from YouTube search (as -&quot;term&quot;) and from video title/description checks." />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                Filters out off-topic results (e.g. `kitchen setup`, `baby nursery`). Next run uses the new list immediately.
              </div>
            </Field>
            <Field label={`Niche bio keywords (${nicheBioKw.split('\n').filter((k) => k.trim()).length} in pool) — one per line`}>
              <textarea className="textarea" style={{ minHeight: 100 }} value={nicheBioKw} onChange={(e) => setNicheBioKw(e.target.value)} placeholder="e.g. desk setup, battlestation, workspace — if any appear in channel About tab, channel gets ranking boost." />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                <strong>What is this?</strong> After the subscriber/view/engagement gates pass, channels are ranked. If the channel's <em>About</em> description contains any of these terms, it's considered <strong>true on-topic</strong> and ranked higher (more of its videos are likely desk-setup content). Not a filter — a boost. Edit and save — next run uses it immediately.
              </div>
            </Field>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Your YouTube API keys</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '0.9rem' }}>
              Each agency uses its <strong>own quota</strong>. Paste 1–5 YouTube Data API v3 keys (one per line, from <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" className="link">Google Cloud Console</a>). If empty, the workflow uses the shared global keys. Keys are stored per-user and never shown to others. Next run uses the new keys immediately (rotates on 403/quota).
            </p>
            <Field label={`YouTube API keys (${youtubeKeys.split('\n').filter((k) => k.trim()).length} private keys) — one per line`}>
              <div style={{ position: 'relative' }}>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90, fontFamily: 'monospace', fontSize: '0.85rem', filter: showKeys ? 'none' : 'blur(6px)' }}
                  value={youtubeKeys}
                  onChange={(e) => setYoutubeKeys(e.target.value)}
                  placeholder="AIzaSy...&#10;AIzaSy...&#10;Leave empty to use global keys"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', fontSize: '0.8rem' }}
                  onClick={() => setShowKeys((v) => !v)}
                >
                  {showKeys ? 'Hide' : 'Show'}
                </button>
              </div>
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: '.85rem',
                  lineHeight: 1.5,
                  background: youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 ? 'rgba(34,197,94,.10)' : 'rgba(124,58,237,.08)',
                  border: `1px solid ${youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 ? 'rgba(34,197,94,.22)' : 'rgba(124,58,237,.18)'}`,
                  color: 'var(--text-muted)',
                }}
              >
                {youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 ? (
                  <>
                    <strong style={{ color: '#22c55e' }}>No private keys saved — using shared global pool (5 keys active).</strong> Your auto runs and <em>Run now</em> are live via the global <code>YOUTUBE_API_KEYS</code> secret you added in Supabase. Add your own keys above and Save to switch to private quota (your keys replace only your row, global stays untouched for other users).
                  </>
                ) : (
                  <>
                    <strong style={{ color: '#7c3aed' }}>{youtubeKeys.split('\n').filter((k) => k.trim()).length} private key(s) will be used.</strong> Next run ignores the global pool and uses these. Saving here <em>replaces</em> your private list only — global keys stay for others. Leave and Save empty to switch back to global.
                  </>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                Tip: Google Cloud → Enable YouTube Data API v3 → Create API key → paste here. 10k quota per key/day (~100 searches). 5 keys ≈ 500 searches/day. Manually added global keys in Supabase → Edge Functions → Secrets stay as fallback.
              </div>
            </Field>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Filters</h3>
            <div className="grid-2">
              <Field label="Min subscribers">
                <input className="input" type="number" min={0} value={settings.subscriber_min} onChange={(e) => patch({ subscriber_min: Number(e.target.value) })} />
              </Field>
              <Field label="Max subscribers">
                <input className="input" type="number" min={0} value={settings.subscriber_max} onChange={(e) => patch({ subscriber_max: Number(e.target.value) })} />
              </Field>
              <Field label="Min avg views">
                <input className="input" type="number" min={0} value={settings.min_avg_views} onChange={(e) => patch({ min_avg_views: Number(e.target.value) })} />
              </Field>
              <Field label="Min engagement %">
                <input className="input" type="number" step="0.1" min={0} value={settings.min_engagement_pct} onChange={(e) => patch({ min_engagement_pct: Number(e.target.value) })} />
              </Field>
              <Field label="Max days since last upload">
                <input className="input" type="number" min={0} value={settings.max_days_since_upload} onChange={(e) => patch({ max_days_since_upload: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save all settings'}
              </button>
            </div>
          </div>
        </form>
      )}

      {settings && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Recent runs</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            Last 10 runs — across these: {runCounts.found} channels found, {runCounts.inserted} added to CRM,
            {' '}{runCounts.skipped} skipped by the {settings.cooldown_days}-day cooldown.
          </p>
          {runs.length === 0 ? (
            <div className="empty">No runs yet — hit "Run now" or wait for the scheduled time.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '6px 8px' }}>When</th>
                    <th style={{ padding: '6px 8px' }}>Trigger</th>
                    <th style={{ padding: '6px 8px' }}>Keywords</th>
                    <th style={{ padding: '6px 8px' }}>Found</th>
                    <th style={{ padding: '6px 8px' }}>Cooldown skip</th>
                    <th style={{ padding: '6px 8px' }}>Shortlisted</th>
                    <th style={{ padding: '6px 8px' }}>Added</th>
                    <th style={{ padding: '6px 8px' }}>Keys used</th>
                    <th style={{ padding: '6px 8px' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>{new Date(r.ran_at).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span className={`badge ${r.trigger === 'cron' ? 'replied' : ''}`}>{r.trigger}</span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{r.keywords_searched ?? 0}/{r.keyword_pool_total ?? 0}</td>
                      <td style={{ padding: '6px 8px' }}>{r.channels_found ?? 0}</td>
                      <td style={{ padding: '6px 8px' }}>{r.channels_skipped_cooldown ?? 0}</td>
                      <td style={{ padding: '6px 8px' }}>{r.shortlisted ?? 0}</td>
                      <td style={{ padding: '6px 8px' }}>{r.inserted ?? 0}</td>
                      <td style={{ padding: '6px 8px' }}>{r.api_keys_used ?? 0}</td>
                      <td style={{ padding: '6px 8px', color: r.error ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {r.error ? r.error : r.quota_exhausted ? 'quota cap hit (keys rotated)' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}