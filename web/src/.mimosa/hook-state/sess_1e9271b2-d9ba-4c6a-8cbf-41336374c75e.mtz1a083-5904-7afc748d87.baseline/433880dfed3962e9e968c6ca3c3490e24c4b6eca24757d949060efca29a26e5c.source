import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { BrandContact, Creator, EmailTemplate, SendJobItem } from '../lib/types'
import { estimateSendMinutes, renderTemplate } from '../lib/utils'
import { Empty, Field, Modal, useToast } from '../components/ui'
import { PageHeader, useActivityLogger } from '../components/Layout'

type Audience = 'influencers' | 'brands'

type Target = {
  target_type: 'creator' | 'brand_contact'
  target_id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  title: string
  brand_name: string
  send_mode: 'new' | 'reach_back'
  personalization: string
  reach_back_count: number
  last_sent_at: string | null
  pipeline_status: string
}

type DraftItem = SendJobItem & {
  last_name?: string
  title?: string
  full_name?: string
}

function neverContacted(t: Target) {
  return !t.last_sent_at && (t.pipeline_status === 'new' || !t.pipeline_status)
}

export function OutreachPage() {
  const { user, profile } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [tab, setTab] = useState<'new' | 'reach_back' | 'queued' | 'sent'>('new')
  const [audience, setAudience] = useState<Audience>('influencers')
  const [targets, setTargets] = useState<Target[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [mode, setMode] = useState<'new' | 'reach_back' | 'mixed'>('new')
  const [composeMode, setComposeMode] = useState<'template' | 'review' | 'custom'>('review')
  const [limit, setLimit] = useState(20)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [sentToday, setSentToday] = useState(0)
  const [busy, setBusy] = useState(false)
  const [customBody, setCustomBody] = useState({ subject: '', body: '' })

  const delayMin = profile?.send_delay_min ?? 60
  const delayMax = profile?.send_delay_max ?? 150
  const dailyLimit = profile?.daily_send_limit ?? 50
  const reachDays = profile?.reach_back_days ?? 3
  const maxRb = profile?.max_reach_backs ?? 3

  async function load() {
    if (!user) return
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const [creators, contacts, brands, tpls, sent] = await Promise.all([
      supabase.from('creators').select('*').is('archived_at', null),
      supabase.from('brand_contacts').select('*, brands(name)').is('archived_at', null),
      supabase.from('brands').select('id,name'),
      supabase.from('email_templates').select('*'),
      supabase.from('outreach_events').select('id', { count: 'exact', head: true }).gte('sent_at', start.toISOString()),
    ])
    setTemplates((tpls.data || []) as EmailTemplate[])
    setSentToday(sent.count || 0)
    const brandMap = new Map((brands.data || []).map((b) => [b.id, b.name]))
    const list: Target[] = []

    for (const c of (creators.data || []) as Creator[]) {
      if (!c.contact_email) continue
      const parts = (c.name || '').trim().split(/\s+/)
      const first = parts[0] || c.name
      const last = parts.slice(1).join(' ')
      list.push({
        target_type: 'creator',
        target_id: c.id,
        email: c.contact_email,
        first_name: first,
        last_name: last,
        full_name: c.name,
        title: '',
        brand_name: c.name,
        send_mode: c.last_sent_at ? 'reach_back' : 'new',
        personalization: c.personalization || '',
        reach_back_count: c.reach_back_count || 0,
        last_sent_at: c.last_sent_at,
        pipeline_status: c.pipeline_status || 'new',
      })
    }

    for (const p of (contacts.data || []) as BrandContact[]) {
      const brandName =
        (p as BrandContact & { brands?: { name?: string } }).brands?.name || brandMap.get(p.brand_id) || 'Brand'
      const first = p.first_name || ''
      const last = p.last_name || ''
      const full = [first, last].filter(Boolean).join(' ') || p.email
      list.push({
        target_type: 'brand_contact',
        target_id: p.id,
        email: p.email,
        first_name: first || 'there',
        last_name: last,
        full_name: full,
        title: p.title || '',
        brand_name: brandName,
        send_mode: p.last_sent_at ? 'reach_back' : 'new',
        personalization: p.personalization || '',
        reach_back_count: p.reach_back_count || 0,
        last_sent_at: p.last_sent_at,
        pipeline_status: p.pipeline_status || 'new',
      })
    }
    setTargets(list)
  }

  useEffect(() => {
    load()
  }, [user])

  useEffect(() => {
    setSelected(new Set())
  }, [audience, tab])

  const byAudience = useMemo(() => {
    return targets.filter((t) =>
      audience === 'influencers' ? t.target_type === 'creator' : t.target_type === 'brand_contact',
    )
  }, [targets, audience])

  const dueReach = useMemo(() => {
    return byAudience.filter((t) => {
      if (!t.last_sent_at) return false
      if (t.reach_back_count >= maxRb) return false
      if (['denied', 'roster', 'signed'].includes(t.pipeline_status)) return false
      return Date.now() - new Date(t.last_sent_at).getTime() >= reachDays * 86400000
    })
  }, [byAudience, reachDays, maxRb])

  const newOnes = useMemo(() => byAudience.filter(neverContacted), [byAudience])

  const visible = tab === 'new' ? newOnes : tab === 'reach_back' ? dueReach : byAudience

  function keyOf(t: Target) {
    return `${t.target_type}:${t.target_id}`
  }

  function toggle(t: Target) {
    const k = keyOf(t)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map(keyOf)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function pickTemplate(sendMode: 'new' | 'reach_back', rbCount: number) {
    if (sendMode === 'new') return templates.find((t) => t.template_key === 'new')
    const key = rbCount === 0 ? 'reach_back_0' : rbCount === 1 ? 'reach_back_1' : 'reach_back_2'
    return templates.find((t) => t.template_key === key) || templates.find((t) => t.template_key === 'reach_back_0')
  }

  function buildDraftsFromSelection(): DraftItem[] {
    const chosen = visible.filter((t) => selected.has(keyOf(t)))
    if (!chosen.length) {
      show('Select at least one person to send')
      return []
    }
    let pool = chosen
    if (mode === 'new') pool = chosen.filter(neverContacted)
    else if (mode === 'reach_back') pool = chosen.filter((t) => !!t.last_sent_at)
    const remaining = Math.max(0, dailyLimit - sentToday)
    pool = pool.slice(0, Math.min(limit, remaining))
    return pool.map((t, i) => {
      const sendMode = mode === 'mixed' ? t.send_mode : mode === 'new' ? 'new' : 'reach_back'
      const tpl = pickTemplate(sendMode, t.reach_back_count)
      const vars = {
        first_name: t.first_name,
        last_name: t.last_name,
        full_name: t.full_name,
        brand_name: t.brand_name,
        title: t.title,
        sender_name: profile?.sender_name || 'there',
        personal_note: t.personalization,
        niche: '',
        channel_link: '',
      }
      let subject = tpl ? renderTemplate(tpl.subject, vars) : `Quick question re: ${t.brand_name}`
      let body_text = tpl ? renderTemplate(tpl.body_text, vars) : `Hi ${t.first_name},\n\n`
      if (composeMode === 'custom') {
        subject = renderTemplate(customBody.subject || subject, vars)
        body_text = renderTemplate(customBody.body || body_text, vars)
      }
      return {
        id: `draft-${i}`,
        user_id: user!.id,
        job_id: '',
        target_type: t.target_type,
        target_id: t.target_id,
        email: t.email,
        first_name: t.first_name,
        last_name: t.last_name,
        full_name: t.full_name,
        title: t.title,
        brand_name: t.brand_name,
        send_mode: sendMode,
        subject,
        body_text,
        body_html: null,
        customized: composeMode === 'custom',
        status: 'queued',
        error: null,
        message_id: null,
        sent_at: null,
        sort_order: i,
      }
    })
  }

  function startCompose() {
    if (!profile?.gmail_connected) {
      show('Connect Gmail in Settings first')
      return
    }
    const items = buildDraftsFromSelection()
    if (!items.length) {
      show('No recipients selected / available for this mode')
      return
    }
    setDrafts(items)
    if (composeMode === 'template') setConfirmOpen(true)
    else setReviewOpen(true)
  }

  async function markAlreadyContacted() {
    if (!user) return
    const chosen = visible.filter((t) => selected.has(keyOf(t)))
    if (!chosen.length) {
      show('Select people you already emailed')
      return
    }
    if (!confirm(`Mark ${chosen.length} as already contacted? They stay in the CRM but leave the New list.`)) return
    setBusy(true)
    const now = new Date().toISOString()
    const day = now.slice(0, 10)
    for (const t of chosen) {
      if (t.target_type === 'creator') {
        await supabase
          .from('creators')
          .update({
            last_sent_at: now,
            date_contacted: day,
            pipeline_status: 'contacted',
            updated_at: now,
          })
          .eq('id', t.target_id)
          .eq('user_id', user.id)
      } else {
        await supabase
          .from('brand_contacts')
          .update({
            last_sent_at: now,
            date_contacted: day,
            pipeline_status: 'contacted',
            updated_at: now,
          })
          .eq('id', t.target_id)
          .eq('user_id', user.id)
      }
      await supabase.from('outreach_events').insert({
        user_id: user.id,
        target_type: t.target_type,
        target_id: t.target_id,
        email: t.email,
        mode: 'new',
        subject: '[Marked already contacted — no email sent]',
        sent_at: now,
      })
    }
    await log(`Marked ${chosen.length} as already contacted`)
    setBusy(false)
    setSelected(new Set())
    show(`Marked ${chosen.length} contacted (not deleted)`)
    load()
  }

  async function queueAndSend() {
    if (!user || !drafts.length) return
    setBusy(true)
    const { data: job, error } = await supabase
      .from('send_jobs')
      .insert({
        user_id: user.id,
        mode,
        status: 'pending',
        total: drafts.length,
      })
      .select('*')
      .single()
    if (error || !job) {
      setBusy(false)
      show(error?.message || 'Failed to create job')
      return
    }
    const items = drafts.map((d, i) => ({
      user_id: user.id,
      job_id: job.id,
      target_type: d.target_type,
      target_id: d.target_id,
      email: d.email,
      first_name: d.first_name,
      brand_name: d.brand_name,
      send_mode: d.send_mode,
      subject: d.subject,
      body_text: d.body_text,
      body_html: d.body_html,
      customized: d.customized,
      status: 'queued',
      sort_order: i,
    }))
    await supabase.from('send_job_items').insert(items)

    const { error: fnErr } = await supabase.functions.invoke('send-emails', {
      body: { job_id: job.id },
    })

    if (fnErr) {
      show('Job queued, but send function failed: ' + fnErr.message)
      await log(`Queued send job (${drafts.length} emails)`)
    } else {
      show('Sending started')
      await log(`Started sending ${drafts.length} emails`)
    }
    setBusy(false)
    setConfirmOpen(false)
    setReviewOpen(false)
    setSelected(new Set())
    load()
  }

  const eta = estimateSendMinutes(drafts.length, delayMin, delayMax)
  const customizedCount = drafts.filter((d) => d.customized).length

  const SOON_MODE = true // temporary — keep outreach code intact, just gate UI
  if (SOON_MODE) {
    return (
      <div style={{ position: 'relative', minHeight: '68vh', display: 'grid', placeItems: 'center', padding: '2rem 1rem' }}>
        {Toast}
        <div
          style={{
            width: 'min(840px, 100%)',
            borderRadius: 24,
            padding: '2px',
            background: 'linear-gradient(135deg, rgba(124,58,237,.9), rgba(236,72,153,.85), rgba(14,165,233,.85))',
            boxShadow: '0 20px 60px rgba(124,58,237,.22), 0 8px 24px rgba(0,0,0,.18)',
          }}
        >
          <div
            style={{
              borderRadius: 22,
              background:
                'radial-gradient(800px 400px at 20% 0%, rgba(124,58,237,.18), transparent 60%), radial-gradient(700px 500px at 90% 30%, rgba(236,72,153,.14), transparent 60%), linear-gradient(180deg, rgba(18,18,22,.96), rgba(10,10,14,.98))',
              border: '1px solid rgba(255,255,255,.08)',
              padding: '3rem 2rem',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: -40,
                background:
                  'repeating-linear-gradient( -12deg, transparent 0 22px, rgba(255,255,255,.015) 22px 24px)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(124,58,237,.14)',
                border: '1px solid rgba(124,58,237,.28)',
                color: '#c4b5fd',
                fontSize: '.78rem',
                letterSpacing: '.08em',
                fontWeight: 700,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#a78bfa', boxShadow: '0 0 12px #a78bfa', display: 'inline-block' }} />
              OUTREACH · SOON
            </div>
            <h1
              style={{
                margin: '1.1rem 0 .6rem',
                fontSize: 'clamp(2rem, 5vw, 3.2rem)',
                lineHeight: 1,
                letterSpacing: '-.04em',
                fontFamily: 'var(--display, Inter)',
                background: 'linear-gradient(180deg, #fff 0%, #e9e5ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Supercharged outreach
              <br />
              <span style={{ background: 'linear-gradient(90deg,#a78bfa,#f0abfc,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                is on its way
              </span>
            </h1>
            <p style={{ margin: '0 auto', maxWidth: 560, color: 'rgba(255,255,255,.72)', fontSize: '1.02rem', lineHeight: 1.6 }}>
              Automated sequences, Gmail sync & reach-back scheduling are being polished. Your creators, brands and campaigns keep working — outreach will unlock here shortly.
            </p>
            <div style={{ marginTop: '1.6rem', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{ padding: '10px 16px', borderRadius: 12, background: '#fff', color: '#111', fontWeight: 700, fontSize: '.9rem' }}>Coming soon</span>
              <span style={{ padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontWeight: 600, fontSize: '.9rem' }}>
                Code preserved — flip SOON_MODE to re-enable
              </span>
            </div>
            <div style={{ marginTop: '1.4rem', color: 'rgba(255,255,255,.45)', fontSize: '.82rem' }}>Need it now? Ask Dhurim to toggle it — nothing was deleted.</div>
          </div>
        </div>
        {/* Keep original outreach tree mounted hidden for quick re-enable (not rendered visually) */}
        <div style={{ display: 'none' }} aria-hidden>
          <PageHeader title="Outreach-hidden" subtitle="" />
        </div>
      </div>
    )
  }
  return (
    <div>
      {Toast}
      <PageHeader
        title="Outreach"
        subtitle={`Sent today ${sentToday}/${dailyLimit} · Gmail ${profile?.gmail_connected ? 'ready' : 'not connected'}`}
      >
        <button className="btn" type="button" disabled={busy || selected.size === 0} onClick={markAlreadyContacted}>
          Mark already contacted
        </button>
        <button className="btn btn-primary" type="button" onClick={startCompose}>
          Prepare send
        </button>
      </PageHeader>

      <div className="tabs">
        <button
          className={`tab ${audience === 'influencers' ? 'active' : ''}`}
          type="button"
          onClick={() => setAudience('influencers')}
        >
          Influencers
        </button>
        <button className={`tab ${audience === 'brands' ? 'active' : ''}`} type="button" onClick={() => setAudience('brands')}>
          Brands (people)
        </button>
      </div>

      <div className="tabs">
        {(
          [
            ['new', `New (${newOnes.length})`],
            ['reach_back', `Reach-back due (${dueReach.length})`],
            ['queued', 'Queued'],
            ['sent', 'Sent recently'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} type="button" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {(tab === 'new' || tab === 'reach_back') && (
        <>
          <div className="card" style={{ marginBottom: '0.85rem' }}>
            <div className="grid-3">
              <Field label="Send mode">
                <select className="select" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="new">New only</option>
                  <option value="reach_back">Reach-back only</option>
                  <option value="mixed">Mixed (selected only)</option>
                </select>
              </Field>
              <Field label="Personalization">
                <select
                  className="select"
                  value={composeMode}
                  onChange={(e) => setComposeMode(e.target.value as typeof composeMode)}
                >
                  <option value="template">Template (bulk)</option>
                  <option value="review">Review & customize</option>
                  <option value="custom">Write custom base</option>
                </select>
              </Field>
              <Field label="Max emails this run">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={dailyLimit}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 1)}
                />
              </Field>
            </div>
            {composeMode === 'custom' && (
              <div className="grid-2">
                <Field label="Custom subject ({{first_name}} {{brand_name}} {{title}})">
                  <input
                    className="input"
                    value={customBody.subject}
                    onChange={(e) => setCustomBody({ ...customBody, subject: e.target.value })}
                  />
                </Field>
                <Field label="Custom body">
                  <textarea
                    className="textarea"
                    value={customBody.body}
                    onChange={(e) => setCustomBody({ ...customBody, body: e.target.value })}
                  />
                </Field>
              </div>
            )}
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" type="button" onClick={selectAllVisible}>
                Select all shown
              </button>
              <button className="btn btn-ghost" type="button" onClick={clearSelection}>
                Clear selection
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {audience === 'influencers' ? 'Influencers only' : 'Brand people only'} · selected {selected.size}
              </span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  {audience === 'brands' ? (
                    <>
                      <th>Brand</th>
                      <th>First name</th>
                      <th>Last name</th>
                      <th>Job title</th>
                      <th>Email</th>
                    </>
                  ) : (
                    <>
                      <th>Influencer</th>
                      <th>Email</th>
                    </>
                  )}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={keyOf(t)}>
                    <td>
                      <input type="checkbox" checked={selected.has(keyOf(t))} onChange={() => toggle(t)} />
                    </td>
                    {audience === 'brands' ? (
                      <>
                        <td>
                          <strong>{t.brand_name}</strong>
                        </td>
                        <td>{t.first_name || '—'}</td>
                        <td>{t.last_name || '—'}</td>
                        <td>{t.title || '—'}</td>
                        <td>{t.email}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{t.full_name}</strong>
                        </td>
                        <td>{t.email}</td>
                      </>
                    )}
                    <td>{t.send_mode === 'new' ? 'new' : `reach-back ${t.reach_back_count}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <Empty>
                {tab === 'new'
                  ? 'No new people here. If you already emailed them, use “Mark already contacted” after selecting — or they are already marked.'
                  : 'No reach-backs due yet.'}
              </Empty>
            )}
          </div>
        </>
      )}

      {tab === 'queued' && <QueuedJobs />}
      {tab === 'sent' && <SentRecent />}

      <Modal open={reviewOpen} title="Review & personalize" onClose={() => setReviewOpen(false)} wide>
        <p style={{ color: 'var(--text-muted)' }}>Click a row to edit that email only.</p>
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          <table className="data">
            <thead>
              <tr>
                <th>To</th>
                <th>Brand / role</th>
                <th>Subject</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, i) => (
                <tr key={d.id}>
                  <td>
                    {d.full_name || d.first_name} &lt;{d.email}&gt;
                  </td>
                  <td>
                    {d.brand_name}
                    {d.title ? ` · ${d.title}` : ''}
                  </td>
                  <td>{d.subject}</td>
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => setEditIdx(i)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setReviewOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setReviewOpen(false)
              setConfirmOpen(true)
            }}
          >
            Continue
          </button>
        </div>
      </Modal>

      <Modal open={editIdx != null} title="Edit this email" onClose={() => setEditIdx(null)} wide>
        {editIdx != null && drafts[editIdx] && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              setEditIdx(null)
            }}
          >
            <Field label="Subject">
              <input
                className="input"
                value={drafts[editIdx].subject}
                onChange={(e) => {
                  const next = [...drafts]
                  next[editIdx] = { ...next[editIdx], subject: e.target.value, customized: true }
                  setDrafts(next)
                }}
              />
            </Field>
            <Field label="Body">
              <textarea
                className="textarea"
                style={{ minHeight: 220 }}
                value={drafts[editIdx].body_text}
                onChange={(e) => {
                  const next = [...drafts]
                  next[editIdx] = { ...next[editIdx], body_text: e.target.value, customized: true }
                  setDrafts(next)
                }}
              />
            </Field>
            <div className="modal-actions">
              <button className="btn btn-primary" type="submit">
                Done
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={confirmOpen} title="Confirm send" onClose={() => setConfirmOpen(false)}>
        <p>
          <strong>{drafts.length}</strong> emails · <strong>{audience}</strong> · <strong>{mode}</strong> ·{' '}
          {customizedCount} customized
        </p>
        <p style={{ color: 'var(--text-muted)' }}>
          Estimated time ~{eta} min (delays {delayMin}–{delayMax}s). Remaining daily quota after:{' '}
          {Math.max(0, dailyLimit - sentToday - drafts.length)}.
        </p>
        {!profile?.gmail_connected && <p className="error">Connect Gmail in Settings before sending.</p>}
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setConfirmOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !profile?.gmail_connected}
            onClick={queueAndSend}
          >
            {busy ? 'Queuing…' : 'Send'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function QueuedJobs() {
  const [jobs, setJobs] = useState<{ id: string; status: string; total: number; sent: number; created_at: string }[]>([])
  useEffect(() => {
    supabase
      .from('send_jobs')
      .select('id,status,total,sent,created_at')
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data || []))
  }, [])
  if (!jobs.length) return <Empty>No queued jobs.</Empty>
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>{j.id.slice(0, 8)}</td>
              <td>{j.status}</td>
              <td>
                {j.sent}/{j.total}
              </td>
              <td>{new Date(j.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SentRecent() {
  const [rows, setRows] = useState<{ email: string; mode: string; subject: string | null; sent_at: string }[]>([])
  useEffect(() => {
    supabase
      .from('outreach_events')
      .select('email,mode,subject,sent_at')
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setRows(data || []))
  }, [])
  if (!rows.length) return <Empty>No sends logged yet.</Empty>
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Email</th>
            <th>Mode</th>
            <th>Subject</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.email}-${i}`}>
              <td>{r.email}</td>
              <td>{r.mode}</td>
              <td>{r.subject || '—'}</td>
              <td>{new Date(r.sent_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
