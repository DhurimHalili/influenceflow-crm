import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { CREATOR_STATUSES, STATUS_LABELS, type Creator, type PipelineStatus } from '../lib/types'
import { downloadCsv, formatDate, normalizeName, parseBulkLines } from '../lib/utils'
import { Empty, Field, FormActions, Modal, StatusBadge, useToast } from '../components/ui'
import { PageHeader, useActivityLogger } from '../components/Layout'

const emptyForm = {
  name: '',
  contact_email: '',
  channel_link: '',
  niche: '',
  avg_views: '',
  platform: 'youtube',
  pipeline_status: 'new' as PipelineStatus,
  notes: '',
  personalization: '',
  on_roster: false,
}

export function CreatorsPage() {
  const { user } = useAuth()
  const log = useActivityLogger()
  const { toast, show, Toast } = useToast()
  const [rows, setRows] = useState<Creator[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [view, setView] = useState<'table' | 'board'>('table')
  const [modal, setModal] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [editing, setEditing] = useState<Creator | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<PipelineStatus>('contacted')

  async function load() {
    if (!user) return
    const { data } = await supabase
      .from('creators')
      .select('*')
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
    setRows((data || []) as Creator[])
  }

  useEffect(() => {
    load()
  }, [user])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.pipeline_status !== status) return false
      if (!q.trim()) return true
      const s = q.toLowerCase()
      return [r.name, r.contact_email, r.niche, r.channel_link].some((v) => (v || '').toLowerCase().includes(s))
    })
  }, [rows, q, status])

  useEffect(() => {
    setSelected(new Set())
  }, [q, status, view])

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  const someFilteredSelected = filtered.some((r) => selected.has(r.id))

  const duplicates = useMemo(() => {
    const map = new Map<string, Creator[]>()
    for (const r of rows.filter((x) => !x.archived_at)) {
      const key = normalizeName(r.name)
      if (!key) continue
      map.set(key, [...(map.get(key) || []), r])
    }
    return [...map.values()].filter((g) => g.length > 1)
  }, [rows])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setModal(true)
  }

  function openEdit(c: Creator) {
    setEditing(c)
    setForm({
      name: c.name,
      contact_email: c.contact_email || '',
      channel_link: c.channel_link || '',
      niche: c.niche || '',
      avg_views: c.avg_views != null ? String(c.avg_views) : '',
      platform: c.platform || 'youtube',
      pipeline_status: c.pipeline_status,
      notes: c.notes || '',
      personalization: c.personalization || '',
      on_roster: c.on_roster,
    })
    setModal(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    setBusy(true)
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      contact_email: form.contact_email.trim() || null,
      channel_link: form.channel_link.trim() || null,
      niche: form.niche.trim() || null,
      avg_views: form.avg_views ? Number(form.avg_views) : null,
      platform: form.platform,
      pipeline_status: form.pipeline_status,
      notes: form.notes,
      personalization: form.personalization,
      on_roster: form.on_roster || form.pipeline_status === 'roster',
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('creators').update(payload).eq('id', editing.id)
      await log(`Updated creator ${payload.name}`)
    } else {
      await supabase.from('creators').insert(payload)
      await log(`Added creator ${payload.name}`)
    }
    setBusy(false)
    setModal(false)
    show('Saved')
    load()
  }

  async function moveToDeleted(c: Creator) {
    await supabase.from('creators').update({ archived_at: new Date().toISOString() }).eq('id', c.id)
    await log(`Moved creator ${c.name} to Deleted`)
    show('Moved to Deleted')
    load()
  }

  async function softDeleteCreators(ids: string[]) {
    if (!ids.length) return null
    const { error } = await supabase
      .from('creators')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids)
    return error
  }

  async function applyBulkDelete() {
    if (!user || selected.size === 0) return
    const ids = [...selected]
    if (!confirm(`Move ${ids.length} creator${ids.length === 1 ? '' : 's'} to Deleted? Search will skip them.`)) return
    setBusy(true)
    const error = await softDeleteCreators(ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Moved ${ids.length} creators to Deleted`)
    setSelected(new Set())
    show(`Moved ${ids.length} to Deleted`)
    load()
  }

  async function deleteAllCreators() {
    if (!user) return
    const { data, error: loadErr } = await supabase.from('creators').select('id').is('archived_at', null)
    if (loadErr) {
      show(loadErr.message)
      return
    }
    const ids = (data || []).map((r) => r.id)
    if (!ids.length) {
      show('No creators to delete')
      return
    }
    if (!confirm(`Move ALL ${ids.length} active creators to Deleted?`)) return
    setBusy(true)
    const error = await softDeleteCreators(ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Moved all ${ids.length} creators to Deleted`)
    setSelected(new Set())
    show(`Moved all ${ids.length} to Deleted`)
    load()
  }

  async function bulkImport(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    // Smart bulk: handles 3 formats:
    // 1) Simple: Name, email, niche
    // 2) Sheet: Name, channelUrl (detects youtube.com/http -> channel_link)
    // 3) Full CSV: name,channel_link,niche,avg_views,platform,pipeline_status,notes (with header)
    const raw = bulk.trim()
    const isCsvHeader = /name\s*,\s*channel/i.test(raw.split('\n')[0] || '')
    let inserts: any[] = []
    const existingNames = new Set(rows.map((r) => normalizeName(r.name)))
    const existingLinks = new Set(rows.map((r) => (r.channel_link || '').toLowerCase()))

    if (isCsvHeader) {
      const lines = raw.split(/\r?\n/).slice(1).filter(Boolean)
      for (const line of lines) {
        // naive CSV split handling quoted commas
        const parts: string[] = []
        let cur = '', inQ = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') { inQ = !inQ; continue }
          if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = '' } else cur += ch
        }
        parts.push(cur.trim())
        const [name, channel_link, niche, avg_views, , , notes] = parts
        if (!name || existingNames.has(normalizeName(name))) continue
        if (channel_link && existingLinks.has(channel_link.toLowerCase())) continue
        inserts.push({
          user_id: user.id,
          name: name.replace(/^"|"$/g, ''),
          channel_link: channel_link?.replace(/^"|"$/g, '') || null,
          niche: niche?.replace(/^"|"$/g, '') || 'Desk Setups & Battlestations',
          avg_views: avg_views ? Number(avg_views.replace(/[^0-9]/g, '')) || null : null,
          platform: 'youtube' as const,
          pipeline_status: 'new' as const,
          notes: notes?.replace(/^"|"$/g, '') || null,
        })
      }
    } else {
      const lines = parseBulkLines(raw)
      for (const l of lines) {
        if (existingNames.has(normalizeName(l.name))) continue
        const second = (l.email || '').trim()
        const isUrl = /https?:|youtube\.com|youtu\.be/i.test(second)
        const third = (l.extra || '').trim()
        const isThirdNumeric = /^\d+$/.test(third.replace(/[, ]/g, ''))
        if (isUrl) {
          if (second && existingLinks.has(second.toLowerCase())) continue
          inserts.push({
            user_id: user.id,
            name: l.name,
            channel_link: second || null,
            contact_email: null,
            niche: isThirdNumeric ? null : (third || 'Desk Setups & Battlestations'),
            avg_views: isThirdNumeric ? Number(third.replace(/[^0-9]/g, '')) : null,
            pipeline_status: 'new' as const,
          })
        } else {
          inserts.push({
            user_id: user.id,
            name: l.name,
            contact_email: isUrl ? null : (second || null),
            channel_link: null,
            niche: third || null,
            pipeline_status: 'new' as const,
          })
        }
      }
    }
    if (inserts.length) {
      const { error } = await supabase.from('creators').insert(inserts)
      if (error) { show(error.message); setBusy(false); return }
    }
    setBusy(false)
    setBulkOpen(false)
    setBulk('')
    show(`Imported ${inserts.length} creators`)
    await log(`Bulk imported ${inserts.length} creators`)
    load()
  }

  async function mergeGroup(group: Creator[]) {
    const primary = group[0]
    const notes = group.map((g) => g.notes).filter(Boolean).join('\n---\n')
    const personalization = group.map((g) => g.personalization).filter(Boolean).join('\n')
    await supabase
      .from('creators')
      .update({
        notes,
        personalization,
        contact_email: primary.contact_email || group.find((g) => g.contact_email)?.contact_email || null,
        channel_link: primary.channel_link || group.find((g) => g.channel_link)?.channel_link || null,
      })
      .eq('id', primary.id)
    for (const dup of group.slice(1)) {
      await supabase.from('creators').update({ archived_at: new Date().toISOString() }).eq('id', dup.id)
    }
    show('Merged duplicates')
    setMergeOpen(false)
    load()
  }

  async function moveStatus(id: string, pipeline_status: PipelineStatus) {
    await supabase
      .from('creators')
      .update({
        pipeline_status,
        on_roster: pipeline_status === 'roster',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    load()
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const r of filtered) next.delete(r.id)
        return next
      })
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of filtered) next.add(r.id)
      return next
    })
  }

  async function applyBulkStatus() {
    if (!user || selected.size === 0) return
    setBusy(true)
    const ids = [...selected]
    const { error } = await supabase
      .from('creators')
      .update({
        pipeline_status: bulkStatus,
        on_roster: bulkStatus === 'roster',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Bulk updated ${ids.length} creators → ${STATUS_LABELS[bulkStatus]}`)
    setSelected(new Set())
    show(`Updated ${ids.length} creator${ids.length === 1 ? '' : 's'} → ${STATUS_LABELS[bulkStatus]}`)
    load()
  }

  function exportCsv() {
    downloadCsv(
      'creators.csv',
      filtered.map((r) => ({
        name: r.name,
        email: r.contact_email,
        channel: r.channel_link,
        niche: r.niche,
        status: r.pipeline_status,
        notes: r.notes,
        personalization: r.personalization,
      })),
    )
  }

  return (
    <div>
      {Toast}
      <PageHeader title="Creators" subtitle={`${filtered.length} shown`}>
        <button className="btn" type="button" onClick={() => setView(view === 'table' ? 'board' : 'table')}>
          {view === 'table' ? 'Board' : 'Table'}
        </button>
        <button className="btn" type="button" onClick={exportCsv}>
          Export CSV
        </button>
        <button className="btn" type="button" onClick={() => setBulkOpen(true)}>
          Bulk import
        </button>
        {duplicates.length > 0 && (
          <button className="btn" type="button" onClick={() => setMergeOpen(true)}>
            Merge duplicates ({duplicates.length})
          </button>
        )}
        <button className="btn btn-danger" type="button" disabled={busy || rows.length === 0} onClick={deleteAllCreators}>
          Delete all
        </button>
        <Link className="btn" to="/app/deleted">
          Deleted list
        </Link>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add creator
        </button>
      </PageHeader>

      {rows.length > 0 && rows.length < 50 && (
        <div className="card" style={{ marginBottom: '.85rem', border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--border))', background: 'color-mix(in srgb, var(--warning) 7%, var(--bg-elevated))', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px' }}>
          <span style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--warning)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '.8rem' }}>!</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong style={{ color: 'var(--text)', fontSize: '.88rem' }}>Only {rows.length} creators so far — haven't hit 50 yet?</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem', lineHeight: 1.5 }}>We keep the shortlist <strong style={{ color: 'var(--text)' }}>strict by default</strong> (50k / 1%) for quality — we don't make it looser silently. If you need more volume, <em>you</em> can loosen: broaden the niche in <strong>Search</strong> (e.g. Desk Setups → All Tech) or lower gates in <strong>Discovery → Filters</strong> (try 30k / 0.7%). One lever at a time, then Run again.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn" to="/app/search" style={{ fontSize: '.8rem', padding: '6px 10px' }}>Go Search → broaden</Link>
            <Link className="btn btn-primary" to="/app/discovery" style={{ fontSize: '.8rem', padding: '6px 10px' }}>Discovery → looser</Link>
          </div>
        </div>
      )}

      <div className="filters">
        <input className="input" style={{ maxWidth: 240 }} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {CREATOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">
            {selected.size} selected
            {someFilteredSelected && !allFilteredSelected ? ` · ${filtered.filter((r) => selected.has(r.id)).length} on this page` : ''}
          </span>
          <select className="select" style={{ maxWidth: 200 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PipelineStatus)}>
            {CREATOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={applyBulkStatus}>
            Update status
          </button>
          <button className="btn btn-danger" type="button" disabled={busy} onClick={applyBulkDelete}>
            Delete selected
          </button>
          <button className="btn" type="button" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {view === 'board' ? (
        <div className="kanban">
          {CREATOR_STATUSES.map((col) => (
            <div
              key={col}
              className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/plain')
                if (id) moveStatus(id, col)
              }}
            >
              <h3>
                {STATUS_LABELS[col]} ({filtered.filter((r) => r.pipeline_status === col).length})
              </h3>
              {filtered
                .filter((r) => r.pipeline_status === col)
                .map((c) => (
                  <div
                    key={c.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                    onClick={() => openEdit(c)}
                  >
                    <strong>{c.name}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.niche || c.contact_email || '—'}</div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="table-wrap desktop-only">
            <table className="data">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected
                      }}
                      onChange={toggleAllFiltered}
                    />
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Niche</th>
                  <th>Status</th>
                  <th>Contacted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={selected.has(c.id) ? 'row-selected' : undefined}>
                    <td className="col-check">
                      <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                    <td>
                      <Link to={`/app/creators/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.contact_email || '—'}</td>
                    <td>{c.niche || '—'}</td>
                    <td>
                      <StatusBadge status={c.pipeline_status} />
                    </td>
                    <td>{formatDate(c.date_contacted || c.last_sent_at)}</td>
                    <td>
                      <button className="btn btn-ghost" type="button" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={() => moveToDeleted(c)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <Empty>No creators yet. Add one or bulk import.</Empty>}
          </div>
          <div className="mobile-cards">
            {filtered.map((c) => (
              <div className={`mobile-card${selected.has(c.id) ? ' row-selected' : ''}`} key={c.id}>
                <label className="mobile-select">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                  <h3>
                    <Link to={`/app/creators/${c.id}`}>{c.name}</Link>
                  </h3>
                </label>
                <StatusBadge status={c.pipeline_status} />
                <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>{c.contact_email || 'No email'}</div>
                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="btn" type="button" onClick={() => openEdit(c)}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={modal} title={editing ? 'Edit creator' : 'Add creator'} onClose={() => setModal(false)} wide>
        <form onSubmit={save}>
          <div className="grid-2">
            <Field label="Name">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </Field>
            <Field label="Channel link">
              <input className="input" value={form.channel_link} onChange={(e) => setForm({ ...form, channel_link: e.target.value })} />
            </Field>
            <Field label="Niche">
              <input className="input" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
            </Field>
            <Field label="Avg views">
              <input className="input" value={form.avg_views} onChange={(e) => setForm({ ...form, avg_views: e.target.value })} />
            </Field>
            <Field label="Platform">
              <select className="select" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="twitch">Twitch</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="select" value={form.pipeline_status} onChange={(e) => setForm({ ...form, pipeline_status: e.target.value as PipelineStatus })}>
                {CREATOR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.on_roster} onChange={(e) => setForm({ ...form, on_roster: e.target.checked, pipeline_status: e.target.checked ? 'roster' : form.pipeline_status })} />
            <span>On roster</span>
          </label>
          <Field label="Personalization snippet (fills {{personal_note}})">
            <textarea className="textarea" value={form.personalization} onChange={(e) => setForm({ ...form, personalization: e.target.value })} />
          </Field>
          <Field label="Notes (decks, links…)">
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <FormActions onCancel={() => setModal(false)} busy={busy} />
        </form>
      </Modal>

      <Modal open={bulkOpen} title="Bulk import creators" onClose={() => setBulkOpen(false)}>
        <form onSubmit={bulkImport}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Paste one per line: <strong style={{ color: 'var(--text)' }}>Name, channelUrl</strong> or <strong style={{ color: 'var(--text)' }}>Name, email, niche</strong> — channel URLs auto-detected.
            <br />Or paste the full <code style={{ background: 'var(--bg-soft)', padding: '1px 5px', borderRadius: 4 }}>name,channel_link,niche,avg_views</code> CSV (with header) from <code>influencer_creators_ready.csv</code>.
          </p>
          <label className="btn btn-ghost" style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Attach CSV file
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              const text = await file.text(); setBulk(text)
            }} />
          </label>
          <textarea className="textarea" style={{ minHeight: 180, fontFamily: 'var(--mono)', fontSize: '.85rem' }} value={bulk} onChange={(e) => setBulk(e.target.value)} required placeholder={`Rory Alexander, https://www.youtube.com/channel/UCqPNuJUqqn9QBZiq1QEW_UA\nJames Baldwin, https://www.youtube.com/channel/UC0Ene38yf-Y6movLKSvc0Iw\n— or paste influencer_creators_ready.csv with header —`} />
          <FormActions onCancel={() => setBulkOpen(false)} submitLabel="Import" busy={busy} />
        </form>
      </Modal>

      <Modal open={mergeOpen} title="Merge duplicates" onClose={() => setMergeOpen(false)} wide>
        {duplicates.map((g) => (
          <div key={g[0].id} className="card" style={{ marginBottom: 8 }}>
            <strong>{g[0].name}</strong> — {g.length} copies
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" type="button" onClick={() => mergeGroup(g)}>
                Keep first, archive others
              </button>
            </div>
          </div>
        ))}
      </Modal>
      {toast ? null : null}
    </div>
  )
}

export function CreatorDetailPage() {
  const { id } = useParams()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [c, setC] = useState<Creator | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('creators').select('*').eq('id', id).maybeSingle()
    setC(data as Creator | null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id])

  async function setStatus(pipeline_status: PipelineStatus) {
    if (!c) return
    setBusy(true)
    const { error } = await supabase
      .from('creators')
      .update({
        pipeline_status,
        on_roster: pipeline_status === 'roster',
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Updated ${c.name} → ${STATUS_LABELS[pipeline_status]}`)
    show(`Status → ${STATUS_LABELS[pipeline_status]}`)
    load()
  }

  if (loading) return <Empty>Loading…</Empty>
  if (!c) return <Empty>Creator not found</Empty>
  return (
    <div>
      {Toast}
      <PageHeader title={c.name} subtitle={c.contact_email || undefined}>
        <Link className="btn" to="/app/outreach">
          Outreach
        </Link>
        <Link className="btn" to="/app/creators">
          Back
        </Link>
      </PageHeader>
      <div className="grid-2">
        <div className="card">
          <p>
            <StatusBadge status={c.pipeline_status} />
          </p>
          <p>Platform: {c.platform || '—'}</p>
          <p>Channel: {c.channel_link ? <a href={c.channel_link} target="_blank" rel="noreferrer">{c.channel_link}</a> : '—'}</p>
          <p>Niche: {c.niche || '—'}</p>
          <p>Reach-backs: {c.reach_back_count}</p>
          <p>Last sent: {formatDate(c.last_sent_at)}</p>
          <div className="quick-row">
            {(['contacted', 'replied', 'negotiating', 'roster', 'denied', 'no_reply'] as PipelineStatus[]).map((s) => (
              <button key={s} className="btn btn-ghost" type="button" disabled={busy || c.pipeline_status === s} onClick={() => setStatus(s)}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Personalization</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{c.personalization || '—'}</p>
          <h3>Notes</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{c.notes || '—'}</p>
        </div>
      </div>
    </div>
  )
}
