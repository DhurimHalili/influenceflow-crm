import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { EmailTemplate } from '../lib/types'
import { downloadJson } from '../lib/utils'
import { Field, useToast } from '../components/ui'
import { PageHeader } from '../components/Layout'

const DEFAULTS: Record<string, { subject: string; body_text: string }> = {
  new: {
    subject: 'Quick question re: {{brand_name}} + YouTube',
    body_text:
      'Hi {{first_name}},\n\nWe work with a curated roster of tech and AI creators (250K–2M+ subs). {{brand_name}} would fit naturally into their content.\n\n{{personal_note}}\n\nWould you be open to reviewing a few creator fits?\n\nBest,\n{{sender_name}}',
  },
  reach_back_0: {
    subject: 'Re: Quick question re: {{brand_name}} + YouTube',
    body_text: 'Hi {{first_name}},\n\nAre you there?\n\nJust bumping this for {{brand_name}}.\n\nBest,\n{{sender_name}}',
  },
  reach_back_1: {
    subject: 'Re: Quick question re: {{brand_name}} + YouTube',
    body_text: 'Hi {{first_name}},\n\nQuick follow-up — shorter than your standup.\n\nStill a strong match for {{brand_name}}.\n\nBest,\n{{sender_name}}',
  },
  reach_back_2: {
    subject: 'Re: Quick question re: {{brand_name}} + YouTube',
    body_text: 'Hi {{first_name}},\n\nLast ping on {{brand_name}} + YouTube — reply anytime.\n\nBest,\n{{sender_name}}',
  },
}

export function SettingsPage() {
  const { user, profile, updateProfile, setTheme, refreshProfile } = useAuth()
  const { show, Toast } = useToast()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [activeKey, setActiveKey] = useState<'new' | 'reach_back_0' | 'reach_back_1' | 'reach_back_2'>('new')
  const [form, setForm] = useState({
    display_name: '',
    sender_name: '',
    daily_send_limit: 50,
    send_delay_min: 60,
    send_delay_max: 150,
    reach_back_days: 3,
    max_reach_backs: 3,
    reminder_prefs: 'browser' as 'browser' | 'email' | 'both' | 'off',
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      display_name: profile.display_name || '',
      sender_name: profile.sender_name || '',
      daily_send_limit: profile.daily_send_limit,
      send_delay_min: profile.send_delay_min,
      send_delay_max: profile.send_delay_max,
      reach_back_days: profile.reach_back_days,
      max_reach_backs: profile.max_reach_backs,
      reminder_prefs: profile.reminder_prefs,
    })
  }, [profile])

  useEffect(() => {
    const hash = window.location.hash || ''
    if (hash.includes('gmail=connected')) {
      refreshProfile()
      show('Gmail connected')
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/app/settings`)
    }
  }, [refreshProfile, show])

  useEffect(() => {
    if (!user) return
    supabase
      .from('email_templates')
      .select('*')
      .then(({ data }) => setTemplates((data || []) as EmailTemplate[]))
  }, [user])

  const current = templates.find((t) => t.template_key === activeKey)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    await updateProfile({
      display_name: form.display_name,
      sender_name: form.sender_name,
      daily_send_limit: form.daily_send_limit,
      send_delay_min: form.send_delay_min,
      send_delay_max: form.send_delay_max,
      reach_back_days: form.reach_back_days,
      max_reach_backs: form.max_reach_backs,
      reminder_prefs: form.reminder_prefs,
    })
    show('Settings saved')
  }

  async function saveTemplate(e: FormEvent) {
    e.preventDefault()
    if (!user || !current) return
    await supabase
      .from('email_templates')
      .update({
        subject: current.subject,
        body_text: current.body_text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
    show('Template saved')
  }

  async function resetTemplate() {
    if (!user) return
    const d = DEFAULTS[activeKey]
    const existing = templates.find((t) => t.template_key === activeKey)
    if (existing) {
      await supabase.from('email_templates').update({ subject: d.subject, body_text: d.body_text }).eq('id', existing.id)
    } else {
      await supabase.from('email_templates').insert({
        user_id: user.id,
        template_key: activeKey,
        subject: d.subject,
        body_text: d.body_text,
      })
    }
    const { data } = await supabase.from('email_templates').select('*')
    setTemplates((data || []) as EmailTemplate[])
    show('Reset to default')
  }

  async function connectGmail() {
    // Starts OAuth via Edge Function when configured
    const { data, error } = await supabase.functions.invoke('gmail-oauth-start', { body: {} })
    if (error || !data?.url) {
      show('Gmail OAuth Edge Function not deployed yet. See Help → Connect Gmail.')
      // Dev toggle for UI testing until OAuth is live
      const ok = confirm('Mark Gmail as connected for UI testing? (No real sends until OAuth is set up)')
      if (ok) {
        await updateProfile({ gmail_connected: true })
        await refreshProfile()
      }
      return
    }
    window.location.href = data.url
  }

  async function exportBackup() {
    if (!user) return
    const tables = ['creators', 'brands', 'brand_contacts', 'campaigns', 'campaign_creators', 'external_links', 'meetings', 'activity', 'email_templates', 'outreach_events'] as const
    const out: Record<string, unknown> = { version: 2, exportedAt: new Date().toISOString() }
    for (const t of tables) {
      const { data } = await supabase.from(t).select('*')
      out[t] = data || []
    }
    downloadJson(`influenceflow-backup-${new Date().toISOString().slice(0, 10)}.json`, out)
  }

  async function clearAllCrmData() {
    if (!user) return
    if (!confirm('Delete ALL CRM data for this account (creators, brands, campaigns, meetings, activity, outreach logs)?')) return
    if (!confirm('Final confirm: this cannot be undone. Export a backup first if you need it.')) return

    const tables = [
      'campaign_creators',
      'outreach_events',
      'external_links',
      'meetings',
      'activity',
      'campaigns',
      'brand_contacts',
      'creators',
      'brands',
    ] as const

    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq('user_id', user.id)
      if (error) {
        show(`Failed clearing ${t}: ${error.message}`)
        return
      }
    }
    show('All CRM data cleared — clean slate')
  }

  async function importBackup(file: File) {
    if (!user) return
    const text = await file.text()
    const raw = JSON.parse(text)
    // Legacy InfluenceFlow format
    if (raw.creatorsContacted || raw.brandsContacted) {
      const creators = (raw.creatorsContacted || []).map((c: Record<string, unknown>) => ({
        user_id: user.id,
        name: String(c.name || 'Unknown'),
        contact_email: (c.contactEmail as string) || null,
        channel_link: (c.channelLink as string) || null,
        niche: (c.niche as string) || null,
        avg_views: c.avgViews != null ? Number(c.avgViews) : null,
        pipeline_status: mapLegacyStatus(String(c.status || 'no_reply')),
        date_contacted: (c.dateContacted as string) || null,
        notes: (c.notes as string) || '',
        created_at: (c.createdAt as string) || new Date().toISOString(),
      }))
      if (creators.length) await supabase.from('creators').insert(creators)
      for (const b of raw.brandsContacted || []) {
        const { data: brand } = await supabase
          .from('brands')
          .insert({
            user_id: user.id,
            name: b.name,
            contact_email: b.contactEmail || null,
            pipeline_status: mapLegacyStatus(b.status || 'no_reply'),
            date_contacted: b.dateContacted || null,
            notes: b.notes || '',
            created_at: b.createdAt || new Date().toISOString(),
          })
          .select('id')
          .single()
        if (brand && b.contactEmail) {
          await supabase.from('brand_contacts').insert({
            user_id: user.id,
            brand_id: brand.id,
            email: b.contactEmail,
            first_name: 'there',
            pipeline_status: mapLegacyStatus(b.status || 'no_reply'),
          })
        }
      }
      show('Legacy backup imported')
      return
    }
    if (raw.version === 2 || raw.creators || raw.brands) {
      const tables = ['creators', 'brands', 'brand_contacts', 'campaigns', 'campaign_creators', 'external_links', 'meetings', 'email_templates'] as const
      let imported = 0
      for (const t of tables) {
        const rows = raw[t]
        if (!Array.isArray(rows) || rows.length === 0) continue
        const cleaned = rows.map((row: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...row, user_id: user.id }
          delete next.id
          return next
        })
        const { error } = await supabase.from(t).insert(cleaned)
        if (!error) imported += cleaned.length
      }
      show(imported ? `Imported ${imported} rows from v2 backup` : 'Backup had no insertable rows')
      return
    }
    show('Unsupported backup format')
  }

  return (
    <div>
      {Toast}
      <PageHeader title="Settings" subtitle="Profile, Gmail, templates, backup" />

      <div className="grid-2">
        <form className="card" onSubmit={saveProfile}>
          <h3 style={{ marginTop: 0 }}>Profile & send limits</h3>
          <Field label="Display name">
            <input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </Field>
          <Field label="Sender name (signature)">
            <input className="input" value={form.sender_name} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Daily send limit">
              <input className="input" type="number" value={form.daily_send_limit} onChange={(e) => setForm({ ...form, daily_send_limit: Number(e.target.value) })} />
            </Field>
            <Field label="Reach-back days">
              <input className="input" type="number" value={form.reach_back_days} onChange={(e) => setForm({ ...form, reach_back_days: Number(e.target.value) })} />
            </Field>
            <Field label="Delay min (sec)">
              <input className="input" type="number" value={form.send_delay_min} onChange={(e) => setForm({ ...form, send_delay_min: Number(e.target.value) })} />
            </Field>
            <Field label="Delay max (sec)">
              <input className="input" type="number" value={form.send_delay_max} onChange={(e) => setForm({ ...form, send_delay_max: Number(e.target.value) })} />
            </Field>
            <Field label="Max reach-backs">
              <input className="input" type="number" min={0} max={10} value={form.max_reach_backs} onChange={(e) => setForm({ ...form, max_reach_backs: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Reminders">
            <select className="select" value={form.reminder_prefs} onChange={(e) => setForm({ ...form, reminder_prefs: e.target.value as typeof form.reminder_prefs })}>
              <option value="browser">Browser</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
              <option value="off">Off</option>
            </select>
          </Field>
          <Field label="Theme">
            <div className="actions">
              <button className="btn" type="button" onClick={() => setTheme('dark')}>
                Dark
              </button>
              <button className="btn" type="button" onClick={() => setTheme('light')}>
                Light
              </button>
            </div>
          </Field>
          <button className="btn btn-primary" type="submit">
            Save settings
          </button>
        </form>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Gmail</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Status: <strong>{profile?.gmail_connected ? 'Connected' : 'Not connected'}</strong>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Each user connects their own Gmail. Tokens stay on the server. See <Link to="/help">Help</Link> for OAuth setup.
          </p>
          <button className="btn btn-primary" type="button" onClick={connectGmail}>
            Connect Gmail
          </button>
          {profile?.gmail_connected && (
            <button
              className="btn"
              type="button"
              style={{ marginLeft: 8 }}
              onClick={async () => {
                await updateProfile({ gmail_connected: false })
                show('Disconnected (local flag). Revoke token in Google if needed.')
              }}
            >
              Disconnect
            </button>
          )}

          <h3>Backup</h3>
          <div className="actions">
            <button className="btn" type="button" onClick={exportBackup}>
              Export JSON
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) importBackup(f)
                }}
              />
            </label>
          </div>

          <h3 style={{ color: 'var(--danger)' }}>Danger zone</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Permanently wipe creators, brands, campaigns, meetings, activity, and outreach logs. Keeps your profile, Gmail connection, and email templates.
          </p>
          <button className="btn btn-danger" type="button" onClick={clearAllCrmData}>
            Clear all CRM data
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Email templates</h3>
        <div className="tabs">
          {(['new', 'reach_back_0', 'reach_back_1', 'reach_back_2'] as const).map((k) => (
            <button key={k} className={`tab ${activeKey === k ? 'active' : ''}`} type="button" onClick={() => setActiveKey(k)}>
              {k}
            </button>
          ))}
        </div>
        {current ? (
          <form onSubmit={saveTemplate}>
            <Field label="Subject">
              <input
                className="input"
                value={current.subject}
                onChange={(e) =>
                  setTemplates((prev) => prev.map((t) => (t.id === current.id ? { ...t, subject: e.target.value } : t)))
                }
              />
            </Field>
            <Field label="Body ({{first_name}} {{brand_name}} {{sender_name}} {{personal_note}})">
              <textarea
                className="textarea"
                style={{ minHeight: 200 }}
                value={current.body_text}
                onChange={(e) =>
                  setTemplates((prev) => prev.map((t) => (t.id === current.id ? { ...t, body_text: e.target.value } : t)))
                }
              />
            </Field>
            <div className="actions">
              <button className="btn btn-primary" type="submit">
                Save template
              </button>
              <button className="btn" type="button" onClick={resetTemplate}>
                Reset default
              </button>
            </div>
          </form>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No template row — click Reset default.</p>
        )}
      </div>
    </div>
  )
}

function mapLegacyStatus(s: string) {
  if (s === 'signed') return 'roster'
  if (['no_reply', 'replied', 'negotiating', 'rejected', 'denied'].includes(s)) {
    return s === 'rejected' ? 'denied' : s
  }
  return 'no_reply'
}
