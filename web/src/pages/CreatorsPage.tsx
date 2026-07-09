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
  const [showArchived, setShowArchived] = useState(false)
  const [view, setView] = useState<'table' | 'board'>('table')
  const [modal, setModal] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [editing, setEditing] = useState<Creator | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!user) return
    let query = supabase.from('creators').select('*').order('updated_at', { ascending: false })
    if (!showArchived) query = query.is('archived_at', null)
    const { data } = await query
    setRows((data || []) as Creator[])
  }

  useEffect(() => {
    load()
  }, [user, showArchived])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.pipeline_status !== status) return false
      if (!q.trim()) return true
      const s = q.toLowerCase()
      return [r.name, r.contact_email, r.niche, r.channel_link].some((v) => (v || '').toLowerCase().includes(s))
    })
  }, [rows, q, status])

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
      await log(`Updated creator <strong>${payload.name}</strong>`)
    } else {
      await supabase.from('creators').insert(payload)
      await log(`Added creator <strong>${payload.name}</strong>`)
    }
    setBusy(false)
    setModal(false)
    show('Saved')
    load()
  }

  async function archive(c: Creator) {
    await supabase.from('creators').update({ archived_at: new Date().toISOString() }).eq('id', c.id)
    await log(`Archived creator <strong>${c.name}</strong>`)
    load()
  }

  async function restore(c: Creator) {
    await supabase.from('creators').update({ archived_at: null }).eq('id', c.id)
    load()
  }

  async function bulkImport(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    const lines = parseBulkLines(bulk)
    const existing = new Set(rows.map((r) => normalizeName(r.name)))
    const inserts = lines
      .filter((l) => !existing.has(normalizeName(l.name)))
      .map((l) => ({
        user_id: user.id,
        name: l.name,
        contact_email: l.email || null,
        niche: l.extra || null,
        pipeline_status: 'new' as const,
      }))
    if (inserts.length) await supabase.from('creators').insert(inserts)
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
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add creator
        </button>
      </PageHeader>

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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

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
                  <tr key={c.id}>
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
                      {c.archived_at ? (
                        <button className="btn btn-ghost" type="button" onClick={() => restore(c)}>
                          Restore
                        </button>
                      ) : (
                        <button className="btn btn-ghost" type="button" onClick={() => archive(c)}>
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <Empty>No creators yet. Add one or bulk import.</Empty>}
          </div>
          <div className="mobile-cards">
            {filtered.map((c) => (
              <div className="mobile-card" key={c.id}>
                <h3>
                  <Link to={`/app/creators/${c.id}`}>{c.name}</Link>
                </h3>
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>One per line: Name, email, niche</p>
          <textarea className="textarea" style={{ minHeight: 180 }} value={bulk} onChange={(e) => setBulk(e.target.value)} required />
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
  const [c, setC] = useState<Creator | null>(null)
  useEffect(() => {
    if (!id) return
    supabase
      .from('creators')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setC(data as Creator | null))
  }, [id])
  if (!c) return <Empty>Creator not found</Empty>
  return (
    <div>
      <PageHeader title={c.name} subtitle={c.contact_email || undefined}>
        <Link className="btn" to="/app/creators">
          Back
        </Link>
      </PageHeader>
      <div className="grid-2">
        <div className="card">
          <p>
            <StatusBadge status={c.pipeline_status} />
          </p>
          <p>Channel: {c.channel_link ? <a href={c.channel_link} target="_blank" rel="noreferrer">{c.channel_link}</a> : '—'}</p>
          <p>Niche: {c.niche || '—'}</p>
          <p>Reach-backs: {c.reach_back_count}</p>
          <p>Last sent: {formatDate(c.last_sent_at)}</p>
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
