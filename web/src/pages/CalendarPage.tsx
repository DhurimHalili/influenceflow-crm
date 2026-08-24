import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Campaign, Meeting } from '../lib/types'
import { Field, FormActions, Modal, useToast } from '../components/ui'
import { PageHeader } from '../components/Layout'

type CalEvent = {
  id: string
  title: string
  starts_at: string
  ends_at?: string | null
  notes?: string | null
  kind: 'meeting' | 'campaign_start' | 'campaign_due'
  sourceId: string
}

function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayKey(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function CalendarPage() {
  const { user, profile } = useAuth()
  const { show, Toast } = useToast()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Meeting | null>(null)
  const [form, setForm] = useState({
    title: '',
    starts_at: '',
    ends_at: '',
    notes: '',
    remind_at: '',
  })

  async function load() {
    if (!user) return
    const [m, c] = await Promise.all([
      supabase.from('meetings').select('*').order('starts_at', { ascending: true }),
      supabase.from('campaigns').select('*').is('archived_at', null).neq('status', 'cancelled'),
    ])
    setMeetings((m.data || []) as Meeting[])
    setCampaigns((c.data || []) as Campaign[])
  }

  useEffect(() => {
    load()
  }, [user])

  useEffect(() => {
    if (!profile || profile.reminder_prefs === 'off') return
    if (!('Notification' in window)) return
    const due = meetings.filter((m) => {
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
  }, [meetings, profile])

  const events: CalEvent[] = useMemo(() => {
    const list: CalEvent[] = meetings.map((m) => ({
      id: `m-${m.id}`,
      title: m.title,
      starts_at: m.starts_at,
      ends_at: m.ends_at,
      notes: m.notes,
      kind: 'meeting',
      sourceId: m.id,
    }))
    for (const c of campaigns) {
      if (c.start_date) {
        list.push({
          id: `cs-${c.id}`,
          title: `Start · ${c.name}`,
          starts_at: `${c.start_date}T09:00:00`,
          kind: 'campaign_start',
          sourceId: c.id,
        })
      }
      if (c.due_date) {
        list.push({
          id: `cd-${c.id}`,
          title: `Due · ${c.name}`,
          starts_at: `${c.due_date}T17:00:00`,
          kind: 'campaign_due',
          sourceId: c.id,
        })
      }
    }
    return list
  }, [meetings, campaigns])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const key = dayKey(parseISO(ev.starts_at))
      map.set(key, [...(map.get(key) || []), ev])
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    }
    return map
  }, [events])

  const selectedEvents = eventsByDay.get(dayKey(selectedDay)) || []

  function openNewForDay(day: Date) {
    setEditing(null)
    setSelectedDay(day)
    const base = new Date(day)
    base.setHours(10, 0, 0, 0)
    const end = new Date(base)
    end.setHours(11, 0, 0, 0)
    setForm({
      title: '',
      starts_at: toLocalInput(base.toISOString()),
      ends_at: toLocalInput(end.toISOString()),
      notes: '',
      remind_at: '',
    })
    setModal(true)
  }

  function openEditMeeting(m: Meeting) {
    setEditing(m)
    setForm({
      title: m.title,
      starts_at: toLocalInput(m.starts_at),
      ends_at: m.ends_at ? toLocalInput(m.ends_at) : '',
      notes: m.notes || '',
      remind_at: m.remind_at ? toLocalInput(m.remind_at) : '',
    })
    setModal(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const start = new Date(form.starts_at)
    if (Number.isNaN(start.getTime())) {
      show('Invalid start date/time')
      return
    }
    if (start.getFullYear() < 2000 || start.getFullYear() > 2099) {
      show('Year must be between 2000 and 2099')
      return
    }
    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      starts_at: start.toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      notes: form.notes,
      remind_at: form.remind_at ? new Date(form.remind_at).toISOString() : null,
      reminder_sent: false,
    }
    if (editing) {
      await supabase.from('meetings').update(payload).eq('id', editing.id)
      show('Meeting updated')
    } else {
      await supabase.from('meetings').insert(payload)
      show('Meeting added')
    }
    setModal(false)
    setEditing(null)
    load()
  }

  async function removeMeeting(id: string) {
    if (!confirm('Delete this meeting?')) return
    await supabase.from('meetings').delete().eq('id', id)
    show('Deleted')
    load()
  }

  return (
    <div>
      {Toast}
      <PageHeader title="Calendar" subtitle="Meetings and campaign dates · click any day to add">
        <button className="btn" type="button" onClick={() => setCursor(startOfMonth(new Date()))}>
          Today
        </button>
        <button className="btn btn-primary" type="button" onClick={() => openNewForDay(selectedDay)}>
          Add meeting
        </button>
      </PageHeader>

      <div className="cal-shell">
        <div className="cal-board card">
          <div className="cal-toolbar">
            <button className="btn btn-ghost" type="button" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Previous month">
              ←
            </button>
            <h2>{format(cursor, 'MMMM yyyy')}</h2>
            <button className="btn btn-ghost" type="button" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
              →
            </button>
          </div>

          <div className="cal-weekdays">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="cal-grid">
            {days.map((day) => {
              const key = dayKey(day)
              const dayEvents = eventsByDay.get(key) || []
              const inMonth = isSameMonth(day, cursor)
              const selected = isSameDay(day, selectedDay)
              return (
                <button
                  key={key}
                  type="button"
                  className={`cal-day ${inMonth ? '' : 'muted'} ${selected ? 'selected' : ''} ${isToday(day) ? 'today' : ''}`}
                  onClick={() => setSelectedDay(day)}
                  onDoubleClick={() => openNewForDay(day)}
                >
                  <span className="cal-day-num">{format(day, 'd')}</span>
                  <div className="cal-dots">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span key={ev.id} className={`cal-pill ${ev.kind}`} title={ev.title}>
                        {ev.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && <span className="cal-more">+{dayEvents.length - 3}</span>}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="cal-hint">Double-click a day to add a meeting · Single-click to inspect</p>
        </div>

        <aside className="cal-side card">
          <div className="cal-side-head">
            <div>
              <div className="cal-side-label">Selected</div>
              <h3>{format(selectedDay, 'EEEE, MMM d')}</h3>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => openNewForDay(selectedDay)}>
              + Add
            </button>
          </div>

          {selectedEvents.length === 0 && <p className="cal-empty">Nothing scheduled. Add a meeting for this day.</p>}

          <div className="cal-event-list">
            {selectedEvents.map((ev) => (
              <div key={ev.id} className={`cal-event ${ev.kind}`}>
                <div className="cal-event-time">
                  {ev.kind === 'meeting' ? format(parseISO(ev.starts_at), 'HH:mm') : ev.kind === 'campaign_start' ? 'Start' : 'Due'}
                </div>
                <div className="cal-event-body">
                  <strong>{ev.title}</strong>
                  {ev.notes ? <p>{ev.notes}</p> : null}
                  {ev.kind === 'meeting' && (
                    <div className="actions" style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          const m = meetings.find((x) => x.id === ev.sourceId)
                          if (m) openEditMeeting(m)
                        }}
                      >
                        Edit
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={() => removeMeeting(ev.sourceId)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="cal-legend">
            <span>
              <i className="meeting" /> Meeting
            </span>
            <span>
              <i className="campaign_start" /> Campaign start
            </span>
            <span>
              <i className="campaign_due" /> Campaign due
            </span>
          </div>
        </aside>
      </div>

      <Modal open={modal} title={editing ? 'Edit meeting' : 'Add meeting'} onClose={() => setModal(false)}>
        <form onSubmit={save}>
          <Field label="Title">
            <input className="input" required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Starts">
              <input
                className="input"
                type="datetime-local"
                required
                min="2000-01-01T00:00"
                max="2099-12-31T23:59"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <input
                className="input"
                type="datetime-local"
                min="2000-01-01T00:00"
                max="2099-12-31T23:59"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Remind at (optional)">
            <input
              className="input"
              type="datetime-local"
              min="2000-01-01T00:00"
              max="2099-12-31T23:59"
              value={form.remind_at}
              onChange={(e) => setForm({ ...form, remind_at: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <textarea className="textarea" maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <FormActions onCancel={() => setModal(false)} submitLabel={editing ? 'Save' : 'Add'} />
        </form>
      </Modal>
    </div>
  )
}
