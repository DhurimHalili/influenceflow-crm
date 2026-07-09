import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Brand, Campaign, Creator } from '../lib/types'
import { downloadCsv, formatDate } from '../lib/utils'
import { Empty, Field, FormActions, Modal, StatusBadge, useToast } from '../components/ui'
import { PageHeader, useActivityLogger } from '../components/Layout'

export function CampaignsPage() {
  const { user } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [rows, setRows] = useState<Campaign[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [creators, setCreators] = useState<Creator[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [external, setExternal] = useState<{ brand_id: string; creator_name: string }[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [selectedCreators, setSelectedCreators] = useState<string[]>([])
  const [form, setForm] = useState({
    name: '',
    brand_id: '',
    platform: 'youtube',
    deliverables: '',
    agreed_payment: '',
    agency_percent: '20',
    status: 'negotiating',
    start_date: '',
    due_date: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [conflictWarn, setConflictWarn] = useState('')

  async function load() {
    if (!user) return
    const [c, b, cr, cc, ex] = await Promise.all([
      supabase.from('campaigns').select('*, brands(name)').is('archived_at', null).order('updated_at', { ascending: false }),
      supabase.from('brands').select('*').is('archived_at', null).order('name'),
      supabase.from('creators').select('*').is('archived_at', null).order('name'),
      supabase.from('campaign_creators').select('campaign_id,creator_id'),
      supabase.from('external_links').select('brand_id,creator_name'),
    ])
    setRows((c.data || []) as Campaign[])
    setBrands((b.data || []) as Brand[])
    setCreators((cr.data || []) as Creator[])
    const map: Record<string, string[]> = {}
    for (const row of cc.data || []) {
      map[row.campaign_id] = [...(map[row.campaign_id] || []), row.creator_id]
    }
    setAssignments(map)
    setExternal((ex.data || []) as { brand_id: string; creator_name: string }[])
  }

  useEffect(() => {
    load()
  }, [user])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (!q.trim()) return true
      return r.name.toLowerCase().includes(q.toLowerCase())
    })
  }, [rows, q, status])

  function openCreate() {
    setEditing(null)
    setSelectedCreators([])
    setConflictWarn('')
    setForm({
      name: '',
      brand_id: '',
      platform: 'youtube',
      deliverables: '',
      agreed_payment: '',
      agency_percent: '20',
      status: 'negotiating',
      start_date: '',
      due_date: '',
      notes: '',
    })
    setModal(true)
  }

  function checkConflicts(brandId: string, creatorIds: string[]) {
    if (!brandId) return ''
    const names = creators.filter((c) => creatorIds.includes(c.id)).map((c) => c.name.toLowerCase())
    const hits = external.filter((e) => e.brand_id === brandId && names.includes(e.creator_name.toLowerCase()))
    if (!hits.length) return ''
    return `Conflict: ${hits.map((h) => h.creator_name).join(', ')} already linked externally to this brand.`
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const warn = checkConflicts(form.brand_id, selectedCreators)
    if (warn && !conflictWarn) {
      setConflictWarn(warn + ' Save again to override.')
      return
    }
    setBusy(true)
    const payment = form.agreed_payment ? Number(form.agreed_payment) : null
    const pct = form.agency_percent ? Number(form.agency_percent) : 20
    const payout = payment != null ? payment * (1 - pct / 100) : null
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      brand_id: form.brand_id || null,
      platform: form.platform,
      deliverables: form.deliverables,
      agreed_payment: payment,
      agency_percent: pct,
      creator_payout: payout,
      status: form.status,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }
    let campaignId = editing?.id
    if (editing) {
      await supabase.from('campaigns').update(payload).eq('id', editing.id)
      await supabase.from('campaign_creators').delete().eq('campaign_id', editing.id)
    } else {
      const { data } = await supabase.from('campaigns').insert(payload).select('id').single()
      campaignId = data?.id
      await log(`Created campaign <strong>${payload.name}</strong>`)
    }
    if (campaignId && selectedCreators.length) {
      await supabase.from('campaign_creators').insert(
        selectedCreators.map((creator_id) => ({
          user_id: user.id,
          campaign_id: campaignId!,
          creator_id,
        })),
      )
    }
    setBusy(false)
    setModal(false)
    show('Campaign saved')
    load()
  }

  return (
    <div>
      {Toast}
      <PageHeader title="Campaigns" subtitle={`${filtered.length} active records`}>
        <button
          className="btn"
          type="button"
          onClick={() =>
            downloadCsv(
              'campaigns.csv',
              filtered.map((c) => ({
                name: c.name,
                brand: (c as Campaign & { brands?: { name?: string } }).brands?.name,
                status: c.status,
                payment: c.agreed_payment,
                due: c.due_date,
              })),
            )
          }
        >
          Export CSV
        </button>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          New campaign
        </button>
      </PageHeader>

      <div className="filters">
        <input className="input" style={{ maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
        <select className="select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="negotiating">Negotiating</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Brand</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Due</th>
              <th>Creators</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{(c as Campaign & { brands?: { name?: string } }).brands?.name || '—'}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>{c.agreed_payment != null ? `$${c.agreed_payment}` : '—'}</td>
                <td>{formatDate(c.due_date)}</td>
                <td>{(assignments[c.id] || []).length}</td>
                <td>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setEditing(c)
                      setSelectedCreators(assignments[c.id] || [])
                      setConflictWarn('')
                      setForm({
                        name: c.name,
                        brand_id: c.brand_id || '',
                        platform: c.platform || 'youtube',
                        deliverables: c.deliverables || '',
                        agreed_payment: c.agreed_payment != null ? String(c.agreed_payment) : '',
                        agency_percent: c.agency_percent != null ? String(c.agency_percent) : '20',
                        status: c.status,
                        start_date: c.start_date || '',
                        due_date: c.due_date || '',
                        notes: c.notes || '',
                      })
                      setModal(true)
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty>No campaigns yet.</Empty>}
      </div>

      <Modal open={modal} title={editing ? 'Edit campaign' : 'New campaign'} onClose={() => setModal(false)} wide>
        <form onSubmit={save}>
          <div className="grid-2">
            <Field label="Name">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Brand">
              <select className="select" value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                <option value="">Select…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment">
              <input className="input" value={form.agreed_payment} onChange={(e) => setForm({ ...form, agreed_payment: e.target.value })} />
            </Field>
            <Field label="Agency %">
              <input className="input" value={form.agency_percent} onChange={(e) => setForm({ ...form, agency_percent: e.target.value })} />
            </Field>
            <Field label="Start">
              <input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Due">
              <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="negotiating">Negotiating</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            <Field label="Platform">
              <input className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} />
            </Field>
          </div>
          <Field label="Deliverables">
            <textarea className="textarea" value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} />
          </Field>
          <Field label="Assign creators">
            <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {creators.map((c) => (
                <label key={c.id} style={{ display: 'block', marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={selectedCreators.includes(c.id)}
                    onChange={(e) => {
                      setSelectedCreators((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                    }}
                  />{' '}
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
          {conflictWarn && <p className="error">{conflictWarn}</p>}
          <FormActions onCancel={() => setModal(false)} busy={busy} />
        </form>
      </Modal>
    </div>
  )
}
