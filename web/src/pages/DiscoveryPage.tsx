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
  subscriber_max: number | null
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
    // If user left fields empty, let DB defaults fill hardware-curated pool — don't overwrite with empty array
    const kw = keywords.split('\n').map((k) => k.trim()).filter(Boolean)
    const neg = negativeKw.split('\n').map((k) => k.trim()).filter(Boolean)
    const bio = nicheBioKw.split('\n').map((k) => k.trim()).filter(Boolean)
    const yk = youtubeKeys.split('\n').map((k) => k.trim()).filter(Boolean)
    const base: any = {
      user_id: user.id,
      niche: 'Desk Setups · Gaming PC Gear',
      platform: 'youtube',
      enabled: true,
      schedule_time: '08:00',
      schedule_timezone: 'Europe/Berlin',
      max_keywords_per_run: 10,
      cooldown_days: 7,
      subscriber_min: 50000,
      subscriber_max: null,
      min_avg_views: 50000,
      min_engagement_pct: 1,
      max_days_since_upload: 21,
      target_count: 50,
    }
    if (kw.length) base.keywords = kw
    if (neg.length) base.negative_kw = neg
    if (bio.length) base.niche_bio_kw = bio
    if (yk.length) base.youtube_api_keys = yk
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

      {settings && runs.length > 0 && runs[0] && (runs[0].inserted ?? 0) < (settings.target_count || 50) && (runs[0].inserted ?? 0) >= 0 && (
        <div className="card" style={{ marginBottom: '1rem', border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--border))', background: 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 10%, transparent), transparent)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px' }}>
          <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--warning)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '.85rem' }}>!</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong style={{ color: 'var(--text)', fontSize: '.88rem' }}>Last run found only {runs[0].inserted} / {settings.target_count || 50} — shortlist was tight</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '.8rem', lineHeight: 1.5 }}>We kept it strict (50k / 1%). Want more volume? You can loosen filters below — you control it, we don't auto-loosen your saved settings.</div>
          </div>
          <a href="#looser-help" className="btn" style={{ fontSize: '.8rem', padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={(e) => { e.preventDefault(); document.getElementById('looser-help')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>How to loosen ↓</a>
        </div>
      )}

      {!settings && (
        <div className="card" style={{ border: '1px solid rgba(124,58,237,.18)', background: 'linear-gradient(135deg, rgba(124,58,237,.06), rgba(14,165,233,.04))' }}>
          <h3 style={{ marginTop: 0 }}>Set up automated discovery — 1 click with broad gaming-PC defaults</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            New accounts are <strong>auto-created with broad gaming-PC gear keywords</strong> (desk setups + <em>chairs, keyboards, mice, monitors, headsets, motherboards, GPUs, PC builds</em>) + negatives + bio terms. Just click <strong>Enable discovery</strong> — no empty start, no Shorts-only, no India targeting.
          </p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12, fontSize: '.85rem', lineHeight: 1.6 }}>
            <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.18)', borderRadius: 10, padding: '10px 12px' }}>
              ✅ <strong>What’s filtered now:</strong> requires <strong>≥2 setup/gear videos</strong> (desk / battlestation / keyboard / chair / monitor / headset / mouse / motherboard / GPU / PC build — any) — pure gamers skipped · <strong>≥5 longform</strong>, &lt;75% Shorts — Shorts-only skipped · <strong>India/Hindi auto-excluded</strong> · US English bias · <strong>Optional transcript (0 quota)</strong>: if captions contain gear terms it’s a <em>plus</em> (ranked higher), if no captions — no penalty.
            </div>
            <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, fontSize: '.9rem' }}>
              <strong>Don't have keywords?</strong> Copy the AI prompts below (Search → Negative → Niche bio), paste into ChatGPT/Claude with your niche, get lists in seconds, then paste here. No manual research needed.
            </div>
          </div>
          <form onSubmit={createDefault}>
            <Field label="Niche (shown on each creator)">
              <input className="input" value={'Desk Setups · Gaming PC Gear'} readOnly />
            </Field>
            <Field label="Search keywords — one per line (44 broad gear+desk prefilled if you leave empty)">
              <textarea className="textarea" style={{ minHeight: 160 }} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={'Leave empty to auto-fill 44 broad gear+desk defaults on Enable, or paste your 500 here...\ndesk setup tour\ngaming chair review\nmechanical keyboard setup\nmonitor review\n...'} />
            </Field>
            <Field label="Negative keywords — one per line (terms to exclude)">
              <textarea className="textarea" style={{ minHeight: 120 }} value={negativeKw} onChange={(e) => setNegativeKw(e.target.value)} placeholder={'Leave empty for 38 defaults (includes gameplay + Hindi) or paste yours...\nkitchen setup\ngameplay\n hindi\n...'} />
            </Field>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Enable discovery with defaults
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
              <textarea className="textarea" style={{ minHeight: 200 }} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="One keyword per line — e.g. desk setup tour, gaming chair review, mechanical keyboard, monitor, headset, etc. Next auto-run will use the new list immediately." />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                Each run searches <strong>{settings.max_keywords_per_run}</strong> of them, rotating daily — <strong>{keywords.split('\n').filter((k) => k.trim()).length} ÷ {settings.max_keywords_per_run} = {Math.max(1, Math.ceil(keywords.split('\n').filter((k) => k.trim()).length / Math.max(1, settings.max_keywords_per_run)))}-day cycle</strong>. More keywords = more variety without extra quota per run. Broad gear: each channel needs <strong>≥2 setup/gear videos</strong> (desk / battlestation / keyboard / chair / monitor / headset / motherboard / GPU / PC build — any) — pure gamers skipped.
              </div>
            </Field>
            <Field label={`Negative keywords (${negativeKw.split('\n').filter((k) => k.trim()).length} in pool) — one per line`}>
              <textarea className="textarea" style={{ minHeight: 140 }} value={negativeKw} onChange={(e) => setNegativeKw(e.target.value)} placeholder="One term per line — excluded from YouTube search (as -&quot;term&quot;) and from video title/description checks." />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                Filters out off-topic + <strong>gameplay-only</strong> (<code>gameplay</code>, <code>let's play</code> without setup/gear) and <strong>India/Hindi</strong> (<code>hindi</code>, <code>bgmi</code>, <code>free fire india</code> — also hardcoded). Next run uses the new list immediately. Pure gamers & Hindi/Devanagari channels are also hard-filtered even if you clear this list.
              </div>
            </Field>
            <Field label={`Niche bio keywords (${nicheBioKw.split('\n').filter((k) => k.trim()).length} in pool) — one per line`}>
              <textarea className="textarea" style={{ minHeight: 100 }} value={nicheBioKw} onChange={(e) => setNicheBioKw(e.target.value)} placeholder="e.g. desk setup, gaming chair, mechanical keyboard, monitor, headset, hardware — if any appear in channel About, channel ranked higher." />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                <strong>What is this?</strong> After the subscriber/view/engagement + <strong>≥2 gear/setup</strong> gates pass, channels are ranked. If About contains any bio term (<code>mechanical keyboard</code>, <code>gaming chair</code>, <code>desk setup</code>, <code>gpu</code>…), it's <strong>gear-ranked higher</strong>. Shorts-only (&ge;75% Shorts or &lt;5 longform) already removed. Edit and save — next run uses it immediately.
              </div>
            </Field>
          </div>

          <div className="card" style={{ marginTop: '1rem', border: '1px dashed var(--border-strong)', background: 'color-mix(in srgb, var(--accent-soft) 55%, transparent)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>How to get keywords with AI <span style={{ fontSize: '.7rem', padding: '4px 8px', borderRadius: 999, background: 'var(--accent)', color: '#fff' }}>COPY & PASTE</span></h3>
            <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '.9rem', lineHeight: 1.6 }}>
              New users start with <strong style={{ color: 'var(--text)' }}>broad gear defaults</strong> (desk + chairs, keyboards, mice, monitors, headsets, PC builds, motherboards, GPUs — all). Changing niche? Copy a prompt below, replace <code style={{ background: 'var(--bg-soft)', padding: '2px 6px', borderRadius: 4, color: 'var(--text)' }}>[YOUR NICHE]</code>, paste into ChatGPT/Claude, get a clean list, then paste here and Save. Accuracy is now <strong style={{ color: 'var(--text)' }}>≥2 gear/setup videos + no Shorts-only + no India</strong> — pure gamers are auto-skipped, but keyboard/chair/monitor creators pass.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              <details style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>Prompt: 500 search keywords (desk + ALL gear)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.82rem', lineHeight: 1.6, margin: '10px 0 0', background: 'var(--bg-soft)', padding: 10, borderRadius: 8, fontFamily: 'var(--mono)', color: 'var(--text)', border: '1px solid var(--border)', overflowX: 'auto' }}>
{`You are a YouTube keyword expert for influencer discovery.

Give me 500 YouTube search keywords for creators in niche [YOUR NICHE, e.g. "Desk Setups · Gaming PC Gear — desks, battlestations, chairs, keyboards, mice, monitors, headsets, motherboards, GPUs, PC builds"].

Rules:
- One keyword per line, no numbering, no quotes
- 2-4 words each, focused on YouTube video titles people actually search
- Must cover BROAD gear: desk setup tour, battlestation, gaming chair review, mechanical keyboard, gaming mouse, monitor review, ultrawide, headset, microphone, rgb desk, cable management, motherboard review, gpu test, pc build showcase, gaming accessories, etc.
- Avoid generic single words and pure gameplay ("gameplay", "let's play" are excluded)
- Mix: desk tours, chairs, keyboards, mice, headsets, monitors, rgb, ultrawide, standing desk, water cooling, cable management, etc.
- No duplicates`}
                </pre>
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: '.8rem' }} onClick={() => navigator.clipboard.writeText(`You are a YouTube keyword expert for influencer discovery.\n\nGive me 500 YouTube search keywords for creators in niche [YOUR NICHE, e.g. \"Desk Setups · Gaming PC Gear — desks, battlestations, chairs, keyboards, mice, monitors, headsets, motherboards, GPUs, PC builds\"].\n\nRules:\n- One keyword per line, no numbering, no quotes\n- 2-4 words each, focused on YouTube video titles people actually search\n- Must cover BROAD gear: desk setup tour, battlestation, gaming chair review, mechanical keyboard, gaming mouse, monitor review, ultrawide, headset, microphone, rgb desk, cable management, motherboard review, gpu test, pc build showcase, gaming accessories, etc.\n- Avoid generic single words and pure gameplay (\"gameplay\", \"let's play\" are excluded)\n- Mix: desk tours, chairs, keyboards, mice, headsets, monitors, rgb, ultrawide, standing desk, water cooling, cable management, etc.\n- No duplicates`)}>Copy prompt</button>
              </details>
              <details style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>Prompt: 40 negative keywords (gameplay + Hindi)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.82rem', lineHeight: 1.6, margin: '10px 0 0', background: 'var(--bg-soft)', padding: 10, borderRadius: 8, fontFamily: 'var(--mono)', color: 'var(--text)', border: '1px solid var(--border)', overflowX: 'auto' }}>
{`Give me 40 negative keywords to exclude off-topic YouTube results for niche [YOUR NICHE — desk setups + ALL gaming-PC gear].

One per line, 1-3 words each. Must EXCLUDE:
- Off-topic rooms (kitchen setup, school desk, etc.)
- Pure gameplay without setup/gear (gameplay, let's play, walkthrough, speedrun, no commentary)
- India/Hindi targeting (hindi, tamil, telugu, bgmi, free fire india, desi — if you target EU/US)

No numbering. These are added as -"term" to YouTube search.`}
                </pre>
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: '.8rem' }} onClick={() => navigator.clipboard.writeText(`Give me 40 negative keywords to exclude off-topic YouTube results for niche [YOUR NICHE — desk setups + ALL gaming-PC gear].\n\nOne per line, 1-3 words each. Must EXCLUDE:\n- Off-topic rooms (kitchen setup, school desk, etc.)\n- Pure gameplay without setup/gear (gameplay, let's play, walkthrough, speedrun, no commentary)\n- India/Hindi targeting (hindi, tamil, telugu, bgmi, free fire india, desi — if you target EU/US)\n\nNo numbering. These are added as -\"term\" to YouTube search.`)}>Copy prompt</button>
              </details>
              <details style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>Prompt: 15-20 niche bio keywords (ALL gear)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.82rem', lineHeight: 1.6, margin: '10px 0 0', background: 'var(--bg-soft)', padding: 10, borderRadius: 8, fontFamily: 'var(--mono)', color: 'var(--text)', border: '1px solid var(--border)', overflowX: 'auto' }}>
{`Give me 15-20 niche bio keywords for niche [YOUR NICHE — Desk Setups · Gaming PC Gear].

These are short words/phrases that appear in a YouTuber's channel About if they are truly on-topic.
Must cover BROAD gear: desk setup, battlestation, gaming chair, mechanical keyboard, gaming mouse, monitor, headset, microphone, hardware, peripherals, rgb, etc.

One per line, lower case, 1-2 words each. No sentences, no numbering. These boost ranking if About contains any.`}
                </pre>
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: '.8rem' }} onClick={() => navigator.clipboard.writeText(`Give me 15-20 niche bio keywords for niche [YOUR NICHE — Desk Setups · Gaming PC Gear].\n\nThese are short words/phrases that appear in a YouTuber's channel About if they are truly on-topic.\nMust cover BROAD gear: desk setup, battlestation, gaming chair, mechanical keyboard, gaming mouse, monitor, headset, microphone, hardware, peripherals, rgb, etc.\n\nOne per line, lower case, 1-2 words each. No sentences, no numbering. These boost ranking if About contains any.`)}>Copy prompt</button>
                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '.82rem', lineHeight: 1.5 }}>What it does: after the hard gates (≥2 gear/setup + no Shorts-only + no India) pass, channels are <em>ranked</em> by bio gear match → gear count → engagement. Broad keyboards/chairs included, not just motherboards.</div>
              </details>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Your YouTube API keys — private quota</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '0.9rem' }}>
              Each agency uses its <strong>own quota</strong>. Paste 1–5 YouTube Data API v3 keys (one per line, from <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" className="link">Google Cloud Console</a>). The 5 global keys are <strong>owner's private</strong> and <strong>not shared</strong> — other agencies must add their own keys or Discovery will not run. Keys are stored per-user and never shown to others. Next run uses the new keys immediately (rotates on 403/quota).
            </p>
            {user?.id === '16674a1c-c22d-487b-80d7-b9c11f083f8d' && youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.18)', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                <strong style={{ color: '#16a34a' }}>Owner mode:</strong> your 5 global private keys are still active via Supabase Secrets, so your runs work even with 0 private keys above. Others see an error until they add theirs — your quota stays yours.
              </div>
            )}
            <Field label={`YouTube API keys (${youtubeKeys.split('\n').filter((k) => k.trim()).length} private keys) — one per line`}>
              <div style={{ position: 'relative' }}>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90, fontFamily: 'monospace', fontSize: '0.85rem', filter: showKeys ? 'none' : 'blur(6px)' }}
                  value={youtubeKeys}
                  onChange={(e) => setYoutubeKeys(e.target.value)}
                  placeholder={user?.id === '16674a1c-c22d-487b-80d7-b9c11f083f8d' ? "AIzaSy...\nAIzaSy...\nLeave empty to use your 5 owner global keys" : "AIzaSy...\nAIzaSy...\nAdd your own keys — required, global is owner's private"}
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
                  background: youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 ? (user?.id === '16674a1c-c22d-487b-80d7-b9c11f083f8d' ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.08)') : 'rgba(124,58,237,.08)',
                  border: `1px solid ${youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 ? (user?.id === '16674a1c-c22d-487b-80d7-b9c11f083f8d' ? 'rgba(34,197,94,.22)' : 'rgba(239,68,68,.22)') : 'rgba(124,58,237,.18)'}`,
                  color: 'var(--text-muted)',
                }}
              >
                {youtubeKeys.split('\n').filter((k) => k.trim()).length === 0 ? (
                  user?.id === '16674a1c-c22d-487b-80d7-b9c11f083f8d' ? (
                    <>
                      <strong style={{ color: '#16a34a' }}>Owner private pool active (5 global keys).</strong> Your runs work via Supabase Secrets fallback. Others must add their own keys — your quota is not shared. Add private keys above to override your own global pool.
                    </>
                  ) : (
                    <>
                      <strong style={{ color: '#dc2626' }}>No private keys saved — Discovery will not run.</strong> Add 1–5 YouTube keys above and Save. Your runs require your own quota — the 5 global keys are owner's private and not shared.
                    </>
                  )
                ) : (
                  <>
                    <strong style={{ color: '#7c3aed' }}>{youtubeKeys.split('\n').filter((k) => k.trim()).length} private key(s) will be used.</strong> Next run uses these only. Saving replaces your private list only — global stays owner's. Clear and Save empty {user?.id === '16674a1c-c22d-487b-80d7-b9c11f083f8d' ? 'to revert to your owner global pool' : 'will block Discovery until you add keys again'}.
                  </>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
                Tip: Google Cloud → Enable YouTube Data API v3 → Create API key → paste here. 10k quota per key/day (~100 searches). 5 keys ≈ 500 searches/day. Your 5 global keys remain private in Supabase Secrets — not shared with other agencies.
              </div>
            </Field>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Filters</h3>
            <div className="grid-2">
              <Field label="Min subscribers">
                <input className="input" type="number" min={0} value={settings.subscriber_min} onChange={(e) => patch({ subscriber_min: Number(e.target.value) })} />
              </Field>
              <Field label="Max subscribers (leave empty for no limit)">
                <input className="input" type="number" min={0} placeholder="No limit" value={settings.subscriber_max ?? ''} onChange={(e) => patch({ subscriber_max: e.target.value === '' ? null : Number(e.target.value) })} />
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

          <div className="card" id="looser-help" style={{ marginTop: '1rem', border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--border))', background: 'color-mix(in srgb, var(--warning) 7%, var(--bg-elevated))' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', flexWrap: 'wrap' }}>
              Only getting a few? How to make the shortlist looser <span style={{ fontSize: '.7rem', padding: '3px 7px', borderRadius: 999, background: 'var(--warning)', color: '#fff' }}>MORE RESULTS</span>
              <span style={{ fontSize: '.68rem', padding: '3px 7px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>We keep it strict — you decide</span>
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', lineHeight: 1.6, marginTop: 0 }}>
              Discovery stays <strong style={{ color: 'var(--text)' }}>strict by default</strong> (50k subs / 50k views / 1% engagement / 21 days) for quality. <em>We don't silently make it looser</em> — if you're under 50, <strong style={{ color: 'var(--text)' }}>you</strong> loosen one lever at a time below, Save, then Run now. Lower = more hits, but you control it. <span style={{ fontSize: '.78rem' }}>(Safety net: within a single run, if we’re still under 25 after 2 batches we try 30K/0.7% just for that run — your saved settings stay strict unless you Save a preset.)</span>
            </p>
            {runs.length > 0 && runs[0] && settings && (runs[0].inserted ?? 0) < (settings.target_count || 50) && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid color-mix(in srgb, var(--warning) 45%, var(--border))', borderRadius: 8, padding: '9px 10px', fontSize: '.82rem', color: 'var(--text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>Last run: <strong>{runs[0].inserted ?? 0}/{settings.target_count || 50}</strong> — shortlist was tight.</span>
                <span style={{ color: 'var(--text-muted)' }}>Try a looser preset below → Save → <strong>Run now</strong>. If <code style={{ background: 'var(--bg-soft)', padding: '1px 4px', borderRadius: 4 }}>{runs[0].shortlisted ?? 0} shortlisted</code> jumps, you’ve found your sweet spot.</span>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8, fontSize: '.82rem', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '6px 10px' }} onClick={() => { patch({ min_avg_views: 30000, min_engagement_pct: 0.7, max_days_since_upload: 21 }); setTimeout(() => (document.querySelector('form') as any)?.requestSubmit(), 0) }}>Preset: Balanced (30K / 0.7%)</button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '6px 10px' }} onClick={() => { patch({ min_avg_views: 20000, min_engagement_pct: 0.5, max_days_since_upload: 30 }); setTimeout(() => (document.querySelector('form') as any)?.requestSubmit(), 0) }}>Preset: Loose (20K / 0.5% / 30d)</button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '6px 10px' }} onClick={() => { patch({ min_avg_views: 15000, min_engagement_pct: 0.3, max_days_since_upload: 30, subscriber_min: 20000 }); setTimeout(() => (document.querySelector('form') as any)?.requestSubmit(), 0) }}>Preset: Very loose (15K / 0.3%)</button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '6px 10px' }} onClick={() => { patch({ min_avg_views: 50000, min_engagement_pct: 1, max_days_since_upload: 21, subscriber_min: 50000 }); setTimeout(() => (document.querySelector('form') as any)?.requestSubmit(), 0) }}>Reset: Strict (50K / 1%)</button>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
                <li><strong style={{ color: 'var(--text)' }}>Min avg views</strong> 50K → 30K → 20K → 15K — biggest lever. Try 30K first.</li>
                <li><strong style={{ color: 'var(--text)' }}>Min engagement %</strong> 1% → 0.7% → 0.5% → 0.3% — second lever for new channels.</li>
                <li><strong style={{ color: 'var(--text)' }}>Max days since upload</strong> 21 → 30 — catches monthly posters.</li>
                <li><strong style={{ color: 'var(--text)' }}>Min subscribers</strong> 50K → 20K — if niche is micro-creators.</li>
                <li><strong style={{ color: 'var(--text)' }}>Max subscribers</strong> leave empty = no cap — only set if you truly need upper bound.</li>
              </ul>
              <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>Tip: Change one lever at a time, Save, Run now. Check <strong style={{ color: 'var(--text)' }}>Recent runs</strong> below — if `shortlisted` jumps, you’ve found your sweet spot. Need help? See <strong style={{ color: 'var(--text)' }}>Help → Discovery</strong>.</div>
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