import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Meeting } from '../lib/types'
import { formatDateTime } from '../lib/utils'
import { Empty, Field, FormActions, Modal, useToast } from '../components/ui'
import { PageHeader } from '../components/Layout'

export function CalendarPage() {
  const { user, profile } = useAuth()
  const { show, Toast } = useToast()
  const [rows, setRows] = useState<Meeting[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    title: '',
    starts_at: '',
    ends_at: '',
    notes: '',
    remind_at: '',
  })

  async function load() {
    if (!user) return
    const { data } = await supabase.from('meetings').select('*').order('starts_at', { ascending: true })
    setRows((data || []) as Meeting[])
  }

  useEffect(() => {
    load()
  }, [user])

  useEffect(() => {
    if (!profile || profile.reminder_prefs === 'off') return
    if (!('Notification' in window)) return
    const due = rows.filter((m) => {
      if (!m.remind_at || m.reminder_sent) return false
      const t = new Date(m.remind_at).getTime()
      return t <= Date.now() && t >= Date.now() - 86400000
    })
    if (!due.length) return
    ;(async () => {
      if (Notification.permission === 'default') await Notification.requestPermission()
      if (Notification.permission === 'granted' && (profile.reminder_prefs === 'browser' || profile.reminder_prefs === 'both')) {
        for (const m of due) {
          new Notification('InfluenceFlow reminder', { body: m.title })
          await supabase.from('meetings').update({ reminder_sent: true }).eq('id', m.id)
        }
        load()
      }
    })()
  }, [rows, profile])

  const upcoming = useMemo(() => rows.filter((m) => new Date(m.starts_at).getTime() >= Date.now() - 3600000), [rows])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    await supabase.from('meetings').insert({
      user_id: user.id,
      title: form.title,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      notes: form.notes,
      remind_at: form.remind_at ? new Date(form.remind_at).toISOString() : null,
    })
    setModal(false)
    setForm({ title: '', starts_at: '', ends_at: '', notes: '', remind_at: '' })
    show('Meeting added')
    load()
  }

  return (
    <div>
      {Toast}
      <PageHeader title="Calendar" subtitle="Meetings & follow-ups">
        <button className="btn btn-primary" type="button" onClick={() => setModal(true)}>
          Add meeting
        </button>
      </PageHeader>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Title</th>
              <th>Starts</th>
              <th>Remind</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((m) => (
              <tr key={m.id}>
                <td>{m.title}</td>
                <td>{formatDateTime(m.starts_at)}</td>
                <td>{formatDateTime(m.remind_at)}</td>
                <td>{m.notes || '—'}</td>
                <td>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={async () => {
                      await supabase.from('meetings').delete().eq('id', m.id)
                      load()
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {upcoming.length === 0 && <Empty>No upcoming meetings.</Empty>}
      </div>

      <Modal open={modal} title="Add meeting" onClose={() => setModal(false)}>
        <form onSubmit={save}>
          <Field label="Title">
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Starts">
            <input className="input" type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </Field>
          <Field label="Ends">
            <input className="input" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </Field>
          <Field label="Remind at">
            <input className="input" type="datetime-local" value={form.remind_at} onChange={(e) => setForm({ ...form, remind_at: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <FormActions onCancel={() => setModal(false)} submitLabel="Add" />
        </form>
      </Modal>
    </div>
  )
}
