import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { STATUS_LABELS, type Brand, type BrandContact, type PipelineStatus } from '../lib/types'
import { downloadCsv, formatDate, isValidEmail, normalizeName, parseBulkLines } from '../lib/utils'
import { Empty, Field, FormActions, Modal, StatusBadge, useToast } from '../components/ui'
import { PageHeader, useActivityLogger } from '../components/Layout'

const brandStatuses: PipelineStatus[] = [
  'new',
  'contacted',
  'reach_back_1',
  'reach_back_2',
  'reach_back_3',
  'replied',
  'negotiating',
  'signed',
  'denied',
  'no_reply',
]

export function BrandsPage() {
  const { user } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [rows, setRows] = useState<Brand[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<Brand | null>(null)
  const [form, setForm] = useState({
    name: '',
    domain: '',
    contact_email: '',
    pipeline_status: 'new' as PipelineStatus,
    notes: '',
    personalization: '',
  })
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<PipelineStatus>('contacted')

  async function load() {
    if (!user) return
    const { data } = await supabase
      .from('brands')
      .select('*')
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
    setRows((data || []) as Brand[])
  }

  useEffect(() => {
    load()
  }, [user])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.pipeline_status !== status) return false
      const s = q.toLowerCase()
      if (!s) return true
      return [r.name, r.domain, r.contact_email].some((v) => (v || '').toLowerCase().includes(s))
    })
  }, [rows, q, status])

  useEffect(() => {
    setSelected(new Set())
  }, [q, status])

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  const someFilteredSelected = filtered.some((r) => selected.has(r.id))

  function openCreate() {
    setEditing(null)
    setForm({ name: '', domain: '', contact_email: '', pipeline_status: 'new', notes: '', personalization: '' })
    setModal(true)
  }

  function openEdit(b: Brand) {
    setEditing(b)
    setForm({
      name: b.name,
      domain: b.domain || '',
      contact_email: b.contact_email || '',
      pipeline_status: b.pipeline_status,
      notes: b.notes || '',
      personalization: b.personalization || '',
    })
    setModal(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      domain: form.domain.trim() || null,
      contact_email: form.contact_email.trim() || null,
      pipeline_status: form.pipeline_status,
      notes: form.notes,
      personalization: form.personalization,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('brands').update(payload).eq('id', editing.id)
      await log(`Updated brand ${payload.name}`)
    } else {
      const { data } = await supabase.from('brands').insert(payload).select('*').single()
      if (data && payload.contact_email && isValidEmail(payload.contact_email)) {
        await supabase.from('brand_contacts').insert({
          user_id: user.id,
          brand_id: data.id,
          email: payload.contact_email,
          first_name: 'there',
          pipeline_status: 'new',
        })
      }
      await log(`Added brand ${payload.name}`)
    }
    setBusy(false)
    setModal(false)
    show('Saved')
    load()
  }

  async function bulkImport(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    const lines = parseBulkLines(bulk)
    const existing = new Set(rows.map((r) => normalizeName(r.name)))
    let n = 0
    for (const line of lines) {
      if (existing.has(normalizeName(line.name))) continue
      const { data } = await supabase
        .from('brands')
        .insert({
          user_id: user.id,
          name: line.name,
          contact_email: line.email || null,
          domain: line.extra || null,
          pipeline_status: 'new',
        })
        .select('*')
        .single()
      if (data && line.email && isValidEmail(line.email)) {
        await supabase.from('brand_contacts').insert({
          user_id: user.id,
          brand_id: data.id,
          email: line.email,
          first_name: 'there',
        })
      }
      n++
    }
    setBusy(false)
    setBulkOpen(false)
    setBulk('')
    show(`Imported ${n} brands`)
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
      .from('brands')
      .update({
        pipeline_status: bulkStatus,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Bulk updated ${ids.length} brands → ${STATUS_LABELS[bulkStatus]}`)
    setSelected(new Set())
    show(`Updated ${ids.length} brand${ids.length === 1 ? '' : 's'} → ${STATUS_LABELS[bulkStatus]}`)
    load()
  }

  async function moveToDeleted(b: Brand) {
    await supabase.from('brands').update({ archived_at: new Date().toISOString() }).eq('id', b.id)
    await log(`Moved brand ${b.name} to Deleted`)
    show('Moved to Deleted')
    load()
  }

  async function softDeleteBrands(ids: string[]) {
    if (!ids.length) return null
    const { error } = await supabase
      .from('brands')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids)
    return error
  }

  async function applyBulkDelete() {
    if (!user || selected.size === 0) return
    const ids = [...selected]
    if (!confirm(`Move ${ids.length} brand${ids.length === 1 ? '' : 's'} to Deleted? Search will skip them.`)) return
    setBusy(true)
    const error = await softDeleteBrands(ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Moved ${ids.length} brands to Deleted`)
    setSelected(new Set())
    show(`Moved ${ids.length} to Deleted`)
    load()
  }

  async function deleteAllBrands() {
    if (!user) return
    const { data, error: loadErr } = await supabase.from('brands').select('id').is('archived_at', null)
    if (loadErr) {
      show(loadErr.message)
      return
    }
    const ids = (data || []).map((r) => r.id)
    if (!ids.length) {
      show('No brands to delete')
      return
    }
    if (!confirm(`Move ALL ${ids.length} active brands to Deleted? Search will skip them.`)) return
    setBusy(true)
    const error = await softDeleteBrands(ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Moved all ${ids.length} brands to Deleted`)
    setSelected(new Set())
    show(`Moved all ${ids.length} to Deleted`)
    load()
  }

  return (
    <div>
      {Toast}
      <PageHeader title="Brands" subtitle={`${filtered.length} shown`}>
        <button className="btn" type="button" onClick={() => downloadCsv('brands.csv', filtered.map((b) => ({ name: b.name, domain: b.domain, email: b.contact_email, status: b.pipeline_status, notes: b.notes })))}>
          Export CSV
        </button>
        <button className="btn" type="button" onClick={() => setBulkOpen(true)}>
          Bulk import
        </button>
        <button className="btn btn-danger" type="button" disabled={busy || rows.length === 0} onClick={deleteAllBrands}>
          Delete all
        </button>
        <Link className="btn" to="/app/deleted">
          Deleted list
        </Link>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          Add brand
        </button>
      </PageHeader>

      <div className="filters">
        <input className="input" style={{ maxWidth: 240 }} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {brandStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{selected.size} selected</span>
          <select className="select" style={{ maxWidth: 200 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PipelineStatus)}>
            {brandStatuses.map((s) => (
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
              <th>Brand</th>
              <th>Domain</th>
              <th>Email</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className={selected.has(b.id) ? 'row-selected' : undefined}>
                <td className="col-check">
                  <input type="checkbox" aria-label={`Select ${b.name}`} checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} />
                </td>
                <td>
                  <Link to={`/app/brands/${b.id}`}>{b.name}</Link>
                </td>
                <td>{b.domain || '—'}</td>
                <td>{b.contact_email || '—'}</td>
                <td>
                  <StatusBadge status={b.pipeline_status} />
                </td>
                <td>
                  <button className="btn btn-ghost" type="button" onClick={() => openEdit(b)}>
                    Edit
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => moveToDeleted(b)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty>No brands yet.</Empty>}
      </div>

      <div className="mobile-cards">
        {filtered.map((b) => (
          <div className={`mobile-card${selected.has(b.id) ? ' row-selected' : ''}`} key={b.id}>
            <label className="mobile-select">
              <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} />
              <h3>
                <Link to={`/app/brands/${b.id}`}>{b.name}</Link>
              </h3>
            </label>
            <StatusBadge status={b.pipeline_status} />
            <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>{b.contact_email || b.domain || '—'}</div>
          </div>
        ))}
      </div>

      <Modal open={modal} title={editing ? 'Edit brand' : 'Add brand'} onClose={() => setModal(false)} wide>
        <form onSubmit={save}>
          <div className="grid-2">
            <Field label="Name">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Domain">
              <input className="input" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
            </Field>
            <Field label="Primary email">
              <input className="input" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="select" value={form.pipeline_status} onChange={(e) => setForm({ ...form, pipeline_status: e.target.value as PipelineStatus })}>
                {brandStatuses.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Personalization snippet">
            <textarea className="textarea" value={form.personalization} onChange={(e) => setForm({ ...form, personalization: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <FormActions onCancel={() => setModal(false)} busy={busy} />
        </form>
      </Modal>

      <Modal open={bulkOpen} title="Bulk import brands" onClose={() => setBulkOpen(false)}>
        <form onSubmit={bulkImport}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>One per line: Name, email, domain</p>
          <textarea className="textarea" style={{ minHeight: 180 }} value={bulk} onChange={(e) => setBulk(e.target.value)} required />
          <FormActions onCancel={() => setBulkOpen(false)} submitLabel="Import" busy={busy} />
        </form>
      </Modal>
    </div>
  )
}

export function BrandDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [people, setPeople] = useState<BrandContact[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    title: '',
    email: '',
    linkedin_url: '',
    personalization: '',
    notes: '',
  })

  async function load() {
    if (!id) return
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('brands').select('*').eq('id', id).maybeSingle(),
      supabase.from('brand_contacts').select('*').eq('brand_id', id).is('archived_at', null).order('created_at', { ascending: false }),
    ])
    setBrand(b as Brand | null)
    setPeople((p || []) as BrandContact[])
  }

  useEffect(() => {
    load()
  }, [id])

  async function addPerson(e: FormEvent) {
    e.preventDefault()
    if (!user || !id || !isValidEmail(form.email)) return
    await supabase.from('brand_contacts').insert({
      user_id: user.id,
      brand_id: id,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      title: form.title || null,
      email: form.email.trim().toLowerCase(),
      linkedin_url: form.linkedin_url || null,
      personalization: form.personalization,
      notes: form.notes,
      pipeline_status: 'new',
    })
    await log(`Added contact ${form.email} at ${brand?.name || 'brand'}`)
    setModal(false)
    setForm({ first_name: '', last_name: '', title: '', email: '', linkedin_url: '', personalization: '', notes: '' })
    show('Contact added')
    load()
  }

  if (!brand) return <Empty>Brand not found</Empty>

  return (
    <div>
      {Toast}
      <PageHeader title={brand.name} subtitle={brand.domain || brand.contact_email || undefined}>
        <Link className="btn" to="/app/brands">
          Back
        </Link>
        <button className="btn btn-primary" type="button" onClick={() => setModal(true)}>
          Add person
        </button>
      </PageHeader>

      <div className="grid-2" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <StatusBadge status={brand.pipeline_status} />
          <p style={{ whiteSpace: 'pre-wrap' }}>{brand.notes || 'No notes'}</p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Personalization</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{brand.personalization || '—'}</p>
        </div>
      </div>

      <h3>People ({people.length})</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Email</th>
              <th>Status</th>
              <th>Last sent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}</td>
                <td>{p.title || '—'}</td>
                <td>{p.email}</td>
                <td>
                  <StatusBadge status={p.pipeline_status} />
                </td>
                <td>{formatDate(p.last_sent_at)}</td>
                <td>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={async () => {
                      await supabase.from('brand_contacts').update({ archived_at: new Date().toISOString() }).eq('id', p.id)
                      load()
                    }}
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {people.length === 0 && <Empty>No people yet — add emails you can contact at this brand.</Empty>}
      </div>

      <Modal open={modal} title="Add brand contact" onClose={() => setModal(false)}>
        <form onSubmit={addPerson}>
          <div className="grid-2">
            <Field label="First name">
              <input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label="Last name">
              <input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
            <Field label="Title">
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label="LinkedIn">
            <input className="input" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
          </Field>
          <Field label="Personalization snippet">
            <textarea className="textarea" value={form.personalization} onChange={(e) => setForm({ ...form, personalization: e.target.value })} />
          </Field>
          <FormActions onCancel={() => setModal(false)} submitLabel="Add" />
        </form>
      </Modal>
    </div>
  )
}
